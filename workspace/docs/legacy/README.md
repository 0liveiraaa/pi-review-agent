# 旧版 CLI 归档

此目录包含期末复习助手的早期 CLI 版本，已由 pi-agent extension (`/review` 命令) 取代。

## 文件说明

| 文件 | 说明 | 状态 |
|------|------|------|
| `review_cli.mjs` | CLI 主入口 (Node.js, pi SDK 版) | 旧版 |
| `review_cli.py` | CLI 主入口 (Python, pi subprocess 版) | 旧版 |
| `lib/session.mjs` | pi SDK AgentSession 封装 | 旧版 |
| `lib/terminal.mjs` | Markdown→ANSI 终端渲染 | 旧版 |

## 核心库 (仍在 `workspace/lib/` 中活跃)

以下模块由新 extension 和旧 CLI **共享**，保留在原位：

- `lib/state.mjs` — 状态管理 (进度/错题本/知识链)
- `lib/cards.mjs` — 概念卡片加载
- `lib/chapters.mjs` — 章节笔记解析
- `lib/review_engine.mjs` — 复习引擎
- `lib/review_config.mjs` — 配置加载
- `lib/review_question.mjs` — 题目规范化
- `lib/review_profiles.mjs` — Profile CRUD
- `lib/review_materials.mjs` — 章节材料加载

## 运行说明

旧 CLI 已不再维护。如需尝试运行：

```bash
cd docs/legacy
# 调整 import paths (./lib/ → ../lib/ 或 ./)
# npm install 仍需在 workspace/ 执行
node review_cli.mjs
```
