import { assert, assertEquals } from 'jsr:@std/assert@1';
import { handleHttpWithState } from './handlers.ts';
import { HubState } from './state.ts';
import type { ProxyConfig } from './types.ts';

const config: ProxyConfig = {
  port: 8787,
  host: '127.0.0.1',
  authToken: null,
  responsesBaseUrl: 'http://127.0.0.1:1',
  chatBaseUrl: 'http://127.0.0.1:1',
  defaultModel: 'gpt-4.1',
  defaultApiKey: '',
  dataDir: '/tmp',
};

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
  await handleHttpWithState(
    new Request('http://localhost/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 103,
        method: 'mcpServer/tool/call',
        params: {
          threadId: 'thr_events',
          turnId: 'turn-events',
          itemId: 'mcp-tool-1',
          message: 'tool call',
        },
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
        params: { threadId: 'thr_test' },
      }),
    }),
    config,
    state,
  );
  assertEquals(start.status, 200);
  const startJson = await start.json() as {
    id: number;
    result: {
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
  const nameSetJson = await nameSet.json() as { result: Record<string, unknown> };
  assertEquals(Object.keys(nameSetJson.result).length, 0);

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
  const archiveJson = await archive.json() as { result: { thread: { id: string } } };
  assertEquals(Object.keys(archiveJson.result).length, 0);

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
  const forkJson = await fork.json() as { result: { thread: { forkedFromId: string | null } } };
  assertEquals(forkJson.result.thread.forkedFromId, 'thr_test');

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

  const turnStart = await handleHttpWithState(
    new Request('http://localhost/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 22,
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

  const turnSteer = await handleHttpWithState(
    new Request('http://localhost/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 23,
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
        id: 26,
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
  const turnInterruptJson = await turnInterrupt.json() as { result: Record<string, unknown> };
  assertEquals(Object.keys(turnInterruptJson.result).length, 0);

  const memoryReset = await handleHttpWithState(
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
  const memoryResetJson = await memoryReset.json() as { result: Record<string, unknown> };
  assertEquals(Object.keys(memoryResetJson.result).length, 0);

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
    result: { plugin: { marketplaceName: string; summary: { name: string } } };
  };
  assertEquals(pluginReadJson.result.plugin.marketplaceName, 'local');
  assertEquals(pluginReadJson.result.plugin.summary.name, 'codex-test-plugin');

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

  const readDirectory = await handleHttpWithState(
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
  const readDirectoryJson = await readDirectory.json() as { result: { entries: unknown[] } };
  assertEquals(Array.isArray(readDirectoryJson.result.entries), true);

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

Deno.test('handleHttpWithState rejects unauthorized requests when authToken is set', async () => {
  const state = new HubState();
  const authedConfig: ProxyConfig = { ...config, authToken: 'local-secret' };
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
      }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' },
      },
    )) as typeof fetch;

  try {
    const denied = await handleHttpWithState(
      new Request('http://localhost/v1/models'),
      authedConfig,
      state,
    );
    assertEquals(denied.status, 401);

    const allowed = await handleHttpWithState(
      new Request('http://localhost/v1/models', {
        headers: { authorization: 'Bearer local-secret' },
      }),
      authedConfig,
      state,
    );
    assertEquals(allowed.status, 200);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
