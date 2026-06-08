#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
sa_dir="$(cd "${script_dir}/.." && pwd)"
project_dir="$(cd "${sa_dir}/.." && pwd)"
source "${script_dir}/lib/runtime_env.sh"
env_file="${project_dir}/.env"
tmp_dir="$(mktemp -d)"
auth_token="client-secret"
sa_port="${SA_TEST_PROXY_PORT:-$(sa_test_free_port)}"
hub_pid=""

cleanup() {
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

rpc() {
  curl -sS --max-time 15 \
    -H "authorization: Bearer ${auth_token}" \
    -H 'content-type: application/json' \
    --data "$1" \
    "http://127.0.0.1:${sa_port}/rpc"
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
