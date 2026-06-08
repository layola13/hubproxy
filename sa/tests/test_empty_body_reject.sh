#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
sa_dir="$(cd "${script_dir}/.." && pwd)"
project_dir="$(cd "${sa_dir}/.." && pwd)"
source "${script_dir}/lib/runtime_env.sh"
env_file="${project_dir}/.env"
tmp_dir="$(mktemp -d)"
server_log="$(mktemp)"
counter_file="$(mktemp)"
chat_resp="$(mktemp)"
resp_resp="$(mktemp)"
sa_port="${SA_TEST_PROXY_PORT:-$(sa_test_free_port)}"
upstream_port="$(sa_test_free_port)"
server_pid=""
hub_pid=""

cleanup() {
  if [[ -n "${hub_pid}" ]]; then
    sa_test_stop_pid "${hub_pid}"
  fi
  if [[ -n "${server_pid}" ]]; then
    kill "${server_pid}" 2>/dev/null || true
    wait "${server_pid}" 2>/dev/null || true
  fi
  rm -rf "${tmp_dir}"
  rm -f "${server_log}" "${counter_file}" "${chat_resp}" "${resp_resp}"
}
trap cleanup EXIT

sa_test_assert_port_free "${sa_port}"
sa_test_assert_port_free "${upstream_port}"

printf '0' >"${counter_file}"
python3 - "${counter_file}" "${upstream_port}" <<'PY' >"${server_log}" 2>&1 &
import http.server
import sys

counter_path = sys.argv[1]
port = int(sys.argv[2])

class Handler(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        with open(counter_path, "r+", encoding="utf-8") as f:
            raw = f.read().strip() or "0"
            count = int(raw) + 1
            f.seek(0)
            f.truncate()
            f.write(str(count))
        self.send_response(500)
        self.send_header("content-type", "text/plain")
        self.end_headers()
        self.wfile.write(b"unexpected upstream call")

    def log_message(self, *_args):
        return

http.server.ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
PY
server_pid=$!

if ! sa_test_wait_port "${upstream_port}" 50 0.1; then
  echo "upstream did not start on ${upstream_port}" >&2
  cat "${server_log}" >&2 || true
  exit 1
fi

sa_test_write_env_from_root "${env_file}" "${tmp_dir}/.env.base" "${sa_port}" "client-secret"
awk -v upstream_port="${upstream_port}" -v sa_port="${sa_port}" '
  BEGIN { wrote_chat=0; wrote_resp=0; wrote_sa_port=0 }
  /^CHAT_BASE_URL=/ { print "CHAT_BASE_URL=http://127.0.0.1:" upstream_port "/v1"; wrote_chat=1; next }
  /^RESPONSES_BASE_URL=/ { print "RESPONSES_BASE_URL=http://127.0.0.1:" upstream_port "/v1"; wrote_resp=1; next }
  /^SA_PORT=/ { print; wrote_sa_port=1; next }
  { print }
  END {
    if (!wrote_chat) print "CHAT_BASE_URL=http://127.0.0.1:" upstream_port "/v1"
    if (!wrote_resp) print "RESPONSES_BASE_URL=http://127.0.0.1:" upstream_port "/v1"
    if (!wrote_sa_port) print "SA_PORT=" sa_port
  }
' "${tmp_dir}/.env.base" >"${tmp_dir}/.env"

hub_pid="$(sa_test_start_hubproxy "${sa_dir}" "${tmp_dir}" "${tmp_dir}/hubproxy.log")"
if ! sa_test_wait_port "${sa_port}" 50 0.1; then
  echo "hubproxy did not start on ${sa_port}" >&2
  cat "${tmp_dir}/hubproxy.log" >&2 || true
  exit 1
fi

auth="client-secret"
chat_status="$(curl -sS --max-time 15 -o "${chat_resp}" -w '%{http_code}' \
  -H "authorization: Bearer ${auth}" \
  -H 'content-type: application/json' \
  --data '' \
  "http://127.0.0.1:${sa_port}/v1/chat/completions")"

resp_status="$(curl -sS --max-time 15 -o "${resp_resp}" -w '%{http_code}' \
  -H "authorization: Bearer ${auth}" \
  -H 'content-type: application/json' \
  --data '  	
  ' \
  "http://127.0.0.1:${sa_port}/v1/responses")"

if [[ "${chat_status}" != "400" ]] || [[ "${resp_status}" != "400" ]]; then
  echo "empty body requests did not return 400" >&2
  echo "chat=${chat_status}" >&2
  cat "${chat_resp}" >&2
  echo "responses=${resp_status}" >&2
  cat "${resp_resp}" >&2
  exit 1
fi

if ! rg -q 'Request body must be a non-empty JSON document\.' "${chat_resp}" \
  || ! rg -q 'Request body must be a non-empty JSON document\.' "${resp_resp}"; then
  echo "empty body response missing expected error message" >&2
  cat "${chat_resp}" >&2
  cat "${resp_resp}" >&2
  exit 1
fi

if [[ "$(cat "${counter_file}")" != "0" ]]; then
  echo "empty body request leaked to upstream" >&2
  cat "${counter_file}" >&2
  exit 1
fi

echo "empty_body_reject_ok"
