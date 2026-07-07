# ChatGPT 订阅 Token 批量导入 sub2api 使用指南

把 ChatGPT 网页登录的 session token(`accessToken`) 批量转成 sub2api 格式并导入,
借助 sub2api 内置的 backend-api 风控规避与多账号轮询,得到一个兼容 OpenAI 的稳定网关。

---

## 1. 背景:为什么不能直连 api.openai.com

ChatGPT 订阅账号的 OAuth `accessToken`:

- **不能直连** `https://api.openai.com/v1` —— 平台 API 网关要求 `api.model.read` 等
  平台 scope,而订阅 token 只有 `model.request` 等,直接 403。
- **不能裸 curl** `https://chatgpt.com/backend-api` —— Cloudflare 风控挡裸 HTTP,403。

所以这类 token 必须经过 sub2api / CLIProxyAPI 这类 "订阅转 API" 中转:
sub2api 内置了 backend-api 的 PoW/headers/会话处理,并做多账号轮询调度。

---

## 2. 前置条件

- sub2api 已用 Docker Compose 部署并运行(默认 `http://localhost:8080`)。
- 已有一个管理员账号(默认 `admin@sub2api.local`)。
- 已在后台给管理员充值一定余额(标准组走客户端计费,余额为 0 会返回
  `INSUFFICIENT_BALANCE`)。
- 已有一个 `platform=openai` 的分组(示例为 group id=2, name=test)。
- 本机已安装 `bun`(或 `node`)。

---

## 3. 原始 token 文件格式

把每个 ChatGPT 账号的 session JSON 保存为 `tokenN.json`,放在同一目录(例如
`~/projects/hubproxy/tokens/`)。每个文件至少包含:

```json
{
  "accessToken": "eyJhbGciOi...(JWT)",
  "sessionToken": "...",
  "expires": "2026-07-13T07:22:22.000Z",
  "account": { "id": "5e4c9b31-..", "planType": "k12" },
  "user": { "id": "user-...", "email": "xxx@gmail.com" }
}
```

字段缺失时会自动从 `accessToken` 的 JWT payload 补全 email / account_id /
user_id / plan_type / exp。

注意:
- 通常**没有** `refresh_token`,token 到期前(~10 天)需重新登录导出新 token,
  无法自动续期。
- `plan_type` 决定可调模型范围(示例为 `k12`)。

---

## 4. 脚本与用法

脚本位于 `~/projects/hubproxy/scripts/`:

| 文件 | 作用 |
|---|---|
| `session2sub2api.js` | 单文件格式转换: 原始 session → sub2api `{data:{accounts[]}}` |
| `import_tokens_to_sub2api.js` | 批量: 转换 + 登录 + 导入 + 可选绑组 |

### 一键批量导入

```bash
bun ~/projects/hubproxy/scripts/import_tokens_to_sub2api.js <tokens目录> [组ID]
```

- 第 1 参数:含 `token*.json` 的目录(默认 `~/projects/hubproxy/tokens/`)。
- 第 2 参数(可选):要绑定的分组 ID。不带则只导入不绑组(此时调度会报
  `503 no available accounts`,需自行在后台绑组)。

示例:

```bash
# 导入 hubproxy/tokens 下所有 token*.json 并绑定到组 2
bun ~/projects/hubproxy/scripts/import_tokens_to_sub2api.js \
    ~/projects/hubproxy/tokens 2
```

### 单文件转换(可选)

```bash
# 转换原始 session JSON 到 sub2api 导入包(写到 stdout 或第二个参数文件)
bun ~/projects/hubproxy/scripts/session2sub2api.js token1.json import.json
```

### 自定义连接参数(环境变量)

| 环境变量 | 默认 | 说明 |
|---|---|---|
| `SUB2API_BASE` | `http://localhost:8080` | sub2api 服务地址 |
| `SUB2API_DIR` | `/home/vscode/sub2api` | 部署目录(用于读 `.env` 取 PG 凭据 / admin 密码) |
| `ADMIN_EMAIL` | `admin@sub2api.local` | 管理员邮箱 |
| `ADMIN_PASS` | (自动) | 管理员明文密码; 优先级 1: `ADMIN_PASS` 环境变量; 2: `.env` 的 `ADMIN_PASSWORD=`(或 `ADMIN_PASS=`) 行; 3: sub2api 容器首次启动日志里的一次性密码 (`Generated admin password (one-time): ...`)。三者都拿不到、或登录 401 时, 若 `ADMIN_RESET_PASS` 已设置则自动重置(见下) |
| `ADMIN_RESET_PASS` | (空) | **忘掉旧 admin 密码时用**: 设为任意新明文, 脚本在登录失败时会通过 `docker exec sub2api-postgres psql` 用 pgcrypto 的 `crypt(pw, gen_salt('bf',10))` 直接 `UPDATE users.password_hash` 重置(Go bcrypt 校验 `$2a$10$` 哈希正常), 然后把新密码同步写回 `.env` 的 `ADMIN_PASSWORD=` 行, 再重试登录。一行命令同时完成「改密 + 导入」, 下次无需再传 |
| `PG_CONTAINER` | `sub2api-postgres` | PG 容器名, 仅在 `ADMIN_RESET_PASS` 自动改密时使用; 非 docker-compose 默认部署需改 |

> 自动改密前提: `sub2api-postgres` 容器可 `docker exec` 访问, 且 `.env` 里有 `POSTGRES_USER` / `POSTGRES_DB`(密码重置会用); pgcrypto 扩展脚本会按需 `CREATE EXTENSION IF NOT EXISTS pgcrypto`。

---
| `SUB2API_BASE` | `http://localhost:8080` | sub2api 服务地址 |
| `SUB2API_DIR` | `/home/vscode/sub2api` | 部署目录(用于读 `.env` 取密码) |
| `ADMIN_EMAIL` | `admin@sub2api.local` | 管理员邮箱 |
| `ADMIN_PASS` | (自动) | 管理员密码; 优先 `.env` 的 `ADMIN_PASSWORD=`, 回退取容器日志一次性密码 |

---

## 5. 导入流程(脚本内部做的事)

1. 读取目录下所有 `token*.json`。
2. 逐个调用 `session2sub2api.js` 转成 sub2api `{accounts[]}` 结构。
3. 本批内按 `access_token` 去重(同 token 只入一次)。
4. 合并成 `{data:{exported_at, proxies:[], accounts}}`。
5. 登录 sub2api 拿管理员 JWT。
6. `POST /api/v1/admin/accounts/data` 导入(后端按身份指纹 access_token sha256
   + userID + email 去重,已有则跳过/更新,可重复执行)。
7. 若指定组 ID:把所有 `platform=openai && type=oauth` 的账号 `bulk-update`
   绑到该组。

预期输出:

```
[OK] 合并去重后 N 个账号
[OK] 已登录 sub2api (admin)
[导入] account_created=N account_failed=0 proxy_created=0
[绑组] success=M failed=0
[DONE]
```

---

## 6. 客户端使用

导入并绑组后,即可当作标准 OpenAI 兼容网关使用:

- **Base URL**: `http://localhost:8080/v1`
- **API Key**: 在 sub2api 后台「我的 API 密钥」创建的 `sk-...`
  (示例: `sk-3917c5a5b0497c5191a115b675458fc5d423edde2604a035c3ffa537d5220797`)
- **模型**: 账号 plan 允许的模型,例如 `gpt-5.4`

curl 验证:

```bash
curl http://localhost:8080/v1/chat/completions \
  -H "Authorization: Bearer <你的sk-key>" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-5.4","messages":[{"role":"user","content":"hi"}],"stream":false}'
```

---

## 7. 多账号轮询(LRU 调度)

sub2api 对组内多 openai oauth 账号自动负载均衡,核心机制(`gateway_service.go`):

- **LRU 优先**(`PreferLeastRecentlyUsed`):每次选最久未用的账号,自然轮询。
- **并发槽位**(每个账号 `concurrency`,来自导入时默认 10):满了跳下一个。
- **会话粘连**(sticky session):同一 `client_request_id` 会粘到同一账号。
- **限额自动暂停**(5h / 7d quota):某账号触发额度自动 pause,自动切别的。
- **失败重试**(`excludedIDs`):当前账号失败则排除重选下一个(fallback)。

实测连发 5 次请求,`account_id` 依次为 2 → 5 → 7 → 6 → 7,
确实在多账号间轮换。

---

## 8. 常见问题排查

| 现象 | 原因 / 解决 |
|---|---|
| `403 INSUFFICIENT_BALANCE` | 标准组走客户端计费,管理员余额为 0; 在后台给管理员充值。 |
| `503 Service temporarily unavailable` / `no available accounts` | 账号没绑组, 或组内无 active+schedulable 账号; 用脚本第 2 参数绑组, 或后台绑组。 |
| `401 invalid management key` | 浏览器登录管理后台时填了哈希值; 填明文密码(初始密码见容器日志 `Generated admin password (one-time)`)。 |
| 导入报 `access_token 已过期` | token 的 JWT `exp` 已过; 重新登录导出新 token。 |
| 轮询没生效、总卡同一个号 | 会话粘连所致; 不同客户端/不同会话天然会切账号。 |
| 某账号失效拖累轮询 | 后台对每个账号跑一次「凭证测试」, 失效的禁用或删除。 |

---

## 9. 文件参考

- 原始 token 示例: `~/projects/hubproxy/tokens/token1.json`
- 转换脚本: `~/projects/hubproxy/scripts/session2sub2api.js`
  (移植自 `~/projects/GPTSession2CPAandSub2API/docs/index.html` 的 sub2api 输出逻辑)
- 批量导入脚本: `~/projects/hubproxy/scripts/import_tokens_to_sub2api.js`
- sub2api 源码: `~/projects/sub2api/backend`(Go)
- 格式转换参考(在线工具): https://gtxx3600.github.io/GPTSession2CPAandSub2API/

---

## 10. 重要提醒

- ChatGPT OAuth token **无 refresh_token**,到期前需重新登录导出;
  sub2api 对到期账号会按 `auto_pause_on_expired` 自动停止调度。
- 这些 token 只能经 sub2api 等中转, **不能** 直连 `api.openai.com`,
  也 **不能** 拿去 Playwright 直开 chatgpt.com(那是网页会话 cookie,
  与 API `accessToken` 不是一回事)。
- `sk-` API key 是 sub2api 自签的客户端凭证, **不是** OpenAI 平台 key,
  仅用于调本网关 `http://localhost:8080/v1`。

---

# 附录:实操细节(下次复现必读)

> 以下记录本次完整的部署/调试过程、踩坑、精确参数与命令,供后续会话复现或迁移时直接照搬。

## A1. 本次实测环境(机器状态)

- 工程 TUI 目录: `/home/vscode/projects/hubproxy`
- ChatGPT tokens 目录: `/home/vscode/projects/hubproxy/tokens/`
  (本次实际有 `token1.json` ~ `token6.json`,6 个文件,均为 ChatGPT k12 订阅)
- sub2api 部署目录: `/home/vscode/sub2api`
- sub2api 源码目录(只读参考): `/home/vscode/projects/sub2api`
- 格式转换参考源(只读): `/home/vscode/projects/GPTSession2CPAandSub2API`
- 运行时: `bun 1.3.14` 或 `node v26.3.0`
- 容器运行用户加过 docker 组: `sudo usermod -aG docker $USER && newgrp docker`(否则 docker.sock 权限拒绝)

## A2. sub2api 部署关键参数

部署用官方推荐方式(不是文章里那条 404 的根目录 compose):

```bash
# 教程给的 https://raw.github.../docker-compose.yml 是 404(根本不在仓库根)
# 正确方式: 用 deploy/ 目录的官方部署脚本
mkdir -p ~/sub2api && cd ~/sub2api
curl -fsSL -o docker-deploy.sh https://raw.githubusercontent.com/Wei-Shaw/sub2api/main/deploy/docker-deploy.sh
bash docker-deploy.sh    # 自动: 下 docker-compose.yml + .env.example + 生成 JWT/PG密钥 + 建目录
docker compose up -d
```

- 镜像: `weishaw/sub2api:latest`
- 容器: `sub2api`(主) + `sub2api-postgres`(pgsql18) + `sub2api-redis`(redis8)
- 服务端口: `8080`(由 `.env: SERVER_PORT=8080` 决定,**不是**教程说的 3000)
- 首次启动会在**容器日志**里打印一次性管理员密码:
  `docker logs sub2api | grep "Generated admin password"`
  原文: `IMPORTANT: Save this password! It will not be shown again.` —— 务必立即保存并登录后改掉。
- 默认 admin 邮箱: `admin@sub2api.local`(在 `.env: ADMIN_EMAIL` 设)
- `.env` 自动生成了: `POSTGRES_PASSWORD` / `JWT_SECRET` / `TOTP_ENCRYPTION_KEY`,
  **别删 `.env`,否则库里的密钥对不上会要重置**。

## A3. 关键 API 端点清单(管理员侧,需 JWT)

| 用途 | 方法 路径 |
|---|---|
| 登录拿 JWT | `POST /api/v1/auth/login` body `{email,password}` → `data.access_token` |
| 导入账号(批量导出包格式, **走这个**) | `POST /api/v1/admin/accounts/data` body `{"data":{exported_at,proxies,accounts}}` |
| 导入账号(原始 session/JSONL, 宽容解析, 内置去重) | `POST /api/v1/admin/accounts/import/codex-session` body `{content:"<json字符串>",contents:[...],update_existing:true}` |
| 账号列表 | `GET /api/v1/admin/accounts?page=1&page_size=N` → `data.items[]` |
| 账号详情 | `GET /api/v1/admin/accounts/:id` |
| 凭证测试(最关键的健康检查) | `POST /api/v1/admin/accounts/:id/test` 返回 SSE 流 `test_start → content → test_complete` |
| 批量改字段(含绑组) | `POST /api/v1/admin/accounts/bulk-update` body `{account_ids:[],group_ids:[],confirm_mixed_channel_risk:true}` |
| 用户余额充值 | `POST /api/v1/admin/users/:id/balance` body `{balance:N}` |

客户端侧(用 sk-key, 不需 JWT):

| 用途 | 方法 路径 |
|---|---|
| 网关对话 | `POST /v1/chat/completions` |
| 模型列表 | `GET /v1/models` |
| 模型响应 | `POST /v1/responses` |

## A4. sub2api 导入包的精确字段格式(由 `session2sub2api.js` 产出)

注意 `accounts/data` 端点要求**整个外层包一层 `data`**:

```jsonc
{
  "data": {
    "exported_at": "2026-07-03T09:30:26.612Z",   // ISO, 当前时间
    "proxies": [],                                // 空即可
    "accounts": [
      {
        "name": "examples+1@test.com",           // 用 email 当 name
        "platform": "openai",
        "type": "oauth",
        "expires_at": 1783927342,                 // JWT exp 的 **unix 秒**; 控制 sub2api 自动停止调度
        "auto_pause_on_expired": true,            // 到期自动暂停
        "concurrency": 10,
        "priority": 1,
        "credentials": {
          "access_token": "eyJhbGci...",          // 原始 session 的 accessToken
          "chatgpt_account_id": "5e4c9b31-...",   // session.account.id
          "chatgpt_user_id": "user-Zcol...",      // session.user.id
          "email": "examples+1@test.com",
          "expires_at": "2026-07-13T07:22:22.000Z", // ISO; 记录用, 不算调度
          "expires_in": 859857,                    // 秒, now 到 expires_in 差值
          "plan_type": "k12"
        },
        "extra": {
          "email": "examples+1@test.com",
          "email_key": "examples_1_test_com",     // email 转 a-z0-9_ key
          "name": "examples+1@test.com",
          "auth_provider": "openai",
          "source": "chatgpt_web_session",         // 9router 输入时是 "9router"
          "last_refresh": "2026-07-03T09:30:26.612Z"
        }
      }
    ]
  }
}
```

`expires_at`(顶层 unix 秒) vs `credentials.expires_at`(ISO) **两个都要有**:
顶层控制 sub2api 自动 pause,credentials 里那个是记录。

## A5. 原始 session → sub2api 字段映射表

| 原始 token1.json 路径 | sub2api 目标字段 | 提取说明 |
|---|---|---|
| `accessToken` | `credentials.access_token` | 必填, 缺则报错 |
| `sessionToken` | (忽略) | sub2api 警告 `sessionToken 已忽略`, 不当 refresh_token |
| (无) | `credentials.refresh_token` | k12 session 通常没有, 因此无法自动续期 |
| `user.email` 或 JWT `email`/profile | `credentials.email`, `name`, `extra.email` | 优先 session 显式字段, 缺则从 JWT 补 |
| `account.id` 或 JWT `chatgpt_account_id` | `credentials.chatgpt_account_id` | |
| `user.id` 或 JWT `chatgpt_user_id` / `user_id` | `credentials.chatgpt_user_id` | |
| `account.planType` 或 JWT `chatgpt_plan_type` | `credentials.plan_type` | 决定可调模型范围 |
| `expires` (ISO) | `credentials.expires_at` | 缺则用 JWT `exp` 转 ISO |
| JWT `exp` (数字) | 顶层 `expires_at` (unix 秒) | 缺 refresh_token 时取此为自动停止时间 |
| (无 id_token) | 内部构造 synthetic id_token | 仅展示用, sub2api 格式不输出 id_token |

`session2sub2api.js` 对多种输入兼容(ChatGPT session / 9router / Codex auth.json /
sub2api 导出包), 字段缺失时一律从 `accessToken` JWT 的 payload 补全。

## A6. 转换脚本核心逻辑(移植自 GPTSession2CPAandSub2API)

`session2sub2api.js` 的纯函数(下次想改/审计参考):
- `firstNonEmpty(...vs)` 取第一个非空 trim 字符串
- `parseJwtPayload(token)`取 . 分隔第2段 base64url 解 JSON
- `getAuthSection(p)` = `p["https://api.openai.com/auth"]`
- `getProfileSection(p)` = `p["https://api.openai.com/profile"]`
- `normalizeTimestamp(v)` 接受 Date / 数字(秒或毫秒自动判) / ISO 字符串
- `unixSecondsFromJwtExp(v)` JWT exp → 整数秒
- `buildSyntheticIdToken(...)` 缺 id_token 时构造占位(但 sub2api 格式不输出)
- `stripUnavailable(v)` 递归删 undefined/null/"" 空对象 → undefined
- `toEmailKey(email)` 邮箱转 `[^a-z0-9]+ → _` 后 strip

关键来源文件: `/home/vscode/projects/GPTSession2CPAandSub2API/docs/index.html`
(纯前端单页工具, 在线版 https://gtxx3600.github.io/GPTSession2CPAandSub2API/)

## A7. sub2api 调度算法实测(轮询确认)

OpenAI chat 走 `gateway_service.go` 的 `selectAccount`, 实测连发 5 次请求,
`account_id` 依次为 2 → 5 → 7 → 6 → 7, 确实在 7 个账号间轮换。

查看每次落到哪号:
```bash
docker logs --tail 100 sub2api 2>&1 \
  | grep 'http request completed' | grep 'chat/completions' \
  | grep -oE '"account_id":[0-9]+'
```

调度核心机制(源码 `internal/service/gateway_service.go`):
- **Layer 1**: 模型路由优先(若组配了 `ModelRouting`)
- **Sticky session**: 同一 `client_request_id` 粘同一账号(同一客户端会话可能粘住单号)
- **LRU 优先**(`PreferLeastRecentlyUsed`): 选最久未用账号 → 自然轮询
- **并发槽位**(`tryAcquireAccountSlot`, `account.Concurrency`): 满则排队或切下一个
- **5h/7d 限额自动 pause**: 触发额度自动暂停调度(`AutoPauseBy5hThreshold` 等)
- **excludedIDs 重试**: 当前账号失败 → 加入排除集 → 重选下一个(fallback)
- **LoadBatchEnabled** 路径(`cfg.LoadBatchEnabled=true` 时走更复杂的批量调度)

选好的账号在 `http request completed` 日志的 `account_id` 字段可见。

## A8. 完整复现命令序列(从零)

```bash
# 0. 确认 docker 可用 (权限)
docker ps

# 1. 部署 sub2api (见 A2)
cd ~/sub2api && docker compose up -d
docker logs sub2api | grep "Generated admin password"   # 取一次性密码并保存
# 浏览器 http://localhost:8080/login 登录后改密码
# 管理后台给 admin 充值余额(几十刀, 避免标准组 INSUFFICIENT_BALANCE)
# 后台建一个 platform=openai 的分组(本次 group id=2, name=test)

# 2. 解密保存的 ChatGPT session JSON 到 tokens 目录
mkdir -p ~/projects/hubproxy/tokens
# 把 token1.json ~ tokenN.json 放进去

# 3. 一键批量导入并绑组2
bun ~/projects/hubproxy/scripts/import_tokens_to_sub2api.js \
    ~/projects/hubproxy/tokens 2
# 期望: [导入] account_created=N account_failed=0; [绑组] success=M failed=0

# 4. 客户端创建一个 sk- API key (后台「我的 API 密钥」→ 新建 → 绑组2)
#    本次测得: sk-3917c5a5b0497c5191a115b675458fc5d423edde2604a035c3ffa537d5220797

# 5. 验证调用
curl http://localhost:8080/v1/chat/completions \
  -H "Authorization: Bearer <你的sk-key>" -H "Content-Type: application/json" \
  -d '{"model":"gpt-5.4","messages":[{"role":"user","content":"hi"}],"stream":false}'
# 期望: HTTP 200 + 真实回复; 日志 account_id 在多个号间轮换

# 6. (建议) 给每个新导入账号跑凭证测试
# 后台「账号管理」逐个「测试」, 或循环 curl:
for id in 1 2 3 4 5 6 7; do
  curl -s -X POST http://localhost:8080/api/v1/admin/accounts/$id/test \
    -H "Authorization: Bearer <管理员JWT>" | tail -5; echo
done
```

## A9. 踩坑全记录(本次实际遇到)

1. **docker.sock 权限拒绝** (`permission denied ... /var/run/docker.sock`)
   → `sudo usermod -aG docker $USER && newgrp docker` (重新登录 shell 生效)

2. **CLIProxyAPI(之前那个) 端口修不对** —— 那不是 sub2api 相关, 与本文档无关

3. **sub2api 教程给出的 compose URL 404**
   `https://raw.githubusercontent.com/Wei-Shaw/sub2api/main/docker-compose.yml` 不存在
   → 正确路径在 `deploy/` 目录, 用 `deploy/docker-deploy.sh`

4. **登录后台 `401 invalid management key`**
   原因: 后端启动会把 plaintext `remote-management.secret-key` 哈希成 bcrypt 存,
   登录要填的是**明文**密码, 不是配置文件里那串 `$2a$10$...`。

5. **导入 token1.json 用错端点直接报 400**
   `POST /accounts/data` 期望 `{data:{...}}`; 直接传 `{"exported_at",...}` 顶层会 `json: cannot unmarshal ... content of type string` 之类错误
   → 必须**外层包 `{"data": ...}`**(脚本已处理)

6. **`codex-session` 端点 `content` 字段必须是字符串**
   `{"content": {对象}}` → `400 cannot unmarshal object into ... type string`
   → 必须 `{"content": "<整个JSON的字符串>"}`; 批量用 `contents: [<str>, ...]`

7. **503 `no available accounts`(账号 active 却报)**
   原因: 账号没绑定到 key 所在组, 或组内无 schedulable 账号
   → 用脚本第 2 参数绑组, 或 `bulk-update` `group_ids:[组ID]`

8. **403 `INSUFFICIENT_BALANCE`**
   原因: `standard` 组走客户端计费, admin 余额 0
   → 后台对 admin 用户充值 (`/admin/users/:id/balance`)

9. **裸 curl 直接打 OpenAI 都失败**
   `api.openai.com/v1/models` 用订阅 accessToken → 403 缺 `api.model.read` scope
   `chatgpt.com/backend-api` 裸 curl → 403 Cloudflare 挑战页
   → 只能经 sub2api(已自证有效), 这正是本文档存在意义

10. **Playwright 直开 chatgpt.com 不可行**
    `accessToken` 是 API OAuth JWT, 不是网页 cookie `__Secure-next-auth.session-token`,
    注入不进网页会话且有 CF turnstile 风控。死路。

## A10. 维护检查清单

- [ ] 每隔几天查 token 是否临近 `expires_at` (顶层 unix 秒), 临近前重导新 token
- [ ] 无 refresh_token 一律不自动续期; 失效后 sub2api 会自动 pause
- [ ] 新导出 token 后重跑 `import_tokens_to_sub2api.js`(后端按指纹去重, 安全)
- [ ] 个别账号失效拖累轮询 → 后台凭证测试, 失效的禁用 / 删除
- [ ] 看余额是否够扣费 (后台 dashboard / dashboard 用量趋势)
- [ ] 想强制更新已存在账号(而非跳过)走 `import/codex-session` + `update_existing:true`
- [ ] 升级 sub2api: `cd ~/sub2api && docker compose pull && docker compose up -d`
  (升级前确认 `.env` 没动)

## A11. 已实测可工作的示例值(仅供本机当前状态参考)

- sub2api 服务: `http://localhost:8080`
- admin 邮箱: `admin@sub2api.local`
- admin 初始密码: `593204008814e17ecbcc7a1827b66424` (登录后建议改)
- 目标分组: group id=2, name=test, platform=openai, subscription_type=standard
- 客户端 sk-key(本机生效): `sk-3917c5a5b0497c5191a115b675458fc5d423edde2604a035c3ffa537d5220797`
- 已导入账号(id 1~7, 全 active+schedulable+组2):
  - id=5 examples0@test.com (之前手导入, plan=unknown)
  - id=1 examples+1@test.com (k12)
  - id=2 examples+1@test.com (k12)
  - id=3 examples+2@test.com (k12)
  - id=4 examples+3@test.com (k12)
  - id=6 examples+4@test.com (k12)
  - id=7 examples+5@test.com (k12)
- 实测对话模型: `gpt-5.4`, 返回 200 真实内容
- 实测轮询: 5 次请求 → account_id = 2,5,7,6,7

> 上述值在本机/本会话有效; 迁移到别处或重新部署后需重新生成。

---

## A12. 后续新增 token 的标准操作(一条命令)

后续不要再手动一步步转换/登录/导入, 直接用现成脚本, 一行搞定:

### 场景 1: 把新 token 文件丢进 tokens 目录, 一次性重新导入全目录

把新的 `token8.json` / `token9.json` / `xxx.json` 放进
`~/projects/hubproxy/tokens/` 后, 直接:

```bash
bun /home/vscode/projects/hubproxy/scripts/import_tokens_to_sub2api.js \
    /home/vscode/projects/hubproxy/tokens 2
```

后端按 access_token 指纹(user_id + email + sha256)去重, **重复跑安全**:
已存在的旧 token 不重复创建, 新 token 自动 `account_created`, 绑组后立即进调度池,
**无需重启 sub2api 服务**。

### 场景 2: 只想加一个新文件, 不动整目录

```bash
mkdir -p /tmp/add && cp 新token.json /tmp/add/token_a.json
bun /home/vscode/projects/hubproxy/scripts/import_tokens_to_sub2api.js /tmp/add 2
rm -rf /tmp/add
```

注意: 脚本只匹配 `token*.json` 文件名, 别的文件名(如 `foo.json`)会被忽略,
所以要 `cp` 成 `token_*.json` 形式。

### 场景 3: 文件名不是 token*.json (例如 `beienjong946-outlook-com_xxx.json`)

先改名再导:

```bash
mkdir -p /tmp/add && n=1
for f in 原目录/*.json; do cp "$f" /tmp/add/token_$n.json; n=$((n+1)); done
bun /home/vscode/projects/hubproxy/scripts/import_tokens_to_sub2api.js /tmp/add 2
rm -rf /tmp/add
```

### 场景 4: 文件本身已经是 sub2api 导出格式(`{"data":{accounts[]}}` 或顶层 `{accounts[]}`)

`import_tokens_to_sub2api.js` 内部复用 `session2sub2api.js` 的解析逻辑,
能直接喂这种已转好的包, **不需要再转一次**, 也是同一个命令跑即可。

### 跑不通时(找不到 / 忘掉管理员密码)

脚本取 admin 密码的优先级:

1. `ADMIN_PASS` 环境变量;
2. `<SUB2API_DIR>/.env` 的 `ADMIN_PASSWORD=`(或 `ADMIN_PASS=`) 行;
3. sub2api 容器首次启动日志里的一次性密码
   (`Generated admin password (one-time): ...`, 容器重启/日志轮转会丢)。

任何一种方式拿到密码后, 若登录仍 401(密码已改/忘了), 直接用 `ADMIN_RESET_PASS`
**一行命令同时改密码 + 导入**, 不必再单独操作数据库:

```bash
# 忘了旧密码也无所谓: ADMIN_RESET_PASS=新明文, 脚本会自动重置 PG 里 admin 密码再登录
ADMIN_RESET_PASS="你的新明文密码" bun /home/vscode/projects/hubproxy/scripts/import_tokens_to_sub2api.js     /home/vscode/projects/hubproxy/tokens 2
```

机制: 脚本通过 `docker exec sub2api-postgres psql` 调用 pgcrypto 的
`crypt($newPass, gen_salt('bf', 10))` 生成 bcrypt `$2a$10$` 哈希写回
`users.password_hash`, 并把新明文同步写进 `.env` 的 `ADMIN_PASSWORD=` 行。
所以跑完之后:
- 数据库 admin 密码 = 你设的 `ADMIN_RESET_PASS` 值;
- `.env` 同步好了, 下次连 `ADMIN_RESET_PASS` 都不用传, 直接 `bun ... tokens 2` 即可;
- 若当时密码已对(无需重置), `ADMIN_RESET_PASS` 完全不会被触碰, 设了也不影响正常流程。

> 前提: `sub2api-postgres` 容器可 `docker exec` 访问; `.env` 里有 `POSTGRES_USER`/`POSTGRES_DB`; pgcrypto 扩展脚本会按需自动创建。

需要在非 docker-compose 默认部署下用别的 PG 容器名, 用环境变量覆盖:

```bash
PG_CONTAINER=其它容器名 ADMIN_RESET_PASS="新密码" bun /home/vscode/projects/hubproxy/scripts/import_tokens_to_sub2api.js     /home/vscode/projects/hubproxy/tokens 2
```

也可用 `SUB2API_BASE` / `ADMIN_EMAIL` / `SUB2API_DIR` 覆盖默认连接参数
(完整变量表见正文第 4 节环境变量表)。

### 导入后务必验证(死号会拖累轮询!)

导入成功 ≠ 账号能用。证书测试是 upstream 真活检测, 必做:

```bash
# 拿管理员 JWT
BASE="http://localhost:8080/api/v1"
TOKEN=$(curl -s -X POST $BASE/auth/login -H "Content-Type: application/json" \
  -d '{"email":"admin@sub2api.local","password":"你的明文密码"}' \
  | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>process.stdout.write(JSON.parse(d).data.access_token))")

# 逐个凭证测试 (script start → content → test_complete=OK / error=FAIL)
curl -s -X POST "$BASE/admin/accounts/<id>/test" -H "Authorization: Bearer $TOKEN"
```

依据上游错误码分流处置:

| 错误码 | 含义 | 处置 |
|---|---|---|
| `test_complete` | 号活着 | 保持 schedulable=true, 留用 |
| `402 deactivated_workspace` | 工作区已被停用 | 死号, 暂停或删 |
| `401 token_invalidated` | token 被撤销 | 死号, 必须重导新 token; 老 token 删 |
| `429 usage_limit_reached` | 额度耗尽(可恢复) | **仅暂停**, `resets_at` 时间到自动恢复, **别删** |
| `429` 其它 | 临时限频 | 暂停几小时再试 |
| 超时/网络 | 上游抖动 | 1~2 分钟后重试 |

暂停 / 删除号:

```bash
# 暂停调度(留账号记录)
curl -s -X POST "$BASE/admin/accounts/<id>/schedulable" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"schedulable":false}'

# 彻底删除(401/402 这类不可恢复号)
curl -s -X DELETE "$BASE/admin/accounts/<id>" -H "Authorization: Bearer $TOKEN"
```

⚠️ **重要**:
- `429 usage_limit_reached` 是**额度耗尽而非死号**, `resets_in_seconds` 字段给出
  自动恢复倒计时(常见约 2.8 小时), **只暂停不删**, 到点手动 `schedulable:true` 即恢复。
- 死号(`401`/`402`) 若留着 `schedulable=true`, 会被轮询选中导致
  「客户端一次请求 → sub2api 中途失败 → fallback 到下一个号」,
  无谓消耗延迟, 所以导入后必须清理。
- 已被删除的 id 不可恢复, 但**导入脚本按指纹去重**, 失效后随时重新导新 token 即可。
