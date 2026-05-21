import { assert, assertEquals } from 'jsr:@std/assert@1';
import { loadConfig, loadDotenvIntoEnv } from './env.ts';
import { handleHttpWithState } from './handlers.ts';
import { HubState } from './state.ts';

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
  const resp = await handleHttpWithState(
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
  ).finally(() => clearTimeout(timeoutId));

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
  const timeoutId = setTimeout(() => controller.abort(), 15000);
  const resp = await handleHttpWithState(
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
  ).finally(() => clearTimeout(timeoutId));

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
    success?: boolean;
    data?: Array<{
      id?: string;
      object?: string;
      created?: number;
      owned_by?: string;
      supported_endpoint_types?: string[];
    }>;
  };
  assertEquals(body.object, 'list');
  assertEquals(body.success, true);
  assert(body.data?.length && body.data.length > 0);
  assert(body.data?.[0]?.id);
  assert(body.data?.[0]?.object === 'model');
  assert(body.data?.[0]?.supported_endpoint_types?.includes('openai'));
});
