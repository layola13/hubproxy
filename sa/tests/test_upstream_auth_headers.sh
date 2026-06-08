#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
sa_dir="$(cd "${script_dir}/.." && pwd)"
project_dir="$(cd "${sa_dir}/.." && pwd)"
source "${script_dir}/lib/runtime_env.sh"
tmp_dir="$(mktemp -d)"
server_log="$(mktemp)"
capture_file="$(mktemp)"
hub_port="${SA_TEST_PROXY_PORT:-$(sa_test_free_port)}"
upstream_port="${SA_TEST_UPSTREAM_PORT:-$(sa_test_free_port)}"
server_pid=""
hub_pid=""

cleanup() {
  if [[ -n "${hub_pid}" ]]; then
    sa_test_stop_pid "${hub_pid}"
  fi
  if [[ -n "${server_pid}" ]]; then
    sa_test_stop_pid "${server_pid}"
  fi
  rm -rf "${tmp_dir}"
  rm -f "${server_log}" "${capture_file}"
}
trap cleanup EXIT

sa_test_assert_port_free "${hub_port}"
sa_test_assert_port_free "${upstream_port}"

python3 - "${capture_file}" "${upstream_port}" >"${server_log}" 2>&1 <<'PY' &
import http.server
import json
import sys
from pathlib import Path

capture = Path(sys.argv[1])
port = int(sys.argv[2])

payload = json.dumps({"ok": True}, separators=(",", ":")).encode("utf-8")

class Handler(http.server.BaseHTTPRequestHandler):
    def record(self):
        with capture.open("a", encoding="utf-8") as f:
            f.write(json.dumps({
                "method": self.command,
                "path": self.path,
                "authorization": self.headers.get("authorization"),
                "x-api-key": self.headers.get("x-api-key"),
                "api-key": self.headers.get("api-key"),
            }, separators=(",", ":")) + "\n")

    def send_json(self):
        self.send_response(200)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_POST(self):
        length = int(self.headers.get("content-length", "0"))
        self.rfile.read(length)
        if self.path in ("/v1/chat/completions", "/v1/responses"):
            self.record()
            self.send_json()
            return
        self.send_response(404)
        self.end_headers()

    def do_GET(self):
        if self.path == "/v1/models":
            self.record()
            self.send_json()
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

sa_test_write_env_from_root "${project_dir}/.env" "${tmp_dir}/.env.base" "${hub_port}" "local-secret-token"
awk -v upstream_port="${upstream_port}" '
  BEGIN { wrote_chat=0; wrote_resp=0; wrote_key=0; wrote_auth=0; wrote_sa_port=0 }
  /^CHAT_BASE_URL=/ { print "CHAT_BASE_URL=http://127.0.0.1:" upstream_port "/v1"; wrote_chat=1; next }
  /^RESPONSES_BASE_URL=/ { print "RESPONSES_BASE_URL=http://127.0.0.1:" upstream_port "/v1"; wrote_resp=1; next }
  /^OPENAI_API_KEY=/ { print "OPENAI_API_KEY=upstream-secret-token"; wrote_key=1; next }
  /^AUTH=/ { print "AUTH=local-secret-token"; wrote_auth=1; next }
  /^SA_PORT=/ { print; wrote_sa_port=1; next }
  { print }
  END {
    if (!wrote_chat) print "CHAT_BASE_URL=http://127.0.0.1:" upstream_port "/v1"
    if (!wrote_resp) print "RESPONSES_BASE_URL=http://127.0.0.1:" upstream_port "/v1"
    if (!wrote_key) print "OPENAI_API_KEY=upstream-secret-token"
    if (!wrote_auth) print "AUTH=local-secret-token"
  }
' "${tmp_dir}/.env.base" >"${tmp_dir}/.env"

hub_pid="$(sa_test_start_hubproxy "${sa_dir}" "${tmp_dir}" "${tmp_dir}/hubproxy.log")"
if ! sa_test_wait_port "${hub_port}" 50 0.1; then
  echo "hubproxy did not start on ${hub_port}" >&2
  cat "${tmp_dir}/hubproxy.log" >&2 || true
  exit 1
fi

client_headers=(
  -H 'authorization: Bearer local-secret-token'
  -H 'x-api-key: client-should-not-forward'
  -H 'api-key: client-should-not-forward'
)

curl -sS --max-time 15 \
  "${client_headers[@]}" \
  -H 'content-type: application/json' \
  --data '{"model":"mimo-v2.5","messages":[{"role":"user","content":"hello"}],"stream":false}' \
  "http://127.0.0.1:${hub_port}/v1/chat/completions" >/dev/null

curl -sS --max-time 15 \
  "${client_headers[@]}" \
  -H 'content-type: application/json' \
  --data '{"model":"mimo-v2.5","input":[{"type":"message","role":"user","content":[{"type":"input_text","text":"hello"}]}],"stream":false}' \
  "http://127.0.0.1:${hub_port}/v1/responses" >/dev/null

curl -sS --max-time 15 \
  "${client_headers[@]}" \
  "http://127.0.0.1:${hub_port}/v1/models" >/dev/null

python3 - "${capture_file}" <<'PY'
import json
import sys

rows = [json.loads(line) for line in open(sys.argv[1], encoding="utf-8") if line.strip()]
paths = {row["path"]: row for row in rows}
expected_paths = {"/v1/chat/completions", "/v1/responses", "/v1/models"}
if set(paths) != expected_paths:
    raise SystemExit(f"unexpected upstream paths: {rows!r}")
for row in rows:
    if row["authorization"] != "Bearer upstream-secret-token":
        raise SystemExit(f"bad upstream authorization: {row!r}")
    if row["x-api-key"] != "upstream-secret-token":
        raise SystemExit(f"bad upstream x-api-key: {row!r}")
    if row["api-key"] is not None:
        raise SystemExit(f"client api-key leaked upstream: {row!r}")
PY

echo "upstream_auth_headers_ok"
