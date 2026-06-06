#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
sa_dir="$(cd "${script_dir}/.." && pwd)"
env_file="${sa_dir}/.env"
auth_token="client-secret"
sa_port="${SA_TEST_PROXY_PORT:-28240}"
base_url="http://127.0.0.1:${sa_port}"
tmp_dir="$(mktemp -d)"
hub_pid=""

cleanup() {
  if [[ -n "${hub_pid}" ]]; then
    kill "${hub_pid}" 2>/dev/null || true
    wait "${hub_pid}" 2>/dev/null || true
  fi
  rm -rf "${tmp_dir}"
}
trap cleanup EXIT

if ss -ltn | rg -q ":${sa_port}\\b"; then
  echo "test port already in use: ${sa_port}" >&2
  exit 1
fi

awk -v port="${sa_port}" -v auth="${auth_token}" '
  BEGIN { wrote_auth=0; wrote_port=0 }
  /^AUTH=/ { print "AUTH=" auth; wrote_auth=1; next }
  /^SA_PORT=/ { print "SA_PORT=" port; wrote_port=1; next }
  /^PORT=/ { print "PORT=" port; next }
  { print }
  END {
    if (!wrote_auth) print "AUTH=" auth
    if (!wrote_port) print "SA_PORT=" port
  }
' "${env_file}" >"${tmp_dir}/.env"

(
  cd "${tmp_dir}"
  setsid "${sa_dir}/hubproxy" > "${tmp_dir}/hubproxy.log" 2>&1 < /dev/null &
  echo "$!" > "${tmp_dir}/hubproxy.pid"
)
hub_pid="$(cat "${tmp_dir}/hubproxy.pid")"

for _ in {1..50}; do
  if ss -ltn | rg -q ":${sa_port} "; then
    break
  fi
  sleep 0.1
done

response="$(curl -sS --max-time 15 \
  -H "authorization: Bearer ${auth_token}" \
  -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"thread/start","params":{"threadId":"thread-time","model":"mimo-v2.5"}}' \
  "${base_url}/rpc")"

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
