#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_dir="$(cd "${script_dir}/../.." && pwd)"
sa_bin="${SA_BIN:-sa}"

tmp_root="$(mktemp -d /tmp/hubproxy-chat-responses-schema.XXXXXX)"
work_dir="${tmp_root}/work"
data_dir="${tmp_root}/data"
chat_request_body="${tmp_root}/chat-request.json"
responses_request_body="${tmp_root}/responses-request.json"
chat_response_body="${tmp_root}/chat-response.json"
responses_response_body="${tmp_root}/responses-response.json"
chat_capture="${tmp_root}/chat-capture.json"
responses_capture="${tmp_root}/responses-capture.json"
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

UPSTREAM_PORT="${upstream_port}" CHAT_CAPTURE="${chat_capture}" RESPONSES_CAPTURE="${responses_capture}" python3 - <<'PY' >"${upstream_log}" 2>&1 &
import http.server
import json
import os

port = int(os.environ["UPSTREAM_PORT"])
chat_capture = os.environ["CHAT_CAPTURE"]
responses_capture = os.environ["RESPONSES_CAPTURE"]

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
            "openai-organization": self.headers.get("openai-organization"),
            "openai-project": self.headers.get("openai-project"),
            "x-request-id": self.headers.get("x-request-id"),
            "accept-language": self.headers.get("accept-language"),
            "body": raw_body,
        }

        if self.path == "/v1/chat/completions":
            with open(chat_capture, "w", encoding="utf-8") as f:
                json.dump(capture, f, separators=(",", ":"))
            body = json.dumps({
                "choices": [{
                    "message": {
                        "role": "assistant",
                        "content": "chat schema ok",
                    }
                }],
                "usage": {
                    "prompt_tokens": 3,
                    "completion_tokens": 5,
                    "total_tokens": 8,
                },
            }, separators=(",", ":")).encode("utf-8")
            self.send_response(200)
            self.send_header("content-type", "application/json")
            self.send_header("content-length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        if self.path == "/v1/responses":
            with open(responses_capture, "w", encoding="utf-8") as f:
                json.dump(capture, f, separators=(",", ":"))
            body = json.dumps({
                "id": "resp_schema_runtime",
                "object": "response",
                "created_at": 1,
                "model": "schema-responses-model",
                "output": [
                    {
                        "id": "think_schema_runtime",
                        "type": "thinking",
                        "text": "native json live think",
                    },
                    {
                        "id": "msg_schema_runtime",
                        "type": "message",
                        "role": "assistant",
                        "reasoning_content": "message json live think",
                        "content": [{"type": "output_text", "text": "responses schema ok"}],
                    },
                ],
                "output_text": "responses schema ok",
                "usage": {
                    "input_tokens": 7,
                    "output_tokens": 11,
                    "total_tokens": 18,
                },
            }, separators=(",", ":")).encode("utf-8")
            self.send_response(200)
            self.send_header("content-type", "application/json")
            self.send_header("content-length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        body = b'{"error":"unexpected upstream path"}'
        self.send_response(500)
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
RESPONSES_BASE_URL=http://127.0.0.1:${upstream_port}/v1
DEFAULT_MODEL=default-schema-model
OPENAI_API_KEY=sk-upstream-schema
DATA_DIR=${data_dir}
ENV
cp "${tmp_root}/.env" "${work_dir}/.env"

cat >"${chat_request_body}" <<'JSON'
{
  "model": "schema-chat-model",
  "stream": false,
  "store": false,
  "prompt_cache_key": "drop-chat-cache",
  "include": ["reasoning.encrypted_content"],
  "reasoning": {"effort": "medium"},
  "messages": [{"role": "user", "content": "hello chat schema"}],
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "exec_command",
        "description": "Run a shell command",
        "parameters": {"type": "object", "properties": {"cmd": {"type": "string"}}},
        "strict": true
      }
    },
    {
      "type": "namespace",
      "name": "mcp__code_index__",
      "tools": [
        {
          "type": "function",
          "name": "search",
          "description": "Search indexed code",
          "parameters": {"type": "object", "properties": {"query": {"type": "string"}}},
          "strict": false
        },
        {"type": "web_search", "name": "drop_namespace_child"}
      ]
    },
    {"type": "web_search", "name": "drop_top_level"}
  ]
}
JSON

cat >"${responses_request_body}" <<'JSON'
{
  "model": "schema-responses-model",
  "stream": false,
  "store": false,
  "prompt_cache_key": "keep-responses-cache",
  "include": ["reasoning.encrypted_content"],
  "reasoning": {"effort": "low", "summary": "auto"},
  "input": [
    {"type": "message", "role": "user", "content": [{"type": "input_text", "text": "hello responses schema"}]}
  ],
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "exec_command",
        "description": "Run a shell command",
        "parameters": {"type": "object", "properties": {"cmd": {"type": "string"}}},
        "strict": true
      }
    },
    {
      "type": "namespace",
      "name": "mcp__code_index__",
      "tools": [
        {
          "type": "function",
          "name": "search",
          "description": "Search indexed code",
          "parameters": {"type": "object", "properties": {"query": {"type": "string"}}},
          "strict": false
        },
        {"type": "web_search", "name": "drop_responses_namespace_child"}
      ]
    },
    {"type": "web_search", "name": "drop_responses_top_level"}
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

chat_status="$(curl -sS --max-time 20 -o "${chat_response_body}" -w '%{http_code}' \
  -H 'authorization: Bearer local-secret' \
  -H 'x-api-key: caller-secret' \
  -H 'api-key: caller-api-key' \
  -H 'content-type: application/json' \
  -H 'openai-organization: org_passthrough_chat' \
  -H 'openai-project: project_passthrough_chat' \
  -H 'x-request-id: req_passthrough_chat' \
  -H 'accept-language: en-GB' \
  --data-binary "@${chat_request_body}" \
  "http://127.0.0.1:${proxy_port}/v1/chat/completions")"

if [[ "${chat_status}" != "200" ]]; then
  echo "chat schema proxy returned ${chat_status}, expected 200" >&2
  cat "${chat_response_body}" >&2 || true
  cat "${server_log}" >&2 || true
  cat "${upstream_log}" >&2 || true
  exit 1
fi

responses_status="$(curl -sS --max-time 20 -o "${responses_response_body}" -w '%{http_code}' \
  -H 'authorization: Bearer local-secret' \
  -H 'x-api-key: caller-secret' \
  -H 'api-key: caller-api-key' \
  -H 'content-type: application/json' \
  -H 'openai-organization: org_passthrough_responses' \
  -H 'openai-project: project_passthrough_responses' \
  -H 'x-request-id: req_passthrough_responses' \
  -H 'accept-language: fr-FR' \
  --data-binary "@${responses_request_body}" \
  "http://127.0.0.1:${proxy_port}/v1/responses")"

if [[ "${responses_status}" != "200" ]]; then
  echo "responses schema proxy returned ${responses_status}, expected 200" >&2
  cat "${responses_response_body}" >&2 || true
  cat "${server_log}" >&2 || true
  cat "${upstream_log}" >&2 || true
  exit 1
fi

if [[ ! -s "${chat_capture}" || ! -s "${responses_capture}" ]]; then
  echo "mock upstream did not capture both chat and responses requests" >&2
  ls -la "${tmp_root}" >&2 || true
  cat "${upstream_log}" >&2 || true
  cat "${server_log}" >&2 || true
  exit 1
fi

python3 - "${chat_capture}" "${responses_capture}" "${chat_response_body}" "${responses_response_body}" <<'PY'
import json
import sys

chat_path, responses_path, chat_response_path, responses_response_path = sys.argv[1:]
with open(chat_path, "r", encoding="utf-8") as f:
    chat = json.load(f)
with open(responses_path, "r", encoding="utf-8") as f:
    responses = json.load(f)

for label, capture, expected_path in (
    ("chat", chat, "/v1/chat/completions"),
    ("responses", responses, "/v1/responses"),
):
    if capture["path"] != expected_path:
        raise SystemExit(f"{label} request path mismatch: {capture['path']!r}")
    if capture["authorization"] != "Bearer sk-upstream-schema":
        raise SystemExit(f"{label} bad upstream authorization: {capture['authorization']!r}")
    if capture["x-api-key"] != "sk-upstream-schema":
        raise SystemExit(f"{label} bad upstream x-api-key: {capture['x-api-key']!r}")
    if capture["api-key"] is not None:
        raise SystemExit(f"{label} unexpected naked api-key: {capture['api-key']!r}")
    if "caller-secret" in json.dumps(capture) or "caller-api-key" in json.dumps(capture):
        raise SystemExit(f"{label} leaked caller auth material")

expected_passthrough = {
    "chat": {
        "openai-organization": "org_passthrough_chat",
        "openai-project": "project_passthrough_chat",
        "x-request-id": "req_passthrough_chat",
        "accept-language": "en-GB",
    },
    "responses": {
        "openai-organization": "org_passthrough_responses",
        "openai-project": "project_passthrough_responses",
        "x-request-id": "req_passthrough_responses",
        "accept-language": "fr-FR",
    },
}
for label, capture in (("chat", chat), ("responses", responses)):
    for key, expected in expected_passthrough[label].items():
        if capture.get(key) != expected:
            raise SystemExit(f"{label} did not passthrough {key}: {capture!r}")

chat_body = json.loads(chat["body"])
if chat_body.get("model") != "schema-chat-model":
    raise SystemExit(f"chat body did not preserve model: {chat_body!r}")
if chat_body.get("stream") is not False:
    raise SystemExit(f"chat body did not preserve stream:false: {chat_body!r}")
for key in ("store", "prompt_cache_key", "include", "reasoning"):
    if key in chat_body:
        raise SystemExit(f"chat body leaked Responses-only key {key!r}: {chat_body!r}")
messages = chat_body.get("messages")
if not isinstance(messages, list) or "hello chat schema" not in json.dumps(messages):
    raise SystemExit(f"chat body did not preserve messages: {chat_body!r}")

chat_tools = chat_body.get("tools")
if not isinstance(chat_tools, list) or len(chat_tools) != 2:
    raise SystemExit(f"chat tools were not filtered to two function entries: {chat_tools!r}")
chat_names = [tool.get("function", {}).get("name") for tool in chat_tools]
if chat_names != ["exec_command", "mcp__code_index__search"]:
    raise SystemExit(f"chat tools did not preserve nested/namespace names: {chat_tools!r}")
if chat_tools[0].get("type") != "function" or chat_tools[0].get("function", {}).get("strict") is not True:
    raise SystemExit(f"chat nested function tool lost type/strict: {chat_tools!r}")
if chat_tools[1].get("type") != "function" or chat_tools[1].get("function", {}).get("strict") is not False:
    raise SystemExit(f"chat namespace tool lost type/strict: {chat_tools!r}")
chat_tool_text = json.dumps(chat_tools, separators=(",", ":"))
for needle in ("drop_top_level", "drop_namespace_child", "web_search"):
    if needle in chat_tool_text:
        raise SystemExit(f"chat non-function tool was not dropped: {chat_tools!r}")

responses_body = json.loads(responses["body"])
if responses_body.get("model") != "schema-responses-model":
    raise SystemExit(f"responses body did not preserve model: {responses_body!r}")
if responses_body.get("stream") is not False:
    raise SystemExit(f"responses body did not preserve stream:false: {responses_body!r}")
if responses_body.get("store") is not False:
    raise SystemExit(f"responses body did not preserve store:false: {responses_body!r}")
if responses_body.get("prompt_cache_key") != "keep-responses-cache":
    raise SystemExit(f"responses body did not preserve prompt_cache_key: {responses_body!r}")
if responses_body.get("include") != ["reasoning.encrypted_content"]:
    raise SystemExit(f"responses body did not preserve include: {responses_body!r}")
if (responses_body.get("reasoning") or {}).get("effort") != "low":
    raise SystemExit(f"responses body did not preserve reasoning: {responses_body!r}")
inputs = responses_body.get("input")
if not isinstance(inputs, list) or "hello responses schema" not in json.dumps(inputs):
    raise SystemExit(f"responses body did not preserve input: {responses_body!r}")

responses_tools = responses_body.get("tools")
if not isinstance(responses_tools, list) or len(responses_tools) != 2:
    raise SystemExit(f"responses tools were not filtered to two function entries: {responses_tools!r}")
responses_names = [tool.get("name") for tool in responses_tools]
if responses_names != ["exec_command", "mcp__code_index__search"]:
    raise SystemExit(f"responses tools did not preserve flat/namespace names: {responses_tools!r}")
if any(tool.get("type") != "function" for tool in responses_tools):
    raise SystemExit(f"responses tools did not keep type:function: {responses_tools!r}")
if any("function" in tool for tool in responses_tools):
    raise SystemExit(f"responses tools should be flat, not chat-style nested: {responses_tools!r}")
if responses_tools[0].get("strict") is not True or responses_tools[1].get("strict") is not False:
    raise SystemExit(f"responses tools lost strict values: {responses_tools!r}")
responses_tool_text = json.dumps(responses_tools, separators=(",", ":"))
for needle in ("drop_responses_top_level", "drop_responses_namespace_child", "web_search"):
    if needle in responses_tool_text:
        raise SystemExit(f"responses non-function tool was not dropped: {responses_tools!r}")

with open(chat_response_path, "r", encoding="utf-8") as f:
    chat_response = json.load(f)
if chat_response.get("choices", [{}])[0].get("message", {}).get("content") != "chat schema ok":
    raise SystemExit(f"chat response was not proxied: {chat_response!r}")

with open(responses_response_path, "r", encoding="utf-8") as f:
    responses_response = json.load(f)
responses_response_text = json.dumps(responses_response, separators=(",", ":"))
if "responses schema ok" not in responses_response_text:
    raise SystemExit(f"responses response was not returned/normalized: {responses_response!r}")
for needle in ("native json live think", "message json live think", '"type":"reasoning"'):
    if needle not in responses_response_text:
        raise SystemExit(f"responses thinking JSON was not normalized with {needle!r}: {responses_response!r}")
for needle in ('"type":"thinking"', "reasoning_content"):
    if needle in responses_response_text:
        raise SystemExit(f"responses thinking JSON leaked {needle!r}: {responses_response!r}")
PY

echo "chat_responses_schema_runtime_isolated_ok"
