#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
sa_dir="$(cd "${script_dir}/.." && pwd)"
project_dir="$(cd "${sa_dir}/.." && pwd)"
env_file="${project_dir}/.env"
backup_file="$(mktemp)"
server_log="$(mktemp)"
capture_body="$(mktemp)"
response_body="$(mktemp)"
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
  rm -f "${backup_file}" "${server_log}" "${capture_body}" "${response_body}"
}
trap cleanup EXIT

cp "${env_file}" "${backup_file}"

old_pid="$(ss -ltnp | sed -n 's/.*0\.0\.0\.0:28080.*pid=\([0-9]*\).*/\1/p' | head -n 1)"
if [[ -n "${old_pid}" ]]; then
  kill "${old_pid}" 2>/dev/null || true
  sleep 0.3
fi

python3 - "${capture_body}" <<'PY' >"${server_log}" 2>&1 &
import http.server
import sys

capture_path = sys.argv[1]

class Handler(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        length = int(self.headers.get("content-length", "0"))
        body = self.rfile.read(length).decode("utf-8", "replace")
        if self.path == "/v1/responses":
            self.send_response(404)
            self.send_header("content-type", "text/plain")
            self.end_headers()
            self.wfile.write(b"responses unavailable")
            return
        if self.path == "/v1/chat/completions":
            with open(capture_path, "w", encoding="utf-8") as f:
                f.write(body)
            self.send_response(200)
            self.send_header("content-type", "application/json")
            self.end_headers()
            self.wfile.write(b'{"choices":[{"message":{"role":"assistant","content":"ok"}}]}')
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

setsid "${sa_dir}/hubproxy" > /tmp/hubproxy_sa_responses_fallback_strip_fields.log 2>&1 < /dev/null &
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
  --data '{"model":"models/mimo-v2.5-pro","stream":false,"store":false,"prompt_cache_key":"abc","include":["reasoning.encrypted_content"],"reasoning":{"effort":"medium","summary":"auto"},"input":[{"type":"message","role":"user","content":[{"type":"input_text","text":"hello"}]}]}' \
  'http://127.0.0.1:28080/v1/responses' >"${response_body}"

if ! rg -q '"output_text":"ok"' "${response_body}"; then
  echo "fallback response did not return normalized chat content" >&2
  cat "${response_body}" >&2
  exit 1
fi

python3 - "${capture_body}" <<'PY'
import json
import sys

with open(sys.argv[1], encoding="utf-8") as f:
    body = json.load(f)

for key in ("store", "prompt_cache_key", "include", "reasoning", "input"):
    if key in body:
        raise SystemExit(f"responses-only field {key!r} leaked to chat fallback: {body!r}")

messages = body.get("messages") or []
if not messages:
    raise SystemExit(f"chat fallback messages missing: {body!r}")
user = next((m for m in messages if m.get("role") == "user"), None)
if user is None or user.get("content") != "hello":
    raise SystemExit(f"user message was not converted correctly: {body!r}")
if body.get("model") != "models/mimo-v2.5-pro":
    raise SystemExit(f"model was not preserved: {body!r}")
PY

echo "responses_fallback_strips_responses_only_fields_ok"
