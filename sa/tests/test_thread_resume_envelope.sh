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

setsid "${sa_dir}/hubproxy" > /tmp/hubproxy_sa_thread_resume_envelope.log 2>&1 < /dev/null &
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

start="$(rpc '{"jsonrpc":"2.0","id":1,"method":"thread/start","params":{"model":"resume-model","modelProvider":"anthropic","cwd":"/tmp/resume-cwd","ephemeral":false}}')"
thread_id="$(sed -nE 's/.*"thread":\{"id":"([0-9]+)".*/\1/p' <<<"${start}" | head -n 1)"
if [[ -z "${thread_id}" ]]; then
  echo "failed to parse thread id" >&2
  echo "${start}" >&2
  exit 1
fi

turn="$(rpc "{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"turn/start\",\"params\":{\"threadId\":\"${thread_id}\",\"collaborationModeKind\":\"goal\",\"input\":[{\"type\":\"message\",\"role\":\"user\",\"content\":\"resume me\"}]}}")"
turn_id="$(sed -nE 's/.*"turn":\{"id":"([0-9]+)".*/\1/p' <<<"${turn}" | head -n 1)"
if [[ -z "${turn_id}" ]]; then
  echo "failed to parse turn id" >&2
  echo "${turn}" >&2
  exit 1
fi

resume="$(rpc "{\"jsonrpc\":\"2.0\",\"id\":3,\"method\":\"thread/resume\",\"params\":{\"threadId\":\"${thread_id}\"}}")"
RESUME_JSON="${resume}" THREAD_ID="${thread_id}" TURN_ID="${turn_id}" python3 - <<'PY'
import json
import os

obj = json.loads(os.environ["RESUME_JSON"])
result = obj["result"]
thread = result["thread"]

assert result["model"] == "resume-model"
assert result["modelProvider"] == "anthropic"
assert result["cwd"] == "/tmp/resume-cwd"
assert result["serviceTier"] is None
assert result["instructionSources"] == []
assert result["approvalPolicy"] == "never"
assert thread["id"] == os.environ["THREAD_ID"]
assert thread["model"] == "resume-model"
assert thread["modelProvider"] == "anthropic"
assert thread["ephemeral"] is False
assert thread["cwd"] == "/tmp/resume-cwd"
turns = thread.get("turns") or []
assert any(turn.get("id") == os.environ["TURN_ID"] for turn in turns)
PY

echo "thread_resume_envelope_ok thread=${thread_id} turn=${turn_id}"
