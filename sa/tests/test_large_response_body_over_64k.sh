#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
sa_dir="$(cd "${script_dir}/.." && pwd)"
project_dir="$(cd "${sa_dir}/.." && pwd)"
env_file="${project_dir}/.env"
proxy_port="${SA_TEST_PROXY_PORT:-28180}"
upstream_port="${SA_TEST_UPSTREAM_PORT:-28181}"
backup_file="$(mktemp)"
server_log="$(mktemp)"
chat_resp="$(mktemp)"
responses_resp="$(mktemp)"
models_resp="$(mktemp)"
sse_resp="$(mktemp)"
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
  rm -f "${backup_file}" "${server_log}" "${chat_resp}" "${responses_resp}" "${models_resp}" "${sse_resp}" "${health_body}"
}
trap cleanup EXIT

if ss -ltn | rg -q "(:${proxy_port}|:${upstream_port})\\b"; then
  echo "test ports already in use: proxy=${proxy_port}, upstream=${upstream_port}" >&2
  exit 1
fi

cp "${env_file}" "${backup_file}"

UPSTREAM_PORT="${upstream_port}" python3 <<'PY' >"${server_log}" 2>&1 &
import http.server
import json
import os

port = int(os.environ["UPSTREAM_PORT"])
large_text = "SA_LONG_BODY_START_" + ("x" * 45000) + "_SA_LONG_BODY_MIDDLE_" + ("y" * 45000) + "_SA_LONG_BODY_END"
json_payload = json.dumps({"id":"large-json","object":"non_sse","body":large_text}, separators=(",", ":")).encode("utf-8")

sse_text = "SA_LONG_SSE_START_" + ("a" * 50000) + "_SA_LONG_SSE_MIDDLE_" + ("b" * 50000) + "_SA_LONG_SSE_END"
sse_item = {"type":"response.output_item.done","item":{"id":"think_large","type":"thinking","text":sse_text}}
sse_done = {"type":"response.completed","response":{"id":"resp_large","status":"completed"}}
sse_payload = (
    "event: response.output_item.done\n"
    + "data: "
    + json.dumps(sse_item, separators=(",", ":"))
    + "\n\n"
    + "event: response.completed\n"
    + "data: "
    + json.dumps(sse_done, separators=(",", ":"))
    + "\n\n"
).encode("utf-8")

class Handler(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        length = int(self.headers.get("content-length", "0"))
        body = self.rfile.read(length)
        if self.path == "/v1/responses" and b'"stream":true' in body:
            self.send_response(200)
            self.send_header("content-type", "text/event-stream")
            self.send_header("content-length", str(len(sse_payload)))
            self.end_headers()
            self.wfile.write(sse_payload)
            return
        if self.path in ("/v1/chat/completions", "/v1/responses"):
            self.send_response(200)
            self.send_header("content-type", "application/json")
            self.send_header("content-length", str(len(json_payload)))
            self.end_headers()
            self.wfile.write(json_payload)
            return
        self.send_response(404)
        self.end_headers()

    def do_GET(self):
        if self.path == "/v1/models":
            self.send_response(200)
            self.send_header("content-type", "application/json")
            self.send_header("content-length", str(len(json_payload)))
            self.end_headers()
            self.wfile.write(json_payload)
            return
        self.send_response(404)
        self.end_headers()

    def log_message(self, *_args):
        return

http.server.ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
PY
server_pid=$!

for _ in {1..50}; do
  if ss -ltnp | rg -q "127\\.0\\.0\\.1:${upstream_port}"; then
    break
  fi
  sleep 0.1
done

awk -v upstream_port="${upstream_port}" -v proxy_port="${proxy_port}" '
  BEGIN { wrote_chat=0; wrote_resp=0; wrote_sa_port=0 }
  /^CHAT_BASE_URL=/ { print "CHAT_BASE_URL=http://127.0.0.1:" upstream_port "/v1"; wrote_chat=1; next }
  /^RESPONSES_BASE_URL=/ { print "RESPONSES_BASE_URL=http://127.0.0.1:" upstream_port "/v1"; wrote_resp=1; next }
  /^SA_PORT=/ { print "SA_PORT=" proxy_port; wrote_sa_port=1; next }
  { print }
  END {
    if (!wrote_chat) print "CHAT_BASE_URL=http://127.0.0.1:" upstream_port "/v1"
    if (!wrote_resp) print "RESPONSES_BASE_URL=http://127.0.0.1:" upstream_port "/v1"
    if (!wrote_sa_port) print "SA_PORT=" proxy_port
  }
' "${backup_file}" >"${env_file}"

(
  cd "${sa_dir}"
  exec setsid ./hubproxy > /tmp/hubproxy_sa_large_response_body_over_64k.log 2>&1 < /dev/null
) &
hub_pid=$!

for _ in {1..50}; do
  if ss -ltnp | rg -q "0\\.0\\.0\\.0:${proxy_port}"; then
    break
  fi
  sleep 0.1
done

auth="$(awk -F= '$1=="AUTH"{print substr($0, index($0, "=") + 1)}' "${env_file}")"

curl -sS --max-time 20 \
  -H "authorization: Bearer ${auth}" \
  -H 'content-type: application/json' \
  --data '{"model":"mimo-v2.5","messages":[{"role":"user","content":"hello"}],"stream":false}' \
  "http://127.0.0.1:${proxy_port}/v1/chat/completions" >"${chat_resp}"

curl -sS --max-time 20 \
  -H "authorization: Bearer ${auth}" \
  -H 'content-type: application/json' \
  --data '{"model":"mimo-v2.5","input":[{"type":"message","role":"user","content":[{"type":"input_text","text":"hello"}]}],"stream":false}' \
  "http://127.0.0.1:${proxy_port}/v1/responses" >"${responses_resp}"

curl -sS --max-time 20 \
  -H "authorization: Bearer ${auth}" \
  "http://127.0.0.1:${proxy_port}/v1/models" >"${models_resp}"

for file in "${chat_resp}" "${responses_resp}" "${models_resp}"; do
  size="$(wc -c <"${file}")"
  if (( size < 90000 )) \
    || ! rg -q 'SA_LONG_BODY_START_' "${file}" \
    || ! rg -q '_SA_LONG_BODY_MIDDLE_' "${file}" \
    || ! rg -q '_SA_LONG_BODY_END' "${file}"; then
    echo "long non-SSE body was truncated or missing marker: ${file}, size=${size}" >&2
    tail -c 800 "${file}" >&2
    exit 1
  fi
done

curl -sS --max-time 25 \
  -H "authorization: Bearer ${auth}" \
  -H 'content-type: application/json' \
  --data '{"model":"models/mimo-v2.5-pro","stream":true,"input":[{"type":"message","role":"user","content":[{"type":"input_text","text":"hello"}]}]}' \
  "http://127.0.0.1:${proxy_port}/v1/responses" >"${sse_resp}"

sse_size="$(wc -c <"${sse_resp}")"
if (( sse_size < 100000 )) \
  || ! rg -q 'event: response.output_item.done' "${sse_resp}" \
  || ! rg -q 'event: response.completed' "${sse_resp}" \
  || ! rg -q 'SA_LONG_SSE_START_' "${sse_resp}" \
  || ! rg -q '_SA_LONG_SSE_MIDDLE_' "${sse_resp}" \
  || ! rg -q '_SA_LONG_SSE_END' "${sse_resp}"; then
  echo "long SSE body was truncated or missing marker: size=${sse_size}" >&2
  tail -c 800 "${sse_resp}" >&2
  cat /tmp/hubproxy_sa_large_response_body_over_64k.log >&2 || true
  exit 1
fi

if rg -q '"type":"thinking"' "${sse_resp}"; then
  echo "long SSE leaked raw thinking item" >&2
  exit 1
fi

curl -sS --max-time 3 "http://127.0.0.1:${proxy_port}/healthz" >"${health_body}"
if ! rg -q '"ok":true' "${health_body}"; then
  echo "SA hubproxy did not stay healthy after >64K response tests" >&2
  cat /tmp/hubproxy_sa_large_response_body_over_64k.log >&2 || true
  exit 1
fi

echo "large_response_body_over_64k_ok json=$(wc -c <"${chat_resp}") sse=${sse_size}"
