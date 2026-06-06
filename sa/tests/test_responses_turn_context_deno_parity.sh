#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
sa_dir="$(cd "${script_dir}/.." && pwd)"
hub_port="${SA_TEST_PROXY_PORT:-28184}"
upstream_port="${SA_TEST_UPSTREAM_PORT:-28185}"
server_log="$(mktemp)"
hub_log="$(mktemp)"
tmp_dir="$(mktemp -d)"
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
  rm -f "${server_log}" "${hub_log}"
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
chat_sse = "\n".join([
    'data: {"choices":[{"delta":{"content":"Let me check the test failure details and run a focused check."},"finish_reason":null}]}',
    "",
    'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}',
    "",
    "data: [DONE]",
    "",
]).encode("utf-8")

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
            self.send_response(200)
            self.send_header("content-type", "text/event-stream")
            self.send_header("content-length", str(len(chat_sse)))
            self.end_headers()
            self.wfile.write(chat_sse)
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
AUTH=test-secret
CHAT_BASE_URL=http://127.0.0.1:${upstream_port}/v1
RESPONSES_BASE_URL=http://127.0.0.1:${upstream_port}/v1
DEFAULT_MODEL=models/mimo-v2.5-pro
OPENAI_API_KEY=test-key
DATA_DIR=/tmp/hubproxy-sa-turn-context-deno-parity
ENV

(
  cd "${tmp_dir}"
  exec "${sa_dir}/hubproxy" >"${hub_log}" 2>&1 < /dev/null
) &
hub_pid=$!

for _ in {1..80}; do
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
    -H 'authorization: Bearer test-secret' \
    -H 'content-type: application/json' \
    --data "$1" \
    "http://127.0.0.1:${hub_port}/rpc"
}

thread_response="$(rpc '{"jsonrpc":"2.0","id":1,"method":"thread/start","params":{"threadId":"thr_ctx_parity","model":"mimo-v2.5"}}')"
thread_id="$(python3 - "${thread_response}" <<'PY'
import json, sys
print(json.loads(sys.argv[1])["result"]["thread"]["id"])
PY
)"

goal_turn_response="$(rpc "{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"turn/start\",\"params\":{\"threadId\":\"${thread_id}\",\"input\":[],\"collaborationMode\":{\"mode\":\"goal\"}}}")"
goal_turn_id="$(python3 - "${goal_turn_response}" <<'PY'
import json, sys
turn = json.loads(sys.argv[1])["result"]["turn"]
assert turn.get("collaborationModeKind") == "goal", turn
print(turn["id"])
PY
)"

normal_turn_response="$(rpc "{\"jsonrpc\":\"2.0\",\"id\":3,\"method\":\"turn/start\",\"params\":{\"threadId\":\"${thread_id}\",\"input\":[]}}")"
normal_turn_id="$(python3 - "${normal_turn_response}" <<'PY'
import json, sys
turn = json.loads(sys.argv[1])["result"]["turn"]
assert turn.get("collaborationModeKind") is None, turn
print(turn["id"])
PY
)"

post_responses() {
  local body="$1"
  local out="$2"
  shift 2
  curl -sS --max-time 20 \
    -H 'authorization: Bearer test-secret' \
    -H 'content-type: application/json' \
    "$@" \
    --data "${body}" \
    "http://127.0.0.1:${hub_port}/v1/responses" >"${out}"
}

assert_injects() {
  local file="$1"
  if ! rg -q '"name":"exec_command"' "${file}" || ! rg -q 'Progress-only message received in chat fallback' "${file}"; then
    echo "expected continuation injection in ${file}" >&2
    cat "${file}" >&2
    exit 1
  fi
}

assert_no_injection() {
  local file="$1"
  if rg -q '"name":"exec_command"|Progress-only message received in chat fallback' "${file}"; then
    echo "unexpected continuation injection in ${file}" >&2
    cat "${file}" >&2
    exit 1
  fi
}

base_body='{"model":"models/mimo-v2.5-pro","stream":true,"tools":[{"type":"function","name":"exec_command","parameters":{}}],"input":[{"type":"message","role":"user","content":[{"type":"input_text","text":"hello"}]}]}'

post_responses "${base_body}" "${tmp_dir}/stored_goal.sse" -H "thread-id: ${thread_id}" -H "turn-id: ${goal_turn_id}"
assert_injects "${tmp_dir}/stored_goal.sse"

post_responses "${base_body}" "${tmp_dir}/stored_normal.sse" -H "thread-id: ${thread_id}" -H "turn-id: ${normal_turn_id}"
assert_no_injection "${tmp_dir}/stored_normal.sse"

post_responses "${base_body}" "${tmp_dir}/stale_turn.sse" -H "thread-id: ${thread_id}" -H 'turn-id: 999999'
assert_no_injection "${tmp_dir}/stale_turn.sse"

plan_body='{"model":"models/mimo-v2.5-pro","instructions":"# Plan Mode (Conversational)\nYou are in **Plan Mode**.","stream":true,"tools":[{"type":"function","name":"exec_command","parameters":{}}],"input":[{"type":"message","role":"user","content":[{"type":"input_text","text":"hello"}]}]}'
post_responses "${plan_body}" "${tmp_dir}/request_plan.sse" -H 'thread-id: missing_plan_state'
assert_no_injection "${tmp_dir}/request_plan.sse"

goal_context_body='{"model":"models/mimo-v2.5-pro","stream":true,"tools":[{"type":"function","name":"exec_command","parameters":{}}],"input":[{"type":"message","role":"developer","content":[{"type":"input_text","text":"<goal_context>Continue working toward the active thread goal.</goal_context>"}]}]}'
post_responses "${goal_context_body}" "${tmp_dir}/request_goal_context.sse" -H 'thread-id: missing_goal_state'
assert_injects "${tmp_dir}/request_goal_context.sse"

code_metadata_body='{"model":"models/mimo-v2.5-pro","stream":true,"client_metadata":{"mode":" code "},"tools":[{"type":"function","name":"exec_command","parameters":{}}],"input":[{"type":"message","role":"user","content":[{"type":"input_text","text":"hello"}]}]}'
post_responses "${code_metadata_body}" "${tmp_dir}/request_code_metadata.sse" -H 'thread-id: missing_code_state'
assert_injects "${tmp_dir}/request_code_metadata.sse"

default_over_plan_body='{"model":"models/mimo-v2.5-pro","stream":true,"tools":[{"type":"function","name":"exec_command","parameters":{}}],"input":[{"type":"message","role":"developer","content":[{"type":"input_text","text":"<collaboration_mode># Plan Mode (Conversational)</collaboration_mode>"}]},{"type":"message","role":"assistant","content":[{"type":"output_text","text":"PLAN_OK"}]},{"type":"message","role":"developer","content":[{"type":"input_text","text":"<collaboration_mode># Collaboration Mode: Default</collaboration_mode>"}]},{"type":"message","role":"user","content":[{"type":"input_text","text":"hello"}]}]}'
post_responses "${default_over_plan_body}" "${tmp_dir}/request_default_over_plan.sse" -H 'thread-id: missing_default_state'
assert_injects "${tmp_dir}/request_default_over_plan.sse"

collaboration_mode_body='{"model":"models/mimo-v2.5-pro","stream":true,"collaboration_mode":{"kind":" goal "},"tools":[{"type":"function","name":"exec_command","parameters":{}}],"input":[{"type":"message","role":"user","content":[{"type":"input_text","text":"hello"}]}]}'
post_responses "${collaboration_mode_body}" "${tmp_dir}/request_collaboration_mode.sse" -H 'thread-id: missing_collab_state'
assert_injects "${tmp_dir}/request_collaboration_mode.sse"

echo "responses_turn_context_deno_parity_ok"
