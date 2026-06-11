#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_dir="$(cd "${script_dir}/../.." && pwd)"
sa_bin="${SA_BIN:-sa}"

tmp_root="$(mktemp -d /tmp/hubproxy-empty-body.XXXXXX)"
work_dir="${tmp_root}/work"
data_dir="${tmp_root}/data"
whitespace_body="${tmp_root}/whitespace.json"
upstream_count="${tmp_root}/upstream-count.txt"
upstream_capture="${tmp_root}/upstream-capture.jsonl"
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

proxy_port="$(pick_port)"
upstream_port="$(pick_port)"

mkdir -p "${work_dir}" "${data_dir}"
printf ' \t\r\n  ' >"${whitespace_body}"
printf '0' >"${upstream_count}"

UPSTREAM_PORT="${upstream_port}" COUNT_FILE="${upstream_count}" CAPTURE_FILE="${upstream_capture}" python3 - <<'PY' >"${upstream_log}" 2>&1 &
import http.server
import json
import os

port = int(os.environ["UPSTREAM_PORT"])
count_file = os.environ["COUNT_FILE"]
capture_file = os.environ["CAPTURE_FILE"]

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
        raw_body = self.rfile.read(length).decode("utf-8", errors="replace")
        try:
            with open(count_file, "r", encoding="utf-8") as f:
                count = int((f.read() or "0").strip() or "0")
        except FileNotFoundError:
            count = 0
        with open(count_file, "w", encoding="utf-8") as f:
            f.write(str(count + 1))
        with open(capture_file, "a", encoding="utf-8") as f:
            json.dump({"path": self.path, "body": raw_body}, f, separators=(",", ":"))
            f.write("\n")
        body = b'{"error":"empty-body test should not call upstream"}'
        self.send_response(500)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

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
PORT=${proxy_port}
AUTH=local-secret
CHAT_BASE_URL=http://127.0.0.1:${upstream_port}/v1
RESPONSES_BASE_URL=http://127.0.0.1:${upstream_port}/v1
DEFAULT_MODEL=default-empty-body-model
OPENAI_API_KEY=sk-upstream-empty-body
DATA_DIR=${data_dir}
ENV
cp "${tmp_root}/.env" "${work_dir}/.env"

"${sa_bin}" build "${repo_dir}/sa/main.sa" -o "${bin_path}" >/dev/null

(
  cd "${work_dir}"
  "${bin_path}"
) >"${server_log}" 2>&1 &
hub_pid="$!"

proxy_ready=0
for _ in $(seq 1 80); do
  if curl -fsS --max-time 1 "http://127.0.0.1:${proxy_port}/healthz" >/dev/null 2>&1; then
    proxy_ready=1
    break
  fi
  if ! kill -0 "${hub_pid}" 2>/dev/null; then
    break
  fi
  sleep 0.1
done

if [[ "${proxy_ready}" != "1" ]]; then
  echo "hubproxy did not become ready on ${proxy_port}" >&2
  cat "${server_log}" >&2 || true
  exit 1
fi

assert_rejected_empty_body() {
  local label="$1"
  local path="$2"
  local body_arg="$3"
  local out_file="${tmp_root}/${label}.response.json"
  local status

  status="$(curl -sS --max-time 15 -o "${out_file}" -w '%{http_code}' \
    -H 'authorization: Bearer local-secret' \
    -H 'content-type: application/json' \
    --data-binary "${body_arg}" \
    "http://127.0.0.1:${proxy_port}${path}")"

  if [[ "${status}" != "400" ]]; then
    echo "${label} returned ${status}, expected 400" >&2
    cat "${out_file}" >&2 || true
    cat "${server_log}" >&2 || true
    cat "${upstream_log}" >&2 || true
    exit 1
  fi

  if ! rg -q 'Request body must be a non-empty JSON document|bad request' "${out_file}"; then
    echo "${label} response did not contain the expected empty-body rejection" >&2
    cat "${out_file}" >&2 || true
    exit 1
  fi
}

assert_rejected_empty_body "chat-empty" "/v1/chat/completions" ""
assert_rejected_empty_body "chat-whitespace" "/v1/chat/completions" "@${whitespace_body}"
assert_rejected_empty_body "responses-empty" "/v1/responses" ""
assert_rejected_empty_body "responses-whitespace" "/v1/responses" "@${whitespace_body}"

upstream_posts="$(tr -d '[:space:]' <"${upstream_count}")"
if [[ "${upstream_posts}" != "0" ]]; then
  echo "empty-body requests reached upstream ${upstream_posts} time(s), expected 0" >&2
  cat "${upstream_capture}" >&2 || true
  cat "${server_log}" >&2 || true
  exit 1
fi

if [[ -s "${upstream_capture}" ]]; then
  echo "upstream capture was unexpectedly written" >&2
  cat "${upstream_capture}" >&2 || true
  exit 1
fi

echo "empty_body_runtime_isolated_ok"
