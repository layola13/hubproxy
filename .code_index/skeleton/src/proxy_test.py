from __future__ import annotations

from jsr__std.assert_1 import assert_, assertEquals, assertMatch
from .proxy import normalizeChatToolCall, normalizeModelListResponseBody, normalizeResponsesEvent, proxyOpenAI, robustDenormalizeServerName, setMcpToolDiscoveryForTests
from .types import ProxyConfig

# @origin src/proxy_test.ts:38
def parseSseEvents(text: str) -> Any:
    ...
