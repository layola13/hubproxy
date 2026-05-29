#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
sa_dir="$(cd "${script_dir}/.." && pwd)"
project_dir="$(cd "${sa_dir}/.." && pwd)"
env_file="${project_dir}/.env"
backup_file="$(mktemp)"
response_body="$(mktemp)"
log_dir="$(mktemp -d)"
hub_pid=""

cleanup() {
  if [[ -n "${hub_pid}" ]]; then
    kill "${hub_pid}" 2>/dev/null || true
    wait "${hub_pid}" 2>/dev/null || true
  fi
  cp "${backup_file}" "${env_file}"
  rm -f "${backup_file}" "${response_body}"
  rm -rf "${log_dir}"
}
trap cleanup EXIT

cp "${env_file}" "${backup_file}"

old_pid="$(ss -ltnp | sed -n 's/.*0\.0\.0\.0:28080.*pid=\([0-9]*\).*/\1/p' | head -n 1)"
if [[ -n "${old_pid}" ]]; then
  kill "${old_pid}" 2>/dev/null || true
  sleep 0.3
fi

awk -v log_dir="${log_dir}" '
  BEGIN { wrote_auth=0; wrote_log=0; wrote_sa_port=0 }
  /^AUTH=/ { print "AUTH=zzz111222333444"; wrote_auth=1; next }
  /^HUBPROXY_LOG_DIR=/ { print "HUBPROXY_LOG_DIR=" log_dir; wrote_log=1; next }
  /^SA_PORT=/ { print "SA_PORT=28080"; wrote_sa_port=1; next }
  { print }
  END {
    if (!wrote_auth) print "AUTH=zzz111222333444"
    if (!wrote_log) print "HUBPROXY_LOG_DIR=" log_dir
    if (!wrote_sa_port) print "SA_PORT=28080"
  }
' "${backup_file}" >"${env_file}"

setsid "${sa_dir}/hubproxy" > /tmp/hubproxy_sa_auth_failure_log.log 2>&1 < /dev/null &
hub_pid=$!

for _ in {1..50}; do
  if ss -ltnp | rg -q '0\.0\.0\.0:28080'; then
    break
  fi
  sleep 0.1
done

status="$(curl -sS --max-time 15 -o "${response_body}" -w '%{http_code}' \
  -H 'authorization: Bearer abcdef123456789' \
  -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' \
  'http://127.0.0.1:28080/rpc')"

if [[ "${status}" != "401" ]]; then
  echo "unauthorized rpc did not return 401" >&2
  echo "status=${status}" >&2
  cat "${response_body}" >&2
  exit 1
fi

log_file="${log_dir}/request-sa-auth.json"
if [[ ! -s "${log_file}" ]]; then
  echo "auth failure log file was not written" >&2
  ls -la "${log_dir}" >&2
  cat /tmp/hubproxy_sa_auth_failure_log.log >&2 || true
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
  ls -la "${log_dir}" >&2
  cat /tmp/hubproxy_sa_auth_failure_log.log >&2 || true
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
