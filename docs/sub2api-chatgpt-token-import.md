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
