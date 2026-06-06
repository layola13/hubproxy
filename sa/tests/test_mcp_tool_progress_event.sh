#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
sa_dir="$(cd "${script_dir}/.." && pwd)"
project_dir="$(cd "${sa_dir}/.." && pwd)"
env_file="${project_dir}/.env"
tmp_dir="$(mktemp -d)"
hub_log="$(mktemp)"
events_out="$(mktemp)"
events_err="$(mktemp)"
hub_pid=""
events_pid=""
hub_port="28188"

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
  rm -rf "${tmp_dir}"
  rm -f "${hub_log}" "${events_out}" "${events_err}"
}
trap cleanup EXIT

if ss -ltn | rg -q "0\\.0\\.0\\.0:${hub_port}"; then
  echo "test port already in use" >&2
  exit 1
fi

awk '
  BEGIN { wrote_auth=0; wrote_port=0 }
  /^AUTH=/ { print "AUTH=client-secret"; wrote_auth=1; next }
  /^SA_PORT=/ { print "SA_PORT=" hub_port; wrote_port=1; next }
  { print }
  END {
    if (!wrote_auth) print "AUTH=client-secret"
    if (!wrote_port) print "SA_PORT=" hub_port
  }
' hub_port="${hub_port}" "${env_file}" >"${tmp_dir}/.env"

(
  cd "${tmp_dir}"
  setsid "${sa_dir}/hubproxy" > "${hub_log}" 2>&1 < /dev/null &
  echo "$!" > "${tmp_dir}/hub.pid"
)
hub_pid="$(cat "${tmp_dir}/hub.pid")"

for _ in {1..50}; do
  if ss -ltn | rg -q "0\\.0\\.0\\.0:${hub_port}"; then
    break
  fi
  sleep 0.1
done

setsid timeout 8s curl -sS -N -H 'authorization: Bearer client-secret' \
  "http://127.0.0.1:${hub_port}/events" >"${events_out}" 2>"${events_err}" &
events_pid=$!

sleep 0.3

response="$(curl -sS --max-time 15 \
  -H 'authorization: Bearer client-secret' \
  -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"mcpServer/tool/call","params":{"threadId":"mcp-thread","turnId":"mcp-turn","itemId":"mcp-item","tool":"demo","server":"srv","message":"progress-message"}}' \
  "http://127.0.0.1:${hub_port}/rpc")"

server_name_response="$(curl -sS --max-time 15 \
  -H 'authorization: Bearer client-secret' \
  -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":2,"method":"mcpServer/tool/call","params":{"threadId":"mcp-thread-2","turnId":"mcp-turn-2","itemId":"mcp-item-2","tool":"demo2","serverName":"srv-name","server":"legacy-srv","message":"server-name-message"}}' \
  "http://127.0.0.1:${hub_port}/rpc")"

deadline=$((SECONDS + 6))
while (( SECONDS < deadline )); do
  if rg -q 'event: item/mcpToolCall/progress' "${events_out}"; then
    break
  fi
  sleep 0.1
done

python3 - "${response}" "${server_name_response}" "${events_out}" <<'PY'
import json
import pathlib
import sys

result = json.loads(sys.argv[1])["result"]
server_name_result = json.loads(sys.argv[2])["result"]
if result["content"][0]["text"] != "progress-message":
    raise SystemExit(f"RPC result did not echo message: {result}")
if result["structuredContent"]["tool"] != "demo" or result["structuredContent"]["server"] != "srv":
    raise SystemExit(f"RPC result did not echo tool/server: {result}")
if result["meta"]["threadId"] != "mcp-thread" or result["meta"]["turnId"] != "mcp-turn" or result["meta"]["itemId"] != "mcp-item":
    raise SystemExit(f"RPC result did not echo meta ids: {result}")
if server_name_result["content"][0]["text"] != "server-name-message":
    raise SystemExit(f"serverName RPC result did not echo message: {server_name_result}")
if server_name_result["structuredContent"]["tool"] != "demo2" or server_name_result["structuredContent"]["server"] != "legacy-srv":
    raise SystemExit(f"mcpServer/tool/call should use server, not serverName, like Deno: {server_name_result}")
if server_name_result["meta"]["threadId"] != "mcp-thread-2" or server_name_result["meta"]["turnId"] != "mcp-turn-2" or server_name_result["meta"]["itemId"] != "mcp-item-2":
    raise SystemExit(f"serverName RPC result did not echo meta ids: {server_name_result}")

content = pathlib.Path(sys.argv[3]).read_text()
event = None
progress = None
for line in content.splitlines():
    line = line.strip()
    if line.startswith("event: "):
        event = line[7:]
    elif line.startswith("data: ") and event == "item/mcpToolCall/progress":
        progress = json.loads(line[6:])["params"]
        break
    elif line.startswith("data: "):
        event = None

if progress is None:
    raise SystemExit(f"missing mcp progress event:\n{content}")
expected = {
    "threadId": "mcp-thread",
    "turnId": "mcp-turn",
    "itemId": "mcp-item",
    "message": "progress-message",
}
for key, value in expected.items():
    if progress.get(key) != value:
        raise SystemExit(f"progress event {key} mismatch: {progress}")
if progress.get("itemId") == "sa-item" or progress.get("message") == "called":
    raise SystemExit(f"progress event still uses fixed placeholder: {progress}")
PY

echo "mcp_tool_progress_event_ok"
