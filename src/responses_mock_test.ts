import { assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';
import { buildMockResponsesEventsFromInput, buildMockSseBody } from './proxy.ts';
import { handleHttpWithState } from './handlers.ts';
import { HubState } from './state.ts';
import type { ProxyConfig, ResponsesScenario } from './types.ts';

const config: ProxyConfig = {
  port: 8787,
  host: '127.0.0.1',
  authToken: null,
  accountEmail: null,
  accountName: null,
  accountPlanType: 'plus',
  responsesBaseUrl: 'http://127.0.0.1:8788/v1',
  chatBaseUrl: 'http://127.0.0.1:8789/v1',
  forceChatCompletions: false,
  nvidiaCompat: false,
  isCloudflare: false,
  defaultModel: 'gpt-4.1',
  defaultApiKey: 'secret-token',
  apiKeys: ['secret-token'],
  requestIntervalMs: 0,
  needRetry: false,
  glmTryGetKey: false,
  glmKeyRefreshIntervalMs: 600000,
  glmKeyFetchRetryCount: 100,
  glmKeyFetchRetryDelayMs: 30000,
  dataDir: '/tmp',
};

Deno.test('mock responses emits SSE events for responses path', async () => {
  const state = new HubState();
  (globalThis as { HUBPROXY_SCENARIO?: ResponsesScenario }).HUBPROXY_SCENARIO = {
    events: [
      { type: 'response.created', response: { id: 'mock_response_0' } },
      {
        type: 'response.output_item.done',
        item: {
          type: 'function_call',
          call_id: 'call_1',
          name: 'shell',
          arguments: '{"command":"echo hi"}',
        },
      },
      { type: 'response.completed', response: { id: 'mock_response_0' } },
    ],
  };

  try {
    const resp = await handleHttpWithState(
      new Request('http://localhost/v1/responses', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model: 'gpt-4.1', input: [] }),
      }),
      config,
      state,
    );

    assertEquals(resp.status, 200);
    const text = await resp.text();
    assertStringIncludes(text, 'event: response.created');
    assertStringIncludes(text, 'event: response.output_item.done');
    assertStringIncludes(text, 'call_1');
    assertStringIncludes(text, 'function_call');
  } finally {
    delete (globalThis as { HUBPROXY_SCENARIO?: ResponsesScenario }).HUBPROXY_SCENARIO;
  }
});

Deno.test('mock responses emits tool outputs for function_call_output and custom_tool_call_output', async () => {
  const state = new HubState();
  (globalThis as { HUBPROXY_SCENARIO?: ResponsesScenario }).HUBPROXY_SCENARIO = {
    events: [
      {
        type: 'response.output_item.done',
        item: {
          type: 'function_call',
          call_id: 'fn_1',
          name: 'shell',
          arguments: '{"command":"echo hi"}',
        },
      },
      {
        type: 'response.output_item.done',
        item: {
          type: 'custom_tool_call',
          call_id: 'tool_1',
          name: 'mcp__codex_apps__calendar_create_event',
          input: '{"title":"demo"}',
        },
      },
      { type: 'response.completed', response: { id: 'mock_response_0' } },
    ],
  };

  try {
    const resp = await handleHttpWithState(
      new Request('http://localhost/v1/responses', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: 'gpt-4.1',
          input: [
            { type: 'function_call_output', call_id: 'fn_1', output: 'ok' },
            { type: 'custom_tool_call_output', call_id: 'tool_1', output: 'done' },
          ],
        }),
      }),
      config,
      state,
    );

    assertEquals(resp.status, 200);
    const text = await resp.text();
    assertStringIncludes(text, 'function_call');
    assertStringIncludes(text, 'custom_tool_call');
  } finally {
    delete (globalThis as { HUBPROXY_SCENARIO?: ResponsesScenario }).HUBPROXY_SCENARIO;
  }
});

Deno.test('mock responses replays tool outputs from request input when no scenario events are present', async () => {
  const state = new HubState();
  (globalThis as { HUBPROXY_SCENARIO?: ResponsesScenario }).HUBPROXY_SCENARIO = {
    events: [],
  };

  try {
    const resp = await handleHttpWithState(
      new Request('http://localhost/v1/responses', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: 'gpt-4.1',
          input: [
            { type: 'function_call_output', call_id: 'fn_1', output: 'ok' },
            { type: 'tool_search_output', call_id: 'search_1', output: 'hit' },
          ],
        }),
      }),
      config,
      state,
    );

    assertEquals(resp.status, 200);
    const text = await resp.text();
    assertStringIncludes(text, 'function_call_output');
    assertStringIncludes(text, 'tool_search_output');
    assertStringIncludes(text, '"output_kind":"function_call_output"');
    assertStringIncludes(text, '"output_kind":"tool_search_output"');
  } finally {
    delete (globalThis as { HUBPROXY_SCENARIO?: ResponsesScenario }).HUBPROXY_SCENARIO;
  }
});

Deno.test('buildMockSseBody normalizes tool call kinds to output kinds', () => {
  const body = buildMockSseBody([
    {
      type: 'response.output_item.done',
      item: {
        type: 'tool_search_call',
        call_id: 'search_1',
        execution: 'client',
        arguments: { query: 'calendar create' },
      },
    },
    {
      type: 'response.output_item.done',
      item: {
        type: 'mcp_tool_call',
        call_id: 'mcp_1',
        name: 'codex__list',
        arguments: { foo: 'bar' },
      },
    },
  ]);

  assertStringIncludes(body, '"output_kind":"tool_search_output"');
  assertStringIncludes(body, '"output_kind":"mcp_tool_call_output"');
});

Deno.test('buildMockResponsesEventsFromInput converts response tool outputs to done events', () => {
  const events = buildMockResponsesEventsFromInput([
    { type: 'function_call_output', call_id: 'fn_1', output: 'ok' },
    { type: 'custom_tool_call_output', call_id: 'tool_1', output: 'done' },
    { type: 'tool_search_output', call_id: 'search_1', output: 'hit' },
    { type: 'mcp_tool_call_output', call_id: 'mcp_1', output: 'mcp' },
    { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'ignored' }] },
  ]);

  assertEquals(events.length, 4);
  assertStringIncludes(JSON.stringify(events[0]), '"output_kind":"function_call_output"');
  assertStringIncludes(JSON.stringify(events[1]), '"output_kind":"custom_tool_call_output"');
  assertStringIncludes(JSON.stringify(events[2]), '"output_kind":"tool_search_output"');
  assertStringIncludes(JSON.stringify(events[3]), '"output_kind":"mcp_tool_call_output"');
});

Deno.test('buildMockResponsesEventsFromInput keeps reasoning items in reasoning format', () => {
  const events = buildMockResponsesEventsFromInput([
    {
      type: 'reasoning',
      summary: [{ type: 'summary_text', text: 'internal thought' }],
      status: 'completed',
      thought_signature: 'sig_123',
    },
  ]);

  assertEquals(events.length, 1);
  assertEquals(events[0].type, 'response.output_item.done');
  const payload = events[0].item as {
    type: string;
    summary?: Array<{ type: string; text: string }>;
    status?: string;
    thought_signature?: string;
    output_kind?: string;
  };
  assertEquals(payload.type, 'reasoning');
  assertEquals(payload.summary?.[0]?.type, 'summary_text');
  assertEquals(payload.summary?.[0]?.text, 'internal thought');
  assertEquals(payload.status, 'completed');
  assertEquals(payload.thought_signature, 'sig_123');
  assertEquals(payload.output_kind, undefined);
});

Deno.test('buildMockResponsesEventsFromInput preserves thinking metadata while normalizing', () => {
  const events = buildMockResponsesEventsFromInput([
    {
      type: 'thinking',
      text: 'native thought',
      status: 'completed',
      thought_signature: 'sig_thinking',
    },
  ]);

  assertEquals(events.length, 1);
  const payload = events[0].item as {
    type: string;
    summary?: Array<{ text: string }>;
    content?: Array<{ text: string }>;
    status?: string;
    thought_signature?: string;
  };
  assertEquals(payload.type, 'reasoning');
  assertEquals(payload.summary?.[0]?.text, 'native thought');
  assertEquals(payload.content?.[0]?.text, 'native thought');
  assertEquals(payload.status, 'completed');
  assertEquals(payload.thought_signature, 'sig_thinking');
});
