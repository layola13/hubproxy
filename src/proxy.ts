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

export function normalizeModelListResponseBody(body: string): string {
  return body;
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

function redactToken(value: string | null | undefined): string {
  if (!value) return 'none';
  const token = value.startsWith('Bearer ') ? value.slice('Bearer '.length) : value;
  return `${token.slice(0, 3)}...${token.slice(-3)} (len=${token.length})`;
}

function writeUpstreamLog(entry: Record<string, unknown>): void {
  const logDir = Deno.env.get('HUBPROXY_LOG_DIR') ?? 'logs';
  try {
    Deno.mkdirSync(logDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const file = `${logDir}/upstream-${stamp}-${crypto.randomUUID()}.json`;
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
    delete parsed.store;
    delete parsed.prompt_cache_key;
    delete parsed.include;
    delete parsed.reasoning;
    if (Array.isArray(parsed.input)) {
      parsed.input = normalizeResponseInputItems(parsed.input);
    }
    if (Array.isArray(parsed.tools)) {
      const normalizedTools = normalizeChatToolsValue(parsed.tools);
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

function sanitizeToolName(name: unknown): string {
  if (typeof name !== 'string') return '';
  return name.trim();
}

function normalizeResponseInputItems(input: unknown): unknown[] {
  if (!Array.isArray(input)) return [];
  const callNames = new Map<string, string>();
  for (const item of input) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    if (record.type === 'function_call') {
      const callId = typeof record.call_id === 'string' ? record.call_id : '';
      const name = sanitizeToolName(record.name);
      if (callId && name) callNames.set(callId, name);
    }
  }

  return input.map((item) => {
    if (!item || typeof item !== 'object') return item;
    const record = item as Record<string, unknown>;
    const type = typeof record.type === 'string' ? record.type : '';
    if (
      type === 'function_call_output' ||
      type === 'custom_tool_call_output' ||
      type === 'tool_search_output' ||
      type === 'mcp_tool_call_output'
    ) {
      const callId = typeof record.call_id === 'string' ? record.call_id : '';
      const name = sanitizeToolName(record.name) || (callId ? callNames.get(callId) ?? '' : '');
      return name ? { ...record, name } : record;
    }
    return item;
  });
}

function normalizeChatToolsValue(tools: unknown): unknown[] {
  if (!Array.isArray(tools)) return [];
  return tools.flatMap((tool) => {
    if (!tool || typeof tool !== 'object') return [];
    const record = tool as Record<string, unknown>;
    const toolType = typeof record.type === 'string' ? record.type : '';
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

function sanitizeResponsesFallbackRequest(request: Record<string, unknown>): void {
  delete request.store;
  delete request.prompt_cache_key;
  delete request.include;
  delete request.reasoning;
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
  request: Record<string, unknown>;
};

function extractChatFallbackFromResponsesBody(
  body: string | undefined,
): ChatFallbackRequest | null {
  if (!body) return null;
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    const input = Array.isArray(parsed.input) ? parsed.input : [];
    const model = typeof parsed.model === 'string' ? parsed.model : '';
    const messages: Array<Record<string, unknown>> = [];
    const instructions = typeof parsed.instructions === 'string' ? parsed.instructions : '';
    for (const item of input) {
      if (!item || typeof item !== 'object') continue;
      const record = item as Record<string, unknown>;
      const type = typeof record.type === 'string' ? record.type : '';
      if (type === 'message' || type === 'assistant_message') {
        const role = typeof record.role === 'string' ? record.role : (type === 'message' ? 'user' : 'assistant');
        const content = Array.isArray(record.content)
          ? record.content.flatMap((part) => {
            if (!part || typeof part !== 'object') return [];
            const partRecord = part as Record<string, unknown>;
            const partType = typeof partRecord.type === 'string' ? partRecord.type : '';
            const text = typeof partRecord.text === 'string' ? partRecord.text : '';
            if (!text) return [];
            if (partType === 'input_text' || partType === 'text' || partType === 'output_text') {
              return [text];
            }
            return [];
          }).join('\n')
          : '';
        if (content) {
          messages.push({ role, content });
        }
        continue;
      }
      if (type === 'reasoning') continue;
      if (type === 'function_call_output' || type === 'custom_tool_call_output' ||
        type === 'tool_search_output' || type === 'mcp_tool_call_output') {
        const output = typeof record.output === 'string' ? record.output : '';
        const name = typeof record.name === 'string' ? record.name : '';
        if (output) {
          const message: Record<string, unknown> = {
            role: 'tool',
            content: output,
            tool_call_id: typeof record.call_id === 'string' ? record.call_id : undefined,
          };
          if (name) message.name = name;
          messages.push(message);
        }
      }
    }
    if (instructions) {
      messages.unshift({ role: 'system', content: instructions });
    }
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
                  name: typeof formatRecord.name === 'string' ? formatRecord.name : 'codex_output_schema',
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
    const normalizedInput = normalizeResponseInputItems(input);
    request.input = normalizedInput;
    const stream = parsed.stream !== false;
    request.stream = stream;
    if (stream) {
      request.stream_options = { include_usage: true };
    }
    return {
      model: model || '',
      messages,
      stream,
      request,
    };
  } catch {
    return null;
  }
}

function responseTextFromChatBody(body: string): string {
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    const choices = Array.isArray(parsed.choices) ? parsed.choices : [];
    const choice = choices[0] as Record<string, unknown> | undefined;
    const message = choice && typeof choice === 'object' ? choice.message as Record<string, unknown> | undefined : undefined;
    const content = typeof message?.content === 'string' ? message.content : '';
    return content || body;
  } catch {
    return body;
  }
}

function parseJsonBody(body: string): Record<string, unknown> | null {
  try {
    return JSON.parse(body) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function parseSseBlock(block: string): { event: string; data: string } | null {
  let event = '';
  const dataParts: string[] = [];
  for (const line of block.split(/\r?\n/)) {
    if (line.startsWith('event:')) {
      event = line.slice(6).trimStart();
    } else if (line.startsWith('data:')) {
      dataParts.push(line.slice(5).trimStart());
    }
  }
  if (!event || dataParts.length === 0) return null;
  return { event, data: dataParts.join('\n') };
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

function normalizeResponsesSseBody(body: string): string {
  const blocks = body.split(/\n\n/);
  const thoughtSplitter = createThoughtStreamSplitter();
  const state = {
    messageText: '',
    reasoningText: '',
    reasoningStarted: false,
    messageStarted: false,
    sawTextDelta: false,
  };
  const events: ResponsesEvent[] = [];

  for (const block of blocks) {
    const parsed = parseSseBlock(block);
    if (!parsed) continue;
    const payload = parseJsonBody(parsed.data);
    if (!payload) continue;

    if (parsed.event === 'response.output_text.delta') {
      state.sawTextDelta = true;
      const delta = typeof payload.delta === 'string' ? payload.delta : '';
      if (delta) {
        const split = thoughtSplitter.consume(delta);
        if (split.reasoningText) {
          state.reasoningText += (state.reasoningText ? '\n' : '') + split.reasoningText;
          if (!state.reasoningStarted) {
            state.reasoningStarted = true;
            events.push({ type: 'response.reasoning_summary_part.added', summary_index: 0 });
          }
          events.push({
            type: 'response.reasoning_summary_text.delta',
            summary_index: 0,
            delta: split.reasoningText,
          });
        }
        if (split.visibleText) {
          state.messageText += split.visibleText;
          events.push({ type: 'response.output_text.delta', delta: split.visibleText });
        }
      }
      continue;
    }

    if (parsed.event === 'response.output_item.added' || parsed.event === 'response.output_item.done') {
      const item = payload.item && typeof payload.item === 'object' ? payload.item as Record<string, unknown> : null;
      if (item && item.type === 'message' && parsed.event === 'response.output_item.done') {
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
                state.reasoningText += (state.reasoningText ? '\n' : '') + split.reasoningText;
                if (!state.reasoningStarted) {
                  state.reasoningStarted = true;
                  events.push({ type: 'response.reasoning_summary_part.added', summary_index: 0 });
                }
                events.push({
                  type: 'response.reasoning_summary_text.delta',
                  summary_index: 0,
                  delta: split.reasoningText,
                });
              }
              if (split.visibleText) {
                visibleParts.push({ ...record, text: split.visibleText });
                state.messageText += split.visibleText;
              }
            }
            return { ...item, content: visibleParts };
          })();
        events.push({
          type: 'response.output_item.done',
          item: rewritten,
        });
        continue;
      }
      events.push({
        type: parsed.event,
        ...payload,
        item: item ?? undefined,
      });
      continue;
    }

    events.push({
      type: parsed.event,
      ...payload,
    });
  }

  if (state.reasoningStarted) {
    events.push({
      type: 'response.output_item.done',
      item: {
        id: `rs_${crypto.randomUUID().replace(/-/g, '')}`,
        type: 'reasoning',
        summary: state.reasoningText
          ? [{ type: 'summary_text', text: state.reasoningText }]
          : [],
      },
    });
  }

  return buildMockSseBody(events);
}

function extractThoughtSegments(text: string): {
  visibleText: string;
  reasoningText: string;
} {
  const openTag = '<thought>';
  const closeTag = '</thought>';
  const parts: string[] = [];
  const thoughts: string[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    const openIndex = text.indexOf(openTag, cursor);
    if (openIndex === -1) {
      parts.push(text.slice(cursor));
      break;
    }
    parts.push(text.slice(cursor, openIndex));
    const contentStart = openIndex + openTag.length;
    const closeIndex = text.indexOf(closeTag, contentStart);
    if (closeIndex === -1) {
      thoughts.push(text.slice(contentStart).trim());
      break;
    }
    thoughts.push(text.slice(contentStart, closeIndex).trim());
    cursor = closeIndex + closeTag.length;
  }
  return {
    visibleText: parts.join('').trim(),
    reasoningText: thoughts.filter(Boolean).join('\n').trim(),
  };
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
  const openTag = '<thought>';
  const closeTag = '</thought>';
  let pending = '';
  let inThought = false;
  return {
    consume(chunk: string): { visibleText: string; reasoningText: string } {
      pending += chunk;
      const visible: string[] = [];
      const reasoning: string[] = [];

      while (pending) {
        if (!inThought) {
          const openIndex = pending.indexOf(openTag);
          if (openIndex === -1) {
            const keep = longestSuffixPrefix(pending, openTag);
            const emit = pending.slice(0, pending.length - keep);
            if (emit) visible.push(emit);
            pending = pending.slice(pending.length - keep);
            break;
          }
          if (openIndex > 0) {
            visible.push(pending.slice(0, openIndex));
          }
          pending = pending.slice(openIndex + openTag.length);
          inThought = true;
          continue;
        }

        const closeIndex = pending.indexOf(closeTag);
        if (closeIndex === -1) {
          const keep = longestSuffixPrefix(pending, closeTag);
          const emit = pending.slice(0, pending.length - keep);
          if (emit) reasoning.push(emit);
          pending = pending.slice(pending.length - keep);
          break;
        }
        if (closeIndex > 0) {
          reasoning.push(pending.slice(0, closeIndex));
        }
        pending = pending.slice(closeIndex + closeTag.length);
        inThought = false;
      }

      return {
        visibleText: visible.join(''),
        reasoningText: reasoning.join(''),
      };
    },
    flush(): { visibleText: string; reasoningText: string } {
      const remaining = pending;
      pending = '';
      const visibleText = inThought ? '' : remaining;
      const reasoningText = inThought ? remaining : '';
      inThought = false;
      return {
        visibleText,
        reasoningText,
      };
    },
  };
}

function responsesFallbackEventsFromChat(chatBody: string): ResponsesEvent[] {
  const content = responseTextFromChatBody(chatBody);
  const split = extractThoughtSegments(content);
  const responseId = `resp_${crypto.randomUUID().replace(/-/g, '')}`;
  const events: ResponsesEvent[] = [
    { type: 'response.created', response: { id: responseId } },
  ];
  if (split.reasoningText) {
    const summaryIndex = 0;
    events.push({
      type: 'response.reasoning_summary_part.added',
      summary_index: summaryIndex,
    });
    events.push({
      type: 'response.reasoning_summary_text.delta',
      summary_index: summaryIndex,
      delta: split.reasoningText,
    });
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
  if (split.reasoningText) {
    events.push({
      type: 'response.output_item.done',
      item: {
        id: `rs_${crypto.randomUUID().replace(/-/g, '')}`,
        type: 'reasoning',
        summary: [{ type: 'summary_text', text: split.reasoningText }],
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

function parseChatToolCallDelta(delta: Record<string, unknown>): Array<ChatToolCall> {
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
      id: `${index}:${callId || name || 'tool'}`,
      name,
      arguments: argsPart,
    }];
  });
}

function collectResponsesEventsFromChatChunkText(chatText: string): {
  events: ResponsesEvent[];
  usage: Record<string, unknown> | null;
} {
  const events: ResponsesEvent[] = [];
  const responseId = `resp_${crypto.randomUUID().replace(/-/g, '')}`;
  const assistantItemId = `msg_${crypto.randomUUID().replace(/-/g, '')}`;
  const messageState = {
    started: false,
    text: '',
  };
  const reasoningState = {
    started: false,
    text: '',
  };
  const thoughtSplitter = createThoughtStreamSplitter();
  const toolCalls = new Map<string, ChatToolCall>();
  let usage: Record<string, unknown> | null = null;
  events.push({ type: 'response.created', response: { id: responseId } });
  let dataBuffer = '';
  for (const line of chatText.split(/\r?\n/)) {
    if (line.startsWith('data:')) {
      const data = line.slice(5).trimStart();
      if (data === '[DONE]') continue;
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
    const choice = Array.isArray(parsed.choices) ? parsed.choices[0] as Record<string, unknown> | undefined : undefined;
    const delta = choice && typeof choice === 'object' && choice.delta && typeof choice.delta === 'object'
      ? choice.delta as Record<string, unknown>
      : null;
    if (delta) {
      const content = typeof delta.content === 'string' ? delta.content : '';
      if (content) {
        const split = thoughtSplitter.consume(content);
        if (split.reasoningText) {
          reasoningState.text += (reasoningState.text ? '\n' : '') + split.reasoningText;
          if (!reasoningState.started) {
            reasoningState.started = true;
            events.push({
              type: 'response.reasoning_summary_part.added',
              summary_index: 0,
            });
            events.push({
              type: 'response.reasoning_summary_text.delta',
              summary_index: 0,
              delta: split.reasoningText,
            });
          } else {
            events.push({
              type: 'response.reasoning_summary_text.delta',
              summary_index: 0,
              delta: split.reasoningText,
            });
          }
        }
        const visibleContent = split.visibleText;
        if (visibleContent) {
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
      if (!content && typeof delta.reasoning === 'string') {
        const split = thoughtSplitter.consume(delta.reasoning);
        if (split.reasoningText) {
          reasoningState.text += (reasoningState.text ? '\n' : '') + split.reasoningText;
          if (!reasoningState.started) {
            reasoningState.started = true;
            events.push({
              type: 'response.reasoning_summary_part.added',
              summary_index: 0,
            });
          }
          events.push({
            type: 'response.reasoning_summary_text.delta',
            summary_index: 0,
            delta: split.reasoningText,
          });
        }
      }
      for (const toolCall of parseChatToolCallDelta(delta)) {
        const existing = toolCalls.get(toolCall.id);
        if (existing) {
          existing.arguments += toolCall.arguments;
          if (toolCall.name) existing.name = toolCall.name;
        } else {
          toolCalls.set(toolCall.id, {
            ...toolCall,
          });
        }
      }
    }
    const finishReason = choice && typeof choice.finish_reason === 'string' ? choice.finish_reason : '';
    if (finishReason === 'tool_calls') {
      for (const [id, toolCall] of toolCalls.entries()) {
        events.push({
          type: 'response.output_item.done',
          item: {
            id,
            type: 'function_call',
            call_id: id,
            name: toolCall.name,
            arguments: toolCall.arguments,
          },
        });
      }
      toolCalls.clear();
    }
  }
  const tail = thoughtSplitter.flush();
  if (tail.reasoningText) {
    reasoningState.text += (reasoningState.text ? '\n' : '') + tail.reasoningText;
  }
  if (messageState.started) {
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
  if (reasoningState.started) {
    events.push({
      type: 'response.output_item.done',
      item: {
        id: `rs_${crypto.randomUUID().replace(/-/g, '')}`,
        type: 'reasoning',
        summary: reasoningState.text
          ? [{ type: 'summary_text', text: reasoningState.text }]
          : [],
      },
    });
  }
  for (const [id, toolCall] of toolCalls.entries()) {
    events.push({
      type: 'response.output_item.done',
      item: {
        id,
        type: 'function_call',
        call_id: id,
        name: toolCall.name,
        arguments: toolCall.arguments,
      },
    });
  }
  events.push({
    type: 'response.completed',
    response: {
      id: responseId,
      usage: normalizeChatUsage(usage),
    },
  });
  return { events, usage };
}

function normalizeChatUsage(usage: Record<string, unknown> | null): Record<string, unknown> {
  const promptTokens = typeof usage?.prompt_tokens === 'number'
    ? usage.prompt_tokens
    : typeof usage?.input_tokens === 'number'
    ? usage.input_tokens
    : 0;
  const cachedTokens = typeof usage?.prompt_tokens_details === 'object' && usage.prompt_tokens_details
    ? typeof (usage.prompt_tokens_details as Record<string, unknown>).cached_tokens === 'number'
      ? (usage.prompt_tokens_details as Record<string, unknown>).cached_tokens
      : 0
    : 0;
  const completionTokens = typeof usage?.completion_tokens === 'number'
    ? usage.completion_tokens
    : typeof usage?.output_tokens === 'number'
    ? usage.output_tokens
    : 0;
  const reasoningTokens = typeof usage?.completion_tokens_details === 'object' && usage.completion_tokens_details
    ? typeof (usage.completion_tokens_details as Record<string, unknown>).reasoning_tokens === 'number'
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

function responsesFallbackResponseFromChat(chatResponseBody: string, stream: boolean): Response {
  if (stream) {
    const { events } = collectResponsesEventsFromChatChunkText(chatResponseBody);
    return new Response(buildMockSseBody(events), {
      status: 200,
      headers: { 'content-type': 'text/event-stream; charset=utf-8' },
    });
  }
  const parsed = parseJsonBody(chatResponseBody);
  const rawContent = typeof parsed?.choices === 'object' ? responseTextFromChatBody(chatResponseBody) : responseTextFromChatBody(chatResponseBody);
  const split = extractThoughtSegments(rawContent);
  const output: Array<Record<string, unknown>> = [];
  if (split.reasoningText) {
    output.push({
      type: 'reasoning',
      summary: [{ type: 'summary_text', text: split.reasoningText }],
      encrypted_content: null,
      ...(split.reasoningText ? { content: [{ type: 'reasoning_text', text: split.reasoningText }] } : {}),
    });
  }
  if (split.visibleText) {
    output.push({
      type: 'message',
      role: 'assistant',
      content: [{ type: 'output_text', text: split.visibleText }],
    });
  }
  return new Response(JSON.stringify({
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
  }), {
    status: 200,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

function responsesFallbackStreamFromChat(chatBody: string): Response {
  return new Response(buildMockSseBody(responsesFallbackEventsFromChat(chatBody)), {
    status: 200,
    headers: { 'content-type': 'text/event-stream; charset=utf-8' },
  });
}

function chatPathFromResponsesPath(path: string): string {
  return path.replace('/responses', '/chat/completions');
}

async function forwardWithFallback(
  path: string,
  req: Request,
  config: ProxyConfig,
  body: string | undefined,
  headers: Headers,
): Promise<Response> {
  const useResponses = path.includes('/responses');
  const responsesTarget = config.responsesBaseUrl;
  const firstTarget = useResponses && responsesTarget ? responsesTarget : config.chatBaseUrl;

  const send = async (target: string, requestPath: string, requestBody: string | undefined) => {
    writeUpstreamLog({
      path,
      target: new URL(requestPath, target).toString(),
      requestPath,
      method: req.method,
      headers: {
        authorization: redactToken(headers.get('authorization')),
        'x-api-key': redactToken(headers.get('x-api-key')),
        'api-key': redactToken(headers.get('api-key')),
        'content-type': headers.get('content-type'),
      },
      body: requestBody,
    });
    return await forwardJson(new URL(requestPath, target).toString(), {
      method: req.method,
      headers,
      body: requestBody,
      signal: req.signal,
    });
  };

  if (!useResponses) {
    return await send(firstTarget, path, body);
  }

  const responsesRequestBody = body;
  const responsesPath = '/v1/responses';
  const chatPath = chatPathFromResponsesPath(path);

  if (!responsesTarget) {
    const fallback = extractChatFallbackFromResponsesBody(responsesRequestBody);
    if (fallback === null) {
      throw new Error('upstream unavailable');
    }
    const chatResponse = await send(firstTarget, chatPath, JSON.stringify(fallback.request));
    if (!chatResponse.ok) return chatResponse;
    return responsesFallbackResponseFromChat(await chatResponse.text(), fallback.stream);
  }

  const responsesResponse = await send(firstTarget, responsesPath, responsesRequestBody).catch((error) => {
    if (!isFallbackEligibleError(error)) throw error;
    return null;
  });
  if (responsesResponse && !responsesResponse.ok && !isFallbackEligibleStatus(responsesResponse.status)) {
    return responsesResponse;
  }
  if (responsesResponse && responsesResponse.ok) {
    const contentType = responsesResponse.headers.get('content-type') ?? '';
    const text = await responsesResponse.text();
    if (contentType.includes('text/event-stream')) {
      return new Response(normalizeResponsesSseBody(text), {
        status: responsesResponse.status,
        headers: responsesResponse.headers,
      });
    }
    const parsed = parseJsonBody(text);
    if (!parsed) {
      return responsesResponse;
    }
    const output = Array.isArray(parsed.output) ? parsed.output as Array<Record<string, unknown>> : [];
    const normalizedOutput: Array<Record<string, unknown>> = [];
    for (const item of output) {
      if (!item || typeof item !== 'object') continue;
      if (item.type === 'message') {
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
            normalizedOutput.push({
              type: 'reasoning',
              summary: [{ type: 'summary_text', text: split.reasoningText }],
              encrypted_content: null,
              content: [{ type: 'reasoning_text', text: split.reasoningText }],
            });
          }
          if (split.visibleText) {
            visibleParts.push({ ...record, text: split.visibleText });
          }
        }
        normalizedOutput.push({ ...item, content: visibleParts });
        continue;
      }
      normalizedOutput.push(item);
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
    return new Response(JSON.stringify(parsed), {
      status: responsesResponse.status,
      headers: responsesResponse.headers,
    });
  }

  const fallback = extractChatFallbackFromResponsesBody(responsesRequestBody);
  if (fallback === null) {
    if (responsesResponse) return responsesResponse;
    throw new Error('upstream unavailable');
  }
  const chatResponse = await send(config.chatBaseUrl, chatPath, JSON.stringify(fallback.request));
  if (!chatResponse.ok) {
    return chatResponse;
  }
  const text = await chatResponse.text();
  return responsesFallbackResponseFromChat(text, fallback.stream);
}

export async function proxyOpenAI(
  path: string,
  req: Request,
  config: ProxyConfig,
): Promise<Response> {
  const rawBody = req.method === 'GET' || req.method === 'HEAD' ? undefined : await req.clone().text();
  const body = maybeRewriteRequestBody(path, rawBody);
  const headers = forwardHeaders(req.headers, config.defaultApiKey, config.authToken);
  const upstream = await forwardWithFallback(path, req, config, body, headers);
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
