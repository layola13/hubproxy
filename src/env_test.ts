import { assertEquals } from 'jsr:@std/assert@1';
import { loadConfig, loadDotenvIntoEnv } from './env.ts';

const FORCE_CHAT_COMPLETIONS = 'HUBPROXY_FORCE_CHAT_COMPLETIONS';
const REQUEST_INTERVAL_MS = 'HUBPROXY_REQUEST_INTERVAL_MS';
const NEED_RETRY = 'NEED_RETRY';
const IS_CF = 'IS_CF';

function setRequiredConfigEnv(): void {
  Deno.env.set('RESPONSES_BASE_URL', 'http://127.0.0.1:1/v1');
  Deno.env.set('CHAT_BASE_URL', 'http://127.0.0.1:2/v1');
  Deno.env.set('DEFAULT_MODEL', 'models/gemma-4-31b-it');
  Deno.env.set('OPENAI_API_KEY', 'secret-token');
  Deno.env.set('DATA_DIR', '/tmp');
  Deno.env.set('PORT', '9999');
  Deno.env.delete(NEED_RETRY);
  Deno.env.delete(IS_CF);
}

Deno.test('loadDotenvIntoEnv loads plain keys and skips CODEX_ keys', async () => {
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
    assertEquals(Deno.env.get('HUBPROXY_LOG_DIR'), 'logs');
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
    HUBPROXY_FORCE_CHAT_COMPLETIONS: Deno.env.get(FORCE_CHAT_COMPLETIONS),
    HUBPROXY_REQUEST_INTERVAL_MS: Deno.env.get(REQUEST_INTERVAL_MS),
    NEED_RETRY: Deno.env.get(NEED_RETRY),
    IS_CF: Deno.env.get(IS_CF),
    DEFAULT_MODEL: Deno.env.get('DEFAULT_MODEL'),
    OPENAI_API_KEY: Deno.env.get('OPENAI_API_KEY'),
    DATA_DIR: Deno.env.get('DATA_DIR'),
  };
  try {
    setRequiredConfigEnv();
    Deno.env.delete(FORCE_CHAT_COMPLETIONS);
    Deno.env.delete(REQUEST_INTERVAL_MS);
    Deno.env.set('AUTH', 'local-secret');
    const config = loadConfig();
    assertEquals(config.responsesBaseUrl, 'http://127.0.0.1:1/v1');
    assertEquals(config.chatBaseUrl, 'http://127.0.0.1:2/v1');
    assertEquals(config.forceChatCompletions, false);
    assertEquals(config.isCloudflare, false);
    assertEquals(config.requestIntervalMs, 0);
    assertEquals(config.needRetry, false);
    assertEquals(config.defaultModel, 'models/gemma-4-31b-it');
    assertEquals(config.defaultApiKey, 'secret-token');
    assertEquals(config.apiKeys, ['secret-token']);
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
    HUBPROXY_FORCE_CHAT_COMPLETIONS: Deno.env.get(FORCE_CHAT_COMPLETIONS),
    HUBPROXY_REQUEST_INTERVAL_MS: Deno.env.get(REQUEST_INTERVAL_MS),
    NEED_RETRY: Deno.env.get(NEED_RETRY),
    IS_CF: Deno.env.get(IS_CF),
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
    Deno.env.delete(FORCE_CHAT_COMPLETIONS);
    Deno.env.delete(REQUEST_INTERVAL_MS);
    Deno.env.delete(NEED_RETRY);
    Deno.env.delete(IS_CF);
    const config = loadConfig();
    assertEquals(config.responsesBaseUrl, null);
    assertEquals(config.chatBaseUrl, 'http://127.0.0.1:2/v1');
    assertEquals(config.forceChatCompletions, false);
    assertEquals(config.isCloudflare, false);
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
    HUBPROXY_FORCE_CHAT_COMPLETIONS: Deno.env.get(FORCE_CHAT_COMPLETIONS),
    HUBPROXY_REQUEST_INTERVAL_MS: Deno.env.get(REQUEST_INTERVAL_MS),
    NEED_RETRY: Deno.env.get(NEED_RETRY),
    IS_CF: Deno.env.get(IS_CF),
    DEFAULT_MODEL: Deno.env.get('DEFAULT_MODEL'),
    OPENAI_API_KEY: Deno.env.get('OPENAI_API_KEY'),
    DATA_DIR: Deno.env.get('DATA_DIR'),
  };
  try {
    setRequiredConfigEnv();
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

Deno.test('loadConfig parses force chat completions boolean values', () => {
  const original = {
    PORT: Deno.env.get('PORT'),
    RESPONSES_BASE_URL: Deno.env.get('RESPONSES_BASE_URL'),
    CHAT_BASE_URL: Deno.env.get('CHAT_BASE_URL'),
    HUBPROXY_FORCE_CHAT_COMPLETIONS: Deno.env.get(FORCE_CHAT_COMPLETIONS),
    HUBPROXY_REQUEST_INTERVAL_MS: Deno.env.get(REQUEST_INTERVAL_MS),
    NEED_RETRY: Deno.env.get(NEED_RETRY),
    DEFAULT_MODEL: Deno.env.get('DEFAULT_MODEL'),
    OPENAI_API_KEY: Deno.env.get('OPENAI_API_KEY'),
    DATA_DIR: Deno.env.get('DATA_DIR'),
  };
  try {
    setRequiredConfigEnv();
    Deno.env.delete(REQUEST_INTERVAL_MS);
    for (const value of ['1', 'true', 'TRUE', 'yes', 'on']) {
      Deno.env.set(FORCE_CHAT_COMPLETIONS, value);
      assertEquals(loadConfig().forceChatCompletions, true);
    }
    for (const value of ['0', 'false', 'FALSE', 'no', 'off', '']) {
      Deno.env.set(FORCE_CHAT_COMPLETIONS, value);
      assertEquals(loadConfig().forceChatCompletions, false);
    }
  } finally {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) Deno.env.delete(key);
      else Deno.env.set(key, value);
    }
  }
});

Deno.test('loadConfig rejects invalid force chat completions values', () => {
  const original = {
    PORT: Deno.env.get('PORT'),
    RESPONSES_BASE_URL: Deno.env.get('RESPONSES_BASE_URL'),
    CHAT_BASE_URL: Deno.env.get('CHAT_BASE_URL'),
    HUBPROXY_FORCE_CHAT_COMPLETIONS: Deno.env.get(FORCE_CHAT_COMPLETIONS),
    HUBPROXY_REQUEST_INTERVAL_MS: Deno.env.get(REQUEST_INTERVAL_MS),
    NEED_RETRY: Deno.env.get(NEED_RETRY),
    DEFAULT_MODEL: Deno.env.get('DEFAULT_MODEL'),
    OPENAI_API_KEY: Deno.env.get('OPENAI_API_KEY'),
    DATA_DIR: Deno.env.get('DATA_DIR'),
  };
  try {
    setRequiredConfigEnv();
    Deno.env.delete(REQUEST_INTERVAL_MS);
    Deno.env.set(FORCE_CHAT_COMPLETIONS, 'sometimes');
    let error: unknown;
    try {
      loadConfig();
    } catch (err) {
      error = err;
    }
    assertEquals(
      (error as Error).message,
      'HUBPROXY_FORCE_CHAT_COMPLETIONS must be a boolean value',
    );
  } finally {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) Deno.env.delete(key);
      else Deno.env.set(key, value);
    }
  }
});

Deno.test('loadConfig parses Cloudflare mode boolean values', () => {
  const original = {
    PORT: Deno.env.get('PORT'),
    RESPONSES_BASE_URL: Deno.env.get('RESPONSES_BASE_URL'),
    CHAT_BASE_URL: Deno.env.get('CHAT_BASE_URL'),
    HUBPROXY_FORCE_CHAT_COMPLETIONS: Deno.env.get(FORCE_CHAT_COMPLETIONS),
    HUBPROXY_REQUEST_INTERVAL_MS: Deno.env.get(REQUEST_INTERVAL_MS),
    NEED_RETRY: Deno.env.get(NEED_RETRY),
    IS_CF: Deno.env.get(IS_CF),
    DEFAULT_MODEL: Deno.env.get('DEFAULT_MODEL'),
    OPENAI_API_KEY: Deno.env.get('OPENAI_API_KEY'),
    DATA_DIR: Deno.env.get('DATA_DIR'),
  };
  try {
    setRequiredConfigEnv();
    Deno.env.set(IS_CF, 'true');
    assertEquals(loadConfig().isCloudflare, true);
    Deno.env.set(IS_CF, 'false');
    assertEquals(loadConfig().isCloudflare, false);
  } finally {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) Deno.env.delete(key);
      else Deno.env.set(key, value);
    }
  }
});

Deno.test('loadConfig parses NEED_RETRY boolean values', () => {
  const original = {
    PORT: Deno.env.get('PORT'),
    RESPONSES_BASE_URL: Deno.env.get('RESPONSES_BASE_URL'),
    CHAT_BASE_URL: Deno.env.get('CHAT_BASE_URL'),
    HUBPROXY_FORCE_CHAT_COMPLETIONS: Deno.env.get(FORCE_CHAT_COMPLETIONS),
    HUBPROXY_REQUEST_INTERVAL_MS: Deno.env.get(REQUEST_INTERVAL_MS),
    NEED_RETRY: Deno.env.get(NEED_RETRY),
    DEFAULT_MODEL: Deno.env.get('DEFAULT_MODEL'),
    OPENAI_API_KEY: Deno.env.get('OPENAI_API_KEY'),
    DATA_DIR: Deno.env.get('DATA_DIR'),
  };
  try {
    setRequiredConfigEnv();
    Deno.env.delete(FORCE_CHAT_COMPLETIONS);
    Deno.env.delete(REQUEST_INTERVAL_MS);
    for (const value of ['1', 'true', 'TRUE', 'yes', 'on']) {
      Deno.env.set(NEED_RETRY, value);
      assertEquals(loadConfig().needRetry, true);
    }
    for (const value of ['0', 'false', 'FALSE', 'no', 'off', '']) {
      Deno.env.set(NEED_RETRY, value);
      assertEquals(loadConfig().needRetry, false);
    }
  } finally {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) Deno.env.delete(key);
      else Deno.env.set(key, value);
    }
  }
});

Deno.test('loadConfig rejects invalid NEED_RETRY values', () => {
  const original = {
    PORT: Deno.env.get('PORT'),
    RESPONSES_BASE_URL: Deno.env.get('RESPONSES_BASE_URL'),
    CHAT_BASE_URL: Deno.env.get('CHAT_BASE_URL'),
    HUBPROXY_FORCE_CHAT_COMPLETIONS: Deno.env.get(FORCE_CHAT_COMPLETIONS),
    HUBPROXY_REQUEST_INTERVAL_MS: Deno.env.get(REQUEST_INTERVAL_MS),
    NEED_RETRY: Deno.env.get(NEED_RETRY),
    DEFAULT_MODEL: Deno.env.get('DEFAULT_MODEL'),
    OPENAI_API_KEY: Deno.env.get('OPENAI_API_KEY'),
    DATA_DIR: Deno.env.get('DATA_DIR'),
  };
  try {
    setRequiredConfigEnv();
    Deno.env.delete(FORCE_CHAT_COMPLETIONS);
    Deno.env.delete(REQUEST_INTERVAL_MS);
    Deno.env.set(NEED_RETRY, 'maybe');
    let error: unknown;
    try {
      loadConfig();
    } catch (err) {
      error = err;
    }
    assertEquals((error as Error).message, 'NEED_RETRY must be a boolean value');
  } finally {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) Deno.env.delete(key);
      else Deno.env.set(key, value);
    }
  }
});

Deno.test('loadConfig parses comma-separated API keys', () => {
  const original = {
    PORT: Deno.env.get('PORT'),
    RESPONSES_BASE_URL: Deno.env.get('RESPONSES_BASE_URL'),
    CHAT_BASE_URL: Deno.env.get('CHAT_BASE_URL'),
    HUBPROXY_FORCE_CHAT_COMPLETIONS: Deno.env.get(FORCE_CHAT_COMPLETIONS),
    HUBPROXY_REQUEST_INTERVAL_MS: Deno.env.get(REQUEST_INTERVAL_MS),
    NEED_RETRY: Deno.env.get(NEED_RETRY),
    DEFAULT_MODEL: Deno.env.get('DEFAULT_MODEL'),
    OPENAI_API_KEY: Deno.env.get('OPENAI_API_KEY'),
    DATA_DIR: Deno.env.get('DATA_DIR'),
  };
  try {
    setRequiredConfigEnv();
    Deno.env.delete(FORCE_CHAT_COMPLETIONS);
    Deno.env.delete(REQUEST_INTERVAL_MS);
    Deno.env.set('OPENAI_API_KEY', 'key-a, key-b,,key-c');
    const config = loadConfig();
    assertEquals(config.defaultApiKey, 'key-a');
    assertEquals(config.apiKeys, ['key-a', 'key-b', 'key-c']);
  } finally {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) Deno.env.delete(key);
      else Deno.env.set(key, value);
    }
  }
});

Deno.test('loadConfig rejects OPENAI_API_KEY values with no keys', () => {
  const original = {
    PORT: Deno.env.get('PORT'),
    RESPONSES_BASE_URL: Deno.env.get('RESPONSES_BASE_URL'),
    CHAT_BASE_URL: Deno.env.get('CHAT_BASE_URL'),
    HUBPROXY_FORCE_CHAT_COMPLETIONS: Deno.env.get(FORCE_CHAT_COMPLETIONS),
    HUBPROXY_REQUEST_INTERVAL_MS: Deno.env.get(REQUEST_INTERVAL_MS),
    NEED_RETRY: Deno.env.get(NEED_RETRY),
    DEFAULT_MODEL: Deno.env.get('DEFAULT_MODEL'),
    OPENAI_API_KEY: Deno.env.get('OPENAI_API_KEY'),
    DATA_DIR: Deno.env.get('DATA_DIR'),
  };
  try {
    setRequiredConfigEnv();
    Deno.env.delete(FORCE_CHAT_COMPLETIONS);
    Deno.env.delete(REQUEST_INTERVAL_MS);
    Deno.env.set('OPENAI_API_KEY', ' , , ');
    let error: unknown;
    try {
      loadConfig();
    } catch (err) {
      error = err;
    }
    assertEquals((error as Error).message, 'OPENAI_API_KEY is required');
  } finally {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) Deno.env.delete(key);
      else Deno.env.set(key, value);
    }
  }
});

Deno.test('loadConfig parses request interval milliseconds', () => {
  const original = {
    PORT: Deno.env.get('PORT'),
    RESPONSES_BASE_URL: Deno.env.get('RESPONSES_BASE_URL'),
    CHAT_BASE_URL: Deno.env.get('CHAT_BASE_URL'),
    HUBPROXY_FORCE_CHAT_COMPLETIONS: Deno.env.get(FORCE_CHAT_COMPLETIONS),
    HUBPROXY_REQUEST_INTERVAL_MS: Deno.env.get(REQUEST_INTERVAL_MS),
    NEED_RETRY: Deno.env.get(NEED_RETRY),
    DEFAULT_MODEL: Deno.env.get('DEFAULT_MODEL'),
    OPENAI_API_KEY: Deno.env.get('OPENAI_API_KEY'),
    DATA_DIR: Deno.env.get('DATA_DIR'),
  };
  try {
    setRequiredConfigEnv();
    Deno.env.delete(FORCE_CHAT_COMPLETIONS);
    for (const [value, expected] of [['0', 0], ['25', 25], ['', 0]] as const) {
      Deno.env.set(REQUEST_INTERVAL_MS, value);
      assertEquals(loadConfig().requestIntervalMs, expected);
    }
  } finally {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) Deno.env.delete(key);
      else Deno.env.set(key, value);
    }
  }
});

Deno.test('loadConfig rejects invalid request interval milliseconds', () => {
  const original = {
    PORT: Deno.env.get('PORT'),
    RESPONSES_BASE_URL: Deno.env.get('RESPONSES_BASE_URL'),
    CHAT_BASE_URL: Deno.env.get('CHAT_BASE_URL'),
    HUBPROXY_FORCE_CHAT_COMPLETIONS: Deno.env.get(FORCE_CHAT_COMPLETIONS),
    HUBPROXY_REQUEST_INTERVAL_MS: Deno.env.get(REQUEST_INTERVAL_MS),
    NEED_RETRY: Deno.env.get(NEED_RETRY),
    DEFAULT_MODEL: Deno.env.get('DEFAULT_MODEL'),
    OPENAI_API_KEY: Deno.env.get('OPENAI_API_KEY'),
    DATA_DIR: Deno.env.get('DATA_DIR'),
  };
  try {
    setRequiredConfigEnv();
    Deno.env.delete(FORCE_CHAT_COMPLETIONS);
    for (const value of ['-1', '1.5', 'abc']) {
      Deno.env.set(REQUEST_INTERVAL_MS, value);
      let error: unknown;
      try {
        loadConfig();
      } catch (err) {
        error = err;
      }
      assertEquals(
        (error as Error).message,
        'HUBPROXY_REQUEST_INTERVAL_MS must be a non-negative integer',
      );
    }
  } finally {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) Deno.env.delete(key);
      else Deno.env.set(key, value);
    }
  }
});
