#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
sa_dir="$(cd "${script_dir}/.." && pwd)"
hub_port="${SA_TEST_PROXY_PORT:-28282}"
upstream_port="${SA_TEST_UPSTREAM_PORT:-28283}"
tmp_dir="$(mktemp -d)"
server_log="$(mktemp)"
hub_log="$(mktemp)"
request_body="$(mktemp)"
response_body="$(mktemp)"
server_pid=""
hub_pid=""

cleanup() {
  if [[ -n "${hub_pid}" ]]; then
    kill "${hub_pid}" 2>/dev/null || true
    wait "${hub_pid}" 2>/dev/null || true
  fi
  if [[ -n "${server_pid}" ]]; then
    kill "${server_pid}" 2>/dev/null || true
    wait "${server_pid}" 2>/dev/null || true
  fi
  rm -rf "${tmp_dir}"
  rm -f "${server_log}" "${hub_log}" "${request_body}" "${response_body}"
}
trap cleanup EXIT

if ss -ltn | rg -q "(:${hub_port}|:${upstream_port})\b"; then
  echo "test ports already in use: hub=${hub_port}, upstream=${upstream_port}" >&2
  exit 1
fi

REQ_CAPTURE="${request_body}" UPSTREAM_PORT="${upstream_port}" python3 <<'PY' >"${server_log}" 2>&1 &
import http.server
import os
import sys

capture_path = os.environ["REQ_CAPTURE"]
port = int(os.environ["UPSTREAM_PORT"])

class Handler(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        length = int(self.headers.get("content-length", "0"))
        body = self.rfile.read(length).decode("utf-8", "replace")
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

for _ in {1..50}; do
  if ss -ltn | rg -q "127\.0\.0\.1:${upstream_port}"; then
    break
  fi
  sleep 0.1
done

cat >"${tmp_dir}/.env" <<ENV
SA_PORT=${hub_port}
PORT=${hub_port}
AUTH=test-secret
CHAT_BASE_URL=http://127.0.0.1:${upstream_port}/v1
RESPONSES_BASE_URL=http://127.0.0.1:${upstream_port}/v1
DEFAULT_MODEL=mimo-v2.5
OPENAI_API_KEY=test-key
DATA_DIR=/tmp/hubproxy-sa-chat-tools
ENV

(
  cd "${tmp_dir}"
  exec "${sa_dir}/hubproxy" >"${hub_log}" 2>&1 < /dev/null
) &
hub_pid=$!

for _ in {1..50}; do
  if ss -ltn | rg -q ":${hub_port} "; then
    break
  fi
  sleep 0.1
done
if ! ss -ltn | rg -q ":${hub_port} "; then
  echo "hubproxy did not start on ${hub_port}" >&2
  cat "${hub_log}" >&2 || true
  exit 1
fi

curl -sS --max-time 15 \
  -H 'authorization: Bearer test-secret' \
  -H 'content-type: application/json' \
  --data '{"model":"mimo-v2.5","messages":[{"role":"user","content":"hello"}],"store":true,"prompt_cache_key":"drop-me","include":["drop-me"],"reasoning":{"effort":"low"},"tools":[{"type":"namespace","name":"mcp__code_index__","tools":[{"type":"function","name":"search","description":"Search index","parameters":{"type":"object","properties":{"q":{"type":"string"}}}}]},{"type":"web_search","external_web_access":true},{"type":"function","name":"custom_search","description":"Search docs","parameters":{"type":"object","properties":{"query":{"type":"string"}}},"strict":true},{"type":"function","name":"custom_read","description":"Read docs","parameters":{"type":"object","properties":{"path":{"type":"string"}}},"strict":false},{"type":"function","name":"exec_command","parameters":{}},{"type":"function","name":"update_plan","parameters":{}},{"type":"function","name":"get_goal","parameters":{}}],"stream":false}' \
  "http://127.0.0.1:${hub_port}/v1/chat/completions" >"${response_body}"

if ! rg -q '"object":"chat.completion"' "${response_body}"; then
  echo "chat proxy did not return mock chat completion" >&2
  cat "${response_body}" >&2
  exit 1
fi

if ! rg -q '"model":"mimo-v2.5"' "${request_body}" \
  || ! rg -q '"messages":\[\{"role":"user","content":"hello"\}\]' "${request_body}" \
  || ! rg -q '"stream":false' "${request_body}" \
  || ! rg -q '"tools":\[' "${request_body}" \
  || ! rg -q '"function":\{"name":"mcp__code_index__search"' "${request_body}" \
  || ! rg -q '"description":"Search index"' "${request_body}" \
  || ! rg -q '"parameters":\{"type":"object","properties":\{"q":\{"type":"string"\}\}\}' "${request_body}" \
  || ! rg -q '"function":\{"name":"custom_search"' "${request_body}" \
  || ! rg -q '"description":"Search docs"' "${request_body}" \
  || ! rg -q '"parameters":\{"type":"object","properties":\{"query":\{"type":"string"\}\}\}' "${request_body}" \
  || ! rg -q '"strict":true' "${request_body}" \
  || ! rg -q '"function":\{"name":"custom_read"' "${request_body}" \
  || ! rg -q '"strict":false' "${request_body}" \
  || ! rg -q '"function":\{"name":"exec_command"' "${request_body}" \
  || ! rg -q '"function":\{"name":"update_plan"' "${request_body}" \
  || ! rg -q '"function":\{"name":"get_goal"' "${request_body}"; then
  echo "captured chat request missing expected normalized fields" >&2
  cat "${request_body}" >&2
  exit 1
fi

if rg -q 'web_search|external_web_access|prompt_cache_key|reasoning|include|store' "${request_body}"; then
  echo "captured chat request leaked fields that should be removed" >&2
  cat "${request_body}" >&2
  exit 1
fi

echo "chat_tools_capture_ok"
