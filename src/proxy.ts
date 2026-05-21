import type {
  JsonObject,
  ProxyConfig,
  ResponsesEvent,
  ResponsesInputItem,
  ResponsesScenario,
  ResponsesToolKind,
  ResponsesToolOutputKind,
} from './types.ts';

const forwardHeaders = (headers: Headers, apiKey: string, localAuthToken: string | null) => {
  const out = new Headers(headers);
  if (localAuthToken && out.get('authorization') === `Bearer ${localAuthToken}`) {
    out.delete('authorization');
  }
  if (localAuthToken && out.get('x-api-key') === localAuthToken) {
    out.delete('x-api-key');
  }
  if (apiKey) {
    out.set('authorization', `Bearer ${apiKey}`);
    out.set('x-api-key', apiKey);
  } else {
    out.delete('authorization');
    out.delete('x-api-key');
  }
  return out;
};

export function normalizeModelListResponseBody(body: string): string {
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    const data = Array.isArray(parsed.data) ? parsed.data : null;
    if (!data) return body;
    const normalizedData = data.map((item) => {
      if (!item || typeof item !== 'object') return item;
      const record = item as Record<string, unknown>;
      const id = typeof record.id === 'string' ? record.id : '';
      const cleaned: Record<string, unknown> = {};
      if (id) {
        cleaned.id = id.startsWith('models/') ? id : `models/${id}`;
      }
      if (typeof record.object === 'string') cleaned.object = record.object;
      if (typeof record.created === 'number') cleaned.created = record.created;
      if (typeof record.owned_by === 'string') cleaned.owned_by = record.owned_by;
      return cleaned;
    });
    const out: Record<string, unknown> = {
      object: typeof parsed.object === 'string' ? parsed.object : 'list',
      data: normalizedData,
    };
    return JSON.stringify(out);
  } catch {
    return body;
  }
}

export function normalizeModelNameForUpstream(model: unknown): unknown {
  if (typeof model !== 'string') return model;
  return model.startsWith('models/') ? model.slice('models/'.length) : model;
}

function writeModelListLog(entry: Record<string, unknown>): void {
  const logDir = Deno.env.get('HUBPROXY_LOG_DIR') ?? 'logs';
  try {
    Deno.mkdirSync(logDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const file = `${logDir}/models-${stamp}-${crypto.randomUUID()}.json`;
    const text = JSON.stringify(entry, null, 2) + '\n';
    console.log(text.trimEnd());
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

function isReasoningItem(item: ResponsesInputItem): boolean {
  return item.type === 'reasoning';
}

function normalizeReasoningSummary(
  summary: unknown,
): Array<{ type: 'summary_text'; text: string }> {
  if (!Array.isArray(summary)) return [];
  return summary.flatMap((part) => {
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
  if (!Array.isArray(content)) return [];
  return content.flatMap((part) => {
    if (!part || typeof part !== 'object') return [];
    const text = typeof (part as { text?: unknown }).text === 'string'
      ? (part as { text: string }).text
      : '';
    if (!text) return [];
    return [{ type: 'reasoning_text', text }];
  });
}

function normalizeReasoningItem(item: ResponsesInputItem): ResponsesEvent {
  const raw = item as Record<string, unknown>;
  const summary = normalizeReasoningSummary(raw.summary);
  const fallbackText = typeof raw.text === 'string' ? raw.text : '';
  const normalizedSummary = summary.length > 0
    ? summary
    : fallbackText
    ? [{ type: 'summary_text', text: fallbackText }]
    : [];
  const normalized: Record<string, unknown> = {
    id: typeof raw.id === 'string' ? raw.id : `rs_${crypto.randomUUID().replace(/-/g, '')}`,
    type: 'reasoning',
    summary: normalizedSummary,
  };
  if (typeof raw.encrypted_content === 'string') {
    normalized.encrypted_content = raw.encrypted_content;
  }
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

export function normalizeResponsesEvent(event: ResponsesEvent): ResponsesEvent {
  if (event.type !== 'response.output_item.done') return event;
  const item = event.item as Record<string, unknown> | undefined;
  if (typeof item?.type === 'string' && item.type === 'reasoning') {
    return normalizeReasoningItem(item as ResponsesInputItem);
  }
  const kind = typeof item?.type === 'string' && isToolCallType(item.type) ? item.type : null;
  if (!kind) return event;
  return {
    type: event.type,
    item: {
      ...item,
      output_kind: outputKindForToolKind(kind),
    },
  };
}

export function buildMockSseBody(events: ResponsesEvent[]): string {
  return events
    .map((event) => {
      const normalized = normalizeResponsesEvent(event);
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

async function forwardJson(url: string, init: RequestInit): Promise<Response> {
  return await fetch(url, init);
}

function maybeRewriteRequestBody(path: string, body: string | undefined): string | undefined {
  if (!body) return body;
  if (!path.includes('/chat/completions') && !path.includes('/responses')) return body;
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    if (typeof parsed.model === 'string') {
      parsed.model = normalizeModelNameForUpstream(parsed.model);
    }
    return JSON.stringify(parsed);
  } catch {
    return body;
  }
}

export async function proxyOpenAI(
  path: string,
  req: Request,
  config: ProxyConfig,
): Promise<Response> {
  const rawBody = req.method === 'GET' || req.method === 'HEAD' ? undefined : await req.clone().text();
  const body = maybeRewriteRequestBody(path, rawBody);
  const headers = forwardHeaders(req.headers, config.defaultApiKey, config.authToken);
  const target = path.includes('/responses') ? config.responsesBaseUrl : config.chatBaseUrl;
  const upstream = await forwardJson(new URL(path, target).toString(), {
    method: req.method,
    headers,
    body,
    signal: req.signal,
  });
  if (path === '/v1/models' && upstream.ok) {
    const text = await upstream.clone().text();
    const normalized = normalizeModelListResponseBody(text);
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
        body: normalized,
      },
    });
    if (normalized !== text) {
      return new Response(normalized, {
        status: upstream.status,
        headers: upstream.headers,
      });
    }
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
  return upstream;
}

export async function mockResponsesOpenAI(
  path: string,
  req: Request,
  config: ProxyConfig,
  scenario: ResponsesScenario,
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
  return await proxyOpenAI(path, req, config);
}

export async function readJson(req: Request): Promise<JsonObject> {
  const text = await req.text();
  if (!text.trim()) return {};
  return JSON.parse(text) as JsonObject;
}
