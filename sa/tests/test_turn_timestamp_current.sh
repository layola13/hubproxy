#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
sa_dir="$(cd "${script_dir}/.." && pwd)"
env_file="${sa_dir}/.env"
hub_port="${SA_TEST_PROXY_PORT:-28218}"
tmp_dir="$(mktemp -d)"
hub_pid=""

cleanup() {
  if [[ -n "${hub_pid}" ]]; then
    kill "${hub_pid}" 2>/dev/null || true
    wait "${hub_pid}" 2>/dev/null || true
  fi
  rm -rf "${tmp_dir}"
}
trap cleanup EXIT

if ss -ltn | rg -q ":${hub_port}\\b"; then
  echo "test port already in use: ${hub_port}" >&2
  exit 1
fi

awk -v port="${hub_port}" '
  BEGIN { wrote_auth=0; wrote_sa=0; wrote_port=0 }
  /^AUTH=/ { print "AUTH=client-secret"; wrote_auth=1; next }
  /^SA_PORT=/ { print "SA_PORT=" port; wrote_sa=1; next }
  /^PORT=/ { print "PORT=" port; wrote_port=1; next }
  { print }
  END {
    if (!wrote_auth) print "AUTH=client-secret"
    if (!wrote_sa) print "SA_PORT=" port
    if (!wrote_port) print "PORT=" port
  }
' "${env_file}" >"${tmp_dir}/.env"

(
  cd "${tmp_dir}"
  setsid "${sa_dir}/hubproxy" > "${tmp_dir}/hubproxy.log" 2>&1 < /dev/null &
  echo "$!" > "${tmp_dir}/hubproxy.pid"
)
hub_pid="$(cat "${tmp_dir}/hubproxy.pid")"

for _ in {1..50}; do
  if ss -ltn | rg -q ":${hub_port} "; then
    break
  fi
  sleep 0.1
done

rpc() {
  curl -sS --max-time 15 \
    -H 'authorization: Bearer client-secret' \
    -H 'content-type: application/json' \
    --data "$1" \
    "http://127.0.0.1:${hub_port}/rpc"
}

thread_response="$(rpc '{"jsonrpc":"2.0","id":1,"method":"thread/start","params":{"threadId":"turn-time-thread","model":"mimo-v2.5"}}')"
thread_id="$(python3 - "${thread_response}" <<'PY'
import json
import sys
print(json.loads(sys.argv[1])["result"]["thread"]["id"])
PY
)"

turn_response="$(rpc "{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"turn/start\",\"params\":{\"threadId\":\"${thread_id}\",\"input\":[]}}")"
sleep 1
read_response="$(rpc "{\"jsonrpc\":\"2.0\",\"id\":3,\"method\":\"thread/read\",\"params\":{\"threadId\":\"${thread_id}\",\"includeTurns\":true}}")"
turn_id="$(python3 - "${turn_response}" <<'PY'
import json
import sys
print(json.loads(sys.argv[1])["result"]["turn"]["id"])
PY
)"
interrupt_response="$(rpc "{\"jsonrpc\":\"2.0\",\"id\":4,\"method\":\"turn/interrupt\",\"params\":{\"threadId\":\"${thread_id}\",\"turnId\":\"${turn_id}\"}}")"
turns_after_interrupt="$(rpc "{\"jsonrpc\":\"2.0\",\"id\":5,\"method\":\"thread/turns/list\",\"params\":{\"threadId\":\"${thread_id}\"}}")"

python3 - "${turn_response}" "${read_response}" "${interrupt_response}" "${turns_after_interrupt}" <<'PY'
import json
import sys
import time

turn = json.loads(sys.argv[1])["result"]["turn"]
read_turns = json.loads(sys.argv[2])["result"]["thread"]["turns"]
interrupt = json.loads(sys.argv[3])["result"]
turns_after_interrupt = json.loads(sys.argv[4])["result"]["data"]
created_at = turn.get("createdAt")
updated_at = turn.get("updatedAt")
started_at = turn.get("startedAt")

for key, value in (("createdAt", created_at), ("updatedAt", updated_at), ("startedAt", started_at)):
    if value == 1748300000:
        raise SystemExit(f"{key} still uses legacy fixed value: {turn}")
    if not isinstance(value, int):
        raise SystemExit(f"{key} is not integer seconds: {turn}")
    if abs(int(time.time()) - value) > 300:
        raise SystemExit(f"{key} is not close to current time: {turn}")

if len({created_at, updated_at, started_at}) != 1:
    raise SystemExit(f"new in-progress turn timestamps should match: {turn}")
if turn.get("completedAt") is not None:
    raise SystemExit(f"in-progress turn completedAt should be null: {turn}")
if turn.get("durationMs") is not None:
    raise SystemExit(f"in-progress turn durationMs should be null: {turn}")
if turn.get("status") != "inProgress":
    raise SystemExit(f"turn status mismatch: {turn}")

read_turn = next((entry for entry in read_turns if entry.get("id") == turn["id"]), None)
if read_turn is None:
    raise SystemExit(f"thread/read did not return started turn: {read_turns}")
for key in ("createdAt", "startedAt"):
    if read_turn.get(key) != turn.get(key):
        raise SystemExit(f"{key} drifted between turn/start and thread/read: start={turn} read={read_turn}")
if read_turn.get("updatedAt") != turn.get("updatedAt"):
    raise SystemExit(f"updatedAt changed without steer/interrupt: start={turn} read={read_turn}")
if read_turn.get("completedAt") is not None or read_turn.get("durationMs") is not None:
    raise SystemExit(f"thread/read in-progress completion fields mismatch: {read_turn}")

if interrupt.get("interrupted") is not True or interrupt.get("turnId") != turn["id"]:
    raise SystemExit(f"turn/interrupt response mismatch: {interrupt}")
interrupted_turn = next((entry for entry in turns_after_interrupt if entry.get("id") == turn["id"]), None)
if interrupted_turn is None:
    raise SystemExit(f"turns/list did not return interrupted turn: {turns_after_interrupt}")
if interrupted_turn.get("status") != "interrupted":
    raise SystemExit(f"interrupted turn status mismatch: {interrupted_turn}")
if interrupted_turn.get("createdAt") != turn.get("createdAt") or interrupted_turn.get("startedAt") != turn.get("startedAt"):
    raise SystemExit(f"interrupted turn start timestamps drifted: start={turn} interrupted={interrupted_turn}")
if interrupted_turn.get("updatedAt", 0) < turn.get("updatedAt", 0):
    raise SystemExit(f"interrupted turn updatedAt moved backward: start={turn} interrupted={interrupted_turn}")
if not isinstance(interrupted_turn.get("completedAt"), int):
    raise SystemExit(f"interrupted turn completedAt should be integer seconds: {interrupted_turn}")
if interrupted_turn.get("completedAt") < turn.get("createdAt"):
    raise SystemExit(f"interrupted turn completed before creation: {interrupted_turn}")
if interrupted_turn.get("durationMs") is not None:
    raise SystemExit(f"Deno interruptTurn leaves durationMs null: {interrupted_turn}")
PY

echo "turn_timestamp_current_ok"
