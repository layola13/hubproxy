#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
sa_dir="$(cd "${script_dir}/.." && pwd)"
hub_port="${SA_TEST_PROXY_PORT:-28198}"
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

awk -v port="${hub_port}" '
  BEGIN { wrote_sa=0; wrote_port=0; wrote_auth=0 }
  /^SA_PORT=/ { print "SA_PORT=" port; wrote_sa=1; next }
  /^PORT=/ { print "PORT=" port; wrote_port=1; next }
  /^AUTH=/ { print "AUTH=test-auth"; wrote_auth=1; next }
  { print }
  END {
    if (!wrote_sa) print "SA_PORT=" port
    if (!wrote_port) print "PORT=" port
    if (!wrote_auth) print "AUTH=test-auth"
  }
' "${sa_dir}/.env" > "${tmp_dir}/.env"

(
  cd "${tmp_dir}"
  setsid "${sa_dir}/hubproxy" > "${tmp_dir}/hubproxy.log" 2>&1 < /dev/null &
  echo "$!" > "${tmp_dir}/hubproxy.pid"
)
hub_pid="$(cat "${tmp_dir}/hubproxy.pid")"

for _ in {1..50}; do
  if ss -ltnp | rg -q ":${hub_port} "; then
    break
  fi
  sleep 0.1
done

rpc() {
  curl -sS --max-time 15 \
    -H 'authorization: Bearer test-auth' \
    -H 'content-type: application/json' \
    --data "$1" \
    "http://127.0.0.1:${hub_port}/rpc"
}

thread_start="$(rpc '{"jsonrpc":"2.0","id":1,"method":"thread/start","params":{"threadId":"goal-parity-thread"}}')"
set_null="$(rpc '{"jsonrpc":"2.0","id":2,"method":"thread/goal/set","params":{"threadId":"goal-parity-thread","objective":"finish parity","status":"complete","tokenBudget":null}}')"
get_null="$(rpc '{"jsonrpc":"2.0","id":3,"method":"thread/goal/get","params":{"threadId":"goal-parity-thread"}}')"
set_number="$(rpc '{"jsonrpc":"2.0","id":4,"method":"thread/goal/set","params":{"threadId":"goal-parity-thread","objective":"budget parity","status":"budgetLimited","tokenBudget":123}}')"
get_number="$(rpc '{"jsonrpc":"2.0","id":5,"method":"thread/goal/get","params":{"threadId":"goal-parity-thread"}}')"

python3 - "${thread_start}" "${set_null}" "${get_null}" "${set_number}" "${get_number}" <<'PY'
import json
import sys

thread_start, set_null, get_null, set_number, get_number = [json.loads(arg) for arg in sys.argv[1:]]

if thread_start["result"]["thread"]["id"] != "goal-parity-thread":
    raise SystemExit(thread_start)

for label, payload in (("set null", set_null), ("get null", get_null)):
    goal = payload["result"]["goal"]
    if goal["objective"] != "finish parity":
        raise SystemExit(f"{label}: objective mismatch: {goal}")
    if goal["status"] != "complete":
        raise SystemExit(f"{label}: status should match Deno complete: {goal}")
    if goal["tokenBudget"] is not None:
        raise SystemExit(f"{label}: tokenBudget null was not preserved: {goal}")

for label, payload in (("set number", set_number), ("get number", get_number)):
    goal = payload["result"]["goal"]
    if goal["objective"] != "budget parity":
        raise SystemExit(f"{label}: objective mismatch: {goal}")
    if goal["status"] != "budgetLimited":
        raise SystemExit(f"{label}: status should match Deno budgetLimited: {goal}")
    if goal["tokenBudget"] != 123:
        raise SystemExit(f"{label}: numeric tokenBudget mismatch: {goal}")
PY

echo "goal_status_budget_null_parity_ok"
