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
missing_thread_set="$(rpc '{"jsonrpc":"2.0","id":21,"method":"thread/goal/set","params":{"threadId":"goal-only-thread","objective":"goal without thread","status":"customStatus","tokenBudget":null}}')"
missing_thread_get="$(rpc '{"jsonrpc":"2.0","id":22,"method":"thread/goal/get","params":{"threadId":"goal-only-thread"}}')"
missing_thread_clear="$(rpc '{"jsonrpc":"2.0","id":23,"method":"thread/goal/clear","params":{"threadId":"goal-only-thread"}}')"
missing_thread_get_after_clear="$(rpc '{"jsonrpc":"2.0","id":24,"method":"thread/goal/get","params":{"threadId":"goal-only-thread"}}')"
set_null="$(rpc '{"jsonrpc":"2.0","id":2,"method":"thread/goal/set","params":{"threadId":"goal-parity-thread","objective":"finish parity","status":"complete","tokenBudget":null}}')"
get_null="$(rpc '{"jsonrpc":"2.0","id":3,"method":"thread/goal/get","params":{"threadId":"goal-parity-thread"}}')"
set_number="$(rpc '{"jsonrpc":"2.0","id":4,"method":"thread/goal/set","params":{"threadId":"goal-parity-thread","objective":"budget parity","status":"budgetLimited","tokenBudget":123}}')"
get_number="$(rpc '{"jsonrpc":"2.0","id":5,"method":"thread/goal/get","params":{"threadId":"goal-parity-thread"}}')"
set_negative="$(rpc '{"jsonrpc":"2.0","id":6,"method":"thread/goal/set","params":{"threadId":"goal-parity-thread","objective":"negative budget","status":"active","tokenBudget":-5}}')"
get_negative="$(rpc '{"jsonrpc":"2.0","id":7,"method":"thread/goal/get","params":{"threadId":"goal-parity-thread"}}')"
set_string="$(rpc '{"jsonrpc":"2.0","id":8,"method":"thread/goal/set","params":{"threadId":"goal-parity-thread","objective":"string budget","status":"active","tokenBudget":"123"}}')"
get_string="$(rpc '{"jsonrpc":"2.0","id":9,"method":"thread/goal/get","params":{"threadId":"goal-parity-thread"}}')"
set_paused="$(rpc '{"jsonrpc":"2.0","id":10,"method":"thread/goal/set","params":{"threadId":"goal-parity-thread","objective":"paused status","status":"paused","tokenBudget":null}}')"
get_paused="$(rpc '{"jsonrpc":"2.0","id":11,"method":"thread/goal/get","params":{"threadId":"goal-parity-thread"}}')"
set_blocked="$(rpc '{"jsonrpc":"2.0","id":12,"method":"thread/goal/set","params":{"threadId":"goal-parity-thread","objective":"blocked status","status":"blocked","tokenBudget":null}}')"
get_blocked="$(rpc '{"jsonrpc":"2.0","id":13,"method":"thread/goal/get","params":{"threadId":"goal-parity-thread"}}')"
set_usage="$(rpc '{"jsonrpc":"2.0","id":14,"method":"thread/goal/set","params":{"threadId":"goal-parity-thread","objective":"usage status","status":"usageLimited","tokenBudget":null}}')"
get_usage="$(rpc '{"jsonrpc":"2.0","id":15,"method":"thread/goal/get","params":{"threadId":"goal-parity-thread"}}')"
set_custom="$(rpc '{"jsonrpc":"2.0","id":16,"method":"thread/goal/set","params":{"threadId":"goal-parity-thread","objective":"custom status","status":"customStatus","tokenBudget":null}}')"
get_custom="$(rpc '{"jsonrpc":"2.0","id":17,"method":"thread/goal/get","params":{"threadId":"goal-parity-thread"}}')"
clear_once="$(rpc '{"jsonrpc":"2.0","id":18,"method":"thread/goal/clear","params":{"threadId":"goal-parity-thread"}}')"
clear_twice="$(rpc '{"jsonrpc":"2.0","id":19,"method":"thread/goal/clear","params":{"threadId":"goal-parity-thread"}}')"
get_after_clear="$(rpc '{"jsonrpc":"2.0","id":20,"method":"thread/goal/get","params":{"threadId":"goal-parity-thread"}}')"

python3 - "${thread_start}" "${missing_thread_set}" "${missing_thread_get}" "${missing_thread_clear}" "${missing_thread_get_after_clear}" "${set_null}" "${get_null}" "${set_number}" "${get_number}" "${set_negative}" "${get_negative}" "${set_string}" "${get_string}" "${set_paused}" "${get_paused}" "${set_blocked}" "${get_blocked}" "${set_usage}" "${get_usage}" "${set_custom}" "${get_custom}" "${clear_once}" "${clear_twice}" "${get_after_clear}" <<'PY'
import json
import sys

(
    thread_start,
    missing_thread_set,
    missing_thread_get,
    missing_thread_clear,
    missing_thread_get_after_clear,
    set_null,
    get_null,
    set_number,
    get_number,
    set_negative,
    get_negative,
    set_string,
    get_string,
    set_paused,
    get_paused,
    set_blocked,
    get_blocked,
    set_usage,
    get_usage,
    set_custom,
    get_custom,
    clear_once,
    clear_twice,
    get_after_clear,
) = [json.loads(arg) for arg in sys.argv[1:]]

if thread_start["result"]["thread"]["id"] != "goal-parity-thread":
    raise SystemExit(thread_start)

for label, payload in (("set missing thread", missing_thread_set), ("get missing thread", missing_thread_get)):
    goal = payload["result"]["goal"]
    if goal["threadId"] != "goal-only-thread":
        raise SystemExit(f"{label}: Deno stores goals by raw string threadId, got {goal}")
    if goal["objective"] != "goal without thread" or goal["status"] != "customStatus":
        raise SystemExit(f"{label}: goal payload mismatch: {goal}")
missing_clear = missing_thread_clear["result"]
if missing_clear.get("cleared") is not True:
    raise SystemExit(f"clear missing thread goal should be true: {missing_clear}")
if missing_clear.get("notification") != {"method": "thread/goal/cleared", "params": {"threadId": "goal-only-thread"}}:
    raise SystemExit(f"clear missing thread notification should keep string id: {missing_clear}")
if missing_thread_get_after_clear["result"].get("goal") is not None:
    raise SystemExit(f"goal-only-thread should be cleared: {missing_thread_get_after_clear}")

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

for label, payload in (("set negative", set_negative), ("get negative", get_negative)):
    goal = payload["result"]["goal"]
    if goal["objective"] != "negative budget":
        raise SystemExit(f"{label}: objective mismatch: {goal}")
    if goal["tokenBudget"] != -5:
        raise SystemExit(f"{label}: negative tokenBudget should be preserved like Deno/Codex: {goal}")

for label, payload in (("set string", set_string), ("get string", get_string)):
    goal = payload["result"]["goal"]
    if goal["objective"] != "string budget":
        raise SystemExit(f"{label}: objective mismatch: {goal}")
    if goal["tokenBudget"] is not None:
        raise SystemExit(f"{label}: string tokenBudget should be ignored like Deno typeof number check: {goal}")

for expected_status, expected_objective, set_payload, get_payload in (
    ("paused", "paused status", set_paused, get_paused),
    ("blocked", "blocked status", set_blocked, get_blocked),
    ("usageLimited", "usage status", set_usage, get_usage),
):
    for label, payload in (("set", set_payload), ("get", get_payload)):
        goal = payload["result"]["goal"]
        if goal["objective"] != expected_objective:
            raise SystemExit(f"{label} {expected_status}: objective mismatch: {goal}")
        if goal["status"] != expected_status:
            raise SystemExit(f"{label} {expected_status}: status mismatch: {goal}")
        if goal["tokenBudget"] is not None:
            raise SystemExit(f"{label} {expected_status}: null tokenBudget mismatch: {goal}")

for label, payload in (("set custom", set_custom), ("get custom", get_custom)):
    goal = payload["result"]["goal"]
    if goal["objective"] != "custom status":
        raise SystemExit(f"{label}: objective mismatch: {goal}")
    if goal["status"] != "customStatus":
        raise SystemExit(f"{label}: Deno preserves unknown runtime status strings: {goal}")
    if goal["tokenBudget"] is not None:
        raise SystemExit(f"{label}: null tokenBudget mismatch: {goal}")

once = clear_once["result"]
if once.get("cleared") is not True:
    raise SystemExit(f"first clear should report cleared true: {once}")
notification = once.get("notification")
if notification != {"method": "thread/goal/cleared", "params": {"threadId": "goal-parity-thread"}}:
    raise SystemExit(f"first clear notification should match Deno shape: {once}")

twice = clear_twice["result"]
if twice != {"cleared": False, "notification": None}:
    raise SystemExit(f"second clear should report Deno false/null shape: {twice}")
if get_after_clear["result"].get("goal") is not None:
    raise SystemExit(f"goal/get after clear should be null: {get_after_clear}")
PY

echo "goal_status_budget_null_parity_ok"
