#!/usr/bin/env bun
// 批量导入 Grok 账号清单到 sub2api。
//
// 支持输入:
//   1) 单个 txt: 每行 email----password----token
//   2) 目录: 自动读取目录下 accounts_*.txt 或 *.txt
//   3) JSON/JSONL: 尽量从 email/password/access_token/refresh_token 等字段提取
//
// 用法:
//   bun import_grok_accounts_to_sub2api.js <文件或目录> [组ID]
//
// 说明:
//   - DRY_RUN=1 只解析、登录、去重，不创建账号。
//   - STORE_PASSWORD=1 才把明文密码写入 extra.password；默认只写 password_sha256。
//   - sub2api Grok 官方推荐 OAuth refresh_token。若输入只有网页 session_id JWT，脚本会导入
//     为 access_token 并在 extra 中标记 source=grok_account_list，是否可用以后台“凭证测试”为准。
//   - 创建前会读取现有 grok oauth 账号，按 email/session_id/token sha256 跳过重复。

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

function usage() {
  console.error('用法: bun import_grok_accounts_to_sub2api.js <文件或目录> [组ID]');
  process.exit(2);
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function firstNonEmpty(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function b64urlDecode(seg) {
  const normalized = seg.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  return Buffer.from(padded, 'base64').toString('utf8');
}

function parseJwtPayload(token) {
  if (typeof token !== 'string') return {};
  const parts = token.split('.');
  if (parts.length < 2) return {};
  try { return JSON.parse(b64urlDecode(parts[1])); } catch { return {}; }
}

function epochSeconds(value) {
  if (value === undefined || value === null || value === '') return undefined;
  const n = Number(value);
  if (Number.isFinite(n) && n > 0) return Math.trunc(n > 1e11 ? n / 1000 : n);
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? Math.trunc(parsed / 1000) : undefined;
}

function toISOFromEpoch(seconds) {
  if (!seconds) return undefined;
  const d = new Date(seconds * 1000);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

function toEmailKey(email) {
  return String(email || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function parseDelimitedLine(line, sourceFile, lineNo) {
  const raw = line.trim();
  if (!raw || raw.startsWith('#')) return null;
  const parts = raw.split('----');
  if (parts.length < 3) {
    throw new Error(`${path.basename(sourceFile)}:${lineNo} 不是 email----password----token 格式`);
  }
  const email = parts.shift().trim();
  const password = parts.shift().trim();
  const token = parts.join('----').trim();
  if (!email || !token) {
    throw new Error(`${path.basename(sourceFile)}:${lineNo} 缺少 email 或 token`);
  }
  return normalizeRecord({ email, password, access_token: token }, sourceFile, lineNo);
}

function normalizeRecord(record, sourceFile, lineNo) {
  const accessToken = firstNonEmpty(
    record.access_token, record.accessToken, record.token, record.session_token, record.sessionToken,
    record.credentials && record.credentials.access_token,
  );
  const refreshToken = firstNonEmpty(
    record.refresh_token, record.refreshToken, record.rt,
    record.credentials && record.credentials.refresh_token,
  );
  const token = accessToken || refreshToken;
  if (!token) throw new Error(`${path.basename(sourceFile)}:${lineNo || '?'} 缺少 token`);

  const jwtPayload = parseJwtPayload(accessToken || '');
  const email = firstNonEmpty(
    record.email, record.user && record.user.email,
    record.credentials && record.credentials.email,
    jwtPayload.email,
  );
  const password = firstNonEmpty(record.password, record.pass, record.pwd);
  const sessionID = firstNonEmpty(record.session_id, record.sessionId, jwtPayload.session_id, jwtPayload.sid);
  const expiresAt = epochSeconds(record.expires_at || record.expiresAt || record.expires || jwtPayload.exp);
  const name = email || sessionID || `${path.basename(sourceFile)}:${lineNo || 'record'}`;

  const credentials = {
    access_token: accessToken || undefined,
    refresh_token: refreshToken || undefined,
    token_type: record.token_type || record.tokenType || (accessToken ? 'Bearer' : undefined),
    expires_at: toISOFromEpoch(expiresAt),
    email: email || undefined,
    base_url: process.env.XAI_BASE_URL || 'https://api.x.ai/v1',
  };
  for (const key of Object.keys(credentials)) {
    if (credentials[key] === undefined || credentials[key] === '') delete credentials[key];
  }

  const extra = {
    email: email || undefined,
    email_key: email ? toEmailKey(email) : undefined,
    name,
    source: 'grok_account_list',
    source_file: path.basename(sourceFile),
    source_line: lineNo || undefined,
    session_id: sessionID || undefined,
    password: /^(1|true|yes|on)$/i.test(process.env.STORE_PASSWORD || '') ? (password || undefined) : undefined,
    password_sha256: password ? sha256(password) : undefined,
    access_token_sha256: accessToken ? sha256(accessToken) : undefined,
    refresh_token_sha256: refreshToken ? sha256(refreshToken) : undefined,
    imported_at: new Date().toISOString(),
  };
  for (const key of Object.keys(extra)) {
    if (extra[key] === undefined || extra[key] === '') delete extra[key];
  }

  return {
    name,
    email,
    sessionID,
    accessToken,
    refreshToken,
    tokenHash: sha256(token),
    account: {
      name,
      platform: 'grok',
      type: 'oauth',
      credentials,
      extra,
      concurrency: Number(process.env.GROK_CONCURRENCY || 1),
      priority: Number(process.env.GROK_PRIORITY || 1),
      expires_at: expiresAt,
      auto_pause_on_expired: expiresAt ? true : undefined,
    },
  };
}

function parseJsonRecords(text, sourceFile) {
  const trimmed = text.trim();
  if (!trimmed) return [];
  try {
    const root = JSON.parse(trimmed);
    const records = Array.isArray(root) ? root : Array.isArray(root.accounts) ? root.accounts : [root];
    return records.map((record, idx) => normalizeRecord(record, sourceFile, idx + 1));
  } catch {}

  const out = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    if (line.startsWith('{')) out.push(normalizeRecord(JSON.parse(line), sourceFile, i + 1));
    else out.push(parseDelimitedLine(line, sourceFile, i + 1));
  }
  return out.filter(Boolean);
}

function inputFiles(inputPath) {
  const stat = fs.statSync(inputPath);
  if (stat.isFile()) return [inputPath];
  if (!stat.isDirectory()) throw new Error(`不是文件或目录: ${inputPath}`);
  const names = fs.readdirSync(inputPath)
    .filter((name) => /^(accounts_.*\.txt|.*\.(txt|json|jsonl))$/i.test(name))
    .sort();
  return names.map((name) => path.join(inputPath, name));
}

function readEnvValue(envFile, key) {
  if (!fs.existsSync(envFile)) return '';
  const txt = fs.readFileSync(envFile, 'utf8');
  const m = txt.match(new RegExp('^' + key + '=(.*)$', 'm'));
  return m ? m[1].trim() : '';
}

function readAdminPass(sub2apiDir) {
  const envFile = path.join(sub2apiDir, '.env');
  const fromEnv = process.env.ADMIN_PASS || readEnvValue(envFile, 'ADMIN_PASSWORD') || readEnvValue(envFile, 'ADMIN_PASS');
  if (fromEnv) return fromEnv;
  try {
    const logs = execFileSync('docker', ['logs', 'sub2api'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    const m = logs.match(/Generated admin password \(one-time\): (\S+)/);
    return m ? m[1] : '';
  } catch { return ''; }
}

function resetAdminPassViaPg(newPass, sub2apiDir, adminEmail) {
  const envFile = path.join(sub2apiDir, '.env');
  const pgContainer = process.env.PG_CONTAINER || 'sub2api-postgres';
  const pgUser = readEnvValue(envFile, 'POSTGRES_USER') || 'postgres';
  const pgDb = readEnvValue(envFile, 'POSTGRES_DB') || 'sub2api';
  try {
    execFileSync('docker', ['exec', pgContainer, 'psql', '-U', pgUser, '-d', pgDb, '-c', 'CREATE EXTENSION IF NOT EXISTS pgcrypto;'], { stdio: ['ignore', 'ignore', 'inherit'] });
    const sql = "UPDATE users SET password_hash = crypt($pass$" + newPass + "$pass$, gen_salt('bf', 10)), updated_at = now() WHERE email = $email$" + adminEmail + "$email$ RETURNING id;";
    const out = execFileSync('docker', ['exec', '-i', pgContainer, 'psql', '-U', pgUser, '-d', pgDb, '-c', sql], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    if (!/UPDATE\s+1/.test(out) && !/\b1\b/.test(out)) return false;
    if (fs.existsSync(envFile)) {
      const orig = fs.readFileSync(envFile, 'utf8');
      const next = /^ADMIN_PASSWORD=.*$/m.test(orig)
        ? orig.replace(/^ADMIN_PASSWORD=.*$/m, 'ADMIN_PASSWORD=' + newPass)
        : orig.replace(/\s*$/, '') + '\nADMIN_PASSWORD=' + newPass + '\n';
      fs.writeFileSync(envFile, next);
    }
    return true;
  } catch (e) {
    console.error('[ERR] 重置 admin 密码失败:', e.message);
    return false;
  }
}

async function requestJson(url, options) {
  const res = await fetch(url, options);
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text }; }
  return { res, body };
}

async function login(api, sub2apiDir) {
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@sub2api.local';
  let adminPass = readAdminPass(sub2apiDir);
  let { body } = await requestJson(`${api}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: adminEmail, password: adminPass }),
  });
  let jwt = body && body.data && body.data.access_token;
  if (!jwt && process.env.ADMIN_RESET_PASS) {
    console.log('[INFO] admin 登录失败，尝试 ADMIN_RESET_PASS 重置后重试...');
    if (resetAdminPassViaPg(process.env.ADMIN_RESET_PASS, sub2apiDir, adminEmail)) {
      adminPass = process.env.ADMIN_RESET_PASS;
      ({ body } = await requestJson(`${api}/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: adminEmail, password: adminPass }),
      }));
      jwt = body && body.data && body.data.access_token;
    }
  }
  if (!jwt) throw new Error(`登录 sub2api 失败: ${JSON.stringify(body)}`);
  return jwt;
}

async function listExistingGrok(api, authH) {
  const existing = { emails: new Set(), sessions: new Set(), tokenHashes: new Set() };
  let page = 1;
  for (;;) {
    const { body } = await requestJson(`${api}/admin/accounts?page=${page}&page_size=200&platform=grok&type=oauth`, { headers: authH });
    const items = (body && body.data && body.data.items) || [];
    for (const item of items) {
      const credentials = item.credentials || {};
      const extra = item.extra || {};
      const email = firstNonEmpty(credentials.email, extra.email, item.name);
      if (email) existing.emails.add(email.toLowerCase());
      if (extra.session_id) existing.sessions.add(String(extra.session_id));
      if (extra.access_token_sha256) existing.tokenHashes.add(String(extra.access_token_sha256));
      if (extra.refresh_token_sha256) existing.tokenHashes.add(String(extra.refresh_token_sha256));
    }
    const total = body && body.data && Number(body.data.total || 0);
    if (!items.length || page * 200 >= total) break;
    page++;
  }
  return existing;
}

function isDuplicate(record, existing, batchHashes) {
  if (batchHashes.has(record.tokenHash)) return 'batch token duplicate';
  if (existing.tokenHashes.has(record.tokenHash)) return 'existing token duplicate';
  if (record.email && existing.emails.has(record.email.toLowerCase())) return 'existing email duplicate';
  if (record.sessionID && existing.sessions.has(record.sessionID)) return 'existing session duplicate';
  return '';
}

async function main() {
  const args = process.argv.slice(2);
  if (!args[0]) usage();
  const source = path.resolve(args[0]);
  const groupId = args[1] ? Number(args[1]) : null;
  if (args[1] && (!Number.isInteger(groupId) || groupId <= 0)) throw new Error(`组ID无效: ${args[1]}`);
  const dryRun = /^(1|true|yes|on)$/i.test(process.env.DRY_RUN || '');

  const baseUrl = process.env.SUB2API_BASE || 'http://localhost:8080';
  const api = `${baseUrl}/api/v1`;
  const sub2apiDir = process.env.SUB2API_DIR || '/home/vscode/sub2api';

  const files = inputFiles(source);
  if (!files.length) throw new Error(`${source} 下没有可导入的 txt/json/jsonl 文件`);
  console.log(`[INFO] 读取 ${files.length} 个文件...`);

  const parsed = [];
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    const records = parseJsonRecords(text, file);
    parsed.push(...records);
    console.log(`  - ${path.basename(file)}: ${records.length}`);
  }
  console.log(`[OK] 解析到 ${parsed.length} 条 Grok 账号记录`);

  const jwt = await login(api, sub2apiDir);
  const authH = { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' };
  console.log('[OK] 已登录 sub2api (admin)');

  const existing = await listExistingGrok(api, authH);
  const batchHashes = new Set();
  let created = 0;
  let skipped = 0;
  let failed = 0;
  const createdIds = [];

  for (const record of parsed) {
    const dup = isDuplicate(record, existing, batchHashes);
    if (dup) {
      skipped++;
      console.log(`  ↻ 跳过 ${record.name}: ${dup}`);
      continue;
    }
    batchHashes.add(record.tokenHash);
    if (dryRun) {
      console.log(`  ? dry-run 可创建 ${record.name}`);
      continue;
    }
    const payload = {
      ...record.account,
      group_ids: groupId ? [groupId] : [],
      confirm_mixed_channel_risk: true,
    };
    const { res, body } = await requestJson(`${api}/admin/accounts`, {
      method: 'POST', headers: authH, body: JSON.stringify(payload),
    });
    const account = body && body.data;
    if (res.ok && account && account.id) {
      created++;
      createdIds.push(account.id);
      if (record.email) existing.emails.add(record.email.toLowerCase());
      if (record.sessionID) existing.sessions.add(record.sessionID);
      existing.tokenHashes.add(record.tokenHash);
      console.log(`  + 创建 id=${account.id} ${record.name}`);
    } else {
      failed++;
      console.log(`  ✗ 创建失败 ${record.name}: ${JSON.stringify(body)}`);
    }
  }

  if (dryRun) {
    console.log(`[DONE] dry-run creatable=${batchHashes.size} skipped=${skipped} failed=${failed}`);
    return;
  }
  console.log(`[DONE] created=${created} skipped=${skipped} failed=${failed}`);
  if (createdIds.length) console.log(`[INFO] 新建账号ID: ${createdIds.join(',')}`);
  console.log('[INFO] 建议导入后在后台对新建 Grok 账号执行“凭证测试”，只有网页 session_id 的账号可能无法通过 xAI API OAuth 鉴权。');
}

main().catch((e) => { console.error('[ERR]', e.message || e); process.exit(1); });
