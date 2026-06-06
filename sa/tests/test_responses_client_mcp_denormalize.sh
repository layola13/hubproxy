#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
sa_dir="$(cd "${script_dir}/.." && pwd)"
project_dir="$(cd "${sa_dir}/.." && pwd)"
env_file="${project_dir}/.env"
tmp_dir="$(mktemp -d)"
server_log="$(mktemp)"
response_body="$(mktemp)"
server_pid=""
hub_pid=""
hub_port="28184"
upstream_port="28185"

cleanup() {
  if [[ -n "${hub_pid}" ]]; then
    kill "${hub_pid}" 2>/dev/null || true
    wait "${hub_pid}" 2>/dev/null || true
  fi
  if [[ -n "${server_pid}" ]]; then
    kill "${server_pid}" 2>/dev/null || true
    wait "${server_pid}" 2>/dev/null || true
  fi
  rm -rf "${tmp_dir}"
  rm -f "${server_log}" "${response_body}"
}
trap cleanup EXIT

if ss -ltn | rg -q "127\\.0\\.0\\.1:${upstream_port}|0\\.0\\.0\\.0:${hub_port}"; then
  echo "test ports already in use" >&2
  exit 1
fi

python3 <<'PY' >"${server_log}" 2>&1 &
import http.server

SSE = "\n".join([
    "event: response.output_item.done",
    'data: {"type":"response.output_item.done","item":{"id":"tc_mcp","type":"function_call","name":"mcp__code_index__.read_mcp_resource","arguments":"{\\"server\\":\\"mcp__code_index__\\",\\"uri\\":\\"file:///tmp/demo\\"}"}}',
    "",
    "event: response.output_item.done",
    'data: {"type":"response.output_item.done","item":{"id":"tc_custom","type":"function_call","name":"mcp__custom_tool__some_tool","arguments":"{\\"server\\":\\"mcp__custom_tool__\\"}"}}',
    "",
    "event: response.completed",
    'data: {"type":"response.completed","response":{"id":"resp_mcp","status":"completed"}}',
    "",
    "data: [DONE]",
    "",
])

class Handler(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        length = int(self.headers.get("content-length", "0"))
        self.rfile.read(length)
        if self.path == "/v1/responses":
            payload = SSE.encode("utf-8")
            self.send_response(200)
            self.send_header("content-type", "text/event-stream")
            self.send_header("content-length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
            return
        self.send_response(404)
        self.end_headers()

    def log_message(self, *_args):
        return

http.server.ThreadingHTTPServer(("127.0.0.1", 28185), Handler).serve_forever()
PY
server_pid=$!

for _ in {1..50}; do
  if ss -ltn | rg -q "127\\.0\\.0\\.1:${upstream_port}"; then
    break
  fi
  sleep 0.1
done

awk '
  BEGIN { wrote_chat=0; wrote_resp=0; wrote_sa_port=0 }
  /^CHAT_BASE_URL=/ { print "CHAT_BASE_URL=http://127.0.0.1:" upstream_port "/v1"; wrote_chat=1; next }
  /^RESPONSES_BASE_URL=/ { print "RESPONSES_BASE_URL=http://127.0.0.1:" upstream_port "/v1"; wrote_resp=1; next }
  /^SA_PORT=/ { print "SA_PORT=" hub_port; wrote_sa_port=1; next }
  { print }
  END {
    if (!wrote_chat) print "CHAT_BASE_URL=http://127.0.0.1:" upstream_port "/v1"
    if (!wrote_resp) print "RESPONSES_BASE_URL=http://127.0.0.1:" upstream_port "/v1"
    if (!wrote_sa_port) print "SA_PORT=" hub_port
  }
' upstream_port="${upstream_port}" hub_port="${hub_port}" "${env_file}" >"${tmp_dir}/.env"

(
  cd "${tmp_dir}"
  setsid "${sa_dir}/hubproxy" > /tmp/hubproxy_sa_responses_client_mcp_denormalize.log 2>&1 < /dev/null &
  echo $! > "${tmp_dir}/hub.pid"
)
hub_pid="$(cat "${tmp_dir}/hub.pid")"

for _ in {1..50}; do
  if ss -ltn | rg -q "0\\.0\\.0\\.0:${hub_port}"; then
    break
  fi
  sleep 0.1
done

auth="$(awk -F= '$1=="AUTH"{print substr($0, index($0, "=") + 1)}' "${tmp_dir}/.env")"
curl -sS --max-time 15 \
  -H "authorization: Bearer ${auth}" \
  -H 'content-type: application/json' \
  --data '{"model":"models/mimo-v2.5-pro","stream":true,"tools":[{"type":"namespace","name":"mcp__code_index__"}],"input":[{"type":"message","role":"user","content":[{"type":"input_text","text":"hi"}]}]}' \
  "http://127.0.0.1:${hub_port}/v1/responses" >"${response_body}"

python3 - "${response_body}" <<'PY'
import json
import sys

items = []
for line in open(sys.argv[1], encoding="utf-8"):
    if line.startswith("data: ") and "response.output_item.done" in line:
        items.append((json.loads(line[6:]).get("item") or {}))
if not items:
    raise SystemExit("missing response.output_item.done SSE data")
item = next((candidate for candidate in items if candidate.get("id") == "tc_mcp"), None)
if item is None:
    raise SystemExit(f"missing code-index item: {items!r}")
args = json.loads(item.get("arguments") or "{}")
if args.get("server") != "code-index":
    raise SystemExit(f"server was not denormalized: {args!r}")
if item.get("namespace") != "mcp__code_index__":
    raise SystemExit(f"namespace was not added: {item!r}")
if item.get("name") != "read_mcp_resource":
    raise SystemExit(f"tool name was not unflattened: {item!r}")
if item.get("output_kind") != "function_call_output":
    raise SystemExit(f"output_kind was not added: {item!r}")

custom = next((candidate for candidate in items if candidate.get("id") == "tc_custom"), None)
if custom is None:
    raise SystemExit(f"missing custom-tool item: {items!r}")
custom_args = json.loads(custom.get("arguments") or "{}")
if custom_args.get("server") != "custom-tool":
    raise SystemExit(f"custom server was not denormalized: {custom_args!r}")
if custom.get("namespace") != "mcp__custom_tool__":
    raise SystemExit(f"custom namespace was not added: {custom!r}")
if custom.get("name") != "some_tool":
    raise SystemExit(f"custom tool name was not unflattened: {custom!r}")
if custom.get("output_kind") != "function_call_output":
    raise SystemExit(f"custom output_kind was not added: {custom!r}")
PY

echo "responses_client_mcp_denormalize_ok"
