#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
sa_dir="$(cd "${script_dir}/.." && pwd)"
env_file="${sa_dir}/.env"
auth_token="test-secret"
sa_port="${SA_TEST_PROXY_PORT:-28236}"
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

start="$(rpc '{"jsonrpc":"2.0","id":1,"method":"thread/start","params":{"model":"resume-model","modelProvider":"anthropic","cwd":"/tmp/resume-cwd","ephemeral":false}}')"
thread_id="$(sed -nE 's/.*"thread":\{"id":"([0-9]+)".*/\1/p' <<<"${start}" | head -n 1)"
if [[ -z "${thread_id}" ]]; then
  echo "failed to parse thread id" >&2
  echo "${start}" >&2
  exit 1
fi

turn="$(rpc "{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"turn/start\",\"params\":{\"threadId\":\"${thread_id}\",\"collaborationMode\":{\"mode\":\"goal\"},\"input\":[{\"type\":\"message\",\"role\":\"user\",\"content\":\"resume me\"}]}}")"
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
turn = next((turn for turn in turns if turn.get("id") == os.environ["TURN_ID"]), None)
assert turn is not None
assert turn.get("collaborationModeKind") == "goal"
assert turn.get("items") == [{"type": "message", "role": "user", "content": "resume me"}]
PY

echo "thread_resume_envelope_ok thread=${thread_id} turn=${turn_id}"
