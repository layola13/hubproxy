#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
sa_dir="$(cd "${script_dir}/.." && pwd)"
project_dir="$(cd "${sa_dir}/.." && pwd)"
env_file="${project_dir}/.env"
backup_file="$(mktemp)"
hub_pid=""

cleanup() {
  if [[ -n "${hub_pid}" ]]; then
    kill "${hub_pid}" 2>/dev/null || true
    wait "${hub_pid}" 2>/dev/null || true
  fi
  cp "${backup_file}" "${env_file}"
  rm -f "${backup_file}"
}
trap cleanup EXIT

cp "${env_file}" "${backup_file}"

old_pid="$(ss -ltnp | sed -n 's/.*0\.0\.0\.0:28080.*pid=\([0-9]*\).*/\1/p' | head -n 1)"
if [[ -n "${old_pid}" ]]; then
  kill "${old_pid}" 2>/dev/null || true
  sleep 0.3
fi

awk '
  BEGIN { wrote_auth=0; wrote_port=0; wrote_dir=0 }
  /^AUTH=/ { print "AUTH=client-secret"; wrote_auth=1; next }
  /^SA_PORT=/ { print "SA_PORT=28080"; wrote_port=1; next }
  /^DATA_DIR=/ { print "DATA_DIR=/tmp/not-external-detect-cwd"; wrote_dir=1; next }
  { print }
  END {
    if (!wrote_auth) print "AUTH=client-secret"
    if (!wrote_port) print "SA_PORT=28080"
    if (!wrote_dir) print "DATA_DIR=/tmp/not-external-detect-cwd"
  }
' "${backup_file}" >"${env_file}"

(
  cd "${sa_dir}"
  env PWD=/tmp/not-external-detect-pwd setsid "${sa_dir}/hubproxy" > /tmp/hubproxy_sa_external_detect_cwd.log 2>&1 < /dev/null &
  echo "$!" > /tmp/hubproxy_sa_external_detect_cwd.pid
)
hub_pid="$(cat /tmp/hubproxy_sa_external_detect_cwd.pid)"
rm -f /tmp/hubproxy_sa_external_detect_cwd.pid

for _ in {1..50}; do
  if ss -ltnp | rg -q '0\.0\.0\.0:28080'; then
    break
  fi
  sleep 0.1
done

response="$(curl -sS --max-time 15 \
  -H 'authorization: Bearer client-secret' \
  -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"externalAgentConfig/detect","params":{}}' \
  'http://127.0.0.1:28080/rpc')"

if [[ "$(rg -o "\"cwd\":\"${sa_dir}\"" <<<"${response}" | wc -l)" -ne 2 ]]; then
  echo "externalAgentConfig/detect did not use Deno.cwd for both items" >&2
  echo "${response}" >&2
  exit 1
fi

if ! rg -q "\"path\":\"${sa_dir}/Agents.md\"" <<<"${response}" \
  || ! rg -q "\"path\":\"${sa_dir}/.env\"" <<<"${response}"; then
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
