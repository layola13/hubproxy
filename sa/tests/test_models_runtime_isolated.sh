#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_dir="$(cd "${script_dir}/../.." && pwd)"
sa_bin="${SA_BIN:-sa}"

tmp_root="$(mktemp -d /tmp/hubproxy-models.XXXXXX)"
work_dir="${tmp_root}/work"
data_dir="${tmp_root}/data"
models_body="${tmp_root}/models.json"
rpc_body="${tmp_root}/rpc.json"
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
                "path": self.path,
                "authorization": self.headers.get("authorization"),
                "x-api-key": self.headers.get("x-api-key"),
                "api-key": self.headers.get("api-key"),
                "content-type": self.headers.get("content-type"),
                "openai-organization": self.headers.get("openai-organization"),
                "openai-project": self.headers.get("openai-project"),
                "x-request-id": self.headers.get("x-request-id"),
                "accept-language": self.headers.get("accept-language"),
            }
            with open(capture_file, "w", encoding="utf-8") as f:
                json.dump(headers, f, separators=(",", ":"))
            body = b'{"object":"list","data":[{"id":"mimo-v2.5-pro","object":"model"}]}'
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
PORT=${proxy_port}
AUTH=local-secret
CHAT_BASE_URL=http://127.0.0.1:${upstream_port}/v1
DEFAULT_MODEL=gpt-4.1
OPENAI_API_KEY=sk-upstream-models
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

models_status="$(curl -sS --max-time 15 -o "${models_body}" -w '%{http_code}' \
  -H 'authorization: Bearer caller-secret' \
  -H 'x-api-key: caller-secret' \
  -H 'api-key: caller-api-key' \
  -H 'openai-organization: org_passthrough_models' \
  -H 'openai-project: project_passthrough_models' \
  -H 'x-request-id: req_passthrough_models' \
  -H 'accept-language: en-US' \
  "http://127.0.0.1:${proxy_port}/v1/models")"

if [[ "${models_status}" != "200" ]]; then
  echo "public /v1/models returned ${models_status}, expected 200" >&2
  cat "${models_body}" >&2 || true
  cat "${server_log}" >&2 || true
  exit 1
fi

if ! rg -q '"id":"mimo-v2\.5-pro"' "${models_body}"; then
  echo "model passthrough body missing upstream model id" >&2
  cat "${models_body}" >&2
  exit 1
fi

if [[ ! -s "${capture_file}" ]]; then
  echo "mock upstream did not capture /v1/models request" >&2
  cat "${upstream_log}" >&2 || true
  exit 1
fi

if ! rg -q '"path":"/v1/models"' "${capture_file}" \
  || ! rg -q '"authorization":"Bearer sk-upstream-models"' "${capture_file}" \
  || ! rg -q '"x-api-key":"sk-upstream-models"' "${capture_file}" \
  || ! rg -q '"api-key":null' "${capture_file}" \
  || ! rg -q '"openai-organization":"org_passthrough_models"' "${capture_file}" \
  || ! rg -q '"openai-project":"project_passthrough_models"' "${capture_file}" \
  || ! rg -q '"x-request-id":"req_passthrough_models"' "${capture_file}" \
  || ! rg -q '"accept-language":"en-US"' "${capture_file}"; then
  echo "upstream capture missing expected auth stripping/forwarding fields" >&2
  cat "${capture_file}" >&2
  exit 1
fi

if rg -q 'caller-secret|caller-api-key' "${capture_file}"; then
  echo "caller auth material leaked to upstream" >&2
  cat "${capture_file}" >&2
  exit 1
fi

rpc_status="$(curl -sS --max-time 15 -o "${rpc_body}" -w '%{http_code}' \
  -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' \
  "http://127.0.0.1:${proxy_port}/rpc")"

if [[ "${rpc_status}" != "401" ]]; then
  echo "unauthenticated /rpc returned ${rpc_status}, expected 401" >&2
  cat "${rpc_body}" >&2 || true
  exit 1
fi

echo "models_runtime_isolated_ok"
