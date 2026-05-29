# HubProxy 重构实施计划 (SA-ASM Reconstruction Plan)

## 完成状态

### ✅ Phase 0: 项目脚手架 (Scaffolding)
- [x] `sa.mod` — 包清单，声明 sa_std 依赖和 http-client/http-server 插件
- [x] `sa/src/strings.sai/.sa` — 字节级字符串工具 (bytes_eq, bytes_find, bytes_find_byte, bytes_copy, bytes_to_u64)
- [x] `sa/src/config.sai/.sa` — .env 文件解析器，ProxyConfig 结构体
- [x] `sa/src/state.sai/.sa` — 内存状态管理 (threads, turns, goals)
- [x] 目录结构: `sa/src/`, `sa/data/`, `sa/tests/`

### ✅ Phase 1: 配置加载 + HTTP 服务骨架
- [x] `.env` 文件解析：PORT, HOST, AUTH_TOKEN, OPENAI_API_KEY, CHAT_BASE_URL, DEFAULT_MODEL, DATA_DIR, RESPONSES_BASE_URL
- [x] ProxyConfig 结构体在 SA 中的 alloc + store/load 表示
- [x] HTTP server 启动循环：sa_http_server_new → sa_http_server_start → sa_http_server_accept
- [x] 路径分发：/healthz, /readyz, /v1/chat/completions, /v1/responses, /v1/models, /rpc, /events
- [x] /healthz 和 /readyz 路由：返回 200 {"ok":true}

### ✅ Phase 2: 出站代理核心
- [x] 出站请求构造：sa_http_client_new(1) → sa_http_client_req_new → add_header → set_body → send
- [x] Authorization 和 Content-Type header 注入
- [x] 双向流式转发循环：sa_http_client_resp_read_chunk → sa_http_server_resp_stream_write → flush
- [x] 完整资源释放链：body_reader_free → resp_free → req_free → client_free → stream_free
- [x] /v1/chat/completions 路由：读取 body → 转发上游 → 流式回传
- [x] /v1/responses 路由：支持 RESPONSES_BASE_URL 回退到 CHAT_BASE_URL
- [x] /v1/models 路由：转发到上游 models endpoint

### ✅ Phase 3: JSON-RPC 框架 + 状态管理 + RPC 方法
- [x] send_rpc_json 辅助函数
- [x] JSON-RPC 方法分发（通过 body 中的 method 名称匹配）
- [x] 实现的 RPC 方法 (20+):
  - `initialize` — 返回协议版本和 capabilities
  - `thread/start` — 创建新线程
  - `thread/list` — 列出线程
  - `thread/read` — 读取线程
  - `thread/archive` — 归档线程
  - `thread/fork` — 分叉线程
  - `thread/resume` — 恢复线程
  - `thread/turns/list` — 列出线程的轮次
  - `turn/start` — 创建新轮次
  - `turn/interrupt` — 中断轮次
  - `thread/goal/set` — 设置目标
  - `thread/goal/get` — 获取目标状态
  - `thread/goal/clear` — 清除目标
  - `thread/loaded/list` — 返回当前已加载线程 id 列表
  - `thread/turns/items/list` — 返回 turn items 分页结构（当前 SA turn 模型 items 为空）
  - `memory/reset` — 返回 Deno 兼容 reset result
  - `hooks/list` — 从运行环境 `PWD` 生成 hook 列表响应
  - `account/read` — 读取账户信息
  - `model/list` — 列出模型
  - `configRequirements/read` — 读取配置需求
  - `thread/unsubscribe` — 取消订阅
  - `fs/readFile`, `fs/writeFile`, `fs/createDirectory`, `fs/getMetadata`, `fs/readDirectory`,
    `fs/remove`, `fs/copy` — 通过 SA std FS helper 执行真实 base64 文件读写、递归建目录、
    metadata JSON、目录枚举、递归删除和文件复制
- [x] 未匹配方法返回 method not found 错误

### ✅ Phase 4: Token 计量 + Auth 拦截器
- [x] `check_auth` 辅助函数：从 Authorization header 或 x-api-key 提取 token 并比较
- [x] 支持 "Bearer " 前缀自动剥离
- [x] 无 auth token 配置时放行所有请求
- [x] Auth 失败返回 401 {"error":"unauthorized"}
- [x] `scan_chunk_for_tokens` 辅助函数：扫描 SSE chunk 中的 "total_tokens" 字段
- [x] Token 累加器：在流式循环中累加 token 使用量
- [x] Token 使用日志输出

### ✅ Phase 5: /events SSE 端点
- [x] /events 路由：创建 SSE 流式响应
- [x] 初始 keepalive 注释发送
- [x] 长连接事件流：通过 SA std detached pthread 持有 HTTP request，持续 drain 状态通知环
- [x] RPC 状态变更通知：`thread/started`、`thread/status/changed`、`thread/archived`、
  `thread/closed`、`turn/started`、`turn/diff/updated`、`turn/plan/updated`、`turn/completed`、
  `thread/goal/updated`、`thread/goal/cleared`

### ✅ Phase 6: 测试
- [x] `tests/test_strings.sa` — 字符串工具单元测试 (6 个测试用例)
- [x] `tests/test_state.sa` — 状态管理单元测试 (6 个测试用例)
- [x] `tests/test_http_contract.sa` — SA HTTP client 插件真实请求 `28080`，覆盖 health/auth/RPC/FS contract，
  包括 `fs/getMetadata`、`fs/copy`、复制后读取、`fs/remove`、`thread/loaded/list`、
  `thread/turns/items/list`、`thread/inject_items`、`memory/reset`、`hooks/list`、runtime `initialize`、
  dynamic attestation/realtime shape 和 Responses fallback contract
- [x] `tests/test_events_contract.sh` — 连接 `/events` 后触发 `thread/start` 和 `turn/start`，
  断言同一 SSE 流收到 `thread/started` 与 `turn/started`

## 文件清单

| 文件 | 行数 | 说明 |
|------|------|------|
| `sa/main.sa` | 14975 | 入口 + HTTP 循环 + 路由 + RPC 分发 + 代理 |
| `sa/src/config.sa` | 689 | .env 解析 + ProxyConfig |
| `sa/src/state.sa` | 2417 | 内存状态管理 |
| `sa/src/strings.sa` | 292 | 字节级字符串工具 |
| `sa/tests/test_strings.sa` | 145 | 字符串测试 |
| `sa/tests/test_state.sa` | 389 | 状态测试 |
| **合计** | **18907** | |

## 构建与运行

```bash
# 编译
cd /home/vscode/projects/hubproxy/sa
sa build main.sa -o hubproxy

# 运行
./hubproxy

# 测试
sa run tests/test_strings.sa
sa run tests/test_state.sa
```

## 后续优化

- [x] 完善当前已接入 fs/* RPC 方法的实际文件 I/O 实现（read/write/createDirectory/getMetadata/readDirectory/remove/copy）
- [x] /events 长连接 + 通知推送
- [ ] SQLite 持久化状态（通过 sa_plugin_db）
- [x] JSON-RPC body 入口 canonicalize：`/rpc` 先用 SA std JSON parse/stringify 标准化合法 JSON whitespace，
  再交给既有 extractor；已覆盖 thread_id、turn_id、id、string/number/array/boolean params 的常见 RPC 路径。
  后续优化是继续把剩余业务 helper 从 byte-scan 迁到 JSON DOM/std facade，而不是功能缺口。
- [x] Deno/SA RPC 方法集合对齐：当前 Deno `handlers.ts` 与 SA `RPC_M_*` 均为 115 个方法，差集为空。
- [x] 继续补齐 Deno `handlers.ts` 剩余真实 RPC/state 细节：`thread/inject_items`
  已创建新 turn、保存 `params.items`、返回真实 injectedCount，并推送
  `item/started`、`rawResponseItem/completed`、`item/completed`；`thread/turns/items/list`
  已覆盖 `turn/start` 和 `inject_items` 新建 turn 的 items。
- [x] Responses request -> Chat fallback body 构造下沉到 SCI std `sa_deno_responses_chat_fallback_request`；
  HubProxy 旧 tool-history fallback builder 已删除，std helper 覆盖顶层字符串 input、responses-only 字段剥离、
  tool schema normalization 和 `function_call_output` 的 `call_id -> name` 继承。
- [x] 删除 HubProxy 旧无引用 helper 与 import sentinel workaround；SCI verifier 已根因修复末尾 bodyless
  `@extern` 误报 `MemoryLeak`，当前 `sa/main.sa` 无需 dummy trailing wrapper 即可构建。
- [x] 删除旧 `send_rpc_thread_start` wrapper；当前 thread/start 与 thread/fork 统一使用 state-aware
  `send_rpc_thread_start_with_values`，避免保留错误的 `cfg_ptr`→`state_ptr` 死路径。
- [x] 删除旧固定响应/旧 tool-call key 常量对应的悬挂 `_LEN` 定义；当前构建通过
  `compile_tokens=32039`、`instruction_count=15345`，并已通过 thread start/fork、thread resume、
  `model_list_contract_test.sa`、`responses_chat_fallback_request_test.sa`、真实 chat smoke 和 `codex exec "hello"`。
- [x] 第二批零引用旧常量收口完成；删除旧 fallback/RPC/event 固定片段后构建通过
  `compile_tokens=32000`、`instruction_count=15345`，零引用常量/长度审计已无输出。
- [x] JSON-RPC params string literal helper 下沉到 SCI std：`environment/add` 与 `review/start`
  不再用业务层 byte-scan 解析 `params` 字符串，改为调用安装态
  `sa_deno_jsonrpc_params_string_literal`，能正确保留 escaped quote/backslash，并返回已转义 JSON literal。
  当前 HubProxy 构建通过 `compile_tokens=32143`、`instruction_count=15414`；focused 验证已通过
  `model_list_contract_test.sa`、`unit_tests.sa`、`responses_chat_fallback_request_test.sa`、
  `test_rpc_misc_parity.sh`、`test_thread_start_fork_param_overrides.sh`、`test_thread_resume_envelope.sh`
  和 `test_http_contract.sa`。
- [x] 运行入口改为项目 `restart_sa.sh`：脚本从 `.env` 读取 `SA_PORT`，默认 `28080`，并杀掉该端口旧进程。
  长期后台服务需用独立 session 包住脚本，例如
  `setsid -f ./restart_sa.sh > /tmp/hubproxy_sa_restart/restart_sa.log 2>&1 < /dev/null`；
  不要直接绕过脚本启动 `sa/hubproxy`。最新验证中 SA 监听 `28080`，Deno 监听 `27787`，
  `/healthz`、OpenAI chat curl 和 `codex exec "hello"` 均通过 SA provider。
- [ ] Token 预算超限自动中断流式转发
- [ ] 并发连接支持（多线程 reactor）
