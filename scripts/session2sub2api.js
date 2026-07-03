#!/usr/bin/env node
// 把 ChatGPT Web session JSON 转成 sub2api 导入格式。
// 逻辑移植自 GPTSession2CPAandSub2API/docs/index.html, 仅保留 sub2api 输出。
// 用法: node session2sub2api.js <input.json> [output.json]
//   - input.json: ChatGPT 原始 session(含 accessToken/sessionToken/account/email/expires)
//                 也兼容 sub2api 导出包(accounts[]) / 9router / Codex auth.json
//   - 不带 output.json 则打印到 stdout

const fs = require('fs');

function firstNonEmpty(...values) {
  for (const v of values) {
    if (typeof v === 'string' && v.trim() !== '') return v.trim();
  }
  return undefined;
}
function isPlainObject(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
function isAvailable(v) { return v !== undefined && v !== null && v !== ''; }
function stripUnavailable(value) {
  if (Array.isArray(value)) {
    const r = value.map(stripUnavailable).filter((x) => x !== undefined);
    return r.length ? r : undefined;
  }
  if (isPlainObject(value)) {
    const entries = Object.entries(value)
      .map(([k, v]) => [k, stripUnavailable(v)])
      .filter(([, v]) => v !== undefined);
    return entries.length ? Object.fromEntries(entries) : undefined;
  }
  return isAvailable(value) ? value : undefined;
}
function b64urlDecode(seg) {
  const n = seg.replace(/-/g, '+').replace(/_/g, '/');
  const pad = n.padEnd(Math.ceil(n.length / 4) * 4, '=');
  return Buffer.from(pad, 'base64').toString('utf8');
}
function b64urlEncodeJson(v) {
  return Buffer.from(JSON.stringify(v)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
function parseJwtPayload(token) {
  if (typeof token !== 'string' || token.trim() === '') return undefined;
  const segs = token.split('.');
  if (segs.length < 2) return undefined;
  try { return JSON.parse(b64urlDecode(segs[1])); } catch { return undefined; }
}
function getAuthSection(p) { return isPlainObject(p) && isPlainObject(p['https://api.openai.com/auth']) ? p['https://api.openai.com/auth'] : {}; }
function getProfileSection(p) { return isPlainObject(p) && isPlainObject(p['https://api.openai.com/profile']) ? p['https://api.openai.com/profile'] : {}; }
function normalizeTimestamp(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  if (typeof value === 'number' && Number.isFinite(value)) {
    const ms = value > 1e11 ? value : value * 1000;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
  }
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}
function timestampFromUnixSeconds(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return undefined;
  const d = new Date(n * 1000);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}
function unixSecondsFromJwtExp(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.trunc(n);
}
function epochSecondsFromValue(v) {
  if (v === undefined || v === null || v === '') return 0;
  const n = Number(v);
  if (Number.isFinite(n)) return Math.trunc(n > 1e11 ? n / 1000 : n);
  const p = Date.parse(String(v));
  return Number.isFinite(p) ? Math.trunc(p / 1000) : 0;
}
function buildSyntheticIdToken(email, accountId, planType, userId, expiresAt) {
  if (!accountId) return undefined;
  const now = Math.trunc(Date.now() / 1000);
  const authInfo = { chatgpt_account_id: accountId };
  const exp = epochSecondsFromValue(expiresAt) || now + 90 * 24 * 60 * 60;
  if (planType) authInfo.chatgpt_plan_type = planType;
  if (userId) { authInfo.chatgpt_user_id = userId; authInfo.user_id = userId; }
  const payload = { iat: now, exp, 'https://api.openai.com/auth': authInfo };
  if (email) payload.email = email;
  return b64urlEncodeJson({ alg: 'none', typ: 'JWT', cpa_synthetic: true }) + '.' + b64urlEncodeJson(payload) + '.synthetic';
}
function getExpiresIn(expiresAt, now) {
  if (!expiresAt) return undefined;
  const ms = new Date(expiresAt).getTime();
  if (Number.isNaN(ms)) return undefined;
  return Math.max(0, Math.floor((ms - (now || new Date()).getTime()) / 1000));
}
function toEmailKey(email) {
  if (typeof email !== 'string') return undefined;
  return email.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function extractRecords(root, sourcePath) {
  if (isPlainObject(root) && Array.isArray(root.accounts) && root.accounts.length) {
    return root.accounts.map((a) => ({ record: a, sourceName: sourcePath || 'accounts-entry' }));
  }
  if (Array.isArray(root)) return root.map((r) => ({ record: r, sourceName: sourcePath || 'array-entry' }));
  if (isPlainObject(root)) return [{ record: root, sourceName: sourcePath || 'pasted-json' }];
  throw new Error('输入 JSON 不是对象也不是数组');
}

function convertOne(record, sourceName, now) {
  const accessToken = firstNonEmpty(
    record.accessToken, record.access_token,
    record.tokens && record.tokens.accessToken, record.tokens && record.tokens.access_token,
    record.token && record.token.accessToken, record.token && record.token.access_token,
    record.credentials && record.credentials.accessToken, record.credentials && record.credentials.access_token,
  );
  if (!accessToken) throw new Error('缺少 accessToken');
  const refreshToken = firstNonEmpty(
    record.refreshToken, record.refresh_token,
    record.tokens && record.tokens.refreshToken, record.tokens && record.tokens.refresh_token,
    record.token && record.token.refreshToken, record.token && record.token.refresh_token,
    record.credentials && record.credentials.refresh_token,
  );
  const inputIdToken = firstNonEmpty(
    record.idToken, record.id_token,
    record.tokens && record.tokens.idToken, record.tokens && record.tokens.id_token,
    record.token && record.token.idToken, record.token && record.token.id_token,
    record.credentials && record.credentials.id_token,
  );
  const payload = parseJwtPayload(accessToken);
  const idPayload = parseJwtPayload(inputIdToken);
  const auth = getAuthSection(payload);
  const idAuth = getAuthSection(idPayload);
  const profile = getProfileSection(payload);
  const hasRefreshToken = Boolean(refreshToken);
  const accessTokenExpiresAt = hasRefreshToken ? undefined : unixSecondsFromJwtExp(payload && payload.exp);
  const expiresAt = hasRefreshToken ? undefined : firstNonEmpty(
    payload ? timestampFromUnixSeconds(payload.exp) : undefined,
    normalizeTimestamp(record.expires), normalizeTimestamp(record.expiresAt),
    normalizeTimestamp(record.expired), normalizeTimestamp(record.expires_at),
  );
  const email = firstNonEmpty(
    record.user && record.user.email, record.email, record.meta && record.meta.label, record.label,
    record.credentials && record.credentials.email, record.providerSpecificData && record.providerSpecificData.email,
    profile.email, idPayload && idPayload.email, payload && payload.email,
  );
  const accountId = firstNonEmpty(
    record.account && record.account.id, record.account_id,
    record.tokens && record.tokens.accountId, record.tokens && record.tokens.account_id,
    record.chatgptAccountId, record.chatgpt_account_id,
    record.meta && record.meta.chatgptAccountId, record.meta && record.meta.chatgpt_account_id,
    record.tokens && record.tokens.chatgptAccountId, record.tokens && record.tokens.chatgpt_account_id,
    record.providerSpecificData && record.providerSpecificData.chatgptAccountId, record.providerSpecificData && record.providerSpecificData.chatgpt_account_id,
    record.credentials && record.credentials.chatgpt_account_id, auth.chatgpt_account_id, idAuth.chatgpt_account_id,
    record.provider === 'codex' ? record.id : undefined,
  );
  const userId = firstNonEmpty(
    record.user && record.user.id, record.user_id, record.chatgptUserId,
    record.providerSpecificData && record.providerSpecificData.chatgptUserId, record.providerSpecificData && record.providerSpecificData.chatgpt_user_id,
    auth.chatgpt_user_id, auth.user_id, idAuth.chatgpt_user_id, idAuth.user_id,
  );
  const planType = firstNonEmpty(
    record.account && record.account.planType, record.account && record.account.plan_type,
    record.planType, record.plan_type,
    record.providerSpecificData && record.providerSpecificData.chatgptPlanType, record.providerSpecificData && record.providerSpecificData.chatgpt_plan_type,
    record.credentials && record.credentials.plan_type, auth.chatgpt_plan_type, idAuth.chatgpt_plan_type,
  );
  const exportedAt = normalizeTimestamp(now);
  const expiresIn = getExpiresIn(expiresAt, now);
  const sourceType = record.provider === 'codex' && record.authType === 'oauth' ? '9router' : 'chatgpt_web_session';
  const name = firstNonEmpty(email, sourceName, 'ChatGPT Account');
  const syntheticIdToken = !inputIdToken ? buildSyntheticIdToken(email, accountId, planType, userId, expiresAt) : undefined;
  const idToken = firstNonEmpty(inputIdToken, syntheticIdToken);
  void idToken; // sub2api 格式不输出 id_token, 保留解析仅为兼容后续扩展

  const sub2apiAccount = stripUnavailable({
    name,
    platform: 'openai',
    type: 'oauth',
    expires_at: accessTokenExpiresAt,
    auto_pause_on_expired: accessTokenExpiresAt ? true : undefined,
    concurrency: 10,
    priority: 1,
    credentials: {
      access_token: accessToken,
      chatgpt_account_id: accountId,
      chatgpt_user_id: userId,
      email,
      expires_at: expiresAt,
      expires_in: expiresIn,
      plan_type: planType,
    },
    extra: {
      email,
      email_key: toEmailKey(email),
      name,
      auth_provider: firstNonEmpty(record.authProvider, record.auth_provider),
      source: sourceType,
      last_refresh: exportedAt,
    },
  });
  return sub2apiAccount;
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0) {
    console.error('用法: node session2sub2api.js <input.json> [output.json]');
    process.exit(2);
  }
  const input = argv[0];
  const output = argv[1];
  const raw = fs.readFileSync(input, 'utf8');
  const root = JSON.parse(raw);
  const records = extractRecords(root, input);
  const now = new Date();
  const accounts = records.map((r) => convertOne(r.record, r.sourceName, now));
  const doc = { exported_at: normalizeTimestamp(now), proxies: [], accounts };
  const json = JSON.stringify(doc, null, 2);
  if (output) {
    fs.writeFileSync(output, json);
    console.error('已写入 ' + output + ' (' + accounts.length + ' 个账号)');
  } else {
    process.stdout.write(json + '\n');
  }
}
main();
