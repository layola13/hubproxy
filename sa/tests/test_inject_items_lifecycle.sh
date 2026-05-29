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

setsid "${sa_dir}/hubproxy" > /tmp/hubproxy_sa_inject_items.log 2>&1 < /dev/null &
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

inject="$(rpc "{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"thread/inject_items\",\"params\":{\"threadId\":\"${thread_id}\",\"items\":[{\"type\":\"message\",\"role\":\"user\",\"content\":\"injected\"}]}}")"
if ! rg -q "\"threadId\":\"${thread_id}\"" <<<"${inject}" || ! rg -q '"injectedCount":1' <<<"${inject}"; then
  echo "thread/inject_items response mismatch" >&2
  echo "${inject}" >&2
  exit 1
fi

turns="$(rpc "{\"jsonrpc\":\"2.0\",\"id\":3,\"method\":\"thread/turns/list\",\"params\":{\"threadId\":\"${thread_id}\"}}")"
turn_id="$(rg -o '"id":"[0-9]+"' <<<"${turns}" | tail -n 1 | sed -nE 's/"id":"([0-9]+)"/\1/p')"
if [[ -z "${turn_id}" ]]; then
  echo "failed to parse injected turn id" >&2
  echo "${turns}" >&2
  exit 1
fi

items="$(rpc "{\"jsonrpc\":\"2.0\",\"id\":4,\"method\":\"thread/turns/items/list\",\"params\":{\"threadId\":\"${thread_id}\",\"turnId\":\"${turn_id}\"}}")"
if ! rg -q '"data":\[\{"type":"message","role":"user","content":"injected"\}\]' <<<"${items}"; then
  echo "injected turn items were not stored" >&2
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
    && rg -q '"content":"injected"' "${events_out}"; then
    stop_events
    echo "inject_items_lifecycle_ok thread=${thread_id} turn=${turn_id}"
    exit 0
  fi
  sleep 0.1
done

stop_events
echo "inject item lifecycle events missing" >&2
echo "--- inject ---" >&2
echo "${inject}" >&2
echo "--- turns ---" >&2
echo "${turns}" >&2
echo "--- items ---" >&2
echo "${items}" >&2
echo "--- events ---" >&2
cat "${events_out}" >&2
echo "--- curl stderr ---" >&2
cat "${events_err}" >&2
exit 1
