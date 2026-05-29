#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
sa_dir="$(cd "${script_dir}/.." && pwd)"
project_dir="$(cd "${sa_dir}/.." && pwd)"
env_file="${project_dir}/.env"
backup_file="$(mktemp)"
hub_pid=""

cleanup() {
  if [[ -n "${hub_pid}" ]]; then
    kill "${hub_pid}" 2>/dev/null || true
    wait "${hub_pid}" 2>/dev/null || true
  fi
  cp "${backup_file}" "${env_file}"
  rm -f "${backup_file}"
}
trap cleanup EXIT

cp "${env_file}" "${backup_file}"

old_pid="$(ss -ltnp | sed -n 's/.*0\.0\.0\.0:28080.*pid=\([0-9]*\).*/\1/p' | head -n 1)"
if [[ -n "${old_pid}" ]]; then
  kill "${old_pid}" 2>/dev/null || true
  sleep 0.3
fi

awk '
  BEGIN { wrote_auth=0; wrote_port=0 }
  /^AUTH=/ { print "AUTH=client-secret"; wrote_auth=1; next }
  /^SA_PORT=/ { print "SA_PORT=28080"; wrote_port=1; next }
  { print }
  END {
    if (!wrote_auth) print "AUTH=client-secret"
    if (!wrote_port) print "SA_PORT=28080"
  }
' "${backup_file}" >"${env_file}"

(
  cd "${sa_dir}"
  setsid "${sa_dir}/hubproxy" > /tmp/hubproxy_sa_attestation_uuid.log 2>&1 < /dev/null &
  echo "$!" > /tmp/hubproxy_sa_attestation_uuid.pid
)
hub_pid="$(cat /tmp/hubproxy_sa_attestation_uuid.pid)"
rm -f /tmp/hubproxy_sa_attestation_uuid.pid

for _ in {1..50}; do
  if ss -ltnp | rg -q '0\.0\.0\.0:28080'; then
    break
  fi
  sleep 0.1
done

rpc() {
  curl -sS --max-time 15 \
    -H 'authorization: Bearer client-secret' \
    -H 'content-type: application/json' \
    --data "$1" \
    'http://127.0.0.1:28080/rpc'
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
