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
  rm -f "${backup_file}" "${server_log}" "${request_body}" "${response_body}"
}
trap cleanup EXIT

cp "${env_file}" "${backup_file}"

old_pid="$(ss -ltnp | sed -n 's/.*0\.0\.0\.0:28080.*pid=\([0-9]*\).*/\1/p' | head -n 1)"
if [[ -n "${old_pid}" ]]; then
  kill "${old_pid}" 2>/dev/null || true
  sleep 0.3
fi

python3 - "${request_body}" >"${server_log}" 2>&1 <<'PY' &
import http.server
import sys

capture_path = sys.argv[1]

class Handler(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        length = int(self.headers.get("content-length", "0"))
        body = self.rfile.read(length)
        if self.path == "/v1/responses":
            with open(capture_path, "wb") as f:
                f.write(body)
            payload = b'{"id":"resp_mock","output":[],"status":"completed"}'
            self.send_response(200)
            self.send_header("content-type", "application/json")
            self.send_header("content-length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
            return
        self.send_response(404)
        self.end_headers()

    def log_message(self, *_args):
        return

http.server.ThreadingHTTPServer(("127.0.0.1", 28083), Handler).serve_forever()
PY
server_pid=$!

for _ in {1..50}; do
  if ss -ltnp | rg -q '127\.0\.0\.1:28083'; then
    break
  fi
  sleep 0.1
done

awk '
  BEGIN { wrote_chat=0; wrote_resp=0; wrote_sa_port=0 }
  /^CHAT_BASE_URL=/ { print "CHAT_BASE_URL=http://127.0.0.1:28083/v1"; wrote_chat=1; next }
  /^RESPONSES_BASE_URL=/ { print "RESPONSES_BASE_URL=http://127.0.0.1:28083/v1"; wrote_resp=1; next }
  /^SA_PORT=/ { print "SA_PORT=28080"; wrote_sa_port=1; next }
  { print }
  END {
    if (!wrote_chat) print "CHAT_BASE_URL=http://127.0.0.1:28083/v1"
    if (!wrote_resp) print "RESPONSES_BASE_URL=http://127.0.0.1:28083/v1"
    if (!wrote_sa_port) print "SA_PORT=28080"
  }
' "${backup_file}" >"${env_file}"

setsid "${sa_dir}/hubproxy" > /tmp/hubproxy_sa_responses_mcp_server_normalize.log 2>&1 < /dev/null &
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
  --data '{"model":"mimo-v2.5","stream":false,"input":[{"type":"function_call","call_id":"call-1","name":"read_mcp_resource","arguments":"{\"server\":\"Code Index\",\"uri\":\"file:///tmp/demo\"}"},{"type":"function_call","call_id":"call-2","name":"read_mcp_resource","arguments":"{\"server\":\"code-index\",\"uri\":\"file:///tmp/demo2\"}"},{"type":"function_call","call_id":"call-3","name":"read_mcp_resource","arguments":"{\"server\":\"mcp__mcp_code_index___\",\"uri\":\"file:///tmp/demo3\"}"},{"type":"function_call","call_id":"call-4","name":"read_mcp_resource","arguments":"{\"server\":\"Mimir\",\"uri\":\"file:///tmp/demo4\"}"},{"type":"function_call","call_id":"call-5","name":"read_mcp_resource","arguments":"{\"server\":\"Custom Tool\",\"uri\":\"file:///tmp/demo5\"}"},{"type":"message","role":"user","content":[{"type":"input_text","text":"Code Index should stay visible text"}]}]}' \
  'http://127.0.0.1:28080/v1/responses' >"${response_body}"

python3 - "${request_body}" <<'PY'
import json
import sys

body = json.load(open(sys.argv[1], encoding="utf-8"))
items = body.get("input") or []
servers = []
for item in items:
    if item.get("type") != "function_call":
        continue
    args = json.loads(item.get("arguments") or "{}")
    servers.append(args.get("server"))
expected = ["mcp__code_index__", "mcp__code_index__", "mcp__code_index__", "mcp__mimir__", "mcp__custom_tool__"]
if servers != expected:
    raise SystemExit(f"responses MCP servers were not normalized: {servers!r}; body={body!r}")
message_text = body.get("input", [])[-1].get("content", [{}])[0].get("text")
if message_text != "Code Index should stay visible text":
    raise SystemExit(f"normalizer rewrote visible text unexpectedly: {body!r}")
PY

echo "responses_mcp_server_normalize_ok"
