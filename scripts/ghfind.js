#!/usr/bin/env node
/**
 * ghfind —— 让 AI 用一条命令完成 GitHub 项目检索
 *
 *   node ghfind.js ask "安卓上的 RSS 阅读器"       自然语言需求 → 检索式 → 打分排序
 *   node ghfind.js search "topic:cli language:rust" 直接给检索式
 *   node ghfind.js repo owner/name                  单仓库体检
 *   node ghfind.js channels                         通道自检
 *
 * 零依赖；通道按「直连 API → gh-proxy 中转」回退；有 GITHUB_TOKEN 时限流 30 次/分钟，否则 10 次/分钟。
 */
'use strict';

const API = 'https://api.github.com';
// 实测结论（2026-11）：api.github.com 在多数网络可达；不可达时这两个中转可转发 API 与 raw
const RELAYS = ['https://gh-proxy.org/', 'https://gh-proxy.com/'];

const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';

/* ---------------- HTTP ---------------- */

async function getJSON(path, timeoutMs) {
  const bases = [API].concat(RELAYS.map((r) => r + API));
  let lastErr;
  for (const base of bases) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs || 12000);
    try {
      const res = await fetch(base + path, {
        signal: ctrl.signal,
        headers: Object.assign(
          { Accept: 'application/vnd.github+json', 'User-Agent': 'ghfind-skill' },
          token ? { Authorization: 'Bearer ' + token } : {}
        )
      });
      if (res.status === 403 || res.status === 429) {
        const body = await res.text();
        if (/rate limit/i.test(body)) {
          throw new Error('RATE_LIMIT' + (token ? '' : '（未设置 GITHUB_TOKEN，匿名仅 10 次/分钟）'));
        }
      }
      if (!res.ok) throw new Error('HTTP ' + res.status + ' @ ' + base);
      return await res.json();
    } catch (e) {
      lastErr = e;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr || new Error('所有通道均失败');
}

/* ---------------- 提示词优化：自然语言 → 检索式 ---------------- */

// 中文需求词 → 英文检索词（GitHub 索引以英文为主，中文词基本搜不到）
const CN2EN = [
  ['阅读器', 'reader'], ['播放器', 'player'], ['编辑器', 'editor'], ['笔记', 'notes'],
  ['下载器', 'downloader'], ['下载工具', 'downloader'], ['截图', 'screenshot'], ['录屏', 'screen recorder'],
  ['代理', 'proxy'], ['网盘', 'cloud storage'], ['云盘', 'cloud storage'], ['爬虫', 'crawler'],
  ['监控', 'monitor'], ['聊天', 'chat'], ['数据库', 'database'], ['博客', 'blog'], ['图床', 'image hosting'],
  ['字幕', 'subtitle'], ['密码管理', 'password manager'], ['文件管理', 'file manager'],
  ['输入法', 'input method'], ['桌面', 'desktop'], ['终端', 'terminal'], ['命令行', 'cli'],
  ['同步', 'sync'], ['备份', 'backup'], ['日历', 'calendar'], ['待办', 'todo'],
  ['书签', 'bookmark'], ['看板', 'kanban'], ['思维导图', 'mind map'], ['流程图', 'diagram'],
  ['浏览器', 'browser'], ['邮箱', 'email'], ['音乐', 'music'], ['视频', 'video'], ['图片', 'image'],
  ['翻译', 'translation'], ['语音', 'speech'], ['识别', 'recognition'], ['压缩', 'compression'],
  ['加密', 'encryption'], ['去广告', 'adblock'], ['广告拦截', 'adblock'], ['脚本', 'script'],
  ['管理后台', 'admin'], ['个人知识库', 'knowledge base'], ['知识库', 'knowledge base'],
  ['文档', 'documentation'], ['建站', 'website builder'], ['静态站', 'static site'],
  ['博客系统', 'blog'], ['论坛', 'forum'], ['网课', 'course'], ['题库', 'quiz']
];

// 中文常见说法 → 技术检索词（命中即追加，不替换原词）
const SYNONYMS = [
  [/命令行|终端|terminal|cli/i, ['cli'], ['topic:cli']],
  [/图形界面|桌面应用|gui/i, ['gui', 'desktop'], ['topic:desktop']],
  [/自托管|自己部署|私有部署|self[- ]?host/i, ['self-hosted'], ['topic:self-hosted']],
  [/无需登录|不用注册|免登录|no login/i, ['self-hosted', 'local-first'], ['topic:self-hosted']],
  [/笔记|note/i, ['notes'], ['topic:notes']],
  [/阅读器|rss/i, ['rss'], ['topic:rss']],
  [/下载器|下载工具|downloader/i, ['downloader'], ['topic:downloader']],
  [/截图|screenshot/i, ['screenshot'], ['topic:screenshot']],
  [/爬虫|crawler|spider/i, ['crawler'], ['topic:crawler']],
  [/代理|proxy|翻墙/i, ['proxy'], ['topic:proxy']],
  [/网盘|云盘|cloud drive/i, ['cloud', 'storage'], ['topic:cloud-storage']],
  [/编辑器|editor/i, ['editor'], ['topic:editor']],
  [/播放器|player/i, ['player'], ['topic:player']],
  [/同步|sync/i, ['sync'], ['topic:sync']],
  [/监控|monitor/i, ['monitor'], ['topic:monitoring']],
  [/建站|博客|blog/i, ['blog'], ['topic:blog']],
  [/聊天|即时通讯|chat/i, ['chat'], ['topic:chat']],
  [/数据库|database/i, ['database'], ['topic:database']],
  [/容器|docker/i, ['docker'], ['topic:docker']],
  [/插件|plugin|extension/i, ['plugin'], ['topic:plugin']]
];

const LANGS = {
  python: 'python', py: 'python', javascript: 'javascript', js: 'javascript', node: 'javascript',
  typescript: 'typescript', ts: 'typescript', java: 'java', go: 'go', golang: 'go', rust: 'rust',
  c: 'c', 'c++': 'cpp', cpp: 'cpp', 'c#': 'csharp', csharp: 'csharp', php: 'php', ruby: 'ruby',
  swift: 'swift', kotlin: 'kotlin', dart: 'dart', shell: 'shell', bash: 'shell', lua: 'lua',
  scala: 'scala', elixir: 'elixir', haskell: 'haskell', zig: 'zig', julia: 'julia'
};

const OS_WORDS = [
  [/android|安卓/i, 'android'],
  [/ios|iphone|ipad/i, 'ios'],
  [/windows|win10|win11/i, 'windows'],
  [/macos|mac os|苹果电脑|mac\b/i, 'macos'],
  [/linux|ubuntu|debian|arch/i, 'linux']
];

// 属性词：描述"怎么做"而非"做什么"，进检索式会稀释主题（问笔记工具时带出 AI 助手等项目）
const ATTR_WORDS = new Set([
  'self-hosted', 'local-first', 'cli', 'gui', 'docker', 'plugin', 'sync', 'desktop',
  'mobile', 'open-source', 'privacy', 'encrypted', 'offline', 'p2p', 'api', 'extension'
]);

/** 把自然语言需求拆成 GitHub 检索式；返回 { q, notes[] } */
function buildQuery(need) {
  const raw = String(need || '').trim();
  const notes = [];
  const words = raw.split(/[\s,，、;；]+/).filter(Boolean);

  // 1) 语言
  let lang = '';
  for (const w of words) {
    const key = w.toLowerCase();
    if (LANGS[key]) { lang = LANGS[key]; notes.push('语言 → ' + lang); break; }
    const cn = w.replace(/语言|写的|开发|实现/g, '');
    if (cn && cn !== w && LANGS[cn.toLowerCase()]) { lang = LANGS[cn.toLowerCase()]; notes.push('语言 → ' + lang); break; }
  }

  // 2) 平台 → topic 近似（GitHub 无 os: 限定符）
  let os = '';
  for (const [re, v] of OS_WORDS) {
    if (re.test(raw)) { os = v; notes.push('平台 → topic:' + v); break; }
  }

  // 3) 同义词与领域 topic
  const topicHits = [];
  const extraWords = [];
  for (const [re, wordsAdd, topicsAdd] of SYNONYMS) {
    if (!re.test(raw)) continue;
    wordsAdd.forEach((w) => { if (!extraWords.includes(w)) extraWords.push(w); });
    topicsAdd.forEach((t) => { if (!topicHits.includes(t)) topicHits.push(t); });
  }

  // 3b) 中文实体词 → 英文检索词
  for (const [cn, en] of CN2EN) {
    if (raw.includes(cn) && !extraWords.includes(en)) extraWords.push(en);
  }
  if (extraWords.length) notes.push('关键词补充 → ' + extraWords.join(' '));

  // 4) 热度 / 活跃度
  const quals = [];
  const niche = /小众|冷门|新项目|试验|个人项目/i.test(raw);
  if (/热门|流行|最火|star多|高星|好用|成熟|稳定/i.test(raw)) {
    quals.push('stars:>1000'); notes.push('成熟度 → stars:>1000');
  } else {
    // 默认给个质量下限：GitHub 有大量几星的半成品，不设下限时排序全是噪声
    quals.push(niche ? 'stars:>5' : 'stars:>50');
    notes.push(niche ? '冷门偏好 → stars:>5' : '默认质量下限 → stars:>50（说「小众」可放宽）');
  }
  if (/最近维护|活跃|在更新|还在更|还在维护|持续维护|新的|最新|近期/i.test(raw)) {
    quals.push('pushed:>' + monthsAgo(6)); notes.push('活跃度 → pushed:>半年前');
  }
  if (/归档|已停止/i.test(raw)) quals.push('archived:false');

  // 5) 关键词：ASCII 实体词 + 中文映射 + 平台词（合并去重，不做 fallback）
  const STOP = /^(我|想|要|找|一个|个|的|能用|可用|好用|推荐|有没有|什么|怎么|帮我|查|搜|下|在|上|用|做|写|和|与|或者|请|给|能|可以|款|工具|项目|开源|免费|开箱即用|轻量|简单|最好|支持|上|里|中|都|也|就|还|很|比较|一些|用来|适合|类似)+$/;
  const asciiWords = words
    .map((w) => w.replace(/[，。！？、；：""''（）()]/g, ''))
    .filter((w) => /^[\x20-\x7e]+$/.test(w) && w.length > 1 && !STOP.test(w) && !LANGS[w.toLowerCase()]);
  const termList = [];
  const seen = new Set();
  const pushTerm = (w) => {
    const k = String(w || '').toLowerCase();
    if (!w || seen.has(k)) return;
    seen.add(k);
    termList.push(w);
  };
  asciiWords.concat(extraWords.filter((w) => !ATTR_WORDS.has(w))).forEach(pushTerm);
  // 平台词优先级最高：被 slice 截断会导致"安卓需求"返回 macOS 项目
  if (os) {
    const withoutOs = termList.filter((w) => w.toLowerCase() !== os);
    termList.length = 0;
    termList.push(os);
    withoutOs.forEach(pushTerm);
    seen.add(os);
  }
  // 全是属性词时（如只说"自托管"）就没有主题词可收敛，此时才把属性词当关键词
  if (!termList.length && extraWords.length) extraWords.slice(0, 2).forEach(pushTerm);
  const terms = termList.slice(0, 3).join(' ');

  // topic：只留一个领域 topic，且不与关键词重复；平台用关键词表达（topic:android 会漏掉未打 topic 的项目）
  const topicQual = (topicHits[0] && !termList.includes(topicHits[0].replace(/^topic:/, ''))) ? topicHits[0] : '';

  const q = [terms, lang ? 'language:' + lang : '', topicQual, quals.join(' ')]
    .filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  return { q, notes, terms, lang, os };
}

function monthsAgo(n) {
  const d = new Date(Date.now() - n * 30 * 864e5);
  return d.toISOString().slice(0, 10);
}

/* ---------------- 打分 ---------------- */

function score(repo, ctx) {
  const stars = repo.stargazers_count || 0;
  let s = Math.log10(stars + 1) * 10;

  const pushed = Date.parse(repo.pushed_at || '') || 0;
  const days = (Date.now() - pushed) / 864e5;
  if (days < 30) s += 15;
  else if (days < 180) s += 8;
  else if (days > 540) s -= 15;

  if (repo.archived) s -= 25;
  if (repo.description) s += 4;
  if (repo.license && repo.license.spdx_id && repo.license.spdx_id !== 'NOASSERTION') s += 4;
  if ((repo.topics || []).length) s += 3;
  if (repo.homepage) s += 2;
  if (repo.fork) s -= 20;

  // 平台相关性：需求里点名了平台而项目正好匹配，加分（否则 Web 项目会因 star 多挤掉移动端项目）
  if (ctx && ctx.os) {
    const hay = (repo.name + ' ' + (repo.description || '') + ' ' + (repo.topics || []).join(' ')).toLowerCase();
    if (hay.indexOf(ctx.os) !== -1) s += 8;
  }
  return Math.round(s * 10) / 10;
}

function why(repo) {
  const bits = [];
  bits.push(fmt(repo.stargazers_count) + '★');
  if (repo.language) bits.push(repo.language);
  bits.push(repo.pushed_at ? '近' + sinceText(repo.pushed_at) + '更新' : '未知更新');
  if (repo.archived) bits.push('已归档');
  if (repo.license && repo.license.spdx_id && repo.license.spdx_id !== 'NOASSERTION') bits.push(repo.license.spdx_id);
  return bits.join(' · ');
}

const fmt = (n) => (n >= 10000 ? (n / 1000).toFixed(1) + 'k' : n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n || 0));

function sinceText(iso) {
  const d = Math.floor((Date.now() - (Date.parse(iso) || 0)) / 864e5);
  if (d <= 1) return '1天';
  if (d < 30) return d + '天';
  if (d < 365) return Math.round(d / 30) + '个月';
  return Math.round(d / 365) + '年';
}

/* ---------------- 命令 ---------------- */

function render(list, meta) {
  const out = [];
  if (meta) out.push('检索式：`' + meta.q + '`' + (meta.notes && meta.notes.length ? '\n推断：' + meta.notes.join('；') : ''));
  out.push('');
  out.push('| # | 项目 | 说明 | 活跃度 | 分数 |');
  out.push('| - | --- | --- | --- | --- |');
  list.forEach((r, i) => {
    const desc = (r.description || '').replace(/\|/g, '/').slice(0, 90);
    out.push('| ' + (i + 1) + ' | [' + r.full_name + '](https://github.com/' + r.full_name + ') | ' +
      desc + ' | ' + why(r) + ' | ' + score(r, meta) + ' |');
  });
  return out.join('\n');
}

async function cmdSearch(q, limit, asJson, ctx) {
  ctx = ctx || {};
  const path = '/search/repositories?q=' + encodeURIComponent(q) +
    '&sort=stars&order=desc&per_page=100';
  const res = await getJSON(path);
  const items = (res.items || []).slice().sort((a, b) => score(b, ctx) - score(a, ctx)).slice(0, limit);
  if (asJson) {
    console.log(JSON.stringify({ q, total: res.total_count, items }, null, 2));
    return;
  }
  console.log('# 命中 ' + fmt(res.total_count) + ' 个仓库，取前 ' + items.length + '\n');
  console.log(render(items, { q, os: ctx.os }));
}

async function cmdAsk(need, limit, asJson) {
  const built = buildQuery(need);
  if (!built.q) throw new Error('无法从需求中提取关键词：' + need);
  if (asJson) {
    console.log(JSON.stringify({ need, built }, null, 2));
    return;
  }
  await cmdSearch(built.q, limit, false, built);
  if (built.q !== need.trim()) {
    console.log('\n> 原始需求：' + need);
  }
}

async function cmdRepo(full) {
  const [o, r] = String(full).split('/');
  if (!o || !r) throw new Error('用法：repo owner/name');
  const repo = await getJSON('/repos/' + o + '/' + r);
  const rel = await getJSON('/repos/' + o + '/' + r + '/releases?per_page=1').catch(() => []);
  const line = [
    '**' + repo.full_name + '**  ' + (repo.description || '(无描述)'),
    '- 链接：https://github.com/' + repo.full_name + (repo.homepage ? '　主页：' + repo.homepage : ''),
    '- ' + why(repo) + ' · 分数 ' + score(repo),
    '- Fork/Issue：' + fmt(repo.forks_count) + ' / ' + fmt(repo.open_issues_count) +
      '　默认分支：' + repo.default_branch + '　大小：' + fmt(repo.size) + ' KB',
    '- 最新发行版：' + (rel && rel[0] ? rel[0].tag_name + '（' + (rel[0].published_at || '').slice(0, 10) + '）' : '无')
  ];
  if (repo.archived) line.push('- ⚠ 该仓库已归档，不再维护');
  console.log(line.join('\n'));
}

async function cmdChannels() {
  for (const base of [API].concat(RELAYS.map((r) => r + API))) {
    const t0 = Date.now();
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
      const res = await fetch(base + '/rate_limit', {
        signal: ctrl.signal,
        headers: Object.assign({ Accept: 'application/vnd.github+json', 'User-Agent': 'ghfind-skill' },
          token ? { Authorization: 'Bearer ' + token } : {})
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const j = await res.json();
      const s = j.resources && j.resources.search;
      console.log('OK   ' + base + '  ' + (Date.now() - t0) + ' ms  搜索额度 ' +
        (s ? s.remaining + '/' + s.limit : '?') + (token ? '' : '（匿名）'));
    } catch (e) {
      console.log('FAIL ' + base + '  ' + (e.message || e));
    }
  }
}

/* ---------------- 入口 ---------------- */

(async () => {
  const argv = process.argv.slice(2);
  const cmd = argv[0];
  const asJson = argv.includes('--json');
  const limIdx = argv.indexOf('--limit');
  const limit = limIdx > 0 ? Math.max(1, Number(argv[limIdx + 1]) || 8) : 8;
  const rest = argv.slice(1).filter((a, i, arr) => a !== '--json' && a !== '--limit' && arr[i - 1] !== '--limit');
  const arg = rest.join(' ').trim();

  try {
    if (cmd === 'ask') { if (!arg) throw new Error('用法：ask "自然语言需求" [--limit N]'); await cmdAsk(arg, limit, asJson); }
    else if (cmd === 'search') { if (!arg) throw new Error('用法：search "github 检索式"'); await cmdSearch(arg, limit, asJson); }
    else if (cmd === 'repo') { await cmdRepo(arg); }
    else if (cmd === 'channels') { await cmdChannels(); }
    else {
      console.log('ghfind —— GitHub 项目检索\n\n' +
        '  node ghfind.js ask "安卓上的 RSS 阅读器"      自然语言 → 检索式 → 排序\n' +
        '  node ghfind.js search "topic:cli language:rust"  直接检索\n' +
        '  node ghfind.js repo owner/name                  单仓库体检\n' +
        '  node ghfind.js channels                         通道与额度自检\n' +
        '\n选项：--limit N（默认 8）、--json（机器可读）\n' +
        '环境：GITHUB_TOKEN / GH_TOKEN 可选，带 token 时搜索限流 30 次/分钟');
    }
  } catch (e) {
    console.error('错误：' + (e.message || e));
    process.exit(1);
  }
})();
