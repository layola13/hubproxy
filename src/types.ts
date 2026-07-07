export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type JsonObject = { [key: string]: JsonValue };

export type ProxyConfig = {
  port: number;
  host: string;
  authToken: string | null;
  accountEmail: string | null;
  accountName: string | null;
  accountPlanType: string | null;
  responsesBaseUrl: string | null;
  chatBaseUrl: string;
  forceChatCompletions: boolean;
  nvidiaCompat: boolean;
  isCloudflare: boolean;
  defaultModel: string;
  defaultApiKey: string;
  apiKeys: string[];
  requestIntervalMs: number;
  needRetry: boolean;
  glmTryGetKey: boolean;
  glmKeyRefreshIntervalMs: number;
  glmKeyFetchRetryCount: number;
  glmKeyFetchRetryDelayMs: number;
  dataDir: string;
  customContextWindowTokens?: number | null;
  contextCompactThresholdPercent?: number;
};

export type ThreadStatus =
  | { type: 'notLoaded' }
  | { type: 'idle' }
  | { type: 'systemError' }
  | { type: 'active'; activeFlags: string[] };

export type ThreadGoalStatus =
  | 'active'
  | 'paused'
  | 'blocked'
  | 'usageLimited'
  | 'budgetLimited'
  | 'complete';

export type ThreadGoal = {
  threadId: string;
  objective: string;
  status: ThreadGoalStatus;
  tokenBudget: number | null;
  tokensUsed: number;
  timeUsedSeconds: number;
  createdAt: number;
  updatedAt: number;
};

export type Thread = {
  id: string;
  sessionId: string;
  forkedFromId: string | null;
  parentThreadId: string | null;
  preview: string;
  ephemeral: boolean;
  modelProvider: string;
  model: string;
  createdAt: number;
  updatedAt: number;
  status: ThreadStatus;
  path: string | null;
  cwd: string;
  cliVersion: string;
  source: string | { custom: string } | { subAgent: unknown } | 'unknown';
  threadSource: string | null;
  agentNickname: string | null;
  agentRole: string | null;
  gitInfo: JsonObject | null;
  name: string | null;
  turns: unknown[];
};

export type ThreadTurn = {
  id: string;
  items: unknown[];
  status: 'completed' | 'interrupted' | 'failed' | 'inProgress';
  createdAt: number;
  updatedAt: number;
  collaborationModeKind?: string | null;
  itemsView?: 'notLoaded' | 'summary' | 'full';
  startedAt?: number | null;
  completedAt?: number | null;
  durationMs?: number | null;
  error?: { message: string; codexErrorInfo?: unknown; additionalDetails?: string | null } | null;
};

export type ServerNotification = {
  method: string;
  params?: Record<string, unknown> | null;
};

export type RpcRequest = {
  jsonrpc?: '2.0';
  id?: string | number | null;
  method: string;
  params?: JsonObject | JsonValue[] | null;
};

export type RpcResponse = {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
};

export type ProxyResult = {
  status: number;
  headers?: HeadersInit;
  body: string;
};

export type ResponsesEvent = {
  type: string;
  [key: string]: unknown;
};

export type ResponsesScenario = {
  events: ResponsesEvent[];
  response?: unknown;
  status?: number;
};

export type ResponsesInputItem = {
  type: string;
  [key: string]: JsonValue | undefined;
};

export type ResponsesToolKind =
  | 'function_call'
  | 'custom_tool_call'
  | 'tool_search_call'
  | 'mcp_tool_call';

export type ResponsesToolOutputKind =
  | 'function_call_output'
  | 'custom_tool_call_output'
  | 'tool_search_output'
  | 'mcp_tool_call_output';
