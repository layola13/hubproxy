import { assertEquals, assertMatch } from 'jsr:@std/assert@1';
import { normalizeModelListResponseBody, proxyOpenAI } from './proxy.ts';
import type { ProxyConfig } from './types.ts';

const config: ProxyConfig = {
  port: 8787,
  host: '127.0.0.1',
  authToken: null,
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
      config,
    );
    assertEquals(resp.status, 200);
    assertMatch(seen.url ?? '', /^http:\/\/127\.0\.0\.1:8789\/v1\/chat\/completions$/);
    assertEquals((seen.init?.headers as Headers).get('authorization'), 'Bearer secret-token');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test('normalizeModelListResponseBody adds models/ prefix for plain ids', () => {
  const body = normalizeModelListResponseBody(JSON.stringify({
    object: 'list',
    data: [
      { id: 'mimo-v2.5-pro', object: 'model' },
      { id: 'models/gemma-4-31b-it', object: 'model' },
    ],
  }));

  const parsed = JSON.parse(body) as {
    data: Array<{ id: string }>;
  };
  assertEquals(parsed.data[0].id, 'models/mimo-v2.5-pro');
  assertEquals(parsed.data[1].id, 'models/gemma-4-31b-it');
});

Deno.test('proxyOpenAI strips models/ prefix before forwarding request body', async () => {
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
      config,
    );
    const body = JSON.parse(seen.body ?? '{}') as { model?: string };
    assertEquals(body.model, 'mimo-v2.5-pro');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
