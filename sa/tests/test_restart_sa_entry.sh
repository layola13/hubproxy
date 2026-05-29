#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
sa_dir="$(cd "${script_dir}/.." && pwd)"
project_dir="$(cd "${sa_dir}/.." && pwd)"
env_file="${project_dir}/.env"
log_dir="$(mktemp -d)"
response_body="$(mktemp)"
hub_pid=""
stale_hub_pid=""

cleanup() {
  if [[ -n "${hub_pid}" ]]; then
    kill "${hub_pid}" 2>/dev/null || true
    wait "${hub_pid}" 2>/dev/null || true
  fi
  if [[ -n "${stale_hub_pid}" ]]; then
    kill "${stale_hub_pid}" 2>/dev/null || true
    wait "${stale_hub_pid}" 2>/dev/null || true
  fi
  rm -rf "${log_dir}"
  rm -f "${response_body}"
}
trap cleanup EXIT

listen_pid_28080() {
  ss -ltnp | sed -n 's/.*0\.0\.0\.0:28080.*pid=\([0-9]*\).*/\1/p' | head -n 1
}

preexisting_hub_pid="$(listen_pid_28080)"
if [[ -n "${preexisting_hub_pid}" ]]; then
  kill "${preexisting_hub_pid}" 2>/dev/null || true
  for _ in {1..30}; do
    [[ -z "$(listen_pid_28080)" ]] && break
    sleep 0.1
  done
  if [[ -n "$(listen_pid_28080)" ]]; then
    kill -9 "${preexisting_hub_pid}" 2>/dev/null || true
  fi
fi

setsid "${sa_dir}/hubproxy" > /tmp/hubproxy_sa_restart_stale.log 2>&1 < /dev/null &
stale_hub_pid=$!

for _ in {1..60}; do
  current_hub_pid="$(listen_pid_28080)"
  if [[ "${current_hub_pid}" == "${stale_hub_pid}" ]]; then
    break
  fi
  sleep 0.1
done

if [[ "$(listen_pid_28080)" != "${stale_hub_pid}" ]]; then
  echo "failed to start stale SA hubproxy before restart test" >&2
  ss -ltnp >&2 || true
  cat /tmp/hubproxy_sa_restart_stale.log >&2 || true
  exit 1
fi

old_deno_pid="$(ss -ltnp | sed -n 's/.*0\.0\.0\.0:27787.*pid=\([0-9]*\).*/\1/p' | head -n 1)"

setsid "${project_dir}/restart.sh" --log-dir "${log_dir}" > /tmp/hubproxy_sa_restart_entry.log 2>&1 < /dev/null &
hub_pid=$!

for _ in {1..60}; do
  current_hub_pid="$(listen_pid_28080)"
  if [[ "${current_hub_pid}" == "${hub_pid}" ]]; then
    break
  fi
  sleep 0.1
done

current_hub_pid="$(listen_pid_28080)"
if [[ "${current_hub_pid}" != "${hub_pid}" ]] || ! ss -ltnp | rg -q '0\.0\.0\.0:28080.*hubproxy'; then
  echo "restart.sh did not start SA hubproxy on 28080" >&2
  echo "expected pid=${hub_pid} actual pid=${current_hub_pid}" >&2
  echo "stale pid=${stale_hub_pid}" >&2
  ss -ltnp >&2 || true
  cat /tmp/hubproxy_sa_restart_entry.log >&2 || true
  exit 1
fi

if [[ -n "${old_deno_pid}" ]]; then
  new_deno_pid="$(ss -ltnp | sed -n 's/.*0\.0\.0\.0:27787.*pid=\([0-9]*\).*/\1/p' | head -n 1)"
  if [[ "${new_deno_pid}" != "${old_deno_pid}" ]]; then
    echo "restart.sh touched the Deno process on 27787" >&2
    echo "old=${old_deno_pid} new=${new_deno_pid}" >&2
    exit 1
  fi
fi

auth="$(awk -F= '$1=="AUTH"{print substr($0, index($0, "=") + 1)}' "${env_file}" | tail -n 1)"
curl -sS --max-time 15 \
  -H "authorization: Bearer ${auth}" \
  -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":7,"method":"initialize","params":{}}' \
  'http://127.0.0.1:28080/rpc' >"${response_body}"

if ! rg -q '"userAgent":"hubproxy/sa-std"' "${response_body}"; then
  echo "restart.sh process did not serve the SA RPC initialize response" >&2
  cat "${response_body}" >&2
  exit 1
fi

log_file="${log_dir}/request-sa-api.json"
if [[ ! -s "${log_file}" ]]; then
  echo "restart.sh --log-dir did not enable SA request logging" >&2
  ls -la "${log_dir}" >&2
  cat /tmp/hubproxy_sa_restart_entry.log >&2 || true
  exit 1
fi

if ! rg -q '"path":"/rpc"' "${log_file}" \
  || ! rg -q '"method":"POST"' "${log_file}" \
  || ! rg -q '"body":"\{\\"jsonrpc\\":\\"2.0\\"' "${log_file}"; then
  echo "restart.sh request log missing expected SA fields" >&2
  cat "${log_file}" >&2
  exit 1
fi

if rg -q 'deno task start|deno run' "${project_dir}/restart.sh"; then
  echo "restart.sh still references the Deno runtime" >&2
  sed -n '1,120p' "${project_dir}/restart.sh" >&2
  exit 1
fi

echo "restart_sa_entry_ok"
