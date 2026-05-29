#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
sa_dir="$(cd "${script_dir}/.." && pwd)"
project_dir="$(cd "${sa_dir}/.." && pwd)"
env_file="${project_dir}/.env"
backup_file="$(mktemp)"
server_log="$(mktemp)"
response_body="$(mktemp)"
log_dir="$(mktemp -d)"
server_pid=""
hub_pid=""

cleanup() {
  if [[ -n "${hub_pid}" ]]; then
    kill "${hub_pid}" 2>/dev/null || true
    wait "${hub_pid}" 2>/dev/null || true
  fi
  if [[ -n "${server_pid}" ]]; then
    kill "${server_pid}" 2>/dev/null || true
    wait "${server_pid}" 2>/dev/null || true
  fi
  cp "${backup_file}" "${env_file}"
  rm -f "${backup_file}" "${server_log}" "${response_body}"
  rm -rf "${log_dir}"
}
trap cleanup EXIT

cp "${env_file}" "${backup_file}"

old_pid="$(ss -ltnp | sed -n 's/.*0\.0\.0\.0:28080.*pid=\([0-9]*\).*/\1/p' | head -n 1)"
if [[ -n "${old_pid}" ]]; then
  kill "${old_pid}" 2>/dev/null || true
  sleep 0.3
fi

python3 - <<'PY' >"${server_log}" 2>&1 &
import http.server

class Handler(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        length = int(self.headers.get("content-length", "0"))
        self.rfile.read(length)
        if self.path == "/v1/responses":
            self.send_response(200)
            self.send_header("content-type", "application/json")
            self.end_headers()
            self.wfile.write(b'{"output":[],"status":"completed"}')
            return
        self.send_response(404)
        self.end_headers()

    def log_message(self, *_args):
        return

http.server.ThreadingHTTPServer(("127.0.0.1", 28081), Handler).serve_forever()
PY
server_pid=$!

for _ in {1..50}; do
  if ss -ltnp | rg -q '127\.0\.0\.1:28081'; then
    break
  fi
  sleep 0.1
done

awk -v log_dir="${log_dir}" '
  BEGIN { wrote_auth=0; wrote_log=0; wrote_chat=0; wrote_resp=0; wrote_sa_port=0 }
  /^AUTH=/ { print "AUTH=client-secret"; wrote_auth=1; next }
  /^HUBPROXY_LOG_DIR=/ { print "HUBPROXY_LOG_DIR=" log_dir; wrote_log=1; next }
  /^CHAT_BASE_URL=/ { print "CHAT_BASE_URL=http://127.0.0.1:28081/v1"; wrote_chat=1; next }
  /^RESPONSES_BASE_URL=/ { print "RESPONSES_BASE_URL=http://127.0.0.1:28081/v1"; wrote_resp=1; next }
  /^SA_PORT=/ { print "SA_PORT=28080"; wrote_sa_port=1; next }
  { print }
  END {
    if (!wrote_auth) print "AUTH=client-secret"
    if (!wrote_log) print "HUBPROXY_LOG_DIR=" log_dir
    if (!wrote_chat) print "CHAT_BASE_URL=http://127.0.0.1:28081/v1"
    if (!wrote_resp) print "RESPONSES_BASE_URL=http://127.0.0.1:28081/v1"
    if (!wrote_sa_port) print "SA_PORT=28080"
  }
' "${backup_file}" >"${env_file}"

setsid "${sa_dir}/hubproxy" > /tmp/hubproxy_sa_api_request_log.log 2>&1 < /dev/null &
hub_pid=$!

for _ in {1..50}; do
  if ss -ltnp | rg -q '0\.0\.0\.0:28080'; then
    break
  fi
  sleep 0.1
done

curl -sS --max-time 15 \
  -H 'authorization: Bearer client-secret' \
  -H 'x-api-key: client-secret' \
  -H 'content-type: application/json' \
  --data '{"model":"gpt-4.1","input":[{"type":"message","role":"user","content":[{"type":"input_text","text":"hi"}]}]}' \
  'http://127.0.0.1:28080/v1/responses' >"${response_body}"

if ! rg -q '"status":"completed"' "${response_body}"; then
  echo "responses proxy did not return mock response" >&2
  cat "${response_body}" >&2
  exit 1
fi

log_file="${log_dir}/request-sa-api.json"
if [[ ! -s "${log_file}" ]]; then
  echo "api request log file was not written" >&2
  ls -la "${log_dir}" >&2
  cat /tmp/hubproxy_sa_api_request_log.log >&2 || true
  exit 1
fi

if ! rg -q '"kind":"request-log"' "${log_file}" \
  || ! rg -q '"path":"/v1/responses"' "${log_file}" \
  || ! rg -q '"method":"POST"' "${log_file}" \
  || ! rg -q '"bodyBytes":[1-9][0-9]*' "${log_file}" \
  || ! rg -q '"headers":\{"authorization":"cli\.\.\.ret \(len=13\)","x-api-key":"cli\.\.\.ret \(len=13\)","content-type":"application/json"\}' "${log_file}" \
  || ! rg -q '"body":"\{\\"model\\":\\"gpt-4\.1\\"' "${log_file}"; then
  echo "api request log missing expected fields" >&2
  cat "${log_file}" >&2
  exit 1
fi

echo "api_request_log_ok"
