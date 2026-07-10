from __future__ import annotations

from .types import ServerNotification, Thread, ThreadGoal, ThreadTurn

class HubState:
    # @origin src/state.ts:207
    def pushNotification(self, notification: ServerNotification) -> None:
        self.state.notifications.push(...)

    # @origin src/state.ts:211
    def extractTextParts(self, value: Any) -> list[str]:
        Array.isArray(...)
        value.flatMap(...)
        return String(...)

    # @origin src/state.ts:222
    def emitReasoningNotifications(self, threadId: str, turnId: str, item: Any) -> None:
        crypto.randomUUID(...)
        self.extractTextParts(...)
        String(...)
        self.pushNotification(...)
        rawParts.entries(...)

    # @origin src/state.ts:254
    def emitAgentMessageNotifications(self, threadId: str, turnId: str, item: Any) -> None:
        crypto.randomUUID(...)
        Array.isArray(...)
        String(...)
        self.pushNotification(...)

    # @origin src/state.ts:279
    def emitPlanNotifications(self, threadId: str, turnId: str, item: Any) -> None:
        crypto.randomUUID(...)
        self.pushNotification(...)

    # @origin src/state.ts:293
    def normalizeFileUpdateKind(self, kind: Any) -> FileUpdateChange[kind]:
        ...

    # @origin src/state.ts:307
    def emitFileChangeNotifications(self, threadId: str, turnId: str, item: Any) -> None:
        crypto.randomUUID(...)
        Array.isArray(...)
        fileChange.changes.flatMap(...)
        String(...)
        self.normalizeFileUpdateKind(...)
        self.emitFileChangePatchUpdated(...)

    # @origin src/state.ts:332
    def emitCommandExecutionNotifications(self, threadId: str, turnId: str, item: Any) -> None:
        crypto.randomUUID(...)
        String(...)
        self.pushNotification(...)

    # @origin src/state.ts:351
    def emitMcpToolCallNotifications(self, threadId: str, turnId: str, item: Any) -> None:
        crypto.randomUUID(...)
        String(...)
        self.pushNotification(...)

    # @origin src/state.ts:368
    def emitItemNotifications(self, threadId: str, turnId: str, item: Any) -> None:
        self.emitReasoningNotifications(...)
        self.emitAgentMessageNotifications(...)
        self.emitPlanNotifications(...)
        self.emitFileChangeNotifications(...)
        self.emitCommandExecutionNotifications(...)
        self.emitMcpToolCallNotifications(...)

    # @origin src/state.ts:377
    def emitCompletedItem(self, threadId: str, turnId: str, item: Any) -> None:
        Date.now(...)
        self.pushNotification(...)
        self.emitItemNotifications(...)

    # @origin src/state.ts:394
    def appendSyntheticTurn(self, threadId: str, items: list[Any]) -> str | None:
        self.state.threads.get(...)
        self.state.turns.get(...)
        newTurn(...)
        turns.push(...)
        self.state.turns.set(...)
        now(...)
        return self.emitCompletedItem(...)

    # @origin src/state.ts:409
    def emitFileChangePatchUpdated(self, threadId: str, turnId: str, itemId: str, changes: list[FileUpdateChange]) -> None:
        self.pushNotification(...)

    # @origin src/state.ts:421
    def drainNotifications(self) -> list[ServerNotification]:
        ...

    # @origin src/state.ts:427
    def startThread(self, input: Any) -> Thread:
        crypto.randomUUID(...)
        newThread(...)
        Deno.cwd(...)
        now(...)
        self.state.threads.set(...)
        self.state.loadedThreadIds.add(...)
        self.state.turns.set(...)
        self.state.archivedThreadIds.delete(...)
        self.pushNotification(...)
        return publicThread(...)

    # @origin src/state.ts:461
    def resumeThread(self, threadId: str) -> Thread | None:
        self.state.threads.get(...)
        now(...)
        self.state.loadedThreadIds.add(...)
        self.pushNotification(...)
        publicThread(...)
        return self.getTurns(...)

    # @origin src/state.ts:475
    def listThreads(self, filters: Any) -> list[Thread]:
        self.state.threads.values(...)
        filter(...)
        self.matchesSourceKinds(...)
        self.matchesParentThreadId(...)
        sort(...)
        map(...)
        return publicThread(...)

    # @origin src/state.ts:483
    def matchesSourceKinds(self, thread: Thread, sourceKinds: list[str]) -> bool:
        threadSpawnPayload(...)
        return sourceKinds.some(...)

    # @origin src/state.ts:506
    def matchesParentThreadId(self, thread: Thread, parentThreadId: str | None) -> bool:
        return threadSpawnParentThreadId(...)

    # @origin src/state.ts:511
    def getThread(self, threadId: str) -> Thread | None:
        self.state.threads.get(...)
        return publicThread(...)

    # @origin src/state.ts:516
    def setGoal(self, threadId: str, patch: Any) -> ThreadGoal:
        self.state.goals.get(...)
        now(...)
        self.state.goals.set(...)
        return self.pushNotification(...)

    # @origin src/state.ts:534
    def getGoal(self, threadId: str) -> ThreadGoal | None:
        return self.state.goals.get(...)

    # @origin src/state.ts:538
    def clearGoal(self, threadId: str) -> bool:
        self.state.goals.delete(...)
        return self.pushNotification(...)

    # @origin src/state.ts:544
    def getTurns(self, threadId: str) -> list[ThreadTurn]:
        return self.state.turns.get(...)

    # @origin src/state.ts:548
    def setThreadName(self, threadId: str, name: str | None) -> Thread | None:
        self.state.threads.get(...)
        now(...)
        self.pushNotification(...)
        return publicThread(...)

    # @origin src/state.ts:557
    def patchThreadMetadata(self, threadId: str, patch: Any) -> Thread | None:
        self.state.threads.get(...)
        now(...)
        self.pushNotification(...)
        return publicThread(...)

    # @origin src/state.ts:573
    def archiveThread(self, threadId: str) -> Thread | None:
        self.state.threads.get(...)
        self.state.archivedThreadIds.add(...)
        now(...)
        self.pushNotification(...)
        return publicThread(...)

    # @origin src/state.ts:583
    def unarchiveThread(self, threadId: str) -> Thread | None:
        self.state.threads.get(...)
        self.state.archivedThreadIds.delete(...)
        now(...)
        self.pushNotification(...)
        return publicThread(...)

    # @origin src/state.ts:596
    def unsubscribeThread(self, threadId: str) -> notLoaded | notSubscribed | unsubscribed:
        self.state.threads.has(...)
        self.state.subscribedThreadIds.has(...)
        return self.state.subscribedThreadIds.delete(...)

    # @origin src/state.ts:603
    def incrementElicitation(self, threadId: str) -> Any:
        ...

    # @origin src/state.ts:609
    def decrementElicitation(self, threadId: str) -> Any:
        ...

    # @origin src/state.ts:615
    def rollbackThread(self, threadId: str, numTurns: float) -> Thread | None:
        self.state.threads.get(...)
        self.state.turns.get(...)
        turns.slice(...)
        self.state.turns.set(...)
        now(...)
        return publicThread(...)

    # @origin src/state.ts:626
    def listTurns(self, threadId: str) -> list[ThreadTurn]:
        return self.getTurns(...)

    # @origin src/state.ts:630
    def listLoadedThreads(self) -> list[str]:
        return self.state.loadedThreadIds.values(...)

    # @origin src/state.ts:634
    def injectItems(self, threadId: str, items: list[Any]) -> bool:
        return self.appendSyntheticTurn(...)

    # @origin src/state.ts:638
    def startTurn(self, threadId: str, items: list[Any], collaborationModeKind: str | None) -> ThreadTurn | None:
        self.state.threads.get(...)
        self.state.turns.get(...)
        newTurn(...)
        turns.push(...)
        self.state.turns.set(...)
        now(...)
        self.pushNotification(...)
        return self.emitCompletedItem(...)

    # @origin src/state.ts:665
    def steerTurn(self, threadId: str, turnId: str, items: list[Any]) -> ThreadTurn | None:
        self.state.turns.get(...)
        find(...)
        turn.items.push(...)
        now(...)
        return self.emitCompletedItem(...)

    # @origin src/state.ts:674
    def interruptTurn(self, threadId: str, turnId: str) -> ThreadTurn | None:
        self.state.turns.get(...)
        find(...)
        now(...)
        return self.pushNotification(...)

    # @origin src/state.ts:684
    def readFile(self, path: str) -> str:
        return Deno.readTextFileSync(...)

    # @origin src/state.ts:688
    def writeFile(self, path: str, dataBase64: str) -> bool:
        Uint8Array.from_(...)
        atob(...)
        char.charCodeAt(...)
        return Deno.writeFileSync(...)

    # @origin src/state.ts:694
    def createDirectory(self, path: str, recursive: Any) -> bool:
        return Deno.mkdirSync(...)

    # @origin src/state.ts:699
    def getMetadata(self, path: str) -> Any:
        ...

    # @origin src/state.ts:716
    def readDirectory(self, path: str) -> Any:
        ...

    # @origin src/state.ts:724
    def remove(self, path: str, recursive: Any, force: Any) -> bool:
        return Deno.removeSync(...)

    # @origin src/state.ts:730
    def copy(self, sourcePath: str, destinationPath: str) -> bool:
        return Deno.copyFileSync(...)

    # @origin src/state.ts:735
    def watch(self, path: str, watchId: str) -> str:
        self.state.fsWatches.set(...)
        return self.pushNotification(...)

    # @origin src/state.ts:744
    def unwatch(self, watchId: str) -> bool:
        return self.state.fsWatches.delete(...)

    # @origin src/state.ts:748
    def commandExec(self, command: list[str], cwd: str) -> Any:
        ...

    # @origin src/state.ts:765
    def emitCommandExecOutputDelta(self, processId: str, stream: stdout | stderr, deltaBase64: str, capReached: Any) -> None:
        self.pushNotification(...)

    # @origin src/state.ts:777
    def commandExecWrite(self, _processId: str) -> bool:
        ...

    # @origin src/state.ts:781
    def commandExecTerminate(self, _processId: str) -> bool:
        ...

    # @origin src/state.ts:785
    def commandExecResize(self, _processId: str) -> bool:
        ...

    # @origin src/state.ts:789
    def spawnProcess(self, command: list[str], cwd: str, processHandle: str) -> Any:
        ...

    # @origin src/state.ts:848
    def emitThreadTokenUsage(self, threadId: str, turnId: str, totalTokens: Any) -> None:
        self.pushNotification(...)

    # @origin src/state.ts:875
    def emitMcpServerStartupStatus(self, name: str, status: starting | failed | ready, error: str | None) -> None:
        self.pushNotification(...)

    # @origin src/state.ts:886
    def emitAccountRateLimitsUpdated(self, planType: str | None) -> None:
        self.pushNotification(...)

    # @origin src/state.ts:903
    def emitAccountUpdated(self, planType: str | None) -> None:
        self.pushNotification(...)

    # @origin src/state.ts:913
    def emitAppListUpdated(self) -> None:
        self.pushNotification(...)

    # @origin src/state.ts:917
    def writeProcessStdin(self, _processHandle: str) -> bool:
        ...

    # @origin src/state.ts:921
    def killProcess(self, processHandle: str) -> bool:
        return self.state.processes.delete(...)

    # @origin src/state.ts:925
    def resizeProcess(self, _processHandle: str) -> bool:
        ...

    # @origin src/state.ts:929
    def emitUserInputRequest(self, threadId: str, turnId: str, itemId: str) -> None:
        self.pushNotification(...)

    # @origin src/state.ts:955
    def emitMcpElicitationRequest(self, threadId: str, turnId: str | None, serverName: str) -> None:
        self.pushNotification(...)
        crypto.randomUUID(...)

    # @origin src/state.ts:977
    def resetMemory(self) -> bool:
        self.pushNotification(...)
        self.state.threads.clear(...)
        self.state.goals.clear(...)
        self.state.loadedThreadIds.clear(...)
        self.state.turns.clear(...)
        self.state.archivedThreadIds.clear(...)
        self.state.elicitationCounts.clear(...)
        self.state.subscribedThreadIds.clear(...)
        self.state.fsWatches.clear(...)
        self.state.processes.clear(...)
        return self.state.agentStatuses.clear(...)

    # @origin src/state.ts:992
    def forkThread(self, input: Any) -> Thread | None:
        self.state.threads.get(...)
        crypto.randomUUID(...)
        newThread(...)
        now(...)
        threadSpawnSource(...)
        self.state.threads.set(...)
        self.state.loadedThreadIds.add(...)
        self.state.turns.set(...)
        self.state.archivedThreadIds.delete(...)
        self.pushNotification(...)
        threadSpawnAgentPath(...)
        self.appendSyntheticTurn(...)
        self.getTurns(...)
        return publicThread(...)

    # @origin src/state.ts:1072
    def resolveAgent(self, parentThreadId: str, target: str) -> Thread | None:
        self.state.threads.get(...)
        self.rootThreadId(...)
        self.resolveAgentPath(...)
        normalizeAgentPath(...)
        target.trim(...)
        trimmedTarget.startsWith(...)
        self.state.threads.values(...)
        find(...)
        threadSpawnAgentPath(...)
        return threadSpawnParentThreadId(...)

    # @origin src/state.ts:1094
    def rootThreadId(self, threadId: str) -> str:
        seen.has(...)
        seen.add(...)
        self.state.threads.get(...)
        threadSpawnParentThreadId(...)
        return self.state.threads.has(...)

    # @origin src/state.ts:1107
    def resolveAgentPath(self, parentThreadId: str, target: str) -> str:
        self.state.threads.get(...)
        threadSpawnAgentPath(...)
        target.trim(...)
        trimmed.startsWith(...)
        normalizeAgentPath(...)
        parentPath.replace(...)
        return trimmed.replace(...)

    # @origin src/state.ts:1115
    def listChildAgents(self, parentThreadId: str, pathPrefix: str | None) -> list[Thread]:
        self.rootThreadId(...)
        self.resolveAgentPath(...)
        self.state.threads.values(...)
        filter(...)
        threadSpawnParentThreadId(...)
        threadSpawnAgentPath(...)
        agentPath.startsWith(...)
        return sort(...)

    # @origin src/state.ts:1129
    def callMultiAgentTool(self, input: Any) -> MultiAgentToolResult | None:
        isMultiAgentNamespace(...)
        self.state.threads.get(...)
        stringifyToolOutput(...)
        asRecord(...)
        textArg(...)
        crypto.randomUUID(...)
        slice(...)
        message.trim(...)
        childAgentPath(...)
        self.forkThread(...)
        self.state.agentStatuses.set(...)
        self.appendSyntheticTurn(...)
        isMultiAgentV1Namespace(...)
        self.listChildAgents(...)
        map(...)
        self.state.agentStatuses.get(...)
        threadSpawnAgentPath(...)
        threadLastTaskMessage(...)
        self.resolveAgent(...)
        return find(...)

    # @origin src/state.ts:1322
    def completeAgent(self, threadId: str, message: str | None) -> None:
        self.state.threads.get(...)
        self.state.agentStatuses.set(...)
        self.appendSyntheticTurn(...)
        crypto.randomUUID(...)

    # @origin src/state.ts:1334
    def errorAgent(self, threadId: str, message: str) -> None:
        self.state.threads.has(...)
        self.state.agentStatuses.set(...)

    # @origin src/state.ts:1339
    def emitWarning(self, message: str, threadId: str) -> None:
        self.pushNotification(...)

    # @origin src/state.ts:1346
    def emitDeprecationNotice(self, summary: str, details: str) -> None:
        self.pushNotification(...)

    # @origin src/state.ts:1353
    def emitConfigWarning(self, summary: str, path: str, details: str) -> None:
        self.pushNotification(...)

    # @origin src/state.ts:1360
    def emitGuardianWarning(self, message: str, threadId: str) -> None:
        self.pushNotification(...)

    # @origin src/state.ts:1367
    def emitMcpServerStatus(self, name: str, status: starting | failed | ready, error: str | None) -> None:
        self.pushNotification(...)

    # @origin src/state.ts:1378
    def emitServerRequestResolved(self, threadId: str, requestId: str) -> None:
        self.pushNotification(...)

    # @origin src/state.ts:1385
    def emitExternalAgentConfigImportCompleted(self) -> None:
        self.pushNotification(...)

    # @origin src/state.ts:1389
    def emitFuzzySearchUpdated(self, sessionId: str, query: str) -> None:
        self.pushNotification(...)

    # @origin src/state.ts:1396
    def emitFuzzySearchCompleted(self, sessionId: str) -> None:
        self.pushNotification(...)

    # @origin src/state.ts:1400
    def emitWindowsWorldWritableWarning(self) -> None:
        self.pushNotification(...)

    # @origin src/state.ts:1407
    def emitWindowsSandboxSetupCompleted(self, mode: elevated | unelevated) -> None:
        self.pushNotification(...)

    # @origin src/state.ts:1414
    def emitRealtimeStarted(self, threadId: str, version: str) -> None:
        self.pushNotification(...)
        crypto.randomUUID(...)

    # @origin src/state.ts:1421
    def emitRealtimeItemAdded(self, threadId: str, item: Any) -> None:
        self.pushNotification(...)

    # @origin src/state.ts:1428
    def emitRealtimeTranscriptDelta(self, threadId: str, role: str, delta: str) -> None:
        self.pushNotification(...)

    # @origin src/state.ts:1435
    def emitRealtimeTranscriptDone(self, threadId: str, role: str, text: str) -> None:
        self.pushNotification(...)

    # @origin src/state.ts:1442
    def emitRealtimeOutputAudioDelta(self, threadId: str, audio: str) -> None:
        self.pushNotification(...)

    # @origin src/state.ts:1449
    def emitRealtimeSdp(self, threadId: str, sdp: str) -> None:
        self.pushNotification(...)

    # @origin src/state.ts:1456
    def emitRealtimeError(self, threadId: str, error: str) -> None:
        self.pushNotification(...)

    # @origin src/state.ts:1463
    def emitRealtimeClosed(self, threadId: str) -> None:
        self.pushNotification(...)

# @origin src/state.ts:60
def threadSpawnSource(input: Any) -> Thread[source]:
    ...

# @origin src/state.ts:82
def threadSpawnPayload(thread: Thread) -> dict[str, Any] | None:
    ...

# @origin src/state.ts:94
def threadSpawnParentThreadId(thread: Thread) -> str | None:
    return threadSpawnPayload(...)

# @origin src/state.ts:101
def threadSpawnAgentPath(thread: Thread) -> str | None:
    return threadSpawnPayload(...)

# @origin src/state.ts:107
def threadLastTaskMessage(thread: Thread) -> str | None:
    return threadSpawnPayload(...)

# @origin src/state.ts:113
def normalizeAgentPath(path: str) -> str:
    path.trim(...)
    return trimmed.startsWith(...)

# @origin src/state.ts:119
def safeTaskName(value: str) -> str:
    value.trim(...)
    replace(...)
    normalizeAgentPath(...)
    crypto.randomUUID(...)
    return slice(...)

# @origin src/state.ts:124
def childAgentPath(parent: Thread, taskName: str) -> str:
    taskName.trim(...)
    replace(...)
    crypto.randomUUID(...)
    slice(...)
    cleaned.startsWith(...)
    normalizeAgentPath(...)
    threadSpawnAgentPath(...)
    parentPath.replace(...)
    return cleaned.replace(...)

# @origin src/state.ts:133
def isMultiAgentNamespace(namespace: str | None | None) -> bool:
    ...

# @origin src/state.ts:138
def isMultiAgentV1Namespace(namespace: str | None | None) -> bool:
    ...

# @origin src/state.ts:142
def stringifyToolOutput(value: Any) -> MultiAgentToolResult:
    return JSON.stringify(...)

# @origin src/state.ts:149
def asRecord(value: Any) -> dict[str, Any]:
    return Array.isArray(...)

# @origin src/state.ts:155
def textArg(args: dict[str, Any], key: str) -> str | None:
    ...

# @origin src/state.ts:34
def now() -> Any:
    Math.floor(...)
    return Date.now(...)

# @origin src/state.ts:36
def newThread(id: str, cwd: str, modelProvider: str, model: str) -> Thread:
    return now(...)

# @origin src/state.ts:160
def cloneThread(thread: Thread, turns: list[ThreadTurn]) -> Thread:
    ...

# @origin src/state.ts:165
def publicThread(thread: Thread, turns: list[ThreadTurn], includeTurns: Any) -> Thread:
    ...

def newTurn(items: list[Any], collaborationModeKind: str | None, status: ThreadTurn[status]) -> ThreadTurn:
    now(...)
    return crypto.randomUUID(...)
