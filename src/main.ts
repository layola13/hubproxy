import { loadConfig, loadDotenvIntoEnv } from './env.ts';
import { handleHttpWithState } from './handlers.ts';
import { initProxyRuntime } from './proxy.ts';
import { HubState } from './state.ts';

const dotenvPath = Deno.env.get('DOTENV_PATH') ?? '.env';
try {
  loadDotenvIntoEnv(dotenvPath);
} catch {
  // Optional local env file.
}

const config = loadConfig();
console.log(JSON.stringify(
  {
    kind: 'startup',
    dotenvPath,
    port: config.port,
    host: config.host,
    authToken: config.authToken
      ? `${config.authToken.slice(0, 3)}...${
        config.authToken.slice(-3)
      } (len=${config.authToken.length})`
      : 'none',
    accountEmail: config.accountEmail,
    accountName: config.accountName,
    accountPlanType: config.accountPlanType,
    responsesBaseUrl: config.responsesBaseUrl,
    chatBaseUrl: config.chatBaseUrl,
    forceChatCompletions: config.forceChatCompletions,
    nvidiaCompat: config.nvidiaCompat,
    isCloudflare: config.isCloudflare,
    requestIntervalMs: config.requestIntervalMs,
    needRetry: config.needRetry,
    glmTryGetKey: config.glmTryGetKey,
    glmKeyRefreshIntervalMs: config.glmKeyRefreshIntervalMs,
    glmKeyFetchRetryCount: config.glmKeyFetchRetryCount,
    glmKeyFetchRetryDelayMs: config.glmKeyFetchRetryDelayMs,
    customContextWindowTokens: config.customContextWindowTokens,
    contextCompactThresholdPercent: config.contextCompactThresholdPercent,
    apiKeyCount: config.apiKeys.length,
    defaultModel: config.defaultModel,
    defaultApiKey: `${config.defaultApiKey.slice(0, 3)}...${
      config.defaultApiKey.slice(-3)
    } (len=${config.defaultApiKey.length})`,
  },
  null,
  2,
));
const state = new HubState();

initProxyRuntime(config);

Deno.serve(
  { hostname: config.host, port: config.port },
  (req) => handleHttpWithState(req, config, state),
);
