import { assert, assertEquals } from 'jsr:@std/assert@1';
import { loadConfig, loadDotenvIntoEnv } from './env.ts';
import { handleHttpWithState } from './handlers.ts';
import { HubState } from './state.ts';

async function requestWithRetry(
  buildRequest: () => Request,
  config: Awaited<ReturnType<typeof loadConfig>>,
  state: HubState,
  attempts = 3,
): Promise<Response> {
  let lastResponse: Response | null = null;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    const response = await handleHttpWithState(
      new Request(buildRequest(), { signal: controller.signal }),
      config,
      state,
    ).finally(() => clearTimeout(timeoutId));
    if (response.status < 500) return response;
    lastResponse = response;
    await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
  }
  return lastResponse!;
}

Deno.test('real upstream chat completion through local proxy', async () => {
  loadDotenvIntoEnv('.env');
  const config = loadConfig();
  assert(config.authToken);
  const state = new HubState();

  const resp = await requestWithRetry(
    () =>
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
  assert(config.authToken);
  const state = new HubState();

  const resp = await requestWithRetry(
    () =>
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
