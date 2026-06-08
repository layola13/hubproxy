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

request_body='{"jsonrpc":"2.0","id":1,"method":"plugin/share/save","params":{"pluginName":"codex-test-plugin"}}'
first_response="$(curl -sS --max-time 15 \
  -H 'authorization: Bearer client-secret' \
  -H 'content-type: application/json' \
  --data "${request_body}" \
  "http://127.0.0.1:${sa_port}/rpc")"

second_response="$(curl -sS --max-time 15 \
  -H 'authorization: Bearer client-secret' \
  -H 'content-type: application/json' \
  --data "${request_body}" \
  "http://127.0.0.1:${sa_port}/rpc")"

python3 - "${first_response}" "${second_response}" "${sa_port}" <<'PY'
import json
import re
import sys

first = json.loads(sys.argv[1])["result"]
second = json.loads(sys.argv[2])["result"]
port = sys.argv[3]

uuid_re = re.compile(r"^remote_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$")
for payload in (first, second):
    remote_id = payload.get("remotePluginId")
    if not isinstance(remote_id, str) or not uuid_re.match(remote_id):
        raise SystemExit(f"remotePluginId is not remote_<uuid>: {payload}")
    if remote_id == "remote_sa":
        raise SystemExit(f"remotePluginId still uses legacy fixed id: {payload}")
    if payload.get("shareUrl") != f"http://0.0.0.0:{port}/share":
        raise SystemExit(f"shareUrl did not use SA .env port: {payload}")
    if payload.get("discoverability") != "UNLISTED":
        raise SystemExit(f"discoverability mismatch: {payload}")

if first["remotePluginId"] == second["remotePluginId"]:
    raise SystemExit(f"remotePluginId was reused: {first['remotePluginId']}")
PY

echo "plugin_share_save_uuid_ok"
