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
  setsid "${sa_dir}/hubproxy" > /tmp/hubproxy_sa_mcp_elicitation_event_shape.log 2>&1 < /dev/null &
  echo "$!" > /tmp/hubproxy_sa_mcp_elicitation_event_shape.pid
)
hub_pid="$(cat /tmp/hubproxy_sa_mcp_elicitation_event_shape.pid)"
rm -f /tmp/hubproxy_sa_mcp_elicitation_event_shape.pid

for _ in {1..50}; do
  if ss -ltnp | rg -q '0\.0\.0\.0:28080'; then
    break
  fi
  sleep 0.1
done

setsid timeout 8s curl -sS -N -H 'authorization: Bearer client-secret' \
  'http://127.0.0.1:28080/events' >"${events_out}" 2>"${events_err}" &
events_pid=$!

sleep 0.3

response="$(curl -sS --max-time 15 \
  -H 'authorization: Bearer client-secret' \
  -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"mcpServer/elicitation/request","params":{"threadId":"el-thread","turnId":"el-turn","serverName":"el-server"}}' \
  'http://127.0.0.1:28080/rpc')"

deadline=$((SECONDS + 6))
while (( SECONDS < deadline )); do
  if rg -q 'event: mcpServer/elicitation/request' "${events_out}"; then
    break
  fi
  sleep 0.1
done

python3 - "${response}" "${events_out}" <<'PY'
import json
import pathlib
import re
import sys

uuid_re = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$")

result = json.loads(sys.argv[1])["result"]
if result != {"action": "accept", "content": None, "meta": None}:
    raise SystemExit(f"RPC result mismatch: {result}")

content = pathlib.Path(sys.argv[2]).read_text()
event = None
params = None
for line in content.splitlines():
    line = line.strip()
    if line.startswith("event: "):
        event = line[7:]
    elif line.startswith("data: ") and event == "mcpServer/elicitation/request":
        params = json.loads(line[6:])["params"]
        break
    elif line.startswith("data: "):
        event = None

if params is None:
    raise SystemExit(f"missing mcp elicitation event:\n{content}")
expected = {"threadId": "el-thread", "turnId": "el-turn", "serverName": "el-server"}
for key, value in expected.items():
    if params.get(key) != value:
        raise SystemExit(f"{key} mismatch: {params}")
if "message" in params or "itemId" in params:
    raise SystemExit(f"elicitation event should not use tool progress payload: {params}")
request = params.get("request")
if not isinstance(request, dict):
    raise SystemExit(f"request missing: {params}")
if request.get("type") != "form" or not uuid_re.match(str(request.get("id"))):
    raise SystemExit(f"request type/id mismatch: {request}")
schema = request.get("requestedSchema")
if schema != {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "properties": {},
    "required": [],
}:
    raise SystemExit(f"schema mismatch: {schema}")
if request.get("instructions") != "Provide a value to continue.":
    raise SystemExit(f"instructions mismatch: {request}")
PY

echo "mcp_elicitation_event_shape_ok"
