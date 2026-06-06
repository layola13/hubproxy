#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
sa_dir="$(cd "${script_dir}/.." && pwd)"
env_file="${sa_dir}/.env"
auth_token="test-secret"
sa_port="${SA_TEST_PROXY_PORT:-28235}"
base_url="http://127.0.0.1:${sa_port}"
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

if ss -ltn | rg -q ":${sa_port}\\b"; then
  echo "test port already in use: ${sa_port}" >&2
  exit 1
fi

awk -v port="${sa_port}" -v auth="${auth_token}" '
  BEGIN { wrote_sa=0; wrote_port=0; wrote_auth=0 }
  /^SA_PORT=/ { print "SA_PORT=" port; wrote_sa=1; next }
  /^PORT=/ { print "PORT=" port; wrote_port=1; next }
  /^AUTH=/ { print "AUTH=" auth; wrote_auth=1; next }
  { print }
  END {
    if (!wrote_sa) print "SA_PORT=" port
    if (!wrote_port) print "PORT=" port
    if (!wrote_auth) print "AUTH=" auth
  }
' "${env_file}" > "${tmp_dir}/.env"

(
  cd "${tmp_dir}"
  setsid "${sa_dir}/hubproxy" > "${tmp_dir}/hubproxy.log" 2>&1 < /dev/null &
  echo "$!" > "${tmp_dir}/hubproxy.pid"
)
hub_pid="$(cat "${tmp_dir}/hubproxy.pid")"

for _ in {1..50}; do
  if ss -ltn | rg -q ":${sa_port} "; then
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

turn_three="$(rpc "{\"jsonrpc\":\"2.0\",\"id\":6,\"method\":\"turn/start\",\"params\":{\"threadId\":\"${thread_id}\",\"input\":[{\"type\":\"message\",\"content\":\"three\"}]}}")"
turn_three_id="$(sed -nE 's/.*"turn":\{"id":"([0-9]+)".*/\1/p' <<<"${turn_three}" | head -n 1)"
if [[ -z "${turn_three_id}" ]]; then
  echo "failed to parse third turn id" >&2
  echo "${turn_three}" >&2
  exit 1
fi

rollback_zero="$(rpc "{\"jsonrpc\":\"2.0\",\"id\":7,\"method\":\"thread/rollback\",\"params\":{\"threadId\":\"${thread_id}\",\"numTurns\":0}}")"
if ! rg -q "\"id\":\"${turn_one_id}\"" <<<"${rollback_zero}" || ! rg -q "\"id\":\"${turn_three_id}\"" <<<"${rollback_zero}"; then
  echo "thread/rollback numTurns=0 should keep all turns like Deno" >&2
  echo "--- rollback zero ---" >&2
  echo "${rollback_zero}" >&2
  exit 1
fi

rollback_all="$(rpc "{\"jsonrpc\":\"2.0\",\"id\":8,\"method\":\"thread/rollback\",\"params\":{\"threadId\":\"${thread_id}\",\"numTurns\":999}}")"
if ! rg -q '"turns":\[\]' <<<"${rollback_all}"; then
  echo "thread/rollback larger than turn count should clear all turns like Deno" >&2
  echo "--- rollback all ---" >&2
  echo "${rollback_all}" >&2
  exit 1
fi

echo "thread_rollback_numeric_num_turns_ok thread=${thread_id} kept=${turn_one_id} removed=${turn_two_id}"
