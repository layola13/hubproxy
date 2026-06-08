#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
sa_dir="$(cd "${script_dir}/.." && pwd)"
project_dir="$(cd "${sa_dir}/.." && pwd)"
source "${script_dir}/lib/runtime_env.sh"
env_file="${project_dir}/.env"
tmp_dir="$(mktemp -d)"
events_out="$(mktemp)"
events_err="$(mktemp)"
sa_port="${SA_TEST_PROXY_PORT:-$(sa_test_free_port)}"
hub_pid=""
events_pid=""

stop_events() {
  if [[ -n "${events_pid}" ]]; then
    kill -TERM "-${events_pid}" 2>/dev/null || true
    wait "${events_pid}" 2>/dev/null || true
    events_pid=""
  fi
}

cleanup() {
  stop_events
  if [[ -n "${hub_pid}" ]]; then
    sa_test_stop_pgid "${hub_pid}"
  fi
  rm -rf "${tmp_dir}"
  rm -f "${events_out}" "${events_err}"
}
trap cleanup EXIT

sa_test_assert_port_free "${sa_port}"
sa_test_write_env_from_root "${env_file}" "${tmp_dir}/.env" "${sa_port}" "client-secret"

hub_pid="$(sa_test_start_hubproxy "${sa_dir}" "${tmp_dir}" "${tmp_dir}/hubproxy.log")"
if ! sa_test_wait_port "${sa_port}" 50 0.1; then
  echo "hubproxy did not start on ${sa_port}" >&2
  cat "${tmp_dir}/hubproxy.log" >&2 || true
  exit 1
fi

setsid timeout 8s curl -sS -N -H 'authorization: Bearer client-secret' \
  "http://127.0.0.1:${sa_port}/events" >"${events_out}" 2>"${events_err}" &
events_pid=$!

sleep 0.3

rpc() {
  curl -sS --max-time 15 \
    -H 'authorization: Bearer client-secret' \
    -H 'content-type: application/json' \
    --data "$1" \
    "http://127.0.0.1:${sa_port}/rpc"
}

thread_response="$(rpc '{"jsonrpc":"2.0","id":1,"method":"thread/start","params":{"threadId":"item-time-thread","model":"mimo-v2.5"}}')"
thread_id="$(python3 - "${thread_response}" <<'PY'
import json
import sys
print(json.loads(sys.argv[1])["result"]["thread"]["id"])
PY
)"

rpc "{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"turn/start\",\"params\":{\"threadId\":\"${thread_id}\",\"input\":[{\"id\":\"input-item-time\",\"type\":\"text\",\"text\":\"hi\"}]}}" >/dev/null

deadline=$((SECONDS + 6))
while (( SECONDS < deadline )); do
  if rg -q 'event: item/started' "${events_out}" \
    && rg -q 'event: item/completed' "${events_out}" \
    && rg -q '"input-item-time"' "${events_out}"; then
    break
  fi
  sleep 0.1
done

python3 - "${events_out}" <<'PY'
import json
import pathlib
import sys
import time

content = pathlib.Path(sys.argv[1]).read_text()
records = []
event = None
for line in content.splitlines():
    line = line.strip()
    if line.startswith("event: "):
        event = line[7:]
    elif line.startswith("data: ") and event in ("item/started", "item/completed"):
        records.append((event, json.loads(line[6:])))
        event = None
    elif line.startswith("data: "):
        event = None

wanted = {}
for name, payload in records:
    if name in ("item/started", "item/completed"):
        wanted[name] = payload["params"]

for name, key in (("item/started", "startedAtMs"), ("item/completed", "completedAtMs")):
    if name not in wanted:
        raise SystemExit(f"missing {name} event in SSE stream:\n{content}")
    value = wanted[name].get(key)
    if value == 1748300000:
        raise SystemExit(f"{name} still uses legacy fixed value: {wanted[name]}")
    if not isinstance(value, int):
        raise SystemExit(f"{name} timestamp is not integer milliseconds: {wanted[name]}")
    if abs(int(time.time() * 1000) - value) > 300000:
        raise SystemExit(f"{name} timestamp is not close to current time: {wanted[name]}")

if wanted["item/started"].get("item", {}).get("id") != "input-item-time":
    raise SystemExit(f"item/started payload mismatch: {wanted['item/started']}")
if wanted["item/completed"].get("item", {}).get("id") != "input-item-time":
    raise SystemExit(f"item/completed payload mismatch: {wanted['item/completed']}")
PY

echo "item_event_timestamp_current_ok"
