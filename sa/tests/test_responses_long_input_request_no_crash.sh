#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
sa_dir="$(cd "${script_dir}/.." && pwd)"
project_dir="$(cd "${sa_dir}/.." && pwd)"
source "${script_dir}/lib/runtime_env.sh"
env_file="${project_dir}/.env"
tmp_dir="$(mktemp -d)"
server_log="$(mktemp)"
request_body="$(mktemp)"
response_body="$(mktemp)"
capture_body="$(mktemp)"
health_body="$(mktemp)"
hub_port="${SA_TEST_PROXY_PORT:-$(sa_test_free_port)}"
upstream_port="${SA_TEST_UPSTREAM_PORT:-$(sa_test_free_port)}"
server_pid=""
hub_pid=""

cleanup() {
  if [[ -n "${hub_pid}" ]]; then
    sa_test_stop_pid "${hub_pid}"
  fi
  if [[ -n "${server_pid}" ]]; then
    kill "${server_pid}" 2>/dev/null || true
    wait "${server_pid}" 2>/dev/null || true
  fi
  rm -rf "${tmp_dir}"
  rm -f "${server_log}" "${request_body}" "${response_body}" "${capture_body}" "${health_body}"
}
trap cleanup EXIT

sa_test_assert_port_free "${hub_port}"
sa_test_assert_port_free "${upstream_port}"

python3 - "${request_body}" <<'PY'
import json
import sys

long_text = "".join(
    f"line-{i:04d}: SA long request regression input with responses JSON rewriting and completion marker.\n"
    for i in range(1700)
)
long_text += "SA_LONG_REQUEST_END"
body = {
    "model": "models/mimo-v2.5-pro",
    "stream": True,
    "input": [
        {
            "type": "message",
            "role": "user",
            "content": [{"type": "input_text", "text": long_text}],
        }
    ],
}
with open(sys.argv[1], "w", encoding="utf-8") as f:
    json.dump(body, f, separators=(",", ":"))
PY

CAPTURE_BODY="${capture_body}" UPSTREAM_PORT="${upstream_port}" python3 <<'PY' >"${server_log}" 2>&1 &
import http.server
import os

capture_path = os.environ["CAPTURE_BODY"]
port = int(os.environ["UPSTREAM_PORT"])
SSE = b'''event: response.created
data: {"type":"response.created","response":{"id":"resp_long_req"}}

event: response.output_text.delta
data: {"type":"response.output_text.delta","delta":"ok"}

event: response.completed
data: {"type":"response.completed","response":{"id":"resp_long_req","status":"completed"}}

'''

class Handler(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        length = int(self.headers.get("content-length", "0"))
        body = self.rfile.read(length)
        if self.path == "/v1/responses":
            with open(capture_path, "wb") as f:
                f.write(body)
            self.send_response(200)
            self.send_header("content-type", "text/event-stream")
            self.send_header("content-length", str(len(SSE)))
            self.end_headers()
            self.wfile.write(SSE)
            return
        self.send_response(404)
        self.end_headers()

    def log_message(self, *_args):
        return

http.server.ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
PY
server_pid=$!

if ! sa_test_wait_port "${upstream_port}" 50 0.1; then
  echo "upstream did not start on ${upstream_port}" >&2
  cat "${server_log}" >&2 || true
  exit 1
fi

sa_test_write_env_from_root "${env_file}" "${tmp_dir}/.env.base" "${hub_port}" "client-secret"
awk -v upstream_port="${upstream_port}" '
  BEGIN { wrote_chat=0; wrote_resp=0; wrote_sa_port=0 }
  /^CHAT_BASE_URL=/ { print "CHAT_BASE_URL=http://127.0.0.1:" upstream_port "/v1"; wrote_chat=1; next }
  /^RESPONSES_BASE_URL=/ { print "RESPONSES_BASE_URL=http://127.0.0.1:" upstream_port "/v1"; wrote_resp=1; next }
  /^SA_PORT=/ { print; wrote_sa_port=1; next }
  { print }
  END {
    if (!wrote_chat) print "CHAT_BASE_URL=http://127.0.0.1:" upstream_port "/v1"
    if (!wrote_resp) print "RESPONSES_BASE_URL=http://127.0.0.1:" upstream_port "/v1"
  }
' "${tmp_dir}/.env.base" >"${tmp_dir}/.env"

hub_pid="$(sa_test_start_hubproxy "${sa_dir}" "${tmp_dir}" "${tmp_dir}/hubproxy.log")"
if ! sa_test_wait_port "${hub_port}" 50 0.1; then
  echo "hubproxy did not start on ${hub_port}" >&2
  cat "${tmp_dir}/hubproxy.log" >&2 || true
  exit 1
fi

auth="client-secret"
curl -sS --max-time 20 \
  -H "authorization: Bearer ${auth}" \
  -H 'content-type: application/json' \
  --data-binary "@${request_body}" \
  "http://127.0.0.1:${hub_port}/v1/responses" >"${response_body}"

captured_size="$(wc -c <"${capture_body}")"
if (( captured_size < 100000 )); then
  echo "upstream captured request was unexpectedly small: ${captured_size}" >&2
  cat "${tmp_dir}/hubproxy.log" >&2 || true
  exit 1
fi

if ! rg -q 'SA_LONG_REQUEST_END' "${capture_body}"; then
  echo "long request marker did not reach upstream" >&2
  tail -c 500 "${capture_body}" >&2
  exit 1
fi

if ! rg -q 'event: response.completed' "${response_body}"; then
  echo "SA did not return completed response SSE" >&2
  cat "${response_body}" >&2
  exit 1
fi

curl -sS --max-time 3 "http://127.0.0.1:${hub_port}/healthz" >"${health_body}"
if ! rg -q '"ok":true' "${health_body}"; then
  echo "SA hubproxy did not stay healthy after long request" >&2
  cat "${tmp_dir}/hubproxy.log" >&2 || true
  exit 1
fi

echo "responses_long_input_request_no_crash_ok size=${captured_size}"
