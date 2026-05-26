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

function parseSseEvents(text: string): Array<{ event: string; data: Record<string, unknown> }> {
  return text.trim().split(/\n\n+/).flatMap((block) => {
    const lines = block.split(/\r?\n/);
    const event = lines.find((line) => line.startsWith('event:'))?.slice(6).trim() ?? '';
    const data = lines
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n');
    if (!event || !data) return [];
    return [{ event, data: JSON.parse(data) as Record<string, unknown> }];
  });
}

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
      input?: unknown;
      messages?: Array<{ role?: string; tool_calls?: Array<{ id?: string }> }>;
      tools?: Array<{ type?: string; function?: { name?: string } }>;
    };
    assertEquals(body.input, undefined);
    assertEquals(body.messages?.[0]?.role, 'assistant');
    assertEquals(body.messages?.[0]?.tool_calls?.[0]?.id, 'call-1');
    assertEquals(body.messages?.[1]?.role, 'tool');
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

Deno.test('proxyOpenAI preserves already-normalized MCP server names', async () => {
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
          stream: false,
          input: [
            {
              type: 'function_call',
              call_id: 'call-1',
              name: 'read_mcp_resource',
              arguments: JSON.stringify({
                server: 'mcp__code_index__',
                uri: 'file:///tmp/one',
              }),
            },
            {
              type: 'function_call',
              call_id: 'call-2',
              name: 'read_mcp_resource',
              arguments: JSON.stringify({
                server: 'Code Index',
                uri: 'file:///tmp/two',
              }),
            },
            {
              type: 'function_call',
              call_id: 'call-3',
              name: 'read_mcp_resource',
              arguments: JSON.stringify({
                server: 'mcp__mcp_code_index___',
                uri: 'file:///tmp/three',
              }),
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
      input?: Array<{ arguments?: string }>;
    };
    const firstArgs = JSON.parse(body.input?.[0]?.arguments ?? '{}') as { server?: string };
    const secondArgs = JSON.parse(body.input?.[1]?.arguments ?? '{}') as { server?: string };
    const thirdArgs = JSON.parse(body.input?.[2]?.arguments ?? '{}') as { server?: string };
    assertEquals(firstArgs.server, 'mcp__code_index__');
    assertEquals(secondArgs.server, 'mcp__code_index__');
    assertEquals(thirdArgs.server, 'mcp__code_index__');
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

Deno.test('proxyOpenAI falls back to chat when responses base url is missing in ordinary mode', async () => {
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
    );
    assertEquals(resp.status, 200);
    assertEquals(resp.headers.get('content-type'), 'application/json; charset=utf-8');
    assertEquals(seen.url, 'http://127.0.0.1:8789/v1/chat/completions');
    const body = JSON.parse(seen.body ?? '{}') as {
      model?: string;
      messages?: Array<{ role?: string; content?: string }>;
    };
    assertEquals(body.model, 'models/mimo-v2.5-pro');
    assertEquals(
      body.messages?.some((message) =>
        message.content?.includes(
          'Compatibility note: you are using Chat Completions as a Responses API fallback.',
        )
      ),
      false,
    );
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
        headers: {
          'content-type': 'text/event-stream',
          'content-length': '12',
          'content-encoding': 'gzip',
        },
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

Deno.test('proxyOpenAI does not chat-fallback Gemini tool history', async () => {
  const calls: string[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, _init?: RequestInit) => {
    const url = String(input);
    calls.push(url);
    if (url.includes('/v1/chat/completions')) {
      throw new Error('Gemini tool history must not use chat fallback');
    }
    return new Response('responses unavailable', { status: 404 });
  }) as typeof fetch;

  try {
    const resp = await proxyOpenAI(
      '/v1/responses',
      new Request('http://localhost/v1/responses', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: 'models/gemini-3-flash-preview',
          stream: true,
          input: [
            {
              type: 'function_call',
              call_id: 'call-1',
              name: 'exec_command',
              arguments: '{"cmd":"date"}',
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
        responsesBaseUrl: 'http://127.0.0.1:8788/v1',
      },
      { collaborationModeKind: 'code' },
    );

    assertEquals(resp.status, 404);
    assertEquals(calls, ['http://127.0.0.1:8788/v1/responses']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test('proxyOpenAI keeps the chat fallback notice in plan mode', async () => {
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
          input: [{
            type: 'message',
            role: 'user',
            content: [{ type: 'input_text', text: 'hello' }],
          }],
        }),
      }),
      {
        ...config,
        responsesBaseUrl: null,
      },
      { collaborationModeKind: 'plan' },
    );

    const body = JSON.parse(seen.body ?? '{}') as {
      messages?: Array<{ role?: string; content?: string }>;
    };
    assertEquals(
      body.messages?.some((message) =>
        message.content?.includes(
          'Compatibility note: you are using Chat Completions as a Responses API fallback.',
        )
      ),
      true,
    );
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

Deno.test('proxyOpenAI converts English progress-only chat stops into continuation tool calls', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_input: RequestInfo | URL, _init?: RequestInit) => {
    return new Response(
      [
        'data: {"choices":[{"delta":{"content":"Let me check the test failure details and the permission issue."},"finish_reason":null}]}',
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
          tools: [{ type: 'function', name: 'exec_command', parameters: {} }],
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
    assertEquals(text.includes('Let me check the test failure details'), true);
    assertEquals(text.includes('"name":"exec_command"'), true);
    assertEquals(text.includes('Progress-only message received in chat fallback'), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test('proxyOpenAI does not inject continuation when exec_command is unavailable', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_input: RequestInfo | URL, _init?: RequestInit) => {
    return new Response(
      [
        'data: {"choices":[{"delta":{"content":"Let me check the test failure details and the permission issue."},"finish_reason":null}]}',
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
          tools: [{ type: 'function', name: 'update_plan', parameters: {} }],
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
    assertEquals(text.includes('Let me check the test failure details'), true);
    assertEquals(text.includes('"name":"exec_command"'), false);
    assertEquals(text.includes('Progress-only message received in chat fallback'), false);
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

Deno.test('proxyOpenAI injects continuation before native responses completion', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_input: RequestInfo | URL, _init?: RequestInit) => {
    return new Response(
      [
        'event: response.created',
        'data: {"type":"response.created","response":{"id":"resp_native","status":"in_progress"}}',
        '',
        'event: response.output_item.done',
        'data: {"type":"response.output_item.done","item":{"id":"msg_native","type":"message","role":"assistant","content":[{"type":"output_text","text":"Let me check the test failure details and the permission issue."}]}}',
        '',
        'event: response.completed',
        'data: {"type":"response.completed","response":{"id":"resp_native","status":"completed"}}',
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
          tools: [{ type: 'function', name: 'exec_command', parameters: {} }],
          input: [{ type: 'message', role: 'user', content: [{ type: 'input_text', text: 'hi' }] }],
        }),
      }),
      {
        ...config,
        responsesBaseUrl: 'http://127.0.0.1:8788/v1',
      },
      { collaborationModeKind: 'plan' },
    );
    const text = await resp.text();
    const toolIndex = text.indexOf('"name":"exec_command"');
    const doneIndex = text.indexOf('event: response.done');
    const completedIndex = text.indexOf('event: response.completed');
    assertEquals(resp.headers.get('content-length'), null);
    assertEquals(resp.headers.get('content-encoding'), null);
    assertEquals(toolIndex > 0, true);
    assertEquals(doneIndex > toolIndex, true);
    assertEquals(doneIndex < completedIndex, true);
    assertEquals(completedIndex > toolIndex, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test('proxyOpenAI does not inject native responses continuation without exec_command', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_input: RequestInfo | URL, _init?: RequestInit) => {
    return new Response(
      [
        'event: response.output_item.done',
        'data: {"type":"response.output_item.done","item":{"id":"msg_native","type":"message","role":"assistant","content":[{"type":"output_text","text":"Let me check the test failure details and the permission issue."}]}}',
        '',
        'event: response.completed',
        'data: {"type":"response.completed","response":{"id":"resp_native","status":"completed"}}',
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
          tools: [{ type: 'function', name: 'update_plan', parameters: {} }],
          input: [{ type: 'message', role: 'user', content: [{ type: 'input_text', text: 'hi' }] }],
        }),
      }),
      {
        ...config,
        responsesBaseUrl: 'http://127.0.0.1:8788/v1',
      },
      { collaborationModeKind: 'plan' },
    );
    const text = await resp.text();
    assertEquals(text.includes('Let me check the test failure details'), true);
    assertEquals(text.includes('"name":"exec_command"'), false);
    assertEquals(text.includes('event: response.completed'), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test('proxyOpenAI does not inject continuation for proposed plan output', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_input: RequestInfo | URL, _init?: RequestInit) => {
    return new Response(
      [
        'data: {"choices":[{"delta":{"content":"<proposed_plan>\\n# Plan\\nDo the work.\\n</proposed_plan>"},"finish_reason":null}]}',
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
          tools: [{ type: 'function', name: 'exec_command', parameters: {} }],
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
    assertEquals(text.includes('<proposed_plan>'), true);
    assertEquals(text.includes('Progress-only message received in chat fallback'), false);
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

Deno.test('proxyOpenAI maps chat stream thinking fields into reasoning events', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, _init?: RequestInit) => {
    const url = String(input);
    if (!url.includes('/v1/chat/completions')) {
      throw new Error(`unexpected upstream url: ${url}`);
    }
    return new Response(
      [
        'data: {"choices":[{"delta":{"reasoning_content":"think one"},"finish_reason":null}]}',
        '',
        'data: {"choices":[{"delta":{"thinking":" and two"},"finish_reason":null}]}',
        '',
        'data: {"choices":[{"delta":{"content":"answer"},"finish_reason":null}]}',
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
          input: [{
            type: 'message',
            role: 'user',
            content: [{ type: 'input_text', text: 'hello' }],
          }],
        }),
      }),
      {
        ...config,
        responsesBaseUrl: null,
      },
    );

    const events = parseSseEvents(await resp.text());
    const eventNames = events.map((event) => event.event);
    const reasoningAdded = eventNames.indexOf('response.output_item.added');
    const summaryPart = eventNames.indexOf('response.reasoning_summary_part.added');
    const firstSummaryDelta = eventNames.indexOf('response.reasoning_summary_text.delta');
    const reasoningDone = events.findIndex((event) =>
      event.event === 'response.output_item.done' &&
      (event.data.item as { type?: string } | undefined)?.type === 'reasoning'
    );
    const messageDelta = events.findIndex((event) =>
      event.event === 'response.output_text.delta' && event.data.delta === 'answer'
    );
    assertEquals(reasoningAdded >= 0, true);
    assertEquals(summaryPart > reasoningAdded, true);
    assertEquals(firstSummaryDelta > summaryPart, true);
    assertEquals(reasoningDone > firstSummaryDelta, true);
    assertEquals(messageDelta > reasoningDone, true);

    const summaryDeltas = events
      .filter((event) => event.event === 'response.reasoning_summary_text.delta')
      .map((event) => event.data.delta);
    assertEquals(summaryDeltas, ['think one', ' and two']);
    const doneItem = events[reasoningDone].data.item as {
      summary?: Array<{ text?: string }>;
    };
    assertEquals(doneItem.summary?.[0]?.text, 'think one and two');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test('proxyOpenAI maps chat JSON reasoning_content into reasoning output items', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, _init?: RequestInit) => {
    const url = String(input);
    if (!url.includes('/v1/chat/completions')) {
      throw new Error(`unexpected upstream url: ${url}`);
    }
    return new Response(
      JSON.stringify({
        choices: [{
          message: {
            reasoning_content: 'json think',
            content: 'answer',
          },
        }],
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
          input: [{
            type: 'message',
            role: 'user',
            content: [{ type: 'input_text', text: 'hello' }],
          }],
        }),
      }),
      {
        ...config,
        responsesBaseUrl: null,
      },
    );

    const body = await resp.json() as {
      output?: Array<{
        type?: string;
        content?: Array<{ text?: string }>;
        summary?: Array<{ text?: string }>;
      }>;
      output_text?: string;
    };
    assertEquals(body.output?.[0]?.type, 'reasoning');
    assertEquals(body.output?.[0]?.summary?.[0]?.text, 'json think');
    assertEquals(body.output?.[1]?.type, 'message');
    assertEquals(body.output?.[1]?.content?.[0]?.text, 'answer');
    assertEquals(body.output_text, 'answer');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test('proxyOpenAI normalizes native thinking response stream items', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_input: RequestInfo | URL, _init?: RequestInit) => {
    return new Response(
      [
        'event: response.output_item.done',
        'data: {"type":"response.output_item.done","item":{"id":"think_native","type":"thinking","text":"native stream think"}}',
        '',
        'event: response.completed',
        'data: {"type":"response.completed","response":{"id":"resp_native","status":"completed"}}',
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
          input: [{
            type: 'message',
            role: 'user',
            content: [{ type: 'input_text', text: 'hello' }],
          }],
        }),
      }),
      {
        ...config,
        responsesBaseUrl: 'http://127.0.0.1:8788/v1',
      },
    );

    const events = parseSseEvents(await resp.text());
    const done = events.find((event) => event.event === 'response.output_item.done');
    const item = done?.data.item as {
      type?: string;
      content?: Array<{ text?: string }>;
      summary?: Array<{ text?: string }>;
    } | undefined;
    assertEquals(item?.type, 'reasoning');
    assertEquals(item?.summary?.[0]?.text, 'native stream think');
    assertEquals(item?.content?.[0]?.text, 'native stream think');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test('proxyOpenAI normalizes native JSON thinking output items', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_input: RequestInfo | URL, _init?: RequestInit) => {
    return new Response(
      JSON.stringify({
        output: [
          { id: 'think_json', type: 'thinking', text: 'native json think' },
          {
            id: 'msg_json',
            type: 'message',
            role: 'assistant',
            reasoning_content: 'message json think',
            content: [{ type: 'output_text', text: 'answer' }],
          },
        ],
        output_text: 'answer',
        status: 'completed',
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
          input: [{
            type: 'message',
            role: 'user',
            content: [{ type: 'input_text', text: 'hello' }],
          }],
        }),
      }),
      {
        ...config,
        responsesBaseUrl: 'http://127.0.0.1:8788/v1',
      },
    );

    const body = await resp.json() as {
      output?: Array<{
        type?: string;
        content?: Array<{ text?: string }>;
        summary?: Array<{ text?: string }>;
      }>;
      output_text?: string;
    };
    assertEquals(body.output?.[0]?.type, 'reasoning');
    assertEquals(body.output?.[0]?.summary?.[0]?.text, 'native json think');
    assertEquals(body.output?.[1]?.type, 'reasoning');
    assertEquals(body.output?.[1]?.summary?.[0]?.text, 'message json think');
    assertEquals(body.output?.[2]?.type, 'message');
    assertEquals(body.output?.[2]?.content?.[0]?.text, 'answer');
    assertEquals(body.output_text, 'answer');
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
      input?: unknown;
      messages?: Array<{ role?: string; content?: string }>;
    };
    assertEquals(body.store, undefined);
    assertEquals(body.prompt_cache_key, undefined);
    assertEquals(body.include, undefined);
    assertEquals(body.reasoning, undefined);
    assertEquals(body.input, undefined);
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

Deno.test('proxyOpenAI strips Gemini-incompatible responses fields for native responses upstream', async () => {
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
          model: 'models/gemini-3.5-flash',
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
    assertEquals(body.store, undefined);
    assertEquals(body.prompt_cache_key, undefined);
    assertEquals(body.include, ['reasoning.encrypted_content']);
    assertEquals((body.reasoning as { effort?: string } | undefined)?.effort, 'medium');
    assertEquals(body.input?.[0]?.type, 'message');
    assertEquals(body.input?.[0]?.role, 'user');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
