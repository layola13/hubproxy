#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
sa_dir="$(cd "${script_dir}/.." && pwd)"
project_dir="$(cd "${sa_dir}/.." && pwd)"
env_file="${project_dir}/.env"
auth_token="$(awk -F= '/^AUTH=/{print substr($0, index($0,"=")+1)}' "${env_file}" | tail -n 1)"
hub_pid=""
events_pid=""
events_out="$(mktemp)"
events_err="$(mktemp)"

cleanup() {
  if [[ -n "${events_pid}" ]]; then
    kill -TERM "-${events_pid}" 2>/dev/null || true
    wait "${events_pid}" 2>/dev/null || true
  fi
  if [[ -n "${hub_pid}" ]]; then
    kill "${hub_pid}" 2>/dev/null || true
    wait "${hub_pid}" 2>/dev/null || true
  fi
  rm -f "${events_out}" "${events_err}"
}
trap cleanup EXIT

old_pid="$(ss -ltnp | sed -n 's/.*0\.0\.0\.0:28080.*pid=\([0-9]*\).*/\1/p' | head -n 1)"
if [[ -n "${old_pid}" ]]; then
  kill "${old_pid}" 2>/dev/null || true
  sleep 0.3
fi

setsid "${sa_dir}/hubproxy" > /tmp/hubproxy_sa_command_exec_cwd.log 2>&1 < /dev/null &
hub_pid=$!

for _ in {1..50}; do
  if ss -ltnp | rg -q '0\.0\.0\.0:28080'; then
    break
  fi
  sleep 0.1
done

response="$(curl -sS --max-time 15 \
  -H "authorization: Bearer ${auth_token}" \
  -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"command/exec","params":{"command":["pwd"],"cwd":"/home/vscode/projects/hubproxy","processId":"cmd-cwd"}}' \
  'http://127.0.0.1:28080/rpc')"

if ! rg -q '"exitCode":0' <<<"${response}" || ! rg -q '"stdout":"/home/vscode/projects/hubproxy\\n"' <<<"${response}"; then
  echo "command/exec did not run in requested cwd" >&2
  echo "${response}" >&2
  exit 1
fi

setsid timeout 8s curl -sS -N \
  -H "authorization: Bearer ${auth_token}" \
  'http://127.0.0.1:28080/events' >"${events_out}" 2>"${events_err}" &
events_pid=$!
sleep 0.3

spawn="$(curl -sS --max-time 15 \
  -H "authorization: Bearer ${auth_token}" \
  -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":2,"method":"process/spawn","params":{"command":["pwd"],"cwd":"/home/vscode/projects/hubproxy","processHandle":"proc-cwd"}}' \
  'http://127.0.0.1:28080/rpc')"

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
