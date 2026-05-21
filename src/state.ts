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
  notifications: ServerNotification[];
};

const now = () => Math.floor(Date.now() / 1000);

const newThread = (id: string, cwd: string, modelProvider: string, model: string): Thread => ({
  id,
  sessionId: id,
  forkedFromId: null,
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

const cloneThread = (thread: Thread, turns: ThreadTurn[] = []): Thread => ({
  ...thread,
  turns: [...turns],
});

const publicThread = (thread: Thread, turns: ThreadTurn[] = [], includeTurns = false): Thread => ({
  ...thread,
  turns: includeTurns ? [...turns] : [],
});

const newTurn = (items: unknown[] = []): ThreadTurn => {
  const ts = now();
  return {
    id: crypto.randomUUID(),
    items,
    status: 'completed',
    createdAt: ts,
    updatedAt: ts,
    itemsView: 'full',
    startedAt: ts,
    completedAt: ts,
    durationMs: 0,
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
    notifications: [],
  };

  pushNotification(notification: ServerNotification): void {
    this.state.notifications.push(notification);
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
  }): Thread {
    const id = input.threadId ?? crypto.randomUUID();
    const thread = newThread(
      id,
      input.cwd ?? Deno.cwd(),
      input.modelProvider ?? 'openai',
      input.model,
    );
    thread.ephemeral = input.ephemeral ?? true;
    thread.updatedAt = now();
    this.state.threads.set(id, thread);
    this.state.loadedThreadIds.add(id);
    this.state.turns.set(id, []);
    this.state.archivedThreadIds.delete(id);
    this.pushNotification({ method: 'thread/started', params: { thread } });
    this.pushNotification({ method: 'thread/status/changed', params: { threadId: id, status: thread.status } });
    return publicThread(thread);
  }

  resumeThread(threadId: string): Thread | null {
    const existing = this.state.threads.get(threadId);
    if (existing) {
      existing.updatedAt = now();
      this.state.loadedThreadIds.add(threadId);
      this.pushNotification({ method: 'thread/status/changed', params: { threadId, status: existing.status } });
      return publicThread(existing, this.getTurns(threadId), true);
    }
    return null;
  }

  listThreads(): Thread[] {
    return [...this.state.threads.values()]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((thread) => publicThread(thread));
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
    this.pushNotification({ method: 'thread/status/changed', params: { threadId, status: thread.status } });
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
    this.pushNotification({ method: 'thread/status/changed', params: { threadId, status: thread.status } });
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
    const thread = this.state.threads.get(threadId);
    if (!thread) return false;
    const turns = this.state.turns.get(threadId) ?? [];
    const turn = newTurn(items);
    turns.push(turn);
    this.state.turns.set(threadId, turns);
    thread.turns = turns;
    thread.updatedAt = now();
    this.pushNotification({
      method: 'item/started',
      params: { threadId, turnId: turn.id, startedAtMs: Date.now(), item: items[0] ?? null },
    });
    this.pushNotification({
      method: 'rawResponseItem/completed',
      params: { threadId, turnId: turn.id, item: items[0] ?? null },
    });
    this.pushNotification({
      method: 'item/completed',
      params: { threadId, turnId: turn.id, completedAtMs: Date.now(), item: items[0] ?? null },
    });
    return true;
  }

  startTurn(threadId: string, items: unknown[]): ThreadTurn | null {
    const thread = this.state.threads.get(threadId);
    if (!thread) return null;
    const turns = this.state.turns.get(threadId) ?? [];
    const turn = newTurn(items);
    turn.status = 'inProgress';
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
    this.pushNotification({
      method: 'item/started',
      params: { threadId, turnId: turn.id, startedAtMs: Date.now(), item: items[0] ?? null },
    });
    this.pushNotification({
      method: 'rawResponseItem/completed',
      params: { threadId, turnId: turn.id, item: items[0] ?? null },
    });
    this.pushNotification({
      method: 'item/completed',
      params: { threadId, turnId: turn.id, completedAtMs: Date.now(), item: items[0] ?? null },
    });
    return turn;
  }

  steerTurn(threadId: string, turnId: string, items: unknown[]): ThreadTurn | null {
    const turn = this.state.turns.get(threadId)?.find((entry) => entry.id === turnId);
    if (!turn) return null;
    turn.items.push(...items);
    turn.updatedAt = now();
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

  commandExec(command: string[], cwd: string): { exitCode: number; stdout: string; stderr: string } {
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
    this.state.processes.set(processHandle, {
      command,
      cwd,
      status: 'running',
      stdout: '',
      stderr: '',
    });
    this.pushNotification({
      method: 'process/outputDelta',
      params: {
        processHandle,
        stream: 'stdout',
        deltaBase64: btoa(JSON.stringify({ command })),
        capReached: true,
      },
    });
    this.state.processes.set(processHandle, {
      command,
      cwd,
      status: 'exited',
      stdout: '',
      stderr: '',
    });
    this.pushNotification({
      method: 'process/exited',
      params: {
        processHandle,
        exitCode: 0,
        stdout: '',
        stdoutCapReached: false,
        stderr: '',
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

  emitMcpServerStartupStatus(name: string, status: 'starting' | 'failed' | 'ready', error: string | null = null): void {
    this.pushNotification({
      method: 'mcpServer/startupStatus/updated',
      params: { name, status, error },
    });
  }

  emitAccountRateLimitsUpdated(): void {
    this.pushNotification({
      method: 'account/rateLimits/updated',
      params: {
        rateLimits: {
          credits: null,
          limitId: null,
          limitName: null,
          planType: null,
          primary: null,
          rateLimitReachedType: null,
          secondary: null,
        },
      },
    });
  }

  emitAccountUpdated(): void {
    this.pushNotification({ method: 'account/updated', params: {} });
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
    return true;
  }

  forkThread(input: {
    threadId: string;
    model?: string;
    modelProvider?: string;
    cwd?: string;
    ephemeral?: boolean;
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
    this.state.threads.set(forkedId, forked);
    this.state.loadedThreadIds.add(forkedId);
    this.state.turns.set(forkedId, []);
    this.state.archivedThreadIds.delete(forkedId);
    this.pushNotification({ method: 'thread/started', params: { thread: forked } });
    this.pushNotification({ method: 'thread/status/changed', params: { threadId: forked.id, status: forked.status } });
    forked.forkedFromId = source.id;
    forked.preview = source.preview;
    forked.source = source.source;
    forked.threadSource = source.threadSource;
    forked.agentNickname = source.agentNickname;
    forked.agentRole = source.agentRole;
    forked.gitInfo = source.gitInfo;
    forked.turns = [...this.getTurns(source.id)];
    return publicThread(forked, this.getTurns(forked.id), true);
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

  emitMcpServerStatus(name: string, status: 'starting' | 'failed' | 'ready', error: string | null = null): void {
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
    this.pushNotification({ method: 'fuzzyFileSearch/sessionUpdated', params: { sessionId, query, files: [] } });
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
