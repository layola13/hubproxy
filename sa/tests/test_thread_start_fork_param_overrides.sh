#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
sa_dir="$(cd "${script_dir}/.." && pwd)"
project_dir="$(cd "${sa_dir}/.." && pwd)"
env_file="${project_dir}/.env"

auth_token="$(awk -F= '$1=="AUTH"{print substr($0, index($0,"=")+1)}' "${env_file}" | tail -n 1)"
sa_port="$(awk -F= '$1=="SA_PORT"{print substr($0, index($0,"=")+1)}' "${env_file}" | tail -n 1)"
sa_port="${sa_port:-28080}"
base_url="http://127.0.0.1:${sa_port}"
hub_pid=""

cleanup() {
  if [[ -n "${hub_pid}" ]]; then
    kill "${hub_pid}" 2>/dev/null || true
    wait "${hub_pid}" 2>/dev/null || true
  fi
}
trap cleanup EXIT

old_pid="$(ss -ltnp | sed -nE "s/.*:${sa_port} .*pid=([0-9]+).*/\\1/p" | head -n 1)"
if [[ -n "${old_pid}" ]]; then
  kill "${old_pid}" 2>/dev/null || true
  sleep 0.3
fi

setsid "${sa_dir}/hubproxy" > /tmp/hubproxy_sa_thread_start_fork_overrides.log 2>&1 < /dev/null &
hub_pid=$!

for _ in {1..50}; do
  if ss -ltnp | rg -q ":${sa_port} "; then
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
