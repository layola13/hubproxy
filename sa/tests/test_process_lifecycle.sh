#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
sa_dir="$(cd "${script_dir}/.." && pwd)"
project_dir="$(cd "${sa_dir}/.." && pwd)"
env_file="${project_dir}/.env"
auth_token="$(awk -F= '/^AUTH=/{print substr($0, index($0,"=")+1)}' "${env_file}" | tail -n 1)"
hub_pid=""

cleanup() {
  if [[ -n "${hub_pid}" ]]; then
    kill "${hub_pid}" 2>/dev/null || true
    wait "${hub_pid}" 2>/dev/null || true
  fi
}
trap cleanup EXIT

old_pid="$(ss -ltnp | sed -n 's/.*0\.0\.0\.0:28080.*pid=\([0-9]*\).*/\1/p' | head -n 1)"
if [[ -n "${old_pid}" ]]; then
  kill "${old_pid}" 2>/dev/null || true
  sleep 0.3
fi

setsid "${sa_dir}/hubproxy" > /tmp/hubproxy_sa_process_lifecycle.log 2>&1 < /dev/null &
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

spawn="$(rpc '{"jsonrpc":"2.0","id":1,"method":"process/spawn","params":{"command":["echo","proc-life"],"processHandle":"proc-life"}}')"
if ! rg -q '"processHandle":"proc-life"' <<<"${spawn}"; then
  echo "process/spawn did not return requested handle" >&2
  echo "${spawn}" >&2
  exit 1
fi

kill_one="$(rpc '{"jsonrpc":"2.0","id":2,"method":"process/kill","params":{"processHandle":"proc-life"}}')"
if ! rg -q '"ok":true' <<<"${kill_one}"; then
  echo "first process/kill should return ok true for an existing handle" >&2
  echo "${kill_one}" >&2
  exit 1
fi

kill_two="$(rpc '{"jsonrpc":"2.0","id":3,"method":"process/kill","params":{"processHandle":"proc-life"}}')"
if ! rg -q '"ok":false' <<<"${kill_two}"; then
  echo "second process/kill should return ok false after deletion" >&2
  echo "${kill_two}" >&2
  exit 1
fi

echo "process_lifecycle_ok"
