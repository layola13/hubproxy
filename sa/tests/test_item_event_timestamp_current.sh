#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
sa_dir="$(cd "${script_dir}/.." && pwd)"
project_dir="$(cd "${sa_dir}/.." && pwd)"
env_file="${project_dir}/.env"
backup_file="$(mktemp)"
events_out="$(mktemp)"
events_err="$(mktemp)"
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
    kill "${hub_pid}" 2>/dev/null || true
    wait "${hub_pid}" 2>/dev/null || true
  fi
  cp "${backup_file}" "${env_file}"
  rm -f "${backup_file}" "${events_out}" "${events_err}"
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
  setsid "${sa_dir}/hubproxy" > /tmp/hubproxy_sa_item_event_timestamp_current.log 2>&1 < /dev/null &
  echo "$!" > /tmp/hubproxy_sa_item_event_timestamp_current.pid
)
hub_pid="$(cat /tmp/hubproxy_sa_item_event_timestamp_current.pid)"
rm -f /tmp/hubproxy_sa_item_event_timestamp_current.pid

for _ in {1..50}; do
  if ss -ltnp | rg -q '0\.0\.0\.0:28080'; then
    break
  fi
  sleep 0.1
done

setsid timeout 8s curl -sS -N -H 'authorization: Bearer client-secret' \
  'http://127.0.0.1:28080/events' >"${events_out}" 2>"${events_err}" &
events_pid=$!

sleep 0.3

rpc() {
  curl -sS --max-time 15 \
    -H 'authorization: Bearer client-secret' \
    -H 'content-type: application/json' \
    --data "$1" \
    'http://127.0.0.1:28080/rpc'
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
