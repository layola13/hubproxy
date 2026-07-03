#!/usr/bin/env bun
// 批量: 把目录里的 ChatGPT session JSON 先转成 sub2api 格式, 再导入(后端内置去重)。
// 用法:
//   bun import_tokens_to_sub2api.js <tokens目录> [组ID]
//   node import_tokens_to_sub2api.js <tokens目录> [组ID]
//
// 流程:
//   1. 读取目录下所有 token*.json (原文)
//   2. 调同目录 session2sub2api.js 的转换逻辑 (require 复用) 转成 sub2api accounts[]
//   3. 合并成一个 {data:{exported_at,proxies,accounts}} 包
//   4. 登录 sub2api 拿 admin JWT
//   5. POST /api/v1/admin/accounts/data  (后端按身份指纹去重: 已存在跳过/更新)
//   6. 可选: 把所有 openai oauth 账号绑到指定组

const path = require('path');
const fs = require('fs');

// ---- 0. 复用转换脚本里的纯函数 (它没有 export, 这里直接重新 require 拿不到内部;
//         所以用 child_process 跑它输出再合并更简单可靠) ----
const { execFileSync } = require('child_process');

const SCRIPT_DIR = __dirname;
const CONVERT_JS = path.join(SCRIPT_DIR, 'session2sub2api.js');

// ---- 转 sub2api 单文件: 调子脚本写到临时再读 ----
function convertOne(tokenFile) {
  const tmp = `/tmp/_sub2api_${Date.now()}_${Math.random().toString(36).slice(2)}.json`;
  try {
    execFileSync('node', [CONVERT_JS, tokenFile, tmp], { stdio: ['ignore', 'ignore', 'inherit'] });
    return JSON.parse(fs.readFileSync(tmp, 'utf8')).accounts || [];
  } finally {
    try { fs.unlinkSync(tmp); } catch {}
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('用法: bun import_tokens_to_sub2api.js <tokens目录> [组ID]');
    process.exit(2);
  }
  const tokensDir = args[0];
  const groupId = args[1] ? Number(args[1]) : null;

  const baseUrl = process.env.SUB2API_BASE || 'http://localhost:8080';
  const api = `${baseUrl}/api/v1`;
  const sub2apiDir = process.env.SUB2API_DIR || '/home/vscode/sub2api';

  // ---- 1. 找 token*.json ----
  if (!fs.statSync(tokensDir).isDirectory()) {
    console.error(`[ERR] 不是目录: ${tokensDir}`); process.exit(2);
  }
  if (!fs.existsSync(CONVERT_JS)) {
    console.error(`[ERR] 找不到转换脚本: ${CONVERT_JS}`); process.exit(2);
  }
  const files = fs.readdirSync(tokensDir)
    .filter((f) => /^token.*\.json$/i.test(f))
    .sort()
    .map((f) => path.join(tokensDir, f));
  if (files.length === 0) {
    console.error(`[ERR] ${tokensDir} 下没有 token*.json`); process.exit(5);
  }
  console.log(`[INFO] 发现 ${files.length} 个 token 文件, 逐个转换...`);

  // ---- 2. 逐个转换, 合并 accounts[] ----
  const accounts = [];
  const seenFingerprints = new Set(); // 本批内去重(同 access_token 只导入一次)
  for (const f of files) {
    let accs;
    try {
      accs = convertOne(f);
    } catch (e) {
      console.error(`  ✗ 转换失败 ${path.basename(f)}: ${e.message}`);
      continue;
    }
    for (const a of accs) {
      const at = (a.credentials && a.credentials.access_token) || '';
      if (seenFingerprints.has(at)) {
        console.log(`  ↻ 跳过重复 token: ${a.name} (${path.basename(f)})`);
        continue;
      }
      seenFingerprints.add(at);
      accounts.push(a);
    }
  }
  console.log(`[OK] 合并去重后 ${accounts.length} 个账号`);

  const payload = {
    data: {
      exported_at: new Date().toISOString(),
      proxies: [],
      accounts,
    },
  };

  // ---- 3. 取管理员密码 ----
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@sub2api.local';
  let adminPass = process.env.ADMIN_PASS || '';
  if (!adminPass) {
    const envFile = path.join(sub2apiDir, '.env');
    if (fs.existsSync(envFile)) {
      const txt = fs.readFileSync(envFile, 'utf8');
      const m = txt.match(/^ADMIN_PASSWORD=(.*)$/m);
      if (m) adminPass = m[1];
    }
  }
  if (!adminPass) {
    // 回退: 从容器日志取一次性生成密码
    try {
      const logs = execFileSync('docker', ['logs', 'sub2api'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      const m = logs.match(/Generated admin password \(one-time\): ([a-f0-9]+)/);
      if (m) adminPass = m[1];
    } catch {}
  }
  if (!adminPass) {
    console.error('[ERR] 取不到管理员密码; 设 ADMIN_PASS 环境变量'); process.exit(3);
  }

  // ---- 4. 登录 ----
  const loginRes = await fetch(`${api}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: adminEmail, password: adminPass }),
  }).then((r) => r.json()).catch((e) => { console.error('[ERR] 登录请求失败', e); process.exit(4); });
  const jwt = loginRes && loginRes.data && loginRes.data.access_token;
  if (!jwt) {
    console.error('[ERR] 登录 sub2api 失败:', JSON.stringify(loginRes)); process.exit(4);
  }
  console.log('[OK] 已登录 sub2api (admin)');

  const authH = { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' };

  // ---- 5. 导入 (accounts/data 端点内置身份指纹去重) ----
  console.log('[INFO] 正在导入 sub2api ...');
  const impRes = await fetch(`${api}/admin/accounts/data`, {
    method: 'POST',
    headers: authH,
    body: JSON.stringify(payload),
  }).then((r) => r.json()).catch((e) => { console.error('[ERR] 导入请求失败', e); process.exit(6); });
  const ir = impRes && impRes.data;
  if (ir) {
    console.log(`[导入] account_created=${ir.account_created} account_failed=${ir.account_failed} proxy_created=${ir.proxy_created}`);
    for (const e of (ir.errors || [])) {
      console.log(`  ✗ name=${e.name || ''} kind=${e.kind} msg=${e.message}`);
    }
  } else {
    console.error('[ERR] 导入返回异常:', JSON.stringify(impRes));
  }

  // ---- 6. 可选: 绑定到组 ----
  if (groupId) {
    console.log(`[INFO] 把所有 openai oauth 账号绑定到组 ${groupId} ...`);
    const listRes = await fetch(`${api}/admin/accounts?page=1&page_size=200`, { headers: authH })
      .then((r) => r.json());
    const items = (listRes && listRes.data && listRes.data.items) || [];
    const ids = items.filter((a) => a.platform === 'openai' && a.type === 'oauth').map((a) => a.id);
    if (ids.length) {
      const bindRes = await fetch(`${api}/admin/accounts/bulk-update`, {
        method: 'POST',
        headers: authH,
        body: JSON.stringify({ account_ids: ids, group_ids: [groupId], confirm_mixed_channel_risk: true }),
      }).then((r) => r.json());
      const br = bindRes && bindRes.data;
      console.log(`  [绑组] success=${br ? br.success : '?'} failed=${br ? br.failed : '?'}`);
    } else {
      console.log('  (没有可绑定的 openai oauth 账号)');
    }
  }
  console.log('[DONE]');
}

main().catch((e) => { console.error('[ERR]', e); process.exit(1); });
