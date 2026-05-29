#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
sa_dir="$(cd "${script_dir}/.." && pwd)"
project_dir="$(cd "${sa_dir}/.." && pwd)"
env_file="${project_dir}/.env"
backup_file="$(mktemp)"
events_out="$(mktemp)"
events_err="$(mktemp)"
hub_pid=""
events_pid=""

stop_events() {
  if [[ -n "${events_pid}" ]]; then
    kill -TERM "-${events_pid}" 2>/dev/null || true
    wait "${events_pid}" 2>/dev/null || true
    events_pid=""
  fi
}

cleanup() {
  stop_events
  if [[ -n "${hub_pid}" ]]; then
    kill "${hub_pid}" 2>/dev/null || true
    wait "${hub_pid}" 2>/dev/null || true
  fi
  cp "${backup_file}" "${env_file}"
  rm -f "${backup_file}" "${events_out}" "${events_err}"
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
  setsid "${sa_dir}/hubproxy" > /tmp/hubproxy_sa_item_tool_call_no_progress_event.log 2>&1 < /dev/null &
  echo "$!" > /tmp/hubproxy_sa_item_tool_call_no_progress_event.pid
)
hub_pid="$(cat /tmp/hubproxy_sa_item_tool_call_no_progress_event.pid)"
rm -f /tmp/hubproxy_sa_item_tool_call_no_progress_event.pid

for _ in {1..50}; do
  if ss -ltnp | rg -q '0\.0\.0\.0:28080'; then
    break
  fi
  sleep 0.1
done

setsid timeout 5s curl -sS -N -H 'authorization: Bearer client-secret' \
  'http://127.0.0.1:28080/events' >"${events_out}" 2>"${events_err}" &
events_pid=$!

sleep 0.3

response="$(curl -sS --max-time 15 \
  -H 'authorization: Bearer client-secret' \
  -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"item/tool/call","params":{"message":"plain-tool-message"}}' \
  'http://127.0.0.1:28080/rpc')"

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
