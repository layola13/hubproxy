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

CHAT_SSE = "\n".join([
    'data: {"choices":[{"delta":{"content":"<thou"},"finish_reason":null}]}',
    "",
    'data: {"choices":[{"delta":{"content":"ght>stream thought</th"},"finish_reason":null}]}',
    "",
    'data: {"choices":[{"delta":{"content":"ought>Hello there"},"finish_reason":null}]}',
    "",
    'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}',
    "",
    "data: [DONE]",
    "",
])

class Handler(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        length = int(self.headers.get("content-length", "0"))
        self.rfile.read(length)
        if self.path == "/v1/responses":
            self.send_response(404)
            self.send_header("content-type", "text/plain")
            self.end_headers()
            self.wfile.write(b"responses unavailable")
            return
        if self.path == "/v1/chat/completions":
            payload = CHAT_SSE.encode("utf-8")
            self.send_response(200)
            self.send_header("content-type", "text/event-stream")
            self.send_header("content-length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
            return
        self.send_response(404)
        self.end_headers()

    def log_message(self, *_args):
        return

http.server.ThreadingHTTPServer(("127.0.0.1", 28105), Handler).serve_forever()
PY
server_pid=$!

for _ in {1..50}; do
  if ss -ltnp | rg -q '127\.0\.0\.1:28105'; then
    break
  fi
  sleep 0.1
done

awk '
  BEGIN { wrote_chat=0; wrote_resp=0; wrote_sa_port=0 }
  /^CHAT_BASE_URL=/ { print "CHAT_BASE_URL=http://127.0.0.1:28105/v1"; wrote_chat=1; next }
  /^RESPONSES_BASE_URL=/ { print "RESPONSES_BASE_URL=http://127.0.0.1:28105/v1"; wrote_resp=1; next }
  /^SA_PORT=/ { print "SA_PORT=28080"; wrote_sa_port=1; next }
  { print }
  END {
    if (!wrote_chat) print "CHAT_BASE_URL=http://127.0.0.1:28105/v1"
    if (!wrote_resp) print "RESPONSES_BASE_URL=http://127.0.0.1:28105/v1"
    if (!wrote_sa_port) print "SA_PORT=28080"
  }
' "${backup_file}" >"${env_file}"

(cd "${sa_dir}" && setsid ./hubproxy > /tmp/hubproxy_sa_responses_fallback_stream_thought_tag.log 2>&1 < /dev/null) &
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
  --data '{"model":"models/mimo-v2.5-pro","stream":true,"input":[{"type":"message","role":"user","content":[{"type":"input_text","text":"hello"}]}]}' \
  'http://127.0.0.1:28080/v1/responses' >"${response_body}"

python3 - "${response_body}" <<'PY'
import json
import sys

events = []
current = None
for raw in open(sys.argv[1], encoding="utf-8"):
    line = raw.rstrip("\n")
    if line.startswith("event: "):
        current = {"event": line[7:], "data": ""}
    elif line.startswith("data: ") and current is not None:
        current["data"] += line[6:]
    elif line == "" and current is not None:
        current["json"] = json.loads(current["data"])
        events.append(current)
        current = None

names = [event["event"] for event in events]
reason_delta_idx = next(i for i, event in enumerate(events) if event["event"] == "response.reasoning_summary_text.delta")
reason_done_idx = next(
    i for i, event in enumerate(events)
    if event["event"] == "response.output_item.done"
    and (event["json"].get("item") or {}).get("type") == "reasoning"
)
message_delta_idx = next(
    i for i, event in enumerate(events)
    if event["event"] == "response.output_text.delta"
    and event["json"].get("delta") == "Hello there"
)
if not (reason_delta_idx < reason_done_idx < message_delta_idx):
    raise SystemExit(f"wrong event order: {names}")

if events[reason_delta_idx]["json"].get("delta") != "stream thought":
    raise SystemExit(f"wrong reasoning delta: {events[reason_delta_idx]}")
item = events[reason_done_idx]["json"]["item"]
if item.get("summary", [{}])[0].get("text") != "stream thought":
    raise SystemExit(f"wrong reasoning summary: {item!r}")

raw = open(sys.argv[1], encoding="utf-8").read()
for leaked in ("<thought>", "</thought>", '"choices"', "data: [DONE]"):
    if leaked in raw:
        raise SystemExit(f"raw stream content leaked {leaked}: {raw}")
PY

echo "responses_fallback_stream_thought_tag_ok"
