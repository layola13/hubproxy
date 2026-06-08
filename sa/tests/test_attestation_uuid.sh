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

rpc() {
  curl -sS --max-time 15 \
    -H 'authorization: Bearer client-secret' \
    -H 'content-type: application/json' \
    --data "$1" \
    "http://127.0.0.1:${sa_port}/rpc"
}

response1="$(rpc '{"jsonrpc":"2.0","id":1,"method":"attestation/generate","params":{}}')"
response2="$(rpc '{"jsonrpc":"2.0","id":2,"method":"attestation/generate","params":{}}')"

python3 - "${response1}" "${response2}" <<'PY'
import json
import re
import sys

token_re = re.compile(r"^attest_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$")
tokens = []
for payload in sys.argv[1:]:
    token = json.loads(payload)["result"]["token"]
    if token == "attest_sa":
        raise SystemExit(f"token still uses fixed placeholder: {payload}")
    if not token_re.match(token):
        raise SystemExit(f"token is not attest_<uuid-v4>: {token}")
    tokens.append(token)

if tokens[0] == tokens[1]:
    raise SystemExit(f"attestation tokens should not be reused: {tokens}")
PY

echo "attestation_uuid_ok"
