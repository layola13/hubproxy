#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
sa_dir="$(cd "${script_dir}/.." && pwd)"
env_file="${sa_dir}/.env"
hub_port="${SA_TEST_PROXY_PORT:-28221}"
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
' "${env_file}" > "${tmp_dir}/.env"

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
    -H 'authorization: Bearer client-secret' \
    -H 'content-type: application/json' \
    --data "$1" \
    "http://127.0.0.1:${hub_port}/rpc"
}

thread_id="goal-update-time-thread"
first="$(rpc "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"thread/goal/set\",\"params\":{\"threadId\":\"${thread_id}\",\"objective\":\"first\",\"status\":\"active\",\"tokenBudget\":111}}")"
sleep 1.1
second="$(rpc "{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"thread/goal/set\",\"params\":{\"threadId\":\"${thread_id}\",\"objective\":\"second\",\"status\":\"blocked\",\"tokenBudget\":222}}")"
get_after="$(rpc "{\"jsonrpc\":\"2.0\",\"id\":3,\"method\":\"thread/goal/get\",\"params\":{\"threadId\":\"${thread_id}\"}}")"

python3 - "${first}" "${second}" "${get_after}" <<'PY'
import json
import sys

first, second, get_after = [json.loads(arg)["result"]["goal"] for arg in sys.argv[1:]]

if first["createdAt"] != first["updatedAt"]:
    raise SystemExit(f"new goal timestamps should match: {first}")
if second["createdAt"] != first["createdAt"]:
    raise SystemExit(f"updated goal should preserve createdAt like Deno: first={first} second={second}")
if second["updatedAt"] <= first["updatedAt"]:
    raise SystemExit(f"updated goal should advance updatedAt: first={first} second={second}")
if second["objective"] != "second" or second["status"] != "blocked" or second["tokenBudget"] != 222:
    raise SystemExit(f"updated goal fields mismatch: {second}")
if get_after != second:
    raise SystemExit(f"thread/goal/get should return persisted updated goal: set={second} get={get_after}")
PY

echo "goal_update_timestamp_parity_ok"
