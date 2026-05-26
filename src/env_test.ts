import { assertEquals } from 'jsr:@std/assert@1';
import { loadConfig, loadDotenvIntoEnv } from './env.ts';

Deno.test('loadDotenvIntoEnv loads plain keys and skips CODEX_ and log-dir keys', async () => {
  const file = await Deno.makeTempFile({ suffix: '.env' });
  try {
    await Deno.writeTextFile(
      file,
      [
        'PORT=9999',
        'CODEX_SECRET=skip-me',
        'HUBPROXY_LOG_DIR=logs',
        "DEFAULT_MODEL='gpt-test'",
      ].join('\n'),
    );
    Deno.env.delete('HUBPROXY_LOG_DIR');
    loadDotenvIntoEnv(file);
    assertEquals(Deno.env.get('PORT'), '9999');
    assertEquals(Deno.env.get('DEFAULT_MODEL'), 'gpt-test');
    assertEquals(Deno.env.get('CODEX_SECRET'), undefined);
    assertEquals(Deno.env.get('HUBPROXY_LOG_DIR'), undefined);
  } finally {
    Deno.env.delete('HUBPROXY_LOG_DIR');
    await Deno.remove(file).catch(() => {});
  }
});

Deno.test('loadConfig requires real environment variables', () => {
  const original = {
    PORT: Deno.env.get('PORT'),
    HOST: Deno.env.get('HOST'),
    AUTH: Deno.env.get('AUTH'),
    RESPONSES_BASE_URL: Deno.env.get('RESPONSES_BASE_URL'),
    CHAT_BASE_URL: Deno.env.get('CHAT_BASE_URL'),
    DEFAULT_MODEL: Deno.env.get('DEFAULT_MODEL'),
    OPENAI_API_KEY: Deno.env.get('OPENAI_API_KEY'),
    DATA_DIR: Deno.env.get('DATA_DIR'),
  };
  try {
    Deno.env.set('RESPONSES_BASE_URL', 'http://127.0.0.1:1/v1');
    Deno.env.set('CHAT_BASE_URL', 'http://127.0.0.1:2/v1');
    Deno.env.set('DEFAULT_MODEL', 'models/gemma-4-31b-it');
    Deno.env.set('OPENAI_API_KEY', 'secret-token');
    Deno.env.set('DATA_DIR', '/tmp');
    Deno.env.set('PORT', '9999');
    Deno.env.set('AUTH', 'local-secret');
    const config = loadConfig();
    assertEquals(config.responsesBaseUrl, 'http://127.0.0.1:1/v1');
    assertEquals(config.chatBaseUrl, 'http://127.0.0.1:2/v1');
    assertEquals(config.defaultModel, 'models/gemma-4-31b-it');
    assertEquals(config.port, 9999);
    assertEquals(config.authToken, 'local-secret');
  } finally {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) Deno.env.delete(key);
      else Deno.env.set(key, value);
    }
  }
});

Deno.test('loadConfig allows missing RESPONSES_BASE_URL and keeps chat base url', () => {
  const original = {
    PORT: Deno.env.get('PORT'),
    HOST: Deno.env.get('HOST'),
    AUTH: Deno.env.get('AUTH'),
    RESPONSES_BASE_URL: Deno.env.get('RESPONSES_BASE_URL'),
    CHAT_BASE_URL: Deno.env.get('CHAT_BASE_URL'),
    DEFAULT_MODEL: Deno.env.get('DEFAULT_MODEL'),
    OPENAI_API_KEY: Deno.env.get('OPENAI_API_KEY'),
    DATA_DIR: Deno.env.get('DATA_DIR'),
  };
  try {
    Deno.env.delete('RESPONSES_BASE_URL');
    Deno.env.set('CHAT_BASE_URL', 'http://127.0.0.1:2/v1');
    Deno.env.set('DEFAULT_MODEL', 'models/gemma-4-31b-it');
    Deno.env.set('OPENAI_API_KEY', 'secret-token');
    Deno.env.set('DATA_DIR', '/tmp');
    Deno.env.set('PORT', '9999');
    const config = loadConfig();
    assertEquals(config.responsesBaseUrl, null);
    assertEquals(config.chatBaseUrl, 'http://127.0.0.1:2/v1');
  } finally {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) Deno.env.delete(key);
      else Deno.env.set(key, value);
    }
  }
});

Deno.test('loadConfig rejects invalid ports', () => {
  const original = Deno.env.get('PORT');
  const required = {
    RESPONSES_BASE_URL: Deno.env.get('RESPONSES_BASE_URL'),
    CHAT_BASE_URL: Deno.env.get('CHAT_BASE_URL'),
    DEFAULT_MODEL: Deno.env.get('DEFAULT_MODEL'),
    OPENAI_API_KEY: Deno.env.get('OPENAI_API_KEY'),
    DATA_DIR: Deno.env.get('DATA_DIR'),
  };
  try {
    Deno.env.set('RESPONSES_BASE_URL', 'http://127.0.0.1:1/v1');
    Deno.env.set('CHAT_BASE_URL', 'http://127.0.0.1:2/v1');
    Deno.env.set('DEFAULT_MODEL', 'models/gemma-4-31b-it');
    Deno.env.set('OPENAI_API_KEY', 'secret-token');
    Deno.env.set('DATA_DIR', '/tmp');
    Deno.env.set('PORT', '70000');
    let error: unknown;
    try {
      loadConfig();
    } catch (err) {
      error = err;
    }
    assertEquals((error as Error).message, 'PORT must be an integer between 1 and 65535');
  } finally {
    if (original === undefined) Deno.env.delete('PORT');
    else Deno.env.set('PORT', original);
    for (const [key, value] of Object.entries(required)) {
      if (value === undefined) Deno.env.delete(key);
      else Deno.env.set(key, value);
    }
  }
});
