#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
sa_dir="$(cd "${script_dir}/.." && pwd)"
project_dir="$(cd "${sa_dir}/.." && pwd)"
env_file="${project_dir}/.env"
backup_file="$(mktemp)"
server_log="$(mktemp)"
response_body="$(mktemp)"
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
  rm -f "${backup_file}" "${server_log}" "${response_body}"
}
trap cleanup EXIT

cp "${env_file}" "${backup_file}"

old_pid="$(ss -ltnp | sed -n 's/.*0\.0\.0\.0:28080.*pid=\([0-9]*\).*/\1/p' | head -n 1)"
if [[ -n "${old_pid}" ]]; then
  kill "${old_pid}" 2>/dev/null || true
  sleep 0.3
fi

python3 <<'PY' >"${server_log}" 2>&1 &
import http.server
import json

BODY = json.dumps({
    "output": [
        {"id": "think_json", "type": "thinking", "text": "native json think"},
        {
            "id": "msg_json",
            "type": "message",
            "role": "assistant",
            "reasoning_content": "message json think",
            "content": [{"type": "output_text", "text": "answer"}],
        },
    ],
    "output_text": "answer",
    "status": "completed",
}, separators=(",", ":"))

class Handler(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        length = int(self.headers.get("content-length", "0"))
        self.rfile.read(length)
        if self.path == "/v1/responses":
            payload = BODY.encode("utf-8")
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

http.server.ThreadingHTTPServer(("127.0.0.1", 28097), Handler).serve_forever()
PY
server_pid=$!

for _ in {1..50}; do
  if ss -ltnp | rg -q '127\.0\.0\.1:28097'; then
    break
  fi
  sleep 0.1
done

awk '
  BEGIN { wrote_chat=0; wrote_resp=0; wrote_sa_port=0 }
  /^CHAT_BASE_URL=/ { print "CHAT_BASE_URL=http://127.0.0.1:28097/v1"; wrote_chat=1; next }
  /^RESPONSES_BASE_URL=/ { print "RESPONSES_BASE_URL=http://127.0.0.1:28097/v1"; wrote_resp=1; next }
  /^SA_PORT=/ { print "SA_PORT=28080"; wrote_sa_port=1; next }
  { print }
  END {
    if (!wrote_chat) print "CHAT_BASE_URL=http://127.0.0.1:28097/v1"
    if (!wrote_resp) print "RESPONSES_BASE_URL=http://127.0.0.1:28097/v1"
    if (!wrote_sa_port) print "SA_PORT=28080"
  }
' "${backup_file}" >"${env_file}"

(cd "${sa_dir}" && setsid ./hubproxy > /tmp/hubproxy_sa_responses_native_thinking_json.log 2>&1 < /dev/null) &
hub_pid=$!

for _ in {1..50}; do
  if ss -ltnp | rg -q '0\.0\.0\.0:28080'; then
    break
  fi
  sleep 0.1
done

auth="$(awk -F= '$1=="AUTH"{print substr($0, index($0, "=") + 1)}' "${env_file}")"
curl -sS --max-time 15 \
  -H "authorization: Bearer ${auth}" \
  -H 'content-type: application/json' \
  --data '{"model":"models/mimo-v2.5-pro","stream":false,"input":[{"type":"message","role":"user","content":[{"type":"input_text","text":"hello"}]}]}' \
  'http://127.0.0.1:28080/v1/responses' >"${response_body}"

python3 - "${response_body}" <<'PY'
import json
import sys

body = json.load(open(sys.argv[1], encoding="utf-8"))
output = body.get("output") or []
if len(output) != 3:
    raise SystemExit(f"wrong output length: {body!r}")
if output[0].get("type") != "reasoning" or output[0].get("summary", [{}])[0].get("text") != "native json think":
    raise SystemExit(f"native thinking was not normalized: {output!r}")
if output[1].get("type") != "reasoning" or output[1].get("summary", [{}])[0].get("text") != "message json think":
    raise SystemExit(f"message reasoning_content was not extracted: {output!r}")
if output[2].get("type") != "message" or output[2].get("content", [{}])[0].get("text") != "answer":
    raise SystemExit(f"message output was not preserved: {output!r}")
if body.get("output_text") != "answer" or body.get("status") != "completed":
    raise SystemExit(f"response tail was not preserved: {body!r}")
raw = open(sys.argv[1], encoding="utf-8").read()
if '"type":"thinking"' in raw or '"reasoning_content"' in raw:
    raise SystemExit(f"raw thinking fields leaked: {raw}")
PY

echo "responses_native_thinking_json_ok"
