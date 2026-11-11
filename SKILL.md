---
name: github-finder-skill
version: "1.0.0"
display_name: "GitHub 项目检索（AI 用）"
display_name_en: "GitHub Project Finder for AI"
description: "让 AI 一条命令完成 GitHub 项目检索：把用户的自然语言需求（中文或英文）解析成 GitHub 检索式，经镜像通道查询，按星数/活跃度/完整度打分排序，输出可直接转述的候选清单。当用户说「找一个能做 X 的开源项目」「有没有替代 Y 的工具」「推荐个 Z 语言的库」「GitHub 上搜一下」「哪个项目在维护」时使用。"
description_zh: "自然语言需求 → GitHub 检索式 → 镜像通道查询 → 打分排序，一条命令出候选项目清单，供 AI 直接引用。"
description_en: "Turn a plain-language need into a GitHub search query, run it over direct + relay channels, score and rank repos, print a citable shortlist."
triggers: 找一个 xxx 的开源项目；有没有替代 xxx 的工具；推荐一个 python 写的数据抓取库；GitHub 上搜一下 xxx；这个领域哪个项目还在维护
allowed-tools: Bash,Read
metadata:
  author: "Pang-yi-wen"
  date: "2026-11-12"
---

# GitHub 项目检索（给 AI 用）

> **一句话**：用户说人话，你跑一条命令，拿回一份带理由的项目清单。
> **特点**：零依赖（Node 18+ 内置 fetch）、通道自动回退（直连 API → gh-proxy 中转）、提示词自动优化、结果打分排序。

## 何时用

- 用户想找"能做某件事"的开源项目，而不是指名道姓找某个仓库。
- 用户问"有没有替代 X 的工具"、"推荐个 Y 语言的 Z"、"哪个项目还在维护"。
- 需要给用户一份**有理由**的候选清单（星数、活跃度、许可证），而不是一串链接。

不该用：已经知道仓库名 → 直接用 `gh` 或 API 取该仓库；只想看热门榜 → 用 trending 类技能。

## 30 秒上手

```bash
# 1) 自然语言直接查（推荐：交给脚本做提示词优化）
node scripts/ghfind.js ask "安卓上的 RSS 阅读器，免费开源，最近还在维护" --limit 6

# 2) 自己写好检索式
node scripts/ghfind.js search "topic:cli language:rust stars:>3000" --limit 8

# 3) 单个仓库体检（判断值不值得推荐给用户）
node scripts/ghfind.js repo scrapy/scrapy

# 4) 环境自检：三条通道是否通、搜索额度还剩多少
node scripts/ghfind.js channels
```

选项：`--limit N`（默认 8）、`--json`（机器可读，便于你再加工）。

**令牌**（可选但强烈建议）：`export GITHUB_TOKEN=...`。带令牌搜索限流 30 次/分钟，匿名只有 10 次/分钟。
没有令牌也能跑，但连续查三四次就可能被限流。

## 提示词优化规则（脚本已内置，你需要知道它做了什么）

脚本把用户的话拆成四类信息：

| 用户说法 | 转换为 | 说明 |
| --- | --- | --- |
| 安卓 / iOS / Windows / macOS / Linux | 关键词（优先位） | GitHub 没有 `os:` 限定符，用 `topic:` 会漏掉未打 topic 的项目 |
| python / rust / js … | `language:xxx` | 中英文都认 |
| 阅读器 / 播放器 / 编辑器 / 笔记 … | 英文主题词 | 内置约 100 条中文→英文映射；纯中文词直接进检索式基本搜不到 |
| 热门 / 成熟 / 好用 | `stars:>1000` | 未提及时默认 `stars:>50`，过滤几星的半成品 |
| 小众 / 冷门 / 新项目 | `stars:>5` | 放宽下限 |
| 最近维护 / 活跃 / 还在更新 | `pushed:>半年前` | 活跃度过滤 |

两个刻意设计：

- **属性词不进关键词**：`self-hosted`、`local-first`、`cli`、`sync` 这类描述"怎么做"的词会稀释主题（问笔记工具时把 AI 助手带出来），只保留"做什么"的主题词。
- **主题词最多 3 个**：GitHub 关键词之间是 AND，词越多越容易 0 结果。

## 怎么用结果（给用户答复时）

脚本输出一张表 + 每个项目的理由（星数 · 语言 · 最近更新 · 许可证 · 分数）。撰写回答时：

1. **先给 2–4 个最合适的**，不要照抄全部；对每个说清"为什么适合这个需求"。
2. 分数只是排序参考，**相关性由你判断**——表里可能有边缘项目（如问安卓应用时出现同名的 Web 项目），用描述判断后剔除或标注。
3. 需要判断"能不能真的用"时，对候选跑 `repo owner/name`：看是否归档、许可证、Issue 数、是否有发行版。
4. 用户要"最新/活跃"时，别只看星数——看"近 N 天更新"那一列。

## 通道与失败处理

1. 先直连 `api.github.com`；失败依次走 `gh-proxy.org`、`gh-proxy.com` 前缀中转（同一密钥，请求头会经过中转）。
2. 报 `RATE_LIMIT` → 告诉用户"搜索接口限流（30 次/分钟）"，等一分钟或设置令牌；**不要**改成逐页抓取硬刷。
3. 全通道失败 → 说明当前网络到 GitHub 不通，建议改用网络类技能（如 github-web-skill）恢复后再查。
4. 命中 0 个 → 先看脚本打印的"检索式"和"推断"：通常是主题词过多或 `stars` 下限过高。放宽后重查，别直接告诉用户"没有"。

## 边界

- GitHub 搜索只返回**前 1000 条**结果，翻页再多也拿不到；总量大时靠加限定符收敛。
- 仓库搜索默认**不含 README 正文**，要搜 README 里的词必须加 `in:readme`。
- 星数不等于质量；归档项目（`archived`）已扣分，但仍可能出现，答复时要提示。
- 用法与实测记录见 `references/syntax.md`。
