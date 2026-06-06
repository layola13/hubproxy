#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
sa_dir="$(cd "${script_dir}/.." && pwd)"
env_file="${sa_dir}/.env"
hub_port="${SA_TEST_PROXY_PORT:-28222}"
tmp_dir="$(mktemp -d)"
hub_pid=""

cleanup() {
  if [[ -n "${hub_pid}" ]]; then
    kill "${hub_pid}" 2>/dev/null || true
    wait "${hub_pid}" 2>/dev/null || true
  fi
  rm -rf "${tmp_dir}"
}
trap cleanup EXIT

if ss -ltn | rg -q ":${hub_port}\\b"; then
  echo "test port already in use: ${hub_port}" >&2
  exit 1
fi

awk -v port="${hub_port}" '
  BEGIN { wrote_auth=0; wrote_sa=0; wrote_port=0 }
  /^AUTH=/ { print "AUTH=client-secret"; wrote_auth=1; next }
  /^SA_PORT=/ { print "SA_PORT=" port; wrote_sa=1; next }
  /^PORT=/ { print "PORT=" port; wrote_port=1; next }
  { print }
  END {
    if (!wrote_auth) print "AUTH=client-secret"
    if (!wrote_sa) print "SA_PORT=" port
    if (!wrote_port) print "PORT=" port
  }
' "${env_file}" > "${tmp_dir}/.env"

(
  cd "${tmp_dir}"
  setsid "${sa_dir}/hubproxy" > "${tmp_dir}/hubproxy.log" 2>&1 < /dev/null &
  echo "$!" > "${tmp_dir}/hubproxy.pid"
)
hub_pid="$(cat "${tmp_dir}/hubproxy.pid")"

for _ in {1..80}; do
  if ss -ltn | rg -q ":${hub_port} "; then
    break
  fi
  sleep 0.1
done
if ! ss -ltn | rg -q ":${hub_port} "; then
  echo "hubproxy did not start on ${hub_port}" >&2
  cat "${tmp_dir}/hubproxy.log" >&2 || true
  exit 1
fi

rpc() {
  curl -sS --max-time 15 \
    -H 'authorization: Bearer client-secret' \
    -H 'content-type: application/json' \
    --data "$1" \
    "http://127.0.0.1:${hub_port}/rpc"
}

thread_id="turn-rpc-collab-parity"
rpc "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"thread/start\",\"params\":{\"threadId\":\"${thread_id}\"}}" >/dev/null

python3 - "${thread_id}" <<'PY' | while IFS= read -r body; do rpc "${body}"; printf '\n'; done > "${tmp_dir}/responses.jsonl"
import json
import sys

thread_id = sys.argv[1]
requests = [
    {"id": 2, "params": {"threadId": thread_id, "input": [], "collaborationMode": {"mode": "goal"}}},
    {"id": 3, "params": {"threadId": thread_id, "input": [], "collaborationMode": {"mode": " Goal\t"}}},
    {"id": 4, "params": {"threadId": thread_id, "input": [], "collaborationMode": {"mode": "CODE"}}},
    {"id": 5, "params": {"threadId": thread_id, "input": [], "collaborationMode": {"mode": " Review "}}},
    {"id": 6, "params": {"threadId": thread_id, "input": [], "collaboration_mode": {"kind": "goal"}}},
    {"id": 7, "params": {"threadId": thread_id, "input": [], "client_metadata": {"mode": "code"}}},
    {"id": 8, "params": {"threadId": thread_id, "input": [], "collaborationModeKind": "goal"}},
]
for req in requests:
    print(json.dumps({"jsonrpc": "2.0", "id": req["id"], "method": "turn/start", "params": req["params"]}, separators=(",", ":")))
PY

python3 - "${tmp_dir}/responses.jsonl" <<'PY'
import json
import sys

responses = [json.loads(line) for line in open(sys.argv[1], encoding="utf-8") if line.strip()]
by_id = {resp["id"]: resp["result"]["turn"] for resp in responses}

if by_id[2].get("collaborationModeKind") != "goal":
    raise SystemExit(by_id[2])
if by_id[3].get("collaborationModeKind") != "goal":
    raise SystemExit(f"trim/lowercase mode should normalize to goal: {by_id[3]}")
if by_id[4].get("collaborationModeKind") != "code":
    raise SystemExit(f"uppercase mode should normalize to code: {by_id[4]}")
if by_id[5].get("collaborationModeKind") != "review":
    raise SystemExit(f"arbitrary mode should normalize and round-trip like Deno: {by_id[5]}")
for req_id in (6, 7, 8):
    if by_id[req_id].get("collaborationModeKind") is not None:
        raise SystemExit(f"turn/start should only honor params.collaborationMode.mode like Deno: id={req_id} turn={by_id[req_id]}")
PY

echo "turn_start_collaboration_mode_rpc_parity_ok"
