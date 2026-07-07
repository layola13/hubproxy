type McpTransport = {
  type?: string;
  command?: string;
  args?: string[] | null;
  env?: Record<string, string> | null;
  cwd?: string | null;
};

type CodexMcpServer = {
  name: string;
  enabled?: boolean;
  disabled_reason?: string | null;
  transport?: McpTransport | null;
  auth_status?: string | null;
};

type McpRpcResponse = {
  id?: number | string | null;
  result?: unknown;
  error?: unknown;
};

export type McpServerStatus = {
  name: string;
  serverInfo: unknown | null;
  tools: Record<string, unknown>;
  resources: unknown[];
  resourceTemplates: unknown[];
  authStatus: string;
};

export type McpListOptions = {
  cursor?: string | null;
  limit?: number | null;
  detail?: string | null;
};

const MCP_TIMEOUT_MS = 10_000;

let codexMcpServerDiscoveryOverride:
  | (() => Promise<CodexMcpServer[]> | CodexMcpServer[])
  | null = null;

export function setCodexMcpServerDiscoveryForTests(
  discovery: (() => Promise<CodexMcpServer[]> | CodexMcpServer[]) | null,
): void {
  codexMcpServerDiscoveryOverride = discovery;
}

function normalizeAuthStatus(value: unknown): string {
  return typeof value === 'string' && value ? value : 'unsupported';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function asObjectMap(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function runJsonCommand(command: string, args: string[]): Promise<unknown> {
  const output = await new Deno.Command(command, { args }).output();
  if (!output.success) {
    const stderr = new TextDecoder().decode(output.stderr).trim();
    throw new Error(stderr || `${command} ${args.join(' ')} failed`);
  }
  return JSON.parse(new TextDecoder().decode(output.stdout));
}

export async function discoverCodexMcpServers(): Promise<CodexMcpServer[]> {
  if (codexMcpServerDiscoveryOverride) return await codexMcpServerDiscoveryOverride();
  const parsed = await runJsonCommand('codex', ['mcp', 'list', '--json']);
  if (!Array.isArray(parsed)) return [];
  return parsed.flatMap((item) => {
    if (!isRecord(item) || typeof item.name !== 'string') return [];
    return [item as CodexMcpServer];
  });
}

function enabledStdioServers(servers: CodexMcpServer[]): CodexMcpServer[] {
  return servers.filter((server) => {
    if (server.enabled === false) return false;
    const transport = server.transport;
    return transport?.type === 'stdio' && typeof transport.command === 'string' &&
      transport.command.length > 0;
  });
}

function toolMapFromList(result: unknown): Record<string, unknown> {
  const tools = asArray(asObjectMap(result).tools);
  const out: Record<string, unknown> = {};
  for (const tool of tools) {
    if (!isRecord(tool) || typeof tool.name !== 'string') continue;
    out[tool.name] = tool;
  }
  return out;
}

function safeResponsesToolName(name: string): string {
  return name.trim().replace(/[^A-Za-z0-9_-]+/g, '_').replace(/-/g, '_').replace(/^_+|_+$/g, '')
    .slice(0, 64);
}

function resolveMcpToolName(requestedName: string, tools: Record<string, unknown>): string {
  if (tools[requestedName]) return requestedName;
  const requestedSafeName = safeResponsesToolName(requestedName);
  const matches = Object.keys(tools).filter((name) =>
    safeResponsesToolName(name) === requestedSafeName
  );
  return matches.length === 1 ? matches[0] : requestedName;
}

function buildCommandEnv(transport: McpTransport): Record<string, string> | undefined {
  const env = transport.env;
  if (!env || typeof env !== 'object') return undefined;
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (typeof value === 'string') out[key] = value;
  }
  return out;
}

async function withMcpProcess<T>(
  server: CodexMcpServer,
  callback: (client: McpProcessClient) => Promise<T>,
): Promise<T> {
  const transport = server.transport;
  if (!transport?.command) throw new Error(`MCP server ${server.name} is not stdio`);

  const child = new Deno.Command(transport.command, {
    args: Array.isArray(transport.args) ? transport.args : [],
    cwd: typeof transport.cwd === 'string' ? transport.cwd : undefined,
    env: buildCommandEnv(transport),
    stdin: 'piped',
    stdout: 'piped',
    stderr: 'piped',
  }).spawn();
  const client = new McpProcessClient(child);
  try {
    return await callback(client);
  } finally {
    await client.close();
  }
}

class McpProcessClient {
  private writer: WritableStreamDefaultWriter<Uint8Array>;
  private stdoutReader: ReadableStreamDefaultReader<Uint8Array>;
  private stderrPromise: Promise<string>;
  private buffer = '';
  private closed = false;

  constructor(private child: Deno.ChildProcess) {
    this.writer = child.stdin.getWriter();
    this.stdoutReader = child.stdout.getReader();
    this.stderrPromise = new Response(child.stderr).text().catch(() => '');
  }

  async request(id: number, method: string, params?: unknown): Promise<unknown> {
    const payload: Record<string, unknown> = { jsonrpc: '2.0', id, method };
    if (params !== undefined) payload.params = params;
    await this.writer.write(new TextEncoder().encode(`${JSON.stringify(payload)}\n`));
    const response = await this.readResponse(id);
    if (response.error !== undefined) {
      throw new Error(JSON.stringify(response.error));
    }
    return response.result;
  }

  async notify(method: string, params?: unknown): Promise<void> {
    const payload: Record<string, unknown> = { jsonrpc: '2.0', method };
    if (params !== undefined) payload.params = params;
    await this.writer.write(new TextEncoder().encode(`${JSON.stringify(payload)}\n`));
  }

  private async readResponse(id: number): Promise<McpRpcResponse> {
    const deadline = Date.now() + MCP_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const existing = this.takeResponse(id);
      if (existing) return existing;
      const remaining = Math.max(1, deadline - Date.now());
      const read = await Promise.race([
        this.stdoutReader.read(),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), remaining)),
      ]);
      if (read === null) break;
      if (read.done) break;
      this.buffer += new TextDecoder().decode(read.value, { stream: true });
    }
    const stderr = (await this.stderrSnapshot()).trim();
    throw new Error(stderr ? `MCP response timeout: ${stderr}` : 'MCP response timeout');
  }

  private takeResponse(id: number): McpRpcResponse | null {
    while (true) {
      const newline = this.buffer.indexOf('\n');
      if (newline < 0) return null;
      const line = this.buffer.slice(0, newline).trim();
      this.buffer = this.buffer.slice(newline + 1);
      if (!line) continue;
      const parsed = safeJsonParse(line);
      if (!isRecord(parsed)) continue;
      if (parsed.id !== id) continue;
      return parsed as McpRpcResponse;
    }
  }

  private async stderrSnapshot(): Promise<string> {
    return await Promise.race([
      this.stderrPromise,
      new Promise<string>((resolve) => setTimeout(() => resolve(''), 25)),
    ]);
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    try {
      await this.writer.close();
    } catch {
      // Child may already have exited.
    }
    try {
      this.child.kill('SIGTERM');
    } catch {
      // Child may already have exited.
    }
    try {
      await Promise.race([
        this.child.status,
        new Promise<void>((resolve) => setTimeout(resolve, 1_000)),
      ]);
    } catch {
      // Ignore shutdown races.
    }
  }
}

async function initialize(client: McpProcessClient): Promise<unknown> {
  const result = await client.request(1, 'initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'hubproxy-deno', version: '0.1.0' },
  });
  await client.notify('notifications/initialized');
  return result;
}

async function statusForServer(server: CodexMcpServer, detail: string): Promise<McpServerStatus> {
  return await withMcpProcess(server, async (client) => {
    const init = asObjectMap(await initialize(client));
    const tools = toolMapFromList(await client.request(2, 'tools/list', {}));
    let resources: unknown[] = [];
    let resourceTemplates: unknown[] = [];
    if (detail !== 'toolsAndAuthOnly') {
      try {
        resources = asArray(asObjectMap(await client.request(3, 'resources/list', {})).resources);
      } catch {
        resources = [];
      }
      try {
        resourceTemplates = asArray(
          asObjectMap(await client.request(4, 'resources/templates/list', {})).resourceTemplates,
        );
      } catch {
        resourceTemplates = [];
      }
    }
    return {
      name: server.name,
      serverInfo: init.serverInfo ?? null,
      tools,
      resources,
      resourceTemplates,
      authStatus: normalizeAuthStatus(server.auth_status),
    };
  });
}

function paginate<T>(
  items: T[],
  options: McpListOptions,
): { data: T[]; nextCursor: string | null } {
  const start = options.cursor ? Number(options.cursor) : 0;
  if (!Number.isInteger(start) || start < 0 || start > items.length) {
    throw new Error(`invalid cursor: ${options.cursor}`);
  }
  const requestedLimit = options.limit ?? items.length;
  const limit = Math.max(1, Math.min(items.length || 1, requestedLimit));
  const end = Math.min(items.length, start + limit);
  return {
    data: items.slice(start, end),
    nextCursor: end < items.length ? String(end) : null,
  };
}

export async function listMcpServerStatus(options: McpListOptions = {}): Promise<{
  data: McpServerStatus[];
  nextCursor: string | null;
}> {
  const detail = options.detail === 'toolsAndAuthOnly' ? 'toolsAndAuthOnly' : 'full';
  const servers = enabledStdioServers(await discoverCodexMcpServers())
    .sort((left, right) => left.name.localeCompare(right.name));
  const { data: pageServers, nextCursor } = paginate(servers, options);
  const data = await Promise.all(pageServers.map((server) => statusForServer(server, detail)));
  return { data, nextCursor };
}

async function findServer(serverName: string): Promise<CodexMcpServer> {
  const servers = enabledStdioServers(await discoverCodexMcpServers());
  const found = servers.find((server) => server.name === serverName);
  if (!found) throw new Error(`MCP server not found: ${serverName}`);
  return found;
}

export async function readMcpResource(serverName: string, uri: string): Promise<unknown> {
  const server = await findServer(serverName);
  return await withMcpProcess(server, async (client) => {
    await initialize(client);
    return await client.request(2, 'resources/read', { uri });
  });
}

function normalizeMcpToolCallResult(result: unknown): Record<string, unknown> {
  const record = asObjectMap(result);
  const structuredContent = record.structuredContent ?? record.structured_content ?? null;
  const isError = typeof record.isError === 'boolean'
    ? record.isError
    : typeof record.is_error === 'boolean'
    ? record.is_error
    : false;
  const out: Record<string, unknown> = {
    content: Array.isArray(record.content) ? record.content : [],
    structuredContent,
    isError,
  };
  const meta = record._meta ?? record.meta;
  if (meta !== undefined) out._meta = meta;
  return out;
}

export async function callMcpTool(
  serverName: string,
  toolName: string,
  args: unknown,
  meta: unknown,
  threadId: string,
): Promise<unknown> {
  const server = await findServer(serverName);
  const mergedMeta = isRecord(meta) ? { ...meta, threadId } : { threadId };
  return await withMcpProcess(server, async (client) => {
    await initialize(client);
    const tools = toolMapFromList(await client.request(2, 'tools/list', {}));
    const resolvedToolName = resolveMcpToolName(toolName, tools);
    const result = await client.request(3, 'tools/call', {
      name: resolvedToolName,
      arguments: isRecord(args) ? args : {},
      _meta: mergedMeta,
    });
    return normalizeMcpToolCallResult(result);
  });
}
