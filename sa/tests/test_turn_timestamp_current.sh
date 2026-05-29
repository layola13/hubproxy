#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
sa_dir="$(cd "${script_dir}/.." && pwd)"
project_dir="$(cd "${sa_dir}/.." && pwd)"
env_file="${project_dir}/.env"
backup_file="$(mktemp)"
hub_pid=""

cleanup() {
  if [[ -n "${hub_pid}" ]]; then
    kill "${hub_pid}" 2>/dev/null || true
    wait "${hub_pid}" 2>/dev/null || true
  fi
  cp "${backup_file}" "${env_file}"
  rm -f "${backup_file}"
}
trap cleanup EXIT

cp "${env_file}" "${backup_file}"

old_pid="$(ss -ltnp | sed -n 's/.*0\.0\.0\.0:28080.*pid=\([0-9]*\).*/\1/p' | head -n 1)"
if [[ -n "${old_pid}" ]]; then
  kill "${old_pid}" 2>/dev/null || true
  sleep 0.3
fi

awk '
  BEGIN { wrote_auth=0; wrote_port=0 }
  /^AUTH=/ { print "AUTH=client-secret"; wrote_auth=1; next }
  /^SA_PORT=/ { print "SA_PORT=28080"; wrote_port=1; next }
  { print }
  END {
    if (!wrote_auth) print "AUTH=client-secret"
    if (!wrote_port) print "SA_PORT=28080"
  }
' "${backup_file}" >"${env_file}"

(
  cd "${sa_dir}"
  setsid "${sa_dir}/hubproxy" > /tmp/hubproxy_sa_turn_timestamp_current.log 2>&1 < /dev/null &
  echo "$!" > /tmp/hubproxy_sa_turn_timestamp_current.pid
)
hub_pid="$(cat /tmp/hubproxy_sa_turn_timestamp_current.pid)"
rm -f /tmp/hubproxy_sa_turn_timestamp_current.pid

for _ in {1..50}; do
  if ss -ltnp | rg -q '0\.0\.0\.0:28080'; then
    break
  fi
  sleep 0.1
done

rpc() {
  curl -sS --max-time 15 \
    -H 'authorization: Bearer client-secret' \
    -H 'content-type: application/json' \
    --data "$1" \
    'http://127.0.0.1:28080/rpc'
}

thread_response="$(rpc '{"jsonrpc":"2.0","id":1,"method":"thread/start","params":{"threadId":"turn-time-thread","model":"mimo-v2.5"}}')"
thread_id="$(python3 - "${thread_response}" <<'PY'
import json
import sys
print(json.loads(sys.argv[1])["result"]["thread"]["id"])
PY
)"

turn_response="$(rpc "{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"turn/start\",\"params\":{\"threadId\":\"${thread_id}\",\"input\":[]}}")"

python3 - "${turn_response}" <<'PY'
import json
import sys
import time

turn = json.loads(sys.argv[1])["result"]["turn"]
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
PY

echo "turn_timestamp_current_ok"
