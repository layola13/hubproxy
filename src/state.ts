import type { ServerNotification, Thread, ThreadGoal, ThreadTurn } from './types.ts';

type MemoryState = {
  threads: Map<string, Thread>;
  goals: Map<string, ThreadGoal>;
  loadedThreadIds: Set<string>;
  turns: Map<string, ThreadTurn[]>;
  archivedThreadIds: Set<string>;
  elicitationCounts: Map<string, number>;
  subscribedThreadIds: Set<string>;
  fsWatches: Map<string, string>;
  processes: Map<
    string,
    { command: string[]; cwd: string; status: 'running' | 'exited'; stdout: string; stderr: string }
  >;
  agentStatuses: Map<
    string,
    { status: 'running' | 'completed' | 'errored' | 'shutdown'; message: string | null }
  >;
  notifications: ServerNotification[];
};

type FileUpdateChange = {
  path: string;
  kind: { type: 'add' } | { type: 'delete' } | { type: 'update'; move_path: string | null };
  diff: string;
};

export type MultiAgentToolResult = {
  contentItems: Array<{ type: 'text'; text: string }>;
  success: boolean;
};

const now = () => Math.floor(Date.now() / 1000);

const newThread = (id: string, cwd: string, modelProvider: string, model: string): Thread => ({
  id,
  sessionId: id,
  forkedFromId: null,
  parentThreadId: null,
  preview: '',
  ephemeral: true,
  modelProvider,
  model,
  createdAt: now(),
  updatedAt: now(),
  status: { type: 'idle' },
  path: null,
  cwd,
  cliVersion: 'hubproxy-0.1.0',
  source: 'appServer',
  threadSource: null,
  agentNickname: null,
  agentRole: null,
  gitInfo: null,
  name: null,
  turns: [],
});

function threadSpawnSource(input: {
  parentThreadId: string;
  depth?: number;
  agentPath?: string | null;
  agentNickname?: string | null;
  agentRole?: string | null;
  lastTaskMessage?: string | null;
}): Thread['source'] {
  return {
    subAgent: {
      thread_spawn: {
        parent_thread_id: input.parentThreadId,
        depth: input.depth ?? 1,
        agent_path: input.agentPath ?? null,
        agent_nickname: input.agentNickname ?? null,
        agent_role: input.agentRole ?? null,
        last_task_message: input.lastTaskMessage ?? null,
      },
    },
  };
}

function threadSpawnPayload(thread: Thread): Record<string, unknown> | null {
  const source = thread.source;
  if (typeof source !== 'object' || source === null || !('subAgent' in source)) return null;
  const subAgent = (source as { subAgent?: unknown }).subAgent;
  if (typeof subAgent !== 'object' || subAgent === null) return null;
  const payload = (subAgent as { thread_spawn?: unknown; threadSpawn?: unknown }).thread_spawn ??
    (subAgent as { threadSpawn?: unknown }).threadSpawn;
  return typeof payload === 'object' && payload !== null
    ? payload as Record<string, unknown>
    : null;
}

function threadSpawnParentThreadId(thread: Thread): string | null {
  if (thread.parentThreadId) return thread.parentThreadId;
  const payload = threadSpawnPayload(thread);
  const parentThreadId = payload?.parent_thread_id ?? payload?.parentThreadId;
  return typeof parentThreadId === 'string' ? parentThreadId : null;
}

function threadSpawnAgentPath(thread: Thread): string | null {
  const payload = threadSpawnPayload(thread);
  const agentPath = payload?.agent_path ?? payload?.agentPath;
  return typeof agentPath === 'string' ? agentPath : null;
}

function threadLastTaskMessage(thread: Thread): string | null {
  const payload = threadSpawnPayload(thread);
  const message = payload?.last_task_message ?? payload?.lastTaskMessage;
  return typeof message === 'string' ? message : null;
}

function normalizeAgentPath(path: string): string {
  const trimmed = path.trim();
  if (!trimmed) return '/agent';
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

function safeTaskName(value: string): string {
  const cleaned = value.trim().replace(/[^A-Za-z0-9_/-]+/g, '_').replace(/_+/g, '_');
  return normalizeAgentPath(cleaned || `agent_${crypto.randomUUID().slice(0, 8)}`);
}

function childAgentPath(parent: Thread, taskName: string): string {
  const cleaned = taskName.trim().replace(/[^A-Za-z0-9_/-]+/g, '_').replace(/_+/g, '_') ||
    `agent_${crypto.randomUUID().slice(0, 8)}`;
  if (cleaned.startsWith('/')) return normalizeAgentPath(cleaned);
  const parentPath = threadSpawnAgentPath(parent);
  if (!parentPath) return normalizeAgentPath(cleaned);
  return `${parentPath.replace(/\/+$/, '')}/${cleaned.replace(/^\/+/, '')}`;
}

function isMultiAgentNamespace(namespace: string | null | undefined): boolean {
  return !namespace || namespace === 'multi_agent_v1' || namespace === 'multi_agent_v2' ||
    namespace === 'collaboration';
}

function isMultiAgentV1Namespace(namespace: string | null | undefined): boolean {
  return namespace === 'multi_agent_v1';
}

function stringifyToolOutput(value: unknown): MultiAgentToolResult {
  return {
    contentItems: [{ type: 'text', text: JSON.stringify(value) }],
    success: true,
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function textArg(args: Record<string, unknown>, key: string): string | null {
  const value = args[key];
  return typeof value === 'string' ? value : null;
}

const cloneThread = (thread: Thread, turns: ThreadTurn[] = []): Thread => ({
  ...thread,
  turns: [...turns],
});

const publicThread = (thread: Thread, turns: ThreadTurn[] = [], includeTurns = false): Thread => ({
  ...thread,
  turns: includeTurns ? [...turns] : [],
});

const newTurn = (
  items: unknown[] = [],
  collaborationModeKind: string | null = null,
  status: ThreadTurn['status'] = 'completed',
): ThreadTurn => {
  const ts = now();
  const completedAt = status === 'inProgress' ? null : ts;
  return {
    id: crypto.randomUUID(),
    items,
    status,
    createdAt: ts,
    updatedAt: ts,
    collaborationModeKind,
    itemsView: 'full',
    startedAt: ts,
    completedAt,
    durationMs: completedAt === null ? null : 0,
    error: null,
  };
};

export class HubState {
  private state: MemoryState = {
    threads: new Map(),
    goals: new Map(),
    loadedThreadIds: new Set(),
    turns: new Map(),
    archivedThreadIds: new Set(),
    elicitationCounts: new Map(),
    subscribedThreadIds: new Set(),
    fsWatches: new Map(),
    processes: new Map(),
    agentStatuses: new Map(),
    notifications: [],
  };

  pushNotification(notification: ServerNotification): void {
    this.state.notifications.push(notification);
  }

  private extractTextParts(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value.flatMap((part) => {
      if (!part || typeof part !== 'object') return [];
      const text = typeof (part as { text?: unknown }).text === 'string'
        ? String((part as { text: string }).text)
        : '';
      return text ? [text] : [];
    });
  }

  private emitReasoningNotifications(threadId: string, turnId: string, item: unknown): void {
    if (!item || typeof item !== 'object') return;
    if ((item as { type?: unknown }).type !== 'reasoning') return;
    const reasoning = item as Record<string, unknown>;
    const itemId = typeof reasoning.id === 'string' ? reasoning.id : crypto.randomUUID();
    const summaryParts = this.extractTextParts(reasoning.summary);
    const summaryText = summaryParts[0] ??
      (typeof reasoning.text === 'string' ? String(reasoning.text) : '');
    const rawParts = this.extractTextParts(reasoning.content);
    if (summaryText) {
      this.pushNotification({
        method: 'item/reasoning/summaryTextDelta',
        params: { threadId, turnId, itemId, delta: summaryText, summaryIndex: 0 },
      });
      this.pushNotification({
        method: 'item/reasoning/summaryPartAdded',
        params: {
          threadId,
          turnId,
          itemId,
          summaryIndex: 0,
        },
      });
    }
    for (const [index, rawText] of rawParts.entries()) {
      this.pushNotification({
        method: 'item/reasoning/textDelta',
        params: { threadId, turnId, itemId, delta: rawText, contentIndex: index },
      });
    }
  }

  private emitAgentMessageNotifications(threadId: string, turnId: string, item: unknown): void {
    if (!item || typeof item !== 'object') return;
    const type = (item as { type?: unknown }).type;
    if (type !== 'message' && type !== 'agent_message') return;
    const message = item as Record<string, unknown>;
    const itemId = typeof message.id === 'string' ? message.id : crypto.randomUUID();
    const content = Array.isArray(message.content) ? message.content : [];
    for (const part of content) {
      if (!part || typeof part !== 'object') continue;
      const partType = typeof (part as { type?: unknown }).type === 'string'
        ? String((part as { type: string }).type)
        : '';
      const text = typeof (part as { text?: unknown }).text === 'string'
        ? String((part as { text: string }).text)
        : '';
      if (!text) continue;
      if (partType === 'output_text' || partType === 'text') {
        this.pushNotification({
          method: 'item/agentMessage/delta',
          params: { threadId, turnId, itemId, delta: text },
        });
      }
    }
  }

  private emitPlanNotifications(threadId: string, turnId: string, item: unknown): void {
    if (!item || typeof item !== 'object') return;
    if ((item as { type?: unknown }).type !== 'plan') return;
    const plan = item as Record<string, unknown>;
    const itemId = typeof plan.id === 'string' ? plan.id : crypto.randomUUID();
    const text = typeof plan.text === 'string' ? plan.text : '';
    if (text) {
      this.pushNotification({
        method: 'item/plan/delta',
        params: { threadId, turnId, itemId, delta: text },
      });
    }
  }

  private normalizeFileUpdateKind(kind: unknown): FileUpdateChange['kind'] {
    if (!kind || typeof kind !== 'object') return { type: 'add' };
    const rawType = (kind as { type?: unknown }).type;
    if (rawType === 'delete') return { type: 'delete' };
    if (rawType === 'update') {
      const movePath = (kind as { move_path?: unknown }).move_path;
      return {
        type: 'update',
        move_path: typeof movePath === 'string' ? movePath : null,
      };
    }
    return { type: 'add' };
  }

  private emitFileChangeNotifications(threadId: string, turnId: string, item: unknown): void {
    if (!item || typeof item !== 'object') return;
    if ((item as { type?: unknown }).type !== 'fileChange') return;
    const fileChange = item as Record<string, unknown>;
    const itemId = typeof fileChange.id === 'string' ? fileChange.id : crypto.randomUUID();
    const changes = Array.isArray(fileChange.changes)
      ? fileChange.changes.flatMap((change) => {
        if (!change || typeof change !== 'object') return [];
        const path = typeof (change as { path?: unknown }).path === 'string'
          ? String((change as { path: string }).path)
          : '';
        if (!path) return [];
        return [{
          path,
          kind: this.normalizeFileUpdateKind((change as { kind?: unknown }).kind),
          diff: typeof (change as { diff?: unknown }).diff === 'string'
            ? String((change as { diff: string }).diff)
            : '',
        }];
      })
      : [];
    if (!changes.length) return;
    this.emitFileChangePatchUpdated(threadId, turnId, itemId, changes);
  }

  private emitCommandExecutionNotifications(threadId: string, turnId: string, item: unknown): void {
    if (!item || typeof item !== 'object') return;
    if ((item as { type?: unknown }).type !== 'commandExecution') return;
    const commandExecution = item as Record<string, unknown>;
    const itemId = typeof commandExecution.id === 'string'
      ? commandExecution.id
      : crypto.randomUUID();
    const delta = typeof commandExecution.output === 'string'
      ? String(commandExecution.output)
      : typeof commandExecution.stdout === 'string'
      ? String(commandExecution.stdout)
      : '';
    if (!delta) return;
    this.pushNotification({
      method: 'item/commandExecution/outputDelta',
      params: { threadId, turnId, itemId, delta },
    });
  }

  private emitMcpToolCallNotifications(threadId: string, turnId: string, item: unknown): void {
    if (!item || typeof item !== 'object') return;
    if ((item as { type?: unknown }).type !== 'mcpToolCall') return;
    const mcpToolCall = item as Record<string, unknown>;
    const itemId = typeof mcpToolCall.id === 'string' ? mcpToolCall.id : crypto.randomUUID();
    const message = typeof mcpToolCall.progress === 'string'
      ? String(mcpToolCall.progress)
      : typeof mcpToolCall.message === 'string'
      ? String(mcpToolCall.message)
      : '';
    if (!message) return;
    this.pushNotification({
      method: 'item/mcpToolCall/progress',
      params: { threadId, turnId, itemId, message },
    });
  }

  private emitItemNotifications(threadId: string, turnId: string, item: unknown): void {
    this.emitReasoningNotifications(threadId, turnId, item);
    this.emitAgentMessageNotifications(threadId, turnId, item);
    this.emitPlanNotifications(threadId, turnId, item);
    this.emitFileChangeNotifications(threadId, turnId, item);
    this.emitCommandExecutionNotifications(threadId, turnId, item);
    this.emitMcpToolCallNotifications(threadId, turnId, item);
  }

  private emitCompletedItem(threadId: string, turnId: string, item: unknown): void {
    const startedAtMs = Date.now();
    this.pushNotification({
      method: 'item/started',
      params: { threadId, turnId, startedAtMs, item },
    });
    this.emitItemNotifications(threadId, turnId, item);
    this.pushNotification({
      method: 'rawResponseItem/completed',
      params: { threadId, turnId, item },
    });
    this.pushNotification({
      method: 'item/completed',
      params: { threadId, turnId, completedAtMs: Date.now(), item },
    });
  }

  private appendSyntheticTurn(threadId: string, items: unknown[]): string | null {
    const thread = this.state.threads.get(threadId);
    if (!thread) return null;
    const turns = this.state.turns.get(threadId) ?? [];
    const turn = newTurn(items);
    turns.push(turn);
    this.state.turns.set(threadId, turns);
    thread.turns = turns;
    thread.updatedAt = now();
    for (const item of items) {
      this.emitCompletedItem(threadId, turn.id, item);
    }
    return turn.id;
  }

  emitFileChangePatchUpdated(
    threadId: string,
    turnId: string,
    itemId: string,
    changes: FileUpdateChange[],
  ): void {
    this.pushNotification({
      method: 'item/fileChange/patchUpdated',
      params: { threadId, turnId, itemId, changes },
    });
  }

  drainNotifications(): ServerNotification[] {
    const notifications = [...this.state.notifications];
    this.state.notifications.length = 0;
    return notifications;
  }

  startThread(input: {
    threadId?: string;
    cwd?: string;
    modelProvider?: string;
    model: string;
    ephemeral?: boolean;
    source?: Thread['source'];
    agentNickname?: string | null;
    agentRole?: string | null;
  }): Thread {
    const id = input.threadId ?? crypto.randomUUID();
    const thread = newThread(
      id,
      input.cwd ?? Deno.cwd(),
      input.modelProvider ?? 'openai',
      input.model,
    );
    thread.ephemeral = input.ephemeral ?? true;
    if (input.source !== undefined) thread.source = input.source;
    if (input.agentNickname !== undefined) thread.agentNickname = input.agentNickname;
    if (input.agentRole !== undefined) thread.agentRole = input.agentRole;
    thread.updatedAt = now();
    this.state.threads.set(id, thread);
    this.state.loadedThreadIds.add(id);
    this.state.turns.set(id, []);
    this.state.archivedThreadIds.delete(id);
    this.pushNotification({ method: 'thread/started', params: { thread } });
    this.pushNotification({
      method: 'thread/status/changed',
      params: { threadId: id, status: thread.status },
    });
    return publicThread(thread);
  }

  resumeThread(threadId: string): Thread | null {
    const existing = this.state.threads.get(threadId);
    if (existing) {
      existing.updatedAt = now();
      this.state.loadedThreadIds.add(threadId);
      this.pushNotification({
        method: 'thread/status/changed',
        params: { threadId, status: existing.status },
      });
      return publicThread(existing, this.getTurns(threadId), true);
    }
    return null;
  }

  listThreads(filters: { sourceKinds?: string[]; parentThreadId?: string | null } = {}): Thread[] {
    return [...this.state.threads.values()]
      .filter((thread) => this.matchesSourceKinds(thread, filters.sourceKinds))
      .filter((thread) => this.matchesParentThreadId(thread, filters.parentThreadId))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((thread) => publicThread(thread));
  }

  private matchesSourceKinds(thread: Thread, sourceKinds?: string[]): boolean {
    if (!sourceKinds?.length) return true;
    const source = thread.source;
    const isSubagent = typeof source === 'object' && source !== null && 'subAgent' in source;
    const subAgent = isSubagent ? (source as { subAgent?: unknown }).subAgent : null;
    const isThreadSpawn = threadSpawnPayload(thread) !== null;
    return sourceKinds.some((kind) => {
      if (kind === 'subAgent') return isSubagent;
      if (kind === 'subAgentThreadSpawn') return isThreadSpawn;
      if (kind === 'subAgentReview') return subAgent === 'review';
      if (kind === 'subAgentCompact') return subAgent === 'compact';
      if (kind === 'subAgentOther') {
        return !!subAgent && typeof subAgent === 'object' && 'other' in subAgent;
      }
      if (kind === 'unknown') return thread.source === 'unknown';
      if (kind === 'appServer') return thread.source === 'appServer';
      if (kind === 'cli') return thread.source === 'cli';
      if (kind === 'vscode') return thread.source === 'vscode';
      if (kind === 'exec') return thread.source === 'exec';
      return false;
    });
  }

  private matchesParentThreadId(thread: Thread, parentThreadId?: string | null): boolean {
    if (!parentThreadId) return true;
    return threadSpawnParentThreadId(thread) === parentThreadId;
  }

  getThread(threadId: string): Thread | null {
    const thread = this.state.threads.get(threadId);
    return thread ? publicThread(thread) : null;
  }

  setGoal(threadId: string, patch: Partial<ThreadGoal> & { objective?: string }): ThreadGoal {
    const existing = this.state.goals.get(threadId);
    const ts = now();
    const goal: ThreadGoal = existing ? { ...existing, ...patch, updatedAt: ts } : {
      threadId,
      objective: patch.objective ?? '',
      status: patch.status ?? 'active',
      tokenBudget: patch.tokenBudget ?? null,
      tokensUsed: patch.tokensUsed ?? 0,
      timeUsedSeconds: patch.timeUsedSeconds ?? 0,
      createdAt: ts,
      updatedAt: ts,
    };
    this.state.goals.set(threadId, goal);
    this.pushNotification({ method: 'thread/goal/updated', params: { threadId, goal } });
    return goal;
  }

  getGoal(threadId: string): ThreadGoal | null {
    return this.state.goals.get(threadId) ?? null;
  }

  clearGoal(threadId: string): boolean {
    const cleared = this.state.goals.delete(threadId);
    if (cleared) this.pushNotification({ method: 'thread/goal/cleared', params: { threadId } });
    return cleared;
  }

  getTurns(threadId: string): ThreadTurn[] {
    return this.state.turns.get(threadId) ?? [];
  }

  setThreadName(threadId: string, name: string | null): Thread | null {
    const thread = this.state.threads.get(threadId);
    if (!thread) return null;
    thread.name = name;
    thread.updatedAt = now();
    this.pushNotification({ method: 'thread/name/updated', params: { threadId, name } });
    return publicThread(thread);
  }

  patchThreadMetadata(
    threadId: string,
    patch: { preview?: string | null; gitInfo?: unknown },
  ): Thread | null {
    const thread = this.state.threads.get(threadId);
    if (!thread) return null;
    if (patch.preview !== undefined) thread.preview = patch.preview ?? '';
    if (patch.gitInfo !== undefined) thread.gitInfo = patch.gitInfo as Thread['gitInfo'];
    thread.updatedAt = now();
    this.pushNotification({
      method: 'thread/status/changed',
      params: { threadId, status: thread.status },
    });
    return publicThread(thread);
  }

  archiveThread(threadId: string): Thread | null {
    const thread = this.state.threads.get(threadId);
    if (!thread) return null;
    this.state.archivedThreadIds.add(threadId);
    thread.updatedAt = now();
    this.pushNotification({ method: 'thread/archived', params: { threadId } });
    this.pushNotification({ method: 'thread/closed', params: { threadId } });
    return publicThread(thread);
  }

  unarchiveThread(threadId: string): Thread | null {
    const thread = this.state.threads.get(threadId);
    if (!thread) return null;
    this.state.archivedThreadIds.delete(threadId);
    thread.updatedAt = now();
    this.pushNotification({ method: 'thread/unarchived', params: { threadId } });
    this.pushNotification({
      method: 'thread/status/changed',
      params: { threadId, status: thread.status },
    });
    return publicThread(thread);
  }

  unsubscribeThread(threadId: string): 'notLoaded' | 'notSubscribed' | 'unsubscribed' {
    if (!this.state.threads.has(threadId)) return 'notLoaded';
    const wasSubscribed = this.state.subscribedThreadIds.has(threadId);
    this.state.subscribedThreadIds.delete(threadId);
    return wasSubscribed ? 'unsubscribed' : 'notSubscribed';
  }

  incrementElicitation(threadId: string): { count: number; paused: boolean } {
    const next = (this.state.elicitationCounts.get(threadId) ?? 0) + 1;
    this.state.elicitationCounts.set(threadId, next);
    return { count: next, paused: next > 0 };
  }

  decrementElicitation(threadId: string): { count: number; paused: boolean } {
    const next = Math.max((this.state.elicitationCounts.get(threadId) ?? 0) - 1, 0);
    this.state.elicitationCounts.set(threadId, next);
    return { count: next, paused: next > 0 };
  }

  rollbackThread(threadId: string, numTurns: number): Thread | null {
    const thread = this.state.threads.get(threadId);
    if (!thread) return null;
    const turns = this.state.turns.get(threadId) ?? [];
    const nextTurns = numTurns >= turns.length ? [] : turns.slice(0, turns.length - numTurns);
    this.state.turns.set(threadId, nextTurns);
    thread.turns = nextTurns;
    thread.updatedAt = now();
    return publicThread(thread, nextTurns, true);
  }

  listTurns(threadId: string): ThreadTurn[] {
    return this.getTurns(threadId);
  }

  listLoadedThreads(): string[] {
    return [...this.state.loadedThreadIds.values()];
  }

  injectItems(threadId: string, items: unknown[]): boolean {
    return this.appendSyntheticTurn(threadId, items) !== null;
  }

  startTurn(
    threadId: string,
    items: unknown[],
    collaborationModeKind: string | null = null,
  ): ThreadTurn | null {
    const thread = this.state.threads.get(threadId);
    if (!thread) return null;
    const turns = this.state.turns.get(threadId) ?? [];
    const turn = newTurn(items, collaborationModeKind, 'inProgress');
    turn.itemsView = 'full';
    turns.push(turn);
    this.state.turns.set(threadId, turns);
    thread.turns = turns;
    thread.updatedAt = now();
    this.pushNotification({ method: 'turn/started', params: { threadId, turn } });
    this.pushNotification({
      method: 'turn/diff/updated',
      params: { threadId, turnId: turn.id, diff: '' },
    });
    this.pushNotification({
      method: 'turn/plan/updated',
      params: { threadId, turnId: turn.id, plan: [], explanation: null },
    });
    for (const item of items) this.emitCompletedItem(threadId, turn.id, item);
    return turn;
  }

  steerTurn(threadId: string, turnId: string, items: unknown[]): ThreadTurn | null {
    const turn = this.state.turns.get(threadId)?.find((entry) => entry.id === turnId);
    if (!turn) return null;
    turn.items.push(...items);
    turn.updatedAt = now();
    for (const item of items) this.emitCompletedItem(threadId, turnId, item);
    return turn;
  }

  interruptTurn(threadId: string, turnId: string): ThreadTurn | null {
    const turn = this.state.turns.get(threadId)?.find((entry) => entry.id === turnId);
    if (!turn) return null;
    turn.status = 'interrupted';
    turn.updatedAt = now();
    turn.completedAt = now();
    this.pushNotification({ method: 'turn/completed', params: { threadId, turn } });
    return turn;
  }

  readFile(path: string): string {
    return Deno.readTextFileSync(path);
  }

  writeFile(path: string, dataBase64: string): boolean {
    const bytes = Uint8Array.from(atob(dataBase64), (char) => char.charCodeAt(0));
    Deno.writeFileSync(path, bytes);
    return true;
  }

  createDirectory(path: string, recursive = true): boolean {
    Deno.mkdirSync(path, { recursive });
    return true;
  }

  getMetadata(path: string): {
    createdAtMs: number;
    isDirectory: boolean;
    isFile: boolean;
    isSymlink: boolean;
    modifiedAtMs: number;
  } {
    const stat = Deno.lstatSync(path);
    return {
      createdAtMs: stat.birthtime?.getTime?.() ?? 0,
      isDirectory: stat.isDirectory,
      isFile: stat.isFile,
      isSymlink: stat.isSymlink,
      modifiedAtMs: stat.mtime?.getTime?.() ?? 0,
    };
  }

  readDirectory(path: string): Array<{ fileName: string; isDirectory: boolean; isFile: boolean }> {
    const entries: Array<{ fileName: string; isDirectory: boolean; isFile: boolean }> = [];
    for (const entry of Deno.readDirSync(path)) {
      entries.push({ fileName: entry.name, isDirectory: entry.isDirectory, isFile: entry.isFile });
    }
    return entries;
  }

  remove(path: string, recursive = true, force = true): boolean {
    void force;
    Deno.removeSync(path, { recursive });
    return true;
  }

  copy(sourcePath: string, destinationPath: string): boolean {
    Deno.copyFileSync(sourcePath, destinationPath);
    return true;
  }

  watch(path: string, watchId: string): string {
    this.state.fsWatches.set(watchId, path);
    this.pushNotification({
      method: 'fs/changed',
      params: { watchId, changedPaths: [path] },
    });
    return path;
  }

  unwatch(watchId: string): boolean {
    return this.state.fsWatches.delete(watchId);
  }

  commandExec(
    command: string[],
    cwd: string,
  ): { exitCode: number; stdout: string; stderr: string } {
    const output = new Deno.Command(command[0], {
      args: command.slice(1),
      cwd,
      stdout: 'piped',
      stderr: 'piped',
    }).outputSync();
    return {
      exitCode: output.code,
      stdout: new TextDecoder().decode(output.stdout),
      stderr: new TextDecoder().decode(output.stderr),
    };
  }

  emitCommandExecOutputDelta(
    processId: string,
    stream: 'stdout' | 'stderr',
    deltaBase64: string,
    capReached = false,
  ): void {
    this.pushNotification({
      method: 'command/exec/outputDelta',
      params: { processId, stream, deltaBase64, capReached },
    });
  }

  commandExecWrite(_processId: string): boolean {
    return true;
  }

  commandExecTerminate(_processId: string): boolean {
    return true;
  }

  commandExecResize(_processId: string): boolean {
    return true;
  }

  spawnProcess(command: string[], cwd: string, processHandle: string): { processHandle: string } {
    const output = new Deno.Command(command[0], {
      args: command.slice(1),
      cwd,
      stdout: 'piped',
      stderr: 'piped',
    }).outputSync();
    const stdout = new TextDecoder().decode(output.stdout);
    const stderr = new TextDecoder().decode(output.stderr);
    this.state.processes.set(processHandle, {
      command,
      cwd,
      status: 'running',
      stdout,
      stderr,
    });
    if (stdout) {
      this.pushNotification({
        method: 'process/outputDelta',
        params: {
          processHandle,
          stream: 'stdout',
          deltaBase64: btoa(stdout),
          capReached: false,
        },
      });
    }
    if (stderr) {
      this.pushNotification({
        method: 'process/outputDelta',
        params: {
          processHandle,
          stream: 'stderr',
          deltaBase64: btoa(stderr),
          capReached: false,
        },
      });
    }
    this.state.processes.set(processHandle, {
      command,
      cwd,
      status: 'exited',
      stdout,
      stderr,
    });
    this.pushNotification({
      method: 'process/exited',
      params: {
        processHandle,
        exitCode: output.code,
        stdout,
        stdoutCapReached: false,
        stderr,
        stderrCapReached: false,
      },
    });
    return { processHandle };
  }

  emitThreadTokenUsage(threadId: string, turnId: string, totalTokens = 0): void {
    this.pushNotification({
      method: 'thread/tokenUsage/updated',
      params: {
        threadId,
        turnId,
        tokenUsage: {
          total: {
            totalTokens,
            inputTokens: 0,
            cachedInputTokens: 0,
            outputTokens: 0,
            reasoningOutputTokens: 0,
          },
          last: {
            totalTokens,
            inputTokens: 0,
            cachedInputTokens: 0,
            outputTokens: 0,
            reasoningOutputTokens: 0,
          },
          modelContextWindow: null,
        },
      },
    });
  }

  emitMcpServerStartupStatus(
    name: string,
    status: 'starting' | 'failed' | 'ready',
    error: string | null = null,
  ): void {
    this.pushNotification({
      method: 'mcpServer/startupStatus/updated',
      params: { name, status, error },
    });
  }

  emitAccountRateLimitsUpdated(planType: string | null = null): void {
    this.pushNotification({
      method: 'account/rateLimits/updated',
      params: {
        rateLimits: {
          credits: null,
          limitId: null,
          limitName: null,
          planType,
          primary: null,
          rateLimitReachedType: null,
          secondary: null,
        },
      },
    });
  }

  emitAccountUpdated(planType: string | null = null): void {
    this.pushNotification({
      method: 'account/updated',
      params: {
        authMode: 'chatgpt',
        planType,
      },
    });
  }

  emitAppListUpdated(): void {
    this.pushNotification({ method: 'app/list/updated', params: { data: [] } });
  }

  writeProcessStdin(_processHandle: string): boolean {
    return true;
  }

  killProcess(processHandle: string): boolean {
    return this.state.processes.delete(processHandle);
  }

  resizeProcess(_processHandle: string): boolean {
    return true;
  }

  emitUserInputRequest(threadId: string, turnId: string, itemId: string): void {
    this.pushNotification({
      method: 'item/tool/requestUserInput',
      params: {
        threadId,
        turnId,
        itemId,
        questions: [
          {
            id: 'default',
            header: 'Input',
            question: 'Provide input',
            isOther: true,
            isSecret: false,
            options: [
              {
                label: 'Continue',
                description: 'Provide a value and continue.',
              },
            ],
          },
        ],
      },
    });
  }

  emitMcpElicitationRequest(threadId: string, turnId: string | null, serverName: string): void {
    this.pushNotification({
      method: 'mcpServer/elicitation/request',
      params: {
        threadId,
        turnId,
        serverName,
        request: {
          type: 'form',
          id: crypto.randomUUID(),
          requestedSchema: {
            $schema: 'https://json-schema.org/draft/2020-12/schema',
            type: 'object',
            properties: {},
            required: [],
          },
          instructions: 'Provide a value to continue.',
        },
      },
    });
  }

  resetMemory(): boolean {
    this.pushNotification({ method: 'thread/closed', params: { threadId: '*' } });
    this.state.threads.clear();
    this.state.goals.clear();
    this.state.loadedThreadIds.clear();
    this.state.turns.clear();
    this.state.archivedThreadIds.clear();
    this.state.elicitationCounts.clear();
    this.state.subscribedThreadIds.clear();
    this.state.fsWatches.clear();
    this.state.processes.clear();
    this.state.agentStatuses.clear();
    return true;
  }

  forkThread(input: {
    threadId: string;
    model?: string;
    modelProvider?: string;
    cwd?: string;
    ephemeral?: boolean;
    subAgent?: boolean;
    agentPath?: string | null;
    agentNickname?: string | null;
    agentRole?: string | null;
    lastTaskMessage?: string | null;
  }): Thread | null {
    const source = this.state.threads.get(input.threadId);
    if (!source) return null;
    const forkedId = crypto.randomUUID();
    const forked = newThread(
      forkedId,
      input.cwd ?? source.cwd,
      input.modelProvider ?? source.modelProvider,
      input.model ?? source.model,
    );
    forked.ephemeral = input.ephemeral ?? source.ephemeral;
    forked.updatedAt = now();
    forked.forkedFromId = source.id;
    forked.sessionId = source.sessionId;
    forked.preview = source.preview;
    forked.source = source.source;
    forked.threadSource = source.threadSource;
    forked.agentNickname = input.agentNickname ?? source.agentNickname;
    forked.agentRole = input.agentRole ?? source.agentRole;
    forked.gitInfo = source.gitInfo;
    if (input.subAgent) {
      forked.parentThreadId = source.id;
      forked.source = threadSpawnSource({
        parentThreadId: source.id,
        agentPath: input.agentPath ?? `/${forkedId}`,
        agentNickname: forked.agentNickname,
        agentRole: forked.agentRole,
        lastTaskMessage: input.lastTaskMessage ?? null,
      });
    }
    this.state.threads.set(forkedId, forked);
    this.state.loadedThreadIds.add(forkedId);
    this.state.turns.set(forkedId, []);
    this.state.archivedThreadIds.delete(forkedId);
    this.pushNotification({ method: 'thread/started', params: { thread: forked } });
    this.pushNotification({
      method: 'thread/status/changed',
      params: { threadId: forked.id, status: forked.status },
    });
    if (input.subAgent) {
      const agentPath = threadSpawnAgentPath(forked) ?? input.agentPath ?? `/${forkedId}`;
      this.appendSyntheticTurn(source.id, [
        {
          type: 'collabAgentToolCall',
          id: crypto.randomUUID(),
          tool: 'spawnAgent',
          status: 'completed',
          senderThreadId: source.id,
          receiverThreadIds: [forked.id],
          prompt: null,
          model: forked.model,
          reasoningEffort: null,
          agentsStates: {
            [forked.id]: { status: 'running', message: null },
          },
        },
        {
          type: 'subAgentActivity',
          id: crypto.randomUUID(),
          kind: 'started',
          agentThreadId: forked.id,
          agentPath,
        },
      ]);
    }
    forked.turns = [...this.getTurns(source.id)];
    return publicThread(forked, this.getTurns(forked.id), true);
  }

  private resolveAgent(parentThreadId: string, target: string): Thread | null {
    const parent = this.state.threads.get(parentThreadId);
    if (!parent) return null;
    const rootThreadId = this.rootThreadId(parentThreadId);
    const normalized = this.resolveAgentPath(parentThreadId, target);
    const rawNormalized = normalizeAgentPath(target);
    const trimmedTarget = target.trim();
    const directChildPath = !trimmedTarget.startsWith('/')
      ? normalizeAgentPath(trimmedTarget)
      : null;
    return [...this.state.threads.values()].find((thread) => {
      if (this.rootThreadId(thread.id) !== rootThreadId) return false;
      if (thread.id === target) return true;
      const agentPath = threadSpawnAgentPath(thread);
      if (!agentPath) return false;
      if (agentPath === normalized) return true;
      if (trimmedTarget.startsWith('/') && agentPath === rawNormalized) return true;
      if (threadSpawnParentThreadId(thread) !== parentThreadId) return false;
      return agentPath === target || agentPath === directChildPath;
    }) ?? null;
  }

  private rootThreadId(threadId: string): string {
    let currentId = threadId;
    const seen = new Set<string>();
    while (!seen.has(currentId)) {
      seen.add(currentId);
      const thread = this.state.threads.get(currentId);
      const parentId = thread ? threadSpawnParentThreadId(thread) : null;
      if (!parentId || !this.state.threads.has(parentId)) return currentId;
      currentId = parentId;
    }
    return currentId;
  }

  private resolveAgentPath(parentThreadId: string, target: string): string {
    const parent = this.state.threads.get(parentThreadId);
    const parentPath = parent ? threadSpawnAgentPath(parent) : null;
    const trimmed = target.trim();
    if (!parentPath || trimmed.startsWith('/')) return normalizeAgentPath(trimmed);
    return `${parentPath.replace(/\/+$/, '')}/${trimmed.replace(/^\/+/, '')}`;
  }

  private listChildAgents(parentThreadId: string, pathPrefix?: string | null): Thread[] {
    const rootThreadId = this.rootThreadId(parentThreadId);
    const prefix = pathPrefix ? this.resolveAgentPath(parentThreadId, pathPrefix) : null;
    return [...this.state.threads.values()]
      .filter((thread) => threadSpawnParentThreadId(thread) !== null)
      .filter((thread) => this.rootThreadId(thread.id) === rootThreadId)
      .filter((thread) => {
        if (!prefix) return true;
        const agentPath = threadSpawnAgentPath(thread) ?? `/${thread.id}`;
        return agentPath === prefix || agentPath.startsWith(`${prefix}/`);
      })
      .sort((left, right) => left.createdAt - right.createdAt);
  }

  callMultiAgentTool(input: {
    threadId: string;
    callId?: string | null;
    namespace?: string | null;
    tool: string;
    arguments: unknown;
  }): MultiAgentToolResult | null {
    if (!isMultiAgentNamespace(input.namespace)) return null;
    const parent = this.state.threads.get(input.threadId);
    if (!parent) return stringifyToolOutput({ error: 'thread not found' });
    const args = asRecord(input.arguments);
    const tool = input.tool;

    if (tool === 'spawn_agent') {
      const taskName = textArg(args, 'task_name') ?? textArg(args, 'agent_id') ??
        textArg(args, 'name') ?? `agent_${crypto.randomUUID().slice(0, 8)}`;
      const message = textArg(args, 'message') ?? textArg(args, 'prompt') ?? '';
      if (!message.trim()) return stringifyToolOutput({ error: 'message is required' });
      const agentPath = childAgentPath(parent, taskName);
      const thread = this.forkThread({
        threadId: input.threadId,
        model: textArg(args, 'model') ?? parent.model,
        subAgent: true,
        agentPath,
        agentNickname: textArg(args, 'agent_nickname') ?? textArg(args, 'nickname'),
        agentRole: textArg(args, 'agent_type') ?? textArg(args, 'agentRole'),
        lastTaskMessage: message,
      });
      if (!thread) return stringifyToolOutput({ error: 'thread not found' });
      this.state.agentStatuses.set(thread.id, { status: 'running', message: null });
      this.appendSyntheticTurn(thread.id, [{
        type: 'message',
        id: crypto.randomUUID(),
        role: 'user',
        content: [{ type: 'input_text', text: message }],
      }]);
      return stringifyToolOutput(
        isMultiAgentV1Namespace(input.namespace)
          ? { agent_id: thread.id, nickname: thread.agentNickname }
          : { task_name: agentPath, nickname: thread.agentNickname },
      );
    }

    if (tool === 'list_agents') {
      const agents = this.listChildAgents(input.threadId, textArg(args, 'path_prefix')).map(
        (thread) => {
          const status = this.state.agentStatuses.get(thread.id);
          return {
            agent_name: threadSpawnAgentPath(thread) ?? thread.id,
            agent_status: status?.status === 'completed'
              ? { completed: status.message }
              : status?.status === 'errored'
              ? { errored: status.message ?? 'agent failed' }
              : status?.status === 'running'
              ? 'running'
              : status?.status === 'shutdown'
              ? 'shutdown'
              : thread.status.type === 'active'
              ? 'running'
              : thread.status.type,
            last_task_message: threadLastTaskMessage(thread),
          };
        },
      );
      return stringifyToolOutput({ agents });
    }

    if (tool === 'send_message' || tool === 'followup_task' || tool === 'send_input') {
      const target = textArg(args, 'target') ?? textArg(args, 'agent_id') ?? '';
      const message = textArg(args, 'message') ?? textArg(args, 'prompt') ?? '';
      const thread = this.resolveAgent(input.threadId, target);
      if (!thread) return stringifyToolOutput({ error: 'agent not found' });
      if (!message.trim()) return stringifyToolOutput({ error: 'message is required' });
      this.appendSyntheticTurn(thread.id, [{
        type: 'message',
        id: crypto.randomUUID(),
        role: 'user',
        content: [{ type: 'input_text', text: message }],
      }]);
      this.appendSyntheticTurn(input.threadId, [{
        type: 'subAgentActivity',
        id: crypto.randomUUID(),
        kind: 'interacted',
        agentThreadId: thread.id,
        agentPath: threadSpawnAgentPath(thread) ?? `/${thread.id}`,
      }]);
      return stringifyToolOutput({ submission_id: crypto.randomUUID() });
    }

    if (tool === 'wait_agent') {
      const ready = this.listChildAgents(input.threadId).find((thread) => {
        const status = this.state.agentStatuses.get(thread.id)?.status;
        return status === 'completed' || status === 'errored';
      });
      if (!ready) {
        return stringifyToolOutput(
          isMultiAgentV1Namespace(input.namespace)
            ? { status: {}, timed_out: true }
            : { message: 'Wait timed out.', timed_out: true },
        );
      }
      const agentPath = threadSpawnAgentPath(ready) ?? `/${ready.id}`;
      const status = this.state.agentStatuses.get(ready.id);
      if (isMultiAgentV1Namespace(input.namespace)) {
        return stringifyToolOutput({
          status: {
            [ready.id]: status?.status === 'errored'
              ? { errored: status.message ?? 'agent failed' }
              : { completed: status?.message ?? null },
          },
          timed_out: false,
        });
      }
      return stringifyToolOutput({
        message: status?.status === 'errored'
          ? `Agent ${agentPath} errored.`
          : `Agent ${agentPath} completed.`,
        timed_out: false,
      });
    }

    if (tool === 'resume_agent') {
      const target = textArg(args, 'id') ?? textArg(args, 'target') ?? textArg(args, 'agent_id') ??
        '';
      const thread = this.resolveAgent(input.threadId, target);
      if (!thread) return stringifyToolOutput({ status: 'not_found' });
      const currentStatus = this.state.agentStatuses.get(thread.id)?.status;
      const status = currentStatus === 'completed'
        ? { completed: this.state.agentStatuses.get(thread.id)?.message ?? null }
        : currentStatus === 'errored'
        ? { errored: this.state.agentStatuses.get(thread.id)?.message ?? 'agent failed' }
        : currentStatus === 'shutdown'
        ? 'shutdown'
        : thread.status.type === 'active'
        ? 'running'
        : 'running';
      this.state.agentStatuses.set(thread.id, { status: 'running', message: null });
      thread.status = { type: 'idle' };
      return stringifyToolOutput({ status });
    }

    if (tool === 'interrupt_agent') {
      const target = textArg(args, 'target') ?? textArg(args, 'agent_id') ?? '';
      const thread = this.resolveAgent(input.threadId, target);
      if (!thread) return stringifyToolOutput({ previous_status: 'not_found' });
      const agentStatus = this.state.agentStatuses.get(thread.id)?.status;
      const previousStatus = agentStatus === 'running'
        ? 'running'
        : thread.status.type === 'active'
        ? 'running'
        : thread.status.type;
      this.state.agentStatuses.set(thread.id, { status: 'completed', message: null });
      thread.status = { type: 'idle' };
      this.appendSyntheticTurn(input.threadId, [{
        type: 'subAgentActivity',
        id: crypto.randomUUID(),
        kind: 'interrupted',
        agentThreadId: thread.id,
        agentPath: threadSpawnAgentPath(thread) ?? `/${thread.id}`,
      }]);
      return stringifyToolOutput({ previous_status: previousStatus });
    }

    if (tool === 'close_agent') {
      const target = textArg(args, 'target') ?? textArg(args, 'id') ?? textArg(args, 'agent_id') ??
        '';
      const thread = this.resolveAgent(input.threadId, target);
      if (!thread) return stringifyToolOutput({ previous_status: 'not_found' });
      const agentStatus = this.state.agentStatuses.get(thread.id);
      const previousStatus = agentStatus?.status === 'completed'
        ? { completed: agentStatus.message }
        : agentStatus?.status === 'errored'
        ? { errored: agentStatus.message ?? 'agent failed' }
        : agentStatus?.status === 'shutdown'
        ? 'shutdown'
        : thread.status.type === 'active' || agentStatus?.status === 'running'
        ? 'running'
        : thread.status.type;
      this.state.agentStatuses.set(thread.id, { status: 'shutdown', message: null });
      thread.status = { type: 'idle' };
      this.appendSyntheticTurn(input.threadId, [{
        type: 'subAgentActivity',
        id: crypto.randomUUID(),
        kind: 'closed',
        agentThreadId: thread.id,
        agentPath: threadSpawnAgentPath(thread) ?? `/${thread.id}`,
      }]);
      return stringifyToolOutput({ previous_status: previousStatus });
    }

    return null;
  }

  completeAgent(threadId: string, message: string | null): void {
    const thread = this.state.threads.get(threadId);
    if (!thread) return;
    this.state.agentStatuses.set(threadId, { status: 'completed', message });
    this.appendSyntheticTurn(threadId, [{
      type: 'message',
      id: crypto.randomUUID(),
      role: 'assistant',
      content: [{ type: 'output_text', text: message ?? '' }],
    }]);
  }

  errorAgent(threadId: string, message: string): void {
    if (!this.state.threads.has(threadId)) return;
    this.state.agentStatuses.set(threadId, { status: 'errored', message });
  }

  emitWarning(message: string, threadId?: string): void {
    this.pushNotification({
      method: 'warning',
      params: threadId ? { message, threadId } : { message },
    });
  }

  emitDeprecationNotice(summary: string, details?: string): void {
    this.pushNotification({
      method: 'deprecationNotice',
      params: details ? { summary, details } : { summary },
    });
  }

  emitConfigWarning(summary: string, path?: string, details?: string): void {
    this.pushNotification({
      method: 'configWarning',
      params: { summary, path: path ?? null, details: details ?? null, range: null },
    });
  }

  emitGuardianWarning(message: string, threadId: string): void {
    this.pushNotification({
      method: 'guardianWarning',
      params: { message, threadId },
    });
  }

  emitMcpServerStatus(
    name: string,
    status: 'starting' | 'failed' | 'ready',
    error: string | null = null,
  ): void {
    this.pushNotification({
      method: 'mcpServer/startupStatus/updated',
      params: { name, status, error },
    });
  }

  emitServerRequestResolved(threadId: string, requestId: string): void {
    this.pushNotification({
      method: 'serverRequest/resolved',
      params: { threadId, requestId },
    });
  }

  emitExternalAgentConfigImportCompleted(): void {
    this.pushNotification({ method: 'externalAgentConfig/import/completed', params: {} });
  }

  emitFuzzySearchUpdated(sessionId: string, query: string): void {
    this.pushNotification({
      method: 'fuzzyFileSearch/sessionUpdated',
      params: { sessionId, query, files: [] },
    });
  }

  emitFuzzySearchCompleted(sessionId: string): void {
    this.pushNotification({ method: 'fuzzyFileSearch/sessionCompleted', params: { sessionId } });
  }

  emitWindowsWorldWritableWarning(): void {
    this.pushNotification({
      method: 'windows/worldWritableWarning',
      params: { samplePaths: [], extraCount: 0, failedScan: false },
    });
  }

  emitWindowsSandboxSetupCompleted(mode: 'elevated' | 'unelevated'): void {
    this.pushNotification({
      method: 'windowsSandbox/setupCompleted',
      params: { mode, success: true, error: null },
    });
  }

  emitRealtimeStarted(threadId: string, version: string): void {
    this.pushNotification({
      method: 'thread/realtime/started',
      params: { threadId, version, realtimeSessionId: crypto.randomUUID() },
    });
  }

  emitRealtimeItemAdded(threadId: string, item: unknown): void {
    this.pushNotification({
      method: 'thread/realtime/itemAdded',
      params: { threadId, item },
    });
  }

  emitRealtimeTranscriptDelta(threadId: string, role: string, delta: string): void {
    this.pushNotification({
      method: 'thread/realtime/transcript/delta',
      params: { threadId, role, delta },
    });
  }

  emitRealtimeTranscriptDone(threadId: string, role: string, text: string): void {
    this.pushNotification({
      method: 'thread/realtime/transcript/done',
      params: { threadId, role, text },
    });
  }

  emitRealtimeOutputAudioDelta(threadId: string, audio: string): void {
    this.pushNotification({
      method: 'thread/realtime/outputAudio/delta',
      params: { threadId, audio },
    });
  }

  emitRealtimeSdp(threadId: string, sdp: string): void {
    this.pushNotification({
      method: 'thread/realtime/sdp',
      params: { threadId, sdp },
    });
  }

  emitRealtimeError(threadId: string, error: string): void {
    this.pushNotification({
      method: 'thread/realtime/error',
      params: { threadId, error },
    });
  }

  emitRealtimeClosed(threadId: string): void {
    this.pushNotification({
      method: 'thread/realtime/closed',
      params: { threadId },
    });
  }
}
