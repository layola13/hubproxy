#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_dir="$(cd "${script_dir}/../.." && pwd)"
sa_bin="${SA_BIN:-sa}"

tmp_root="$(mktemp -d /tmp/hubproxy-rpc-transport.XXXXXX)"
work_dir="${tmp_root}/work"
data_dir="${tmp_root}/data"
server_log="${tmp_root}/hubproxy.log"
bin_path="${tmp_root}/hubproxy"
init_body="${tmp_root}/initialize.json"
config_body="${tmp_root}/config-read.json"
config_write_body="${tmp_root}/config-write.json"
login_body="${tmp_root}/login-start.json"
error_body="${tmp_root}/method-error.json"
escaped_request="${tmp_root}/escaped-request.json"
escaped_body="${tmp_root}/escaped-response.json"
hub_pid=""

cleanup() {
  if [[ -n "${hub_pid}" ]]; then
    kill "${hub_pid}" 2>/dev/null || true
    wait "${hub_pid}" 2>/dev/null || true
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

mkdir -p "${work_dir}" "${data_dir}"

cat >"${work_dir}/.env" <<ENV
HOST=127.0.0.1
PORT=${proxy_port}
AUTH=local-secret
CHAT_BASE_URL=http://127.0.0.1:9/v1
DEFAULT_MODEL=gpt-4.1
OPENAI_API_KEY=sk-rpc-transport
DATA_DIR=${data_dir}
ENV

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

rpc_call() {
  local payload="$1"
  local output_file="$2"
  local expected_status="$3"
  local status
  status="$(curl -sS --max-time 15 -o "${output_file}" -w '%{http_code}' \
    -H 'authorization: Bearer local-secret' \
    -H 'content-type: application/json' \
    --data "${payload}" \
    "http://127.0.0.1:${proxy_port}/rpc")"
  if [[ "${status}" != "${expected_status}" ]]; then
    echo "${payload} returned ${status}, expected ${expected_status}" >&2
    cat "${output_file}" >&2 || true
    cat "${server_log}" >&2 || true
    exit 1
  fi
}

rpc_call_file() {
  local payload_file="$1"
  local output_file="$2"
  local expected_status="$3"
  local status
  status="$(curl -sS --max-time 15 -o "${output_file}" -w '%{http_code}' \
    -H 'authorization: Bearer local-secret' \
    -H 'content-type: application/json' \
    --data-binary "@${payload_file}" \
    "http://127.0.0.1:${proxy_port}/rpc")"
  if [[ "${status}" != "${expected_status}" ]]; then
    echo "${payload_file} returned ${status}, expected ${expected_status}" >&2
    cat "${payload_file}" >&2 || true
    cat "${output_file}" >&2 || true
    cat "${server_log}" >&2 || true
    exit 1
  fi
}

python3 - "${escaped_request}" <<'PY'
import json
import sys

with open(sys.argv[1], "w", encoding="utf-8") as f:
    json.dump({
        "jsonrpc": "2.0",
        "id": "escaped-live",
        "method": "environment/add",
        "params": {
            "name": 'env "quoted"',
            "path": r"/tmp/a\b",
        },
    }, f, separators=(",", ":"))
PY

rpc_call '{"jsonrpc":"2.0","id":"init-live","method":"initialize","params":{}}' "${init_body}" 200
rpc_call '{"jsonrpc":"2.0","id":"cfg-live","method":"config/read","params":{}}' "${config_body}" 200
rpc_call '{"jsonrpc":"2.0","id":"cfg-write-live","method":"config/value/write","params":{"path":"defaultModel","value":"gpt-4.1"}}' "${config_write_body}" 200
rpc_call '{"jsonrpc":"2.0","id":83,"method":"account/login/start","params":{"type":"chatgpt"}}' "${login_body}" 200
rpc_call_file "${escaped_request}" "${escaped_body}" 200
rpc_call '{"jsonrpc":"2.0","id":"missing-live","method":"does/not/exist","params":{}}' "${error_body}" 404

INIT_BODY="${init_body}" \
CONFIG_BODY="${config_body}" \
CONFIG_WRITE_BODY="${config_write_body}" \
LOGIN_BODY="${login_body}" \
ESCAPED_BODY="${escaped_body}" \
ERROR_BODY="${error_body}" \
WORK_DIR="${work_dir}" \
PROXY_PORT="${proxy_port}" \
python3 - <<'PY'
import json
import os
from pathlib import Path


def load_env_json(name):
    with Path(os.environ[name]).open("r", encoding="utf-8") as f:
        return json.load(f)


init = load_env_json("INIT_BODY")
assert init["jsonrpc"] == "2.0", init
assert init["id"] == "init-live", init
init_result = init["result"]
assert init_result["userAgent"].startswith("hubproxy/"), init_result
assert init_result["codexHome"] == os.environ["WORK_DIR"], init_result
assert isinstance(init_result["platformFamily"], str) and init_result["platformFamily"], init_result
assert isinstance(init_result["platformOs"], str) and init_result["platformOs"], init_result
assert "error" not in init, init

config = load_env_json("CONFIG_BODY")
assert config["jsonrpc"] == "2.0", config
assert config["id"] == "cfg-live", config
config_result = config["result"]
cfg = config_result["config"]
assert cfg["host"] == "127.0.0.1", cfg
assert cfg["port"] == int(os.environ["PROXY_PORT"]), cfg
assert cfg["chatBaseUrl"] == "http://127.0.0.1:9/v1", cfg
assert cfg["defaultModel"] == "gpt-4.1", cfg
assert cfg["responsesBaseUrl"] is None, cfg
assert cfg["authToken"] is None, cfg
assert config_result["layers"] == [], config_result
assert config_result["origins"] == {}, config_result
assert "error" not in config, config

config_write = load_env_json("CONFIG_WRITE_BODY")
assert config_write["jsonrpc"] == "2.0", config_write
assert config_write["id"] == "cfg-write-live", config_write
assert config_write["result"] == {
    "filePath": os.environ["WORK_DIR"],
    "status": "ok",
    "version": "1",
}, config_write
assert "error" not in config_write, config_write

login = load_env_json("LOGIN_BODY")
assert login["jsonrpc"] == "2.0", login
assert login["id"] == 83, login
assert login["result"] == {"type": "chatgpt", "started": True}, login
assert "error" not in login, login

escaped = load_env_json("ESCAPED_BODY")
assert escaped["jsonrpc"] == "2.0", escaped
assert escaped["id"] == "escaped-live", escaped
escaped_result = escaped["result"]
assert escaped_result["added"] is True, escaped_result
assert escaped_result["name"] == 'env "quoted"', escaped_result
assert escaped_result["path"] == r"/tmp/a\b", escaped_result
assert "error" not in escaped, escaped

missing = load_env_json("ERROR_BODY")
assert missing["jsonrpc"] == "2.0", missing
assert missing["id"] == "missing-live", missing
assert missing["error"] == {"code": -32601, "message": "method not found"}, missing
assert "result" not in missing, missing
PY

echo "rpc_transport_runtime_isolated_ok"
