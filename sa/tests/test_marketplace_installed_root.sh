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
  BEGIN { wrote_auth=0; wrote_port=0 }
  /^AUTH=/ { print "AUTH=client-secret"; wrote_auth=1; next }
  /^SA_PORT=/ { print "SA_PORT=28080"; wrote_port=1; next }
  { print }
  END {
    if (!wrote_auth) print "AUTH=client-secret"
    if (!wrote_port) print "SA_PORT=28080"
  }
' "${backup_file}" >"${env_file}"

(
  cd "${sa_dir}"
  env PWD=/tmp/not-marketplace-root setsid "${sa_dir}/hubproxy" > /tmp/hubproxy_sa_marketplace_installed_root.log 2>&1 < /dev/null &
  echo "$!" > /tmp/hubproxy_sa_marketplace_installed_root.pid
)
hub_pid="$(cat /tmp/hubproxy_sa_marketplace_installed_root.pid)"
rm -f /tmp/hubproxy_sa_marketplace_installed_root.pid

for _ in {1..50}; do
  if ss -ltnp | rg -q '0\.0\.0\.0:28080'; then
    break
  fi
  sleep 0.1
done

add_response="$(curl -sS --max-time 15 \
  -H 'authorization: Bearer client-secret' \
  -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"marketplace/add","params":{"source":"local"}}' \
  'http://127.0.0.1:28080/rpc')"

remove_response="$(curl -sS --max-time 15 \
  -H 'authorization: Bearer client-secret' \
  -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":2,"method":"marketplace/remove","params":{"marketplaceName":"local"}}' \
  'http://127.0.0.1:28080/rpc')"

if ! rg -q "\"installedRoot\":\"${sa_dir}\"" <<<"${add_response}" \
  || ! rg -q '"marketplaceName":"local"' <<<"${add_response}"; then
  echo "marketplace/add did not return Deno.cwd installedRoot" >&2
  echo "${add_response}" >&2
  exit 1
fi

if ! rg -q "\"installedRoot\":\"${sa_dir}\"" <<<"${remove_response}" \
  || ! rg -q '"marketplaceName":"local"' <<<"${remove_response}"; then
  echo "marketplace/remove did not return Deno.cwd installedRoot" >&2
  echo "${remove_response}" >&2
  exit 1
fi

if rg -q '"installedRoot":"\\."' <<<"${add_response}${remove_response}" \
  || rg -q '/tmp/not-marketplace-root' <<<"${add_response}${remove_response}"; then
  echo "marketplace installedRoot leaked legacy dot or PWD" >&2
  echo "${add_response}" >&2
  echo "${remove_response}" >&2
  exit 1
fi

echo "marketplace_installed_root_ok"
