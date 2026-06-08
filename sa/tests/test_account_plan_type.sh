#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
sa_dir="$(cd "${script_dir}/.." && pwd)"
project_dir="$(cd "${sa_dir}/.." && pwd)"
source "${script_dir}/lib/runtime_env.sh"
env_file="${project_dir}/.env"
tmp_dir="$(mktemp -d)"
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

awk -v port="${sa_port}" '
  BEGIN { wrote_auth=0; wrote_port=0; wrote_plan=0 }
  /^AUTH=/ { print "AUTH=client-secret"; wrote_auth=1; next }
  /^SA_PORT=/ { print "SA_PORT=" port; wrote_port=1; next }
  /^PORT=/ { print "PORT=" port; next }
  /^ACCOUNT_PLAN_TYPE=/ { print "ACCOUNT_PLAN_TYPE=enterprise"; wrote_plan=1; next }
  { print }
  END {
    if (!wrote_auth) print "AUTH=client-secret"
    if (!wrote_port) print "SA_PORT=" port
    if (!wrote_plan) print "ACCOUNT_PLAN_TYPE=enterprise"
  }
' "${env_file}" >"${tmp_dir}/.env"

hub_pid="$(sa_test_start_hubproxy "${sa_dir}" "${tmp_dir}" "${tmp_dir}/hubproxy.log")"
if ! sa_test_wait_port "${sa_port}" 50 0.1; then
  echo "hubproxy did not start on ${sa_port}" >&2
  cat "${tmp_dir}/hubproxy.log" >&2 || true
  exit 1
fi

rpc() {
  curl -sS --max-time 15 \
    -H 'authorization: Bearer client-secret' \
    -H 'content-type: application/json' \
    --data "$1" \
    "http://127.0.0.1:${sa_port}/rpc"
}

account="$(rpc '{"jsonrpc":"2.0","id":1,"method":"account/read","params":{}}')"
if ! rg -q '"type":"chatgpt"' <<<"${account}" || ! rg -q '"planType":"enterprise"' <<<"${account}"; then
  echo "account/read did not use ACCOUNT_PLAN_TYPE" >&2
  echo "${account}" >&2
  exit 1
fi

rates="$(rpc '{"jsonrpc":"2.0","id":2,"method":"account/rateLimits/read","params":{}}')"
if ! rg -q '"planType":"enterprise"' <<<"${rates}"; then
  echo "account/rateLimits/read did not use ACCOUNT_PLAN_TYPE" >&2
  echo "${rates}" >&2
  exit 1
fi

sa_test_stop_pid "${hub_pid}"
hub_pid=""
sleep 0.3

sa_test_write_env_from_root "${env_file}" "${tmp_dir}/.env" "${sa_port}" "client-secret"
hub_pid="$(sa_test_start_hubproxy "${sa_dir}" "${tmp_dir}" "${tmp_dir}/hubproxy-default.log")"

if ! sa_test_wait_port "${sa_port}" 50 0.1; then
  echo "hubproxy did not restart on ${sa_port}" >&2
  cat "${tmp_dir}/hubproxy-default.log" >&2 || true
  exit 1
fi

default_account="$(curl -sS --max-time 15 \
  -H 'authorization: Bearer client-secret' \
  -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":3,"method":"account/read","params":{}}' \
  "http://127.0.0.1:${sa_port}/rpc")"

if ! rg -q '"planType":"plus"' <<<"${default_account}"; then
  echo "account/read did not default planType to plus" >&2
  echo "${default_account}" >&2
  exit 1
fi

echo "account_plan_type_ok"
