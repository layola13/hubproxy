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
  BEGIN { wrote_auth=0; wrote_port=0; wrote_dir=0 }
  /^AUTH=/ { print "AUTH=client-secret"; wrote_auth=1; next }
  /^SA_PORT=/ { print "SA_PORT=" port; wrote_port=1; next }
  /^PORT=/ { print "PORT=" port; next }
  /^DATA_DIR=/ { print "DATA_DIR=/tmp/not-external-detect-cwd"; wrote_dir=1; next }
  { print }
  END {
    if (!wrote_auth) print "AUTH=client-secret"
    if (!wrote_port) print "SA_PORT=" port
    if (!wrote_dir) print "DATA_DIR=/tmp/not-external-detect-cwd"
  }
' "${env_file}" >"${tmp_dir}/.env"

(
  cd "${tmp_dir}"
  env PWD=/tmp/not-external-detect-pwd setsid "${sa_dir}/hubproxy" >"${tmp_dir}/hubproxy.log" 2>&1 < /dev/null &
  echo "$!" >"${tmp_dir}/hubproxy.pid"
)
hub_pid="$(cat "${tmp_dir}/hubproxy.pid")"

if ! sa_test_wait_port "${sa_port}" 50 0.1; then
  echo "hubproxy did not start on ${sa_port}" >&2
  cat "${tmp_dir}/hubproxy.log" >&2 || true
  exit 1
fi

response="$(curl -sS --max-time 15 \
  -H 'authorization: Bearer client-secret' \
  -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"externalAgentConfig/detect","params":{}}' \
  "http://127.0.0.1:${sa_port}/rpc")"

if [[ "$(rg -o "\"cwd\":\"${tmp_dir}\"" <<<"${response}" | wc -l)" -ne 2 ]]; then
  echo "externalAgentConfig/detect did not use Deno.cwd for both items" >&2
  echo "${response}" >&2
  exit 1
fi

if ! rg -q "\"path\":\"${tmp_dir}/Agents.md\"" <<<"${response}" \
  || ! rg -q "\"path\":\"${tmp_dir}/.env\"" <<<"${response}"; then
  echo "externalAgentConfig/detect did not build Deno.cwd-based details.path values" >&2
  echo "${response}" >&2
  exit 1
fi

if rg -q '/tmp/not-external-detect-pwd|/tmp/not-external-detect-cwd' <<<"${response}" \
  || rg -Fq '"cwd":"."' <<<"${response}" \
  || rg -Fq '"path":"./' <<<"${response}"; then
  echo "externalAgentConfig/detect leaked PWD, DATA_DIR, or legacy dot paths" >&2
  echo "${response}" >&2
  exit 1
fi

echo "external_detect_cwd_ok"
