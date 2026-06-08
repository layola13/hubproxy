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
  rm -f "${server_log}" "${response_body}"
}
trap cleanup EXIT

sa_test_assert_port_free "${hub_port}"
sa_test_assert_port_free "${upstream_port}"

python3 - "${upstream_port}" <<'PY' >"${server_log}" 2>&1 &
import http.server
import json
import sys

port = int(sys.argv[1])

BODY = json.dumps({
    "output": [
        {"id": "think_json", "type": "thinking", "text": "native json think"},
        {
            "id": "msg_json",
            "type": "message",
            "role": "assistant",
            "reasoning_content": "message json think",
            "content": [{"type": "output_text", "text": "answer"}],
        },
    ],
    "output_text": "answer",
    "status": "completed",
}, separators=(",", ":"))

class Handler(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        length = int(self.headers.get("content-length", "0"))
        self.rfile.read(length)
        if self.path == "/v1/responses":
            payload = BODY.encode("utf-8")
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
  --data '{"model":"models/mimo-v2.5-pro","stream":false,"input":[{"type":"message","role":"user","content":[{"type":"input_text","text":"hello"}]}]}' \
  "http://127.0.0.1:${hub_port}/v1/responses" >"${response_body}"

python3 - "${response_body}" <<'PY'
import json
import sys

body = json.load(open(sys.argv[1], encoding="utf-8"))
output = body.get("output") or []
if len(output) != 3:
    raise SystemExit(f"wrong output length: {body!r}")
if output[0].get("type") != "reasoning" or output[0].get("summary", [{}])[0].get("text") != "native json think":
    raise SystemExit(f"native thinking was not normalized: {output!r}")
if output[1].get("type") != "reasoning" or output[1].get("summary", [{}])[0].get("text") != "message json think":
    raise SystemExit(f"message reasoning_content was not extracted: {output!r}")
if output[2].get("type") != "message" or output[2].get("content", [{}])[0].get("text") != "answer":
    raise SystemExit(f"message output was not preserved: {output!r}")
if body.get("output_text") != "answer" or body.get("status") != "completed":
    raise SystemExit(f"response tail was not preserved: {body!r}")
raw = open(sys.argv[1], encoding="utf-8").read()
if '"type":"thinking"' in raw or '"reasoning_content"' in raw:
    raise SystemExit(f"raw thinking fields leaked: {raw}")
PY

echo "responses_native_thinking_json_ok"
