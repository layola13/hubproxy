#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
sa_dir="$(cd "${script_dir}/.." && pwd)"
project_dir="$(cd "${sa_dir}/.." && pwd)"
env_file="${project_dir}/.env"
backup_file="$(mktemp)"
server_log="$(mktemp)"
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
  rm -f "${backup_file}" "${server_log}" "${response_body}"
}
trap cleanup EXIT

cp "${env_file}" "${backup_file}"

old_pid="$(ss -ltnp | sed -n 's/.*0\.0\.0\.0:28080.*pid=\([0-9]*\).*/\1/p' | head -n 1)"
if [[ -n "${old_pid}" ]]; then
  kill "${old_pid}" 2>/dev/null || true
  sleep 0.3
fi

python3 <<'PY' >"${server_log}" 2>&1 &
import http.server

CHAT_JSON = b'{"choices":[{"message":{"content":null,"tool_calls":[{"id":"call_cmd","type":"function","function":{"name":"exec_command","arguments":"{\\"cmd\\":\\"pwd\\"}"}}]}}],"usage":{"prompt_tokens":2,"completion_tokens":1,"total_tokens":3}}'

class Handler(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        length = int(self.headers.get("content-length", "0"))
        self.rfile.read(length)
        if self.path == "/v1/responses":
            self.send_response(404)
            self.send_header("content-type", "text/plain")
            self.end_headers()
            self.wfile.write(b"responses unavailable")
            return
        if self.path == "/v1/chat/completions":
            self.send_response(200)
            self.send_header("content-type", "application/json")
            self.send_header("content-length", str(len(CHAT_JSON)))
            self.end_headers()
            self.wfile.write(CHAT_JSON)
            return
        self.send_response(404)
        self.end_headers()

    def log_message(self, *_args):
        return

http.server.ThreadingHTTPServer(("127.0.0.1", 28101), Handler).serve_forever()
PY
server_pid=$!

for _ in {1..50}; do
  if ss -ltnp | rg -q '127\.0\.0\.1:28101'; then
    break
  fi
  sleep 0.1
done

awk '
  BEGIN { wrote_chat=0; wrote_resp=0; wrote_sa_port=0 }
  /^CHAT_BASE_URL=/ { print "CHAT_BASE_URL=http://127.0.0.1:28101/v1"; wrote_chat=1; next }
  /^RESPONSES_BASE_URL=/ { print "RESPONSES_BASE_URL=http://127.0.0.1:28101/v1"; wrote_resp=1; next }
  /^SA_PORT=/ { print "SA_PORT=28080"; wrote_sa_port=1; next }
  { print }
  END {
    if (!wrote_chat) print "CHAT_BASE_URL=http://127.0.0.1:28101/v1"
    if (!wrote_resp) print "RESPONSES_BASE_URL=http://127.0.0.1:28101/v1"
    if (!wrote_sa_port) print "SA_PORT=28080"
  }
' "${backup_file}" >"${env_file}"

(cd "${sa_dir}" && setsid ./hubproxy > /tmp/hubproxy_sa_responses_fallback_json_tool_only.log 2>&1 < /dev/null) &
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
  --data '{"model":"models/mimo-v2.5-pro","stream":false,"tools":[{"type":"function","name":"exec_command","parameters":{}}],"input":[{"type":"message","role":"user","content":[{"type":"input_text","text":"hello"}]}]}' \
  'http://127.0.0.1:28080/v1/responses' >"${response_body}"

python3 - "${response_body}" <<'PY'
import json
import sys

body = json.load(open(sys.argv[1], encoding="utf-8"))
output = body.get("output") or []
if len(output) != 1:
    raise SystemExit(f"wrong output length: {body!r}")
tool = output[0]
if tool.get("type") != "function_call":
    raise SystemExit(f"tool call was not mapped: {output!r}")
if tool.get("call_id") != "call_cmd" or tool.get("name") != "exec_command":
    raise SystemExit(f"wrong tool call identity: {tool!r}")
if json.loads(tool.get("arguments") or "{}").get("cmd") != "pwd":
    raise SystemExit(f"wrong tool arguments: {tool!r}")
if body.get("output_text") != "" or body.get("status") != "completed":
    raise SystemExit(f"tool-only tail was not generated: {body!r}")
usage = body.get("usage") or {}
if usage.get("input_tokens") != 2 or usage.get("output_tokens") != 1 or usage.get("total_tokens") != 3:
    raise SystemExit(f"usage was not preserved: {body!r}")
raw = open(sys.argv[1], encoding="utf-8").read()
if '"choices"' in raw or '"tool_calls"' in raw or '"content":null' in raw:
    raise SystemExit(f"raw chat completion leaked: {raw}")
PY

echo "responses_fallback_json_tool_only_ok"
