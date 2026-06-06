#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
sa_dir="$(cd "${script_dir}/.." && pwd)"
env_file="${sa_dir}/.env"
hub_port="${SA_TEST_PROXY_PORT:-28217}"
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

set_response="$(rpc '{"jsonrpc":"2.0","id":1,"method":"thread/goal/set","params":{"threadId":"goal-time-thread","objective":"keep timestamps current","tokenBudget":12345}}')"
get_response="$(rpc '{"jsonrpc":"2.0","id":2,"method":"thread/goal/get","params":{"threadId":"goal-time-thread"}}')"

python3 - "${set_response}" "${get_response}" <<'PY'
import json
import sys
import time

def check_goal(label, payload):
    goal = json.loads(payload)["result"]["goal"]
    created_at = goal.get("createdAt")
    updated_at = goal.get("updatedAt")
    for key, value in (("createdAt", created_at), ("updatedAt", updated_at)):
        if value == 1748300000:
            raise SystemExit(f"{label} {key} still uses legacy fixed value: {goal}")
        if not isinstance(value, int):
            raise SystemExit(f"{label} {key} is not integer seconds: {goal}")
        if abs(int(time.time()) - value) > 300:
            raise SystemExit(f"{label} {key} is not close to current time: {goal}")
    if created_at != updated_at:
        raise SystemExit(f"{label} new goal timestamps should match: {goal}")
    if goal.get("objective") != "keep timestamps current":
        raise SystemExit(f"{label} goal objective mismatch: {goal}")
    if goal.get("tokenBudget") != 12345:
        raise SystemExit(f"{label} goal tokenBudget mismatch: {goal}")

check_goal("set", sys.argv[1])
check_goal("get", sys.argv[2])
PY

echo "goal_timestamp_current_ok"
