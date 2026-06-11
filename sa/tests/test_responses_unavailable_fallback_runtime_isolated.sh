#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_dir="$(cd "${script_dir}/../.." && pwd)"
sa_bin="${SA_BIN:-sa}"

tmp_root="$(mktemp -d /tmp/hubproxy-responses-unavailable.XXXXXX)"
work_dir="${tmp_root}/work"
data_dir="${tmp_root}/data"
request_body="${tmp_root}/responses-request.json"
response_body="${tmp_root}/responses-response.json"
responses_capture="${tmp_root}/responses-capture.json"
chat_capture="${tmp_root}/chat-capture.json"
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

UPSTREAM_PORT="${upstream_port}" RESPONSES_CAPTURE="${responses_capture}" CHAT_CAPTURE="${chat_capture}" python3 - <<'PY' >"${upstream_log}" 2>&1 &
import http.server
import json
import os

port = int(os.environ["UPSTREAM_PORT"])
responses_capture = os.environ["RESPONSES_CAPTURE"]
chat_capture = os.environ["CHAT_CAPTURE"]

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

        if self.path == "/v1/responses":
            with open(responses_capture, "w", encoding="utf-8") as f:
                json.dump(capture, f, separators=(",", ":"))
            body = b'{"error":{"message":"responses unavailable"}}'
            self.send_response(404)
            self.send_header("content-type", "application/json")
            self.send_header("content-length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        if self.path == "/v1/chat/completions":
            with open(chat_capture, "w", encoding="utf-8") as f:
                json.dump(capture, f, separators=(",", ":"))
            body = json.dumps({
                "choices": [{
                    "message": {
                        "role": "assistant",
                        "content": "fallback after 404",
                    }
                }],
                "usage": {
                    "prompt_tokens": 4,
                    "completion_tokens": 6,
                    "total_tokens": 10,
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
DEFAULT_MODEL=default-fallback-model
OPENAI_API_KEY=sk-upstream-unavailable
DATA_DIR=${data_dir}
ENV
cp "${tmp_root}/.env" "${work_dir}/.env"

cat >"${request_body}" <<'JSON'
{
  "model": "models/mimo-v2.5-pro",
  "stream": false,
  "instructions": "fallback after unavailable",
  "store": false,
  "prompt_cache_key": "native-route-keeps-this-first",
  "include": ["reasoning.encrypted_content"],
  "reasoning": {"effort": "low"},
  "input": [
    {"type": "message", "role": "user", "content": [{"type": "input_text", "text": "retry via chat"}]}
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
  echo "responses unavailable fallback returned ${status}, expected 200" >&2
  cat "${response_body}" >&2 || true
  cat "${server_log}" >&2 || true
  cat "${upstream_log}" >&2 || true
  exit 1
fi

if [[ ! -s "${responses_capture}" || ! -s "${chat_capture}" ]]; then
  echo "mock upstream did not capture both native responses and chat fallback requests" >&2
  ls -la "${tmp_root}" >&2 || true
  cat "${upstream_log}" >&2 || true
  cat "${server_log}" >&2 || true
  exit 1
fi

python3 - "${responses_capture}" "${chat_capture}" "${response_body}" <<'PY'
import json
import sys

responses_path, chat_path, response_path = sys.argv[1:]
with open(responses_path, "r", encoding="utf-8") as f:
    native = json.load(f)
with open(chat_path, "r", encoding="utf-8") as f:
    fallback = json.load(f)

for label, capture, path in (
    ("native", native, "/v1/responses"),
    ("fallback", fallback, "/v1/chat/completions"),
):
    if capture["path"] != path:
        raise SystemExit(f"{label} request path mismatch: {capture['path']!r}")
    if capture["authorization"] != "Bearer sk-upstream-unavailable":
        raise SystemExit(f"{label} bad upstream authorization: {capture['authorization']!r}")
    if capture["x-api-key"] != "sk-upstream-unavailable":
        raise SystemExit(f"{label} bad upstream x-api-key: {capture['x-api-key']!r}")
    if capture["api-key"] is not None:
        raise SystemExit(f"{label} unexpected naked api-key: {capture['api-key']!r}")
    if "caller-secret" in json.dumps(capture) or "caller-api-key" in json.dumps(capture):
        raise SystemExit(f"{label} leaked caller auth material")

native_body = json.loads(native["body"])
if native_body.get("model") != "models/mimo-v2.5-pro":
    raise SystemExit(f"native responses body did not preserve model: {native_body!r}")
for key in ("store", "prompt_cache_key", "include", "reasoning", "input"):
    if key not in native_body:
        raise SystemExit(f"native responses body unexpectedly dropped {key!r}: {native_body!r}")

fallback_body = json.loads(fallback["body"])
if fallback_body.get("model") != "models/mimo-v2.5-pro":
    raise SystemExit(f"fallback body did not preserve model: {fallback_body!r}")
if fallback_body.get("stream") is not False:
    raise SystemExit(f"fallback body did not preserve stream:false: {fallback_body!r}")
for key in ("store", "prompt_cache_key", "include", "reasoning", "input"):
    if key in fallback_body:
        raise SystemExit(f"responses-only key {key!r} leaked into unavailable fallback body: {fallback_body!r}")
messages = fallback_body.get("messages")
if not isinstance(messages, list):
    raise SystemExit(f"fallback body missing chat messages: {fallback_body!r}")
message_text = json.dumps(messages, separators=(",", ":"))
for needle in ("fallback after unavailable", "retry via chat"):
    if needle not in message_text:
        raise SystemExit(f"fallback messages missing {needle!r}: {messages!r}")

with open(response_path, "r", encoding="utf-8") as f:
    response = json.load(f)
if response.get("output_text") != "fallback after 404":
    raise SystemExit(f"fallback response was not normalized: {response!r}")
usage = response.get("usage") or {}
if usage.get("input_tokens") != 4 or usage.get("output_tokens") != 6 or usage.get("total_tokens") != 10:
    raise SystemExit(f"fallback response usage was not normalized: {response!r}")
PY

echo "responses_unavailable_fallback_runtime_isolated_ok"
