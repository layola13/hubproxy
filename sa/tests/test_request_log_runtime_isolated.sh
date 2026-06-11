#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_dir="$(cd "${script_dir}/../.." && pwd)"
sa_bin="${SA_BIN:-sa}"

tmp_root="$(mktemp -d /tmp/hubproxy-request-log.XXXXXX)"
work_dir="${tmp_root}/work"
log_dir="${tmp_root}/logs"
data_dir="${tmp_root}/data"
out_body="${tmp_root}/response.json"
chat_body="${tmp_root}/chat-response.json"
upstream_log="${tmp_root}/upstream.log"
server_log="${tmp_root}/hubproxy.log"
bin_path="${tmp_root}/hubproxy"
hub_pid=""
upstream_pid=""

cleanup() {
  if [[ -n "${hub_pid}" ]]; then
    kill "${hub_pid}" 2>/dev/null || true
    wait "${hub_pid}" 2>/dev/null || true
  fi
  if [[ -n "${upstream_pid}" ]]; then
    kill "${upstream_pid}" 2>/dev/null || true
    wait "${upstream_pid}" 2>/dev/null || true
  fi
  rm -rf "${tmp_root}"
}
trap cleanup EXIT

pick_port() {
  python3 - <<'PY'
import socket

with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
    s.bind(("127.0.0.1", 0))
    print(s.getsockname()[1])
PY
}

port="$(pick_port)"
upstream_port="$(pick_port)"

mkdir -p "${work_dir}" "${log_dir}" "${data_dir}"

UPSTREAM_PORT="${upstream_port}" python3 - <<'PY' >"${upstream_log}" 2>&1 &
import http.server
import json
import os

port = int(os.environ["UPSTREAM_PORT"])

class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/readyz":
            self.send_response(204)
            self.end_headers()
            return
        self.send_response(404)
        self.end_headers()

    def do_POST(self):
        length = int(self.headers.get("content-length") or "0")
        _raw_body = self.rfile.read(length)
        if self.path == "/v1/chat/completions":
            body = json.dumps({
                "choices": [{
                    "message": {
                        "role": "assistant",
                        "content": "request log success",
                    }
                }],
                "usage": {
                    "prompt_tokens": 1,
                    "completion_tokens": 2,
                    "total_tokens": 3,
                },
            }, separators=(",", ":")).encode("utf-8")
            self.send_response(200)
            self.send_header("content-type", "application/json")
            self.send_header("content-length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        self.send_response(404)
        self.end_headers()

    def log_message(self, *_args):
        return

http.server.ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
PY
upstream_pid="$!"

upstream_ready=0
for _ in $(seq 1 80); do
  if curl -fsS --max-time 1 "http://127.0.0.1:${upstream_port}/readyz" >/dev/null 2>&1; then
    upstream_ready=1
    break
  fi
  if ! kill -0 "${upstream_pid}" 2>/dev/null; then
    break
  fi
  sleep 0.1
done

if [[ "${upstream_ready}" != "1" ]]; then
  echo "mock upstream did not become ready on ${upstream_port}" >&2
  cat "${upstream_log}" >&2 || true
  exit 1
fi

cat >"${tmp_root}/.env" <<ENV
HOST=127.0.0.1
PORT=${port}
AUTH=zzz111222333444
CHAT_BASE_URL=http://127.0.0.1:${upstream_port}/v1
DEFAULT_MODEL=gpt-4.1
OPENAI_API_KEY=sk-runtime-log
DATA_DIR=${data_dir}
HUBPROXY_LOG_DIR=${log_dir}
ENV
cp "${tmp_root}/.env" "${work_dir}/.env"

"${sa_bin}" build "${repo_dir}/sa/main.sa" -o "${bin_path}" >/dev/null

(
  cd "${work_dir}"
  "${bin_path}"
) >"${server_log}" 2>&1 &
hub_pid="$!"

ready=0
for _ in $(seq 1 80); do
  if curl -fsS --max-time 1 "http://127.0.0.1:${port}/healthz" >/dev/null 2>&1; then
    ready=1
    break
  fi
  if ! kill -0 "${hub_pid}" 2>/dev/null; then
    break
  fi
  sleep 0.1
done

if [[ "${ready}" != "1" ]]; then
  echo "hubproxy did not become ready on ${port}" >&2
  cat "${server_log}" >&2 || true
  exit 1
fi

status="$(curl -sS --max-time 15 -o "${out_body}" -w '%{http_code}' \
  -H 'authorization: Bearer abcdef123456789' \
  -H 'x-api-key: xkey987654321' \
  -H 'api-key: caller-api-key' \
  -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' \
  "http://127.0.0.1:${port}/rpc")"

if [[ "${status}" != "401" ]]; then
  echo "unauthorized /rpc returned ${status}, expected 401" >&2
  cat "${out_body}" >&2 || true
  cat "${server_log}" >&2 || true
  exit 1
fi

request_log="$(rg -l '"kind":"request-log"' "${log_dir}" | head -n 1 || true)"
auth_log="$(rg -l '"kind":"auth_failure"' "${log_dir}" | head -n 1 || true)"

if [[ -z "${request_log}" || -z "${auth_log}" ]]; then
  echo "expected request-log and auth_failure files under ${log_dir}" >&2
  ls -la "${log_dir}" >&2 || true
  cat "${server_log}" >&2 || true
  exit 1
fi

if ! rg -q '"path":"/rpc"' "${request_log}" \
  || ! rg -q '"method":"POST"' "${request_log}" \
  || ! rg -q '"headers":\{"authorization":"abc\.\.\.789 \(len=15\)","x-api-key":"xke\.\.\.321 \(len=13\)","content-type":"application/json"\}' "${request_log}" \
  || ! rg -q '"bodyBytes":[1-9][0-9]*' "${request_log}" \
  || ! rg -q '"body":"\{\\"jsonrpc\\":\\"2\.0\\",\\"id\\":1,\\"method\\":\\"initialize\\"' "${request_log}"; then
  echo "request log missing expected live HTTP header/body fields" >&2
  cat "${request_log}" >&2
  exit 1
fi

if ! rg -q '"path":"/rpc"' "${auth_log}" \
  || ! rg -q '"authorization":"abc\.\.\.789 \(len=15\)"' "${auth_log}" \
  || ! rg -q '"xApiKey":"xke\.\.\.321 \(len=13\)"' "${auth_log}" \
  || ! rg -q '"expectedAuth":"zzz\.\.\.444 \(len=15\)"' "${auth_log}"; then
  echo "auth failure log missing expected live HTTP header previews" >&2
  cat "${auth_log}" >&2
  exit 1
fi

chat_status="$(curl -sS --max-time 15 -o "${chat_body}" -w '%{http_code}' \
  -H 'authorization: Bearer zzz111222333444' \
  -H 'x-api-key: xkey987654321' \
  -H 'content-type: application/json' \
  --data '{"model":"log-success-model","stream":false,"messages":[{"role":"user","content":"hello success log"}]}' \
  "http://127.0.0.1:${port}/v1/chat/completions")"

if [[ "${chat_status}" != "200" ]]; then
  echo "authenticated /v1/chat/completions returned ${chat_status}, expected 200" >&2
  cat "${chat_body}" >&2 || true
  cat "${server_log}" >&2 || true
  cat "${upstream_log}" >&2 || true
  exit 1
fi

if ! rg -q 'request log success' "${chat_body}"; then
  echo "chat proxy success body missing upstream content" >&2
  cat "${chat_body}" >&2
  exit 1
fi

success_log="$(rg -l '"path":"/v1/chat/completions"' "${log_dir}" | head -n 1 || true)"

if [[ -z "${success_log}" ]]; then
  echo "expected authenticated proxy success request-log under ${log_dir}" >&2
  ls -la "${log_dir}" >&2 || true
  cat "${server_log}" >&2 || true
  exit 1
fi

if ! rg -q '"kind":"request-log"' "${success_log}" \
  || ! rg -q '"method":"POST"' "${success_log}" \
  || ! rg -q '"headers":\{"authorization":"zzz\.\.\.444 \(len=15\)","x-api-key":"xke\.\.\.321 \(len=13\)","content-type":"application/json"\}' "${success_log}" \
  || ! rg -q '"bodyBytes":[1-9][0-9]*' "${success_log}" \
  || ! rg -q '"rawBodyBytes":[1-9][0-9]*' "${success_log}" \
  || ! rg -q 'log-success-model' "${success_log}" \
  || ! rg -q 'hello success log' "${success_log}"; then
  echo "authenticated proxy success log missing expected live HTTP fields" >&2
  cat "${success_log}" >&2
  exit 1
fi

echo "request_log_runtime_isolated_ok"
