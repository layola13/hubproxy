import { mockResponsesOpenAI, proxyOpenAI, readJson } from './proxy.ts';
import { HubState } from './state.ts';
import { isRpcRequest, rpcError, rpcResult } from './jsonrpc.ts';
import type { ProxyConfig, ProxyResult, ResponsesScenario } from './types.ts';

export function toJson(value: unknown): unknown {
  if (value === null) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (Array.isArray(value)) return value.map(toJson);
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = toJson(item);
    }
    return out;
  }
  return String(value);
}

function hasValidAuth(req: Request, config: ProxyConfig): boolean {
  if (!config.authToken) return true;
  const authorization = req.headers.get('authorization');
  const apiKey = req.headers.get('x-api-key');
  return authorization === `Bearer ${config.authToken}` || apiKey === config.authToken;
}

export async function handleRpc(
  req: Request,
  state: HubState,
  config: ProxyConfig,
): Promise<Response> {
  const body = await readJson(req);
  if (!isRpcRequest(body)) return jsonResponse(rpcError(null, -32600, 'invalid request'), 400);

  const params = (body.params ?? {}) as Record<string, unknown>;
  switch (body.method) {
    case 'initialize':
      return jsonResponse(rpcResult(
        body.id,
        toJson({
          userAgent: `hubproxy/${Deno.version.deno}`,
          codexHome: Deno.cwd(),
          platformFamily: Deno.build.os === 'windows' ? 'windows' : 'unix',
          platformOs: Deno.build.os,
        }),
      ));
    case 'thread/start': {
      const thread = state.startThread({
        threadId: typeof params.threadId === 'string' ? params.threadId : undefined,
        cwd: typeof params.cwd === 'string' ? params.cwd : undefined,
        modelProvider: typeof params.modelProvider === 'string' ? params.modelProvider : undefined,
        model: typeof params.model === 'string' ? params.model : config.defaultModel,
        ephemeral: params.ephemeral !== false,
      });
      return jsonResponse(
        rpcResult(
          body.id,
          toJson({
            model: thread.model,
            modelProvider: thread.modelProvider,
            serviceTier: null,
            cwd: thread.cwd,
            instructionSources: [],
            approvalPolicy: params.approvalPolicy ?? 'never',
            approvalsReviewer: params.approvalsReviewer ?? 'user',
            sandbox: params.sandbox ?? 'danger-full-access',
            reasoningEffort: null,
            activePermissionProfile: null,
            thread,
          }),
        ),
      );
    }
    case 'thread/resume': {
      const threadId = String(params.threadId ?? '');
      const thread = state.resumeThread(threadId);
      if (!thread) return jsonResponse(rpcError(body.id, -32000, 'thread not found'), 404);
      return jsonResponse(
        rpcResult(
          body.id,
          toJson({
            model: thread.model,
            modelProvider: thread.modelProvider,
            serviceTier: null,
            cwd: thread.cwd,
            instructionSources: [],
            approvalPolicy: params.approvalPolicy ?? 'never',
            approvalsReviewer: params.approvalsReviewer ?? 'user',
            sandbox: params.sandbox ?? 'danger-full-access',
            reasoningEffort: null,
            activePermissionProfile: null,
            thread,
          }),
        ),
      );
    }
    case 'thread/list':
      return jsonResponse(
        rpcResult(
          body.id,
          toJson({ data: state.listThreads(), nextCursor: null, backwardsCursor: null }),
        ),
      );
    case 'thread/loaded/list':
      return jsonResponse(
        rpcResult(
          body.id,
          toJson({ data: state.listLoadedThreads(), nextCursor: null }),
        ),
      );
    case 'thread/fork': {
      const threadId = String(params.threadId ?? '');
      const thread = state.forkThread({
        threadId,
        cwd: typeof params.cwd === 'string' ? params.cwd : undefined,
        modelProvider: typeof params.modelProvider === 'string' ? params.modelProvider : undefined,
        model: typeof params.model === 'string' ? params.model : config.defaultModel,
        ephemeral: params.ephemeral !== false,
      });
      return thread
        ? jsonResponse(rpcResult(
          body.id,
          toJson({
            model: thread.model,
            modelProvider: thread.modelProvider,
            serviceTier: null,
            cwd: thread.cwd,
            instructionSources: [],
            approvalPolicy: params.approvalPolicy ?? 'never',
            approvalsReviewer: params.approvalsReviewer ?? 'user',
            sandbox: params.sandbox ?? 'danger-full-access',
            reasoningEffort: null,
            activePermissionProfile: null,
            thread,
          }),
        ))
        : jsonResponse(rpcError(body.id, -32000, 'thread not found'), 404);
    }
    case 'thread/read': {
      const threadId = String(params.threadId ?? '');
      const thread = state.getThread(threadId);
      if (!thread) return jsonResponse(rpcError(body.id, -32000, 'thread not found'), 404);
      const includeTurns = params.includeTurns === true;
      const turns = includeTurns ? state.getTurns(threadId) : [];
      return jsonResponse(
        rpcResult(
          body.id,
          toJson({
            thread: { ...thread, turns },
          }),
        ),
      );
    }
    case 'thread/archive': {
      const threadId = String(params.threadId ?? '');
      const thread = state.archiveThread(threadId);
      return thread
        ? jsonResponse(rpcResult(
          body.id,
          toJson({
            archived: true,
            threadId,
          }),
        ))
        : jsonResponse(rpcError(body.id, -32000, 'thread not found'), 404);
    }
    case 'thread/unarchive': {
      const threadId = String(params.threadId ?? '');
      const thread = state.unarchiveThread(threadId);
      return thread
        ? jsonResponse(rpcResult(body.id, toJson({ thread })))
        : jsonResponse(rpcError(body.id, -32000, 'thread not found'), 404);
    }
    case 'thread/name/set': {
      const threadId = String(params.threadId ?? '');
      const thread = state.setThreadName(
        threadId,
        typeof params.name === 'string' ? params.name : null,
      );
      return thread
        ? jsonResponse(rpcResult(
          body.id,
          toJson({
            threadId,
            name: typeof params.name === 'string' ? params.name : null,
          }),
        ))
        : jsonResponse(rpcError(body.id, -32000, 'thread not found'), 404);
    }
    case 'thread/metadata/update': {
      const threadId = String(params.threadId ?? '');
      const thread = state.patchThreadMetadata(threadId, {
        preview: typeof params.preview === 'string' ? params.preview : undefined,
        gitInfo: params.gitInfo,
      });
      return thread
        ? jsonResponse(rpcResult(body.id, toJson({ thread })))
        : jsonResponse(rpcError(body.id, -32000, 'thread not found'), 404);
    }
    case 'thread/rollback': {
      const threadId = String(params.threadId ?? '');
      const thread = state.rollbackThread(threadId, Number(params.numTurns ?? 1));
      return thread
        ? jsonResponse(rpcResult(body.id, toJson({ thread })))
        : jsonResponse(rpcError(body.id, -32000, 'thread not found'), 404);
    }
    case 'thread/turns/list': {
      const threadId = String(params.threadId ?? '');
      return jsonResponse(
        rpcResult(
          body.id,
          toJson({ data: state.listTurns(threadId), nextCursor: null, backwardsCursor: null }),
        ),
      );
    }
    case 'thread/turns/items/list': {
      const threadId = String(params.threadId ?? '');
      const turnId = String(params.turnId ?? '');
      const turn = state.listTurns(threadId).find((entry) => entry.id === turnId);
      return jsonResponse(
        rpcResult(
          body.id,
          toJson({ data: turn?.items ?? [], nextCursor: null, backwardsCursor: null }),
        ),
      );
    }
    case 'thread/inject_items': {
      const threadId = String(params.threadId ?? '');
      const injected = state.injectItems(
        threadId,
        Array.isArray(params.items) ? params.items : [],
      );
      return injected
        ? jsonResponse(rpcResult(
          body.id,
          toJson({
            threadId,
            injectedCount: Array.isArray(params.items) ? params.items.length : 0,
          }),
        ))
        : jsonResponse(rpcError(body.id, -32000, 'thread not found'), 404);
    }
    case 'thread/unsubscribe': {
      const threadId = String(params.threadId ?? '');
      return jsonResponse(
        rpcResult(body.id, toJson({ status: state.unsubscribeThread(threadId) })),
      );
    }
    case 'thread/increment_elicitation': {
      const threadId = String(params.threadId ?? '');
      return jsonResponse(rpcResult(body.id, toJson(state.incrementElicitation(threadId))));
    }
    case 'thread/decrement_elicitation': {
      const threadId = String(params.threadId ?? '');
      return jsonResponse(rpcResult(body.id, toJson(state.decrementElicitation(threadId))));
    }
    case 'turn/start': {
      const threadId = String(params.threadId ?? '');
      const turn = state.startTurn(threadId, Array.isArray(params.input) ? params.input : []);
      return turn
        ? jsonResponse(rpcResult(body.id, toJson({ turn })))
        : jsonResponse(rpcError(body.id, -32000, 'thread not found'), 404);
    }
    case 'turn/steer': {
      const threadId = String(params.threadId ?? '');
      const turnId = String(params.expectedTurnId ?? '');
      const turn = state.steerTurn(
        threadId,
        turnId,
        Array.isArray(params.input) ? params.input : [],
      );
      return turn
        ? jsonResponse(rpcResult(body.id, toJson({ turnId: turn.id })))
        : jsonResponse(rpcError(body.id, -32000, 'turn not found'), 404);
    }
    case 'turn/interrupt': {
      const threadId = String(params.threadId ?? '');
      const turnId = String(params.turnId ?? '');
      const turn = state.interruptTurn(threadId, turnId);
      return turn
        ? jsonResponse(rpcResult(body.id, toJson({})))
        : jsonResponse(rpcError(body.id, -32000, 'turn not found'), 404);
    }
    case 'thread/compact/start':
      return jsonResponse(rpcResult(body.id, toJson({})));
    case 'thread/shellCommand':
      state.emitWarning(
        `shell command queued: ${String(params.command ?? '')}`,
        String(params.threadId ?? ''),
      );
      return jsonResponse(rpcResult(body.id, toJson({})));
    case 'thread/approveGuardianDeniedAction':
      state.emitGuardianWarning('guardian denied action approved', String(params.threadId ?? ''));
      return jsonResponse(rpcResult(body.id, toJson({})));
    case 'thread/backgroundTerminals/clean':
      return jsonResponse(rpcResult(
        body.id,
        toJson({
          cleaned: true,
          threadId: String(params.threadId ?? ''),
        }),
      ));
    case 'thread/memoryMode/set':
      return jsonResponse(rpcResult(
        body.id,
        toJson({
          threadId: String(params.threadId ?? ''),
          memoryMode: typeof params.memoryMode === 'string'
            ? params.memoryMode
            : typeof params.mode === 'string'
            ? params.mode
            : 'default',
        }),
      ));
    case 'memory/reset':
      return jsonResponse(rpcResult(body.id, toJson({})));
    case 'thread/goal/set': {
      const threadId = String(params.threadId ?? '');
      const goal = state.setGoal(threadId, {
        objective: typeof params.objective === 'string' ? params.objective : '',
        status: typeof params.status === 'string' ? (params.status as any) : 'active',
        tokenBudget: typeof params.tokenBudget === 'number' ? params.tokenBudget : null,
      });
      return jsonResponse(rpcResult(body.id, toJson({ goal })));
    }
    case 'thread/goal/get': {
      const threadId = String(params.threadId ?? '');
      return jsonResponse(rpcResult(body.id, toJson({ goal: state.getGoal(threadId) })));
    }
    case 'thread/goal/clear': {
      const threadId = String(params.threadId ?? '');
      const cleared = state.clearGoal(threadId);
      return jsonResponse(rpcResult(
        body.id,
        toJson({
          cleared,
          notification: cleared
            ? {
              method: 'thread/goal/cleared',
              params: { threadId },
            }
            : null,
        }),
      ));
    }
    case 'fs/readFile': {
      const path = String(params.path ?? '');
      return jsonResponse(rpcResult(body.id, toJson({ dataBase64: btoa(state.readFile(path)) })));
    }
    case 'fs/writeFile': {
      const path = String(params.path ?? '');
      const dataBase64 = String(params.dataBase64 ?? '');
      return jsonResponse(rpcResult(body.id, toJson({ ok: state.writeFile(path, dataBase64) })));
    }
    case 'fs/createDirectory': {
      const path = String(params.path ?? '');
      return jsonResponse(
        rpcResult(body.id, toJson({ ok: state.createDirectory(path, params.recursive !== false) })),
      );
    }
    case 'fs/getMetadata': {
      const path = String(params.path ?? '');
      return jsonResponse(rpcResult(body.id, toJson(state.getMetadata(path))));
    }
    case 'fs/readDirectory': {
      const path = String(params.path ?? '');
      return jsonResponse(rpcResult(
        body.id,
        toJson({
          entries: state.readDirectory(path).map((entry) => ({
            name: entry.fileName,
            isDirectory: entry.isDirectory,
            isFile: entry.isFile,
          })),
        }),
      ));
    }
    case 'fs/remove': {
      const path = String(params.path ?? '');
      return jsonResponse(
        rpcResult(
          body.id,
          toJson({ ok: state.remove(path, params.recursive !== false, params.force !== false) }),
        ),
      );
    }
    case 'fs/copy': {
      return jsonResponse(rpcResult(
        body.id,
        toJson({
          ok: state.copy(String(params.sourcePath ?? ''), String(params.destinationPath ?? '')),
        }),
      ));
    }
    case 'fs/watch': {
      return jsonResponse(rpcResult(
        body.id,
        toJson({
          path: state.watch(String(params.path ?? ''), String(params.watchId ?? '')),
        }),
      ));
    }
    case 'fs/unwatch': {
      return jsonResponse(
        rpcResult(body.id, toJson({ ok: state.unwatch(String(params.watchId ?? '')) })),
      );
    }
    case 'hooks/list':
      return jsonResponse(rpcResult(
        body.id,
        toJson({
          data: [{
            cwd: Deno.cwd(),
            errors: [],
            hooks: [],
            warnings: [],
          }],
        }),
      ));
    case 'skills/list':
      state.pushNotification({ method: 'skills/changed', params: {} });
      return jsonResponse(rpcResult(body.id, toJson({ data: [] })));
    case 'marketplace/add':
      return jsonResponse(rpcResult(
        body.id,
        toJson({
          alreadyAdded: false,
          installedRoot: Deno.cwd(),
          marketplaceName: String(params.source ?? 'default'),
        }),
      ));
    case 'marketplace/remove':
      return jsonResponse(rpcResult(
        body.id,
        toJson({
          marketplaceName: String(params.marketplaceName ?? ''),
          installedRoot: Deno.cwd(),
        }),
      ));
    case 'marketplace/upgrade':
      return jsonResponse(rpcResult(
        body.id,
        toJson({
          errors: [],
          selectedMarketplaces: [String(params.marketplaceName ?? '')].filter(Boolean),
          upgradedRoots: [],
        }),
      ));
    case 'plugin/list':
      return jsonResponse(rpcResult(
        body.id,
        toJson({
          featuredPluginIds: [],
          marketplaceLoadErrors: [],
          marketplaces: [],
        }),
      ));
    case 'plugin/installed':
      return jsonResponse(rpcResult(body.id, toJson({ data: [] })));
    case 'plugin/read':
      return jsonResponse(rpcResult(
        body.id,
        toJson({
          plugin: {
            apps: [],
            description: null,
            hooks: [],
            marketplaceName: typeof params.remoteMarketplaceName === 'string'
              ? params.remoteMarketplaceName
              : 'local',
            marketplacePath: params.marketplacePath ?? null,
            mcpServers: [],
            skills: [],
            summary: {
              name: typeof params.pluginName === 'string' ? params.pluginName : '',
            },
          },
        }),
      ));
    case 'plugin/skill/read':
      return jsonResponse(rpcResult(body.id, toJson({ contents: [] })));
    case 'plugin/share/save':
      return jsonResponse(rpcResult(
        body.id,
        toJson({
          remotePluginId: `remote_${crypto.randomUUID()}`,
          shareUrl: new URL('/share', `http://${config.host}:${config.port}`).toString(),
          discoverability: 'UNLISTED',
        }),
      ));
    case 'plugin/share/updateTargets':
      return jsonResponse(
        rpcResult(
          body.id,
          toJson({
            discoverability: 'UNLISTED',
            principals: Array.isArray(params.principals) ? params.principals : [],
          }),
        ),
      );
    case 'plugin/share/list':
      return jsonResponse(rpcResult(
        body.id,
        toJson({
          data: [],
          nextCursor: null,
        }),
      ));
    case 'plugin/share/checkout':
      return jsonResponse(rpcResult(
        body.id,
        toJson({
          checkedOut: true,
          marketplaceName: typeof params.marketplaceName === 'string'
            ? params.marketplaceName
            : 'local',
          pluginName: typeof params.pluginName === 'string' ? params.pluginName : '',
        }),
      ));
    case 'plugin/share/delete':
      return jsonResponse(rpcResult(
        body.id,
        toJson({
          deleted: true,
          remotePluginId: typeof params.remotePluginId === 'string' ? params.remotePluginId : null,
        }),
      ));
    case 'plugin/install':
      return jsonResponse(
        rpcResult(body.id, toJson({ appsNeedingAuth: [], authPolicy: 'NOT_AVAILABLE' })),
      );
    case 'plugin/uninstall':
      return jsonResponse(rpcResult(
        body.id,
        toJson({
          uninstalled: true,
          pluginName: typeof params.pluginName === 'string' ? params.pluginName : '',
        }),
      ));
    case 'model/list':
      return await proxyOpenAI(
        '/v1/models',
        new Request('http://localhost/v1/models', {
          method: 'GET',
          headers: req.headers,
        }),
        config,
      );
    case 'modelProvider/capabilities/read':
      return jsonResponse(rpcResult(
        body.id,
        toJson({
          imageGeneration: false,
          namespaceTools: true,
          webSearch: false,
        }),
      ));
    case 'mock/experimentalMethod':
      return jsonResponse(rpcResult(body.id, toJson({ echoed: params.value ?? null })));
    case 'environment/add':
      return jsonResponse(rpcResult(body.id, toJson({})));
    case 'review/start':
      return jsonResponse(
        rpcResult(
          body.id,
          toJson({
            reviewThreadId: String(params.threadId ?? ''),
            threadId: String(params.threadId ?? ''),
          }),
        ),
      );
    case 'mcpServer/oauth/login':
      return jsonResponse(rpcResult(
        body.id,
        toJson({
          authorizationUrl: new URL('/oauth', `http://${config.host}:${config.port}`).toString(),
        }),
      ));
    case 'account/login/start':
      return jsonResponse(rpcResult(body.id, toJson({ type: String(params.type ?? 'apiKey') })));
    case 'account/login/cancel':
    case 'account/logout':
      return jsonResponse(rpcResult(
        body.id,
        toJson({
          canceled: body.method === 'account/login/cancel',
          loggedOut: body.method === 'account/logout',
        }),
      ));
    case 'account/rateLimits/read':
      state.emitAccountRateLimitsUpdated();
      return jsonResponse(rpcResult(
        body.id,
        toJson({
          rateLimits: {
            usedPercent: 0,
            credits: null,
            limitId: null,
            limitName: null,
            planType: null,
            primary: null,
            rateLimitReachedType: null,
            secondary: null,
          },
          rateLimitsByLimitId: null,
        }),
      ));
    case 'account/sendAddCreditsNudgeEmail':
      return jsonResponse(rpcResult(
        body.id,
        toJson({
          status: 'sent',
          email: typeof params.email === 'string' ? params.email : null,
        }),
      ));
    case 'configRequirements/read':
      return jsonResponse(rpcResult(
        body.id,
        toJson({
          requirements: {
            allowedApprovalPolicies: null,
            allowedApprovalsReviewers: null,
            allowedSandboxModes: null,
            allowedWebSearchModes: null,
            allowManagedHooksOnly: null,
            featureRequirements: null,
            hooks: null,
            enforceResidency: null,
            network: null,
          },
        }),
      ));
    case 'account/read':
      state.emitAccountUpdated();
      return jsonResponse(rpcResult(
        body.id,
        toJson({
          account: {
            id: 'local',
            email: Deno.env.get('ACCOUNT_EMAIL') ?? null,
            name: Deno.env.get('ACCOUNT_NAME') ?? null,
          },
        }),
      ));
    case 'account/chatgptAuthTokens/refresh':
      return jsonResponse(rpcResult(
        body.id,
        toJson({
          refreshed: true,
          refreshedAt: new Date().toISOString(),
        }),
      ));
    case 'attestation/generate':
      return jsonResponse(rpcResult(body.id, toJson({ token: `attest_${crypto.randomUUID()}` })));
    case 'item/commandExecution/requestApproval':
      return jsonResponse(rpcResult(
        body.id,
        toJson({
          decision: 'accept',
        }),
      ));
    case 'item/fileChange/requestApproval':
      return jsonResponse(rpcResult(
        body.id,
        toJson({
          decision: 'accept',
        }),
      ));
    case 'item/tool/requestUserInput':
      state.emitUserInputRequest(
        String(params.threadId ?? ''),
        String(params.turnId ?? ''),
        String(params.itemId ?? crypto.randomUUID()),
      );
      return jsonResponse(rpcResult(
        body.id,
        toJson({
          answers: {
            default: { answers: ['continue'] },
          },
        }),
      ));
    case 'mcpServer/elicitation/request':
      state.emitMcpElicitationRequest(
        String(params.threadId ?? ''),
        typeof params.turnId === 'string' ? String(params.turnId) : null,
        String(params.serverName ?? 'local'),
      );
      return jsonResponse(rpcResult(
        body.id,
        toJson({
          action: 'accept',
          content: null,
          meta: null,
        }),
      ));
    case 'item/permissions/requestApproval':
      return jsonResponse(rpcResult(
        body.id,
        toJson({
          permissions: {},
          scope: 'turn',
          strictAutoReview: null,
        }),
      ));
    case 'item/tool/call':
      return jsonResponse(rpcResult(
        body.id,
        toJson({
          contentItems: [],
          success: true,
        }),
      ));
    case 'thread/realtime/start':
      state.emitRealtimeStarted(String(params.threadId ?? ''), String(params.version ?? 'v2'));
      return jsonResponse(rpcResult(
        body.id,
        toJson({
          turn: {
            id: crypto.randomUUID(),
            items: [],
            status: 'completed',
            createdAt: Math.floor(Date.now() / 1000),
            updatedAt: Math.floor(Date.now() / 1000),
            itemsView: 'full',
            startedAt: Math.floor(Date.now() / 1000),
            completedAt: Math.floor(Date.now() / 1000),
            durationMs: 0,
            error: null,
          },
        }),
      ));
    case 'thread/realtime/appendAudio':
      state.emitRealtimeItemAdded(String(params.threadId ?? ''), {
        type: 'audio',
        audio: params.audio ?? null,
      });
      state.emitRealtimeOutputAudioDelta(String(params.threadId ?? ''), String(params.audio ?? ''));
      return jsonResponse(rpcResult(body.id, toJson({})));
    case 'thread/realtime/appendText':
      state.emitRealtimeItemAdded(String(params.threadId ?? ''), {
        type: 'text',
        text: params.text ?? null,
      });
      state.emitRealtimeTranscriptDelta(
        String(params.threadId ?? ''),
        String(params.role ?? 'assistant'),
        String(params.text ?? ''),
      );
      state.emitRealtimeTranscriptDone(
        String(params.threadId ?? ''),
        String(params.role ?? 'assistant'),
        String(params.text ?? ''),
      );
      return jsonResponse(rpcResult(body.id, toJson({})));
    case 'thread/realtime/stop':
      state.emitRealtimeClosed(String(params.threadId ?? ''));
      return jsonResponse(rpcResult(body.id, toJson({})));
    case 'thread/realtime/listVoices':
      return jsonResponse(rpcResult(
        body.id,
        toJson({
          voices: [
            { id: 'alloy', name: 'Alloy' },
            { id: 'echo', name: 'Echo' },
            { id: 'fable', name: 'Fable' },
            { id: 'onyx', name: 'Onyx' },
            { id: 'nova', name: 'Nova' },
            { id: 'shimmer', name: 'Shimmer' },
          ],
        }),
      ));
    case 'config/mcpServer/reload':
      state.emitMcpServerStartupStatus(
        typeof params.name === 'string' ? params.name : 'local',
        'starting',
      );
      return jsonResponse(rpcResult(
        body.id,
        toJson({
          name: typeof params.name === 'string' ? params.name : 'local',
          reloaded: true,
        }),
      ));
    case 'mcpServerStatus/list':
      return jsonResponse(rpcResult(
        body.id,
        toJson({
          data: [
            {
              name: String(params.name ?? 'local'),
              tools: {},
              resources: [],
              resourceTemplates: [],
              authStatus: 'unsupported',
            },
          ],
          nextCursor: null,
        }),
      ));
    case 'mcpServer/resource/read':
      return jsonResponse(rpcResult(
        body.id,
        toJson({
          contents: [
            {
              uri: typeof params.uri === 'string' ? params.uri : '',
              mimeType: 'text/plain',
              text: '',
            },
          ],
        }),
      ));
    case 'mcpServer/tool/call':
      state.pushNotification({
        method: 'item/mcpToolCall/progress',
        params: {
          threadId: String(params.threadId ?? ''),
          turnId: String(params.turnId ?? ''),
          itemId: String(params.itemId ?? crypto.randomUUID()),
          message: String(params.message ?? 'called'),
        },
      });
      return jsonResponse(rpcResult(
        body.id,
        toJson({
          content: [
            {
              type: 'text',
              text: String(params.message ?? 'called'),
            },
          ],
          structuredContent: {
            ok: true,
            tool: String(params.tool ?? ''),
            server: String(params.server ?? 'local'),
          },
          isError: false,
          meta: {
            threadId: String(params.threadId ?? ''),
            turnId: typeof params.turnId === 'string' ? String(params.turnId) : null,
            itemId: String(params.itemId ?? ''),
          },
        }),
      ));
    case 'windowsSandbox/setupStart':
      state.emitWindowsSandboxSetupCompleted(
        String(params.mode ?? 'unelevated') as 'elevated' | 'unelevated',
      );
      return jsonResponse(rpcResult(
        body.id,
        toJson({
          started: true,
          mode: String(params.mode ?? 'unelevated'),
        }),
      ));
    case 'windowsSandbox/readiness':
      return jsonResponse(rpcResult(body.id, toJson({ status: 'ready' })));
    case 'feedback/upload':
      return jsonResponse(rpcResult(
        body.id,
        toJson({
          threadId: String(params.threadId ?? ''),
        }),
      ));
    case 'remoteControl/enable':
      state.pushNotification({
        method: 'remoteControl/status/changed',
        params: {
          status: 'connected',
          serverName: String(params.serverName ?? 'local'),
          installationId: String(params.installationId ?? 'local-installation'),
          environmentId: typeof params.environmentId === 'string' ? params.environmentId : null,
        },
      });
      return jsonResponse(rpcResult(
        body.id,
        toJson({
          status: 'connected',
          serverName: String(params.serverName ?? 'local'),
          installationId: String(params.installationId ?? 'local-installation'),
          environmentId: typeof params.environmentId === 'string' ? params.environmentId : null,
        }),
      ));
    case 'remoteControl/disable':
      state.pushNotification({
        method: 'remoteControl/status/changed',
        params: {
          status: 'disabled',
          serverName: String(params.serverName ?? 'local'),
          installationId: String(params.installationId ?? 'local-installation'),
          environmentId: typeof params.environmentId === 'string' ? params.environmentId : null,
        },
      });
      return jsonResponse(rpcResult(
        body.id,
        toJson({
          status: 'disabled',
          serverName: String(params.serverName ?? 'local'),
          installationId: String(params.installationId ?? 'local-installation'),
          environmentId: typeof params.environmentId === 'string' ? params.environmentId : null,
        }),
      ));
    case 'remoteControl/status/read':
      return jsonResponse(rpcResult(
        body.id,
        toJson({
          status: 'disabled',
          serverName: String(params.serverName ?? 'local'),
          installationId: String(params.installationId ?? 'local-installation'),
          environmentId: typeof params.environmentId === 'string' ? params.environmentId : null,
        }),
      ));
    case 'config/read':
      return jsonResponse(rpcResult(
        body.id,
        toJson({
          config: {
            host: config.host,
            port: config.port,
            responsesBaseUrl: config.responsesBaseUrl,
            chatBaseUrl: config.chatBaseUrl,
            defaultModel: config.defaultModel,
            authToken: config.authToken,
          },
          layers: [],
          origins: {},
        }),
      ));
    case 'externalAgentConfig/detect':
      return jsonResponse(rpcResult(
        body.id,
        toJson({
          items: [
            {
              itemType: 'AGENTS_MD',
              description: 'Agents.md in repository root',
              cwd: Deno.cwd(),
              details: {
                path: `${Deno.cwd()}/Agents.md`,
                exists: true,
              },
            },
            {
              itemType: 'CONFIG',
              description: '.env configuration',
              cwd: Deno.cwd(),
              details: {
                path: `${Deno.cwd()}/.env`,
                exists: true,
              },
            },
          ],
        }),
      ));
    case 'externalAgentConfig/import':
      state.emitExternalAgentConfigImportCompleted();
      return jsonResponse(rpcResult(
        body.id,
        toJson({
          imported: true,
          importedAt: new Date().toISOString(),
        }),
      ));
    case 'config/value/write':
    case 'config/batchWrite':
    case 'skills/config/write':
      return jsonResponse(
        rpcResult(
          body.id,
          toJson({
            filePath: Deno.cwd(),
            status: 'ok',
            version: '1',
          }),
        ),
      );
    case 'app/list':
      state.emitAppListUpdated();
      return jsonResponse(rpcResult(body.id, toJson({ data: [], nextCursor: null })));
    case 'experimentalFeature/list':
      return jsonResponse(rpcResult(
        body.id,
        toJson({
          data: [
            {
              name: 'reasoning',
              stage: 'stable',
              displayName: 'Reasoning',
              description: 'Reasoning item formatting.',
              announcement: null,
              enabled: true,
              defaultEnabled: true,
            },
          ],
          nextCursor: null,
        }),
      ));
    case 'experimentalFeature/enablement/set':
      return jsonResponse(rpcResult(body.id, toJson({ enablement: params.enablement ?? {} })));
    case 'collaborationMode/list':
      return jsonResponse(rpcResult(
        body.id,
        toJson({
          data: [
            {
              name: 'default',
              mode: null,
              model: config.defaultModel,
              reasoning_effort: null,
            },
          ],
        }),
      ));
    case 'fuzzyFileSearch':
      state.emitFuzzySearchUpdated(String(params.sessionId ?? ''), String(params.query ?? ''));
      state.emitFuzzySearchCompleted(String(params.sessionId ?? ''));
      return jsonResponse(rpcResult(
        body.id,
        toJson({
          files: String(params.query ?? '')
            ? [{
              path: String(params.query),
              score: 1,
            }]
            : [],
          query: String(params.query ?? ''),
        }),
      ));
    case 'fuzzyFileSearch/sessionStart':
    case 'fuzzyFileSearch/sessionUpdate':
    case 'fuzzyFileSearch/sessionStop':
      return jsonResponse(rpcResult(
        body.id,
        toJson({
          sessionId: String(params.sessionId ?? ''),
          status: body.method === 'fuzzyFileSearch/sessionStop' ? 'stopped' : 'ok',
        }),
      ));
    case 'serverRequest/resolved':
      state.emitServerRequestResolved(
        String(params.threadId ?? ''),
        String(params.requestId ?? ''),
      );
      return jsonResponse(rpcResult(
        body.id,
        toJson({
          threadId: String(params.threadId ?? ''),
          requestId: String(params.requestId ?? ''),
          resolved: true,
        }),
      ));
    case 'windows/worldWritableWarning':
      state.emitWindowsWorldWritableWarning();
      return jsonResponse(rpcResult(
        body.id,
        toJson({
          warned: true,
        }),
      ));
    case 'command/exec': {
      const processId = String(params.processId ?? crypto.randomUUID());
      const result = state.commandExec(
        Array.isArray(params.command) ? params.command.map(String) : ['true'],
        typeof params.cwd === 'string' ? params.cwd : Deno.cwd(),
      );
      if (result.stdout) state.emitCommandExecOutputDelta(processId, 'stdout', btoa(result.stdout));
      if (result.stderr) state.emitCommandExecOutputDelta(processId, 'stderr', btoa(result.stderr));
      return jsonResponse(rpcResult(body.id, toJson(result)));
    }
    case 'command/exec/write':
      return jsonResponse(
        rpcResult(body.id, toJson({ ok: state.commandExecWrite(String(params.processId ?? '')) })),
      );
    case 'command/exec/terminate':
      return jsonResponse(
        rpcResult(
          body.id,
          toJson({ ok: state.commandExecTerminate(String(params.processId ?? '')) }),
        ),
      );
    case 'command/exec/resize':
      return jsonResponse(
        rpcResult(body.id, toJson({ ok: state.commandExecResize(String(params.processId ?? '')) })),
      );
    case 'process/spawn':
      return jsonResponse(rpcResult(
        body.id,
        toJson(state.spawnProcess(
          Array.isArray(params.command) ? params.command.map(String) : ['true'],
          typeof params.cwd === 'string' ? params.cwd : Deno.cwd(),
          String(params.processHandle ?? crypto.randomUUID()),
        )),
      ));
    case 'process/writeStdin':
      return jsonResponse(
        rpcResult(
          body.id,
          toJson({ ok: state.writeProcessStdin(String(params.processHandle ?? '')) }),
        ),
      );
    case 'process/kill':
      return jsonResponse(
        rpcResult(body.id, toJson({ ok: state.killProcess(String(params.processHandle ?? '')) })),
      );
    case 'process/resizePty':
      return jsonResponse(
        rpcResult(body.id, toJson({ ok: state.resizeProcess(String(params.processHandle ?? '')) })),
      );
    default:
      return jsonResponse(rpcError(body.id, -32601, `unsupported method: ${body.method}`), 404);
  }
}

export async function handleHttp(req: Request, config: ProxyConfig): Promise<Response> {
  return handleHttpWithState(req, config, new HubState());
}

export async function handleHttpWithState(
  req: Request,
  config: ProxyConfig,
  state: HubState,
): Promise<Response> {
  const url = new URL(req.url);
  if (req.method === 'GET' && url.pathname === '/healthz') return new Response('ok');
  if (req.method === 'GET' && url.pathname === '/readyz') return new Response('ok');
  if (req.method === 'GET' && url.pathname === '/v1/models') {
    return await proxyOpenAI(url.pathname + url.search, req, config);
  }
  if (!hasValidAuth(req, config)) return jsonResponse({ error: 'unauthorized' }, 401);
  if (req.method === 'GET' && url.pathname === '/events') {
    const encoder = new TextEncoder();
    let interval: ReturnType<typeof setInterval> | undefined;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const flush = () => {
          for (const notification of state.drainNotifications()) {
            controller.enqueue(
              encoder.encode(
                `event: ${notification.method}\ndata: ${JSON.stringify(notification)}\n\n`,
              ),
            );
          }
        };
        interval = setInterval(flush, 50);
        flush();
      },
      cancel() {
        if (interval !== undefined) clearInterval(interval);
      },
    });
    return new Response(stream, {
      status: 200,
      headers: { 'content-type': 'text/event-stream; charset=utf-8' },
    });
  }
  if (url.pathname === '/rpc' && req.method === 'POST') return await handleRpc(req, state, config);
  if (url.pathname.startsWith('/v1/responses') || url.pathname.startsWith('/v1/chat/completions')) {
    const scenario = (globalThis as { HUBPROXY_SCENARIO?: ResponsesScenario }).HUBPROXY_SCENARIO;
    return scenario
      ? await mockResponsesOpenAI(url.pathname + url.search, req, config, scenario)
      : await proxyOpenAI(url.pathname + url.search, req, config);
  }
  return new Response('not found', { status: 404 });
}

export function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

export function asProxyResult(resp: Response): Promise<ProxyResult> {
  return resp.text().then((body) => ({
    status: resp.status,
    headers: {
      'content-type': resp.headers.get('content-type') ?? 'application/json; charset=utf-8',
    },
    body,
  }));
}
