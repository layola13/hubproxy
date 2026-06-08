#!/usr/bin/env bash

# Shared helpers for non-destructive SA runtime contract tests.
# Tests using this file must run HubProxy from a temporary working directory so
# the project root .env and any existing 28080 process remain untouched.

sa_runtime_script_dir() {
  cd "$(dirname "${BASH_SOURCE[1]}")" && pwd
}

sa_runtime_sa_dir() {
  local script_dir
  script_dir="$(sa_runtime_script_dir)"
  cd "${script_dir}/.." && pwd
}

sa_test_free_port() {
  python3 - <<'PY'
import socket
with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
    s.bind(("127.0.0.1", 0))
    print(s.getsockname()[1])
PY
}

sa_test_port_is_listening() {
  local port="$1"
  ss -ltn | rg -q ":${port} "
}

sa_test_wait_port() {
  local port="$1"
  local attempts="${2:-80}"
  local delay="${3:-0.1}"
  local i
  for ((i = 0; i < attempts; i++)); do
    if sa_test_port_is_listening "${port}"; then
      return 0
    fi
    sleep "${delay}"
  done
  return 1
}

sa_test_assert_port_free() {
  local port="$1"
  if ss -ltn | rg -q ":${port}\b|:${port} "; then
    echo "test port already in use: ${port}" >&2
    return 1
  fi
}

sa_test_write_env_from_root() {
  local source_env="$1"
  local out_env="$2"
  local port="$3"
  local auth="$4"
  awk -v port="${port}" -v auth="${auth}" '
    BEGIN { wrote_sa=0; wrote_port=0; wrote_auth=0 }
    /^SA_PORT=/ { print "SA_PORT=" port; wrote_sa=1; next }
    /^PORT=/ { print "PORT=" port; wrote_port=1; next }
    /^AUTH=/ { print "AUTH=" auth; wrote_auth=1; next }
    { print }
    END {
      if (!wrote_sa) print "SA_PORT=" port
      if (!wrote_port) print "PORT=" port
      if (!wrote_auth) print "AUTH=" auth
    }
  ' "${source_env}" >"${out_env}"
}

sa_test_start_hubproxy() {
  local sa_dir="$1"
  local tmp_dir="$2"
  local log_file="$3"
  (
    cd "${tmp_dir}"
    setsid "${sa_dir}/hubproxy" >"${log_file}" 2>&1 < /dev/null &
    echo "$!" >"${tmp_dir}/hubproxy.pid"
  )
  cat "${tmp_dir}/hubproxy.pid"
}

sa_test_stop_pid() {
  local pid="${1:-}"
  if [[ -n "${pid}" ]]; then
    kill "${pid}" 2>/dev/null || true
    wait "${pid}" 2>/dev/null || true
  fi
}

sa_test_stop_pgid() {
  local pid="${1:-}"
  if [[ -n "${pid}" ]]; then
    kill -TERM "-${pid}" 2>/dev/null || true
    wait "${pid}" 2>/dev/null || true
  fi
}
