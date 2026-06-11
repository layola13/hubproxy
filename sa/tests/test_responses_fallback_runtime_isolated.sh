#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_dir="$(cd "${script_dir}/../.." && pwd)"
sa_bin="${SA_BIN:-sa}"

tmp_root="$(mktemp -d /tmp/hubproxy-responses-fallback.XXXXXX)"
work_dir="${tmp_root}/work"
data_dir="${tmp_root}/data"
request_body="${tmp_root}/responses-request.json"
stream_request_body="${tmp_root}/responses-stream-request.json"
response_body="${tmp_root}/responses-response.json"
stream_response_body="${tmp_root}/responses-stream-response.txt"
capture_file="${tmp_root}/upstream-capture.json"
upstream_log="${tmp_root}/upstream.log"
server_log="${tmp_root}/hubproxy.log"
bin_path="${tmp_root}/hubproxy"
hub_pid=""
upstream_pid=""

cleanup() {
  if [[ -n "${hub_pid}" ]]; then
    kill "${hub_pid}" 2>/dev/null || true
    wait "${hub_pid}" 2>/dev/null || true
  fi
  if [[ -n "${upstream_pid}" ]]; then
    kill "${upstream_pid}" 2>/dev/null || true
    wait "${upstream_pid}" 2>/dev/null || true
  fi
  rm -rf "${tmp_root}"
}
trap cleanup EXIT

pick_port() {
  python3 - <<'PY'
import socket

with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
    s.bind(("127.0.0.1", 0))
    print(s.getsockname()[1])
PY
}

proxy_port="$(pick_port)"
upstream_port="$(pick_port)"

mkdir -p "${work_dir}" "${data_dir}"

UPSTREAM_PORT="${upstream_port}" CAPTURE_FILE="${capture_file}" python3 - <<'PY' >"${upstream_log}" 2>&1 &
import http.server
import json
import os

port = int(os.environ["UPSTREAM_PORT"])
capture_file = os.environ["CAPTURE_FILE"]

class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/readyz":
            self.send_response(204)
            self.end_headers()
            return
        self.send_response(404)
        self.end_headers()

    def do_POST(self):
        length = int(self.headers.get("content-length") or "0")
        raw_body = self.rfile.read(length).decode("utf-8")
        capture = {
            "path": self.path,
            "authorization": self.headers.get("authorization"),
            "x-api-key": self.headers.get("x-api-key"),
            "api-key": self.headers.get("api-key"),
            "content-type": self.headers.get("content-type"),
            "body": raw_body,
        }
        with open(capture_file, "w", encoding="utf-8") as f:
            json.dump(capture, f, separators=(",", ":"))

        if self.path != "/v1/chat/completions":
            body = b'{"error":"unexpected upstream path"}'
            self.send_response(404)
            self.send_header("content-type", "application/json")
            self.send_header("content-length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        try:
            request_body = json.loads(raw_body)
        except Exception:
            request_body = {}

        if request_body.get("stream") is True:
            events = [
                {
                    "choices": [{
                        "delta": {
                            "tool_calls": [
                                {
                                    "id": "call_read",
                                    "type": "function",
                                    "function": {"name": "read", "arguments": '{"filePath":"/tmp/demo.txt"}'},
                                    "index": 0,
                                },
                                {
                                    "id": "call_cmd",
                                    "type": "function",
                                    "function": {"name": "exec_command", "arguments": '{"command":"deno check src/main.ts"}'},
                                    "index": 1,
                                },
                                {
                                    "id": "call_read_env",
                                    "type": "function",
                                    "function": {"name": "read", "arguments": '{"filePath":"/tmp/demo/.env"}'},
                                    "index": 2,
                                },
                                {
                                    "id": "call_read_quote",
                                    "type": "function",
                                    "function": {"name": "read", "arguments": '{"filePath":"/tmp/demo/it\'works.txt"}'},
                                    "index": 3,
                                },
                                {
                                    "id": "call_demo",
                                    "type": "function",
                                    "function": {"name": "demo-server.rebuild", "arguments": "{}"},
                                    "index": 4,
                                },
                            ]
                        },
                        "finish_reason": None,
                    }]
                },
                {
                    "choices": [{
                        "delta": {"tool_calls": [{"index": 5, "id": "call_pwd", "type": "function", "function": {"name": "exec_command", "arguments": ""}}]},
                        "finish_reason": None,
                    }]
                },
                {
                    "choices": [{
                        "delta": {"tool_calls": [{"index": 5, "id": None, "type": "function", "function": {"name": None, "arguments": '{"cmd":'}}]},
                        "finish_reason": None,
                    }]
                },
                {
                    "choices": [{
                        "delta": {"tool_calls": [{"index": 5, "id": None, "type": "function", "function": {"name": None, "arguments": '"pwd"}'}}]},
                        "finish_reason": None,
                    }]
                },
                {"choices": [{"delta": {}, "finish_reason": "tool_calls"}]},
            ]
            body = (
                "".join("data: " + json.dumps(event, separators=(",", ":")) + "\n\n" for event in events)
                + "data: [DONE]\n\n"
            ).encode("utf-8")
            self.send_response(200)
            self.send_header("content-type", "text/event-stream")
            self.send_header("content-length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        body = json.dumps({
            "choices": [{
                "message": {
                    "role": "assistant",
                    "content": "fallback ok",
                }
            }],
            "usage": {
                "prompt_tokens": 2,
                "completion_tokens": 3,
                "total_tokens": 5,
            },
        }, separators=(",", ":")).encode("utf-8")
        self.send_response(200)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *_args):
        return

http.server.ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
PY
upstream_pid="$!"

upstream_ready=0
for _ in $(seq 1 80); do
  if curl -fsS --max-time 1 "http://127.0.0.1:${upstream_port}/readyz" >/dev/null 2>&1; then
    upstream_ready=1
    break
  fi
  if ! kill -0 "${upstream_pid}" 2>/dev/null; then
    break
  fi
  sleep 0.1
done

if [[ "${upstream_ready}" != "1" ]]; then
  echo "mock upstream did not become ready on ${upstream_port}" >&2
  cat "${upstream_log}" >&2 || true
  exit 1
fi

cat >"${tmp_root}/.env" <<ENV
HOST=127.0.0.1
PORT=${proxy_port}
AUTH=local-secret
CHAT_BASE_URL=http://127.0.0.1:${upstream_port}/v1
DEFAULT_MODEL=default-fallback-model
OPENAI_API_KEY=sk-upstream-fallback
DATA_DIR=${data_dir}
ENV
cp "${tmp_root}/.env" "${work_dir}/.env"

cat >"${request_body}" <<'JSON'
{
  "model": "models/mimo-v2.5-pro",
  "stream": false,
  "instructions": "follow runtime instructions",
  "store": false,
  "prompt_cache_key": "drop-me",
  "include": ["reasoning.encrypted_content"],
  "reasoning": {"effort": "medium"},
  "tools": [
    {
      "type": "namespace",
      "name": "mcp__code_index__",
      "tools": [
        {"type": "function", "name": "describe_index", "parameters": {"type": "object"}}
      ]
    }
  ],
  "input": [
    {"type": "message", "role": "developer", "content": [{"type": "input_text", "text": "dev note"}]},
    {"type": "message", "role": "user", "content": [{"type": "input_text", "text": "hello runtime"}]},
    {"type": "function_call", "call_id": "call-live-history", "name": "exec_command", "arguments": "{\"cmd\":\"pwd\"}"},
    {"type": "function_call_output", "call_id": "call-live-history", "name": "exec_command", "output": "history output ok"}
  ]
}
JSON

cat >"${stream_request_body}" <<'JSON'
{
  "model": "models/mimo-v2.5-pro",
  "stream": true,
  "collaborationModeKind": "code",
  "tools": [
    {"type": "function", "name": "exec_command", "parameters": {"type": "object"}},
    {
      "type": "namespace",
      "name": "mcp__demo_server__",
      "tools": [
        {"type": "function", "name": "rebuild", "parameters": {"type": "object"}}
      ]
    }
  ],
  "input": [
    {"type": "message", "role": "user", "content": [{"type": "input_text", "text": "stream tool call runtime"}]}
  ]
}
JSON

"${sa_bin}" build "${repo_dir}/sa/main.sa" -o "${bin_path}" >/dev/null

(
  cd "${work_dir}"
  "${bin_path}"
) >"${server_log}" 2>&1 &
hub_pid="$!"

proxy_ready=0
for _ in $(seq 1 80); do
  if curl -fsS --max-time 1 "http://127.0.0.1:${proxy_port}/healthz" >/dev/null 2>&1; then
    proxy_ready=1
    break
  fi
  if ! kill -0 "${hub_pid}" 2>/dev/null; then
    break
  fi
  sleep 0.1
done

if [[ "${proxy_ready}" != "1" ]]; then
  echo "hubproxy did not become ready on ${proxy_port}" >&2
  cat "${server_log}" >&2 || true
  exit 1
fi

status="$(curl -sS --max-time 20 -o "${response_body}" -w '%{http_code}' \
  -H 'authorization: Bearer local-secret' \
  -H 'x-api-key: caller-secret' \
  -H 'api-key: caller-api-key' \
  -H 'content-type: application/json' \
  --data-binary "@${request_body}" \
  "http://127.0.0.1:${proxy_port}/v1/responses")"

if [[ "${status}" != "200" ]]; then
  echo "responses chat fallback returned ${status}, expected 200" >&2
  cat "${response_body}" >&2 || true
  cat "${server_log}" >&2 || true
  cat "${upstream_log}" >&2 || true
  exit 1
fi

if [[ ! -s "${capture_file}" ]]; then
  echo "mock upstream did not capture fallback request" >&2
  cat "${upstream_log}" >&2 || true
  cat "${server_log}" >&2 || true
  exit 1
fi

python3 - "${capture_file}" "${response_body}" <<'PY'
import json
import sys

capture_path, response_path = sys.argv[1:]
with open(capture_path, "r", encoding="utf-8") as f:
    capture = json.load(f)

if capture["path"] != "/v1/chat/completions":
    raise SystemExit(f"expected chat fallback path, got {capture['path']!r}")
if capture["authorization"] != "Bearer sk-upstream-fallback":
    raise SystemExit(f"bad upstream authorization: {capture['authorization']!r}")
if capture["x-api-key"] != "sk-upstream-fallback":
    raise SystemExit(f"bad upstream x-api-key: {capture['x-api-key']!r}")
if capture["api-key"] is not None:
    raise SystemExit(f"unexpected naked api-key forwarded: {capture['api-key']!r}")
if "caller-secret" in json.dumps(capture) or "caller-api-key" in json.dumps(capture):
    raise SystemExit("caller auth material leaked to upstream")

body = json.loads(capture["body"])
if body.get("model") != "models/mimo-v2.5-pro":
    raise SystemExit(f"fallback body did not preserve model: {body!r}")
if body.get("stream") is not False:
    raise SystemExit(f"fallback body did not preserve stream:false: {body!r}")
for key in ("store", "prompt_cache_key", "include", "reasoning", "input"):
    if key in body:
        raise SystemExit(f"responses-only key {key!r} leaked into chat fallback body: {body!r}")

messages = body.get("messages")
if not isinstance(messages, list):
    raise SystemExit(f"fallback body missing chat messages: {body!r}")
message_text = json.dumps(messages, separators=(",", ":"))
for needle in ("follow runtime instructions", "dev note", "hello runtime"):
    if needle not in message_text:
        raise SystemExit(f"fallback messages missing {needle!r}: {messages!r}")

assistant_history = [m for m in messages if m.get("role") == "assistant" and isinstance(m.get("tool_calls"), list)]
if not assistant_history:
    raise SystemExit(f"fallback messages missing assistant tool-call history: {messages!r}")
tool_calls = assistant_history[0]["tool_calls"]
if not any(
    call.get("id") == "call-live-history"
    and call.get("type") == "function"
    and isinstance(call.get("function"), dict)
    and call["function"].get("name") == "exec_command"
    and call["function"].get("arguments") == '{"cmd":"pwd"}'
    for call in tool_calls
):
    raise SystemExit(f"fallback assistant history missing normalized tool call: {messages!r}")

tool_messages = [m for m in messages if m.get("role") == "tool"]
if not any(
    msg.get("tool_call_id") == "call-live-history"
    and msg.get("name") == "exec_command"
    and msg.get("content") == "history output ok"
    for msg in tool_messages
):
    raise SystemExit(f"fallback messages missing tool output history: {messages!r}")

tools = body.get("tools")
tool_text = json.dumps(tools, separators=(",", ":"))
if "mcp__code_index__describe_index" not in tool_text:
    raise SystemExit(f"fallback tools missing flattened MCP function: {tools!r}")

with open(response_path, "r", encoding="utf-8") as f:
    response = json.load(f)
if response.get("output_text") != "fallback ok":
    raise SystemExit(f"fallback response was not normalized to Responses JSON: {response!r}")
usage = response.get("usage") or {}
if usage.get("input_tokens") != 2 or usage.get("output_tokens") != 3 or usage.get("total_tokens") != 5:
    raise SystemExit(f"fallback response usage was not normalized: {response!r}")
PY

stream_status="$(curl -sS --max-time 20 -o "${stream_response_body}" -w '%{http_code}' \
  -H 'authorization: Bearer local-secret' \
  -H 'x-api-key: caller-secret' \
  -H 'content-type: application/json' \
  --data-binary "@${stream_request_body}" \
  "http://127.0.0.1:${proxy_port}/v1/responses")"

if [[ "${stream_status}" != "200" ]]; then
  echo "responses chat fallback stream returned ${stream_status}, expected 200" >&2
  cat "${stream_response_body}" >&2 || true
  cat "${server_log}" >&2 || true
  cat "${upstream_log}" >&2 || true
  exit 1
fi

python3 - "${stream_response_body}" <<'PY'
import sys

path = sys.argv[1]
with open(path, "r", encoding="utf-8") as f:
    text = f.read()

for needle in (
    'event: response.output_item.done',
    '"call_id":"call_read"',
    '"call_id":"call_cmd"',
    '"call_id":"call_read_env"',
    '"call_id":"call_read_quote"',
    '"call_id":"call_demo"',
    '"call_id":"call_pwd"',
    '"namespace":"mcp__demo_server__"',
    '"name":"rebuild"',
    '\\"cmd\\":\\"cat \'/tmp/demo.txt\'\\"',
    '\\"cmd\\":\\"deno check src/main.ts\\"',
    'sed -E',
    '<redacted>',
    '/tmp/demo/.env',
    'cat \'/tmp/demo/it',
    'works.txt\'',
    '"arguments":"{\\"cmd\\":\\"pwd\\"}"',
):
    if needle not in text:
        raise SystemExit(f"stream fallback response missing {needle!r}: {text!r}")
if '"name":"read"' in text:
    raise SystemExit(f"stream fallback response leaked raw read tool name: {text!r}")
if "demo-server.rebuild" in text:
    raise SystemExit(f"stream fallback response leaked raw dotted MCP tool name: {text!r}")
if '\\"cmd\\":\\"cat \'/tmp/demo/.env\'\\"' in text:
    raise SystemExit(f"stream fallback response leaked unredacted env cat command: {text!r}")
if "it'works.txt" in text:
    raise SystemExit(f"stream fallback response leaked unquoted apostrophe path: {text!r}")
PY

echo "responses_fallback_runtime_isolated_ok"
