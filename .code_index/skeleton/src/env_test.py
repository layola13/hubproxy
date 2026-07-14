from __future__ import annotations

from jsr__std.assert_1 import assertEquals
from .env import applyLogArgsToEnv, loadConfig, loadDotenvIntoEnv

# @origin src/env_test.ts:20
def setRequiredConfigEnv() -> None:
    Deno.env.set(...)
    Deno.env.delete(...)
