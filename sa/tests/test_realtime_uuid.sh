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
  setsid "${sa_dir}/hubproxy" > /tmp/hubproxy_sa_realtime_uuid.log 2>&1 < /dev/null &
  echo "$!" > /tmp/hubproxy_sa_realtime_uuid.pid
)
hub_pid="$(cat /tmp/hubproxy_sa_realtime_uuid.pid)"
rm -f /tmp/hubproxy_sa_realtime_uuid.pid

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

rpc() {
  curl -sS --max-time 15 \
    -H 'authorization: Bearer client-secret' \
    -H 'content-type: application/json' \
    --data "$1" \
    'http://127.0.0.1:28080/rpc'
}

response1="$(rpc '{"jsonrpc":"2.0","id":1,"method":"thread/realtime/start","params":{"threadId":"rt-uuid-thread-1"}}')"
response2="$(rpc '{"jsonrpc":"2.0","id":2,"method":"thread/realtime/start","params":{"threadId":"rt-uuid-thread-2"}}')"

deadline=$((SECONDS + 6))
while (( SECONDS < deadline )); do
  if [[ "$(rg -c 'event: thread/realtime/started' "${events_out}" || true)" -ge 2 ]]; then
    break
  fi
  sleep 0.1
done

python3 - "${response1}" "${response2}" "${events_out}" <<'PY'
import json
import pathlib
import re
import sys

uuid_re = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$")

turn_ids = []
for payload in sys.argv[1:3]:
    turn_id = json.loads(payload)["result"]["turn"]["id"]
    if turn_id == "sa-realtime":
        raise SystemExit(f"turn id still uses fixed placeholder: {payload}")
    if not uuid_re.match(turn_id):
        raise SystemExit(f"turn id is not uuid v4: {turn_id}")
    turn_ids.append(turn_id)

if turn_ids[0] == turn_ids[1]:
    raise SystemExit(f"realtime turn ids should not be reused: {turn_ids}")

content = pathlib.Path(sys.argv[3]).read_text()
session_ids = []
event = None
for line in content.splitlines():
    line = line.strip()
    if line.startswith("event: "):
        event = line[7:]
    elif line.startswith("data: ") and event == "thread/realtime/started":
        payload = json.loads(line[6:])
        session_ids.append(payload["params"]["realtimeSessionId"])
        event = None
    elif line.startswith("data: "):
        event = None

if len(session_ids) < 2:
    raise SystemExit(f"missing realtime started events:\n{content}")
for session_id in session_ids[:2]:
    if session_id == "sa-realtime":
        raise SystemExit(f"session id still uses fixed placeholder: {session_ids}")
    if not uuid_re.match(session_id):
        raise SystemExit(f"session id is not uuid v4: {session_id}")
if session_ids[0] == session_ids[1]:
    raise SystemExit(f"realtime session ids should not be reused: {session_ids[:2]}")
PY

echo "realtime_uuid_ok"
