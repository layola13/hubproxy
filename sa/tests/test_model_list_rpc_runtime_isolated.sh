#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_dir="$(cd "${script_dir}/../.." && pwd)"
sa_bin="${SA_BIN:-sa}"

tmp_root="$(mktemp -d /tmp/hubproxy-rpc-model-list.XXXXXX)"
work_dir="${tmp_root}/work"
data_dir="${tmp_root}/data"
rpc_body="${tmp_root}/rpc-model-list.json"
rpc_headers="${tmp_root}/rpc-model-list.headers"
capture_file="${tmp_root}/upstream-capture.json"
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

UPSTREAM_PORT="${upstream_port}" CAPTURE_FILE="${capture_file}" python3 - <<'PY' >"${upstream_log}" 2>&1 &
import http.server
import json
import os

port = int(os.environ["UPSTREAM_PORT"])
capture_file = os.environ["CAPTURE_FILE"]

class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/readyz":
            self.send_response(204)
            self.end_headers()
            return
        if self.path == "/v1/models":
            headers = {
                "method": self.command,
                "path": self.path,
                "authorization": self.headers.get("authorization"),
                "x-api-key": self.headers.get("x-api-key"),
                "api-key": self.headers.get("api-key"),
            }
            with open(capture_file, "w", encoding="utf-8") as f:
                json.dump(headers, f, separators=(",", ":"))
            body = b'{"object":"list","data":[{"id":"rpc-upstream-model","object":"model"}],"servedBy":"mock-upstream"}'
            self.send_response(200)
            self.send_header("content-type", "application/json; charset=utf-8")
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
PORT=${proxy_port}
AUTH=local-secret
CHAT_BASE_URL=http://127.0.0.1:${upstream_port}/v1
DEFAULT_MODEL=local-config-model
OPENAI_API_KEY=sk-rpc-model-list
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

rpc_status="$(curl -sS --max-time 15 -D "${rpc_headers}" -o "${rpc_body}" -w '%{http_code}' \
  -H 'content-type: application/json' \
  -H 'authorization: Bearer local-secret' \
  -H 'x-api-key: caller-x-api-key' \
  -H 'api-key: caller-api-key' \
  --data '{"jsonrpc":"2.0","id":"models-live","method":"model/list","params":{}}' \
  "http://127.0.0.1:${proxy_port}/rpc")"

if [[ "${rpc_status}" != "200" ]]; then
  echo "rpc model/list returned ${rpc_status}, expected 200" >&2
  cat "${rpc_body}" >&2 || true
  cat "${server_log}" >&2 || true
  exit 1
fi

if ! rg -qi '^content-type: application/json; charset=utf-8' "${rpc_headers}"; then
  echo "rpc model/list did not preserve upstream content-type" >&2
  cat "${rpc_headers}" >&2
  exit 1
fi

if ! rg -q '"id":"rpc-upstream-model"' "${rpc_body}" \
  || ! rg -q '"servedBy":"mock-upstream"' "${rpc_body}"; then
  echo "rpc model/list body missing upstream payload" >&2
  cat "${rpc_body}" >&2
  exit 1
fi

if rg -q '"jsonrpc"|"models-live"|local-config-model' "${rpc_body}"; then
  echo "rpc model/list response was wrapped or used local model data" >&2
  cat "${rpc_body}" >&2
  exit 1
fi

if [[ ! -s "${capture_file}" ]]; then
  echo "mock upstream did not capture rpc model/list request" >&2
  cat "${upstream_log}" >&2 || true
  exit 1
fi

if ! rg -q '"method":"GET"' "${capture_file}" \
  || ! rg -q '"path":"/v1/models"' "${capture_file}" \
  || ! rg -q '"authorization":"Bearer sk-rpc-model-list"' "${capture_file}" \
  || ! rg -q '"x-api-key":"sk-rpc-model-list"' "${capture_file}" \
  || ! rg -q '"api-key":null' "${capture_file}"; then
  echo "upstream capture missing expected rpc model/list passthrough fields" >&2
  cat "${capture_file}" >&2
  exit 1
fi

if rg -q 'local-secret|caller-x-api-key|caller-api-key' "${capture_file}"; then
  echo "caller auth material leaked to upstream" >&2
  cat "${capture_file}" >&2
  exit 1
fi

echo "model_list_rpc_runtime_isolated_ok"
