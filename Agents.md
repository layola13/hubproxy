# Hubproxy Memory

## 已确认的事实

- 仓库已进入 SA 重构实现阶段，`sa/` 目录包含 SA 版 HTTP server、RPC 分发、代理、配置、状态、
  字符串工具和 SA contract 测试；早期“空壳”结论已过期。
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

## 2026-05-27 SA 重构注意事项

- SA 编译器/标准库目前可能有不完善或不一致处；遇到异常诊断时先查
  `/home/vscode/projects/sci/demos/`、`/home/vscode/projects/sci/docs/` 和 code index，不再用
  `/tmp` 自造语法验证作为主要依据。
- 已确认：borrowed `ptr` 参数在 return 前仍要显式 `!param`；按值传入 `ptr` 容易变成 owned active
  register，调用字符串 helper 时优先使用 `&reg`。
- 已确认：动态字段偏移不能写成 `store cfg+offset, ...`，要先 `slot = ptr_add cfg, offset` 再
  `store slot+0, ...`。
- 已确认：嵌套 `ptr_add` 容易被母指针释放顺序影响；结构体槽位建议直接算 absolute offset 后从
  state/cfg 根指针派生。
- 已修正：`sa_std/fs.sai` 与 runtime ABI 已统一。`sa_fs_read_file` 返回 `u64!`，payload 是 owned
  read-buffer handle；`sa_fs_read_buffer_data/len/free` 都接收 `u64` handle，`free` 返回 plain `i32`。
- 已确认：复杂函数里的循环标签可能没有稳定携带“首次在循环体内触达”的 `@const`/前置 extern
  形参状态，回边会报 `Active`/`Uninitialized` 或无关 extern 名称的 `PhiStateConflict`；临时做法是
  把纯 ABI import 后置，并在进入循环前零长度触达循环体会用到的常量。
- 已确认：当前 HTTP 插件实际有两层用法：`sa` CLI 通过 `SA_PLUGINS_HOME/installed/*/current/*.so`
  加载 `saasm_plugin_descriptor_v1`，因此 `sa skills` 能看到 `http-client` 和 `http-server` 命令；
  SA 业务代码则仍是普通 `@extern sa_http_*` ABI 调用，参考
  `/home/vscode/projects/sci/demos/rosetta/301_http_client_saasm/main.sa` 和
  `/home/vscode/projects/sci/demos/rosetta/302_http_server_saasm/main.sa`。
- 已修正：`sa build`/`build-exe`/`sa test` 会收集 verified module 里的 `.external` 函数名，在已安装
  插件库中查找导出这些符号的 `.so`，并把匹配库及对应 `-Wl,-rpath,...` 自动加入 native 链接输入。
  hubproxy 不再需要手写 `zig cc ... libhttp-*.so`。`ldd sa/hubproxy` 已确认链接到
  `/home/vscode/.local/share/sa_plugins/installed/http-server/current/libhttp-server.so` 和
  `/home/vscode/.local/share/sa_plugins/installed/http-client/current/libhttp-client.so`。
- 已确认：`sa_plugin_http_server` 的 `http-server scaffold` 生成的 `sa_http_server.sai` 只包含旧的
  `new/route/start/resp_new/resp_send` 五个声明，缺少当前插件实际导出的
  `accept/req_get_body/stream/free` 等接口；hubproxy 里的 `.sai` 需要按插件
  `src/http_saasm_api.zig` 和 rosetta demo 维护。
- 2026-05-27 当前 SA 版进展：`/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json` 已通过，
  生成 `/home/vscode/projects/hubproxy/sa/hubproxy`。服务必须从 `.env` 读取配置，当前 `.env`
  中 `PORT=28080`，Deno 版仍占用 `27787`，不要让 SA 使用 `27787`。
- 2026-05-27 端口级验证：SA hubproxy 监听 `0.0.0.0:28080`，Deno 监听 `0.0.0.0:27787`；
  `/healthz`、`/readyz` 无 token 返回 200；`/rpc` 无 token 返回 401；带 `.env` 中 `AUTH` token
  调用 `initialize` 返回 200；`/events` 返回 `text/event-stream` keepalive。
- 2026-05-27 后台启动注意：在 Codex 工具执行会话里，普通 `nohup ./hubproxy ... &` 可能随该会话结束被清理。
  当前稳定启动方式为：
  `(setsid ./hubproxy > hubproxy.sa.log 2>&1 < /dev/null & echo $! > hubproxy.sa.pid)`。
  已确认 PID `2290493` 监听 `28080`。
- 2026-05-27 新增 SA 业务回归：`sa/tests/test_http_contract.sa` 使用 SA `http-client` 插件真实访问
  正在运行的 `127.0.0.1:28080`，覆盖健康检查公开、RPC 鉴权失败和带 token 初始化成功。
- 2026-05-27 本轮实现进展：`sa/main.sa` 的 `fs/readFile`、`fs/writeFile`、
  `fs/createDirectory`、`fs/readDirectory` 已移除固定占位 JSON，改为从 JSON-RPC params 提取
  `path` / `dataBase64` 并调用 SA std FS helper。`fs/readFile` 返回真实 base64，
  `fs/writeFile` 解码 base64 后落盘，`fs/createDirectory` 递归建目录，`fs/readDirectory` 返回
  `{"entries":[{"name":...,"isDirectory":...,"isFile":...}]}`。
- 2026-05-27 本轮端口状态：当前 SA 版 PID `2671416` 监听 `0.0.0.0:28080`；Deno 版仍监听
  `0.0.0.0:27787`。不要让 SA 版本使用 `27787`。
- 2026-05-27 本轮 SA contract：`/home/vscode/.sa/bin/sa build tests/test_http_contract.sa -o tests/test_http_contract --json`
  通过；`./tests/test_http_contract` 真实请求 `127.0.0.1:28080` 并验证 `fs/createDirectory`、
  `fs/writeFile`、`fs/readFile`、`fs/readDirectory`。验证文件
  `sa/.testdata/http_contract/nested/file.txt` 内容为 `hello`。

## 2026-05-27 SA 编译器/安装修复记录

- 根因：LLVM-C backend 生成的 native LLVM module 缺少 target datalayout/triple。优化后，形如
  `{ i32, u64 }` 的 fallible ABI payload 会按错误布局被折叠，`load read_res+8 as u64` 被错误编译成
  从 64-bit 聚合值右移 32 位，导致 `sa_fs_read_file() -> u64!` 的 buffer handle 损坏。
- 修复：`/home/vscode/projects/sci/src/emit_llvm_llvmc_shim.c` 在 module 构建阶段应用 native target
  layout 和 default target triple，再进入 verifier/optimizer/emission。
- 回归：`/home/vscode/projects/sci/tests/cli_smoke.zig` 新增
  `extern u64 fallible return can be loaded from ABI payload offset`，通过 `sa_fs_read_file()` 读取文件并从
  `+8` 读取 `u64` handle，防止 fallible payload layout 再退化。
- 插件链接回归：`/home/vscode/projects/sci/tests/plugin_host_smoke.zig` 的
  `native build and test link installed plugin exporting referenced extern` 覆盖已安装插件导出符号的
  native build/test 自动链接。
- 安装：已运行 `/home/vscode/projects/sci/tools/install.sh --no-shell`，从源码使用
  `zig build -Doptimize=ReleaseFast` 打包安装到 `/home/vscode/.sa`。安装态
  `/home/vscode/.sa/std/fs.sai` 和 `/home/vscode/.sa/std/sa_std.h` 已确认 ABI 一致。
- 2026-05-27 本轮复核后的第二层根因：SA-facing std 接口仍混用了旧的 owned pointer ABI 和新的 runtime
  handle ABI。`fmt/env/fs/string_concat` 的 runtime 实际返回 `u64` resource handle，data/len/free
  也按 `u64` handle 工作；旧 `.sai` 和 `PRINT!/FORMAT!` 展开还会生成 `^ptr!`、`&buffer`、
  `sa_fmt_buffer_free(...) -> i32!` 等形状，导致 SA 代码和 runtime/header ABI 不一致。
- 已修复：`sa_std/fmt.sai`、`sa_std/env.sai`、`sa_std/fs.sai`、`sa_std/string_format.sa`、
  `sa_std/io.sa`、`src/runtime/sa_std.zig`、`src/runtime/sa_std.h` 已统一到 `u64` handle ABI。
  `src/flattener.zig` 的 `PRINT!/FORMAT!` 自动展开也改为直接接收 `sa_fmt_* -> u64`，通过
  `sa_fmt_buffer_data(handle)` / `sa_fmt_buffer_len(handle)` 读取，再用
  `sa_fmt_buffer_free(^handle) -> i32` 释放，不再生成旧的 fallible fmt buffer 或 `&buffer` 调用。
- 已加回归：`src/flattener.zig` 的 `PRINT! and FORMAT! macro static expansion` 覆盖新 fmt handle
  展开形状，并明确防止回退到 `sa_fmt_buffer_data(&...)` 或对 fmt buffer 做 `?` early-return。
- 已验证的编译器测试：`zig test src/flattener.zig`、`zig build llvmc-test --summary none`、
  `zig build plugin-host-smoke --summary none`、`zig build smoke --summary none`、
  `zig build test --summary none` 均返回 0。
- 已重新安装：`/home/vscode/projects/sci/tools/install.sh --no-shell` 已再次以
  `zig build -Doptimize=ReleaseFast` 构建并安装到 `/home/vscode/.sa`。
  安装态 `/home/vscode/.sa/std/fmt.sai`、`env.sai`、`fs.sai`、`sa_std.h` 已确认仍保持 `u64`
  handle ABI。
- 安装态 HTTP 插件验证：使用 `/home/vscode/.sa/bin/sa build main.sa -o main.installed.verify --json`
  成功构建官方 `demos/rosetta/301_http_client_saasm` 和 `302_http_server_saasm`。`ldd`
  确认 client demo 自动链接
  `/home/vscode/.local/share/sa_plugins/installed/http-client/current/libhttp-client.so`，server demo
  自动链接
  `/home/vscode/.local/share/sa_plugins/installed/http-server/current/libhttp-server.so`，未出现
  `sa_http_*` undefined symbol 或 `not found`。
- 2026-05-27 本轮 SCI/std 根因：Codex app-server FS RPC 需要 base64 文件读写和目录枚举，但
  `sa_std/fs.sai` 与 `src/runtime/sa_std.zig` 没有 generic base64 文件 helper，也没有返回 JSON
  目录 entries 的 owned buffer helper；同时 `sa_fs_make_dir` 使用单层 `makeDir`，不匹配 Deno
  `mkdirSync(..., { recursive: true })` 的递归语义。
- 2026-05-27 本轮 SCI/std 修复：`src/runtime/sa_std.zig`、`src/runtime/sa_std.h`、`sa_std/fs.sai`
  新增 `sa_fs_read_file_base64`、`sa_fs_write_file_base64`、`sa_fs_read_dir_json`、
  `sa_fs_dir_buffer_data/len/free`，并把 `sa_fs_make_dir` 改为 `std.fs.cwd().makePath(path)`。
  新增 `FsDirBufferHandle` 资源变体，目录 JSON buffer 通过 std resource registry 管理和释放。
- 2026-05-27 本轮 SCI 回归：`tests/std_smoke.zig` 新增
  `sa_std fs base64 and directory helpers are usable from C`，覆盖递归建目录、重复建目录、base64
  写入、base64 读取、目录 JSON 枚举和 buffer free。已运行
  `zig build std-smoke --summary none`，返回 0。
- 2026-05-27 本轮安装：已再次运行 `/home/vscode/projects/sci/tools/install.sh --no-shell`，
  以 `zig build -Doptimize=ReleaseFast` 安装到 `/home/vscode/.sa`。安装态
  `/home/vscode/.sa/std/fs.sai` 已包含本轮 FS helper。

## 2026-05-28 SA detached pthread 与 /events 修复记录

- 根因：SA HubProxy 的 `/events` 不能在当前同步 `accept -> handle -> next accept` HTTP 插件模型中
  直接阻塞维持长连接，否则服务器无法继续处理触发事件的 `/rpc` 请求；旧实现只能发送一次
  `: keepalive` 后关闭。SCI 源码虽已补过 `pthread_spawn_detached`，但安装态
  `/home/vscode/.sa/std/libsa_std.a` 没导出该符号，导致 HubProxy 编译到链接阶段报
  `undefined symbol: pthread_spawn_detached`。
- SCI 修复：`/home/vscode/projects/sci/src/runtime/sa_std.zig` 已加入 detached pthread runtime
  export，`PthreadTask` 支持 detached 任务完成后自毁；`src/runtime/sa_std.h` 暴露
  `pthread_spawn_detached`；`tests/sa_std_runtime.zig` 增加
  `sa_std detached pthread export runs without join`，覆盖无需 join 的线程执行。
- SCI 验证与安装：已运行 `zig build std-smoke --summary none`、
  `zig build plugin-host-smoke --summary none`、`zig build test --summary none`，均返回 0；
  已运行 `/home/vscode/projects/sci/tools/install.sh --no-shell`，ReleaseFast 安装到
  `/home/vscode/.sa`。安装态 `nm -g /home/vscode/.sa/std/libsa_std.a` 已确认导出
  `pthread_spawn_detached`。
- HubProxy 修复：`sa/src/state.sai`、`sa/src/state.sa` 增加状态通知 ring buffer；
  `sa/main.sa` 增加 SSE frame builder、事件 stream worker 和 `spawn_event_stream`，
  `/events` 现在分配 context 后用 detached pthread 持有 request 并持续读取通知环，不再在主
  HTTP handler 中关闭请求。通知读取已从全局 `pop` 改为 per-connection cursor 广播语义，避免
  断开的旧 `/events` worker 抢走新连接的后续事件。
- HTTP 插件修复：`/home/vscode/projects/sa_plugins/sa_plugin_http_server/src/http_saasm_api.zig`
  在 `sa_http_server_new` 初始化时安装进程级 SIGPIPE no-op handler；SSE 客户端断开时，写入返回
  `BrokenPipe`/失败状态，而不是由内核 SIGPIPE 直接终止整个 HubProxy 进程。已运行
  `zig build test`（包含 `http server runtime installs SIGPIPE handler for broken SSE sockets` 回归）、
  `zig build -Doptimize=ReleaseFast`，并用
  `/home/vscode/projects/sa_plugins/scripts/plugin-manager.sh install http-server` 安装新版插件。
- HubProxy 通知覆盖：`thread/start` 和 `thread/fork` 推送 `thread/started` 与
  `thread/status/changed`；`thread/archive` 推送 `thread/archived` 与 `thread/closed`；
  `turn/start` 推送 `turn/started`、`turn/diff/updated`、`turn/plan/updated`；
  `turn/interrupt` 推送 `turn/completed`；`thread/goal/set` 推送 `thread/goal/updated`；
  `thread/goal/clear` 成功时推送 `thread/goal/cleared`。
- HubProxy 构建/运行：已使用系统安装态 `/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json`
  构建成功。已重启 SA 版，当前 PID `2880138` 监听 `0.0.0.0:28080`；Deno 版仍监听 `0.0.0.0:27787`，不要让
  SA 使用 `27787`。
- 回归：已重新构建并运行 `./tests/test_config`、`./tests/test_state`、
  `./tests/test_strings`、`./tests/test_http_contract`，均返回 0；`./tests/test_state`
  新增 `notify_broadcast`，验证两个 cursor 可以独立读取同一个通知帧。新增
  `sa/tests/test_events_contract.sh`，真实连接 `http://127.0.0.1:28080/events` 后触发
  `thread/start` 和 `turn/start`，断言同一 SSE 流收到 `event: thread/started` 与
  `event: turn/started`，防止 `/events` 退回 keepalive 占位；已连续运行三轮通过，确认旧连接断开后
  新连接仍能收到事件且 SA 进程保持监听。

## 2026-05-28 SA std FS metadata/copy/remove 根因修复记录

- 根因：Deno `fs/getMetadata`、`fs/remove`、`fs/copy` 需要 `lstat` metadata、递归删除和文件复制语义；
  但安装前的 `sa_std/fs.sai` 只暴露了旧的 `sa_fs_metadata -> ^ptr!` 声明，runtime 实际返回截断的
  `i32` handle，C 头也没有 metadata/remove/rename/remove_dir/copy 完整声明，HubProxy 无法在 SA
  构建链内真实实现这些 RPC。
- SCI 修复：`/home/vscode/projects/sci/src/runtime/sa_std.zig`、`src/runtime/sa_std.h`、
  `sa_std/fs.sai` 已统一 metadata 到 `u64!` resource handle，并新增
  `sa_fs_metadata_json`（返回可用 `sa_fs_read_buffer_data/len/free` 读取的 JSON buffer）、
  `sa_fs_metadata_is_file/is_directory/is_symlink/modified_ms/created_ms`、`sa_fs_remove_path` 和
  `sa_fs_copy_file`。`sa_fs_read_dir_json` 也改为复用通用 read buffer resource，避免重复 buffer ABI。
- SCI 回归与安装：`tests/std_smoke.zig` 新增 C 侧回归，覆盖 base64 读写、目录 JSON、metadata JSON、
  metadata handle accessor、copy 和递归 remove。已运行 `zig build std-smoke --summary none`、
  `zig build test --summary none`，均返回 0；随后运行
  `/home/vscode/projects/sci/tools/install.sh --no-shell`，ReleaseFast 安装到 `/home/vscode/.sa`。
  安装态 `nm -g /home/vscode/.sa/std/libsa_std.a` 已确认导出
  `sa_fs_metadata`、`sa_fs_metadata_json`、`sa_fs_remove_path`、`sa_fs_copy_file`。
- HubProxy 修复：`sa/main.sa` 新增 `fs/getMetadata`、`fs/remove`、`fs/copy` RPC 分发和实现。
  `fs/getMetadata` 直接返回 std 生成的 metadata JSON；`fs/remove` 调用递归 `sa_fs_remove_path`；
  `fs/copy` 从 params 提取 `sourcePath`/`destinationPath` 并调用 `sa_fs_copy_file`。
- HubProxy 回归：已用系统安装态 `/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json` 和
  `/home/vscode/.sa/bin/sa build tests/test_http_contract.sa -o tests/test_http_contract --json`
  构建通过。已重启 SA 版，当前 PID `2904265` 监听 `0.0.0.0:28080`；Deno 版仍监听
  `0.0.0.0:27787`。已运行 `./tests/test_config && ./tests/test_state && ./tests/test_strings &&
  ./tests/test_http_contract && ./tests/test_events_contract.sh`，全部返回 0。`test_http_contract`
  现在真实覆盖 `fs/getMetadata`、`fs/copy`、复制后 `fs/readFile` 和 `fs/remove`。

## 2026-05-28 SA JSON-RPC coverage 扩展记录

- 本轮以 Deno `src/handlers.ts` 为基准继续补协议面，没有把已有 FS 子集当完成。新增 SA RPC：
  `thread/loaded/list`、`thread/turns/items/list`、`memory/reset`、`hooks/list`。
- 实现边界：`thread/loaded/list` 基于当前 SA 内存 state 的 active thread id 列表返回
  `{ data: [...], nextCursor: null }`；`thread/turns/items/list` 返回当前 SA turn 模型中真实的空 items
  分页结构；`memory/reset` 按 Deno 行为返回 `{ reset: true, threadId }`；`hooks/list` 使用
  `sa_env_get("PWD")` 读取真实运行 cwd，缺失时回退 `.env` 的 `DATA_DIR`。
- 合同测试：`sa/tests/test_http_contract.sa` 已扩展真实 `/rpc` 请求，覆盖上述四个方法：
  `thread/loaded/list` 断言 `nextCursor`，`thread/turns/items/list` 断言 `backwardsCursor`，
  `memory/reset` 断言 `reset: true`，`hooks/list` 断言 `hooks: []`。
- 构建/运行：已用系统安装态 `/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json` 和
  `/home/vscode/.sa/bin/sa build tests/test_http_contract.sa -o tests/test_http_contract --json`
  构建通过。已重启 SA 版，当前 PID `2914355` 监听 `0.0.0.0:28080`；Deno 版仍监听
  `0.0.0.0:27787`，SA 仍未使用 `27787`。
- 回归：已运行 `./tests/test_config && ./tests/test_state && ./tests/test_strings &&
  ./tests/test_http_contract && ./tests/test_events_contract.sh`，全部返回 0。

## 2026-05-28 SA thread/turn state RPC 扩展记录

- 本轮继续补 Deno `src/handlers.ts` 中有真实状态语义的方法，新增 SA RPC：
  `thread/unarchive`、`thread/rollback`、`turn/steer`。
- State 修复：`sa/src/state.sai`、`sa/src/state.sa` 新增 `state_thread_unarchive`、
  `state_turn_find`、`state_turn_rollback`。`state_turn_rollback` 会按 thread 统计 active turns，
  保留前 N 个并把被回滚的后续 turns 标记 inactive，后续 `state_turn_list` 不再返回这些 turn。
- RPC 行为：`thread/unarchive` 会恢复 archived thread 的 active 标记，推送 `thread/unarchived` 和
  `thread/status/changed`，并返回 `{ thread }`；`thread/rollback` 调用 state rollback 后返回当前
  `{ thread }`；`turn/steer` 验证指定 `threadId`/`expectedTurnId` 下 active turn 存在后返回
  `{ turnId }`，不存在时返回 Deno 兼容的 `turn not found`。
- 回归：`sa/tests/test_state.sa` 已扩展为 `thread_archive_unarchive` 和
  `turn_create_rollback`，直接覆盖 state 层恢复与 rollback。`sa/tests/test_http_contract.sa`
  现在先通过真实 `/rpc` 创建 thread/turn，再验证 `turn/steer`、`thread/archive`、
  `thread/unarchive`、`thread/rollback`。
- 构建/运行：已用系统安装态 `/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json`、
  `/home/vscode/.sa/bin/sa build tests/test_state.sa -o tests/test_state --json`、
  `/home/vscode/.sa/bin/sa build tests/test_http_contract.sa -o tests/test_http_contract --json`
  构建通过。已重启 SA 版，当前 PID `2923512` 监听 `0.0.0.0:28080`；Deno 版仍监听
  `0.0.0.0:27787`。
- 已在干净 SA 服务状态下运行 `./tests/test_config && ./tests/test_state && ./tests/test_strings &&
  ./tests/test_http_contract && ./tests/test_events_contract.sh`，全部返回 0；`events_contract` 动态解析
  thread id，本轮在 `test_http_contract` 预先创建 thread/turn 后仍通过，返回 `thread=3`。

## 需要继续完成

- 2026-05-28 追加：SA `thread/read` 原先无视 `includeTurns`，`thread/resume`/`thread/unarchive`/`thread/rollback`
  也复用只带空 `turns: []` 的 thread 序列化，和 Deno `HubState.resumeThread(..., includeTurns=true)`、
  `thread/read { includeTurns: true }` 行为不一致。已在 `sa/main.sa` 拆出
  `rpc_builder_append_thread_open`，并让 `send_rpc_thread_read(..., include_turns)` 在需要时从
  `state_turn_list` 序列化真实 turn 列表；普通 read 仍返回空 `turns`。`sa/tests/test_http_contract.sa`
  新增真实 `/rpc` 回归，创建 turn 后调用 `thread/read includeTurns=true`，断言返回包含
  `"turns":[{"id":"2"`，防止退回空数组。已用安装态 `/home/vscode/.sa/bin/sa` 构建并重启
  SA hubproxy，PID `2995795` 监听 `0.0.0.0:28080`；Deno 仍监听 `0.0.0.0:27787`。本轮验证：
  `./tests/test_config`、`./tests/test_state`、`./tests/test_strings`、`./tests/test_http_contract`、
  `./tests/test_events_contract.sh` 全部返回 0。SCI 侧同步跑过 `zig build std-smoke --summary none`、
  `zig build plugin-host-smoke --summary none`、`zig build test --summary none`，并重新执行
  `/home/vscode/projects/sci/tools/install.sh --no-shell` ReleaseFast 安装到 `/home/vscode/.sa`。

- 2026-05-28 09:28 追加：SA `command/exec` 已走真实 `sa_std_process_run`，不再空响应；根因在 SCI
  runtime 的 `envpFromCurrentProcess` 已修复为 SA-built executable 下读取 libc `environ`。HubProxy
  `sa/main.sa` 的 `command/exec` 会解析 `command[]` 和 `processId`，等待子进程，读取 stdout/stderr，
  返回 `{ exitCode, stdout, stderr }`，并推送 `command/exec/outputDelta`。已用 `id=58` 的直接 RPC
  验证返回 `{"jsonrpc":"2.0","id":58,"result":{"exitCode":0,"stdout":"hi\n","stderr":""}}`。
- 2026-05-28 09:28 追加：SA JSON-RPC 响应不应继续硬编码 `"id":1`。`sa/main.sa`
  新增 `rpc_extract_id_token`，在 `handle_rpc_request` 入口提取请求 id，并让当前 result 响应路径通过
  `send_wrapped_*_with_id` 回显原始 id token；`initialize`、account/config/unsubscribe、thread/turn/goal、
  FS、hooks/model、memory、command/exec 等当前合约覆盖的成功响应已切换到动态 id。当前错误响应路径也
  通过 `send_error_with_id` 包装，unknown method 已直接验证返回请求 `id=35`，不再退回 `null/1`。
- 2026-05-28 09:28 本轮构建/运行：已用 `/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json`
  构建成功，并只重启 `28080` 上的 SA 进程；Deno 仍监听 `27787`。当前 `ss` 确认
  `hubproxy` PID `3336027` 监听 `0.0.0.0:28080`，`deno` PID `3331494` 监听 `0.0.0.0:27787`。
  已重新构建 `sa/tests/test_http_contract.sa`，把初始化 id 改成 `9` 并新增 `command/exec`
  响应 `"id":58`、unknown method 错误响应 `"id":35` 断言，防止硬编码 id 回归。
- 2026-05-28 09:28 本轮回归：`./tests/test_config && ./tests/test_strings && ./tests/test_state &&
  ./tests/test_server_config && ./tests/test_http_contract && ./tests/test_events_contract.sh` 全部返回 0。

- 2026-05-28 09:37 追加：SA 继续补齐 Deno `src/handlers.ts` 中无外部副作用的查询/配置类
  JSON-RPC。新增覆盖 `skills/list`、`plugin/list`、`plugin/installed`、`plugin/skill/read`、
  `plugin/install`、`modelProvider/capabilities/read`、`app/list`、`experimentalFeature/list`、
  `collaborationMode/list`、`remoteControl/status/read`、`windowsSandbox/readiness`、`config/read`。
  其中 `config/read` 不硬编码，直接从 `.env` 加载后的 `cfg` 输出 host、port、responsesBaseUrl、
  chatBaseUrl、defaultModel 和 authToken；其它方法按 Deno 当前实现返回空集合或固定能力结果。
- 2026-05-28 09:37 本轮回归：已用 `/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json`
  构建 SA 主程序；已用 `/home/vscode/.sa/bin/sa build test_http_contract.sa -o test_http_contract --json`
  构建扩展后的合约测试。`sa/tests/test_http_contract.sa` 新增真实 HTTP 断言：
  `config/read` 包含 `"host":"0.0.0.0"` 和 `"port":28080`，`skills/list` 返回 `"data":[]`，
  `plugin/list` 返回 `"marketplaces":[]`，`modelProvider/capabilities/read` 返回
  `"namespaceTools":true`，`collaborationMode/list` 返回 `"mode":"plan"`，
  `windowsSandbox/readiness` 返回 `"status":"ready"`。
- 2026-05-28 09:37 当前运行/端口：最终确认 SA 版监听 `0.0.0.0:28080`，PID `3344597`；Deno 版监听
  `0.0.0.0:27787`，PID `3343969`。已运行 `./tests/test_config && ./tests/test_strings && ./tests/test_state &&
  ./tests/test_server_config && ./tests/test_http_contract && ./tests/test_events_contract.sh`，全部返回 0。

- 2026-05-28 09:42 追加：SA 继续补齐 Deno `src/handlers.ts` 中当前为固定/默认结果的 JSON-RPC：
  `plugin/share/list`、`account/login/cancel`、`account/logout`、`account/rateLimits/read`、
  `account/chatgptAuthTokens/refresh`、`attestation/generate`、
  `item/commandExecution/requestApproval`、`item/fileChange/requestApproval`、
  `mcpServer/elicitation/request`、`item/permissions/requestApproval`、`feedback/upload`、
  `config/value/write`、`config/batchWrite`、`skills/config/write`。这些方法先对齐 Deno 当前返回形状；
  需要回显复杂 params 的 `plugin/read/share/save/share/checkout/share/delete`、`environment/add`、
  `review/start`、`mcpServer/oauth/login`、`account/login/start`、`item/tool/requestUserInput` 等还未完整
  SA 化，后续应继续补。
- 2026-05-28 09:42 本轮合约：`sa/tests/test_http_contract.sa` 新增真实 HTTP 断言：
  `plugin/share/list` 的 `nextCursor`、`account/logout` 的 `loggedOut:true`、`account/rateLimits/read` 的
  `rateLimitsByLimitId:null`、`attestation/generate` 的 `token:"attest_sa"`、审批类的
  `decision:"accept"`、`mcpServer/elicitation/request` 的 `action:"accept"`、
  `item/permissions/requestApproval` 的 `scope:"turn"`、`config/value/write` 的 `status:"ok"`。
- 2026-05-28 09:42 本轮验证：已用 `/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json` 和
  `/home/vscode/.sa/bin/sa build test_http_contract.sa -o test_http_contract --json` 构建成功；已只重启 SA
  到 `0.0.0.0:28080`，PID `3348336`，Deno 仍在 `0.0.0.0:27787`，PID `3343969`。已运行
  `./tests/test_config && ./tests/test_strings && ./tests/test_state && ./tests/test_server_config &&
  ./tests/test_http_contract && ./tests/test_events_contract.sh`，全部返回 0。

- 2026-05-28 追加：SA 继续补齐 Deno `src/handlers.ts` 中带参数回显或依赖配置的 JSON-RPC：
  `plugin/read`、`plugin/share/save`、`plugin/share/updateTargets`、`plugin/share/checkout`、
  `plugin/share/delete`、`plugin/uninstall`、`marketplace/add`、`marketplace/remove`、
  `marketplace/upgrade`、`account/login/start`、`environment/add`、`review/start`、
  `mcpServer/oauth/login`、`mock/experimentalMethod`。新增了
  `rpc_builder_append_param_string_or_default` 和 `rpc_builder_append_param_string_or_null`，避免各方法重复
  写 SA 分支账本；`plugin/share/save` 和 `mcpServer/oauth/login` 使用 `.env` 加载后的 `cfg.host/cfg.port`
  生成 URL，没有写死端口配置。
- 2026-05-28 追加：本轮发现并修复一个 SA 常量长度根因问题：`J_PLUGIN_READ_C_LEN` 误写为 `51`，实际
  UTF-8 长度为 `47`，导致 JSON builder 把后续常量内存拼进 `plugin/read` 响应，HTTP 合约在
  `panic(275)` 处失败。已改为 `47`，并用脚本核对本轮新增的 `J_*`/`RPC_M_*`/默认常量长度，防止类似
  内存越界式拼接回归。
- 2026-05-28 本轮合约：`sa/tests/test_http_contract.sa` 新增真实 28080 HTTP 断言，覆盖
  `plugin/read` 回显 `pluginName` 且默认 `marketplaceName:"local"`，`plugin/share/*` 结果形状，
  `plugin/uninstall`、`marketplace/*`、`account/login/start`、`environment/add`、`review/start`、
  `mcpServer/oauth/login` 和 `mock/experimentalMethod`。重新构建测试后二次回归时发现该测试依赖干净
  SA 服务内存状态（thread id 从 1 开始），因此最终验证前先只重启 28080 的 SA 进程，未触碰 27787 的
  Deno 进程。
- 2026-05-28 本轮验证：`/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json` 和
  `/home/vscode/.sa/bin/sa build test_http_contract.sa -o test_http_contract --json` 均成功。最终端口：
  SA `hubproxy` PID `3359911` 监听 `0.0.0.0:28080`，Deno PID `3343969` 监听 `0.0.0.0:27787`。
  最终从干净 SA 服务状态运行 `./tests/test_config && ./tests/test_strings && ./tests/test_state &&
  ./tests/test_server_config && ./tests/test_http_contract && ./tests/test_events_contract.sh`，全部返回 0，
  `events_contract_ok thread=4`。

- 2026-05-28 追加：用户将根目录 `.env` 改为 `PORT=27787` 给 Deno、`SA_PORT=28080` 给 SA。根因确认：
  SA 之前从 `hubproxy/sa/.env` 读取 `PORT`，且 `cfg_parse_line` 只识别 `PORT`，会和 Deno 配置冲突；改成
  识别 `SA_PORT` 后又因为工作目录仍在 `hubproxy/sa`，实际读到旧的 `sa/.env`，导致服务落到默认
  `8787`。已修复为 SA 主程序和 SA 测试统一读取根目录 `../.env`，`cfg_parse_line` 只把 `SA_PORT`
  写入 `CFG_PORT`，普通 `PORT` 不影响 SA。已清理误启动的 `8787` 进程。
- 2026-05-28 端口验证：重新构建 `main.sa`、`tests/test_config.sa`、`tests/test_server_config.sa`、
  `tests/test_http_contract.sa` 成功；只重启 SA 后确认 `hubproxy` PID `3365922` 监听 `0.0.0.0:28080`，
  Deno PID `3343969` 仍监听 `0.0.0.0:27787`。运行
  `./tests/test_config && ./tests/test_strings && ./tests/test_state && ./tests/test_server_config &&
  ./tests/test_http_contract && ./tests/test_events_contract.sh` 全部返回 0，`events_contract_ok thread=4`。

- 2026-05-28 追加：SA 继续补齐 Deno `src/handlers.ts` 中当前可用默认/回显语义实现的 JSON-RPC：
  `thread/inject_items`、`thread/compact/start`、`thread/shellCommand`、
  `thread/approveGuardianDeniedAction`、`thread/backgroundTerminals/clean`、`thread/memoryMode/set`、
  `account/sendAddCreditsNudgeEmail`、`item/tool/requestUserInput`、`item/tool/call`、
  `externalAgentConfig/detect`、`externalAgentConfig/import`、`thread/realtime/listVoices`、
  `mcpServerStatus/list`、`mcpServer/resource/read`、`remoteControl/enable`、
  `remoteControl/disable`、`windowsSandbox/setupStart`、`experimentalFeature/enablement/set`、
  `fuzzyFileSearch`、`fuzzyFileSearch/sessionStart`、`fuzzyFileSearch/sessionUpdate`、
  `fuzzyFileSearch/sessionStop`、`serverRequest/resolved`、`windows/worldWritableWarning`、
  `command/exec/write`、`command/exec/terminate`、`command/exec/resize`、`process/spawn`、
  `process/writeStdin`、`process/kill`、`process/resizePty`。其中 command/process 控制类目前按 Deno
  内存状态缺省返回 `ok:false` 或静态 spawn 结果，真实 PTY/process lifecycle 后续仍需单独实现。
- 2026-05-28 编译器问题记录：SA 当前 parser/diagnostic 会把局部寄存器名里的 `call` 子串误判到
  `call @...` 语法附近，表现为 `ForbiddenSyntax invalid call syntax`，例如局部名
  `m_tool_call_idx` 触发诊断源行显示 `... &RPC_M_ITEM_TOOL_RUN, 16)`。已在 hubproxy 中规避为
  `m_tool_idx` / `RPC_M_ITEM_TOOL_RUN` / `J_TOOL_RESULT`。后续应在 SCI 编译器 lexer/parser 层修复，
  标识符中出现关键字子串不应影响 call 语法解析。
- 2026-05-28 本轮合约：`sa/tests/test_http_contract.sa` 新增真实 28080 HTTP 断言，覆盖上述新接入
  RPC 的代表性返回字段：`injectedCount`、`compacted`、`queued`、`approved`、`cleaned`、
  `memoryMode`、邮件回显、user input answers、tool success、external detect/import、voices、
  MCP status/resource、remote connected、sandbox setup started、fuzzy query/session/stop、server
  request resolved、world warning、command `ok:false`、process spawn handle。
- 2026-05-28 本轮验证：`/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json` 和
  `/home/vscode/.sa/bin/sa build tests/test_http_contract.sa -o tests/test_http_contract --json` 均成功。
  只重启 SA 后确认 `hubproxy` PID `3369688` 监听 `0.0.0.0:28080`，Deno PID `3343969` 仍监听
  `0.0.0.0:27787`。运行 `./tests/test_config && ./tests/test_strings && ./tests/test_state &&
  ./tests/test_server_config && ./tests/test_http_contract && ./tests/test_events_contract.sh` 全部返回 0，
  `events_contract_ok thread=4`。

- 2026-05-28 追加：SA `/events` 语义补齐一批 Deno 等价通知。`remoteControl/enable|disable` 现在推送
  `remoteControl/status/changed`，`windowsSandbox/setupStart` 推送 `windowsSandbox/setupCompleted`，
  `externalAgentConfig/import` 推送 `externalAgentConfig/import/completed`，`config/mcpServer/reload` 推送
  `mcpServer/startupStatus/updated`，`windows/worldWritableWarning` 推送
  `windows/worldWritableWarning`，`item/tool/call` 与 `mcpServer/tool/call` 推送
  `item/mcpToolCall/progress`。实时接口补齐 `thread/realtime/started`、`itemAdded`、
  `outputAudio/delta`、`transcript/delta`、`transcript/done`、`closed`。当前通知参数仍是 SA 侧可稳定
  构造的简化形状，后续若需要完全 UI 兼容，需要继续回显 `turnId/itemId/message/text/audio/version` 等请求字段。
- 2026-05-28 追加测试：`sa/tests/test_events_contract.sh` 不再写死端口，改从根目录 `.env` 读取
  `SA_PORT`（缺省 28080），并用真实 SSE 连接断言上述新事件。重新构建 `main.sa` 和
  `tests/test_http_contract.sa` 成功；只重启 SA 后确认 `hubproxy` PID `3375217` 监听
  `0.0.0.0:28080`，Deno PID `3343969` 仍监听 `0.0.0.0:27787`。运行
  `./tests/test_config && ./tests/test_strings && ./tests/test_state && ./tests/test_server_config &&
  ./tests/test_http_contract && ./tests/test_events_contract.sh` 全部返回 0，`events_contract_ok thread=4`。
- 2026-05-28 追加：SA `fuzzyFileSearch` 补齐 Deno 的非空 query 语义，返回
  `files:[{path: query, score: 1}]` 而不是永远空数组，并推送
  `fuzzyFileSearch/sessionUpdated` 与 `fuzzyFileSearch/sessionCompleted`。`item/tool/call` 改为回显
  请求 `message` 到 `contentItems[0].text`；`mcpServer/tool/call` 改为回显
  `message/tool/server/threadId/turnId/itemId` 到 result 和 meta，替换静态 `called` 响应。
- 2026-05-28 追加回归：`sa/tests/test_http_contract.sa` 增加 `fuzzyFileSearch` path 命中断言、
  `item/tool/call` message 回显断言，以及 `mcpServer/tool/call` 的 message/tool/threadId 回显断言；
  `sa/tests/test_events_contract.sh` 增加 fuzzy session 两个 SSE 事件断言。已重新构建
  `main.sa` 和 `tests/test_http_contract.sa`；只重启 SA 后确认 `hubproxy` PID `3379899` 监听
  `0.0.0.0:28080`，Deno PID `3343969` 仍监听 `0.0.0.0:27787`。运行
  `./tests/test_config && ./tests/test_strings && ./tests/test_state && ./tests/test_server_config &&
  ./tests/test_http_contract && ./tests/test_events_contract.sh` 全部返回 0，`events_contract_ok thread=4`。
- 2026-05-28 追加：`serverRequest/resolved` 现在推送同名 SSE 事件并回显 `threadId/requestId`。首次实现
  误复用带 JSON 引号的 `RPC_M_SERVER_REQUEST_RESOLVED` 常量，导致 SSE 行变成
  `event: "serverRequest/resolved"` 且 data.method 带双引号；已拆出未加引号的
  `EV_SERVER_RESOLVED` 常量修复，并把 `sa/tests/test_events_contract.sh` 加入
  `event: serverRequest/resolved` 与 `requestId:"req-events"` 断言。最终重新构建 `main.sa`，只重启
  SA 后确认 `hubproxy` PID `3381716` 监听 `0.0.0.0:28080`，Deno PID `3343969` 仍监听
  `0.0.0.0:27787`；全套 SA 回归再次全部返回 0，`events_contract_ok thread=4`。
- 2026-05-28 追加：`externalAgentConfig/detect` 不再返回静态 `"cwd":"."`/`"./Agents.md"`/`"./.env"`，
  改为优先读取运行时 `PWD`，并构造绝对 `cwd`、`<cwd>/Agents.md` 和 `<cwd>/.env`；缺失 `PWD` 时回退
  `.env` 的 `DATA_DIR`。`sa/tests/test_http_contract.sa` 新增 `"cwd":"/` 断言，防止退回相对路径。
  已重新构建 `main.sa` 和 `tests/test_http_contract.sa`；只重启 SA 后确认 `hubproxy` PID `3384048`
  监听 `0.0.0.0:28080`，Deno PID `3343969` 仍监听 `0.0.0.0:27787`；全套 SA 回归全部返回 0。
- 2026-05-28 追加：`config/value/write`、`config/batchWrite`、`skills/config/write` 不再返回静态
  `"filePath":"."`，改为优先读取运行时 `PWD` 并返回绝对 `filePath`，缺失 `PWD` 时回退 `.env` 的
  `DATA_DIR`。`sa/tests/test_http_contract.sa` 新增 `"filePath":"/` 断言。已重新构建
  `main.sa` 和 `tests/test_http_contract.sa`；只重启 SA 后确认 `hubproxy` PID `3387560` 监听
  `0.0.0.0:28080`，Deno 监听 `0.0.0.0:27787`；全套 SA 回归全部返回 0，`events_contract_ok thread=4`。
- 2026-05-28 追加：`remoteControl/enable`、`remoteControl/disable`、`remoteControl/status/read` 不再
  固定返回/通知 `serverName:"local"` 和 `installationId:"local-installation"`。新增动态
  `build_remote_status_params`，按 Deno 语义从 params 回显 `serverName`、`installationId`、
  `environmentId`，缺省仍为 `local`、`local-installation`、`null`；`enable/disable` 的 SSE
  `remoteControl/status/changed` 与 RPC result 复用同一 builder，避免响应和通知漂移。
  `sa/tests/test_http_contract.sa` 新增 `remote-srv`、`inst-1`、`env-1` 回显断言；
  `sa/tests/test_events_contract.sh` 新增 `events-srv`、`events-inst`、`events-env` SSE 断言。已重新构建
  `main.sa` 和 `tests/test_http_contract.sa`；只重启 SA 后确认 `hubproxy` PID `3390353` 监听
  `0.0.0.0:28080`，Deno PID `3384406` 仍监听 `0.0.0.0:27787`；全套 SA 回归全部返回 0，
  `events_contract_ok thread=4`。
- 2026-05-28 追加：`command/exec/write`、`command/exec/terminate`、`command/exec/resize` 与
  `process/writeStdin`、`process/resizePty` 从静态 `{"ok":false}` 修正为 Deno 当前 state 语义的
  `{"ok":true}`；`process/kill` 仍因 SA 暂无长期 process registry，保持无匹配 handle 时 `ok:false`。
  `process/spawn` 不再返回静态 `sa-process`，改为解析 `command[]` 与 `processHandle`，通过
  `sa_std_process_run/wait/read_stdout/read_stderr` 真实同步运行命令，返回请求 handle，并推送
  `process/outputDelta` 与 `process/exited` SSE 事件。`sa/tests/test_http_contract.sa` 新增
  `processHandle:"proc-1"` 与 command 控制 `ok:true` 断言；`sa/tests/test_events_contract.sh` 新增
  `process/outputDelta`、`process/exited` 与 `processHandle:"proc-events"` 断言。已重新构建
  `main.sa` 和 `tests/test_http_contract.sa`；只重启 SA 后确认 `hubproxy` PID `3392475` 监听
  `0.0.0.0:28080`，Deno PID `3384406` 仍监听 `0.0.0.0:27787`；全套 SA 回归全部返回 0，
  `events_contract_ok thread=4`。
- 2026-05-28 追加：修复 `notify_thread_string_suffix` 的 JSON 引号根因。该 helper 之前在
  `{"threadId":"` 已打开字符串后调用会输出带引号的 `rpc_builder_append_param_string_or_default`，
  导致 SSE payload 出现 `"threadId":""4""` 这类非法 JSON；新增
  `rpc_builder_append_param_raw_or_default`，仅在已打开 JSON string 的事件字段内追加 raw 参数值。
  `sa/tests/test_events_contract.sh` 新增 realtime payload `"threadId":"<id>"` 断言，防止回归。
- 2026-05-28 追加：`thread/realtime/appendAudio` 与 `thread/realtime/appendText` 的 SSE payload 不再
  固定空字段。`itemAdded`、`outputAudio/delta`、`transcript/delta`、`transcript/done` 现在从请求回显
  `audio`、`text` 和 `role`（缺省 `assistant`），与 Deno `emitRealtime*` 语义更接近。
  `sa/tests/test_events_contract.sh` 新增 `"audio":"abc"`、`"delta":"hi"`、`"text":"hi"` 断言。
  已重新构建 `main.sa` 和 `tests/test_http_contract.sa`；只重启 SA 后确认 `hubproxy` PID `3394761`
  监听 `0.0.0.0:28080`，Deno PID `3384406` 仍监听 `0.0.0.0:27787`；全套 SA 回归全部返回 0，
  `events_contract_ok thread=4`。
- 2026-05-28 追加：修复 `/v1/*` 代理路由的两个根因。第一，Deno 的 `GET /v1/models` 在 auth
  interceptor 前公开放行，SA 之前把它放在认证后，导致无本地 token 的模型列表请求直接返回本地
  `{"error":"unauthorized"}`；现已把 `/v1/models` 提前到 auth 之前分支，`/rpc`、`/events`、
  `/v1/chat/completions`、`/v1/responses` 仍保持本地鉴权。第二，SA 之前把 `.env` 的
  `CHAT_BASE_URL`/`RESPONSES_BASE_URL` 当成完整 endpoint 使用，实际 `.env` 中是
  `https://.../v1` base，导致 chat/responses/models 都会打到 `/v1` 根路径；新增
  `build_proxy_url`，分别拼接 `/chat/completions`、`/responses`、`/models`，与 Deno
  `new URL(requestPath, target)` 的 base+path 语义对齐。`sa/tests/test_http_contract.sa` 新增真实
  28080 无认证 `/v1/models` 合约，断言不会返回本地 unauthorized body；上游自身 401
  `Invalid API Key` 仍允许，因为那表示请求已正确进入代理链路。已重新构建 `main.sa` 和
  `tests/test_http_contract.sa`；只重启 SA 后确认 `hubproxy` PID `3399661` 监听 `0.0.0.0:28080`，
  Deno PID `3384406` 仍监听 `0.0.0.0:27787`；全套 SA 回归全部返回 0，`events_contract_ok thread=4`。
- 2026-05-28 追加：修复 `/v1/chat/completions` 与 `/v1/responses` 的上游状态码透传根因。
  SA 之前虽然读取了 `sa_http_client_resp_status`，但创建下游 stream 时硬编码 `200`，导致上游
  `401 Invalid API Key`、`404` 等错误被伪装成客户端成功响应；这与 Deno `forwardJson`/`Response`
  透传上游状态不一致，也会误导 Codex 客户端重试/错误处理。现已把 chat/responses stream response
  的 status 改为上游 status。`sa/tests/test_http_contract.sa` 新增真实 28080 chat 断言：带本地
  auth、空 JSON body 请求 `/v1/chat/completions` 时，当前无效上游 key 场景必须不是 `200`，
  防止再次把上游错误伪装成成功。已重新构建 `main.sa` 和 `tests/test_http_contract.sa`；只重启 SA 后确认
  `hubproxy` PID `3402541` 监听 `0.0.0.0:28080`，Deno PID `3384406` 仍监听 `0.0.0.0:27787`；
  全套 SA 回归全部返回 0，`events_contract_ok thread=4`。手工复核同一请求已从
  `HTTP/1.1 200 OK` 修正为 `HTTP/1.1 401 Unauthorized`，body 仍是上游 `Invalid API Key`。
- 2026-05-28 追加：修复 HTTP server 插件缺少 request method ABI 的根因，并让 SA 路由按 Deno 的
  method 条件执行。`/home/vscode/projects/sa_plugins/sa_plugin_http_server` 新增
  `sa_http_server_req_get_method(req, &out_method, &out_len) -> u32`，`HttpRequest` 保存
  `std_request.head.method` 的字符串拷贝并在 request free 时释放；插件测试新增真实 loopback POST
  请求，断言 SAASM API 读取到 `POST`。已运行 `zig build test` 和 `zig build -Doptimize=ReleaseFast`，
  并用 `scripts/plugin-manager.sh install http-server` 安装新版插件；安装态
  `libhttp-server.so` 已确认导出 `sa_http_server_req_get_method`。
- 2026-05-28 追加：HubProxy 的 `sa/sa_http_server.sai` 加入 method extern，`sa/main.sa`
  在 `handle_http_request` 开始读取 method 并计算 `is_get/is_post`。路由现在匹配 Deno 语义：
  `GET /healthz`、`GET /readyz` 公开；只有 `GET /v1/models` 在 auth 前公开代理；`/rpc` 只有
  POST 且通过 auth 后进入 JSON-RPC；`/events` 只有 GET 且通过 auth 后进入 SSE；chat/responses
  只接受 POST。修复过程中发现 `check_auth` 在缺失 header 时读取未初始化输出槽，`GET /rpc`
  会崩溃在 `check_auth`；已在每次 `sa_http_server_req_get_header` 前把输出槽清零，缺失
  `authorization` 和 `x-api-key` 时稳定返回 auth fail。
- 2026-05-28 追加：修复本地 unauthorized 响应长度常量。`AUTH_ERR_LEN` 之前是 25，但
  `{"error":"unauthorized"}` 实际长度是 24，导致客户端 body 末尾多一个 NUL；已改为 24，并把
  `sa/tests/test_http_contract.sa` 升级为读取无认证 `/rpc` 响应 body，精确匹配
  `{"error":"unauthorized"}`，防止协议体再污染。
- 2026-05-28 追加验证：在用户更新后的根 `.env`（`CHAT_BASE_URL=https://hub.linux.do/v1`、
  `RESPONSES_BASE_URL=https://hub.linux.do/v1`、`SA_PORT=28080`）下重新构建
  `main.sa` 和 `tests/test_http_contract.sa`，只重启 SA，确认 `hubproxy` PID `3417948` 监听
  `0.0.0.0:28080`。运行 `./tests/test_config && ./tests/test_strings && ./tests/test_state &&
  ./tests/test_server_config && ./tests/test_http_contract && ./tests/test_events_contract.sh` 全部返回 0，
  回归后 SA 进程仍保持监听。手工复核：带 auth 的 `GET /rpc` 返回 404；无 auth 的
  `POST /v1/models` 返回 401；无 auth 的 `GET /v1/models` 公开代理成功并返回上游模型列表；
  无 auth 的 `POST /rpc` body 字节为 24 字节精确 `{"error":"unauthorized"}`，无 NUL。
- 2026-05-28 追加：修复 chat/responses 代理 content-type 透传根因。SA 之前对
  `/v1/chat/completions` 和 `/v1/responses` 一律使用 `sa_http_server_resp_stream_new`，因此即便
  上游返回普通 JSON/HTML 错误，也会被下游错误标成 `text/event-stream`，与 Deno `fetch`/`Response`
  透传语义不一致。已扩展 HTTP client 插件 `sa_http_client_resp_get_header`，在 response 中克隆并暴露
  上游 headers；扩展 HTTP server 插件 `sa_http_server_resp_set_content_type`，普通响应可设置
  `content-type`。插件均已 `zig build test`、`zig build -Doptimize=ReleaseFast` 并通过
  `scripts/plugin-manager.sh install http-client http-server` 安装；安装态
  `~/.local/share/sa_plugins/installed/*/current/*.so` 已确认导出
  `sa_http_client_resp_get_header`、`sa_http_server_req_get_method`、`sa_http_server_resp_set_content_type`。
- 2026-05-28 追加：`sa/main.sa` 现在读取上游 `content-type`，只有包含 `text/event-stream` 时走
  stream response；否则读取上游 body 首块，创建普通 response，并用上游 content-type（缺省
  `application/json`）返回。`sa/tests/test_http_contract.sa` 增加真实 28080 chat 合约：带本地 auth
  发送 `{}` 触发上游非 200 时，响应 header 不得包含 `text/event-stream`。注意测试顺序：
  `test_server_config` 会短暂绑定 `SA_PORT`，全套回归需要先停 SA，跑 config/strings/state/server_config，
  再启动 SA，最后跑 `test_http_contract` 和 `test_events_contract.sh`。
- 2026-05-28 追加验证：按上述顺序运行回归全部返回 0：
  `./tests/test_config && ./tests/test_strings && ./tests/test_state && ./tests/test_server_config`，随后启动
  `./hubproxy` 到 `0.0.0.0:28080`，再运行
  `./tests/test_http_contract && ./tests/test_events_contract.sh`，输出
  `events_contract_ok thread=4`。当前 `hubproxy` PID `3436568` 监听 `28080`，Deno 监听 `27787`。
  手工 OpenAI chat/completions curl：使用 `.env` 的 `AUTH` 和 `DEFAULT_MODEL=mimo-v2.5` 向
  `http://127.0.0.1:28080/v1/chat/completions` 发送
  `messages:[{role:"user",content:"Say hello from SA hubproxy in one short sentence."}], stream:false`，
  SA 成功代理到上游并返回 `HTTP/1.1 422 OK`、`content-type: application/json; charset=utf-8`，
  body 为上游 `model not found: mimo-v2.5` JSON 错误；关键验证是不再错误返回
  `content-type: text/event-stream`。
- 2026-05-28 追加：修复上游认证 header 与 Deno `forwardHeaders` 不一致的根因。Deno 会删除客户端
  `authorization`/`x-api-key`/`api-key` 后，向上游设置 `authorization: Bearer <OPENAI_API_KEY>` 和
  `x-api-key: <OPENAI_API_KEY>`；SA 之前对 chat/responses/models 只发送了裸 token 到
  `authorization`，没有 `Bearer ` 前缀，也没有 `x-api-key`，导致部分 OpenAI 兼容网关认证失败或路由不到
  正确通道。已在 `sa/main.sa` 为三条上游路径构造 `Bearer <OPENAI_API_KEY>`，Authorization 使用
  Bearer 值，`x-api-key` 使用原始 key。`/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json`
  成功；只重启 SA 后确认 `hubproxy` PID `3442760` 监听 `0.0.0.0:28080`，Deno 保持监听
  `0.0.0.0:27787`。
- 2026-05-28 追加验证：在用户更新后的 `.env`
  `CHAT_BASE_URL=https://token-plan-sgp.xiaomimimo.com/v1`、
  `RESPONSES_BASE_URL=https://token-plan-sgp.xiaomimimo.com/v1`、`DEFAULT_MODEL=mimo-v2.5` 下，运行
  `./tests/test_http_contract && ./tests/test_events_contract.sh` 返回 0，输出
  `events_contract_ok thread=4`。手工 OpenAI chat/completions curl 使用 `.env` 的 `AUTH` 发送
  `stream:false` 请求到 `http://127.0.0.1:28080/v1/chat/completions`，SA 成功返回
  `HTTP/1.1 200 OK`、`content-type: application/json`，body 中模型为 `mimo-v2.5`，内容为
  `Hello from SA hubproxy!`，证明上游认证 header 修正后真实链路可用。
- 2026-05-28 追加：修复 `/v1/models` content-type 透传缺口。Deno `forwardJson`/`Response` 会把上游
  模型列表的 `content-type` 保留下来；SA models 分支之前用普通 response 但未设置 content-type，
  HTTP server 插件默认返回 `text/plain`，导致 OpenAI SDK/客户端可能不能按 JSON 解析模型列表。现在
  `sa/main.sa` 在 models 分支调用 `sa_http_client_resp_get_header(..., "content-type")`，有上游 header
  时透传给 `sa_http_server_resp_set_content_type`，缺省使用 `application/json`。`sa/tests/test_http_contract.sa`
  增加真实 28080 `/v1/models` header 断言，防止回退到 `text/plain`。
- 2026-05-28 追加验证：`/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json` 和
  `/home/vscode/.sa/bin/sa build tests/test_http_contract.sa -o tests/test_http_contract --json` 均成功。
  只重启 SA 后确认 `hubproxy` PID `3449621` 监听 `0.0.0.0:28080`，Deno 仍监听
  `0.0.0.0:27787`。运行 `./tests/test_http_contract && ./tests/test_events_contract.sh` 返回 0，
  `events_contract_ok thread=4`。手工 `curl -i http://127.0.0.1:28080/v1/models` 返回
  `HTTP/1.1 200 OK`、`content-type: application/json` 和上游模型列表；chat sanity curl 仍返回
  `HTTP/1.1 200 OK`、`content-type: application/json`、模型 `mimo-v2.5`、内容 `OK`。
- 2026-05-28 追加：修复当前真实上游不支持 `/v1/responses` 时 SA 直接返回 404 HTML 的根因。Deno
  `forwardWithFallback` 会在 Responses 上游返回 `404/405/410/415/5xx` 时把请求转换到
  `/v1/chat/completions`；SA 之前只直通 `/responses`，因此在
  `https://token-plan-sgp.xiaomimimo.com/v1` 下 `{input:"Reply with only OK.", stream:false}` 返回
  `HTTP/1.1 404 Not Found`、`content-type: text/html`。现在 `sa/main.sa` 对 eligible status 增加基础
  chat fallback：从 Responses body 抽取字符串 `input`，用 `.env` 的 `DEFAULT_MODEL` 构造
  `{"model":...,"messages":[{"role":"user","content":...}],"stream":false}`，重新请求 chat upstream 并透传
  chat response。当前覆盖最常见的 `input` 为字符串且非流式的请求；复杂 Responses input array、
  tools、stream SSE normalization 仍需后续继续补齐。
- 2026-05-28 追加验证：`/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json` 与
  `/home/vscode/.sa/bin/sa build tests/test_http_contract.sa -o tests/test_http_contract --json` 均成功。
  `sa/tests/test_http_contract.sa` 新增真实 `/v1/responses` fallback 断言，要求返回 body 包含
  `"object":"chat.completion"` 且不包含 `<html>`。只重启 SA 后确认 `hubproxy` PID `3460013` 监听
  `0.0.0.0:28080`，Deno 仍监听 `0.0.0.0:27787`；运行
  `./tests/test_http_contract && ./tests/test_events_contract.sh` 返回 0，`events_contract_ok thread=4`。
  手工 curl 到 `http://127.0.0.1:28080/v1/responses`，body
  `{"model":"mimo-v2.5","input":"Reply with only OK.","stream":false}`，返回
  `HTTP/1.1 200 OK`、`content-type: application/json`、`object:"chat.completion"`、内容 `OK`，不再返回
  上游 404 HTML。
- 2026-05-28 追加：扩展 `/v1/responses` chat fallback 的输入抽取范围。Deno
  `extractChatFallbackFromResponsesBody` 支持 `input` 数组中的 message/content/text 形态；SA 上一版只支持
  顶层 `input` 字符串。现在 `build_chat_fallback_body` 按顺序抽取顶层 `"input":"..."`、`"content":"..."`、
  `"text":"..."`，覆盖常见 Responses body：
  `input:[{type:"message",role:"user",content:[{type:"input_text",text:"..."}]}]`。这仍不是完整 JSON AST 转换，
  但已覆盖 Deno proxy 测试和真实客户端常见的非流式文本输入路径。
- 2026-05-28 追加验证：`/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json` 和
  `/home/vscode/.sa/bin/sa build tests/test_http_contract.sa -o tests/test_http_contract --json` 均成功。
  `sa/tests/test_http_contract.sa` 的 `/v1/responses` fallback 请求已改为 Deno 测试同类 input array 形态；
  重启 SA 后 `hubproxy` PID `3463327` 监听 `0.0.0.0:28080`，Deno 仍监听 `0.0.0.0:27787`。
  运行 `./tests/test_http_contract && ./tests/test_events_contract.sh` 返回 0，`events_contract_ok thread=4`。
  手工 curl 发送 input array 到 `http://127.0.0.1:28080/v1/responses`，返回
  `HTTP/1.1 200 OK`、`content-type: application/json`、`object:"chat.completion"`、内容 `OK`。
- 2026-05-28 追加：修复 `/v1/responses` chat fallback 忽略请求 `model` 的兼容差异。Deno
  `extractChatFallbackFromResponsesBody` 会保留 Responses body 中的 `model`，而 SA 上一版 helper 固定使用
  `.env DEFAULT_MODEL`，导致请求 `mimo-v2.5-pro` 这类非默认模型时会错误路由到默认模型。现在
  `build_chat_fallback_body` 优先从请求 body 抽取 `"model":"..."`，缺失时才使用 `.env` 默认模型。
  为避免 SA 当前复杂 join 的 `PhiStateConflict`，body model 和 default model 两个分支分别完整构造
  fallback JSON 后直接 return。
- 2026-05-28 追加验证：`/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json` 和
  `/home/vscode/.sa/bin/sa build tests/test_http_contract.sa -o tests/test_http_contract --json` 均成功。
  `sa/tests/test_http_contract.sa` 的 `/v1/responses` fallback 请求改为 `model:"mimo-v2.5-pro"`，并断言响应
  body 包含 `"model":"mimo-v2.5-pro"`，防止回退默认模型。只重启 SA 后确认 `hubproxy` PID `3466777`
  监听 `0.0.0.0:28080`，Deno 仍监听 `0.0.0.0:27787`。运行
  `./tests/test_http_contract && ./tests/test_events_contract.sh` 返回 0，`events_contract_ok thread=4`。
  手工 curl 同样发送 `mimo-v2.5-pro` Responses input array 到 `http://127.0.0.1:28080/v1/responses`，
  返回 `HTTP/1.1 200 OK`、`content-type: application/json`、`object:"chat.completion"`、`model:"mimo-v2.5-pro"`、
  内容 `OK`。

- 建立 Deno 工程文件。
- 实现 `/v1/responses`、`/v1/chat/completions`、`/v1/models` 的基本转发/适配。
- 实现 `thread/*` JSON-RPC 的内存版。
- 实现 MCP 和 function call 的回流桥接。
- 2026-05-28 追加验证：用户更新根 `.env` 后重新确认配置中 `SA_PORT=28080`、Deno `PORT=27787`。只重启
  SA 版 `hubproxy`，Deno 继续保持监听 `0.0.0.0:27787`；SA 前台启动日志显示配置加载和状态初始化成功，
  并监听 `0.0.0.0`。用 `.env` 的 `AUTH` 模拟 OpenAI Chat Completions 请求：
  `POST http://127.0.0.1:28080/v1/chat/completions`，body
  `{"model":"mimo-v2.5","messages":[{"role":"user","content":"Reply with only OK."}],"stream":false}`。
  返回 `HTTP/1.1 200 OK`、`content-type: application/json`，响应模型为 `mimo-v2.5`，assistant 内容为
  `OK`，证明 SA 版本按根 `.env` 使用 28080 并且真实上游 chat 链路可用。
- 2026-05-28 追加：继续对齐 Deno 的 Responses -> Chat fallback。Deno
  `extractChatFallbackFromResponsesBody` 会把 Responses body 的 `instructions` 转成 Chat Completions 的
  system message；SA 之前只把 input/text/content 抽成 user message，导致 Plan Mode/Codex 指令在
  `/v1/responses` 上游 404 后 fallback 到 chat 时丢失。已在 `sa/main.sa` 的
  `build_chat_fallback_body` 中新增 `instructions` 抽取，生成
  `messages:[{role:"system",content:<instructions>},{role:"user",content:<input>}]`；仍保持请求内
  `model` 优先、缺省使用 `.env DEFAULT_MODEL`。
- 2026-05-28 追加验证：新增 `sa/tests/test_responses_fallback_capture.sh` 黑盒测试。该测试临时把根
  `.env` 的 `CHAT_BASE_URL`/`RESPONSES_BASE_URL` 指向本地 mock upstream：mock `/v1/responses` 返回
  404 触发 SA fallback，mock `/v1/chat/completions` 捕获 SA 实际发出的请求体，并断言包含
  `"role":"system"`、`SA_INSTRUCTION_OK`、`"role":"user"`、`"model":"mimo-v2.5"`。避免依赖真实模型是否严格
  遵守 system prompt 的不稳定输出。验证通过：
  `/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json`、
  `/home/vscode/.sa/bin/sa build tests/test_http_contract.sa -o tests/test_http_contract --json`、
  `./tests/test_http_contract && ./tests/test_events_contract.sh && ./tests/test_responses_fallback_capture.sh`
  均成功；capture 脚本会恢复 `.env`，之后已重新启动正式 SA 版 `hubproxy`，PID `3483303` 监听
  `0.0.0.0:28080`，Deno 仍监听 `0.0.0.0:27787`。
- 2026-05-28 编译器/SA 发现：`@import "../main.sa"` 做 helper 单元测试时，SA 当前会把被导入文件中的
  `@main` 一并作为入口语义处理，导致测试二进制实际启动了 hubproxy 服务。当前绕过方式是使用黑盒
  capture 测试，不直接 import 带 `@main` 的应用入口；后续如果要做细粒度 SA 单元测试，应把可测 helper
  移到无 `@main` 的模块，或在编译器层面完善多入口/import 规则。
- 2026-05-28 追加：继续补 Deno `extractChatFallbackFromResponsesBody` 兼容。Deno 在 Responses ->
  Chat fallback 时会把 `tools` 中的 function tool 转成 Chat Completions 的
  `tools:[{type:"function",function:{...}}]`；SA 上一版 fallback 只保留 model/messages/stream，导致
  Codex 请求通过 `/v1/responses` fallback 到 chat upstream 后工具能力丢失。已在 `sa/main.sa` 新增
  `append_chat_fallback_tools`，当前覆盖平铺 function tools 的高频集合：
  `exec_command`、`update_plan`、`get_goal`，会追加为 chat tool schema 并带空 `parameters`。这不是完整
  Deno AST 转换；namespace tools、任意自定义 function tool、description/parameters/strict 的完整透传仍是后续项。
- 2026-05-28 追加验证：`sa/tests/test_responses_fallback_capture.sh` 已升级为同时验证 instructions 和 tools。
  测试临时 mock `/v1/responses` 返回 404，捕获 SA 发给 `/v1/chat/completions` 的 fallback body，并断言存在
  `"role":"system"`、`SA_INSTRUCTION_OK`、`"role":"user"`、`"model":"mimo-v2.5"`、`"tools":[`、
  `exec_command`、`update_plan`、`get_goal`。本轮验证通过：
  `/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json`、
  `/home/vscode/.sa/bin/sa build tests/test_http_contract.sa -o tests/test_http_contract --json`、
  `./tests/test_http_contract && ./tests/test_events_contract.sh && ./tests/test_responses_fallback_capture.sh`。
  capture 后已恢复根 `.env` 到真实上游，并重启正式 SA 版 `hubproxy`，PID `3491601` 监听
  `0.0.0.0:28080`；Deno 仍监听 `0.0.0.0:27787`。
- 2026-05-28 追加：继续推进 tools 兼容，SA fallback 不再只保留固定的
  `exec_command`/`update_plan`/`get_goal`。`append_first_custom_chat_fallback_tool` 会抽取 Responses
  body 中第一个 `"name":"..."`，如果不是上述已知三项，就把它作为自定义 flat function tool 追加到
  Chat Completions `tools` 数组。当前仍是轻量 JSON 扫描，不是完整 AST：只能覆盖首个平铺 function
  tool name，暂不保留 description/parameters/strict，也不处理 namespace 展开或多个任意自定义工具。
- 2026-05-28 追加验证：`sa/tests/test_responses_fallback_capture.sh` 现在请求体包含
  `custom_search`、`exec_command`、`update_plan`、`get_goal` 四个 flat function tools，mock upstream 捕获到
  SA 发出的 chat fallback body 中包含四个工具名。验证命令已通过：
  `/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json`、
  `/home/vscode/.sa/bin/sa build tests/test_http_contract.sa -o tests/test_http_contract --json`、
  `./tests/test_http_contract && ./tests/test_events_contract.sh && ./tests/test_responses_fallback_capture.sh`。
  验证后根 `.env` 已恢复真实上游，正式 SA 版 `hubproxy` PID `3494938` 监听
  `0.0.0.0:28080`，Deno 仍监听 `0.0.0.0:27787`。
- 2026-05-28 追加：继续推进多个自定义 flat function tools。`sa/main.sa` 新增
  `append_second_custom_chat_fallback_tool`，从第一个 `"name":"..."` 后继续扫描第二个 tool name；若第二个
  name 不是 `exec_command`/`update_plan`/`get_goal` 且不同于第一个自定义 name，则追加到 chat fallback
  `tools`。这仍是有界扫描，不是完整 JSON AST；覆盖前两个平铺自定义 function tool，后续仍需处理更多
  tools、namespace 展开和 description/parameters/strict 透传。
- 2026-05-28 追加验证：`sa/tests/test_responses_fallback_capture.sh` 已把请求体扩展为
  `custom_search`、`custom_read`、`exec_command`、`update_plan`、`get_goal` 五个 flat function tools，并断言
  mock 捕获的 chat fallback body 包含两个自定义工具和三个内置高频工具。已通过
  `/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json`、
  `/home/vscode/.sa/bin/sa build tests/test_http_contract.sa -o tests/test_http_contract --json`、
  `./tests/test_http_contract && ./tests/test_events_contract.sh && ./tests/test_responses_fallback_capture.sh`。
  capture 后根 `.env` 已恢复真实上游，正式 SA 版 `hubproxy` PID `3498115` 监听
  `0.0.0.0:28080`；Deno 仍监听 `0.0.0.0:27787`。
- 2026-05-28 反思/纠偏：之前没有先系统查 SA 标准库和 demos，就在 HubProxy fallback 转换里继续堆
  字节扫描，这是错误路线。已确认安装态和源码态都存在 `sa_std/encoding/json.sa`，包含
  DOM (`sa_json_parse`/`sa_json_object_get`/`sa_json_stringify`)、stream token (`sa_json_stream_*`) 和
  writer (`sa_json_writer_*`)；示例在
  `/home/vscode/projects/sci/tests/unit_framework/support/json_regex.sa`，设计说明在
  `/home/vscode/projects/sci/docs/std_rfc.md`。后续涉及 JSON 请求/响应转换时，必须先使用这些标准 JSON
  API；只有确认 std JSON API 缺少必要能力时，才进入 SCI/stdlib/compiler 修复，而不是继续手写扫描。
  当前 `sa/main.sa` 已导入 `sa_std/encoding/json.sa` 并用安装态
  `/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json` 验证可编译。
- 2026-05-28 反思/纠偏：SA 已有 async/await 状态机宏和多线程/并发示例，后续不能再默认认为
  server/streaming/concurrency “暂不支持”。已确认 `sa_std/libsa_async.sa` 提供
  `ASYNC_CTX_DEF`、`ASYNC_POLL_PROLOGUE`、`ASYNC_AWAIT_POINT`、`ASYNC_RETURN_PENDING` 等宏；
  示例在 `/home/vscode/projects/sci/demos/rosetta/09_async_await/main.sa` 和
  `/home/vscode/projects/sci/demos/rosetta/315_async_closure_macro/main.sa`。线程/并发相关示例包括
  `/home/vscode/projects/sci/demos/rosetta/184_pthread_spawn_join/main.sa`、
  `/home/vscode/projects/sci/demos/rosetta/130_park_unpark_thread/main.sa`，以及
  `/home/vscode/projects/sci/tests/unit_framework/support/index.sa` 中的
  `support_join_all_futures_sum`、`support_async_streams_total`、`support_pthread_spawn_join_value`。
  后续实现 `/events`、SSE normalization、stream fallback 或后台任务时，必须先查这些 demo/stdlib，再判断是否
  需要修编译器或 runtime。
- 2026-05-28 本轮 JSON 纠偏落地：`sa/main.sa` 的 Responses -> Chat fallback 已开始使用
  `sa_std/encoding/json.sa` 的 `sa_json_stream_*`，不再靠 `"model":"`、`"instructions":"`、
  `"input":"` 这类紧凑字节模式提取关键字段。当前已切换的字段包括 `model`、`instructions`、
  `input/content/text`，并新增基于 JSON token 的 tool `name` 提取。`sa/tests/test_responses_fallback_capture.sh`
  已改成带空格的 JSON 请求体，用来防止未来回退到紧凑字符串扫描；该 capture 测试已通过。
- 2026-05-28 当前没有确认 SA 缺少 JSON/async/thread 基础特性；本轮问题主要是 HubProxy 旧代码没有使用已存在的
  SA std JSON。后续如果要把 Responses tool 的 `description`、`parameters`、`strict`、namespace tool
  展开完整映射到 Chat tools，应先查 `sci` demos/std/tests 是否已有对象/数组遍历或 writer 组合示例；
  如果 std JSON 缺少足够好用的对象枚举/数组访问接口，再优先修 SCI/stdlib/compiler，并在这里记录缺口和回归测试。
- 2026-05-28 标准库优先级切换记录：按用户要求，暂停 HubProxy/Deno 业务转换，先补齐 Deno JSON
  转换需要的 SA std 宏和 runtime ABI。已在 `/home/vscode/projects/sci/sa_std/encoding/json.sa` 增加
  Deno 常用 JSON 操作宏：`JSON_ARRAY_LOOP_INIT/HAS_NEXT/NEXT`、`JSON_OBJECT_LOOP_INIT/HAS_NEXT/NEXT`，
  以及 `JSON_WRITER_FIELD_STRING/BOOL/I64/F64/NULL/NODE`。字段写入没有做成“宏里 field 后再 write”
  的半成品，而是下沉到 runtime 新 ABI：`sa_json_writer_field_string/bool/i64/f64/null/node`，保证 field
  与 value 写入作为一个状态返回点，避免吞掉 `objectField` 错误。
- 2026-05-28 SCI 回归与安装：`tests/std_smoke.zig` 新增实际 SA 宏展开 fixture，覆盖 parse、对象/数组
  遍历初始化、typed getter、writer field helpers、buffer slice/free 和 node free，并通过 referee 验证；
  `tests/sa_std_runtime.zig` 新增 C ABI 覆盖，验证 JSON writer 字段 helper 可生成 string/bool/i64/f64/null/node
  混合对象。已运行 `zig test tests/sa_std_runtime.zig`、`zig build std-smoke --summary none`、
  `zig test tests/sa_term_runtime.zig`、`zig build test --summary none`，全部通过；随后执行
  `/home/vscode/projects/sci/tools/install.sh --no-shell`，ReleaseFast 安装到 `/home/vscode/.sa`。
  安装态已核对 `/home/vscode/.sa/std/encoding/json.sa` 和 `json.sai` 包含新宏/extern，
  `nm -g /home/vscode/.sa/std/libsa_std.a` 已确认导出全部 `sa_json_writer_field_*` 符号。
- 2026-05-28 SCI 测试根因顺手修复：完整 `zig build test` 起初失败在 `tests/sa_term_runtime.zig`，
  不是 JSON 改动导致，而是该测试用 `zig build-lib src/runtime/sa_std.zig` 构建 runtime 时没有传 `-lc`；
  当前 runtime 已通过 libc `environ` 读取 SA-built executable 的环境，所以 build-lib 必须显式链接 libc。
  已给两个 `sa_term_runtime` build-lib 命令加 `-lc`，并用单测和完整 `zig build test` 验证。
- 2026-05-28 剩余 JSON std 边界：现在可覆盖 HubProxy 需要的 Deno JSON DOM 读写主路径，包括对象/数组计数、
  key 枚举、array get、typed getter、node 复制写入、字段级 writer。后续若要进一步减少 SA 业务样板，可继续
  在 std 层增加更高阶的 scoped cleanup/for-each 代码生成宏，或 “copy selected fields from object to writer”
  helper；但当前不应再用字节扫描作为 Responses tools 转换主路线。
- 2026-05-28 本轮 HubProxy 继续推进：Responses -> Chat fallback 的 tools 路径已从“前两个自定义 name
  有界扫描”推进到 DOM 数组读取。`sa/main.sa` 新增 `append_chat_fallback_tool_dom_at`，通过
  `sa_json_array_get` 逐项读取 tools，并复用 DOM source writer 保留 flat/nested function tool 的
  `name`、`description` 和 `parameters`；当前为规避 SA 编译器 loop Phi 缺陷，把 tools 数组展开为 0..7
  的有界无回边处理，覆盖当前 Codex 常见工具集合和回归里的 5 个 tools。后续应在编译器 loop 问题修复后，
  恢复成真正的 `JSON_ARRAY_LOOP_*` 循环。
- 2026-05-28 本轮测试：`sa/tests/test_responses_fallback_capture.sh` 已加入两个自定义 function tools 的
  `description` 和嵌套 `parameters.properties`，并断言 SA fallback 发给 `/v1/chat/completions` 的 body
  包含这些字段；已通过 `/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json`、
  `/home/vscode/.sa/bin/sa build tests/test_http_contract.sa -o tests/test_http_contract --json`、
  `./tests/test_config && ./tests/test_strings && ./tests/test_state && ./tests/test_server_config`、
  `./tests/test_http_contract && ./tests/test_events_contract.sh && ./tests/test_responses_fallback_capture.sh`。
  最终已重启正式 SA 版，PID `3587557` 监听 `0.0.0.0:28080`；Deno 仍监听 `0.0.0.0:27787`。
- 2026-05-28 编译器缺陷记录：尝试在 `append_chat_fallback_tool_dom_source` 中补 `strict` bool 透传时，
  只要循环体调用链新增 `sa_json_object_get_bool` 或新增 strict node stringify 分支，
  `append_chat_fallback_tools_from_dom` 的 loop 回边就报无关 extern（如 `sa_io_write_all`、`sa_io_close`）
  `PhiStateConflict Active/Uninitialized`。退回 strict 后旧循环仍可复现同类错误，说明根因是当前 SA
  编译器/Verifier 对复杂循环中“被子调用首次触达的 extern/常量状态”处理不稳定。为保持 HubProxy 可构建，
  本轮用无回边有界 DOM 展开规避；`strict` 仍未透传，不能宣称与 Deno `normalizeChatToolsValue` 完全等价。
  后续优先修 SCI 编译器 loop/extern Phi 根因，再恢复真正循环并补 `strict` capture 断言。
- 2026-05-28 根因修复后更新：SCI verifier 已修 `collectMetadata` 函数声明边界污染和 Phi diagnostics
  局部 scope 名称解析。HubProxy 已撤销 tools 0..7 有界展开，`append_chat_fallback_tools_from_dom` 恢复为
  `count/index_slot` 真数组循环；`append_chat_fallback_tool_dom_source` 透传 Deno 语义的 `strict` 字段
  （优先 source/function 节点，其次 tool 顶层），输出到 chat fallback 的 `function` 对象内部。
  为满足 SA join 规则，`strict_slot` 和 `strict_tool_slot` 在 strict 分支前统一 `stack_alloc`。
- 2026-05-28 验证记录：SCI 侧通过 `zig test src/verifier.zig`、`zig build std-smoke --summary none`、
  `zig build test --summary none`，并用 `/home/vscode/projects/sci/tools/install.sh --no-shell` ReleaseFast
  安装到 `/home/vscode/.sa`。HubProxy 侧用安装态 `/home/vscode/.sa/bin/sa` 构建 `main.sa`、
  `tests/test_http_contract.sa`、`test_config.sa`、`test_strings.sa`、`test_state.sa`、`test_server_config.sa`
  全部成功；运行 `./tests/test_config && ./tests/test_strings && ./tests/test_state && ./tests/test_server_config`
  以及 `./tests/test_http_contract && ./tests/test_events_contract.sh && ./tests/test_responses_fallback_capture.sh`
  全部通过，capture 测试现在断言 `strict:true` 和 `strict:false`。
- 2026-05-28 运行态：按 `.env` 的 `SA_PORT=28080` 启动 SA 版 hubproxy，PID `3620247` 监听
  `0.0.0.0:28080`；Deno 版仍监听 `0.0.0.0:27787`，未被停止。curl 到
  `http://127.0.0.1:28080/v1/chat/completions` 返回真实 `chat.completion`，assistant content 为
  `SA_RUNTIME_OK`。
- 2026-05-28 继续 parity 修复：对齐 Deno `normalizeChatToolsValue` 的 namespace tools 主路径。
  SA `append_chat_fallback_tool_dom` 现在识别 `{"type":"namespace","name":"mcp__code_index__","tools":[...]}`
  并把内部 function tool 展开为 chat fallback 的 `function.name = "mcp__code_index__search"`；非 function
  工具如 `web_search` 继续被过滤。实现上新增带前缀的 DOM source writer，复用现有 description、
  parameters、strict 透传逻辑，而不是回退到字节扫描。
- 2026-05-28 namespace 验证：`sa/tests/test_responses_fallback_capture.sh` 已加入 namespace tool 和
  `web_search` 过滤断言，确认 capture 请求包含 `mcp__code_index__search`、`description`、嵌套
  `parameters`，且不泄漏 `web_search/external_web_access`。用安装态 `/home/vscode/.sa/bin/sa` 重新构建
  `main.sa`、`test_http_contract`、`test_config`、`test_strings`、`test_state`、`test_server_config` 全部成功。
  已运行 `./tests/test_config && ./tests/test_strings && ./tests/test_state && ./tests/test_server_config`、
  在 28080 启动服务后运行 `./tests/test_http_contract`、以及
  `./tests/test_events_contract.sh && ./tests/test_responses_fallback_capture.sh`，全部通过。注意：
  `test_http_contract` 依赖 28080 已启动，未启动时当前测试二进制会 segfault，这是测试健壮性缺口，后续应改为
  明确连接失败而非崩溃。
- 2026-05-28 运行态更新：正式 SA 版已重启，PID `3626137` 监听 `0.0.0.0:28080`；Deno 仍监听
  `0.0.0.0:27787`。curl 到 `/v1/chat/completions` 返回真实 `chat.completion`，assistant content 为
  `SA_NAMESPACE_OK`。
- 2026-05-28 续跑验证：在 SCI Deno facade 补齐并 ReleaseFast 安装后，使用安装态
  `/home/vscode/.sa/bin/sa` 重新构建 `sa/main.sa` 成功：
  `{"status":"ok","metrics":{"compile_tokens":19492,"instruction_count":9237}}`。
  只运行 HubProxy 相关测试，没有再跑 SCI 全量：
  `test_config`、`test_strings`、`test_state`、`test_server_config` 构建运行通过；
  启动 SA 版到 `.env` 的 `SA_PORT=28080` 后，`test_http_contract` 通过；
  `test_responses_fallback_capture.sh` 通过；`test_events_contract.sh` 单独重启/确认 28080 后通过。
  当前正式 SA 版 PID `3724114` 监听 `0.0.0.0:28080`，Deno PID `3666815` 仍监听 `0.0.0.0:27787`。
  curl 到 `http://127.0.0.1:28080/v1/chat/completions` 使用根 `.env` 的 `AUTH` 返回 HTTP 200 真实
  `chat.completion`，assistant content 为 `SA_NAMESPACE_OK`。
- 2026-05-28 测试健壮性修复：`sa/tests/test_http_contract.sa` 的首个 `/healthz` 探测现在先检查
  `sa_http_client_req_send` 返回状态；如果 28080 未启动，测试释放 client/request 后稳定进入
  `panic(223)`，不再读取空 response 导致 segfault。已验证未启动场景输出
  `[config] loaded` 与 `PANIC: code=223`，退出码为 95；重启 SA 版后重新运行
  `/home/vscode/.sa/bin/sa build tests/test_http_contract.sa -o tests/test_http_contract --json` 和
  `./tests/test_http_contract`，均通过。当前 SA 版 PID `3727035` 监听 `0.0.0.0:28080`，Deno 仍监听
  `0.0.0.0:27787`。
- 2026-05-28 直接 Chat tools 根因修复：Deno `maybeRewriteRequestBody` 对 `/v1/chat/completions`
  会把 flat function tools 与 namespace tools 归一化成 OpenAI chat 需要的
  `{"type":"function","function":{...}}`，同时删除 `store`、`prompt_cache_key`、`include`、`reasoning`
  并过滤 `web_search` 等非 function tools；SA 直通 chat 过去直接转发原始 body，导致与 Deno 不等价。
  已在 `sa/main.sa` 新增 `build_chat_proxy_body`，使用现有 `sa_std/encoding/json.sa` DOM 能力枚举对象字段、
  复制普通 JSON node、删除 chat 上游不该带的字段，并复用 fallback 的 DOM tool writer 生成规范化
  tools。没有改 SCI，因为 JSON DOM/writer 能力已足够。
- 2026-05-28 新增定向回归：`sa/tests/test_chat_tools_capture.sh` 启动 mock upstream 捕获
  `/v1/chat/completions`，断言 `mcp__code_index__search` namespace 展开、flat custom tools 被 nested
  function 包装、`description`/`parameters`/`strict` 保留、内建 `exec_command/update_plan/get_goal`
  保留，并确认 `web_search/external_web_access/store/prompt_cache_key/include/reasoning` 不泄漏。
  按用户要求未跑全量，只运行 `/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json` 和
  `./tests/test_chat_tools_capture.sh`，均通过。
- 2026-05-28 运行态更新：重新启动 SA 版 hubproxy，PID `3740615` 监听 `0.0.0.0:28080`；Deno
  PID `3666815` 仍监听 `0.0.0.0:27787`。curl 到
  `http://127.0.0.1:28080/v1/chat/completions` 返回 HTTP 200 真实 `chat.completion`，上游接受规范化
  tool schema 并返回 `exec_command` tool call（arguments 为 `echo "SA_CHAT_DIRECT_OK"`）。
- 2026-05-28 Responses/Gemini parity 修复：Deno 对 native `/v1/responses` upstream 只在 Gemini
  模型下删除 `store` 与 `prompt_cache_key`，普通 Responses 请求必须保留 `store`、`prompt_cache_key`、
  `include`、`reasoning` 等 Responses-only 字段。SA 过去对 `/v1/responses` 直通总是转发原始 body；
  已在 `sa/main.sa` 新增 `body_is_gemini_responses_request` 与 `build_responses_proxy_body`，使用现有
  JSON DOM 识别 `gemini` / `gemini-*` / `models/gemini-*` 模型，并仅在 Gemini 请求体中删除不兼容字段。
  普通 responses 请求仍通过复制原始 body 保持字段不变。
- 2026-05-28 新增定向回归：`sa/tests/test_responses_gemini_capture.sh` mock `/v1/responses`
  upstream 连续捕获普通 model 与 Gemini model 两个请求，断言普通 model 保留 `store`、`prompt_cache_key`、
  `include`、`reasoning`，Gemini model 删除 `store`、`prompt_cache_key` 但保留 `include`、`reasoning`、
  `input`。按用户要求未跑全量，只运行 `/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json`
  和 `./tests/test_responses_gemini_capture.sh`，均通过。测试后已恢复 SA 版 hubproxy，PID `3745423`
  监听 `0.0.0.0:28080`；Deno PID `3666815` 仍监听 `0.0.0.0:27787`。
- 2026-05-28 空 JSON body parity 修复：Deno `proxyOpenAI` 对 POST/PUT/PATCH 到
  `/v1/chat/completions` 或 `/v1/responses` 的空白 body 会本地返回 HTTP 400，且不访问 upstream。
  SA 过去会继续代理到上游；已在 `sa/main.sa` 新增 `body_is_blank` 和 `send_json_response`，并在 chat 与
  responses 路径读 body 后立即检查空白内容，返回
  `{"error":{"code":"400","message":"Request body must be a non-empty JSON document.","type":"BadRequest"}}`。
- 2026-05-28 新增定向回归：`sa/tests/test_empty_body_reject.sh` 启动 mock upstream 计数器，分别对
  `/v1/chat/completions` 发送空 body、对 `/v1/responses` 发送空白 body，断言二者均 HTTP 400、包含
  Deno 相同错误消息，并确认 upstream 调用计数仍为 0。按用户要求未跑全量，只运行
  `/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json` 和 `./tests/test_empty_body_reject.sh`，
  均通过。测试后已恢复 SA 版 hubproxy，PID `3748983` 监听 `0.0.0.0:28080`；Deno PID `3666815`
  仍监听 `0.0.0.0:27787`。
- 2026-05-28 Responses base 缺失 fallback 修复：Deno 在 `RESPONSES_BASE_URL` 缺失/为空时不会尝试
  native `/v1/responses` upstream，而是直接把 Responses 请求转换为 Chat Completions fallback。SA 过去即使
  `CFG_RBASE_LEN == 0` 也会拼 `"/responses"` 并创建 upstream 请求，和 Deno 配置兼容性不一致。
  已在 `sa/main.sa` 的 `/v1/responses` 路径中检查 `CFG_RBASE_LEN`，为空时直接构建 chat fallback body，
  并复用 fallback 发送路径发往 `CHAT_BASE_URL + /chat/completions`。
- 2026-05-28 新增定向回归：`sa/tests/test_responses_missing_base_capture.sh` 临时把
  `RESPONSES_BASE_URL=` 置空，mock upstream 对 `/v1/responses` 返回失败、只允许
  `/v1/chat/completions`，断言 SA 请求 `/v1/responses` 时实际命中 chat fallback，body 包含原 model、
  user message 和 `stream:false`。按用户要求未跑全量，只运行
  `/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json` 和
  `./tests/test_responses_missing_base_capture.sh`，均通过。测试后已恢复 SA 版 hubproxy，PID `3753249`
  监听 `0.0.0.0:28080`；Deno PID `3666815` 仍监听 `0.0.0.0:27787`。
- 2026-05-28 Native Responses tools parity 修复：Deno 对 `/v1/responses` 也会规范化 `tools`，但输出
  是 Responses 平铺 schema：`{"type":"function","name":...}`，不是 Chat 的嵌套
  `{"function":{...}}`。SA 过去只在 direct Chat 和 Responses fallback 中规范化 tools，native
  `/v1/responses` 非 Gemini 请求还会绕过 `build_responses_proxy_body` 原样透传，导致 namespace
  tools、flat/nested function tools、`web_search` 过滤与 Deno 不一致。已在 `sa/main.sa` 新增
  Responses 专用 tool DOM writer，展开 namespace 前缀、保留 `description`/`parameters`/`strict`，
  过滤非 function tools，并让所有 native Responses 请求都经过同一个 builder；Gemini 字段删除改为由
  `is_gemini` 参数控制，仅 Gemini 删除 `store` 和 `prompt_cache_key`。
- 2026-05-28 新增定向回归：`sa/tests/test_responses_tools_capture.sh` mock `/v1/responses`
  upstream，断言 namespace `mcp__code_index__search` 展开、flat/nested function tools 变为 Responses
  平铺 schema、`description`/`parameters`/`strict` 保留，并确认 `web_search/external_web_access` 和
  嵌套 `"function":{...}` 不泄漏。按用户要求未跑全量，只运行
  `/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json`、`./tests/test_responses_tools_capture.sh`，
  并补跑受影响的 `./tests/test_responses_gemini_capture.sh`，均通过。
- 2026-05-28 运行态更新：重新启动 SA 版 hubproxy，PID `3759494` 监听 `0.0.0.0:28080`；Deno
  PID `3666815` 仍监听 `0.0.0.0:27787`。使用根 `.env` 的 `AUTH` 向
  `http://127.0.0.1:28080/v1/chat/completions` 发送 OpenAI Chat 形状请求，返回 HTTP 200
  `chat.completion`，确认重启后的 SA 服务入口可用。
- 2026-05-28 SCI std 支撑更新：按“先补 Deno 对应宏，不继续乱撞业务转换”的要求，回到
  `/home/vscode/projects/sci` 查了 `sa_std/encoding/json.sa`、`sa_std/deno.sa` 和 HubProxy Deno 源码中
  高频 `JSON.parse` / `JSON.stringify` 用法。结论是 SA 已有 JSON DOM/stringify 能力，缺的是 Deno facade
  命名层；已在 SCI `sa_std/deno.sa` 增加 `DENO_JSON_PARSE`、`DENO_JSON_STRINGIFY`、
  `DENO_JSON_BUFFER_SLICE`、`DENO_JSON_BUFFER_FREE`、`DENO_JSON_FREE`，并新增
  `tests/deno_json_facade.sa` 定向 fixture。
- 2026-05-28 SCI 安装态验证：新增 JSON facade fixture 先用源码态 `./zig-out/bin/sa` 构建运行通过，
  随后执行 `/home/vscode/projects/sci/tools/install.sh --dir /home/vscode/.sa --no-shell`，ReleaseFast
  更新安装态 SA/std，再用 `/home/vscode/.sa/bin/sa build-exe tests/deno_json_facade.sa ...` 验证导入来自
  `/home/vscode/.sa/std/deno.sa` 且运行退出码 0。期间发现一次 `PhiStateConflict` 是 fixture 多失败分支
  合流导致的合法 affine 状态冲突，不是编译器缺陷，已按 SA 规则拆失败标签修正。
- 2026-05-28 Auth failure request-log parity：Deno `handleHttpWithState` 在
  `HUBPROXY_LOG_DIR` 设置时会为认证失败写文件日志，包含 `auth_failure`、请求 path、客户端 token
  preview 和期望 token preview。SA 过去只打印 `[hubproxy] Auth FAILED` 到 stdout。已扩展
  `sa/src/config.sai`/`config.sa` 读取 `HUBPROXY_LOG_DIR` 到 config，并在 `sa/main.sa` 的未授权分支调用
  `write_auth_failure_log`。日志失败保持不影响请求处理；当前先写固定文件
  `request-sa-auth.json`，内容包含 `{"kind":"auth_failure","path":...}` 与 `abc...789 (len=15)` 风格预览。
- 2026-05-28 新增定向回归：`sa/tests/test_auth_failure_log.sh` 临时设置
  `AUTH=zzz111222333444`、`HUBPROXY_LOG_DIR=<tmp>`、`SA_PORT=28080`，向 `/rpc` 发送
  `Authorization: Bearer abcdef123456789`，断言 HTTP 401，并确认日志文件包含 path、`auth_failure`、
  客户端 token preview 和 expectedAuth preview。按用户要求未跑全量，只运行
  `/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json` 和
  `./tests/test_auth_failure_log.sh`，均通过。测试后已恢复 SA 版 hubproxy，PID `3780547` 监听
  `0.0.0.0:28080`；Deno PID `3666815` 仍监听 `0.0.0.0:27787`。
- 2026-05-28 SCI std 宏优先补全：暂停继续硬转 Deno 业务代码后，回到 SCI 检查
  `sa_std/deno.sa/.sai`、`sa_std/encoding/json.sa`、`demos/rosetta/301_http_client_saasm`、
  `demos/rosetta/302_http_server_saasm` 和 `/home/vscode/projects/sa_plugins` 的 http client/server plugin
  ABI。结论：SA 不是不支持服务器模式，HTTP client/server plugin 已有；缺的是 Deno 风格 std facade。
  已在 SCI 增加 `DENO_HTTP_*` 和 `DENO_SERVE_*` 薄宏桥接真实 plugin 符号，包括 client/request/response、
  header/body/chunk/free，以及 server/start/accept/request method/path/header/body/response/stream/free。
  这避免 HubProxy 业务代码继续手写 plugin extern，也为后续 `fetch`/`Deno.serve` 高层封装打基础。
- 2026-05-28 SCI 定向验证：按“不全量测试”的要求，只运行
  `zig build std-smoke -- "sa_std Deno compatibility facade covers HubProxy porting surface"`。由于 SCI
  `std-smoke` step 当前固定依赖 core 和 containers 两个 child test，Zig 仍执行了这两个 std smoke 子测试，
  但未跑全量编译器 suite。剩余根缺口仍是完整 Web/Deno 对象语义：
  `fetch`、`Request`、`Response`、`Headers`、`ReadableStream`，应作为 std/plugin 高层 facade 实现，
  不应塞进 HubProxy 业务代码里伪造。
- 2026-05-28 SCI 安装态验证：新增 `/home/vscode/projects/sci/tests/deno_http_facade.sa`，只通过
  新宏创建/释放一个 HTTP client 和一个 HTTP server，不绑定端口、不碰 28080/27787。执行
  `/home/vscode/projects/sci/tools/install.sh --dir /home/vscode/.sa --no-shell` 后，用安装态
  `/home/vscode/.sa/bin/sa build-exe tests/deno_http_facade.sa -o /tmp/deno_http_facade --json &&
  /tmp/deno_http_facade` 验证通过，导入解析到 `/home/vscode/.sa/std/deno.sa`。随后用安装态重新构建
  HubProxy：`/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json`，结果
  `{"status":"ok","metrics":{"compile_tokens":22831,"instruction_count":10862}}`。
- 2026-05-28 SCI fetch 命名别名补充：在同一 plugin bridge 上补了 `DENO_FETCH_*`、
  `DENO_HEADERS_*`、`DENO_RESPONSE_*` 便捷宏，减少后续从 Deno 代码迁移时的请求生命周期样板。
  这些仍是薄宏，不是完整 JS `fetch`/`Request`/`Response`/`Headers` 对象模型。重新运行定向
  `zig build std-smoke -- "sa_std Deno compatibility facade covers HubProxy porting surface"` 通过；重新
  `tools/install.sh --dir /home/vscode/.sa --no-shell` 后，安装态 `deno_http_facade.sa` 通过。一次链式命令
  在 SCI cwd 下误跑 HubProxy build 得到 `FileNotFound`，切回 `/home/vscode/projects/hubproxy/sa` 后
  `/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json` 成功，metrics 仍为
  `compile_tokens=22831`、`instruction_count=10862`。
- 2026-05-28 普通 API request-log parity：Deno `handleHttpWithState` 会在
  `HUBPROXY_LOG_DIR` 设置时记录所有 API 路由（`/v1/*` 和 `/rpc`）请求日志，之前 SA 只实现了认证失败日志。
  已在 `sa/main.sa` 新增 `write_api_request_log`，复用 `CFG_LOG_PTR/CFG_LOG_LEN` 和 JSON builder，
  对 `/v1/chat/completions`、`/v1/responses`、`/rpc` 在读 body 后写入
  `{"kind":"request-log","path":...,"method":...,"bodyBytes":...}`；对 `/v1/models` GET 写 `bodyBytes:0`。
  当前仍采用固定文件名 `request-sa-api.json`，和 auth log 的固定文件策略一致，后续如需完全模拟 Deno
  timestamp+uuid 文件名应再补 runtime/time/uuid 拼接封装。
- 2026-05-28 新增定向回归：`sa/tests/test_api_request_log.sh` 临时设置
  `HUBPROXY_LOG_DIR=<tmp>`、`SA_PORT=28080`、`AUTH=client-secret`，mock `RESPONSES_BASE_URL` 到 28081，
  发送授权 `/v1/responses` POST，断言 mock response 成功，并确认
  `${log_dir}/request-sa-api.json` 包含 `request-log`、`/v1/responses`、`POST` 和非零 `bodyBytes`。
  只运行 `/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json` 与
  `./tests/test_api_request_log.sh`，均通过。
- 2026-05-28 运行态更新：测试会停止 28080 上旧 SA 进程但不动 Deno 27787。测试后重新后台启动 SA：
  PID `3795914` 监听 `0.0.0.0:28080`；Deno PID `3666815` 继续监听 `0.0.0.0:27787`。
- 2026-05-28 request-log 文件内容补齐：上一版 SA 普通 API 日志只写 summary
  `kind/path/method/bodyBytes`，而 Deno `writeRequestLog` 写入的是完整 entry：
  `path`、`method`、redacted `headers` 和 `body`。已扩展 `write_api_request_log` 接收 `req` 和 body
  指针，输出 `headers.authorization`、`headers.x-api-key`、`headers.content-type`，其中 token header 复用
  `log_append_token_preview` 做 `abc...xyz (len=N)` 预览；同时把 body 作为 JSON string 写入，GET models
  仍写 `body:null` 和 `bodyBytes:0`。
- 2026-05-28 增强回归：`sa/tests/test_api_request_log.sh` 现在额外发送 `x-api-key`，并断言日志文件包含
  redacted `authorization`、redacted `x-api-key`、`content-type:"application/json"` 以及 escaped JSON body。
  已重新运行 `/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json` 和
  `./tests/test_api_request_log.sh`，均通过。测试后重新启动 SA，PID `3799364` 监听
  `0.0.0.0:28080`；Deno PID `3666815` 仍监听 `0.0.0.0:27787`。
- 2026-05-28 未授权 API request-log 根因修复：Deno `handleHttpWithState` 是先判定
  `url.pathname.startsWith("/v1/") || url.pathname === "/rpc"` 并写 request log，再进入 health/auth/routing；
  SA 之前只在已授权的 `/v1/chat/completions`、`/v1/responses`、`/rpc` 处理分支里写
  `request-sa-api.json`，导致未授权 `/rpc` 只有 `request-sa-auth.json`，缺少认证前 API 请求日志。
  已在 `sa/main.sa` 的 `L_NO_AUTH` 分支中识别 `/v1/chat/completions`、`/v1/responses`、`/rpc`，
  读取 request body 后先调用 `write_api_request_log`，再调用 `write_auth_failure_log`。
- 2026-05-28 SA affine 注意：本次修复一开始触发 `PhiStateConflict`，根因是 `L_NO_AUTH_API_LOG` 与
  skip 分支汇合到同一个 auth-log tail 时，分支内新建的 stack slot/register 状态不一致。最终做法是把
  `noauth_body_ptr_slot` 和 `noauth_body_len_slot` 放到分支前，并确保 branch condition 两边都释放；
  以后遇到同类问题优先检查汇合标签的寄存器所有权状态，不要误判为 HTTP 插件问题。
- 2026-05-28 新增定向回归：扩展 `sa/tests/test_auth_failure_log.sh`，同一个未授权 `/rpc` 请求现在同时断言
  `${HUBPROXY_LOG_DIR}/request-sa-auth.json` 和 `${HUBPROXY_LOG_DIR}/request-sa-api.json`；API 日志需包含
  `kind:"request-log"`、`path:"/rpc"`、`method:"POST"`、redacted `authorization`、
  `content-type:"application/json"`、非零 `bodyBytes` 和 escaped JSON-RPC body。按“不全量测试”要求只运行
  `/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json` 与
  `./tests/test_auth_failure_log.sh`，均通过，build metrics 为
  `compile_tokens=23279`、`instruction_count=11081`。
- 2026-05-28 当前运行态：已重新启动 SA 版 HubProxy，PID `3803753` 监听 `0.0.0.0:28080`；
  Deno PID `3666815` 继续监听 `0.0.0.0:27787`，未被停止。使用 `.env` 的 `AUTH` 和
  `DEFAULT_MODEL=mimo-v2.5` 向 `http://127.0.0.1:28080/v1/chat/completions` 发送 OpenAI chat 形态
  `{"messages":[{"role":"user","content":"ping"}]}`，返回 HTTP 200 `chat.completion`。用
  `gpt-4.1` 测试时上游返回 HTTP 400 `Not supported model gpt-4.1`，这证明请求已到达上游，不是代理链路失败。
- 2026-05-28 thread/goal 参数化修复：继续对照 Deno `src/handlers.ts` 检查 SA RPC 行为，发现
  `thread/goal/set|get|clear` 虽有分发但仍硬编码 `threadId=1`、`objective="default objective"` 和
  `tokenBudget=100000`，且 `state_goal_set` 每次追加新 goal，没有更新同 thread 的已有 goal；同时 goal
  objective 保存请求 body 指针，长期状态不可靠。已修复为从 JSON-RPC params 读取 `threadId`、
  `objective` 和数字型 `tokenBudget`，`get/clear` 也按请求 threadId 操作。
- 2026-05-28 state 根因修复：`sa/src/state.sai`/`state.sa` 的 goal slot 扩大为 inline objective
  存储，新增 `state_goal_get_full` 返回 budget、tokensUsed 和 objective slice；`state_goal_set`
  现在会更新同 thread 的已有 goal，并把 objective 复制到 state 内存，不再保存临时 body 指针。因为
  goal slot 变大，`ST_NOTIFY_DATA`/`STATE_MEM_SIZE`/`ST_TOTAL` 已相应调整，避免通知 ring 与 goal 区域重叠。
- 2026-05-28 JSON 细节回归：本轮测试首次抓到 `J_GOAL_OBJ_B2_LEN` 多 1，导致响应中
  `"tokenBudget":\0 321` 夹入 NUL 字节。已把该常量长度修为 33；以后新增 `@const utf8` 后必须用实际长度
  校验，尤其是拼接 JSON 片段时。
- 2026-05-28 本轮定向验证：按用户要求未跑全量。运行
  `/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json` 通过，metrics 为
  `compile_tokens=23853`、`instruction_count=11365`；运行
  `/home/vscode/.sa/bin/sa build tests/test_http_contract.sa -o tests/test_http_contract --json` 通过，
  metrics 为 `compile_tokens=5159`、`instruction_count=2451`；在干净 SA 进程上运行
  `./tests/test_http_contract` 通过。该合同新增断言：goal set 回显 `"objective":"ship sa goal"` 和
  `"tokenBudget":321`，goal get 能读回 objective，goal clear 返回 `"cleared":true`，clear 后 goal get
  返回 `"goal":null`。
- 2026-05-28 当前运行态：SA 版 PID `3813615` 监听 `0.0.0.0:28080`；Deno PID `3666815` 继续监听
  `0.0.0.0:27787`，本轮没有停止 Deno。
- 2026-05-28 elicitation lifecycle 修复：对照 Deno `src/handlers.ts` 发现
  `item/tool/requestUserInput` 和 `mcpServer/elicitation/request` 会调用 `state.incrementElicitation(threadId)`，
  `serverRequest/resolved` 会调用 `state.decrementElicitation(threadId)`；SA 之前只返回固定结果或只推送部分通知，
  没有改变线程 pause/elicitation 计数，导致后续 `thread/decrement_elicitation` 状态不符合 Deno。
- 2026-05-28 本轮实现：`sa/main.sa` 的 `L_RPC_ITEM_TOOL_USER_INPUT` 和
  `L_RPC_MCP_ELICITATION` 现在从 params 解析 `threadId` 并调用 `state_thread_increment_elicitation`；
  `L_RPC_SERVER_REQUEST_RESOLVED` 解析 `threadId` 并调用 `state_thread_decrement_elicitation`。同时新增
  `EV_MCP_ELICITATION`，使 MCP elicitation request 也进入 SSE 通知环。
- 2026-05-28 测试策略：最初把二次 resolved/drain 断言塞入已很大的 `test_http_contract.sa` 后，测试二进制出现
  segfault；没有放宽行为要求，而是把新增行为拆成更小的 shell 回归
  `sa/tests/test_elicitation_lifecycle.sh`，真实启动 SA、创建 thread、发送
  `item/tool/requestUserInput`、`mcpServer/elicitation/request`、两次 `serverRequest/resolved`，最后用
  `thread/decrement_elicitation` 断言 `count:0` 和 `paused:false`，证明两个 pending elicitation 都被 resolved
  消耗。
- 2026-05-28 本轮定向验证：按“不全量测试”只运行
  `/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json`（metrics:
  `compile_tokens=23880`、`instruction_count=11378`）、
  `/home/vscode/.sa/bin/sa build tests/test_http_contract.sa -o tests/test_http_contract --json`（metrics:
  `compile_tokens=5159`、`instruction_count=2451`）和
  `./tests/test_elicitation_lifecycle.sh`，均通过。最终 SA PID `3822598` 监听
  `0.0.0.0:28080`；Deno PID `3666815` 仍监听 `0.0.0.0:27787`。
- 2026-05-28 process lifecycle 根因修复：对照 Deno `src/state.ts` 后确认 `process/spawn`
  会把 `processHandle` 记录进 `state.processes`，`process/kill` 删除存在的 handle 并返回 true，重复删除返回
  false；SA 之前 `process/spawn` 虽真实执行命令并推送 output/exited 事件，但没有持久化 handle，
  `process/kill` 因此永远返回 `{"ok":false}`。已在 `sa/src/state.sai`/`state.sa` 增加小型 process
  handle 表、`state_process_put` 和 `state_process_delete`，`send_rpc_process_spawn` 成功后登记 handle，
  `process/kill` 解析请求 `processHandle` 后按表返回 true/false。删除后的 slot 会复用，避免长期运行
  64 次 spawn/kill 后无法继续登记。
- 2026-05-28 process lifecycle 定向回归：新增 `sa/tests/test_process_lifecycle.sh`，真实启动 SA 28080，
  调用 `process/spawn` 创建 `proc-life`，第一次 `process/kill` 断言 `"ok":true`，第二次断言 `"ok":false`。
  按“不全量测试”只运行 `/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json`（metrics:
  `compile_tokens=24335`、`instruction_count=11603`）和 `./tests/test_process_lifecycle.sh`，均通过。
- 2026-05-28 SA std Deno 宏补齐：按“先暂停 Deno 代码转换，优先补 Deno 对应宏”的要求，检查
  `/home/vscode/projects/sci/sa_std/deno.sa`、`sa_std/deno.sai`、`sa_plugins/tests/deno_plugin.sa` 和
  HubProxy 当前 `EXPAND DENO_*` 使用面，确认源码 std 已有 env/json/fs/process/http/fetch 基础宏，但缺少旧插件
  facade 已提供的 `DENO_COMMAND_EXEC` 与统一 `DENO_FREE_BUFFER`。已在 SCI 中新增 runtime
  `sa_std_process_exec_capture`、`DENO_COMMAND_EXEC`、`DENO_FREE_BUFFER`，新增
  `tests/deno_command_exec_facade.sa` 回归，并用系统 `/home/vscode/.sa/bin/sa` 编译运行通过。
- 2026-05-28 工具链安装状态：已执行 `sh tools/install.sh --dir /home/vscode/.sa --no-shell`，ReleaseFast
  重建并安装了最新 `sa` 编译器和 `/home/vscode/.sa/std`，因此 HubProxy 后续可直接使用新增 Deno facade 宏。
- 2026-05-28 account plan parity 修复：对照 Deno `src/env.ts` 和 `src/handlers.ts`，`account/read` 与
  `account/rateLimits/read` 的 `planType` 应来自 `ACCOUNT_PLAN_TYPE`，缺省时通过 `accountPlanType(config)` 归一为
  `"plus"`；SA 之前常量 `J_ACCOUNT_RESULT`/`J_RATE_LIMITS_RESULT` 硬编码 `"api-key"`。已扩展
  `sa/src/config.sai`/`config.sa` 读取 `ACCOUNT_PLAN_TYPE`，并新增 `send_rpc_account_read` 与
  `send_rpc_rate_limits` 从 config 构造响应，未设置时输出 `"plus"`。
- 2026-05-28 account plan 定向回归：新增 `sa/tests/test_account_plan_type.sh`，临时把 `.env` 设置为
  `ACCOUNT_PLAN_TYPE=enterprise`，验证 `account/read` 和 `account/rateLimits/read` 都返回
  `"planType":"enterprise"`；恢复原 `.env` 后重启 SA，再验证默认 `"planType":"plus"`。按“不全量测试”只运行
  `/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json`（metrics:
  `compile_tokens=24492`、`instruction_count=11677`）和 `./tests/test_account_plan_type.sh`，均通过。最终
  SA PID `3841479` 监听 `0.0.0.0:28080`；Deno PID `3666815` 仍监听 `0.0.0.0:27787`。
- 2026-05-28 config/read null parity 修复：对照 Deno `loadConfig` 和 `config/read`，`RESPONSES_BASE_URL`
  与 `AUTH` 是可选字段，缺失时响应 JSON 应分别是 `"responsesBaseUrl":null` 和 `"authToken":null`；
  SA 之前因为 config loader 把空值保存为长度 0 slice，`send_rpc_config_read` 统一走
  `rpc_builder_append_json_string`，输出的是空字符串 `""`。已在 `send_rpc_config_read` 中按长度分支：
  `CFG_RBASE_LEN`/`CFG_AUTH_LEN` 为 0 时写 `null`，有值时写 JSON string；`host`、`chatBaseUrl`、
  `defaultModel` 仍作为必需字符串输出。
- 2026-05-28 config/read null 定向回归：新增 `sa/tests/test_config_read_nulls.sh`，临时把 `.env` 中
  `AUTH=`、`RESPONSES_BASE_URL=` 清空，同时设置最小必需 `CHAT_BASE_URL`、`DEFAULT_MODEL`、
  `OPENAI_API_KEY`、`DATA_DIR` 和 `SA_PORT=28080`，不带鉴权调用 `/rpc config/read`，断言
  `"responsesBaseUrl":null`、`"authToken":null`、`chatBaseUrl` 和 `defaultModel` 均符合配置。按“不全量测试”
  只运行 `/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json`（metrics:
  `compile_tokens=24532`、`instruction_count=11697`）和 `./tests/test_config_read_nulls.sh`，均通过。最终
  SA PID `3844751` 监听 `0.0.0.0:28080`；Deno PID `3666815` 仍监听 `0.0.0.0:27787`。
- 2026-05-28 account email parity 修复：对照 Deno `src/env.ts`/`src/handlers.ts`，`account/read`
  的 email 应来自 `.env` 的 `ACCOUNT_EMAIL`，缺省才是 `user@example.com`；SA 之前把 email 固定写进
  `J_ACCOUNT_A`，无法跟随配置。已扩展 `sa/src/config.sai`/`config.sa` 读取 `ACCOUNT_EMAIL`，并拆分
  `J_ACCOUNT_A`/`J_ACCOUNT_PLAN`，让 `send_rpc_account_read` 先按配置或默认值输出 email，再输出 planType。
- 2026-05-28 account email 定向回归：新增 `sa/tests/test_account_email.sh`，临时设置
  `AUTH=client-secret`、`SA_PORT=28080`、`ACCOUNT_EMAIL=alice@example.com`，真实启动 SA 后调用
  `/rpc account/read`，断言 `"type":"chatgpt"` 和 `"email":"alice@example.com"`。按“不全量测试”只运行
  `/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json`（metrics:
  `compile_tokens=24617`、`instruction_count=11738`）和 `./tests/test_account_email.sh`，均通过。
- 2026-05-28 SA std process cwd 根因修复：对照 Deno `new Deno.Command(command[0], { args,
  cwd })` 的行为后确认 SA std 的 process facade 缺少 cwd 版本，导致 HubProxy 即使收到请求里的 `cwd`
  也只能继承当前进程目录。已在 SCI `src/runtime/sa_std.zig` 中新增 `spawnProcessCwd`，
  并导出 `sa_std_process_run_cwd`、`sa_std_process_spawn_cwd`、`sa_std_process_spawn_stream_cwd`、
  `sa_std_process_exec_capture_cwd`；`sa_std/deno.sa` 新增 `DENO_COMMAND_RUN_CWD`、
  `DENO_COMMAND_SPAWN_CWD`、`DENO_COMMAND_SPAWN_STREAM_CWD`、`DENO_COMMAND_EXEC_CWD` 宏。
- 2026-05-28 SA std cwd 定向验证与安装：未跑全量，先用
  `zig build-lib src/runtime/sa_std.zig -O Debug -lc -femit-bin=/tmp/libsa_std_cwd_check.a`
  检查 runtime 编译，再执行 `sh tools/install.sh --dir /home/vscode/.sa --no-shell` 以 ReleaseFast
  重建并安装系统 `sa` 和 std；随后用系统 `/home/vscode/.sa/bin/sa build
  tests/deno_command_cwd_facade.sa -o /tmp/deno_command_cwd_facade --json` 编译新增测试
  （metrics: `compile_tokens=807`、`instruction_count=294`），运行 `/tmp/deno_command_cwd_facade`
  返回 0。
- 2026-05-28 HubProxy command/process cwd parity：`sa/main.sa` 新增解析请求参数 `"cwd"`，
  `command/exec` 和 `process/spawn` 现在通过 `DENO_COMMAND_RUN_CWD` 执行；请求未携带 cwd 时传 `"."`，
  不写死工程目录。新增 `sa/tests/test_command_exec_cwd.sh`，真实启动 SA 28080，调用
  `command/exec` 执行 `pwd` 并断言 stdout 为 `/home/vscode/projects/hubproxy\n`；同时打开 SSE，
  调用 `process/spawn` 执行 `pwd`，断言 `process/outputDelta` 的 base64 和 `process/exited.stdout`
  都来自请求 cwd。按“不全量测试”只运行 `/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json`
  （metrics: `compile_tokens=24734`、`instruction_count=11793`）和
  `./tests/test_command_exec_cwd.sh`，均通过。
- 2026-05-28 thread/turns/items/list 根因修复：对照 Deno `HubState.startTurn` 和
  `thread/turns/items/list`，SA 之前 `Turn` slot 没有保存 items，RPC 只能固定返回空数组；这会让客户端无法
  通过 turnId 读回 `turn/start` 的 input items。已扩展 `sa/src/state.sai` 的 TURN slot 到 304 字节，
  新增 `TURN_ITEMS_LEN`/`TURN_ITEMS` 和 `state_turn_set_items`，并后移 `ST_GOALS`、`ST_PROCESSES`、
  `ST_NOTIFY_DATA`/`STATE_MEM_SIZE`，避免扩大 turn 后覆盖后续区域。`turn/start` 现在抽取请求里的
  `"input":[...]` 原始 JSON 数组并保存到 turn；`thread/turns/items/list` 按 threadId/turnId 查 turn，
  有 items 时返回 `{"data":<items>,"nextCursor":null,"backwardsCursor":null}`，缺失或没有 items 时仍返回空数组，
  与 Deno 对 missing turn 的空列表语义一致。
- 2026-05-28 turn items 定向回归：新增 `sa/tests/test_turn_items_list.sh`，真实启动 SA 28080，
  `thread/start` 后调用 `turn/start`，传入 `input:[{type:"message",role:"user",content:"remember-me"}]`，
  再调用 `thread/turns/items/list` 断言能读回该 item。按“不全量测试”只运行
  `/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json`（metrics:
  `compile_tokens=25283`、`instruction_count=12064`）和 `./tests/test_turn_items_list.sh`，均通过。
  本轮还修正了新增 `J_TURN_ITEMS_B_LEN` 从 43 到 42，避免 JSON 响应夹入 NUL 字节。
- 2026-05-28 thread/inject_items 根因修复：对照 Deno `state.injectItems`，SA 之前只返回静态
  `injectedCount:0`，没有创建 turn、没有保存 items、也没有推送 item lifecycle。已把
  `send_rpc_thread_inject_items` 改为显式接收当前 `state_ptr`，验证 thread 存在后创建新 turn，
  复用 `rpc_extract_array_after` 保存原始 `params.items` 数组到 turn；同时用 SA std JSON DOM
  解析 `root.params.items`，通过 `sa_json_value_count` 统计真实数量，并序列化第一个 item 推送
  `item/started`、`rawResponseItem/completed`、`item/completed`。响应 `threadId` 已按现有协议改为
  字符串。新增 `sa/tests/test_inject_items_lifecycle.sh`，真实启动 SA 28080、连接 `/events`、调用
  `thread/inject_items`，再用 `thread/turns/list` 和 `thread/turns/items/list` 验证新 turn 的 items，
  并断言三类 SSE item 事件和 payload。按“不全量测试”只运行
  `/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json`（metrics:
  `compile_tokens=25810`、`instruction_count=12322`）和 `./tests/test_inject_items_lifecycle.sh`，
  均通过。
- 2026-05-28 turn/steer items 根因修复：对照 Deno `HubState.steerTurn`，SA 之前只验证
  `expectedTurnId` 存在并返回 `{turnId}`，没有把 `params.input` 追加进 turn items，导致
  `thread/turns/items/list` 看不到 steer 后输入。已在 `sa/src/state.sai`/`state.sa` 新增
  `state_turn_append_items`，对已有 raw JSON array 执行安全追加（保留原数组末尾前缀、插入逗号、复制新
  input 数组 payload、补回 `]`，超过 `TURN_ITEMS_CAP` 时返回失败不破坏原数据）；`send_rpc_turn_steer`
  现在接收 body，提取 `input:[...]` 并追加保存。新增 `sa/tests/test_turn_steer_items.sh`，真实启动
  SA 28080，`turn/start` 写入 `start` item 后调用 `turn/steer` 写入 `steered` item，再通过
  `thread/turns/items/list` 断言两个 item 按顺序返回。按“不全量测试”只运行
  `/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json`（metrics:
  `compile_tokens=26068`、`instruction_count=12450`）和 `./tests/test_turn_steer_items.sh`，均通过。
- 2026-05-28 turn/steer 追加边界修复：复核 `state_turn_append_items` 后发现初版默认旧数组和新数组都有
  payload；当旧 items 是 `[]` 时会拼出 `[,item]`，当新 input 是 `[]` 时会追加裸逗号，均不是合法
  Deno 行为。已把追加逻辑拆成三条路径：新 input 无 payload 时不修改旧 items；旧 items 无 payload
  时直接用新 input 覆盖；两边都有 payload 时才执行 `[..., ...]` 拼接。`sa/tests/test_turn_steer_items.sh`
  已扩展覆盖 `[] + [item]` 和 `[item] + []` 两个边界。按“不全量测试”只运行
  `/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json`（metrics:
  `compile_tokens=26070`、`instruction_count=12451`）和 `./tests/test_turn_steer_items.sh`，均通过。
- 2026-05-28 turn/interrupt 根因修复：对照 Deno `HubState.interruptTurn`，SA 之前不查 turn 是否存在，
  直接推送 `turn/completed` 并返回 `{interrupted:true}`，导致不存在的 turn 也被客户端视为成功。已在
  `sa/src/state.sai`/`state.sa` 新增 `state_turn_interrupt`，通过 `state_turn_find` 验证
  threadId/turnId 并把 `TURN_STATUS` 标记为 interrupted；`send_rpc_turn_interrupt` 现在只在 state
  更新成功后推送 `turn/completed`，找不到 turn 时返回 Deno 兼容的 `turn not found` 404 错误。
  新增 `sa/tests/test_turn_interrupt_lifecycle.sh`，真实启动 SA 28080 并连接 `/events`，覆盖成功中断响应、
  缺失 turn 错误响应，以及成功路径的 `event: turn/completed`。按“不全量测试”只运行
  `/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json`（metrics:
  `compile_tokens=26144`、`instruction_count=12487`）和 `./tests/test_turn_interrupt_lifecycle.sh`，均通过。
- 2026-05-28 turn status 序列化修复：`TURN_STATUS` 写入 interrupted 后，SA 之前的 turn JSON 仍由
  `J_TURN_OBJ_B` 固定输出 `"status":"inProgress"`，导致 `thread/turns/list`、`thread/read`
  includeTurns 以及 `turn/completed` SSE 中的 turn 状态与 state 不一致。已把 turn builder 拆成
  `rpc_builder_append_turn_status`，按 `TURN_STATUS` 输出 `inProgress`、`interrupted` 或 `completed`，
  interrupted/completed 会输出非空 `completedAt` 和 `durationMs:0`；`send_rpc_turns_list` 和
  `send_rpc_thread_read(... includeTurns=true)` 现在从 `state_turn_find` 读取每个 turn 的状态再序列化，
  `notify_turn_completed` 直接输出 interrupted turn。`sa/tests/test_turn_interrupt_lifecycle.sh`
  已扩展断言 `thread/turns/list` 和 SSE payload 都包含 `"status":"interrupted"`。按“不全量测试”
  只运行 `/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json`（metrics:
  `compile_tokens=26232`、`instruction_count=12528`）和 `./tests/test_turn_interrupt_lifecycle.sh`，均通过。
- 2026-05-28 turn/start 孤儿 turn 根因修复：对照 Deno `HubState.startTurn`，SA 之前
  `state_turn_create` 不验证 thread 是否存在，`turn/start` 传入不存在的 threadId 时会创建孤儿 turn，
  仍返回成功。已把 `state_turn_create` 改为先 `state_thread_find`，找不到 thread 直接返回 0；
  RPC `L_RPC_TURN_START` 现在检测 `new_turn_id == 0` 并返回 Deno 兼容的 `thread not found` 404，
  不再推送 `turn/started`。新增 `sa/tests/test_turn_start_missing_thread.sh`，真实启动 SA 28080，
  先验证不存在 thread 的 `turn/start` 返回 `thread not found`，再验证正常 `thread/start` 后仍可
  创建 `inProgress` turn。按“不全量测试”只运行 `/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json`
  （metrics: `compile_tokens=26274`、`instruction_count=12549`）、
  `/home/vscode/.sa/bin/sa build tests/test_state.sa -o tests/test_state --json && ./tests/test_state`
  和 `./tests/test_turn_start_missing_thread.sh`，均通过。
- 2026-05-28 turn/start input item lifecycle 修复：对照 Deno `HubState.startTurn`，创建 turn 后会对
  每个 input item 调用 `emitCompletedItem`，推送 `item/started`、子类型 item 通知、
  `rawResponseItem/completed`、`item/completed`；SA 之前只推送 `turn/started`、`turn/diff/updated`、
  `turn/plan/updated`，虽然保存了 items，但事件流缺少 input item lifecycle。已新增
  `notify_completed_item_node` 和 `notify_turn_input_items_from_dom`，用 SA std JSON DOM 解析
  `root.params.input[]`，逐项 stringify 后推送基础三段 item lifecycle；`turn/start` 在
  turn 通知后调用该 helper。构建中遇到循环内 `stack_alloc item_slot` 的 `PhiStateConflict`，
  已按 SA affine 规则把循环临时槽前置到 loop init。`sa/tests/test_turn_items_list.sh`
  已扩展为同时连接 `/events`，验证 `turn/start` input item 能读回且 SSE 收到
  `item/started`、`rawResponseItem/completed`、`item/completed` 和原始 payload。按“不全量测试”
  只运行 `/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json`（metrics:
  `compile_tokens=26600`、`instruction_count=12711`）和 `./tests/test_turn_items_list.sh`，均通过。
- 2026-05-28 turn/steer input item lifecycle 修复：对照 Deno `HubState.steerTurn`，追加 input 后也会
  对每个 item 调用 `emitCompletedItem`；SA 之前只把 `params.input` 追加到 turn items，不推送
  `item/started`、`rawResponseItem/completed`、`item/completed`。已在 `send_rpc_turn_steer`
  成功追加后复用 `notify_turn_input_items_from_dom`，让 steer 路径和 start 路径共用同一套
  SA std JSON DOM 解析与 item lifecycle 发送。`sa/tests/test_turn_steer_items.sh` 已扩展为连接
  `/events`，验证 steer 后 items/list 仍按顺序返回 `start`、`steered`，且 SSE 收到
  `steered` item 的三段 lifecycle。按“不全量测试”只运行
  `/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json`（metrics:
  `compile_tokens=26604`、`instruction_count=12713`）和 `./tests/test_turn_steer_items.sh`，均通过。
- 2026-05-28 thread/unsubscribe 状态修复：对照 Deno `HubState.unsubscribeThread`，不存在的 thread
  应返回 `{"status":"notLoaded"}`，存在但未订阅才返回 `{"status":"notSubscribed"}`；SA 之前固定返回
  `notSubscribed`，让客户端无法区分未加载 thread。已新增 `J_UNSUB_NOT_LOADED_RESULT` 和
  `send_rpc_thread_unsubscribe`，通过 `state_thread_find` 区分 missing/existing，当前 SA 尚无订阅集合，
  因此 existing 分支保持 `notSubscribed`。新增 `sa/tests/test_thread_unsubscribe_status.sh`，真实启动
  SA 28080，先验证不存在 thread 返回 `notLoaded`，再创建 thread 并验证返回 `notSubscribed`。按
  “不全量测试”只运行 `/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json`（metrics:
  `compile_tokens=26658`、`instruction_count=12739`）和 `./tests/test_thread_unsubscribe_status.sh`，均通过。
- 2026-05-28 thread/name/set 事件 parity 修复：对照 Deno `HubState.setThreadName`，设置或清空 thread
  name 后必须推送 `thread/name/updated`，params 为 `{"threadId":"...","name":<string|null>}`；SA 之前
  只更新 state 并返回 RPC result，没有 SSE 通知，导致订阅客户端无法收到重命名变化。已新增
  `EV_THREAD_NAME_UPDATED` 和 `notify_thread_name_updated`，`send_rpc_thread_name_set` 的 set/clear
  成功分支都会推送事件。新增 `sa/tests/test_thread_name_events.sh`，真实启动 SA 28080，连接 `/events`，
  覆盖 `"name":"renamed"` 和 `"name":null` 两个事件。按“不全量测试”只运行
  `/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json`（metrics:
  `compile_tokens=26698`、`instruction_count=12758`）和 `./tests/test_thread_name_events.sh`，均通过。
- 2026-05-28 SA std Deno FS facade 补全：暂停业务转换后对照 HubProxy Deno 代码实际用到的
  `Deno.makeTempDir`、`Deno.makeTempFile`、`Deno.stat/statSync`、`Deno.readFile/readFileSync`、
  `Deno.writeFile/writeFileSync`，发现 SA std `deno.sa` 已有 text/base64/lstat/remove/copy 等宏，但缺少
  这些 Deno 文件系统别名和临时路径能力。已在 SCI `src/runtime/sa_std.zig` 新增
  `sa_deno_make_temp_dir`、`sa_deno_make_temp_file`，在 `sa_std/deno.sai` 导出，并在
  `sa_std/deno.sa` 新增 `DENO_READ_FILE(_SYNC)`、`DENO_WRITE_FILE(_SYNC)`、
  `DENO_STAT_JSON(_SYNC)`、`DENO_MAKE_TEMP_DIR(_SYNC)`、`DENO_MAKE_TEMP_FILE(_SYNC)`。
  同时修复既有 Deno fallible 宏未消费内部 `Fallible` 临时寄存器的问题；新增测试首次触发了
  `MemoryLeak`，根因是宏 hygiene，而不是业务测试应绕过。新增 `tests/deno_fs_facade.sa`，
  覆盖临时目录/文件、写 bytes、stat/lstat、读回和清理；同步更新 `tests/std_smoke_core.zig` 与
  `tests/std_smoke.zig` 的 HubProxy porting surface 检查。已执行
  `zig build-lib src/runtime/sa_std.zig -O Debug -lc -femit-bin=/tmp/libsa_std_deno_fs_check.a`、
  `sh tools/install.sh --dir /home/vscode/.sa --no-shell`（ReleaseFast 安装）、
  `/home/vscode/.sa/bin/sa build tests/deno_fs_facade.sa -o /tmp/deno_fs_facade --json && /tmp/deno_fs_facade`
  （metrics: `compile_tokens=1152`、`instruction_count=465`），以及带目标测试名的
  `zig build std-smoke --summary none -- "sa_std Deno compatibility facade covers HubProxy porting surface"`，
  均通过。
- 2026-05-28 fs/watch 与 fs/unwatch 状态语义修复：对照 Deno `HubState.watch/unwatch`，
  `fs/watch` 会记录 `watchId -> path`，`fs/unwatch` 返回 `Map.delete(watchId)` 的布尔值；SA 之前只推送
  `fs/changed`，没有保存 watchId，并且 `fs/unwatch` 无论是否存在都固定返回 `{"ok":true}`。已在
  `sa/src/state.sai` 增加独立 watch 表（`ST_WATCH_COUNT`、`ST_WATCHES`、`WATCH_*` 布局）并后移
  notify ring buffer，`sa/src/state.sa` 新增 `state_watch_put` / `state_watch_delete`；`sa/main.sa`
  的 `fs/watch` 成功记录 watchId 后再推送事件，`fs/unwatch` 对未注册或缺失 watchId 返回
  `{"ok":false}`，第一次删除注册 watch 返回 `{"ok":true}`。新增
  `sa/tests/test_fs_watch_unwatch.sh`，真实启动 SA 28080，覆盖未注册 unwatch=false、watch 响应和
  `fs/changed` SSE、第一次 unwatch=true、第二次 unwatch=false。按“不全量测试”只运行
  `/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json`（metrics:
  `compile_tokens=27161`、`instruction_count=12986`）和 `./tests/test_fs_watch_unwatch.sh`，均通过。
- 2026-05-28 `.env` 解析 Deno parity 修复：对照 Deno `loadDotenvIntoEnv`，SA 的
  `cfg_parse_line` 之前直接按原始行匹配 key/value，不能处理 ` KEY = 'value' `、双引号 value、
  行尾 CR、以及 `CODEX_` 前缀跳过语义。已在 `sa/src/config.sa` 新增 `cfg_trim_span`、
  `cfg_unquote_span` 和空白判断 helper，`cfg_parse_line` 现在先 trim key/value、剥离匹配的单/双引号，
  并用 trim 后 key 执行 `CODEX_` 跳过。实现时触发 SA affine 控制流问题：右 trim 循环的首次入口
  与回边寄存器状态不一致，以及 unquote no-strip 路径错误落入需要 `can_quote` 的标签；已通过拆分
  `L_TRIM_RIGHT_ENTER` 和 `L_UNQUOTE_KEEP_STORE` 修复根因。已扩展 `sa/tests/test_config.sa` 覆盖
  trim、单/双引号、CODEX 跳过分支和真实 `../.env` 的 `SA_PORT=28080` 读取。按“不全量测试”只运行
  `/home/vscode/.sa/bin/sa build tests/test_config.sa -o tests/test_config --json && ./tests/test_config`
  （metrics: `compile_tokens=1790`、`instruction_count=870`）以及
  `/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json`（metrics:
  `compile_tokens=27516`、`instruction_count=13162`），均通过。
- 2026-05-28 SA std Deno HubProxy facade 补强：按“先补 SA std 宏，不继续乱撞业务转换”的要求，
  重新扫描 HubProxy Deno 调用面并对照 `sa_std/deno.sa`，确认已覆盖 `readTextFileSync`、
  `writeTextFile/writeTextFileSync`、`readFile/writeFile`、`mkdirSync({recursive:true})`（runtime
  `sa_fs_make_dir` 已是 `makePath` 递归语义）、`remove/removeSync`、`copyFileSync`、
  `makeTempDir/makeTempFile`、`Command`、`cwd/chdir`、env、HTTP server/client 等主路径。
  本轮补齐缺少的贴近 Deno 命名的 facade：`DENO_VERSION_DENO`、`DENO_BUILD_OS`、
  `DENO_BUILD_PLATFORM_FAMILY`，以及无 `_JSON` 后缀的 `DENO_READ_DIR(_SYNC)`、
  `DENO_LSTAT(_SYNC)`、`DENO_STAT(_SYNC)` 别名，避免业务迁移时记住 SA 内部命名。
  在 SCI `src/runtime/sa_std.zig` 增加对应 `sa_deno_version_deno`、`sa_deno_build_os`、
  `sa_deno_build_platform_family` 导出，`sa_std/deno.sai`/`deno.sa` 暴露宏；新增
  `tests/deno_hubproxy_facade.sa` 覆盖版本/平台属性、stat/lstat/readDir 别名和临时目录清理。
  已执行 `zig build-lib src/runtime/sa_std.zig -O Debug -lc -femit-bin=/tmp/libsa_std_hubproxy_facade_check.a`、
  `zig build std-smoke --summary none -- "sa_std Deno compatibility facade covers HubProxy porting surface"`、
  `sh tools/install.sh --dir /home/vscode/.sa --no-shell`（ReleaseFast 安装）、
  `/home/vscode/.sa/bin/sa build tests/deno_hubproxy_facade.sa -o /tmp/deno_hubproxy_facade --json && /tmp/deno_hubproxy_facade`
  （metrics: `compile_tokens=1316`、`instruction_count=545`），以及安装后 HubProxy
  `/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json`（metrics:
  `compile_tokens=27525`、`instruction_count=13165`），均通过。
- 2026-05-28 `initialize` 运行时信息 Deno parity 修复：对照 Deno `handleRpc`，
  `initialize` 应返回 `userAgent: hubproxy/${Deno.version.deno}`、`codexHome: Deno.cwd()`、
  `platformFamily` 和 `platformOs`；SA 之前仍返回旧 MCP 风格 `protocolVersion/capabilities/serverInfo`
  静态对象，客户端拿不到运行时平台信息。已在 `sa/main.sa` 新增 `send_rpc_initialize`，复用刚补齐的
  SA std `sa_deno_version_deno`、`sa_deno_cwd`、`sa_deno_build_platform_family`、
  `sa_deno_build_os`，用 `rpc_builder_append_json_string` 正确转义 cwd，并释放所有 runtime buffer。
  `handle_rpc_request` 的 `L_RPC_INIT` 改为调用该动态 builder。新增
  `sa/tests/test_initialize_runtime_info.sh`，真实启动 SA 28080，验证返回
  `"userAgent":"hubproxy/sa-std"`、`codexHome`、`"platformFamily":"unix"`、
  `"platformOs":"linux"`，并确认不再包含旧 `"protocolVersion"` shape。按“不全量测试”只运行
  `/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json`（metrics:
  `compile_tokens=27617`、`instruction_count=13208`）和
  `./tests/test_initialize_runtime_info.sh`，均通过；随后 SA 已重新启动在 28080，Deno 保持 27787。
- 2026-05-28 `hooks/list` cwd Deno parity 修复：对照 Deno `handleRpc`，`hooks/list` 返回的
  `data[0].cwd` 应为 `Deno.cwd()`；SA 之前优先读取 `PWD` 环境变量，缺失时退回 `.env` 的
  `DATA_DIR`，这会让客户端看到被环境污染或配置目录替代的 cwd。已把 `send_rpc_hooks_list`
  改为直接调用 `sa_deno_cwd()`，并用 `rpc_builder_append_json_string` 正确序列化路径；第一次
  focused 测试暴露出旧 JSON 片段已经自带引号，叠加 helper 后生成 `""/path""`，已把
  `J_HOOKS_A/B` 调整为由 helper 负责加引号。新增 `sa/tests/test_hooks_list_cwd.sh`，启动 SA 时
  故意设置 `PWD=/tmp/not-real-pwd` 且 `.env DATA_DIR=/tmp/not-deno-cwd`，验证返回 cwd 为实际启动目录
  `/home/vscode/projects/hubproxy/sa`，并确认没有泄漏 PWD/DATA_DIR。按“不全量测试”只运行
  `/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json`（metrics:
  `compile_tokens=27579`、`instruction_count=13189`）和 `./tests/test_hooks_list_cwd.sh`，均通过；
  随后 SA 已重新启动在 28080，Deno 保持 27787。
- 2026-05-28 `marketplace/add` 与 `marketplace/remove` installedRoot Deno parity 修复：
  对照 Deno `handleRpc`，两个方法返回的 `installedRoot` 都应为 `Deno.cwd()`；SA 之前在
  `J_MARKETPLACE_ADD_A` / `J_MARKETPLACE_REMOVE_B` 中硬编码 `"."`，客户端无法定位实际安装根。
  已把两个响应改为调用 `sa_deno_cwd()`，通过 `rpc_builder_append_json_string` 输出
  `installedRoot`，并释放 cwd buffer。新增 `sa/tests/test_marketplace_installed_root.sh`，启动 SA 时
  设置 `PWD=/tmp/not-marketplace-root`，验证 `marketplace/add` 和 `marketplace/remove` 均返回
  `/home/vscode/projects/hubproxy/sa`，且不再返回 `"."` 或泄漏 PWD。按“不全量测试”只运行
  `/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json`（metrics:
  `compile_tokens=27617`、`instruction_count=13207`）和
  `./tests/test_marketplace_installed_root.sh`，均通过；随后 SA 已重新启动在 28080，Deno 保持 27787。
- 2026-05-28 config 写入族 `filePath` Deno parity 修复：对照 Deno `handleRpc`，
  `config/value/write`、`config/batchWrite`、`skills/config/write` 都应返回
  `{"filePath": Deno.cwd(), "status": "ok", "version": "1"}`；SA 之前的
  `send_rpc_config_write` 仍优先读取 `PWD`，缺失时退回 `.env DATA_DIR`。已改为直接调用
  `sa_deno_cwd()`，通过 `rpc_builder_append_json_string` 输出 `filePath` 并释放 cwd buffer。
  新增 `sa/tests/test_config_write_cwd.sh`，启动 SA 时设置 `PWD=/tmp/not-config-write-pwd` 且
  `.env DATA_DIR=/tmp/not-config-write-cwd`，逐一验证三个 RPC 都返回
  `/home/vscode/projects/hubproxy/sa`，且不泄漏 PWD/DATA_DIR/旧 `"."`。按“不全量测试”只运行
  `/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json`（metrics:
  `compile_tokens=27579`、`instruction_count=13188`）和 `./tests/test_config_write_cwd.sh`，
  均通过；随后 SA 已重新启动在 28080，Deno 保持 27787。
- 2026-05-28 `externalAgentConfig/detect` cwd/path Deno parity 修复：对照 Deno `handleRpc`，
  两个返回 item 的 `cwd` 都应为 `Deno.cwd()`，`details.path` 分别为
  `${Deno.cwd()}/Agents.md` 和 `${Deno.cwd()}/.env`；SA 之前仍优先读取 `PWD`，缺失时退回
  `.env DATA_DIR`，且保留了旧 `"./Agents.md"` / `"./.env"` 静态结果常量。已把
  `send_rpc_external_detect` 改为直接调用 `sa_deno_cwd()`，用 `rpc_builder_append_json_string`
  输出 `cwd`，并用同一 cwd 组装 `details.path`，释放 cwd buffer。新增
  `sa/tests/test_external_detect_cwd.sh`，启动 SA 时设置 `PWD=/tmp/not-external-detect-pwd` 且
  `.env DATA_DIR=/tmp/not-external-detect-cwd`，验证两个 item 的 cwd 和 path 均来自
  `/home/vscode/projects/hubproxy/sa`，且不泄漏 PWD/DATA_DIR/旧点号路径。按“不全量测试”只运行
  `/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json`（metrics:
  `compile_tokens=27529`、`instruction_count=13163`）和 `./tests/test_external_detect_cwd.sh`，
  均通过；随后 SA 已重新启动在 28080，Deno 保持 27787。
- 2026-05-28 `plugin/share/updateTargets` principals Deno parity 修复：对照 Deno `handleRpc`，
  该方法应在 `params.principals` 是数组时原样返回该数组，非数组或缺失时返回 `[]`；SA 之前固定
  返回 `{"discoverability":"UNLISTED","principals":[]}`，会丢失客户端传入的共享目标。已在
  `sa/main.sa` 新增 `send_rpc_plugin_share_update_targets`，复用 SA std JSON 解析和
  `append_json_node_raw`，只在 JSON kind 为 array 时原样序列化回响应，否则走空数组回退，并释放
  root/params/principals 节点。新增 `sa/tests/test_plugin_share_update_targets.sh`，真实启动 28080，
  同时覆盖数组保留和非数组回退。按“不全量测试”只运行
  `/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json`（metrics:
  `compile_tokens=27746`、`instruction_count=13269`）和
  `./tests/test_plugin_share_update_targets.sh`，均通过；随后 SA 已重新启动在 28080，Deno 保持 27787。
- 2026-05-28 `plugin/share/save` remotePluginId Deno parity 修复：对照 Deno `handleRpc`，
  该方法应返回 `remote_${crypto.randomUUID()}`；SA 之前固定返回 `"remote_sa"`，多次分享会复用同一
  id。已把 `send_rpc_plugin_share_save` 改为调用 SA std `sa_deno_random_uuid()`，响应拼接为
  `remote_<uuid>`，并保留 `.env` 中 `SA_PORT=28080` 生成的 `shareUrl`。注意：`sa_deno_random_uuid`
  返回 fmt buffer handle，必须用 `sa_fmt_buffer_data/len/free`，不能用 `sa_fs_read_buffer_*`；
  本轮聚焦测试首次暴露了 accessor 用错时 uuid 为空的问题。新增
  `sa/tests/test_plugin_share_save_uuid.sh`，真实启动 28080，连续调用两次验证
  `remotePluginId` 符合 UUID v4 格式、不是旧 `"remote_sa"`、两次不同，且 `shareUrl` 使用
  `http://0.0.0.0:28080/share`。按“不全量测试”只运行
  `/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json`（metrics:
  `compile_tokens=27765`、`instruction_count=13278`）和
  `./tests/test_plugin_share_save_uuid.sh`，均通过；随后 SA 已重新启动在 28080，Deno 保持 27787。
- 2026-05-28 `account/chatgptAuthTokens/refresh` refreshedAt Deno parity 修复：对照 Deno
  `handleRpc`，该方法应返回 `new Date().toISOString()`；SA 之前固定返回
  `"1748300000"`，格式和时间都错误。根因是 SA std Deno facade 缺少 Date ISO helper，本轮在
  SCI `/home/vscode/projects/sci` 增加 `sa_deno_date_now_iso()` runtime export、
  `sa_std/deno.sai` 声明和 `DENO_DATE_NOW_ISO` 宏，格式为
  `YYYY-MM-DDTHH:mm:ss.SSSZ`。focused SCI 验证：
  `zig test tests/sa_std_runtime.zig --test-filter "sa_std Deno facade runtime helpers are usable from C"`
  和 `zig build std-smoke --summary none -- "sa_std Deno compatibility facade covers HubProxy porting surface"`
  均通过；随后已运行 `./tools/install.sh --dir /home/vscode/.sa --no-shell`，ReleaseFast 安装到
  `/home/vscode/.sa`。HubProxy `sa/main.sa` 新增 `send_rpc_chatgpt_tokens_refresh`，调用
  `sa_deno_date_now_iso()` 并用 JSON string helper 输出 `refreshedAt`。新增
  `sa/tests/test_chatgpt_tokens_refresh_iso.sh`，真实启动 28080，验证 `refreshedAt` 是当前时间附近的
  ISO UTC 毫秒字符串且不再是旧固定值。按“不全量测试”只运行
  `/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json`（metrics:
  `compile_tokens=27802`、`instruction_count=13295`）和
  `./tests/test_chatgpt_tokens_refresh_iso.sh`，均通过；随后 SA 已重新启动在 28080，Deno 保持 27787。
- 2026-05-28 `externalAgentConfig/import` importedAt Deno parity 修复：对照 Deno `handleRpc`，
  该方法和 `account/chatgptAuthTokens/refresh` 一样应返回 `new Date().toISOString()`；SA 之前同样固定
  返回 `"1748300000"`。已复用已安装的 SA std `sa_deno_date_now_iso()`，新增
  `send_rpc_external_import` 动态构造 `{"imported":true,"importedAt":...}`，并保持原有
  `externalAgentConfig/import/completed` 事件通知分发。新增
  `sa/tests/test_external_import_iso.sh`，真实启动 28080，验证 `importedAt` 是当前时间附近的 ISO UTC
  毫秒字符串且不再是旧固定值；事件本身仍由既有 `sa/tests/test_events_contract.sh` 覆盖，避免该聚焦测试
  重复 SSE 合同造成不稳定。按“不全量测试”只运行
  `/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json`（metrics:
  `compile_tokens=27836`、`instruction_count=13311`）和 `./tests/test_external_import_iso.sh`，
  均通过；随后 SA 已重新启动在 28080，Deno 保持 27787。
- 2026-05-28 thread 对象 `createdAt/updatedAt` Deno parity 修复：对照 Deno `HubState.newThread`
  和 `now() => Math.floor(Date.now()/1000)`，新 thread 的 `createdAt`、`updatedAt` 应为当前秒级时间；
  SA 之前在 `J_THREAD_OBJ_D` 中固定输出 `1748300000`，影响 `thread/start`、`thread/list`、
  `thread/read`、`thread/resume`、`thread/fork` 等所有 thread 序列化路径。已把
  `rpc_builder_append_thread_open` 的静态片段拆为 `J_THREAD_OBJ_D1/D2/D3`，调用
  `sa_time_unix_s()` 后分别写入 `createdAt` 和 `updatedAt`，避免继续输出旧固定值。本轮只修
  thread 对象时间；turn/goal/realtime/event 中仍有固定时间，后续继续逐项收敛。新增
  `sa/tests/test_thread_timestamp_current.sh`，真实启动 28080，调用 `thread/start` 并验证
  `createdAt/updatedAt` 是当前时间附近的整数秒、二者相等且不等于 `1748300000`。按“不全量测试”
  只运行 `/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json`（metrics:
  `compile_tokens=27854`、`instruction_count=13319`）和 `./tests/test_thread_timestamp_current.sh`，
  均通过；随后 SA 已重新启动在 28080，Deno 保持 27787。
- 2026-05-28 turn 对象 `createdAt/updatedAt/startedAt/completedAt` Deno parity 修复：对照
  Deno `HubState.newTurn`，in-progress turn 应使用当前秒级 `createdAt/updatedAt/startedAt`，
  `completedAt:null`、`durationMs:null`；completed/interrupted turn 应有当前秒级 `completedAt`。
  SA 之前在 `J_TURN_OBJ_OPEN_TAIL` 和 `J_TURN_OBJ_DONE_TAIL` 中固定输出 `1748300000`，且本轮拆分
  turn tail 后聚焦测试暴露 `turn/start` 外层 `{"turn": ...}` 少闭合 `}`，已经一并修复。实现上新增
  `rpc_builder_append_turn_open_tail` 和 `rpc_builder_append_turn_done_tail`，在
  `rpc_builder_append_turn_status` 中调用 `sa_time_unix_s()` 并写入对应字段。新增
  `sa/tests/test_turn_timestamp_current.sh`，真实启动 28080，创建 thread 后调用 `turn/start`，验证
  in-progress turn 的 `createdAt/updatedAt/startedAt` 是当前时间附近的整数秒且不等于
  `1748300000`，同时 `completedAt` 和 `durationMs` 为 null。按“不全量测试”只运行
  `/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json`（metrics:
  `compile_tokens=27930`、`instruction_count=13354`）和 `./tests/test_turn_timestamp_current.sh`，
  均通过；随后 SA 已重新启动在 28080，Deno 保持 27787。
- 2026-05-28 goal 对象 `createdAt/updatedAt` Deno parity 修复：对照 Deno `HubState.setGoal`，
  `thread/goal/set|get` 返回的 goal 时间戳应为当前秒级时间；SA 之前在 `J_GOAL_OBJ_D` 中固定输出
  `1748300000`。已把 goal 尾部拆为 `J_GOAL_OBJ_D1/D2/D3`，新增
  `rpc_builder_append_goal_tail` 调用 `sa_time_unix_s()` 写入 `createdAt/updatedAt`。新增
  `sa/tests/test_goal_timestamp_current.sh`，真实启动 28080，调用 `thread/goal/set` 和
  `thread/goal/get`，验证时间戳是当前时间附近的整数秒、不等于旧固定值，并覆盖本轮暴露的
  `send_rpc_goal_obj` 外层 `{"goal": ...}` 少闭合 `}` 的 JSON 有效性问题。按“不全量测试”只运行
  `/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json`（metrics:
  `compile_tokens=27961`、`instruction_count=13368`）和 `./tests/test_goal_timestamp_current.sh`，
  均通过。
- 2026-05-28 item 事件 `startedAtMs/completedAtMs` Deno parity 修复：对照 Deno `HubState.addTurnInput`
  与 `injectItems`，`item/started`、`item/completed` 应使用 `Date.now()` 毫秒时间；SA 之前固定输出
  `1748300000`，且单位也不是毫秒。已新增 `notify_timed_item`，调用 `sa_time_unix_ms()` 动态写入
  `startedAtMs` 或 `completedAtMs`，保留 `rawResponseItem/completed` 的原始 item 结构。新增
  `sa/tests/test_item_event_timestamp_current.sh`，真实启动 28080，打开 `/events` 后用带 input item 的
  `turn/start` 触发事件，验证两个事件时间戳为当前毫秒整数、不等于旧固定值且 item payload 保持一致。
  按“不全量测试”只运行 `/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json`（metrics:
  `compile_tokens=28021`、`instruction_count=13397`）和
  `./tests/test_item_event_timestamp_current.sh`，均通过。
- 2026-05-28 `thread/realtime/start` 返回 turn 时间戳 Deno parity 修复：对照 Deno `handleRpc`，
  realtime start 的返回 `turn.createdAt/updatedAt/startedAt/completedAt` 应为当前秒级时间；SA 之前用
  `J_REALTIME_START_RESULT` 固定输出 `1748300000`。已拆成 `J_REALTIME_START_A/B/C/D/E` 并新增
  `send_rpc_realtime_start` 动态写入四个秒级时间。新增
  `sa/tests/test_realtime_start_timestamp_current.sh`，真实启动 28080 调用 `thread/realtime/start`，验证
  四个时间字段均为当前秒级整数、不等于旧固定值，并保持 completed/durationMs 合同。按“不全量测试”
  只运行 `/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json`（metrics:
  `compile_tokens=28064`、`instruction_count=13416`）和
  `./tests/test_realtime_start_timestamp_current.sh`，均通过。`rg "1748300000" sa/main.sa` 已无命中。
- 2026-05-28 SA std Deno facade 迁移效率补强：按 hubproxy Deno 源码中实际出现的 API 名称重新对照
  `/home/vscode/projects/sci/sa_std/deno.sa`，确认 JSON、UUID、Date ISO、Date.now 毫秒、FS、
  Command、HTTP server/client 的底层能力已存在；本轮没有改 runtime，只补“Deno/DOM 习惯命名”的别名宏，
  降低后续从 Deno 代码迁移到 SA 的摩擦。SCI 新增宏：
  `DENO_TEXT_ENCODER_ENCODE`、`DENO_TEXT_DECODER_DECODE`、`DENO_NEW_DATE_TO_ISO_STRING`、
  `DENO_DATE_NOW`、`DENO_COMMAND_OUTPUT`、`DENO_COMMAND_OUTPUT_CWD`、`DENO_REQUEST_NEW`、
  `DENO_REQUEST_HEADERS_APPEND`、`DENO_RESPONSE_HEADERS_GET`，均转发到既有 SA std/runtime 能力。
  回归只运行 focused `zig build std-smoke --summary none --
  "sa_std Deno compatibility facade covers HubProxy porting surface"`，已通过；随后运行
  `/home/vscode/projects/sci/tools/install.sh --dir /home/vscode/.sa --no-shell`，ReleaseFast 重新安装到
  `/home/vscode/.sa`，并确认安装态 `/home/vscode/.sa/std/deno.sa` 含本轮新增宏。运行态保持：
  SA hubproxy 监听 28080，Deno 监听 27787。
- 2026-05-28 realtime UUID Deno parity 修复：对照 Deno `thread/realtime/start` 和
  `HubState.emitRealtimeStarted`，RPC 返回的 `turn.id` 与 SSE `thread/realtime/started.params.realtimeSessionId`
  都应来自 `crypto.randomUUID()`；SA 之前固定为 `"sa-realtime"`，会导致多次 realtime session 复用同一
  id。已将 `J_REALTIME_START_A` 拆分并在 `send_rpc_realtime_start` 中调用
  `sa_deno_random_uuid()` 写入动态 turn id；新增 `notify_realtime_started`，为 SSE session id 单独生成
  UUID。新增 `sa/tests/test_realtime_uuid.sh`，真实启动 28080，连续调用两次 `thread/realtime/start` 并监听
  `/events`，验证两个 turn id 和两个 realtimeSessionId 都是 UUID v4、不是旧固定值且不重复。按“不全量测试”
  只运行 `/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json`（metrics:
  `compile_tokens=28135`、`instruction_count=13450`）和 `./tests/test_realtime_uuid.sh`，均通过；随后
  SA 已重新启动在 28080，Deno 保持 27787。
- 2026-05-28 `attestation/generate` token Deno parity 修复：对照 Deno `handleRpc`，该方法应返回
  `attest_${crypto.randomUUID()}`；SA 之前固定返回 `"attest_sa"`，多次调用会复用同一 token。已将
  `J_ATTEST_RESULT` 拆为 `J_ATTEST_A/B`，新增 `send_rpc_attestation_generate`，调用
  `sa_deno_random_uuid()` 并拼接 `attest_` 前缀。新增 `sa/tests/test_attestation_uuid.sh`，真实启动
  28080，连续调用两次 `attestation/generate`，验证 token 符合 `attest_<uuid-v4>`、不是旧固定值且不重复。
  按“不全量测试”只运行 `/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json`（metrics:
  `compile_tokens=28169`、`instruction_count=13466`）和 `./tests/test_attestation_uuid.sh`，均通过；随后
  SA 已重新启动在 28080，Deno 保持 27787。
- 2026-05-28 `mcpServer/tool/call` progress SSE 参数透传修复：对照 Deno `handleRpc`，调用
  `mcpServer/tool/call` 时会推送 `item/mcpToolCall/progress`，params 应回显
  `threadId/turnId/itemId/message`；SA 之前复用 `J_EVT_TOOL_PROGRESS_B`，固定输出
  `turnId:""`、`itemId:"sa-item"`、`message:"called"`，导致 UI 无法关联真实 item。已新增
  `J_EVT_TOOL_TURN_B/J_EVT_TOOL_ITEM_B/J_EVT_TOOL_MSG_B` 和 `notify_mcp_tool_progress`，从请求中提取
  `threadId/turnId/itemId/message`，缺省 `itemId` 时生成 UUID，缺省 message 时仍按 Deno 返回
  `"called"`。新增 `sa/tests/test_mcp_tool_progress_event.sh`，真实启动 28080 并连接 `/events`，调用
  `mcpServer/tool/call` 后同时验证 RPC result 和 SSE progress event 都回显请求参数且不再出现
  `sa-item/called` 占位。按“不全量测试”只运行
  `/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json`（metrics:
  `compile_tokens=28231`、`instruction_count=13495`）和 `./tests/test_mcp_tool_progress_event.sh`，
  均通过；随后 SA 已重新启动在 28080，Deno 保持 27787。
- 2026-05-28 `item/tool/requestUserInput` SSE 结构修复：对照 Deno `HubState.emitUserInputRequest`，
  该事件 params 应包含 `threadId/turnId/itemId/questions[]`，其中 question 为默认 input 表单；SA 之前复用
  `J_EVT_TOOL_PROGRESS_B`，错误输出 `message:"called"` 且缺少 questions。已新增
  `J_EVT_USER_INPUT_Q` 和 `notify_user_input_request`，从请求透传 `threadId/turnId/itemId`，缺省 itemId 时
  使用 `sa_deno_random_uuid()`，并输出 Deno 同形的默认 questions 数组。新增
  `sa/tests/test_user_input_event_shape.sh`，真实启动 28080 并连接 `/events`，调用
  `item/tool/requestUserInput` 后验证 RPC result 仍返回默认 answer，SSE event 回显 ids、包含 questions，
  且不再出现 tool progress 的 message payload。按“不全量测试”只运行
  `/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json`（metrics:
  `compile_tokens=28287`、`instruction_count=13522`）和 `./tests/test_user_input_event_shape.sh`，
  均通过；随后 SA 已重新启动在 28080，Deno 保持 27787。
- 2026-05-28 `mcpServer/elicitation/request` SSE 结构修复：对照 Deno
  `HubState.emitMcpElicitationRequest`，该事件 params 应包含 `threadId/turnId/serverName/request`，
  其中 `request.type="form"`、`request.id` 为 UUID、`requestedSchema` 为 draft 2020-12 空 object schema、
  `instructions="Provide a value to continue."`；SA 之前同样复用 `J_EVT_TOOL_PROGRESS_B`，错误输出
  tool progress 形状。已新增 `J_EVT_ELICIT_SERVER_B/J_EVT_ELICIT_REQ_A/J_EVT_ELICIT_REQ_B` 和
  `notify_mcp_elicitation_request`，从请求透传 `threadId/turnId/serverName`，并为 request id 生成 UUID。
  新增 `sa/tests/test_mcp_elicitation_event_shape.sh`，真实启动 28080 并连接 `/events`，调用
  `mcpServer/elicitation/request` 后验证 RPC result 仍为 accept，SSE event 结构与 Deno 对齐且不再出现
  tool progress 的 `message/itemId` payload。按“不全量测试”只运行
  `/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json`（metrics:
  `compile_tokens=28349`、`instruction_count=13551`）和
  `./tests/test_mcp_elicitation_event_shape.sh`，均通过；随后 SA 已重新启动在 28080，Deno 保持 27787。
- 2026-05-28 `item/tool/call` 错误 SSE 副作用修复：对照 Deno `handleRpc`，`item/tool/call` 只返回
  `{contentItems:[...], success:true}`，不会推送 `item/mcpToolCall/progress`；该 progress 事件只属于
  `mcpServer/tool/call`。SA 之前在 `L_RPC_ITEM_TOOL_CALL` 里也调用
  `notify_thread_string_suffix(... EV_MCP_TOOL_PROGRESS ...)`，导致普通 tool call 产生错误 MCP progress
  事件。已移除该通知，保留 `send_rpc_item_tool_call` 的 message 回显响应。新增
  `sa/tests/test_item_tool_call_no_progress_event.sh`，真实启动 28080 并连接 `/events`，调用
  `item/tool/call` 后验证 RPC result 正常且 SSE 中没有 `event: item/mcpToolCall/progress`。按“不全量测试”
  只运行 `/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json`（metrics:
  `compile_tokens=28347`、`instruction_count=13550`）和
  `./tests/test_item_tool_call_no_progress_event.sh`，均通过；随后 SA 已重新启动在 28080，Deno 保持 27787。
- 2026-05-28 SA std Deno facade 第二轮补强：暂停业务转换后，按 HubProxy Deno 源码实际 API 面重新核对
  `Deno.*`、`JSON.*`、`Date`、`TextEncoder/TextDecoder`、`fetch`、`Request/Response/Headers` 使用点。
  本轮优先补“现有底层能力已经支持、但 Deno 名称不完整”的宏别名，避免后续迁移继续卡在门面名称上。
  SCI `sa_std/deno.sa` 新增：
  `DENO_NEW_TEXT_ENCODER_ENCODE`、`DENO_NEW_TEXT_DECODER_DECODE`、`DENO_DATE_TO_ISO_STRING`、
  `DENO_JSON_PARSE_TEXT`、`DENO_JSON_STRINGIFY_NODE`、`DENO_REQUEST_SET_BODY`、`DENO_REQUEST_SEND`、
  `DENO_HEADERS_HAS`、`DENO_REQUEST_FREE`；其中 `DENO_HEADERS_HAS` 按 Deno 语义只看 header 是否存在，
  不用 value 长度判断，避免空字符串 header 被误判为不存在。新增/更新 `tests/std_smoke_core.zig` 中
  `"sa_std Deno compatibility facade covers HubProxy porting surface"` 的断言；按用户要求只运行 focused
  `zig build std-smoke --summary none -- "sa_std Deno compatibility facade covers HubProxy porting surface"`，
  已通过。随后运行 `/home/vscode/projects/sci/tools/install.sh --dir /home/vscode/.sa --no-shell`，
  ReleaseFast 重新安装，并确认 `/home/vscode/.sa/std/deno.sa` 已包含本轮新增宏。
- 2026-05-28 仍需 SA std/编译器根因评估的 Deno 高层缺口：当前 facade 仍不是完整 Deno/DOM 对象模型。
  `new Headers(headers)` 的可迭代 header map、`Headers.set/delete/entries`、`new Response(body,{status,headers})`
  的完整对象构造、`response.text()/json()/body`、`Request` clone/body 读取、`fetch(url, init)` 的一体化
  Promise/async API、`Deno.serve(handler)` 的 callback 风格调度、`Deno.Command(...).output()` 的对象式
  builder API 目前仍需要业务层手写为 SA 的显式 handle/macro 调用，或继续在 SA std 增加更高层封装。
  后续规则：遇到这些缺口时先查 `/home/vscode/projects/sci/demos/` 和现有 `sa_std`；若没有可复用 demo/宏，
  优先在 SCI 标准库补根因并加定向测试，再回到 HubProxy 业务迁移。
- 2026-05-28 HTTP response body Deno facade 根因修复：对照 HubProxy Deno `proxy.ts`/`handlers.ts`，
  上游转发层大量依赖 `await response.text()` 和 `await response.json()`；SA 之前只有
  `DENO_HTTP_RESPONSE_BODY_READER/READ_CHUNK`，会迫使业务层反复手写 reader 循环。检查
  `/home/vscode/projects/sa_plugins/sa_plugin_http_client/src/http_saasm_api.zig` 后确认插件内部已经完整保存
  `HttpResponse.body`，因此在插件 ABI 新增 `sa_http_client_resp_body_slice(resp,&ptr,&len)`，直接暴露
  响应体 slice；SCI `sa_std/deno.sai` 增加 extern，`sa_std/deno.sa` 增加
  `DENO_HTTP_RESPONSE_BODY_SLICE`、`DENO_RESPONSE_TEXT`、`DENO_RESPONSE_JSON_PARSE`。新增/更新测试：
  `/home/vscode/projects/sa_plugins/sa_plugin_http_client/tests/plugin_test.zig` 覆盖 body slice 返回 `{}`；
  `tests/std_smoke_core.zig` 增加 facade 断言和
  `"sa_std Deno response text facade links through installed HTTP plugin"`，真实执行 `sa build-exe`
  验证新 extern 可由已安装 HTTP client 插件自动链接。按“不全量测试”只运行
  `zig build test --summary none`（http-client 插件本地测试）、`zig build std-smoke --summary none --
  "sa_std Deno compatibility facade covers HubProxy porting surface"`、以及新增链接测试，均通过。
  注意：第一次链接测试暴露安装的是旧 `zig-out/lib/libhttp-client.so`，缺
  `sa_http_client_resp_body_slice`；随后运行插件 `zig build --summary none` 刷新动态库、用 `nm -D`
  确认安装态同时导出 `sa_http_client_resp_body_slice` 和 `sa_http_client_resp_get_header`，再重跑链接测试通过。
  已运行 `/home/vscode/projects/sci/tools/install.sh --dir /home/vscode/.sa --no-shell` 更新 SA std，且
  `SA_PLUGINS_WORKSPACE=/home/vscode/projects/sa_plugins .../plugin-manager.sh install http-client` 更新插件到
  version `cd575c7c4147f6e5`。
- 2026-05-28 HubProxy SA 非 SSE 上游响应截断修复：业务层原先在 `/v1/chat/completions`、
  `/v1/responses`、`/v1/models` 的非流式代理路径使用 `sa_http_client_resp_body_reader` 后只调用一次
  `sa_http_client_resp_read_chunk(..., SSE_BUF_SIZE, ...)`，这与 Deno 的 `response.text()`/完整 body 转发语义
  不一致，超过单个 chunk 的 JSON 会被截断。根因已通过 HTTP plugin/SA std 的
  `sa_http_client_resp_body_slice` 修复，本轮将上述非 SSE 路径统一改为直接发送完整 body slice；SSE 路径仍保留
  reader 循环。新增 `sa/tests/test_large_non_sse_body.sh`，启动 mock upstream 返回超过 12KB 且含
  `SA_LARGE_BODY_END` marker 的 JSON，分别验证 chat completions、responses 和 models 三条路径响应长度与 marker。
  按“不全量测试”只运行 `/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json`（metrics:
  `compile_tokens=28310`、`instruction_count=13531`）和 `./tests/test_large_non_sse_body.sh`，均通过。
- 2026-05-28 HubProxy SA 上游认证头隔离回归：对照 Deno `proxyOpenAI does not forward client x-api-key to upstream`
  和 `strips arbitrary client auth headers before upstream`，SA 代理路径应只向上游发送 `.env` 中的
  `OPENAI_API_KEY`，不能透传客户端提交的 `x-api-key`、`api-key` 或本地 `authorization` token。本轮新增
  `sa/tests/test_upstream_auth_headers.sh`，临时改写 `.env` 指向 mock upstream，分别请求
  `/v1/chat/completions`、`/v1/responses`、`/v1/models`，由 upstream 捕获实际收到的 header 并断言：
  `authorization == "Bearer upstream-secret-token"`、`x-api-key == "upstream-secret-token"`、`api-key == null`。
  按“不全量测试”只运行新增脚本，结果 `upstream_auth_headers_ok`。当前实现已满足该安全语义，未发现需要改
  SA 编译器/std/plugin 的根因问题。
- 2026-05-28 Responses MCP server 名称归一化缺口修复：对照 Deno
  `proxyOpenAI preserves already-normalized MCP server names`，native `/v1/responses` 上游请求中的
  `input[].arguments.server` 应把当前插件已知别名如 `Code Index`、`code-index`、`code_index` 规范化为
  `mcp__code_index__`。SA 之前只重写 tools/Gemini 不兼容字段，`arguments` 字符串原样透传，新增
  `sa/tests/test_responses_mcp_server_normalize.sh` 先复现失败：mock upstream 捕获到 `["Code Index","code-index"]`。
  本轮在 `main.sa` 增加受限字节级替换 `normalize_responses_mcp_server_aliases`，接在
  `build_responses_proxy_body` 之后，覆盖上述 Code Index 别名；随后运行 `/home/vscode/.sa/bin/sa build main.sa -o
  hubproxy --json`（metrics: `compile_tokens=28518`、`instruction_count=13632`）、
  `./tests/test_responses_mcp_server_normalize.sh` 和相关旧回归 `./tests/test_responses_tools_capture.sh`，均通过。
  仍需后续根因改善：SA std/业务层缺少 Deno `robustNormalizeServerName` 这种通用字符串规范化/JSON 深层改写封装，
  当前只覆盖 HubProxy 已启用 Code Index 插件的确定性别名，后续新增 MCP server 时应优先抽成通用 SA std/业务 helper。
- 2026-05-28 Gemini tool-history fallback parity 修复：对照 Deno
  `proxyOpenAI does not chat-fallback Gemini tool history`，Gemini Responses 请求只要包含
  `function_call` / `function_call_output` / custom / web_search / MCP tool history，就不能在 native
  `/v1/responses` 上游返回 404/405/410/415/500 时继续转换为 Chat Completions fallback，否则历史格式会被错误降级。
  本轮在 `sa/main.sa` 新增 `body_has_responses_tool_history` 和
  `body_is_unsafe_gemini_chat_fallback`，并在 `L_RESP_CHAT_FB_BUILD` 进入 fallback 前拦截；由于 SA affine
  分支合流要求所有权状态完全一致，unsafe 分支拆成独立 original-response return tail，避免和
  `L_RESP_CHAT_FB_ORIGINAL` 的 `r_fb_len/r_fb_body` 状态合流。构建验证：
  `/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json` 通过（metrics:
  `compile_tokens=28886`、`instruction_count=13811`）。
- 2026-05-28 Gemini tool-history 回归：新增
  `sa/tests/test_responses_gemini_tool_history_no_fallback.sh`，mock `/v1/responses` 返回 404，mock
  `/v1/chat/completions` 记录是否被调用，请求体包含 `models/gemini-3-flash-preview` 与
  `function_call_output`，断言 SA 返回原始 404/body 且 chat fallback 未触发。按“不全量测试”只运行该新增测试和
  相邻旧回归 `./tests/test_responses_gemini_capture.sh`，结果分别为
  `responses_gemini_tool_history_no_fallback_ok`、`responses_gemini_capture_ok`。
- 2026-05-28 当前运行态验证：按根 `.env` 中 `SA_PORT=28080` 重启 SA 版，当前 `hubproxy` 监听
  `0.0.0.0:28080`，Deno 继续监听 `0.0.0.0:27787`。用 OpenAI chat completions 形状请求
  `POST http://127.0.0.1:28080/v1/chat/completions`，带 `.env AUTH`，body 为
  `{"model":"mimo-v2.5","messages":[{"role":"user","content":"Say SA_OK in one short sentence."}],"stream":false}`，
  实测返回 HTTP 200，响应内容包含 `SA_OK is confirmed.`，证明当前 SA 进程读取 `.env` 并能走通 chat upstream。
- 2026-05-28 Responses 客户端 MCP 名称反规范化修复：对照 Deno
  `proxyOpenAI de-normalizes server names and normalizes dot-notation tool calls for the client`，
  native `/v1/responses` SSE 返回给客户端前，应把 `arguments.server:"mcp__code_index__"` 反规范化为
  `"code-index"`，并把 `name:"mcp__code_index__.read_mcp_resource"` 展开成
  `namespace:"mcp__code_index__"`、`name:"read_mcp_resource"`、`output_kind:"function_call_output"`。
  SA 之前对 Responses SSE 只做 chunk 透传，客户端看不到 Deno 的 normalizeResponsesEvent 语义。本轮新增
  `normalize_responses_client_sse_body`，在 Responses SSE 响应路径中先通过
  `sa_http_client_resp_body_slice` 读取完整 body，再做受限字节级替换并一次性写回 stream response。构建验证：
  `/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json` 通过（metrics:
  `compile_tokens=28925`、`instruction_count=13829`）。
- 2026-05-28 Responses 客户端 MCP 反规范化回归：新增
  `sa/tests/test_responses_client_mcp_denormalize.sh`，mock upstream 返回与 Deno 单测同形的 SSE
  `response.output_item.done`，断言客户端收到的 `arguments.server` 是 `code-index`，并包含
  `namespace:"mcp__code_index__`、`name:"read_mcp_resource"`、`output_kind:"function_call_output"`。
  按“不全量测试”只运行该新增测试，结果 `responses_client_mcp_denormalize_ok`。随后已恢复正式 SA 进程到
  `.env SA_PORT=28080`，Deno 仍保持 `27787`。仍需后续根因改善：当前 helper 只覆盖 Code Index 和
  `read_mcp_resource` dot-notation，SA std/业务层还缺 Deno `robustDenormalizeServerName` 与
  `normalizeResponsesEvent` 的通用 JSON/SSE transformation facade；新增 MCP namespace 或更多 tool name 时应优先补
  通用 helper，而不是继续堆专用替换。
- 2026-05-29 SCI call parser 根因修复：SA HubProxy 新增 Responses -> Chat fallback tool history 时暴露
  `src/referee/call.zig` 的 `parseCall` 使用裸 substring 搜索 `"call"` / `"call_indirect"`，会把
  `call_idx = call @sa_bytes_find(...)` 这类 destination 名中的 `call` 误判为关键字，导致
  `UnknownRegister: callee is not declared`。SCI 已修复为只匹配关键字边界，并新增
  `parseCall does not treat call substring in destination as keyword` 回归；已运行
  `zig build smoke --summary none -- "parseCall does not treat call substring in destination as keyword"` 通过。
  已将该编译器修复单独提交为 SCI commit `4088313 Fix call parser keyword matching`。
- 2026-05-29 Responses fallback tool history 修复：对照 Deno
  `proxyOpenAI fills missing function output names from prior calls` 和
  `proxyOpenAI preserves tool names in chat fallback tool messages`，SA `/v1/responses` 在 native upstream
  404 等情况下转 Chat fallback 时，必须把 Responses `input` 中的 `function_call` 转成 assistant
  `tool_calls`，并把 `function_call_output` 转成 `role:"tool"` message，保留 `tool_call_id` 和 `name`。
  本轮先发现旧字节扫描方案会在 `arguments:"{\"cmd\":\"echo hi\"}"` 的转义引号处截断，因此改为使用
  SA 默认 JSON DOM API：`sa_json_parse`、`sa_json_array_get`、`sa_json_object_get_string` 和
  `append_chat_fallback_tools_from_dom` 构造 fallback chat body；调用方同步把 helper 产出的 body length
  写回 `out_len`，避免向 upstream 发送空 body。按 SA affine 规则，清理路径拆分并统一入口
  `stack_alloc` slot，避免 `PhiStateConflict`。
- 2026-05-29 回归与安装：新增
  `sa/tests/test_responses_fallback_tool_history.sh`，mock `/v1/responses` 返回 404、捕获
  `/v1/chat/completions` 请求体，断言没有顶层 `input`，assistant tool call id/name/arguments 正确，
  tool message 的 `tool_call_id`、`name`、`content` 正确，且 fallback tools 保留 `exec_command`。仅运行新增
  focused test，结果 `responses_fallback_tool_history_ok`。随后执行
  `/home/vscode/projects/sci/tools/install.sh --dir /home/vscode/.sa --no-shell`，ReleaseFast 安装新编译器到
  `/home/vscode/.sa`；再用安装态 `/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json` 构建通过
  （metrics: `compile_tokens=29827`、`instruction_count=14272`，elapsed `0:33.40`），并重跑新增测试通过。
  注意：source-built 编译器首次构建该 459KB SA 文件约 2m28s；安装态 ReleaseFast 明显更快。
- 2026-05-29 Responses chat fallback stream parity 修复：对照 Deno
  `proxyOpenAI falls back to chat stream when responses upstream returns 404`，SA 之前在 `/v1/responses`
  fallback 调用 `/v1/chat/completions` 且上游返回 `text/event-stream` 时，直接把 Chat Completions SSE
  原样透给客户端，客户端看到 `data: {"choices":...}` 和 `[DONE]`，而不是 Responses SSE。新增
  `chat_fallback_sse_to_responses_body`，当前先覆盖普通文本 delta：把 chat `content` 转为
  `response.created`、`response.output_text.delta`、`response.output_item.done`、`response.done`、
  `response.completed` 事件，且不再泄漏 raw chat `choices`。新增
  `sa/tests/test_responses_fallback_stream_events.sh` 复现并验证该路径；构建命令
  `/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json` 通过（metrics:
  `compile_tokens=30027`、`instruction_count=14368`），新增测试结果
  `responses_fallback_stream_events_ok`，相邻旧回归 `responses_fallback_capture_ok` 仍通过。
  后续仍需继续补齐 Deno 的 chat fallback stream tool-call 归一化、split tool-call chunk 合并和
  progress-only continuation 注入；这些还未由本轮 helper 完整覆盖。
- 2026-05-29 Responses chat fallback stream tool-call 修复：继续对照 Deno
  `proxyOpenAI normalizes chat fallback tool calls for Codex exec` 的基础协议面，SA 现在对 Chat Completions
  fallback SSE 中单个完整 `delta.tool_calls[0]` 生成 Responses
  `response.output_item.done` / `item.type:"function_call"` 事件，不再把 raw `choices[].delta.tool_calls`
  透给客户端。新增 `rpc_extract_json_string_after`，扫描 JSON string 时识别反斜杠转义，避免
  `arguments:"{\"cmd\":\"pwd\"}"` 在转义引号处截断；同时对 arguments 片段按已转义 JSON 字符串内容写入，避免二次转义。
  新增 focused 回归 `sa/tests/test_responses_fallback_stream_tool_call.sh`，mock chat SSE 返回
  `exec_command` / `{"cmd":"pwd"}`，断言客户端收到 `call_id:"call_cmd"`、`name:"exec_command"`、
  arguments 可解析且 `cmd=="pwd"`，并断言没有 raw chat `choices` 或 `[DONE]` 泄漏。构建命令
  `/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json` 通过（metrics:
  `compile_tokens=30391`、`instruction_count=14547`），新增测试结果
  `responses_fallback_stream_tool_call_ok`，相邻普通文本 stream 回归
  `responses_fallback_stream_events_ok` 仍通过。
  剩余缺口：Deno 的 split tool-call chunk 合并、`read` -> `exec_command cat ...` 归一化、namespaced
  tool-call 拆分/保留、progress-only continuation 注入仍需继续补齐。
- 2026-05-29 Responses chat fallback split tool-call chunk 合并修复：对照 Deno
  `proxyOpenAI merges split chat tool-call chunks before normalizing`，Chat Completions SSE 可能把
  `delta.tool_calls[0].function.arguments` 分多帧返回，例如先给 `id/name` 和空 arguments，再分片返回
  `"{\"cmd\":"` 与 `"\"pwd\"}"`。SA 之前只取第一个 `arguments` 字段，导致输出
  `arguments:""`。本轮新增 `json_string_escaped_len` 与
  `append_all_chat_tool_argument_fragments`，在保持 JSON string 转义内容不二次转义的前提下，扫描整段 Chat SSE body
  中所有 `"arguments":"..."` 片段并顺序拼接，再写入 Responses
  `response.output_item.done.item.arguments`。实现时遇到 SA affine/referee 的 `PhiStateConflict`：
  循环自然结束路径携带 `cursor/done` 进入公共尾块，而 not-found/bad-fragment 路径已消费 `cursor`；已拆出
  `L_ARG_FRAG_DONE_FROM_LOOP` 独立消费后再合流，根因是 SA 分支合流要求寄存器 ownership 状态完全一致。
  构建验证 `/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json` 通过（metrics:
  `compile_tokens=30673`、`instruction_count=14687`，elapsed `1:23.32`）。新增 focused 回归
  `sa/tests/test_responses_fallback_stream_tool_call_split.sh` 通过，且相邻回归
  `sa/tests/test_responses_fallback_stream_tool_call.sh`、`sa/tests/test_responses_fallback_stream_events.sh` 均通过。
  剩余缺口：`read` -> `exec_command cat ...` 归一化、namespaced tool-call 拆分/保留、progress-only continuation
  注入仍未补齐；若继续推进，应优先查 Deno 测试与 SCI demos/std 里是否已有通用 JSON/SSE transform 封装，缺失则补
  SA std/宏层能力，避免继续堆局部字节替换。
- 2026-05-29 Responses chat fallback stream tool-call 归一化补齐：继续对照 Deno
  `proxyOpenAI normalizes chat fallback tool calls for Codex exec`，SA 之前的 stream fallback helper 只取整段
  Chat SSE 中第一个 `id/name`，再拼接全 body 所有 `arguments`，这会在同一 chunk 返回多个 tool call 时把后续工具参数
  错拼到第一个工具上，也没有实现 `read` -> `exec_command` 和 `command` -> `cmd` 归一化。本轮改为按每个非 null
  `"id":"..."` 切分 tool-call segment：每个 segment 自己提取 call id/name、合并该 segment 内 split
  `arguments` 片段，并输出独立 Responses `response.output_item.done`。新增
  `append_chat_tool_item_events_from_body`、`append_chat_tool_item_event`、
  `append_chat_tool_normalized_arguments` 和 `extract_escaped_json_string_after`；其中 `read({"filePath":...})`
  输出为 `exec_command({"cmd":"cat '...'"})`，`exec_command({"command":...})` 输出为
  `exec_command({"cmd":...})`。构建验证 `/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json` 通过
  （metrics: `compile_tokens=31345`、`instruction_count=15017`，elapsed `1:18.92`）。新增 focused 回归
  `sa/tests/test_responses_fallback_stream_tool_call_normalize.sh` 通过，并重跑相邻回归
  `test_responses_fallback_stream_tool_call_split.sh`、`test_responses_fallback_stream_tool_call.sh`、
  `test_responses_fallback_stream_events.sh` 均通过。实现过程中又遇到 SA affine 合流问题：解析 read/exec 失败路径带有
  局部 slot 或 `is_exec` 状态，不能跳入无这些寄存器的公共 raw 尾块；已改为失败路径就地 append raw 后 return。
  剩余缺口：namespaced chat fallback tool-call 通用拆分/保留、progress-only continuation 注入仍未补齐；当前 read 路径还未
  覆盖 Deno `.env` 敏感文件 redaction 分支，后续应优先通过 SA std/宏补通用 JSON/SSE transform 与 shell quote/redaction
  helper，而不是继续在业务层写字节扫描。
- 2026-05-29 Responses chat fallback stream namespaced tool-call 修复：对照 Deno
  `proxyOpenAI preserves namespaced chat fallback tool calls`，Chat fallback SSE 中
  `name:"mcp__code_index__describe_index"` 返回给 Responses 客户端时应拆成
  `name:"describe_index"`、`namespace:"mcp__code_index__"`、`output_kind:"function_call_output"`，不能泄漏扁平化
  raw name。SA 之前只对 native Responses SSE 的 Code Index dot-notation 做 client normalization，chat fallback stream
  路径仍直接输出完整 name。本轮在 `append_chat_tool_item_event` 中增加 Code Index namespace 前缀识别：当 name 以
  `mcp__code_index__` 开头且后面还有工具名时，输出短 tool name 并追加 namespace/output_kind 字段；普通 function 与
  `read`/`exec_command` 归一化路径保持不变。构建验证
  `/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json` 通过（metrics:
  `compile_tokens=31415`、`instruction_count=15051`，elapsed `1:18.00`）。新增 focused 回归
  `sa/tests/test_responses_fallback_stream_tool_call_namespace.sh` 通过，并重跑相邻回归
  `test_responses_fallback_stream_tool_call_normalize.sh`、`test_responses_fallback_stream_tool_call_split.sh`、
  `test_responses_fallback_stream_tool_call.sh` 均通过。剩余缺口：progress-only continuation 注入仍未补齐；
  namespace 支持当前仍是 Code Index 定向实现，后续应结合请求 `tools[].type:"namespace"` 抽成通用 namespace registry
  与 JSON/SSE transform facade。
- 2026-05-29 Responses chat fallback stream progress-only continuation 修复：对照 Deno
  `proxyOpenAI converts progress-only chat stops into continuation tool calls` 和
  `proxyOpenAI does not force continuation for progress-only chat in ordinary mode`，SA 之前只把 Chat Completions SSE
  content 转成 Responses message/delta，遇到 `finish_reason:"stop"` 且内容只是“我会继续读取...”或
  `Let me check...` 这类进度描述时不会追加 `exec_command` continuation tool-call，Codex 客户端可能把进度文本误认为最终答案。
  本轮将 `chat_fallback_sse_to_responses_body` 改为同时接收原始 Responses 请求 body，并新增
  `body_allows_progress_continuation` 与 `chat_sse_is_progress_stop`：只有请求 body 明确包含 goal/code 信号
  （例如 `<goal_context>`、`Continue working toward the active thread goal`、或显式
  `collaborationModeKind/mode/kind: goal|code`）且声明了 `exec_command` 工具时，才对 progress-only stop 追加固定
  `exec_command` continuation，普通请求不会注入。构建验证
  `/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json` 通过（metrics:
  `compile_tokens=31902`、`instruction_count=15281`，elapsed `1:19.92`）。新增 focused 回归
  `sa/tests/test_responses_fallback_stream_progress_continuation.sh` 与
  `sa/tests/test_responses_fallback_stream_progress_no_continuation.sh` 均通过，并重跑相邻
  `test_responses_fallback_stream_events.sh`、`test_responses_fallback_stream_tool_call.sh` 通过。
  重要差异/后续根因：Deno `proxyOpenAI(...)` 单元测试可通过内存 `turnContext.collaborationModeKind` 触发 goal/code
  模式；SA HTTP 路径目前没有等价的隐式函数入参，只能从请求 body/header/state 推断。本轮先覆盖 HTTP 可见的 goal/code
  信号，后续若需要完全等价，应补 SA handler 侧 turn context 解析/状态透传，并抽成通用 mode inference/std JSON helper。
- 2026-05-29 Responses chat fallback stream `read(.env)` redaction 修复：对照 Deno
  `redactSensitiveFileCommand`，chat fallback 中模型调用 `read({"filePath":"/x/.env"})` 时不能转成
  `exec_command({"cmd":"cat '/x/.env'"})`，否则会泄漏 `OPENAI_API_KEY`、`AUTH`、`TOKEN`、`KEY`、`SECRET` 等配置。
  本轮在 SA 的 `read` -> `exec_command` 归一化路径新增 `path_is_sensitive_env` 和
  `append_read_command_argument`：识别 basename `.env` 与 `.env.*` 后输出
  `sed -E 's/(OPENAI_API_KEY|AUTH|TOKEN|KEY|SECRET)=.*/\\1=<redacted>/I' <path>`，普通文件仍保持
  `cat '<path>'`。实现时新增 focused 回归
  `sa/tests/test_responses_fallback_stream_tool_call_read_env_redact.sh`，该测试两层解析 SSE `item.arguments`，确保外层
  Responses event JSON 和内层 arguments JSON 都合法；中途曾暴露 `\1` 在双层 JSON 字符串中转义不足，已改为在 SSE
  中输出足够的反斜杠，使客户端解析后得到 shell 需要的 `\1` backreference。构建验证
  `/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json` 通过（metrics:
  `compile_tokens=32162`、`instruction_count=15409`，elapsed `1:18.63`）。新增回归
  `test_responses_fallback_stream_tool_call_read_env_redact.sh` 通过，并重跑相邻
  `test_responses_fallback_stream_tool_call_normalize.sh`、`test_responses_fallback_stream_tool_call_split.sh` 通过。
  后续仍应抽通用 shell quote/redaction helper；当前路径尚未处理文件名中单引号的 shellQuote 等完整 Deno parity。
- 2026-05-29 Responses chat fallback stream read shellQuote 修复：继续对照 Deno `shellQuote(value)` 的
  `value.replace(/'/g, "'\\''")` 行为，SA 的 `read` -> `exec_command` 之前只把路径包成
  `cat '<path>'`，当路径含单引号时会生成坏 shell 命令；同时 `.env` redaction 分支也需要对 path 做相同 shell quote。
  本轮新增 `append_shell_single_quoted_inner`，在 read 命令参数里逐字节输出路径并把 `'` 转成 shell 需要的
  `'\''`。由于该内容位于 Responses event JSON 的 `arguments` 字符串中，且 `arguments` 自身又是 JSON 对象字符串，
  反斜杠必须穿过两层 JSON 解析；测试先暴露了直接输出 `\'` 会造成非法 JSON escape，已改为输出足够转义后的
  `\\\\` 字节，使客户端两层 `JSON.parse` 后得到 shell 所需 backslash。还补了 `\u0027` 输入的定向处理，以接近
  Deno 先 `JSON.parse(arguments)` 再 shellQuote 的行为。构建验证
  `/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json` 通过（metrics:
  `compile_tokens=32302`、`instruction_count=15477`，elapsed `1:18.03`）。新增 focused 回归
  `sa/tests/test_responses_fallback_stream_tool_call_read_shell_quote.sh` 通过，并重跑
  `test_responses_fallback_stream_tool_call_read_env_redact.sh`、`test_responses_fallback_stream_tool_call_normalize.sh`
  均通过。后续根因仍是 SA 业务层缺少“JSON string unescape -> shellQuote -> JSON string escape”的通用 std/helper；
  当前仅补了 read 路径的 `'` 和 `\u0027` 主缺口。
- 2026-05-29 Native Responses SSE progress-only continuation 修复：对照 Deno
  `proxyOpenAI injects continuation before native responses completion` 和
  `proxyOpenAI does not inject native responses continuation without exec_command`，SA 之前虽然在
  `normalize_responses_client_sse_body` 里准备了 native `response.completed` 前插入 continuation 的字节替换，但错误复用了
  `chat_sse_is_progress_stop`；native Responses SSE 没有 Chat Completions 的
  `"finish_reason":"stop"`，因此 positive 路径永远不触发。新增
  `responses_sse_is_progress_message`，专门对 native Responses SSE body 判断 progress-only 文本，不再依赖
  `finish_reason`。新增 focused 回归 `sa/tests/test_responses_native_progress_continuation.sh` 与
  `sa/tests/test_responses_native_progress_no_continuation.sh`，前者验证 goal/code 可见信号 + `exec_command` 工具时会在
  `event: response.completed` 前插入 `exec_command` function_call 和 `event: response.done`，后者验证未授权工具/普通上下文不会注入。
  首次测试还暴露 native body 中协议字段 `"status":"completed"` 被裸英文 final marker `completed` 误判为最终回答，
  已将 native 判定收窄为中文完成语义与 `<proposed_plan>` 排除，避免把协议完成事件当成 assistant 文本。构建验证
  `/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json` 通过（metrics:
  `compile_tokens=32577`、`instruction_count=15613`，elapsed `1:17.38`），新增两个回归均通过。
- 2026-05-29 `.env` 启动路径稳健性修复：旧回归 `test_responses_client_mcp_denormalize.sh` 从项目根目录直接执行
  `sa/hubproxy`，而主程序只读 `../.env`，导致服务启动日志为 `[config] error: cannot read .env file`，随后 curl 28080
  connection refused。根因不是 MCP 回归本身，而是 SA 版本配置读取依赖当前工作目录。主程序现在先按 SA 子目录启动场景读取
  `../.env`，失败后回退读取项目根目录的 `.env`；端口、token、upstream 仍完全来自 `.env`，没有写死。构建验证
  `/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json` 通过（metrics:
  `compile_tokens=32606`、`instruction_count=15627`，elapsed `1:18.09`）。Focused 验证：
  `test_responses_native_progress_continuation.sh`、`test_responses_native_progress_no_continuation.sh`、
  `test_responses_client_mcp_denormalize.sh`、`test_responses_fallback_stream_progress_continuation.sh` 全部通过。
  剩余 std/helper 缺口：native/fallback SSE 仍靠业务层字节扫描与替换，后续应在 SA std/宏层补通用 SSE event parser、
  JSON string escape/unescape 和 shellQuote/redaction helper，避免继续散落业务实现。
- 2026-05-29 Native Responses SSE thinking item normalization 修复：对照 Deno
  `proxyOpenAI normalizes native thinking response stream items`，native `/v1/responses` SSE 上游可能返回
  `response.output_item.done` 且 `item.type:"thinking"`、`item.text:"..."`。Deno 会归一化为 Responses 客户端可消费的
  `item.type:"reasoning"`，并同时填充 `summary:[{type:"summary_text"}]` 与
  `content:[{type:"reasoning_text"}]`。SA 之前 native SSE path 只做 MCP server/name normalize 和 progress continuation，
  会把 raw `thinking` item 直接透传。本轮新增 `normalize_native_thinking_sse_body`，在
  `normalize_responses_client_sse_body` 前置处理该 native thinking item，抽取 `id` 与 `text` 并重写为 reasoning item；
  如果原 body 带 `event: response.completed`，保留 completion tail，否则补一个 completed 事件。新增 focused 回归
  `sa/tests/test_responses_native_thinking_stream.sh`，mock native SSE 返回 `type:"thinking"`，断言客户端收到
  `type:"reasoning"`、summary/content 文本一致、raw `type:"thinking"` 不再泄漏且 completion 事件仍存在。实现中再次遇到
  SA affine `PhiStateConflict`：无 thinking 入口路径和解析失败路径不能合流到同一个 copy block，因为 `thinking_idx`
  ownership 状态不同；已拆分 no-thinking copy 和 parse-failed copy 返回路径。构建验证
  `/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json` 通过（metrics:
  `compile_tokens=32828`、`instruction_count=15735`，elapsed `1:18.82`）。Focused 验证：
  `test_responses_native_thinking_stream.sh`、`test_responses_native_progress_continuation.sh`、
  `test_responses_native_progress_no_continuation.sh`、`test_responses_client_mcp_denormalize.sh` 全部通过。
  剩余差距：Deno 还有 chat JSON/stream reasoning_content、`<thought>` tag、native JSON thinking output items 等
  reasoning/thinking parity；当前只补 native SSE `thinking` item 这一条明确缺口。根因仍建议后续抽 SA std/宏层的
  SSE event parser 与 JSON object transform helper，而不是继续在业务层堆单点字节替换。
- 2026-05-29 Native Responses JSON thinking output normalization 修复：继续对照 Deno
  `proxyOpenAI normalizes native JSON thinking output items`，native `/v1/responses` 非流式 JSON 成功路径之前在 SA 中直接透传
  upstream body；当上游返回 `output:[{type:"thinking",text:"native json think"}, {type:"message",
  reasoning_content:"message json think", content:[{type:"output_text",text:"answer"}]}]` 时，客户端仍会看到 raw
  `thinking` 与 `reasoning_content` 字段。Deno 会把它们拆成两个 `type:"reasoning"` output item，再保留普通
  message 和 `output_text/status`。本轮新增 `normalize_responses_client_json_body`，并接入 native Responses 非 SSE 的
  JSON send path；当前定向覆盖 Deno 测试形态：抽取 `thinking.text`、message `reasoning_content` 和
  `output_text`，生成 `reasoning -> reasoning -> message` 的 output 序列，避免 raw `thinking`/
  `reasoning_content` 泄漏。新增 focused 回归
  `sa/tests/test_responses_native_thinking_json.sh`，mock native JSON 上游并断言 output 三项顺序、summary/content 文本、
  `output_text/status` 保留和 raw 字段不泄漏。实现中再次遇到 SA affine `PhiStateConflict`：多个解析失败分支不能合流到一个
  copy-return block，因为各阶段局部状态不同；已拆为每个失败阶段独立 copy-return。构建验证
  `/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json` 通过（metrics:
  `compile_tokens=33153`、`instruction_count=15889`，elapsed `1:20.56`）。Focused 验证：
  `test_responses_native_thinking_json.sh`、`test_responses_native_thinking_stream.sh`、
  `test_responses_native_progress_no_continuation.sh`、`test_responses_client_mcp_denormalize.sh` 全部通过。
  剩余差距：当前 JSON transformer 是 Deno 测试形态的业务层实现，不是完整 JSON AST transform；还需补 chat fallback
  JSON/stream `reasoning_content`、`thinking` delta、`<thought>` tag splitter，以及将这些字节级转换下沉到 SA std/宏层。
- 2026-05-29 Chat fallback JSON `reasoning_content` normalization 修复：对照 Deno
  `proxyOpenAI maps chat JSON reasoning_content into reasoning output items`，SA 的 `/v1/responses` fallback 到
  `/v1/chat/completions` 后，非 SSE chat JSON 之前直接透传 chat completion body；当 chat message 带
  `reasoning_content:"json think"` 和 `content:"answer"` 时，客户端会看到 raw `choices` 和 chat-only
  `reasoning_content`，而不是 Responses API 的 `output` 结构。本轮新增
  `normalize_chat_fallback_json_body` 并接入 `L_RESP_CHAT_FB_SEND_BACK`：仅在 chat fallback JSON 明确包含
  `reasoning_content` 时转换为 Responses JSON，生成 `output:[reasoning,message]`、`output_text` 和
  `status:"completed"`；无 `reasoning_content` 的普通 chat fallback 暂保持旧行为，避免一次性打断既有 capture
  回归。新增 focused 回归 `sa/tests/test_responses_fallback_json_reasoning_content.sh`，mock Responses 404 后 Chat JSON
  返回 reasoning/content，断言 output 两项顺序、summary/content 文本、`output_text/status`，并断言 raw
  `choices`/`reasoning_content` 不泄漏。构建验证
  `/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json` 通过（metrics:
  `compile_tokens=33352`、`instruction_count=15988`，elapsed `1:21.59`）。Focused 验证：
  `test_responses_fallback_json_reasoning_content.sh`、`test_responses_missing_base_capture.sh`、
  `test_responses_native_thinking_json.sh`、`test_responses_fallback_stream_events.sh` 全部通过。
  剩余差距：普通非流式 chat fallback 仍未完全转换为 Responses JSON（旧 capture 仍期望 chat completion），`<thought>`
  tag 和 stream `reasoning_content/thinking` delta 仍未补；后续应继续把 fallback JSON 全面迁到 Deno 的
  `responsesFallbackResponseFromChat` 语义，并优先补 SA std/宏层 JSON AST/SSE helper。
- 2026-05-29 Chat fallback JSON content-only Responses shape 修复：继续对照 Deno
  `proxyOpenAI falls back to chat JSON when stream is false`，普通非流式 `/v1/responses` fallback 到 Chat Completions 后，
  Deno 返回 Responses JSON：`output:[{type:"message",content:[{type:"output_text",text:"ok"}]}]`、
  `output_text:"ok"`、`status:"completed"`，而不是 raw `{"object":"chat.completion","choices":[...]}`。
  SA 之前为了兼容早期 capture 测试仍保留 raw chat completion；本轮将 `normalize_chat_fallback_json_body` 扩展为
  no-`reasoning_content` 时也提取 `message.content` 并生成 Responses JSON。旧
  `sa/tests/test_responses_missing_base_capture.sh` 已升级：仍验证 fallback chat 请求体正确发送，但响应断言改为 Responses
  shape，并确保 raw `chat.completion`/`choices` 不泄漏。实现时 SA 对 no-reason 分支跳转到共用 content-only block
  报 `PhiStateConflict/UnknownRegister`，根因是分支作用域和 `body` ownership 状态不一致；已拆出
  `normalize_chat_fallback_content_json_body` helper，由主 normalizer no-reason 分支调用，避免跨分支合流。构建验证
  `/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json` 通过（metrics:
  `compile_tokens=33447`、`instruction_count=16035`，elapsed `1:25.23`）。Focused 验证：
  `test_responses_missing_base_capture.sh`、`test_responses_fallback_json_reasoning_content.sh`、
  `test_responses_fallback_stream_events.sh`、`test_responses_native_thinking_json.sh` 全部通过。
  剩余差距：fallback JSON 仍缺 usage normalization、tool_calls 非流式输出、`<thought>` tag split 和 continuation
  注入等 Deno `responsesFallbackResponseFromChat` 完整语义；stream `reasoning_content/thinking` delta 仍待补。
- 2026-05-29 Chat fallback JSON usage normalization 修复：继续对照 Deno `normalizeChatUsage`，普通非流式
  `/v1/responses` fallback 到 Chat Completions 时，Deno 会把 chat usage 的 `prompt_tokens`、`completion_tokens`、
  `total_tokens` 映射为 Responses `usage.input_tokens`、`usage.output_tokens`、`usage.total_tokens`，并补
  `input_tokens_details.cached_tokens:0`、`output_tokens_details.reasoning_tokens:0`。SA 之前生成 Responses shape
  后没有 usage，导致客户端无法按 Responses API 读取 token 统计。本轮新增 `append_chat_usage_json`，复用现有
  `rpc_extract_u64_number_after` 与 `rpc_builder_append_u64`，在 chat fallback 的 reasoning/content-only 两条 JSON
  构造路径追加 usage；缺失上游 usage 时按 Deno 兼容语义输出 0。实现中踩到两个业务层手写 JSON 风险：helper
  不能插在另一个 SA 函数 label 中间，否则后续 label 会被归入新函数作用域；另外 `RESP_JSON_STATUS` 原本带顶层
  `}`，追加字段必须使用未闭合的 `RESP_JSON_STATUS_OPEN`，再由 usage 片段关闭 usage 和顶层对象。未发现新的
  SA 编译器根因缺陷，但这再次证明当前业务层字节拼 JSON 易错，应优先沉淀 SA std/宏层 Responses JSON builder。
  构建验证 `/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json` 通过（metrics:
  `compile_tokens=33502`、`instruction_count=16058`，elapsed `1:24.93`）。Focused 验证：
  `test_responses_missing_base_capture.sh`、`test_responses_fallback_json_reasoning_content.sh`、
  `test_responses_fallback_stream_events.sh`、`test_responses_native_thinking_json.sh` 全部通过。剩余差距：
  fallback JSON 仍缺 tool_calls 非流式输出、`<thought>` tag split、非流式 continuation 注入；fallback stream
  仍缺 `reasoning_content`/`thinking` delta 与 `<thought>` splitter。
- 2026-05-29 Chat fallback JSON `<thought>` tag split 修复：对照 Deno
  `proxyOpenAI maps thought tags into reasoning output items`，当非流式 chat fallback 返回
  `message.content:"<thought>internal thought</thought>Hello there"` 时，Deno 会把 thought 段拆成 Responses
  `reasoning` item，并把可见文本作为 `message`/`output_text`。SA 之前 content-only fallback 会把整段
  `<thought>...</thought>` 当作可见输出泄漏。本轮在 `normalize_chat_fallback_content_json_body` 中增加第一段
  thought tag 检测：仅当 content 以 `<thought>` 开头且存在 `</thought>` 时拆分；缺失闭合 tag 时回落到普通
  content-only builder。usage 继续复用 `append_chat_usage_json`，保持 `prompt_tokens/completion_tokens/total_tokens`
  到 Responses usage 的映射。实现没有暴露新的 SA 编译器缺陷；仍属于业务层 byte-scan JSON/text transform，
  后续应沉淀为 SA std/宏层的 `extractThoughtSegments` 等价 helper。构建验证
  `/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json` 通过（metrics:
  `compile_tokens=33652`、`instruction_count=16132`，elapsed `1:18.56`）。Focused 验证：
  `test_responses_fallback_json_thought_tag.sh`、`test_responses_missing_base_capture.sh`、
  `test_responses_fallback_json_reasoning_content.sh`、`test_responses_fallback_stream_tool_call.sh` 全部通过。
  剩余差距：fallback JSON 仍缺 tool_calls 非流式输出和非流式 continuation 注入；fallback stream 仍缺
  `reasoning_content`/`thinking` delta 与 `<thought>` splitter。
- 2026-05-29 Chat fallback JSON 单个 `tool_calls` 输出修复：对照 Deno
  `responsesFallbackResponseFromChat` 非流式路径，chat JSON `choices[0].message.tool_calls[]` 应转换为
  Responses `output` 内的 `type:"function_call"` item，而不是泄漏 raw `tool_calls`。本轮新增
  `append_first_chat_tool_item_json`，在 reasoning/content-only/thought-tag 三条 fallback JSON builder 的 message
  item 后追加第一个 tool call；复用 stream fallback 已有的 `append_chat_tool_normalized_arguments`，因此
  `exec_command` 的 `{"command":...}` 与 `read` 的 `{"filePath":...}` 归一化逻辑保持一致。新增
  `sa/tests/test_responses_fallback_json_tool_call.sh`，mock chat JSON 返回 `content:"ok"` 和
  `tool_calls:[{id:"call_cmd",function:{name:"exec_command",arguments:"{\"cmd\":\"pwd\"}"}}]`，断言 Responses
  `output:[message,function_call]`、`call_id/name/arguments`、usage 和 tail 正确，且 raw `choices/tool_calls`
  不泄漏。构建验证 `/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json` 通过（metrics:
  `compile_tokens=33916`、`instruction_count=16261`，elapsed `1:19.91`）。Focused 验证：
  `test_responses_fallback_json_tool_call.sh`、`test_responses_fallback_json_thought_tag.sh`、
  `test_responses_missing_base_capture.sh`、`test_responses_fallback_json_reasoning_content.sh`、
  `test_responses_fallback_stream_tool_call_normalize.sh` 全部通过。当前实现刻意只处理第一个 tool call 且要求
  chat message 有 content/reasoning/thought 分支；剩余差距：tool-only 非流式 chat JSON、多个 tool_calls、
  非流式 continuation 注入，以及 fallback stream 的 `reasoning_content`/`thinking` delta 和 `<thought>` splitter。
- 2026-05-29 Chat fallback JSON tool-only 修复：继续对照 Deno `responsesFallbackResponseFromChat`，chat JSON
  `choices[0].message.content:null` 且存在 `tool_calls` 时也必须返回 Responses `output:[function_call]`，`output_text`
  为空字符串，而不是复制 raw chat completion。SA 之前 `normalize_chat_fallback_content_json_body` 只在能提取
  `message.content` 时进入 Responses builder，`content:null` 会落入 raw copy。本轮新增 tool-only 分支：当
  `content` 不存在但发现 `tool_calls` 时，构造空 `output_text` 的 Responses JSON，并复用
  `append_first_chat_tool_item_json` 生成第一个 `function_call`；同时把该 helper 改为接受 `prefix_comma` 参数，
  让已有 message/reasoning/thought 分支传 `1`，tool-only 输出数组首项传 `0`。顺手修复 chat
  `reasoning_content + tool_calls` 分支之前未追加 tool item 的遗漏。构建验证
  `/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json` 通过（metrics:
  `compile_tokens=34028`、`instruction_count=16317`，elapsed `1:19.49`）。Focused 验证：
  `test_responses_fallback_json_tool_only.sh`、`test_responses_fallback_json_tool_call.sh`、
  `test_responses_fallback_json_reasoning_content.sh`、`test_responses_fallback_json_thought_tag.sh`、
  `test_responses_fallback_stream_tool_call_normalize.sh` 全部通过。剩余差距：非流式 chat JSON 多个
  `tool_calls` 仍只输出第一个；非流式 continuation 注入未补；fallback stream 仍缺
  `reasoning_content`/`thinking` delta 与 `<thought>` splitter。
- 2026-05-29 Chat fallback JSON 多个 `tool_calls` 修复：继续对照 Deno
  `responsesFallbackResponseFromChat`，chat JSON `choices[0].message.tool_calls[]` 中多个 tool call 都应变成
  Responses `output` 里的多个 `function_call` item。SA 之前 `append_first_chat_tool_item_json` 只抽取第一个
  `id/name/arguments`，且 tool-only/content/thought/reasoning 分支都只能得到一个 tool item。本轮将该 helper
  改为数组扫描循环：按每个 `"id":"..."` segment 调用新的 `append_chat_tool_item_json_segment`，用计数器决定首项是否需要
  comma，保留 `read -> exec_command` 和 `exec_command.command -> cmd` 的参数归一化。实现中遇到一次 SA
  affine `PhiStateConflict`：循环分支里临时 `count` register 未在回到 loop 前消费，已显式 `!count/!count3`
  修复；未发现新的编译器根因缺陷。`sa/tests/test_responses_fallback_json_tool_call.sh` 已从单 tool 扩展为两个
  tool：`read(filePath)` 和 `exec_command(command)`，断言输出 `message,function_call,function_call`、
  call_id 顺序、归一化 name/arguments、usage/tail 和 raw 字段不泄漏。构建验证
  `/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json` 通过（metrics:
  `compile_tokens=34261`、`instruction_count=16433`，elapsed `1:21.68`）。Focused 验证：
  `test_responses_fallback_json_tool_call.sh`、`test_responses_fallback_json_tool_only.sh`、
  `test_responses_fallback_json_reasoning_content.sh`、`test_responses_fallback_json_thought_tag.sh`、
  `test_responses_fallback_stream_tool_call_normalize.sh` 全部通过。剩余差距：非流式 continuation 注入未补；
  fallback stream 仍缺 `reasoning_content`/`thinking` delta 与 `<thought>` splitter。
- 2026-05-29 Chat fallback JSON 非流式 continuation 注入修复：对照 Deno
  `responsesFallbackResponseFromChat` 中 `shouldInjectContinuationTool(split.visibleText, true, allowedTools, ...)`，
  当非流式 chat fallback 返回 progress-only 文本（例如 `Let me check...`），且原始 Responses 请求允许
  `exec_command` 并带 goal/code 上下文时，应在 Responses JSON `output` 后追加 `exec_command` function_call；
  普通请求或已有 tool_call 时不能注入。SA 之前只在 fallback SSE/native SSE progress 路径覆盖 continuation，
  JSON normalizer 甚至拿不到原始请求 body。本轮将 `normalize_chat_fallback_json_body` 和
  `normalize_chat_fallback_content_json_body` 签名扩展为接收 `req_body/req_body_len`，在 content-only、
  reasoning_content、thought-tag 三条有可见文本的 builder 中调用 `append_chat_json_continuation_if_needed`：
  复用现有 `body_allows_progress_continuation` 与 `responses_sse_is_progress_message` 判定，且仅在
  `append_first_chat_tool_item_json` 未输出 tool item 时追加固定 `tc_chat_continue/call_chat_continue`
  `exec_command`。新增 focused 回归 `test_responses_fallback_json_progress_continuation.sh` 和
  `test_responses_fallback_json_progress_no_continuation.sh`，分别验证 goal-context 请求会注入、普通请求不会注入。
  构建验证 `/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json` 通过（metrics:
  `compile_tokens=34436`、`instruction_count=16519`，elapsed `1:22.84`）。Focused 验证：
  `test_responses_fallback_json_progress_continuation.sh`、`test_responses_fallback_json_progress_no_continuation.sh`、
  `test_responses_fallback_json_tool_call.sh`、`test_responses_fallback_json_tool_only.sh`、
  `test_responses_fallback_json_reasoning_content.sh`、`test_responses_fallback_json_thought_tag.sh`、
  `test_responses_fallback_stream_progress_continuation.sh`、`test_responses_fallback_stream_progress_no_continuation.sh`
  全部通过。剩余差距：fallback stream 仍缺 `reasoning_content`/`thinking` delta 与 `<thought>` splitter；
  业务层仍有较多 byte-scan JSON/SSE builder，后续应继续向 SA std/宏层沉淀。
- 2026-05-29 Chat fallback stream `reasoning_content/thinking` delta 修复：对照 Deno
  `collectResponsesEventsFromChatChunkText`，chat SSE fallback 中的 `delta.reasoning_content` 和 `delta.thinking`
  应转换为 Responses SSE reasoning 事件，而不是被忽略或泄漏 raw chat chunk。SA 之前
  `chat_fallback_sse_to_responses_body` 只提取第一段 `content` 并直接输出 message delta/item，对 reasoning
  delta 没有任何处理。本轮新增 `J_THINKING_KEY` 以及 `RESP_REASON_ADDED`、
  `RESP_REASON_SUMMARY_PART`、`RESP_REASON_DELTA_*` 等常量，增加
  `append_chat_sse_reasoning_if_present` helper：当同一个 fallback body 中存在 `reasoning_content` 和/或
  `thinking` 时，先输出 `response.output_item.added` reasoning item、summary part、逐段 summary text
  delta，再输出合并后的 `response.output_item.done` reasoning item，然后才输出可见 `output_text.delta`。
  新增 focused 回归 `sa/tests/test_responses_fallback_stream_reasoning_content.sh`，mock 上游依次返回
  `reasoning_content:"think one"`、`thinking:" and two"`、`content:"answer"`，断言 reasoning added/summary
  delta/done/message delta 顺序、合并文本 `think one and two`，并确保 `choices/reasoning_content/thinking/[DONE]`
  不泄漏。构建验证 `/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json` 通过（metrics:
  `compile_tokens=34671`、`instruction_count=16633`，elapsed `1:24.98`）。Focused 验证：
  `test_responses_fallback_stream_reasoning_content.sh`、`test_responses_fallback_stream_events.sh`、
  `test_responses_fallback_stream_progress_continuation.sh` 串行通过。注意：这些 shell 测试都会临时改同一个
  `.env` 并占用 `28080`，不能并行跑，否则会互相踩配置/进程导致假失败。未发现新的 SA 编译器根因缺陷；
  但当前实现仍是业务层 byte-scan/SSE builder，建议继续在 SA std/宏层补 Deno-like JSON/SSE event builder、
  chunk iterator、reasoning/content splitter。剩余差距：fallback stream `<thought>` splitter 仍未补，且当前
  reasoning helper 只覆盖常见聚合 body 形态，后续要把多 chunk/interleaved 情况沉淀成更通用的 std helper。
- 2026-05-29 Chat fallback stream `<thought>` tag split 修复：继续对照 Deno
  `createThoughtStreamSplitter` / `collectResponsesEventsFromChatChunkText`，当 chat SSE fallback 的
  `delta.content` 以 `<thought>...</thought>` 开头时，SA 现在会先输出 Responses SSE reasoning item/summary
  delta/done，再输出去掉 thought tag 后的可见 `output_text.delta`。新增 focused 回归
  `sa/tests/test_responses_fallback_stream_thought_tag.sh`，mock 上游返回
  `content:"<thought>stream thought</thought>Hello there"`，断言 reasoning 事件早于 message delta、summary
  文本和可见文本正确，并防止 raw `<thought>`、`</thought>`、`choices`、`[DONE]` 泄漏。构建验证
  `/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json` 已通过（metrics:
  `compile_tokens=34871`、`instruction_count=16733`，elapsed `1:24.05`）。Focused 验证已串行通过：
  `test_responses_fallback_stream_thought_tag.sh`、
  `test_responses_fallback_stream_reasoning_content.sh`、
  `test_responses_fallback_stream_events.sh`、
  `test_responses_fallback_stream_progress_continuation.sh`。实现限制：本轮只覆盖单个完整 `<thought>` tag
  位于同一 content chunk 开头的常见路径；Deno 的 splitter 能处理跨 chunk、普通文本与 thought 片段交错的
  更完整状态机。后续需要优先把 JSON/SSE chunk iterator、thought/reasoning/content splitter 下沉到
  SA std/宏层，避免在 `sa/main.sa` 继续堆 byte-scan 分支。
- 2026-05-29 Chat fallback stream `<thought>` 根因修复：上一版只覆盖“完整 `<thought>...</thought>` 位于同一个
  `delta.content` chunk 开头”的窄路径，根因是 `sa/main.sa` 仍在业务层用 `rpc_extract_string_after` 抽第一段
  `content`，没有 Deno `createThoughtStreamSplitter` 那种 SSE data chunk iterator + pending tag 状态机。SCI/std
  已新增 `sa_deno_chat_sse_to_responses(chat_body, req_body) -> u64` 和宏
  `DENO_CHAT_SSE_TO_RESPONSES`，runtime 内部按 `data:` chunk 解析 chat SSE，使用 pending buffer 处理跨 chunk
  `<thought>` / `</thought>`，并统一输出 Responses SSE 的 reasoning/message/done/completed 事件；安装态
  `/home/vscode/.sa/std/deno.sai`、`deno.sa` 和 `libsa_std.a` 已确认包含
  `sa_deno_chat_sse_to_responses`。SCI focused 回归：`zig build std-smoke --summary none` 通过，其中新增 C
  侧测试 `sa_std Deno chat SSE fallback splits thought tags across chunks`，防止跨 chunk thought tag 再泄漏。
  HubProxy 已将 chat fallback stream 的非 tool-call 路径改为调用该 std helper，保留原有 tool-call 专用归一化路径。
  构建验证 `/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json` 通过（metrics:
  `compile_tokens=34588`、`instruction_count=16591`，elapsed `1:33.92`）。服务级 focused 验证串行通过：
  `test_responses_fallback_stream_thought_tag.sh`（现已把 `<thought>` open/close tag 拆到 3 个 SSE chunk）、
  `test_responses_fallback_stream_reasoning_content.sh`、
  `test_responses_fallback_stream_events.sh`、
  `test_responses_fallback_stream_progress_continuation.sh`、
  `test_responses_fallback_stream_tool_call_normalize.sh`。本轮未发现新的 SA 编译器缺陷；暴露的是 std 抽象缺口，
  已用 Deno-like std helper 补齐并安装。剩余差距：非 tool-call stream fallback 已从业务层迁出一部分，但
  tool-call stream、非流式 chat JSON normalization 仍有较多 byte-scan 逻辑，后续应继续下沉到 SA std JSON/SSE builder。
- 2026-05-29 Chat fallback stream tool-call std 迁移（源码已完成，安装待编译器稳定）：`sa_deno_chat_sse_to_responses`
  已继续扩展到 Deno `collectResponsesEventsFromChatChunkText` 的 `delta.tool_calls` 路径，支持按 tool `index`
  累计分片、在 `finish_reason:"tool_calls"` 或 `stop` 时输出 Responses `function_call` item，并覆盖
  `read(filePath/path) -> exec_command {"cmd":"cat '...'"}`、`exec_command {"command":...} -> {"cmd":...}` 两个
  Codex chat fallback 常用归一化。SCI focused 回归已扩展到同一个 C 侧 std-smoke 测试，断言 tool-call 输出
  两个 `exec_command`，包含 `cat '/tmp/demo.txt'` 与 `deno check src/main.ts`，并防止 raw
  `"name":"read"`、`"command"`、`"choices"` 泄漏；`zig build std-smoke --summary none` 已通过。
  HubProxy 源码已把 `chat_fallback_sse_to_responses_body` 简化为统一调用
  `sa_deno_chat_sse_to_responses`，不再先走 `append_chat_tool_item_events_from_body` 的业务层 byte-scan tool-call
  分支。当前未完成安装/HubProxy 重构建：`tools/install.sh --no-shell` 和单独
  `zig build -Doptimize=ReleaseFast --summary all` 在 SCI 编译器/插件系统改造期间无诊断长时间卡住，用户已说明这类
  编译器偶发问题不必修复、等待即可。本条记录表示源码推进完成；待编译器稳定后必须重新 ReleaseFast 安装到
  `/home/vscode/.sa`、用安装态 `/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json` 重建，并重跑
  `test_responses_fallback_stream_tool_call_normalize.sh`、`test_responses_fallback_stream_thought_tag.sh`、
  `test_responses_fallback_stream_reasoning_content.sh`、`test_responses_fallback_stream_events.sh` 和
  `test_responses_fallback_stream_progress_continuation.sh`。
- 2026-05-29 Deno 测试批量审计与 std 根因修复：不再按单个失败点追，已按 Deno 现有测试行为面做一次覆盖矩阵。
  `src/env_test.ts` 的 dotenv/config 行为在 SA 侧已有 `test_config*`、`test_server_config*`、`.env`/`SA_PORT=28080`
  启动链覆盖；`src/state_test.ts` 与 `src/handlers_test.ts` 的 RPC/thread/turn/event 面在 SA `test_*lifecycle*`、
  `test_events_contract.sh`、`test_turn_*`、`test_item_*`、`test_mcp_*` 中覆盖大部分服务契约；`src/proxy_test.ts`
  的 OpenAI proxy 面拆成 auth/header/model passthrough、responses fallback、native responses normalization、
  Gemini capture、MCP namespace normalization 五类，SA 侧已有同名 focused shell 测试。真正缺口集中在 Deno
  `collectResponsesEventsFromChatChunkText` 迁入 SA std 后的三类边界：`.env*` read 脱敏、MCP namespace
  de-flatten、progress-only continuation 不能把任意 developer role 当作 goal/code。根因已在 SCI
  `/home/vscode/projects/sci/src/runtime/sa_std.zig` 的 `sa_deno_chat_sse_to_responses` helper 修复：
  `read(filePath/path)` 对 `/(^|\/)\.env(?:\..*)?$/i` 改为 `sed -E ... <redacted>`，`mcp__server__tool`
  输出 Responses `function_call` 时拆成 `namespace/name/output_kind`，续跑判定只接受 `<goal_context>`、
  explicit goal/code metadata 或 `# Collaboration Mode: Default`，并排除 `<proposed_plan>` 与最终答案标记。
  SCI 回归已加入真实 `std-smoke` 入口 `tests/std_smoke_core.zig`，覆盖上述三类边界；验证
  `zig build std-smoke --summary none` 通过。`sa-std-static -Doptimize=ReleaseFast` 与窄
  `zig build-lib -O ReleaseFast` 在当前 SCI/plugin 改造环境均超时（无诊断失败），因此本轮使用
  `zig build-lib src/runtime/sa_std.zig -O Debug -lc` 生成并安装 `/home/vscode/.sa/std/libsa_std.a`，已确认
  导出 `sa_deno_chat_sse_to_responses`；待 compiler/plugin 改造稳定后需要补一次 ReleaseFast 打包安装。
  HubProxy 已用安装态 SA 重建成功（`/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json`，metrics:
  `compile_tokens=34506`、`instruction_count=16550`）。服务级 focused 验证串行全过：
  `test_responses_fallback_stream_tool_call_normalize.sh`、`test_responses_fallback_stream_tool_call_split.sh`、
  `test_responses_fallback_stream_tool_call_read_env_redact.sh`、
  `test_responses_fallback_stream_tool_call_read_shell_quote.sh`、
  `test_responses_fallback_stream_tool_call_namespace.sh`、`test_responses_fallback_stream_thought_tag.sh`、
  `test_responses_fallback_stream_reasoning_content.sh`、
  `test_responses_fallback_stream_progress_continuation.sh`、
  `test_responses_fallback_stream_progress_no_continuation.sh`。剩余矩阵项：`responses_mock_test.ts`
  主要是 Deno mock harness 行为，非线上服务必需；native JSON thinking/tool-output replay 仍建议继续下沉到
  SA std JSON builder，避免 `sa/main.sa` 保留过多 byte-scan 逻辑。
- 2026-05-29 turn context/progress continuation 根因修复：Deno `handleHttpWithState resolves turn context from thread and turn ids` 这组测试要求 `/v1/responses` 能通过请求头 `thread-id`/`turn-id` 读取本地 turn 的 `collaborationModeKind`，且 stale turn-id 不能生效。SA 之前只扫描请求体，`turn/start` 也没有把 mode 写入 turn slot，导致 goal turn 的 progress-only chat fallback 无法注入 continuation，或者只能依赖请求体显式 `<goal_context>`。本轮在 `sa/src/state.sai`/`state.sa` 增加 `TURN_MODE` 和 `state_turn_set_mode`，在 `sa/main.sa` 增加 `body_collaboration_mode`、state header lookup、context body 构造，并在 `turn/start` 写入/返回/事件输出 `collaborationModeKind`。`/v1/responses` 转发给上游仍使用原始请求体，只在 fallback/native SSE normalization 时使用临时 context body，避免污染 upstream 请求。新增 `sa/tests/test_responses_turn_context_goal_continuation.sh` 一次覆盖：state goal turn 会注入 `exec_command` continuation，普通 turn 不注入，stale turn-id 不注入。验证：`/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json` 通过（metrics: `compile_tokens=35305`、`instruction_count=16938`）；focused 回归通过：`test_responses_turn_context_goal_continuation.sh`、`test_responses_fallback_stream_progress_continuation.sh`、`test_responses_fallback_stream_progress_no_continuation.sh`、`test_responses_fallback_json_progress_continuation.sh`、`test_responses_fallback_json_progress_no_continuation.sh`、`test_responses_native_progress_continuation.sh`、`test_responses_native_progress_no_continuation.sh`。
- 2026-05-29 批量测试策略更新：当前 `src/handlers_test.ts` 可解析出 11 个 Deno handlers 行为测试；SA shell 回归已有 71 个。后续迁移不再“发现一个缺口修一个”，而是按 Deno handlers/proxy/state 测试分组建立覆盖矩阵，先跑/补同一行为面的 SA focused tests，再集中修 SA std/编译器/root cause。已覆盖本轮 mode-resolution 组：state context、stale turn、body goal/code/default/plan progress continuation；剩余应优先批量审计 request log/auth log 匿名 models RPC 鉴权组、native JSON/tool replay 组、Gemini capture 组。
- 2026-05-29 handlers 日志/鉴权/models 行为组批量补齐：对照 Deno `handleHttpWithState writes request logs for API routes`、`does not write logs by default`、`writes auth failure previews`、`serves models anonymously and still protects rpc when authToken is set`，SA 侧已有 request/auth log、上游 header 和 public models/auth 保护覆盖；本轮新增 `sa/tests/test_api_request_log_disabled_by_default.sh`，在临时运行目录里移除 `HUBPROXY_LOG_DIR` 后真实请求 `/v1/responses`，断言不会默认创建 `logs` 目录或 `request-sa-*.json`。验证通过：`test_api_request_log_disabled_by_default.sh`、`test_api_request_log.sh`、`test_auth_failure_log.sh`、`test_upstream_auth_headers.sh`。
- 2026-05-29 Responses fallback/native 字段与 JSON stream 根因修复：批量审计 `responses_mock_test.ts`、`proxy_test.ts` 的 mock/tool replay/native thinking/field stripping 行为后，发现 SA 服务级测试缺少 chat fallback 剥离 responses-only 字段的覆盖。新增 `sa/tests/test_responses_fallback_strips_responses_only_fields.sh` 后暴露真实缺陷：普通 `input[].content[].text` 和 `model` fallback 到 `/v1/chat/completions` 时变成乱码。根因是 `json_stream_extract_top_string` 返回 `sa_json_stream_get_slice_ptr` 指向 stream owned buffer 的 slice，但函数退出前释放了 stream，后续 builder 读到 dangling pointer。已在 `sa/main.sa` 中改为在释放 stream 前复制 value slice 到 owned buffer，再返回该 buffer。构建验证 `/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json` 通过（metrics: `compile_tokens=35313`、`instruction_count=16942`）。Focused 回归通过：`test_responses_fallback_strips_responses_only_fields.sh`、`test_responses_missing_base_capture.sh`、`test_responses_fallback_capture.sh`、`test_responses_fallback_tool_history.sh`、`test_responses_gemini_capture.sh`、`test_responses_native_thinking_json.sh`、`test_responses_native_thinking_stream.sh`、`test_responses_client_mcp_denormalize.sh`。同时修正两个过时测试断言：SA 目标是把 chat fallback 响应归一化为 Responses JSON，不再透传 raw `chat.completion`。
- 2026-05-29 `memory/reset` Deno state lifecycle 根因修复：批量对照 `src/state_test.ts` 后发现 SA 以前的 `memory/reset` 只返回 `{reset:true, threadId}`，没有清空 runtime state；这会保留 threads/goals/turns/fs watches/process handles。已在 `sa/src/state.sai`/`sa/src/state.sa` 增加 `state_reset_runtime`，RPC `memory/reset` 调用后清空业务状态并按 Deno 语义发 `thread/closed` wildcard 事件。第二个根因是直接把通知 head/tail 清零会让已连接 `/events` 客户端的游标大于新 tail，从而看不到 reset 后事件；修复为 reset 时保留 old tail 作为新的 head/tail，保持 SSE 游标单调递增，再写入 wildcard closed。第三个小缺陷是 string thread id 通知复用 numeric close 逻辑导致 `{"threadId":"*}` 少结束引号，已新增 `notify_thread_id_string` 并补 quote。新增回归：`sa/tests/test_state.sa` 的 `reset_runtime` 单元覆盖 thread/turn/goal/process/watch 全清，`sa/tests/test_memory_reset_clears_state.sh` 服务级覆盖 `thread/list`、`thread/loaded/list`、`thread/goal/get`、`process/kill`、`fs/unwatch` 和 `/events` wildcard `thread/closed`。验证通过：`/home/vscode/.sa/bin/sa build tests/test_state.sa -o tests/test_state --json && ./tests/test_state`，以及 `/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json && tests/test_memory_reset_clears_state.sh`（main build metrics: `compile_tokens=35415`、`instruction_count=16991`）。
- 2026-05-29 `thread/rollback` numeric `numTurns` 兼容修复：Deno `handlers.ts` 对 `thread/rollback` 使用 `Number(params.numTurns ?? 1)`，数字和字符串都可用；SA 之前只按 `"numTurns":"..."` 字符串 key 解析，`numTurns:1` 会退回默认值，已有测试也只覆盖字符串。已在 `sa/main.sa` 增加 `"numTurns":` numeric key，rollback 分支先检测字符串形态，否则走 `rpc_extract_u64_number_after`。新增 `sa/tests/test_thread_rollback_numeric_num_turns.sh`：创建两个 turn，用数字 `numTurns:1` rollback，断言只移除最后一个 turn。验证通过：`/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json && tests/test_thread_rollback_numeric_num_turns.sh`（metrics: `compile_tokens=35442`、`instruction_count=17004`）。
- 2026-05-29 `thread/start` / `thread/fork` 参数覆盖与 state 字符串生命周期修复：Deno `thread/start` 可用 params 覆盖 `model`/`cwd`，`thread/fork` 可继承源线程并用 params 覆盖 `model`/`cwd`；SA 以前固定使用 `.env` config，忽略 RPC params。已在 `sa/main.sa` 增加 `rpc_extract_string_or_default`，并让 start/fork 创建、响应、`thread/started` 事件都使用解析后的 model/cwd。修复过程中暴露更深根因：`state_thread_create` 以前只保存传入 model/cwd 指针，若指针来自请求体，RPC 结束后 `thread/read` 会读到悬空 slice 乱码。已在 `sa/src/state.sa` 中对 model/cwd 做 owned copy 后再写入 thread slot。新增 `sa/tests/test_thread_start_fork_param_overrides.sh`，验证 start/fork 响应和后续 `thread/read` 都保留覆盖值。验证通过：`/home/vscode/.sa/bin/sa build tests/test_state.sa -o tests/test_state --json && ./tests/test_state`，`/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json && tests/test_thread_start_fork_param_overrides.sh`（metrics: `compile_tokens=35677`、`instruction_count=17120`），并复跑 `tests/test_thread_rollback_numeric_num_turns.sh` 通过。
- 2026-05-29 `mcpServer/tool/call` 参数兼容修复：Deno handler 使用 `params.serverName ?? 'local'`，SA 之前的 structuredContent 只读取旧 `server` 字段；已有 SA 测试也只覆盖旧别名。已在 `sa/main.sa` 增加 `rpc_builder_append_param_string_or_alt_default`，用于优先读取 `serverName`，没有时兼容旧 `server`，最后回退 `local`。`send_rpc_mcp_tool_call` 现在用该 helper 输出 `structuredContent.server`。扩展 `sa/tests/test_mcp_tool_progress_event.sh`，同一测试覆盖旧 `server` 与正式 `serverName`，并断言 `serverName` 优先于 `server`。验证通过：`/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json && tests/test_mcp_tool_progress_event.sh`（metrics: `compile_tokens=35806`、`instruction_count=17184`）。
- 2026-05-29 `thread/start` / `thread/fork` `modelProvider` 与 `ephemeral` 根因修复：继续对照 Deno `handlers.ts`/`state.ts` 后发现 SA 线程 JSON 仍把 `modelProvider:"openai"` 和 `ephemeral:true` 写死，导致 start/fork 即便已支持 `model`/`cwd` 参数，provider/ephemeral 仍无法从请求进入响应、SSE 和后续 `thread/read`。已在 `sa/src/state.sai`/`state.sa` 扩展 thread slot，增加 owned `THR_PROVIDER_PTR/LEN` 与 `THR_EPHEMERAL`，并新增 `state_thread_set_model_provider`、`state_thread_set_ephemeral`；`sa/main.sa` 的 thread serializer、`thread/start`、`thread/fork`、`thread/list`、`thread/read`、`thread/started` 通知均改为从 state/请求参数读取。按当前 Deno handler 语义，`ephemeral` 使用 `params.ephemeral !== false`，即只有请求明确 `"ephemeral":false` 时输出 false，否则默认 true。扩展 `sa/tests/test_state.sa` 覆盖 provider/ephemeral 持久化，扩展 `sa/tests/test_thread_start_fork_param_overrides.sh` 覆盖 start/fork 的 `modelProvider` 与 `ephemeral:false` 响应及 `thread/read` 保留。验证通过：`/home/vscode/.sa/bin/sa build tests/test_state.sa -o tests/test_state --json && ./tests/test_state`，`/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json`（metrics: `compile_tokens=36137`、`instruction_count=17343`），以及 `tests/test_thread_start_fork_param_overrides.sh`。
- 2026-05-29 `thread/resume` envelope 与 thread turns JSON 根因修复：批量审计 Deno `handlers_test.ts` 的 resume lifecycle 后发现 SA `thread/resume` 复用了 `thread/read` 响应，只返回 `{thread}`，缺少 Deno start/resume envelope 顶层 `model/modelProvider/serviceTier/cwd/.../thread`。修复时暴露第二层共享 builder 缺陷：`rpc_builder_append_thread_open` 名为 open 但实际写入 `,"turns":[]}` 关闭 thread 对象，导致 `thread/read includeTurns=true` 与新 resume 追加 turns 时把 turns 写成顶层 `result.turns`，而不是 `thread.turns`。已把 `rpc_builder_append_thread_open` 改为只写到 `name` 字段，所有调用方显式追加 `turns` 并关闭自己的 result；新增 `send_rpc_thread_resume` 输出 Deno 同形 envelope，且 thread 内包含真实 turns。新增 `sa/tests/test_thread_resume_envelope.sh`，覆盖 start 带 model/provider/cwd/ephemeral、turn/start、resume envelope 和 `thread.turns`。验证通过：`/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json`（metrics: `compile_tokens=36348`、`instruction_count=17448`），以及 `tests/test_thread_resume_envelope.sh`、`tests/test_thread_start_fork_param_overrides.sh`、`tests/test_thread_rollback_numeric_num_turns.sh`。
- 2026-05-29 Deno 测试覆盖矩阵落地与 MCP SSE 边界修复：按用户要求改为先批量审计 Deno 现有测试，不再单点撞问题。已新增 `sa/tests/deno_coverage_matrix.md`，按 proxy、reasoning/progress、handlers/state、env/std、mock harness 五组记录 64 个 Deno 测试行为与 84 个 SA focused tests 的对应关系和剩余根缺口。审计发现 native Responses SSE client-side MCP normalization 仍只覆盖 `mcp__code_index__`，缺少 Deno `normalizeResponsesEvent` 里的 `mcp__custom_tool__some_tool` / `custom-tool` 边界；已在 `sa/main.sa` 增加 custom-tool 的 bounded denormalize/de-flatten 处理，并扩展 `sa/tests/test_responses_client_mcp_denormalize.sh` 同时覆盖 code-index 与 custom-tool。验证通过：`/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json`（metrics: `compile_tokens=36378`、`instruction_count=17461`），`tests/test_responses_client_mcp_denormalize.sh`、`tests/test_responses_mcp_server_normalize.sh` 串行通过。注意：这仍是有限替换，不是完整根治；完整根因应把 native Responses SSE 的 MCP namespace/server normalization 下沉到 SCI std 的通用 JSON/SSE normalizer，类似已完成的 `sa_deno_chat_sse_to_responses`。另确认会改 `.env` 并占用 `28080` 的 shell 测试必须串行运行，否则会产生假失败。
- 2026-05-29 native Responses SSE MCP normalization 根因下沉到 SCI std：继续推进上一条的剩余根缺口，已在 `/home/vscode/projects/sci/src/runtime/sa_std.zig` 新增 `sa_deno_responses_sse_normalize(sse_body) -> u64`，用 Zig/SA std runtime 的 JSON AST 解析每个 SSE `data:` payload，泛化处理 `response.output_item.*` 中 `function_call.name` 的 `mcp__server__tool` 与 `mcp__server__.tool` 两种形式，输出 `name`、`namespace`、`output_kind:"function_call_output"`，并把 `arguments` 字符串里的 `server` 从 `mcp__foo_bar__` / `foo_bar` 还原为 `foo-bar`。同步更新 `sa_std/deno.sai`、`sa_std/deno.sa`、`src/runtime/sa_std.h`，新增宏 `DENO_RESPONSES_SSE_NORMALIZE`。SCI focused 验证：`zig build std-smoke --summary none` 通过，其中新增 C 侧 fixture 覆盖 `mcp__code_index__search`、`mcp__code_index__.read_mcp_resource`、`server:"code_index"` 和 `mcp__custom_tool__some_tool`。ReleaseFast `/home/vscode/projects/sci/tools/install.sh --no-shell` 本轮再次在 `zig build -Doptimize=ReleaseFast` 阶段长时间无诊断卡住，已按用户此前说明不修插件系统偶发卡住；为推进 HubProxy，已用 Debug runtime 单独构建并安装 `/home/vscode/.sa/std/libsa_std.a`，同时复制安装态 `deno.sai`、`deno.sa`、`sa_std.h`，`nm` 已确认导出 `sa_deno_responses_sse_normalize`。HubProxy `sa/main.sa` 的 native Responses SSE 路径已改为调用该 std helper，删除上一轮 custom/code-index 固定 replacement 常量；重建通过（metrics: `compile_tokens=36327`、`instruction_count=17438`）。Focused 回归串行通过：`test_responses_client_mcp_denormalize.sh`、`test_responses_mcp_server_normalize.sh`、`test_responses_native_progress_continuation.sh`、`test_responses_native_progress_no_continuation.sh`、`test_responses_native_thinking_stream.sh`。`sa/tests/deno_coverage_matrix.md` 已更新：native Responses SSE MCP normalization 不再列为 bounded replacement 缺口；当前仍保留的根缺口是 request-side MCP server alias normalization 仍 bounded 到 code-index，以及部分非流式 JSON fallback 仍在业务层扫描。
- 2026-05-29 request-side Responses MCP server alias normalization 根因下沉到 SCI std：继续处理覆盖矩阵剩余根缺口，新增 `/home/vscode/projects/sci/src/runtime/sa_std.zig` export `sa_deno_responses_request_normalize(body) -> u64`，并同步 `sa_std/deno.sai`、`sa_std/deno.sa`、`src/runtime/sa_std.h` 和宏 `DENO_RESPONSES_REQUEST_NORMALIZE`。该 helper 用 JSON AST 遍历完整 `/v1/responses` 请求体，只改 `type:"function_call"` item 的 `arguments` 字符串内 `server` 字段，支持 Deno 的 `Code Index`、`code-index`、`code_index`、`Mimir`、`mimir`、已 normalized `mcp__...__`、双包裹 `mcp__mcp_code_index___`，以及泛化 `"Custom Tool" -> "mcp__custom_tool__"`；不会改普通 message 文本里的可见 `"Code Index"`。SCI focused 验证：`zig build std-smoke --summary none` 通过，其中新增 request fixture 覆盖上述别名。安装态继续采用 Debug runtime 单独安装到 `/home/vscode/.sa/std/libsa_std.a` 并复制 facade/header，`nm` 已确认导出 `sa_deno_responses_request_normalize`。HubProxy `sa/main.sa` 的 request-side `/v1/responses` 代理路径已改为先 `build_responses_proxy_body`，再调用 `sa_deno_responses_request_normalize`，并删除旧的 `normalize_responses_mcp_server_aliases` bounded replacement 函数及 code-index 常量。重建通过（metrics: `compile_tokens=36277`、`instruction_count=17415`）。Focused 回归串行通过：`test_responses_mcp_server_normalize.sh`、`test_responses_client_mcp_denormalize.sh`。`sa/tests/deno_coverage_matrix.md` 已更新：request-side MCP alias normalization 不再列为 bounded 缺口；剩余优先级继续看非流式 JSON fallback 业务层扫描。
- 2026-05-29 non-stream chat JSON fallback 根因下沉到 SCI std：为避免继续在 HubProxy SA 业务层按单点堆 byte-scan，本轮把 Deno `responsesFallbackResponseFromChat` 的非流式 chat JSON -> Responses JSON 行为迁入 `/home/vscode/projects/sci/src/runtime/sa_std.zig`，新增 export `sa_deno_chat_json_to_responses(chat_body, req_body) -> u64`，并同步 `src/runtime/sa_std.h`、`sa_std/deno.sai`、`sa_std/deno.sa` 与宏 `DENO_CHAT_JSON_TO_RESPONSES`。该 helper 使用 Zig JSON AST 和既有 std helpers，覆盖：`choices[0].message.content` 到 message/output_text、`<thought>...</thought>` 到 reasoning item、`reasoning_content` 到 reasoning item、`tool_calls` 归一化（`read` -> `exec_command`、`.env*` read 脱敏、`exec_command.command` -> `cmd`）、usage 归一化、以及 goal/default/code 上下文中的 progress-only continuation。新增 SCI C fixture 已写入 `tests/std_smoke_core.zig`；但当前 `zig build std-smoke --summary none` 在 compiler/plugin 改造期间卡在 import 阶段超过两分钟，按用户说明没有转去修这个偶发编译器状态。本轮改用窄验证：`zig build-lib src/runtime/sa_std.zig -O Debug -lc` 通过，临时 C smoke 对 content/usage/thought/reasoning/tool/progress 全部通过。已用 Debug runtime 安装更新到 `/home/vscode/.sa/std/libsa_std.a`，并复制 `sa_std.h`、`deno.sai`、`deno.sa`；`nm` 确认导出 `sa_deno_chat_json_to_responses`。HubProxy `sa/main.sa` 的 `normalize_chat_fallback_json_body` 已改为调用 std helper，旧 `normalize_chat_fallback_content_json_body` 等 byte-scan helper 暂保留未调用，后续等编译器/plugin 稳定后再做死代码清理。安装态 SA 重建通过：`/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json`（metrics: `compile_tokens=36134`、`instruction_count=17343`）。Focused 服务回归串行通过：`test_responses_fallback_json_tool_call.sh`、`test_responses_fallback_json_tool_only.sh`、`test_responses_fallback_json_thought_tag.sh`、`test_responses_fallback_json_reasoning_content.sh`、`test_responses_fallback_json_progress_continuation.sh`、`test_responses_fallback_json_progress_no_continuation.sh`、`test_responses_fallback_strips_responses_only_fields.sh`。`sa/tests/deno_coverage_matrix.md` 已更新：非流式 JSON fallback 不再列为业务层 scanning 根缺口；剩余 cleanup 是删除未调用旧 helper，并在 compiler/plugin 稳定后补跑完整 `std-smoke`/ReleaseFast 打包。
- 2026-05-29 native Responses JSON thinking normalization 根因下沉到 SCI std：Deno 的 native JSON path 会用 `normalizeResponsesEvent`/`normalizeReasoningItemPayload` 把 `type:"thinking"`、`reasoning_content`、message content 内 `<thought>` 转为标准 Responses reasoning/message item；SA 之前 `normalize_responses_client_json_body` 在 HubProxy 业务层用 byte-scan 重建固定形态 JSON。已在 `/home/vscode/projects/sci/src/runtime/sa_std.zig` 新增 `sa_deno_responses_json_normalize(body) -> u64`，并同步 `src/runtime/sa_std.h`、`sa_std/deno.sai`、`sa_std/deno.sa` 与宏 `DENO_RESPONSES_JSON_NORMALIZE`。该 helper 用 JSON AST 遍历 top-level `output`，保留其它顶层字段，结构化改写 `thinking/thought/reason/reasoning` item 为 `type:"reasoning"`，从 message 的 `reasoning_content` 与 output_text/content `<thought>` 中抽 reasoning，剥离可见文本里的 thought tag。SCI 窄验证：`zig build-lib src/runtime/sa_std.zig -O Debug -lc` 通过；临时 C smoke 覆盖 native `thinking` item、message `reasoning_content`、`output_text` thought tag 剥离，均通过。安装态继续用 Debug runtime 更新 `/home/vscode/.sa/std/libsa_std.a` 并复制 header/facade；`nm` 确认导出 `sa_deno_responses_json_normalize`。HubProxy `normalize_responses_client_json_body` 已改为调用 std helper，替掉旧扫描入口；重建通过：`/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json`（metrics: `compile_tokens=35909`、`instruction_count=17230`）。Focused 服务回归串行通过：`test_responses_native_thinking_json.sh`、`test_responses_native_thinking_stream.sh`、`test_responses_client_mcp_denormalize.sh`、`test_responses_fallback_json_tool_call.sh`、`test_responses_fallback_json_thought_tag.sh`、`test_responses_fallback_json_reasoning_content.sh`。SA 服务已重启在 `0.0.0.0:28080`，Deno 仍在 `27787`，`/healthz` 返回 `{"ok":true}`。覆盖矩阵已更新：native Responses JSON thinking normalization 现在归入 SA std normalizers；剩余 cleanup 是删除未调用旧 byte-scan helper 和待 compiler/plugin 稳定后补完整 `std-smoke`/ReleaseFast。
- 2026-05-29 删除 HubProxy 旧 chat JSON fallback dead code：在 `normalize_chat_fallback_json_body` 已完全改为调用 SCI std `sa_deno_chat_json_to_responses` 后，确认 `normalize_chat_fallback_content_json_body`、`append_chat_usage_json`、`append_chat_json_continuation_if_needed`、`append_first_chat_tool_item_json`、`append_chat_tool_item_json_segment` 只在彼此之间引用，外部无入口。本轮从 `sa/main.sa` 删除这整段旧 byte-scan JSON fallback builder，并清理仅服务这段代码的 `RESP_JSON_*`、`J_PROMPT_TOKENS_NUM_KEY`、`J_TOOL_CALLS_ARRAY_KEY`、`RESP_FB_CONT_CMD` 等常量/长度定义；保留仍被 stream 路径使用的 `append_chat_tool_normalized_arguments`、`CHAT_FB_COMMA`、`CHAT_FB_ARRAY_CLOSE`、`CHAT_FB_STREAM_END` 等。重建验证 `/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json` 通过，编译规模降至 `compile_tokens=34847`、`instruction_count=16716`。Focused 回归串行通过：`test_responses_fallback_json_tool_call.sh`、`test_responses_fallback_json_tool_only.sh`、`test_responses_fallback_json_thought_tag.sh`、`test_responses_fallback_json_reasoning_content.sh`、`test_responses_fallback_json_progress_continuation.sh`、`test_responses_fallback_json_progress_no_continuation.sh`、`test_responses_native_thinking_json.sh`、`test_responses_fallback_stream_tool_call_normalize.sh`、`test_responses_fallback_stream_tool_call_split.sh`。SA 服务已重启在 `0.0.0.0:28080`，Deno 仍在 `27787`，`/healthz` 返回 `{"ok":true}`。覆盖矩阵已更新：旧 chat JSON fallback byte-scan helper 不再是残留 cleanup 项；后续继续按路径把还在业务层的 stream/native 辅助逻辑下沉或删除。
- 2026-05-29 native Responses SSE thinking 归一化完全下沉到 SCI std：上一轮 native SSE path 仍先在 HubProxy `normalize_native_thinking_sse_body` 中 byte-scan `type:"thinking"` 并手写 reasoning event，再交给 `sa_deno_responses_sse_normalize` 做 MCP 归一化。本轮扩展 `/home/vscode/projects/sci/src/runtime/sa_std.zig` 的 `normalizeResponsesEventData`：当 SSE `data.item.type` 是 `thinking/thought/reason/reasoning` 时，用已有 reasoning field 抽取逻辑生成标准 `type:"reasoning"` item，输出 summary/content/encrypted_content，与 native JSON normalizer 语义保持一致。SCI 窄验证：`zig build-lib src/runtime/sa_std.zig -O Debug -lc` 通过，临时 C smoke 直接调用 `sa_deno_responses_sse_normalize`，验证 `type:"thinking"` stream item 被改写成 reasoning item 且保留 `reasoning_text`。已安装 Debug runtime 到 `/home/vscode/.sa/std/libsa_std.a` 并复制 header/facade，`nm` 确认 `sa_deno_responses_sse_normalize`/`sa_deno_responses_json_normalize` 导出。HubProxy `normalize_responses_client_sse_body` 现在直接调用 `sa_deno_responses_sse_normalize(&body, body_len)`，删除旧 `normalize_native_thinking_sse_body`、`append_chat_sse_reasoning_if_present`、`append_chat_tool_item_events_from_body`、`append_chat_tool_item_event` 及其 `RESP_REASON_*`、`RESP_FB_TOOL_*`、native thinking key 常量残留。重建 `/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json` 通过，规模降至 `compile_tokens=33906`、`instruction_count=16258`。Focused 回归串行通过：`test_responses_native_thinking_stream.sh`、`test_responses_client_mcp_denormalize.sh`、`test_responses_native_progress_continuation.sh`、`test_responses_native_progress_no_continuation.sh`、`test_responses_fallback_stream_reasoning_content.sh`、`test_responses_fallback_stream_thought_tag.sh`、`test_responses_fallback_stream_tool_call_normalize.sh`、`test_responses_fallback_stream_tool_call_split.sh`。SA 服务已重启在 `0.0.0.0:28080`，Deno 仍在 `27787`，`/healthz` 返回 `{"ok":true}`。覆盖矩阵已更新：native Responses SSE thinking/MCP normalization 均由 SCI std 负责；剩余 cleanup 继续检查 request/tool schema 和 chat fallback stream 中尚在业务层的 helper。
- 2026-05-29 删除 HubProxy 旧 request/tool fallback dead code：确认当前 `append_chat_fallback_tools` 唯一入口只调用基于 SA JSON DOM 的 `append_chat_fallback_tools_from_dom`，旧的 `append_chat_fallback_tools_from_json`、`append_chat_fallback_tools_legacy`、`append_chat_fallback_tool`、`append_first_custom_chat_fallback_tool`、`append_second_custom_chat_fallback_tool` 只在旧组内部互相引用，已无外部入口。本轮从 `sa/main.sa` 删除该组 byte-scan/legacy helper，并清理专属 `TOOL_NAME_PLAN*`、`TOOL_NAME_GOAL*`、`CHAT_FB_TOOL_B` 常量；保留仍被 stream/tool-call normalization 使用的 `TOOL_NAME_EXEC*`、`TOOL_NAME_READ` 和 DOM schema builder。重建验证 `/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json` 通过，规模降至 `compile_tokens=32960`、`instruction_count=15790`。Focused 回归串行通过：`test_responses_fallback_capture.sh`、`test_responses_fallback_tool_history.sh`、`test_responses_fallback_stream_tool_call_normalize.sh`、`test_responses_fallback_stream_tool_call_split.sh`、`test_chat_tools_capture.sh`、`test_responses_tools_capture.sh`、`test_responses_fallback_strips_responses_only_fields.sh`。本轮未发现新的 SA 编译器缺陷；这是 HubProxy 业务层旧代码清理，不涉及 SCI std/runtime 变更。
- 2026-05-29 删除 HubProxy 旧 stream tool-call normalization helper：`sa_deno_chat_sse_to_responses` 已承担 chat SSE fallback 的 tool-call 分片合并、`read` -> `exec_command`、`.env*` 脱敏、shell quoting、`command` -> `cmd` 和 MCP namespace de-flatten；HubProxy 里 `append_all_chat_tool_argument_fragments`、`append_chat_tool_normalized_arguments`、`extract_escaped_json_string_after`、`path_is_sensitive_env`、`append_shell_single_quoted_inner`、`append_read_command_argument` 及其 `CHAT_TOOL_*`/`TOOL_NAME_READ` 常量已经无调用，已删除。另确认 `build_chat_fallback_body` 内旧 `L_CHAT_FB_TOOL_FIND_CALL` byte-scan fallback 在 DOM path 失败后不可达，已删除该标签组，保留 DOM tool-history builder。重建 `/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json` 通过，规模降至 `compile_tokens=31558`、`instruction_count=15099`。Focused 回归串行通过：`test_responses_fallback_stream_tool_call_normalize.sh`、`test_responses_fallback_stream_tool_call_split.sh`、`test_responses_fallback_stream_tool_call_read_env_redact.sh`、`test_responses_fallback_stream_tool_call_read_shell_quote.sh`、`test_responses_fallback_stream_tool_call_namespace.sh`、`test_responses_fallback_tool_history.sh`、`test_responses_fallback_capture.sh`。未发现新的 SA 编译器缺陷。
- 2026-05-29 根启动入口切到 SA：根目录 `restart.sh` 之前仍读取 Deno `PORT`、杀 Deno 进程并 `exec deno task start`，这与“hubproxy 完全 SA 化”冲突。本轮改为读取 `.env` 的 `SA_PORT`（默认 28080），只管理该端口上的旧进程，然后 `cd sa && exec ./hubproxy`；脚本不再包含 `deno task start` / `deno run`。同时修正 `--logs/--log-dir` 对 SA 的真实生效问题：`sa/src/config.sa` 新增 process env overlay，只用 `HUBPROXY_LOG_DIR` 环境变量覆盖 log dir（端口仍来自 `.env` 的 `SA_PORT`，不碰 Deno `PORT=27787`）。重建 `/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json` 通过（metrics: `compile_tokens=31651`、`instruction_count=15143`）。新增并通过 `sa/tests/test_restart_sa_entry.sh`：用 `restart.sh --log-dir` 启动，断言 28080 是 SA `hubproxy`、27787 Deno PID 不变、RPC initialize 返回 `hubproxy/sa-std`、SA 写入 `request-sa-api.json`，且 `restart.sh` 不再引用 Deno runtime。
- 2026-05-29 默认项目任务切到 SA：根 `deno.json` 之前的 `start/dev/check` 仍直接运行或检查 `src/main.ts`，会让操作者按默认任务回到 Deno 实现。本轮把默认任务改为 SA：`start` 调 `./restart.sh`，`check` 执行 `/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json`，`dev` 先 SA build 再 restart；Deno 版本保留为显式 legacy 任务 `deno:start`、`deno:dev`、`deno:check`。新增 `sa/tests/test_project_tasks_sa_default.sh` 解析 `deno.json`，断言默认任务不含 `deno run`/`deno check`/`src/main.ts`，且 legacy Deno 任务必须带 `deno:` 前缀。验证通过：`test_project_tasks_sa_default.sh` 和当前 SA build（metrics: `compile_tokens=31651`、`instruction_count=15143`）。覆盖矩阵已加入该入口项。
- 2026-05-29 入口/运行态复核：重新核对覆盖矩阵计数，当前 Deno 源测试是 67 个 `Deno.test(...)`，SA focused tests 是 86 个 `sa/tests/test_*.{sh,sa}`；已修正 `sa/tests/deno_coverage_matrix.md`，避免后续验收使用旧的 70/85 数字。验证通过：`/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json`（metrics: `compile_tokens=31651`、`instruction_count=15143`）、`test_project_tasks_sa_default.sh`、`test_restart_sa_entry.sh`。`test_restart_sa_entry.sh` 已扩展为先启动一个旧 SA `hubproxy` 占用 28080，再断言 `restart.sh --log-dir` 会替换为新的 SA 进程，同时保持 Deno `27787` PID 不变并写入 SA request log。运行态复核：SA 版监听 `0.0.0.0:28080`，Deno 仍监听 `0.0.0.0:27787`；`/healthz` 返回 `{"ok":true}`；按 OpenAI chat completions 形状请求 `127.0.0.1:28080/v1/chat/completions`，带根 `.env` 的 `AUTH`，真实上游返回 HTTP 200，assistant content 为 `SA_PROXY_OK`。本轮没有发现新的 SA 编译器根因缺陷；发现的是验收记录计数和 restart 回归覆盖不充分，已修正。
- 2026-05-29 thin RPC parity 批量补齐：继续从 Deno `handlers.ts` 的响应形状反查 SA，而不是只按方法名覆盖。发现真实差异：Deno `experimentalFeature/enablement/set` 返回 `{enablement: params.enablement ?? {}}`，SA 之前固定返回 `{"enablement":{}}`，导致客户端设置项被丢弃。已在 `sa/main.sa` 新增 `send_rpc_experimental_enablement_set`，使用 SA std JSON DOM 解析 `params.enablement` 并通过 `sa_json_stringify` 原样回显；缺失或 `null` 时仍按 Deno 语义返回 `{}`。新增 `sa/tests/test_rpc_misc_parity.sh`，覆盖 experimental feature enablement 对象/缺失/null、`experimentalFeature/list`、`remoteControl/enable|disable|status/read`、`account/login/cancel`、`account/logout`、`item/fileChange/requestApproval`、`command/exec/terminate|resize`、`process/writeStdin|resizePty` 等此前弱覆盖的 thin RPC。验证通过：`/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json`（metrics: `compile_tokens=31835`、`instruction_count=15233`）和 `test_rpc_misc_parity.sh`。覆盖矩阵 SA focused tests 计数更新为 87。未发现新的 SA 编译器缺陷。
- 2026-05-29 thin RPC parity 二次对比修复：用 Deno `handlers.ts` 再反查 response shape，并实际跑 Deno `27787` vs SA `28080` 的小范围结构对比，发现两处剩余差异：`mock/experimentalMethod` 在 Deno 会原样回显任意 `params.value`，SA 只按字符串/缺失返回；`feedback/upload` 在 Deno 返回 `String(params.threadId ?? '')`，SA 固定空字符串。本轮在 `sa/main.sa` 中把 `send_rpc_mock_experimental` 改为 SA std JSON DOM 解析并 raw append 任意 JSON value，缺失/null 语义保持 `null`；`feedback/upload` 改为复用 threadId 提取响应 builder。扩展 `sa/tests/test_rpc_misc_parity.sh`，覆盖 object/array/null 混合值回显和 feedback threadId。验证通过：`/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json`（metrics: `compile_tokens=31978`、`instruction_count=15303`）、`test_rpc_misc_parity.sh`，以及 16 个 case 的 Deno-vs-SA thin RPC 结构对比。未发现新的 SA 编译器缺陷；本轮修的是 SA 业务层 RPC parity。
- 2026-05-29 string `threadId` 状态模型根因修复：深度对比 Deno stateful RPC 后确认 SA 根因不是单个 handler 缺字段，而是 state 只保存内部 `u64` thread id，无法保留/解析客户端传入的字符串 `threadId`。本轮扩展 `sa/src/state.sai`/`state.sa` 的 thread slot，新增 `THR_KEY_LEN/THR_KEY`、`state_thread_create_with_key`、`state_thread_find_by_key`，并让 `thread/start` 保存外部 key；所有 stateful RPC 改为先用外部 string key 查 state，找不到再按 numeric id 兼容旧路径。序列化层新增 thread id helper，让 `thread.id`、`sessionId`、`forkedFromId`、`thread/loaded/list`、archive/name/goal/inject 等短响应都返回外部 string id。第二个连带根因是 turn serializer 仍硬编码 `items:[]`，已改为从 `TURN_ITEMS` 输出真实 JSON array，修复 `turn/start` 与 `thread/turns/list` 丢 input items。第三个实际客户端路径缺口是 `/v1/responses` 的 `thread-id` header 只按数字解析，已改为先查外部 key，使 goal/code/default continuation 能用 string thread id 从 state 找到 turn mode。顺带修正 `J_LOADED_LIST_B_LEN` 少 1 导致 `thread/loaded/list` JSON 少右花括号的问题，并修复 `test_responses_turn_context_goal_continuation.sh` 用 subshell 启动 SA 导致清理不到真实 `hubproxy` 进程、泄漏临时 AUTH 服务的问题。新增 `sa/tests/test_thread_string_id_lifecycle.sh` 覆盖 start/read/loaded/name/archive/unarchive/goal/turn items/inject/fork 的 string id 生命周期。Focused 验证通过：`/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json`（metrics: `compile_tokens=32930`、`instruction_count=15773`）、`/home/vscode/.sa/bin/sa build tests/test_state.sa -o tests/test_state --json && ./tests/test_state`、`tests/test_thread_string_id_lifecycle.sh`、`tests/test_responses_turn_context_goal_continuation.sh`、`tests/test_turn_items_list.sh`。本轮未发现新的 SA 编译器缺陷；修复点在 HubProxy SA 状态模型和业务序列化。
- 2026-05-29 stateful parity 批量修复：继续用 Deno `handlers.ts` 与 focused 探针对比后，确认三类剩余状态差异：`thread/metadata/update` 丢 `gitInfo`，`thread/fork` 没继承 `gitInfo` 且响应序列化仍用空 preview/name，`thread/unarchive` 返回时不应包含已有 turns。已在 `sa/src/state.sai`/`state.sa` 扩展 thread slot 到 416 bytes，新增 `THR_GIT_PTR/THR_GIT_LEN/THR_GIT_SET` 和 `state_thread_set_git_info`、`state_thread_clear_git_info`、`state_thread_copy_git_info`；`sa/main.sa` 改为用 SA std JSON DOM 解析 `params.gitInfo`，通过 `sa_json_stringify` 保存原始 JSON，thread serializer 输出 `gitInfo` 对象或 `null`。`thread/fork` 现在复制 preview/name/gitInfo 后再从 state slot 序列化响应；`thread/unarchive` 保持 Deno 的 `{thread}` 且 `turns: []` 语义。构建阻塞根因也已修复：`apply_thread_git_info_from_body` 一度被插在 `send_rpc_thread_metadata_update` 的 `L_META_NOT_FOUND` 标签前，导致该错误分支落进新 helper，flatten 后出现 `UnknownRegister missing`；已把 helper 移到完整函数之后。按最新测试策略改为 SA 原生 `@test`：`sa/tests/unit_tests.sa` 覆盖 metadata gitInfo 持久化、clear、fork 继承 preview/name/gitInfo 和 string thread id lookup；`sa/tests/model_list_contract_test.sa` 覆盖 `model/list` raw upstream models list，以及 `plugin/installed`、`plugin/skill/read`、`plugin/install`、`configRequirements/read`、`app/list` 的 thin response shape。Focused 验证通过：`/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json`（metrics: `compile_tokens=33570`、`instruction_count=16087`）、`/home/vscode/.sa/bin/sa test tests/unit_tests.sa --jobs 1`、`/home/vscode/.sa/bin/sa test tests/model_list_contract_test.sa --jobs 1`、`/home/vscode/.sa/bin/sa build tests/test_state.sa -o tests/test_state --json && ./tests/test_state`、`tests/test_thread_string_id_lifecycle.sh`、`tests/test_turn_items_list.sh`、`tests/test_responses_turn_context_goal_continuation.sh`、`tests/test_rpc_misc_parity.sh`、`tests/test_thread_start_fork_param_overrides.sh`。运行态已重启：SA `hubproxy` 监听 `0.0.0.0:28080`，Deno 仍监听 `0.0.0.0:27787`；`/healthz` 返回 `{"ok":true}`；带 `.env` 的 `AUTH` 向 `127.0.0.1:28080/v1/chat/completions` 发送 OpenAI chat 形状请求返回 HTTP 200，`object=chat.completion`，assistant content 为 `SA_PROXY_OK`。本轮没有发现新的 SA 编译器/插件系统缺陷；用到的是已安装 SA std JSON DOM/stringify 能力，缺口在 HubProxy SA 状态与序列化层。
- 2026-05-29 RPC standard JSON whitespace 根因修复：用 Python 默认 `json.dumps` 同时打 Deno `27787` 和 SA
  `28080` 时发现，SA 的 `thread/start`、`thread/read`、`thread/metadata/update`、`thread/goal/set` 等状态 RPC
  会把 `id` 读成 `null`、`threadId/modelProvider/cwd/objective/tokenBudget` 全部丢失。根因不是单个 handler，而是
  `sa/main.sa` 在 `/rpc` 入口直接把原始 body 交给大量 `rpc_extract_*` byte-scan helper，这些 helper 只识别
  `"key":"value"` 或 `"id":1`，不接受合法 JSON whitespace，如 `"key": "value"`。本轮在 RPC 入口新增
  `rpc_canonicalize_body`：先用安装态 SA std `sa_json_parse` 解析原始 body，再用 `sa_json_stringify` 转成 canonical
  compact JSON，后续现有 extractor 全部读取 canonical body；解析失败时回退原 body，保持错误路径行为。这样一次覆盖
  JSON-RPC `id`、string params、number params、array params 和 boolean flag 的空白问题。顺带修复 Deno parity 的
  envelope 差异：`thread/start`、`thread/fork`、`thread/resume` 顶层响应现在从 RPC params 回显
  `approvalPolicy`、`approvalsReviewer`、`sandbox`，缺省仍是 `never/user/danger-full-access`。新增/扩展 SA 原生
  `@test`：`sa/tests/model_list_contract_test.sa` 的
  `rpc accepts standard JSON whitespace and preserves params` 真实请求 `28080`，用带空格 body 覆盖
  string `threadId`、model/cwd/provider、`ephemeral:false`、id 回显、goal objective/budget，以及
  approval/reviewer/sandbox 回显。Focused 验证通过：
  `/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json`（metrics:
  `compile_tokens=33972`、`instruction_count=16282`）、
  `/home/vscode/.sa/bin/sa test tests/model_list_contract_test.sa --jobs 1`、`tests/test_thread_start_fork_param_overrides.sh`、
  `tests/test_thread_resume_envelope.sh`，以及 Python 默认 JSON probe。最终已恢复 SA `hubproxy` 监听
  `0.0.0.0:28080`，Deno 仍监听 `0.0.0.0:27787`。本轮没有发现新的 SA 编译器缺陷；这是 HubProxy RPC 入口
  canonicalization/root-cause 修复。
- 2026-05-30 继续收口 thread 生命周期回归：在上一轮 whitespace canonicalization 后，补齐 SA native
  `@test` 覆盖 `thread/fork` 与 `thread/resume`，避免这些 envelope 只靠 shell 回归。`model_list_contract_test.sa`
  现在覆盖 `thread/start` / `thread/fork` 的 `approvalPolicy`、`approvalsReviewer`、`sandbox` 回显，以及
  `thread/resume` 的默认值 `never/user/danger-full-access`。真实验证通过：`/home/vscode/.sa/bin/sa test
  tests/model_list_contract_test.sa --jobs 1`；运行态重启后 `/healthz` 返回 `{"ok":true}`，`thread/start` 与
  `thread/fork` 在 `28080` 的真实响应都回显了覆盖值，`thread/resume` 回显了默认值，`codex exec "hello"`
  也在 SA provider 上返回正常 assistant 回复。这个回归主要是在已安装 SCI ReleaseFast 包重新落地后完成的。
- 2026-05-30 `thread/shellCommand` warning SSE 回归：Deno 端在执行 shell 命令时会发 `warning` 事件，消息必须是
  `shell command queued: ${command}`，并且携带 `threadId`。SA 之前在 `send_rpc_thread_shell_command`
  里把 warning 拼成了 JSON 片段，导致事件内容和 Deno 不一致。本轮改为直接用纯文本前缀
  `shell command queued: ` + 原始 `command`，交给 `state_emit_warning` 统一包装 SSE 帧；同时新增
  `sa/tests/unit_tests.sa` 的 `state_tracker warning notification frame includes message and threadId`，
  直接断言 `event: warning`、`message` 和 `threadId` 的完整通知帧。验证通过：
  `/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json`、`/home/vscode/.sa/bin/sa test tests/unit_tests.sa --jobs 1`、
  `tests/model_list_contract_test.sa --jobs 1`，以及真实运行态 `/healthz`、`codex exec --config model_provider=sa --config model="mimo-v2.5-pro" "hello"` 和 `/events` 上的 warning 事件。
- 2026-05-29 HTTP contract 收口复核：`sa/tests/test_http_contract.sa` 仍有几处旧断言落后于当前 Deno/SA 行为，
  包括 `/v1/responses` fallback 不返回顶层 `model` 字段、`initialize` 已返回 runtime info 而不是旧
  `protocolVersion/serverInfo` 形状、`attestation/generate` 和 `thread/realtime/start` 使用动态 UUID、
  `thread/inject_items` 对 `[{}]` 返回 `injectedCount:1`，以及 `memory/reset` 后不能继续依赖旧线程。已修正
  合同测试：`thread/inject_items` 移到 `memory/reset` 前，动态字段改为稳定 shape 断言。本轮没有发现新的 SA
  编译器或 HTTP 插件缺陷，问题是测试合同过期和端口级 shell 测试不能并发。Focused 验证通过：
  `/home/vscode/.sa/bin/sa build tests/test_http_contract.sa -o tests/test_http_contract --json && ./tests/test_http_contract`、
  `/home/vscode/.sa/bin/sa test tests/model_list_contract_test.sa --jobs 1`、
  `tests/test_thread_start_fork_param_overrides.sh`、`tests/test_thread_resume_envelope.sh`、
  `tests/test_initialize_runtime_info.sh`、`tests/test_attestation_uuid.sh`、`tests/test_inject_items_lifecycle.sh`。
  重新核对 Deno `handlers.ts` 与 SA `RPC_M_*` 方法集合：两边均为 115 个方法，差集为空。最终运行态：
  SA `hubproxy` PID `800100` 监听 `0.0.0.0:28080`，Deno PID `3666815` 仍监听 `0.0.0.0:27787`；`/healthz`
  返回 200；带 `.env` 的 `AUTH` 请求 `127.0.0.1:28080/v1/chat/completions` 返回 HTTP 200
  `chat.completion`；Python 默认 `json.dumps` JSON-RPC whitespace probe 通过；`codex exec --config model_provider=sa --config model=mimo-v2.5-pro "hello"`
  成功返回正常 assistant 回复。
- 2026-05-29 Responses chat fallback request 根因收口：确认 `build_chat_fallback_body` 已只调用 SCI std
  `sa_deno_responses_chat_fallback_request`，旧业务层 tool-history fallback 构造函数和只服务它的
  `CHAT_FB_A/B/SYS/USER/C`、`CHAT_FB_TOOL_HIST_*`、`CHAT_FB_TOOLS_OPEN`、`CHAT_FB_STREAM_END`
  常量已删除；保留的 `append_chat_fallback_tool_dom*` 仍被 direct chat proxy tools 归一化路径使用。
  第一次删除后 `test_responses_fallback_tool_history.sh` 暴露真实差异：tool output message 缺少 Deno
  兼容的 `name` 字段。根因修在 SCI std：`sa_deno_responses_chat_fallback_request` 现在先收集
  input 中 `call_id -> tool name`，当 `function_call_output` 没有显式 `name` 时继承前序 call name。
  已补 SA 原生 `@test` 覆盖顶层字符串 `input` fallback 和 responses-only 字段剥离。安装与验证：
  `zig test tests/std_smoke_core.zig --test-filter "sa_std Deno responses chat fallback request"` 通过；
  `/home/vscode/projects/sci/tools/install.sh --dir /home/vscode/.sa --no-shell` ReleaseFast 安装完成；
  `/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json` 通过（metrics:
  `compile_tokens=32878`、`instruction_count=15744`，相比删除前 16055 有下降）；focused 回归通过：
  `/home/vscode/.sa/bin/sa test tests/responses_chat_fallback_request_test.sa --jobs 1`、
  `tests/test_responses_fallback_capture.sh`、`tests/test_responses_fallback_strips_responses_only_fields.sh`、
  `tests/test_responses_fallback_tool_history.sh`、`tests/test_responses_fallback_json_tool_call.sh`、
  `tests/test_responses_fallback_json_tool_only.sh`。运行态已重启：SA `hubproxy` PID `842988` 监听
  `0.0.0.0:28080`，Deno PID `3666815` 仍监听 `0.0.0.0:27787`；`/healthz` 返回 200；
  `/v1/models` 返回 HTTP 200 模型列表；带 `.env` 的 `AUTH` 请求
  `127.0.0.1:28080/v1/chat/completions` 返回 HTTP 200 真实 `chat.completion`；`codex exec --config model_provider=sa --config model=mimo-v2.5-pro "hello"`
  成功返回正常 assistant 回复。本轮没有发现新的 SA 编译器缺陷；发现的是 SCI std Deno fallback
  行为缺口，已根因修复并安装。
- 2026-05-29 HubProxy SA 死代码清理与 SCI verifier 根因修复：继续清理 `sa/main.sa` 中已被 SCI std/JSON
  路径取代的旧 helper。已删除固定 `id:1` 的旧 JSON-RPC wrapper、旧 nullable/tail wrapper、旧
  `rpc_extract_json_string_after`、旧 `json_stream_extract_top_string`、旧 `chat_sse_is_progress_stop`、
  `notify_thread_started` wrapper 以及对应未使用常量。构建规模从上一轮 `compile_tokens=32878`、
  `instruction_count=15744` 降到 `compile_tokens=32102`、`instruction_count=15363`。删除
  `__hubproxy_import_sentinel` 时暴露 SCI verifier 根因缺陷：末尾 bodyless `@extern` 会被错误执行
  参数泄漏检查，报 `sa_http_client_free(^client)` 的 `MemoryLeak`。已在 SCI `src/verifier.zig` 根因修复并加
  `bodyless extern at end does not leak its signature parameters` 回归，ReleaseFast 安装到
  `/home/vscode/.sa` 后，HubProxy 已在无 sentinel 状态下一键构建成功。Focused 验证通过：
  `zig test src/verifier.zig --test-filter "bodyless extern at end"`、
  `/home/vscode/.sa/bin/sa test tests/model_list_contract_test.sa --jobs 1`、
  `/home/vscode/.sa/bin/sa test tests/responses_chat_fallback_request_test.sa --jobs 1`、
  `tests/test_thread_start_fork_param_overrides.sh`、`tests/test_thread_resume_envelope.sh`、
  `tests/test_responses_fallback_tool_history.sh`。运行态已重启：SA `hubproxy` PID `875631` 监听
  `0.0.0.0:28080`，Deno PID `3666815` 仍监听 `0.0.0.0:27787`；`/healthz` 返回 200；带 `.env` 的
  `AUTH` 请求 `127.0.0.1:28080/v1/chat/completions` 返回 HTTP 200 `chat.completion`；
  `codex exec --config model_provider=sa --config model=mimo-v2.5-pro "hello"` 正常返回
  `Hey! How can I help you today?`。
- 2026-05-29 继续删除旧 thread/start wrapper：调用图审计发现 `send_rpc_thread_start` 已无任何调用点，
  当前 `thread/start` 与 `thread/fork` 都走 `send_rpc_thread_start_with_values`，并从 state 中序列化
  model/modelProvider/cwd/ephemeral/string thread id。旧 wrapper 仍读取 `cfg_ptr` 并把 `cfg_ptr` 误传到
  `send_rpc_thread_start_with_values` 的 `state_ptr` 参数，虽然死代码不影响运行，但保留会误导后续维护并增加
  生成指令。已删除该 wrapper。重建 `/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json` 通过，规模从
  `compile_tokens=32102`、`instruction_count=15363` 降到 `compile_tokens=32065`、
  `instruction_count=15345`。Focused 验证通过：`tests/test_thread_start_fork_param_overrides.sh`、
  `tests/test_thread_resume_envelope.sh`、串行重跑
  `/home/vscode/.sa/bin/sa test tests/model_list_contract_test.sa --jobs 1`。注意：本轮曾把
  `model_list_contract_test.sa` 和会杀/重启 `28080` 的 shell 测试并行执行，导致一次 0/3 假失败；串行启动
  SA 后全部通过。运行态已重启：SA `hubproxy` PID `886884` 监听 `0.0.0.0:28080`，Deno PID `3666815`
  仍监听 `0.0.0.0:27787`；`/healthz` 返回 `{"ok":true}`；带 `.env` 的 `AUTH` 请求
  `127.0.0.1:28080/v1/chat/completions` 返回 HTTP 200 `chat.completion`。
- 2026-05-29 继续收口 HubProxy SA 死定义：上一轮删除旧固定 JSON-RPC/response 常量后，仍残留只引用已删除
  `@const` 的 `_LEN` 定义，包括旧 budget/account/config/unsubscribe/init/remote/feedback/config-write 响应长度和
  旧 tool-call/gitInfo key 长度。本轮已删除这些悬挂 `#def`，避免无用符号继续污染审计和生成规模。重建
  `/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json` 通过，metrics 为
  `compile_tokens=32039`、`instruction_count=15345`。Focused 验证串行通过：
  `tests/test_thread_start_fork_param_overrides.sh`、`tests/test_thread_resume_envelope.sh`、
  `/home/vscode/.sa/bin/sa test tests/model_list_contract_test.sa --jobs 1`、
  `/home/vscode/.sa/bin/sa test tests/responses_chat_fallback_request_test.sa --jobs 1`。真实上游冒烟：
  临时启动 SA 后请求 `127.0.0.1:28080/v1/chat/completions`，带 `.env` 的 `AUTH` 返回 HTTP 200
  `chat.completion`，assistant content 正常；`codex exec --config model_provider=sa --config model="mimo-v2.5-pro" "hello"`
  通过 SA provider 返回 `Hello! How can I help you today?`。本轮没有发现新的 SA 编译器/HTTP 插件根因缺陷；
  发现的问题是 HubProxy SA 旧常量清理未完成，以及后台启动在 Codex 短命令会话里不可靠，测试和 smoke 需在同一
  长命令生命周期内持有进程或使用项目 `restart.sh`。
- 2026-05-29 HubProxy SA 死定义第二批收口：继续用符号引用审计删除全文件只声明一次的旧 fallback/RPC/event
  固定片段，包括旧 chat fallback SSE 固定帧、旧 progress continuation 固定片段、旧 model list 固定结果、
  旧 remote/external/process/tool 固定响应、旧 request key 和旧 realtime event 空 payload 片段及其 `_LEN`。
  删除后重建 `/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json` 通过，metrics 为
  `compile_tokens=32000`、`instruction_count=15345`。Focused 验证通过：
  `/home/vscode/.sa/bin/sa test tests/responses_chat_fallback_request_test.sa --jobs 1`、
  `tests/test_thread_start_fork_param_overrides.sh`、`tests/test_thread_resume_envelope.sh`，以及在同一命令生命周期
  临时启动 28080 后串行跑
  `/home/vscode/.sa/bin/sa test tests/model_list_contract_test.sa --jobs 1`。追加验证：
  `/home/vscode/.sa/bin/sa test tests/unit_tests.sa --jobs 1`、`tests/test_rpc_misc_parity.sh`、
  `/home/vscode/.sa/bin/sa build tests/test_http_contract.sa -o tests/test_http_contract --json && ./tests/test_http_contract`
  均通过。重新跑零引用常量/长度审计已无输出；Deno `handlers.ts` 与 SA `RPC_M_*` 方法集合仍均为
  115 个，差集为 0。最终用 `setsid -f` 启动当前 SA 二进制，SA PID `926244` 监听 `0.0.0.0:28080`，
  Deno PID `3666815` 仍监听 `0.0.0.0:27787`；`/healthz` 返回 `{"ok":true}`；
  `codex exec --config model_provider=sa --config model="mimo-v2.5-pro" "hello"` 返回
  `Hi! How can I help you today?`。
- 2026-05-29 JSON-RPC params string literal 根因修复：继续审计 RPC 参数处理时发现，`environment/add`
  和 `review/start` 这类路径如果继续用 byte-scan helper，会在合法 JSON 转义字符串中把 `\"` 当成结束引号，
  例如 `name:"env \"quoted\""` 或 `path:"/tmp/a\\b"` 会被截断或错误转义。根因不在 SA 缺 JSON，
  而是业务层旧 extractor 绕开了 SA std JSON DOM。已在 SCI `libsa_std` 新增
  `sa_deno_jsonrpc_params_string_literal`，返回已正确 JSON-escaped 的 string literal 或 `null`/fallback；
  安装到 `/home/vscode/.sa` 后，`sa/main.sa` 的
  `rpc_builder_append_params_string_or_default` / `rpc_builder_append_params_string_or_null` 已改为薄包装 std helper，
  不再在 HubProxy 里展开完整 parse/get/stringify 逻辑。新增/扩展回归：
  SCI `zig test tests/std_smoke_core.zig --test-filter "JSON-RPC params string literal"` 覆盖 escaped quote、
  backslash、missing/null/invalid JSON；HubProxy `sa/tests/model_list_contract_test.sa` 覆盖真实 `/rpc`
  escaped params 响应。构建与验证：`/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json`
  通过，metrics 为 `compile_tokens=32143`、`instruction_count=15414`；串行通过
  `sa test tests/model_list_contract_test.sa --jobs 1`、`sa test tests/unit_tests.sa --jobs 1`、
  `sa test tests/responses_chat_fallback_request_test.sa --jobs 1`、`tests/test_rpc_misc_parity.sh`、
  `tests/test_thread_start_fork_param_overrides.sh`、`tests/test_thread_resume_envelope.sh`、
  `sa build tests/test_http_contract.sa -o tests/test_http_contract --json && ./tests/test_http_contract`。
  运行态已按用户指定启动入口用 `setsid -f ./restart_sa.sh > /tmp/hubproxy_sa_restart/restart_sa.log 2>&1 < /dev/null`
  拉起，实际入口仍是 `restart_sa.sh`；SA PID `975951` 监听 `0.0.0.0:28080`，Deno PID `975585`
  监听 `0.0.0.0:27787`。`/healthz` 返回 200；带 `.env` `AUTH` 的 OpenAI chat curl 到
  `127.0.0.1:28080/v1/chat/completions` 返回 HTTP 200，assistant content 为
  `Hello! How can I assist you today?`；`codex exec --config model_provider=sa --config model="mimo-v2.5-pro" "hello"`
  正常返回 `Hey! How can I help you today?`。注意：`restart_sa.sh` 本身会前台 `exec ./hubproxy`，
  在 Codex 短命令里普通 `nohup ./restart_sa.sh &` 仍可能随工具进程组结束被清理；长期运行时应以
  独立 session 启动该脚本，而不是绕过脚本直接启动 `./hubproxy`。

## 已确认的上下文压缩保险（Deno 版本）

- `compactAndRetryOnOverflow` 原本只做“summary + 最后一轮用户消息”压缩重试；当上游仍返回
  maximum-context-length 400、或 `compressRequestsBodyForRetry` 无法再缩小时，会直接把 400
  透传给客户端，远程超额提示仍会偶发。
- 新增保险：当 `HUBPROXY_NVIDIA_COMPAT=true` 且 `HUBPROXY_CONTEXT_WINDOW_TOKENS` 配置了上限时，
  如果 summary 压缩重试后仍 overflow，会调用 `retryTrimmedOnOverflow`：把对话按“每条 role=user
  消息”切分成 turn 组，保留前 3 轮 + 最后 3 轮，中间插入一条 `developer`/`system` notice
  `[hubproxy] Middle turns ...`，并用 `chars/4` 估算确认修剪后的体仍小于配置上下文上限后才重试。
- `splitConversationTurns` 同时识别 responses 样式（`type:'message'`）与 chat 样式（只有 `role`）
  两种消息体；`trimBodyToWindowEdges` 对 `messages[]` 与 `input[]` 都生效；轮次 ≤ 6 或修剪后体没有
  变小时返回 null，不触发无谓重试。
- 该保险仅在 `nvidiaCompat` 开启、且估算后仍小于窗口时生效；关闭或窗口未配时行为完全不变。
