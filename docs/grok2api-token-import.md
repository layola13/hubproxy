# Grok 账号 Token 批量导入 grok2api 使用指南

把 `email----password----sso/session JWT` 格式的 Grok 网页账号清单批量导入
grok2api，由 grok2api 走 Grok Web 逆向协议提供 OpenAI 兼容接口。

本文档适用于 `~/projects/hubproxy/tokens/grok/` 下这类文件：

```text
user@example.com----password----eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...
```

---

## 1. 为什么不能导入 sub2api 的 Grok OAuth

这类第三段 JWT 是 Grok Web 登录态 token，payload 通常只有：

```json
{
  "session_id": "..."
}
```

它不是 xAI 官方 API / OAuth 的 `access_token`，没有 `refresh_token`、`expires_at`、
API scope，也不能作为 `Authorization: Bearer ...` 调 `https://api.x.ai/v1`。

sub2api 的 Grok OAuth 逻辑需要的是 xAI OAuth 凭据：

```json
{
  "access_token": "真正的 xAI OAuth access token",
  "refresh_token": "...",
  "token_type": "Bearer",
  "expires_at": "..."
}
```

因此把本批 `session_id` JWT 导入 sub2api 后，凭证测试会失败，典型错误是：

```text
Failed to get Grok access token: grok access_token expired and refresh_token is missing
```

grok2api 则不同：它把 token 当浏览器 Cookie 使用：

```http
Cookie: sso=<token>; sso-rw=<token>
```

并模拟 Grok Web 请求头调用 `https://grok.com/rest/...`，所以这类账号清单应导入
grok2api，而不是 sub2api 的 Grok OAuth。

---

## 2. 当前本机服务参数

源码目录：

```text
/home/vscode/projects/grok2apinew
```

当前推荐本机运行地址：

```text
http://127.0.0.1:18000
```

后台地址：

```text
http://127.0.0.1:18000/admin/login
```

后台密码保存在：

```text
/home/vscode/projects/grok2apinew/.env
```

关键配置：

```env
HOST_BIND=127.0.0.1
HOST_PORT=18000
GROK_APP_APP_KEY=<后台密码>
```

`HOST_BIND=127.0.0.1` 表示只绑定宿主机回环地址，不直接暴露外网。

---

## 3. 启动 grok2api

### Docker Compose 启动

```bash
cd /home/vscode/projects/grok2apinew
docker compose up -d
```

确认只监听本机地址：

```bash
docker ps --format '{{.Names}} {{.Ports}}' | grep grok2api
ss -ltnp | grep ':18000'
```

期望看到类似：

```text
127.0.0.1:18000->8000/tcp
LISTEN ... 127.0.0.1:18000 ...
```

### 临时容器启动（可选）

如果只是临时测试，不使用项目目录 compose：

```bash
mkdir -p /tmp/grok2api-run/data /tmp/grok2api-run/logs

docker run -d --name grok2api-test --rm \
  -p 127.0.0.1:18000:8000 \
  -e TZ=Asia/Shanghai \
  -e LOG_LEVEL=INFO \
  -e LOG_FILE_ENABLED=false \
  -e DATA_DIR=/app/data \
  -e LOG_DIR=/app/logs \
  -e ACCOUNT_STORAGE=local \
  -e ACCOUNT_LOCAL_PATH=/app/data/accounts.db \
  -e ACCOUNT_SYNC_INTERVAL=5 \
  -e ACCOUNT_SYNC_ACTIVE_INTERVAL=1 \
  -e GROK_APP_APP_KEY='<后台密码>' \
  -v /tmp/grok2api-run/data:/app/data \
  -v /tmp/grok2api-run/logs:/app/logs \
  ghcr.io/jiujiu532/grok2api:latest
```

---

## 4. 原始账号文件格式

账号文件放在：

```text
/home/vscode/projects/hubproxy/tokens/grok/
```

常见文件：

```text
accounts_20260630_230518.txt
accounts_20260708_212817.txt
```

每行格式：

```text
email----password----token
```

示例：

```text
abc@example.com----password----eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...
```

grok2api 只需要第三段 token。邮箱和密码不会导入 grok2api。

---

## 5. 批量导入命令

### 导入单个文件

```bash
APP_KEY=$(sed -n 's/^GROK_APP_APP_KEY=//p' /home/vscode/projects/grok2apinew/.env | head -1)

node - <<'NODE' >/tmp/grok_tokens_payload.json
const fs = require('fs');
const file = '/home/vscode/projects/hubproxy/tokens/grok/accounts_20260630_230518.txt';
const tokens = fs.readFileSync(file, 'utf8')
  .split(/\r?\n/)
  .map(line => line.trim())
  .filter(Boolean)
  .map(line => line.split('----').slice(2).join('----').trim())
  .filter(Boolean);
process.stdout.write(JSON.stringify({ tokens, pool: 'auto' }));
NODE

curl -sS -X POST "http://127.0.0.1:18000/admin/api/tokens/add?app_key=${APP_KEY}" \
  -H 'Content-Type: application/json' \
  --data-binary @/tmp/grok_tokens_payload.json
```

预期返回：

```json
{"status":"success","count":1947,"skipped":0,"synced":true}
```

说明：

- `pool: "auto"` 会让 grok2api 导入时自动检测账号可用层级。
- 已存在 token 会返回 `skipped`，重复执行安全。
- 大批量导入后，后台刷新配额需要一点时间。

### 导入整个目录下所有 accounts_*.txt

```bash
APP_KEY=$(sed -n 's/^GROK_APP_APP_KEY=//p' /home/vscode/projects/grok2apinew/.env | head -1)

node - <<'NODE' >/tmp/grok_tokens_payload.json
const fs = require('fs');
const path = require('path');
const dir = '/home/vscode/projects/hubproxy/tokens/grok';
const seen = new Set();
const tokens = [];

for (const name of fs.readdirSync(dir).sort()) {
  if (!/^accounts_.*\.txt$/i.test(name)) continue;
  const file = path.join(dir, name);
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const raw = line.trim();
    if (!raw || raw.startsWith('#')) continue;
    const token = raw.split('----').slice(2).join('----').trim();
    if (!token || seen.has(token)) continue;
    seen.add(token);
    tokens.push(token);
  }
}

process.stdout.write(JSON.stringify({ tokens, pool: 'auto' }));
NODE

curl -sS -X POST "http://127.0.0.1:18000/admin/api/tokens/add?app_key=${APP_KEY}" \
  -H 'Content-Type: application/json' \
  --data-binary @/tmp/grok_tokens_payload.json
```

---

## 6. 验证导入结果

### 查看 token 列表

```bash
APP_KEY=$(sed -n 's/^GROK_APP_APP_KEY=//p' /home/vscode/projects/grok2apinew/.env | head -1)

curl -sS "http://127.0.0.1:18000/admin/api/tokens?app_key=${APP_KEY}" | head -c 1000
```

### 查看可用模型

```bash
curl -sS http://127.0.0.1:18000/v1/models
```

导入成功并刷新后，通常会看到类似：

```json
{
  "object": "list",
  "data": [
    { "id": "grok-4.20-fast", "object": "model", "owned_by": "xai" },
    { "id": "grok-4.3-fast", "object": "model", "owned_by": "xai" },
    { "id": "grok-build-console", "object": "model", "owned_by": "xai" }
  ]
}
```

当前新版镜像实测可返回 17 个模型：

```text
grok-4.20-0309-non-reasoning
grok-4.20-fast
grok-4.3-fast
grok-imagine-image-lite
grok-4.3-console
grok-4.3-low
grok-4.3-medium
grok-4.3-high
grok-4.20-0309-reasoning-console
grok-4.20-0309-console
grok-4.20-multi-agent-console
grok-4.20-multi-agent-low
grok-4.20-multi-agent-medium
grok-4.20-multi-agent-high
grok-4.20-multi-agent-xhigh
grok-4.20-0309-non-reasoning-console
grok-build-console
```

### 发起 OpenAI 兼容请求

```bash
curl -sS http://127.0.0.1:18000/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "grok-4.3-fast",
    "messages": [{"role":"user","content":"hi"}],
    "stream": false
  }'
```

预期返回 OpenAI 兼容结构：

```json
{
  "id": "chatcmpl-...",
  "object": "chat.completion",
  "model": "grok-4.3-fast",
  "choices": [
    { "message": { "role": "assistant", "content": "..." } }
  ]
}
```

---

## 7. 后续新增账号的标准流程

### 场景 1：新增一个账号文件

把新文件放到：

```text
/home/vscode/projects/hubproxy/tokens/grok/
```

文件名建议：

```text
accounts_YYYYMMDD_HHMMSS.txt
```

然后按“导入单个文件”的命令，把 `file = ...` 改成新文件路径。

### 场景 2：重新导入整个目录

直接跑“导入整个目录下所有 accounts_*.txt”的命令。

grok2api 会跳过已存在 token，重复执行安全。

### 场景 3：只想检查文件数量，不导入

```bash
for f in /home/vscode/projects/hubproxy/tokens/grok/accounts_*.txt; do
  printf '%s ' "$(basename "$f")"
  wc -l < "$f"
done
```

---

## 8. 常见问题

| 现象 | 原因 / 解决 |
|---|---|
| sub2api Grok 凭证测试失败 | 这批 token 是 Grok Web SSO，不是 xAI OAuth token。应导入 grok2api。 |
| `/v1/models` 返回空 | token 还没导入，或导入后账号目录/配额刷新未完成，等几秒再试。 |
| 后台登录 401 | `app_key` 不对。读取 `/home/vscode/projects/grok2apinew/.env` 的 `GROK_APP_APP_KEY=`。 |
| 外网访问不到 | 正常。服务只绑定 `127.0.0.1:18000`，需要 SSH 隧道或内网反代才可远程访问。 |
| 请求 403 / Cloudflare | 出口 IP 或 Cloudflare clearance 问题。grok2api 支持 `proxy.clearance` 和 FlareSolverr，但当前本机实测 direct 可用。 |
| 请求 401 | token 失效或账号登录态被撤销，删除该 token 或重新导入新 token。 |

---

## 9. 安全提醒

- 不要把 grok2api 直接绑定到 `0.0.0.0` 暴露公网。
- 不要使用默认后台密码 `grok2api`。
- 账号列表里包含邮箱、密码和登录态 token，应只保存在本机受控目录。
- 文档命令只导入第三段 token，不导入邮箱和明文密码。
- 若需要远程访问后台，优先用 SSH 隧道：

```bash
ssh -L 18000:127.0.0.1:18000 user@server
```

然后在本地浏览器打开：

```text
http://127.0.0.1:18000/admin/login
```
