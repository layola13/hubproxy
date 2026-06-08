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
  --data '{"jsonrpc":"2.0","id":1,"method":"externalAgentConfig/import","params":{}}' \
  "http://127.0.0.1:${sa_port}/rpc")"

python3 - "${response}" <<'PY'
import datetime as dt
import json
import re
import sys

payload = json.loads(sys.argv[1])["result"]
if payload.get("imported") is not True:
    raise SystemExit(f"import did not report success: {payload}")

imported_at = payload.get("importedAt")
if imported_at == "1748300000":
    raise SystemExit(f"import still returns legacy fixed timestamp: {payload}")
if not isinstance(imported_at, str):
    raise SystemExit(f"importedAt is not a string: {payload}")
if not re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z", imported_at):
    raise SystemExit(f"importedAt is not ISO UTC milliseconds: {payload}")

parsed = dt.datetime.strptime(imported_at, "%Y-%m-%dT%H:%M:%S.%fZ").replace(tzinfo=dt.timezone.utc)
now = dt.datetime.now(dt.timezone.utc)
if abs((now - parsed).total_seconds()) > 300:
    raise SystemExit(f"importedAt is not close to current time: {payload}")
PY

echo "external_import_iso_ok"
