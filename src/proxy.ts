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
  if (!out.has('authorization') && apiKey) {
    out.set('authorization', `Bearer ${apiKey}`);
  }
  return out;
};

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

function responseDoneEventForInputItem(item: ResponsesInputItem): ResponsesEvent | null {
  if (isReasoningItem(item)) {
    return {
      type: 'response.output_item.done',
      item,
    };
  }
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
  if (typeof item?.type === 'string' && item.type === 'reasoning') return event;
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

export async function proxyOpenAI(
  path: string,
  req: Request,
  config: ProxyConfig,
): Promise<Response> {
  const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : await req.clone().text();
  const headers = forwardHeaders(req.headers, config.defaultApiKey, config.authToken);
  const target = path.includes('/responses') ? config.responsesBaseUrl : config.chatBaseUrl;
  return await forwardJson(new URL(path, target).toString(), {
    method: req.method,
    headers,
    body,
  });
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
