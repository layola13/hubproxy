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
hub_port="28186"
upstream_port="28187"

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

CHAT_SSE = "\n".join([
    'data: {"choices":[{"delta":{"tool_calls":[{"id":"call_mcp","type":"function","function":{"name":"mcp__code_index__describe_index","arguments":"{}"},"index":0}]},"finish_reason":null}]}',
    "",
    'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}',
    "",
    "data: [DONE]",
    "",
])

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
            payload = CHAT_SSE.encode("utf-8")
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

http.server.ThreadingHTTPServer(("127.0.0.1", 28187), Handler).serve_forever()
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
  setsid "${sa_dir}/hubproxy" > /tmp/hubproxy_sa_responses_fallback_stream_tool_call_namespace.log 2>&1 < /dev/null &
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
  --data '{"model":"models/mimo-v2.5-pro","stream":true,"tools":[{"type":"namespace","name":"mcp__code_index__","tools":[{"type":"function","name":"describe_index","parameters":{}}]}],"input":[{"type":"message","role":"user","content":[{"type":"input_text","text":"hello"}]}]}' \
  "http://127.0.0.1:${hub_port}/v1/responses" >"${response_body}"

python3 - "${response_body}" <<'PY'
import json
import sys

tool = None
current = None
for raw in open(sys.argv[1], encoding="utf-8"):
    line = raw.rstrip("\n")
    if line.startswith("event: "):
        current = {"event": line[7:], "data": ""}
    elif line.startswith("data: ") and current is not None:
        current["data"] += line[6:]
    elif line == "" and current is not None:
        if current["event"] == "response.output_item.done":
            item = json.loads(current["data"]).get("item") or {}
            if item.get("type") == "function_call":
                tool = item
                break
        current = None

if tool is None:
    raise SystemExit(open(sys.argv[1], encoding="utf-8").read())
if tool.get("call_id") != "call_mcp":
    raise SystemExit(f"wrong call id: {tool}")
if tool.get("namespace") != "mcp__code_index__":
    raise SystemExit(f"namespace missing: {tool}")
if tool.get("name") != "describe_index":
    raise SystemExit(f"name was not de-flattened: {tool}")
if tool.get("output_kind") != "function_call_output":
    raise SystemExit(f"output_kind missing: {tool}")
PY

if rg -q '"name":"mcp__code_index__describe_index"|"choices"|data: \\[DONE\\]' "${response_body}"; then
  echo "namespaced chat fallback leaked raw fields" >&2
  cat "${response_body}" >&2
  exit 1
fi

echo "responses_fallback_stream_tool_call_namespace_ok"
