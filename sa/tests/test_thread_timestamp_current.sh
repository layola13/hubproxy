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
  setsid "${sa_dir}/hubproxy" > /tmp/hubproxy_sa_thread_timestamp_current.log 2>&1 < /dev/null &
  echo "$!" > /tmp/hubproxy_sa_thread_timestamp_current.pid
)
hub_pid="$(cat /tmp/hubproxy_sa_thread_timestamp_current.pid)"
rm -f /tmp/hubproxy_sa_thread_timestamp_current.pid

for _ in {1..50}; do
  if ss -ltnp | rg -q '0\.0\.0\.0:28080'; then
    break
  fi
  sleep 0.1
done

response="$(curl -sS --max-time 15 \
  -H 'authorization: Bearer client-secret' \
  -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"thread/start","params":{"threadId":"thread-time","model":"mimo-v2.5"}}' \
  'http://127.0.0.1:28080/rpc')"

python3 - "${response}" <<'PY'
import json
import sys
import time

payload = json.loads(sys.argv[1])["result"]
thread = payload["thread"]
created_at = thread.get("createdAt")
updated_at = thread.get("updatedAt")

if created_at == 1748300000 or updated_at == 1748300000:
    raise SystemExit(f"thread timestamps still use legacy fixed value: {thread}")
if not isinstance(created_at, int) or not isinstance(updated_at, int):
    raise SystemExit(f"thread timestamps are not integer seconds: {thread}")
if created_at != updated_at:
    raise SystemExit(f"new thread timestamps should match: {thread}")
now = int(time.time())
if abs(now - created_at) > 300:
    raise SystemExit(f"thread timestamp is not close to current time: {thread}")
PY

echo "thread_timestamp_current_ok"
