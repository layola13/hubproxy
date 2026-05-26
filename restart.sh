#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

usage() {
  cat <<'EOF'
Usage:
  ./restart.sh
  ./restart.sh --logs [DIR]
  ./restart.sh --log-dir DIR

Logging is disabled by default. Enable it only when debugging, because saved
logs include full request/upstream/response bodies and large transcripts can
slow the proxy. If DIR is omitted with --logs, ./logs is used.
EOF
}

log_dir=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --logs)
      if [[ $# -gt 1 && "$2" != --* ]]; then
        log_dir="$2"
        shift 2
      else
        log_dir="logs"
        shift
      fi
      ;;
    --log-dir)
      if [[ $# -lt 2 || "$2" == --* ]]; then
        echo "error: --log-dir requires a directory" >&2
        usage >&2
        exit 2
      fi
      log_dir="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "error: unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

pattern='deno run .*src/main.ts'

if pgrep -f "$pattern" >/dev/null 2>&1; then
  pkill -f "$pattern" || true
  sleep 1
fi

# Default to no saved logs. Pass --logs or --log-dir when you need full
# request/upstream/response bodies for debugging.
if [[ -n "$log_dir" ]]; then
  mkdir -p "$log_dir"
  export HUBPROXY_LOG_DIR="$log_dir"
  # Clean up enabled log directory only; default runs should not touch logs.
  find "$log_dir" -name "*.json" -mtime +1 -delete 2>/dev/null || true
  echo "hubproxy logging enabled: $HUBPROXY_LOG_DIR"
else
  unset HUBPROXY_LOG_DIR
  echo "hubproxy logging disabled; pass --logs [dir] to save request logs"
fi

exec deno task start
