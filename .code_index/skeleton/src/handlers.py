from __future__ import annotations

from .proxy import mockResponsesOpenAI, proxyOpenAI, readJson
from .proxy import ProxyTurnContext
from .state import HubState
from .jsonrpc import isRpcRequest, rpcError, rpcResult
from .mcp import callMcpTool, listMcpServerStatus, readMcpResource
from .types import ProxyConfig, ProxyResult, ResponsesScenario

# @origin src/handlers.ts:8
def toJson(value: Any) -> Any:
    Array.isArray(...)
    value.map(...)
    Object.entries(...)
    toJson(...)
    return String(...)

# @origin src/handlers.ts:24
def normalizePlanType(planType: str | None) -> str | None:
    planType.trim(...)
    return toLowerCase(...)

# @origin src/handlers.ts:30
def accountPlanType(config: ProxyConfig) -> str | None:
    return normalizePlanType(...)

# @origin src/handlers.ts:34
def accountFromConfig(config: ProxyConfig) -> dict[str, Any]:
    return accountPlanType(...)

# @origin src/handlers.ts:42
def normalizeCollaborationModeKind(value: Any) -> str | None:
    mode.trim(...)
    return toLowerCase(...)

# @origin src/handlers.ts:50
def requestThreadId(req: Request) -> str:
    req.headers.get(...)
    return JSON.parse(...)

# @origin src/handlers.ts:67
def requestTurnId(req: Request) -> str:
    req.headers.get(...)
    return JSON.parse(...)

# @origin src/handlers.ts:80
def turnContextForThread(state: HubState, threadId: str, turnId: str) -> Any:
    ...

# @origin src/handlers.ts:93
def textFromContent(content: Any) -> list[str]:
    Array.isArray(...)
    return content.flatMap(...)

# @origin src/handlers.ts:104
def collectModeTexts(parsed: dict[str, Any]) -> Any:
    ...

# @origin src/handlers.ts:132
def modeFromExplicitFields(parsed: dict[str, Any]) -> str | None:
    raw.trim(...)
    return toLowerCase(...)

# @origin src/handlers.ts:151
def modeFromInstructionTexts(instructionTexts: list[str]) -> str | None:
    return text.matchAll(...)

# @origin src/handlers.ts:163
def normalizeMultiAgentMode(value: Any) -> Any:
    ...

# @origin src/handlers.ts:172
def multiAgentModeParam(params: dict[str, Any]) -> Any:
    return normalizeMultiAgentMode(...)

# @origin src/handlers.ts:176
def inferCollaborationModeKindFromBody(body: str | None) -> str | None:
    JSON.parse(...)
    modeFromExplicitFields(...)
    collectModeTexts(...)
    allTexts.join(...)
    test(...)
    return modeFromInstructionTexts(...)

# @origin src/handlers.ts:197
def writeModeResolutionLog(entry: dict[str, Any]) -> None:
    writeRequestLog(...)

# @origin src/handlers.ts:204
def resolveTurnContext(state: HubState, threadId: str, turnId: str | None, requestBody: str | None) -> ProxyTurnContext | None:
    turnContextForThread(...)
    writeModeResolutionLog(...)
    return inferCollaborationModeKindFromBody(...)

# @origin src/handlers.ts:247
def hasValidAuth(req: Request, config: ProxyConfig) -> bool:
    return req.headers.get(...)

# @origin src/handlers.ts:254
def redactHeaders(headers: Headers) -> dict[str, str]:
    headers.entries(...)
    key.toLowerCase(...)
    value.startsWith(...)
    value.slice(...)
    return token.slice(...)

# @origin src/handlers.ts:270
def logSummary(entry: dict[str, Any], file: str) -> dict[str, Any]:
    TextEncoder(...)
    return encode(...)

# @origin src/handlers.ts:281
def logDirFromEnv() -> str | None:
    Deno.env.get(...)
    return value.trim(...)

# @origin src/handlers.ts:288
def writeRequestLog(entry: dict[str, Any]) -> None:
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

# @origin src/handlers.ts:303
def writeAuthFailureLog(req: Request, config: ProxyConfig) -> None:
    req.headers.get(...)
    value.startsWith(...)
    value.slice(...)
    token.slice(...)
    writeRequestLog(...)
    URL(...)
    preview(...)
    config.authToken.slice(...)

# @origin src/handlers.ts:324
def objectParam(value: Any) -> dict[str, Any]:
    return Array.isArray(...)

# @origin src/handlers.ts:330
def textParam(value: dict[str, Any], key: str) -> str | None:
    ...

# @origin src/handlers.ts:335
def extractAssistantText(value: Any) -> str:
    return Array.isArray(...)

# @origin src/handlers.ts:351
def spawnedAgentPath(thread: Any) -> str | None:
    ...

# @origin src/handlers.ts:362
def maybeStartBackgroundAgent(input: Any) -> None:
    await proxyOpenAI(...)
    await response.text(...)
    objectParam(...)
    textParam(...)
    message.trim(...)
    taskName.trim(...)
    startsWith(...)
    input.state.getThread(...)
    input.state.listThreads(...)
    find(...)
    spawnedAgentPath(...)
    void(...)
    async_(...)
    Request(...)
    JSON.stringify(...)
    JSON.parse(...)
    input.state.errorAgent(...)
    text.slice(...)
    input.state.completeAgent(...)
    extractAssistantText(...)
    String(...)

# @origin src/handlers.ts:422
async def handleRpc(req: Request, state: HubState, config: ProxyConfig) -> Response:
    await readJson(...)
    await proxyOpenAI(...)
    await listMcpServerStatus(...)
    await readMcpResource(...)
    await callMcpTool(...)
    isRpcRequest(...)
    jsonResponse(...)
    rpcError(...)
    rpcResult(...)
    toJson(...)
    Deno.cwd(...)
    state.startThread(...)
    multiAgentModeParam(...)
    String(...)
    state.resumeThread(...)
    state.listThreads(...)
    Array.isArray(...)
    params.sourceKinds.filter(...)
    state.listLoadedThreads(...)
    state.forkThread(...)
    state.getThread(...)
    state.getTurns(...)
    state.archiveThread(...)
    state.unarchiveThread(...)
    state.setThreadName(...)
    state.patchThreadMetadata(...)
    state.rollbackThread(...)
    Number(...)
    state.listTurns(...)
    find(...)
    state.injectItems(...)
    state.unsubscribeThread(...)
    state.incrementElicitation(...)
    state.decrementElicitation(...)
    state.startTurn(...)
    normalizeCollaborationModeKind(...)
    state.steerTurn(...)
    state.interruptTurn(...)
    state.emitWarning(...)
    state.emitGuardianWarning(...)
    state.setGoal(...)
    state.getGoal(...)
    state.clearGoal(...)
    btoa(...)
    state.readFile(...)
    state.writeFile(...)
    state.createDirectory(...)
    state.getMetadata(...)
    state.readDirectory(...)
    map(...)
    state.remove(...)
    state.copy(...)
    state.watch(...)
    state.unwatch(...)
    state.pushNotification(...)
    filter(...)
    crypto.randomUUID(...)
    URL(...)
    toString(...)
    Request(...)
    state.emitAccountRateLimitsUpdated(...)
    accountPlanType(...)
    state.emitAccountUpdated(...)
    accountFromConfig(...)
    Date(...)
    toISOString(...)
    state.emitUserInputRequest(...)
    state.emitMcpElicitationRequest(...)
    Set(...)
    state.callMultiAgentTool(...)
    childIdsBefore.has(...)
    maybeStartBackgroundAgent(...)
    state.emitRealtimeStarted(...)
    Math.floor(...)
    Date.now(...)
    state.emitRealtimeItemAdded(...)
    state.emitRealtimeOutputAudioDelta(...)
    state.emitRealtimeTranscriptDelta(...)
    state.emitRealtimeTranscriptDone(...)
    state.emitRealtimeClosed(...)
    state.emitMcpServerStartupStatus(...)
    state.emitWindowsSandboxSetupCompleted(...)
    state.emitExternalAgentConfigImportCompleted(...)
    state.emitAppListUpdated(...)
    state.emitFuzzySearchUpdated(...)
    state.emitFuzzySearchCompleted(...)
    state.emitServerRequestResolved(...)
    state.emitWindowsWorldWritableWarning(...)
    state.commandExec(...)
    params.command.map(...)
    state.emitCommandExecOutputDelta(...)
    state.commandExecWrite(...)
    state.commandExecTerminate(...)
    state.commandExecResize(...)
    state.spawnProcess(...)
    state.writeProcessStdin(...)
    state.killProcess(...)
    return state.resizeProcess(...)

# @origin src/handlers.ts:1642
async def handleHttp(req: Request, config: ProxyConfig) -> Response:
    handleHttpWithState(...)
    return HubState(...)

# @origin src/handlers.ts:1646
async def handleHttpWithState(req: Request, config: ProxyConfig, state: HubState) -> Response:
    await req.clone(...)
    await proxyOpenAI(...)
    await handleRpc(...)
    await mockResponsesOpenAI(...)
    URL(...)
    url.pathname.startsWith(...)
    text(...)
    writeRequestLog(...)
    redactHeaders(...)
    Response(...)
    hasValidAuth(...)
    writeAuthFailureLog(...)
    jsonResponse(...)
    TextEncoder(...)
    start(...)
    state.drainNotifications(...)
    controller.enqueue(...)
    encoder.encode(...)
    JSON.stringify(...)
    setInterval(...)
    flush(...)
    cancel(...)
    clearInterval(...)
    requestThreadId(...)
    requestTurnId(...)
    return resolveTurnContext(...)

# @origin src/handlers.ts:1715
def jsonResponse(payload: Any, status: Any) -> Response:
    Response(...)
    return JSON.stringify(...)

# @origin src/handlers.ts:1722
def asProxyResult(resp: Response) -> ProxyResult:
    resp.text(...)
    then(...)
    return resp.headers.get(...)
