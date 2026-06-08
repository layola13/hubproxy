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

array_response="$(curl -sS --max-time 15 \
  -H 'authorization: Bearer client-secret' \
  -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"plugin/share/updateTargets","params":{"principals":["user:a@example.com",{"kind":"team","id":"dev"}]}}' \
  "http://127.0.0.1:${sa_port}/rpc")"

fallback_response="$(curl -sS --max-time 15 \
  -H 'authorization: Bearer client-secret' \
  -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":2,"method":"plugin/share/updateTargets","params":{"principals":"not-array"}}' \
  "http://127.0.0.1:${sa_port}/rpc")"

python3 - "${array_response}" "${fallback_response}" <<'PY'
import json
import sys

array_payload = json.loads(sys.argv[1])
fallback_payload = json.loads(sys.argv[2])

array_result = array_payload["result"]
fallback_result = fallback_payload["result"]

expected = ["user:a@example.com", {"kind": "team", "id": "dev"}]
if array_result.get("discoverability") != "UNLISTED":
    raise SystemExit(f"unexpected discoverability: {array_payload}")
if array_result.get("principals") != expected:
    raise SystemExit(f"principals array was not preserved: {array_payload}")
if fallback_result.get("principals") != []:
    raise SystemExit(f"non-array principals did not fall back to []: {fallback_payload}")
PY

echo "plugin_share_update_targets_ok"
