#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
sa_dir="$(cd "${script_dir}/.." && pwd)"
project_dir="$(cd "${sa_dir}/.." && pwd)"
env_file="${project_dir}/.env"

auth_token="$(awk -F= '$1=="AUTH"{print substr($0, index($0,"=")+1)}' "${env_file}" | tail -n 1)"
sa_port="$(awk -F= '$1=="SA_PORT"{print substr($0, index($0,"=")+1)}' "${env_file}" | tail -n 1)"
sa_port="${sa_port:-28080}"
base_url="http://127.0.0.1:${sa_port}"

events_out="$(mktemp)"
events_err="$(mktemp)"
tmp_dir="$(mktemp -d)"
hub_pid=""
events_pid=""

stop_events() {
  if [[ -n "${events_pid}" ]]; then
    kill -TERM "-${events_pid}" 2>/dev/null || true
    wait "${events_pid}" 2>/dev/null || true
    events_pid=""
  fi
}

cleanup() {
  stop_events
  if [[ -n "${hub_pid}" ]]; then
    kill "${hub_pid}" 2>/dev/null || true
    wait "${hub_pid}" 2>/dev/null || true
  fi
  rm -f "${events_out}" "${events_err}"
  rm -rf "${tmp_dir}"
}
trap cleanup EXIT

old_pid="$(ss -ltnp | sed -nE "s/.*:${sa_port} .*pid=([0-9]+).*/\\1/p" | head -n 1)"
if [[ -n "${old_pid}" ]]; then
  kill "${old_pid}" 2>/dev/null || true
  sleep 0.3
fi

setsid "${sa_dir}/hubproxy" > /tmp/hubproxy_sa_fs_watch.log 2>&1 < /dev/null &
hub_pid=$!

for _ in {1..50}; do
  if ss -ltnp | rg -q ":${sa_port} "; then
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

watch_id="watch-sa-1"
missing="$(rpc "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"fs/unwatch\",\"params\":{\"watchId\":\"${watch_id}\"}}")"
if ! rg -q '"ok":false' <<<"${missing}"; then
  echo "missing fs/unwatch should return ok:false" >&2
  echo "${missing}" >&2
  exit 1
fi

watch="$(rpc "{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"fs/watch\",\"params\":{\"path\":\"${tmp_dir}\",\"watchId\":\"${watch_id}\"}}")"
if ! rg -q "\"path\":\"${tmp_dir}\"" <<<"${watch}"; then
  echo "fs/watch response mismatch" >&2
  echo "${watch}" >&2
  exit 1
fi

first_unwatch="$(rpc "{\"jsonrpc\":\"2.0\",\"id\":3,\"method\":\"fs/unwatch\",\"params\":{\"watchId\":\"${watch_id}\"}}")"
if ! rg -q '"ok":true' <<<"${first_unwatch}"; then
  echo "first fs/unwatch should return ok:true" >&2
  echo "${first_unwatch}" >&2
  exit 1
fi

second_unwatch="$(rpc "{\"jsonrpc\":\"2.0\",\"id\":4,\"method\":\"fs/unwatch\",\"params\":{\"watchId\":\"${watch_id}\"}}")"
if ! rg -q '"ok":false' <<<"${second_unwatch}"; then
  echo "second fs/unwatch should return ok:false" >&2
  echo "${second_unwatch}" >&2
  exit 1
fi

deadline=$((SECONDS + 6))
while (( SECONDS < deadline )); do
  if rg -q 'event: fs/changed' "${events_out}" \
    && rg -q "\"watchId\":\"${watch_id}\"" "${events_out}" \
    && rg -q "\"changedPaths\":\\[\"${tmp_dir}\"\\]" "${events_out}"; then
    stop_events
    echo "fs_watch_unwatch_ok path=${tmp_dir}"
    exit 0
  fi
  sleep 0.1
done

stop_events
echo "fs/watch event missing" >&2
echo "--- watch ---" >&2
echo "${watch}" >&2
echo "--- events ---" >&2
cat "${events_out}" >&2
echo "--- curl stderr ---" >&2
cat "${events_err}" >&2
exit 1
