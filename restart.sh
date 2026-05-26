#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

pattern='deno run .*src/main.ts'

if pgrep -f "$pattern" >/dev/null 2>&1; then
  pkill -f "$pattern" || true
  sleep 1
fi

# Clean up logs older than 1 day to manage disk space.
find logs/ -name "*.json" -mtime +1 -delete 2>/dev/null || true

exec deno task start
