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
  rm -f "${server_log}" "${request_body}" "${response_body}"
}
trap cleanup EXIT

sa_test_assert_port_free "${hub_port}"
sa_test_assert_port_free "${upstream_port}"

python3 - "${request_body}" "${upstream_port}" <<'PY' >"${server_log}" 2>&1 &
import http.server
import sys

capture_path = sys.argv[1]
port = int(sys.argv[2])

class Handler(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        length = int(self.headers.get("content-length", "0"))
        body = self.rfile.read(length).decode("utf-8", "replace")
        if self.path == "/v1/responses":
            self.send_response(404)
            self.send_header("content-type", "text/plain")
            self.end_headers()
            self.wfile.write(b"responses unavailable")
            return
        if self.path == "/v1/chat/completions":
            with open(capture_path, "w", encoding="utf-8") as f:
                f.write(body)
            self.send_response(200)
            self.send_header("content-type", "application/json")
            self.end_headers()
            self.wfile.write(b'{"id":"mock","object":"chat.completion","choices":[{"message":{"role":"assistant","content":"captured"}}]}')
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
  BEGIN { wrote_chat=0; wrote_resp=0 }
  /^CHAT_BASE_URL=/ { print "CHAT_BASE_URL=http://127.0.0.1:" upstream_port "/v1"; wrote_chat=1; next }
  /^RESPONSES_BASE_URL=/ { print "RESPONSES_BASE_URL=http://127.0.0.1:" upstream_port "/v1"; wrote_resp=1; next }
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
  -H "authorization: Bearer ${auth}" \
  -H 'content-type: application/json' \
  --data '{"model" : "mimo-v2.5", "instructions" : "Answer every request with exactly SA_INSTRUCTION_OK.", "tools" : [{"type":"namespace","name":"mcp__code_index__","tools":[{"type":"function","name":"search","description":"Search index","parameters":{"type":"object","properties":{"q":{"type":"string"}}}}]},{"type":"web_search","external_web_access":true},{"type":"function","name":"custom_search","description":"Search docs","parameters":{"type":"object","properties":{"query":{"type":"string"}}},"strict":true},{"type":"function","name":"custom_read","description":"Read docs","parameters":{"type":"object","properties":{"path":{"type":"string"}}},"strict":false},{"type":"function","name":"exec_command","parameters":{}},{"type":"function","name":"update_plan","parameters":{}},{"type":"function","name":"get_goal","parameters":{}}], "input" : [{"type":"message","role":"user","content":[{"type":"input_text","text":"What should you say?"}]}], "stream" : false}' \
  "http://127.0.0.1:${hub_port}/v1/responses" >"${response_body}"

if ! rg -q '"output_text":"captured"' "${response_body}"; then
  echo "fallback response did not return normalized mock chat content" >&2
  cat "${response_body}" >&2
  exit 1
fi

if ! rg -q '"role":"system"' "${request_body}" \
  || ! rg -q 'SA_INSTRUCTION_OK' "${request_body}" \
  || ! rg -q '"role":"user"' "${request_body}" \
  || ! rg -q '"model":"mimo-v2.5"' "${request_body}" \
  || ! rg -q '"tools":\[' "${request_body}" \
  || ! rg -q '"function":\{"name":"mcp__code_index__search"' "${request_body}" \
  || ! rg -q '"description":"Search index"' "${request_body}" \
  || ! rg -q '"parameters":\{"type":"object","properties":\{"q":\{"type":"string"\}\}\}' "${request_body}" \
  || ! rg -q '"function":\{"name":"exec_command"' "${request_body}" \
  || ! rg -q '"function":\{"name":"update_plan"' "${request_body}" \
  || ! rg -q '"function":\{"name":"get_goal"' "${request_body}" \
  || ! rg -q '"function":\{"name":"custom_search"' "${request_body}" \
  || ! rg -q '"description":"Search docs"' "${request_body}" \
  || ! rg -q '"parameters":\{"type":"object","properties":\{"query":\{"type":"string"\}\}\}' "${request_body}" \
  || ! rg -q '"strict":true' "${request_body}" \
  || ! rg -q '"function":\{"name":"custom_read"' "${request_body}" \
  || ! rg -q '"description":"Read docs"' "${request_body}" \
  || ! rg -q '"parameters":\{"type":"object","properties":\{"path":\{"type":"string"\}\}\}' "${request_body}" \
  || ! rg -q '"strict":false' "${request_body}"; then
  echo "captured fallback chat request missing expected fields" >&2
  cat "${request_body}" >&2
  exit 1
fi

if rg -q 'web_search|external_web_access' "${request_body}"; then
  echo "captured fallback chat request leaked non-function tool" >&2
  cat "${request_body}" >&2
  exit 1
fi

echo "responses_fallback_capture_ok"
