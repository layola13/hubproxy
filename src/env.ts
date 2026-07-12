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

function parseIntervalMsEnv(name: string, raw: string | undefined, fallback: number): number {
  if (raw === undefined || !raw.trim()) return fallback;
  const value = Number(raw.trim());
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }
  return value;
}

function parseOptionalPositiveIntegerEnv(name: string, raw: string | undefined): number | null {
  if (raw === undefined || !raw.trim()) return null;
  const value = Number(raw.trim());
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

function parseThresholdPercentEnv(name: string, raw: string | undefined): number {
  if (raw === undefined || !raw.trim()) return 90;
  const value = Number(raw.trim());
  if (!Number.isFinite(value) || value <= 0 || value >= 100) {
    throw new Error(`${name} must be a number greater than 0 and less than 100`);
  }
  return value;
}

function isTextFilePath(raw: string): boolean {
  return raw.trim().toLowerCase().endsWith('.txt');
}

function normalizeApiKeyEntry(raw: string): string {
  return raw.trim().replace(/,+$/, '').trim();
}

function parseApiKeys(raw: string | undefined): string[] {
  const source = raw?.trim() ?? '';
  const keys = isTextFilePath(source)
    ? Deno.readTextFileSync(source)
      .split(/\r?\n/)
      .map(normalizeApiKeyEntry)
      .filter(Boolean)
    : source.split(',').map(normalizeApiKeyEntry).filter(Boolean);
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

export function applyLogArgsToEnv(args: string[]): void {
  let logDir: string | null = null;
  let sawLogArg = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--logs') {
      sawLogArg = true;
      const next = args[i + 1];
      if (next && !next.startsWith('--')) {
        logDir = next;
        i++;
      } else {
        logDir = 'logs';
      }
      continue;
    }
    if (arg === '--log-dir') {
      sawLogArg = true;
      const next = args[i + 1];
      if (!next || next.startsWith('--')) {
        throw new Error('missing value for --log-dir');
      }
      logDir = next;
      i++;
    }
  }

  if (!sawLogArg) {
    Deno.env.delete('HUBPROXY_LOG_DIR');
    return;
  }

  const normalized = logDir?.trim() || 'logs';
  Deno.env.set('HUBPROXY_LOG_DIR', normalized);
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
  const forceResponsesEnv = Deno.env.get('HUBPROXY_FORCE_RESPONSES') ??
    Deno.env.get('HUBPROXY_FORCE_RESPONESE');
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
    forceResponses: parseBoolEnv('HUBPROXY_FORCE_RESPONSES', forceResponsesEnv),
    disablePromptInjection: parseBoolEnv(
      'HUBPROXY_DISABLE_PROMPT_INJECTION',
      Deno.env.get('HUBPROXY_DISABLE_PROMPT_INJECTION'),
    ),
    nvidiaCompat: parseBoolEnv('HUBPROXY_NVIDIA_COMPAT', Deno.env.get('HUBPROXY_NVIDIA_COMPAT')),
    isCloudflare: parseBoolEnv('IS_CF', Deno.env.get('IS_CF')),
    defaultModel,
    defaultApiKey: apiKeys[0],
    apiKeys,
    requestIntervalMs: parseNonNegativeIntegerEnv(
      'HUBPROXY_REQUEST_INTERVAL_MS',
      Deno.env.get('HUBPROXY_REQUEST_INTERVAL_MS'),
    ),
    needRetry: parseBoolEnv('NEED_RETRY', Deno.env.get('NEED_RETRY')),
    glmTryGetKey: parseBoolEnv('GLM_TRY_GET_KEY', Deno.env.get('GLM_TRY_GET_KEY')),
    glmKeyRefreshIntervalMs: parseIntervalMsEnv(
      'GLM_KEY_REFRESH_INTERVAL_MS',
      Deno.env.get('GLM_KEY_REFRESH_INTERVAL_MS'),
      600000,
    ),
    glmKeyFetchRetryCount: parseIntervalMsEnv(
      'GLM_KEY_FETCH_RETRY_COUNT',
      Deno.env.get('GLM_KEY_FETCH_RETRY_COUNT'),
      100,
    ),
    glmKeyFetchRetryDelayMs: parseIntervalMsEnv(
      'GLM_KEY_FETCH_RETRY_DELAY_MS',
      Deno.env.get('GLM_KEY_FETCH_RETRY_DELAY_MS'),
      30000,
    ),
    dataDir,
    customContextWindowTokens: parseOptionalPositiveIntegerEnv(
      'HUBPROXY_CONTEXT_WINDOW_TOKENS',
      Deno.env.get('HUBPROXY_CONTEXT_WINDOW_TOKENS'),
    ),
    contextCompactThresholdPercent: parseThresholdPercentEnv(
      'HUBPROXY_CONTEXT_COMPACT_THRESHOLD_PERCENT',
      Deno.env.get('HUBPROXY_CONTEXT_COMPACT_THRESHOLD_PERCENT'),
    ),
  };
}
