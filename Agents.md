# Hubproxy Memory

## 已确认的事实

- 仓库当前是空壳，`hubproxy` 目录里没有实现源码，只有 `.data`、`.gitignore`、`.code_index` 和空的
  `Agents.md`。
- `.data` 只是测试输入，不是运行时配置源。真实配置要放 `.env`。
- `.data` 当前内容只是三行文本配置样本：上游 base URL、API key、默认模型；运行时仍以 `.env` 为准。
- 项目目标是做 Deno 中转站，兼容 `https://hub.linux.do/v1/chat/completions` 和
  `https://glm.zig.best/v1/responses`，并兼容 Codex 的 `thread/*`
  JSON-RPC、goal、agents、thinking、MCP、function call。
- 不能把 `function_call`、`custom_tool_call`、MCP tool call、agent/subagent 混成同一层。
- 不能凭想象补协议，必须以 Codex 本地源码和日志为准。
- 状态先用进程内内存实现，重启可丢失。

## 已确认的协议边界

- `POST /v1/responses` 的核心是 `input[]`，里面会出现
  `message`、`reasoning`、`function_call`、`function_call_output`、`custom_tool_call`、`custom_tool_call_output`、`tool_search_call`。
- 从本地 Codex 历史可以确认，客户端会接收 `thinking` / `reasoning`
  相关块，不能在代理层把它们吞掉或改写成普通消息。
- 工具往返要保持类型分层，`function_call_output`、`custom_tool_call_output`、`tool_search_output`、`mcp_tool_call_output`
  都要保留，不能合并成同一个输出类型。
- `thread/start`、`thread/resume`、`thread/list`、`thread/goal/set|get|clear` 是 app-server 的
  JSON-RPC 方法，不是 REST。
- `thread/goal/set` 返回/通知的 goal 结构包含
  `threadId`、`objective`、`status`、`tokenBudget`、`tokensUsed`、`timeUsedSeconds`、`createdAt`、`updatedAt`。
- `thread/goal/clear` 成功时返回 `{ cleared: true }` 并发送 `thread/goal/cleared`。
- `thread/started` 通知只带 `thread`。
- `thread/list` 响应至少需要 `data`、`nextCursor`、`backwardsCursor`。

## 已确认的实现约束

- 先做最小可运行实现，再逐步补完整协议。
- 先写 Deno 入口、配置加载、内存状态、路由分发、SSE 透传。
- 后续补 `chat/completions -> responses` 适配时也要保留真实 item 分层，不要把工具调用和 MCP 合并。
- 以后每次新增结论或修正假设，都先记到这里，避免重复分析。
- `.env` 现在已经落地，内容来自用户给出的
  `.data`：`RESPONSES_BASE_URL=https://hub.linux.do/v1`、`CHAT_BASE_URL=https://hub.linux.do/v1`、`OPENAI_API_KEY=...`、`DEFAULT_MODEL=models/gemma-4-31b-it`、`DATA_DIR=/home/vscode/projects/hubproxy/.data`。
- 已完成并验证：`deno test --allow-read --allow-write --allow-env --allow-net`，当前 5
  个测试通过，包括一个真实上游测试。
- 已确认 `responses` mock 已经能按 tool kind 统一写入 `output_kind`，下一步要把 request 输入里的
  tool output 也映射成相同的 event 结构，保证回流测试是闭环的。
- 当前已实现并验证的 Codex 协议面包括：`thread/start`、`thread/resume`、`thread/fork`、
  `thread/archive`、`thread/unarchive`、`thread/name/set`、`thread/metadata/update`、
  `thread/rollback`、`thread/list`、`thread/loaded/list`、`thread/read`、`thread/turns/list`、
  `thread/turns/items/list`、`thread/inject_items`、`thread/unsubscribe`、
  `thread/increment_elicitation`、`thread/decrement_elicitation`、`thread/goal/set|get|clear`、
  `thread/compact/start`、`thread/shellCommand`、`thread/approveGuardianDeniedAction`、
  `thread/backgroundTerminals/clean`、`thread/memoryMode/set`、`turn/start`、`turn/steer`、
  `turn/interrupt`、`memory/reset`。
- 当前测试状态：`deno test --allow-read --allow-write --allow-env --allow-net` 通过，11 个测试通过，
  其中包含真实上游 `chat/completions` 和 `responses` 流式测试。
- 验收复查结论：当前实现只覆盖了 Codex `common.rs` 里的 174 个请求方法中的 25 个， 还缺 149
  个，尤其是 `turn/*`、`memory/reset`、`fs/*`、`process/*`、`plugin/*`、`skills/*`、
  `hooks/list`、`account/*`、`model/list`、`review/start`、`remoteControl/*`、`mcpServer/*`、
  `fuzzyFileSearch/*`、`windowsSandbox/*`、`config/*`、`externalAgentConfig/*`、`attestation/generate`
  等大类。当前“11 个测试通过”只能证明本仓库局部实现可运行，不能证明“所有 Codex 协议测试”已完成。
- 已继续补齐的协议方法：`fs/readFile`、`fs/writeFile`、`fs/createDirectory`、
  `fs/getMetadata`、`fs/readDirectory`、`fs/remove`、`fs/copy`、`fs/watch`、`fs/unwatch`、
  `hooks/list`、`model/list`、`review/start`、`mcpServer/oauth/login`、`config/mcpServer/reload`、
  `mcpServerStatus/list`、`mcpServer/resource/read`、`mcpServer/tool/call`、`windowsSandbox/setupStart`、
  `windowsSandbox/readiness`、`config/read`、`externalAgentConfig/detect`、`externalAgentConfig/import`、
  `config/value/write`、`config/batchWrite`、`skills/config/write`、`app/list`、`feedback/upload`、
  `experimentalFeature/list`、`experimentalFeature/enablement/set`、`collaborationMode/list`、
  `remoteControl/enable`、`remoteControl/disable`、`remoteControl/status/read`、`fuzzyFileSearch`、
  `fuzzyFileSearch/sessionStart`、`fuzzyFileSearch/sessionUpdate`、`fuzzyFileSearch/sessionStop`、
  `command/exec`、`command/exec/write`、`command/exec/terminate`、`command/exec/resize`、
  `process/spawn`、`process/writeStdin`、`process/kill`、`process/resizePty`、
  `skills/list`、`marketplace/add`、`marketplace/remove`、`marketplace/upgrade`、`plugin/list`、
  `plugin/installed`、`plugin/read`、`plugin/skill/read`、`plugin/share/save`、
  `plugin/share/updateTargets`、`plugin/share/list`、`plugin/share/checkout`、
  `plugin/share/delete`、`plugin/install`、`plugin/uninstall`、`modelProvider/capabilities/read`、
  `mock/experimentalMethod`、`environment/add`、`account/login/start`、`account/login/cancel`、
  `account/logout`、`account/rateLimits/read`、`account/sendAddCreditsNudgeEmail`、
  `configRequirements/read`、`account/read`、`account/chatgptAuthTokens/refresh`、
  `attestation/generate`、`item/commandExecution/requestApproval`、`item/fileChange/requestApproval`、
  `item/tool/requestUserInput`、`mcpServer/elicitation/request`、`item/permissions/requestApproval`、
  `item/tool/call`、`thread/realtime/start`、`thread/realtime/appendAudio`、`thread/realtime/appendText`、
  `thread/realtime/stop`、`thread/realtime/listVoices`。
- 当前剩余 `common.rs` 方法里未覆盖的大多是服务端通知，不属于 `/rpc`
  客户端请求，后续不应再按请求差集硬补；应改为单独做 SSE/事件流映射验收。
- 已确认 `/events` 不是 Codex 原生 transport，但可以作为代理内部的 SSE 事件桥，当前已能输出
  `thread/started`、`turn/started`、`item/started`、`item/completed`、`fs/changed`、`command/exec/outputDelta`、`process/outputDelta`、`process/exited`、`warning`、`deprecationNotice`、`configWarning`、`guardianWarning`、`mcpServer/startupStatus/updated`、`thread/realtime/*`
  等已验证通知。
- `command/exec/outputDelta` 的通知字段是 `processId`、`stream`、`deltaBase64`、`capReached`，不是
  `processHandle`。
- `process/exited` 是 `process/spawn` 的最终退出通知，字段是
  `processHandle`、`exitCode`、`stdout`、`stdoutCapReached`、`stderr`、`stderrCapReached`。
- `warning` 只要求 `message`，`guardianWarning` 要求 `message` 和 `threadId`，`deprecationNotice`
  只要求 `summary`，`configWarning` 只要求 `summary`，可选 `path`、`details`、`range`。
- `thread/realtime/started` 需要 `threadId` 和 `version`，`realtimeSessionId` 可空。
- 2026-05-21 11:29
  对应的日志里，`Now reading all core source files to understand the implementation.` 后面紧跟
  `task_complete`，这条不是中断点，只是正常结束。
- Codex app-server 协议只声明 `mcpServerStatus/list`、`mcpServer/resource/read` 和
  `mcpServer/tool/call`；不要实现 `mcpServer/resource/list` 或 `mcpServer/resource/templates`
  这类不存在的 RPC。

## 需要继续完成

- 建立 Deno 工程文件。
- 实现 `/v1/responses`、`/v1/chat/completions`、`/v1/models` 的基本转发/适配。
- 实现 `thread/*` JSON-RPC 的内存版。
- 实现 MCP 和 function call 的回流桥接。
