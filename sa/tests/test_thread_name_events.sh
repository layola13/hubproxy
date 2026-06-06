#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
sa_dir="$(cd "${script_dir}/.." && pwd)"
env_file="${sa_dir}/.env"
auth_token="test-secret"
sa_port="${SA_TEST_PROXY_PORT:-28242}"
base_url="http://127.0.0.1:${sa_port}"

tmp_dir="$(mktemp -d)"
events_out="${tmp_dir}/events.out"
events_err="${tmp_dir}/events.err"
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

set_name="$(rpc "{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"thread/name/set\",\"params\":{\"threadId\":\"${thread_id}\",\"name\":\"renamed\"}}")"
if ! rg -q "\"threadId\":\"${thread_id}\"" <<<"${set_name}" || ! rg -q '"name":"renamed"' <<<"${set_name}"; then
  echo "thread/name/set response mismatch" >&2
  echo "${set_name}" >&2
  exit 1
fi

clear_name="$(rpc "{\"jsonrpc\":\"2.0\",\"id\":3,\"method\":\"thread/name/set\",\"params\":{\"threadId\":\"${thread_id}\",\"name\":null}}")"
if ! rg -q "\"threadId\":\"${thread_id}\"" <<<"${clear_name}" || ! rg -q '"name":null' <<<"${clear_name}"; then
  echo "thread/name/set clear response mismatch" >&2
  echo "${clear_name}" >&2
  exit 1
fi

deadline=$((SECONDS + 6))
while (( SECONDS < deadline )); do
  if [[ "$(rg -c 'event: thread/name/updated' "${events_out}" || true)" -ge 2 ]] \
    && rg -q "\"threadId\":\"${thread_id}\",\"name\":\"renamed\"" "${events_out}" \
    && rg -q "\"threadId\":\"${thread_id}\",\"name\":null" "${events_out}"; then
    stop_events
    echo "thread_name_events_ok thread=${thread_id}"
    exit 0
  fi
  sleep 0.1
done

stop_events
echo "thread/name/updated events missing" >&2
echo "--- set response ---" >&2
echo "${set_name}" >&2
echo "--- clear response ---" >&2
echo "${clear_name}" >&2
echo "--- events ---" >&2
cat "${events_out}" >&2
echo "--- curl stderr ---" >&2
cat "${events_err}" >&2
exit 1
