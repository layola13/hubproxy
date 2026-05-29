#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
sa_dir="$(cd "${script_dir}/.." && pwd)"
project_dir="$(cd "${sa_dir}/.." && pwd)"
env_file="${project_dir}/.env"
backup_file="$(mktemp)"
server_log="$(mktemp)"
first_body="$(mktemp)"
second_body="$(mktemp)"
first_resp="$(mktemp)"
second_resp="$(mktemp)"
counter_file="$(mktemp)"
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
  rm -f "${backup_file}" "${server_log}" "${first_body}" "${second_body}" "${first_resp}" "${second_resp}" "${counter_file}"
}
trap cleanup EXIT

cp "${env_file}" "${backup_file}"

old_pid="$(ss -ltnp | sed -n 's/.*0\.0\.0\.0:28080.*pid=\([0-9]*\).*/\1/p' | head -n 1)"
if [[ -n "${old_pid}" ]]; then
  kill "${old_pid}" 2>/dev/null || true
  sleep 0.3
fi

printf '0' >"${counter_file}"
python3 - "${first_body}" "${second_body}" "${counter_file}" <<'PY' >"${server_log}" 2>&1 &
import http.server
import sys

first_path, second_path, counter_path = sys.argv[1:4]

class Handler(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        length = int(self.headers.get("content-length", "0"))
        body = self.rfile.read(length).decode("utf-8", "replace")
        if self.path == "/v1/responses":
            with open(counter_path, "r+", encoding="utf-8") as f:
                raw = f.read().strip() or "0"
                count = int(raw) + 1
                f.seek(0)
                f.truncate()
                f.write(str(count))
            with open(first_path if count == 1 else second_path, "w", encoding="utf-8") as f:
                f.write(body)
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

awk '
  BEGIN { wrote_chat=0; wrote_resp=0; wrote_sa_port=0 }
  /^CHAT_BASE_URL=/ { print "CHAT_BASE_URL=http://127.0.0.1:28081/v1"; wrote_chat=1; next }
  /^RESPONSES_BASE_URL=/ { print "RESPONSES_BASE_URL=http://127.0.0.1:28081/v1"; wrote_resp=1; next }
  /^SA_PORT=/ { print "SA_PORT=28080"; wrote_sa_port=1; next }
  { print }
  END {
    if (!wrote_chat) print "CHAT_BASE_URL=http://127.0.0.1:28081/v1"
    if (!wrote_resp) print "RESPONSES_BASE_URL=http://127.0.0.1:28081/v1"
    if (!wrote_sa_port) print "SA_PORT=28080"
  }
' "${backup_file}" >"${env_file}"

setsid "${sa_dir}/hubproxy" > /tmp/hubproxy_sa_responses_gemini_capture.log 2>&1 < /dev/null &
hub_pid=$!

for _ in {1..50}; do
  if ss -ltnp | rg -q '0\.0\.0\.0:28080'; then
    break
  fi
  sleep 0.1
done

auth="$(awk -F= '$1=="AUTH"{print substr($0, index($0, "=") + 1)}' "${env_file}")"
curl -sS --max-time 15 \
  -H "authorization: Bearer ${auth}" \
  -H 'content-type: application/json' \
  --data '{"model":"models/mimo-v2.5-pro","store":false,"prompt_cache_key":"keep-me","include":["reasoning.encrypted_content"],"reasoning":{"effort":"medium"},"input":[{"type":"message","role":"user","content":[{"type":"input_text","text":"hello"}]}]}' \
  'http://127.0.0.1:28080/v1/responses' >"${first_resp}"

curl -sS --max-time 15 \
  -H "authorization: Bearer ${auth}" \
  -H 'content-type: application/json' \
  --data '{"model":"models/gemini-3.5-flash","store":false,"prompt_cache_key":"drop-me","include":["reasoning.encrypted_content"],"reasoning":{"effort":"medium"},"input":[{"type":"message","role":"user","content":[{"type":"input_text","text":"hello"}]}]}' \
  'http://127.0.0.1:28080/v1/responses' >"${second_resp}"

if ! rg -q '"status":"completed"' "${first_resp}" || ! rg -q '"status":"completed"' "${second_resp}"; then
  echo "responses proxy did not return mock responses" >&2
  cat "${first_resp}" >&2
  cat "${second_resp}" >&2
  exit 1
fi

if ! rg -q '"store":false' "${first_body}" \
  || ! rg -q '"prompt_cache_key":"keep-me"' "${first_body}" \
  || ! rg -q '"include":\["reasoning\.encrypted_content"\]' "${first_body}" \
  || ! rg -q '"reasoning":\{"effort":"medium"\}' "${first_body}" \
  || ! rg -q '"input":\[' "${first_body}"; then
  echo "non-gemini responses request did not preserve responses-only fields" >&2
  cat "${first_body}" >&2
  exit 1
fi

if ! rg -q '"model":"models/gemini-3.5-flash"' "${second_body}" \
  || ! rg -q '"include":\["reasoning\.encrypted_content"\]' "${second_body}" \
  || ! rg -q '"reasoning":\{"effort":"medium"\}' "${second_body}" \
  || ! rg -q '"input":\[' "${second_body}"; then
  echo "gemini responses request missing preserved fields" >&2
  cat "${second_body}" >&2
  exit 1
fi

if rg -q 'store|prompt_cache_key|drop-me' "${second_body}"; then
  echo "gemini responses request leaked incompatible fields" >&2
  cat "${second_body}" >&2
  exit 1
fi

echo "responses_gemini_capture_ok"
