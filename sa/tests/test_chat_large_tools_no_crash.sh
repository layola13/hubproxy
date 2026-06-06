#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
sa_dir="$(cd "${script_dir}/.." && pwd)"
hub_port="${SA_TEST_PROXY_PORT:-28284}"
upstream_port="${SA_TEST_UPSTREAM_PORT:-28285}"
tmp_dir="$(mktemp -d)"
server_log="$(mktemp)"
hub_log="$(mktemp)"
response_body="$(mktemp)"
request_body="$(mktemp)"
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
  rm -rf "${tmp_dir}"
  rm -f "${server_log}" "${hub_log}" "${response_body}" "${request_body}"
}
trap cleanup EXIT

if ss -ltn | rg -q "(:${hub_port}|:${upstream_port})\b"; then
  echo "test ports already in use: hub=${hub_port}, upstream=${upstream_port}" >&2
  exit 1
fi

REQ_CAPTURE="${request_body}" UPSTREAM_PORT="${upstream_port}" python3 <<'PY' >"${server_log}" 2>&1 &
import http.server
import os

port = int(os.environ["UPSTREAM_PORT"])
capture = os.environ["REQ_CAPTURE"]

class Handler(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        length = int(self.headers.get("content-length", "0"))
        body = self.rfile.read(length)
        if self.path == "/v1/chat/completions":
            with open(capture, "wb") as f:
                f.write(body)
            payload = b'{"id":"chat_test","object":"chat.completion","choices":[{"message":{"role":"assistant","content":"ok"}}]}'
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

http.server.ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
PY
server_pid=$!

for _ in {1..80}; do
  if ss -ltn | rg -q "127\.0\.0\.1:${upstream_port}"; then
    break
  fi
  sleep 0.1
done

cat >"${tmp_dir}/.env" <<ENV
SA_PORT=${hub_port}
PORT=${hub_port}
AUTH=test-secret
CHAT_BASE_URL=http://127.0.0.1:${upstream_port}/v1
RESPONSES_BASE_URL=http://127.0.0.1:${upstream_port}/v1
DEFAULT_MODEL=mimo-v2.5
OPENAI_API_KEY=test-key
DATA_DIR=/tmp/hubproxy-sa-chat-large
ENV

(
  cd "${tmp_dir}"
  exec "${sa_dir}/hubproxy" >"${hub_log}" 2>&1 < /dev/null
) &
hub_pid=$!

for _ in {1..80}; do
  if ss -ltn | rg -q ":${hub_port} "; then
    break
  fi
  sleep 0.1
done
if ! ss -ltn | rg -q ":${hub_port} "; then
  echo "hubproxy did not start on ${hub_port}" >&2
  cat "${hub_log}" >&2 || true
  exit 1
fi

python3 - <<'PY' >"${tmp_dir}/payload.json"
import json

long_text = "direct chat large context " + ("y" * 180000)
tools = []
for i in range(80):
    tools.append({
        "type": "namespace",
        "name": f"mcp__chat_{i}__",
        "tools": [{
            "type": "function",
            "name": "read_resource",
            "description": "Read resource",
            "parameters": {"type": "object", "properties": {"uri": {"type": "string"}}},
        }],
    })
tools.append({"type": "function", "name": "exec_command", "parameters": {"type": "object", "properties": {"cmd": {"type": "string"}}}})
payload = {
    "model": "mimo-v2.5",
    "messages": [{"role": "user", "content": long_text}],
    "stream": False,
    "store": True,
    "prompt_cache_key": "drop-me",
    "include": ["drop-me"],
    "reasoning": {"effort": "low"},
    "tools": tools,
}
print(json.dumps(payload, separators=(",", ":")))
PY

status="$(curl -sS --max-time 30 -o "${response_body}" -w '%{http_code}' \
  -H 'authorization: Bearer test-secret' \
  -H 'content-type: application/json' \
  --data-binary "@${tmp_dir}/payload.json" \
  "http://127.0.0.1:${hub_port}/v1/chat/completions")"

if [[ "${status}" != "200" ]]; then
  echo "large chat request returned ${status}" >&2
  cat "${response_body}" >&2 || true
  cat "${hub_log}" >&2 || true
  exit 1
fi
if ! kill -0 "${hub_pid}" 2>/dev/null; then
  echo "hubproxy crashed during large chat request" >&2
  cat "${hub_log}" >&2 || true
  exit 1
fi
if ! rg -q '"object":"chat.completion"' "${response_body}" \
  || ! rg -q '"function":\{"name":"mcp__chat_0__read_resource"' "${request_body}" \
  || ! rg -q '"function":\{"name":"exec_command"' "${request_body}"; then
  echo "large chat request did not preserve normalized upstream shape" >&2
  cat "${request_body}" >&2 || true
  exit 1
fi
if rg -q 'prompt_cache_key|reasoning|include|store' "${request_body}"; then
  echo "large chat request leaked fields that should be removed" >&2
  cat "${request_body}" >&2 || true
  exit 1
fi

echo "chat_large_tools_no_crash_ok"
