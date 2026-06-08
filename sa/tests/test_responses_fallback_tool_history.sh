#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
sa_dir="$(cd "${script_dir}/.." && pwd)"
project_dir="$(cd "${sa_dir}/.." && pwd)"
source "${script_dir}/lib/runtime_env.sh"
env_file="${project_dir}/.env"
tmp_dir="$(mktemp -d)"
server_log="$(mktemp)"
capture_body="$(mktemp)"
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
  rm -f "${server_log}" "${capture_body}" "${response_body}"
}
trap cleanup EXIT

sa_test_assert_port_free "${hub_port}"
sa_test_assert_port_free "${upstream_port}"

python3 - "${capture_body}" "${upstream_port}" <<'PY' >"${server_log}" 2>&1 &
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
  -H "authorization: Bearer ${auth}" \
  -H 'content-type: application/json' \
  --data '{"model":"models/mimo-v2.5-pro","stream":false,"tools":[{"type":"function","name":"exec_command","parameters":{"type":"object","properties":{}}}],"input":[{"type":"function_call","call_id":"call-1","name":"exec_command","arguments":"{\"cmd\":\"echo hi\"}"},{"type":"function_call_output","call_id":"call-1","output":"ok"}]}' \
  "http://127.0.0.1:${hub_port}/v1/responses" >"${response_body}"

if ! rg -q '"output_text":"captured"' "${response_body}"; then
  echo "fallback response did not return normalized mock chat content" >&2
  cat "${response_body}" >&2
  exit 1
fi

python3 - "${capture_body}" <<'PY'
import json
import sys

with open(sys.argv[1], encoding="utf-8") as f:
    body = json.load(f)

if "input" in body:
    raise SystemExit(f"fallback leaked responses input: {body}")
messages = body.get("messages") or []
tools = body.get("tools") or []
assistant = messages[0] if len(messages) > 0 else {}
tool_message = messages[1] if len(messages) > 1 else {}
tool_call = (assistant.get("tool_calls") or [{}])[0]
function = tool_call.get("function") or {}
if assistant.get("role") != "assistant":
    raise SystemExit(f"missing assistant tool-call message: {body}")
if tool_call.get("id") != "call-1":
    raise SystemExit(f"wrong tool call id: {body}")
if function.get("name") != "exec_command":
    raise SystemExit(f"wrong function name: {body}")
if json.loads(function.get("arguments") or "{}").get("cmd") != "echo hi":
    raise SystemExit(f"arguments were not preserved: {body}")
if tool_message.get("role") != "tool":
    raise SystemExit(f"missing tool result message: {body}")
if tool_message.get("tool_call_id") != "call-1":
    raise SystemExit(f"wrong tool result id: {body}")
if tool_message.get("name") != "exec_command":
    raise SystemExit(f"tool result name was not preserved: {body}")
if tool_message.get("content") != "ok":
    raise SystemExit(f"tool result content was not preserved: {body}")
if not tools or tools[0].get("type") != "function":
    raise SystemExit(f"missing fallback chat tools: {body}")
if (tools[0].get("function") or {}).get("name") != "exec_command":
    raise SystemExit(f"wrong fallback tool name: {body}")
PY

echo "responses_fallback_tool_history_ok"
