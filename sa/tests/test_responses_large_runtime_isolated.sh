#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_dir="$(cd "${script_dir}/../.." && pwd)"
sa_bin="${SA_BIN:-sa}"

tmp_root="$(mktemp -d /tmp/hubproxy-responses-large.XXXXXX)"
work_dir="${tmp_root}/work"
data_dir="${tmp_root}/data"
long_request_body="${tmp_root}/long-request.json"
sse_request_body="${tmp_root}/sse-request.json"
long_response_body="${tmp_root}/long-response.json"
sse_response_body="${tmp_root}/sse-response.txt"
long_capture="${tmp_root}/long-capture.json"
sse_capture="${tmp_root}/sse-capture.json"
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

UPSTREAM_PORT="${upstream_port}" LONG_CAPTURE="${long_capture}" SSE_CAPTURE="${sse_capture}" python3 - <<'PY' >"${upstream_log}" 2>&1 &
import http.server
import json
import os

port = int(os.environ["UPSTREAM_PORT"])
long_capture = os.environ["LONG_CAPTURE"]
sse_capture = os.environ["SSE_CAPTURE"]

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
        try:
            parsed = json.loads(raw_body)
        except json.JSONDecodeError:
            parsed = {}
        is_stream = parsed.get("stream") is True
        capture = {
            "path": self.path,
            "authorization": self.headers.get("authorization"),
            "x-api-key": self.headers.get("x-api-key"),
            "api-key": self.headers.get("api-key"),
            "content-type": self.headers.get("content-type"),
            "bodyBytes": len(raw_body.encode("utf-8")),
            "hasLongTail": "long-request-tail" in raw_body,
            "hasSseTail": "sse-request-tail" in raw_body,
        }
        with open(sse_capture if is_stream else long_capture, "w", encoding="utf-8") as f:
            json.dump(capture, f, separators=(",", ":"))

        if self.path != "/v1/responses":
            body = b'{"error":"unexpected upstream path"}'
            self.send_response(404)
            self.send_header("content-type", "application/json")
            self.send_header("content-length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        if is_stream:
            large_delta = "sse-" + ("x" * 90000) + "-large-sse-tail"
            chunk = (
                "event: response.output_item.done\n"
                + "data: "
                + json.dumps({"type": "response.output_item.done", "item": {"id": "think_native_live", "type": "thinking", "text": "native stream live think"}}, separators=(",", ":"))
                + "\n\n"
                + "event: response.output_text.delta\n"
                + "data: "
                + json.dumps({"type": "response.output_text.delta", "delta": large_delta}, separators=(",", ":"))
                + "\n\n"
                + "event: response.completed\n"
                + "data: {\"type\":\"response.completed\",\"response\":{\"id\":\"resp_large\",\"status\":\"completed\"}}\n\n"
            ).encode("utf-8")
            self.send_response(200)
            self.send_header("content-type", "text/event-stream")
            self.send_header("content-length", str(len(chunk)))
            self.end_headers()
            self.wfile.write(chunk)
            return

        body = json.dumps({
            "output": [{
                "id": "msg_long",
                "type": "message",
                "role": "assistant",
                "content": [{"type": "output_text", "text": "long request ok"}],
            }],
            "output_text": "long request ok",
            "status": "completed",
            "usage": {
                "input_tokens": 7,
                "output_tokens": 8,
                "total_tokens": 15,
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
RESPONSES_BASE_URL=http://127.0.0.1:${upstream_port}/v1
DEFAULT_MODEL=default-large-model
OPENAI_API_KEY=sk-upstream-large
DATA_DIR=${data_dir}
ENV
cp "${tmp_root}/.env" "${work_dir}/.env"

python3 - "${long_request_body}" "${sse_request_body}" <<'PY'
import json
import sys

long_path, sse_path = sys.argv[1:]
long_text = "long-" + ("a" * 90000) + "-long-request-tail"
sse_text = "sse-" + ("b" * 90000) + "-sse-request-tail"
with open(long_path, "w", encoding="utf-8") as f:
    json.dump({
        "model": "models/mimo-v2.5-pro",
        "stream": False,
        "input": long_text,
    }, f, separators=(",", ":"))
with open(sse_path, "w", encoding="utf-8") as f:
    json.dump({
        "model": "models/mimo-v2.5-pro",
        "stream": True,
        "input": sse_text,
    }, f, separators=(",", ":"))
PY

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

long_status="$(curl -sS --max-time 30 -o "${long_response_body}" -w '%{http_code}' \
  -H 'authorization: Bearer local-secret' \
  -H 'x-api-key: caller-secret' \
  -H 'api-key: caller-api-key' \
  -H 'content-type: application/json' \
  --data-binary "@${long_request_body}" \
  "http://127.0.0.1:${proxy_port}/v1/responses")"

if [[ "${long_status}" != "200" ]]; then
  echo "long responses request returned ${long_status}, expected 200" >&2
  cat "${long_response_body}" >&2 || true
  cat "${server_log}" >&2 || true
  cat "${upstream_log}" >&2 || true
  exit 1
fi

sse_status="$(curl -sS --max-time 30 -o "${sse_response_body}" -w '%{http_code}' \
  -H 'authorization: Bearer local-secret' \
  -H 'x-api-key: caller-secret' \
  -H 'api-key: caller-api-key' \
  -H 'content-type: application/json' \
  --data-binary "@${sse_request_body}" \
  "http://127.0.0.1:${proxy_port}/v1/responses")"

if [[ "${sse_status}" != "200" ]]; then
  echo "large responses SSE returned ${sse_status}, expected 200" >&2
  cat "${sse_response_body}" >&2 || true
  cat "${server_log}" >&2 || true
  cat "${upstream_log}" >&2 || true
  exit 1
fi

if [[ ! -s "${long_capture}" || ! -s "${sse_capture}" ]]; then
  echo "mock upstream did not capture both large requests" >&2
  ls -la "${tmp_root}" >&2 || true
  cat "${upstream_log}" >&2 || true
  cat "${server_log}" >&2 || true
  exit 1
fi

python3 - "${long_capture}" "${sse_capture}" "${long_response_body}" "${sse_response_body}" <<'PY'
import json
import sys

long_capture_path, sse_capture_path, long_response_path, sse_response_path = sys.argv[1:]
for label, path, tail_key in (
    ("long", long_capture_path, "hasLongTail"),
    ("sse", sse_capture_path, "hasSseTail"),
):
    with open(path, "r", encoding="utf-8") as f:
        capture = json.load(f)
    if capture["path"] != "/v1/responses":
        raise SystemExit(f"{label} request path mismatch: {capture['path']!r}")
    if capture["authorization"] != "Bearer sk-upstream-large":
        raise SystemExit(f"{label} bad upstream authorization: {capture['authorization']!r}")
    if capture["x-api-key"] != "sk-upstream-large":
        raise SystemExit(f"{label} bad upstream x-api-key: {capture['x-api-key']!r}")
    if capture["api-key"] is not None:
        raise SystemExit(f"{label} unexpected naked api-key: {capture['api-key']!r}")
    if capture["bodyBytes"] < 90000 or not capture[tail_key]:
        raise SystemExit(f"{label} upstream body was truncated or missing tail: {capture!r}")
    if "caller-secret" in json.dumps(capture) or "caller-api-key" in json.dumps(capture):
        raise SystemExit(f"{label} leaked caller auth material")

with open(long_response_path, "r", encoding="utf-8") as f:
    long_response = json.load(f)
if long_response.get("output_text") != "long request ok":
    raise SystemExit(f"long response JSON was not returned intact: {long_response!r}")

with open(sse_response_path, "r", encoding="utf-8") as f:
    sse_response = f.read()
if len(sse_response.encode("utf-8")) < 90000:
    raise SystemExit("large SSE response was truncated")
if "large-sse-tail" not in sse_response:
    raise SystemExit("large SSE response missing tail marker")
if "response.output_text.delta" not in sse_response:
    raise SystemExit("large SSE response missing output text delta event")
if "native stream live think" not in sse_response:
    raise SystemExit("large SSE response missing normalized thinking text")
if '"type":"reasoning"' not in sse_response:
    raise SystemExit("large SSE response did not normalize thinking to reasoning")
if '"type":"thinking"' in sse_response:
    raise SystemExit("large SSE response leaked raw thinking type")
PY

echo "responses_large_runtime_isolated_ok"
