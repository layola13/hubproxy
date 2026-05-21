#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

pattern='deno run .*src/main.ts'

if pgrep -f "$pattern" >/dev/null 2>&1; then
  pkill -f "$pattern" || true
  sleep 1
fi

exec deno task start
