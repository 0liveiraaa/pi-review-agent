# Pi 复习助手

AI-driven course review assistant that runs as a **pi-agent extension**.

在 pi-agent TUI 中通过 `/review`、`/review-init`、`/review-fix` 命令进行结构化复习。支持三种模式：概念卡片+练习、直接做题、章节笔记学习。

---

## 快速开始

**本地开发体验（推荐）：**

```bash
cd workspace
npm install
npm run setup-review
pi
```

**作为 pi package 安装：**

```bash
# 从本地路径安装
pi install ./workspace

# 或从 git 安装
pi install git@github.com:0liveiraaa/pi-review-agent.git
```

进入 pi 后：

```
/review                  # 选择一个 active profile 开始复习
```

首次体验推荐选择 `学习方法 Demo` profile，三种模式都可以尝试。

## 其他命令

| 命令 | 用途 |
|------|------|
| `/review` | 选择 profile → 模式 → 范围 → 开始复习 |
| `/review-init` | 从 Markdown/txt 笔记创建 draft 复习资料包 |
| `/review-fix` | 修订资料包 draft，或从 active profile 创建修订草稿 |

## 复习模式

| 模式 | 流程 |
|------|------|
| 概念卡片 + 练习 | `review_card` 展示卡片 → 生成题目 → `review_answer` → 判题 → `review_archive` |
| 直接练习 | `review_exam_points` 展示考点 → 生成题目 → 判题 → 归档 |
| 章节笔记学习 | `review_chapter` 展示小节 → 生成题目 → 判题 → 归档 |

三种模式统一使用 `review_turn_action` 题后菜单（下一题/提示/追问/提高难度/总结/退出）。

## 项目结构

```
workspace/
├── extensions/review/index.ts         ← 入口：注册所有 review 命令和工具
├── skills/                            ← 14 个 SKILL.md（review-core, review-question, ...）
├── review.config.json                 ← 默认课程配置
├── profiles/                          ← 内置只读 profile 模板（demo-review）
│   └── demo-review/                   ← 学习方法 Demo（模板，随包发布）
├── lib/                               ← 核心库（状态、卡片、章节、profile、题目）
├── scripts/                           ← setup-review / check-package / reset-demo-profile
├── review_profiles/                   ← 用户复习资料包（DATA_ROOT，.gitignore 排除）
│   ├── cpp-oop/                       ← C++ 面向对象程序设计 profile（active）
│   └── demo-review/                   ← 内置新手体验 profile（active，从 templates 复制）
├── docs/开发文档/                     ← 开发文档
├── data/knowledge_index.json          ← 知识点索引（20章74个知识点）
├── state/                             ← 运行时状态（.gitignore 排除）
├── archive/                           ← 答题归档（.gitignore 排除）
├── package.json                       ← pi package manifest
└── test/
```

## Profile 生命周期

```
draft (可编辑) → active (可复习) → archived (被替代)
```

- `draft` — 通过 `/review-init` 创建或 `/review-fix` 修订
- `active` — 通过 `review_profile_enable` 启用后可使用 `/review`
- `archived` — active profile 被修订版替代后自动标记

修订 active profile 时自动创建 `{profile}__draft_{date}` 副本，确认启用后再替换，原 active 标记为 archived 以支持回滚。

## 开发

```bash
npm run check            # 语法检查所有 lib 模块
npm test                 # 运行单元测试（22 tests）
npm run setup-review     # doctor 检查
npm run check-package    # pi package 完整性检查
```

## 依赖

- Node.js >= 22
- pi-agent（`npm install -g @earendil-works/pi-coding-agent`）
- 一个可用的 LLM API key（在 pi 中配置）
