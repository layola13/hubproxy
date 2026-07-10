from __future__ import annotations

from .types import JsonObject, ProxyConfig, ResponsesEvent, ResponsesInputItem, ResponsesScenario, ResponsesToolKind, ResponsesToolOutputKind
from .mcp import listMcpServerStatus

# @origin src/proxy.ts:181
def normalizeRuntimeKey(raw: str) -> str:
    raw.trim(...)
    replace(...)
    return trim(...)

# @origin src/proxy.ts:185
def isExactGlmBabelChannel(config: ProxyConfig) -> bool:
    config.chatBaseUrl.trim(...)
    return toLowerCase(...)

# @origin src/proxy.ts:189
def isGlmKeyRefreshEnabled(config: ProxyConfig) -> bool:
    return isExactGlmBabelChannel(...)

# @origin src/proxy.ts:194
def scheduleGlmKeyRefresh(config: ProxyConfig) -> None:
    isGlmKeyRefreshEnabled(...)
    Math.max(...)
    setInterval(...)
    refreshGlmKeyIfNeeded(...)

# @origin src/proxy.ts:203
def glmKeyFetchBackoffDelayMs(config: ProxyConfig, attempt: float) -> float:
    Math.max(...)
    return Math.min(...)

# @origin src/proxy.ts:210
def glmDotenvPath() -> str:
    return Deno.env.get(...)

# @origin src/proxy.ts:214
def readGlmRuntimeKeyFromDotenv(path: str) -> str | None:
    Deno.readTextFileSync(...)
    text.split(...)
    rawLine.trim(...)
    line.startsWith(...)
    line.indexOf(...)
    line.slice(...)
    trim(...)
    return normalizeRuntimeKey(...)

# @origin src/proxy.ts:233
def currentGlmRuntimeKey(config: ProxyConfig) -> str | None:
    isExactGlmBabelChannel(...)
    normalizeRuntimeKey(...)
    Deno.env.get(...)
    readGlmRuntimeKeyFromDotenv(...)
    return glmDotenvPath(...)

# @origin src/proxy.ts:248
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

# @origin src/proxy.ts:267
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

# @origin src/proxy.ts:330
async def refreshGlmKeyFromErrorResponse(response: Response, config: ProxyConfig) -> str | None:
    await shouldTriggerImmediateGlmKeyRefresh(...)
    await refreshGlmKeyIfNeeded(...)
    Deno.env.set(...)
    return writeUpstreamLog(...)

# @origin src/proxy.ts:348
async def refreshGlmKeyIfNeeded(config: ProxyConfig) -> str | None:
    isGlmKeyRefreshEnabled(...)
    fetchFreshGlmApiKey(...)
    return finally_(...)

# @origin src/proxy.ts:359
def nextApiKey(config: ProxyConfig) -> str:
    currentGlmRuntimeKey(...)
    Array.isArray(...)
    apiKeyRotationIndexes.get(...)
    return apiKeyRotationIndexes.set(...)

# @origin src/proxy.ts:373
def initProxyRuntime(config: ProxyConfig) -> None:
    scheduleGlmKeyRefresh(...)

# @origin src/proxy.ts:377
def abortError() -> DOMException:
    return DOMException(...)

# @origin src/proxy.ts:381
def throwIfAborted(signal: AbortSignal | None) -> None:
    abortError(...)

# @origin src/proxy.ts:385
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

# @origin src/proxy.ts:402
def retryDelayMs(config: ProxyConfig) -> float:
    ...

# @origin src/proxy.ts:406
def contextWindowState(config: ProxyConfig) -> ContextWindowState:
    return Math.floor(...)

# @origin src/proxy.ts:425
async def waitForRequestInterval(ms: float, signal: AbortSignal | None) -> None:
    await previous.catch(...)
    await sleep(...)
    Promise(...)
    throwIfAborted(...)
    Math.max(...)
    Date.now(...)
    release(...)

# @origin src/proxy.ts:444
def normalizeModelListResponseBody(body: str) -> str:
    ...

# @origin src/proxy.ts:454
def cloudflareModelListResponse() -> Response:
    Response(...)
    JSON.stringify(...)
    return CLOUDFLARE_MODELS.map(...)

# @origin src/proxy.ts:469
def proxyLogSummary(kind: str, entry: dict[str, Any], file: str) -> dict[str, Any]:
    TextEncoder(...)
    return encode(...)

# @origin src/proxy.ts:488
def logDirFromEnv() -> str | None:
    getEnvOrNull(...)
    return value.trim(...)

# @origin src/proxy.ts:495
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

# @origin src/proxy.ts:510
def redactToken(value: str | None | None) -> str:
    value.startsWith(...)
    value.slice(...)
    return token.slice(...)

# @origin src/proxy.ts:516
def getEnvOrNull(name: str) -> str | None:
    return Deno.env.get(...)

# @origin src/proxy.ts:524
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

# @origin src/proxy.ts:539
def isToolCallType(type: str) -> type is ResponsesToolKind:
    ...

# @origin src/proxy.ts:548
def outputKindForToolKind(kind: ResponsesToolKind) -> ResponsesToolOutputKind:
    ...

# @origin src/proxy.ts:561
def isToolOutputKind(type: str) -> type is ResponsesToolOutputKind:
    ...

# @origin src/proxy.ts:585
def isReasoningType(type: Any) -> bool:
    return REASONING_ITEM_TYPES.has(...)

# @origin src/proxy.ts:589
def isReasoningItem(item: ResponsesInputItem) -> bool:
    return isReasoningType(...)

# @origin src/proxy.ts:593
def normalizeReasoningSummary(summary: Any) -> Any:
    ...

# @origin src/proxy.ts:611
def normalizeReasoningContent(content: Any) -> Any:
    ...

# @origin src/proxy.ts:629
def normalizeReasoningTextValue(text: str) -> str:
    THOUGHT_TAG_TOKENS.some(...)
    text.includes(...)
    return extractThoughtSegments(...)

# @origin src/proxy.ts:635
def extractReasoningTextFromRecord(record: dict[str, Any]) -> str:
    normalizeReasoningTextValue(...)
    seen.has(...)
    seen.add(...)
    parts.push(...)
    return parts.join(...)

# @origin src/proxy.ts:649
def extractReasoningDeltaText(record: dict[str, Any]) -> str:
    normalizeReasoningTextValue(...)
    seen.has(...)
    seen.add(...)
    parts.push(...)
    return parts.join(...)

# @origin src/proxy.ts:664
def mergeReasoningTexts(parts: list[str | None]) -> str:
    part.trim(...)
    seen.has(...)
    seen.add(...)
    out.push(...)
    return out.join(...)

# @origin src/proxy.ts:677
def reasoningItemId() -> str:
    crypto.randomUUID(...)
    return replace(...)

# @origin src/proxy.ts:681
def normalizeReasoningItemPayload(item: dict[str, Any]) -> dict[str, Any]:
    normalizeReasoningSummary(...)
    normalizeReasoningContent(...)
    mergeReasoningTexts(...)
    extractReasoningTextFromRecord(...)
    content.map(...)
    join(...)
    return reasoningItemId(...)

# @origin src/proxy.ts:711
def normalizeReasoningItem(item: ResponsesInputItem) -> ResponsesEvent:
    return normalizeReasoningItemPayload(...)

# @origin src/proxy.ts:719
def responseDoneEventForInputItem(item: ResponsesInputItem) -> ResponsesEvent | None:
    isReasoningItem(...)
    normalizeReasoningItem(...)
    return isToolOutputKind(...)

# @origin src/proxy.ts:743
def setMcpToolDiscoveryForTests(discovery: McpToolDiscovery | None) -> None:
    ...

# @origin src/proxy.ts:748
def sanitizeResponsesApiToolName(name: str) -> str:
    name.trim(...)
    replace(...)
    return sanitized.slice(...)

# @origin src/proxy.ts:753
def mcpNamespaceNameForServer(serverName: str) -> str:
    sanitizeResponsesApiToolName(...)
    serverName.toLowerCase(...)
    return replace(...)

# @origin src/proxy.ts:760
def normalizeMcpToolForResponses(tool: dict[str, Any]) -> dict[str, Any] | None:
    sanitizeResponsesApiToolName(...)
    return rawName.replace(...)

# @origin src/proxy.ts:778
def mcpNamespaceToolsFromStatuses(statuses: list[Any]) -> list[Any]:
    mcpNamespaceNameForServer(...)
    Object.values(...)
    flatMap(...)
    normalizeMcpToolForResponses(...)
    Array.isArray(...)
    return mergeToolsByName(...)

# @origin src/proxy.ts:811
def toolIdentity(tool: Any) -> str:
    ...

# @origin src/proxy.ts:828
def mergeNamespaceTools(existing: dict[str, Any], added: dict[str, Any], replaceExisting: bool) -> dict[str, Any]:
    Array.isArray(...)
    return mergeToolsByName(...)

# @origin src/proxy.ts:841
def mergeToolsByName(existing: list[Any], added: list[Any], replaceExisting: bool) -> list[Any]:
    out.forEach(...)
    toolIdentity(...)
    indexes.set(...)
    indexes.get(...)
    out.push(...)
    identity.startsWith(...)
    return mergeNamespaceTools(...)

# @origin src/proxy.ts:884
def appendCollaborationNamespaceToolsForResponses(parsed: dict[str, Any]) -> None:
    getEnvOrNull(...)
    Array.isArray(...)
    mergeToolsByName(...)

# @origin src/proxy.ts:890
async def discoverMcpNamespaceTools() -> list[Any]:
    await mcpToolDiscoveryOverride(...)
    listMcpServerStatus(...)
    then(...)
    mcpNamespaceToolsFromStatuses(...)
    writeUpstreamLog(...)
    return String(...)

# @origin src/proxy.ts:906
async def appendMcpNamespaceToolsForResponses(parsed: dict[str, Any], config: ProxyConfig) -> None:
    await discoverMcpNamespaceTools(...)
    getEnvOrNull(...)
    Array.isArray(...)
    mergeToolsByName(...)

# @origin src/proxy.ts:918
def robustNormalizeServerName(name: str, namespaces: set[str]) -> str:
    test(...)
    name.match_(...)
    name.toLowerCase(...)
    replace(...)
    return has(...)

# @origin src/proxy.ts:929
def robustDenormalizeServerName(name: str) -> str:
    robustNormalizeServerName(...)
    normalized.match_(...)
    return replace(...)

# @origin src/proxy.ts:942
def flattenNamespacedToolName(namespaceName: str, toolName: str) -> str:
    toolName.startsWith(...)
    return namespaceName.endsWith(...)

# @origin src/proxy.ts:950
def splitFlattenedNamespacedToolName(name: str, namespaceName: str) -> str | None:
    name.startsWith(...)
    return name.slice(...)

# @origin src/proxy.ts:962
def normalizeResponsesEvent(event: ResponsesEvent, namespaces: set[str]) -> ResponsesEvent:
    isReasoningType(...)
    normalizeReasoningItemPayload(...)
    isToolCallType(...)
    JSON.parse(...)
    robustDenormalizeServerName(...)
    JSON.stringify(...)
    splitFlattenedNamespacedToolName(...)
    return outputKindForToolKind(...)

# @origin src/proxy.ts:1031
def extractNamespacesFromBody(body: str | None) -> set[str]:
    JSON.parse(...)
    Array.isArray(...)
    namespaces.add(...)
    writeUpstreamLog(...)
    return Array.from_(...)

# @origin src/proxy.ts:1055
def buildMockSseBody(events: list[ResponsesEvent], namespaces: set[str]) -> str:
    map(...)
    normalizeResponsesEvent(...)
    JSON.stringify(...)
    return join(...)

# @origin src/proxy.ts:1064
def buildMockResponsesEventsFromInput(input: list[ResponsesInputItem]) -> list[ResponsesEvent]:
    responseDoneEventForInputItem(...)
    return events.push(...)

# @origin src/proxy.ts:1073
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

# @origin src/proxy.ts:1088
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

# @origin src/proxy.ts:1103
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

# @origin src/proxy.ts:1132
def rewrittenBodyHeaders(headers: Headers) -> Headers:
    Headers(...)
    return out.delete(...)

# @origin src/proxy.ts:1140
async def forwardJson(url: str, init: RequestInit) -> Response:
    await fetch(...)

# @origin src/proxy.ts:1145
def hasAntigravityProjectIdError(text: str) -> bool:
    text.toLowerCase(...)
    return lower.includes(...)

# @origin src/proxy.ts:1151
def hasCfWorkersAiError(parsed: dict[str, Any]) -> bool:
    Array.isArray(...)
    errors.some(...)
    msg.toLowerCase(...)
    return lower.includes(...)

# @origin src/proxy.ts:1167
def hasGlmQuotaOrKeyErrorText(text: str) -> bool:
    text.toLowerCase(...)
    return lower.includes(...)

# @origin src/proxy.ts:1188
async def shouldTriggerImmediateGlmKeyRefresh(response: Response, config: ProxyConfig) -> bool:
    await response.clone(...)
    isGlmKeyRefreshEnabled(...)
    text(...)
    return hasGlmQuotaOrKeyErrorText(...)

# @origin src/proxy.ts:1202
async def maybeTriggerImmediateGlmKeyRefresh(response: Response, config: ProxyConfig) -> None:
    await shouldTriggerImmediateGlmKeyRefresh(...)
    refreshGlmKeyIfNeeded(...)

# @origin src/proxy.ts:1216
def isContextLengthOverflowResponse(response: Response, text: str) -> bool:
    text.toLowerCase(...)
    return lower.includes(...)

# @origin src/proxy.ts:1227
def isResponsesToolHistoryErrorResponse(response: Response, text: str) -> bool:
    text.toLowerCase(...)
    return lower.includes(...)

# @origin src/proxy.ts:1237
async def isResponsesToolHistoryError(response: Response) -> bool:
    await response.clone(...)
    isResponsesToolHistoryErrorResponse(...)
    return text(...)

# @origin src/proxy.ts:1245
async def compactAndRetryOnOverflow(path: str, req: Request, config: ProxyConfig, body: str | None, baseHeaders: Headers, rawBody: str | None, turnContext: ProxyTurnContext | None, upstream: Response) -> Response:
    await upstream.clone(...)
    await forwardWithFallback(...)
    await compactResponse.text(...)
    contextWindowState(...)
    text(...)
    isContextLengthOverflowResponse(...)
    writeUpstreamLog(...)
    buildContextCompactionRequestBody(...)
    extractCompactionSummaryText(...)
    return compressRequestsBodyForRetry(...)

# @origin src/proxy.ts:1307
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

# @origin src/proxy.ts:1370
def isJsonWriteMethod(method: str) -> bool:
    ...

# @origin src/proxy.ts:1374
def emptyJsonBodyResponse() -> Response:
    Response(...)
    return JSON.stringify(...)

# @origin src/proxy.ts:1390
def unconvertibleResponsesRequestResponse() -> Response:
    Response(...)
    return JSON.stringify(...)

# @origin src/proxy.ts:1406
async def maybeRewriteRequestBody(path: str, body: str | None, config: ProxyConfig) -> str | None:
    await appendMcpNamespaceToolsForResponses(...)
    path.includes(...)
    JSON.parse(...)
    isGeminiModel(...)
    Array.isArray(...)
    normalizeResponseInputItems(...)
    appendCollaborationNamespaceToolsForResponses(...)
    normalizeChatToolsValue(...)
    return JSON.stringify(...)

# @origin src/proxy.ts:1452
def contextWindowUsageFromBody(body: str | None) -> Any:
    ...

# @origin src/proxy.ts:1478
def estimateRequestInputTokens(body: str | None) -> float:
    parseJsonBody(...)
    contextWindowUsageFromBody(...)
    texts.push(...)
    addText(...)
    Array.isArray(...)
    texts.reduce(...)
    Math.max(...)
    return Math.ceil(...)

# @origin src/proxy.ts:1513
def requestNeedsContextCompaction(path: str, body: str | None, config: ProxyConfig) -> Any:
    ...

# @origin src/proxy.ts:1546
def lastUserTurnText(body: str | None) -> str | None:
    parseJsonBody(...)
    Array.isArray(...)
    map(...)
    join(...)
    text.trim(...)
    return pickFromMessages(...)

# @origin src/proxy.ts:1603
def compressRequestsBodyForRetry(requestBody: str | None, summaryText: str) -> str | None:
    parseJsonBody(...)
    lastUserTurnText(...)
    Array.isArray(...)
    messages.push(...)
    JSON.stringify(...)
    return input.push(...)

# @origin src/proxy.ts:1644
def appendCompactionSummaryInput(requestBody: str | None, summaryText: str) -> str | None:
    parseJsonBody(...)
    Array.isArray(...)
    return JSON.stringify(...)

# @origin src/proxy.ts:1667
def buildContextCompactionRequestBody(originalBody: str | None, maxTokens: float, thresholdPercent: float) -> str | None:
    parseJsonBody(...)
    Array.isArray(...)
    return JSON.stringify(...)

# @origin src/proxy.ts:1694
def extractCompactionSummaryText(responseText: str) -> str:
    parseJsonBody(...)
    responseText.trim(...)
    parsed.output_text.trim(...)
    Array.isArray(...)
    flatMap(...)
    value.trim(...)
    return join(...)

# @origin src/proxy.ts:1718
def isGeminiModel(model: str) -> bool:
    return model.startsWith(...)

# @origin src/proxy.ts:1722
def sanitizeToolName(name: Any) -> str:
    return name.trim(...)

# @origin src/proxy.ts:1727
def repairCollapsedNamespacedToolName(name: str, namespaces: set[str]) -> str:
    name.startsWith(...)
    ns.startsWith(...)
    ns.endsWith(...)
    ns.slice(...)
    return name.slice(...)

# @origin src/proxy.ts:1745
def normalizeFunctionCallArguments(argumentsText: str) -> str:
    JSON.parse(...)
    robustNormalizeServerName(...)
    JSON.stringify(...)
    return unsupportedToolNoticeCommand(...)

# @origin src/proxy.ts:1764
def normalizeResponseInputItems(input: Any) -> list[Any]:
    Array.isArray(...)
    isToolCallType(...)
    sanitizeToolName(...)
    name.startsWith(...)
    callNames.set(...)
    normalized.push(...)
    seenToolReferences.add(...)
    JSON.parse(...)
    robustNormalizeServerName(...)
    JSON.stringify(...)
    String(...)
    callNames.get(...)
    return seenToolReferences.has(...)

# @origin src/proxy.ts:1856
def normalizeChatToolsValue(tools: Any, wrap: Any) -> list[Any]:
    Array.isArray(...)
    tools.flatMap(...)
    normalizeChatToolsValue(...)
    map(...)
    flattenNamespacedToolName(...)
    return sanitizeToolName(...)

# @origin src/proxy.ts:1921
def extractAllowedChatToolNames(tools: Any) -> set[str]:
    JSON.parse(...)
    normalizeChatToolsValue(...)
    return names.add(...)

# @origin src/proxy.ts:1944
def sanitizeResponsesFallbackRequest(request: dict[str, Any]) -> None:
    ...

# @origin src/proxy.ts:1954
def isFallbackEligibleStatus(status: float) -> bool:
    ...

# @origin src/proxy.ts:1958
def isFallbackEligibleError(error: Any) -> bool:
    ...

# @origin src/proxy.ts:1975
def mapContentPartForChat(part: dict[str, Any]) -> dict[str, Any]:
    ...

# @origin src/proxy.ts:1996
def contentToChatContent(content: Any) -> Any:
    Array.isArray(...)
    content.flatMap(...)
    parts.some(...)
    map(...)
    join(...)
    return parts.map(...)

# @origin src/proxy.ts:2014
def mergeChatContents(current: Any, next: Any) -> Any:
    Array.isArray(...)
    value.flatMap(...)
    return toParts(...)

# @origin src/proxy.ts:2038
def pushSystemMessage(messages: list[dict[str, Any]], systemTexts list[str]) -> None:
    systemTexts.map(...)
    text.trim(...)
    filter(...)
    join(...)
    messages.unshift(...)

# @origin src/proxy.ts:2046
def toolOutputText(record: dict[str, Any]) -> str:
    return JSON.stringify(...)

# @origin src/proxy.ts:2053
def extractChatFallbackFromResponsesBody(body: str | None, planModeLike: Any, allowUnsafeGeminiToolHistory: Any, nvidiaCompat: Any) -> ChatFallbackRequest | None:
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
    sanitizeResponsesFallbackRequest(...)
    return String(...)

# @origin src/proxy.ts:2232
def isUnsafeGeminiChatFallback(model: str, input: list[Any]) -> bool:
    isGeminiModel(...)
    input.some(...)
    isToolCallType(...)
    return isToolOutputKind(...)

# @origin src/proxy.ts:2243
def responseTextFromChatBody(body: str) -> str:
    JSON.parse(...)
    return firstChatMessage(...)

# @origin src/proxy.ts:2254
def firstChatMessage(parsed: dict[str, Any] | None) -> dict[str, Any] | None:
    return Array.isArray(...)

# @origin src/proxy.ts:2265
def parseJsonBody(body: str) -> dict[str, Any] | None:
    return JSON.parse(...)

# @origin src/proxy.ts:2273
def sseFieldValue(line: str, prefixLength: float) -> str:
    line.slice(...)
    raw.startsWith(...)
    return raw.slice(...)

# @origin src/proxy.ts:2278
def parseSseBlock(block: str) -> Any:
    ...

# @origin src/proxy.ts:2292
def rewriteResponseMessageItem(item: dict[str, Any], visibleText: str) -> dict[str, Any]:
    Array.isArray(...)
    return content.flatMap(...)

# @origin src/proxy.ts:2320
def createReasoningStreamState() -> ReasoningStreamState:
    return reasoningItemId(...)

# @origin src/proxy.ts:2329
def restartReasoningStreamState(state: ReasoningStreamState) -> None:
    reasoningItemId(...)

# @origin src/proxy.ts:2336
def ensureReasoningStreamStarted(events: list[ResponsesEvent], state: ReasoningStreamState) -> None:
    events.push(...)

# @origin src/proxy.ts:2353
def appendReasoningTextDelta(events: list[ResponsesEvent], state: ReasoningStreamState, text: str, separator: Any) -> None:
    restartReasoningStreamState(...)
    ensureReasoningStreamStarted(...)
    events.push(...)

# @origin src/proxy.ts:2372
def reasoningOutputItem(id: str, text: str) -> dict[str, Any]:
    ...

# @origin src/proxy.ts:2381
def finalizeReasoningStreamItem(events: list[ResponsesEvent], state: ReasoningStreamState, namespaces: set[str]) -> None:
    events.push(...)
    normalizeResponsesEvent(...)
    reasoningOutputItem(...)

# @origin src/proxy.ts:2394
def pushReasoningDoneItem(events: list[ResponsesEvent], text: str, namespaces: set[str]) -> None:
    text.trim(...)
    events.push(...)
    normalizeResponsesEvent(...)
    reasoningOutputItem(...)
    reasoningItemId(...)

# @origin src/proxy.ts:2407
def mergeReasoningTextFromMessageItem(item: dict[str, Any], extractedText: str) -> str:
    mergeReasoningTexts(...)
    return extractReasoningTextFromRecord(...)

# @origin src/proxy.ts:2417
def normalizeResponsesSseBody(body: str, namespaces: set[str], planModeLike: Any, allowedTools: set[str], collaborationModeKind: str | None) -> str:
    createThoughtStreamSplitter(...)
    createReasoningStreamState(...)
    crypto.randomUUID(...)
    replace(...)
    completionEvents.push(...)
    thoughtSplitter.consume(...)
    mergeReasoningTexts(...)
    events.push(...)
    rewriteResponseMessageItem(...)
    Array.isArray(...)
    visibleParts.push(...)
    extractThoughtSegments(...)
    mergeReasoningTextFromMessageItem(...)
    pushReasoningDoneItem(...)
    normalizeResponsesEvent(...)
    extractReasoningDeltaText(...)
    appendReasoningTextDelta(...)
    finalizeReasoningStreamItem(...)
    parseChatToolCallDelta(...)
    toolCalls.get(...)
    toolCalls.set(...)
    Array.from_(...)
    toolCalls.values(...)
    sort(...)
    normalizeChatToolCall(...)
    toolCalls.clear(...)
    body.split(...)
    line.startsWith(...)
    sseFieldValue(...)
    line.trim(...)
    parseJsonBody(...)
    processPayload(...)
    handleOpenAiPayload(...)
    thoughtSplitter.flush(...)
    events.some(...)
    isToolCallType(...)
    shouldInjectContinuationTool(...)
    JSON.stringify(...)
    continueAfterProgressCommand(...)
    return buildMockSseBody(...)

# @origin src/proxy.ts:2722
def extractThoughtSegments(text: str) -> Any:
    ...

# @origin src/proxy.ts:2771
def joinVisibleThoughtParts(parts: list[str]) -> str:
    test(...)
    current.replace(...)
    return part.replace(...)

# @origin src/proxy.ts:2788
def stripResidualThoughtTags(text: str) -> str:
    current.split(...)
    return join(...)

# @origin src/proxy.ts:2796
def longestSuffixPrefix(text: str, token: str) -> float:
    Math.min(...)
    text.slice(...)
    return token.slice(...)

# @origin src/proxy.ts:2806
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

# @origin src/proxy.ts:2917
def responsesFallbackEventsFromChat(chatBody: str, planModeLike: Any) -> list[ResponsesEvent]:
    responseTextFromChatBody(...)
    extractThoughtSegments(...)
    crypto.randomUUID(...)
    replace(...)
    createReasoningStreamState(...)
    appendReasoningTextDelta(...)
    finalizeReasoningStreamItem(...)
    return events.push(...)

# @origin src/proxy.ts:2963
def shellQuote(value: str) -> str:
    return value.replace(...)

# @origin src/proxy.ts:2967
def redactSensitiveFileCommand(path: str) -> str:
    shellQuote(...)
    return test(...)

# @origin src/proxy.ts:2975
def unsupportedToolNoticeCommand(name: str) -> str:
    return shellQuote(...)

# @origin src/proxy.ts:2981
def isProgressOnlyMessage(text: str) -> bool:
    text.trim(...)
    return test(...)

# @origin src/proxy.ts:2997
def continueAfterProgressCommand() -> str:
    return shellQuote(...)

# @origin src/proxy.ts:3005
def hasFinalAnswerMarkers(text: str) -> bool:
    return test(...)

# @origin src/proxy.ts:3012
def normalizeChatToolCall(call: ChatToolCall, namespaces: set[str], allowedTools: set[str]) -> ChatToolCall | None:
    repairCollapsedNamespacedToolName(...)
    name.includes(...)
    name.split(...)
    parts.slice(...)
    join(...)
    robustNormalizeServerName(...)
    namespaces.has(...)
    name.startsWith(...)
    flattenNamespacedToolName(...)
    name.slice(...)
    JSON.parse(...)
    robustDenormalizeServerName(...)
    JSON.stringify(...)
    allowedTools.has(...)
    has(...)
    redactSensitiveFileCommand(...)
    splitFlattenedNamespacedToolName(...)
    return unsupportedToolNoticeCommand(...)

# @origin src/proxy.ts:3117
def shouldInjectContinuationTool(text: str, planModeLike: bool, allowedTools: set[str], collaborationModeKind: str | None) -> bool:
    allowedTools.has(...)
    text.trim(...)
    hasFinalAnswerMarkers(...)
    test(...)
    return isProgressOnlyMessage(...)

# @origin src/proxy.ts:3133
def parseChatToolCallDelta(delta: dict[str, Any]) -> list[ChatToolCallChunk]:
    Array.isArray(...)
    rawToolCalls.flatMap(...)
    return String(...)

# @origin src/proxy.ts:3157
def collectResponsesEventsFromChatChunkText(chatText: str, namespaces: set[str], planModeLike: Any, allowedTools: set[str], collaborationModeKind: str | None) -> Any:
    ...

# @origin src/proxy.ts:3343
def normalizeChatUsage(usage: dict[str, Any] | None) -> dict[str, Any]:
    ...

# @origin src/proxy.ts:3379
def responsesFallbackResponseFromChat(chatResponseBody: str, stream: bool, namespaces: set[str], planModeLike: Any, allowedTools: set[str], collaborationModeKind: str | None) -> Response:
    collectResponsesEventsFromChatChunkText(...)
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

# @origin src/proxy.ts:3489
def responsesFallbackStreamFromChat(chatBody: str) -> Response:
    Response(...)
    buildMockSseBody(...)
    return responsesFallbackEventsFromChat(...)

# @origin src/proxy.ts:3496
def chatPathFromResponsesPath(path: str) -> str:
    path.indexOf(...)
    return path.slice(...)

# @origin src/proxy.ts:3502
def buildUpstreamUrl(target: str, requestPath: str, preserveBasePath: bool) -> str:
    URL(...)
    toString(...)
    target.endsWith(...)
    baseUrl.pathname.replace(...)
    requestPath.replace(...)
    basePath.endsWith(...)
    relativePath.startsWith(...)
    return relativePath.slice(...)

# @origin src/proxy.ts:3513
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
    Response(...)
    normalizeResponsesSseBody(...)
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

# @origin src/proxy.ts:3796
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
    appendCompactionSummaryInput(...)
    writeModelListLog(...)
    Object.fromEntries(...)
    req.headers.entries(...)
    return upstream.headers.entries(...)

# @origin src/proxy.ts:3924
async def mockResponsesOpenAI(path: str, req: Request, config: ProxyConfig, scenario: ResponsesScenario, turnContext: ProxyTurnContext) -> Response:
    await readJson(...)
    await proxyOpenAI(...)
    path.includes(...)
    Array.isArray(...)
    buildMockResponsesEventsFromInput(...)
    buildMockSseBody(...)
    return Response(...)

# @origin src/proxy.ts:3957
async def readJson(req: Request) -> JsonObject:
    await req.text(...)
    text.trim(...)
    return JSON.parse(...)

def forwardHeaders(headers: Headers, apiKey: str, localAuthToken: str | None) -> Any:
    Headers(...)
    out.delete(...)
    return out.set(...)
