#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
sa_dir="$(cd "${script_dir}/.." && pwd)"
project_dir="$(cd "${sa_dir}/.." && pwd)"
env_file="${project_dir}/.env"
backup_file="$(mktemp)"
server_log="$(mktemp)"
capture_file="$(mktemp)"
server_pid=""
hub_pid=""

cleanup() {
  if [[ -n "${hub_pid}" ]]; then
    kill "${hub_pid}" 2>/dev/null || true
    wait "${hub_pid}" 2>/dev/null || true
  fi
  if [[ -n "${server_pid}" ]]; then
    kill "${server_pid}" 2>/dev/null || true
    wait "${server_pid}" 2>/dev/null || true
  fi
  cp "${backup_file}" "${env_file}"
  rm -f "${backup_file}" "${server_log}" "${capture_file}"
}
trap cleanup EXIT

cp "${env_file}" "${backup_file}"

old_pid="$(ss -ltnp | sed -n 's/.*0\.0\.0\.0:28080.*pid=\([0-9]*\).*/\1/p' | head -n 1)"
if [[ -n "${old_pid}" ]]; then
  kill "${old_pid}" 2>/dev/null || true
  sleep 0.3
fi

python3 - "${capture_file}" >"${server_log}" 2>&1 <<'PY' &
import http.server
import json
import sys
from pathlib import Path

capture = Path(sys.argv[1])

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

http.server.ThreadingHTTPServer(("127.0.0.1", 28082), Handler).serve_forever()
PY
server_pid=$!

for _ in {1..50}; do
  if ss -ltnp | rg -q '127\.0\.0\.1:28082'; then
    break
  fi
  sleep 0.1
done

awk '
  BEGIN { wrote_chat=0; wrote_resp=0; wrote_key=0; wrote_auth=0; wrote_sa_port=0 }
  /^CHAT_BASE_URL=/ { print "CHAT_BASE_URL=http://127.0.0.1:28082/v1"; wrote_chat=1; next }
  /^RESPONSES_BASE_URL=/ { print "RESPONSES_BASE_URL=http://127.0.0.1:28082/v1"; wrote_resp=1; next }
  /^OPENAI_API_KEY=/ { print "OPENAI_API_KEY=upstream-secret-token"; wrote_key=1; next }
  /^AUTH=/ { print "AUTH=local-secret-token"; wrote_auth=1; next }
  /^SA_PORT=/ { print "SA_PORT=28080"; wrote_sa_port=1; next }
  { print }
  END {
    if (!wrote_chat) print "CHAT_BASE_URL=http://127.0.0.1:28082/v1"
    if (!wrote_resp) print "RESPONSES_BASE_URL=http://127.0.0.1:28082/v1"
    if (!wrote_key) print "OPENAI_API_KEY=upstream-secret-token"
    if (!wrote_auth) print "AUTH=local-secret-token"
    if (!wrote_sa_port) print "SA_PORT=28080"
  }
' "${backup_file}" >"${env_file}"

setsid "${sa_dir}/hubproxy" > /tmp/hubproxy_sa_upstream_auth_headers.log 2>&1 < /dev/null &
hub_pid=$!

for _ in {1..50}; do
  if ss -ltnp | rg -q '0\.0\.0\.0:28080'; then
    break
  fi
  sleep 0.1
done

client_headers=(
  -H 'authorization: Bearer local-secret-token'
  -H 'x-api-key: client-should-not-forward'
  -H 'api-key: client-should-not-forward'
)

curl -sS --max-time 15 \
  "${client_headers[@]}" \
  -H 'content-type: application/json' \
  --data '{"model":"mimo-v2.5","messages":[{"role":"user","content":"hello"}],"stream":false}' \
  'http://127.0.0.1:28080/v1/chat/completions' >/dev/null

curl -sS --max-time 15 \
  "${client_headers[@]}" \
  -H 'content-type: application/json' \
  --data '{"model":"mimo-v2.5","input":[{"type":"message","role":"user","content":[{"type":"input_text","text":"hello"}]}],"stream":false}' \
  'http://127.0.0.1:28080/v1/responses' >/dev/null

curl -sS --max-time 15 \
  "${client_headers[@]}" \
  'http://127.0.0.1:28080/v1/models' >/dev/null

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
