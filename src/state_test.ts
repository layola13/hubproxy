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
  assertEquals(Array.isArray(state.listTurns('thr_1')), true);
  const startedTurn = state.startTurn('thr_1', []);
  assert(startedTurn !== null);
  const startedTurnId = startedTurn!.id;
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
  state.emitAccountUpdated();
  state.emitAccountRateLimitsUpdated();
  state.emitAppListUpdated();
  state.emitExternalAgentConfigImportCompleted();
  state.emitFuzzySearchUpdated('sess-1', 'query');
  state.emitFuzzySearchCompleted('sess-1');
  state.emitWindowsWorldWritableWarning();
  state.emitWindowsSandboxSetupCompleted('unelevated');
  const notifications = state.drainNotifications();
  assert(notifications.some((entry) => entry.method === 'thread/started'));
  assert(notifications.some((entry) => entry.method === 'turn/started'));
  assert(notifications.some((entry) => entry.method === 'turn/completed'));
  assert(notifications.some((entry) => entry.method === 'item/completed'));
  assert(notifications.some((entry) => entry.method === 'item/reasoning/summaryTextDelta'));
  assert(notifications.some((entry) => entry.method === 'item/reasoning/summaryPartAdded'));
  assert(notifications.some((entry) => entry.method === 'item/reasoning/textDelta'));
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
  assertEquals(state.resetMemory(), true);
  assertEquals(state.listThreads().length, 0);
});
