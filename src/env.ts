import type { ProxyConfig } from './types.ts';

function parsePort(raw: string | undefined): number {
  const port = Number(raw ?? 8787);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }
  return port;
}

export function loadDotenvIntoEnv(path: string): void {
  const text = Deno.readTextFileSync(path);
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    if (!key || key.toUpperCase().startsWith('CODEX_')) continue;
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    Deno.env.set(key, value);
  }
}

export function loadConfig(): ProxyConfig {
  const responsesBaseUrl = Deno.env.get('RESPONSES_BASE_URL');
  const chatBaseUrl = Deno.env.get('CHAT_BASE_URL');
  const defaultModel = Deno.env.get('DEFAULT_MODEL');
  const defaultApiKey = Deno.env.get('OPENAI_API_KEY');
  const dataDir = Deno.env.get('DATA_DIR');
  const authToken = Deno.env.get('AUTH') ?? null;
  if (!chatBaseUrl) throw new Error('CHAT_BASE_URL is required');
  if (!defaultModel) throw new Error('DEFAULT_MODEL is required');
  if (!defaultApiKey) throw new Error('OPENAI_API_KEY is required');
  if (!dataDir) throw new Error('DATA_DIR is required');
  return {
    port: parsePort(Deno.env.get('PORT')),
    host: Deno.env.get('HOST') ?? '0.0.0.0',
    authToken,
    responsesBaseUrl: responsesBaseUrl ?? null,
    chatBaseUrl,
    defaultModel,
    defaultApiKey,
    dataDir,
  };
}
