#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_dir="$(cd "${script_dir}/../.." && pwd)"
sa_bin="${SA_BIN:-sa}"

tmp_root="$(mktemp -d /tmp/hubproxy-thread-rpc.XXXXXX)"
work_dir="${tmp_root}/work"
data_dir="${tmp_root}/data"
server_log="${tmp_root}/hubproxy.log"
bin_path="${tmp_root}/hubproxy"
start_body="${tmp_root}/thread-start.json"
list_body="${tmp_root}/thread-list.json"
read_body="${tmp_root}/thread-read.json"
turn_start_body="${tmp_root}/turn-start.json"
resume_body="${tmp_root}/thread-resume.json"
rollback_body="${tmp_root}/thread-rollback.json"
archive_body="${tmp_root}/thread-archive.json"
list_archived_body="${tmp_root}/thread-list-archived.json"
unarchive_body="${tmp_root}/thread-unarchive.json"
memory_reset_body="${tmp_root}/memory-reset.json"
list_reset_body="${tmp_root}/thread-list-reset.json"
hub_pid=""

cleanup() {
  if [[ -n "${hub_pid}" ]]; then
    kill "${hub_pid}" 2>/dev/null || true
    wait "${hub_pid}" 2>/dev/null || true
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

mkdir -p "${work_dir}" "${data_dir}"

cat >"${work_dir}/.env" <<ENV
HOST=127.0.0.1
PORT=${proxy_port}
AUTH=local-secret
CHAT_BASE_URL=http://127.0.0.1:9/v1
DEFAULT_MODEL=gpt-4.1
OPENAI_API_KEY=sk-thread-rpc
DATA_DIR=${data_dir}
ENV

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

rpc_call() {
  local payload="$1"
  local output_file="$2"
  local expected_status="$3"
  local status
  status="$(curl -sS --max-time 15 -o "${output_file}" -w '%{http_code}' \
    -H 'authorization: Bearer local-secret' \
    -H 'content-type: application/json' \
    --data "${payload}" \
    "http://127.0.0.1:${proxy_port}/rpc")"
  if [[ "${status}" != "${expected_status}" ]]; then
    echo "${payload} returned ${status}, expected ${expected_status}" >&2
    cat "${output_file}" >&2 || true
    cat "${server_log}" >&2 || true
    exit 1
  fi
}

rpc_call '{"jsonrpc":"2.0","id":"thread-start-live","method":"thread/start","params":{"threadId":"live-thread","model":"gpt-live","modelProvider":"openai","cwd":"/tmp/live-cwd","ephemeral":false,"approvalPolicy":"never","approvalsReviewer":"user","sandbox":"danger-full-access"}}' "${start_body}" 200
rpc_call '{"jsonrpc":"2.0","id":"thread-list-live","method":"thread/list","params":{}}' "${list_body}" 200
rpc_call '{"jsonrpc":"2.0","id":"thread-read-live","method":"thread/read","params":{"threadId":"live-thread","includeTurns":true}}' "${read_body}" 200
rpc_call '{"jsonrpc":"2.0","id":"turn-start-live","method":"turn/start","params":{"threadId":"live-thread","input":[{"type":"message","role":"user","content":"hello live"}],"collaborationMode":{"mode":" Goal\t"}}}' "${turn_start_body}" 200
rpc_call '{"jsonrpc":"2.0","id":"thread-resume-live","method":"thread/resume","params":{"threadId":"live-thread","approvalPolicy":"never","approvalsReviewer":"user","sandbox":"danger-full-access"}}' "${resume_body}" 200
rpc_call '{"jsonrpc":"2.0","id":"thread-rollback-live","method":"thread/rollback","params":{"threadId":"live-thread","numTurns":1}}' "${rollback_body}" 200
rpc_call '{"jsonrpc":"2.0","id":"thread-archive-live","method":"thread/archive","params":{"threadId":"live-thread"}}' "${archive_body}" 200
rpc_call '{"jsonrpc":"2.0","id":"thread-list-archived-live","method":"thread/list","params":{}}' "${list_archived_body}" 200
rpc_call '{"jsonrpc":"2.0","id":"thread-unarchive-live","method":"thread/unarchive","params":{"threadId":"live-thread"}}' "${unarchive_body}" 200
rpc_call '{"jsonrpc":"2.0","id":"memory-reset-live","method":"memory/reset","params":{"threadId":"live-thread"}}' "${memory_reset_body}" 200
rpc_call '{"jsonrpc":"2.0","id":"thread-list-reset-live","method":"thread/list","params":{}}' "${list_reset_body}" 200

START_BODY="${start_body}" \
LIST_BODY="${list_body}" \
READ_BODY="${read_body}" \
TURN_START_BODY="${turn_start_body}" \
RESUME_BODY="${resume_body}" \
ROLLBACK_BODY="${rollback_body}" \
ARCHIVE_BODY="${archive_body}" \
LIST_ARCHIVED_BODY="${list_archived_body}" \
UNARCHIVE_BODY="${unarchive_body}" \
MEMORY_RESET_BODY="${memory_reset_body}" \
LIST_RESET_BODY="${list_reset_body}" \
python3 - <<'PY'
import json
import os
from pathlib import Path


def load_env_json(name):
    with Path(os.environ[name]).open("r", encoding="utf-8") as f:
        return json.load(f)


def assert_envelope(doc, request_id):
    assert doc["jsonrpc"] == "2.0", doc
    assert doc["id"] == request_id, doc


def assert_thread_object(thread, turns_expected=None):
    assert thread["id"] == "live-thread", thread
    assert thread["sessionId"] == "live-thread", thread
    assert thread["model"] == "gpt-live", thread
    assert thread["modelProvider"] == "openai", thread
    assert thread["cwd"] == "/tmp/live-cwd", thread
    assert thread["ephemeral"] is False, thread
    assert thread["forkedFromId"] is None, thread
    assert thread["gitInfo"] is None, thread
    assert thread["name"] is None, thread
    assert thread["createdAt"], thread
    assert thread["updatedAt"], thread
    assert thread["status"] == {"type": "idle"}, thread
    assert thread["path"] is None, thread
    assert thread["cliVersion"] == "hubproxy-sa", thread
    assert thread["source"] == "app_server", thread
    if turns_expected is not None:
        assert thread["turns"] == turns_expected, thread


start = load_env_json("START_BODY")
assert_envelope(start, "thread-start-live")
start_result = start["result"]
assert start_result["model"] == "gpt-live", start_result
assert start_result["modelProvider"] == "openai", start_result
assert start_result["serviceTier"] is None, start_result
assert start_result["cwd"] == "/tmp/live-cwd", start_result
assert start_result["instructionSources"] == [], start_result
assert start_result["approvalPolicy"] == "never", start_result
assert start_result["approvalsReviewer"] == "user", start_result
assert start_result["sandbox"] == "danger-full-access", start_result
assert start_result["reasoningEffort"] is None, start_result
assert start_result["activePermissionProfile"] is None, start_result
assert_thread_object(start_result["thread"], [])
assert "error" not in start, start

listed = load_env_json("LIST_BODY")
assert_envelope(listed, "thread-list-live")
listed_result = listed["result"]
assert listed_result["nextCursor"] is None, listed_result
assert listed_result["backwardsCursor"] is None, listed_result
assert len(listed_result["data"]) == 1, listed_result
assert_thread_object(listed_result["data"][0], [])

read = load_env_json("READ_BODY")
assert_envelope(read, "thread-read-live")
assert_thread_object(read["result"]["thread"], [])

turn_started = load_env_json("TURN_START_BODY")
assert_envelope(turn_started, "turn-start-live")
turn = turn_started["result"]["turn"]
turn_id = turn["id"]
assert isinstance(turn_id, str) and turn_id, turn
assert turn["status"] == "inProgress", turn
assert turn["collaborationModeKind"] == "goal", turn
assert turn["completedAt"] is None, turn
assert turn["items"] == [{"type": "message", "role": "user", "content": "hello live"}], turn

resumed = load_env_json("RESUME_BODY")
assert_envelope(resumed, "thread-resume-live")
resume_result = resumed["result"]
assert resume_result["approvalPolicy"] == "never", resume_result
assert resume_result["approvalsReviewer"] == "user", resume_result
assert resume_result["sandbox"] == "danger-full-access", resume_result
assert_thread_object(resume_result["thread"])
resume_turns = resume_result["thread"]["turns"]
assert len(resume_turns) == 1, resume_turns
assert resume_turns[0]["id"] == turn_id, resume_turns
assert resume_turns[0]["collaborationModeKind"] == "goal", resume_turns
assert resume_turns[0]["items"] == turn["items"], resume_turns

rolled_back = load_env_json("ROLLBACK_BODY")
assert_envelope(rolled_back, "thread-rollback-live")
assert_thread_object(rolled_back["result"]["thread"], [])

archived = load_env_json("ARCHIVE_BODY")
assert_envelope(archived, "thread-archive-live")
assert archived["result"] == {"archived": True, "threadId": "live-thread"}, archived

listed_archived = load_env_json("LIST_ARCHIVED_BODY")
assert_envelope(listed_archived, "thread-list-archived-live")
assert listed_archived["result"]["data"] == [], listed_archived
assert listed_archived["result"]["nextCursor"] is None, listed_archived
assert listed_archived["result"]["backwardsCursor"] is None, listed_archived

unarchived = load_env_json("UNARCHIVE_BODY")
assert_envelope(unarchived, "thread-unarchive-live")
assert_thread_object(unarchived["result"]["thread"], [])

memory_reset = load_env_json("MEMORY_RESET_BODY")
assert_envelope(memory_reset, "memory-reset-live")
assert memory_reset["result"] == {"reset": True, "threadId": "live-thread"}, memory_reset

listed_reset = load_env_json("LIST_RESET_BODY")
assert_envelope(listed_reset, "thread-list-reset-live")
assert listed_reset["result"]["data"] == [], listed_reset
assert listed_reset["result"]["nextCursor"] is None, listed_reset
assert listed_reset["result"]["backwardsCursor"] is None, listed_reset
PY

echo "thread_rpc_transport_runtime_isolated_ok"
