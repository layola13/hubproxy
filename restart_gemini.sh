#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

env_file=".env_gemini"
port=""
log_dir=""

if [[ -f "$env_file" ]]; then
  port="$(awk -F= '$1=="PORT"{print substr($0, index($0, "=") + 1)}' "$env_file" | tail -n 1 | tr -d '\r')"
  if [[ -z "$port" ]]; then
    port="$(awk -F= '$1=="SA_PORT"{print substr($0, index($0, "=") + 1)}' "$env_file" | tail -n 1 | tr -d '\r')"
  fi
fi
port="${port:-8787}"

while (($# > 0)); do
  case "$1" in
    --logs)
      if (($# > 1)) && [[ ! "$2" =~ ^-- ]]; then
        log_dir="$2"
        shift 2
      else
        log_dir="logs"
        shift
      fi
      ;;
    --log-dir)
      if (($# < 2)); then
        echo "missing value for --log-dir" >&2
        exit 1
      fi
      log_dir="$2"
      shift 2
      ;;
    *)
      echo "unknown argument: $1" >&2
      echo "usage: $0 [--logs [DIR] | --log-dir DIR]" >&2
      exit 1
      ;;
  esac
done

echo "Restarting on port $port..."

pids=""
if command -v lsof >/dev/null 2>&1; then
  pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
elif command -v ss >/dev/null 2>&1; then
  pids="$(ss -ltnp 2>/dev/null | sed -n "s/.*:${port} .*pid=\\([0-9]*\\).*/\\1/p" | sort -u)"
fi

if [[ -n "$pids" ]]; then
  kill $pids 2>/dev/null || true
  sleep 1
  if command -v lsof >/dev/null 2>&1; then
    pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
  elif command -v ss >/dev/null 2>&1; then
    pids="$(ss -ltnp 2>/dev/null | sed -n "s/.*:${port} .*pid=\\([0-9]*\\).*/\\1/p" | sort -u)"
  else
    pids=""
  fi
  if [[ -n "$pids" ]]; then
    kill -9 $pids 2>/dev/null || true
  fi
fi

if [[ -n "$log_dir" ]]; then
  export HUBPROXY_LOG_DIR="$log_dir"
  mkdir -p "$HUBPROXY_LOG_DIR"
  find "$HUBPROXY_LOG_DIR" -name "*.json" -mtime +1 -delete 2>/dev/null || true
else
  unset HUBPROXY_LOG_DIR || true
fi

export DOTENV_PATH="$env_file"
exec deno run -A src/main.ts
