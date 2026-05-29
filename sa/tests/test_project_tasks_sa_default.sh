#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
deno_json="${project_dir}/deno.json"

python3 - "${deno_json}" <<'PY'
import json
import sys

with open(sys.argv[1], encoding="utf-8") as f:
    config = json.load(f)

tasks = config.get("tasks") or {}
for name in ("start", "dev", "check"):
    command = tasks.get(name)
    if not isinstance(command, str):
        raise SystemExit(f"missing task {name!r}")
    if "src/main.ts" in command or "deno run" in command or "deno check" in command:
        raise SystemExit(f"default task {name!r} still points at Deno: {command}")

if "./restart.sh" not in tasks["start"]:
    raise SystemExit(f"start task does not use restart.sh: {tasks['start']}")
if "/home/vscode/.sa/bin/sa build" not in tasks["check"]:
    raise SystemExit(f"check task does not build SA: {tasks['check']}")
if "/home/vscode/.sa/bin/sa build" not in tasks["dev"] or "../restart.sh" not in tasks["dev"]:
    raise SystemExit(f"dev task does not build and start SA: {tasks['dev']}")

for name in ("deno:start", "deno:dev", "deno:check"):
    command = tasks.get(name)
    if not isinstance(command, str) or "src/main.ts" not in command:
        raise SystemExit(f"legacy Deno task {name!r} is missing or not explicit: {command}")

print("project_tasks_sa_default_ok")
PY
