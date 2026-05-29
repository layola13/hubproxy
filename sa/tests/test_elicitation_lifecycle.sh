#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
sa_dir="$(cd "${script_dir}/.." && pwd)"
project_dir="$(cd "${sa_dir}/.." && pwd)"
env_file="${project_dir}/.env"
auth_token="$(awk -F= '/^AUTH=/{print substr($0, index($0,"=")+1)}' "${env_file}" | tail -n 1)"
hub_pid=""

cleanup() {
  if [[ -n "${hub_pid}" ]]; then
    kill "${hub_pid}" 2>/dev/null || true
    wait "${hub_pid}" 2>/dev/null || true
  fi
}
trap cleanup EXIT

old_pid="$(ss -ltnp | sed -n 's/.*0\.0\.0\.0:28080.*pid=\([0-9]*\).*/\1/p' | head -n 1)"
if [[ -n "${old_pid}" ]]; then
  kill "${old_pid}" 2>/dev/null || true
  sleep 0.3
fi

setsid "${sa_dir}/hubproxy" > /tmp/hubproxy_sa_elicitation.log 2>&1 < /dev/null &
hub_pid=$!

for _ in {1..50}; do
  if ss -ltnp | rg -q '0\.0\.0\.0:28080'; then
    break
  fi
  sleep 0.1
done

rpc() {
  curl -sS --max-time 15 \
    -H "authorization: Bearer ${auth_token}" \
    -H 'content-type: application/json' \
    --data "$1" \
    'http://127.0.0.1:28080/rpc'
}

thread_start="$(rpc '{"jsonrpc":"2.0","id":1,"method":"thread/start","params":{}}')"
if ! rg -q '"thread":' <<<"${thread_start}"; then
  echo "thread/start failed" >&2
  echo "${thread_start}" >&2
  exit 1
fi

user_input="$(rpc '{"jsonrpc":"2.0","id":2,"method":"item/tool/requestUserInput","params":{"threadId":"1","turnId":"2","itemId":"ask-1"}}')"
if ! rg -q '"answers":\["continue"\]' <<<"${user_input}"; then
  echo "requestUserInput did not return default answer" >&2
  echo "${user_input}" >&2
  exit 1
fi

mcp_elicit="$(rpc '{"jsonrpc":"2.0","id":3,"method":"mcpServer/elicitation/request","params":{"threadId":"1","turnId":"2","serverName":"srv"}}')"
if ! rg -q '"action":"accept"' <<<"${mcp_elicit}"; then
  echo "mcp elicitation did not return accept" >&2
  echo "${mcp_elicit}" >&2
  exit 1
fi

resolved_one="$(rpc '{"jsonrpc":"2.0","id":4,"method":"serverRequest/resolved","params":{"threadId":"1","requestId":"req-1"}}')"
if ! rg -q '"requestId":"req-1"' <<<"${resolved_one}"; then
  echo "first serverRequest/resolved failed" >&2
  echo "${resolved_one}" >&2
  exit 1
fi

resolved_two="$(rpc '{"jsonrpc":"2.0","id":5,"method":"serverRequest/resolved","params":{"threadId":"1","requestId":"req-2"}}')"
if ! rg -q '"requestId":"req-2"' <<<"${resolved_two}"; then
  echo "second serverRequest/resolved failed" >&2
  echo "${resolved_two}" >&2
  exit 1
fi

drain="$(rpc '{"jsonrpc":"2.0","id":6,"method":"thread/decrement_elicitation","params":{"threadId":"1"}}')"
if ! rg -q '"count":0' <<<"${drain}" || ! rg -q '"paused":false' <<<"${drain}"; then
  echo "elicitation count was not drained by resolved requests" >&2
  echo "${drain}" >&2
  exit 1
fi

echo "elicitation_lifecycle_ok"
