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
  BEGIN { wrote_auth=0; wrote_resp=0; wrote_port=0; wrote_chat=0; wrote_model=0; wrote_key=0; wrote_dir=0 }
  /^AUTH=/ { print "AUTH="; wrote_auth=1; next }
  /^RESPONSES_BASE_URL=/ { print "RESPONSES_BASE_URL="; wrote_resp=1; next }
  /^SA_PORT=/ { print "SA_PORT=28080"; wrote_port=1; next }
  /^CHAT_BASE_URL=/ { print "CHAT_BASE_URL=http://127.0.0.1:28081/v1"; wrote_chat=1; next }
  /^DEFAULT_MODEL=/ { print "DEFAULT_MODEL=test-model"; wrote_model=1; next }
  /^OPENAI_API_KEY=/ { print "OPENAI_API_KEY=test-key"; wrote_key=1; next }
  /^DATA_DIR=/ { print "DATA_DIR=/tmp/hubproxy-sa-config-null"; wrote_dir=1; next }
  { print }
  END {
    if (!wrote_auth) print "AUTH="
    if (!wrote_resp) print "RESPONSES_BASE_URL="
    if (!wrote_port) print "SA_PORT=28080"
    if (!wrote_chat) print "CHAT_BASE_URL=http://127.0.0.1:28081/v1"
    if (!wrote_model) print "DEFAULT_MODEL=test-model"
    if (!wrote_key) print "OPENAI_API_KEY=test-key"
    if (!wrote_dir) print "DATA_DIR=/tmp/hubproxy-sa-config-null"
  }
' "${backup_file}" >"${env_file}"

setsid "${sa_dir}/hubproxy" > /tmp/hubproxy_sa_config_read_nulls.log 2>&1 < /dev/null &
hub_pid=$!

for _ in {1..50}; do
  if ss -ltnp | rg -q '0\.0\.0\.0:28080'; then
    break
  fi
  sleep 0.1
done

response="$(curl -sS --max-time 15 \
  -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"config/read","params":{}}' \
  'http://127.0.0.1:28080/rpc')"

if ! rg -q '"responsesBaseUrl":null' <<<"${response}" \
  || ! rg -q '"authToken":null' <<<"${response}" \
  || ! rg -q '"chatBaseUrl":"http://127.0.0.1:28081/v1"' <<<"${response}" \
  || ! rg -q '"defaultModel":"test-model"' <<<"${response}"; then
  echo "config/read did not preserve Deno null semantics for optional config" >&2
  echo "${response}" >&2
  exit 1
fi

echo "config_read_nulls_ok"
