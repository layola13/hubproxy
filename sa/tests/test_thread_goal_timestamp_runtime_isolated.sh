#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_dir="$(cd "${script_dir}/../.." && pwd)"
sa_bin="${SA_BIN:-sa}"

tmp_root="$(mktemp -d /tmp/hubproxy-thread-goal-timestamps.XXXXXX)"
work_dir="${tmp_root}/work"
data_dir="${tmp_root}/data"
server_log="${tmp_root}/hubproxy.log"
bin_path="${tmp_root}/hubproxy"
capture_file="${tmp_root}/events-capture.txt"
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
OPENAI_API_KEY=sk-thread-goal-timestamps
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

PROXY_PORT="${proxy_port}" CAPTURE_FILE="${capture_file}" python3 - <<'PY'
import http.client
import json
import os
import threading
import time
from pathlib import Path

port = int(os.environ["PROXY_PORT"])
capture_file = Path(os.environ["CAPTURE_FILE"])
headers = {"authorization": "Bearer local-secret"}

buf = bytearray()
buf_lock = threading.Lock()
reader_error = []
stop_reading = threading.Event()


def snapshot() -> bytes:
    with buf_lock:
        return bytes(buf)


def reader(resp):
    try:
        while not stop_reading.is_set():
            chunk = resp.read(1)
            if not chunk:
                break
            with buf_lock:
                buf.extend(chunk)
    except Exception as exc:
        if not stop_reading.is_set():
            reader_error.append(repr(exc))


def wait_for(predicate, label, timeout=10.0):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        data = snapshot()
        if predicate(data):
            return data
        if reader_error:
            raise AssertionError(f"SSE reader failed while waiting for {label}: {reader_error}")
        time.sleep(0.05)
    data = snapshot()
    capture_file.write_bytes(data)
    raise AssertionError(f"timed out waiting for {label}; captured {len(data)} bytes")


def rpc_call(payload):
    conn = http.client.HTTPConnection("127.0.0.1", port, timeout=10)
    body = json.dumps(payload, separators=(",", ":"))
    conn.request(
        "POST",
        "/rpc",
        body=body,
        headers={
            "authorization": "Bearer local-secret",
            "content-type": "application/json",
        },
    )
    resp = conn.getresponse()
    raw = resp.read().decode("utf-8")
    status = resp.status
    conn.close()
    assert status == 200, (payload, status, raw)
    return json.loads(raw)


def assert_envelope(doc, request_id):
    assert doc["jsonrpc"] == "2.0", doc
    assert doc["id"] == request_id, doc
    assert "error" not in doc, doc


def parse_frames(raw):
    frames = []
    for part in raw.decode("utf-8", errors="replace").split("\n\n"):
        if not part or part.startswith(":"):
            continue
        event = None
        payload = None
        for line in part.split("\n"):
            if line.startswith("event: "):
                event = line[len("event: ") :]
            elif line.startswith("data: "):
                payload = line[len("data: ") :]
        if event and payload:
            frames.append((event, json.loads(payload)))
    return frames


events_conn = http.client.HTTPConnection("127.0.0.1", port, timeout=10)
events_conn.request("GET", "/events", headers=headers)
events_resp = events_conn.getresponse()
assert events_resp.status == 200, (events_resp.status, events_resp.read(200))
content_type = events_resp.getheader("content-type") or ""
assert "text/event-stream" in content_type, content_type

thread = threading.Thread(target=reader, args=(events_resp,), daemon=True)
thread.start()

wait_for(lambda data: data.count(b": keepalive\n\n") >= 2, "initial keepalives")
time.sleep(0.15)

start = rpc_call(
    {
        "jsonrpc": "2.0",
        "id": "timestamp-thread-start",
        "method": "thread/start",
        "params": {
            "threadId": "timestamp-thread",
            "model": "gpt-timestamp",
            "modelProvider": "openai",
            "cwd": "/tmp/timestamp-cwd",
            "ephemeral": False,
        },
    }
)
assert_envelope(start, "timestamp-thread-start")
assert start["result"]["thread"]["id"] == "timestamp-thread", start

goal_first = rpc_call(
    {
        "jsonrpc": "2.0",
        "id": "goal-set-first-live",
        "method": "thread/goal/set",
        "params": {
            "threadId": "timestamp-thread",
            "status": "active",
            "objective": "first objective",
            "tokenBudget": 123,
        },
    }
)
assert_envelope(goal_first, "goal-set-first-live")
first_goal = goal_first["result"]["goal"]
assert first_goal["threadId"] == "timestamp-thread", first_goal
assert first_goal["objective"] == "first objective", first_goal
assert first_goal["status"] == "active", first_goal
assert first_goal["tokenBudget"] == 123, first_goal
assert first_goal["tokensUsed"] == 0, first_goal
assert first_goal["timeUsedSeconds"] == 0, first_goal
assert isinstance(first_goal["createdAt"], int), first_goal
assert isinstance(first_goal["updatedAt"], int), first_goal
assert first_goal["createdAt"] == first_goal["updatedAt"], first_goal

time.sleep(1.2)

goal_second = rpc_call(
    {
        "jsonrpc": "2.0",
        "id": "goal-set-second-live",
        "method": "thread/goal/set",
        "params": {
            "threadId": "timestamp-thread",
            "status": "customLive",
            "objective": "second objective",
            "tokenBudget": 456,
        },
    }
)
assert_envelope(goal_second, "goal-set-second-live")
second_goal = goal_second["result"]["goal"]
assert second_goal["threadId"] == "timestamp-thread", second_goal
assert second_goal["objective"] == "second objective", second_goal
assert second_goal["status"] == "customLive", second_goal
assert second_goal["tokenBudget"] == 456, second_goal
assert second_goal["createdAt"] == first_goal["createdAt"], (first_goal, second_goal)
assert second_goal["updatedAt"] > first_goal["updatedAt"], (first_goal, second_goal)

goal_read = rpc_call(
    {
        "jsonrpc": "2.0",
        "id": "goal-get-live",
        "method": "thread/goal/get",
        "params": {"threadId": "timestamp-thread"},
    }
)
assert_envelope(goal_read, "goal-get-live")
read_goal = goal_read["result"]["goal"]
assert read_goal == second_goal, (read_goal, second_goal)

turn_start = rpc_call(
    {
        "jsonrpc": "2.0",
        "id": "turn-start-timestamps-live",
        "method": "turn/start",
        "params": {
            "threadId": "timestamp-thread",
            "input": [{"type": "message", "role": "user", "content": "timestamp hello"}],
            "collaborationMode": {"mode": "plan"},
        },
    }
)
assert_envelope(turn_start, "turn-start-timestamps-live")
turn = turn_start["result"]["turn"]
turn_id = turn["id"]
assert isinstance(turn_id, str) and turn_id, turn
assert turn["status"] == "inProgress", turn
assert turn["collaborationModeKind"] == "plan", turn
assert isinstance(turn["createdAt"], int), turn
assert isinstance(turn["updatedAt"], int), turn
assert turn["createdAt"] == turn["updatedAt"], turn
assert turn["completedAt"] is None, turn

thread_read_before_interrupt = rpc_call(
    {
        "jsonrpc": "2.0",
        "id": "thread-read-before-interrupt-live",
        "method": "thread/read",
        "params": {"threadId": "timestamp-thread", "includeTurns": True},
    }
)
assert_envelope(thread_read_before_interrupt, "thread-read-before-interrupt-live")
read_turns = thread_read_before_interrupt["result"]["thread"]["turns"]
assert len(read_turns) == 1, read_turns
read_turn = read_turns[0]
assert read_turn["id"] == turn_id, (read_turn, turn)
assert read_turn["createdAt"] == turn["createdAt"], (read_turn, turn)
assert read_turn["updatedAt"] == turn["updatedAt"], (read_turn, turn)
assert read_turn["completedAt"] is None, read_turn

time.sleep(1.2)

interrupt = rpc_call(
    {
        "jsonrpc": "2.0",
        "id": "turn-interrupt-timestamps-live",
        "method": "turn/interrupt",
        "params": {"threadId": "timestamp-thread", "turnId": int(turn_id)},
    }
)
assert_envelope(interrupt, "turn-interrupt-timestamps-live")
assert interrupt["result"] == {
    "interrupted": True,
    "threadId": "timestamp-thread",
    "turnId": turn_id,
}, interrupt

thread_read_after_interrupt = rpc_call(
    {
        "jsonrpc": "2.0",
        "id": "thread-read-after-interrupt-live",
        "method": "thread/read",
        "params": {"threadId": "timestamp-thread", "includeTurns": True},
    }
)
assert_envelope(thread_read_after_interrupt, "thread-read-after-interrupt-live")
after_turns = thread_read_after_interrupt["result"]["thread"]["turns"]
assert len(after_turns) == 1, after_turns
after_turn = after_turns[0]
assert after_turn["id"] == turn_id, after_turn
assert after_turn["status"] == "interrupted", after_turn
assert after_turn["createdAt"] == turn["createdAt"], (after_turn, turn)
assert after_turn["completedAt"] is not None, after_turn
assert after_turn["updatedAt"] == after_turn["completedAt"], after_turn
assert after_turn["completedAt"] > turn["createdAt"], (after_turn, turn)

data = wait_for(
    lambda raw: b"event: thread/goal/updated" in raw and b"event: turn/completed" in raw,
    "goal updated and turn completed events",
)

stop_reading.set()
events_resp.close()
events_conn.close()
thread.join(timeout=1.0)
capture_file.write_bytes(data)

frames = parse_frames(data)
goal_events = [payload for event, payload in frames if event == "thread/goal/updated"]
assert len(goal_events) >= 2, goal_events
latest_goal_event = next(
    payload
    for payload in reversed(goal_events)
    if payload["params"]["goal"]["objective"] == "second objective"
)
assert latest_goal_event["method"] == "thread/goal/updated", latest_goal_event
assert latest_goal_event["params"]["threadId"] == "timestamp-thread", latest_goal_event
event_goal = latest_goal_event["params"]["goal"]
assert event_goal["threadId"] == "timestamp-thread", event_goal
assert event_goal["status"] == "customLive", event_goal
assert event_goal["createdAt"] == second_goal["createdAt"], (event_goal, second_goal)
assert event_goal["updatedAt"] == second_goal["updatedAt"], (event_goal, second_goal)
assert "turnId" not in latest_goal_event["params"], latest_goal_event

turn_completed_events = [payload for event, payload in frames if event == "turn/completed"]
assert turn_completed_events, frames
turn_completed = turn_completed_events[-1]
assert turn_completed["method"] == "turn/completed", turn_completed
assert turn_completed["params"]["threadId"] == "timestamp-thread", turn_completed
event_turn = turn_completed["params"]["turn"]
assert event_turn["id"] == turn_id, event_turn
assert event_turn["status"] == "interrupted", event_turn
assert event_turn["createdAt"] == after_turn["createdAt"], (event_turn, after_turn)
assert event_turn["updatedAt"] == after_turn["updatedAt"], (event_turn, after_turn)
assert event_turn["completedAt"] == after_turn["completedAt"], (event_turn, after_turn)

goal_null_budget = rpc_call(
    {
        "jsonrpc": "2.0",
        "id": "goal-set-null-budget-live",
        "method": "thread/goal/set",
        "params": {
            "threadId": "timestamp-thread",
            "status": "budgetLimited",
            "objective": "null budget objective",
            "tokenBudget": None,
        },
    }
)
assert_envelope(goal_null_budget, "goal-set-null-budget-live")
null_budget_goal = goal_null_budget["result"]["goal"]
assert null_budget_goal["threadId"] == "timestamp-thread", null_budget_goal
assert null_budget_goal["status"] == "budgetLimited", null_budget_goal
assert null_budget_goal["objective"] == "null budget objective", null_budget_goal
assert null_budget_goal["tokenBudget"] is None, null_budget_goal

goal_string_budget = rpc_call(
    {
        "jsonrpc": "2.0",
        "id": "goal-set-string-budget-live",
        "method": "thread/goal/set",
        "params": {
            "threadId": "timestamp-thread",
            "status": "usageLimited",
            "objective": "string budget objective",
            "tokenBudget": "789",
        },
    }
)
assert_envelope(goal_string_budget, "goal-set-string-budget-live")
string_budget_goal = goal_string_budget["result"]["goal"]
assert string_budget_goal["threadId"] == "timestamp-thread", string_budget_goal
assert string_budget_goal["status"] == "usageLimited", string_budget_goal
assert string_budget_goal["objective"] == "string budget objective", string_budget_goal
assert string_budget_goal["tokenBudget"] is None, string_budget_goal
PY

echo "thread_goal_timestamp_runtime_isolated_ok"
