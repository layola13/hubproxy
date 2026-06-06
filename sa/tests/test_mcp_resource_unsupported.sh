#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
sa_dir="$(cd "${script_dir}/.." && pwd)"
hub_port="28284"
tmp_root="$(mktemp -d)"
hub_pid=""

cleanup() {
  if [[ -n "${hub_pid}" ]]; then
    kill "${hub_pid}" 2>/dev/null || true
    wait "${hub_pid}" 2>/dev/null || true
  fi
  rm -rf "${tmp_root}"
}
trap cleanup EXIT

if ss -ltn | rg -q ":${hub_port}\b"; then
  echo "test port already in use: ${hub_port}" >&2
  exit 1
fi

mkdir -p "${tmp_root}/sa"
cat >"${tmp_root}/.env" <<ENV
SA_PORT=${hub_port}
AUTH=test-secret
CHAT_BASE_URL=http://127.0.0.1:28285/v1
RESPONSES_BASE_URL=http://127.0.0.1:28285/v1
DEFAULT_MODEL=models/mimo-v2.5-pro
OPENAI_API_KEY=test-key
DATA_DIR=/tmp/hubproxy-sa-mcp-resource-unsupported
ENV

(
  cd "${tmp_root}/sa"
  setsid "${sa_dir}/hubproxy" >"${tmp_root}/hub.log" 2>&1 < /dev/null &
  echo "$!" >"${tmp_root}/hub.pid"
)
hub_pid="$(cat "${tmp_root}/hub.pid")"

for _ in {1..60}; do
  if ss -ltn | rg -q "0\.0\.0\.0:${hub_port}|127\.0\.0\.1:${hub_port}"; then
    break
  fi
  sleep 0.1
done
if ! ss -ltn | rg -q "0\.0\.0\.0:${hub_port}|127\.0\.0\.1:${hub_port}"; then
  echo "hubproxy did not start on ${hub_port}" >&2
  cat "${tmp_root}/hub.log" >&2 || true
  exit 1
fi

rpc_status_body() {
  local body="$1"
  local out="$2"
  curl -sS --max-time 15 \
    -H 'authorization: Bearer test-secret' \
    -H 'content-type: application/json' \
    --data "${body}" \
    -w '%{http_code}' \
    -o "${out}" \
    "http://127.0.0.1:${hub_port}/rpc"
}

list_body="${tmp_root}/list.json"
list_status="$(rpc_status_body '{"jsonrpc":"2.0","id":1,"method":"mcpServer/resource/list","params":{"server":"local"}}' "${list_body}")"
templates_body="${tmp_root}/templates.json"
templates_status="$(rpc_status_body '{"jsonrpc":"2.0","id":2,"method":"mcpServer/resource/templates","params":{"server":"local"}}' "${templates_body}")"

python3 - "${list_status}" "${list_body}" "${templates_status}" "${templates_body}" <<'PY'
import json
import pathlib
import sys

cases = [
    (sys.argv[1], pathlib.Path(sys.argv[2]), 1, "unsupported method: mcpServer/resource/list"),
    (sys.argv[3], pathlib.Path(sys.argv[4]), 2, "unsupported method: mcpServer/resource/templates"),
]
for status, path, expected_id, message in cases:
    if status != "404":
        raise SystemExit(f"expected HTTP 404 for {message}, got {status}: {path.read_text()}")
    payload = json.loads(path.read_text())
    if payload.get("id") != expected_id:
        raise SystemExit(f"id mismatch for {message}: {payload}")
    error = payload.get("error") or {}
    if error.get("code") != -32601 or error.get("message") != message:
        raise SystemExit(f"error mismatch for {message}: {payload}")

print("mcp_resource_unsupported_ok")
PY
