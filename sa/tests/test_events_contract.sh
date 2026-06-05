#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
sa_dir="$(cd "${script_dir}/.." && pwd)"
project_dir="$(cd "${sa_dir}/.." && pwd)"
env_file="${project_dir}/.env"

auth="$(awk -F= '$1=="AUTH"{print substr($0, index($0, "=") + 1)}' "${env_file}")"
sa_port="$(awk -F= '$1=="SA_PORT"{print substr($0, index($0, "=") + 1)}' "${env_file}")"
sa_port="${sa_port:-28080}"
base_url="http://127.0.0.1:${sa_port}"
events_out="$(mktemp)"
events_err="$(mktemp)"
thread_resp="$(mktemp)"
turn_resp="$(mktemp)"
watch_resp="$(mktemp)"
cmd_resp="$(mktemp)"
events_pid=""
hub_pid=""
started_hub=0
stop_events() {
  if [[ -n "${events_pid}" ]]; then
    kill -TERM "-${events_pid}" 2>/dev/null || true
    wait "${events_pid}" 2>/dev/null || true
    events_pid=""
  fi
}
cleanup() {
  stop_events
  if [[ "${started_hub}" == "1" ]] && [[ -n "${hub_pid}" ]]; then
    kill "${hub_pid}" 2>/dev/null || true
    wait "${hub_pid}" 2>/dev/null || true
  fi
  rm -f "${events_out}" "${events_err}" "${thread_resp}" "${turn_resp}" "${watch_resp}" "${cmd_resp}"
}
trap cleanup EXIT

listen_pid="$(ss -ltnp | sed -n "s/.*0\\.0\\.0\\.0:${sa_port}.*pid=\\([0-9]*\\).*/\\1/p" | head -n 1)"
if [[ -z "${listen_pid}" ]]; then
  setsid "${project_dir}/restart_sa.sh" > /tmp/hubproxy_sa_events_contract.log 2>&1 < /dev/null &
  hub_pid=$!
  started_hub=1
  for _ in {1..60}; do
    listen_pid="$(ss -ltnp | sed -n "s/.*0\\.0\\.0\\.0:${sa_port}.*pid=\\([0-9]*\\).*/\\1/p" | head -n 1)"
    if [[ -n "${listen_pid}" ]]; then
      break
    fi
    sleep 0.1
  done
fi

setsid timeout 8s curl -sS -N -H "authorization: Bearer ${auth}" \
  "${base_url}/events" >"${events_out}" 2>"${events_err}" &
events_pid=$!

sleep 0.3

rpc() {
  curl -sS -H "authorization: Bearer ${auth}" -H "content-type: application/json" \
    --data "$1" \
    "${base_url}/rpc"
}

curl -sS -H "authorization: Bearer ${auth}" -H "content-type: application/json" \
  --data '{"jsonrpc":"2.0","id":100,"method":"thread/start","params":{}}' \
  "${base_url}/rpc" >"${thread_resp}"

thread_id="$(sed -nE 's/.*"thread":\{"id":"([0-9]+)".*/\1/p' "${thread_resp}" | head -n 1)"
if [[ -z "${thread_id}" ]]; then
  echo "failed to parse thread id from thread/start response" >&2
  cat "${thread_resp}" >&2
  exit 1
fi

curl -sS -H "authorization: Bearer ${auth}" -H "content-type: application/json" \
  --data "{\"jsonrpc\":\"2.0\",\"id\":101,\"method\":\"turn/start\",\"params\":{\"threadId\":\"${thread_id}\",\"input\":[]}}" \
  "${base_url}/rpc" >"${turn_resp}"

curl -sS -H "authorization: Bearer ${auth}" -H "content-type: application/json" \
  --data '{"jsonrpc":"2.0","id":102,"method":"fs/watch","params":{"path":".testdata/events_watch.txt","watchId":"events-watch"}}' \
  "${base_url}/rpc" >"${watch_resp}"

curl -sS -H "authorization: Bearer ${auth}" -H "content-type: application/json" \
  --data '{"jsonrpc":"2.0","id":103,"method":"command/exec","params":{"command":["echo","hi"],"processId":"cmd-events"}}' \
  "${base_url}/rpc" >"${cmd_resp}"

rpc "{\"jsonrpc\":\"2.0\",\"id\":104,\"method\":\"thread/realtime/start\",\"params\":{\"threadId\":\"${thread_id}\"}}" >/dev/null
rpc "{\"jsonrpc\":\"2.0\",\"id\":105,\"method\":\"thread/realtime/appendAudio\",\"params\":{\"threadId\":\"${thread_id}\",\"audio\":\"abc\"}}" >/dev/null
rpc "{\"jsonrpc\":\"2.0\",\"id\":106,\"method\":\"thread/realtime/appendText\",\"params\":{\"threadId\":\"${thread_id}\",\"text\":\"hi\"}}" >/dev/null
rpc "{\"jsonrpc\":\"2.0\",\"id\":107,\"method\":\"thread/realtime/stop\",\"params\":{\"threadId\":\"${thread_id}\"}}" >/dev/null
rpc "{\"jsonrpc\":\"2.0\",\"id\":108,\"method\":\"mcpServer/tool/call\",\"params\":{\"threadId\":\"${thread_id}\",\"serverName\":\"local\",\"tool\":\"demo\"}}" >/dev/null
rpc '{"jsonrpc":"2.0","id":109,"method":"remoteControl/enable","params":{"serverName":"events-srv","installationId":"events-inst","environmentId":"events-env"}}' >/dev/null
rpc '{"jsonrpc":"2.0","id":110,"method":"windowsSandbox/setupStart","params":{"mode":"unelevated"}}' >/dev/null
rpc '{"jsonrpc":"2.0","id":111,"method":"externalAgentConfig/import","params":{}}' >/dev/null
rpc '{"jsonrpc":"2.0","id":112,"method":"config/mcpServer/reload","params":{"name":"local"}}' >/dev/null
rpc '{"jsonrpc":"2.0","id":113,"method":"windows/worldWritableWarning","params":{}}' >/dev/null
rpc '{"jsonrpc":"2.0","id":114,"method":"fuzzyFileSearch","params":{"sessionId":"sess-events","query":"main.sa"}}' >/dev/null
rpc "{\"jsonrpc\":\"2.0\",\"id\":115,\"method\":\"serverRequest/resolved\",\"params\":{\"threadId\":\"${thread_id}\",\"requestId\":\"req-events\"}}" >/dev/null
rpc '{"jsonrpc":"2.0","id":116,"method":"process/spawn","params":{"command":["echo","proc-events"],"processHandle":"proc-events"}}' >/dev/null

deadline=$((SECONDS + 6))
while (( SECONDS < deadline )); do
  if rg -q 'event: thread/started' "${events_out}" \
    && rg -q "\"id\":\"${thread_id}\"" "${events_out}" \
    && rg -q 'event: turn/started' "${events_out}" \
    && rg -q "\"threadId\":\"${thread_id}\"" "${events_out}" \
    && rg -q 'event: fs/changed' "${events_out}" \
    && rg -q '"watchId":"events-watch"' "${events_out}" \
    && rg -q 'event: command/exec/outputDelta' "${events_out}" \
    && rg -q '"processId":"cmd-events"' "${events_out}" \
    && rg -q 'event: thread/realtime/started' "${events_out}" \
    && rg -q "\"threadId\":\"${thread_id}\"" "${events_out}" \
    && rg -q 'event: thread/realtime/itemAdded' "${events_out}" \
    && rg -q '"audio":"abc"' "${events_out}" \
    && rg -q 'event: thread/realtime/outputAudio/delta' "${events_out}" \
    && rg -q 'event: thread/realtime/transcript/delta' "${events_out}" \
    && rg -q '"delta":"hi"' "${events_out}" \
    && rg -q 'event: thread/realtime/transcript/done' "${events_out}" \
    && rg -q '"text":"hi"' "${events_out}" \
    && rg -q 'event: thread/realtime/closed' "${events_out}" \
    && rg -q 'event: item/mcpToolCall/progress' "${events_out}" \
    && rg -q 'event: remoteControl/status/changed' "${events_out}" \
    && rg -q '"serverName":"events-srv"' "${events_out}" \
    && rg -q '"installationId":"events-inst"' "${events_out}" \
    && rg -q '"environmentId":"events-env"' "${events_out}" \
    && rg -q 'event: windowsSandbox/setupCompleted' "${events_out}" \
    && rg -q 'event: externalAgentConfig/import/completed' "${events_out}" \
    && rg -q 'event: mcpServer/startupStatus/updated' "${events_out}" \
    && rg -q 'event: windows/worldWritableWarning' "${events_out}" \
    && rg -q 'event: fuzzyFileSearch/sessionUpdated' "${events_out}" \
    && rg -q 'event: fuzzyFileSearch/sessionCompleted' "${events_out}" \
    && rg -q '"sessionId":"sess-events"' "${events_out}" \
    && rg -q 'event: serverRequest/resolved' "${events_out}" \
    && rg -q '"requestId":"req-events"' "${events_out}" \
    && rg -q 'event: process/outputDelta' "${events_out}" \
    && rg -q 'event: process/exited' "${events_out}" \
    && rg -q '"processHandle":"proc-events"' "${events_out}"; then
    stop_events
    echo "events_contract_ok thread=${thread_id}"
    exit 0
  fi
  sleep 0.1
done

stop_events

echo "events contract failed" >&2
echo "--- thread/start ---" >&2
cat "${thread_resp}" >&2
echo >&2
echo "--- turn/start ---" >&2
cat "${turn_resp}" >&2
echo >&2
echo "--- fs/watch ---" >&2
cat "${watch_resp}" >&2
echo >&2
echo "--- command/exec ---" >&2
cat "${cmd_resp}" >&2
echo >&2
echo "--- events ---" >&2
cat "${events_out}" >&2
echo >&2
echo "--- curl stderr ---" >&2
cat "${events_err}" >&2
exit 1
