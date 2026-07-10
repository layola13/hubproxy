from __future__ import annotations

from jsr__std.assert_1 import assert_, assertEquals
from .env import loadConfig, loadDotenvIntoEnv
from .handlers import handleHttpWithState
from .state import HubState

# @origin src/real_upstream_test.ts:6
async def runWithRetry(fn: (), attempts: Any, delayMs: Any) -> T:
    await fn(...)
    Promise(...)
    return setTimeout(...)

# @origin src/real_upstream_test.ts:25
def isUpstreamUnavailable(error: Any) -> bool:
    ...

# @origin src/real_upstream_test.ts:29
def isAbortError(error: Any) -> bool:
    ...
