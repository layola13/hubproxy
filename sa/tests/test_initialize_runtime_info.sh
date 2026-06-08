#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
sa_dir="$(cd "${script_dir}/.." && pwd)"
project_dir="$(cd "${sa_dir}/.." && pwd)"
source "${script_dir}/lib/runtime_env.sh"
env_file="${project_dir}/.env"
tmp_dir="$(mktemp -d)"
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
sa_test_write_env_from_root "${env_file}" "${tmp_dir}/.env" "${sa_port}" "client-secret"

hub_pid="$(sa_test_start_hubproxy "${sa_dir}" "${tmp_dir}" "${tmp_dir}/hubproxy.log")"
if ! sa_test_wait_port "${sa_port}" 50 0.1; then
  echo "hubproxy did not start on ${sa_port}" >&2
  cat "${tmp_dir}/hubproxy.log" >&2 || true
  exit 1
fi

response="$(curl -sS --max-time 15 \
  -H 'authorization: Bearer client-secret' \
  -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"clientInfo":{"name":"codex_vscode","version":"0.1.0"},"capabilities":{}}}' \
  "http://127.0.0.1:${sa_port}/rpc")"

if ! rg -q '"userAgent":"hubproxy/' <<<"${response}" \
  || ! rg -q '"codexHome":' <<<"${response}" \
  || ! rg -q '"platformFamily":"unix"' <<<"${response}" \
  || ! rg -q '"platformOs":"linux"' <<<"${response}"; then
  echo "initialize did not return Deno-compatible runtime info" >&2
  echo "${response}" >&2
  exit 1
fi

if rg -q '"protocolVersion"' <<<"${response}"; then
  echo "initialize still returned old protocolVersion/serverInfo shape" >&2
  echo "${response}" >&2
  exit 1
fi

echo "initialize_runtime_info_ok"
