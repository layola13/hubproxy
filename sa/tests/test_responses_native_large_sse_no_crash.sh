#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
sa_dir="$(cd "${script_dir}/.." && pwd)"
project_dir="$(cd "${sa_dir}/.." && pwd)"
source "${script_dir}/lib/runtime_env.sh"
env_file="${project_dir}/.env"
tmp_dir="$(mktemp -d)"
server_log="$(mktemp)"
response_body="$(mktemp)"
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
  rm -f "${server_log}" "${response_body}" "${health_body}"
}
trap cleanup EXIT

sa_test_assert_port_free "${hub_port}"
sa_test_assert_port_free "${upstream_port}"

python3 - "${upstream_port}" <<'PY' >"${server_log}" 2>&1 &
import http.server
import json
import sys

port = int(sys.argv[1])

thinking = "SA_LARGE_SSE_START_" + ("x" * 42000) + "_SA_LARGE_SSE_END"
item = {
    "type": "response.output_item.done",
    "item": {
        "id": "think_large",
        "type": "thinking",
        "text": thinking,
    },
}
completed = {
    "type": "response.completed",
    "response": {"id": "resp_large", "status": "completed"},
}
SSE = (
    "event: response.output_item.done\n"
    + "data: "
    + json.dumps(item, separators=(",", ":"))
    + "\n\n"
    + "event: response.completed\n"
    + "data: "
    + json.dumps(completed, separators=(",", ":"))
    + "\n\n"
).encode("utf-8")

class Handler(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        length = int(self.headers.get("content-length", "0"))
        self.rfile.read(length)
        if self.path == "/v1/responses":
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
  --data '{"model":"models/mimo-v2.5-pro","stream":true,"input":[{"type":"message","role":"user","content":[{"type":"input_text","text":"hello"}]}]}' \
  "http://127.0.0.1:${hub_port}/v1/responses" >"${response_body}"

size="$(wc -c <"${response_body}")"
if (( size < 70000 )); then
  echo "large normalized SSE response was unexpectedly small: ${size}" >&2
  cat "${response_body}" >&2
  exit 1
fi

if ! rg -q 'event: response.output_item.done' "${response_body}" \
  || ! rg -q 'event: response.completed' "${response_body}" \
  || ! rg -q 'SA_LARGE_SSE_START_' "${response_body}" \
  || ! rg -q '_SA_LARGE_SSE_END' "${response_body}"; then
  echo "large native SSE response was truncated or missing completion" >&2
  cat "${response_body}" >&2
  exit 1
fi

if rg -q '"type":"thinking"' "${response_body}"; then
  echo "large native SSE leaked raw thinking item" >&2
  cat "${response_body}" >&2
  exit 1
fi

curl -sS --max-time 3 "http://127.0.0.1:${hub_port}/healthz" >"${health_body}"
if ! rg -q '"ok":true' "${health_body}"; then
  echo "SA hubproxy did not stay healthy after large SSE normalization" >&2
  cat "${tmp_dir}/hubproxy.log" >&2 || true
  exit 1
fi

echo "responses_native_large_sse_no_crash_ok size=${size}"
