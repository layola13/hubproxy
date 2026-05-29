#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
sa_dir="$(cd "${script_dir}/.." && pwd)"
project_dir="$(cd "${sa_dir}/.." && pwd)"
env_file="${project_dir}/.env"
backup_file="$(mktemp)"
server_log="$(mktemp)"
request_body="$(mktemp)"
response_body="$(mktemp)"
status_file="$(mktemp)"
chat_called_file="$(mktemp)"
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
  rm -f "${backup_file}" "${server_log}" "${request_body}" "${response_body}" "${status_file}" "${chat_called_file}"
}
trap cleanup EXIT

cp "${env_file}" "${backup_file}"

old_pid="$(ss -ltnp | sed -n 's/.*0\.0\.0\.0:28080.*pid=\([0-9]*\).*/\1/p' | head -n 1)"
if [[ -n "${old_pid}" ]]; then
  kill "${old_pid}" 2>/dev/null || true
  sleep 0.3
fi

printf '0' >"${chat_called_file}"
python3 - "${request_body}" "${chat_called_file}" <<'PY' >"${server_log}" 2>&1 &
import http.server
import sys

request_path, chat_called_path = sys.argv[1:3]

class Handler(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        length = int(self.headers.get("content-length", "0"))
        body = self.rfile.read(length).decode("utf-8", "replace")
        if self.path == "/v1/responses":
            with open(request_path, "w", encoding="utf-8") as f:
                f.write(body)
            self.send_response(404)
            self.send_header("content-type", "application/json")
            self.end_headers()
            self.wfile.write(b'{"error":{"message":"responses unavailable"}}')
            return
        if self.path == "/v1/chat/completions":
            with open(chat_called_path, "w", encoding="utf-8") as f:
                f.write("1")
            self.send_response(200)
            self.send_header("content-type", "application/json")
            self.end_headers()
            self.wfile.write(b'{"id":"unexpected","object":"chat.completion"}')
            return
        self.send_response(404)
        self.end_headers()

    def log_message(self, *_args):
        return

http.server.ThreadingHTTPServer(("127.0.0.1", 28084), Handler).serve_forever()
PY
server_pid=$!

for _ in {1..50}; do
  if ss -ltnp | rg -q '127\.0\.0\.1:28084'; then
    break
  fi
  sleep 0.1
done

awk '
  BEGIN { wrote_chat=0; wrote_resp=0; wrote_sa_port=0 }
  /^CHAT_BASE_URL=/ { print "CHAT_BASE_URL=http://127.0.0.1:28084/v1"; wrote_chat=1; next }
  /^RESPONSES_BASE_URL=/ { print "RESPONSES_BASE_URL=http://127.0.0.1:28084/v1"; wrote_resp=1; next }
  /^SA_PORT=/ { print "SA_PORT=28080"; wrote_sa_port=1; next }
  { print }
  END {
    if (!wrote_chat) print "CHAT_BASE_URL=http://127.0.0.1:28084/v1"
    if (!wrote_resp) print "RESPONSES_BASE_URL=http://127.0.0.1:28084/v1"
    if (!wrote_sa_port) print "SA_PORT=28080"
  }
' "${backup_file}" >"${env_file}"

setsid "${sa_dir}/hubproxy" > /tmp/hubproxy_sa_gemini_tool_history_no_fallback.log 2>&1 < /dev/null &
hub_pid=$!

for _ in {1..50}; do
  if ss -ltnp | rg -q '0\.0\.0\.0:28080'; then
    break
  fi
  sleep 0.1
done

auth="$(awk -F= '$1=="AUTH"{print substr($0, index($0, "=") + 1)}' "${env_file}")"
curl -sS --max-time 15 \
  -o "${response_body}" \
  -w '%{http_code}' \
  -H "authorization: Bearer ${auth}" \
  -H 'content-type: application/json' \
  --data '{"model":"models/gemini-3-flash-preview","stream":true,"input":[{"type":"function_call","call_id":"call-1","name":"exec_command","arguments":"{\"cmd\":\"date\"}"},{"type":"function_call_output","call_id":"call-1","output":"ok"}]}' \
  'http://127.0.0.1:28080/v1/responses' >"${status_file}"

if [[ "$(cat "${status_file}")" != "404" ]]; then
  echo "gemini tool-history request should return original responses status" >&2
  cat "${status_file}" >&2
  cat "${response_body}" >&2
  exit 1
fi

if ! rg -q '"responses unavailable"' "${response_body}"; then
  echo "gemini tool-history request should return original responses body" >&2
  cat "${response_body}" >&2
  exit 1
fi

if [[ "$(cat "${chat_called_file}")" != "0" ]]; then
  echo "gemini tool-history request unexpectedly called chat fallback" >&2
  exit 1
fi

if ! rg -q '"function_call_output"' "${request_body}"; then
  echo "mock responses upstream did not receive tool history body" >&2
  cat "${request_body}" >&2
  exit 1
fi

echo "responses_gemini_tool_history_no_fallback_ok"
