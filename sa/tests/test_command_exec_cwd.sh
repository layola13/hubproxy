#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
sa_dir="$(cd "${script_dir}/.." && pwd)"
project_dir="$(cd "${sa_dir}/.." && pwd)"
source "${script_dir}/lib/runtime_env.sh"
env_file="${project_dir}/.env"
tmp_dir="$(mktemp -d)"
events_out="${tmp_dir}/events.out"
events_err="${tmp_dir}/events.err"
auth_token="client-secret"
sa_port="${SA_TEST_PROXY_PORT:-$(sa_test_free_port)}"
hub_pid=""
events_pid=""

stop_events() {
  if [[ -n "${events_pid}" ]]; then
    sa_test_stop_pgid "${events_pid}"
    events_pid=""
  fi
}

cleanup() {
  stop_events
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

response="$(curl -sS --max-time 15 \
  -H "authorization: Bearer ${auth_token}" \
  -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"command/exec","params":{"command":["pwd"],"cwd":"/home/vscode/projects/hubproxy","processId":"cmd-cwd"}}' \
  "http://127.0.0.1:${sa_port}/rpc")"

if ! rg -q '"exitCode":0' <<<"${response}" || ! rg -q '"stdout":"/home/vscode/projects/hubproxy\\n"' <<<"${response}"; then
  echo "command/exec did not run in requested cwd" >&2
  echo "${response}" >&2
  exit 1
fi

setsid timeout 8s curl -sS -N \
  -H "authorization: Bearer ${auth_token}" \
  "http://127.0.0.1:${sa_port}/events" >"${events_out}" 2>"${events_err}" &
events_pid=$!
sleep 0.3

spawn="$(curl -sS --max-time 15 \
  -H "authorization: Bearer ${auth_token}" \
  -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":2,"method":"process/spawn","params":{"command":["pwd"],"cwd":"/home/vscode/projects/hubproxy","processHandle":"proc-cwd"}}' \
  "http://127.0.0.1:${sa_port}/rpc")"

if ! rg -q '"processHandle":"proc-cwd"' <<<"${spawn}"; then
  echo "process/spawn did not return requested handle" >&2
  echo "${spawn}" >&2
  exit 1
fi

deadline=$((SECONDS + 6))
while (( SECONDS < deadline )); do
  if rg -q 'event: process/outputDelta' "${events_out}" \
    && rg -q '"processHandle":"proc-cwd"' "${events_out}" \
    && rg -q '"deltaBase64":"L2hvbWUvdnNjb2RlL3Byb2plY3RzL2h1YnByb3h5Cg=="' "${events_out}" \
    && rg -q '"stdout":"/home/vscode/projects/hubproxy\\n"' "${events_out}"; then
    break
  fi
  sleep 0.1
done

if ! rg -q '"deltaBase64":"L2hvbWUvdnNjb2RlL3Byb2plY3RzL2h1YnByb3h5Cg=="' "${events_out}" \
  || ! rg -q '"stdout":"/home/vscode/projects/hubproxy\\n"' "${events_out}"; then
  echo "process/spawn did not run in requested cwd" >&2
  echo "${spawn}" >&2
  echo "--- events ---" >&2
  cat "${events_out}" >&2
  echo "--- curl stderr ---" >&2
  cat "${events_err}" >&2
  exit 1
fi

echo "command_exec_cwd_ok"
