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
  setsid "${sa_dir}/hubproxy" > /tmp/hubproxy_sa_plugin_share_update_targets.log 2>&1 < /dev/null &
  echo "$!" > /tmp/hubproxy_sa_plugin_share_update_targets.pid
)
hub_pid="$(cat /tmp/hubproxy_sa_plugin_share_update_targets.pid)"
rm -f /tmp/hubproxy_sa_plugin_share_update_targets.pid

for _ in {1..50}; do
  if ss -ltnp | rg -q '0\.0\.0\.0:28080'; then
    break
  fi
  sleep 0.1
done

array_response="$(curl -sS --max-time 15 \
  -H 'authorization: Bearer client-secret' \
  -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"plugin/share/updateTargets","params":{"principals":["user:a@example.com",{"kind":"team","id":"dev"}]}}' \
  'http://127.0.0.1:28080/rpc')"

fallback_response="$(curl -sS --max-time 15 \
  -H 'authorization: Bearer client-secret' \
  -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":2,"method":"plugin/share/updateTargets","params":{"principals":"not-array"}}' \
  'http://127.0.0.1:28080/rpc')"

python3 - "${array_response}" "${fallback_response}" <<'PY'
import json
import sys

array_payload = json.loads(sys.argv[1])
fallback_payload = json.loads(sys.argv[2])

array_result = array_payload["result"]
fallback_result = fallback_payload["result"]

expected = ["user:a@example.com", {"kind": "team", "id": "dev"}]
if array_result.get("discoverability") != "UNLISTED":
    raise SystemExit(f"unexpected discoverability: {array_payload}")
if array_result.get("principals") != expected:
    raise SystemExit(f"principals array was not preserved: {array_payload}")
if fallback_result.get("principals") != []:
    raise SystemExit(f"non-array principals did not fall back to []: {fallback_payload}")
PY

echo "plugin_share_update_targets_ok"
