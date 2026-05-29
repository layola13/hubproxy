#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
sa_dir="$(cd "${script_dir}/.." && pwd)"
project_dir="$(cd "${sa_dir}/.." && pwd)"
env_file="${project_dir}/.env"

auth_token="$(awk -F= '$1=="AUTH"{print substr($0, index($0,"=")+1)}' "${env_file}" | tail -n 1)"
sa_port="$(awk -F= '$1=="SA_PORT"{print substr($0, index($0,"=")+1)}' "${env_file}" | tail -n 1)"
sa_port="${sa_port:-28080}"
base_url="http://127.0.0.1:${sa_port}"
hub_pid=""

cleanup() {
  if [[ -n "${hub_pid}" ]]; then
    kill "${hub_pid}" 2>/dev/null || true
    wait "${hub_pid}" 2>/dev/null || true
  fi
}
trap cleanup EXIT

old_pid="$(ss -ltnp | sed -nE "s/.*:${sa_port} .*pid=([0-9]+).*/\\1/p" | head -n 1)"
if [[ -n "${old_pid}" ]]; then
  kill "${old_pid}" 2>/dev/null || true
  sleep 0.3
fi

setsid "${sa_dir}/hubproxy" > /tmp/hubproxy_sa_thread_string_id.log 2>&1 < /dev/null &
hub_pid=$!

for _ in {1..50}; do
  if ss -ltnp | rg -q ":${sa_port} "; then
    break
  fi
  sleep 0.1
done

python3 - "${base_url}/rpc" "${auth_token}" <<'PY'
import json
import sys
import time
import urllib.request

url, auth = sys.argv[1], sys.argv[2]
thread_id = f"thr_string_{int(time.time() * 1000)}"

def rpc(i, method, params):
    body = json.dumps(
        {"jsonrpc": "2.0", "id": i, "method": method, "params": params},
        separators=(",", ":"),
    ).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        headers={"authorization": f"Bearer {auth}", "content-type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    if "error" in data:
        raise AssertionError(f"{method} returned error: {data}")
    return data["result"]

start = rpc(1, "thread/start", {"threadId": thread_id, "model": "mimo-v2.5"})
assert start["thread"]["id"] == thread_id, start
assert start["thread"]["sessionId"] == thread_id, start

loaded = rpc(2, "thread/loaded/list", {})
assert thread_id in loaded["data"], loaded

read = rpc(3, "thread/read", {"threadId": thread_id, "includeTurns": True})
assert read["thread"]["id"] == thread_id, read

name = rpc(4, "thread/name/set", {"threadId": thread_id, "name": "named"})
assert name == {"threadId": thread_id, "name": "named"}, name

archive = rpc(5, "thread/archive", {"threadId": thread_id})
assert archive == {"archived": True, "threadId": thread_id}, archive

unarchive = rpc(6, "thread/unarchive", {"threadId": thread_id})
assert unarchive["thread"]["id"] == thread_id, unarchive
assert unarchive["thread"]["name"] == "named", unarchive

goal = rpc(7, "thread/goal/set", {"threadId": thread_id, "objective": "ship it", "tokenBudget": 123})
assert goal["goal"]["threadId"] == thread_id, goal

turn = rpc(
    8,
    "turn/start",
    {
        "threadId": thread_id,
        "input": [{"role": "user", "content": "hi"}],
        "collaborationMode": {"mode": "goal"},
    },
)
turn_obj = turn["turn"]
turn_id = turn_obj["id"]
assert turn_obj["items"] == [{"role": "user", "content": "hi"}], turn
assert turn_obj["collaborationModeKind"] == "goal", turn

turns = rpc(9, "thread/turns/list", {"threadId": thread_id})
assert turns["data"], turns
assert turns["data"][0]["items"] == [{"role": "user", "content": "hi"}], turns
assert turns["data"][0]["collaborationModeKind"] == "goal", turns

items = rpc(10, "thread/turns/items/list", {"threadId": thread_id, "turnId": turn_id})
assert items["data"] == [{"role": "user", "content": "hi"}], items

inject = rpc(11, "thread/inject_items", {"threadId": thread_id, "items": [{"role": "assistant", "content": "ok"}]})
assert inject == {"injectedCount": 1, "threadId": thread_id}, inject

fork = rpc(12, "thread/fork", {"threadId": thread_id})
assert fork["thread"]["forkedFromId"] == thread_id, fork

print(f"thread_string_id_lifecycle_ok thread={thread_id} turn={turn_id}")
PY
