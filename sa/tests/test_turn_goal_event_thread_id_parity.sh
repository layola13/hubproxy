#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
sa_dir="$(cd "${script_dir}/.." && pwd)"
hub_port="${SA_TEST_PROXY_PORT:-28214}"
tmp_dir="$(mktemp -d)"
events_out="${tmp_dir}/events.out"
events_err="${tmp_dir}/events.err"
hub_pid=""
events_pid=""

cleanup() {
  if [[ -n "${events_pid}" ]]; then
    kill -TERM "-${events_pid}" 2>/dev/null || true
    wait "${events_pid}" 2>/dev/null || true
  fi
  if [[ -n "${hub_pid}" ]]; then
    kill "${hub_pid}" 2>/dev/null || true
    wait "${hub_pid}" 2>/dev/null || true
  fi
  rm -rf "${tmp_dir}"
}
trap cleanup EXIT

if ss -ltn | rg -q ":${hub_port}\\b"; then
  echo "test port already in use: hub=${hub_port}" >&2
  exit 1
fi

awk -v port="${hub_port}" '
  BEGIN { wrote_sa=0; wrote_port=0; wrote_auth=0 }
  /^SA_PORT=/ { print "SA_PORT=" port; wrote_sa=1; next }
  /^PORT=/ { print "PORT=" port; wrote_port=1; next }
  /^AUTH=/ { print "AUTH=test-secret"; wrote_auth=1; next }
  { print }
  END {
    if (!wrote_sa) print "SA_PORT=" port
    if (!wrote_port) print "PORT=" port
    if (!wrote_auth) print "AUTH=test-secret"
  }
' "${sa_dir}/.env" > "${tmp_dir}/.env"

(
  cd "${tmp_dir}"
  setsid "${sa_dir}/hubproxy" > "${tmp_dir}/hubproxy.log" 2>&1 < /dev/null &
  echo "$!" > "${tmp_dir}/hubproxy.pid"
)
hub_pid="$(cat "${tmp_dir}/hubproxy.pid")"

for _ in {1..80}; do
  if ss -ltn | rg -q ":${hub_port} "; then
    break
  fi
  sleep 0.1
done
if ! ss -ltn | rg -q ":${hub_port} "; then
  echo "hubproxy did not start on ${hub_port}" >&2
  cat "${tmp_dir}/hubproxy.log" >&2 || true
  exit 1
fi

rpc() {
  curl -sS --max-time 15 \
    -H 'authorization: Bearer test-secret' \
    -H 'content-type: application/json' \
    --data "$1" \
    "http://127.0.0.1:${hub_port}/rpc"
}

setsid timeout 10s curl -sS -N \
  -H 'authorization: Bearer test-secret' \
  "http://127.0.0.1:${hub_port}/events" > "${events_out}" 2> "${events_err}" &
events_pid=$!
sleep 0.3

thread_id="turn-goal-string-thread"
rpc "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"thread/start\",\"params\":{\"threadId\":\"${thread_id}\"}}" >/dev/null

turn_response="$(rpc "{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"turn/start\",\"params\":{\"threadId\":\"${thread_id}\",\"input\":[{\"type\":\"message\",\"role\":\"user\",\"content\":\"start item\"}],\"collaborationMode\":{\"mode\":\"plan\"}}}")"
turn_id="$(python3 - "${turn_response}" <<'PY'
import json, sys
turn = json.loads(sys.argv[1])["result"]["turn"]
assert turn["items"][0]["content"] == "start item", turn
assert turn.get("collaborationModeKind") == "plan", turn
print(turn["id"])
PY
)"

rpc "{\"jsonrpc\":\"2.0\",\"id\":3,\"method\":\"thread/goal/set\",\"params\":{\"threadId\":\"${thread_id}\",\"objective\":\"align events\",\"status\":\"active\",\"tokenBudget\":null}}" >/dev/null
rpc "{\"jsonrpc\":\"2.0\",\"id\":4,\"method\":\"turn/interrupt\",\"params\":{\"threadId\":\"${thread_id}\",\"turnId\":\"${turn_id}\"}}" >/dev/null
rpc "{\"jsonrpc\":\"2.0\",\"id\":5,\"method\":\"thread/goal/clear\",\"params\":{\"threadId\":\"${thread_id}\"}}" >/dev/null

deadline=$((SECONDS + 6))
while (( SECONDS < deadline )); do
  if rg -q 'event: turn/started' "${events_out}" \
    && rg -q 'event: thread/goal/updated' "${events_out}" \
    && rg -q 'event: turn/completed' "${events_out}" \
    && rg -q 'event: thread/goal/cleared' "${events_out}"; then
    break
  fi
  sleep 0.1
done

python3 - "${events_out}" "${thread_id}" "${turn_id}" <<'PY'
import json
import sys

path, thread_id, turn_id = sys.argv[1:]
events = []
current = None
for raw in open(path, encoding="utf-8"):
    line = raw.rstrip("\n")
    if line.startswith("event: "):
        current = line[7:]
    elif line.startswith("data: ") and current:
        payload = json.loads(line[6:])
        params = payload.get("params", payload)
        events.append((current, params))
        current = None

def find(name):
    for method, params in events:
        if method == name:
            return params
    raise SystemExit(f"missing event {name}: {events}")

started = find("turn/started")
assert started["threadId"] == thread_id, started
assert started["turn"]["id"] == turn_id, started
assert started["turn"].get("collaborationModeKind") == "plan", started
assert started["turn"]["items"][0]["content"] == "start item", started

goal_updated = find("thread/goal/updated")
assert goal_updated["threadId"] == thread_id, goal_updated
assert "turnId" not in goal_updated, goal_updated
assert goal_updated["goal"]["threadId"] == thread_id, goal_updated
assert goal_updated["goal"]["objective"] == "align events", goal_updated

completed = find("turn/completed")
assert completed["threadId"] == thread_id, completed
assert completed["turn"]["id"] == turn_id, completed
assert completed["turn"]["status"] == "interrupted", completed
assert completed["turn"].get("collaborationModeKind") == "plan", completed
assert completed["turn"]["items"][0]["content"] == "start item", completed

cleared = find("thread/goal/cleared")
assert cleared["threadId"] == thread_id, cleared
assert set(cleared.keys()) == {"threadId"}, cleared
PY

echo "turn_goal_event_thread_id_parity_ok thread=${thread_id} turn=${turn_id}"
