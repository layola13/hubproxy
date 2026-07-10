import { assert, assertEquals } from 'jsr:@std/assert@1';
import { HubState } from './state.ts';

Deno.test('HubState start/resume/goal lifecycle', () => {
  const state = new HubState();
  const thread = state.startThread({ threadId: 'thr_1', cwd: '/tmp', model: 'gpt-x' });
  assertEquals(thread.id, 'thr_1');
  assertEquals(state.listThreads().length, 1);
  assert(state.getThread('thr_1') !== null);

  const goal = state.setGoal('thr_1', { objective: 'finish', status: 'active', tokenBudget: 123 });
  assertEquals(goal.threadId, 'thr_1');
  assertEquals(state.getGoal('thr_1')?.objective, 'finish');
  assert(state.clearGoal('thr_1'));
  assertEquals(state.getGoal('thr_1'), null);

  const resumed = state.resumeThread('thr_1');
  assert(resumed !== null);
  assertEquals(resumed.id, 'thr_1');

  assertEquals(state.setThreadName('thr_1', 'renamed')?.name, 'renamed');
  assertEquals(state.archiveThread('thr_1')?.id, 'thr_1');
  assertEquals(state.unarchiveThread('thr_1')?.id, 'thr_1');
  assertEquals(state.rollbackThread('thr_1', 1)?.id, 'thr_1');
  assertEquals(state.forkThread({ threadId: 'thr_1' })?.forkedFromId, 'thr_1');
  assertEquals(state.unsubscribeThread('thr_1'), 'notSubscribed');
  assertEquals(state.incrementElicitation('thr_1').count >= 1, true);
  assertEquals(state.decrementElicitation('thr_1').count >= 0, true);
  assertEquals(state.injectItems('thr_1', [{ type: 'message' }]), true);
  state.injectItems('thr_1', [
    {
      type: 'reasoning',
      id: 'reasoning-1',
      summary: [{ type: 'summary_text', text: 'thinking' }],
      content: [{ type: 'reasoning_text', text: 'raw reasoning' }],
    },
  ]);
  state.injectItems('thr_1', [
    {
      type: 'agent_message',
      id: 'msg-1',
      content: [{ type: 'output_text', text: 'assistant text' }],
    },
  ]);
  state.injectItems('thr_1', [
    {
      type: 'agent_message',
      id: 'msg-2',
      content: [{ type: 'input_text', text: 'agent input text' }],
    },
  ]);
  state.injectItems('thr_1', [
    {
      type: 'plan',
      id: 'plan-1',
      text: 'plan delta',
    },
  ]);
  assertEquals(Array.isArray(state.listTurns('thr_1')), true);
  const startedTurn = state.startTurn('thr_1', [], 'plan');
  assert(startedTurn !== null);
  const startedTurnId = startedTurn!.id;
  assertEquals(startedTurn!.collaborationModeKind, 'plan');
  assertEquals(state.steerTurn('thr_1', startedTurnId, [])?.id, startedTurnId);
  assertEquals(state.interruptTurn('thr_1', startedTurnId)?.status, 'interrupted');
  state.emitWarning('careful', 'thr_1');
  state.emitDeprecationNotice('old thing', 'use new thing');
  state.emitConfigWarning('bad config', '/tmp/config.toml', 'invalid value');
  state.emitGuardianWarning('guardian says no', 'thr_1');
  state.emitMcpServerStartupStatus('server-a', 'starting');
  state.emitRealtimeStarted('thr_1', 'v2');
  state.emitRealtimeItemAdded('thr_1', { type: 'text' });
  state.emitRealtimeTranscriptDelta('thr_1', 'assistant', 'hello');
  state.emitRealtimeTranscriptDone('thr_1', 'assistant', 'hello');
  state.emitRealtimeOutputAudioDelta('thr_1', 'ZGF0YQ==');
  state.emitRealtimeSdp('thr_1', 'offer');
  state.emitRealtimeError('thr_1', 'boom');
  state.emitRealtimeClosed('thr_1');
  state.spawnProcess(['echo', 'ok'], '/tmp', 'proc_1');
  state.emitThreadTokenUsage('thr_1', startedTurnId, 1);
  state.emitAccountUpdated('plus');
  state.emitAccountRateLimitsUpdated('plus');
  state.emitAppListUpdated();
  state.emitExternalAgentConfigImportCompleted();
  state.emitFuzzySearchUpdated('sess-1', 'query');
  state.emitFuzzySearchCompleted('sess-1');
  state.emitWindowsWorldWritableWarning();
  state.emitWindowsSandboxSetupCompleted('unelevated');
  state.emitCommandExecOutputDelta('proc-1', 'stdout', btoa('ok'));
  state.commandExec(['echo', 'state'], Deno.cwd());
  state.spawnProcess(['echo', 'state-process'], Deno.cwd(), 'proc_state');
  state.emitFileChangePatchUpdated('thr_1', startedTurnId, 'filechange-1', [
    {
      path: '/tmp/demo.txt',
      kind: { type: 'add' },
      diff: '+++ /tmp/demo.txt\n@@\n+demo\n',
    },
  ]);
  state.pushNotification({
    method: 'item/commandExecution/outputDelta',
    params: {
      threadId: 'thr_1',
      turnId: startedTurnId,
      itemId: 'cmd-1',
      delta: 'stdout chunk',
    },
  });
  state.pushNotification({
    method: 'item/mcpToolCall/progress',
    params: {
      threadId: 'thr_1',
      turnId: startedTurnId,
      itemId: 'mcp-1',
      message: 'progress update',
    },
  });
  const notifications = state.drainNotifications();
  assert(notifications.some((entry) => entry.method === 'thread/started'));
  assert(notifications.some((entry) => entry.method === 'turn/started'));
  assert(notifications.some((entry) => entry.method === 'turn/completed'));
  assert(notifications.some((entry) => entry.method === 'item/completed'));
  const reasoningSummary = notifications.find((entry) =>
    entry.method === 'item/reasoning/summaryTextDelta'
  );
  const reasoningPart = notifications.find((entry) =>
    entry.method === 'item/reasoning/summaryPartAdded'
  );
  const reasoningText = notifications.find((entry) => entry.method === 'item/reasoning/textDelta');
  assert(reasoningSummary);
  assertEquals((reasoningSummary.params as Record<string, unknown>).summaryIndex, 0);
  assert(reasoningPart);
  assertEquals((reasoningPart.params as Record<string, unknown>).summaryIndex, 0);
  assert(reasoningText);
  assertEquals((reasoningText.params as Record<string, unknown>).contentIndex, 0);
  const agentDeltas = notifications.filter((entry) => entry.method === 'item/agentMessage/delta');
  assert(agentDeltas.length >= 2);
  assertEquals((agentDeltas[0].params as Record<string, unknown>).delta, 'assistant text');
  assertEquals((agentDeltas[1].params as Record<string, unknown>).delta, 'agent input text');
  const planDelta = notifications.find((entry) => entry.method === 'item/plan/delta');
  assert(planDelta);
  assertEquals((planDelta.params as Record<string, unknown>).delta, 'plan delta');
  const fileChange = notifications.find((entry) => entry.method === 'item/fileChange/patchUpdated');
  assert(fileChange);
  assertEquals((fileChange.params as Record<string, unknown>).threadId, 'thr_1');
  assertEquals((fileChange.params as Record<string, unknown>).turnId, startedTurnId);
  assertEquals(
    ((fileChange.params as Record<string, unknown>).changes as Array<Record<string, unknown>>)[0]
      .kind,
    { type: 'add' },
  );
  const commandOutput = notifications.find((entry) =>
    entry.method === 'item/commandExecution/outputDelta'
  );
  assert(commandOutput);
  assertEquals((commandOutput.params as Record<string, unknown>).delta, 'stdout chunk');
  const mcpProgress = notifications.find((entry) => entry.method === 'item/mcpToolCall/progress');
  assert(mcpProgress);
  assertEquals((mcpProgress.params as Record<string, unknown>).message, 'progress update');
  assert(notifications.some((entry) => entry.method === 'warning'));
  assert(notifications.some((entry) => entry.method === 'deprecationNotice'));
  assert(notifications.some((entry) => entry.method === 'configWarning'));
  assert(notifications.some((entry) => entry.method === 'guardianWarning'));
  assert(notifications.some((entry) => entry.method === 'thread/realtime/started'));
  assert(notifications.some((entry) => entry.method === 'thread/realtime/itemAdded'));
  assert(notifications.some((entry) => entry.method === 'thread/realtime/transcript/delta'));
  assert(notifications.some((entry) => entry.method === 'thread/realtime/transcript/done'));
  assert(notifications.some((entry) => entry.method === 'thread/realtime/outputAudio/delta'));
  assert(notifications.some((entry) => entry.method === 'thread/realtime/sdp'));
  assert(notifications.some((entry) => entry.method === 'thread/realtime/error'));
  assert(notifications.some((entry) => entry.method === 'thread/realtime/closed'));
  assert(notifications.some((entry) => entry.method === 'process/outputDelta'));
  assert(notifications.some((entry) => entry.method === 'process/exited'));
  assert(notifications.some((entry) => entry.method === 'thread/tokenUsage/updated'));
  assert(notifications.some((entry) => entry.method === 'account/updated'));
  assert(notifications.some((entry) => entry.method === 'account/rateLimits/updated'));
  assert(notifications.some((entry) => entry.method === 'app/list/updated'));
  assert(notifications.some((entry) => entry.method === 'externalAgentConfig/import/completed'));
  assert(notifications.some((entry) => entry.method === 'fuzzyFileSearch/sessionUpdated'));
  assert(notifications.some((entry) => entry.method === 'fuzzyFileSearch/sessionCompleted'));
  assert(notifications.some((entry) => entry.method === 'windows/worldWritableWarning'));
  assert(notifications.some((entry) => entry.method === 'windowsSandbox/setupCompleted'));
  assert(notifications.some((entry) => entry.method === 'command/exec/outputDelta'));
  assertEquals(state.resetMemory(), true);
  assertEquals(state.listThreads().length, 0);
});
