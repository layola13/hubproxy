#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
sa_dir="$(cd "${script_dir}/.." && pwd)"
project_dir="$(cd "${sa_dir}/.." && pwd)"
env_file="${project_dir}/.env"
backup_file="$(mktemp)"
server_log="$(mktemp)"
request_body="$(mktemp)"
response_body="$(mktemp)"
capture_body="$(mktemp)"
health_body="$(mktemp)"
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
  rm -f "${backup_file}" "${server_log}" "${request_body}" "${response_body}" "${capture_body}" "${health_body}"
}
trap cleanup EXIT

cp "${env_file}" "${backup_file}"

old_pid="$(ss -ltnp | sed -n 's/.*0\.0\.0\.0:28080.*pid=\([0-9]*\).*/\1/p' | head -n 1)"
if [[ -n "${old_pid}" ]]; then
  kill "${old_pid}" 2>/dev/null || true
  sleep 0.3
fi

python3 - "${request_body}" <<'PY'
import json
import sys

long_text = "".join(
    f"line-{i:04d}: SA long request regression input with responses JSON rewriting and completion marker.\n"
    for i in range(1700)
)
long_text += "SA_LONG_REQUEST_END"
body = {
    "model": "models/mimo-v2.5-pro",
    "stream": True,
    "input": [
        {
            "type": "message",
            "role": "user",
            "content": [{"type": "input_text", "text": long_text}],
        }
    ],
}
with open(sys.argv[1], "w", encoding="utf-8") as f:
    json.dump(body, f, separators=(",", ":"))
PY

CAPTURE_BODY="${capture_body}" python3 <<'PY' >"${server_log}" 2>&1 &
import http.server
import os

capture_path = os.environ["CAPTURE_BODY"]
SSE = b'''event: response.created
data: {"type":"response.created","response":{"id":"resp_long_req"}}

event: response.output_text.delta
data: {"type":"response.output_text.delta","delta":"ok"}

event: response.completed
data: {"type":"response.completed","response":{"id":"resp_long_req","status":"completed"}}

'''

class Handler(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        length = int(self.headers.get("content-length", "0"))
        body = self.rfile.read(length)
        if self.path == "/v1/responses":
            with open(capture_path, "wb") as f:
                f.write(body)
            self.send_response(200)
            self.send_header("content-type", "text/event-stream")
            self.send_header("content-length", str(len(SSE)))
            self.end_headers()
            self.wfile.write(SSE)
            return
        self.send_response(404)
        self.end_headers()

    def log_message(self, *_args):
        return

http.server.ThreadingHTTPServer(("127.0.0.1", 28098), Handler).serve_forever()
PY
server_pid=$!

for _ in {1..50}; do
  if ss -ltnp | rg -q '127\.0\.0\.1:28098'; then
    break
  fi
  sleep 0.1
done

awk '
  BEGIN { wrote_chat=0; wrote_resp=0; wrote_sa_port=0 }
  /^CHAT_BASE_URL=/ { print "CHAT_BASE_URL=http://127.0.0.1:28098/v1"; wrote_chat=1; next }
  /^RESPONSES_BASE_URL=/ { print "RESPONSES_BASE_URL=http://127.0.0.1:28098/v1"; wrote_resp=1; next }
  /^SA_PORT=/ { print "SA_PORT=28080"; wrote_sa_port=1; next }
  { print }
  END {
    if (!wrote_chat) print "CHAT_BASE_URL=http://127.0.0.1:28098/v1"
    if (!wrote_resp) print "RESPONSES_BASE_URL=http://127.0.0.1:28098/v1"
    if (!wrote_sa_port) print "SA_PORT=28080"
  }
' "${backup_file}" >"${env_file}"

(cd "${sa_dir}" && setsid ./hubproxy > /tmp/hubproxy_sa_responses_long_input_request_no_crash.log 2>&1 < /dev/null) &
hub_pid=$!

for _ in {1..50}; do
  if ss -ltnp | rg -q '0\.0\.0\.0:28080'; then
    break
  fi
  sleep 0.1
done

auth="$(awk -F= '$1=="AUTH"{print substr($0, index($0, "=") + 1)}' "${env_file}")"
curl -sS --max-time 20 \
  -H "authorization: Bearer ${auth}" \
  -H 'content-type: application/json' \
  --data-binary "@${request_body}" \
  'http://127.0.0.1:28080/v1/responses' >"${response_body}"

captured_size="$(wc -c <"${capture_body}")"
if (( captured_size < 100000 )); then
  echo "upstream captured request was unexpectedly small: ${captured_size}" >&2
  cat /tmp/hubproxy_sa_responses_long_input_request_no_crash.log >&2 || true
  exit 1
fi

if ! rg -q 'SA_LONG_REQUEST_END' "${capture_body}"; then
  echo "long request marker did not reach upstream" >&2
  tail -c 500 "${capture_body}" >&2
  exit 1
fi

if ! rg -q 'event: response.completed' "${response_body}"; then
  echo "SA did not return completed response SSE" >&2
  cat "${response_body}" >&2
  exit 1
fi

curl -sS --max-time 3 'http://127.0.0.1:28080/healthz' >"${health_body}"
if ! rg -q '"ok":true' "${health_body}"; then
  echo "SA hubproxy did not stay healthy after long request" >&2
  cat /tmp/hubproxy_sa_responses_long_input_request_no_crash.log >&2 || true
  exit 1
fi

echo "responses_long_input_request_no_crash_ok size=${captured_size}"
