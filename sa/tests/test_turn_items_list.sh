#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
sa_dir="$(cd "${script_dir}/.." && pwd)"
project_dir="$(cd "${sa_dir}/.." && pwd)"
env_file="${project_dir}/.env"
auth_token="$(awk -F= '/^AUTH=/{print substr($0, index($0,"=")+1)}' "${env_file}" | tail -n 1)"
hub_pid=""
events_pid=""
events_out="$(mktemp)"
events_err="$(mktemp)"

cleanup() {
  if [[ -n "${events_pid}" ]]; then
    kill -TERM "-${events_pid}" 2>/dev/null || true
    wait "${events_pid}" 2>/dev/null || true
  fi
  if [[ -n "${hub_pid}" ]]; then
    kill "${hub_pid}" 2>/dev/null || true
    wait "${hub_pid}" 2>/dev/null || true
  fi
  rm -f "${events_out}" "${events_err}"
}
trap cleanup EXIT

old_pid="$(ss -ltnp | sed -n 's/.*0\.0\.0\.0:28080.*pid=\([0-9]*\).*/\1/p' | head -n 1)"
if [[ -n "${old_pid}" ]]; then
  kill "${old_pid}" 2>/dev/null || true
  sleep 0.3
fi

setsid "${sa_dir}/hubproxy" > /tmp/hubproxy_sa_turn_items.log 2>&1 < /dev/null &
hub_pid=$!

for _ in {1..50}; do
  if ss -ltnp | rg -q '0\.0\.0\.0:28080'; then
    break
  fi
  sleep 0.1
done

rpc() {
  curl -sS --max-time 15 \
    -H "authorization: Bearer ${auth_token}" \
    -H 'content-type: application/json' \
    --data "$1" \
  'http://127.0.0.1:28080/rpc'
}

setsid timeout 8s curl -sS -N -H "authorization: Bearer ${auth_token}" \
  'http://127.0.0.1:28080/events' >"${events_out}" 2>"${events_err}" &
events_pid=$!
sleep 0.3

start="$(rpc '{"jsonrpc":"2.0","id":1,"method":"thread/start","params":{}}')"
thread_id="$(sed -nE 's/.*"thread":\{"id":"([0-9]+)".*/\1/p' <<<"${start}" | head -n 1)"
if [[ -z "${thread_id}" ]]; then
  echo "failed to parse thread id" >&2
  echo "${start}" >&2
  exit 1
fi

turn="$(rpc "{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"turn/start\",\"params\":{\"threadId\":\"${thread_id}\",\"input\":[{\"type\":\"message\",\"role\":\"user\",\"content\":\"remember-me\"}]}}")"
turn_id="$(sed -nE 's/.*"turn":\{"id":"([0-9]+)".*/\1/p' <<<"${turn}" | head -n 1)"
if [[ -z "${turn_id}" ]]; then
  echo "failed to parse turn id" >&2
  echo "${turn}" >&2
  exit 1
fi

items="$(rpc "{\"jsonrpc\":\"2.0\",\"id\":3,\"method\":\"thread/turns/items/list\",\"params\":{\"threadId\":\"${thread_id}\",\"turnId\":\"${turn_id}\"}}")"
if ! rg -q '"data":\[\{"type":"message","role":"user","content":"remember-me"\}\]' <<<"${items}"; then
  echo "thread/turns/items/list did not return stored turn input items" >&2
  echo "${items}" >&2
  exit 1
fi

deadline=$((SECONDS + 6))
while (( SECONDS < deadline )); do
  if rg -q 'event: item/started' "${events_out}" \
    && rg -q 'event: rawResponseItem/completed' "${events_out}" \
    && rg -q 'event: item/completed' "${events_out}" \
    && rg -q "\"threadId\":\"${thread_id}\"" "${events_out}" \
    && rg -q "\"turnId\":\"${turn_id}\"" "${events_out}" \
    && rg -q '"content":"remember-me"' "${events_out}"; then
    echo "turn_items_list_ok"
    exit 0
  fi
  sleep 0.1
done

echo "turn/start input item lifecycle events missing" >&2
echo "--- events ---" >&2
cat "${events_out}" >&2
echo "--- curl stderr ---" >&2
cat "${events_err}" >&2
exit 1

echo "turn_items_list_ok"
