from __future__ import annotations

class McpProcessClient:
    # @origin src/mcp.ts:166
    def __init__(self, child: Deno.ChildProcess) -> None:
        self.child = child
        child.stdin.getWriter(...)
        child.stdout.getReader(...)
        Response(...)
        text(...)

    # @origin src/mcp.ts:172
    async def request(self, id: float, method: str, params: Any) -> Any:
        await self.writer.write(...)
        await self.readResponse(...)
        TextEncoder(...)
        encode(...)
        return JSON.stringify(...)
        raise Error(...)

    # @origin src/mcp.ts:183
    async def notify(self, method: str, params: Any) -> None:
        await self.writer.write(...)
        TextEncoder(...)
        encode(...)
        JSON.stringify(...)

    # @origin src/mcp.ts:189
    async def readResponse(self, id: float) -> McpRpcResponse:
        await Promise.race(...)
        await self.stderrSnapshot(...)
        Date.now(...)
        self.takeResponse(...)
        Math.max(...)
        self.stdoutReader.read(...)
        setTimeout(...)
        resolve(...)
        TextDecoder(...)
        decode(...)
        return trim(...)
        raise Error(...)

    # @origin src/mcp.ts:207
    def takeResponse(self, id: float) -> McpRpcResponse | None:
        self.buffer.indexOf(...)
        self.buffer.slice(...)
        trim(...)
        safeJsonParse(...)
        return isRecord(...)

    # @origin src/mcp.ts:221
    async def stderrSnapshot(self) -> str:
        await Promise.race(...)
        setTimeout(...)
        return resolve(...)

    # @origin src/mcp.ts:228
    async def close(self) -> None:
        await self.writer.close(...)
        await Promise.race(...)
        self.child.kill(...)
        setTimeout(...)

# @origin src/mcp.ts:44
def setCodexMcpServerDiscoveryForTests(discovery: Any) -> None:
    ...

# @origin src/mcp.ts:50
def normalizeAuthStatus(value: Any) -> str:
    ...

# @origin src/mcp.ts:54
def isRecord(value: Any) -> value is dict[str, Any]:
    return Array.isArray(...)

# @origin src/mcp.ts:58
def asObjectMap(value: Any) -> dict[str, Any]:
    return isRecord(...)

# @origin src/mcp.ts:62
def asArray(value: Any) -> list[Any]:
    return Array.isArray(...)

# @origin src/mcp.ts:66
def safeJsonParse(text: str) -> Any:
    return JSON.parse(...)

# @origin src/mcp.ts:74
async def runJsonCommand(command: str, args: list[str]) -> Any:
    Deno.Command(...)
    output(...)
    TextDecoder(...)
    decode(...)
    trim(...)
    args.join(...)
    return JSON.parse(...)
    raise Error(...)

# @origin src/mcp.ts:83
async def discoverCodexMcpServers() -> list[CodexMcpServer]:
    await codexMcpServerDiscoveryOverride(...)
    await runJsonCommand(...)
    Array.isArray(...)
    parsed.flatMap(...)
    return isRecord(...)

# @origin src/mcp.ts:93
def enabledStdioServers(servers: list[CodexMcpServer]) -> list[CodexMcpServer]:
    return servers.filter(...)

# @origin src/mcp.ts:102
def toolMapFromList(result: Any) -> dict[str, Any]:
    asArray(...)
    asObjectMap(...)
    return isRecord(...)

# @origin src/mcp.ts:112
def safeResponsesToolName(name: str) -> str:
    name.trim(...)
    replace(...)
    return slice(...)

# @origin src/mcp.ts:117
def resolveMcpToolName(requestedName: str, tools: dict[str, Any]) -> str:
    safeResponsesToolName(...)
    Object.keys(...)
    return filter(...)

# @origin src/mcp.ts:126
def buildCommandEnv(transport: McpTransport) -> dict[str, str] | None:
    return Object.entries(...)

# @origin src/mcp.ts:136
async def withMcpProcess(server: CodexMcpServer, callback: (client McpProcessClient)) -> T:
    await callback(...)
    await client.close(...)
    Deno.Command(...)
    Array.isArray(...)
    buildCommandEnv(...)
    spawn(...)
    return McpProcessClient(...)
    raise Error(...)

# @origin src/mcp.ts:252
async def initialize(client: McpProcessClient) -> Any:
    await client.request(...)
    await client.notify(...)

# @origin src/mcp.ts:262
async def statusForServer(server: CodexMcpServer, detail: str) -> McpServerStatus:
    await withMcpProcess(...)
    await initialize(...)
    await client.request(...)
    async_(...)
    asObjectMap(...)
    toolMapFromList(...)
    asArray(...)
    return normalizeAuthStatus(...)

# @origin src/mcp.ts:293
def paginate(items: list[T], options: McpListOptions) -> Any:
    ...

# @origin src/mcp.ts:310
async def listMcpServerStatus(options: McpListOptions) -> Any:
    ...

# @origin src/mcp.ts:322
async def findServer(serverName: str) -> CodexMcpServer:
    await discoverCodexMcpServers(...)
    enabledStdioServers(...)
    return servers.find(...)
    raise Error(...)

# @origin src/mcp.ts:329
async def readMcpResource(serverName: str, uri: str) -> Any:
    await findServer(...)
    await withMcpProcess(...)
    await initialize(...)
    await client.request(...)
    return async_(...)

# @origin src/mcp.ts:337
def normalizeMcpToolCallResult(result: Any) -> dict[str, Any]:
    asObjectMap(...)
    return Array.isArray(...)

# @origin src/mcp.ts:355
async def callMcpTool(serverName: str, toolName: str, args: Any, meta: Any, threadId: str) -> Any:
    await findServer(...)
    await withMcpProcess(...)
    await initialize(...)
    await client.request(...)
    isRecord(...)
    async_(...)
    toolMapFromList(...)
    resolveMcpToolName(...)
    return normalizeMcpToolCallResult(...)
