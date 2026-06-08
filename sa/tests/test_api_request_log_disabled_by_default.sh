#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
sa_dir="$(cd "${script_dir}/.." && pwd)"
project_dir="$(cd "${sa_dir}/.." && pwd)"
source "${script_dir}/lib/runtime_env.sh"
env_file="${project_dir}/.env"
tmp_dir="$(mktemp -d)"
run_root="${tmp_dir}/run"
server_log="${tmp_dir}/server.log"
response_body="${tmp_dir}/response.json"
sa_port="${SA_TEST_PROXY_PORT:-$(sa_test_free_port)}"
upstream_port="${SA_TEST_UPSTREAM_PORT:-$(sa_test_free_port)}"
server_pid=""
hub_pid=""

cleanup() {
  if [[ -n "${hub_pid}" ]]; then sa_test_stop_pid "${hub_pid}"; fi
  if [[ -n "${server_pid}" ]]; then sa_test_stop_pid "${server_pid}"; fi
  rm -rf "${tmp_dir}"
}
trap cleanup EXIT

sa_test_assert_port_free "${sa_port}"
sa_test_assert_port_free "${upstream_port}"

UPSTREAM_PORT="${upstream_port}" python3 <<'PY' >"${server_log}" 2>&1 &
import http.server
import os

port = int(os.environ["UPSTREAM_PORT"])

class Handler(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        length = int(self.headers.get("content-length", "0"))
        self.rfile.read(length)
        if self.path == "/v1/responses":
            self.send_response(200)
            self.send_header("content-type", "application/json")
            self.end_headers()
            self.wfile.write(b'{"output":[],"status":"completed"}')
            return
        self.send_response(404)
        self.end_headers()

    def log_message(self, *_args):
        return

http.server.ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
PY
server_pid=$!
sa_test_wait_port "${upstream_port}" 50 0.1

mkdir -p "${run_root}/sa"
awk -v port="${sa_port}" -v upstream_port="${upstream_port}" '
  /^HUBPROXY_LOG_DIR=/ { next }
  /^AUTH=/ { print "AUTH=client-secret"; wrote_auth=1; next }
  /^CHAT_BASE_URL=/ { print "CHAT_BASE_URL=http://127.0.0.1:" upstream_port "/v1"; wrote_chat=1; next }
  /^RESPONSES_BASE_URL=/ { print "RESPONSES_BASE_URL=http://127.0.0.1:" upstream_port "/v1"; wrote_resp=1; next }
  /^SA_PORT=/ { print "SA_PORT=" port; wrote_sa_port=1; next }
  /^PORT=/ { print "PORT=" port; next }
  { print }
  END {
    if (!wrote_auth) print "AUTH=client-secret"
    if (!wrote_chat) print "CHAT_BASE_URL=http://127.0.0.1:" upstream_port "/v1"
    if (!wrote_resp) print "RESPONSES_BASE_URL=http://127.0.0.1:" upstream_port "/v1"
    if (!wrote_sa_port) print "SA_PORT=" port
  }
' "${env_file}" >"${run_root}/.env"

(
  cd "${run_root}/sa"
  setsid "${sa_dir}/hubproxy" >"${tmp_dir}/hubproxy.log" 2>&1 < /dev/null &
  echo "$!" >"${tmp_dir}/hubproxy.pid"
)
hub_pid="$(cat "${tmp_dir}/hubproxy.pid")"

if ! sa_test_wait_port "${sa_port}" 50 0.1; then
  echo "hubproxy did not start on ${sa_port}" >&2
  cat "${tmp_dir}/hubproxy.log" >&2 || true
  exit 1
fi

curl -sS --max-time 15 \
  -H 'authorization: Bearer client-secret' \
  -H 'x-api-key: client-secret' \
  -H 'content-type: application/json' \
  --data '{"model":"gpt-4.1","input":[{"type":"message","role":"user","content":[{"type":"input_text","text":"hi"}]}]}' \
  "http://127.0.0.1:${sa_port}/v1/responses" >"${response_body}"

if ! rg -q '"status":"completed"' "${response_body}"; then
  echo "responses proxy did not return mock response" >&2
  cat "${response_body}" >&2
  exit 1
fi

if [[ -e "${run_root}/logs" || -e "${run_root}/sa/logs" ]]; then
  echo "logs directory was created even though HUBPROXY_LOG_DIR is unset" >&2
  find "${run_root}" -maxdepth 3 -type f -print >&2
  exit 1
fi

if find "${run_root}" -name 'request-sa-*.json' -print -quit | rg -q .; then
  echo "request log files were written even though HUBPROXY_LOG_DIR is unset" >&2
  find "${run_root}" -name 'request-sa-*.json' -print >&2
  exit 1
fi

echo "api_request_log_disabled_by_default_ok"
