#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
sa_dir="$(cd "${script_dir}/.." && pwd)"
project_dir="$(cd "${sa_dir}/.." && pwd)"
source "${script_dir}/lib/runtime_env.sh"
env_file="${project_dir}/.env"
tmp_dir="$(mktemp -d)"
auth_token="client-secret"
sa_port="${SA_TEST_PROXY_PORT:-$(sa_test_free_port)}"
hub_pid=""

cleanup() {
  if [[ -n "${hub_pid}" ]]; then
    sa_test_stop_pid "${hub_pid}"
  fi
  rm -rf "${tmp_dir}"
}
trap cleanup EXIT

sa_test_assert_port_free "${sa_port}"
sa_test_write_env_from_root "${env_file}" "${tmp_dir}/.env" "${sa_port}" "${auth_token}"

hub_pid="$(sa_test_start_hubproxy "${sa_dir}" "${tmp_dir}" "${tmp_dir}/hubproxy.log")"
if ! sa_test_wait_port "${sa_port}" 50 0.1; then
  echo "hubproxy did not start on ${sa_port}" >&2
  cat "${tmp_dir}/hubproxy.log" >&2 || true
  exit 1
fi

rpc() {
  curl -sS --max-time 15 \
    -H "authorization: Bearer ${auth_token}" \
    -H 'content-type: application/json' \
    --data "$1" \
    "http://127.0.0.1:${sa_port}/rpc"
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
