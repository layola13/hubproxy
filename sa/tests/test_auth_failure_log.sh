#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
sa_dir="$(cd "${script_dir}/.." && pwd)"
project_dir="$(cd "${sa_dir}/.." && pwd)"
source "${script_dir}/lib/runtime_env.sh"
env_file="${project_dir}/.env"
tmp_dir="$(mktemp -d)"
response_body="${tmp_dir}/response.json"
log_dir="${tmp_dir}/logs"
sa_port="${SA_TEST_PROXY_PORT:-$(sa_test_free_port)}"
hub_pid=""

cleanup() {
  if [[ -n "${hub_pid}" ]]; then sa_test_stop_pid "${hub_pid}"; fi
  rm -rf "${tmp_dir}"
}
trap cleanup EXIT

sa_test_assert_port_free "${sa_port}"

awk -v port="${sa_port}" -v log_dir="${log_dir}" '
  BEGIN { wrote_auth=0; wrote_log=0; wrote_sa_port=0 }
  /^AUTH=/ { print "AUTH=zzz111222333444"; wrote_auth=1; next }
  /^HUBPROXY_LOG_DIR=/ { print "HUBPROXY_LOG_DIR=" log_dir; wrote_log=1; next }
  /^SA_PORT=/ { print "SA_PORT=" port; wrote_sa_port=1; next }
  /^PORT=/ { print "PORT=" port; next }
  { print }
  END {
    if (!wrote_auth) print "AUTH=zzz111222333444"
    if (!wrote_log) print "HUBPROXY_LOG_DIR=" log_dir
    if (!wrote_sa_port) print "SA_PORT=" port
  }
' "${env_file}" >"${tmp_dir}/.env"

hub_pid="$(sa_test_start_hubproxy "${sa_dir}" "${tmp_dir}" "${tmp_dir}/hubproxy.log")"
if ! sa_test_wait_port "${sa_port}" 50 0.1; then
  echo "hubproxy did not start on ${sa_port}" >&2
  cat "${tmp_dir}/hubproxy.log" >&2 || true
  exit 1
fi

status="$(curl -sS --max-time 15 -o "${response_body}" -w '%{http_code}' \
  -H 'authorization: Bearer abcdef123456789' \
  -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' \
  "http://127.0.0.1:${sa_port}/rpc")"

if [[ "${status}" != "401" ]]; then
  echo "unauthorized rpc did not return 401" >&2
  echo "status=${status}" >&2
  cat "${response_body}" >&2
  exit 1
fi

log_file="${log_dir}/request-sa-auth.json"
if [[ ! -s "${log_file}" ]]; then
  echo "auth failure log file was not written" >&2
  ls -la "${log_dir}" >&2 || true
  cat "${tmp_dir}/hubproxy.log" >&2 || true
  exit 1
fi

if ! rg -q '"kind":"auth_failure"' "${log_file}" \
  || ! rg -q '"path":"/rpc"' "${log_file}" \
  || ! rg -q '"authorization":"abc\.\.\.789 \(len=15\)"' "${log_file}" \
  || ! rg -q '"expectedAuth":"zzz\.\.\.444 \(len=15\)"' "${log_file}"; then
  echo "auth failure log missing expected previews" >&2
  cat "${log_file}" >&2
  exit 1
fi

request_log_file="${log_dir}/request-sa-api.json"
if [[ ! -s "${request_log_file}" ]]; then
  echo "api request log file was not written before auth rejection" >&2
  ls -la "${log_dir}" >&2 || true
  cat "${tmp_dir}/hubproxy.log" >&2 || true
  exit 1
fi

if ! rg -q '"kind":"request-log"' "${request_log_file}" \
  || ! rg -q '"path":"/rpc"' "${request_log_file}" \
  || ! rg -q '"method":"POST"' "${request_log_file}" \
  || ! rg -q '"bodyBytes":[1-9][0-9]*' "${request_log_file}" \
  || ! rg -q '"headers":\{"authorization":"abc\.\.\.789 \(len=15\)","x-api-key":"none","content-type":"application/json"\}' "${request_log_file}" \
  || ! rg -q '"body":"\{\\"jsonrpc\\":\\"2\.0\\",\\"id\\":1,\\"method\\":\\"initialize\\"' "${request_log_file}"; then
  echo "api request log missing expected unauthorized rpc fields" >&2
  cat "${request_log_file}" >&2
  exit 1
fi

echo "auth_failure_log_ok"
