import type { ProxyConfig } from './types.ts';

function parsePort(raw: string | undefined): number {
  const port = Number(raw ?? 8787);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }
  return port;
}

function parseBoolEnv(name: string, raw: string | undefined): boolean {
  if (raw === undefined || !raw.trim()) return false;
  switch (raw.trim().toLowerCase()) {
    case '1':
    case 'true':
    case 'yes':
    case 'on':
      return true;
    case '0':
    case 'false':
    case 'no':
    case 'off':
      return false;
    default:
      throw new Error(`${name} must be a boolean value`);
  }
}

function parseNonNegativeIntegerEnv(name: string, raw: string | undefined): number {
  if (raw === undefined || !raw.trim()) return 0;
  const value = Number(raw.trim());
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }
  return value;
}

function parseApiKeys(raw: string | undefined): string[] {
  const keys = (raw ?? '').split(',').map((key) => key.trim()).filter(Boolean);
  if (keys.length === 0) throw new Error('OPENAI_API_KEY is required');
  return keys;
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
  const apiKeys = parseApiKeys(Deno.env.get('OPENAI_API_KEY'));
  const dataDir = Deno.env.get('DATA_DIR');
  const authToken = Deno.env.get('AUTH') ?? null;
  const accountEmail = Deno.env.get('ACCOUNT_EMAIL') ?? null;
  const accountName = Deno.env.get('ACCOUNT_NAME') ?? null;
  const accountPlanType = Deno.env.get('ACCOUNT_PLAN_TYPE') ?? null;
  if (!chatBaseUrl) throw new Error('CHAT_BASE_URL is required');
  if (!defaultModel) throw new Error('DEFAULT_MODEL is required');
  if (!dataDir) throw new Error('DATA_DIR is required');
  return {
    port: parsePort(Deno.env.get('PORT')),
    host: Deno.env.get('HOST') ?? '0.0.0.0',
    authToken,
    accountEmail,
    accountName,
    accountPlanType,
    responsesBaseUrl: responsesBaseUrl ?? null,
    chatBaseUrl,
    forceChatCompletions: parseBoolEnv(
      'HUBPROXY_FORCE_CHAT_COMPLETIONS',
      Deno.env.get('HUBPROXY_FORCE_CHAT_COMPLETIONS'),
    ),
    isCloudflare: parseBoolEnv('IS_CF', Deno.env.get('IS_CF')),
    defaultModel,
    defaultApiKey: apiKeys[0],
    apiKeys,
    requestIntervalMs: parseNonNegativeIntegerEnv(
      'HUBPROXY_REQUEST_INTERVAL_MS',
      Deno.env.get('HUBPROXY_REQUEST_INTERVAL_MS'),
    ),
    needRetry: parseBoolEnv('NEED_RETRY', Deno.env.get('NEED_RETRY')),
    dataDir,
  };
}
