#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
sa_dir="$(cd "${script_dir}/.." && pwd)"
project_dir="$(cd "${sa_dir}/.." && pwd)"
source "${script_dir}/lib/runtime_env.sh"
env_file="${project_dir}/.env"
tmp_dir="$(mktemp -d)"
server_log="$(mktemp)"
chat_resp="$(mktemp)"
responses_resp="$(mktemp)"
models_resp="$(mktemp)"
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
  rm -f "${server_log}" "${chat_resp}" "${responses_resp}" "${models_resp}"
}
trap cleanup EXIT

sa_test_assert_port_free "${hub_port}"
sa_test_assert_port_free "${upstream_port}"

python3 - "${upstream_port}" <<'PY' >"${server_log}" 2>&1 &
import http.server
import json
import sys

port = int(sys.argv[1])

payload = json.dumps({
    "id": "large",
    "object": "non_sse",
    "body": "x" * 12000 + "SA_LARGE_BODY_END",
}, separators=(",", ":")).encode("utf-8")

class Handler(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        length = int(self.headers.get("content-length", "0"))
        self.rfile.read(length)
        if self.path in ("/v1/chat/completions", "/v1/responses"):
            self.send_response(200)
            self.send_header("content-type", "application/json")
            self.send_header("content-length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
            return
        self.send_response(404)
        self.end_headers()

    def do_GET(self):
        if self.path == "/v1/models":
            self.send_response(200)
            self.send_header("content-type", "application/json")
            self.send_header("content-length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
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
  --data '{"model":"mimo-v2.5","messages":[{"role":"user","content":"hello"}],"stream":false}' \
  "http://127.0.0.1:${hub_port}/v1/chat/completions" >"${chat_resp}"

curl -sS --max-time 15 \
  -H "authorization: Bearer ${auth}" \
  -H 'content-type: application/json' \
  --data '{"model":"mimo-v2.5","input":[{"type":"message","role":"user","content":[{"type":"input_text","text":"hello"}]}],"stream":false}' \
  "http://127.0.0.1:${hub_port}/v1/responses" >"${responses_resp}"

curl -sS --max-time 15 \
  -H "authorization: Bearer ${auth}" \
  "http://127.0.0.1:${hub_port}/v1/models" >"${models_resp}"

for file in "${chat_resp}" "${responses_resp}" "${models_resp}"; do
  size="$(wc -c <"${file}")"
  if (( size < 10000 )) || ! rg -q 'SA_LARGE_BODY_END' "${file}"; then
    echo "large non-SSE body was truncated or missing marker: ${file}, size=${size}" >&2
    cat "${file}" >&2
    exit 1
  fi
done

echo "large_non_sse_body_ok"
