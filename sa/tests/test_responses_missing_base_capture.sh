#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
sa_dir="$(cd "${script_dir}/.." && pwd)"
project_dir="$(cd "${sa_dir}/.." && pwd)"
env_file="${project_dir}/.env"
backup_file="$(mktemp)"
server_log="$(mktemp)"
chat_body="$(mktemp)"
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
  rm -f "${backup_file}" "${server_log}" "${chat_body}" "${response_body}"
}
trap cleanup EXIT

cp "${env_file}" "${backup_file}"

old_pid="$(ss -ltnp | sed -n 's/.*0\.0\.0\.0:28080.*pid=\([0-9]*\).*/\1/p' | head -n 1)"
if [[ -n "${old_pid}" ]]; then
  kill "${old_pid}" 2>/dev/null || true
  sleep 0.3
fi

python3 - "${chat_body}" <<'PY' >"${server_log}" 2>&1 &
import http.server
import sys

chat_body_path = sys.argv[1]

class Handler(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        length = int(self.headers.get("content-length", "0"))
        body = self.rfile.read(length).decode("utf-8", "replace")
        if self.path == "/v1/responses":
            self.send_response(599)
            self.send_header("content-type", "text/plain")
            self.end_headers()
            self.wfile.write(b"responses endpoint must not be called")
            return
        if self.path == "/v1/chat/completions":
            with open(chat_body_path, "w", encoding="utf-8") as f:
                f.write(body)
            self.send_response(200)
            self.send_header("content-type", "application/json")
            self.end_headers()
            self.wfile.write(b'{"id":"mock","object":"chat.completion","choices":[{"message":{"role":"assistant","content":"ok"}}],"usage":{"prompt_tokens":1,"completion_tokens":1,"total_tokens":2}}')
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
  /^RESPONSES_BASE_URL=/ { print "RESPONSES_BASE_URL="; wrote_resp=1; next }
  /^SA_PORT=/ { print "SA_PORT=28080"; wrote_sa_port=1; next }
  { print }
  END {
    if (!wrote_chat) print "CHAT_BASE_URL=http://127.0.0.1:28081/v1"
    if (!wrote_resp) print "RESPONSES_BASE_URL="
    if (!wrote_sa_port) print "SA_PORT=28080"
  }
' "${backup_file}" >"${env_file}"

setsid "${sa_dir}/hubproxy" > /tmp/hubproxy_sa_missing_responses_base.log 2>&1 < /dev/null &
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
  --data '{"model":"models/mimo-v2.5-pro","stream":false,"input":[{"type":"message","role":"user","content":[{"type":"input_text","text":"hello"}]}]}' \
  'http://127.0.0.1:28080/v1/responses' >"${response_body}"

python3 - "${response_body}" <<'PY'
import json
import sys

body = json.load(open(sys.argv[1], encoding="utf-8"))
output = body.get("output") or []
if len(output) != 1:
    raise SystemExit(f"wrong output length: {body!r}")
item = output[0]
if item.get("type") != "message":
    raise SystemExit(f"fallback did not return a Responses message item: {body!r}")
if item.get("content", [{}])[0].get("text") != "ok":
    raise SystemExit(f"fallback message text missing: {body!r}")
if body.get("output_text") != "ok" or body.get("status") != "completed":
    raise SystemExit(f"fallback response tail missing: {body!r}")
usage = body.get("usage") or {}
if usage.get("input_tokens") != 1 or usage.get("output_tokens") != 1 or usage.get("total_tokens") != 2:
    raise SystemExit(f"fallback usage was not normalized: {body!r}")
raw = open(sys.argv[1], encoding="utf-8").read()
if '"object":"chat.completion"' in raw or '"choices"' in raw:
    raise SystemExit(f"raw chat completion leaked: {raw}")
PY

if [[ ! -s "${chat_body}" ]]; then
  echo "chat fallback was not called" >&2
  cat "${server_log}" >&2
  exit 1
fi

if ! rg -q '"model":"models/mimo-v2.5-pro"' "${chat_body}" \
  || ! rg -q '"messages":\[\{"role":"user","content":"hello"\}\]' "${chat_body}" \
  || ! rg -q '"stream":false' "${chat_body}"; then
  echo "fallback chat body missing expected fields" >&2
  cat "${chat_body}" >&2
  exit 1
fi

echo "responses_missing_base_capture_ok"
