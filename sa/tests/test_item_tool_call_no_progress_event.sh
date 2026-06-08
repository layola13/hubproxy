#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
sa_dir="$(cd "${script_dir}/.." && pwd)"
project_dir="$(cd "${sa_dir}/.." && pwd)"
source "${script_dir}/lib/runtime_env.sh"
env_file="${project_dir}/.env"
tmp_dir="$(mktemp -d)"
events_out="${tmp_dir}/events.out"
events_err="${tmp_dir}/events.err"
auth_token="client-secret"
sa_port="${SA_TEST_PROXY_PORT:-$(sa_test_free_port)}"
hub_pid=""
events_pid=""

stop_events() {
  if [[ -n "${events_pid}" ]]; then
    sa_test_stop_pgid "${events_pid}"
    events_pid=""
  fi
}

cleanup() {
  stop_events
  if [[ -n "${hub_pid}" ]]; then
    sa_test_stop_pid "${hub_pid}"
  fi
  rm -rf "${tmp_dir}"
}
trap cleanup EXIT

sa_test_assert_port_free "${sa_port}"
sa_test_write_env_from_root "${env_file}" "${tmp_dir}/.env" "${sa_port}" "${auth_token}"

hub_pid="$(sa_test_start_hubproxy "${sa_dir}" "${tmp_dir}" "${tmp_dir}/hubproxy.log")"
if ! sa_test_wait_port "${sa_port}" 50 0.1; then
  echo "hubproxy did not start on ${sa_port}" >&2
  cat "${tmp_dir}/hubproxy.log" >&2 || true
  exit 1
fi

setsid timeout 5s curl -sS -N -H "authorization: Bearer ${auth_token}" \
  "http://127.0.0.1:${sa_port}/events" >"${events_out}" 2>"${events_err}" &
events_pid=$!

sleep 0.3

response="$(curl -sS --max-time 15 \
  -H "authorization: Bearer ${auth_token}" \
  -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"item/tool/call","params":{"message":"plain-tool-message"}}' \
  "http://127.0.0.1:${sa_port}/rpc")"

sleep 0.8

python3 - "${response}" "${events_out}" <<'PY'
import json
import pathlib
import sys

result = json.loads(sys.argv[1])["result"]
if result.get("contentItems", [{}])[0].get("text") != "plain-tool-message":
    raise SystemExit(f"item/tool/call result did not echo message: {result}")
if result.get("success") is not True:
    raise SystemExit(f"item/tool/call result did not succeed: {result}")

events = pathlib.Path(sys.argv[2]).read_text()
if "event: item/mcpToolCall/progress" in events:
    raise SystemExit(f"item/tool/call should not emit MCP progress event:\n{events}")
PY

echo "item_tool_call_no_progress_event_ok"
