#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
sa_dir="$(cd "${script_dir}/.." && pwd)"
hub_port="${SA_TEST_PROXY_PORT:-28238}"
upstream_port="${SA_TEST_UPSTREAM_PORT:-28239}"
server_log="$(mktemp)"
hub_log="$(mktemp)"
tmp_dir="$(mktemp -d)"
goal_body="$(mktemp)"
normal_body="$(mktemp)"
stale_body="$(mktemp)"
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
  rm -f "${server_log}" "${hub_log}" "${goal_body}" "${normal_body}" "${stale_body}"
  rm -rf "${tmp_dir}"
}
trap cleanup EXIT

if ss -ltn | rg -q "(:${hub_port}|:${upstream_port})\\b"; then
  echo "test ports already in use: hub=${hub_port}, upstream=${upstream_port}" >&2
  exit 1
fi

UPSTREAM_PORT="${upstream_port}" python3 <<'PY' >"${server_log}" 2>&1 &
import http.server
import os

port = int(os.environ["UPSTREAM_PORT"])

CHAT_SSE = "\n".join([
    'data: {"choices":[{"delta":{"content":"Let me check the test failure details and run a focused check."},"finish_reason":null}]}',
    "",
    'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}',
    "",
    "data: [DONE]",
    "",
])

class Handler(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        length = int(self.headers.get("content-length", "0"))
        self.rfile.read(length)
        if self.path == "/v1/responses":
            self.send_response(404)
            self.send_header("content-type", "text/plain")
            self.end_headers()
            self.wfile.write(b"responses unavailable")
            return
        if self.path == "/v1/chat/completions":
            payload = CHAT_SSE.encode("utf-8")
            self.send_response(200)
            self.send_header("content-type", "text/event-stream")
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

for _ in {1..50}; do
  if ss -ltn | rg -q "127\\.0\\.0\\.1:${upstream_port}"; then
    break
  fi
  sleep 0.1
done

cat >"${tmp_dir}/.env" <<ENV
SA_PORT=${hub_port}
PORT=${hub_port}
AUTH=client-secret
CHAT_BASE_URL=http://127.0.0.1:${upstream_port}/v1
RESPONSES_BASE_URL=http://127.0.0.1:${upstream_port}/v1
DEFAULT_MODEL=models/mimo-v2.5-pro
OPENAI_API_KEY=test-key
DATA_DIR=${tmp_dir}/data
ENV

(
  cd "${tmp_dir}"
  setsid "${sa_dir}/hubproxy" > "${hub_log}" 2>&1 < /dev/null &
  echo "$!" > "${tmp_dir}/hubproxy.pid"
)
hub_pid="$(cat "${tmp_dir}/hubproxy.pid")"

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

rpc() {
  curl -sS --max-time 15 \
    -H 'authorization: Bearer client-secret' \
    -H 'content-type: application/json' \
    --data "$1" \
    "http://127.0.0.1:${hub_port}/rpc"
}

thread_response="$(rpc '{"jsonrpc":"2.0","id":1,"method":"thread/start","params":{"threadId":"ignored-deno-string-id","model":"mimo-v2.5"}}')"
thread_id="$(python3 - "${thread_response}" <<'PY'
import json
import sys
print(json.loads(sys.argv[1])["result"]["thread"]["id"])
PY
)"

goal_turn_response="$(rpc "{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"turn/start\",\"params\":{\"threadId\":\"${thread_id}\",\"input\":[],\"collaborationMode\":{\"mode\":\"goal\"}}}")"
goal_turn_id="$(python3 - "${goal_turn_response}" <<'PY'
import json
import sys
turn = json.loads(sys.argv[1])["result"]["turn"]
if turn.get("collaborationModeKind") != "goal":
    raise SystemExit(f"goal mode not reflected in turn response: {turn}")
print(turn["id"])
PY
)"

normal_turn_response="$(rpc "{\"jsonrpc\":\"2.0\",\"id\":3,\"method\":\"turn/start\",\"params\":{\"threadId\":\"${thread_id}\",\"input\":[]}}")"
normal_turn_id="$(python3 - "${normal_turn_response}" <<'PY'
import json
import sys
turn = json.loads(sys.argv[1])["result"]["turn"]
if turn.get("collaborationModeKind") is not None:
    raise SystemExit(f"plain turn should keep null collaboration mode: {turn}")
print(turn["id"])
PY
)"

request_body='{"model":"models/mimo-v2.5-pro","stream":true,"tools":[{"type":"function","name":"exec_command","parameters":{}}],"input":[{"type":"message","role":"user","content":[{"type":"input_text","text":"hello"}]}]}'

curl -sS --max-time 15 \
  -H 'authorization: Bearer client-secret' \
  -H 'content-type: application/json' \
  -H "thread-id: ${thread_id}" \
  -H "turn-id: ${goal_turn_id}" \
  --data "${request_body}" \
  "http://127.0.0.1:${hub_port}/v1/responses" >"${goal_body}"

if ! rg -q '"name":"exec_command"' "${goal_body}"; then
  echo "goal turn context did not inject continuation tool" >&2
  cat "${goal_body}" >&2
  exit 1
fi
if ! rg -q 'Progress-only message received in chat fallback' "${goal_body}"; then
  echo "goal turn context injected wrong continuation payload" >&2
  cat "${goal_body}" >&2
  exit 1
fi

curl -sS --max-time 15 \
  -H 'authorization: Bearer client-secret' \
  -H 'content-type: application/json' \
  -H "thread-id: ${thread_id}" \
  -H "turn-id: ${normal_turn_id}" \
  --data "${request_body}" \
  "http://127.0.0.1:${hub_port}/v1/responses" >"${normal_body}"

if rg -q '"name":"exec_command"|Progress-only message received in chat fallback' "${normal_body}"; then
  echo "plain turn unexpectedly injected continuation tool" >&2
  cat "${normal_body}" >&2
  exit 1
fi

curl -sS --max-time 15 \
  -H 'authorization: Bearer client-secret' \
  -H 'content-type: application/json' \
  -H "thread-id: ${thread_id}" \
  -H 'turn-id: 999999' \
  --data "${request_body}" \
  "http://127.0.0.1:${hub_port}/v1/responses" >"${stale_body}"

if rg -q '"name":"exec_command"|Progress-only message received in chat fallback' "${stale_body}"; then
  echo "stale turn unexpectedly injected continuation tool" >&2
  cat "${stale_body}" >&2
  exit 1
fi

echo "responses_turn_context_goal_continuation_ok"
