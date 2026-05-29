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
  BEGIN { wrote_auth=0; wrote_port=0; wrote_plan=0 }
  /^AUTH=/ { print "AUTH=client-secret"; wrote_auth=1; next }
  /^SA_PORT=/ { print "SA_PORT=28080"; wrote_port=1; next }
  /^ACCOUNT_PLAN_TYPE=/ { print "ACCOUNT_PLAN_TYPE=enterprise"; wrote_plan=1; next }
  { print }
  END {
    if (!wrote_auth) print "AUTH=client-secret"
    if (!wrote_port) print "SA_PORT=28080"
    if (!wrote_plan) print "ACCOUNT_PLAN_TYPE=enterprise"
  }
' "${backup_file}" >"${env_file}"

setsid "${sa_dir}/hubproxy" > /tmp/hubproxy_sa_account_plan_type.log 2>&1 < /dev/null &
hub_pid=$!

for _ in {1..50}; do
  if ss -ltnp | rg -q '0\.0\.0\.0:28080'; then
    break
  fi
  sleep 0.1
done

rpc() {
  curl -sS --max-time 15 \
    -H 'authorization: Bearer client-secret' \
    -H 'content-type: application/json' \
    --data "$1" \
    'http://127.0.0.1:28080/rpc'
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

cp "${backup_file}" "${env_file}"
kill "${hub_pid}" 2>/dev/null || true
wait "${hub_pid}" 2>/dev/null || true
hub_pid=""
sleep 0.3

setsid "${sa_dir}/hubproxy" > /tmp/hubproxy_sa_account_plan_type_default.log 2>&1 < /dev/null &
hub_pid=$!

for _ in {1..50}; do
  if ss -ltnp | rg -q '0\.0\.0\.0:28080'; then
    break
  fi
  sleep 0.1
done

auth_token="$(awk -F= '/^AUTH=/{print substr($0, index($0,"=")+1)}' "${env_file}" | tail -n 1)"
default_account="$(curl -sS --max-time 15 \
  -H "authorization: Bearer ${auth_token}" \
  -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":3,"method":"account/read","params":{}}' \
  'http://127.0.0.1:28080/rpc')"

if ! rg -q '"planType":"plus"' <<<"${default_account}"; then
  echo "account/read did not default planType to plus" >&2
  echo "${default_account}" >&2
  exit 1
fi

echo "account_plan_type_ok"
