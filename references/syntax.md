# GitHub 检索语法速查（含实测坑）

只列对"找项目"有用的部分。GitHub 官方文档：<https://docs.github.com/search-github>

## 仓库搜索常用限定符

| 限定符 | 含义 | 例 |
| --- | --- | --- |
| `language:` | 主语言 | `language:rust` |
| `stars:` / `forks:` | 数值或区间 | `stars:>1000`、`stars:10..50` |
| `pushed:` | 最后推送时间 | `pushed:>2026-01-01`、`pushed:>2025-12-01` |
| `created:` | 创建时间 | `created:>2026-01-01` |
| `updated:` | 最后更新时间（含 issue 等） | `updated:>2026-06-01` |
| `topic:` | 仓库 topic | `topic:cli`、`topic:self-hosted` |
| `in:name` / `in:description` / `in:readme` / `in:topics` | 限定字段 | `gui in:name` |
| `archived:false` | 排除已归档 | `archived:false` |
| `fork:false` | 排除 fork | `fork:false` |
| `license:mit` | 许可证 | `license:mit` |
| `size:` | 仓库大小 KB | `size:<1000` |

## 布尔与短语

- 空格 = AND：`rss android` 两个词都要命中。
- `OR`（必须大写）：`topic:rss OR topic:feed`。
- 排除：`web -django`。
- 短语：`"exact phrase"`。

## 实测坑（2026-11 验证）

1. **默认不搜 README**。`smoke.js` 默认命中 300，`smoke.js in:readme` 命中 556,878 —— 差三个数量级。
   搜文档内容必须显式 `in:readme`；或用代码搜索（`/search/code`）搜文件正文。
2. **最多 1000 条**。`per_page × page ≤ 1000`，任何客户端都一样；想要更多只能加限定符收敛。
3. **`topic:` 之间是 AND**。`topic:android topic:rss` 要求两个 topic 都有，命中数会骤降。
   平台 + 领域同时限制时，用关键词表达平台更稳（本技能的做法）。
4. **没有 `os:` 限定符**。Windows/macOS/Linux 只能靠 `topic:` 或关键词近似。
5. **中文关键词几乎搜不到**。GitHub 索引以英文为主，需求里的中文实体词必须先映射成英文
   （本技能内置约 100 条映射，见 `scripts/ghfind.js` 的 `CN2EN`）。
6. **限流分接口**。搜索接口：带令牌 30 次/分钟，匿名 10 次/分钟；核心接口（取仓库详情）额度更高。
   `403 + "rate limit"` 才是限流，其余 403 多是权限问题。
7. **多个限定符会互相收紧**：`stars:>1000` + `pushed:>半年前` + 3 个主题词，很容易 0 结果。
   查不到时先减少主题词，再降 stars 下限。

## 打分规则（脚本内置）

```
分数 = log10(stars+1)*10
     + 活跃度（<30天 +15，<180天 +8，>540天 -15）
     + 完整度（有描述 +4，有许可证 +4，有 topics +3，有主页 +2）
     - 惩罚（archived -25，fork -20）
     + 平台匹配（需求点名平台且项目命中 +8）
```

分数只用于排序，最终是否推荐由 AI 结合描述判断。

## 搜索额度查询

```bash
curl -s -H "Authorization: Bearer $GITHUB_TOKEN" https://api.github.com/rate_limit | \
  node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);console.log(j.resources.search)})"
```
