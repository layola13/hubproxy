import { assert, assertEquals } from 'jsr:@std/assert@1';
import { loadConfig, loadDotenvIntoEnv } from './env.ts';
import { handleHttpWithState } from './handlers.ts';
import { HubState } from './state.ts';

Deno.test('real upstream chat completion through local proxy', async () => {
  loadDotenvIntoEnv('.env');
  const config = loadConfig();
  assertEquals(config.authToken, 'local-secret');
  const state = new HubState();

  const resp = await handleHttpWithState(
    new Request('http://localhost/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${config.authToken}`,
      },
      body: JSON.stringify({
        model: config.defaultModel,
        messages: [{ role: 'user', content: 'Reply with exactly OK.' }],
        stream: false,
        temperature: 0,
      }),
    }),
    config,
    state,
  );

  assertEquals(resp.status, 200);
  const body = await resp.text();
  assert(body.length > 0);
  assert(body.includes('"') || body.includes('{'));
});

Deno.test('real upstream responses stream through local proxy', async () => {
  loadDotenvIntoEnv('.env');
  const config = loadConfig();
  assertEquals(config.authToken, 'local-secret');
  const state = new HubState();

  const resp = await handleHttpWithState(
    new Request('http://localhost/v1/responses', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${config.authToken}`,
      },
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
    }),
    config,
    state,
  );

  assertEquals(resp.status, 200);
  const body = await resp.text();
  assert(body.length > 0);
});
