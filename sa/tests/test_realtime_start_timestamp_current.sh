#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
sa_dir="$(cd "${script_dir}/.." && pwd)"
project_dir="$(cd "${sa_dir}/.." && pwd)"
source "${script_dir}/lib/runtime_env.sh"
env_file="${project_dir}/.env"
tmp_dir="$(mktemp -d)"
sa_port="${SA_TEST_PROXY_PORT:-$(sa_test_free_port)}"
hub_pid=""

cleanup() {
  if [[ -n "${hub_pid}" ]]; then
    sa_test_stop_pid "${hub_pid}"
  fi
  rm -rf "${tmp_dir}"
}
trap cleanup EXIT

sa_test_assert_port_free "${sa_port}"
sa_test_write_env_from_root "${env_file}" "${tmp_dir}/.env" "${sa_port}" "client-secret"

hub_pid="$(sa_test_start_hubproxy "${sa_dir}" "${tmp_dir}" "${tmp_dir}/hubproxy.log")"
if ! sa_test_wait_port "${sa_port}" 50 0.1; then
  echo "hubproxy did not start on ${sa_port}" >&2
  cat "${tmp_dir}/hubproxy.log" >&2 || true
  exit 1
fi

response="$(curl -sS --max-time 15 \
  -H 'authorization: Bearer client-secret' \
  -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"thread/realtime/start","params":{"threadId":"rt-time-thread"}}' \
  "http://127.0.0.1:${sa_port}/rpc")"

python3 - "${response}" <<'PY'
import json
import sys
import time

turn = json.loads(sys.argv[1])["result"]["turn"]
for key in ("createdAt", "updatedAt", "startedAt", "completedAt"):
    value = turn.get(key)
    if value == 1748300000:
        raise SystemExit(f"{key} still uses legacy fixed value: {turn}")
    if not isinstance(value, int):
        raise SystemExit(f"{key} is not integer seconds: {turn}")
    if abs(int(time.time()) - value) > 300:
        raise SystemExit(f"{key} is not close to current time: {turn}")

if len({turn["createdAt"], turn["updatedAt"], turn["startedAt"], turn["completedAt"]}) != 1:
    raise SystemExit(f"new realtime turn timestamps should match: {turn}")
if turn.get("status") != "completed" or turn.get("durationMs") != 0:
    raise SystemExit(f"realtime start turn shape mismatch: {turn}")
PY

echo "realtime_start_timestamp_current_ok"
