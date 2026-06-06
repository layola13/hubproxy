#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
sa_dir="$(cd "${script_dir}/.." && pwd)"
env_file="${sa_dir}/.env"
auth_token="test-secret"
sa_port="${SA_TEST_PROXY_PORT:-28241}"
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
  BEGIN { wrote_sa=0; wrote_port=0; wrote_auth=0 }
  /^SA_PORT=/ { print "SA_PORT=" port; wrote_sa=1; next }
  /^PORT=/ { print "PORT=" port; wrote_port=1; next }
  /^AUTH=/ { print "AUTH=" auth; wrote_auth=1; next }
  { print }
  END {
    if (!wrote_sa) print "SA_PORT=" port
    if (!wrote_port) print "PORT=" port
    if (!wrote_auth) print "AUTH=" auth
  }
' "${env_file}" > "${tmp_dir}/.env"

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

rpc() {
  curl -sS --max-time 15 \
    -H "authorization: Bearer ${auth_token}" \
    -H 'content-type: application/json' \
    --data "$1" \
    "${base_url}/rpc"
}

start="$(rpc '{"jsonrpc":"2.0","id":1,"method":"thread/start","params":{"model":"start-model","modelProvider":"anthropic","cwd":"/tmp/start-cwd","ephemeral":false}}')"
thread_id="$(sed -nE 's/.*"thread":\{"id":"([0-9]+)".*/\1/p' <<<"${start}" | head -n 1)"
if [[ -z "${thread_id}" ]]; then
  echo "failed to parse thread id" >&2
  echo "${start}" >&2
  exit 1
fi
if ! rg -q '"model":"start-model"' <<<"${start}" \
  || ! rg -q '"modelProvider":"anthropic"' <<<"${start}" \
  || ! rg -q '"cwd":"/tmp/start-cwd"' <<<"${start}" \
  || ! rg -q '"ephemeral":false' <<<"${start}"; then
  echo "thread/start did not honor model/modelProvider/cwd/ephemeral params" >&2
  echo "${start}" >&2
  exit 1
fi
START_JSON="${start}" python3 - <<'PY'
import json
import os

obj = json.loads(os.environ["START_JSON"])
thread = obj["result"]["thread"]
assert obj["result"]["modelProvider"] == "anthropic"
assert thread["modelProvider"] == "anthropic"
assert thread["ephemeral"] is False
PY

fork="$(rpc "{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"thread/fork\",\"params\":{\"threadId\":\"${thread_id}\",\"model\":\"fork-model\",\"modelProvider\":\"gemini\",\"cwd\":\"/tmp/fork-cwd\",\"ephemeral\":false}}")"
fork_id="$(sed -nE 's/.*"thread":\{"id":"([0-9]+)".*/\1/p' <<<"${fork}" | head -n 1)"
if [[ -z "${fork_id}" ]]; then
  echo "failed to parse fork id" >&2
  echo "${fork}" >&2
  exit 1
fi
if ! rg -q "\"forkedFromId\":\"${thread_id}\"" <<<"${fork}" \
  || ! rg -q '"model":"fork-model"' <<<"${fork}" \
  || ! rg -q '"modelProvider":"gemini"' <<<"${fork}" \
  || ! rg -q '"cwd":"/tmp/fork-cwd"' <<<"${fork}" \
  || ! rg -q '"ephemeral":false' <<<"${fork}"; then
  echo "thread/fork did not honor model/modelProvider/cwd/ephemeral params" >&2
  echo "${fork}" >&2
  exit 1
fi
FORK_JSON="${fork}" SOURCE_THREAD_ID="${thread_id}" python3 - <<'PY'
import json
import os

obj = json.loads(os.environ["FORK_JSON"])
thread = obj["result"]["thread"]
assert obj["result"]["modelProvider"] == "gemini"
assert thread["forkedFromId"] == os.environ["SOURCE_THREAD_ID"]
assert thread["modelProvider"] == "gemini"
assert thread["ephemeral"] is False
PY

read_fork="$(rpc "{\"jsonrpc\":\"2.0\",\"id\":3,\"method\":\"thread/read\",\"params\":{\"threadId\":\"${fork_id}\"}}")"
if ! rg -q '"model":"fork-model"' <<<"${read_fork}" \
  || ! rg -q '"modelProvider":"gemini"' <<<"${read_fork}" \
  || ! rg -q '"cwd":"/tmp/fork-cwd"' <<<"${read_fork}" \
  || ! rg -q '"ephemeral":false' <<<"${read_fork}"; then
  echo "thread/read did not preserve fork model/modelProvider/cwd/ephemeral" >&2
  echo "${read_fork}" >&2
  exit 1
fi
READ_FORK_JSON="${read_fork}" python3 - <<'PY'
import json
import os

obj = json.loads(os.environ["READ_FORK_JSON"])
thread = obj["result"]["thread"]
assert thread["modelProvider"] == "gemini"
assert thread["ephemeral"] is False
PY

echo "thread_start_fork_param_overrides_ok source=${thread_id} fork=${fork_id}"
