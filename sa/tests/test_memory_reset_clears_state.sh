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
  rm -f "${events_out}" "${events_err}"
}
trap cleanup EXIT

old_pid="$(ss -ltnp | sed -nE "s/.*:${sa_port} .*pid=([0-9]+).*/\\1/p" | head -n 1)"
if [[ -n "${old_pid}" ]]; then
  kill "${old_pid}" 2>/dev/null || true
  sleep 0.3
fi

setsid "${sa_dir}/hubproxy" > /tmp/hubproxy_sa_memory_reset.log 2>&1 < /dev/null &
hub_pid=$!

for _ in {1..50}; do
  if ss -ltnp | rg -q ":${sa_port} "; then
    break
  fi
  sleep 0.1
done

rpc() {
  curl -sS --max-time 15 \
    -H "authorization: Bearer ${auth_token}" \
    -H 'content-type: application/json' \
    --data "$1" \
    "${base_url}/rpc"
}

setsid timeout 8s curl -sS -N -H "authorization: Bearer ${auth_token}" \
  "${base_url}/events" >"${events_out}" 2>"${events_err}" &
events_pid=$!
sleep 0.3

start="$(rpc '{"jsonrpc":"2.0","id":1,"method":"thread/start","params":{}}')"
thread_id="$(sed -nE 's/.*"thread":\{"id":"([0-9]+)".*/\1/p' <<<"${start}" | head -n 1)"
if [[ -z "${thread_id}" ]]; then
  echo "failed to parse thread id" >&2
  echo "${start}" >&2
  exit 1
fi

rpc "{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"turn/start\",\"params\":{\"threadId\":\"${thread_id}\",\"input\":[]}}" >/dev/null
rpc "{\"jsonrpc\":\"2.0\",\"id\":3,\"method\":\"thread/goal/set\",\"params\":{\"threadId\":\"${thread_id}\",\"objective\":\"finish\",\"tokenBudget\":123}}" >/dev/null
rpc '{"jsonrpc":"2.0","id":4,"method":"fs/watch","params":{"path":".testdata/reset_watch.txt","watchId":"reset-watch"}}' >/dev/null
rpc '{"jsonrpc":"2.0","id":5,"method":"process/spawn","params":{"command":["echo","reset"],"processHandle":"reset-proc"}}' >/dev/null

reset="$(rpc "{\"jsonrpc\":\"2.0\",\"id\":6,\"method\":\"memory/reset\",\"params\":{\"threadId\":\"${thread_id}\"}}")"
if ! rg -q '"reset":true' <<<"${reset}"; then
  echo "memory/reset response mismatch" >&2
  echo "${reset}" >&2
  exit 1
fi

threads="$(rpc '{"jsonrpc":"2.0","id":7,"method":"thread/list","params":{}}')"
loaded="$(rpc '{"jsonrpc":"2.0","id":8,"method":"thread/loaded/list","params":{}}')"
goal="$(rpc "{\"jsonrpc\":\"2.0\",\"id\":9,\"method\":\"thread/goal/get\",\"params\":{\"threadId\":\"${thread_id}\"}}")"
kill_resp="$(rpc '{"jsonrpc":"2.0","id":10,"method":"process/kill","params":{"processHandle":"reset-proc"}}')"
unwatch_resp="$(rpc '{"jsonrpc":"2.0","id":11,"method":"fs/unwatch","params":{"watchId":"reset-watch"}}')"

if ! rg -q '"data":\[\]' <<<"${threads}"; then
  echo "thread/list was not cleared" >&2
  echo "${threads}" >&2
  exit 1
fi
if ! rg -q '"data":\[\]' <<<"${loaded}"; then
  echo "thread/loaded/list was not cleared" >&2
  echo "${loaded}" >&2
  exit 1
fi
if ! rg -q '"goal":null' <<<"${goal}"; then
  echo "goal was not cleared" >&2
  echo "${goal}" >&2
  exit 1
fi
if ! rg -q '"ok":false' <<<"${kill_resp}"; then
  echo "process state was not cleared" >&2
  echo "${kill_resp}" >&2
  exit 1
fi
if ! rg -q '"ok":false' <<<"${unwatch_resp}"; then
  echo "watch state was not cleared" >&2
  echo "${unwatch_resp}" >&2
  exit 1
fi

deadline=$((SECONDS + 6))
while (( SECONDS < deadline )); do
  if rg -q 'event: thread/closed' "${events_out}" && rg -q '"threadId":"\*"' "${events_out}"; then
    stop_events
    echo "memory_reset_clears_state_ok thread=${thread_id}"
    exit 0
  fi
  sleep 0.1
done

stop_events
echo "memory/reset did not emit thread/closed wildcard event" >&2
echo "--- reset ---" >&2
echo "${reset}" >&2
echo "--- events ---" >&2
cat "${events_out}" >&2
echo "--- curl stderr ---" >&2
cat "${events_err}" >&2
exit 1
