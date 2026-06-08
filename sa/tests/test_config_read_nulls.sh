#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
sa_dir="$(cd "${script_dir}/.." && pwd)"
project_dir="$(cd "${sa_dir}/.." && pwd)"
source "${script_dir}/lib/runtime_env.sh"
env_file="${project_dir}/.env"
tmp_dir="$(mktemp -d)"
sa_port="${SA_TEST_PROXY_PORT:-$(sa_test_free_port)}"
upstream_port="${SA_TEST_UPSTREAM_PORT:-$(sa_test_free_port)}"
hub_pid=""

cleanup() {
  if [[ -n "${hub_pid}" ]]; then
    sa_test_stop_pid "${hub_pid}"
  fi
  rm -rf "${tmp_dir}"
}
trap cleanup EXIT

sa_test_assert_port_free "${sa_port}"
sa_test_assert_port_free "${upstream_port}"

awk -v port="${sa_port}" -v upstream_port="${upstream_port}" '
  BEGIN { wrote_auth=0; wrote_resp=0; wrote_port=0; wrote_chat=0; wrote_model=0; wrote_key=0; wrote_dir=0 }
  /^AUTH=/ { print "AUTH="; wrote_auth=1; next }
  /^RESPONSES_BASE_URL=/ { print "RESPONSES_BASE_URL="; wrote_resp=1; next }
  /^SA_PORT=/ { print "SA_PORT=" port; wrote_port=1; next }
  /^PORT=/ { print "PORT=" port; next }
  /^CHAT_BASE_URL=/ { print "CHAT_BASE_URL=http://127.0.0.1:" upstream_port "/v1"; wrote_chat=1; next }
  /^DEFAULT_MODEL=/ { print "DEFAULT_MODEL=test-model"; wrote_model=1; next }
  /^OPENAI_API_KEY=/ { print "OPENAI_API_KEY=test-key"; wrote_key=1; next }
  /^DATA_DIR=/ { print "DATA_DIR=/tmp/hubproxy-sa-config-null"; wrote_dir=1; next }
  { print }
  END {
    if (!wrote_auth) print "AUTH="
    if (!wrote_resp) print "RESPONSES_BASE_URL="
    if (!wrote_port) print "SA_PORT=" port
    if (!wrote_chat) print "CHAT_BASE_URL=http://127.0.0.1:" upstream_port "/v1"
    if (!wrote_model) print "DEFAULT_MODEL=test-model"
    if (!wrote_key) print "OPENAI_API_KEY=test-key"
    if (!wrote_dir) print "DATA_DIR=/tmp/hubproxy-sa-config-null"
  }
' "${env_file}" >"${tmp_dir}/.env"

hub_pid="$(sa_test_start_hubproxy "${sa_dir}" "${tmp_dir}" "${tmp_dir}/hubproxy.log")"
if ! sa_test_wait_port "${sa_port}" 50 0.1; then
  echo "hubproxy did not start on ${sa_port}" >&2
  cat "${tmp_dir}/hubproxy.log" >&2 || true
  exit 1
fi

response="$(curl -sS --max-time 15 \
  -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"config/read","params":{}}' \
  "http://127.0.0.1:${sa_port}/rpc")"

if ! rg -q '"responsesBaseUrl":null' <<<"${response}" \
  || ! rg -q '"authToken":null' <<<"${response}" \
  || ! rg -q "\"chatBaseUrl\":\"http://127.0.0.1:${upstream_port}/v1\"" <<<"${response}" \
  || ! rg -q '"defaultModel":"test-model"' <<<"${response}"; then
  echo "config/read did not preserve Deno null semantics for optional config" >&2
  echo "${response}" >&2
  exit 1
fi

echo "config_read_nulls_ok"
