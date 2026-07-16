import { assert, assertEquals } from 'jsr:@std/assert@1';
import { handleHttpWithState } from './handlers.ts';
import { setMcpToolDiscoveryForTests } from './proxy.ts';
import { HubState } from './state.ts';
import type { ProxyConfig } from './types.ts';

const config: ProxyConfig = {
  port: 8787,
  host: '127.0.0.1',
  authToken: null,
  accountEmail: 'user@example.com',
  accountName: 'Local User',
  accountPlanType: 'plus',
  responsesBaseUrl: 'http://127.0.0.1:1',
  chatBaseUrl: 'http://127.0.0.1:1',
  forceChatCompletions: false,
  nvidiaCompat: false,
  isCloudflare: false,
  defaultModel: 'gpt-4.1',
  defaultApiKey: '',
  apiKeys: [],
  requestIntervalMs: 0,
  needRetry: false,
  glmTryGetKey: false,
  glmKeyRefreshIntervalMs: 600000,
  glmKeyFetchRetryCount: 100,
  glmKeyFetchRetryDelayMs: 30000,
  dataDir: '/tmp',
};

setMcpToolDiscoveryForTests(async () => []);

Deno.test('handleHttpWithState reports upstream fetch exceptions with details', async () => {
  const originalFetch = globalThis.fetch;
  const originalLogDir = Deno.env.get('HUBPROXY_LOG_DIR');
  const logDir = await Deno.makeTempDir();
  globalThis.fetch = (() => {
    throw new TypeError('network down');
  }) as typeof fetch;

  try {
    Deno.env.set('HUBPROXY_LOG_DIR', logDir);
    const resp = await handleHttpWithState(
      new Request('http://localhost/v1/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: 'gpt-4.1',
          messages: [{ role: 'user', content: 'hello' }],
        }),
      }),
      config,
      new HubState(),
    );
    assertEquals(resp.status, 502);
    const body = await resp.json() as {
      error?: { message?: string; type?: string; upstream_message?: string };
    };
    assertEquals(body.error?.message, 'Upstream request failed');
    assertEquals(body.error?.type, 'upstream_error');
    assertEquals(body.error?.upstream_message, 'network down');

    const logEntries = Array.from(Deno.readDirSync(logDir))
      .map((entry) => JSON.parse(Deno.readTextFileSync(`${logDir}/${entry.name}`)));
    assert(
      logEntries.some((entry) =>
        entry.kind === 'upstream_exception' && entry.errorMessage === 'network down'
      ),
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (originalLogDir === undefined) Deno.env.delete('HUBPROXY_LOG_DIR');
    else Deno.env.set('HUBPROXY_LOG_DIR', originalLogDir);
    await Deno.remove(logDir, { recursive: true });
  }
});

Deno.test('handleHttpWithState serves models and rpc thread methods', async () => {
  const state = new HubState();

  const init = await handleHttpWithState(
    new Request('http://localhost/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 0,
        method: 'initialize',
        params: {
          clientInfo: { name: 'codex_vscode', version: '0.1.0' },
          capabilities: {},
        },
      }),
    }),
    config,
    state,
  );
  assertEquals(init.status, 200);
  const initJson = await init.json() as {
    result: { userAgent: string; codexHome: string; platformOs: string };
  };
  assertEquals(typeof initJson.result.userAgent, 'string');
  assertEquals(typeof initJson.result.codexHome, 'string');
  assertEquals(typeof initJson.result.platformOs, 'string');

  const eventsPromise = handleHttpWithState(
    new Request('http://localhost/events'),
    config,
    state,
  );

  await handleHttpWithState(
    new Request('http://localhost/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 100,
        method: 'thread/start',
        params: { threadId: 'thr_events' },
      }),
    }),
    config,
    state,
  );

  await handleHttpWithState(
    new Request('http://localhost/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 101,
        method: 'turn/start',
        params: { threadId: 'thr_events', input: [] },
      }),
    }),
    config,
    state,
  );

  const events = await eventsPromise;
  assertEquals(events.status, 200);
  const reader = events.body?.getReader();
  assert(reader);
  const chunks: string[] = [];
  const deadline = Date.now() + 2000;
  try {
    while (Date.now() < deadline) {
      const result = await Promise.race([
        reader.read(),
        new Promise<{ done: true; value?: undefined }>((resolve) =>
          setTimeout(() => resolve({ done: true }), 20)
        ),
      ]);
      if ('value' in result && result.value) {
        chunks.push(new TextDecoder().decode(result.value));
        const combined = chunks.join('');
        if (
          combined.includes('event: thread/started') && combined.includes('event: turn/started')
        ) {
          assert(combined.includes('event: thread/started'));
          assert(combined.includes('event: turn/started'));
          break;
        }
      }
    }
  } finally {
    await reader.cancel();
  }

  const followEvents = await handleHttpWithState(
    new Request('http://localhost/events'),
    config,
    state,
  );
  const followReader = followEvents.body?.getReader();
  assert(followReader);
  await handleHttpWithState(
    new Request('http://localhost/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 102,
        method: 'fs/watch',
        params: { path: '/tmp', watchId: 'watch-1' },
      }),
    }),
    config,
    state,
  );
  state.emitAccountUpdated();
  state.emitAppListUpdated();
  state.pushNotification({
    method: 'command/exec/outputDelta',
    params: {
      processId: 'proc-events',
      stream: 'stdout',
      deltaBase64: btoa('hello'),
      capReached: false,
    },
  });
  state.pushNotification({
    method: 'item/reasoning/summaryTextDelta',
    params: {
      threadId: 'thr_events',
      turnId: 'turn-events',
      itemId: 'reasoning-1',
      delta: 'thinking',
      summaryIndex: 0,
    },
  });
  state.pushNotification({
    method: 'item/reasoning/summaryPartAdded',
    params: {
      threadId: 'thr_events',
      turnId: 'turn-events',
      itemId: 'reasoning-1',
      summaryIndex: 0,
    },
  });
  state.pushNotification({
    method: 'item/reasoning/textDelta',
    params: {
      threadId: 'thr_events',
      turnId: 'turn-events',
      itemId: 'reasoning-1',
      delta: 'raw reasoning',
      contentIndex: 0,
    },
  });
  state.pushNotification({
    method: 'item/agentMessage/delta',
    params: {
      threadId: 'thr_events',
      turnId: 'turn-events',
      itemId: 'msg-1',
      delta: 'assistant text',
    },
  });
  state.pushNotification({
    method: 'item/plan/delta',
    params: {
      threadId: 'thr_events',
      turnId: 'turn-events',
      itemId: 'plan-1',
      delta: 'plan delta',
    },
  });
  state.pushNotification({
    method: 'item/mcpToolCall/progress',
    params: {
      threadId: 'thr_events',
      turnId: 'turn-events',
      itemId: 'mcp-tool-1',
      message: 'tool call',
    },
  });
  await handleHttpWithState(
    new Request('http://localhost/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 104,
        method: 'command/exec',
        params: { command: ['echo', 'hi'], cwd: Deno.cwd(), processId: 'cmd-events' },
      }),
    }),
    config,
    state,
  );
  const waitFor = <T>(promise: Promise<T>, ms: number) =>
    new Promise<T>((resolve, reject) => {
      const timeoutId = setTimeout(() => reject(new Error('timeout')), ms);
      promise.then((value) => {
        clearTimeout(timeoutId);
        resolve(value);
      }).catch((error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
    });
  try {
    let combined = '';
    const deadline = Date.now() + 2000;
    while (Date.now() < deadline) {
      const next = await waitFor(followReader!.read(), 200);
      if ('value' in next && next.value) {
        combined += new TextDecoder().decode(next.value);
      }
      if (
        combined.includes('event: fs/changed') &&
        combined.includes('event: command/exec/outputDelta') &&
        combined.includes('event: item/reasoning/summaryTextDelta') &&
        combined.includes('event: item/reasoning/textDelta') &&
        combined.includes('event: item/agentMessage/delta') &&
        combined.includes('event: item/plan/delta') &&
        combined.includes('event: item/mcpToolCall/progress') &&
        combined.includes('event: command/exec/outputDelta')
      ) {
        break;
      }
    }
    assert(combined.includes('event: fs/changed'));
    assert(!combined.includes('event: fileChange/outputDelta'));
    assert(combined.includes('event: command/exec/outputDelta'));
    assert(combined.includes('event: item/reasoning/summaryTextDelta'));
    assert(combined.includes('"summaryIndex":0'));
    assert(combined.includes('event: item/reasoning/summaryPartAdded'));
    assert(combined.includes('event: item/reasoning/textDelta'));
    assert(combined.includes('"contentIndex":0'));
    assert(combined.includes('event: item/agentMessage/delta'));
    assert(combined.includes('event: item/plan/delta'));
    assert(combined.includes('event: item/mcpToolCall/progress'));
    assert(combined.includes('event: command/exec/outputDelta'));
    assert(
      combined.includes('event: account/updated') || combined.includes('event: app/list/updated'),
    );
  } finally {
    await followReader!.cancel();
  }

  const modelsSeen: { url?: string; init?: RequestInit } = {};
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    modelsSeen.url = String(input);
    modelsSeen.init = init;
    return new Response(
      JSON.stringify({
        object: 'list',
        data: [
          {
            id: 'remote-model-1',
            object: 'model',
            created: 123,
            owned_by: 'upstream',
          },
        ],
      }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' },
      },
    );
  }) as typeof fetch;
  try {
    const models = await handleHttpWithState(
      new Request('http://localhost/v1/models'),
      config,
      state,
    );
    assertEquals(models.status, 200);
    const modelsJson = await models.json() as { object: string; data: Array<{ id: string }> };
    assertEquals(modelsJson.object, 'list');
    assertEquals(modelsJson.data[0].id, 'remote-model-1');
    assertEquals(modelsSeen.url, 'http://127.0.0.1:1/v1/models');
    assertEquals((modelsSeen.init?.headers as Headers).get('authorization'), null);
  } finally {
    globalThis.fetch = originalFetch;
  }

  const start = await handleHttpWithState(
    new Request('http://localhost/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'thread/start',
        params: { threadId: 'thr_test', multiAgentMode: 'proactive' },
      }),
    }),
    config,
    state,
  );
  assertEquals(start.status, 200);
  const startJson = await start.json() as {
    id: number;
    result: {
      multiAgentMode: unknown;
      thread: {
        id: string;
        turns: unknown[];
        name: string | null;
        modelProvider: string;
        model: string;
      };
    };
  };
  assertEquals(startJson.result.thread.id, 'thr_test');
  assertEquals(startJson.result.thread.turns.length, 0);
  assertEquals(startJson.result.thread.name, null);
  assertEquals(startJson.result.thread.model, 'gpt-4.1');
  assertEquals(startJson.result.thread.modelProvider, 'openai');
  assertEquals(startJson.result.multiAgentMode, 'proactive');

  const loadedList = await handleHttpWithState(
    new Request('http://localhost/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 12,
        method: 'thread/loaded/list',
        params: {},
      }),
    }),
    config,
    state,
  );
  const loadedListJson = await loadedList.json() as { result: { data: string[] } };
  assertEquals(loadedListJson.result.data.includes('thr_test'), true);

  const threadList = await handleHttpWithState(
    new Request('http://localhost/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 120,
        method: 'thread/list',
        params: {},
      }),
    }),
    config,
    state,
  );
  const threadListJson = await threadList.json() as {
    result: { data: Array<{ id: string; turns: unknown[] }> };
  };
  assertEquals(threadListJson.result.data[0].id, 'thr_test');
  assertEquals(threadListJson.result.data[0].turns.length, 0);

  const nameSet = await handleHttpWithState(
    new Request('http://localhost/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 6,
        method: 'thread/name/set',
        params: { threadId: 'thr_test', name: 'renamed' },
      }),
    }),
    config,
    state,
  );
  const nameSetJson = await nameSet.json() as { result: { threadId: string; name: string | null } };
  assertEquals(nameSetJson.result.threadId, 'thr_test');
  assertEquals(nameSetJson.result.name, 'renamed');

  const archive = await handleHttpWithState(
    new Request('http://localhost/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 7,
        method: 'thread/archive',
        params: { threadId: 'thr_test' },
      }),
    }),
    config,
    state,
  );
  const archiveJson = await archive.json() as { result: { archived: boolean; threadId: string } };
  assertEquals(archiveJson.result.archived, true);
  assertEquals(archiveJson.result.threadId, 'thr_test');

  const unarchive = await handleHttpWithState(
    new Request('http://localhost/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 8,
        method: 'thread/unarchive',
        params: { threadId: 'thr_test' },
      }),
    }),
    config,
    state,
  );
  const unarchiveJson = await unarchive.json() as { result: { thread: { id: string } } };
  assertEquals(unarchiveJson.result.thread.id, 'thr_test');

  const fork = await handleHttpWithState(
    new Request('http://localhost/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 9,
        method: 'thread/fork',
        params: { threadId: 'thr_test', model: 'forked-model' },
      }),
    }),
    config,
    state,
  );
  const forkJson = await fork.json() as {
    result: { multiAgentMode: unknown; thread: { forkedFromId: string | null } };
  };
  assertEquals(forkJson.result.thread.forkedFromId, 'thr_test');
  assertEquals(forkJson.result.multiAgentMode, 'explicitRequestOnly');

  state.drainNotifications();
  const subagentFork = await handleHttpWithState(
    new Request('http://localhost/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 91,
        method: 'thread/fork',
        params: {
          threadId: 'thr_test',
          subAgent: true,
          agentPath: '/worker',
          agentNickname: 'Worker',
          agentRole: 'worker',
        },
      }),
    }),
    config,
    state,
  );
  const subagentForkJson = await subagentFork.json() as {
    result: {
      thread: {
        id: string;
        agentNickname: string | null;
        agentRole: string | null;
        parentThreadId: string | null;
        source: {
          subAgent?: {
            thread_spawn?: { parent_thread_id?: string; agent_path?: string | null };
          };
        };
      };
    };
  };
  assertEquals(subagentForkJson.result.thread.agentNickname, 'Worker');
  assertEquals(subagentForkJson.result.thread.agentRole, 'worker');
  assertEquals(subagentForkJson.result.thread.parentThreadId, 'thr_test');
  assertEquals(
    subagentForkJson.result.thread.source.subAgent?.thread_spawn?.parent_thread_id,
    'thr_test',
  );
  assertEquals(subagentForkJson.result.thread.source.subAgent?.thread_spawn?.agent_path, '/worker');

  const subagentNotifications = state.drainNotifications();
  assertEquals(
    subagentNotifications.some((entry) =>
      entry.method === 'item/completed' &&
      (entry.params as { item?: { type?: string; tool?: string; receiverThreadIds?: string[] } })
          .item?.type === 'collabAgentToolCall' &&
      (entry.params as { item?: { tool?: string } }).item?.tool === 'spawnAgent' &&
      (entry.params as { item?: { receiverThreadIds?: string[] } }).item?.receiverThreadIds
        ?.includes(subagentForkJson.result.thread.id)
    ),
    true,
  );
  assertEquals(
    subagentNotifications.some((entry) =>
      entry.method === 'item/completed' &&
      (entry.params as { item?: { type?: string; kind?: string; agentThreadId?: string } }).item
          ?.type === 'subAgentActivity' &&
      (entry.params as { item?: { kind?: string } }).item?.kind === 'started' &&
      (entry.params as { item?: { agentThreadId?: string } }).item?.agentThreadId ===
        subagentForkJson.result.thread.id
    ),
    true,
  );

  const parentTurnsAfterSubagentFork = await handleHttpWithState(
    new Request('http://localhost/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 910,
        method: 'thread/turns/list',
        params: { threadId: 'thr_test' },
      }),
    }),
    config,
    state,
  );
  const parentTurnsAfterSubagentForkJson = await parentTurnsAfterSubagentFork.json() as {
    result: { data: Array<{ id: string; items: Array<{ type?: string }> }> };
  };
  const subagentSyntheticTurn = parentTurnsAfterSubagentForkJson.result.data.find((turn) =>
    turn.items.some((item) => item.type === 'collabAgentToolCall') &&
    turn.items.some((item) => item.type === 'subAgentActivity')
  );
  assert(subagentSyntheticTurn);

  const parentSubagentItems = await handleHttpWithState(
    new Request('http://localhost/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 911,
        method: 'thread/turns/items/list',
        params: { threadId: 'thr_test', turnId: subagentSyntheticTurn.id },
      }),
    }),
    config,
    state,
  );
  const parentSubagentItemsJson = await parentSubagentItems.json() as {
    result: { data: Array<{ type?: string }> };
  };
  assertEquals(parentSubagentItemsJson.result.data.map((item) => item.type), [
    'collabAgentToolCall',
    'subAgentActivity',
  ]);

  const subagentList = await handleHttpWithState(
    new Request('http://localhost/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 92,
        method: 'thread/list',
        params: { sourceKinds: ['subAgentThreadSpawn'] },
      }),
    }),
    config,
    state,
  );
  const subagentListJson = await subagentList.json() as { result: { data: Array<{ id: string }> } };
  assertEquals(subagentListJson.result.data.map((thread) => thread.id), [
    subagentForkJson.result.thread.id,
  ]);

  const subagentParentList = await handleHttpWithState(
    new Request('http://localhost/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 93,
        method: 'thread/list',
        params: { parentThreadId: 'thr_test' },
      }),
    }),
    config,
    state,
  );
  const subagentParentListJson = await subagentParentList.json() as {
    result: { data: Array<{ id: string }> };
  };
  assertEquals(subagentParentListJson.result.data.map((thread) => thread.id), [
    subagentForkJson.result.thread.id,
  ]);

  const goal = await handleHttpWithState(
    new Request('http://localhost/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'thread/goal/set',
        params: { threadId: 'thr_test', objective: 'do it' },
      }),
    }),
    config,
    state,
  );
  const goalJson = await goal.json() as { result: { goal: { objective: string } } };
  assertEquals(goalJson.result.goal.objective, 'do it');

  const rollback = await handleHttpWithState(
    new Request('http://localhost/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 10,
        method: 'thread/rollback',
        params: { threadId: 'thr_test', numTurns: 1 },
      }),
    }),
    config,
    state,
  );
  const rollbackJson = await rollback.json() as { result: { thread: { id: string } } };
  assertEquals(rollbackJson.result.thread.id, 'thr_test');

  const inject = await handleHttpWithState(
    new Request('http://localhost/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 13,
        method: 'thread/inject_items',
        params: { threadId: 'thr_test', items: [{ type: 'message', role: 'user' }] },
      }),
    }),
    config,
    state,
  );
  assertEquals(inject.status, 200);
  const injectJson = await inject.json() as { result: { threadId: string; injectedCount: number } };
  assertEquals(injectJson.result.threadId, 'thr_test');
  assertEquals(injectJson.result.injectedCount, 1);

  const unsubscribe = await handleHttpWithState(
    new Request('http://localhost/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 14,
        method: 'thread/unsubscribe',
        params: { threadId: 'thr_test' },
      }),
    }),
    config,
    state,
  );
  const unsubscribeJson = await unsubscribe.json() as { result: { status: string } };
  assertEquals(typeof unsubscribeJson.result.status, 'string');

  const elicitation = await handleHttpWithState(
    new Request('http://localhost/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 15,
        method: 'thread/increment_elicitation',
        params: { threadId: 'thr_test' },
      }),
    }),
    config,
    state,
  );
  const elicitationJson = await elicitation.json() as {
    result: { count: number; paused: boolean };
  };
  assertEquals(elicitationJson.result.count >= 1, true);
  assertEquals(typeof elicitationJson.result.paused, 'boolean');

  const userInput = await handleHttpWithState(
    new Request('http://localhost/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 16,
        method: 'item/tool/requestUserInput',
        params: {
          threadId: 'thr_test',
          turnId: 'turn_test',
          itemId: 'item_test',
        },
      }),
    }),
    config,
    state,
  );
  const userInputJson = await userInput.json() as {
    result: { answers: Record<string, { answers: string[] }> };
  };
  assertEquals(userInputJson.result.answers.default.answers[0], 'continue');

  const mcpElicitation = await handleHttpWithState(
    new Request('http://localhost/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 17,
        method: 'mcpServer/elicitation/request',
        params: {
          threadId: 'thr_test',
          serverName: 'local',
        },
      }),
    }),
    config,
    state,
  );
  const mcpElicitationJson = await mcpElicitation.json() as {
    result: { action: string; content: null; meta: null };
  };
  assertEquals(mcpElicitationJson.result.action, 'accept');

  const commandApproval = await handleHttpWithState(
    new Request('http://localhost/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 18,
        method: 'item/commandExecution/requestApproval',
        params: {
          threadId: 'thr_test',
          turnId: 'turn_test',
          itemId: 'cmd_item',
          startedAtMs: Date.now(),
        },
      }),
    }),
    config,
    state,
  );
  const commandApprovalJson = await commandApproval.json() as {
    result: { decision: string };
  };
  assertEquals(commandApprovalJson.result.decision, 'accept');

  const fileApproval = await handleHttpWithState(
    new Request('http://localhost/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 19,
        method: 'item/fileChange/requestApproval',
        params: {
          threadId: 'thr_test',
          turnId: 'turn_test',
          itemId: 'file_item',
          startedAtMs: Date.now(),
        },
      }),
    }),
    config,
    state,
  );
  const fileApprovalJson = await fileApproval.json() as {
    result: { decision: string };
  };
  assertEquals(fileApprovalJson.result.decision, 'accept');

  const permissionsApproval = await handleHttpWithState(
    new Request('http://localhost/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 20,
        method: 'item/permissions/requestApproval',
        params: {
          threadId: 'thr_test',
          turnId: 'turn_test',
          itemId: 'perm_item',
          startedAtMs: Date.now(),
        },
      }),
    }),
    config,
    state,
  );
  const permissionsApprovalJson = await permissionsApproval.json() as {
    result: { permissions: Record<string, unknown>; scope: string };
  };
  assertEquals(permissionsApprovalJson.result.scope, 'turn');

  const remoteEnable = await handleHttpWithState(
    new Request('http://localhost/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 21,
        method: 'remoteControl/enable',
        params: {
          serverName: 'server-a',
          installationId: 'inst-a',
        },
      }),
    }),
    config,
    state,
  );
  const remoteEnableJson = await remoteEnable.json() as {
    result: { status: string; serverName: string; installationId: string };
  };
  assertEquals(remoteEnableJson.result.status, 'connected');
  assertEquals(remoteEnableJson.result.serverName, 'server-a');

  const remoteStatus = await handleHttpWithState(
    new Request('http://localhost/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 21_1,
        method: 'remoteControl/status/read',
        params: {},
      }),
    }),
    config,
    state,
  );
  const remoteStatusJson = await remoteStatus.json() as {
    result: { status: string; serverName: string; installationId: string };
  };
  assertEquals(remoteStatusJson.result.status, 'disabled');

  const configRead = await handleHttpWithState(
    new Request('http://localhost/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 22,
        method: 'config/read',
        params: {},
      }),
    }),
    config,
    state,
  );
  const configReadJson = await configRead.json() as {
    result: {
      config: {
        defaultModel: string;
        port: number;
        authToken: string | null;
        responsesBaseUrl: string;
        forceChatCompletions: boolean;
        nvidiaCompat: boolean;
        isCloudflare: boolean;
        requestIntervalMs: number;
        needRetry: boolean;
        apiKeyCount: number;
      };
    };
  };
  assertEquals(configReadJson.result.config.defaultModel, config.defaultModel);
  assertEquals(configReadJson.result.config.port, config.port);
  assertEquals(configReadJson.result.config.authToken, config.authToken);
  assertEquals(configReadJson.result.config.responsesBaseUrl, config.responsesBaseUrl);
  assertEquals(configReadJson.result.config.forceChatCompletions, false);
  assertEquals(configReadJson.result.config.nvidiaCompat, false);
  assertEquals(configReadJson.result.config.isCloudflare, false);
  assertEquals(configReadJson.result.config.requestIntervalMs, 0);
  assertEquals(configReadJson.result.config.needRetry, false);
  assertEquals(configReadJson.result.config.apiKeyCount, 0);

  const configRequirements = await handleHttpWithState(
    new Request('http://localhost/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 23,
        method: 'configRequirements/read',
        params: {},
      }),
    }),
    config,
    state,
  );
  const configRequirementsJson = await configRequirements.json() as {
    result: { requirements: { network: null } };
  };
  assertEquals(configRequirementsJson.result.requirements.network, null);

  const attestation = await handleHttpWithState(
    new Request('http://localhost/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 24,
        method: 'attestation/generate',
        params: {},
      }),
    }),
    config,
    state,
  );
  const attestationJson = await attestation.json() as {
    result: { token: string };
  };
  assert(attestationJson.result.token.startsWith('attest_'));

  const featureList = await handleHttpWithState(
    new Request('http://localhost/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 23,
        method: 'experimentalFeature/list',
        params: {},
      }),
    }),
    config,
    state,
  );
  const featureListJson = await featureList.json() as {
    result: { data: Array<{ name: string; stage: string; enabled: boolean }> };
  };
  assertEquals(featureListJson.result.data[0].name, 'reasoning');

  const externalDetect = await handleHttpWithState(
    new Request('http://localhost/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 25,
        method: 'externalAgentConfig/detect',
        params: {},
      }),
    }),
    config,
    state,
  );
  const externalDetectJson = await externalDetect.json() as {
    result: {
      items: Array<{
        itemType: string;
        description: string;
        cwd: string | null;
        details: { path: string; exists: boolean } | null;
      }>;
    };
  };
  assertEquals(externalDetectJson.result.items[0].itemType, 'AGENTS_MD');
  assertEquals(externalDetectJson.result.items[0].details?.exists, true);

  const externalImport = await handleHttpWithState(
    new Request('http://localhost/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 26,
        method: 'externalAgentConfig/import',
        params: {},
      }),
    }),
    config,
    state,
  );
  const externalImportJson = await externalImport.json() as {
    result: { imported: boolean; importedAt: string };
  };
  assertEquals(externalImportJson.result.imported, true);

  const detectionReadDirectory = await handleHttpWithState(
    new Request('http://localhost/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 27,
        method: 'fs/readDirectory',
        params: { path: Deno.cwd() },
      }),
    }),
    config,
    state,
  );
  const detectionReadDirectoryJson = await detectionReadDirectory.json() as {
    result: { entries: Array<{ name: string; isDirectory: boolean; isFile: boolean }> };
  };
  assert(detectionReadDirectoryJson.result.entries.length >= 0);
  assertEquals(
    typeof detectionReadDirectoryJson.result.entries[0]?.name,
    'string',
  );

  const fuzzySearch = await handleHttpWithState(
    new Request('http://localhost/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 28,
        method: 'fuzzyFileSearch',
        params: { sessionId: 'sess-1', query: 'src' },
      }),
    }),
    config,
    state,
  );
  const fuzzySearchJson = await fuzzySearch.json() as {
    result: { files: Array<{ path: string; score: number }>; query: string };
  };
  assertEquals(fuzzySearchJson.result.query, 'src');
  assert(fuzzySearchJson.result.files.length > 0);

  const fuzzySessionStart = await handleHttpWithState(
    new Request('http://localhost/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 280,
        method: 'fuzzyFileSearch/sessionStart',
        params: { sessionId: 'sess-1' },
      }),
    }),
    config,
    state,
  );
  const fuzzySessionStartJson = await fuzzySessionStart.json() as {
    result: { sessionId: string; status: string };
  };
  assertEquals(fuzzySessionStartJson.result.sessionId, 'sess-1');

  const serverRequestResolved = await handleHttpWithState(
    new Request('http://localhost/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 281,
        method: 'serverRequest/resolved',
        params: {
          threadId: 'thr_test',
          requestId: 'req-1',
        },
      }),
    }),
    config,
    state,
  );
  const serverRequestResolvedJson = await serverRequestResolved.json() as {
    result: { threadId: string; requestId: string; resolved: boolean };
  };
  assertEquals(serverRequestResolvedJson.result.requestId, 'req-1');
  assertEquals(serverRequestResolvedJson.result.resolved, true);

  const worldWritableWarningState = await handleHttpWithState(
    new Request('http://localhost/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 282,
        method: 'windows/worldWritableWarning',
        params: {},
      }),
    }),
    config,
    state,
  );
  const worldWritableWarningStateJson = await worldWritableWarningState.json() as {
    result: { warned: boolean };
  };
  assertEquals(worldWritableWarningStateJson.result.warned, true);

  const mcpResourceRead = await handleHttpWithState(
    new Request('http://localhost/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 26,
        method: 'mcpServer/resource/read',
        params: {
          server: 'local',
          uri: 'file:///tmp/demo',
        },
      }),
    }),
    config,
    state,
  );
  const mcpResourceReadJson = await mcpResourceRead.json() as {
    error: { code: number; message: string };
  };
  assertEquals(mcpResourceRead.status, 500);
  assertEquals(mcpResourceReadJson.error.code, -32000);
  assertEquals(mcpResourceReadJson.error.message.includes('MCP server not found'), true);

  const collabList = await handleHttpWithState(
    new Request('http://localhost/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 24,
        method: 'collaborationMode/list',
        params: {},
      }),
    }),
    config,
    state,
  );
  const collabListJson = await collabList.json() as {
    result: {
      data: Array<
        { name: string; model: string | null; mode: string | null; reasoning_effort: string | null }
      >;
    };
  };
  assertEquals(collabListJson.result.data[0].name, 'default');
  assertEquals(collabListJson.result.data[1].name, 'plan');
  assertEquals(collabListJson.result.data[0].mode, 'default');
  assertEquals(collabListJson.result.data[1].mode, 'plan');
  assertEquals(collabListJson.result.data[0].model, null);
  assertEquals(collabListJson.result.data[1].model, null);
  assertEquals(collabListJson.result.data[1].reasoning_effort, 'medium');

  const mcpStatusList = await handleHttpWithState(
    new Request('http://localhost/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 30,
        method: 'mcpServerStatus/list',
        params: {},
      }),
    }),
    config,
    state,
  );
  const mcpStatusListJson = await mcpStatusList.json() as {
    result: { data: Array<{ name: string; authStatus: string }> };
  };
  assertEquals(mcpStatusListJson.result.data[0].authStatus, 'unsupported');

  const mcpResourceList = await handleHttpWithState(
    new Request('http://localhost/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 301,
        method: 'mcpServer/resource/list',
        params: { server: 'local' },
      }),
    }),
    config,
    state,
  );
  const mcpResourceListJson = await mcpResourceList.json() as {
    error: { code: number; message: string };
  };
  assertEquals(mcpResourceList.status, 404);
  assertEquals(mcpResourceListJson.error.code, -32601);

  const mcpResourceTemplates = await handleHttpWithState(
    new Request('http://localhost/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 302,
        method: 'mcpServer/resource/templates',
        params: { server: 'local' },
      }),
    }),
    config,
    state,
  );
  const mcpResourceTemplatesJson = await mcpResourceTemplates.json() as {
    error: { code: number; message: string };
  };
  assertEquals(mcpResourceTemplates.status, 404);
  assertEquals(mcpResourceTemplatesJson.error.code, -32601);

  const voiceList = await handleHttpWithState(
    new Request('http://localhost/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 31,
        method: 'thread/realtime/listVoices',
        params: {},
      }),
    }),
    config,
    state,
  );
  const voiceListJson = await voiceList.json() as {
    result: { voices: Array<{ id: string; name: string }> };
  };
  assertEquals(voiceListJson.result.voices[0].id, 'alloy');

  const mcpToolCall = await handleHttpWithState(
    new Request('http://localhost/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 32,
        method: 'mcpServer/tool/call',
        params: {
          threadId: 'thr_test',
          server: 'local',
          tool: 'demo',
        },
      }),
    }),
    config,
    state,
  );
  const mcpToolCallJson = await mcpToolCall.json() as {
    error: { code: number; message: string };
  };
  assertEquals(mcpToolCall.status, 500);
  assertEquals(mcpToolCallJson.error.code, -32000);
  assertEquals(mcpToolCallJson.error.message.includes('MCP server not found'), true);
  state.drainNotifications();

  const requestUserInput = await handleHttpWithState(
    new Request('http://localhost/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 33,
        method: 'item/tool/requestUserInput',
        params: {
          threadId: 'thr_test',
          turnId: 'turn_test',
          itemId: 'item_test',
        },
      }),
    }),
    config,
    state,
  );
  const requestUserInputJson = await requestUserInput.json() as {
    result: { answers: { default: { answers: string[] } } };
  };
  assertEquals(requestUserInputJson.result.answers.default.answers[0], 'continue');
  const requestUserInputNotifications = state.drainNotifications();
  assertEquals(
    requestUserInputNotifications.some((entry) => entry.method === 'item/tool/requestUserInput'),
    true,
  );
  assertEquals(
    requestUserInputNotifications.some((entry) => entry.method === 'serverRequest/resolved'),
    false,
  );

  const elicitationAfterRequest = await handleHttpWithState(
    new Request('http://localhost/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 341,
        method: 'thread/decrement_elicitation',
        params: { threadId: 'thr_test' },
      }),
    }),
    config,
    state,
  );
  const elicitationAfterRequestJson = await elicitationAfterRequest.json() as {
    result: { count: number; paused: boolean };
  };
  assertEquals(elicitationAfterRequestJson.result.count > 0, true);
  assertEquals(elicitationAfterRequestJson.result.paused, true);

  const elicitationRequest = await handleHttpWithState(
    new Request('http://localhost/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 34,
        method: 'mcpServer/elicitation/request',
        params: {
          threadId: 'thr_test',
          turnId: 'turn_test',
          serverName: 'local',
        },
      }),
    }),
    config,
    state,
  );
  const elicitationRequestJson = await elicitationRequest.json() as {
    result: { action: string; content: null; meta: null };
  };
  assertEquals(elicitationRequestJson.result.action, 'accept');
  const elicitationRequestNotifications = state.drainNotifications();
  assertEquals(
    elicitationRequestNotifications.some((entry) =>
      entry.method === 'mcpServer/elicitation/request'
    ),
    true,
  );
  assertEquals(
    elicitationRequestNotifications.some((entry) => entry.method === 'serverRequest/resolved'),
    false,
  );

  const elicitationAfterMcp = await handleHttpWithState(
    new Request('http://localhost/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 35,
        method: 'thread/decrement_elicitation',
        params: { threadId: 'thr_test' },
      }),
    }),
    config,
    state,
  );
  const elicitationAfterMcpJson = await elicitationAfterMcp.json() as {
    result: { count: number; paused: boolean };
  };
  assertEquals(elicitationAfterMcpJson.result.count > 0, true);
  assertEquals(elicitationAfterMcpJson.result.paused, true);

  const appList = await handleHttpWithState(
    new Request('http://localhost/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 323,
        method: 'app/list',
        params: {},
      }),
    }),
    config,
    state,
  );
  const appListJson = await appList.json() as {
    result: { data: unknown[]; nextCursor: null };
  };
  assertEquals(Array.isArray(appListJson.result.data), true);
  assertEquals(appListJson.result.nextCursor, null);

  const realtimeAppendAudio = await handleHttpWithState(
    new Request('http://localhost/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 324,
        method: 'thread/realtime/appendAudio',
        params: { threadId: 'thr_test', audio: 'AQID' },
      }),
    }),
    config,
    state,
  );
  const realtimeAppendAudioJson = await realtimeAppendAudio.json() as {
    result: { appended: boolean; threadId: string; kind: string };
  };
  assertEquals(realtimeAppendAudioJson.result.appended, true);
  assertEquals(realtimeAppendAudioJson.result.kind, 'audio');

  const realtimeAppendText = await handleHttpWithState(
    new Request('http://localhost/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 325,
        method: 'thread/realtime/appendText',
        params: { threadId: 'thr_test', text: 'hello' },
      }),
    }),
    config,
    state,
  );
  const realtimeAppendTextJson = await realtimeAppendText.json() as {
    result: { appended: boolean; threadId: string; kind: string };
  };
  assertEquals(realtimeAppendTextJson.result.appended, true);
  assertEquals(realtimeAppendTextJson.result.kind, 'text');

  const realtimeStop = await handleHttpWithState(
    new Request('http://localhost/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 326,
        method: 'thread/realtime/stop',
        params: { threadId: 'thr_test' },
      }),
    }),
    config,
    state,
  );
  const realtimeStopJson = await realtimeStop.json() as {
    result: { stopped: boolean; threadId: string };
  };
  assertEquals(realtimeStopJson.result.stopped, true);

  const pluginUninstall = await handleHttpWithState(
    new Request('http://localhost/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 321,
        method: 'plugin/uninstall',
        params: { pluginName: 'codex-test-plugin' },
      }),
    }),
    config,
    state,
  );
  const pluginUninstallJson = await pluginUninstall.json() as {
    result: { uninstalled: boolean; pluginName: string };
  };
  assertEquals(pluginUninstallJson.result.uninstalled, true);
  assertEquals(pluginUninstallJson.result.pluginName, 'codex-test-plugin');

  const configValueWrite = await handleHttpWithState(
    new Request('http://localhost/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 32,
        method: 'config/value/write',
        params: {
          keyPath: 'defaultModel',
          value: config.defaultModel,
          mergeStrategy: 'replace',
        },
      }),
    }),
    config,
    state,
  );
  const configValueWriteJson = await configValueWrite.json() as {
    result: { status: string; version: string };
  };
  assertEquals(configValueWriteJson.result.status, 'ok');

  const configReload = await handleHttpWithState(
    new Request('http://localhost/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 33,
        method: 'config/mcpServer/reload',
        params: { name: 'local' },
      }),
    }),
    config,
    state,
  );
  const configReloadJson = await configReload.json() as {
    result: { name: string; reloaded: boolean };
  };
  assertEquals(configReloadJson.result.name, 'local');
  assertEquals(configReloadJson.result.reloaded, true);

  const configBatchWrite = await handleHttpWithState(
    new Request('http://localhost/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 34,
        method: 'config/batchWrite',
        params: {
          edits: [],
          reloadUserConfig: false,
        },
      }),
    }),
    config,
    state,
  );
  const configBatchWriteJson = await configBatchWrite.json() as {
    result: { status: string; version: string };
  };
  assertEquals(configBatchWriteJson.result.version, '1');

  const shellCommand = await handleHttpWithState(
    new Request('http://localhost/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 35,
        method: 'thread/shellCommand',
        params: { threadId: 'thr_test', command: 'echo hi' },
      }),
    }),
    config,
    state,
  );
  assertEquals(shellCommand.status, 200);

  const guardianApproved = await handleHttpWithState(
    new Request('http://localhost/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 36,
        method: 'thread/approveGuardianDeniedAction',
        params: { threadId: 'thr_test', event: { type: 'test' } },
      }),
    }),
    config,
    state,
  );
  assertEquals(guardianApproved.status, 200);

  const memoryResetA = await handleHttpWithState(
    new Request('http://localhost/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 37,
        method: 'memory/reset',
        params: {},
      }),
    }),
    config,
    state,
  );
  const memoryResetJsonA = await memoryResetA.json() as {
    result: { reset: boolean; threadId: string };
  };
  assertEquals(memoryResetJsonA.result.reset, true);

  const turnStart = await handleHttpWithState(
    new Request('http://localhost/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 27,
        method: 'turn/start',
        params: { threadId: 'thr_test', input: [] },
      }),
    }),
    config,
    state,
  );
  const turnStartJson = await turnStart.json() as {
    result: { turn: { id: string; status: 'inProgress' } };
  };
  assertEquals(typeof turnStartJson.result.turn.id, 'string');
  assertEquals(turnStartJson.result.turn.status, 'inProgress');

  const turnStartPlan = await handleHttpWithState(
    new Request('http://localhost/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 271,
        method: 'turn/start',
        params: {
          threadId: 'thr_test',
          input: [],
          collaborationMode: {
            mode: 'plan',
            settings: { developerInstructions: null },
          },
        },
      }),
    }),
    config,
    state,
  );
  const turnStartPlanJson = await turnStartPlan.json() as {
    result: { turn: { id: string; collaborationModeKind?: string | null; status: 'inProgress' } };
  };
  assertEquals(typeof turnStartPlanJson.result.turn.id, 'string');
  assertEquals(turnStartPlanJson.result.turn.status, 'inProgress');
  assertEquals(turnStartPlanJson.result.turn.collaborationModeKind, 'plan');
  const turnStartPlanNotifications = state.drainNotifications();
  const startedTurnNotification = turnStartPlanNotifications.find((entry) =>
    entry.method === 'turn/started' &&
    (entry.params as Record<string, unknown>)?.threadId === 'thr_test' &&
    ((entry.params as Record<string, unknown>).turn as Record<string, unknown>)?.id ===
      turnStartPlanJson.result.turn.id
  );
  assert(startedTurnNotification);
  assertEquals(
    turnStartPlanNotifications.some((entry) =>
      entry.method === 'turn/completed' &&
      (entry.params as Record<string, unknown>)?.threadId === 'thr_test' &&
      ((entry.params as Record<string, unknown>).turn as Record<string, unknown>)?.id ===
        turnStartPlanJson.result.turn.id
    ),
    false,
  );
  assertEquals(
    turnStartPlanNotifications.some((entry) =>
      entry.method === 'item/completed' &&
      (entry.params as Record<string, unknown>)?.threadId === 'thr_test' &&
      (entry.params as Record<string, unknown>)?.turnId === turnStartPlanJson.result.turn.id
    ),
    false,
  );
  assertEquals(
    ((startedTurnNotification!.params as Record<string, unknown>).turn as Record<string, unknown>)
      .collaborationModeKind,
    'plan',
  );

  const turnSteer = await handleHttpWithState(
    new Request('http://localhost/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 28,
        method: 'turn/steer',
        params: { threadId: 'thr_test', expectedTurnId: turnStartJson.result.turn.id, input: [] },
      }),
    }),
    config,
    state,
  );
  const turnSteerJson = await turnSteer.json() as { result: { turnId: string } };
  assertEquals(turnSteerJson.result.turnId, turnStartJson.result.turn.id);

  const resume = await handleHttpWithState(
    new Request('http://localhost/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 29,
        method: 'thread/resume',
        params: { threadId: 'thr_test' },
      }),
    }),
    config,
    state,
  );
  const resumeJson = await resume.json() as {
    result: { thread: { id: string; turns: unknown[] } };
  };
  assertEquals(resumeJson.result.thread.id, 'thr_test');
  assertEquals(resumeJson.result.thread.turns.length >= 1, true);

  const readWithTurnsA = await handleHttpWithState(
    new Request('http://localhost/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 27,
        method: 'thread/read',
        params: { threadId: 'thr_test', includeTurns: true },
      }),
    }),
    config,
    state,
  );
  const readWithTurnsJsonA = await readWithTurnsA.json() as {
    result: { thread: { turns: unknown[] } };
  };
  assertEquals(readWithTurnsJsonA.result.thread.turns.length >= 1, true);

  const turnInterrupt = await handleHttpWithState(
    new Request('http://localhost/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 24,
        method: 'turn/interrupt',
        params: { threadId: 'thr_test', turnId: turnStartJson.result.turn.id },
      }),
    }),
    config,
    state,
  );
  const turnInterruptJson = await turnInterrupt.json() as {
    result: { interrupted: boolean; threadId: string; turnId: string };
  };
  assertEquals(turnInterruptJson.result.interrupted, true);

  const memoryResetB = await handleHttpWithState(
    new Request('http://localhost/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 25,
        method: 'memory/reset',
        params: null,
      }),
    }),
    config,
    state,
  );
  const memoryResetJsonB = await memoryResetB.json() as {
    result: { reset: boolean; threadId: string };
  };
  assertEquals(memoryResetJsonB.result.reset, true);

  const clear = await handleHttpWithState(
    new Request('http://localhost/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 3,
        method: 'thread/goal/clear',
        params: { threadId: 'thr_test' },
      }),
    }),
    config,
    state,
  );
  const clearJson = await clear.json() as { result: { cleared: boolean } };
  assertEquals(clearJson.result.cleared, true);

  const compact = await handleHttpWithState(
    new Request('http://localhost/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 16,
        method: 'thread/compact/start',
        params: { threadId: 'thr_test' },
      }),
    }),
    config,
    state,
  );
  assertEquals(compact.status, 200);
  const compactJson = await compact.json() as { result: { compacted: boolean; threadId: string } };
  assertEquals(compactJson.result.compacted, true);

  const shell = await handleHttpWithState(
    new Request('http://localhost/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 17,
        method: 'thread/shellCommand',
        params: { threadId: 'thr_test', command: 'echo hi' },
      }),
    }),
    config,
    state,
  );
  assertEquals(shell.status, 200);
  const shellJson = await shell.json() as {
    result: { queued: boolean; threadId: string; command: string };
  };
  assertEquals(shellJson.result.queued, true);

  const environmentAdd = await handleHttpWithState(
    new Request('http://localhost/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 322,
        method: 'environment/add',
        params: { name: 'local', path: Deno.cwd() },
      }),
    }),
    config,
    state,
  );
  const environmentAddJson = await environmentAdd.json() as {
    result: { added: boolean; name: string; path: string | null };
  };
  assertEquals(environmentAddJson.result.added, true);
  assertEquals(environmentAddJson.result.name, 'local');

  const hooksList = await handleHttpWithState(
    new Request('http://localhost/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 200,
        method: 'hooks/list',
        params: {},
      }),
    }),
    config,
    state,
  );
  const hooksListJson = await hooksList.json() as {
    result: {
      data: Array<{ cwd: string; errors: unknown[]; hooks: unknown[]; warnings: unknown[] }>;
    };
  };
  assertEquals(hooksListJson.result.data[0].cwd, Deno.cwd());
  assertEquals(hooksListJson.result.data[0].errors.length, 0);
  assertEquals(hooksListJson.result.data[0].hooks.length, 0);
  assertEquals(hooksListJson.result.data[0].warnings.length, 0);

  const pluginRead = await handleHttpWithState(
    new Request('http://localhost/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 201,
        method: 'plugin/read',
        params: { pluginName: 'codex-test-plugin' },
      }),
    }),
    config,
    state,
  );
  const pluginReadJson = await pluginRead.json() as {
    result: {
      plugin: {
        marketplaceName: string;
        summary: { name: string };
        apps: unknown[];
        hooks: unknown[];
        skills: unknown[];
      };
    };
  };
  assertEquals(pluginReadJson.result.plugin.marketplaceName, 'local');
  assertEquals(pluginReadJson.result.plugin.summary.name, 'codex-test-plugin');
  assertEquals(Array.isArray(pluginReadJson.result.plugin.skills), true);

  const pluginSkillRead = await handleHttpWithState(
    new Request('http://localhost/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 202,
        method: 'plugin/skill/read',
        params: { pluginName: 'codex-test-plugin', skillName: 'demo' },
      }),
    }),
    config,
    state,
  );
  const pluginSkillReadJson = await pluginSkillRead.json() as {
    result: { contents: unknown[] };
  };
  assertEquals(Array.isArray(pluginSkillReadJson.result.contents), true);

  const shareSave = await handleHttpWithState(
    new Request('http://localhost/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 203,
        method: 'plugin/share/save',
        params: { pluginName: 'codex-test-plugin' },
      }),
    }),
    config,
    state,
  );
  const shareSaveJson = await shareSave.json() as {
    result: { remotePluginId: string; shareUrl: string; discoverability: string };
  };
  assertEquals(shareSaveJson.result.discoverability, 'UNLISTED');

  const shareUpdateTargets = await handleHttpWithState(
    new Request('http://localhost/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 204,
        method: 'plugin/share/updateTargets',
        params: { principals: ['user:alice'] },
      }),
    }),
    config,
    state,
  );
  const shareUpdateTargetsJson = await shareUpdateTargets.json() as {
    result: { discoverability: string; principals: string[] };
  };
  assertEquals(shareUpdateTargetsJson.result.principals[0], 'user:alice');

  const shareDelete = await handleHttpWithState(
    new Request('http://localhost/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 205,
        method: 'plugin/share/delete',
        params: { remotePluginId: 'remote_1' },
      }),
    }),
    config,
    state,
  );
  const shareDeleteJson = await shareDelete.json() as {
    result: { deleted: boolean; remotePluginId: string | null };
  };
  assertEquals(shareDeleteJson.result.deleted, true);
  assertEquals(shareDeleteJson.result.remotePluginId, 'remote_1');

  const shareList = await handleHttpWithState(
    new Request('http://localhost/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2051,
        method: 'plugin/share/list',
        params: {},
      }),
    }),
    config,
    state,
  );
  const shareListJson = await shareList.json() as {
    result: { data: unknown[]; nextCursor: null };
  };
  assertEquals(Array.isArray(shareListJson.result.data), true);
  assertEquals(shareListJson.result.nextCursor, null);

  const sendCredits = await handleHttpWithState(
    new Request('http://localhost/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 206,
        method: 'account/sendAddCreditsNudgeEmail',
        params: { email: 'alice@example.com' },
      }),
    }),
    config,
    state,
  );
  const sendCreditsJson = await sendCredits.json() as {
    result: { status: string; email: string | null };
  };
  assertEquals(sendCreditsJson.result.status, 'sent');
  assertEquals(sendCreditsJson.result.email, 'alice@example.com');

  const authRefresh = await handleHttpWithState(
    new Request('http://localhost/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 207,
        method: 'account/chatgptAuthTokens/refresh',
        params: {},
      }),
    }),
    config,
    state,
  );
  const authRefreshJson = await authRefresh.json() as {
    result: { refreshed: boolean; refreshedAt: string };
  };
  assertEquals(authRefreshJson.result.refreshed, true);

  const accountRead = await handleHttpWithState(
    new Request('http://localhost/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2075,
        method: 'account/read',
        params: {},
      }),
    }),
    config,
    state,
  );
  const accountReadJson = await accountRead.json() as {
    result: {
      account: { type: string; email: string; planType: string };
      requiresOpenaiAuth: boolean;
    };
  };
  assertEquals(accountReadJson.result.account.type, 'chatgpt');
  assertEquals(accountReadJson.result.account.planType, 'plus');
  assertEquals(accountReadJson.result.requiresOpenaiAuth, false);

  const rateLimitsRead = await handleHttpWithState(
    new Request('http://localhost/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2076,
        method: 'account/rateLimits/read',
        params: {},
      }),
    }),
    config,
    state,
  );
  const rateLimitsReadJson = await rateLimitsRead.json() as {
    result: { rateLimits: { planType: string } };
  };
  assertEquals(rateLimitsReadJson.result.rateLimits.planType, 'plus');

  const loginStart = await handleHttpWithState(
    new Request('http://localhost/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2070,
        method: 'account/login/start',
        params: { type: 'apiKey' },
      }),
    }),
    config,
    state,
  );
  const loginStartJson = await loginStart.json() as {
    result: { type: string; started: boolean };
  };
  assertEquals(loginStartJson.result.started, true);
  assertEquals(loginStartJson.result.type, 'apiKey');

  const loginCancel = await handleHttpWithState(
    new Request('http://localhost/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2071,
        method: 'account/login/cancel',
        params: {},
      }),
    }),
    config,
    state,
  );
  const loginCancelJson = await loginCancel.json() as {
    result: { canceled: boolean; loggedOut: boolean };
  };
  assertEquals(loginCancelJson.result.canceled, true);
  assertEquals(loginCancelJson.result.loggedOut, false);

  const logout = await handleHttpWithState(
    new Request('http://localhost/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2072,
        method: 'account/logout',
        params: {},
      }),
    }),
    config,
    state,
  );
  const logoutJson = await logout.json() as {
    result: { canceled: boolean; loggedOut: boolean };
  };
  assertEquals(logoutJson.result.canceled, false);
  assertEquals(logoutJson.result.loggedOut, true);

  const guardian = await handleHttpWithState(
    new Request('http://localhost/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 18,
        method: 'thread/approveGuardianDeniedAction',
        params: { threadId: 'thr_test', event: { type: 'x' } },
      }),
    }),
    config,
    state,
  );
  assertEquals(guardian.status, 200);

  const clean = await handleHttpWithState(
    new Request('http://localhost/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 19,
        method: 'thread/backgroundTerminals/clean',
        params: { threadId: 'thr_test' },
      }),
    }),
    config,
    state,
  );
  assertEquals(clean.status, 200);
  const cleanJson = await clean.json() as { result: { cleaned: boolean; threadId: string } };
  assertEquals(cleanJson.result.cleaned, true);
  assertEquals(cleanJson.result.threadId, 'thr_test');

  const read = await handleHttpWithState(
    new Request('http://localhost/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 4,
        method: 'thread/read',
        params: { threadId: 'thr_test' },
      }),
    }),
    config,
    state,
  );
  const readJson = await read.json() as { result: { thread: { turns: unknown[] } } };
  assertEquals(readJson.result.thread.turns.length, 0);

  const readWithTurnsB = await handleHttpWithState(
    new Request('http://localhost/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 5,
        method: 'thread/read',
        params: { threadId: 'thr_test', includeTurns: true },
      }),
    }),
    config,
    state,
  );
  const readWithTurnsJsonB = await readWithTurnsB.json() as {
    result: { thread: { turns: unknown[] } };
  };
  assertEquals(readWithTurnsJsonB.result.thread.turns.length >= 0, true);

  const turnsList = await handleHttpWithState(
    new Request('http://localhost/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 11,
        method: 'thread/turns/list',
        params: { threadId: 'thr_test' },
      }),
    }),
    config,
    state,
  );
  const turnsListJson = await turnsList.json() as { result: { data: unknown[] } };
  assertEquals(Array.isArray(turnsListJson.result.data), true);

  const turnsItemsList = await handleHttpWithState(
    new Request('http://localhost/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 20,
        method: 'thread/turns/items/list',
        params: { threadId: 'thr_test', turnId: 'missing' },
      }),
    }),
    config,
    state,
  );
  const turnsItemsListJson = await turnsItemsList.json() as { result: { data: unknown[] } };
  assertEquals(Array.isArray(turnsItemsListJson.result.data), true);

  const memoryMode = await handleHttpWithState(
    new Request('http://localhost/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 21,
        method: 'thread/memoryMode/set',
        params: { threadId: 'thr_test' },
      }),
    }),
    config,
    state,
  );
  assertEquals(memoryMode.status, 200);
  const memoryModeJson = await memoryMode.json() as {
    result: { threadId: string; memoryMode: string };
  };
  assertEquals(memoryModeJson.result.threadId, 'thr_test');
  assertEquals(memoryModeJson.result.memoryMode, 'default');

  const worldWritableWarning = await handleHttpWithState(
    new Request('http://localhost/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2080,
        method: 'windows/worldWritableWarning',
        params: {},
      }),
    }),
    config,
    state,
  );
  const worldWritableWarningJson = await worldWritableWarning.json() as {
    result: { warned: boolean };
  };
  assertEquals(worldWritableWarningJson.result.warned, true);

  const sandboxStart = await handleHttpWithState(
    new Request('http://localhost/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 208,
        method: 'windowsSandbox/setupStart',
        params: { mode: 'unelevated' },
      }),
    }),
    config,
    state,
  );
  const sandboxStartJson = await sandboxStart.json() as {
    result: { started: boolean; mode: string };
  };
  assertEquals(sandboxStartJson.result.started, true);
  assertEquals(sandboxStartJson.result.mode, 'unelevated');

  const tmpBase = await Deno.makeTempDir();
  const filePath = `${tmpBase}/file.txt`;
  const dirPath = `${tmpBase}/dir`;

  const writeFile = await handleHttpWithState(
    new Request('http://localhost/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 30,
        method: 'fs/writeFile',
        params: { path: filePath, dataBase64: btoa('hello') },
      }),
    }),
    config,
    state,
  );
  assertEquals(writeFile.status, 200);

  const readFile = await handleHttpWithState(
    new Request('http://localhost/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 31,
        method: 'fs/readFile',
        params: { path: filePath },
      }),
    }),
    config,
    state,
  );
  const readFileJson = await readFile.json() as { result: { dataBase64: string } };
  assertEquals(atob(readFileJson.result.dataBase64), 'hello');

  const createDirectory = await handleHttpWithState(
    new Request('http://localhost/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 32,
        method: 'fs/createDirectory',
        params: { path: dirPath, recursive: true },
      }),
    }),
    config,
    state,
  );
  assertEquals(createDirectory.status, 200);

  const getMetadata = await handleHttpWithState(
    new Request('http://localhost/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 33,
        method: 'fs/getMetadata',
        params: { path: filePath },
      }),
    }),
    config,
    state,
  );
  const getMetadataJson = await getMetadata.json() as { result: { isFile: boolean } };
  assertEquals(getMetadataJson.result.isFile, true);

  const stateReadDirectory = await handleHttpWithState(
    new Request('http://localhost/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 34,
        method: 'fs/readDirectory',
        params: { path: tmpBase },
      }),
    }),
    config,
    state,
  );
  const stateReadDirectoryJson = await stateReadDirectory.json() as {
    result: { entries: unknown[] };
  };
  assertEquals(Array.isArray(stateReadDirectoryJson.result.entries), true);

  const watch = await handleHttpWithState(
    new Request('http://localhost/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 35,
        method: 'fs/watch',
        params: { path: filePath, watchId: 'watch-1' },
      }),
    }),
    config,
    state,
  );
  const watchJson = await watch.json() as { result: { path: string } };
  assertEquals(watchJson.result.path, filePath);

  const unwatch = await handleHttpWithState(
    new Request('http://localhost/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 36,
        method: 'fs/unwatch',
        params: { watchId: 'watch-1' },
      }),
    }),
    config,
    state,
  );
  assertEquals(unwatch.status, 200);
});

Deno.test('handleHttpWithState executes direct multi-agent tool calls', async () => {
  const state = new HubState();

  await handleHttpWithState(
    new Request('http://localhost/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'thread/start',
        params: { threadId: 'thr_agents', model: 'gpt-4.1' },
      }),
    }),
    config,
    state,
  );

  const spawn = await handleHttpWithState(
    new Request('http://localhost/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'item/tool/call',
        params: {
          threadId: 'thr_agents',
          turnId: 'turn_agents',
          callId: 'call_spawn',
          namespace: null,
          tool: 'spawn_agent',
          arguments: { task_name: 'worker', message: 'inspect the repo' },
        },
      }),
    }),
    config,
    state,
  );
  const spawnJson = await spawn.json() as {
    result: { success: boolean; contentItems: Array<{ type: string; text: string }> };
  };
  assertEquals(spawnJson.result.success, true);
  assertEquals(JSON.parse(spawnJson.result.contentItems[0].text), {
    task_name: '/worker',
    nickname: null,
  });

  const subagents = state.listThreads({ parentThreadId: 'thr_agents' });
  assertEquals(subagents.length, 1);
  assertEquals(subagents[0].parentThreadId, 'thr_agents');

  const namespacedSpawn = await handleHttpWithState(
    new Request('http://localhost/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 21,
        method: 'item/tool/call',
        params: {
          threadId: 'thr_agents',
          turnId: 'turn_agents',
          callId: 'call_spawn_v1',
          namespace: 'multi_agent_v1',
          tool: 'spawn_agent',
          arguments: { task_name: 'reviewer', message: 'review only' },
        },
      }),
    }),
    config,
    state,
  );
  const namespacedSpawnJson = await namespacedSpawn.json() as {
    result: { contentItems: Array<{ text: string }> };
  };
  const namespacedSpawnOutput = JSON.parse(namespacedSpawnJson.result.contentItems[0].text);
  assertEquals(typeof namespacedSpawnOutput.agent_id, 'string');
  assertEquals(namespacedSpawnOutput.nickname, null);

  const list = await handleHttpWithState(
    new Request('http://localhost/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 3,
        method: 'item/tool/call',
        params: {
          threadId: 'thr_agents',
          turnId: 'turn_agents',
          callId: 'call_list',
          namespace: null,
          tool: 'list_agents',
          arguments: {},
        },
      }),
    }),
    config,
    state,
  );
  const listJson = await list.json() as {
    result: { contentItems: Array<{ text: string }> };
  };
  assertEquals(JSON.parse(listJson.result.contentItems[0].text), {
    agents: [
      {
        agent_name: '/worker',
        agent_status: 'running',
        last_task_message: 'inspect the repo',
      },
      {
        agent_name: '/reviewer',
        agent_status: 'running',
        last_task_message: 'review only',
      },
    ],
  });

  const v1Wait = await handleHttpWithState(
    new Request('http://localhost/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 31,
        method: 'item/tool/call',
        params: {
          threadId: 'thr_agents',
          turnId: 'turn_agents',
          callId: 'call_wait_v1_initial',
          namespace: 'multi_agent_v1',
          tool: 'wait_agent',
          arguments: { timeout_ms: 1 },
        },
      }),
    }),
    config,
    state,
  );
  const v1WaitJson = await v1Wait.json() as { result: { contentItems: Array<{ text: string }> } };
  assertEquals(JSON.parse(v1WaitJson.result.contentItems[0].text), {
    status: {},
    timed_out: true,
  });

  state.completeAgent(namespacedSpawnOutput.agent_id, 'review complete');
  const v1WaitCompleted = await handleHttpWithState(
    new Request('http://localhost/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 32,
        method: 'item/tool/call',
        params: {
          threadId: 'thr_agents',
          turnId: 'turn_agents',
          callId: 'call_wait_v1_completed',
          namespace: 'multi_agent_v1',
          tool: 'wait_agent',
          arguments: { timeout_ms: 1 },
        },
      }),
    }),
    config,
    state,
  );
  const v1WaitCompletedJson = await v1WaitCompleted.json() as {
    result: { contentItems: Array<{ text: string }> };
  };
  assertEquals(JSON.parse(v1WaitCompletedJson.result.contentItems[0].text), {
    status: { [namespacedSpawnOutput.agent_id]: { completed: 'review complete' } },
    timed_out: false,
  });

  const close = await handleHttpWithState(
    new Request('http://localhost/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 33,
        method: 'item/tool/call',
        params: {
          threadId: 'thr_agents',
          turnId: 'turn_agents',
          callId: 'call_close_v1',
          namespace: 'multi_agent_v1',
          tool: 'close_agent',
          arguments: { target: namespacedSpawnOutput.agent_id },
        },
      }),
    }),
    config,
    state,
  );
  const closeJson = await close.json() as { result: { contentItems: Array<{ text: string }> } };
  assertEquals(JSON.parse(closeJson.result.contentItems[0].text), {
    previous_status: { completed: 'review complete' },
  });

  const resume = await handleHttpWithState(
    new Request('http://localhost/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 34,
        method: 'item/tool/call',
        params: {
          threadId: 'thr_agents',
          turnId: 'turn_agents',
          callId: 'call_resume_v1',
          namespace: 'multi_agent_v1',
          tool: 'resume_agent',
          arguments: { id: namespacedSpawnOutput.agent_id },
        },
      }),
    }),
    config,
    state,
  );
  const resumeJson = await resume.json() as { result: { contentItems: Array<{ text: string }> } };
  assertEquals(JSON.parse(resumeJson.result.contentItems[0].text), { status: 'shutdown' });

  const nestedSpawn = await handleHttpWithState(
    new Request('http://localhost/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 35,
        method: 'item/tool/call',
        params: {
          threadId: subagents[0].id,
          turnId: 'turn_nested_agents',
          callId: 'call_spawn_nested',
          namespace: 'collaboration',
          tool: 'spawn_agent',
          arguments: { task_name: 'helper', message: 'help worker' },
        },
      }),
    }),
    config,
    state,
  );
  const nestedSpawnJson = await nestedSpawn.json() as {
    result: { contentItems: Array<{ text: string }> };
  };
  assertEquals(JSON.parse(nestedSpawnJson.result.contentItems[0].text), {
    task_name: '/worker/helper',
    nickname: null,
  });

  const rootTreeList = await handleHttpWithState(
    new Request('http://localhost/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 36,
        method: 'item/tool/call',
        params: {
          threadId: 'thr_agents',
          turnId: 'turn_agents',
          callId: 'call_list_root_tree',
          namespace: 'collaboration',
          tool: 'list_agents',
          arguments: {},
        },
      }),
    }),
    config,
    state,
  );
  const rootTreeListJson = await rootTreeList.json() as {
    result: { contentItems: Array<{ text: string }> };
  };
  const rootTreeAgents = JSON.parse(rootTreeListJson.result.contentItems[0].text).agents as Array<{
    agent_name: string;
  }>;
  assertEquals(rootTreeAgents.map((agent) => agent.agent_name), [
    '/worker',
    '/reviewer',
    '/worker/helper',
  ]);

  const nestedSend = await handleHttpWithState(
    new Request('http://localhost/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 37,
        method: 'item/tool/call',
        params: {
          threadId: subagents[0].id,
          turnId: 'turn_nested_agents',
          callId: 'call_send_nested',
          namespace: 'collaboration',
          tool: 'send_message',
          arguments: { target: 'helper', message: 'relative hello' },
        },
      }),
    }),
    config,
    state,
  );
  const nestedSendJson = await nestedSend.json() as {
    result: { contentItems: Array<{ text: string }> };
  };
  assertEquals(
    typeof JSON.parse(nestedSendJson.result.contentItems[0].text).submission_id,
    'string',
  );

  const send = await handleHttpWithState(
    new Request('http://localhost/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 4,
        method: 'item/tool/call',
        params: {
          threadId: 'thr_agents',
          turnId: 'turn_agents',
          callId: 'call_send',
          namespace: null,
          tool: 'send_message',
          arguments: { target: '/worker', message: 'continue' },
        },
      }),
    }),
    config,
    state,
  );
  const sendJson = await send.json() as { result: { contentItems: Array<{ text: string }> } };
  assertEquals(typeof JSON.parse(sendJson.result.contentItems[0].text).submission_id, 'string');
  assertEquals(
    state.getTurns(subagents[0].id).some((turn) => JSON.stringify(turn.items).includes('continue')),
    true,
  );

  const wait = await handleHttpWithState(
    new Request('http://localhost/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 5,
        method: 'item/tool/call',
        params: {
          threadId: 'thr_agents',
          turnId: 'turn_agents',
          callId: 'call_wait',
          namespace: null,
          tool: 'wait_agent',
          arguments: { timeout_ms: 1 },
        },
      }),
    }),
    config,
    state,
  );
  const waitJson = await wait.json() as { result: { contentItems: Array<{ text: string }> } };
  assertEquals(JSON.parse(waitJson.result.contentItems[0].text), {
    message: 'Wait timed out.',
    timed_out: true,
  });

  const interrupt = await handleHttpWithState(
    new Request('http://localhost/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 6,
        method: 'item/tool/call',
        params: {
          threadId: 'thr_agents',
          turnId: 'turn_agents',
          callId: 'call_interrupt',
          namespace: null,
          tool: 'interrupt_agent',
          arguments: { target: '/worker' },
        },
      }),
    }),
    config,
    state,
  );
  const interruptJson = await interrupt.json() as {
    result: { contentItems: Array<{ text: string }> };
  };
  assertEquals(JSON.parse(interruptJson.result.contentItems[0].text), {
    previous_status: 'running',
  });
});

Deno.test('handleHttpWithState runs spawned agents against upstream in background', async () => {
  const state = new HubState();
  const server = Deno.serve(
    { hostname: '127.0.0.1', port: 0, onListen: () => {} },
    () =>
      new Response(
        JSON.stringify({ choices: [{ message: { content: 'child result' } }] }),
        { headers: { 'content-type': 'application/json' } },
      ),
  );
  const addr = server.addr as Deno.NetAddr;
  const upstreamConfig: ProxyConfig = {
    ...config,
    chatBaseUrl: `http://${addr.hostname}:${addr.port}/v1`,
    responsesBaseUrl: null,
    defaultApiKey: 'test-key',
    forceChatCompletions: true,
  };

  try {
    await handleHttpWithState(
      new Request('http://localhost/rpc', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'thread/start',
          params: { threadId: 'thr_background_agent', model: 'gpt-4.1' },
        }),
      }),
      upstreamConfig,
      state,
    );

    await handleHttpWithState(
      new Request('http://localhost/rpc', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          method: 'item/tool/call',
          params: {
            threadId: 'thr_background_agent',
            turnId: 'turn_background_agent',
            callId: 'call_spawn_background',
            namespace: null,
            tool: 'spawn_agent',
            arguments: { task_name: 'worker', message: 'do work' },
          },
        }),
      }),
      upstreamConfig,
      state,
    );

    let waitOutput: { message: string; timed_out: boolean } | null = null;
    for (let attempt = 0; attempt < 20; attempt++) {
      const wait = await handleHttpWithState(
        new Request('http://localhost/rpc', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 3 + attempt,
            method: 'item/tool/call',
            params: {
              threadId: 'thr_background_agent',
              turnId: 'turn_background_agent',
              callId: 'call_wait_background',
              namespace: null,
              tool: 'wait_agent',
              arguments: { timeout_ms: 1 },
            },
          }),
        }),
        upstreamConfig,
        state,
      );
      const waitJson = await wait.json() as { result: { contentItems: Array<{ text: string }> } };
      const parsedWaitOutput = JSON.parse(waitJson.result.contentItems[0].text) as {
        message: string;
        timed_out: boolean;
      };
      waitOutput = parsedWaitOutput;
      if (!parsedWaitOutput.timed_out) break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }

    assertEquals(waitOutput, { message: 'Agent /worker completed.', timed_out: false });
    const child = state.listThreads({ parentThreadId: 'thr_background_agent' })[0];
    const childTurns = state.getTurns(child.id);
    assertEquals(
      childTurns.some((turn) => JSON.stringify(turn.items).includes('child result')),
      true,
    );
  } finally {
    await server.shutdown();
  }
});

Deno.test('handleHttpWithState runs nested spawned agents against upstream in background', async () => {
  const state = new HubState();
  const server = Deno.serve(
    { hostname: '127.0.0.1', port: 0, onListen: () => {} },
    () =>
      new Response(
        JSON.stringify({ choices: [{ message: { content: 'nested child result' } }] }),
        { headers: { 'content-type': 'application/json' } },
      ),
  );
  const addr = server.addr as Deno.NetAddr;
  const upstreamConfig: ProxyConfig = {
    ...config,
    chatBaseUrl: `http://${addr.hostname}:${addr.port}/v1`,
    responsesBaseUrl: null,
    defaultApiKey: 'test-key',
    forceChatCompletions: true,
  };

  try {
    await handleHttpWithState(
      new Request('http://localhost/rpc', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'thread/start',
          params: { threadId: 'thr_nested_background_agent', model: 'gpt-4.1' },
        }),
      }),
      upstreamConfig,
      state,
    );

    await handleHttpWithState(
      new Request('http://localhost/rpc', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          method: 'item/tool/call',
          params: {
            threadId: 'thr_nested_background_agent',
            turnId: 'turn_nested_background_agent',
            callId: 'call_spawn_worker_no_background',
            namespace: 'collaboration',
            tool: 'spawn_agent',
            arguments: { task_name: 'worker', message: 'hold context' },
          },
        }),
      }),
      { ...upstreamConfig, defaultApiKey: '', apiKeys: [] },
      state,
    );

    const worker = state.listThreads({ parentThreadId: 'thr_nested_background_agent' })[0];
    await handleHttpWithState(
      new Request('http://localhost/rpc', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 3,
          method: 'item/tool/call',
          params: {
            threadId: worker.id,
            turnId: 'turn_worker_nested_background_agent',
            callId: 'call_spawn_helper_background',
            namespace: 'collaboration',
            tool: 'spawn_agent',
            arguments: { task_name: 'helper', message: 'do nested work' },
          },
        }),
      }),
      upstreamConfig,
      state,
    );

    let waitOutput: { message: string; timed_out: boolean } | null = null;
    for (let attempt = 0; attempt < 20; attempt++) {
      const wait = await handleHttpWithState(
        new Request('http://localhost/rpc', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 4 + attempt,
            method: 'item/tool/call',
            params: {
              threadId: worker.id,
              turnId: 'turn_worker_nested_background_agent',
              callId: 'call_wait_helper_background',
              namespace: 'collaboration',
              tool: 'wait_agent',
              arguments: { timeout_ms: 1 },
            },
          }),
        }),
        upstreamConfig,
        state,
      );
      const waitJson = await wait.json() as { result: { contentItems: Array<{ text: string }> } };
      const parsedWaitOutput = JSON.parse(waitJson.result.contentItems[0].text) as {
        message: string;
        timed_out: boolean;
      };
      waitOutput = parsedWaitOutput;
      if (!parsedWaitOutput.timed_out) break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }

    assertEquals(waitOutput, { message: 'Agent /worker/helper completed.', timed_out: false });
    const helper = state.listThreads({ parentThreadId: worker.id })[0];
    const helperTurns = state.getTurns(helper.id);
    assertEquals(
      helperTurns.some((turn) => JSON.stringify(turn.items).includes('nested child result')),
      true,
    );
  } finally {
    await server.shutdown();
  }
});

Deno.test('handleHttpWithState resolves turn context from thread and turn ids', async () => {
  const state = new HubState();
  await handleHttpWithState(
    new Request('http://localhost/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'thread/start',
        params: { threadId: 'thr_ctx' },
      }),
    }),
    config,
    state,
  );
  const turnStart = await handleHttpWithState(
    new Request('http://localhost/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'turn/start',
        params: {
          threadId: 'thr_ctx',
          input: [],
          collaborationMode: { mode: 'goal' },
        },
      }),
    }),
    config,
    state,
  );
  const turnStartJson = await turnStart.json() as { result: { turn: { id: string } } };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    void init;
    return new Response(
      [
        'data: {"choices":[{"delta":{"content":"我会继续读取核心文件并运行检查。"},"finish_reason":null}]}',
        '',
        'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}',
        '',
        'data: [DONE]',
        '',
      ].join('\n'),
      {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      },
    );
  }) as typeof fetch;

  try {
    const planResp = await handleHttpWithState(
      new Request('http://localhost/v1/responses', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'thread-id': 'thr_ctx',
          'turn-id': turnStartJson.result.turn.id,
        },
        body: JSON.stringify({
          model: 'gpt-4.1',
          stream: false,
          tools: [{ type: 'function', name: 'exec_command', parameters: {} }],
          input: [{ type: 'message', role: 'user', content: [{ type: 'input_text', text: 'hi' }] }],
        }),
      }),
      config,
      state,
    );
    const planText = await planResp.text();
    assertEquals(planText.includes('"name":"exec_command"'), true);

    const secondTurn = await handleHttpWithState(
      new Request('http://localhost/rpc', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 3,
          method: 'turn/start',
          params: { threadId: 'thr_ctx', input: [] },
        }),
      }),
      config,
      state,
    );
    const secondTurnJson = await secondTurn.json() as { result: { turn: { id: string } } };
    const normalResp = await handleHttpWithState(
      new Request('http://localhost/v1/responses', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'thread-id': 'thr_ctx',
          'turn-id': secondTurnJson.result.turn.id,
        },
        body: JSON.stringify({
          model: 'gpt-4.1',
          stream: true,
          input: [{ type: 'message', role: 'user', content: [{ type: 'input_text', text: 'hi' }] }],
        }),
      }),
      config,
      state,
    );
    const normalText = await normalResp.text();
    assertEquals(normalText.includes('"name":"exec_command"'), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test('handleHttpWithState ignores stale turn ids when resolving turn context', async () => {
  const state = new HubState();
  await handleHttpWithState(
    new Request('http://localhost/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'thread/start',
        params: { threadId: 'thr_stale' },
      }),
    }),
    config,
    state,
  );
  await handleHttpWithState(
    new Request('http://localhost/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'turn/start',
        params: {
          threadId: 'thr_stale',
          input: [],
          collaborationMode: { mode: 'plan' },
        },
      }),
    }),
    config,
    state,
  );
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_input: RequestInfo | URL, _init?: RequestInit) => {
    return new Response(
      [
        'data: {"choices":[{"delta":{"content":"我会继续读取核心文件并运行检查。"},"finish_reason":null}]}',
        '',
        'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}',
        '',
        'data: [DONE]',
        '',
      ].join('\n'),
      {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      },
    );
  }) as typeof fetch;

  try {
    const resp = await handleHttpWithState(
      new Request('http://localhost/v1/responses', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'thread-id': 'thr_stale',
          'turn-id': 'missing-turn',
        },
        body: JSON.stringify({
          model: 'gpt-4.1',
          stream: true,
          input: [{ type: 'message', role: 'user', content: [{ type: 'input_text', text: 'hi' }] }],
        }),
      }),
      config,
      state,
    );
    const text = await resp.text();
    assertEquals(text.includes('Progress-only message received in chat fallback'), false);
    assertEquals(text.includes('"name":"exec_command"'), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test('handleHttpWithState infers plan mode from responses instructions without local turn', async () => {
  const state = new HubState();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_input: RequestInfo | URL, _init?: RequestInit) => {
    return new Response(
      [
        'data: {"choices":[{"delta":{"content":"Let me check the test failure details and the permission issue."},"finish_reason":null}]}',
        '',
        'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}',
        '',
        'data: [DONE]',
        '',
      ].join('\n'),
      {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      },
    );
  }) as typeof fetch;

  try {
    const resp = await handleHttpWithState(
      new Request('http://localhost/v1/responses', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'thread-id': 'thr_no_state',
          'x-codex-turn-metadata': JSON.stringify({
            thread_id: 'thr_no_state',
            turn_id: 'turn_no_state',
          }),
        },
        body: JSON.stringify({
          model: 'gpt-4.1',
          instructions: '# Plan Mode (Conversational)\nYou are in **Plan Mode**.',
          stream: true,
          tools: [{ type: 'function', name: 'exec_command', parameters: {} }],
          input: [{ type: 'message', role: 'user', content: [{ type: 'input_text', text: 'hi' }] }],
        }),
      }),
      config,
      state,
    );
    const text = await resp.text();
    assertEquals(text.includes('Let me check the test failure details'), true);
    assertEquals(text.includes('"name":"exec_command"'), false);
    assertEquals(text.includes('Progress-only message received in chat fallback'), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test('handleHttpWithState infers goal mode from goal context without local turn', async () => {
  const state = new HubState();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_input: RequestInfo | URL, _init?: RequestInit) => {
    return new Response(
      [
        'data: {"choices":[{"delta":{"content":"Let me check the test failure details and the permission issue."},"finish_reason":null}]}',
        '',
        'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}',
        '',
        'data: [DONE]',
        '',
      ].join('\n'),
      {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      },
    );
  }) as typeof fetch;

  try {
    const resp = await handleHttpWithState(
      new Request('http://localhost/v1/responses', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'thread-id': 'thr_goal_no_state',
        },
        body: JSON.stringify({
          model: 'gpt-4.1',
          stream: true,
          tools: [{ type: 'function', name: 'exec_command', parameters: {} }],
          input: [{
            type: 'message',
            role: 'developer',
            content: [{
              type: 'input_text',
              text: '<goal_context>Continue working toward the active thread goal.</goal_context>',
            }],
          }],
        }),
      }),
      config,
      state,
    );
    const text = await resp.text();
    assertEquals(text.includes('"name":"exec_command"'), true);
    assertEquals(text.includes('Progress-only message received in chat fallback'), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test('handleHttpWithState infers code mode from explicit metadata without local turn', async () => {
  const state = new HubState();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_input: RequestInfo | URL, _init?: RequestInit) => {
    return new Response(
      [
        'data: {"choices":[{"delta":{"content":"Let me check the test failure details and the permission issue."},"finish_reason":null}]}',
        '',
        'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}',
        '',
        'data: [DONE]',
        '',
      ].join('\n'),
      {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      },
    );
  }) as typeof fetch;

  try {
    const resp = await handleHttpWithState(
      new Request('http://localhost/v1/responses', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'thread-id': 'thr_code_no_state',
        },
        body: JSON.stringify({
          model: 'gpt-4.1',
          stream: true,
          client_metadata: { mode: 'code' },
          tools: [{ type: 'function', name: 'exec_command', parameters: {} }],
          input: [{ type: 'message', role: 'user', content: [{ type: 'input_text', text: 'hi' }] }],
        }),
      }),
      config,
      state,
    );
    const text = await resp.text();
    assertEquals(text.includes('"name":"exec_command"'), true);
    assertEquals(text.includes('Progress-only message received in chat fallback'), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test('handleHttpWithState infers Codex default collaboration mode as code without local turn', async () => {
  const state = new HubState();
  const originalFetch = globalThis.fetch;
  const originalLogDir = Deno.env.get('HUBPROXY_LOG_DIR');
  const logDir = await Deno.makeTempDir();
  globalThis.fetch = (async (_input: RequestInfo | URL, _init?: RequestInit) => {
    return new Response(
      [
        'data: {"choices":[{"delta":{"content":"Let me check the test failure details and the permission issue."},"finish_reason":null}]}',
        '',
        'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}',
        '',
        'data: [DONE]',
        '',
      ].join('\n'),
      {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      },
    );
  }) as typeof fetch;

  try {
    Deno.env.set('HUBPROXY_LOG_DIR', logDir);
    const resp = await handleHttpWithState(
      new Request('http://localhost/v1/responses', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'thread-id': 'thr_default_no_state',
        },
        body: JSON.stringify({
          model: 'gpt-4.1',
          instructions: 'Base Codex instructions.',
          stream: true,
          tools: [{ type: 'function', name: 'exec_command', parameters: {} }],
          input: [
            {
              type: 'message',
              role: 'developer',
              content: [{
                type: 'input_text',
                text: '<collaboration_mode># Plan Mode (Conversational)</collaboration_mode>',
              }],
            },
            {
              type: 'message',
              role: 'assistant',
              content: [{ type: 'output_text', text: 'PLAN_OK' }],
            },
            {
              type: 'message',
              role: 'developer',
              content: [{
                type: 'input_text',
                text: '<collaboration_mode># Collaboration Mode: Default</collaboration_mode>',
              }],
            },
            {
              type: 'message',
              role: 'user',
              content: [{ type: 'input_text', text: 'hi' }],
            },
          ],
        }),
      }),
      config,
      state,
    );
    const text = await resp.text();
    assertEquals(text.includes('"name":"exec_command"'), true);
    assertEquals(text.includes('Progress-only message received in chat fallback'), true);

    const modeLogs = Array.from(Deno.readDirSync(logDir))
      .filter((entry) => entry.isFile)
      .map((entry) => JSON.parse(Deno.readTextFileSync(`${logDir}/${entry.name}`)))
      .filter((entry) => entry.path === 'internal/mode-resolution');
    assertEquals(modeLogs.at(-1)?.collaborationModeKind, 'code');
  } finally {
    globalThis.fetch = originalFetch;
    if (originalLogDir === undefined) Deno.env.delete('HUBPROXY_LOG_DIR');
    else Deno.env.set('HUBPROXY_LOG_DIR', originalLogDir);
    await Deno.remove(logDir, { recursive: true }).catch(() => {});
  }
});

Deno.test('handleHttpWithState writes request logs for API routes', async () => {
  const state = new HubState();
  const originalLogDir = Deno.env.get('HUBPROXY_LOG_DIR');
  const logDir = await Deno.makeTempDir();
  try {
    Deno.env.set('HUBPROXY_LOG_DIR', logDir);
    await handleHttpWithState(
      new Request('http://localhost/v1/responses', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer client-secret',
          'x-api-key': 'client-secret',
        },
        body: JSON.stringify({
          model: 'gpt-4.1',
          input: [{ type: 'message', role: 'user', content: [{ type: 'input_text', text: 'hi' }] }],
        }),
      }),
      config,
      state,
    ).catch(() => {});

    const entries = Deno.readDirSync(logDir);
    const files = Array.from(entries).filter((entry) => entry.isFile);
    assert(files.length > 0);
  } finally {
    if (originalLogDir === undefined) Deno.env.delete('HUBPROXY_LOG_DIR');
    else Deno.env.set('HUBPROXY_LOG_DIR', originalLogDir);
    await Deno.remove(logDir, { recursive: true }).catch(() => {});
  }
});

Deno.test('handleHttpWithState does not write logs by default', async () => {
  const state = new HubState();
  const originalLogDir = Deno.env.get('HUBPROXY_LOG_DIR');
  const originalCwd = Deno.cwd();
  const cwd = await Deno.makeTempDir();
  try {
    Deno.env.delete('HUBPROXY_LOG_DIR');
    Deno.chdir(cwd);
    await handleHttpWithState(
      new Request('http://localhost/v1/responses', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer client-secret',
          'x-api-key': 'client-secret',
        },
        body: JSON.stringify({
          model: 'gpt-4.1',
          input: [{ type: 'message', role: 'user', content: [{ type: 'input_text', text: 'hi' }] }],
        }),
      }),
      config,
      state,
    ).catch(() => {});

    let logsExists = true;
    try {
      await Deno.stat(`${cwd}/logs`);
    } catch {
      logsExists = false;
    }
    assertEquals(logsExists, false);
  } finally {
    Deno.chdir(originalCwd);
    if (originalLogDir === undefined) Deno.env.delete('HUBPROXY_LOG_DIR');
    else Deno.env.set('HUBPROXY_LOG_DIR', originalLogDir);
    await Deno.remove(cwd, { recursive: true }).catch(() => {});
  }
});

Deno.test('handleHttpWithState writes auth failure previews', async () => {
  const state = new HubState();
  const originalLogDir = Deno.env.get('HUBPROXY_LOG_DIR');
  const logDir = await Deno.makeTempDir();
  try {
    Deno.env.set('HUBPROXY_LOG_DIR', logDir);
    const resp = await handleHttpWithState(
      new Request('http://localhost/rpc', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer abcdef123456789',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {},
        }),
      }),
      {
        ...config,
        authToken: 'zzz111222333444',
      },
      state,
    );
    assertEquals(resp.status, 401);
    const logs = Array.from(Deno.readDirSync(logDir)).filter((entry) => entry.isFile);
    assert(logs.length > 0);
    const logTexts = logs.map((entry) => Deno.readTextFileSync(`${logDir}/${entry.name}`));
    const authLog = logTexts.find((text) => text.includes('auth_failure'));
    assert(authLog);
    assert(authLog.includes('abc...789'));
    assert(authLog.includes('zzz...444'));
  } finally {
    if (originalLogDir === undefined) Deno.env.delete('HUBPROXY_LOG_DIR');
    else Deno.env.set('HUBPROXY_LOG_DIR', originalLogDir);
    await Deno.remove(logDir, { recursive: true }).catch(() => {});
  }
});

Deno.test('handleHttpWithState serves models anonymously and still protects rpc when authToken is set', async () => {
  const state = new HubState();
  const publicConfig: ProxyConfig = { ...config, authToken: null };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        object: 'list',
        data: [
          {
            id: 'remote-model-1',
            object: 'model',
            created: 123,
            owned_by: 'upstream',
          },
        ],
        success: true,
      }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' },
      },
    )) as typeof fetch;

  try {
    const publicModels = await handleHttpWithState(
      new Request('http://localhost/v1/models'),
      publicConfig,
      state,
    );
    assertEquals(publicModels.status, 200);
    const publicModelsJson = await publicModels.json() as {
      object: string;
      data: Array<
        {
          id: string;
          object: string;
          created?: number;
          owned_by?: string;
          supported_endpoint_types?: string[];
        }
      >;
    };
    assertEquals(publicModelsJson.object, 'list');
    assertEquals(publicModelsJson.data[0].id, 'remote-model-1');
    assertEquals(publicModelsJson.data[0].object, 'model');
    assertEquals(publicModelsJson.data[0].created, 123);
    assertEquals(publicModelsJson.data[0].owned_by, 'upstream');
    assertEquals(publicModelsJson.data[0].supported_endpoint_types, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }

  const authedConfig: ProxyConfig = { ...config, authToken: 'local-secret' };
  const rpcDenied = await handleHttpWithState(
    new Request('http://localhost/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {},
      }),
    }),
    authedConfig,
    state,
  );
  assertEquals(rpcDenied.status, 401);

  const rpcAllowed = await handleHttpWithState(
    new Request('http://localhost/rpc', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer local-secret',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'initialize',
        params: {},
      }),
    }),
    authedConfig,
    state,
  );
  assertEquals(rpcAllowed.status, 200);

  const rpcAllowedViaApiKey = await handleHttpWithState(
    new Request('http://localhost/rpc', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': 'local-secret',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 3,
        method: 'initialize',
        params: {},
      }),
    }),
    authedConfig,
    state,
  );
  assertEquals(rpcAllowedViaApiKey.status, 200);
});
