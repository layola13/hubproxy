#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
sa_dir="$(cd "${script_dir}/.." && pwd)"
project_dir="$(cd "${sa_dir}/.." && pwd)"
env_file="${project_dir}/.env"
backup_file="$(mktemp)"
server_log="$(mktemp)"
response_body="$(mktemp)"
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
  rm -f "${backup_file}" "${server_log}" "${response_body}" "${health_body}"
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

thinking = "SA_LARGE_SSE_START_" + ("x" * 42000) + "_SA_LARGE_SSE_END"
item = {
    "type": "response.output_item.done",
    "item": {
        "id": "think_large",
        "type": "thinking",
        "text": thinking,
    },
}
completed = {
    "type": "response.completed",
    "response": {"id": "resp_large", "status": "completed"},
}
SSE = (
    "event: response.output_item.done\n"
    + "data: "
    + json.dumps(item, separators=(",", ":"))
    + "\n\n"
    + "event: response.completed\n"
    + "data: "
    + json.dumps(completed, separators=(",", ":"))
    + "\n\n"
).encode("utf-8")

class Handler(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        length = int(self.headers.get("content-length", "0"))
        self.rfile.read(length)
        if self.path == "/v1/responses":
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

(cd "${sa_dir}" && setsid ./hubproxy > /tmp/hubproxy_sa_responses_native_large_sse_no_crash.log 2>&1 < /dev/null) &
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
  --data '{"model":"models/mimo-v2.5-pro","stream":true,"input":[{"type":"message","role":"user","content":[{"type":"input_text","text":"hello"}]}]}' \
  'http://127.0.0.1:28080/v1/responses' >"${response_body}"

size="$(wc -c <"${response_body}")"
if (( size < 70000 )); then
  echo "large normalized SSE response was unexpectedly small: ${size}" >&2
  cat "${response_body}" >&2
  exit 1
fi

if ! rg -q 'event: response.output_item.done' "${response_body}" \
  || ! rg -q 'event: response.completed' "${response_body}" \
  || ! rg -q 'SA_LARGE_SSE_START_' "${response_body}" \
  || ! rg -q '_SA_LARGE_SSE_END' "${response_body}"; then
  echo "large native SSE response was truncated or missing completion" >&2
  cat "${response_body}" >&2
  exit 1
fi

if rg -q '"type":"thinking"' "${response_body}"; then
  echo "large native SSE leaked raw thinking item" >&2
  cat "${response_body}" >&2
  exit 1
fi

curl -sS --max-time 3 'http://127.0.0.1:28080/healthz' >"${health_body}"
if ! rg -q '"ok":true' "${health_body}"; then
  echo "SA hubproxy did not stay healthy after large SSE normalization" >&2
  cat /tmp/hubproxy_sa_responses_native_large_sse_no_crash.log >&2 || true
  exit 1
fi

echo "responses_native_large_sse_no_crash_ok size=${size}"
