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
  setsid "${sa_dir}/hubproxy" > /tmp/hubproxy_sa_plugin_share_save_uuid.log 2>&1 < /dev/null &
  echo "$!" > /tmp/hubproxy_sa_plugin_share_save_uuid.pid
)
hub_pid="$(cat /tmp/hubproxy_sa_plugin_share_save_uuid.pid)"
rm -f /tmp/hubproxy_sa_plugin_share_save_uuid.pid

for _ in {1..50}; do
  if ss -ltnp | rg -q '0\.0\.0\.0:28080'; then
    break
  fi
  sleep 0.1
done

request_body='{"jsonrpc":"2.0","id":1,"method":"plugin/share/save","params":{"pluginName":"codex-test-plugin"}}'
first_response="$(curl -sS --max-time 15 \
  -H 'authorization: Bearer client-secret' \
  -H 'content-type: application/json' \
  --data "${request_body}" \
  'http://127.0.0.1:28080/rpc')"

second_response="$(curl -sS --max-time 15 \
  -H 'authorization: Bearer client-secret' \
  -H 'content-type: application/json' \
  --data "${request_body}" \
  'http://127.0.0.1:28080/rpc')"

python3 - "${first_response}" "${second_response}" <<'PY'
import json
import re
import sys

first = json.loads(sys.argv[1])["result"]
second = json.loads(sys.argv[2])["result"]

uuid_re = re.compile(r"^remote_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$")
for payload in (first, second):
    remote_id = payload.get("remotePluginId")
    if not isinstance(remote_id, str) or not uuid_re.match(remote_id):
        raise SystemExit(f"remotePluginId is not remote_<uuid>: {payload}")
    if remote_id == "remote_sa":
        raise SystemExit(f"remotePluginId still uses legacy fixed id: {payload}")
    if payload.get("shareUrl") != "http://0.0.0.0:28080/share":
        raise SystemExit(f"shareUrl did not use SA .env port: {payload}")
    if payload.get("discoverability") != "UNLISTED":
        raise SystemExit(f"discoverability mismatch: {payload}")

if first["remotePluginId"] == second["remotePluginId"]:
    raise SystemExit(f"remotePluginId was reused: {first['remotePluginId']}")
PY

echo "plugin_share_save_uuid_ok"
