# HubProxy 重构实施计划 (SA-ASM Reconstruction Plan)

经过对当前 SA (Safe Assembly) 语言编译器内核、动态插件系统及 `hubproxy` 现有 Deno 源码的深度评估，结论是：**完全可以使用 SA 语言重构此项目。**

SA 现已具备完整的 HTTP 服务端监听、HTTP 客户端代理、精细化文件系统 I/O、SQLite 数据库插件以及流式 FFI 异步转发能力。虽然 SA 的扁平所有权与显式资源释放防泄露语法在编写复杂 JSON-RPC 编解码时相较于 TypeScript 显得更为严密和繁琐，但通过模块化契约设计，SA 重构后将获得更优的并发性能、极低且确定的内存占用，以及强悍的零信任沙箱安全性。

以下为 HubProxy 用 SA 语言进行全面重构的架构与分步实施计划。

---

## 🛠 架构设计方案 (Architectural Design)

### 1. 技术栈选型
* **HTTP 服务端 (Inbound)**：使用 `sa_plugin_http_server` 插件，启动本地监听服务，拦截来自 IDE (如 Codex、Claude CLI) 的出站网络请求。
* **HTTP 客户端 (Outbound)**：使用 `sa_plugin_http_client` 插件，处理面向 OpenAI/Anthropic 或本地 Mock 端点 (`responses_scenario`) 的反向代理出站。
* **状态持久化 (State Storage)**：摒弃原本 Deno 在磁盘写入 JSON 文件的模式，改用 `sa_plugin_db` SQLite 数据库插件，通过高安全性、高事务性的 SQL 实现 Session、Thread、Turn 及 Goal 状态管理的原子化存储。
* **异步并发网络 Reactor**：依托标准库的 `sa_std/libsa_async.sa` 与 `sa_netx` 的 `io_uring` 多路复用反应器模型，承载高并发的反向代理连接，避免同步阻塞。
* **JSON 处理模块**：借助标准库中 `sa_std/encoding/json.sai`，实现 JSON-RPC 请求与 LLM payload 的高性能流式解析与拼接。

---

## 📋 重构任务清单 (TODOS)

### 🟩 Phase 1: 基础建设与环境加载 (Environment & Preflight)
* [ ] **创建 SA 项目结构**：
  * 创建 `sa.mod`，并声明细粒度系统调用特权（如 `grants: ["fs_read", "fs_write", "net_rx", "net_tx"]`）。
  * 引入 `sa_std` 依赖和对应插件的 `.sai` 声明文件。
* [ ] **配置读取模块重构**：
  * 使用 `sa_std/env.sai` 加载 `.env` 配置环境。
  * 构建 SA 侧的 `ProxyConfig` 结构体，支持 `PORT`、`HOST`、`AUTH_TOKEN`、`DEFAULT_MODEL`、`DATA_DIR` 等参数的安全加载。

### 🟩 Phase 2: 状态机与持久化数据库重构 (State & DB Persistence)
* [ ] **SQLite 数据库 schema 设计**：
  * 设计 `threads`、`turns` 和 `goals` 关系数据库表结构。
* [ ] **重构 `HubState` 模块**：
  * 用 SA 契约封装 `sa_plugin_db` 调用。
  * 实现 `thread_create`、`thread_update_status` 接口。
  * 实现 `turn_append_item` 与 `goal_record` 数据的高并发安全写入。

### 🟩 Phase 3: 并发反向代理核心构建 (Airlock Proxy Core)
* [ ] **双向流式代理机制**：
  * 用 `sa_http_server_accept` 接收来自开发工具的请求。
  * 提取 HTTP 协议头，如 `thread-id`、`x-codex-turn-metadata` 校验令牌。
  * 调用 `sa_http_client_req_send` 向真实的 LLM 服务转发。
* [ ] **双向零拷贝流式转发 (SSE/Chunked Streaming)**：
  * 用 `sa_http_client_resp_read_chunk` 从出站流中获取 chunk 报文。
  * 实时调用 `sa_http_server_resp_stream_write` 与 `sa_http_server_resp_stream_flush` 对接回原浏览器连接，保障 SSE 大模型打字机流式输出的即时透传。

### 🟩 Phase 4: 中间件与协议过滤器重构 (JSON-RPC & API Filters)
* [ ] **JSON-RPC 请求拦截中间件**：
  * 利用 `sa_json_stream` 提取请求体，判断是否是目标定义或预算调整指令。
  * 拦截 `chat/completions`，并对大模型返回数据中消耗的 tokens 进行解包计算，实时累加并持久化到 Goal 预算额度中。
  * 当 Goal Token 消耗超出预算时，FFI 拦截器直接组装 `rpcError` 状态码返回，阻断超额请求。

### 🟩 Phase 5: 测试验证与性能测试 (Verification & Benchmarking)
* [ ] **单元测试移植**：
  * 将 `handlers_test.ts` 与 `proxy_test.ts` 中的用例在 `tests/` 目录下用 SA 的 `@test` 原生测试套件进行重构。
* [ ] **端到端冒烟测试**：
  * 编译 native 代理执行文件：`sa build main.sa -o hubproxy.out`。
  * 配置 IDE 本地环境进行真实的代理测试，观察性能与内存水位。

---

## 🔒 零信任安全提升建议

在 Deno 原生实现中，程序直接暴露在系统环境中，容易受到上游恶意依赖或溢出的影响。重构为 SA 版本后，可将 HubProxy 封装为独立沙箱进程：
1. 限制该代理仅能向特定的 LLM 服务地址（如 `api.openai.com`、`api.anthropic.com`）发起连接，拦截一切其他出站连接（MITM/木马防御）。
2. 本地文件系统操作严格限制在特定的工作区目录 `fs_write:~/projects/hubproxy/data/` 之下，即使遭受到针对大模型的越权提示词注入（Prompt Injection）攻击，攻击者也绝对无法突破沙箱窃取主机的核心敏感文件。
