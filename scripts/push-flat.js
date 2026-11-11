#!/usr/bin/env node
/**
 * 用一个提交把当前工作树的文件接到远端分支之后（适合 github.com 直连不通、仓库刚建好）。
 * 只做一次平坦推送：blobs → tree → commit(parent=远端头) → PATCH ref。
 *
 *   GH_TOKEN=... node scripts/push-flat.js [branch]
 */
'use strict';
const https = require('https');
const { execFileSync } = require('child_process');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const git = (a) => execFileSync('git', a, { cwd: ROOT, maxBuffer: 256 * 1024 * 1024 }).toString('utf8');
const TOKEN = process.env.GH_TOKEN || execFileSync('gh', ['auth', 'token'], { encoding: 'utf8' }).trim();
const remote = process.env.REMOTE || git(['remote', 'get-url', 'origin']).trim();
const m = remote.match(/github\.com[:/]([^/]+)\/([^/.]+?)(?:\.git)?$/);
if (!m) { console.error('无法从 origin 解析仓库：' + remote); process.exit(1); }
const REPO = m[1] + '/' + m[2];
const BRANCH = process.argv[2] || 'main';

function api(method, p, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = https.request({
      host: 'api.github.com', path: p, method,
      headers: Object.assign({
        Authorization: 'Bearer ' + TOKEN,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'push-flat',
        'Content-Type': 'application/json'
      }, data ? { 'Content-Length': Buffer.byteLength(data) } : {})
    }, (res) => {
      let buf = '';
      res.on('data', (c) => { buf += c; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(buf ? JSON.parse(buf) : null); } catch (_) { resolve(buf); }
        } else reject(new Error(method + ' ' + p + ' -> ' + res.statusCode + ' ' + buf.slice(0, 300)));
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

(async () => {
  // 1) 本地全部 blob
  const files = git(['ls-tree', '-r', 'HEAD']).trim().split('\n').filter(Boolean).map((l) => {
    const [meta, file] = l.split('\t');
    const [mode, type, sha] = meta.split(/\s+/);
    return { mode, type, sha, path: file };
  });
  console.log('files    : ' + files.length);

  // 2) 确保远端有 blob（缺失则按内容创建）
  for (const f of files) {
    try {
      await api('GET', '/repos/' + REPO + '/git/blobs/' + f.sha);
    } catch (_) {
      const content = execFileSync('git', ['cat-file', 'blob', f.sha], { cwd: ROOT, maxBuffer: 256 * 1024 * 1024 });
      const out = await api('POST', '/repos/' + REPO + '/git/blobs', {
        content: content.toString('base64'), encoding: 'base64'
      });
      f.sha = out.sha;
    }
  }

  // 3) tree
  const tree = await api('POST', '/repos/' + REPO + '/git/trees', {
    tree: files.map((f) => ({
      path: f.path,
      mode: f.mode === '100755' ? '100755' : '100644',
      type: 'blob',
      sha: f.sha
    }))
  });
  console.log('tree     : ' + tree.sha);

  // 4) 父提交：远端分支现有头（没有则作为 root）
  let parents = [];
  try {
    const ref = await api('GET', '/repos/' + REPO + '/git/ref/heads/' + BRANCH);
    parents = [ref.object.sha];
  } catch (_) {}

  const commit = await api('POST', '/repos/' + REPO + '/git/commits', {
    message: process.env.MSG || 'init: skill 内容',
    tree: tree.sha,
    parents
  });
  console.log('commit   : ' + commit.sha + '  parent=' + (parents[0] || '(root)'));

  // 5) 更新/创建分支引用
  try {
    await api('PATCH', '/repos/' + REPO + '/git/refs/heads/' + BRANCH, { sha: commit.sha });
  } catch (_) {
    await api('POST', '/repos/' + REPO + '/git/refs', { ref: 'refs/heads/' + BRANCH, sha: commit.sha });
  }
  console.log('pushed   : ' + REPO + ' ' + BRANCH + ' -> ' + commit.sha);
})().catch((e) => { console.error('失败：' + e.message); process.exit(1); });
