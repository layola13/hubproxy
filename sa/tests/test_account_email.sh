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
  BEGIN { wrote_auth=0; wrote_port=0; wrote_email=0 }
  /^AUTH=/ { print "AUTH=client-secret"; wrote_auth=1; next }
  /^SA_PORT=/ { print "SA_PORT=" port; wrote_port=1; next }
  /^PORT=/ { print "PORT=" port; next }
  /^ACCOUNT_EMAIL=/ { print "ACCOUNT_EMAIL=alice@example.com"; wrote_email=1; next }
  { print }
  END {
    if (!wrote_auth) print "AUTH=client-secret"
    if (!wrote_port) print "SA_PORT=" port
    if (!wrote_email) print "ACCOUNT_EMAIL=alice@example.com"
  }
' "${env_file}" >"${tmp_dir}/.env"

hub_pid="$(sa_test_start_hubproxy "${sa_dir}" "${tmp_dir}" "${tmp_dir}/hubproxy.log")"
if ! sa_test_wait_port "${sa_port}" 50 0.1; then
  echo "hubproxy did not start on ${sa_port}" >&2
  cat "${tmp_dir}/hubproxy.log" >&2 || true
  exit 1
fi

account="$(curl -sS --max-time 15 \
  -H 'authorization: Bearer client-secret' \
  -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"account/read","params":{}}' \
  "http://127.0.0.1:${sa_port}/rpc")"

if ! rg -q '"type":"chatgpt"' <<<"${account}" || ! rg -q '"email":"alice@example.com"' <<<"${account}"; then
  echo "account/read did not use ACCOUNT_EMAIL" >&2
  echo "${account}" >&2
  exit 1
fi

echo "account_email_ok"
