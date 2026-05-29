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
    'data: {"choices":[{"delta":{"reasoning_content":"think one"},"finish_reason":null}]}',
    "",
    'data: {"choices":[{"delta":{"thinking":" and two"},"finish_reason":null}]}',
    "",
    'data: {"choices":[{"delta":{"content":"answer"},"finish_reason":null}]}',
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

http.server.ThreadingHTTPServer(("127.0.0.1", 28104), Handler).serve_forever()
PY
server_pid=$!

for _ in {1..50}; do
  if ss -ltnp | rg -q '127\.0\.0\.1:28104'; then
    break
  fi
  sleep 0.1
done

awk '
  BEGIN { wrote_chat=0; wrote_resp=0; wrote_sa_port=0 }
  /^CHAT_BASE_URL=/ { print "CHAT_BASE_URL=http://127.0.0.1:28104/v1"; wrote_chat=1; next }
  /^RESPONSES_BASE_URL=/ { print "RESPONSES_BASE_URL=http://127.0.0.1:28104/v1"; wrote_resp=1; next }
  /^SA_PORT=/ { print "SA_PORT=28080"; wrote_sa_port=1; next }
  { print }
  END {
    if (!wrote_chat) print "CHAT_BASE_URL=http://127.0.0.1:28104/v1"
    if (!wrote_resp) print "RESPONSES_BASE_URL=http://127.0.0.1:28104/v1"
    if (!wrote_sa_port) print "SA_PORT=28080"
  }
' "${backup_file}" >"${env_file}"

(cd "${sa_dir}" && setsid ./hubproxy > /tmp/hubproxy_sa_responses_fallback_stream_reasoning_content.log 2>&1 < /dev/null) &
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
        try:
            current["json"] = json.loads(current["data"])
        except Exception:
            current["json"] = None
        events.append(current)
        current = None

names = [event["event"] for event in events]
required = [
    "response.created",
    "response.output_item.added",
    "response.reasoning_summary_part.added",
    "response.reasoning_summary_text.delta",
    "response.output_item.done",
    "response.output_text.delta",
    "response.done",
    "response.completed",
]
for name in required:
    if name not in names:
        raise SystemExit(f"missing {name}: {open(sys.argv[1], encoding='utf-8').read()}")

added_idx = names.index("response.output_item.added")
part_idx = names.index("response.reasoning_summary_part.added")
delta_idxs = [i for i, name in enumerate(names) if name == "response.reasoning_summary_text.delta"]
done_reason_idx = next(
    i for i, event in enumerate(events)
    if event["event"] == "response.output_item.done"
    and (event["json"].get("item") or {}).get("type") == "reasoning"
)
text_delta_idx = names.index("response.output_text.delta")

if not (added_idx < part_idx < delta_idxs[0] < delta_idxs[1] < done_reason_idx < text_delta_idx):
    raise SystemExit(f"wrong event order: {names}")

reason_deltas = [events[i]["json"].get("delta") for i in delta_idxs]
if reason_deltas != ["think one", " and two"]:
    raise SystemExit(f"wrong reasoning deltas: {reason_deltas!r}")

reason_item = events[done_reason_idx]["json"]["item"]
summary = reason_item.get("summary", [{}])[0].get("text")
content = reason_item.get("content", [{}])[0].get("text")
if summary != "think one and two" or content != "think one and two":
    raise SystemExit(f"wrong reasoning item: {reason_item!r}")

text_delta = events[text_delta_idx]["json"].get("delta")
if text_delta != "answer":
    raise SystemExit(f"wrong output text delta: {text_delta!r}")

raw = open(sys.argv[1], encoding="utf-8").read()
for leaked in ('"choices"', '"reasoning_content"', '"thinking"', "data: [DONE]"):
    if leaked in raw:
        raise SystemExit(f"raw chat SSE leaked {leaked}: {raw}")
PY

echo "responses_fallback_stream_reasoning_content_ok"
