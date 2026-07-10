import type {
  JsonObject,
  ProxyConfig,
  ResponsesEvent,
  ResponsesInputItem,
  ResponsesScenario,
  ResponsesToolKind,
  ResponsesToolOutputKind,
} from './types.ts';
import { listMcpServerStatus } from './mcp.ts';

export type ProxyTurnContext = {
  collaborationModeKind?: string | null;
};

type ContextWindowState = {
  enabled: boolean;
  maxTokens: number;
  thresholdPercent: number;
  thresholdTokens: number;
};

type McpToolDiscovery = () => Promise<unknown[]>;

const COLLABORATION_NAMESPACE_TOOL: Record<string, unknown> = {
  type: 'namespace',
  name: 'collaboration',
  description: 'Tools for spawning and coordinating sub-agents in the current thread tree.',
  tools: [
    {
      type: 'function',
      name: 'spawn_agent',
      description: 'Spawns an agent to work on the specified task.',
      strict: false,
      parameters: {
        type: 'object',
        properties: {
          task_name: {
            type: 'string',
            description:
              'Task name for the new agent. Use lowercase letters, digits, and underscores.',
          },
          message: {
            type: 'string',
            description: 'Initial task message for the new agent.',
          },
          agent_type: {
            type: 'string',
            description: 'Optional agent type or role for the new agent.',
          },
          model: {
            type: 'string',
            description: 'Optional model override for the agent.',
          },
        },
        required: ['task_name', 'message'],
        additionalProperties: false,
      },
    },
    {
      type: 'function',
      name: 'send_message',
      description: 'Send a message to an existing agent. The message will be delivered promptly.',
      strict: false,
      parameters: {
        type: 'object',
        properties: {
          target: {
            type: 'string',
            description: 'Relative or canonical task name to message.',
          },
          message: {
            type: 'string',
            description: 'Message text to queue on the target agent.',
          },
        },
        required: ['target', 'message'],
        additionalProperties: false,
      },
    },
    {
      type: 'function',
      name: 'followup_task',
      description: 'Send a follow-up task to an existing agent.',
      strict: false,
      parameters: {
        type: 'object',
        properties: {
          target: {
            type: 'string',
            description: 'Agent id or canonical task name to send a follow-up task to.',
          },
          message: {
            type: 'string',
            description: 'Follow-up task text for the target agent.',
          },
        },
        required: ['target', 'message'],
        additionalProperties: false,
      },
    },
    {
      type: 'function',
      name: 'wait_agent',
      description: 'Wait for a mailbox update from any live agent.',
      strict: false,
      parameters: {
        type: 'object',
        properties: {
          timeout_ms: {
            type: 'number',
            description: 'Maximum time to wait in milliseconds.',
          },
        },
        additionalProperties: false,
      },
    },
    {
      type: 'function',
      name: 'interrupt_agent',
      description: 'Interrupt an agent current turn, if any, and return its previous status.',
      strict: false,
      parameters: {
        type: 'object',
        properties: {
          target: {
            type: 'string',
            description: 'Agent id or canonical task name to interrupt.',
          },
        },
        required: ['target'],
        additionalProperties: false,
      },
    },
    {
      type: 'function',
      name: 'list_agents',
      description: 'List live agents in the current root thread tree.',
      strict: false,
      parameters: {
        type: 'object',
        properties: {
          path_prefix: {
            type: 'string',
            description:
              'Task-path prefix filter without a trailing slash. Omit to list all live agents.',
          },
        },
        additionalProperties: false,
      },
    },
  ],
};

const forwardHeaders = (headers: Headers, apiKey: string, localAuthToken: string | null) => {
  const out = new Headers(headers);
  // Never let client auth headers reach the upstream.
  out.delete('authorization');
  out.delete('x-api-key');
  out.delete('api-key');
  out.delete('content-length');
  out.delete('connection');
  out.delete('host');
  if (apiKey) {
    out.set('authorization', `Bearer ${apiKey}`);
    out.set('x-api-key', apiKey);
  } else {
    out.delete('authorization');
    out.delete('x-api-key');
  }
  return out;
};

const apiKeyRotationIndexes = new WeakMap<ProxyConfig, number>();
let requestIntervalGate: Promise<void> = Promise.resolve();
let nextUpstreamRequestAt = 0;
let cachedGlmRuntimeKey: string | null = null;
let glmKeyRefreshPromise: Promise<string | null> | null = null;
let glmKeyRefreshTimer: number | null = null;

function normalizeRuntimeKey(raw: string): string {
  return raw.trim().replace(/,+$/, '').trim();
}

function isExactGlmBabelChannel(config: ProxyConfig): boolean {
  return config.chatBaseUrl.trim().toLowerCase() === 'https://api.babel.town/v1';
}

function isGlmKeyRefreshEnabled(config: ProxyConfig): boolean {
  if (!config.glmTryGetKey) return false;
  return isExactGlmBabelChannel(config);
}

function scheduleGlmKeyRefresh(config: ProxyConfig): void {
  if (!isGlmKeyRefreshEnabled(config)) return;
  if (glmKeyRefreshTimer !== null) return;
  const intervalMs = Math.max(60_000, config.glmKeyRefreshIntervalMs || 0);
  glmKeyRefreshTimer = setInterval(() => {
    void refreshGlmKeyIfNeeded(config);
  }, intervalMs) as unknown as number;
}

function glmKeyFetchBackoffDelayMs(config: ProxyConfig, attempt: number): number {
  if (attempt <= 0) return 0;
  const baseDelayMs = Math.max(0, config.glmKeyFetchRetryDelayMs || 0);
  const step = Math.max(0, attempt - 1) * 5000;
  return Math.min(60_000, baseDelayMs + step);
}

function glmDotenvPath(): string {
  return Deno.env.get('DOTENV_PATH') ?? '.env';
}

function readGlmRuntimeKeyFromDotenv(path: string): string | null {
  try {
    const text = Deno.readTextFileSync(path);
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq <= 0) continue;
      const key = line.slice(0, eq).trim();
      if (key !== 'OPENAI_API_KEY') continue;
      const value = normalizeRuntimeKey(line.slice(eq + 1));
      return value || null;
    }
  } catch {
    // Ignore read errors and fall back to in-memory keys.
  }
  return null;
}

function currentGlmRuntimeKey(config: ProxyConfig): string | null {
  if (!config.glmTryGetKey || !isExactGlmBabelChannel(config)) return null;
  const envKey = normalizeRuntimeKey(Deno.env.get('OPENAI_API_KEY') ?? '');
  if (envKey) {
    cachedGlmRuntimeKey = envKey;
    return envKey;
  }
  const dotenvKey = readGlmRuntimeKeyFromDotenv(glmDotenvPath());
  if (dotenvKey) {
    cachedGlmRuntimeKey = dotenvKey;
    return dotenvKey;
  }
  return cachedGlmRuntimeKey;
}

function writeGlmRuntimeKeyToDotenv(path: string, apiKey: string): void {
  const normalizedKey = normalizeRuntimeKey(apiKey);
  const text = Deno.readTextFileSync(path);
  const lines = text.split(/\r?\n/);
  let updated = false;
  const nextLines = lines.map((rawLine) => {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) return rawLine;
    const eq = rawLine.indexOf('=');
    if (eq <= 0) return rawLine;
    const key = rawLine.slice(0, eq).trim();
    if (key !== 'OPENAI_API_KEY') return rawLine;
    updated = true;
    return `OPENAI_API_KEY=${normalizedKey}`;
  });
  if (!updated) nextLines.push(`OPENAI_API_KEY=${normalizedKey}`);
  Deno.writeTextFileSync(path, `${nextLines.join('\n').replace(/\n+$/, '')}\n`);
}

async function fetchFreshGlmApiKey(config: ProxyConfig): Promise<string | null> {
  if (!isGlmKeyRefreshEnabled(config)) return null;
  let lastStatus = 0;
  let lastBodySnippet = '';
  let apiKey = '';
  const retryCount = Math.max(1, config.glmKeyFetchRetryCount || 0);
  for (let attempt = 1; attempt <= retryCount; attempt++) {
    try {
      const response = await fetch('https://glm.babel.town/api/get_api_key', {
        method: 'GET',
        headers: { 'user-agent': 'Mozilla/5.0', accept: 'application/json' },
      });
      lastStatus = response.status;
      const text = await response.text();
      lastBodySnippet = text.slice(0, 300);
      if (response.ok) {
        const payload = parseJsonBody(text) as Record<string, unknown> | null;
        apiKey = payload && typeof payload.api_key === 'string'
          ? normalizeRuntimeKey(payload.api_key)
          : '';
        if (apiKey) break;
      }
    } catch (error) {
      lastStatus = -1;
      lastBodySnippet = error instanceof Error ? error.message : String(error);
    }
    if (attempt < retryCount) {
      const backoffDelayMs = glmKeyFetchBackoffDelayMs(config, attempt);
      writeUpstreamLog({
        path: 'internal/glm-key-refresh-retry',
        target: config.chatBaseUrl,
        status: lastStatus,
        retryAttempt: attempt,
        delayMs: backoffDelayMs,
        bodySnippet: lastBodySnippet,
      });
      await sleep(backoffDelayMs);
    }
  }
  if (!apiKey) {
    writeUpstreamLog({
      path: 'internal/glm-key-refresh-failed',
      target: config.chatBaseUrl,
      status: lastStatus,
      bodySnippet: lastBodySnippet,
    });
    return null;
  }
  cachedGlmRuntimeKey = apiKey;
  Deno.env.set('OPENAI_API_KEY', apiKey);
  try {
    writeGlmRuntimeKeyToDotenv(glmDotenvPath(), apiKey);
  } catch {
    // Keep runtime key even if dotenv persistence fails.
  }
  writeUpstreamLog({
    path: 'internal/glm-key-refresh-success',
    target: config.chatBaseUrl,
    keyPreview: redactToken(apiKey),
  });
  return apiKey;
}

async function refreshGlmKeyFromErrorResponse(
  response: Response,
  config: ProxyConfig,
): Promise<string | null> {
  if (!(await shouldTriggerImmediateGlmKeyRefresh(response, config))) return null;
  try {
    Deno.env.set('GLM_TRIGGER_KEY_REFRESH', '1');
  } catch {
    // Ignore env write failures.
  }
  writeUpstreamLog({
    path: 'internal/glm-key-refresh-trigger',
    target: config.chatBaseUrl,
    status: response.status,
  });
  return await refreshGlmKeyIfNeeded(config);
}

async function refreshGlmKeyIfNeeded(config: ProxyConfig): Promise<string | null> {
  if (!isGlmKeyRefreshEnabled(config)) return null;
  if (glmKeyRefreshPromise) return await glmKeyRefreshPromise;
  glmKeyRefreshPromise = fetchFreshGlmApiKey(config)
    .catch(() => null)
    .finally(() => {
      glmKeyRefreshPromise = null;
    });
  return await glmKeyRefreshPromise;
}

function nextApiKey(config: ProxyConfig): string {
  const runtimeGlmKey = currentGlmRuntimeKey(config);
  if (runtimeGlmKey) return runtimeGlmKey;
  const keys = Array.isArray(config.apiKeys) && config.apiKeys.length > 0
    ? config.apiKeys
    : config.defaultApiKey
    ? [config.defaultApiKey]
    : [];
  if (keys.length === 0) return '';
  const index = apiKeyRotationIndexes.get(config) ?? 0;
  apiKeyRotationIndexes.set(config, (index + 1) % keys.length);
  return keys[index % keys.length];
}

export function initProxyRuntime(config: ProxyConfig): void {
  scheduleGlmKeyRefresh(config);
}

function abortError(): DOMException {
  return new DOMException('The operation was aborted.', 'AbortError');
}

function throwIfAborted(signal?: AbortSignal | null): void {
  if (signal?.aborted) throw abortError();
}

function sleep(ms: number, signal?: AbortSignal | null): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  throwIfAborted(signal);
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(done, ms);
    const onAbort = () => {
      clearTimeout(timeout);
      reject(abortError());
    };
    function done() {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function retryDelayMs(config: ProxyConfig): number {
  return config.requestIntervalMs > 0 ? config.requestIntervalMs : 10_000;
}

function contextWindowState(config: ProxyConfig): ContextWindowState {
  const maxTokens = config.customContextWindowTokens ?? null;
  const thresholdPercent = config.contextCompactThresholdPercent ?? 90;
  if (!maxTokens || maxTokens <= 0) {
    return {
      enabled: false,
      maxTokens: 0,
      thresholdPercent,
      thresholdTokens: 0,
    };
  }
  return {
    enabled: true,
    maxTokens,
    thresholdPercent,
    thresholdTokens: Math.floor(maxTokens * (thresholdPercent / 100)),
  };
}

async function waitForRequestInterval(ms: number, signal?: AbortSignal | null): Promise<void> {
  if (ms <= 0) return;
  let release!: () => void;
  const previous = requestIntervalGate;
  requestIntervalGate = new Promise((resolve) => {
    release = resolve;
  });
  await previous.catch(() => {});
  try {
    throwIfAborted(signal);
    const waitMs = Math.max(0, nextUpstreamRequestAt - Date.now());
    await sleep(waitMs, signal);
    throwIfAborted(signal);
    nextUpstreamRequestAt = Date.now() + ms;
  } finally {
    release();
  }
}

export function normalizeModelListResponseBody(body: string): string {
  return body;
}

const CLOUDFLARE_MODELS = [
  '@cf/moonshotai/kimi-k2.7-code',
  '@cf/openai/gpt-oss-120b',
  '@cf/moonshotai/kimi-k2.6',
];

function cloudflareModelListResponse(): Response {
  return new Response(
    JSON.stringify({
      object: 'list',
      data: CLOUDFLARE_MODELS.map((id) => ({
        id,
        object: 'model',
        created: 0,
        owned_by: 'cloudflare',
      })),
    }),
    { headers: { 'content-type': 'application/json; charset=utf-8' } },
  );
}

function proxyLogSummary(
  kind: string,
  entry: Record<string, unknown>,
  file: string,
): Record<string, unknown> {
  const body = typeof entry.body === 'string' ? entry.body : undefined;
  return {
    kind,
    file,
    path: entry.path,
    target: entry.target,
    requestPath: entry.requestPath,
    method: entry.method,
    status: entry.status,
    fallback: entry.fallback,
    bodyBytes: body ? new TextEncoder().encode(body).length : 0,
  };
}

function logDirFromEnv(): string | null {
  const value = getEnvOrNull('HUBPROXY_LOG_DIR');
  if (!value) return null;
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function writeModelListLog(entry: Record<string, unknown>): void {
  const logDir = logDirFromEnv();
  const text = JSON.stringify(entry, null, 2) + '\n';
  console.log(text.trimEnd());
  if (!logDir) return;
  try {
    Deno.mkdirSync(logDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const file = `${logDir}/models-${stamp}-${crypto.randomUUID()}.json`;
    Deno.writeTextFileSync(file, text);
  } catch {
    // Logging must never break the proxy path.
  }
}

function redactToken(value: string | null | undefined): string {
  if (!value) return 'none';
  const token = value.startsWith('Bearer ') ? value.slice('Bearer '.length) : value;
  return `${token.slice(0, 3)}...${token.slice(-3)} (len=${token.length})`;
}

function getEnvOrNull(name: string): string | null {
  try {
    return Deno.env.get(name) ?? null;
  } catch {
    return null;
  }
}

function writeUpstreamLog(entry: Record<string, unknown>): void {
  const logDir = logDirFromEnv();
  const text = JSON.stringify(entry, null, 2) + '\n';
  console.log(text.trimEnd());
  if (!logDir) return;
  try {
    Deno.mkdirSync(logDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const file = `${logDir}/upstream-${stamp}-${crypto.randomUUID()}.json`;
    Deno.writeTextFileSync(file, text);
  } catch {
    // Logging must never break the proxy path.
  }
}

function isToolCallType(type: string): type is ResponsesToolKind {
  return (
    type === 'function_call' ||
    type === 'custom_tool_call' ||
    type === 'tool_search_call' ||
    type === 'mcp_tool_call'
  );
}

function outputKindForToolKind(kind: ResponsesToolKind): ResponsesToolOutputKind {
  switch (kind) {
    case 'function_call':
      return 'function_call_output';
    case 'custom_tool_call':
      return 'custom_tool_call_output';
    case 'tool_search_call':
      return 'tool_search_output';
    case 'mcp_tool_call':
      return 'mcp_tool_call_output';
  }
}

function isToolOutputKind(type: string): type is ResponsesToolOutputKind {
  return (
    type === 'function_call_output' ||
    type === 'custom_tool_call_output' ||
    type === 'tool_search_output' ||
    type === 'mcp_tool_call_output'
  );
}

const REASONING_ITEM_TYPES = new Set(['reasoning', 'thinking', 'thought', 'reason']);
const REASONING_TEXT_FIELDS = [
  'reasoning',
  'reasoning_content',
  'thinking',
  'thought',
  'reason',
  'text',
];
const THOUGHT_TAG_PAIRS = [
  { openTag: '<thought>', closeTag: '</thought>' },
  { openTag: '<think>', closeTag: '</think>' },
] as const;
const THOUGHT_TAG_TOKENS = THOUGHT_TAG_PAIRS.flatMap((pair) => [pair.openTag, pair.closeTag]);

function isReasoningType(type: unknown): boolean {
  return typeof type === 'string' && REASONING_ITEM_TYPES.has(type);
}

function isReasoningItem(item: ResponsesInputItem): boolean {
  return isReasoningType(item.type);
}

function normalizeReasoningSummary(
  summary: unknown,
): Array<{ type: 'summary_text'; text: string }> {
  if (typeof summary === 'string') {
    return summary ? [{ type: 'summary_text', text: summary }] : [];
  }
  if (!Array.isArray(summary)) return [];
  return summary.flatMap((part) => {
    if (typeof part === 'string') return part ? [{ type: 'summary_text', text: part }] : [];
    if (!part || typeof part !== 'object') return [];
    const text = typeof (part as { text?: unknown }).text === 'string'
      ? (part as { text: string }).text
      : '';
    if (!text) return [];
    return [{ type: 'summary_text', text }];
  });
}

function normalizeReasoningContent(
  content: unknown,
): Array<{ type: 'reasoning_text'; text: string }> {
  if (typeof content === 'string') {
    return content ? [{ type: 'reasoning_text', text: content }] : [];
  }
  if (!Array.isArray(content)) return [];
  return content.flatMap((part) => {
    if (typeof part === 'string') return part ? [{ type: 'reasoning_text', text: part }] : [];
    if (!part || typeof part !== 'object') return [];
    const text = typeof (part as { text?: unknown }).text === 'string'
      ? (part as { text: string }).text
      : '';
    if (!text) return [];
    return [{ type: 'reasoning_text', text }];
  });
}

function normalizeReasoningTextValue(text: string): string {
  if (!THOUGHT_TAG_TOKENS.some((tag) => text.includes(tag))) return text;
  const split = extractThoughtSegments(text);
  return split.reasoningText || split.visibleText;
}

function extractReasoningTextFromRecord(record: Record<string, unknown>): string {
  const parts: string[] = [];
  const seen = new Set<string>();
  for (const field of REASONING_TEXT_FIELDS) {
    const value = record[field];
    if (typeof value !== 'string') continue;
    const text = normalizeReasoningTextValue(value);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    parts.push(text);
  }
  return parts.join('\n');
}

function extractReasoningDeltaText(record: Record<string, unknown>): string {
  const parts: string[] = [];
  const seen = new Set<string>();
  for (const field of REASONING_TEXT_FIELDS) {
    if (field === 'text') continue;
    const value = record[field];
    if (typeof value !== 'string') continue;
    const text = normalizeReasoningTextValue(value);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    parts.push(text);
  }
  return parts.join('');
}

function mergeReasoningTexts(parts: Array<string | undefined>): string {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const part of parts) {
    if (!part) continue;
    const text = part.trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
  }
  return out.join('\n');
}

function reasoningItemId(): string {
  return `rs_${crypto.randomUUID().replace(/-/g, '')}`;
}

function normalizeReasoningItemPayload(item: Record<string, unknown>): Record<string, unknown> {
  const raw = item as Record<string, unknown>;
  const summary = normalizeReasoningSummary(raw.summary);
  const content = normalizeReasoningContent(raw.content);
  const fallbackText = mergeReasoningTexts([
    extractReasoningTextFromRecord(raw),
    content.map((part) => part.text).join('\n'),
  ]);
  const normalizedSummary = summary.length > 0
    ? summary
    : fallbackText
    ? [{ type: 'summary_text', text: fallbackText }]
    : [];
  const normalized: Record<string, unknown> = {
    ...raw,
    id: typeof raw.id === 'string' ? raw.id : reasoningItemId(),
    type: 'reasoning',
    summary: normalizedSummary,
  };
  if (content.length > 0) {
    normalized.content = content;
  } else if (fallbackText) {
    normalized.content = [{ type: 'reasoning_text', text: fallbackText }];
  }
  if (typeof raw.encrypted_content === 'string') {
    normalized.encrypted_content = raw.encrypted_content;
  }
  return normalized;
}

function normalizeReasoningItem(item: ResponsesInputItem): ResponsesEvent {
  const normalized = normalizeReasoningItemPayload(item as Record<string, unknown>);
  return {
    type: 'response.output_item.done',
    item: normalized,
  };
}

function responseDoneEventForInputItem(item: ResponsesInputItem): ResponsesEvent | null {
  if (isReasoningItem(item)) return normalizeReasoningItem(item);
  if (!isToolOutputKind(item.type)) return null;
  const outputKind = item.type;
  return {
    type: 'response.output_item.done',
    item: {
      ...item,
      output_kind: outputKind,
    },
  };
}

const SERVER_NAME_MAP: Record<string, string> = {
  'Code Index': 'mcp__code_index__',
  'Mimir': 'mcp__mimir__',
  'mimir': 'mcp__mimir__',
  'code_index': 'mcp__code_index__',
  'code-index': 'mcp__code_index__',
};

let mcpToolDiscoveryOverride: McpToolDiscovery | null = null;
let mcpNamespaceToolsCache: Promise<unknown[]> | null = null;

export function setMcpToolDiscoveryForTests(discovery: McpToolDiscovery | null): void {
  mcpToolDiscoveryOverride = discovery;
  mcpNamespaceToolsCache = null;
}

function sanitizeResponsesApiToolName(name: string): string {
  const sanitized = name.trim().replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');
  return sanitized.slice(0, 64);
}

function mcpNamespaceNameForServer(serverName: string): string {
  const mapped = SERVER_NAME_MAP[serverName];
  if (mapped) return mapped;
  const normalized = sanitizeResponsesApiToolName(serverName.toLowerCase().replace(/-/g, '_'));
  return normalized ? `mcp__${normalized}__` : '';
}

function normalizeMcpToolForResponses(
  tool: Record<string, unknown>,
): Record<string, unknown> | null {
  const rawName = typeof tool.name === 'string' ? tool.name : '';
  const name = sanitizeResponsesApiToolName(rawName.replace(/-/g, '_'));
  if (!name) return null;
  const out: Record<string, unknown> = { type: 'function', name };
  const description = typeof tool.description === 'string'
    ? tool.description
    : typeof tool.title === 'string'
    ? tool.title
    : undefined;
  if (description) out.description = description;
  const inputSchema = tool.inputSchema ?? tool.input_schema;
  if (inputSchema && typeof inputSchema === 'object') out.parameters = inputSchema;
  return out;
}

function mcpNamespaceToolsFromStatuses(statuses: unknown[]): unknown[] {
  const namespaces: Record<string, Record<string, unknown>> = {};
  for (const status of statuses) {
    if (!status || typeof status !== 'object') continue;
    const record = status as Record<string, unknown>;
    const serverName = typeof record.name === 'string' ? record.name : '';
    const namespaceName = mcpNamespaceNameForServer(serverName);
    if (!namespaceName) continue;
    const toolsRecord = record.tools && typeof record.tools === 'object'
      ? record.tools as Record<string, unknown>
      : {};
    const tools = Object.values(toolsRecord).flatMap((tool) => {
      if (!tool || typeof tool !== 'object') return [];
      const normalized = normalizeMcpToolForResponses(tool as Record<string, unknown>);
      return normalized ? [normalized] : [];
    });
    if (tools.length === 0) continue;
    const existing = namespaces[namespaceName];
    if (existing) {
      const existingTools = Array.isArray(existing.tools) ? existing.tools : [];
      existing.tools = mergeToolsByName(existingTools, tools, false);
      continue;
    }
    namespaces[namespaceName] = {
      type: 'namespace',
      name: namespaceName,
      description: `Tools from MCP server ${serverName}.`,
      tools,
    };
  }
  return Object.values(namespaces);
}

function toolIdentity(tool: unknown): string {
  if (!tool || typeof tool !== 'object') return '';
  const record = tool as Record<string, unknown>;
  if (record.type === 'namespace' && typeof record.name === 'string') {
    return `namespace:${record.name}`;
  }
  const fn = record.function && typeof record.function === 'object'
    ? record.function as Record<string, unknown>
    : null;
  const name = typeof fn?.name === 'string'
    ? fn.name
    : typeof record.name === 'string'
    ? record.name
    : '';
  return name ? `function:${name}` : '';
}

function mergeNamespaceTools(
  existing: Record<string, unknown>,
  added: Record<string, unknown>,
  replaceExisting: boolean,
): Record<string, unknown> {
  const existingTools = Array.isArray(existing.tools) ? existing.tools : [];
  const addedTools = Array.isArray(added.tools) ? added.tools : [];
  const mergedTools = mergeToolsByName(existingTools, addedTools, replaceExisting);
  return replaceExisting
    ? { ...existing, ...added, tools: mergedTools }
    : { ...added, ...existing, tools: mergedTools };
}

function mergeToolsByName(
  existing: unknown[],
  added: unknown[],
  replaceExisting: boolean,
): unknown[] {
  const out = [...existing];
  const indexes = new Map<string, number>();
  out.forEach((tool, index) => {
    const identity = toolIdentity(tool);
    if (identity) indexes.set(identity, index);
  });
  for (const tool of added) {
    const identity = toolIdentity(tool);
    if (!identity) continue;
    const index = indexes.get(identity);
    if (index === undefined) {
      indexes.set(identity, out.length);
      out.push(tool);
    } else if (replaceExisting) {
      const existingTool = out[index];
      out[index] =
        identity.startsWith('namespace:') && existingTool && typeof existingTool === 'object' &&
          tool && typeof tool === 'object'
          ? mergeNamespaceTools(
            existingTool as Record<string, unknown>,
            tool as Record<string, unknown>,
            true,
          )
          : tool;
    } else if (
      identity.startsWith('namespace:') && out[index] && typeof out[index] === 'object' &&
      tool && typeof tool === 'object'
    ) {
      out[index] = mergeNamespaceTools(
        out[index] as Record<string, unknown>,
        tool as Record<string, unknown>,
        false,
      );
    }
  }
  return out;
}

function appendCollaborationNamespaceToolsForResponses(parsed: Record<string, unknown>): void {
  if (getEnvOrNull('HUBPROXY_COLLABORATION_AUTO_TOOLS') === '0') return;
  const existing = Array.isArray(parsed.tools) ? parsed.tools : [];
  parsed.tools = mergeToolsByName(existing, [COLLABORATION_NAMESPACE_TOOL], false);
}

async function discoverMcpNamespaceTools(): Promise<unknown[]> {
  if (mcpToolDiscoveryOverride) return await mcpToolDiscoveryOverride();
  if (!mcpNamespaceToolsCache) {
    mcpNamespaceToolsCache = listMcpServerStatus({ detail: 'toolsAndAuthOnly' })
      .then((result) => mcpNamespaceToolsFromStatuses(result.data))
      .catch((error) => {
        writeUpstreamLog({
          path: 'internal/mcp-tools-discovery-failed',
          error: error instanceof Error ? error.message : String(error),
        });
        return [];
      });
  }
  return await mcpNamespaceToolsCache;
}

async function appendMcpNamespaceToolsForResponses(
  parsed: Record<string, unknown>,
  config: ProxyConfig,
): Promise<void> {
  if (config.responsesBaseUrl === null) return;
  if (getEnvOrNull('HUBPROXY_MCP_AUTO_TOOLS') === '0') return;
  const mcpTools = await discoverMcpNamespaceTools();
  if (mcpTools.length === 0) return;
  const existing = Array.isArray(parsed.tools) ? parsed.tools : [];
  parsed.tools = mergeToolsByName(existing, mcpTools, false);
}

function robustNormalizeServerName(name: string, namespaces?: Set<string>): string {
  if (SERVER_NAME_MAP[name]) return SERVER_NAME_MAP[name];
  if (/^mcp__[a-z0-9]+(?:_[a-z0-9]+)*$/.test(name)) return name;
  if (/^mcp__[a-z0-9]+(?:_[a-z0-9]+)*__$/.test(name)) return name;
  const doubleWrapped = name.match(/^mcp__mcp_([a-z0-9]+(?:_[a-z0-9]+)*)___$/);
  if (doubleWrapped) return `mcp__${doubleWrapped[1]}__`;
  const normalized = `mcp__${name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}__`;
  if (namespaces?.has(normalized)) return normalized;
  return normalized;
}

export function robustDenormalizeServerName(name: string): string {
  const normalized = robustNormalizeServerName(name);
  if (normalized === 'mcp__code_index__') return 'code-index';
  if (normalized === 'mcp__mimir__') return 'mimir';
  const match = normalized.match(/^mcp__(.*)__$/);
  if (match) {
    return match[1].replace(/_/g, '-');
  }
  const prefixed = normalized.match(/^mcp__(.+)$/);
  if (prefixed) return prefixed[1].replace(/_/g, '-');
  return name;
}

function flattenNamespacedToolName(namespaceName: string, toolName: string): string {
  if (!namespaceName) return toolName;
  if (toolName.startsWith(namespaceName)) return toolName;
  return namespaceName.endsWith('__')
    ? `${namespaceName}${toolName}`
    : `${namespaceName}__${toolName}`;
}

function splitFlattenedNamespacedToolName(
  name: string,
  namespaceName: string,
): string | null {
  if (!name || !namespaceName) return null;
  for (const separator of ['.', '__', '_', '']) {
    const prefix = `${namespaceName}${separator}`;
    if (name.startsWith(prefix) && name.length > prefix.length) return name.slice(prefix.length);
  }
  return null;
}

export function normalizeResponsesEvent(
  event: ResponsesEvent,
  namespaces?: Set<string>,
): ResponsesEvent {
  if (event.type !== 'response.output_item.done' && event.type !== 'response.output_item.added') {
    return event;
  }
  const item = event.item as Record<string, unknown> | undefined;
  if (!item) return event;

  if (isReasoningType(item.type)) {
    return {
      ...event,
      item: normalizeReasoningItemPayload(item),
    };
  }

  // Handle tool call normalization
  if (typeof item.type === 'string' && isToolCallType(item.type)) {
    const kind = item.type;
    const name = typeof item.name === 'string' ? item.name : '';

    // De-normalize server names in arguments (e.g. "mcp__code_index__" -> "code_index")
    if (typeof item.arguments === 'string') {
      try {
        const args = JSON.parse(item.arguments);
        if (typeof args.server === 'string') {
          const original = args.server;
          const denormalized = robustDenormalizeServerName(original);
          if (denormalized !== original) {
            args.server = denormalized;
            item.arguments = JSON.stringify(args);
          }
        }
      } catch {
        // Ignore parse errors in arguments
      }
    }

    // Un-flatten namespaced tools (e.g. mcp__code_index__search ->
    // function_call { namespace: "mcp__code_index__", name: "search" }).
    if (kind === 'function_call' && namespaces) {
      for (const ns of namespaces) {
        const toolName = splitFlattenedNamespacedToolName(name, ns);
        if (toolName) {
          const rewrittenItem: Record<string, unknown> = {
            ...item,
            type: kind,
            name: toolName,
            namespace: ns,
            output_kind: outputKindForToolKind(kind),
          };
          return { ...event, item: rewrittenItem };
        }
      }
    }

    return {
      type: event.type,
      item: {
        ...item,
        output_kind: outputKindForToolKind(kind),
      },
    };
  }

  return event;
}

function extractNamespacesFromBody(body: string | undefined): Set<string> {
  const namespaces = new Set<string>();
  if (!body) return namespaces;
  try {
    const parsed = JSON.parse(body);
    if (Array.isArray(parsed.tools)) {
      for (const tool of parsed.tools) {
        if (tool.type === 'namespace' && typeof tool.name === 'string') {
          namespaces.add(tool.name);
        }
      }
    }
    if (namespaces.size > 0) {
      writeUpstreamLog({
        path: 'internal/namespaces',
        namespaces: Array.from(namespaces),
      });
    }
  } catch {
    // Ignore
  }
  return namespaces;
}

export function buildMockSseBody(events: ResponsesEvent[], namespaces?: Set<string>): string {
  return events
    .map((event) => {
      const normalized = normalizeResponsesEvent(event, namespaces);
      return `event: ${normalized.type}\ndata: ${JSON.stringify(normalized)}\n\n`;
    })
    .join('');
}

export function buildMockResponsesEventsFromInput(input: ResponsesInputItem[]): ResponsesEvent[] {
  const events: ResponsesEvent[] = [];
  for (const item of input) {
    const event = responseDoneEventForInputItem(item);
    if (event) events.push(event);
  }
  return events;
}

function writeResponseLog(entry: Record<string, unknown>): void {
  const logDir = logDirFromEnv();
  const text = JSON.stringify(entry, null, 2) + '\n';
  console.log(text.trimEnd());
  if (!logDir) return;
  try {
    Deno.mkdirSync(logDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const file = `${logDir}/response-${stamp}-${crypto.randomUUID()}.json`;
    Deno.writeTextFileSync(file, text);
  } catch {
    // Ignore
  }
}

function writeStreamLog(entry: Record<string, unknown>): void {
  const logDir = logDirFromEnv();
  const text = JSON.stringify(entry, null, 2) + '\n';
  console.log(text.trimEnd());
  if (!logDir) return;
  try {
    Deno.mkdirSync(logDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const file = `${logDir}/stream-${stamp}-${crypto.randomUUID()}.json`;
    Deno.writeTextFileSync(file, text);
  } catch {
    // Ignore
  }
}

async function writeFinalClientResponseLog(path: string, response: Response): Promise<void> {
  if (!logDirFromEnv()) return;
  let body = '';
  try {
    body = await response.clone().text();
  } catch {
    body = '';
  }
  writeResponseLog({
    path,
    target: 'client',
    status: response.status,
    headers: Object.fromEntries(response.headers.entries()),
    body,
    stage: 'client_response_final',
  });
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('text/event-stream')) {
    writeStreamLog({
      path,
      target: 'client',
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      body,
      stage: 'client_response_stream_final',
    });
  }
}

function rewrittenBodyHeaders(headers: Headers): Headers {
  const out = new Headers(headers);
  out.delete('content-length');
  out.delete('content-encoding');
  out.delete('transfer-encoding');
  return out;
}

async function forwardJson(url: string, init: RequestInit): Promise<Response> {
  const resp = await fetch(url, init);
  return resp;
}

function hasAntigravityProjectIdError(text: string): boolean {
  const lower = text.toLowerCase();
  return lower.includes('antigravity auth missing project_id') ||
    lower.includes('no project_id in response');
}

function hasCfWorkersAiError(parsed: Record<string, unknown>): boolean {
  if (parsed.success !== false) return false;
  const errors = parsed.errors;
  if (!Array.isArray(errors) || errors.length === 0) return false;
  return errors.some((e) => {
    if (typeof e !== 'object' || e === null) return false;
    const code = (e as Record<string, unknown>).code;
    if (typeof code === 'number' && code >= 8000 && code <= 8999) return true;
    const msg = (e as Record<string, unknown>).message;
    if (typeof msg !== 'string') return false;
    const lower = msg.toLowerCase();
    return lower.includes('aierror') || lower.includes('exceeded retry limit') ||
      lower.includes('429') || lower.includes('rate limit') || lower.includes('too many request');
  });
}

function hasGlmQuotaOrKeyErrorText(text: string): boolean {
  const lower = text.toLowerCase();
  return lower.includes('insufficient_quota') ||
    lower.includes('quota exceeded') ||
    lower.includes('quota exceeded for this key') ||
    lower.includes('quota exceeded for this api key') ||
    lower.includes('余额不足') ||
    lower.includes('额度不足') ||
    lower.includes('配额不足') ||
    lower.includes('令牌不足') ||
    lower.includes('has expired') ||
    lower.includes('key expired') ||
    lower.includes('api key expired') ||
    lower.includes('invalid api key') ||
    lower.includes('api key is invalid') ||
    lower.includes('key not found') ||
    lower.includes('key revoked') ||
    lower.includes('has been revoked') ||
    lower.includes('api key has been revoked');
}

async function shouldTriggerImmediateGlmKeyRefresh(
  response: Response,
  config: ProxyConfig,
): Promise<boolean> {
  if (!isGlmKeyRefreshEnabled(config)) return false;
  if (response.status !== 401 && response.status !== 403 && response.status !== 429) return false;
  try {
    const text = await response.clone().text();
    return hasGlmQuotaOrKeyErrorText(text);
  } catch {
    return false;
  }
}

async function maybeTriggerImmediateGlmKeyRefresh(
  response: Response,
  config: ProxyConfig,
): Promise<void> {
  if (!(await shouldTriggerImmediateGlmKeyRefresh(response, config))) return;
  void refreshGlmKeyIfNeeded(config);
}

/**
 * Detects upstream "context too long" errors (HTTP 400). These satisfy the OpenAI-style
 * message: "This model's maximum context length is N tokens. However, your messages
 * resulted in M tokens. Please reduce the length of the messages." We also accept a looser
 * match on "maximum context length" / "context length" + "reduce the length".
 */
function isContextLengthOverflowResponse(response: Response, text: string): boolean {
  if (response.status !== 400) return false;
  if (!text) return false;
  const lower = text.toLowerCase();
  if (!lower.includes('context length')) return false;
  return lower.includes('maximum context length') ||
    lower.includes('reduce the length') ||
    lower.includes('maximum context') ||
    lower.includes(' resulted in ');
}

function isResponsesToolHistoryErrorResponse(response: Response, text: string): boolean {
  if (response.status !== 400 || !text) return false;
  const lower = text.toLowerCase();
  return lower.includes('no tool call found for function call output') ||
    lower.includes('function_call_output requires item_reference') ||
    lower.includes('item_reference ids matching each call_id') ||
    lower.includes('continuation via previous_response_id') ||
    lower.includes('not the same number of function calls and responses');
}

async function isResponsesToolHistoryError(response: Response): Promise<boolean> {
  try {
    return isResponsesToolHistoryErrorResponse(response, await response.clone().text());
  } catch {
    return false;
  }
}

async function compactAndRetryOnOverflow(
  path: string,
  req: Request,
  config: ProxyConfig,
  body: string | undefined,
  baseHeaders: Headers,
  rawBody: string | undefined,
  turnContext: ProxyTurnContext | undefined,
  upstream: Response,
): Promise<Response> {
  const state = contextWindowState(config);
  let overflowText = '';
  try {
    overflowText = await upstream.clone().text();
  } catch {
    return upstream;
  }
  if (!isContextLengthOverflowResponse(upstream, overflowText)) {
    return upstream;
  }
  writeUpstreamLog({
    path: 'internal/context-overflow-compact-retry',
    requestPath: path,
    maxTokens: state.maxTokens,
    thresholdPercent: config.contextCompactThresholdPercent ?? 90,
    upstreamStatus: upstream.status,
    upstreamBody: overflowText,
  });
  const compactBody = buildContextCompactionRequestBody(
    body,
    state.maxTokens,
    config.contextCompactThresholdPercent ?? 90,
  );
  if (!compactBody) return upstream;
  const compactResponse = await forwardWithFallback(
    '/v1/responses/compact',
    req,
    config,
    compactBody,
    baseHeaders,
    compactBody,
    turnContext,
  );
  if (!compactResponse.ok) return upstream;
  const summaryText = extractCompactionSummaryText(await compactResponse.text());
  if (!summaryText) {
    return await retryTrimmedOnOverflow(
      path,
      req,
      config,
      body,
      baseHeaders,
      rawBody,
      turnContext,
      upstream,
      state,
    );
  }
  // Replace the oversized conversation with [summary + latest user turn] so the retried
  // request actually shrinks; appending a summary on top of the original oversized body
  // would just hit the context limit a second time.
  const retriedBody = compressRequestsBodyForRetry(body, summaryText);
  if (retriedBody && retriedBody !== body) {
    const retried = await forwardWithFallback(
      path,
      req,
      config,
      retriedBody,
      baseHeaders,
      rawBody,
      turnContext,
    );
    if (retried.ok) return retried;
    if (!isContextLengthOverflowResponse(retried, await clonedText(retried))) return retried;
  }
  // Summary-based compression still overflowed (or produced no shrinkable body):
  // fall back to keeping the first 3 and last 3 turns when nvidiaCompat is enabled.
  return await retryTrimmedOnOverflow(
    path,
    req,
    config,
    body,
    baseHeaders,
    rawBody,
    turnContext,
    upstream,
    state,
  );
}

async function clonedText(response: Response): Promise<string> {
  try {
    return await response.clone().text();
  } catch {
    return '';
  }
}

/**
 * Split a responses input[] (or chat messages[]) into conversational turns. A new turn
 * starts at every user-authored message (role === 'user'). Non-message items (reasoning,
 * function_call, *_call_output) stay attached to the turn they belong to. Returns an array
 * of turn groups, each an array of original items.
 */
function splitConversationTurns(items: unknown[]): unknown[][] {
  const turns: unknown[][] = [];
  for (const raw of items) {
    if (!raw || typeof raw !== 'object') continue;
    const record = raw as Record<string, unknown>;
    const rawRole = typeof record.role === 'string' ? record.role : '';
    const type = typeof record.type === 'string' ? record.type : '';
    // A new turn starts at every user-authored message. For responses-style input the
    // items are typed (`record.type === 'message'`), while chat-style messages only carry
    // a `role`. Treat both as turn boundaries when role === 'user'.
    const isUserMessage = (type === 'message' || type === '') && rawRole === 'user';
    if (isUserMessage || turns.length === 0) {
      turns.push([]);
    }
    turns[turns.length - 1].push(raw);
  }
  return turns.filter((group) => group.length > 0);
}

function newTurnBoundaryNotice(): string {
  return '[hubproxy] Middle turns of the prior conversation were dropped to fit the upstream context window; ' +
    'the retained first and last turns above and below are authoritative. Continue from the latest user turn.';
}

/**
 * Safety-net fallback for when summary-based compaction still trips the upstream context
 * overflow. Only invoked when HUBPROXY_NVIDIA_COMPAT is enabled and the trimmed body still
 * fits (by chars/4 estimate) under the configured context window. Keeps the first 3 and
 * last 3 conversational turns, inserting a small notice between them, then retries once.
 * Returns the original `upstream` response unchanged when the trim is not applicable.
 */
async function retryTrimmedOnOverflow(
  path: string,
  req: Request,
  config: ProxyConfig,
  body: string | undefined,
  baseHeaders: Headers,
  rawBody: string | undefined,
  turnContext: ProxyTurnContext | undefined,
  upstream: Response,
  state: ContextWindowState,
): Promise<Response> {
  if (!config.nvidiaCompat || !state.enabled) return upstream;
  if (!path.includes('/responses') && !path.includes('/chat/completions')) return upstream;
  const trimmed = trimBodyToWindowEdges(body);
  if (!trimmed || trimmed === body) return upstream;
  // Guard: only retry when the trimmed body still fits under the configured window.
  const estimated = estimateRequestInputTokens(trimmed);
  if (estimated > state.maxTokens) return upstream;
  writeUpstreamLog({
    path: 'internal/context-overflow-edge-trim-retry',
    requestPath: path,
    maxTokens: state.maxTokens,
    estimatedInputTokens: estimated,
    upstreamStatus: upstream.status,
    upstreamBody: await clonedText(upstream),
  });
  return await forwardWithFallback(
    path,
    req,
    config,
    trimmed,
    baseHeaders,
    rawBody,
    turnContext,
  );
}

/**
 * Builds a trimmed request body that keeps the first 3 and last 3 conversational turns of
 * the original conversation, dropping the middle turns and inserting a small notice item to
 * preserve continuity. Works for responses-style (input[]) and chat-style (messages[]) bodies.
 * Returns null when the body cannot be reshaped, is not actually larger than the kept turns
 * (i.e. trimming would not shrink it), or has fewer than 7 turns.
 */
function trimBodyToWindowEdges(
  requestBody: string | undefined,
  keepFirst = 3,
  keepLast = 3,
): string | null {
  if (!requestBody) return null;
  const parsed = parseJsonBody(requestBody);
  if (!parsed || typeof parsed !== 'object') return null;
  const record = parsed as Record<string, unknown>;

  const chatMessages = Array.isArray(record.messages) ? record.messages : null;
  if (chatMessages) {
    const turns = splitConversationTurns(chatMessages as unknown[]);
    if (turns.length <= keepFirst + keepLast) return null;
    const kept = [...turns.slice(0, keepFirst), ...turns.slice(turns.length - keepLast)];
    const middleNotice = { role: 'system', content: newTurnBoundaryNotice() };
    const reconstructed: unknown[] = [];
    for (let i = 0; i < kept.length; i++) {
      if (i === keepFirst) reconstructed.push(middleNotice);
      for (const item of kept[i]) reconstructed.push(item);
    }
    record.messages = reconstructed;
    if (JSON.stringify(record).length >= requestBody.length) return null;
    return JSON.stringify(parsed);
  }

  const responsesInput = Array.isArray(record.input) ? record.input : null;
  if (responsesInput) {
    const turns = splitConversationTurns(responsesInput as unknown[]);
    if (turns.length <= keepFirst + keepLast) return null;
    const kept = [...turns.slice(0, keepFirst), ...turns.slice(turns.length - keepLast)];
    const middleNotice = {
      type: 'message',
      role: 'developer',
      content: [{ type: 'input_text', text: newTurnBoundaryNotice() }],
    };
    const reconstructed: unknown[] = [];
    for (let i = 0; i < kept.length; i++) {
      if (i === keepFirst) reconstructed.push(middleNotice);
      for (const item of kept[i]) reconstructed.push(item);
    }
    record.input = reconstructed;
    if (JSON.stringify(record).length >= requestBody.length) return null;
    return JSON.stringify(parsed);
  }

  return null;
}

async function shouldRetryUpstreamResponse(response: Response): Promise<boolean> {
  if (!response.ok) {
    const contentType = response.headers.get('content-type') ?? '';
    if (
      !contentType.includes('application/json') && !contentType.includes('text/plain') &&
      !contentType.includes('text/event-stream')
    ) {
      return true;
    }
    try {
      const text = await response.clone().text();
      const lower = text.toLowerCase();
      if (
        lower.includes('prefill failed') ||
        lower.includes('unexpected character: line 1 column') ||
        lower.includes("expecting ',' delimiter") ||
        lower.includes('unsupported parameter(s): `client_metadata`') ||
        lower.includes('not the same number of function calls and responses')
      ) {
        return false;
      }
      if (hasGlmQuotaOrKeyErrorText(text)) return true;
    } catch {
      return true;
    }
    return true;
  }
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json') && !contentType.includes('text/plain')) {
    return false;
  }
  try {
    const text = await response.clone().text();
    if (!text) return false;
    if (hasAntigravityProjectIdError(text)) return true;
    const parsed = parseJsonBody(text);
    if (!parsed) return false;
    if (hasCfWorkersAiError(parsed as Record<string, unknown>)) return true;
    const error = parsed?.error;
    if (error && typeof error === 'object') {
      const e = error as Record<string, unknown>;
      const message = typeof e.message === 'string' ? e.message : '';
      if (hasAntigravityProjectIdError(message)) return true;
      const code = typeof e.code === 'string' ? e.code.toLowerCase() : '';
      const type = typeof e.type === 'string' ? e.type.toLowerCase() : '';
      const lowerMsg = message.toLowerCase();
      if (
        code === 'access_denied' ||
        type === 'new_api_error' ||
        hasGlmQuotaOrKeyErrorText(message) ||
        lowerMsg.includes('only codex clients') ||
        lowerMsg.includes('exceeded retry limit') ||
        lowerMsg.includes('rate limit') ||
        lowerMsg.includes('too many request') ||
        lowerMsg.includes('429')
      ) return true;
    }
    return false;
  } catch {
    return false;
  }
}

function isJsonWriteMethod(method: string): boolean {
  return method === 'POST' || method === 'PUT' || method === 'PATCH';
}

function emptyJsonBodyResponse(): Response {
  return new Response(
    JSON.stringify({
      error: {
        code: '400',
        message: 'Request body must be a non-empty JSON document.',
        type: 'BadRequest',
      },
    }),
    {
      status: 400,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    },
  );
}

function unconvertibleResponsesRequestResponse(): Response {
  return new Response(
    JSON.stringify({
      error: {
        code: '400',
        message: 'Responses request cannot be converted to Chat Completions.',
        type: 'BadRequest',
      },
    }),
    {
      status: 400,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    },
  );
}

async function maybeRewriteRequestBody(
  path: string,
  body: string | undefined,
  config: ProxyConfig,
): Promise<string | undefined> {
  if (!body) return body;
  if (!path.includes('/chat/completions') && !path.includes('/responses')) return body;
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    const isResponses = path.includes('/responses');
    const model = typeof parsed.model === 'string' ? parsed.model : '';

    // Only chat-completions fallback needs these fields stripped. When we are
    // sending a real Responses request upstream, preserve them so plan mode and
    // reasoning settings survive intact.
    if (path.includes('/chat/completions')) {
      delete parsed.store;
      delete parsed.prompt_cache_key;
      delete parsed.include;
      delete parsed.reasoning;
    }
    if (isResponses && isGeminiModel(model)) {
      delete parsed.store;
      delete parsed.prompt_cache_key;
    }

    if (Array.isArray(parsed.input)) {
      parsed.input = normalizeResponseInputItems(parsed.input);
    }
    if (isResponses) {
      appendCollaborationNamespaceToolsForResponses(parsed);
      await appendMcpNamespaceToolsForResponses(parsed, config);
    } else if (Array.isArray(parsed.tools)) {
      const normalizedTools = normalizeChatToolsValue(parsed.tools, !isResponses);
      if (normalizedTools.length > 0) {
        parsed.tools = normalizedTools;
      } else {
        delete parsed.tools;
      }
    }
    return JSON.stringify(parsed);
  } catch {
    return body;
  }
}

function contextWindowUsageFromBody(body: string | undefined): {
  inputTokens: number;
  totalTokens: number;
} | null {
  if (!body) return null;
  const parsed = parseJsonBody(body);
  if (!parsed) return null;
  const usage = parsed.usage;
  if (!usage || typeof usage !== 'object') return null;
  const record = usage as Record<string, unknown>;
  const inputTokens = typeof record.input_tokens === 'number'
    ? record.input_tokens
    : typeof record.prompt_tokens === 'number'
    ? record.prompt_tokens
    : 0;
  const totalTokens = typeof record.total_tokens === 'number'
    ? record.total_tokens
    : inputTokens + (typeof record.output_tokens === 'number'
      ? record.output_tokens
      : typeof record.completion_tokens === 'number'
      ? record.completion_tokens
      : 0);
  if (inputTokens <= 0 && totalTokens <= 0) return null;
  return { inputTokens, totalTokens };
}

function estimateRequestInputTokens(body: string | undefined): number {
  if (!body) return 0;
  const parsed = parseJsonBody(body);
  if (!parsed) return 0;
  const direct = contextWindowUsageFromBody(body);
  if (direct) return direct.inputTokens;

  const texts: string[] = [];
  const addText = (value: unknown) => {
    if (typeof value === 'string' && value) texts.push(value);
  };

  addText(parsed.instructions);
  addText(parsed.system);

  const input = Array.isArray(parsed.input) ? parsed.input : [];
  for (const item of input) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    addText(record.text);
    const content = Array.isArray(record.content) ? record.content : [];
    for (const part of content) {
      if (!part || typeof part !== 'object') continue;
      addText((part as Record<string, unknown>).text);
      addText((part as Record<string, unknown>).input_text);
    }
    if (typeof record.arguments === 'string') addText(record.arguments);
    if (typeof record.output === 'string') addText(record.output);
  }

  const totalChars = texts.reduce((sum, text) => sum + text.length, 0);
  if (totalChars <= 0) return 0;
  return Math.max(1, Math.ceil(totalChars / 4));
}

function requestNeedsContextCompaction(
  path: string,
  body: string | undefined,
  config: ProxyConfig,
): {
  shouldCompact: boolean;
  estimatedInputTokens: number;
  thresholdTokens: number;
  maxTokens: number;
} {
  const state = contextWindowState(config);
  if (!state.enabled || !path.includes('/responses') || path.includes('/responses/compact')) {
    return {
      shouldCompact: false,
      estimatedInputTokens: 0,
      thresholdTokens: state.thresholdTokens,
      maxTokens: state.maxTokens,
    };
  }
  const estimatedInputTokens = estimateRequestInputTokens(body);
  return {
    shouldCompact: estimatedInputTokens >= state.thresholdTokens,
    estimatedInputTokens,
    thresholdTokens: state.thresholdTokens,
    maxTokens: state.maxTokens,
  };
}

/**
 * Extracts the last user-authored message from a responses-style body (input[]) or a
 * chat-style body (messages[]). Returns the text or null. Used when we must shrink an
 * overflowing conversation to [summary + latest user turn] before retrying upstream.
 */
function lastUserTurnText(body: string | undefined): string | null {
  if (!body) return null;
  const parsed = parseJsonBody(body);
  if (!parsed || typeof parsed !== 'object') return null;
  const record = parsed as Record<string, unknown>;

  const pickFromMessages = (items: unknown[]): string | null => {
    for (let i = items.length - 1; i >= 0; i--) {
      const item = items[i];
      if (!item || typeof item !== 'object') continue;
      const r = item as Record<string, unknown>;
      const role = typeof r.role === 'string' ? r.role : '';
      let text = '';
      const content = r.content;
      if (typeof content === 'string') {
        text = content;
      } else if (Array.isArray(content)) {
        text = content
          .map((part) => {
            if (!part || typeof part !== 'object') return '';
            const pr = part as Record<string, unknown>;
            return typeof pr.text === 'string'
              ? pr.text
              : typeof pr.input_text === 'string'
              ? pr.input_text
              : '';
          })
          .join('\n');
      }
      if (typeof r.text === 'string' && !text) text = r.text;
      if (typeof r.input_text === 'string' && !text) text = r.input_text;
      if (role === 'user' && text.trim()) return text.trim();
    }
    return null;
  };

  const responsesInput = Array.isArray(record.input) ? record.input : null;
  if (responsesInput) {
    const found = pickFromMessages(responsesInput as unknown[]);
    if (found) return found;
  }
  const chatMessages = Array.isArray(record.messages) ? record.messages : null;
  if (chatMessages) {
    const found = pickFromMessages(chatMessages as unknown[]);
    if (found) return found;
  }
  return null;
}

/**
 * Replaces an oversized request body with a compressed form: [developer/system summary
 * message, last user turn], preserving model/stream/tools/instructions where present.
 * Unlike appendCompactionSummaryInput (which only prepends and leaves the original
 * oversized input intact), this actually shrinks the body so a retried request can fit
 * within the upstream context window. Detects responses-style (input[]) and chat-style
 * (messages[]) bodies; returns null if the body cannot be reshaped.
 */
function compressRequestsBodyForRetry(
  requestBody: string | undefined,
  summaryText: string,
): string | null {
  if (!requestBody) return null;
  const parsed = parseJsonBody(requestBody);
  if (!parsed || typeof parsed !== 'object') return null;
  const record = parsed as Record<string, unknown>;
  const summaryIntro =
    `Compressed prior context summary. Treat this as authoritative prior state and continue from it:\n\n${summaryText}`;
  const lastUser = lastUserTurnText(requestBody);

  const chatMessages = Array.isArray(record.messages) ? record.messages : null;
  if (chatMessages) {
    const messages: unknown[] = [{ role: 'system', content: summaryIntro }];
    if (lastUser) messages.push({ role: 'user', content: lastUser });
    record.messages = messages;
    return JSON.stringify(parsed);
  }
  const responsesInput = Array.isArray(record.input) ? record.input : null;
  if (responsesInput) {
    const input: unknown[] = [
      {
        type: 'message',
        role: 'developer',
        content: [{ type: 'input_text', text: summaryIntro }],
      },
    ];
    if (lastUser) {
      input.push({
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text: lastUser }],
      });
    }
    record.input = input;
    return JSON.stringify(parsed);
  }
  return null;
}

function appendCompactionSummaryInput(
  requestBody: string | undefined,
  summaryText: string,
): string | undefined {
  if (!requestBody) return requestBody;
  const parsed = parseJsonBody(requestBody);
  if (!parsed) return requestBody;
  const originalInput = Array.isArray(parsed.input) ? parsed.input : [];
  parsed.input = [
    {
      type: 'message',
      role: 'developer',
      content: [{
        type: 'input_text',
        text:
          `Compressed prior context summary. Treat this as authoritative prior state and continue from it:\n\n${summaryText}`,
      }],
    },
    ...originalInput,
  ];
  return JSON.stringify(parsed);
}

function buildContextCompactionRequestBody(
  originalBody: string | undefined,
  maxTokens: number,
  thresholdPercent: number,
): string | null {
  if (!originalBody) return null;
  const parsed = parseJsonBody(originalBody);
  if (!parsed) return null;
  const input = Array.isArray(parsed.input)
    ? parsed.input
    : Array.isArray(parsed.messages)
    ? parsed.messages
    : [];
  const model = typeof parsed.model === 'string' ? parsed.model : '';
  return JSON.stringify({
    model,
    stream: false,
    input,
    tools: [],
    instructions:
      `The upstream context window is limited to ${maxTokens} tokens and the current request is approaching ${thresholdPercent}% of that limit. ` +
      'Produce a compact continuation summary that preserves only the state needed to continue the task. ' +
      'Include: user objective, constraints, files already touched, confirmed findings, unresolved risks, and the exact next step. ' +
      'Be concise and omit repetition.',
  });
}

function extractCompactionSummaryText(responseText: string): string {
  const parsed = parseJsonBody(responseText);
  if (!parsed) return responseText.trim();
  if (typeof parsed.output_text === 'string' && parsed.output_text.trim()) {
    return parsed.output_text.trim();
  }
  const output = Array.isArray(parsed.output) ? parsed.output : [];
  for (const item of output) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    if (record.type !== 'message') continue;
    const content = Array.isArray(record.content) ? record.content : [];
    const text = content
      .flatMap((part) => {
        if (!part || typeof part !== 'object') return [];
        const value = (part as Record<string, unknown>).text;
        return typeof value === 'string' && value.trim() ? [value.trim()] : [];
      })
      .join('\n');
    if (text) return text;
  }
  return responseText.trim();
}

function isGeminiModel(model: string): boolean {
  return model === 'gemini' || model.startsWith('gemini-') || model.startsWith('models/gemini-');
}

function sanitizeToolName(name: unknown): string {
  if (typeof name !== 'string') return '';
  return name.trim();
}

function repairCollapsedNamespacedToolName(
  name: string,
  namespaces?: Set<string>,
): string {
  if (!name || !namespaces || namespaces.size === 0) return name;
  for (const ns of namespaces) {
    if (!name.startsWith(ns)) continue;
    return name;
  }
  for (const ns of namespaces) {
    if (!ns.startsWith('mcp__') || !ns.endsWith('__')) continue;
    const stem = ns.slice(0, -2);
    if (!name.startsWith(stem) || name.length <= stem.length) continue;
    return `${ns}${name.slice(stem.length)}`;
  }
  return name;
}

function normalizeFunctionCallArguments(
  argumentsText: string,
): string {
  if (typeof argumentsText !== 'string') return '{}';
  try {
    const args = JSON.parse(argumentsText) as Record<string, unknown>;
    if (typeof args.server === 'string') {
      const original = args.server;
      const normalized = robustNormalizeServerName(original);
      if (normalized !== original) {
        args.server = normalized;
      }
    }
    return JSON.stringify(args);
  } catch {
    return JSON.stringify({ cmd: unsupportedToolNoticeCommand('malformed_tool_arguments') });
  }
}

function normalizeResponseInputItems(input: unknown): unknown[] {
  if (!Array.isArray(input)) return [];
  const callNames = new Map<string, string>();
  for (const item of input) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const type = typeof record.type === 'string' ? record.type : '';
    if (isToolCallType(type)) {
      const callId = typeof record.call_id === 'string' ? record.call_id : '';
      const itemId = typeof record.id === 'string' ? record.id : '';
      let name = sanitizeToolName(record.name);
      if (type === 'mcp_tool_call' && typeof record.server === 'string' && record.server) {
        if (!name.startsWith(record.server)) {
          name = `${record.server}${name}`;
        }
      }
      if (callId && name) callNames.set(callId, name);
      if (itemId && name) callNames.set(itemId, name);
    }
  }

  const seenToolReferences = new Set<string>();
  const normalized: unknown[] = [];
  for (const item of input) {
    if (!item || typeof item !== 'object') {
      normalized.push(item);
      continue;
    }
    const record = item as Record<string, unknown>;
    const type = typeof record.type === 'string' ? record.type : '';
    if (type === 'item_reference') {
      const id = typeof record.id === 'string' ? record.id : '';
      if (id) seenToolReferences.add(id);
      normalized.push(record);
      continue;
    }

    let outRecord: Record<string, unknown> = record;

    if (type === 'mcp_tool_call' && typeof record.server === 'string' && record.server) {
      let name = sanitizeToolName(record.name);
      if (!name.startsWith(record.server)) {
        name = `${record.server}${name}`;
      }
      outRecord = { ...record, type: 'function_call', name };
    }

    if (type === 'function_call' && typeof record.arguments === 'string') {
      try {
        const args = JSON.parse(record.arguments);
        if (typeof args.server === 'string') {
          const original = args.server;
          const normalized = robustNormalizeServerName(original);
          if (normalized !== original) {
            args.server = normalized;
            record.arguments = JSON.stringify(args);
          }
        }
      } catch {
        // Ignore
      }
    }

    if (isToolCallType(type) || isToolCallType(String(outRecord.type ?? ''))) {
      const callId = typeof outRecord.call_id === 'string' ? outRecord.call_id : '';
      const itemId = typeof outRecord.id === 'string' ? outRecord.id : '';
      if (callId) seenToolReferences.add(callId);
      if (itemId) seenToolReferences.add(itemId);
      normalized.push(outRecord);
      continue;
    }

    if (
      type === 'function_call_output' ||
      type === 'custom_tool_call_output' ||
      type === 'tool_search_output' ||
      type === 'mcp_tool_call_output'
    ) {
      const callId = typeof record.call_id === 'string' ? record.call_id : '';
      const name = sanitizeToolName(record.name) || (callId ? callNames.get(callId) ?? '' : '');
      if (callId && !seenToolReferences.has(callId)) {
        normalized.push({ type: 'item_reference', id: callId });
        seenToolReferences.add(callId);
      }
      normalized.push(name ? { ...record, name } : record);
      continue;
    }
    normalized.push(item);
  }
  return normalized;
}

function normalizeChatToolsValue(tools: unknown, wrap = true): unknown[] {
  if (!Array.isArray(tools)) return [];
  return tools.flatMap((tool) => {
    if (!tool || typeof tool !== 'object') return [];
    const record = tool as Record<string, unknown>;
    const toolType = typeof record.type === 'string' ? record.type : '';

    if (toolType === 'namespace') {
      const namespaceName = typeof record.name === 'string' ? record.name : '';
      const namespaceTools = Array.isArray(record.tools) ? record.tools : [];
      return normalizeChatToolsValue(namespaceTools, wrap).map((t) => {
        const rt = t as Record<string, any>;
        const target = wrap ? rt.function : rt;
        if (target && typeof target.name === 'string' && namespaceName) {
          target.name = flattenNamespacedToolName(namespaceName, target.name);
        }
        return rt;
      });
    }

    if (toolType && toolType !== 'function') return [];

    const functionRecord = record.function && typeof record.function === 'object'
      ? { ...(record.function as Record<string, unknown>) }
      : {};
    const name = sanitizeToolName(functionRecord.name ?? record.name);
    if (!name) return [];
    const description = typeof functionRecord.description === 'string'
      ? functionRecord.description
      : typeof record.description === 'string'
      ? record.description
      : undefined;
    const parameters = functionRecord.parameters ?? record.parameters;
    const strict = typeof functionRecord.strict === 'boolean'
      ? functionRecord.strict
      : typeof record.strict === 'boolean'
      ? record.strict
      : undefined;
    if (!wrap) {
      const toolRecord: Record<string, unknown> = {
        ...record,
        type: 'function',
        name,
      };
      if (description !== undefined) toolRecord.description = description;
      if (parameters !== undefined) toolRecord.parameters = parameters;
      if (strict !== undefined) toolRecord.strict = strict;
      if (toolRecord.function) delete toolRecord.function;
      return [toolRecord];
    }

    const functionBody: Record<string, unknown> = {
      name,
    };
    const functionTool: Record<string, unknown> = {
      type: 'function',
      function: functionBody,
    };
    if (description !== undefined) functionBody.description = description;
    if (parameters !== undefined) functionBody.parameters = parameters;
    if (strict !== undefined) functionBody.strict = strict;
    return [functionTool];
  });
}

function extractAllowedChatToolNames(tools: unknown): Set<string> {
  const names = new Set<string>();
  const toolList = typeof tools === 'string'
    ? (() => {
      try {
        const parsed = JSON.parse(tools) as Record<string, unknown>;
        return parsed.tools;
      } catch {
        return [];
      }
    })()
    : tools;
  for (const tool of normalizeChatToolsValue(toolList, true)) {
    if (!tool || typeof tool !== 'object') continue;
    const record = tool as Record<string, unknown>;
    const fn = record.function && typeof record.function === 'object'
      ? record.function as Record<string, unknown>
      : null;
    if (typeof fn?.name === 'string' && fn.name) names.add(fn.name);
  }
  return names;
}

function sanitizeResponsesFallbackRequest(
  request: Record<string, unknown>,
): void {
  delete request.store;
  delete request.prompt_cache_key;
  delete request.include;
  delete request.reasoning;
  delete request.client_metadata;
}

function isFallbackEligibleStatus(status: number): boolean {
  return status >= 500 || status === 404 || status === 405 || status === 410 || status === 415;
}

function isFallbackEligibleError(error: unknown): boolean {
  return error instanceof Error;
}

type ChatFallbackRequest = {
  model: string;
  messages: Array<Record<string, unknown>>;
  stream: boolean;
  planModeLike: boolean;
  request: Record<string, unknown>;
};

const CHAT_FALLBACK_SYSTEM_NOTICE =
  'Compatibility note: you are using Chat Completions as a Responses API fallback. ' +
  'Do not stop after only a progress update or plan. If you say you will inspect or run something, ' +
  'call an available tool in the same response; otherwise provide the final answer.';

function mapContentPartForChat(part: Record<string, unknown>): Record<string, unknown> {
  const partType = typeof part.type === 'string' ? part.type : '';
  if (partType === 'input_text' || partType === 'text' || partType === 'output_text') {
    return { type: 'text', text: typeof part.text === 'string' ? part.text : '' };
  }
  if (partType === 'input_image') {
    const url = typeof part.image_url === 'string' ? part.image_url : '';
    return { type: 'image_url', image_url: { url } };
  }
  if (partType === 'image_url') {
    if (part.image_url && typeof part.image_url === 'object') {
      return { type: 'image_url', image_url: part.image_url };
    }
    return {
      type: 'image_url',
      image_url: { url: typeof part.image_url === 'string' ? part.image_url : '' },
    };
  }
  return part;
}

function contentToChatContent(content: unknown): unknown {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  const parts = content.flatMap((part) =>
    part && typeof part === 'object' ? [part as Record<string, unknown>] : []
  );
  const hasNonText = parts.some((part) => {
    const partType = typeof part.type === 'string' ? part.type : '';
    return partType !== 'input_text' && partType !== 'text' && partType !== 'output_text';
  });
  if (!hasNonText) {
    return parts
      .map((part) => typeof part.text === 'string' ? part.text : '')
      .join('');
  }
  return parts.map(mapContentPartForChat);
}

function mergeChatContents(current: unknown, next: unknown): unknown {
  const currentIsEmpty = current === undefined || current === null || current === '' ||
    (Array.isArray(current) && current.length === 0);
  if (currentIsEmpty) return next;

  const nextIsEmpty = next === undefined || next === null || next === '' ||
    (Array.isArray(next) && next.length === 0);
  if (nextIsEmpty) return current;

  if (typeof current === 'string' && typeof next === 'string') {
    return `${current}\n${next}`;
  }

  const toParts = (value: unknown): Array<Record<string, unknown>> => {
    if (typeof value === 'string') return [{ type: 'text', text: value }];
    if (!Array.isArray(value)) return [];
    return value.flatMap((part) =>
      part && typeof part === 'object' ? [part as Record<string, unknown>] : []
    );
  };

  return [...toParts(current), ...toParts(next)];
}

function pushSystemMessage(
  messages: Array<Record<string, unknown>>,
  systemTexts: string[],
): void {
  const content = systemTexts.map((text) => text.trim()).filter(Boolean).join('\n\n');
  if (content) messages.unshift({ role: 'system', content });
}

function toolOutputText(record: Record<string, unknown>): string {
  if (typeof record.output === 'string') return record.output;
  if (record.output !== undefined) return JSON.stringify(record.output);
  if (typeof record.content === 'string') return record.content;
  return '';
}

function extractChatFallbackFromResponsesBody(
  body: string | undefined,
  planModeLike = false,
  allowUnsafeGeminiToolHistory = false,
  nvidiaCompat = false,
): ChatFallbackRequest | null {
  if (!body) return null;
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    const input = Array.isArray(parsed.input) ? normalizeResponseInputItems(parsed.input) : [];
    const model = typeof parsed.model === 'string' ? parsed.model : '';
    if (!allowUnsafeGeminiToolHistory && isUnsafeGeminiChatFallback(model, input)) return null;
    const namespaces = extractNamespacesFromBody(body);
    const messages: Array<Record<string, unknown>> = [];
    const systemTexts: string[] = [];
    const emittedToolCallIds = new Set<string>();
    const instructions = typeof parsed.instructions === 'string' ? parsed.instructions : '';
    if (planModeLike) systemTexts.push(CHAT_FALLBACK_SYSTEM_NOTICE);
    if (instructions) systemTexts.push(instructions);

    for (let index = 0; index < input.length; index++) {
      const item = input[index];
      if (!item || typeof item !== 'object') continue;
      const record = item as Record<string, unknown>;
      const type = typeof record.type === 'string' ? record.type : '';
      if (type === 'function_call') {
        const toolCalls: Array<Record<string, unknown>> = [];
        let mergedAssistantContent: unknown = null;
        while (index < input.length) {
          const current = input[index];
          if (!current || typeof current !== 'object') break;
          const currentRecord = current as Record<string, unknown>;
          if (currentRecord.type !== 'function_call') break;
          const callId = typeof currentRecord.call_id === 'string'
            ? currentRecord.call_id
            : `call_${crypto.randomUUID().replace(/-/g, '')}`;
          const name = repairCollapsedNamespacedToolName(
            sanitizeToolName(currentRecord.name),
            namespaces,
          );
          const args = typeof currentRecord.arguments === 'string'
            ? normalizeFunctionCallArguments(currentRecord.arguments)
            : '{}';
          if (name) {
            toolCalls.push({
              id: callId,
              type: 'function',
              function: { name, arguments: args },
            });
            emittedToolCallIds.add(callId);
          }
          index++;
        }
        while (index < input.length) {
          const current = input[index];
          if (!current || typeof current !== 'object') break;
          const currentRecord = current as Record<string, unknown>;
          const currentType = typeof currentRecord.type === 'string' ? currentRecord.type : '';
          if (currentType !== 'message' && currentType !== 'assistant_message') break;
          const rawRole = typeof currentRecord.role === 'string'
            ? currentRecord.role
            : (currentType === 'assistant_message' ? 'assistant' : 'user');
          if (rawRole !== 'assistant') break;
          mergedAssistantContent = mergeChatContents(
            mergedAssistantContent,
            contentToChatContent(currentRecord.content),
          );
          index++;
        }
        index--;
        if (toolCalls.length > 0) {
          const content = mergedAssistantContent === '' ||
              (Array.isArray(mergedAssistantContent) && mergedAssistantContent.length === 0)
            ? null
            : mergedAssistantContent;
          messages.push({ role: 'assistant', content, tool_calls: toolCalls });
        }
        continue;
      }
      if (type === 'message' || type === 'assistant_message') {
        const rawRole = typeof record.role === 'string'
          ? record.role
          : (type === 'message' ? 'user' : 'assistant');
        const role = rawRole === 'developer' ? 'system' : rawRole;
        const content = contentToChatContent(record.content);
        if (role === 'system') {
          if (typeof content === 'string') systemTexts.push(content);
        } else if (
          (typeof content === 'string' && content) ||
          (Array.isArray(content) && content.length > 0)
        ) {
          messages.push({ role, content });
        }
        continue;
      }
      if (type === 'reasoning') continue;
      if (
        type === 'function_call_output' || type === 'custom_tool_call_output' ||
        type === 'tool_search_output' || type === 'mcp_tool_call_output'
      ) {
        const output = toolOutputText(record);
        const name = typeof record.name === 'string' ? record.name : '';
        const callId = typeof record.call_id === 'string' ? record.call_id : '';
        if (output || 'output' in record || 'content' in record) {
          if (callId && !emittedToolCallIds.has(callId)) {
            messages.push({
              role: 'assistant',
              content: null,
              tool_calls: [{
                id: callId,
                type: 'function',
                function: { name: sanitizeToolName(name) || 'unknown_tool', arguments: '{}' },
              }],
            });
            emittedToolCallIds.add(callId);
          }
          const message: Record<string, unknown> = {
            role: 'tool',
            content: output,
            tool_call_id: callId || undefined,
          };
          if (name) message.name = name;
          messages.push(message);
        }
      }
    }
    pushSystemMessage(messages, systemTexts);
    const request: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (key === 'input' || key === 'instructions' || key === 'reasoning') continue;
      if (key === 'tools') {
        const normalizedTools = normalizeChatToolsValue(value);
        if (normalizedTools.length > 0) request.tools = normalizedTools;
        continue;
      }
      if (key === 'stream') continue;
      if (key === 'text' && value && typeof value === 'object') {
        const format = (value as Record<string, unknown>).format;
        if (format && typeof format === 'object') {
          const formatRecord = format as Record<string, unknown>;
          if (typeof formatRecord.type === 'string') {
            request.response_format = formatRecord.type === 'json_schema'
              ? {
                type: 'json_schema',
                json_schema: {
                  name: typeof formatRecord.name === 'string'
                    ? formatRecord.name
                    : 'codex_output_schema',
                  schema: formatRecord.schema,
                  strict: formatRecord.strict === true,
                },
              }
              : formatRecord;
          }
        }
        continue;
      }
      request[key] = value;
    }
    sanitizeResponsesFallbackRequest(request);
    request.model = model || String(request.model ?? '');
    request.messages = messages;
    const stream = parsed.stream !== false;
    request.stream = stream;
    if (stream) {
      request.stream_options = { include_usage: true };
    }
    return {
      model: model || '',
      messages,
      stream,
      planModeLike,
      request,
    };
  } catch {
    return null;
  }
}

function isUnsafeGeminiChatFallback(model: string, input: unknown[]): boolean {
  if (!isGeminiModel(model)) return false;
  return input.some((item) => {
    if (!item || typeof item !== 'object') return false;
    const type = typeof (item as Record<string, unknown>).type === 'string'
      ? (item as Record<string, string>).type
      : '';
    return isToolCallType(type) || isToolOutputKind(type);
  });
}

function responseTextFromChatBody(body: string): string {
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    const message = firstChatMessage(parsed);
    if (message) return typeof message.content === 'string' ? message.content : '';
    return body;
  } catch {
    return body;
  }
}

function firstChatMessage(parsed: Record<string, unknown> | null): Record<string, unknown> | null {
  const choice = Array.isArray(parsed?.choices)
    ? parsed.choices[0] as Record<string, unknown> | undefined
    : undefined;
  const message = choice && typeof choice === 'object' && choice.message &&
      typeof choice.message === 'object'
    ? choice.message as Record<string, unknown>
    : null;
  return message;
}

function parseJsonBody(body: string): Record<string, unknown> | null {
  try {
    return JSON.parse(body) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function sseFieldValue(line: string, prefixLength: number): string {
  const raw = line.slice(prefixLength);
  return raw.startsWith(' ') ? raw.slice(1) : raw;
}

function parseSseBlock(block: string): { event: string; data: string } | null {
  let event = '';
  const dataParts: string[] = [];
  for (const line of block.split(/\r?\n/)) {
    if (line.startsWith('event:')) {
      event = sseFieldValue(line, 6);
    } else if (line.startsWith('data:')) {
      dataParts.push(sseFieldValue(line, 5));
    }
  }
  if (!event || dataParts.length === 0) return null;
  return { event, data: dataParts.join('\n') };
}

function isTerminalResponsesSseEvent(type: string): boolean {
  return type === 'response.completed' ||
    type === 'response.done' ||
    type === 'response.incomplete' ||
    type === 'response.failed' ||
    type === 'error';
}

function rewriteResponseMessageItem(
  item: Record<string, unknown>,
  visibleText: string,
): Record<string, unknown> {
  const content = Array.isArray(item.content) ? item.content : [];
  let visibleLeft = visibleText;
  const rewrittenContent = content.flatMap((part) => {
    if (!part || typeof part !== 'object') return [part];
    const record = part as Record<string, unknown>;
    if (record.type !== 'output_text' || typeof record.text !== 'string') return [part];
    if (!visibleLeft) return [];
    const next = visibleLeft;
    visibleLeft = '';
    return [{ ...record, text: next }];
  });
  return {
    ...item,
    content: rewrittenContent,
  };
}

type ReasoningStreamState = {
  itemId: string;
  text: string;
  started: boolean;
  done: boolean;
};

function createReasoningStreamState(): ReasoningStreamState {
  return {
    itemId: reasoningItemId(),
    text: '',
    started: false,
    done: false,
  };
}

function restartReasoningStreamState(state: ReasoningStreamState): void {
  state.itemId = reasoningItemId();
  state.text = '';
  state.started = false;
  state.done = false;
}

function ensureReasoningStreamStarted(
  events: ResponsesEvent[],
  state: ReasoningStreamState,
): void {
  if (state.started) return;
  state.started = true;
  events.push({
    type: 'response.output_item.added',
    item: {
      id: state.itemId,
      type: 'reasoning',
      summary: [{ type: 'summary_text', text: '' }],
    },
  });
  events.push({ type: 'response.reasoning_summary_part.added', summary_index: 0 });
}

function appendReasoningTextDelta(
  events: ResponsesEvent[],
  state: ReasoningStreamState,
  text: string,
  separator = '',
): void {
  if (!text) return;
  if (state.done) restartReasoningStreamState(state);
  const delta = state.text && separator ? `${separator}${text}` : text;
  if (!delta) return;
  ensureReasoningStreamStarted(events, state);
  state.text += delta;
  events.push({
    type: 'response.reasoning_summary_text.delta',
    summary_index: 0,
    delta,
  });
}

function reasoningOutputItem(id: string, text: string): Record<string, unknown> {
  return {
    id,
    type: 'reasoning',
    summary: [{ type: 'summary_text', text }],
    content: [{ type: 'reasoning_text', text }],
  };
}

function finalizeReasoningStreamItem(
  events: ResponsesEvent[],
  state: ReasoningStreamState,
  namespaces?: Set<string>,
): void {
  if (!state.started || state.done) return;
  events.push(normalizeResponsesEvent({
    type: 'response.output_item.done',
    item: reasoningOutputItem(state.itemId, state.text),
  }, namespaces));
  state.done = true;
}

function pushReasoningDoneItem(
  events: ResponsesEvent[],
  text: string,
  namespaces?: Set<string>,
): void {
  const normalizedText = text.trim();
  if (!normalizedText) return;
  events.push(normalizeResponsesEvent({
    type: 'response.output_item.done',
    item: reasoningOutputItem(reasoningItemId(), normalizedText),
  }, namespaces));
}

function mergeReasoningTextFromMessageItem(
  item: Record<string, unknown>,
  extractedText: string,
): string {
  return mergeReasoningTexts([
    extractedText,
    extractReasoningTextFromRecord(item),
  ]);
}

function normalizeResponsesSseBody(
  body: string,
  namespaces?: Set<string>,
  planModeLike = false,
  allowedTools?: Set<string>,
  collaborationModeKind?: string | null,
): { body: string; complete: boolean; trailingDataBytes: number } {
  const thoughtSplitter = createThoughtStreamSplitter();
  const state = {
    messageText: '',
    nativeReasoningText: '',
    generatedReasoning: createReasoningStreamState(),
    messageStarted: false,
    sawTextDelta: false,
    sawOutputTextDone: false,
    responseId: `resp_${crypto.randomUUID().replace(/-/g, '')}`,
    assistantItemId: `msg_${crypto.randomUUID().replace(/-/g, '')}`,
  };
  const events: ResponsesEvent[] = [];
  const completionEvents: ResponsesEvent[] = [];
  const toolCalls = new Map<string, ChatToolCallChunk & { itemId: string }>();
  let sawTerminalFrame = false;
  let sawSuccessfulTerminalFrame = false;
  let trailingDataBytes = 0;

  const processPayload = (payload: Record<string, any>, eventType: string) => {
    if (isTerminalResponsesSseEvent(eventType)) {
      sawTerminalFrame = true;
      if (eventType === 'response.completed' || eventType === 'response.done') {
        sawSuccessfulTerminalFrame = true;
      }
    }
    if (
      eventType === 'response.completed' ||
      eventType === 'response.done' ||
      eventType === 'response.incomplete' ||
      eventType === 'response.failed'
    ) {
      completionEvents.push({
        type: eventType,
        ...payload,
      });
      return;
    }

    if (eventType === 'response.output_text.done') {
      state.sawOutputTextDone = true;
      if (typeof payload.text === 'string') {
        state.messageText = payload.text;
      }
      events.push({
        type: eventType,
        ...payload,
      });
      return;
    }

    if (eventType === 'response.output_text.delta') {
      state.sawTextDelta = true;
      const delta = typeof payload.delta === 'string' ? payload.delta : '';
      if (delta) {
        const split = thoughtSplitter.consume(delta);
        if (split.reasoningText) {
          state.nativeReasoningText = mergeReasoningTexts([
            state.nativeReasoningText,
            split.reasoningText,
          ]);
        }
        if (split.visibleText) {
          state.messageText += split.visibleText;
          events.push({ type: 'response.output_text.delta', delta: split.visibleText });
        }
      }
      return;
    }

    if (eventType === 'response.output_item.added' || eventType === 'response.output_item.done') {
      const item = payload.item && typeof payload.item === 'object'
        ? payload.item as Record<string, unknown>
        : null;
      if (item && item.type === 'message' && eventType === 'response.output_item.done') {
        let extractedReasoningText = state.nativeReasoningText;
        const rewritten = state.sawTextDelta
          ? rewriteResponseMessageItem(item, state.messageText)
          : (() => {
            const content = Array.isArray(item.content) ? item.content : [];
            const visibleParts: Array<Record<string, unknown>> = [];
            for (const part of content) {
              if (!part || typeof part !== 'object') continue;
              const record = part as Record<string, unknown>;
              if (record.type !== 'output_text' || typeof record.text !== 'string') {
                visibleParts.push(record);
                continue;
              }
              const split = extractThoughtSegments(record.text);
              if (split.reasoningText) {
                extractedReasoningText = mergeReasoningTexts([
                  extractedReasoningText,
                  split.reasoningText,
                ]);
              }
              if (split.visibleText) {
                visibleParts.push({ ...record, text: split.visibleText });
                state.messageText += split.visibleText;
              }
            }
            return { ...item, content: visibleParts };
          })();
        const itemReasoningText = mergeReasoningTextFromMessageItem(item, extractedReasoningText);
        if (!state.sawTextDelta) {
          pushReasoningDoneItem(events, itemReasoningText, namespaces);
        }
        state.nativeReasoningText = '';
        if (state.sawTextDelta && !state.sawOutputTextDone) {
          state.sawOutputTextDone = true;
          events.push({
            type: 'response.output_text.done',
            text: state.messageText,
          });
        }
        events.push(normalizeResponsesEvent({
          type: 'response.output_item.done',
          item: rewritten,
        }, namespaces));
        if (state.sawTextDelta) {
          pushReasoningDoneItem(events, itemReasoningText, namespaces);
        }
        return;
      }
      events.push(normalizeResponsesEvent({
        type: eventType,
        ...payload,
        item: item ?? undefined,
      }, namespaces));
      return;
    }

    events.push({
      type: eventType,
      ...payload,
    });
  };

  const handleOpenAiPayload = (payload: Record<string, any>) => {
    const choice = Array.isArray(payload.choices)
      ? payload.choices[0] as Record<string, unknown> | undefined
      : undefined;
    const delta =
      choice && typeof choice === 'object' && choice.delta && typeof choice.delta === 'object'
        ? choice.delta as Record<string, unknown>
        : null;
    if (delta) {
      const reasoningDelta = extractReasoningDeltaText(delta);
      if (reasoningDelta) {
        appendReasoningTextDelta(events, state.generatedReasoning, reasoningDelta);
      }
      const content = typeof delta.content === 'string' ? delta.content : '';
      if (content) {
        const split = thoughtSplitter.consume(content);
        if (split.reasoningText) {
          appendReasoningTextDelta(events, state.generatedReasoning, split.reasoningText, '\n');
        }
        if (split.visibleText) {
          finalizeReasoningStreamItem(events, state.generatedReasoning, namespaces);
          if (!state.messageStarted) {
            state.messageStarted = true;
            events.push({
              type: 'response.output_item.added',
              item: {
                id: state.assistantItemId,
                type: 'message',
                role: 'assistant',
                content: [{ type: 'output_text', text: '' }],
              },
            });
          }
          state.messageText += split.visibleText;
          events.push({ type: 'response.output_text.delta', delta: split.visibleText });
        }
      }
      for (const toolCall of parseChatToolCallDelta(delta)) {
        const existing = toolCalls.get(toolCall.slotKey);
        if (existing) {
          existing.arguments += toolCall.arguments;
          if (toolCall.callId) existing.callId = toolCall.callId;
          if (toolCall.name) existing.name = toolCall.name;
        } else {
          toolCalls.set(toolCall.slotKey, {
            ...toolCall,
            itemId: `tc_${crypto.randomUUID().replace(/-/g, '')}`,
          });
        }
      }
    }
    const finishReason = choice && typeof choice.finish_reason === 'string'
      ? choice.finish_reason
      : '';
    if (finishReason === 'tool_calls' || finishReason === 'stop') {
      sawTerminalFrame = true;
      sawSuccessfulTerminalFrame = true;
      const sortedCalls = Array.from(toolCalls.values()).sort((a, b) => a.index - b.index);
      for (const call of sortedCalls) {
        const normalizedCall = normalizeChatToolCall(
          {
            id: `${call.index}:${call.callId || call.name || 'tool'}`,
            name: call.name,
            arguments: call.arguments,
          },
          namespaces,
          allowedTools,
        );
        if (!normalizedCall || !normalizedCall.name) continue;
        events.push(normalizeResponsesEvent({
          type: 'response.output_item.done',
          item: {
            id: call.itemId,
            type: 'function_call',
            call_id: call.callId || normalizedCall.id,
            name: normalizedCall.name,
            arguments: normalizedCall.arguments,
          },
        }, namespaces));
      }
      toolCalls.clear();
    }
  };

  const lines = body.split(/\r?\n/);
  let currentEvent = '';
  let currentData = '';

  for (const line of lines) {
    if (line.startsWith('event:')) {
      currentEvent = sseFieldValue(line, 6);
    } else if (line.startsWith('data:')) {
      const data = sseFieldValue(line, 5);
      if (data === '[DONE]') {
        sawTerminalFrame = true;
        sawSuccessfulTerminalFrame = true;
      } else {
        currentData += data;
      }
    } else if (line.trim() === '' || line === 'data: [DONE]') {
      if (currentData) {
        const payload = parseJsonBody(currentData);
        if (payload) {
          if (currentEvent) {
            processPayload(payload, currentEvent);
          } else if (payload.choices) {
            handleOpenAiPayload(payload);
          }
        }
        currentEvent = '';
        currentData = '';
      }
    }
  }

  if (currentData) {
    const payload = parseJsonBody(currentData);
    if (payload) {
      if (currentEvent) {
        processPayload(payload, currentEvent);
      } else if (payload.choices) {
        handleOpenAiPayload(payload);
      }
    } else {
      trailingDataBytes = new TextEncoder().encode(currentData).length;
    }
  }

  const tail = thoughtSplitter.flush();
  if (tail.reasoningText) {
    appendReasoningTextDelta(events, state.generatedReasoning, tail.reasoningText, '\n');
  }
  if (tail.visibleText) {
    finalizeReasoningStreamItem(events, state.generatedReasoning, namespaces);
    if (!state.messageStarted) {
      state.messageStarted = true;
      events.push({
        type: 'response.output_item.added',
        item: {
          id: state.assistantItemId,
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: '' }],
        },
      });
    }
    state.messageText += tail.visibleText;
    events.push({ type: 'response.output_text.delta', delta: tail.visibleText });
  }
  finalizeReasoningStreamItem(events, state.generatedReasoning, namespaces);
  pushReasoningDoneItem(events, state.nativeReasoningText, namespaces);
  if (state.messageStarted) {
    events.push({
      type: 'response.output_item.done',
      item: {
        id: state.assistantItemId,
        type: 'message',
        role: 'assistant',
        content: [{ type: 'output_text', text: state.messageText }],
      },
    });
  }

  const hasToolCall = events.some((event) => {
    const item = event.item as Record<string, unknown> | undefined;
    return item && typeof item.type === 'string' && isToolCallType(item.type);
  });
  if (
    !hasToolCall &&
    shouldInjectContinuationTool(
      state.messageText,
      planModeLike,
      allowedTools,
      collaborationModeKind,
    )
  ) {
    events.push(normalizeResponsesEvent({
      type: 'response.output_item.done',
      item: {
        id: `tc_${crypto.randomUUID().replace(/-/g, '')}`,
        type: 'function_call',
        call_id: `call_${crypto.randomUUID().replace(/-/g, '')}`,
        name: 'exec_command',
        arguments: JSON.stringify({ cmd: continueAfterProgressCommand() }),
      },
    }, namespaces));
  }

  if (sawSuccessfulTerminalFrame && state.sawTextDelta && !state.sawOutputTextDone) {
    state.sawOutputTextDone = true;
    events.push({
      type: 'response.output_text.done',
      text: state.messageText,
    });
  }

  if (sawSuccessfulTerminalFrame && !events.some((e) => e.type === 'response.done')) {
    events.push({ type: 'response.done', response: { id: state.responseId, status: 'completed' } });
  }
  events.push(...completionEvents);
  if (sawSuccessfulTerminalFrame && !events.some((e) => e.type === 'response.completed')) {
    events.push({
      type: 'response.completed',
      response: { id: state.responseId, status: 'completed' },
    });
  }

  if (!sawTerminalFrame) {
    writeStreamLog({
      path: 'internal/responses-truncated-stream',
      complete: false,
      bodyBytes: new TextEncoder().encode(body).length,
      trailingDataBytes,
      endsWithBlankLine: /\r?\n\r?\n$/.test(body),
    });
  }

  return {
    body: buildMockSseBody(events, namespaces),
    complete: sawTerminalFrame,
    trailingDataBytes,
  };
}

function extractThoughtSegments(text: string): {
  visibleText: string;
  reasoningText: string;
} {
  const parts: string[] = [];
  const thoughts: string[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    let nextMatch: { openIndex: number; openTag: string; closeTag: string } | null = null;
    let nextCloseMatch: { closeIndex: number; closeTag: string } | null = null;
    for (const pair of THOUGHT_TAG_PAIRS) {
      const openIndex = text.indexOf(pair.openTag, cursor);
      if (openIndex === -1) continue;
      if (!nextMatch || openIndex < nextMatch.openIndex) {
        nextMatch = { openIndex, openTag: pair.openTag, closeTag: pair.closeTag };
      }
    }
    for (const pair of THOUGHT_TAG_PAIRS) {
      const closeIndex = text.indexOf(pair.closeTag, cursor);
      if (closeIndex === -1) continue;
      if (!nextCloseMatch || closeIndex < nextCloseMatch.closeIndex) {
        nextCloseMatch = { closeIndex, closeTag: pair.closeTag };
      }
    }
    if (nextCloseMatch && (!nextMatch || nextCloseMatch.closeIndex < nextMatch.openIndex)) {
      parts.push(text.slice(cursor, nextCloseMatch.closeIndex));
      cursor = nextCloseMatch.closeIndex + nextCloseMatch.closeTag.length;
      continue;
    }
    if (!nextMatch) {
      parts.push(text.slice(cursor));
      break;
    }
    parts.push(text.slice(cursor, nextMatch.openIndex));
    const contentStart = nextMatch.openIndex + nextMatch.openTag.length;
    const closeIndex = text.indexOf(nextMatch.closeTag, contentStart);
    if (closeIndex === -1) {
      thoughts.push(text.slice(contentStart).trim());
      break;
    }
    thoughts.push(text.slice(contentStart, closeIndex).trim());
    cursor = closeIndex + nextMatch.closeTag.length;
  }
  return {
    visibleText: stripResidualThoughtTags(joinVisibleThoughtParts(parts)).trim(),
    reasoningText: thoughts.filter(Boolean).join('\n').trim(),
  };
}

function joinVisibleThoughtParts(parts: string[]): string {
  let current = '';
  for (const part of parts) {
    if (!part) continue;
    if (!current) {
      current = part;
      continue;
    }
    if (/[^\S\r\n]$/.test(current) && /^[^\S\r\n]/.test(part)) {
      current = `${current.replace(/[^\S\r\n]+$/, ' ')}${part.replace(/^[^\S\r\n]+/, '')}`;
      continue;
    }
    current += part;
  }
  return current;
}

function stripResidualThoughtTags(text: string): string {
  let current = text;
  for (const token of THOUGHT_TAG_TOKENS) {
    current = current.split(token).join('');
  }
  return current;
}

function longestSuffixPrefix(text: string, token: string): number {
  const max = Math.min(text.length, token.length - 1);
  for (let length = max; length > 0; length--) {
    if (text.slice(text.length - length) === token.slice(0, length)) {
      return length;
    }
  }
  return 0;
}

function createThoughtStreamSplitter() {
  let pending = '';
  let activeCloseTag: string | null = null;

  const longestPartialThoughtTag = (text: string): number => {
    let longest = 0;
    for (const token of THOUGHT_TAG_TOKENS) {
      longest = Math.max(longest, longestSuffixPrefix(text, token));
    }
    return longest;
  };

  const earliestOpenTag = (
    text: string,
  ): { index: number; openTag: string; closeTag: string } | null => {
    let nextMatch: { index: number; openTag: string; closeTag: string } | null = null;
    for (const pair of THOUGHT_TAG_PAIRS) {
      const index = text.indexOf(pair.openTag);
      if (index === -1) continue;
      if (!nextMatch || index < nextMatch.index) {
        nextMatch = { index, openTag: pair.openTag, closeTag: pair.closeTag };
      }
    }
    return nextMatch;
  };

  const earliestCloseTag = (text: string): { index: number; closeTag: string } | null => {
    let nextMatch: { index: number; closeTag: string } | null = null;
    for (const pair of THOUGHT_TAG_PAIRS) {
      const index = text.indexOf(pair.closeTag);
      if (index === -1) continue;
      if (!nextMatch || index < nextMatch.index) {
        nextMatch = { index, closeTag: pair.closeTag };
      }
    }
    return nextMatch;
  };

  const trimTrailingPartialThoughtTag = (text: string): string => {
    const partial = longestPartialThoughtTag(text);
    return partial > 0 ? text.slice(0, text.length - partial) : text;
  };

  return {
    consume(chunk: string): { visibleText: string; reasoningText: string } {
      pending += chunk;
      const visible: string[] = [];
      const reasoning: string[] = [];

      while (pending) {
        if (!activeCloseTag) {
          const nextTag = earliestOpenTag(pending);
          const nextClose = earliestCloseTag(pending);
          if (nextClose && (!nextTag || nextClose.index < nextTag.index)) {
            if (nextClose.index > 0) {
              visible.push(pending.slice(0, nextClose.index));
            }
            pending = pending.slice(nextClose.index + nextClose.closeTag.length);
            continue;
          }
          if (!nextTag) {
            const keep = longestPartialThoughtTag(pending);
            const emit = pending.slice(0, pending.length - keep);
            if (emit) visible.push(emit);
            pending = pending.slice(pending.length - keep);
            break;
          }
          if (nextTag.index > 0) {
            visible.push(pending.slice(0, nextTag.index));
          }
          pending = pending.slice(nextTag.index + nextTag.openTag.length);
          activeCloseTag = nextTag.closeTag;
          continue;
        }

        const closeIndex = pending.indexOf(activeCloseTag);
        if (closeIndex === -1) {
          const keep = longestSuffixPrefix(pending, activeCloseTag);
          const emit = pending.slice(0, pending.length - keep);
          if (emit) reasoning.push(emit);
          pending = pending.slice(pending.length - keep);
          break;
        }
        if (closeIndex > 0) {
          reasoning.push(pending.slice(0, closeIndex));
        }
        pending = pending.slice(closeIndex + activeCloseTag.length);
        activeCloseTag = null;
      }

      return {
        visibleText: stripResidualThoughtTags(joinVisibleThoughtParts(visible)),
        reasoningText: reasoning.join(''),
      };
    },
    flush(): { visibleText: string; reasoningText: string } {
      const remaining = pending;
      pending = '';
      const visibleText = activeCloseTag
        ? ''
        : stripResidualThoughtTags(trimTrailingPartialThoughtTag(remaining));
      const reasoningText = activeCloseTag ? trimTrailingPartialThoughtTag(remaining) : '';
      activeCloseTag = null;
      return {
        visibleText,
        reasoningText,
      };
    },
  };
}

function responsesFallbackEventsFromChat(chatBody: string, planModeLike = false): ResponsesEvent[] {
  const content = responseTextFromChatBody(chatBody);
  const split = extractThoughtSegments(content);
  const responseId = `resp_${crypto.randomUUID().replace(/-/g, '')}`;
  const events: ResponsesEvent[] = [
    { type: 'response.created', response: { id: responseId } },
  ];
  const reasoningState = createReasoningStreamState();
  if (split.reasoningText) {
    appendReasoningTextDelta(events, reasoningState, split.reasoningText);
    finalizeReasoningStreamItem(events, reasoningState);
  }
  if (split.visibleText) {
    events.push({
      type: 'response.output_item.done',
      item: {
        id: `msg_${crypto.randomUUID().replace(/-/g, '')}`,
        type: 'message',
        role: 'assistant',
        content: [
          {
            type: 'output_text',
            text: split.visibleText,
          },
        ],
      },
    });
  }
  events.push({ type: 'response.completed', response: { id: responseId } });
  return events;
}

type ChatToolCall = {
  id: string;
  name: string;
  arguments: string;
};

type ChatToolCallChunk = {
  slotKey: string;
  index: number;
  callId: string;
  name: string;
  arguments: string;
};

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function redactSensitiveFileCommand(path: string): string {
  const quoted = shellQuote(path);
  if (/(^|\/)\.env(?:\..*)?$/i.test(path)) {
    return `sed -E 's/(OPENAI_API_KEY|AUTH|TOKEN|KEY|SECRET)=.*/\\1=<redacted>/I' ${quoted}`;
  }
  return `cat ${quoted}`;
}

function unsupportedToolNoticeCommand(name: string): string {
  const message =
    `Tool ${name} is unavailable in chat fallback; continue with exec_command/MCP tools or provide the final answer.`;
  return `printf '%s\\n' ${shellQuote(message)}`;
}

function isProgressOnlyMessage(text: string): boolean {
  const normalized = text.trim();
  if (!normalized) return false;
  if (/项目用途|主要模块|主要风险|主要检查|实际运行|检查结果|风险[:：]/.test(normalized)) {
    return false;
  }
  const chineseProgress = /我(?:会|将|先|再|继续)|接下来|下一步|按.*顺序|最后/.test(normalized) &&
    /读取|查看|检查|运行|执行|评估|汇总|总结|了解|分析/.test(normalized);
  const englishProgress =
    /\b(?:let me|i(?:'ll| will| am going to)?|i’ll|next|now|then|after that)\b/i
      .test(normalized) &&
    /\b(?:check|inspect|read|look|run|execute|verify|investigate|analy[sz]e|review|gather|open)\b/i
      .test(normalized);
  return chineseProgress || englishProgress;
}

function continueAfterProgressCommand(): string {
  return `printf '%s\\n' ${
    shellQuote(
      'Progress-only message received in chat fallback. Continue now: call a read-only tool if more evidence is needed, otherwise provide the final answer.',
    )
  }`;
}

function hasFinalAnswerMarkers(text: string): boolean {
  return /项目用途|主要模块|主要风险|主要检查|实际运行|检查结果|发现的主要风险|评估结果|以下是|结论|总结如下|我已完成|summary|conclusion|findings|done|completed/i
    .test(
      text,
    );
}

export function normalizeChatToolCall(
  call: ChatToolCall,
  namespaces?: Set<string>,
  allowedTools?: Set<string>,
): ChatToolCall | null {
  let name = repairCollapsedNamespacedToolName(call.name, namespaces);
  call = { ...call, name };

  // Support robust dot-notation mapping for any raw/partially normalized namespace (e.g. "code_index.read_mcp_resource" -> "mcp__code_index__read_mcp_resource")
  if (name.includes('.')) {
    const parts = name.split('.');
    const prefix = parts[0];
    const rest = parts.slice(1).join('.');
    const normalizedPrefix = robustNormalizeServerName(prefix);
    if (namespaces && namespaces.has(normalizedPrefix)) {
      name = normalizedPrefix + rest;
      call = { ...call, name };
    }
  }

  if (namespaces) {
    for (const ns of namespaces) {
      if (name.startsWith(ns + '.')) {
        name = flattenNamespacedToolName(ns, name.slice(ns.length + 1));
        call = { ...call, name };
        break;
      }
    }
  }

  // De-normalize server names in arguments immediately if present (e.g. "code_index" -> "code-index")
  if (typeof call.arguments === 'string') {
    try {
      const args = JSON.parse(call.arguments);
      if (typeof args.server === 'string') {
        const original = args.server;
        const denormalized = robustDenormalizeServerName(original);
        if (denormalized !== original) {
          args.server = denormalized;
          call = { ...call, arguments: JSON.stringify(args) };
        }
      }
    } catch {
      // Ignore
    }
  }

  if (call.name === 'exec_command') {
    if (allowedTools && !allowedTools.has('exec_command')) return null;
    try {
      const args = JSON.parse(call.arguments || '{}') as Record<string, unknown>;
      if (typeof args.cmd !== 'string' && typeof args.command === 'string') {
        args.cmd = args.command;
        delete args.command;
        return { ...call, arguments: JSON.stringify(args) };
      }
    } catch {
      return call;
    }
    return call;
  }

  if (allowedTools?.has(call.name)) {
    return call;
  }

  if (call.name === 'read') {
    if (allowedTools && !allowedTools.has('exec_command')) return null;
    try {
      const args = JSON.parse(call.arguments || '{}') as Record<string, unknown>;
      const path = typeof args.filePath === 'string'
        ? args.filePath
        : typeof args.path === 'string'
        ? args.path
        : '';
      if (!path) return null;
      return {
        ...call,
        name: 'exec_command',
        arguments: JSON.stringify({ cmd: redactSensitiveFileCommand(path) }),
      };
    } catch {
      return null;
    }
  }

  if (namespaces) {
    for (const ns of namespaces) {
      if (splitFlattenedNamespacedToolName(call.name, ns)) {
        return call;
      }
    }
  }

  if (allowedTools?.has('exec_command')) {
    return {
      ...call,
      name: 'exec_command',
      arguments: JSON.stringify({ cmd: unsupportedToolNoticeCommand(call.name || 'unknown') }),
    };
  }

  return allowedTools && allowedTools.size > 0 ? null : call;
}

function shouldInjectContinuationTool(
  text: string,
  planModeLike: boolean,
  allowedTools?: Set<string>,
  collaborationModeKind?: string | null,
): boolean {
  if (collaborationModeKind === 'plan') return false;
  if (!planModeLike) return false;
  if (allowedTools && !allowedTools.has('exec_command')) return false;
  const normalized = text.trim();
  if (!normalized) return false;
  if (hasFinalAnswerMarkers(normalized)) return false;
  if (/<proposed_plan>[\s\S]*<\/proposed_plan>/i.test(normalized)) return false;
  return isProgressOnlyMessage(normalized);
}

function parseChatToolCallDelta(
  delta: Record<string, unknown>,
): Array<ChatToolCallChunk> {
  const rawToolCalls = Array.isArray(delta.tool_calls) ? delta.tool_calls : [];
  return rawToolCalls.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const record = entry as Record<string, unknown>;
    const index = typeof record.index === 'number' ? record.index : 0;
    const functionRecord = record.function && typeof record.function === 'object'
      ? record.function as Record<string, unknown>
      : {};
    const callId = typeof record.id === 'string' ? record.id : '';
    const name = typeof functionRecord.name === 'string' ? functionRecord.name : '';
    const argsPart = typeof functionRecord.arguments === 'string' ? functionRecord.arguments : '';
    return [{
      slotKey: String(index),
      index,
      callId,
      name,
      arguments: argsPart,
    }];
  });
}

function collectResponsesEventsFromChatChunkText(
  chatText: string,
  namespaces?: Set<string>,
  planModeLike = false,
  allowedTools?: Set<string>,
  collaborationModeKind?: string | null,
): {
  events: ResponsesEvent[];
  usage: Record<string, unknown> | null;
  complete: boolean;
  trailingDataBytes: number;
} {
  const events: ResponsesEvent[] = [];
  const responseId = `resp_${crypto.randomUUID().replace(/-/g, '')}`;
  const assistantItemId = `msg_${crypto.randomUUID().replace(/-/g, '')}`;
  const messageState = {
    started: false,
    text: '',
  };
  const reasoningState = createReasoningStreamState();
  const thoughtSplitter = createThoughtStreamSplitter();
  const toolCalls = new Map<string, ChatToolCallChunk & { itemId: string }>();
  let usage: Record<string, unknown> | null = null;
  let sawStopWithoutToolCall = false;
  let sawTerminalFrame = false;
  events.push({ type: 'response.created', response: { id: responseId } });
  let dataBuffer = '';
  // Legacy fallback parser: this function receives a fully buffered upstream
  // Chat Completions SSE body. It is intentionally not used as proof that a
  // stream completed; only explicit [DONE] or terminal finish_reason can do
  // that. Without this guard, a truncated upstream body would be rebuilt as a
  // successful Responses stream and make clients stop too early.
  for (const line of chatText.split(/\r?\n/)) {
    if (line.startsWith('data:')) {
      const data = sseFieldValue(line, 5);
      if (data === '[DONE]') {
        sawTerminalFrame = true;
        continue;
      }
      dataBuffer += data;
      continue;
    }
    if (line.trim() !== '' || !dataBuffer) continue;
    const parsed = parseJsonBody(dataBuffer);
    dataBuffer = '';
    if (!parsed) continue;
    if (parsed.usage && typeof parsed.usage === 'object') {
      usage = parsed.usage as Record<string, unknown>;
    }
    const choice = Array.isArray(parsed.choices)
      ? parsed.choices[0] as Record<string, unknown> | undefined
      : undefined;
    const delta =
      choice && typeof choice === 'object' && choice.delta && typeof choice.delta === 'object'
        ? choice.delta as Record<string, unknown>
        : null;
    if (delta) {
      const reasoningDelta = extractReasoningDeltaText(delta);
      if (reasoningDelta) {
        appendReasoningTextDelta(events, reasoningState, reasoningDelta);
      }
      const content = typeof delta.content === 'string' ? delta.content : '';
      if (content) {
        const split = thoughtSplitter.consume(content);
        if (split.reasoningText) {
          appendReasoningTextDelta(events, reasoningState, split.reasoningText, '\n');
        }
        const visibleContent = split.visibleText;
        if (visibleContent) {
          finalizeReasoningStreamItem(events, reasoningState, namespaces);
          if (!messageState.started) {
            messageState.started = true;
            events.push({
              type: 'response.output_item.added',
              item: {
                id: assistantItemId,
                type: 'message',
                role: 'assistant',
                content: [{ type: 'output_text', text: '' }],
              },
            });
          }
          messageState.text += visibleContent;
          events.push({ type: 'response.output_text.delta', delta: visibleContent });
        }
      }
      for (const toolCall of parseChatToolCallDelta(delta)) {
        const existing = toolCalls.get(toolCall.slotKey);
        if (existing) {
          existing.arguments += toolCall.arguments;
          if (toolCall.callId) existing.callId = toolCall.callId;
          if (toolCall.name) existing.name = toolCall.name;
        } else {
          toolCalls.set(toolCall.slotKey, {
            ...toolCall,
            itemId: `tc_${crypto.randomUUID().replace(/-/g, '')}`,
          });
        }
      }
    }
    const finishReason = choice && typeof choice.finish_reason === 'string'
      ? choice.finish_reason
      : '';
    if (finishReason === 'stop') {
      sawStopWithoutToolCall = toolCalls.size === 0;
    }
    if (finishReason === 'tool_calls' || finishReason === 'stop') {
      sawTerminalFrame = true;
      const sortedCalls = Array.from(toolCalls.values()).sort((a, b) => a.index - b.index);
      for (const call of sortedCalls) {
        const normalizedCall = normalizeChatToolCall(
          {
            id: `${call.index}:${call.callId || call.name || 'tool'}`,
            name: call.name,
            arguments: call.arguments,
          },
          namespaces,
          allowedTools,
        );
        if (!normalizedCall || !normalizedCall.name) continue;
        events.push(normalizeResponsesEvent({
          type: 'response.output_item.done',
          item: {
            id: call.itemId,
            type: 'function_call',
            call_id: call.callId || normalizedCall.id,
            name: normalizedCall.name,
            arguments: normalizedCall.arguments,
          },
        }, namespaces));
      }
      toolCalls.clear();
    }
  }
  const tail = thoughtSplitter.flush();
  if (tail.reasoningText) {
    appendReasoningTextDelta(events, reasoningState, tail.reasoningText, '\n');
  }
  if (tail.visibleText) {
    finalizeReasoningStreamItem(events, reasoningState, namespaces);
    if (!messageState.started) {
      messageState.started = true;
      events.push({
        type: 'response.output_item.added',
        item: {
          id: assistantItemId,
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: '' }],
        },
      });
    }
    messageState.text += tail.visibleText;
    events.push({ type: 'response.output_text.delta', delta: tail.visibleText });
  }
  finalizeReasoningStreamItem(events, reasoningState, namespaces);
  if (messageState.started) {
    events.push({
      type: 'response.output_text.done',
      text: messageState.text,
    });
    events.push({
      type: 'response.output_item.done',
      item: {
        id: assistantItemId,
        type: 'message',
        role: 'assistant',
        content: [{ type: 'output_text', text: messageState.text }],
      },
    });
  }
  if (
    sawStopWithoutToolCall &&
    shouldInjectContinuationTool(
      messageState.text,
      planModeLike,
      allowedTools,
      collaborationModeKind,
    )
  ) {
    events.push(normalizeResponsesEvent({
      type: 'response.output_item.done',
      item: {
        id: `tc_${crypto.randomUUID().replace(/-/g, '')}`,
        type: 'function_call',
        call_id: `call_${crypto.randomUUID().replace(/-/g, '')}`,
        name: 'exec_command',
        arguments: JSON.stringify({ cmd: continueAfterProgressCommand() }),
      },
    }, namespaces));
  }
  if (sawTerminalFrame) {
    events.push({
      type: 'response.done',
      response: { id: responseId, usage: normalizeChatUsage(usage), status: 'completed' },
    });
    events.push({
      type: 'response.completed',
      response: { id: responseId, usage: normalizeChatUsage(usage), status: 'completed' },
    });
  } else {
    writeStreamLog({
      path: 'internal/chat-fallback-truncated-stream',
      complete: false,
      bodyBytes: new TextEncoder().encode(chatText).length,
      trailingDataBytes: new TextEncoder().encode(dataBuffer).length,
      hasDone: chatText.includes('data: [DONE]'),
      endsWithBlankLine: /\r?\n\r?\n$/.test(chatText),
    });
  }
  return { events, usage, complete: sawTerminalFrame, trailingDataBytes: dataBuffer.length };
}

function normalizeChatUsage(usage: Record<string, unknown> | null): Record<string, unknown> {
  const promptTokens = typeof usage?.prompt_tokens === 'number'
    ? usage.prompt_tokens
    : typeof usage?.input_tokens === 'number'
    ? usage.input_tokens
    : 0;
  const cachedTokens =
    typeof usage?.prompt_tokens_details === 'object' && usage.prompt_tokens_details
      ? typeof (usage.prompt_tokens_details as Record<string, unknown>).cached_tokens === 'number'
        ? (usage.prompt_tokens_details as Record<string, unknown>).cached_tokens
        : 0
      : 0;
  const completionTokens = typeof usage?.completion_tokens === 'number'
    ? usage.completion_tokens
    : typeof usage?.output_tokens === 'number'
    ? usage.output_tokens
    : 0;
  const reasoningTokens =
    typeof usage?.completion_tokens_details === 'object' && usage.completion_tokens_details
      ? typeof (usage.completion_tokens_details as Record<string, unknown>).reasoning_tokens ===
          'number'
        ? (usage.completion_tokens_details as Record<string, unknown>).reasoning_tokens
        : 0
      : 0;
  const totalTokens = typeof usage?.total_tokens === 'number'
    ? usage.total_tokens
    : promptTokens + completionTokens;
  return {
    input_tokens: promptTokens,
    input_tokens_details: { cached_tokens: cachedTokens },
    output_tokens: completionTokens,
    output_tokens_details: { reasoning_tokens: reasoningTokens },
    total_tokens: totalTokens,
  };
}

function responsesFallbackResponseFromChat(
  chatResponseBody: string,
  stream: boolean,
  namespaces?: Set<string>,
  planModeLike = false,
  allowedTools?: Set<string>,
  collaborationModeKind?: string | null,
): Response {
  if (stream) {
    const { events, complete, trailingDataBytes } = collectResponsesEventsFromChatChunkText(
      chatResponseBody,
      namespaces,
      planModeLike,
      allowedTools,
      collaborationModeKind,
    );
    if (!complete) {
      events.push({
        type: 'error',
        error: {
          message: 'Upstream chat fallback stream ended before a terminal SSE frame.',
          type: 'upstream_stream_incomplete',
          trailingDataBytes,
        },
      });
    }
    return new Response(buildMockSseBody(events), {
      status: complete ? 200 : 502,
      headers: { 'content-type': 'text/event-stream; charset=utf-8' },
    });
  }
  const parsed = parseJsonBody(chatResponseBody);
  const message = firstChatMessage(parsed);
  const rawContent = responseTextFromChatBody(chatResponseBody);
  const split = extractThoughtSegments(rawContent);
  const reasoningText = mergeReasoningTexts([
    message ? extractReasoningTextFromRecord(message) : '',
    split.reasoningText,
  ]);
  const output: Array<Record<string, unknown>> = [];
  if (reasoningText) {
    output.push({
      type: 'reasoning',
      summary: [{ type: 'summary_text', text: reasoningText }],
      encrypted_content: null,
      content: [{ type: 'reasoning_text', text: reasoningText }],
    });
  }
  if (split.visibleText) {
    output.push({
      type: 'message',
      role: 'assistant',
      content: [{ type: 'output_text', text: split.visibleText }],
    });
  }

  const choice = Array.isArray(parsed?.choices)
    ? parsed.choices[0] as Record<string, any> | undefined
    : undefined;
  const toolCalls = Array.isArray(choice?.message?.tool_calls) ? choice.message.tool_calls : [];
  for (const tc of toolCalls) {
    if (!tc || typeof tc !== 'object') continue;
    const id = typeof tc.id === 'string' ? tc.id : '';
    const functionRecord = tc.function && typeof tc.function === 'object'
      ? tc.function as Record<string, unknown>
      : {};
    const name = typeof functionRecord.name === 'string' ? functionRecord.name : '';
    const args = typeof functionRecord.arguments === 'string' ? functionRecord.arguments : '';
    const normalizedCall = normalizeChatToolCall(
      { id, name, arguments: args },
      namespaces,
      allowedTools,
    );
    if (!normalizedCall) continue;
    const normalizedEvent = normalizeResponsesEvent({
      type: 'response.output_item.done',
      item: {
        id: `tc_${crypto.randomUUID().replace(/-/g, '')}`,
        type: 'function_call',
        call_id: normalizedCall.id,
        name: normalizedCall.name,
        arguments: normalizedCall.arguments,
      },
    }, namespaces);
    output.push(normalizedEvent.item as Record<string, unknown>);
  }

  if (
    planModeLike && split.visibleText &&
    shouldInjectContinuationTool(split.visibleText, true, allowedTools, collaborationModeKind)
  ) {
    output.push({
      type: 'function_call',
      id: `tc_${crypto.randomUUID().replace(/-/g, '')}`,
      call_id: `call_${crypto.randomUUID().replace(/-/g, '')}`,
      name: 'exec_command',
      arguments: JSON.stringify({ cmd: continueAfterProgressCommand() }),
    });
  }

  return new Response(
    JSON.stringify({
      id: `resp_${crypto.randomUUID().replace(/-/g, '')}`,
      object: 'response',
      output,
      output_text: split.visibleText,
      usage: normalizeChatUsage(
        parsed && parsed.usage && typeof parsed.usage === 'object'
          ? parsed.usage as Record<string, unknown>
          : null,
      ),
      status: 'completed',
    }),
    {
      status: 200,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    },
  );
}

function responsesFallbackStreamFromChat(chatBody: string): Response {
  return new Response(buildMockSseBody(responsesFallbackEventsFromChat(chatBody)), {
    status: 200,
    headers: { 'content-type': 'text/event-stream; charset=utf-8' },
  });
}

function chatPathFromResponsesPath(path: string): string {
  const queryIndex = path.indexOf('?');
  const query = queryIndex === -1 ? '' : path.slice(queryIndex);
  return `/v1/chat/completions${query}`;
}

function buildUpstreamUrl(target: string, requestPath: string, preserveBasePath: boolean): string {
  if (!preserveBasePath) return new URL(requestPath, target).toString();
  const baseUrl = new URL(target.endsWith('/') ? target : `${target}/`);
  const basePath = baseUrl.pathname.replace(/\/+$/, '');
  let relativePath = requestPath.replace(/^\/+/, '');
  if (basePath.endsWith('/v1') && relativePath.startsWith('v1/')) {
    relativePath = relativePath.slice('v1/'.length);
  }
  return new URL(relativePath, baseUrl).toString();
}

async function forwardWithFallback(
  path: string,
  req: Request,
  config: ProxyConfig,
  body: string | undefined,
  baseHeaders: Headers,
  rawBody?: string,
  turnContext?: ProxyTurnContext,
): Promise<Response> {
  const useResponses = path.includes('/responses');
  const responsesTarget = config.responsesBaseUrl || null;
  const firstTarget = useResponses ? (responsesTarget ?? config.chatBaseUrl) : config.chatBaseUrl;
  const planModeLike = turnContext?.collaborationModeKind === 'plan' ||
    turnContext?.collaborationModeKind === 'goal' ||
    turnContext?.collaborationModeKind === 'code';

  const sendOnce = async (
    target: string,
    requestPath: string,
    requestBody: string | undefined,
    retryAttempt = 0,
  ) => {
    const headers = forwardHeaders(baseHeaders, nextApiKey(config), config.authToken);
    await waitForRequestInterval(config.requestIntervalMs, req.signal);
    const upstreamUrl = buildUpstreamUrl(target, requestPath, config.isCloudflare);
    writeUpstreamLog({
      path,
      target: upstreamUrl,
      requestPath,
      method: req.method,
      retryAttempt,
      headers: {
        authorization: redactToken(headers.get('authorization')),
        'x-api-key': redactToken(headers.get('x-api-key')),
        'api-key': redactToken(headers.get('api-key')),
        'content-type': headers.get('content-type'),
      },
      body: requestBody,
    });
    return await forwardJson(upstreamUrl, {
      method: req.method,
      headers,
      body: requestBody,
      signal: req.signal,
    });
  };

  const send = async (target: string, requestPath: string, requestBody: string | undefined) => {
    const maxRetries = 5;
    let response = await sendOnce(target, requestPath, requestBody);
    const refreshedKey = await refreshGlmKeyFromErrorResponse(response, config);
    if (refreshedKey) {
      response = await sendOnce(target, requestPath, requestBody, 0);
      await maybeTriggerImmediateGlmKeyRefresh(response, config);
    } else {
      await maybeTriggerImmediateGlmKeyRefresh(response, config);
    }
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      if (!config.needRetry || !(await shouldRetryUpstreamResponse(response))) {
        return response;
      }
      const delayMs = retryDelayMs(config);
      writeUpstreamLog({
        path: 'internal/upstream-retry',
        target: buildUpstreamUrl(target, requestPath, config.isCloudflare),
        requestPath,
        status: response.status,
        delayMs,
        retryAttempt: attempt,
      });
      await sleep(delayMs, req.signal);
      response = await sendOnce(target, requestPath, requestBody, attempt);
      await maybeTriggerImmediateGlmKeyRefresh(response, config);
    }
    return response;
  };

  if (!useResponses) {
    return await send(firstTarget, path, body);
  }

  const responsesRequestBody = body;
  const responsesPath = '/v1/responses';
  const chatPath = chatPathFromResponsesPath(path);

  const sendChatFallback = async (
    target: string,
    allowUnsafeGeminiToolHistory = false,
  ): Promise<Response | null> => {
    const fallback = extractChatFallbackFromResponsesBody(
      responsesRequestBody,
      planModeLike,
      allowUnsafeGeminiToolHistory,
      config.nvidiaCompat,
    );
    if (fallback === null) return null;
    const chatResponse = await send(target, chatPath, JSON.stringify(fallback.request));
    if (!chatResponse.ok) return chatResponse;
    const text = await chatResponse.text();
    writeResponseLog({
      path,
      target,
      status: chatResponse.status,
      headers: Object.fromEntries(chatResponse.headers.entries()),
      body: text,
      fallback: true,
      stage: 'upstream_chat_fallback_raw',
    });
    if ((chatResponse.headers.get('content-type') ?? '').includes('text/event-stream')) {
      writeStreamLog({
        path,
        target,
        status: chatResponse.status,
        headers: Object.fromEntries(chatResponse.headers.entries()),
        body: text,
        fallback: true,
        stage: 'upstream_chat_fallback_stream_raw',
      });
    }
    const normalizedToolBody = responsesRequestBody ?? rawBody;
    const namespaces = extractNamespacesFromBody(normalizedToolBody);
    const allowedTools = extractAllowedChatToolNames(normalizedToolBody);
    const isChatSse = (chatResponse.headers.get('content-type') ?? '').includes(
      'text/event-stream',
    );
    return responsesFallbackResponseFromChat(
      text,
      fallback.stream && isChatSse,
      namespaces,
      fallback.planModeLike,
      allowedTools,
      turnContext?.collaborationModeKind,
    );
  };

  if (config.forceChatCompletions) {
    return await sendChatFallback(config.chatBaseUrl, true) ??
      unconvertibleResponsesRequestResponse();
  }

  if (!responsesTarget) {
    const fallbackResponse = await sendChatFallback(firstTarget);
    if (fallbackResponse) return fallbackResponse;
  }

  const responsesResponse = await send(firstTarget, responsesPath, responsesRequestBody).catch(
    (error) => {
      if (!isFallbackEligibleError(error)) throw error;
      return null;
    },
  );
  if (
    responsesResponse && !responsesResponse.ok &&
    !isFallbackEligibleStatus(responsesResponse.status)
  ) {
    if (await isResponsesToolHistoryError(responsesResponse)) {
      writeUpstreamLog({
        path: 'internal/responses-tool-history-fallback',
        requestPath: responsesPath,
        status: responsesResponse.status,
      });
      const fallbackResponse = await sendChatFallback(config.chatBaseUrl, true);
      if (fallbackResponse) return fallbackResponse;
    }
    return responsesResponse;
  }
  if (responsesResponse && responsesResponse.ok) {
    const contentType = responsesResponse.headers.get('content-type') ?? '';
    const text = await responsesResponse.text();
    writeResponseLog({
      path,
      target: firstTarget,
      status: responsesResponse.status,
      headers: Object.fromEntries(responsesResponse.headers.entries()),
      body: text,
      stage: 'upstream_responses_raw',
    });
    if (contentType.includes('text/event-stream')) {
      writeStreamLog({
        path,
        target: firstTarget,
        status: responsesResponse.status,
        headers: Object.fromEntries(responsesResponse.headers.entries()),
        body: text,
        stage: 'upstream_responses_stream_raw',
      });
    }
    const normalizedToolBody = responsesRequestBody ?? rawBody;
    const namespaces = extractNamespacesFromBody(normalizedToolBody);
    const allowedTools = extractAllowedChatToolNames(normalizedToolBody);
    if (contentType.includes('text/event-stream')) {
      const normalized = normalizeResponsesSseBody(
        text,
        namespaces,
        planModeLike,
        allowedTools,
        turnContext?.collaborationModeKind,
      );
      if (!normalized.complete) {
        const events: ResponsesEvent[] = [];
        if (normalized.body) {
          events.push(
            ...normalized.body.trim().split(/\n\n+/).flatMap((block) => {
              const parsed = parseSseBlock(block);
              if (!parsed) return [];
              try {
                return [JSON.parse(parsed.data) as ResponsesEvent];
              } catch {
                return [];
              }
            }),
          );
        }
        events.push({
          type: 'error',
          error: {
            message: 'Upstream responses stream ended before a terminal SSE frame.',
            type: 'upstream_stream_incomplete',
            trailingDataBytes: normalized.trailingDataBytes,
          },
        });
        return new Response(buildMockSseBody(events, namespaces), {
          status: 502,
          headers: rewrittenBodyHeaders(responsesResponse.headers),
        });
      }
      return new Response(normalized.body, {
        status: responsesResponse.status,
        headers: rewrittenBodyHeaders(responsesResponse.headers),
      });
    }
    const parsed = parseJsonBody(text);
    if (!parsed) {
      return responsesResponse;
    }
    const output = Array.isArray(parsed.output)
      ? parsed.output as Array<Record<string, unknown>>
      : [];
    const normalizedOutput: Array<Record<string, unknown>> = [];
    for (const item of output) {
      if (!item || typeof item !== 'object') continue;
      if (item.type === 'message') {
        let itemReasoningText = extractReasoningTextFromRecord(item);
        const content = Array.isArray(item.content) ? item.content : [];
        const visibleParts: Array<Record<string, unknown>> = [];
        for (const part of content) {
          if (!part || typeof part !== 'object') continue;
          const record = part as Record<string, unknown>;
          if (record.type !== 'output_text' || typeof record.text !== 'string') {
            visibleParts.push(record);
            continue;
          }
          const split = extractThoughtSegments(record.text);
          if (split.reasoningText) {
            itemReasoningText = mergeReasoningTexts([itemReasoningText, split.reasoningText]);
          }
          if (split.visibleText) {
            visibleParts.push({ ...record, text: split.visibleText });
          }
        }
        if (itemReasoningText) {
          normalizedOutput.push(reasoningOutputItem(reasoningItemId(), itemReasoningText));
        }
        normalizedOutput.push({ ...item, content: visibleParts });
        continue;
      }
      const normalizedEvent = normalizeResponsesEvent({
        type: 'response.output_item.done',
        item,
      }, namespaces);
      normalizedOutput.push(normalizedEvent.item as Record<string, unknown>);
    }
    parsed.output = normalizedOutput;
    if (typeof parsed.output_text === 'string') {
      const split = extractThoughtSegments(parsed.output_text);
      parsed.output_text = split.visibleText;
      if (split.reasoningText && !normalizedOutput.some((item) => item.type === 'reasoning')) {
        normalizedOutput.unshift({
          type: 'reasoning',
          summary: [{ type: 'summary_text', text: split.reasoningText }],
          encrypted_content: null,
          content: [{ type: 'reasoning_text', text: split.reasoningText }],
        });
      }
    }
    if (!Array.isArray(parsed.output) || parsed.output.length === 0) {
      const isChatCompletion = Array.isArray(parsed.choices);
      if (isChatCompletion) {
        return responsesFallbackResponseFromChat(
          text,
          false,
          namespaces,
          planModeLike,
          allowedTools,
          turnContext?.collaborationModeKind,
        );
      }
    }
    return new Response(JSON.stringify(parsed), {
      status: responsesResponse.status,
      headers: rewrittenBodyHeaders(responsesResponse.headers),
    });
  }

  const fallbackResponse = await sendChatFallback(config.chatBaseUrl);
  if (fallbackResponse === null) {
    if (responsesResponse) return responsesResponse;
    throw new Error('upstream unavailable');
  }
  return fallbackResponse;
}

export async function proxyOpenAI(
  path: string,
  req: Request,
  config: ProxyConfig,
  turnContext?: ProxyTurnContext,
): Promise<Response> {
  if ((path === '/v1/models' || path.startsWith('/v1/models?')) && config.isCloudflare) {
    return cloudflareModelListResponse();
  }
  const rawBody = req.method === 'GET' || req.method === 'HEAD'
    ? undefined
    : await req.clone().text();
  if (
    isJsonWriteMethod(req.method) &&
    (path.includes('/responses') || path.includes('/chat/completions')) &&
    rawBody !== undefined &&
    !rawBody.trim()
  ) {
    return emptyJsonBodyResponse();
  }
  let body = await maybeRewriteRequestBody(path, rawBody, config);
  const compactState = requestNeedsContextCompaction(path, body, config);
  if (compactState.shouldCompact) {
    const compactBody = buildContextCompactionRequestBody(
      body,
      compactState.maxTokens,
      config.contextCompactThresholdPercent ?? 90,
    );
    if (compactBody) {
      writeUpstreamLog({
        path: 'internal/context-compact-trigger',
        requestPath: path,
        estimatedInputTokens: compactState.estimatedInputTokens,
        thresholdTokens: compactState.thresholdTokens,
        maxTokens: compactState.maxTokens,
      });
      const compactResponse = await forwardWithFallback(
        '/v1/responses/compact',
        req,
        config,
        compactBody,
        req.headers,
        compactBody,
        turnContext,
      );
      if (compactResponse.ok) {
        const summaryText = extractCompactionSummaryText(await compactResponse.text());
        if (summaryText) {
          body = appendCompactionSummaryInput(body, summaryText);
        }
      }
    }
  }
  let upstream = await forwardWithFallback(
    path,
    req,
    config,
    body,
    req.headers,
    rawBody,
    turnContext,
  );
  if (
    !upstream.ok &&
    !path.includes('/responses/compact') &&
    (path.includes('/responses') || path.includes('/chat/completions')) &&
    config.customContextWindowTokens
  ) {
    upstream = await compactAndRetryOnOverflow(
      path,
      req,
      config,
      body,
      req.headers,
      rawBody,
      turnContext,
      upstream,
    );
  }
  if (path === '/v1/models' && upstream.ok) {
    const text = await upstream.clone().text();
    void writeModelListLog({
      path,
      request: {
        method: req.method,
        url: req.url,
        headers: Object.fromEntries(req.headers.entries()),
      },
      upstream: {
        status: upstream.status,
        headers: Object.fromEntries(upstream.headers.entries()),
        body: text,
      },
      client: {
        status: upstream.status,
        headers: Object.fromEntries(upstream.headers.entries()),
        body: text,
      },
    });
    return upstream;
  }
  if (path === '/v1/models') {
    const text = await upstream.clone().text();
    void writeModelListLog({
      path,
      request: {
        method: req.method,
        url: req.url,
        headers: Object.fromEntries(req.headers.entries()),
      },
      upstream: {
        status: upstream.status,
        headers: Object.fromEntries(upstream.headers.entries()),
        body: text,
      },
      client: {
        status: upstream.status,
        headers: Object.fromEntries(upstream.headers.entries()),
        body: text,
      },
    });
  }
  if (path.includes('/responses')) {
    await writeFinalClientResponseLog(path, upstream);
  }
  return upstream;
}

export async function mockResponsesOpenAI(
  path: string,
  req: Request,
  config: ProxyConfig,
  scenario: ResponsesScenario,
  turnContext?: ProxyTurnContext,
): Promise<Response> {
  if (path.includes('/responses')) {
    const body = await readJson(req);
    const input = Array.isArray(body.input) ? body.input : [];
    const requestEvents = buildMockResponsesEventsFromInput(input as ResponsesInputItem[]);
    const responseId = typeof scenario.response === 'object' && scenario.response
      ? (scenario.response as { id?: string }).id ?? `mock_response_${requestEvents.length}`
      : `mock_response_${requestEvents.length}`;
    const events = scenario.events.length > 0 ? scenario.events : requestEvents.length > 0
      ? [
        { type: 'response.created', response: { id: responseId } },
        ...requestEvents,
        { type: 'response.completed', response: { id: responseId } },
      ]
      : [
        { type: 'response.created', response: { id: responseId } },
        { type: 'response.completed', response: { id: responseId } },
      ];
    const sseBody = buildMockSseBody(events);
    return new Response(sseBody, {
      status: scenario.status ?? 200,
      headers: { 'content-type': 'text/event-stream; charset=utf-8' },
    });
  }
  return await proxyOpenAI(path, req, config, turnContext);
}

export async function readJson(req: Request): Promise<JsonObject> {
  const text = await req.text();
  if (!text.trim()) return {};
  return JSON.parse(text) as JsonObject;
}
