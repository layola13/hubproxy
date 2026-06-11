#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_dir="$(cd "${script_dir}/../.." && pwd)"
sa_bin="${SA_BIN:-sa}"

tmp_root="$(mktemp -d /tmp/hubproxy-events.XXXXXX)"
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
OPENAI_API_KEY=sk-events
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
    except Exception as exc:  # connection close is expected during cleanup
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
    conn = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
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


events_conn = http.client.HTTPConnection("127.0.0.1", port, timeout=10)
events_conn.request("GET", "/events", headers=headers)
events_resp = events_conn.getresponse()
assert events_resp.status == 200, (events_resp.status, events_resp.read(200))
content_type = events_resp.getheader("content-type") or ""
assert "text/event-stream" in content_type, content_type

thread = threading.Thread(target=reader, args=(events_resp,), daemon=True)
thread.start()

# Wait for at least two keepalives so the worker has entered its cursor-based loop.
wait_for(lambda data: data.count(b": keepalive\n\n") >= 2, "initial keepalives")
time.sleep(0.15)

start = rpc_call(
    {
        "jsonrpc": "2.0",
        "id": "events-thread-start",
        "method": "thread/start",
        "params": {
            "threadId": "event-thread",
            "model": "gpt-events",
            "modelProvider": "openai",
            "cwd": "/tmp/event-cwd",
            "ephemeral": False,
        },
    }
)
assert start["result"]["thread"]["id"] == "event-thread", start

turn = rpc_call(
    {
        "jsonrpc": "2.0",
        "id": "events-turn-start",
        "method": "turn/start",
        "params": {
            "threadId": "event-thread",
            "input": [{"type": "message", "role": "user", "content": "event hello"}],
            "collaborationMode": {"mode": "plan"},
        },
    }
)
turn_id = turn["result"]["turn"]["id"]
assert turn["result"]["turn"]["collaborationModeKind"] == "plan", turn

inject = rpc_call(
    {
        "jsonrpc": "2.0",
        "id": "events-thread-inject",
        "method": "thread/inject_items",
        "params": {
            "threadId": "event-thread",
            "items": [
                {"type": "message", "role": "user", "content": "injected live"}
            ],
        },
    }
)
assert inject["result"] == {"threadId": "event-thread", "injectedCount": 1}, inject

data = wait_for(
    lambda raw: b"event: thread/started" in raw
    and b"event: thread/status/changed" in raw
    and b"event: turn/started" in raw
    and b"event: item/started" in raw
    and b"event: rawResponseItem/completed" in raw
    and b"event: item/completed" in raw,
    "thread, turn, and injected item events",
)

stop_reading.set()
events_resp.close()
events_conn.close()
thread.join(timeout=1.0)
capture_file.write_bytes(data)


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


frames = parse_frames(data)
by_event = {}
for event, payload in frames:
    by_event.setdefault(event, []).append(payload)

thread_started = by_event["thread/started"][0]
assert thread_started["method"] == "thread/started", thread_started
started_thread = thread_started["params"]["thread"]
assert started_thread["id"] == "event-thread", started_thread
assert started_thread["sessionId"] == "event-thread", started_thread
assert started_thread["model"] == "gpt-events", started_thread
assert started_thread["modelProvider"] == "openai", started_thread
assert started_thread["cwd"] == "/tmp/event-cwd", started_thread
assert started_thread["turns"] == [], started_thread

status_changed = by_event["thread/status/changed"][0]
assert status_changed["method"] == "thread/status/changed", status_changed
assert status_changed["params"]["status"] == {"type": "idle"}, status_changed

turn_started = by_event["turn/started"][0]
assert turn_started["method"] == "turn/started", turn_started
turn_params = turn_started["params"]
assert turn_params["threadId"] == "event-thread", turn_params
assert turn_params["turn"]["id"] == turn_id, turn_params
assert turn_params["turn"]["status"] == "inProgress", turn_params
assert turn_params["turn"]["collaborationModeKind"] == "plan", turn_params
assert turn_params["turn"]["completedAt"] is None, turn_params
assert turn_params["turn"]["items"] == [
    {"type": "message", "role": "user", "content": "event hello"}
], turn_params

expected_injected_item = {"type": "message", "role": "user", "content": "injected live"}


def find_item_payload(event_name, content):
    for payload in by_event.get(event_name, []):
        item = payload.get("params", {}).get("item")
        if isinstance(item, dict) and item.get("content") == content:
            return payload
    raise AssertionError((event_name, content, by_event.get(event_name, [])))

item_started = find_item_payload("item/started", "injected live")
assert item_started["method"] == "item/started", item_started
started_params = item_started["params"]
assert started_params["threadId"] == "event-thread", started_params
inject_turn_id = started_params["turnId"]
assert isinstance(inject_turn_id, str) and inject_turn_id, started_params
assert isinstance(started_params["startedAtMs"], int), started_params
assert started_params["item"] == expected_injected_item, started_params

raw_completed = find_item_payload("rawResponseItem/completed", "injected live")
assert raw_completed["method"] == "rawResponseItem/completed", raw_completed
raw_params = raw_completed["params"]
assert raw_params["threadId"] == "event-thread", raw_params
assert raw_params["turnId"] == inject_turn_id, raw_params
assert raw_params["item"] == expected_injected_item, raw_params

item_completed = find_item_payload("item/completed", "injected live")
assert item_completed["method"] == "item/completed", item_completed
completed_params = item_completed["params"]
assert completed_params["threadId"] == "event-thread", completed_params
assert completed_params["turnId"] == inject_turn_id, completed_params
assert isinstance(completed_params["completedAtMs"], int), completed_params
assert completed_params["completedAtMs"] >= started_params["startedAtMs"], completed_params
assert completed_params["item"] == expected_injected_item, completed_params
PY

echo "events_runtime_isolated_ok"
