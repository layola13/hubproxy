#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
sa_dir="$(cd "${script_dir}/.." && pwd)"
project_dir="$(cd "${sa_dir}/.." && pwd)"
env_file="${project_dir}/.env"
backup_file="$(mktemp)"
server_log="$(mktemp)"
counter_file="$(mktemp)"
chat_resp="$(mktemp)"
resp_resp="$(mktemp)"
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
  rm -f "${backup_file}" "${server_log}" "${counter_file}" "${chat_resp}" "${resp_resp}"
}
trap cleanup EXIT

cp "${env_file}" "${backup_file}"

old_pid="$(ss -ltnp | sed -n 's/.*0\.0\.0\.0:28080.*pid=\([0-9]*\).*/\1/p' | head -n 1)"
if [[ -n "${old_pid}" ]]; then
  kill "${old_pid}" 2>/dev/null || true
  sleep 0.3
fi

printf '0' >"${counter_file}"
python3 - "${counter_file}" <<'PY' >"${server_log}" 2>&1 &
import http.server
import sys

counter_path = sys.argv[1]

class Handler(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        with open(counter_path, "r+", encoding="utf-8") as f:
            raw = f.read().strip() or "0"
            count = int(raw) + 1
            f.seek(0)
            f.truncate()
            f.write(str(count))
        self.send_response(500)
        self.send_header("content-type", "text/plain")
        self.end_headers()
        self.wfile.write(b"unexpected upstream call")

    def log_message(self, *_args):
        return

http.server.ThreadingHTTPServer(("127.0.0.1", 28081), Handler).serve_forever()
PY
server_pid=$!

for _ in {1..50}; do
  if ss -ltnp | rg -q '127\.0\.0\.1:28081'; then
    break
  fi
  sleep 0.1
done

awk '
  BEGIN { wrote_chat=0; wrote_resp=0; wrote_sa_port=0 }
  /^CHAT_BASE_URL=/ { print "CHAT_BASE_URL=http://127.0.0.1:28081/v1"; wrote_chat=1; next }
  /^RESPONSES_BASE_URL=/ { print "RESPONSES_BASE_URL=http://127.0.0.1:28081/v1"; wrote_resp=1; next }
  /^SA_PORT=/ { print "SA_PORT=28080"; wrote_sa_port=1; next }
  { print }
  END {
    if (!wrote_chat) print "CHAT_BASE_URL=http://127.0.0.1:28081/v1"
    if (!wrote_resp) print "RESPONSES_BASE_URL=http://127.0.0.1:28081/v1"
    if (!wrote_sa_port) print "SA_PORT=28080"
  }
' "${backup_file}" >"${env_file}"

setsid "${sa_dir}/hubproxy" > /tmp/hubproxy_sa_empty_body_reject.log 2>&1 < /dev/null &
hub_pid=$!

for _ in {1..50}; do
  if ss -ltnp | rg -q '0\.0\.0\.0:28080'; then
    break
  fi
  sleep 0.1
done

auth="$(awk -F= '$1=="AUTH"{print substr($0, index($0, "=") + 1)}' "${env_file}")"
chat_status="$(curl -sS --max-time 15 -o "${chat_resp}" -w '%{http_code}' \
  -H "authorization: Bearer ${auth}" \
  -H 'content-type: application/json' \
  --data '' \
  'http://127.0.0.1:28080/v1/chat/completions')"

resp_status="$(curl -sS --max-time 15 -o "${resp_resp}" -w '%{http_code}' \
  -H "authorization: Bearer ${auth}" \
  -H 'content-type: application/json' \
  --data '  	
  ' \
  'http://127.0.0.1:28080/v1/responses')"

if [[ "${chat_status}" != "400" ]] || [[ "${resp_status}" != "400" ]]; then
  echo "empty body requests did not return 400" >&2
  echo "chat=${chat_status}" >&2
  cat "${chat_resp}" >&2
  echo "responses=${resp_status}" >&2
  cat "${resp_resp}" >&2
  exit 1
fi

if ! rg -q 'Request body must be a non-empty JSON document\.' "${chat_resp}" \
  || ! rg -q 'Request body must be a non-empty JSON document\.' "${resp_resp}"; then
  echo "empty body response missing expected error message" >&2
  cat "${chat_resp}" >&2
  cat "${resp_resp}" >&2
  exit 1
fi

if [[ "$(cat "${counter_file}")" != "0" ]]; then
  echo "empty body request leaked to upstream" >&2
  cat "${counter_file}" >&2
  exit 1
fi

echo "empty_body_reject_ok"
