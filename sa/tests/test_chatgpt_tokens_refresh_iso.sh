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
  setsid "${sa_dir}/hubproxy" > /tmp/hubproxy_sa_chatgpt_tokens_refresh_iso.log 2>&1 < /dev/null &
  echo "$!" > /tmp/hubproxy_sa_chatgpt_tokens_refresh_iso.pid
)
hub_pid="$(cat /tmp/hubproxy_sa_chatgpt_tokens_refresh_iso.pid)"
rm -f /tmp/hubproxy_sa_chatgpt_tokens_refresh_iso.pid

for _ in {1..50}; do
  if ss -ltnp | rg -q '0\.0\.0\.0:28080'; then
    break
  fi
  sleep 0.1
done

response="$(curl -sS --max-time 15 \
  -H 'authorization: Bearer client-secret' \
  -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"account/chatgptAuthTokens/refresh","params":{}}' \
  'http://127.0.0.1:28080/rpc')"

python3 - "${response}" <<'PY'
import datetime as dt
import json
import re
import sys

payload = json.loads(sys.argv[1])["result"]
if payload.get("refreshed") is not True:
    raise SystemExit(f"refresh did not report success: {payload}")

refreshed_at = payload.get("refreshedAt")
if refreshed_at == "1748300000":
    raise SystemExit(f"refresh still returns legacy fixed timestamp: {payload}")
if not isinstance(refreshed_at, str):
    raise SystemExit(f"refreshedAt is not a string: {payload}")
if not re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z", refreshed_at):
    raise SystemExit(f"refreshedAt is not ISO UTC milliseconds: {payload}")

parsed = dt.datetime.strptime(refreshed_at, "%Y-%m-%dT%H:%M:%S.%fZ").replace(tzinfo=dt.timezone.utc)
now = dt.datetime.now(dt.timezone.utc)
if abs((now - parsed).total_seconds()) > 300:
    raise SystemExit(f"refreshedAt is not close to current time: {payload}")
PY

echo "chatgpt_tokens_refresh_iso_ok"
