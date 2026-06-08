#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
sa_dir="$(cd "${script_dir}/.." && pwd)"
project_dir="$(cd "${sa_dir}/.." && pwd)"
source "${script_dir}/lib/runtime_env.sh"
tmp_dir="$(mktemp -d)"
events_out="$(mktemp)"
events_err="$(mktemp)"
hub_port="${SA_TEST_PROXY_PORT:-$(sa_test_free_port)}"
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
    sa_test_stop_pid "${hub_pid}"
  fi
  rm -rf "${tmp_dir}"
  rm -f "${events_out}" "${events_err}"
}
trap cleanup EXIT

sa_test_assert_port_free "${hub_port}"
sa_test_write_env_from_root "${project_dir}/.env" "${tmp_dir}/.env" "${hub_port}" "client-secret"
hub_pid="$(sa_test_start_hubproxy "${sa_dir}" "${tmp_dir}" "${tmp_dir}/hubproxy.log")"
if ! sa_test_wait_port "${hub_port}" 50 0.1; then
  echo "hubproxy did not start on ${hub_port}" >&2
  cat "${tmp_dir}/hubproxy.log" >&2 || true
  exit 1
fi

setsid timeout 8s curl -sS -N -H 'authorization: Bearer client-secret' \
  "http://127.0.0.1:${hub_port}/events" >"${events_out}" 2>"${events_err}" &
events_pid=$!

sleep 0.3

response="$(curl -sS --max-time 15 \
  -H 'authorization: Bearer client-secret' \
  -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"item/tool/requestUserInput","params":{"threadId":"ui-thread","turnId":"ui-turn","itemId":"ui-item"}}' \
  "http://127.0.0.1:${hub_port}/rpc")"

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
