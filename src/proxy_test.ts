import { assert, assertEquals, assertMatch } from 'jsr:@std/assert@1';
import {
  normalizeChatToolCall,
  normalizeModelListResponseBody,
  normalizeResponsesEvent,
  proxyOpenAI,
  robustDenormalizeServerName,
} from './proxy.ts';
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
  forceChatCompletions: false,
  nvidiaCompat: false,
  isCloudflare: false,
  defaultModel: 'models/gemma-4-31b-it',
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

Deno.test('proxyOpenAI rotates configured api keys between upstream requests', async () => {
  const seenKeys: string[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    seenKeys.push((init?.headers as Headers).get('x-api-key') ?? '');
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;

  const rotatingConfig: ProxyConfig = {
    ...config,
    defaultApiKey: 'key-a',
    apiKeys: ['key-a', 'key-b'],
  };

  try {
    for (let i = 0; i < 3; i++) {
      const resp = await proxyOpenAI(
        '/v1/chat/completions',
        new Request('http://localhost/v1/chat/completions', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            model: 'models/gemma-4-31b-it',
            messages: [{ role: 'user', content: `hello ${i}` }],
          }),
        }),
        rotatingConfig,
      );
      assertEquals(resp.status, 200);
    }
    assertEquals(seenKeys, ['key-a', 'key-b', 'key-a']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test('proxyOpenAI prefers refreshed GLM key from dotenv at request time', async () => {
  const dotenvFile = await Deno.makeTempFile({ suffix: '.env' });
  const originalDotenvPath = Deno.env.get('DOTENV_PATH');
  const originalOpenAiKey = Deno.env.get('OPENAI_API_KEY');
  const seenKeys: string[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    seenKeys.push((init?.headers as Headers).get('x-api-key') ?? '');
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    await Deno.writeTextFile(dotenvFile, 'OPENAI_API_KEY=babeltown-new-key\n');
    Deno.env.set('DOTENV_PATH', dotenvFile);
    Deno.env.delete('OPENAI_API_KEY');
    const resp = await proxyOpenAI(
      '/v1/chat/completions',
      new Request('http://localhost/v1/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: 'glm-5.2',
          messages: [{ role: 'user', content: 'hello' }],
        }),
      }),
      {
        ...config,
        defaultModel: 'glm-5.2',
        chatBaseUrl: 'https://api.babel.town/v1',
        glmTryGetKey: true,
        defaultApiKey: 'stale-key',
        apiKeys: ['stale-key'],
      },
    );
    assertEquals(resp.status, 200);
    assertEquals(seenKeys, ['babeltown-new-key']);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalDotenvPath === undefined) Deno.env.delete('DOTENV_PATH');
    else Deno.env.set('DOTENV_PATH', originalDotenvPath);
    if (originalOpenAiKey === undefined) Deno.env.delete('OPENAI_API_KEY');
    else Deno.env.set('OPENAI_API_KEY', originalOpenAiKey);
    await Deno.remove(dotenvFile).catch(() => {});
  }
});

Deno.test('proxyOpenAI waits between upstream requests when request interval is configured', async () => {
  const starts: number[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    starts.push(performance.now());
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    const throttledConfig: ProxyConfig = { ...config, requestIntervalMs: 25 };
    for (let i = 0; i < 2; i++) {
      const resp = await proxyOpenAI(
        '/v1/chat/completions',
        new Request('http://localhost/v1/chat/completions', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            model: 'models/gemma-4-31b-it',
            messages: [{ role: 'user', content: `hello ${i}` }],
          }),
        }),
        throttledConfig,
      );
      assertEquals(resp.status, 200);
    }
    assertEquals(starts.length, 2);
    assert(starts[1] - starts[0] >= 20);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test('proxyOpenAI does not retry upstream errors when NEED_RETRY is disabled', async () => {
  let calls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    calls++;
    return new Response(JSON.stringify({ error: { message: 'rate limited' } }), {
      status: 429,
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
      { ...config, requestIntervalMs: 5, needRetry: false },
    );
    assertEquals(resp.status, 429);
    assertEquals(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test('proxyOpenAI retries non-ok upstream responses when NEED_RETRY is enabled', async () => {
  const starts: number[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    starts.push(performance.now());
    if (starts.length === 1) {
      return new Response(JSON.stringify({ error: { message: 'rate limited' } }), {
        status: 429,
        headers: { 'content-type': 'application/json' },
      });
    }
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
      { ...config, requestIntervalMs: 5, needRetry: true },
    );
    assertEquals(resp.status, 200);
    assertEquals(starts.length, 2);
    assert(starts[1] - starts[0] >= 4);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test('proxyOpenAI retries GLM quota errors when GLM_TRY_GET_KEY is enabled', async () => {
  let calls = 0;
  const originalTrigger = Deno.env.get('GLM_TRIGGER_KEY_REFRESH');
  const originalDotenvPath = Deno.env.get('DOTENV_PATH');
  const originalOpenAiKey = Deno.env.get('OPENAI_API_KEY');
  const dotenvFile = await Deno.makeTempFile({ suffix: '.env' });
  Deno.env.delete('GLM_TRIGGER_KEY_REFRESH');
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    if (String(input) === 'https://glm.babel.town/api/get_api_key') {
      return new Response(JSON.stringify({ success: true, api_key: 'babeltown-refreshed-key' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    calls++;
    if (calls === 1) {
      return new Response(JSON.stringify({ error: { message: '额度不足，请稍后再试' } }), {
        status: 429,
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    await Deno.writeTextFile(dotenvFile, 'OPENAI_API_KEY=babeltown-old-key\n');
    Deno.env.set('DOTENV_PATH', dotenvFile);
    Deno.env.delete('OPENAI_API_KEY');
    const resp = await proxyOpenAI(
      '/v1/chat/completions',
      new Request('http://localhost/v1/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: 'glm-5.2',
          messages: [{ role: 'user', content: 'hello' }],
        }),
      }),
      {
        ...config,
        defaultModel: 'glm-5.2',
        chatBaseUrl: 'https://api.babel.town/v1',
        needRetry: true,
        glmTryGetKey: true,
        requestIntervalMs: 5,
      },
    );
    assertEquals(resp.status, 200);
    assertEquals(calls, 2);
    assertEquals(Deno.env.get('GLM_TRIGGER_KEY_REFRESH'), '1');
  } finally {
    globalThis.fetch = originalFetch;
    if (originalTrigger === undefined) Deno.env.delete('GLM_TRIGGER_KEY_REFRESH');
    else Deno.env.set('GLM_TRIGGER_KEY_REFRESH', originalTrigger);
    if (originalDotenvPath === undefined) Deno.env.delete('DOTENV_PATH');
    else Deno.env.set('DOTENV_PATH', originalDotenvPath);
    if (originalOpenAiKey === undefined) Deno.env.delete('OPENAI_API_KEY');
    else Deno.env.set('OPENAI_API_KEY', originalOpenAiKey);
    await Deno.remove(dotenvFile).catch(() => {});
  }
});

Deno.test('proxyOpenAI triggers immediate GLM key refresh on 403 expired key', async () => {
  const originalTrigger = Deno.env.get('GLM_TRIGGER_KEY_REFRESH');
  Deno.env.delete('GLM_TRIGGER_KEY_REFRESH');
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    return new Response('This API key has expired.', {
      status: 403,
      headers: { 'content-type': 'text/plain' },
    });
  }) as typeof fetch;

  try {
    const resp = await proxyOpenAI(
      '/v1/responses',
      new Request('http://localhost/v1/responses', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: 'glm-5.2',
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
        defaultModel: 'glm-5.2',
        chatBaseUrl: 'https://api.babel.town/v1',
        needRetry: true,
        glmTryGetKey: true,
        requestIntervalMs: 5,
        glmKeyFetchRetryCount: 3,
        glmKeyFetchRetryDelayMs: 1,
      },
    );
    assertEquals(resp.status, 403);
    assertEquals(Deno.env.get('GLM_TRIGGER_KEY_REFRESH'), '1');
  } finally {
    globalThis.fetch = originalFetch;
    if (originalTrigger === undefined) Deno.env.delete('GLM_TRIGGER_KEY_REFRESH');
    else Deno.env.set('GLM_TRIGGER_KEY_REFRESH', originalTrigger);
  }
});

Deno.test('proxyOpenAI triggers immediate GLM key refresh on 403 revoked key', async () => {
  const originalTrigger = Deno.env.get('GLM_TRIGGER_KEY_REFRESH');
  Deno.env.delete('GLM_TRIGGER_KEY_REFRESH');
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    return new Response('This API key has been revoked.', {
      status: 403,
      headers: { 'content-type': 'text/plain' },
    });
  }) as typeof fetch;

  try {
    const resp = await proxyOpenAI(
      '/v1/responses',
      new Request('http://localhost/v1/responses', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: 'glm-5.2',
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
        defaultModel: 'glm-5.2',
        chatBaseUrl: 'https://api.babel.town/v1',
        needRetry: true,
        glmTryGetKey: true,
        requestIntervalMs: 5,
        glmKeyFetchRetryCount: 3,
        glmKeyFetchRetryDelayMs: 1,
      },
    );
    assertEquals(resp.status, 403);
    assertEquals(Deno.env.get('GLM_TRIGGER_KEY_REFRESH'), '1');
  } finally {
    globalThis.fetch = originalFetch;
    if (originalTrigger === undefined) Deno.env.delete('GLM_TRIGGER_KEY_REFRESH');
    else Deno.env.set('GLM_TRIGGER_KEY_REFRESH', originalTrigger);
  }
});

Deno.test('proxyOpenAI fetches and uses a fresh GLM key inside the Deno process', async () => {
  const dotenvFile = await Deno.makeTempFile({ suffix: '.env' });
  const originalDotenvPath = Deno.env.get('DOTENV_PATH');
  const originalOpenAiKey = Deno.env.get('OPENAI_API_KEY');
  const seenKeys: string[] = [];
  let glmKeyFetches = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === 'https://glm.babel.town/api/get_api_key') {
      glmKeyFetches++;
      return new Response(
        JSON.stringify({ success: true, api_key: 'babeltown-fresh-key', minutes_left: 60 }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    seenKeys.push((init?.headers as Headers).get('x-api-key') ?? '');
    if (seenKeys.length === 1) {
      return new Response('This API key has expired.', {
        status: 403,
        headers: { 'content-type': 'text/plain' },
      });
    }
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    await Deno.writeTextFile(dotenvFile, 'OPENAI_API_KEY=babeltown-old-key\n');
    Deno.env.set('DOTENV_PATH', dotenvFile);
    Deno.env.delete('OPENAI_API_KEY');
    const resp = await proxyOpenAI(
      '/v1/chat/completions',
      new Request('http://localhost/v1/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: 'glm-5.2',
          messages: [{ role: 'user', content: 'hello' }],
        }),
      }),
      {
        ...config,
        defaultModel: 'glm-5.2',
        chatBaseUrl: 'https://api.babel.town/v1',
        glmTryGetKey: true,
        needRetry: true,
        requestIntervalMs: 1,
        glmKeyFetchRetryCount: 3,
        glmKeyFetchRetryDelayMs: 1,
        defaultApiKey: 'stale-key',
        apiKeys: ['stale-key'],
      },
    );
    assertEquals(resp.status, 200);
    assertEquals(glmKeyFetches, 1);
    assertEquals(seenKeys, ['babeltown-old-key', 'babeltown-fresh-key']);
    assertEquals(Deno.env.get('OPENAI_API_KEY'), 'babeltown-fresh-key');
    const dotenvText = await Deno.readTextFile(dotenvFile);
    assertMatch(dotenvText, /OPENAI_API_KEY=babeltown-fresh-key/);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalDotenvPath === undefined) Deno.env.delete('DOTENV_PATH');
    else Deno.env.set('DOTENV_PATH', originalDotenvPath);
    if (originalOpenAiKey === undefined) Deno.env.delete('OPENAI_API_KEY');
    else Deno.env.set('OPENAI_API_KEY', originalOpenAiKey);
    await Deno.remove(dotenvFile).catch(() => {});
  }
});

Deno.test('proxyOpenAI retries fetching GLM key when refresh endpoint is flaky', async () => {
  const dotenvFile = await Deno.makeTempFile({ suffix: '.env' });
  const originalDotenvPath = Deno.env.get('DOTENV_PATH');
  const originalOpenAiKey = Deno.env.get('OPENAI_API_KEY');
  const seenKeys: string[] = [];
  let glmKeyFetches = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === 'https://glm.babel.town/api/get_api_key') {
      glmKeyFetches++;
      if (glmKeyFetches < 3) {
        return new Response('temporary overload', { status: 503 });
      }
      return new Response(
        JSON.stringify({ success: true, api_key: 'babeltown-retry-key', minutes_left: 60 }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    seenKeys.push((init?.headers as Headers).get('x-api-key') ?? '');
    if (seenKeys.length === 1) {
      return new Response('This API key has expired.', {
        status: 403,
        headers: { 'content-type': 'text/plain' },
      });
    }
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    await Deno.writeTextFile(dotenvFile, 'OPENAI_API_KEY=babeltown-old-key\n');
    Deno.env.set('DOTENV_PATH', dotenvFile);
    Deno.env.delete('OPENAI_API_KEY');
    const resp = await proxyOpenAI(
      '/v1/chat/completions',
      new Request('http://localhost/v1/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: 'glm-5.2',
          messages: [{ role: 'user', content: 'hello' }],
        }),
      }),
      {
        ...config,
        defaultModel: 'glm-5.2',
        chatBaseUrl: 'https://api.babel.town/v1',
        glmTryGetKey: true,
        needRetry: true,
        requestIntervalMs: 1,
        glmKeyFetchRetryCount: 3,
        glmKeyFetchRetryDelayMs: 1,
        defaultApiKey: 'stale-key',
        apiKeys: ['stale-key'],
      },
    );
    assertEquals(resp.status, 200);
    assertEquals(glmKeyFetches, 3);
    assertEquals(seenKeys, ['babeltown-old-key', 'babeltown-retry-key']);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalDotenvPath === undefined) Deno.env.delete('DOTENV_PATH');
    else Deno.env.set('DOTENV_PATH', originalDotenvPath);
    if (originalOpenAiKey === undefined) Deno.env.delete('OPENAI_API_KEY');
    else Deno.env.set('OPENAI_API_KEY', originalOpenAiKey);
    await Deno.remove(dotenvFile).catch(() => {});
  }
});

Deno.test('proxyOpenAI does not treat non-babel GLM channels as auto-refresh targets', async () => {
  let calls = 0;
  const originalTrigger = Deno.env.get('GLM_TRIGGER_KEY_REFRESH');
  Deno.env.delete('GLM_TRIGGER_KEY_REFRESH');
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    calls++;
    return new Response(JSON.stringify({ error: { message: '额度不足，请稍后再试' } }), {
      status: 429,
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
          model: 'glm-5.2',
          messages: [{ role: 'user', content: 'hello' }],
        }),
      }),
      {
        ...config,
        defaultModel: 'glm-5.2',
        chatBaseUrl: 'https://some-other-proxy.example/v1',
        needRetry: true,
        glmTryGetKey: true,
        requestIntervalMs: 5,
      },
    );
    assertEquals(resp.status, 429);
    assertEquals(calls > 0, true);
    assertEquals(Deno.env.get('GLM_TRIGGER_KEY_REFRESH'), undefined);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalTrigger === undefined) Deno.env.delete('GLM_TRIGGER_KEY_REFRESH');
    else Deno.env.set('GLM_TRIGGER_KEY_REFRESH', originalTrigger);
  }
});

Deno.test('proxyOpenAI retries antigravity project_id errors when NEED_RETRY is enabled', async () => {
  let calls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    calls++;
    if (calls === 1) {
      return new Response(
        JSON.stringify({
          error: {
            message: 'antigravity auth missing project_id: no project_id in response',
            type: 'invalid_request_error',
            param: '',
            code: null,
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
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
      { ...config, requestIntervalMs: 5, needRetry: true },
    );
    assertEquals(resp.status, 200);
    assertEquals(calls, 2);
    assertEquals(await resp.json(), { ok: true });
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

Deno.test('proxyOpenAI logs raw fallback chat and final client responses separately', async () => {
  const originalFetch = globalThis.fetch;
  const originalLogDir = Deno.env.get('HUBPROXY_LOG_DIR');
  const logDir = await Deno.makeTempDir();
  globalThis.fetch = (async (_input: RequestInfo | URL, _init?: RequestInit) => {
    return new Response(
      [
        'data: {"choices":[{"delta":{"content":"ok"},"finish_reason":null}]}',
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
    Deno.env.set('HUBPROXY_LOG_DIR', logDir);
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
      { collaborationModeKind: 'goal' },
    );

    assertEquals(resp.status, 200);
    const logEntries = Array.from(Deno.readDirSync(logDir))
      .filter((entry) => entry.isFile)
      .map((entry) =>
        JSON.parse(Deno.readTextFileSync(`${logDir}/${entry.name}`)) as Record<string, unknown>
      )
      .filter((entry) => entry.path === '/v1/responses');

    const rawFallback = logEntries.find((entry) => entry.stage === 'upstream_chat_fallback_raw');
    const finalClient = logEntries.find((entry) => entry.stage === 'client_response_final');
    const rawFallbackStream = logEntries.find((entry) =>
      entry.stage === 'upstream_chat_fallback_stream_raw'
    );
    const finalClientStream = logEntries.find((entry) =>
      entry.stage === 'client_response_stream_final'
    );
    assert(rawFallback);
    assertEquals(rawFallback?.fallback, true);
    assertEquals(typeof rawFallback?.body, 'string');
    assert((rawFallback?.body as string).includes('data: {"choices"'));
    assert((rawFallback?.body as string).includes('data: [DONE]'));
    assert(rawFallbackStream);
    assertEquals(typeof rawFallbackStream?.body, 'string');
    assert((rawFallbackStream?.body as string).includes('data: [DONE]'));

    assert(finalClient);
    assertEquals(finalClient?.target, 'client');
    assertEquals(typeof finalClient?.body, 'string');
    assert((finalClient?.body as string).includes('event: response.output_text.delta'));
    assert((finalClient?.body as string).includes('event: response.completed'));
    assert(finalClientStream);
    assertEquals(typeof finalClientStream?.body, 'string');
    assert((finalClientStream?.body as string).includes('event: response.completed'));
  } finally {
    if (originalLogDir === undefined) Deno.env.delete('HUBPROXY_LOG_DIR');
    else Deno.env.set('HUBPROXY_LOG_DIR', originalLogDir);
    await Deno.remove(logDir, { recursive: true }).catch(() => {});
    globalThis.fetch = originalFetch;
  }
});

Deno.test('proxyOpenAI logs raw native responses SSE streams', async () => {
  const originalFetch = globalThis.fetch;
  const originalLogDir = Deno.env.get('HUBPROXY_LOG_DIR');
  const logDir = await Deno.makeTempDir();
  globalThis.fetch = (async (_input: RequestInfo | URL, _init?: RequestInit) => {
    return new Response(
      [
        'event: response.output_text.delta',
        'data: {"type":"response.output_text.delta","delta":"hello"}',
        '',
        'event: response.completed',
        'data: {"type":"response.completed","response":{"id":"resp_1"}}',
        '',
      ].join('\n'),
      {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      },
    );
  }) as typeof fetch;

  try {
    Deno.env.set('HUBPROXY_LOG_DIR', logDir);
    const resp = await proxyOpenAI(
      '/v1/responses',
      new Request('http://localhost/v1/responses', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: 'gpt-4.1',
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
      config,
      { collaborationModeKind: 'goal' },
    );

    assertEquals(resp.status, 200);
    const logEntries = Array.from(Deno.readDirSync(logDir))
      .filter((entry) => entry.isFile)
      .map((entry) =>
        JSON.parse(Deno.readTextFileSync(`${logDir}/${entry.name}`)) as Record<string, unknown>
      )
      .filter((entry) => entry.path === '/v1/responses');

    const upstreamStream = logEntries.find((entry) => entry.stage === 'upstream_responses_stream_raw');
    const finalClientStream = logEntries.find((entry) =>
      entry.stage === 'client_response_stream_final'
    );

    assert(upstreamStream);
    assertEquals(typeof upstreamStream?.body, 'string');
    assert((upstreamStream?.body as string).includes('event: response.output_text.delta'));
    assert((upstreamStream?.body as string).includes('event: response.completed'));

    assert(finalClientStream);
    assertEquals(typeof finalClientStream?.body, 'string');
    assert((finalClientStream?.body as string).includes('event: response.output_text.delta'));
  } finally {
    if (originalLogDir === undefined) Deno.env.delete('HUBPROXY_LOG_DIR');
    else Deno.env.set('HUBPROXY_LOG_DIR', originalLogDir);
    await Deno.remove(logDir, { recursive: true }).catch(() => {});
    globalThis.fetch = originalFetch;
  }
});

Deno.test('proxyOpenAI preserves logged native responses SSE tail content', async () => {
  const originalFetch = globalThis.fetch;
  const upstreamDoneText = [
    '现在默认会写到 `logs/` 了，不需要再显式传 `--logs` 或设置 `HUBPROXY_LOG_DIR`。',
    '',
    '我改了这两个地方：',
    '- [src/handlers.ts](/home/vscode/projects/hubproxy/src/handlers.ts:267)',
    '- [src/proxy.ts](/home/vscode/projects/hubproxy/src/proxy.ts:355)',
    '',
    '逻辑变成：',
    '- 如果设置了 `HUBPROXY_LOG_DIR`，继续用它',
    '- 如果没设置，默认用仓库根下的 `logs`',
    '',
    '我也重启了 Deno 服务，并做了本地验证。刚才对 `http://127.0.0.1:27787/v1/models` 发请求后，`logs/` 里已经自动新增了：',
    '- `models-2026-06-30T10-55-11-470Z-...json`',
    '- `request-2026-06-30T10-55-11-036Z-...json`',
    '- `upstream-2026-06-30T10-55-11-040Z-...json`',
    '',
    '所以“默认写到 `logs/`”这件事已经生效了。',
    '',
    '还差一点要说明：',
    '- `stream-*` 只有在真正经过 SSE 响应路径时才会出现',
    '- 你刚才这次验证打的是 `/v1/models`，所以不会有 `stream-*`',
    '',
    '如果你要，我下一步可以直接帮你打一条 `/v1/responses` 的流式请求，确认 `stream-*` 也会落出来。',
  ].join('\n');
  const tailDeltas = [
    '不会有',
    ' `',
    'stream',
    '-*',
    '`\n\n',
    '如果',
    '你',
    '要',
    '，我',
    '下一',
    '步',
    '可以',
    '直接',
    '帮',
    '你',
    '打一',
    '条',
    ' `/',
    'v',
    '1',
    '/res',
    'ponses',
    '`',
    ' 的',
    '流',
    '式',
    '请求',
    '，',
    '确认',
    ' `',
    'stream',
    '-*',
    '`',
    ' ',
    '也',
    '会',
    '落',
    '出来',
    '。',
  ];
  globalThis.fetch = (async (_input: RequestInfo | URL, _init?: RequestInit) => {
    return new Response(
      [
        'event: response.created',
        'data: {"type":"response.created","response":{"id":"resp_1"}}',
        '',
        'event: response.output_item.added',
        'data: {"type":"response.output_item.added","item":{"id":"msg_1","type":"message","role":"assistant","content":[{"type":"output_text","text":""}]}}',
        '',
        ...tailDeltas.flatMap((delta) => [
          'event: response.output_text.delta',
          `data: ${JSON.stringify({ type: 'response.output_text.delta', delta })}`,
          '',
        ]),
        'event: response.output_item.done',
        `data: ${JSON.stringify({
          type: 'response.output_item.done',
          item: {
            id: 'msg_1',
            type: 'message',
            role: 'assistant',
            content: [{ type: 'output_text', text: upstreamDoneText }],
          },
        })}`,
        '',
        'event: response.completed',
        'data: {"type":"response.completed","response":{"id":"resp_1","status":"completed"}}',
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
          model: 'gpt-4.1',
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
      config,
      { collaborationModeKind: 'goal' },
    );

    assertEquals(resp.status, 200);
    const events = parseSseEvents(await resp.text());
    const deltas = events
      .filter((event) => event.event === 'response.output_text.delta')
      .map((event) => String(event.data.delta ?? ''));
    const done = events.find((event) => event.event === 'response.output_item.done');
    const item = done?.data.item as {
      content?: Array<{ text?: string }>;
    } | undefined;

    const expectedTailText =
      '不会有 `stream-*`\n\n如果你要，我下一步可以直接帮你打一条 `/v1/responses` 的流式请求，确认 `stream-*` 也会落出来。';

    assertEquals(deltas, tailDeltas);
    assertEquals(deltas.join(''), expectedTailText);
    assertEquals(item?.content?.[0]?.text, expectedTailText);
    assert(upstreamDoneText.includes(expectedTailText));
  } finally {
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

Deno.test('proxyOpenAI returns fixed Cloudflare model list locally', async () => {
  let called = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    called = true;
    return new Response('unexpected', { status: 500 });
  }) as typeof fetch;

  try {
    const resp = await proxyOpenAI(
      '/v1/models',
      new Request('http://localhost/v1/models'),
      { ...config, isCloudflare: true },
    );
    assertEquals(called, false);
    assertEquals(resp.status, 200);
    const body = await resp.json() as { object?: string; data?: Array<{ id?: string }> };
    assertEquals(body.object, 'list');
    assertEquals(body.data?.map((model) => model.id), [
      '@cf/moonshotai/kimi-k2.7-code',
      '@cf/openai/gpt-oss-120b',
      '@cf/moonshotai/kimi-k2.6',
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
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

Deno.test('proxyOpenAI rejects empty responses request body locally', async () => {
  const originalFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = (async () => {
    called = true;
    return new Response('unexpected', { status: 500 });
  }) as typeof fetch;

  try {
    const resp = await proxyOpenAI(
      '/v1/responses',
      new Request('http://localhost/v1/responses', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '',
      }),
      config,
    );
    assertEquals(resp.status, 400);
    assertEquals(called, false);
    const body = await resp.json() as { error?: { message?: string } };
    assertEquals(body.error?.message, 'Request body must be a non-empty JSON document.');
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

Deno.test('proxyOpenAI merges assistant text into tool-call message before tool outputs', async () => {
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
          model: 'mistralai/mistral-large-3-675b-instruct-2512',
          stream: false,
          input: [
            {
              type: 'function_call',
              call_id: 'call-1',
              name: 'exec_command',
              arguments: '{"cmd":"pwd"}',
            },
            {
              type: 'message',
              role: 'assistant',
              content: [{ type: 'output_text', text: 'I will inspect the repo.' }],
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
        nvidiaCompat: true,
      },
    );

    const body = JSON.parse(seen.body ?? '{}') as {
      messages?: Array<{
        role?: string;
        content?: string | Array<{ type?: string; text?: string }> | null;
        tool_calls?: Array<{ id?: string }>;
        tool_call_id?: string;
      }>;
    };
    assertEquals(body.messages?.length, 2);
    assertEquals(body.messages?.[0]?.role, 'assistant');
    assertEquals(body.messages?.[0]?.tool_calls?.[0]?.id, 'call-1');
    assertEquals(
      typeof body.messages?.[0]?.content === 'string'
        ? body.messages?.[0]?.content
        : (body.messages?.[0]?.content as Array<{ text?: string }>)[0]?.text,
      'I will inspect the repo.',
    );
    assertEquals(body.messages?.[1]?.role, 'tool');
    assertEquals(body.messages?.[1]?.tool_call_id, 'call-1');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test('proxyOpenAI repairs malformed function-call arguments for NVIDIA chat fallback', async () => {
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
          model: 'moonshotai/kimi-k2.6',
          stream: false,
          input: [
            {
              type: 'function_call',
              call_id: 'call-1',
              name: 'exec_command',
              arguments: '{"cmd":"cat > /tmp/demo << \'EOF\'\nunterminated"',
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
        forceChatCompletions: true,
        nvidiaCompat: true,
      },
    );

    const body = JSON.parse(seen.body ?? '{}') as {
      messages?: Array<{
        role?: string;
        tool_calls?: Array<{ function?: { arguments?: string } }>;
      }>;
    };
    const args = JSON.parse(body.messages?.[0]?.tool_calls?.[0]?.function?.arguments ?? '{}') as {
      cmd?: string;
    };
    assertEquals(typeof args.cmd, 'string');
    assertMatch(args.cmd ?? '', /malformed_tool_arguments/);
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

Deno.test('proxyOpenAI de-normalizes server names and normalizes dot-notation tool calls for the client', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_input: RequestInfo | URL, _init?: RequestInit) => {
    return new Response(
      [
        'event: response.output_item.done',
        'data: {"type":"response.output_item.done","item":{"id":"tc_mcp","type":"function_call","name":"mcp__code_index__.read_mcp_resource","arguments":"{\\"server\\":\\"mcp__code_index__\\",\\"uri\\":\\"file:///tmp/demo\\"}"}}',
        '',
        'event: response.completed',
        'data: {"type":"response.completed","response":{"id":"resp_mcp","status":"completed"}}',
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
            { type: 'namespace', name: 'mcp__code_index__' },
          ],
          input: [{ type: 'message', role: 'user', content: [{ type: 'input_text', text: 'hi' }] }],
        }),
      }),
      {
        ...config,
        responsesBaseUrl: 'http://127.0.0.1:8788/v1',
      },
    );

    const text = await resp.text();
    const dataLine = text.split('\n').find((line) => line.startsWith('data: '));
    const data = JSON.parse(dataLine!.slice(6));
    const mcpItem = data.item;

    // 1. Verify that server name is de-normalized back to 'code-index' for the client
    const args = JSON.parse(mcpItem.arguments);
    assertEquals(args.server, 'code-index');

    // 2. Verify that the namespaced dot notation is correctly un-flattened
    assertEquals(mcpItem.namespace, 'mcp__code_index__');
    assertEquals(mcpItem.name, 'read_mcp_resource');
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

Deno.test('proxyOpenAI force-routes responses to chat when responses base url is configured', async () => {
  const seen: { url?: string; body?: string } = {};
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/v1/responses')) {
      throw new Error(`unexpected responses upstream call: ${url}`);
    }
    seen.url = url;
    seen.body = typeof init?.body === 'string' ? init.body : undefined;
    return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
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
        forceChatCompletions: true,
      },
    );
    assertEquals(resp.status, 200);
    assertEquals(seen.url, 'http://127.0.0.1:8789/v1/chat/completions');
    const upstreamBody = JSON.parse(seen.body ?? '{}') as {
      input?: unknown;
      messages?: Array<{ role?: string; content?: string }>;
    };
    assertEquals(upstreamBody.input, undefined);
    assertEquals(
      upstreamBody.messages?.find((message) => message.role === 'user')?.content,
      'hello',
    );
    const clientBody = await resp.json() as { output_text?: string };
    assertEquals(clientBody.output_text, 'ok');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test('proxyOpenAI strips NVIDIA-incompatible client metadata in chat fallback', async () => {
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
    const resp = await proxyOpenAI(
      '/v1/responses',
      new Request('http://localhost/v1/responses', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: 'z-ai/glm-5.1',
          stream: false,
          client_metadata: { thread_id: 'thread-1' },
          prompt_cache_key: 'cache-1',
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
        forceChatCompletions: true,
        nvidiaCompat: true,
      },
    );
    assertEquals(resp.status, 200);
    const upstreamBody = JSON.parse(seen.body ?? '{}') as Record<string, unknown>;
    assertEquals(upstreamBody.client_metadata, undefined);
    assertEquals(upstreamBody.prompt_cache_key, undefined);
    assertEquals(upstreamBody.messages instanceof Array, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test('proxyOpenAI keeps Cloudflare base path when IS_CF is enabled', async () => {
  const seen: { url?: string } = {};
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, _init?: RequestInit) => {
    seen.url = String(input);
    return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    const resp = await proxyOpenAI(
      '/v1/responses',
      new Request('http://localhost/v1/responses', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: '@cf/moonshotai/kimi-k2.7-code',
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
        chatBaseUrl: 'https://api.cloudflare.com/client/v4/accounts/acct/ai/v1',
        forceChatCompletions: true,
        isCloudflare: true,
      },
    );
    assertEquals(resp.status, 200);
    assertEquals(
      seen.url,
      'https://api.cloudflare.com/client/v4/accounts/acct/ai/v1/chat/completions',
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test('proxyOpenAI force-routes responses compact to chat completions path', async () => {
  const seen: { url?: string } = {};
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, _init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/v1/responses')) {
      throw new Error(`unexpected responses upstream call: ${url}`);
    }
    seen.url = url;
    return new Response(JSON.stringify({ choices: [{ message: { content: 'compact ok' } }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    const resp = await proxyOpenAI(
      '/v1/responses/compact?trace=1',
      new Request('http://localhost/v1/responses/compact?trace=1', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: 'models/mimo-v2.5-pro',
          stream: false,
          input: [
            {
              type: 'message',
              role: 'user',
              content: [{ type: 'input_text', text: 'compact' }],
            },
          ],
        }),
      }),
      {
        ...config,
        forceChatCompletions: true,
      },
    );
    assertEquals(resp.status, 200);
    assertEquals(seen.url, 'http://127.0.0.1:8789/v1/chat/completions?trace=1');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test('proxyOpenAI auto-compacts oversized custom-context responses requests before forwarding', async () => {
  const seen: Array<{ url: string; body?: string }> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = typeof init?.body === 'string' ? init.body : undefined;
    seen.push({ url, body });
    if (body?.includes('Produce a compact continuation summary')) {
      return new Response(JSON.stringify({ choices: [{ message: { content: 'summary: keep only key state' } }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    const longText = 'x'.repeat(5000);
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
              content: [{ type: 'input_text', text: longText }],
            },
          ],
        }),
      }),
      {
        ...config,
        responsesBaseUrl: null,
        forceChatCompletions: true,
        customContextWindowTokens: 1024,
        contextCompactThresholdPercent: 90,
      },
    );
    assertEquals(resp.status, 200);
    assertEquals(seen.length, 2);
    assertEquals(seen[0].url, 'http://127.0.0.1:8789/v1/chat/completions');
    assertEquals(seen[1].url, 'http://127.0.0.1:8789/v1/chat/completions');
    const forwarded = JSON.parse(seen[1].body ?? '{}') as { messages?: Array<{ content?: unknown }> };
    const serialized = JSON.stringify(forwarded);
    assertEquals(serialized.includes('Compressed prior context summary'), true);
    assertEquals(serialized.includes('summary: keep only key state'), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test('proxyOpenAI compacts on upstream context-length overflow 400 and retries once', async () => {
  const seen: Array<{ url: string; body?: string; status?: number }> = [];
  const originalFetch = globalThis.fetch;
  let mainCallCount = 0;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = typeof init?.body === 'string' ? init.body : undefined;
    seen.push({ url, body });

    if (body?.includes('Produce a compact continuation summary')) {
      return new Response(
        JSON.stringify({ choices: [{ message: { content: 'summary: condense prior turns' } }] }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }

    mainCallCount += 1;
    if (mainCallCount === 1) {
      return new Response(
        JSON.stringify({
          error: {
            message:
              "This model's maximum context length is 202752 tokens. However, your messages resulted in 203774 tokens. Please reduce the length of the messages.",
            type: 'BadRequest',
            code: '400',
          },
        }),
        { status: 400, headers: { 'content-type': 'application/json' } },
      );
    }
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    const longText = 'x'.repeat(500);
    const resp = await proxyOpenAI(
      '/v1/responses',
      new Request('http://localhost/v1/responses', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: 'z-ai/glm-5.2',
          stream: false,
          input: [
            {
              type: 'message',
              role: 'user',
              content: [{ type: 'input_text', text: longText }],
            },
          ],
        }),
      }),
      {
        ...config,
        responsesBaseUrl: null,
        forceChatCompletions: true,
        customContextWindowTokens: 200000,
        contextCompactThresholdPercent: 85,
      },
    );
    assertEquals(resp.status, 200);
    // Expect: 1 compact handshake + 1 original main call + 1 retried main call = 3 total.
    const chatCalls = seen.filter((e) => e.url === 'http://127.0.0.1:8789/v1/chat/completions');
    assertEquals(chatCalls.length, 3);
    const handshake = chatCalls.filter((e) => (e.body ?? '').includes('Produce a compact continuation summary'));
    assertEquals(handshake.length, 1);
    const mainCalls = chatCalls.filter((e) => !(e.body ?? '').includes('Produce a compact continuation summary'));
    assertEquals(mainCalls.length, 2);
    const retried = JSON.parse(mainCalls[1].body ?? '{}') as { input?: unknown };
    const serialized = JSON.stringify(retried);
    assertEquals(serialized.includes('Compressed prior context summary'), true);
    assertEquals(serialized.includes('summary: condense prior turns'), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test('proxyOpenAI compacts overflow 400 on direct chat/completions path too', async () => {
  const seen: Array<{ url: string; body?: string }> = [];
  const originalFetch = globalThis.fetch;
  let mainCallCount = 0;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = typeof init?.body === 'string' ? init.body : undefined;
    seen.push({ url, body });
    if (body?.includes('Produce a compact continuation summary')) {
      return new Response(
        JSON.stringify({ choices: [{ message: { content: 'summary: prior goals condensed' } }] }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    mainCallCount += 1;
    if (mainCallCount === 1) {
      return new Response(
        JSON.stringify({
          error: {
            message:
              "This model's maximum context length is 202752 tokens. However, your messages resulted in 203807 tokens. Please reduce the length of the messages.",
            type: 'BadRequest',
            code: '400',
          },
        }),
        { status: 400, headers: { 'content-type': 'application/json' } },
      );
    }
    return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    const longHistory: Array<{ role: string; content: string }> = [];
    for (let i = 0; i < 200; i++) longHistory.push({ role: i % 2 ? 'assistant' : 'user', content: 'x'.repeat(200) });
    longHistory.push({ role: 'user', content: 'final question about the task' });
    const resp = await proxyOpenAI(
      '/v1/chat/completions',
      new Request('http://localhost/v1/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: 'z-ai/glm-5.2',
          stream: false,
          messages: longHistory,
        }),
      }),
      {
        ...config,
        responsesBaseUrl: null,
        forceChatCompletions: true,
        nvidiaCompat: true,
        customContextWindowTokens: 200000,
        contextCompactThresholdPercent: 85,
      },
    );
    assertEquals(resp.status, 200);
    const chatCalls = seen.filter((e) => e.url === 'http://127.0.0.1:8789/v1/chat/completions');
    assertEquals(chatCalls.length, 3);
    const handshake = chatCalls.filter((e) => (e.body ?? '').includes('Produce a compact continuation summary'));
    assertEquals(handshake.length, 1);
    const mainCalls = chatCalls.filter((e) => !(e.body ?? '').includes('Produce a compact continuation summary'));
    assertEquals(mainCalls.length, 2);
    // Retried body must shrink: messages replaced with [system summary, last user turn]
    const retried = JSON.parse(mainCalls[1].body ?? '{}') as { messages: Array<{ role: string; content: string }> };
    assertEquals(retried.messages.length, 2);
    assertEquals(retried.messages[0].role, 'system');
    assertEquals(retried.messages[0].content.includes('Compressed prior context summary'), true);
    assertEquals(retried.messages[0].content.includes('summary: prior goals condensed'), true);
    assertEquals(retried.messages[1].role, 'user');
    assertEquals(retried.messages[1].content, 'final question about the task');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
Deno.test('proxyOpenAI force-routes Gemini tool history to chat fallback best effort', async () => {
  const seen: { url?: string; body?: string } = {};
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/v1/responses')) {
      throw new Error(`unexpected responses upstream call: ${url}`);
    }
    seen.url = url;
    seen.body = typeof init?.body === 'string' ? init.body : undefined;
    return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    const resp = await proxyOpenAI(
      '/v1/responses',
      new Request('http://localhost/v1/responses', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: 'models/gemini-3-flash-preview',
          stream: false,
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
        forceChatCompletions: true,
      },
    );
    assertEquals(resp.status, 200);
    assertEquals(seen.url, 'http://127.0.0.1:8789/v1/chat/completions');
    const body = JSON.parse(seen.body ?? '{}') as {
      messages?: Array<{ role?: string; tool_calls?: unknown; name?: string }>;
    };
    assertEquals(body.messages?.[0]?.role, 'assistant');
    assertEquals(Array.isArray(body.messages?.[0]?.tool_calls), true);
    assertEquals(body.messages?.[1]?.role, 'tool');
    assertEquals(body.messages?.[1]?.name, 'exec_command');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test('proxyOpenAI force mode rejects unconvertible responses requests without upstream', async () => {
  let called = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    called = true;
    return new Response('unexpected', { status: 500 });
  }) as typeof fetch;

  try {
    const resp = await proxyOpenAI(
      '/v1/responses',
      new Request('http://localhost/v1/responses', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{',
      }),
      {
        ...config,
        forceChatCompletions: true,
      },
    );
    assertEquals(resp.status, 400);
    assertEquals(called, false);
    const body = await resp.json() as { error?: { message?: string } };
    assertEquals(body.error?.message, 'Responses request cannot be converted to Chat Completions.');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test('proxyOpenAI routes responses to chat base when responses base url is missing and chat fallback is unavailable', async () => {
  const seen: { url?: string; body?: string } = {};
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    seen.url = String(input);
    seen.body = typeof init?.body === 'string' ? init.body : undefined;
    return new Response(
      JSON.stringify({
        id: 'resp_raw',
        object: 'response',
        output: [
          {
            type: 'message',
            role: 'assistant',
            content: [{ type: 'output_text', text: 'ok' }],
          },
        ],
        output_text: 'ok',
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
          model: 'models/gemini-2.5-pro',
          input: [
            {
              type: 'function_call',
              call_id: 'call_1',
              name: 'read_file',
              arguments: '{}',
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
    assertEquals(seen.url, 'http://127.0.0.1:8789/v1/responses');
    assertEquals(JSON.parse(seen.body ?? '{}').model, 'models/gemini-2.5-pro');
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

Deno.test('proxyOpenAI merges split chat tool-call chunks before normalizing', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_input: RequestInfo | URL, _init?: RequestInit) =>
    new Response(
      [
        'data: {"choices":[{"delta":{"content":"我先检查当前工作区。"},"finish_reason":null}]}',
        '',
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_pwd","type":"function","function":{"name":"exec_command","arguments":""}}]},"finish_reason":null}]}',
        '',
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":null,"type":"function","function":{"name":null,"arguments":"{\\"cmd\\":"}}]},"finish_reason":null}]}',
        '',
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":null,"type":"function","function":{"name":null,"arguments":"\\"pwd\\"}"}}]},"finish_reason":null}]}',
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
    )) as typeof fetch;

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
      { collaborationModeKind: 'code' },
    );
    const text = await resp.text();
    const events = parseSseEvents(text);
    const toolCallEvent = events.find((event) =>
      (event.data.item as Record<string, unknown> | undefined)?.type === 'function_call'
    );
    const item = toolCallEvent?.data.item as Record<string, unknown> | undefined;
    assertEquals(item?.call_id, 'call_pwd');
    assertEquals(item?.name, 'exec_command');
    assertEquals(item?.arguments, '{"cmd":"pwd"}');
    assertEquals(text.includes('Tool unknown is unavailable'), false);
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
      { collaborationModeKind: 'goal' },
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
      { collaborationModeKind: 'goal' },
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
      { collaborationModeKind: 'goal' },
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

Deno.test('proxyOpenAI repairs collapsed namespaced tool calls from NVIDIA stream', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_input: RequestInfo | URL, _init?: RequestInit) => {
    return new Response(
      [
        'data: {"choices":[{"delta":{"tool_calls":[{"id":"call_mcp","type":"function","function":{"name":"mcp__code_indexsearch","arguments":"{\\"query\\":\\"obvious remaining work\\"}"},"index":0}]},"finish_reason":null}]}',
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
          model: 'moonshotai/kimi-k2.6',
          stream: true,
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
          ],
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
    const toolEvent = events.find((event) => event.event === 'response.output_item.done');
    assertEquals((toolEvent?.data.item as { namespace?: string }).namespace, 'mcp__code_index__');
    assertEquals((toolEvent?.data.item as { name?: string }).name, 'search');
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

Deno.test('proxyOpenAI maps think tags into reasoning output items', async () => {
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
            content: '<think>internal think</think>Hello think',
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
      }>;
      output_text?: string;
    };
    assertEquals(body.output?.[0]?.type, 'reasoning');
    assertEquals(body.output?.[0]?.summary?.[0]?.text, 'internal think');
    assertEquals(body.output?.[1]?.type, 'message');
    assertEquals(body.output?.[1]?.content?.[0]?.text, 'Hello think');
    assertEquals(body.output_text, 'Hello think');
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

Deno.test('proxyOpenAI maps think tags in chat stream into reasoning events', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, _init?: RequestInit) => {
    const url = String(input);
    if (!url.includes('/v1/chat/completions')) {
      throw new Error(`unexpected upstream url: ${url}`);
    }
    return new Response(
      [
        'data: {"choices":[{"delta":{"content":"<think>internal "},"finish_reason":null}]}',
        '',
        'data: {"choices":[{"delta":{"content":"stream</think>answer"},"finish_reason":null}]}',
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
    const summaryDeltas = events
      .filter((event) => event.event === 'response.reasoning_summary_text.delta')
      .map((event) => event.data.delta);
    assertEquals(summaryDeltas, ['internal ', '\nstream']);
    const answerDelta = events.find((event) =>
      event.event === 'response.output_text.delta' && event.data.delta === 'answer'
    );
    assert(answerDelta);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test('proxyOpenAI strips orphan think closing tags from chat stream output', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, _init?: RequestInit) => {
    const url = String(input);
    if (!url.includes('/v1/chat/completions')) {
      throw new Error(`unexpected upstream url: ${url}`);
    }
    return new Response(
      [
        'data: {"choices":[{"delta":{"content":"plan step one"},"finish_reason":null}]}',
        '',
        'data: {"choices":[{"delta":{"content":"。 </think> final answer"},"finish_reason":null}]}',
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
    const outputText = events
      .filter((event) => event.event === 'response.output_text.delta')
      .map((event) => event.data.delta)
      .join('');
    assertEquals(outputText.includes('</think>'), false);
    assertEquals(outputText.includes('plan step one。 final answer'), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test('proxyOpenAI strips standalone think closing tag chunks from chat stream output', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, _init?: RequestInit) => {
    const url = String(input);
    if (!url.includes('/v1/chat/completions')) {
      throw new Error(`unexpected upstream url: ${url}`);
    }
    return new Response(
      [
        'data: {"choices":[{"delta":{"content":"before"},"finish_reason":null}]}',
        '',
        'data: {"choices":[{"delta":{"content":"</think>"},"finish_reason":null}]}',
        '',
        'data: {"choices":[{"delta":{"content":"after"},"finish_reason":null}]}',
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
    const outputDeltas = events
      .filter((event) => event.event === 'response.output_text.delta')
      .map((event) => event.data.delta);
    const outputText = outputDeltas.join('');
    assertEquals(outputDeltas.includes('</think>'), false);
    assertEquals(outputText, 'beforeafter');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test('proxyOpenAI strips standalone think closing tags from chat JSON output', async () => {
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
            content: 'before</think>after',
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
      output_text?: string;
      output?: Array<{ content?: Array<{ text?: string }> }>;
    };
    assertEquals(body.output_text, 'beforeafter');
    assertEquals(body.output?.[0]?.content?.[0]?.text?.includes('</think>'), false);
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

Deno.test('robustDenormalizeServerName handles various formats', () => {
  assertEquals(robustDenormalizeServerName('mcp__code_index__'), 'code-index');
  assertEquals(robustDenormalizeServerName('mcp__mimir__'), 'mimir');
  assertEquals(robustDenormalizeServerName('mcp__secure_coder__'), 'secure-coder');
  assertEquals(robustDenormalizeServerName('mcp__hello_world__'), 'hello-world');
  assertEquals(robustDenormalizeServerName('non_mcp_name'), 'non-mcp-name');
  assertEquals(
    robustDenormalizeServerName('mcp__my_custom_server_name__'),
    'my-custom-server-name',
  );

  // Verify that raw and partially normalized server names resolve properly too
  assertEquals(robustDenormalizeServerName('code_index'), 'code-index');
  assertEquals(robustDenormalizeServerName('code-index'), 'code-index');
  assertEquals(robustDenormalizeServerName('mimir'), 'mimir');
});

Deno.test('normalizeChatToolCall handles dot-notation namespaces and denormalizes server argument in arguments', () => {
  const namespaces = new Set(['mcp__code_index__', 'mcp__mimir__']);

  // Case 1: dot-notation call with unnormalized prefix (code_index)
  const call1 = {
    id: '1:tool',
    name: 'code_index.read_mcp_resource',
    arguments: JSON.stringify({ server: 'code_index', uri: 'skill://code-index/SKILL.md' }),
  };
  const res1 = normalizeChatToolCall(call1, namespaces);
  assertEquals(res1?.name, 'mcp__code_index__read_mcp_resource');
  const args1 = JSON.parse(res1?.arguments ?? '{}');
  assertEquals(args1.server, 'code-index');

  // Case 2: dot-notation call with hyphenated prefix (code-index)
  const call2 = {
    id: '2:tool',
    name: 'code-index.read_mcp_resource',
    arguments: JSON.stringify({ server: 'code-index', uri: 'skill://code-index/SKILL.md' }),
  };
  const res2 = normalizeChatToolCall(call2, namespaces);
  assertEquals(res2?.name, 'mcp__code_index__read_mcp_resource');
  const args2 = JSON.parse(res2?.arguments ?? '{}');
  assertEquals(args2.server, 'code-index');

  // Case 3: dot-notation call with fully normalized prefix (mcp__code_index__)
  const call3 = {
    id: '3:tool',
    name: 'mcp__code_index__.read_mcp_resource',
    arguments: JSON.stringify({ server: 'mcp__code_index__', uri: 'skill://code-index/SKILL.md' }),
  };
  const res3 = normalizeChatToolCall(call3, namespaces);
  assertEquals(res3?.name, 'mcp__code_index__read_mcp_resource');
  const args3 = JSON.parse(res3?.arguments ?? '{}');
  assertEquals(args3.server, 'code-index');
});

Deno.test('normalizeResponsesEvent un-flattens namespaced tools and denormalizes server names in arguments', () => {
  const namespaces = new Set(['mcp__code_index__', 'mcp__mimir__']);

  // Case 1: un-flatten tool call
  const event1 = {
    type: 'response.output_item.added',
    item: {
      type: 'function_call',
      name: 'mcp__code_index__search',
      arguments: JSON.stringify({ query: 'hello' }),
    },
  };

  const res1 = normalizeResponsesEvent(event1, namespaces);
  assertEquals(res1.type, 'response.output_item.added');
  assertEquals((res1.item as Record<string, unknown>).type, 'function_call');
  assertEquals((res1.item as Record<string, unknown>).name, 'search');
  assertEquals((res1.item as Record<string, unknown>).namespace, 'mcp__code_index__');
  assertEquals((res1.item as Record<string, unknown>).output_kind, 'function_call_output');

  // Case 2: dot-notation in namespaced tools
  const event2 = {
    type: 'response.output_item.added',
    item: {
      type: 'function_call',
      name: 'mcp__code_index__.search',
      arguments: JSON.stringify({ query: 'hello' }),
    },
  };

  const res2 = normalizeResponsesEvent(event2, namespaces);
  assertEquals((res2.item as Record<string, unknown>).name, 'search');
  assertEquals((res2.item as Record<string, unknown>).namespace, 'mcp__code_index__');

  // Case 3: server name restoration in arguments (denormalization to hyphenated client registered server name)
  const event3 = {
    type: 'response.output_item.done',
    item: {
      type: 'function_call',
      name: 'mcp__code_index__read_mcp_resource',
      arguments: JSON.stringify({ server: 'mcp__code_index__', uri: 'file:///foo' }),
    },
  };

  const res3 = normalizeResponsesEvent(event3, namespaces);
  const args3 = JSON.parse((res3.item as Record<string, unknown>).arguments as string);
  assertEquals(args3.server, 'code-index');
  assertEquals((res3.item as Record<string, unknown>).name, 'read_mcp_resource');
  assertEquals((res3.item as Record<string, unknown>).namespace, 'mcp__code_index__');

  // Case 4: other server name restoration in arguments (e.g. from code_index to code-index)
  const event4 = {
    type: 'response.output_item.done',
    item: {
      type: 'function_call',
      name: 'mcp__code_index__read_mcp_resource',
      arguments: JSON.stringify({ server: 'code_index', uri: 'file:///foo' }),
    },
  };

  const res4 = normalizeResponsesEvent(event4, namespaces);
  const args4 = JSON.parse((res4.item as Record<string, unknown>).arguments as string);
  assertEquals(args4.server, 'code-index');

  // Case 5: custom server name mapping in arguments
  const event5 = {
    type: 'response.output_item.done',
    item: {
      type: 'function_call',
      name: 'mcp__custom_tool__some_tool',
      arguments: JSON.stringify({ server: 'mcp__custom_tool__' }),
    },
  };

  const res5 = normalizeResponsesEvent(event5, new Set(['mcp__custom_tool__']));
  const args5 = JSON.parse((res5.item as Record<string, unknown>).arguments as string);
  assertEquals(args5.server, 'custom-tool');
});
