#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
sa_dir="$(cd "${script_dir}/.." && pwd)"
project_dir="$(cd "${sa_dir}/.." && pwd)"
source "${script_dir}/lib/runtime_env.sh"
env_file="${project_dir}/.env"
tmp_dir="$(mktemp -d)"
server_log="$(mktemp)"
first_body="$(mktemp)"
second_body="$(mktemp)"
first_resp="$(mktemp)"
second_resp="$(mktemp)"
counter_file="$(mktemp)"
hub_port="${SA_TEST_PROXY_PORT:-$(sa_test_free_port)}"
upstream_port="${SA_TEST_UPSTREAM_PORT:-$(sa_test_free_port)}"
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
  rm -f "${server_log}" "${first_body}" "${second_body}" "${first_resp}" "${second_resp}" "${counter_file}"
}
trap cleanup EXIT

sa_test_assert_port_free "${hub_port}"
sa_test_assert_port_free "${upstream_port}"

printf '0' >"${counter_file}"
python3 - "${first_body}" "${second_body}" "${counter_file}" "${upstream_port}" <<'PY' >"${server_log}" 2>&1 &
import http.server
import sys

first_path, second_path, counter_path = sys.argv[1:4]
port = int(sys.argv[4])

class Handler(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        length = int(self.headers.get("content-length", "0"))
        body = self.rfile.read(length).decode("utf-8", "replace")
        if self.path == "/v1/responses":
            with open(counter_path, "r+", encoding="utf-8") as f:
                raw = f.read().strip() or "0"
                count = int(raw) + 1
                f.seek(0)
                f.truncate()
                f.write(str(count))
            with open(first_path if count == 1 else second_path, "w", encoding="utf-8") as f:
                f.write(body)
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

if ! sa_test_wait_port "${upstream_port}" 50 0.1; then
  echo "upstream did not start on ${upstream_port}" >&2
  cat "${server_log}" >&2 || true
  exit 1
fi

sa_test_write_env_from_root "${env_file}" "${tmp_dir}/.env.base" "${hub_port}" "client-secret"
awk -v upstream_port="${upstream_port}" '
  BEGIN { wrote_chat=0; wrote_resp=0; wrote_sa_port=0 }
  /^CHAT_BASE_URL=/ { print "CHAT_BASE_URL=http://127.0.0.1:" upstream_port "/v1"; wrote_chat=1; next }
  /^RESPONSES_BASE_URL=/ { print "RESPONSES_BASE_URL=http://127.0.0.1:" upstream_port "/v1"; wrote_resp=1; next }
  /^SA_PORT=/ { print; wrote_sa_port=1; next }
  { print }
  END {
    if (!wrote_chat) print "CHAT_BASE_URL=http://127.0.0.1:" upstream_port "/v1"
    if (!wrote_resp) print "RESPONSES_BASE_URL=http://127.0.0.1:" upstream_port "/v1"
  }
' "${tmp_dir}/.env.base" >"${tmp_dir}/.env"

hub_pid="$(sa_test_start_hubproxy "${sa_dir}" "${tmp_dir}" "${tmp_dir}/hubproxy.log")"
if ! sa_test_wait_port "${hub_port}" 50 0.1; then
  echo "hubproxy did not start on ${hub_port}" >&2
  cat "${tmp_dir}/hubproxy.log" >&2 || true
  exit 1
fi

auth="client-secret"
curl -sS --max-time 15 \
  -H "authorization: Bearer ${auth}" \
  -H 'content-type: application/json' \
  --data '{"model":"models/mimo-v2.5-pro","store":false,"prompt_cache_key":"keep-me","include":["reasoning.encrypted_content"],"reasoning":{"effort":"medium"},"input":[{"type":"message","role":"user","content":[{"type":"input_text","text":"hello"}]}]}' \
  "http://127.0.0.1:${hub_port}/v1/responses" >"${first_resp}"

curl -sS --max-time 15 \
  -H "authorization: Bearer ${auth}" \
  -H 'content-type: application/json' \
  --data '{"model":"models/gemini-3.5-flash","store":false,"prompt_cache_key":"drop-me","include":["reasoning.encrypted_content"],"reasoning":{"effort":"medium"},"input":[{"type":"message","role":"user","content":[{"type":"input_text","text":"hello"}]}]}' \
  "http://127.0.0.1:${hub_port}/v1/responses" >"${second_resp}"

if ! rg -q '"status":"completed"' "${first_resp}" || ! rg -q '"status":"completed"' "${second_resp}"; then
  echo "responses proxy did not return mock responses" >&2
  cat "${first_resp}" >&2
  cat "${second_resp}" >&2
  exit 1
fi

if ! rg -q '"store":false' "${first_body}" \
  || ! rg -q '"prompt_cache_key":"keep-me"' "${first_body}" \
  || ! rg -q '"include":\["reasoning\.encrypted_content"\]' "${first_body}" \
  || ! rg -q '"reasoning":\{"effort":"medium"\}' "${first_body}" \
  || ! rg -q '"input":\[' "${first_body}"; then
  echo "non-gemini responses request did not preserve responses-only fields" >&2
  cat "${first_body}" >&2
  exit 1
fi

if ! rg -q '"model":"models/gemini-3.5-flash"' "${second_body}" \
  || ! rg -q '"include":\["reasoning\.encrypted_content"\]' "${second_body}" \
  || ! rg -q '"reasoning":\{"effort":"medium"\}' "${second_body}" \
  || ! rg -q '"input":\[' "${second_body}"; then
  echo "gemini responses request missing preserved fields" >&2
  cat "${second_body}" >&2
  exit 1
fi

if rg -q 'store|prompt_cache_key|drop-me' "${second_body}"; then
  echo "gemini responses request leaked incompatible fields" >&2
  cat "${second_body}" >&2
  exit 1
fi

echo "responses_gemini_capture_ok"
