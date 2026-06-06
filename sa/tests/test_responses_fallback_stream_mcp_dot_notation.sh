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
hub_port="28182"
upstream_port="28183"

cleanup() {
  if [[ -n "${hub_pid}" ]]; then
    kill "${hub_pid}" 2>/dev/null || true
    wait "${hub_pid}" 2>/dev/null || true
  fi
  local port_pid
  port_pid="$(ss -ltnp | sed -n "s/.*0\.0\.0\.0:${hub_port}.*pid=\([0-9]*\).*/\1/p" | head -n 1)"
  if [[ -n "${port_pid}" ]]; then
    kill "${port_pid}" 2>/dev/null || true
    wait "${port_pid}" 2>/dev/null || true
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

if ss -ltn | rg -q "127\\.0\\.0\\.1:${upstream_port}|0\\.0\\.0\\.0:${hub_port}"; then
  echo "test ports already in use" >&2
  exit 1
fi

python3 <<'PY' >"${server_log}" 2>&1 &
import http.server

CHAT_SSE = "\n".join([
    'data: {"choices":[{"delta":{"tool_calls":[{"id":"call_raw_underscore","type":"function","function":{"name":"code_index.read_mcp_resource","arguments":"{\\"server\\":\\"code_index\\",\\"uri\\":\\"file:///tmp/one\\"}"},"index":0},{"id":"call_raw_hyphen","type":"function","function":{"name":"code-index.read_mcp_resource","arguments":"{\\"server\\":\\"code-index\\",\\"uri\\":\\"file:///tmp/two\\"}"},"index":1},{"id":"call_normalized_dot","type":"function","function":{"name":"mcp__code_index__.read_mcp_resource","arguments":"{\\"server\\":\\"mcp__code_index__\\",\\"uri\\":\\"file:///tmp/three\\"}"},"index":2}]},"finish_reason":null}]}',
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

http.server.ThreadingHTTPServer(("127.0.0.1", 28183), Handler).serve_forever()
PY
server_pid=$!

for _ in {1..50}; do
  if ss -ltn | rg -q "127\\.0\\.0\\.1:${upstream_port}"; then
    break
  fi
  sleep 0.1
done

cat >"${env_file}" <<ENV
SA_PORT=${hub_port}
AUTH=test-secret
CHAT_BASE_URL=http://127.0.0.1:${upstream_port}/v1
RESPONSES_BASE_URL=http://127.0.0.1:${upstream_port}/v1
DEFAULT_MODEL=models/mimo-v2.5-pro
OPENAI_API_KEY=test-key
DATA_DIR=/tmp/hubproxy-sa-test-mcp-dot
ENV

(cd "${sa_dir}" && exec ./hubproxy > /tmp/hubproxy_sa_responses_fallback_stream_mcp_dot_notation.log 2>&1 < /dev/null) &
hub_pid=$!

for _ in {1..50}; do
  if ss -ltn | rg -q "0\\.0\\.0\\.0:${hub_port}"; then
    break
  fi
  sleep 0.1
done

curl -sS --max-time 15 \
  -H 'authorization: Bearer test-secret' \
  -H 'content-type: application/json' \
  --data '{"model":"models/mimo-v2.5-pro","stream":true,"tools":[{"type":"namespace","name":"mcp__code_index__","tools":[{"type":"function","name":"read_mcp_resource","parameters":{"type":"object","properties":{}}}]}],"input":[{"type":"message","role":"user","content":[{"type":"input_text","text":"read resource"}]}]}' \
  "http://127.0.0.1:${hub_port}/v1/responses" >"${response_body}"

python3 - "${response_body}" <<'PY'
import json
import sys

items = []
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
                items.append(item)
        current = None

if len(items) != 3:
    raise SystemExit(f"expected three MCP tool calls, got {items!r}")

expected_ids = ["call_raw_underscore", "call_raw_hyphen", "call_normalized_dot"]
expected_uris = ["file:///tmp/one", "file:///tmp/two", "file:///tmp/three"]
for item, call_id, uri in zip(items, expected_ids, expected_uris):
    if item.get("call_id") != call_id:
        raise SystemExit(f"wrong call id: {items!r}")
    if item.get("namespace") != "mcp__code_index__":
        raise SystemExit(f"namespace missing: {item!r}")
    if item.get("name") != "read_mcp_resource":
        raise SystemExit(f"name was not de-flattened: {item!r}")
    if item.get("output_kind") != "function_call_output":
        raise SystemExit(f"output_kind missing: {item!r}")
    args = json.loads(item.get("arguments") or "{}")
    if args.get("server") != "code-index" or args.get("uri") != uri:
        raise SystemExit(f"arguments were not denormalized: {item!r}")
PY

if rg -q '"name":"code_index\.read_mcp_resource"|"name":"code-index\.read_mcp_resource"|"name":"mcp__code_index__\.read_mcp_resource"|data: \[DONE\]|"choices"' "${response_body}"; then
  echo "MCP dot-notation normalization leaked raw chat fields" >&2
  cat "${response_body}" >&2
  exit 1
fi

echo "responses_fallback_stream_mcp_dot_notation_ok"
