#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
sa_dir="$(cd "${script_dir}/.." && pwd)"
env_file="${sa_dir}/.env"
auth_token="test-secret"
sa_port="${SA_TEST_PROXY_PORT:-28219}"
base_url="http://127.0.0.1:${sa_port}"
tmp_dir="$(mktemp -d)"
hub_pid=""
events_pid=""
events_out="${tmp_dir}/events.out"
events_err="${tmp_dir}/events.err"

cleanup() {
  if [[ -n "${events_pid}" ]]; then
    kill -TERM "-${events_pid}" 2>/dev/null || true
    wait "${events_pid}" 2>/dev/null || true
  fi
  if [[ -n "${hub_pid}" ]]; then
    kill "${hub_pid}" 2>/dev/null || true
    wait "${hub_pid}" 2>/dev/null || true
  fi
  rm -rf "${tmp_dir}"
}
trap cleanup EXIT

if ss -ltn | rg -q ":${sa_port}\\b"; then
  echo "test port already in use: ${sa_port}" >&2
  exit 1
fi

awk -v port="${sa_port}" -v auth="${auth_token}" '
  BEGIN { wrote_sa=0; wrote_port=0; wrote_auth=0 }
  /^SA_PORT=/ { print "SA_PORT=" port; wrote_sa=1; next }
  /^PORT=/ { print "PORT=" port; wrote_port=1; next }
  /^AUTH=/ { print "AUTH=" auth; wrote_auth=1; next }
  { print }
  END {
    if (!wrote_sa) print "SA_PORT=" port
    if (!wrote_port) print "PORT=" port
    if (!wrote_auth) print "AUTH=" auth
  }
' "${env_file}" > "${tmp_dir}/.env"

(
  cd "${tmp_dir}"
  setsid "${sa_dir}/hubproxy" > "${tmp_dir}/hubproxy.log" 2>&1 < /dev/null &
  echo "$!" > "${tmp_dir}/hubproxy.pid"
)
hub_pid="$(cat "${tmp_dir}/hubproxy.pid")"

for _ in {1..50}; do
  if ss -ltn | rg -q ":${sa_port} "; then
    break
  fi
  sleep 0.1
done

rpc() {
  curl -sS --max-time 15 \
    -H "authorization: Bearer ${auth_token}" \
    -H 'content-type: application/json' \
    --data "$1" \
    "${base_url}/rpc"
}

setsid timeout 8s curl -sS -N -H "authorization: Bearer ${auth_token}" \
  "${base_url}/events" >"${events_out}" 2>"${events_err}" &
events_pid=$!
sleep 0.3

start="$(rpc '{"jsonrpc":"2.0","id":1,"method":"thread/start","params":{}}')"
thread_id="$(sed -nE 's/.*"thread":\{"id":"([0-9]+)".*/\1/p' <<<"${start}" | head -n 1)"
if [[ -z "${thread_id}" ]]; then
  echo "failed to parse thread id" >&2
  echo "${start}" >&2
  exit 1
fi

turn="$(rpc "{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"turn/start\",\"params\":{\"threadId\":\"${thread_id}\",\"input\":[{\"type\":\"message\",\"role\":\"user\",\"content\":\"start\"}]}}")"
turn_id="$(sed -nE 's/.*"turn":\{"id":"([0-9]+)".*/\1/p' <<<"${turn}" | head -n 1)"
if [[ -z "${turn_id}" ]]; then
  echo "failed to parse turn id" >&2
  echo "${turn}" >&2
  exit 1
fi

steer="$(rpc "{\"jsonrpc\":\"2.0\",\"id\":3,\"method\":\"turn/steer\",\"params\":{\"threadId\":\"${thread_id}\",\"expectedTurnId\":\"${turn_id}\",\"input\":[{\"type\":\"message\",\"role\":\"user\",\"content\":\"steered\"}]}}")"
if ! rg -q "\"turnId\":\"${turn_id}\"" <<<"${steer}"; then
  echo "turn/steer response mismatch" >&2
  echo "${steer}" >&2
  exit 1
fi

items="$(rpc "{\"jsonrpc\":\"2.0\",\"id\":4,\"method\":\"thread/turns/items/list\",\"params\":{\"threadId\":\"${thread_id}\",\"turnId\":\"${turn_id}\"}}")"
if ! rg -q '"data":\[\{"type":"message","role":"user","content":"start"\},\{"type":"message","role":"user","content":"steered"\}\]' <<<"${items}"; then
  echo "turn/steer did not append input items" >&2
  echo "${items}" >&2
  exit 1
fi

deadline=$((SECONDS + 6))
while (( SECONDS < deadline )); do
  if rg -q 'event: item/started' "${events_out}" \
    && rg -q 'event: rawResponseItem/completed' "${events_out}" \
    && rg -q 'event: item/completed' "${events_out}" \
    && rg -q "\"threadId\":\"${thread_id}\"" "${events_out}" \
    && rg -q "\"turnId\":\"${turn_id}\"" "${events_out}" \
    && rg -q '"content":"steered"' "${events_out}"; then
    break
  fi
  sleep 0.1
done
if ! rg -q '"content":"steered"' "${events_out}"; then
  echo "turn/steer input item lifecycle events missing" >&2
  echo "--- events ---" >&2
  cat "${events_out}" >&2
  echo "--- curl stderr ---" >&2
  cat "${events_err}" >&2
  exit 1
fi

empty_first_turn="$(rpc "{\"jsonrpc\":\"2.0\",\"id\":5,\"method\":\"turn/start\",\"params\":{\"threadId\":\"${thread_id}\",\"input\":[]}}")"
empty_first_turn_id="$(sed -nE 's/.*"turn":\{"id":"([0-9]+)".*/\1/p' <<<"${empty_first_turn}" | head -n 1)"
if [[ -z "${empty_first_turn_id}" ]]; then
  echo "failed to parse empty-first turn id" >&2
  echo "${empty_first_turn}" >&2
  exit 1
fi

rpc "{\"jsonrpc\":\"2.0\",\"id\":6,\"method\":\"turn/steer\",\"params\":{\"threadId\":\"${thread_id}\",\"expectedTurnId\":\"${empty_first_turn_id}\",\"input\":[{\"type\":\"message\",\"role\":\"user\",\"content\":\"after-empty\"}]}}" >/dev/null
empty_first_items="$(rpc "{\"jsonrpc\":\"2.0\",\"id\":7,\"method\":\"thread/turns/items/list\",\"params\":{\"threadId\":\"${thread_id}\",\"turnId\":\"${empty_first_turn_id}\"}}")"
if ! rg -q '"data":\[\{"type":"message","role":"user","content":"after-empty"\}\]' <<<"${empty_first_items}"; then
  echo "turn/steer did not replace empty initial items cleanly" >&2
  echo "${empty_first_items}" >&2
  exit 1
fi

rpc "{\"jsonrpc\":\"2.0\",\"id\":8,\"method\":\"turn/steer\",\"params\":{\"threadId\":\"${thread_id}\",\"expectedTurnId\":\"${empty_first_turn_id}\",\"input\":[]}}" >/dev/null
empty_append_items="$(rpc "{\"jsonrpc\":\"2.0\",\"id\":9,\"method\":\"thread/turns/items/list\",\"params\":{\"threadId\":\"${thread_id}\",\"turnId\":\"${empty_first_turn_id}\"}}")"
if ! rg -q '"data":\[\{"type":"message","role":"user","content":"after-empty"\}\]' <<<"${empty_append_items}"; then
  echo "turn/steer empty input changed existing items" >&2
  echo "${empty_append_items}" >&2
  exit 1
fi

timing_thread="$(rpc '{"jsonrpc":"2.0","id":20,"method":"thread/start","params":{"threadId":"turn-steer-time-thread"}}')"
if ! rg -q '"id":"turn-steer-time-thread"' <<<"${timing_thread}"; then
  echo "failed to create timing thread" >&2
  echo "${timing_thread}" >&2
  exit 1
fi
timing_start="$(rpc '{"jsonrpc":"2.0","id":21,"method":"turn/start","params":{"threadId":"turn-steer-time-thread","input":[{"type":"message","role":"user","content":"initial"}]}}')"
sleep 1
timing_before="$(rpc '{"jsonrpc":"2.0","id":22,"method":"thread/read","params":{"threadId":"turn-steer-time-thread","includeTurns":true}}')"
timing_turn_id="$(python3 - "${timing_start}" <<'PY'
import json
import sys
print(json.loads(sys.argv[1])["result"]["turn"]["id"])
PY
)"
rpc "{\"jsonrpc\":\"2.0\",\"id\":23,\"method\":\"turn/steer\",\"params\":{\"threadId\":\"turn-steer-time-thread\",\"expectedTurnId\":\"${timing_turn_id}\",\"input\":[]}}" >/dev/null
timing_after="$(rpc '{"jsonrpc":"2.0","id":24,"method":"thread/read","params":{"threadId":"turn-steer-time-thread","includeTurns":true}}')"

python3 - "${timing_start}" "${timing_before}" "${timing_after}" <<'PY'
import json
import sys

start = json.loads(sys.argv[1])["result"]["turn"]
before_turns = json.loads(sys.argv[2])["result"]["thread"]["turns"]
after_turns = json.loads(sys.argv[3])["result"]["thread"]["turns"]
before = next(entry for entry in before_turns if entry["id"] == start["id"])
after = next(entry for entry in after_turns if entry["id"] == start["id"])

if start["createdAt"] != start["updatedAt"] or start["startedAt"] != start["createdAt"]:
    raise SystemExit(f"turn/start with initial input should keep Deno newTurn timestamps equal: {start}")
if before["updatedAt"] != start["updatedAt"]:
    raise SystemExit(f"thread/read before steer should not drift updatedAt: start={start} before={before}")
if after["createdAt"] != start["createdAt"] or after["startedAt"] != start["startedAt"]:
    raise SystemExit(f"turn/steer should preserve start timestamps: start={start} after={after}")
if after["updatedAt"] <= before["updatedAt"]:
    raise SystemExit(f"turn/steer with empty input should advance updatedAt like Deno: before={before} after={after}")
if after["items"] != before["items"]:
    raise SystemExit(f"empty turn/steer should not mutate items: before={before} after={after}")
PY

missing_expected="$(rpc "{\"jsonrpc\":\"2.0\",\"id\":10,\"method\":\"turn/steer\",\"params\":{\"threadId\":\"${thread_id}\",\"input\":[]}}")"
if ! rg -q '"error":\{"code":-32000,"message":"turn not found"\}' <<<"${missing_expected}"; then
  echo "turn/steer without expectedTurnId should match Deno turn-not-found behavior" >&2
  echo "${missing_expected}" >&2
  exit 1
fi

invalid_expected="$(rpc "{\"jsonrpc\":\"2.0\",\"id\":11,\"method\":\"turn/steer\",\"params\":{\"threadId\":\"${thread_id}\",\"expectedTurnId\":\"not-a-turn\",\"input\":[]}}")"
if ! rg -q '"error":\{"code":-32000,"message":"turn not found"\}' <<<"${invalid_expected}"; then
  echo "turn/steer with a non-numeric expectedTurnId should not steer the first SA turn" >&2
  echo "${invalid_expected}" >&2
  exit 1
fi

wrong_expected="$(rpc "{\"jsonrpc\":\"2.0\",\"id\":12,\"method\":\"turn/steer\",\"params\":{\"threadId\":\"${thread_id}\",\"expectedTurnId\":\"999999\",\"input\":[]}}")"
if ! rg -q '"error":\{"code":-32000,"message":"turn not found"\}' <<<"${wrong_expected}"; then
  echo "turn/steer with an unknown expectedTurnId should return turn not found" >&2
  echo "${wrong_expected}" >&2
  exit 1
fi

echo "turn_steer_items_ok thread=${thread_id} turn=${turn_id}"
