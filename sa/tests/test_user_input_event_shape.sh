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
  setsid "${sa_dir}/hubproxy" > /tmp/hubproxy_sa_user_input_event_shape.log 2>&1 < /dev/null &
  echo "$!" > /tmp/hubproxy_sa_user_input_event_shape.pid
)
hub_pid="$(cat /tmp/hubproxy_sa_user_input_event_shape.pid)"
rm -f /tmp/hubproxy_sa_user_input_event_shape.pid

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
  --data '{"jsonrpc":"2.0","id":1,"method":"item/tool/requestUserInput","params":{"threadId":"ui-thread","turnId":"ui-turn","itemId":"ui-item"}}' \
  'http://127.0.0.1:28080/rpc')"

deadline=$((SECONDS + 6))
while (( SECONDS < deadline )); do
  if rg -q 'event: item/tool/requestUserInput' "${events_out}"; then
    break
  fi
  sleep 0.1
done

python3 - "${response}" "${events_out}" <<'PY'
import json
import pathlib
import sys

result = json.loads(sys.argv[1])["result"]
if result.get("answers", {}).get("default", {}).get("answers") != ["continue"]:
    raise SystemExit(f"RPC result mismatch: {result}")

content = pathlib.Path(sys.argv[2]).read_text()
event = None
params = None
for line in content.splitlines():
    line = line.strip()
    if line.startswith("event: "):
        event = line[7:]
    elif line.startswith("data: ") and event == "item/tool/requestUserInput":
        params = json.loads(line[6:])["params"]
        break
    elif line.startswith("data: "):
        event = None

if params is None:
    raise SystemExit(f"missing requestUserInput event:\n{content}")
for key, value in {"threadId": "ui-thread", "turnId": "ui-turn", "itemId": "ui-item"}.items():
    if params.get(key) != value:
        raise SystemExit(f"{key} mismatch: {params}")
if "message" in params:
    raise SystemExit(f"requestUserInput event should not use tool progress message payload: {params}")
questions = params.get("questions")
if not isinstance(questions, list) or len(questions) != 1:
    raise SystemExit(f"questions missing: {params}")
question = questions[0]
expected = {
    "id": "default",
    "header": "Input",
    "question": "Provide input",
    "isOther": True,
    "isSecret": False,
}
for key, value in expected.items():
    if question.get(key) != value:
        raise SystemExit(f"question {key} mismatch: {question}")
options = question.get("options")
if not isinstance(options, list) or options[0].get("label") != "Continue":
    raise SystemExit(f"question options mismatch: {question}")
PY

echo "user_input_event_shape_ok"
