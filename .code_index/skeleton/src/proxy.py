from __future__ import annotations

from .types import JsonObject, ProxyConfig, ResponsesEvent, ResponsesInputItem, ResponsesScenario, ResponsesToolKind, ResponsesToolOutputKind
from .mcp import listMcpServerStatus

# @origin src/proxy.ts:223
def selectCollaborationTools(names: list[str]) -> list[Any]:
    Array.isArray(...)
    map(...)
    tools.find(...)
    filter(...)
    return Boolean(...)

# @origin src/proxy.ts:291
def normalizeRuntimeKey(raw: str) -> str:
    raw.trim(...)
    replace(...)
    return trim(...)

# @origin src/proxy.ts:295
def isExactGlmBabelChannel(config: ProxyConfig) -> bool:
    config.chatBaseUrl.trim(...)
    return toLowerCase(...)

# @origin src/proxy.ts:299
def isGlmKeyRefreshEnabled(config: ProxyConfig) -> bool:
    return isExactGlmBabelChannel(...)

# @origin src/proxy.ts:304
def scheduleGlmKeyRefresh(config: ProxyConfig) -> None:
    isGlmKeyRefreshEnabled(...)
    Math.max(...)
    setInterval(...)
    refreshGlmKeyIfNeeded(...)

# @origin src/proxy.ts:313
def glmKeyFetchBackoffDelayMs(config: ProxyConfig, attempt: float) -> float:
    Math.max(...)
    return Math.min(...)

# @origin src/proxy.ts:320
def glmDotenvPath() -> str:
    return Deno.env.get(...)

# @origin src/proxy.ts:324
def readGlmRuntimeKeyFromDotenv(path: str) -> str | None:
    Deno.readTextFileSync(...)
    text.split(...)
    rawLine.trim(...)
    line.startsWith(...)
    line.indexOf(...)
    line.slice(...)
    trim(...)
    return normalizeRuntimeKey(...)

# @origin src/proxy.ts:343
def currentGlmRuntimeKey(config: ProxyConfig) -> str | None:
    isExactGlmBabelChannel(...)
    normalizeRuntimeKey(...)
    Deno.env.get(...)
    readGlmRuntimeKeyFromDotenv(...)
    return glmDotenvPath(...)

# @origin src/proxy.ts:358
def writeGlmRuntimeKeyToDotenv(path: str, apiKey: str) -> None:
    normalizeRuntimeKey(...)
    Deno.readTextFileSync(...)
    text.split(...)
    lines.map(...)
    rawLine.trim(...)
    line.startsWith(...)
    rawLine.indexOf(...)
    rawLine.slice(...)
    trim(...)
    nextLines.push(...)
    Deno.writeTextFileSync(...)
    nextLines.join(...)
    replace(...)

# @origin src/proxy.ts:377
async def fetchFreshGlmApiKey(config: ProxyConfig) -> str | None:
    await fetch(...)
    await response.text(...)
    await sleep(...)
    isGlmKeyRefreshEnabled(...)
    Math.max(...)
    text.slice(...)
    parseJsonBody(...)
    normalizeRuntimeKey(...)
    String(...)
    glmKeyFetchBackoffDelayMs(...)
    writeUpstreamLog(...)
    Deno.env.set(...)
    writeGlmRuntimeKeyToDotenv(...)
    glmDotenvPath(...)
    return redactToken(...)

# @origin src/proxy.ts:440
async def refreshGlmKeyFromErrorResponse(response: Response, config: ProxyConfig) -> str | None:
    await shouldTriggerImmediateGlmKeyRefresh(...)
    await refreshGlmKeyIfNeeded(...)
    Deno.env.set(...)
    return writeUpstreamLog(...)

# @origin src/proxy.ts:458
async def refreshGlmKeyIfNeeded(config: ProxyConfig) -> str | None:
    isGlmKeyRefreshEnabled(...)
    fetchFreshGlmApiKey(...)
    return finally_(...)

# @origin src/proxy.ts:469
def nextApiKey(config: ProxyConfig) -> str:
    currentGlmRuntimeKey(...)
    Array.isArray(...)
    apiKeyRotationIndexes.get(...)
    return apiKeyRotationIndexes.set(...)

# @origin src/proxy.ts:483
def initProxyRuntime(config: ProxyConfig) -> None:
    scheduleGlmKeyRefresh(...)

# @origin src/proxy.ts:487
def abortError() -> DOMException:
    return DOMException(...)

# @origin src/proxy.ts:491
def throwIfAborted(signal: AbortSignal | None) -> None:
    abortError(...)

# @origin src/proxy.ts:495
def sleep(ms: float, signal: AbortSignal | None) -> None:
    Promise.resolve(...)
    throwIfAborted(...)
    Promise(...)
    setTimeout(...)
    clearTimeout(...)
    reject(...)
    abortError(...)
    removeEventListener(...)
    resolve(...)
    addEventListener(...)

# @origin src/proxy.ts:512
def retryDelayMs(config: ProxyConfig) -> float:
    ...

# @origin src/proxy.ts:516
def contextWindowState(config: ProxyConfig) -> ContextWindowState:
    return Math.floor(...)

# @origin src/proxy.ts:535
async def waitForRequestInterval(ms: float, signal: AbortSignal | None) -> None:
    await previous.catch(...)
    await sleep(...)
    Promise(...)
    throwIfAborted(...)
    Math.max(...)
    Date.now(...)
    release(...)

# @origin src/proxy.ts:554
def normalizeModelListResponseBody(body: str) -> str:
    ...

# @origin src/proxy.ts:564
def cloudflareModelListResponse() -> Response:
    Response(...)
    JSON.stringify(...)
    return CLOUDFLARE_MODELS.map(...)

# @origin src/proxy.ts:579
def proxyLogSummary(kind: str, entry: dict[str, Any], file: str) -> dict[str, Any]:
    TextEncoder(...)
    return encode(...)

# @origin src/proxy.ts:598
def logDirFromEnv() -> str | None:
    getEnvOrNull(...)
    return value.trim(...)

# @origin src/proxy.ts:605
def writeModelListLog(entry: dict[str, Any]) -> None:
    logDirFromEnv(...)
    JSON.stringify(...)
    console.log(...)
    text.trimEnd(...)
    Deno.mkdirSync(...)
    Date(...)
    toISOString(...)
    replace(...)
    crypto.randomUUID(...)
    Deno.writeTextFileSync(...)

# @origin src/proxy.ts:620
def redactToken(value: str | None | None) -> str:
    value.startsWith(...)
    value.slice(...)
    return token.slice(...)

# @origin src/proxy.ts:626
def getEnvOrNull(name: str) -> str | None:
    return Deno.env.get(...)

# @origin src/proxy.ts:634
def writeUpstreamLog(entry: dict[str, Any]) -> None:
    logDirFromEnv(...)
    JSON.stringify(...)
    console.log(...)
    text.trimEnd(...)
    Deno.mkdirSync(...)
    Date(...)
    toISOString(...)
    replace(...)
    crypto.randomUUID(...)
    Deno.writeTextFileSync(...)

# @origin src/proxy.ts:649
def isToolCallType(type: str) -> type is ResponsesToolKind:
    ...

# @origin src/proxy.ts:658
def outputKindForToolKind(kind: ResponsesToolKind) -> ResponsesToolOutputKind:
    ...

# @origin src/proxy.ts:671
def isToolOutputKind(type: str) -> type is ResponsesToolOutputKind:
    ...

# @origin src/proxy.ts:695
def isReasoningType(type: Any) -> bool:
    return REASONING_ITEM_TYPES.has(...)

# @origin src/proxy.ts:699
def isReasoningItem(item: ResponsesInputItem) -> bool:
    return isReasoningType(...)

# @origin src/proxy.ts:703
def normalizeReasoningSummary(summary: Any) -> Any:
    ...

# @origin src/proxy.ts:721
def normalizeReasoningContent(content: Any) -> Any:
    ...

# @origin src/proxy.ts:739
def normalizeReasoningTextValue(text: str) -> str:
    THOUGHT_TAG_TOKENS.some(...)
    text.includes(...)
    return extractThoughtSegments(...)

# @origin src/proxy.ts:745
def extractReasoningTextFromRecord(record: dict[str, Any]) -> str:
    normalizeReasoningTextValue(...)
    seen.has(...)
    seen.add(...)
    parts.push(...)
    return parts.join(...)

# @origin src/proxy.ts:759
def extractReasoningDeltaText(record: dict[str, Any]) -> str:
    normalizeReasoningTextValue(...)
    seen.has(...)
    seen.add(...)
    parts.push(...)
    return parts.join(...)

# @origin src/proxy.ts:774
def mergeReasoningTexts(parts: list[str | None]) -> str:
    part.trim(...)
    seen.has(...)
    seen.add(...)
    out.push(...)
    return out.join(...)

# @origin src/proxy.ts:787
def reasoningItemId() -> str:
    crypto.randomUUID(...)
    return replace(...)

# @origin src/proxy.ts:791
def normalizeReasoningItemPayload(item: dict[str, Any]) -> dict[str, Any]:
    normalizeReasoningSummary(...)
    normalizeReasoningContent(...)
    mergeReasoningTexts(...)
    extractReasoningTextFromRecord(...)
    content.map(...)
    join(...)
    return reasoningItemId(...)

# @origin src/proxy.ts:821
def normalizeReasoningItem(item: ResponsesInputItem) -> ResponsesEvent:
    return normalizeReasoningItemPayload(...)

# @origin src/proxy.ts:829
def responseDoneEventForInputItem(item: ResponsesInputItem) -> ResponsesEvent | None:
    isReasoningItem(...)
    normalizeReasoningItem(...)
    return isToolOutputKind(...)

# @origin src/proxy.ts:845
def setMcpToolDiscoveryForTests(discovery: McpToolDiscovery | None) -> None:
    ...

# @origin src/proxy.ts:850
def sanitizeResponsesApiToolName(name: str) -> str:
    name.trim(...)
    replace(...)
    return sanitized.slice(...)

# @origin src/proxy.ts:855
def canonicalMcpNamespaceName(name: str) -> str:
    name.trim(...)
    test(...)
    return trimmed.slice(...)

# @origin src/proxy.ts:861
def legacyMcpNamespaceName(name: str) -> str:
    canonicalMcpNamespaceName(...)
    canonical.startsWith(...)
    return canonical.endsWith(...)

# @origin src/proxy.ts:866
def namespaceNameVariants(namespaceName: str) -> list[str]:
    canonicalMcpNamespaceName(...)
    legacyMcpNamespaceName(...)
    Array.from_(...)
    Set(...)
    return variants.filter(...)

# @origin src/proxy.ts:873
def namespaceSetHas(namespaces: set[str], namespaceName: str) -> bool:
    namespaceNameVariants(...)
    some(...)
    return namespaces.has(...)

# @origin src/proxy.ts:877
def mcpNamespaceNameForServer(serverName: str) -> str:
    sanitizeResponsesApiToolName(...)
    serverName.toLowerCase(...)
    return replace(...)

# @origin src/proxy.ts:882
def normalizeMcpToolForResponses(tool: dict[str, Any]) -> dict[str, Any] | None:
    sanitizeResponsesApiToolName(...)
    return rawName.replace(...)

# @origin src/proxy.ts:900
def mcpNamespaceToolsFromStatuses(statuses: list[Any]) -> list[Any]:
    mcpNamespaceNameForServer(...)
    Object.values(...)
    flatMap(...)
    normalizeMcpToolForResponses(...)
    Array.isArray(...)
    return mergeToolsByName(...)

# @origin src/proxy.ts:933
def toolIdentity(tool: Any) -> str:
    return canonicalMcpNamespaceName(...)

# @origin src/proxy.ts:950
def mergeNamespaceTools(existing: dict[str, Any], added: dict[str, Any], replaceExisting: bool) -> dict[str, Any]:
    Array.isArray(...)
    return mergeToolsByName(...)

# @origin src/proxy.ts:963
def mergeToolsByName(existing: list[Any], added: list[Any], replaceExisting: bool) -> list[Any]:
    out.forEach(...)
    toolIdentity(...)
    indexes.set(...)
    indexes.get(...)
    out.push(...)
    identity.startsWith(...)
    return mergeNamespaceTools(...)

# @origin src/proxy.ts:1006
def appendCollaborationNamespaceToolsForResponses(parsed: dict[str, Any]) -> None:
    getEnvOrNull(...)
    Array.isArray(...)
    mergeToolsByName(...)

# @origin src/proxy.ts:1016
async def discoverMcpNamespaceTools() -> list[Any]:
    await mcpToolDiscoveryOverride(...)
    listMcpServerStatus(...)
    then(...)
    mcpNamespaceToolsFromStatuses(...)
    writeUpstreamLog(...)
    return String(...)

# @origin src/proxy.ts:1032
async def appendMcpNamespaceToolsForResponses(parsed: dict[str, Any], config: ProxyConfig) -> None:
    await discoverMcpNamespaceTools(...)
    getEnvOrNull(...)
    collectResponsesToolSpecs(...)
    canonicalMcpNamespaceName(...)
    namespaceName.startsWith(...)
    requestedNamespaces.add(...)
    mcpTools.filter(...)
    namespaceSetHas(...)
    Array.isArray(...)
    mergeToolsByName(...)

# @origin src/proxy.ts:1060
def robustNormalizeServerName(name: str, namespaces: set[str]) -> str:
    test(...)
    canonicalMcpNamespaceName(...)
    name.match_(...)
    sanitizeResponsesApiToolName(...)
    name.toLowerCase(...)
    replace(...)
    return namespaceSetHas(...)

# @origin src/proxy.ts:1071
def robustDenormalizeServerName(name: str) -> str:
    robustNormalizeServerName(...)
    normalized.match_(...)
    return replace(...)

# @origin src/proxy.ts:1082
def flattenNamespacedToolName(namespaceName: str, toolName: str) -> str:
    canonicalMcpNamespaceName(...)
    return splitFlattenedNamespacedToolName(...)

# @origin src/proxy.ts:1090
def splitFlattenedNamespacedToolName(name: str, namespaceName: str) -> str | None:
    namespaceNameVariants(...)
    name.startsWith(...)
    return name.slice(...)

# @origin src/proxy.ts:1104
def normalizeResponsesEvent(event: ResponsesEvent, namespaces: set[str]) -> ResponsesEvent:
    isReasoningType(...)
    normalizeReasoningItemPayload(...)
    isToolCallType(...)
    JSON.parse(...)
    robustDenormalizeServerName(...)
    JSON.stringify(...)
    canonicalMcpNamespaceName(...)
    splitFlattenedNamespacedToolName(...)
    return outputKindForToolKind(...)

# @origin src/proxy.ts:1174
def extractNamespacesFromBody(body: str | None) -> set[str]:
    JSON.parse(...)
    collectResponsesToolSpecs(...)
    namespaces.add(...)
    canonicalMcpNamespaceName(...)
    writeUpstreamLog(...)
    return Array.from_(...)

# @origin src/proxy.ts:1198
def additionalToolsFromResponsesInput(input: Any) -> list[Any]:
    Array.isArray(...)
    return input.flatMap(...)

# @origin src/proxy.ts:1208
def hasAdditionalToolsInputItem(input: Any) -> bool:
    Array.isArray(...)
    return input.some(...)

# @origin src/proxy.ts:1216
def collectResponsesToolSpecs(parsed: dict[str, Any]) -> list[Any]:
    Array.isArray(...)
    return additionalToolsFromResponsesInput(...)

# @origin src/proxy.ts:1223
def buildMockSseBody(events: list[ResponsesEvent], namespaces: set[str]) -> str:
    map(...)
    normalizeResponsesEvent(...)
    JSON.stringify(...)
    return join(...)

# @origin src/proxy.ts:1232
def buildMockResponsesEventsFromInput(input: list[ResponsesInputItem]) -> list[ResponsesEvent]:
    responseDoneEventForInputItem(...)
    return events.push(...)

# @origin src/proxy.ts:1241
def writeResponseLog(entry: dict[str, Any]) -> None:
    logDirFromEnv(...)
    JSON.stringify(...)
    console.log(...)
    text.trimEnd(...)
    Deno.mkdirSync(...)
    Date(...)
    toISOString(...)
    replace(...)
    crypto.randomUUID(...)
    Deno.writeTextFileSync(...)

# @origin src/proxy.ts:1256
def writeStreamLog(entry: dict[str, Any]) -> None:
    logDirFromEnv(...)
    JSON.stringify(...)
    console.log(...)
    text.trimEnd(...)
    Deno.mkdirSync(...)
    Date(...)
    toISOString(...)
    replace(...)
    crypto.randomUUID(...)
    Deno.writeTextFileSync(...)

# @origin src/proxy.ts:1271
async def writeFinalClientResponseLog(path: str, response: Response) -> None:
    await response.clone(...)
    logDirFromEnv(...)
    text(...)
    writeResponseLog(...)
    Object.fromEntries(...)
    response.headers.entries(...)
    response.headers.get(...)
    contentType.includes(...)
    writeStreamLog(...)

# @origin src/proxy.ts:1300
def rewrittenBodyHeaders(headers: Headers) -> Headers:
    Headers(...)
    return out.delete(...)

# @origin src/proxy.ts:1308
async def forwardJson(url: str, init: RequestInit) -> Response:
    await fetch(...)

# @origin src/proxy.ts:1313
def hasAntigravityProjectIdError(text: str) -> bool:
    text.toLowerCase(...)
    return lower.includes(...)

# @origin src/proxy.ts:1319
def hasCfWorkersAiError(parsed: dict[str, Any]) -> bool:
    Array.isArray(...)
    errors.some(...)
    msg.toLowerCase(...)
    return lower.includes(...)

# @origin src/proxy.ts:1335
def hasGlmQuotaOrKeyErrorText(text: str) -> bool:
    text.toLowerCase(...)
    return lower.includes(...)

# @origin src/proxy.ts:1356
async def shouldTriggerImmediateGlmKeyRefresh(response: Response, config: ProxyConfig) -> bool:
    await response.clone(...)
    isGlmKeyRefreshEnabled(...)
    text(...)
    return hasGlmQuotaOrKeyErrorText(...)

# @origin src/proxy.ts:1370
async def maybeTriggerImmediateGlmKeyRefresh(response: Response, config: ProxyConfig) -> None:
    await shouldTriggerImmediateGlmKeyRefresh(...)
    refreshGlmKeyIfNeeded(...)

# @origin src/proxy.ts:1384
def isContextLengthOverflowResponse(response: Response, text: str) -> bool:
    text.toLowerCase(...)
    return lower.includes(...)

# @origin src/proxy.ts:1395
def isResponsesToolHistoryErrorResponse(response: Response, text: str) -> bool:
    text.toLowerCase(...)
    return lower.includes(...)

# @origin src/proxy.ts:1405
async def isResponsesToolHistoryError(response: Response) -> bool:
    await response.clone(...)
    isResponsesToolHistoryErrorResponse(...)
    return text(...)

# @origin src/proxy.ts:1413
async def compactAndRetryOnOverflow(path: str, req: Request, config: ProxyConfig, body: str | None, baseHeaders: Headers, rawBody: str | None, turnContext: ProxyTurnContext | None, upstream: Response) -> Response:
    await upstream.clone(...)
    await forwardWithFallback(...)
    await compactResponse.text(...)
    await retryTrimmedOnOverflow(...)
    await clonedText(...)
    contextWindowState(...)
    text(...)
    isContextLengthOverflowResponse(...)
    writeUpstreamLog(...)
    buildContextCompactionRequestBody(...)
    extractCompactionSummaryText(...)
    return compressRequestsBodyForRetry(...)

# @origin src/proxy.ts:1503
async def clonedText(response: Response) -> str:
    await response.clone(...)
    return text(...)

# @origin src/proxy.ts:1517
def splitConversationTurns(items: list[Any]) -> list[Any][]:
    turns.push(...)
    push(...)
    return turns.filter(...)

# @origin src/proxy.ts:1536
def newTurnBoundaryNotice() -> str:
    ...

# @origin src/proxy.ts:1548
async def retryTrimmedOnOverflow(path: str, req: Request, config: ProxyConfig, body: str | None, baseHeaders: Headers, rawBody: str | None, turnContext: ProxyTurnContext | None, upstream: Response, state: ContextWindowState) -> Response:
    await clonedText(...)
    await forwardWithFallback(...)
    path.includes(...)
    trimBodyToWindowEdges(...)
    estimateRequestInputTokens(...)
    writeUpstreamLog(...)
    return isContextLengthOverflowResponse(...)

# @origin src/proxy.ts:1619
def trimBodyToWindowEdges(requestBody: str | None, keepFirst: Any, keepLast: Any) -> str | None:
    parseJsonBody(...)
    Array.isArray(...)
    splitConversationTurns(...)
    turns.slice(...)
    newTurnBoundaryNotice(...)
    reconstructed.push(...)
    return JSON.stringify(...)

# @origin src/proxy.ts:1668
async def shouldRetryUpstreamResponse(response: Response) -> bool:
    await response.clone(...)
    response.headers.get(...)
    contentType.includes(...)
    text(...)
    text.toLowerCase(...)
    lower.includes(...)
    hasGlmQuotaOrKeyErrorText(...)
    hasAntigravityProjectIdError(...)
    parseJsonBody(...)
    hasCfWorkersAiError(...)
    e.code.toLowerCase(...)
    e.type.toLowerCase(...)
    message.toLowerCase(...)
    return lowerMsg.includes(...)

# @origin src/proxy.ts:1737
def isJsonWriteMethod(method: str) -> bool:
    ...

# @origin src/proxy.ts:1741
def emptyJsonBodyResponse() -> Response:
    Response(...)
    return JSON.stringify(...)

# @origin src/proxy.ts:1757
def unconvertibleResponsesRequestResponse() -> Response:
    Response(...)
    return JSON.stringify(...)

# @origin src/proxy.ts:1773
def mappedModelName(model: str, config: ProxyConfig) -> str:
    ...

# @origin src/proxy.ts:1777
async def maybeRewriteRequestBody(path: str, body: str | None, config: ProxyConfig) -> str | None:
    await appendMcpNamespaceToolsForResponses(...)
    path.includes(...)
    JSON.parse(...)
    mappedModelName(...)
    isGeminiModel(...)
    Array.isArray(...)
    normalizeResponseInputItems(...)
    hasAdditionalToolsInputItem(...)
    appendCollaborationNamespaceToolsForResponses(...)
    normalizeChatToolsValue(...)
    return JSON.stringify(...)

# @origin src/proxy.ts:1829
def contextWindowUsageFromBody(body: str | None) -> Any:
    ...

# @origin src/proxy.ts:1855
def estimateTextTokens(text: str) -> float:
    Math.ceil(...)
    char.codePointAt(...)
    return flushAscii(...)

# @origin src/proxy.ts:1877
def estimateJsonTextTokens(value: Any) -> float:
    estimateTextTokens(...)
    Array.isArray(...)
    value.reduce(...)
    estimateJsonTextTokens(...)
    return Object.entries(...)

# @origin src/proxy.ts:1892
def estimateRequestInputTokens(body: str | None) -> float:
    parseJsonBody(...)
    contextWindowUsageFromBody(...)
    estimateJsonTextTokens(...)
    estimateTextTokens(...)
    return Math.max(...)

# @origin src/proxy.ts:1904
def requestNeedsContextCompaction(path: str, body: str | None, config: ProxyConfig) -> Any:
    ...

# @origin src/proxy.ts:1940
def lastUserTurnText(body: str | None) -> str | None:
    parseJsonBody(...)
    Array.isArray(...)
    map(...)
    join(...)
    text.trim(...)
    return pickFromMessages(...)

# @origin src/proxy.ts:1997
def compressRequestsBodyForRetry(requestBody: str | None, summaryText: str) -> str | None:
    parseJsonBody(...)
    lastUserTurnText(...)
    Array.isArray(...)
    messages.push(...)
    JSON.stringify(...)
    return input.push(...)

# @origin src/proxy.ts:2038
def appendCompactionSummaryInput(requestBody: str | None, summaryText: str) -> str | None:
    parseJsonBody(...)
    Array.isArray(...)
    return JSON.stringify(...)

# @origin src/proxy.ts:2061
def buildContextCompactionRequestBody(originalBody: str | None, maxTokens: float, thresholdPercent: float) -> str | None:
    parseJsonBody(...)
    Array.isArray(...)
    return JSON.stringify(...)

# @origin src/proxy.ts:2088
def extractCompactionSummaryText(responseText: str) -> str:
    parseJsonBody(...)
    responseText.trim(...)
    parsed.output_text.trim(...)
    Array.isArray(...)
    flatMap(...)
    value.trim(...)
    return join(...)

# @origin src/proxy.ts:2112
def isGeminiModel(model: str) -> bool:
    return model.startsWith(...)

# @origin src/proxy.ts:2116
def sanitizeToolName(name: Any) -> str:
    return name.trim(...)

# @origin src/proxy.ts:2121
def normalizeChatFallbackToolName(name: str) -> str:
    ...

# @origin src/proxy.ts:2126
def repairCollapsedNamespacedToolName(name: str, namespaces: set[str]) -> str:
    namespaceNameVariants(...)
    some(...)
    name.startsWith(...)
    canonicalMcpNamespaceName(...)
    stem.startsWith(...)
    flattenNamespacedToolName(...)
    return name.slice(...)

# @origin src/proxy.ts:2143
def normalizeFunctionCallArguments(argumentsText: str) -> str:
    JSON.parse(...)
    robustNormalizeServerName(...)
    JSON.stringify(...)
    return unsupportedToolNoticeCommand(...)

# @origin src/proxy.ts:2166
def normalizedResponseToolName(record: dict[str, Any], options: ResponseInputNormalizeOptions) -> str:
    normalizeChatFallbackToolName(...)
    sanitizeToolName(...)
    return flattenNamespacedToolName(...)

# @origin src/proxy.ts:2178
def normalizeResponseInputItems(input: Any, options: ResponseInputNormalizeOptions) -> list[Any]:
    Array.isArray(...)
    isToolCallType(...)
    normalizedResponseToolName(...)
    name.startsWith(...)
    callNames.set(...)
    normalized.push(...)
    seenToolReferences.add(...)
    canonicalMcpNamespaceName(...)
    JSON.stringify(...)
    JSON.parse(...)
    robustNormalizeServerName(...)
    String(...)
    seenToolCalls.has(...)
    seenToolCalls.add(...)
    seenToolOutputs.has(...)
    seenToolOutputs.add(...)
    sanitizeToolName(...)
    callNames.get(...)
    return seenToolReferences.has(...)

# @origin src/proxy.ts:2309
def normalizeChatToolsValue(tools: Any, wrap: Any) -> list[Any]:
    Array.isArray(...)
    tools.flatMap(...)
    normalizeChatToolsValue(...)
    map(...)
    flattenNamespacedToolName(...)
    normalizeChatFallbackToolName(...)
    return sanitizeToolName(...)

# @origin src/proxy.ts:2379
def extractAllowedChatToolNames(body: Any) -> set[str]:
    JSON.parse(...)
    collectResponsesToolSpecs(...)
    normalizeChatToolsValue(...)
    return names.add(...)

# @origin src/proxy.ts:2404
def sanitizeResponsesFallbackRequest(request: dict[str, Any]) -> None:
    ...

# @origin src/proxy.ts:2414
def isFallbackEligibleStatus(status: float) -> bool:
    ...

# @origin src/proxy.ts:2418
async def isResponsesToolsParamError(response: Response) -> bool:
    await response.clone(...)
    text(...)
    parseJsonBody(...)
    text.toLowerCase(...)
    return includes(...)

# @origin src/proxy.ts:2433
async def isResponsesCodexCompatibilityError(response: Response) -> bool:
    await response.clone(...)
    text(...)
    text.toLowerCase(...)
    parseJsonBody(...)
    return lower.includes(...)

# @origin src/proxy.ts:2451
def isFallbackEligibleError(error: Any) -> bool:
    ...

# @origin src/proxy.ts:2468
def mapContentPartForChat(part: dict[str, Any]) -> dict[str, Any]:
    ...

# @origin src/proxy.ts:2492
def contentToChatContent(content: Any) -> Any:
    Array.isArray(...)
    content.flatMap(...)
    parts.some(...)
    map(...)
    join(...)
    return parts.map(...)

# @origin src/proxy.ts:2510
def mergeChatContents(current: Any, next: Any) -> Any:
    Array.isArray(...)
    value.flatMap(...)
    return toParts(...)

# @origin src/proxy.ts:2534
def pushSystemMessage(messages: list[dict[str, Any]], systemTexts list[str]) -> None:
    systemTexts.map(...)
    text.trim(...)
    filter(...)
    join(...)
    messages.unshift(...)

# @origin src/proxy.ts:2542
def structuredContentItemText(part: Any) -> str:
    ...

# @origin src/proxy.ts:2563
def structuredContentText(value: Any) -> str:
    Array.isArray(...)
    value.map(...)
    filter(...)
    return join(...)

# @origin src/proxy.ts:2568
def mcpContentText(value: Any) -> str:
    Array.isArray(...)
    record.content.map(...)
    structuredContentItemText(...)
    filter(...)
    join(...)
    return JSON.stringify(...)

# @origin src/proxy.ts:2586
def toolOutputText(record: dict[str, Any]) -> str:
    structuredContentText(...)
    mcpContentText(...)
    return JSON.stringify(...)

# @origin src/proxy.ts:2599
def extractChatFallbackFromResponsesBody(body: str | None, planModeLike: Any, allowUnsafeGeminiToolHistory: Any, nvidiaCompat: Any, disablePromptInjection: Any) -> ChatFallbackRequest | None:
    JSON.parse(...)
    Array.isArray(...)
    normalizeResponseInputItems(...)
    isUnsafeGeminiChatFallback(...)
    extractNamespacesFromBody(...)
    systemTexts.push(...)
    crypto.randomUUID(...)
    replace(...)
    repairCollapsedNamespacedToolName(...)
    sanitizeToolName(...)
    normalizeFunctionCallArguments(...)
    toolCalls.push(...)
    emittedToolCallIds.add(...)
    mergeChatContents(...)
    contentToChatContent(...)
    messages.push(...)
    toolOutputText(...)
    emittedToolCallIds.has(...)
    pushSystemMessage(...)
    Object.entries(...)
    normalizeChatToolsValue(...)
    collectResponsesToolSpecs(...)
    sanitizeResponsesFallbackRequest(...)
    return String(...)

# @origin src/proxy.ts:2785
def isUnsafeGeminiChatFallback(model: str, input: list[Any]) -> bool:
    isGeminiModel(...)
    input.some(...)
    isToolCallType(...)
    return isToolOutputKind(...)

# @origin src/proxy.ts:2796
def responseTextFromChatBody(body: str) -> str:
    JSON.parse(...)
    return firstChatMessage(...)

# @origin src/proxy.ts:2807
def firstChatMessage(parsed: dict[str, Any] | None) -> dict[str, Any] | None:
    return Array.isArray(...)

# @origin src/proxy.ts:2818
def parseJsonBody(body: str) -> dict[str, Any] | None:
    return JSON.parse(...)

# @origin src/proxy.ts:2826
def sseFieldValue(line: str, prefixLength: float) -> str:
    line.slice(...)
    raw.startsWith(...)
    return raw.slice(...)

# @origin src/proxy.ts:2831
def parseSseBlock(block: str) -> Any:
    ...

# @origin src/proxy.ts:2845
def isTerminalResponsesSseEvent(type: str) -> bool:
    ...

# @origin src/proxy.ts:2853
def rewriteResponseMessageItem(item: dict[str, Any], visibleText: str) -> dict[str, Any]:
    Array.isArray(...)
    return content.flatMap(...)

# @origin src/proxy.ts:2881
def createReasoningStreamState() -> ReasoningStreamState:
    return reasoningItemId(...)

# @origin src/proxy.ts:2890
def restartReasoningStreamState(state: ReasoningStreamState) -> None:
    reasoningItemId(...)

# @origin src/proxy.ts:2897
def ensureReasoningStreamStarted(events: list[ResponsesEvent], state: ReasoningStreamState) -> None:
    events.push(...)

# @origin src/proxy.ts:2914
def appendReasoningTextDelta(events: list[ResponsesEvent], state: ReasoningStreamState, text: str, separator: Any) -> None:
    restartReasoningStreamState(...)
    ensureReasoningStreamStarted(...)
    events.push(...)

# @origin src/proxy.ts:2933
def reasoningOutputItem(id: str, text: str) -> dict[str, Any]:
    ...

# @origin src/proxy.ts:2942
def finalizeReasoningStreamItem(events: list[ResponsesEvent], state: ReasoningStreamState, namespaces: set[str]) -> None:
    events.push(...)
    normalizeResponsesEvent(...)
    reasoningOutputItem(...)

# @origin src/proxy.ts:2955
def pushReasoningDoneItem(events: list[ResponsesEvent], text: str, namespaces: set[str]) -> None:
    text.trim(...)
    events.push(...)
    normalizeResponsesEvent(...)
    reasoningOutputItem(...)
    reasoningItemId(...)

# @origin src/proxy.ts:2968
def mergeReasoningTextFromMessageItem(item: dict[str, Any], extractedText: str) -> str:
    mergeReasoningTexts(...)
    return extractReasoningTextFromRecord(...)

# @origin src/proxy.ts:2978
def normalizeResponsesSseBody(body: str, namespaces: set[str], planModeLike: Any, allowedTools: set[str], collaborationModeKind: str | None) -> Any:
    ...

# @origin src/proxy.ts:3341
def extractThoughtSegments(text: str) -> Any:
    ...

# @origin src/proxy.ts:3390
def joinVisibleThoughtParts(parts: list[str]) -> str:
    test(...)
    current.replace(...)
    return part.replace(...)

# @origin src/proxy.ts:3407
def stripResidualThoughtTags(text: str) -> str:
    current.split(...)
    return join(...)

# @origin src/proxy.ts:3415
def longestSuffixPrefix(text: str, token: str) -> float:
    Math.min(...)
    text.slice(...)
    return token.slice(...)

# @origin src/proxy.ts:3425
def createThoughtStreamSplitter() -> Any:
    Math.max(...)
    longestSuffixPrefix(...)
    text.indexOf(...)
    longestPartialThoughtTag(...)
    text.slice(...)
    consume(...)
    earliestOpenTag(...)
    earliestCloseTag(...)
    visible.push(...)
    pending.slice(...)
    pending.indexOf(...)
    reasoning.push(...)
    stripResidualThoughtTags(...)
    joinVisibleThoughtParts(...)
    reasoning.join(...)
    flush(...)
    return trimTrailingPartialThoughtTag(...)

# @origin src/proxy.ts:3536
def responsesFallbackEventsFromChat(chatBody: str, planModeLike: Any) -> list[ResponsesEvent]:
    responseTextFromChatBody(...)
    extractThoughtSegments(...)
    crypto.randomUUID(...)
    replace(...)
    createReasoningStreamState(...)
    appendReasoningTextDelta(...)
    finalizeReasoningStreamItem(...)
    return events.push(...)

# @origin src/proxy.ts:3582
def shellQuote(value: str) -> str:
    return value.replace(...)

# @origin src/proxy.ts:3586
def redactSensitiveFileCommand(path: str) -> str:
    shellQuote(...)
    return test(...)

# @origin src/proxy.ts:3594
def unsupportedToolNoticeCommand(name: str) -> str:
    return shellQuote(...)

# @origin src/proxy.ts:3600
def isProgressOnlyMessage(text: str) -> bool:
    text.trim(...)
    return test(...)

# @origin src/proxy.ts:3616
def continueAfterProgressCommand() -> str:
    return shellQuote(...)

# @origin src/proxy.ts:3624
def hasFinalAnswerMarkers(text: str) -> bool:
    return test(...)

# @origin src/proxy.ts:3631
def normalizeChatToolCall(call: ChatToolCall, namespaces: set[str], allowedTools: set[str]) -> ChatToolCall | None:
    repairCollapsedNamespacedToolName(...)
    name.includes(...)
    name.split(...)
    parts.slice(...)
    join(...)
    robustNormalizeServerName(...)
    namespaceSetHas(...)
    flattenNamespacedToolName(...)
    namespaceNameVariants(...)
    find(...)
    name.startsWith(...)
    name.slice(...)
    JSON.parse(...)
    robustDenormalizeServerName(...)
    JSON.stringify(...)
    allowedTools.has(...)
    has(...)
    redactSensitiveFileCommand(...)
    splitFlattenedNamespacedToolName(...)
    return unsupportedToolNoticeCommand(...)

# @origin src/proxy.ts:3737
def shouldInjectContinuationTool(text: str, planModeLike: bool, allowedTools: set[str], collaborationModeKind: str | None) -> bool:
    allowedTools.has(...)
    text.trim(...)
    hasFinalAnswerMarkers(...)
    test(...)
    return isProgressOnlyMessage(...)

# @origin src/proxy.ts:3753
def parseChatToolCallDelta(delta: dict[str, Any]) -> list[ChatToolCallChunk]:
    Array.isArray(...)
    rawToolCalls.flatMap(...)
    return String(...)

# @origin src/proxy.ts:3777
def mergeChatToolCallArguments(existing: str, incoming: str) -> str:
    existing.startsWith(...)
    return incoming.startsWith(...)

# @origin src/proxy.ts:3785
def accumulateChatToolCallChunk(toolCalls: Any) -> None:
    slotsByCallId.get(...)
    slotsByCallId.set(...)
    toolCalls.get(...)
    mergeChatToolCallArguments(...)
    toolCalls.set(...)
    crypto.randomUUID(...)
    replace(...)

# @origin src/proxy.ts:3816
def collectResponsesEventsFromChatChunkText(chatText: str, namespaces: set[str], planModeLike: Any, allowedTools: set[str], collaborationModeKind: str | None) -> Any:
    ...

# @origin src/proxy.ts:4025
def normalizeChatUsage(usage: dict[str, Any] | None) -> dict[str, Any]:
    ...

# @origin src/proxy.ts:4061
def responsesFallbackResponseFromChat(chatResponseBody: str, stream: bool, namespaces: set[str], planModeLike: Any, allowedTools: set[str], collaborationModeKind: str | None) -> Response:
    collectResponsesEventsFromChatChunkText(...)
    events.push(...)
    Response(...)
    buildMockSseBody(...)
    parseJsonBody(...)
    firstChatMessage(...)
    responseTextFromChatBody(...)
    extractThoughtSegments(...)
    mergeReasoningTexts(...)
    extractReasoningTextFromRecord(...)
    output.push(...)
    Array.isArray(...)
    normalizeChatToolCall(...)
    normalizeResponsesEvent(...)
    crypto.randomUUID(...)
    replace(...)
    shouldInjectContinuationTool(...)
    JSON.stringify(...)
    continueAfterProgressCommand(...)
    return normalizeChatUsage(...)

# @origin src/proxy.ts:4181
def responsesFallbackStreamFromChat(chatBody: str) -> Response:
    Response(...)
    buildMockSseBody(...)
    return responsesFallbackEventsFromChat(...)

# @origin src/proxy.ts:4188
def chatPathFromResponsesPath(path: str) -> str:
    path.indexOf(...)
    return path.slice(...)

# @origin src/proxy.ts:4194
def buildUpstreamUrl(target: str, requestPath: str, preserveBasePath: bool) -> str:
    URL(...)
    toString(...)
    target.endsWith(...)
    baseUrl.pathname.replace(...)
    requestPath.replace(...)
    basePath.endsWith(...)
    relativePath.startsWith(...)
    return relativePath.slice(...)

# @origin src/proxy.ts:4205
async def forwardWithFallback(path: str, req: Request, config: ProxyConfig, body: str | None, baseHeaders: Headers, rawBody: str, turnContext: ProxyTurnContext) -> Response:
    await waitForRequestInterval(...)
    await forwardJson(...)
    await sendOnce(...)
    await refreshGlmKeyFromErrorResponse(...)
    await maybeTriggerImmediateGlmKeyRefresh(...)
    await shouldRetryUpstreamResponse(...)
    await sleep(...)
    await send(...)
    await chatResponse.text(...)
    await sendChatFallback(...)
    await isResponsesToolsParamError(...)
    await isResponsesCodexCompatibilityError(...)
    await isResponsesToolHistoryError(...)
    await responsesResponse.text(...)
    path.includes(...)
    async_(...)
    forwardHeaders(...)
    nextApiKey(...)
    buildUpstreamUrl(...)
    writeUpstreamLog(...)
    redactToken(...)
    headers.get(...)
    retryDelayMs(...)
    chatPathFromResponsesPath(...)
    extractChatFallbackFromResponsesBody(...)
    JSON.stringify(...)
    writeResponseLog(...)
    Object.fromEntries(...)
    chatResponse.headers.entries(...)
    chatResponse.headers.get(...)
    includes(...)
    writeStreamLog(...)
    extractNamespacesFromBody(...)
    extractAllowedChatToolNames(...)
    responsesFallbackResponseFromChat(...)
    unconvertibleResponsesRequestResponse(...)
    isFallbackEligibleError(...)
    isFallbackEligibleStatus(...)
    responsesResponse.headers.get(...)
    responsesResponse.headers.entries(...)
    contentType.includes(...)
    normalizeResponsesSseBody(...)
    events.push(...)
    normalized.body.trim(...)
    split(...)
    flatMap(...)
    parseSseBlock(...)
    JSON.parse(...)
    Response(...)
    buildMockSseBody(...)
    rewrittenBodyHeaders(...)
    parseJsonBody(...)
    Array.isArray(...)
    extractReasoningTextFromRecord(...)
    visibleParts.push(...)
    extractThoughtSegments(...)
    mergeReasoningTexts(...)
    normalizedOutput.push(...)
    reasoningOutputItem(...)
    reasoningItemId(...)
    normalizeResponsesEvent(...)
    normalizedOutput.some(...)
    return normalizedOutput.unshift(...)
    raise Error(...)

# @origin src/proxy.ts:4557
async def proxyOpenAI(path: str, req: Request, config: ProxyConfig, turnContext: ProxyTurnContext) -> Response:
    await req.clone(...)
    await maybeRewriteRequestBody(...)
    await forwardWithFallback(...)
    await compactResponse.text(...)
    await compactAndRetryOnOverflow(...)
    await upstream.clone(...)
    await writeFinalClientResponseLog(...)
    path.startsWith(...)
    cloudflareModelListResponse(...)
    text(...)
    isJsonWriteMethod(...)
    path.includes(...)
    rawBody.trim(...)
    emptyJsonBodyResponse(...)
    requestNeedsContextCompaction(...)
    buildContextCompactionRequestBody(...)
    writeUpstreamLog(...)
    extractCompactionSummaryText(...)
    compressRequestsBodyForRetry(...)
    appendCompactionSummaryInput(...)
    writeModelListLog(...)
    Object.fromEntries(...)
    req.headers.entries(...)
    return upstream.headers.entries(...)

# @origin src/proxy.ts:4686
async def mockResponsesOpenAI(path: str, req: Request, config: ProxyConfig, scenario: ResponsesScenario, turnContext: ProxyTurnContext) -> Response:
    await readJson(...)
    await proxyOpenAI(...)
    path.includes(...)
    Array.isArray(...)
    buildMockResponsesEventsFromInput(...)
    buildMockSseBody(...)
    return Response(...)

# @origin src/proxy.ts:4719
async def readJson(req: Request) -> JsonObject:
    await req.text(...)
    text.trim(...)
    return JSON.parse(...)

def forwardHeaders(headers: Headers, apiKey: str, localAuthToken: str | None) -> Any:
    Headers(...)
    out.delete(...)
    return out.set(...)
