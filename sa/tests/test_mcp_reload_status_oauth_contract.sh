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
hub_port="28194"

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

rpc() {
  curl -sS --max-time 15 \
    -H 'authorization: Bearer client-secret' \
    -H 'content-type: application/json' \
    --data "$1" \
    "http://127.0.0.1:${hub_port}/rpc"
}

reload_response="$(rpc '{"jsonrpc":"2.0","id":1,"method":"config/mcpServer/reload","params":{"name":"custom-mcp"}}')"
status_response="$(rpc '{"jsonrpc":"2.0","id":2,"method":"mcpServerStatus/list","params":{"name":"custom-mcp"}}')"
resource_response="$(rpc '{"jsonrpc":"2.0","id":3,"method":"mcpServer/resource/read","params":{"server":"custom-mcp","uri":"file:///tmp/demo"}}')"
oauth_response="$(rpc '{"jsonrpc":"2.0","id":4,"method":"mcpServer/oauth/login","params":{}}')"

deadline=$((SECONDS + 6))
while (( SECONDS < deadline )); do
  if rg -q 'event: mcpServer/startupStatus/updated' "${events_out}"; then
    break
  fi
  sleep 0.1
done

python3 - "${reload_response}" "${status_response}" "${resource_response}" "${oauth_response}" "${events_out}" "${hub_port}" <<'PY'
import json
import pathlib
import sys

reload_result = json.loads(sys.argv[1])["result"]
if reload_result != {"name": "custom-mcp", "reloaded": True}:
    raise SystemExit(f"reload result mismatch: {reload_result}")

status_result = json.loads(sys.argv[2])["result"]
entry = status_result["data"][0]
if entry.get("name") != "custom-mcp" or entry.get("tools") != {} or entry.get("resources") != [] or entry.get("resourceTemplates") != [] or entry.get("authStatus") != "unsupported" or status_result.get("nextCursor") is not None:
    raise SystemExit(f"status list mismatch: {status_result}")

resource_result = json.loads(sys.argv[3])["result"]
content = resource_result["contents"][0]
if content != {"uri": "file:///tmp/demo", "mimeType": "text/plain", "text": ""}:
    raise SystemExit(f"resource read mismatch: {resource_result}")

oauth_result = json.loads(sys.argv[4])["result"]
expected_oauth = f"http://0.0.0.0:{sys.argv[6]}/oauth"
if oauth_result.get("authorizationUrl") != expected_oauth:
    raise SystemExit(f"oauth URL mismatch: {oauth_result}, expected {expected_oauth}")

event = None
startup = None
for raw in pathlib.Path(sys.argv[5]).read_text().splitlines():
    line = raw.strip()
    if line.startswith("event: "):
        event = line[7:]
    elif line.startswith("data: ") and event == "mcpServer/startupStatus/updated":
        startup = json.loads(line[6:])["params"]
        break
    elif line.startswith("data: "):
        event = None

if startup != {"name": "custom-mcp", "status": "starting", "error": None}:
    raise SystemExit(f"startup event mismatch: {startup}")
PY

echo "mcp_reload_status_oauth_contract_ok"
