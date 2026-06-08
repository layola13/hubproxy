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
status_file="$(mktemp)"
chat_called_file="$(mktemp)"
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
  rm -f "${server_log}" "${request_body}" "${response_body}" "${status_file}" "${chat_called_file}"
}
trap cleanup EXIT

sa_test_assert_port_free "${hub_port}"
sa_test_assert_port_free "${upstream_port}"

printf '0' >"${chat_called_file}"
python3 - "${request_body}" "${chat_called_file}" "${upstream_port}" <<'PY' >"${server_log}" 2>&1 &
import http.server
import sys

request_path, chat_called_path = sys.argv[1:3]
port = int(sys.argv[3])

class Handler(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        length = int(self.headers.get("content-length", "0"))
        body = self.rfile.read(length).decode("utf-8", "replace")
        if self.path == "/v1/responses":
            with open(request_path, "w", encoding="utf-8") as f:
                f.write(body)
            self.send_response(404)
            self.send_header("content-type", "application/json")
            self.end_headers()
            self.wfile.write(b'{"error":{"message":"responses unavailable"}}')
            return
        if self.path == "/v1/chat/completions":
            with open(chat_called_path, "w", encoding="utf-8") as f:
                f.write("1")
            self.send_response(200)
            self.send_header("content-type", "application/json")
            self.end_headers()
            self.wfile.write(b'{"id":"unexpected","object":"chat.completion"}')
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
curl -sS --max-time 15 \
  -o "${response_body}" \
  -w '%{http_code}' \
  -H "authorization: Bearer ${auth}" \
  -H 'content-type: application/json' \
  --data '{"model":"models/gemini-3-flash-preview","stream":true,"input":[{"type":"function_call","call_id":"call-1","name":"exec_command","arguments":"{\"cmd\":\"date\"}"},{"type":"function_call_output","call_id":"call-1","output":"ok"}]}' \
  "http://127.0.0.1:${hub_port}/v1/responses" >"${status_file}"

if [[ "$(cat "${status_file}")" != "404" ]]; then
  echo "gemini tool-history request should return original responses status" >&2
  cat "${status_file}" >&2
  cat "${response_body}" >&2
  exit 1
fi

if ! rg -q '"responses unavailable"' "${response_body}"; then
  echo "gemini tool-history request should return original responses body" >&2
  cat "${response_body}" >&2
  exit 1
fi

if [[ "$(cat "${chat_called_file}")" != "0" ]]; then
  echo "gemini tool-history request unexpectedly called chat fallback" >&2
  exit 1
fi

if ! rg -q '"function_call_output"' "${request_body}"; then
  echo "mock responses upstream did not receive tool history body" >&2
  cat "${request_body}" >&2
  exit 1
fi

echo "responses_gemini_tool_history_no_fallback_ok"
