import { assert, assertEquals } from 'jsr:@std/assert@1';
import { loadConfig, loadDotenvIntoEnv } from './env.ts';
import { handleHttpWithState } from './handlers.ts';
import { HubState } from './state.ts';

async function runWithRetry<T>(
  fn: () => Promise<T>,
  attempts = 2,
  delayMs = 500,
): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (i + 1 < attempts) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }
  throw lastError;
}

function isUpstreamUnavailable(error: unknown): boolean {
  return error instanceof Error && error.message === 'upstream unavailable';
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

Deno.test('real upstream chat completion through local proxy', async () => {
  loadDotenvIntoEnv('.env');
  const config = loadConfig();
  assert(config.authToken);
  const state = new HubState();
  const authHeaders = {
    'content-type': 'application/json',
    authorization: `Bearer ${config.authToken}`,
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);
  const resp = await runWithRetry(async () => {
    const response = await handleHttpWithState(
      new Request('http://localhost/v1/chat/completions', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          model: config.defaultModel,
          messages: [{ role: 'user', content: 'Reply with exactly OK.' }],
          stream: false,
          temperature: 0,
        }),
        signal: controller.signal,
      }),
      config,
      state,
    );
    if (response.status === 503) throw new Error('upstream unavailable');
    return response;
  }).finally(() => clearTimeout(timeoutId));

  assertEquals(resp.status, 200);
  const body = await resp.text();
  assert(body.length > 0);
  assert(body.includes('"') || body.includes('{'));
});

Deno.test('real upstream responses stream through local proxy', async () => {
  loadDotenvIntoEnv('.env');
  const config = loadConfig();
  assert(config.authToken);
  const state = new HubState();
  const authHeaders = {
    'content-type': 'application/json',
    authorization: `Bearer ${config.authToken}`,
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);
  let resp: Response;
  try {
    resp = await runWithRetry(async () => {
      const response = await handleHttpWithState(
        new Request('http://localhost/v1/responses', {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({
            model: config.defaultModel,
            input: [
              {
                type: 'message',
                role: 'user',
                content: [{ type: 'input_text', text: 'Reply with exactly OK.' }],
              },
            ],
            stream: false,
          }),
          signal: controller.signal,
        }),
        config,
        state,
      );
      if (response.status === 503) {
        await response.body?.cancel().catch(() => {});
        throw new Error('upstream unavailable');
      }
      return response;
    });
  } catch (error) {
    clearTimeout(timeoutId);
    if (isUpstreamUnavailable(error) || isAbortError(error)) return;
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  assertEquals(resp.status, 200);
  const body = await resp.text();
  assert(body.length > 0);
});

Deno.test('real upstream models list through local proxy', async () => {
  loadDotenvIntoEnv('.env');
  const config = loadConfig();
  assert(config.defaultApiKey);
  assert(config.authToken);
  const state = new HubState();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);
  const resp = await handleHttpWithState(
    new Request('http://localhost/v1/models', {
      method: 'GET',
      headers: {
        authorization: `Bearer ${config.authToken}`,
      },
      signal: controller.signal,
    }),
    config,
    state,
  ).finally(() => clearTimeout(timeoutId));

  assertEquals(resp.status, 200);
  const body = await resp.json() as {
    object?: string;
    data?: Array<{
      id?: string;
      object?: string;
      created?: number;
      owned_by?: string;
    }>;
  };
  assertEquals(body.object, 'list');
  assert(body.data?.length && body.data.length > 0);
  assert(body.data?.[0]?.id);
  assert(body.data?.[0]?.object === 'model');
});
