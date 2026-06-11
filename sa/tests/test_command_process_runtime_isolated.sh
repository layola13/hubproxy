#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_dir="$(cd "${script_dir}/../.." && pwd)"
sa_bin="${SA_BIN:-sa}"

tmp_root="$(mktemp -d /tmp/hubproxy-command-process.XXXXXX)"
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
OPENAI_API_KEY=sk-command-process
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

PROXY_PORT="${proxy_port}" WORK_DIR="${work_dir}" CAPTURE_FILE="${capture_file}" python3 - <<'PY'
import base64
import http.client
import json
import os
import threading
import time
from pathlib import Path

port = int(os.environ["PROXY_PORT"])
work_dir = os.environ["WORK_DIR"]
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


def rpc_call(payload, expected_status=200):
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
    assert status == expected_status, (payload, status, raw)
    return json.loads(raw)


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


def decoded_delta(params):
    return base64.b64decode(params["deltaBase64"]).decode("utf-8")


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

cmd = rpc_call(
    {
        "jsonrpc": "2.0",
        "id": "cmd-live",
        "method": "command/exec",
        "params": {
            "processId": "cmd-live-proc",
            "cwd": work_dir,
            "command": [
                "sh",
                "-c",
                "printf cmd-out; printf cmd-err >&2; exit 7",
            ],
        },
    }
)
assert cmd["jsonrpc"] == "2.0", cmd
assert cmd["id"] == "cmd-live", cmd
assert cmd["result"] == {"exitCode": 7, "stdout": "cmd-out", "stderr": "cmd-err"}, cmd

cmd_default = rpc_call(
    {
        "jsonrpc": "2.0",
        "id": "cmd-default-live",
        "method": "command/exec",
        "params": {"processId": "cmd-default-proc", "cwd": work_dir},
    }
)
assert cmd_default["result"] == {"exitCode": 0, "stdout": "", "stderr": ""}, cmd_default

proc = rpc_call(
    {
        "jsonrpc": "2.0",
        "id": "proc-live",
        "method": "process/spawn",
        "params": {
            "processHandle": "proc-live-handle",
            "cwd": work_dir,
            "command": [
                "sh",
                "-c",
                "printf proc-out; printf proc-err >&2; exit 3",
            ],
        },
    }
)
assert proc["result"] == {"processHandle": "proc-live-handle"}, proc

kill = rpc_call(
    {
        "jsonrpc": "2.0",
        "id": "proc-kill-live",
        "method": "process/kill",
        "params": {"processHandle": "proc-live-handle"},
    }
)
assert kill["result"] == {"ok": True}, kill

kill_again = rpc_call(
    {
        "jsonrpc": "2.0",
        "id": "proc-kill-again-live",
        "method": "process/kill",
        "params": {"processHandle": "proc-live-handle"},
    }
)
assert kill_again["result"] == {"ok": False}, kill_again

data = wait_for(
    lambda raw: b"event: command/exec/outputDelta" in raw
    and raw.count(b"event: process/outputDelta") >= 2
    and b"event: process/exited" in raw,
    "command/process output events",
)

stop_reading.set()
events_resp.close()
events_conn.close()
thread.join(timeout=1.0)
capture_file.write_bytes(data)

frames = parse_frames(data)
cmd_events = [payload for event, payload in frames if event == "command/exec/outputDelta"]
proc_output_events = [payload for event, payload in frames if event == "process/outputDelta"]
proc_exit_events = [payload for event, payload in frames if event == "process/exited"]

cmd_params = [payload["params"] for payload in cmd_events if payload["method"] == "command/exec/outputDelta"]
cmd_stdout = [p for p in cmd_params if p["processId"] == "cmd-live-proc" and p["stream"] == "stdout"]
cmd_stderr = [p for p in cmd_params if p["processId"] == "cmd-live-proc" and p["stream"] == "stderr"]
assert cmd_stdout and decoded_delta(cmd_stdout[0]) == "cmd-out", cmd_params
assert cmd_stderr and decoded_delta(cmd_stderr[0]) == "cmd-err", cmd_params
assert cmd_stdout[0]["capReached"] is False, cmd_stdout[0]
assert cmd_stderr[0]["capReached"] is False, cmd_stderr[0]

proc_params = [payload["params"] for payload in proc_output_events if payload["method"] == "process/outputDelta"]
proc_stdout = [p for p in proc_params if p["processHandle"] == "proc-live-handle" and p["stream"] == "stdout"]
proc_stderr = [p for p in proc_params if p["processHandle"] == "proc-live-handle" and p["stream"] == "stderr"]
assert proc_stdout and decoded_delta(proc_stdout[0]) == "proc-out", proc_params
assert proc_stderr and decoded_delta(proc_stderr[0]) == "proc-err", proc_params
assert proc_stdout[0]["capReached"] is False, proc_stdout[0]
assert proc_stderr[0]["capReached"] is False, proc_stderr[0]

proc_exits = [payload["params"] for payload in proc_exit_events if payload["method"] == "process/exited"]
matching_exit = [p for p in proc_exits if p["processHandle"] == "proc-live-handle"]
assert matching_exit, proc_exits
exit_params = matching_exit[0]
assert exit_params["exitCode"] == 3, exit_params
assert exit_params["stdout"] == "proc-out", exit_params
assert exit_params["stderr"] == "proc-err", exit_params
assert exit_params["stdoutCapReached"] is False, exit_params
assert exit_params["stderrCapReached"] is False, exit_params
PY

echo "command_process_runtime_isolated_ok"
