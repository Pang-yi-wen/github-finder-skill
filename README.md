# GitHub Finder Skill

给 AI 用的 GitHub 项目检索技能：把"我想找个能做 X 的开源项目"这种话，一次命令变成一份带理由的候选清单。

```
node scripts/ghfind.js ask "安卓上的 RSS 阅读器，免费开源，最近还在维护" --limit 6
```

```
检索式：`android topic:rss stars:>50 pushed:>2026-05-15`

| # | 项目 | 说明 | 活跃度 | 分数 |
| - | --- | --- | --- | --- |
| 1 | NewsBlur | personal news reader ... | 7.7k★ · HTML · 近1天更新 · MIT | 74.9 |
| 2 | Feeder | Android feed reader app | 3.1k★ · Kotlin · 近2天更新 · GPL-3.0 | 69 |
| 3 | capyreader | A smallish Android RSS reader | 1.5k★ · Kotlin · 近1天更新 · GPL-3.0 | 67.7 |
```

## 它解决什么

AI 直接调 GitHub API 找项目，通常卡在三件事：**不会把中文需求转成检索式**、**不会在多条网络通道间回退**、**给不出排序理由**。这个技能把三件事固定下来：

1. **提示词优化**：中文实体词 → 英文主题词（内置约 100 条映射）；"热门/小众/最近维护"→ `stars:`/`pushed:` 限定符；平台词优先保留（GitHub 没有 `os:` 限定符，用 `topic:` 会漏项目）。
2. **通道回退**：直连 `api.github.com` → `gh-proxy.org` → `gh-proxy.com`，失败自动换路。
3. **打分排序**：星数（对数）、活跃度、完整度（描述/许可证/topics/主页）、归档与 fork 惩罚、平台匹配加分。

## 安装

作为 WorkBuddy 技能使用：把本目录放到 `~/.workbuddy/skills/github-finder-skill/`（或直接克隆到那里）。

```bash
git clone https://github.com/Pang-yi-wen/github-finder-skill.git ~/.workbuddy/skills/github-finder-skill
```

要求：Node 18+（用内置 fetch），零第三方依赖。

## 命令

| 命令 | 用途 |
| --- | --- |
| `node scripts/ghfind.js ask "<自然语言需求>"` | 主命令：需求 → 检索式 → 排序清单 |
| `node scripts/ghfind.js search "<检索式>"` | 自己控制检索式 |
| `node scripts/ghfind.js repo owner/name` | 单仓库体检（归档/许可证/发行版/Issue） |
| `node scripts/ghfind.js channels` | 三条通道连通性与搜索额度 |

选项：`--limit N`、`--json`。

## 令牌与限流

```bash
export GITHUB_TOKEN=ghp_xxx   # 可选
```

搜索接口：带令牌 30 次/分钟，匿名 10 次/分钟。不带令牌也能用，连续查几次就会被限流。

## 实测记录

三类真实需求（2026-11-12，直连通道）：

| 需求 | 检索式 | 首条结果 |
| --- | --- | --- |
| 安卓上的 RSS 阅读器 | `android topic:rss stars:>50 pushed:>2026-05-15` | NewsBlur / Feeder / capyreader |
| rust 写的终端编辑器 | `vim cli editor language:rust stars:>50` | evil-helix / nevi |
| 无需登录的笔记工具 | `notes topic:self-hosted stars:>50` | memos / Trilium / karakeep |

## 已知边界

- GitHub 搜索最多返回前 1000 条；仓库搜索默认**不搜 README**（需 `in:readme`）。
- 平台筛选是关键词/topic 近似，GitHub 没有官方 `os:` 限定符。
- 星数不等于质量，归档项目会扣分但仍可能出现，答复时应提示。

更细的语法与坑见 [`references/syntax.md`](references/syntax.md)。

## 许可

MIT
