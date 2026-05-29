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

cleanup() {
  if [[ -n "${hub_pid}" ]]; then
    kill "${hub_pid}" 2>/dev/null || true
    wait "${hub_pid}" 2>/dev/null || true
  fi
}
trap cleanup EXIT

old_pid="$(ss -ltnp | sed -nE "s/.*:${sa_port} .*pid=([0-9]+).*/\\1/p" | head -n 1)"
if [[ -n "${old_pid}" ]]; then
  kill "${old_pid}" 2>/dev/null || true
  sleep 0.3
fi

setsid "${sa_dir}/hubproxy" > /tmp/hubproxy_sa_thread_rollback_numeric.log 2>&1 < /dev/null &
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

start="$(rpc '{"jsonrpc":"2.0","id":1,"method":"thread/start","params":{}}')"
thread_id="$(sed -nE 's/.*"thread":\{"id":"([0-9]+)".*/\1/p' <<<"${start}" | head -n 1)"
if [[ -z "${thread_id}" ]]; then
  echo "failed to parse thread id" >&2
  echo "${start}" >&2
  exit 1
fi

turn_one="$(rpc "{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"turn/start\",\"params\":{\"threadId\":\"${thread_id}\",\"input\":[{\"type\":\"message\",\"content\":\"one\"}]}}")"
turn_two="$(rpc "{\"jsonrpc\":\"2.0\",\"id\":3,\"method\":\"turn/start\",\"params\":{\"threadId\":\"${thread_id}\",\"input\":[{\"type\":\"message\",\"content\":\"two\"}]}}")"
turn_one_id="$(sed -nE 's/.*"turn":\{"id":"([0-9]+)".*/\1/p' <<<"${turn_one}" | head -n 1)"
turn_two_id="$(sed -nE 's/.*"turn":\{"id":"([0-9]+)".*/\1/p' <<<"${turn_two}" | head -n 1)"
if [[ -z "${turn_one_id}" || -z "${turn_two_id}" ]]; then
  echo "failed to parse turn ids" >&2
  echo "${turn_one}" >&2
  echo "${turn_two}" >&2
  exit 1
fi

rollback="$(rpc "{\"jsonrpc\":\"2.0\",\"id\":4,\"method\":\"thread/rollback\",\"params\":{\"threadId\":\"${thread_id}\",\"numTurns\":1}}")"
turns="$(rpc "{\"jsonrpc\":\"2.0\",\"id\":5,\"method\":\"thread/turns/list\",\"params\":{\"threadId\":\"${thread_id}\"}}")"

if ! rg -q "\"id\":\"${turn_one_id}\"" <<<"${rollback}" || rg -q "\"id\":\"${turn_two_id}\"" <<<"${rollback}"; then
  echo "thread/rollback numeric response mismatch" >&2
  echo "--- rollback ---" >&2
  echo "${rollback}" >&2
  exit 1
fi
if ! rg -q "\"id\":\"${turn_one_id}\"" <<<"${turns}" || rg -q "\"id\":\"${turn_two_id}\"" <<<"${turns}"; then
  echo "thread/turns/list after numeric rollback mismatch" >&2
  echo "--- turns ---" >&2
  echo "${turns}" >&2
  exit 1
fi

echo "thread_rollback_numeric_num_turns_ok thread=${thread_id} kept=${turn_one_id} removed=${turn_two_id}"
