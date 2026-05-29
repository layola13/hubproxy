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

old_pid="$(ss -ltnp | sed -nE "s/.*:${sa_port} .*pid=([0-9]+).*/\\1/p" | head -n 1)"
if [[ -n "${old_pid}" ]]; then
  kill "${old_pid}" 2>/dev/null || true
  sleep 0.3
fi

setsid "${sa_dir}/hubproxy" > /tmp/hubproxy_sa_turn_steer.log 2>&1 < /dev/null &
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

turn="$(rpc "{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"turn/start\",\"params\":{\"threadId\":\"${thread_id}\",\"input\":[{\"type\":\"message\",\"role\":\"user\",\"content\":\"start\"}]}}")"
turn_id="$(sed -nE 's/.*"turn":\{"id":"([0-9]+)".*/\1/p' <<<"${turn}" | head -n 1)"
if [[ -z "${turn_id}" ]]; then
  echo "failed to parse turn id" >&2
  echo "${turn}" >&2
  exit 1
fi

steer="$(rpc "{\"jsonrpc\":\"2.0\",\"id\":3,\"method\":\"turn/steer\",\"params\":{\"threadId\":\"${thread_id}\",\"expectedTurnId\":\"${turn_id}\",\"input\":[{\"type\":\"message\",\"role\":\"user\",\"content\":\"steered\"}]}}")"
if ! rg -q "\"turnId\":\"${turn_id}\"" <<<"${steer}"; then
  echo "turn/steer response mismatch" >&2
  echo "${steer}" >&2
  exit 1
fi

items="$(rpc "{\"jsonrpc\":\"2.0\",\"id\":4,\"method\":\"thread/turns/items/list\",\"params\":{\"threadId\":\"${thread_id}\",\"turnId\":\"${turn_id}\"}}")"
if ! rg -q '"data":\[\{"type":"message","role":"user","content":"start"\},\{"type":"message","role":"user","content":"steered"\}\]' <<<"${items}"; then
  echo "turn/steer did not append input items" >&2
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
    && rg -q '"content":"steered"' "${events_out}"; then
    break
  fi
  sleep 0.1
done
if ! rg -q '"content":"steered"' "${events_out}"; then
  echo "turn/steer input item lifecycle events missing" >&2
  echo "--- events ---" >&2
  cat "${events_out}" >&2
  echo "--- curl stderr ---" >&2
  cat "${events_err}" >&2
  exit 1
fi

empty_first_turn="$(rpc "{\"jsonrpc\":\"2.0\",\"id\":5,\"method\":\"turn/start\",\"params\":{\"threadId\":\"${thread_id}\",\"input\":[]}}")"
empty_first_turn_id="$(sed -nE 's/.*"turn":\{"id":"([0-9]+)".*/\1/p' <<<"${empty_first_turn}" | head -n 1)"
if [[ -z "${empty_first_turn_id}" ]]; then
  echo "failed to parse empty-first turn id" >&2
  echo "${empty_first_turn}" >&2
  exit 1
fi

rpc "{\"jsonrpc\":\"2.0\",\"id\":6,\"method\":\"turn/steer\",\"params\":{\"threadId\":\"${thread_id}\",\"expectedTurnId\":\"${empty_first_turn_id}\",\"input\":[{\"type\":\"message\",\"role\":\"user\",\"content\":\"after-empty\"}]}}" >/dev/null
empty_first_items="$(rpc "{\"jsonrpc\":\"2.0\",\"id\":7,\"method\":\"thread/turns/items/list\",\"params\":{\"threadId\":\"${thread_id}\",\"turnId\":\"${empty_first_turn_id}\"}}")"
if ! rg -q '"data":\[\{"type":"message","role":"user","content":"after-empty"\}\]' <<<"${empty_first_items}"; then
  echo "turn/steer did not replace empty initial items cleanly" >&2
  echo "${empty_first_items}" >&2
  exit 1
fi

rpc "{\"jsonrpc\":\"2.0\",\"id\":8,\"method\":\"turn/steer\",\"params\":{\"threadId\":\"${thread_id}\",\"expectedTurnId\":\"${empty_first_turn_id}\",\"input\":[]}}" >/dev/null
empty_append_items="$(rpc "{\"jsonrpc\":\"2.0\",\"id\":9,\"method\":\"thread/turns/items/list\",\"params\":{\"threadId\":\"${thread_id}\",\"turnId\":\"${empty_first_turn_id}\"}}")"
if ! rg -q '"data":\[\{"type":"message","role":"user","content":"after-empty"\}\]' <<<"${empty_append_items}"; then
  echo "turn/steer empty input changed existing items" >&2
  echo "${empty_append_items}" >&2
  exit 1
fi

echo "turn_steer_items_ok thread=${thread_id} turn=${turn_id}"
