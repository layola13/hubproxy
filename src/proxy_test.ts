import { assertEquals, assertMatch } from 'jsr:@std/assert@1';
import { normalizeModelListResponseBody, proxyOpenAI } from './proxy.ts';
import type { ProxyConfig } from './types.ts';

const config: ProxyConfig = {
  port: 8787,
  host: '127.0.0.1',
  authToken: null,
  accountEmail: null,
  accountName: null,
  accountPlanType: 'plus',
  responsesBaseUrl: 'http://127.0.0.1:8788/v1',
  chatBaseUrl: 'http://127.0.0.1:8789/v1',
  defaultModel: 'models/gemma-4-31b-it',
  defaultApiKey: 'secret-token',
  dataDir: '/tmp',
};

Deno.test('proxyOpenAI forwards auth and base url', async () => {
  const seen: { url?: string; init?: RequestInit } = {};
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    seen.url = String(input);
    seen.init = init;
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    const resp = await proxyOpenAI(
      '/v1/chat/completions',
      new Request('http://localhost/v1/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: 'models/gemma-4-31b-it',
          messages: [{ role: 'user', content: 'hello' }],
        }),
      }),
      {
        ...config,
        responsesBaseUrl: null,
      },
    );
    assertEquals(resp.status, 200);
    assertMatch(seen.url ?? '', /^http:\/\/127\.0\.0\.1:8789\/v1\/chat\/completions$/);
    assertEquals((seen.init?.headers as Headers).get('authorization'), 'Bearer secret-token');
    assertEquals((seen.init?.headers as Headers).get('x-api-key'), 'secret-token');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test('proxyOpenAI does not forward client x-api-key to upstream', async () => {
  const seen: { init?: RequestInit } = {};
  const originalFetch = globalThis.fetch;
  const originalLogDir = Deno.env.get('HUBPROXY_LOG_DIR');
  const logDir = await Deno.makeTempDir();
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    seen.init = init;
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    Deno.env.set('HUBPROXY_LOG_DIR', logDir);
    await proxyOpenAI(
      '/v1/models',
      new Request('http://localhost/v1/models', {
        method: 'GET',
        headers: {
          authorization: 'Bearer local-secret',
          'x-api-key': 'local-secret',
        },
      }),
      {
        ...config,
        authToken: 'local-secret',
      },
    );
    const headers = seen.init?.headers as Headers;
    assertEquals(headers.get('authorization'), 'Bearer secret-token');
    assertEquals(headers.get('x-api-key'), 'secret-token');
  } finally {
    if (originalLogDir === undefined) Deno.env.delete('HUBPROXY_LOG_DIR');
    else Deno.env.set('HUBPROXY_LOG_DIR', originalLogDir);
    await Deno.remove(logDir).catch(() => {});
    globalThis.fetch = originalFetch;
  }
});

Deno.test('proxyOpenAI strips arbitrary client auth headers before upstream', async () => {
  const seen: { init?: RequestInit } = {};
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    seen.init = init;
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    await proxyOpenAI(
      '/v1/chat/completions',
      new Request('http://localhost/v1/chat/completions', {
        method: 'POST',
        headers: {
          authorization: 'Bearer client-secret',
          'x-api-key': 'client-secret',
          'api-key': 'client-secret',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'models/gemma-4-31b-it',
          messages: [{ role: 'user', content: 'hello' }],
        }),
      }),
      {
        ...config,
        responsesBaseUrl: null,
      },
    );
    const headers = seen.init?.headers as Headers;
    assertEquals(headers.get('authorization'), 'Bearer secret-token');
    assertEquals(headers.get('x-api-key'), 'secret-token');
    assertEquals(headers.get('api-key'), null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test('normalizeModelListResponseBody returns the original body', () => {
  const input = JSON.stringify({
    object: 'list',
    success: true,
    data: [
      {
        id: 'mimo-v2.5-pro',
        object: 'model',
        created: 1,
        owned_by: 'custom',
        supported_endpoint_types: ['openai'],
      },
      {
        id: 'models/gemma-4-31b-it',
        object: 'model',
        created: 2,
        owned_by: 'custom',
        supported_endpoint_types: ['openai'],
      },
    ],
  });
  const body = normalizeModelListResponseBody(input);
  assertEquals(body, input);
});

Deno.test('proxyOpenAI preserves model name when forwarding request body', async () => {
  const seen: { body?: string } = {};
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    seen.body = typeof init?.body === 'string' ? init.body : undefined;
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    await proxyOpenAI(
      '/v1/chat/completions',
      new Request('http://localhost/v1/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: 'models/mimo-v2.5-pro',
          messages: [{ role: 'user', content: 'hello' }],
        }),
      }),
      {
        ...config,
        responsesBaseUrl: null,
      },
    );
    const body = JSON.parse(seen.body ?? '{}') as { model?: string };
    assertEquals(body.model, 'models/mimo-v2.5-pro');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test('proxyOpenAI fills missing function output names from prior calls', async () => {
  const seen: { body?: string } = {};
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    seen.body = typeof init?.body === 'string' ? init.body : undefined;
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    await proxyOpenAI(
      '/v1/responses',
      new Request('http://localhost/v1/responses', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: 'models/mimo-v2.5-pro',
          stream: false,
          tools: [
            null,
            {
              type: 'function',
              name: 'exec_command',
              parameters: { type: 'object', properties: {} },
            },
          ],
          input: [
            {
              type: 'function_call',
              call_id: 'call-1',
              name: 'exec_command',
              arguments: '{"cmd":"echo hi"}',
            },
            {
              type: 'function_call_output',
              call_id: 'call-1',
              output: 'ok',
            },
          ],
        }),
      }),
      {
        ...config,
        responsesBaseUrl: null,
      },
    );

    const body = JSON.parse(seen.body ?? '{}') as {
      input?: Array<{ type?: string; call_id?: string; name?: string }>;
      tools?: Array<{ type?: string; function?: { name?: string } }>;
    };
    assertEquals(body.input?.[1]?.type, 'function_call_output');
    assertEquals(body.input?.[1]?.call_id, 'call-1');
    assertEquals(body.input?.[1]?.name, 'exec_command');
    assertEquals(body.tools?.length, 1);
    assertEquals(body.tools?.[0]?.type, 'function');
    assertEquals(body.tools?.[0]?.function?.name, 'exec_command');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test('proxyOpenAI preserves tool names in chat fallback tool messages', async () => {
  const seen: { body?: string } = {};
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    seen.body = typeof init?.body === 'string' ? init.body : undefined;
    return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    await proxyOpenAI(
      '/v1/responses',
      new Request('http://localhost/v1/responses', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: 'models/mimo-v2.5-pro',
          stream: false,
          input: [
            {
              type: 'function_call',
              call_id: 'call-1',
              name: 'exec_command',
              arguments: '{"cmd":"echo hi"}',
            },
            {
              type: 'function_call_output',
              call_id: 'call-1',
              output: 'ok',
            },
          ],
        }),
      }),
      {
        ...config,
        responsesBaseUrl: null,
      },
    );

    const body = JSON.parse(seen.body ?? '{}') as {
      messages?: Array<{ role?: string; name?: string; tool_call_id?: string }>;
    };
    const toolMessage = body.messages?.find((message) => message.role === 'tool');
    assertEquals(toolMessage?.tool_call_id, 'call-1');
    assertEquals(toolMessage?.name, 'exec_command');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test('proxyOpenAI wraps chat tools with nested function schema', async () => {
  const seen: { body?: string } = {};
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    seen.body = typeof init?.body === 'string' ? init.body : undefined;
    return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    await proxyOpenAI(
      '/v1/chat/completions',
      new Request('http://localhost/v1/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: 'models/mimo-v2.5-pro',
          messages: [{ role: 'user', content: 'hello' }],
          tools: [
            {
              type: 'function',
              name: 'exec_command',
              description: 'Run a shell command',
              parameters: { type: 'object', properties: {} },
            },
          ],
        }),
      }),
      {
        ...config,
        responsesBaseUrl: null,
      },
    );

    const body = JSON.parse(seen.body ?? '{}') as {
      tools?: Array<
        { type?: string; function?: { name?: string; description?: string; parameters?: unknown } }
      >;
    };
    assertEquals(body.tools?.length, 1);
    assertEquals(body.tools?.[0]?.type, 'function');
    assertEquals(body.tools?.[0]?.function?.name, 'exec_command');
    assertEquals(body.tools?.[0]?.function?.description, 'Run a shell command');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test('proxyOpenAI drops non-function tools for chat upstreams', async () => {
  const seen: { body?: string } = {};
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    seen.body = typeof init?.body === 'string' ? init.body : undefined;
    return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    await proxyOpenAI(
      '/v1/chat/completions',
      new Request('http://localhost/v1/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: 'models/mimo-v2.5-pro',
          messages: [{ role: 'user', content: 'hello' }],
          tools: [
            {
              type: 'namespace',
              name: 'mcp__code_index__',
              tools: [
                {
                  type: 'function',
                  name: 'search',
                  parameters: { type: 'object', properties: {} },
                },
              ],
            },
            {
              type: 'web_search',
              external_web_access: true,
            },
            {
              type: 'function',
              name: 'exec_command',
              parameters: { type: 'object', properties: {} },
            },
          ],
        }),
      }),
      {
        ...config,
        responsesBaseUrl: null,
      },
    );

    const body = JSON.parse(seen.body ?? '{}') as {
      tools?: Array<{ type?: string; function?: { name?: string } }>;
    };
    assertEquals(body.tools?.length, 2);
    assertEquals(body.tools?.[0]?.type, 'function');
    assertEquals(body.tools?.[0]?.function?.name, 'mcp__code_index__search');
    assertEquals(body.tools?.[1]?.type, 'function');
    assertEquals(body.tools?.[1]?.function?.name, 'exec_command');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test('proxyOpenAI keeps plan and goal tools available in chat fallback', async () => {
  const seen: { body?: string } = {};
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    seen.body = typeof init?.body === 'string' ? init.body : undefined;
    return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    await proxyOpenAI(
      '/v1/responses',
      new Request('http://localhost/v1/responses', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: 'models/mimo-v2.5-pro',
          stream: false,
          tools: [
            { type: 'function', name: 'exec_command', parameters: {} },
            { type: 'function', name: 'update_plan', parameters: {} },
            { type: 'function', name: 'get_goal', parameters: {} },
          ],
          input: [{ type: 'message', role: 'user', content: [{ type: 'input_text', text: 'hi' }] }],
        }),
      }),
      {
        ...config,
        responsesBaseUrl: null,
      },
    );

    const body = JSON.parse(seen.body ?? '{}') as {
      tools?: Array<{ function?: { name?: string } }>;
    };
    assertEquals(body.tools?.map((tool) => tool.function?.name), [
      'exec_command',
      'update_plan',
      'get_goal',
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test('proxyOpenAI falls back to chat when responses base url is missing', async () => {
  const seen: { url?: string; body?: string } = {};
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    seen.url = String(input);
    seen.body = typeof init?.body === 'string' ? init.body : undefined;
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: 'ok' } }],
      }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' },
      },
    );
  }) as typeof fetch;

  try {
    const resp = await proxyOpenAI(
      '/v1/responses',
      new Request('http://localhost/v1/responses', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: 'models/mimo-v2.5-pro',
          stream: false,
          input: [
            {
              type: 'message',
              role: 'user',
              content: [{ type: 'input_text', text: 'hello' }],
            },
          ],
        }),
      }),
      {
        ...config,
        responsesBaseUrl: null,
      },
      { collaborationModeKind: 'plan' },
    );
    assertEquals(resp.status, 200);
    assertEquals(resp.headers.get('content-type'), 'application/json; charset=utf-8');
    assertEquals(seen.url, 'http://127.0.0.1:8789/v1/chat/completions');
    const body = JSON.parse(seen.body ?? '{}') as {
      model?: string;
      messages?: Array<{ role?: string; content?: string }>;
    };
    assertEquals(body.model, 'models/mimo-v2.5-pro');
    const userMessage = body.messages?.find((message) => message.role === 'user');
    assertEquals(userMessage?.content, 'hello');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test('proxyOpenAI falls back to chat stream when responses upstream returns 404', async () => {
  const calls: string[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push(url);
    if (url.includes('/v1/responses')) {
      return new Response('not found', { status: 404 });
    }
    return new Response(
      [
        'data: {"choices":[{"delta":{"content":"ok"},"finish_reason":"stop"}]}',
        'data: [DONE]',
        '',
      ].join('\n'),
      {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      },
    );
  }) as typeof fetch;

  try {
    const resp = await proxyOpenAI(
      '/v1/responses',
      new Request('http://localhost/v1/responses', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: 'models/mimo-v2.5-pro',
          stream: true,
          input: [
            {
              type: 'message',
              role: 'user',
              content: [{ type: 'input_text', text: 'hello' }],
            },
          ],
        }),
      }),
      {
        ...config,
        responsesBaseUrl: null,
      },
      { collaborationModeKind: 'plan' },
    );
    assertEquals(resp.status, 200);
    assertEquals(resp.headers.get('content-type'), 'text/event-stream; charset=utf-8');
    assertEquals(calls[0], 'http://127.0.0.1:8789/v1/chat/completions');
    const text = await resp.text();
    assertEquals(text.includes('event: response.created'), true);
    assertEquals(text.includes('event: response.reasoning_summary_part.added'), false);
    assertEquals(text.includes('event: response.output_text.delta'), true);
    assertEquals(text.includes('event: response.done'), true);
    assertEquals(text.includes('event: response.completed'), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test('proxyOpenAI normalizes chat fallback tool calls for Codex exec', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_input: RequestInfo | URL, _init?: RequestInit) => {
    return new Response(
      [
        'data: {"choices":[{"delta":{"tool_calls":[{"id":"call_read","type":"function","function":{"name":"read","arguments":"{\\"filePath\\":\\"/tmp/demo.txt\\"}"},"index":0},{"id":"call_cmd","type":"function","function":{"name":"exec_command","arguments":"{\\"command\\":\\"deno check src/main.ts\\"}"},"index":1}]},"finish_reason":null}]}',
        '',
        'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}',
        '',
        'data: [DONE]',
        '',
      ].join('\n'),
      {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      },
    );
  }) as typeof fetch;

  try {
    const resp = await proxyOpenAI(
      '/v1/responses',
      new Request('http://localhost/v1/responses', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: 'models/mimo-v2.5-pro',
          stream: true,
          tools: [
            { type: 'function', name: 'exec_command', parameters: {} },
            { type: 'function', name: 'update_plan', parameters: {} },
          ],
          input: [{ type: 'message', role: 'user', content: [{ type: 'input_text', text: 'hi' }] }],
        }),
      }),
      {
        ...config,
        responsesBaseUrl: null,
      },
      { collaborationModeKind: 'plan' },
    );
    const text = await resp.text();
    assertEquals(text.includes('"name":"read"'), false);
    assertEquals((text.match(/"name":"exec_command"/g) ?? []).length, 2);
    assertEquals(text.includes(`\\\"cmd\\\":\\\"cat '/tmp/demo.txt'\\\"`), true);
    assertEquals(text.includes('\\"cmd\\":\\"deno check src/main.ts\\"'), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test('proxyOpenAI preserves plan and goal tool calls in chat fallback', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_input: RequestInfo | URL, _init?: RequestInit) => {
    return new Response(
      [
        'data: {"choices":[{"delta":{"tool_calls":[{"id":"call_plan","type":"function","function":{"name":"update_plan","arguments":"{\\"plan\\":[]}"},"index":0}]},"finish_reason":null}]}',
        '',
        'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}',
        '',
        'data: [DONE]',
        '',
      ].join('\n'),
      {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      },
    );
  }) as typeof fetch;

  try {
    const resp = await proxyOpenAI(
      '/v1/responses',
      new Request('http://localhost/v1/responses', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: 'models/mimo-v2.5-pro',
          stream: true,
          tools: [
            { type: 'function', name: 'exec_command', parameters: {} },
            { type: 'function', name: 'update_plan', parameters: {} },
          ],
          input: [{ type: 'message', role: 'user', content: [{ type: 'input_text', text: 'hi' }] }],
        }),
      }),
      {
        ...config,
        responsesBaseUrl: null,
      },
      { collaborationModeKind: 'plan' },
    );
    const text = await resp.text();
    assertEquals(text.includes('"name":"update_plan"'), true);
    assertEquals(text.includes('"name":"get_goal"'), false);
    assertEquals(text.includes('"name":"exec_command"'), false);
    assertEquals(text.includes('Tool update_plan is unavailable in chat fallback'), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test('proxyOpenAI converts progress-only chat stops into continuation tool calls', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_input: RequestInfo | URL, _init?: RequestInit) => {
    return new Response(
      [
        'data: {"choices":[{"delta":{"content":"我会继续读取核心文件并运行检查。"},"finish_reason":null}]}',
        '',
        'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}',
        '',
        'data: [DONE]',
        '',
      ].join('\n'),
      {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      },
    );
  }) as typeof fetch;

  try {
    const resp = await proxyOpenAI(
      '/v1/responses',
      new Request('http://localhost/v1/responses', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: 'models/mimo-v2.5-pro',
          stream: true,
          tools: [
            { type: 'function', name: 'exec_command', parameters: {} },
            { type: 'function', name: 'update_plan', parameters: {} },
          ],
          input: [{ type: 'message', role: 'user', content: [{ type: 'input_text', text: 'hi' }] }],
        }),
      }),
      {
        ...config,
        responsesBaseUrl: null,
      },
      { collaborationModeKind: 'plan' },
    );
    const text = await resp.text();
    assertEquals(text.includes('我会继续读取核心文件并运行检查。'), true);
    assertEquals(text.includes('"name":"exec_command"'), true);
    assertEquals(text.includes('Progress-only message received in chat fallback'), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test('proxyOpenAI does not force continuation for progress-only chat in ordinary mode', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_input: RequestInfo | URL, _init?: RequestInit) => {
    return new Response(
      [
        'data: {"choices":[{"delta":{"content":"我会继续读取核心文件并运行检查。"},"finish_reason":null}]}',
        '',
        'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}',
        '',
        'data: [DONE]',
        '',
      ].join('\n'),
      {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      },
    );
  }) as typeof fetch;

  try {
    const resp = await proxyOpenAI(
      '/v1/responses',
      new Request('http://localhost/v1/responses', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: 'models/mimo-v2.5-pro',
          stream: true,
          tools: [
            { type: 'function', name: 'exec_command', parameters: {} },
            { type: 'function', name: 'update_plan', parameters: {} },
          ],
          input: [{ type: 'message', role: 'user', content: [{ type: 'input_text', text: 'hi' }] }],
        }),
      }),
      {
        ...config,
        responsesBaseUrl: null,
      },
    );
    const text = await resp.text();
    assertEquals(text.includes('我会继续读取核心文件并运行检查。'), true);
    assertEquals(text.includes('Progress-only message received in chat fallback'), false);
    assertEquals(text.includes('"name":"exec_command"'), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test('proxyOpenAI does not force continuation for a normal final answer', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_input: RequestInfo | URL, _init?: RequestInit) => {
    return new Response(
      [
        'data: {"choices":[{"delta":{"content":"我已完成评估，下面是结论。"},"finish_reason":null}]}',
        '',
        'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}',
        '',
        'data: [DONE]',
        '',
      ].join('\n'),
      {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      },
    );
  }) as typeof fetch;

  try {
    const resp = await proxyOpenAI(
      '/v1/responses',
      new Request('http://localhost/v1/responses', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: 'models/mimo-v2.5-pro',
          stream: true,
          input: [{ type: 'message', role: 'user', content: [{ type: 'input_text', text: 'hi' }] }],
        }),
      }),
      {
        ...config,
        responsesBaseUrl: null,
      },
    );
    const text = await resp.text();
    assertEquals(text.includes('Progress-only message received in chat fallback'), false);
    assertEquals(text.includes('我已完成评估，下面是结论。'), true);
    assertEquals(text.includes('event: response.completed'), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test('proxyOpenAI preserves namespaced chat fallback tool calls', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_input: RequestInfo | URL, _init?: RequestInit) => {
    return new Response(
      [
        'data: {"choices":[{"delta":{"tool_calls":[{"id":"call_mcp","type":"function","function":{"name":"mcp__code_index__describe_index","arguments":"{}"},"index":0}]},"finish_reason":null}]}',
        '',
        'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}',
        '',
        'data: [DONE]',
        '',
      ].join('\n'),
      {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      },
    );
  }) as typeof fetch;

  try {
    const resp = await proxyOpenAI(
      '/v1/responses',
      new Request('http://localhost/v1/responses', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: 'models/mimo-v2.5-pro',
          stream: true,
          tools: [{
            type: 'namespace',
            name: 'mcp__code_index__',
            tools: [{ type: 'function', name: 'describe_index', parameters: {} }],
          }],
          input: [{ type: 'message', role: 'user', content: [{ type: 'input_text', text: 'hi' }] }],
        }),
      }),
      {
        ...config,
        responsesBaseUrl: null,
      },
    );
    const text = await resp.text();
    assertEquals(text.includes('"type":"function_call"'), true);
    assertEquals(text.includes('"namespace":"mcp__code_index__"'), true);
    assertEquals(text.includes('"name":"describe_index"'), true);
    assertEquals(text.includes('"name":"mcp__code_index__describe_index"'), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test('proxyOpenAI falls back to chat JSON when stream is false', async () => {
  const calls: string[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push(url);
    if (url.includes('/v1/responses')) {
      return new Response('not found', { status: 404 });
    }
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: 'ok' } }],
        usage: {
          prompt_tokens: 1,
          completion_tokens: 1,
          total_tokens: 2,
        },
      }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' },
      },
    );
  }) as typeof fetch;

  try {
    const resp = await proxyOpenAI(
      '/v1/responses',
      new Request('http://localhost/v1/responses', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: 'models/mimo-v2.5-pro',
          stream: false,
          input: [
            {
              type: 'message',
              role: 'user',
              content: [{ type: 'input_text', text: 'hello' }],
            },
          ],
        }),
      }),
      {
        ...config,
        responsesBaseUrl: null,
      },
    );
    assertEquals(resp.status, 200);
    assertEquals(resp.headers.get('content-type'), 'application/json; charset=utf-8');
    assertEquals(calls[0], 'http://127.0.0.1:8789/v1/chat/completions');
    const body = await resp.json() as {
      output?: Array<
        {
          type?: string;
          role?: string;
          content?: Array<{ type?: string; text?: string }>;
          summary?: Array<{ type?: string; text?: string }>;
          encrypted_content?: string | null;
        }
      >;
      output_text?: string;
      usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number };
    };
    assertEquals(body.output?.[0]?.type, 'message');
    assertEquals(body.output_text, 'ok');
    assertEquals(body.usage?.input_tokens, 1);
    assertEquals(body.usage?.output_tokens, 1);
    assertEquals(body.usage?.total_tokens, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test('proxyOpenAI maps thought tags into reasoning output items', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (!url.includes('/v1/chat/completions')) {
      throw new Error(`unexpected upstream url: ${url}`);
    }
    const body = JSON.parse(String(init?.body ?? '{}')) as { stream?: boolean };
    assertEquals(body.stream, false);
    return new Response(
      JSON.stringify({
        choices: [{
          message: {
            content: '<thought>internal thought</thought>Hello there',
          },
        }],
        usage: {
          prompt_tokens: 3,
          completion_tokens: 2,
          total_tokens: 5,
        },
      }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' },
      },
    );
  }) as typeof fetch;

  try {
    const resp = await proxyOpenAI(
      '/v1/responses',
      new Request('http://localhost/v1/responses', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: 'models/mimo-v2.5-pro',
          stream: false,
          input: [
            {
              type: 'message',
              role: 'user',
              content: [{ type: 'input_text', text: 'hello' }],
            },
          ],
        }),
      }),
      {
        ...config,
        responsesBaseUrl: null,
      },
    );
    assertEquals(resp.status, 200);
    const body = await resp.json() as {
      output?: Array<{
        type?: string;
        role?: string;
        content?: Array<{ type?: string; text?: string }>;
        summary?: Array<{ type?: string; text?: string }>;
        encrypted_content?: string | null;
      }>;
      output_text?: string;
    };
    assertEquals(body.output?.[0]?.type, 'reasoning');
    assertEquals(body.output?.[0]?.summary?.[0]?.text, 'internal thought');
    assertEquals(body.output?.[1]?.type, 'message');
    assertEquals(body.output?.[1]?.content?.[0]?.text, 'Hello there');
    assertEquals(body.output_text, 'Hello there');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test('proxyOpenAI strips responses-only fields when falling back to chat', async () => {
  const seen: { body?: string } = {};
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    seen.body = typeof init?.body === 'string' ? init.body : undefined;
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: 'ok' } }],
      }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' },
      },
    );
  }) as typeof fetch;

  try {
    await proxyOpenAI(
      '/v1/responses',
      new Request('http://localhost/v1/responses', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: 'models/mimo-v2.5-pro',
          store: false,
          prompt_cache_key: 'abc',
          include: ['reasoning.encrypted_content'],
          reasoning: { effort: 'medium', summary: 'auto' },
          input: [
            {
              type: 'message',
              role: 'user',
              content: [{ type: 'input_text', text: 'hello' }],
            },
          ],
        }),
      }),
      {
        ...config,
        responsesBaseUrl: null,
      },
    );

    const body = JSON.parse(seen.body ?? '{}') as {
      store?: unknown;
      prompt_cache_key?: unknown;
      include?: unknown;
      reasoning?: unknown;
      messages?: Array<{ role?: string; content?: string }>;
    };
    assertEquals(body.store, undefined);
    assertEquals(body.prompt_cache_key, undefined);
    assertEquals(body.include, undefined);
    assertEquals(body.reasoning, undefined);
    const userMessage = body.messages?.find((message) => message.role === 'user');
    assertEquals(userMessage?.content, 'hello');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test('proxyOpenAI preserves responses-only fields for real responses upstream', async () => {
  const seen: { body?: string } = {};
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    seen.body = typeof init?.body === 'string' ? init.body : undefined;
    return new Response(JSON.stringify({ output: [], status: 'completed' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    await proxyOpenAI(
      '/v1/responses',
      new Request('http://localhost/v1/responses', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: 'models/mimo-v2.5-pro',
          store: false,
          prompt_cache_key: 'abc',
          include: ['reasoning.encrypted_content'],
          reasoning: { effort: 'medium', summary: 'auto' },
          input: [
            {
              type: 'message',
              role: 'user',
              content: [{ type: 'input_text', text: 'hello' }],
            },
          ],
        }),
      }),
      {
        ...config,
        responsesBaseUrl: 'http://127.0.0.1:8788/v1',
      },
    );

    const body = JSON.parse(seen.body ?? '{}') as {
      store?: unknown;
      prompt_cache_key?: unknown;
      include?: unknown;
      reasoning?: unknown;
      input?: Array<{ type?: string; role?: string }>;
    };
    assertEquals(body.store, false);
    assertEquals(body.prompt_cache_key, 'abc');
    assertEquals(body.include, ['reasoning.encrypted_content']);
    assertEquals((body.reasoning as { effort?: string } | undefined)?.effort, 'medium');
    assertEquals(body.input?.[0]?.type, 'message');
    assertEquals(body.input?.[0]?.role, 'user');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
