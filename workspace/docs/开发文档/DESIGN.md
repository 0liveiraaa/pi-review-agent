# Pi Review 复习助手 — 项目设计文档

> 版本: v4.0
> 日期: 2026-06-06
> 架构: pi-agent extension
> 入口: `.pi/extensions/review/index.ts`

---

## 1. 架构概述

本复习助手以 **pi-agent extension** 形态运行，所有交互在 pi-agent TUI 中完成。

```
用户 → pi-agent TUI → review extension (index.ts)
                           ├── Commands: /review, /review-init, /review-fix
                           └── Tools: review_card, review_answer, review_archive, ...
                                → lib/*.mjs (状态/卡片/profile/题目)
                                → .pi/skills/*/SKILL.md (注入 agent prompt)
```

### 1.1 架构特点

| 特点 | 说明 |
|------|------|
| **Extension 驱动** | 所有命令和工具通过 `pi.registerCommand()` / `pi.registerTool()` 注册 |
| **代码渲染 UI** | 卡片、章节、考点、题后菜单由代码工具渲染，agent 只负责生成题目内容和判题 |
| **Profile 生命周期** | `draft → active → archived`，修订 active 时自动创建 draft 副本 |
| **Skill 注入** | `review-core` 主规则强制注入每个 prompt，子技能按阶段参考 |
| **Typebox 校验** | 所有工具参数用 `Type.Object()` 做运行时 JSON schema 校验 |

### 1.2 技术栈

```
pi-agent (pi-coding-agent v0.78)
  └── extension: .pi/extensions/review/index.ts (TypeScript, ~1000行)
        ├── pi-tui (@earendil-works/pi-tui)     ← SelectList, Editor, Container
        ├── typebox                              ← 工具参数 schema 校验
        └── lib/*.mjs                            ← 业务逻辑 (8个ESM模块)

Node.js ≥22
```

### 1.3 项目结构

```
workspace/
├── .pi/
│   ├── extensions/review/index.ts     ← 主入口（唯一）
│   ├── skills/                        ← 14 个 SKILL.md
│   │   ├── review-core/               ← 主规则：运行时契约、工具路由、模式流程
│   │   ├── review-question/           ← 出题规则（难度体系、题型模板）
│   │   ├── review-grade/              ← 判题格式
│   │   ├── review-discuss/            ← 讨论规则
│   │   ├── review-summary/            ← 复盘 JSON 格式 + 会话总结模板
│   │   ├── review-init/               ← 资料包初始化
│   │   ├── review-fix/               ← 资料包修订
│   │   └── review-profile-*/          ← profile 构建子技能（结构/索引/卡片/考点/质量）
│   └── review.config.json             ← 默认课程配置
├── lib/                               ← 核心库（8 模块）
│   ├── state.mjs                      ← 状态文件 I/O、归档、会话管理
│   ├── cards.mjs                      ← 概念卡片加载（fuzzy 文件名匹配）
│   ├── chapters.mjs                   ← 章节笔记扫描（YAML frontmatter 解析）
│   ├── review_config.mjs              ← 配置加载与路径解析
│   ├── review_engine.mjs              ← 复习目标解析、prompt 构建
│   ├── review_question.mjs            ← 题目规范化、多选题答案解析
│   ├── review_profiles.mjs            ← Profile CRUD（创建/加载/写入/启用/修订）
│   └── review_materials.mjs           ← 章节材料和考点总结加载
├── review_profiles/                   ← 复习资料包
│   ├── cpp-oop/                       ← C++ 面向对象程序设计（active）
│   └── demo-review/                   ← 学习方法 Demo（active，新手体验用）
├── scripts/setup-review.mjs           ← 环境完整性 doctor
├── test/review_core.test.mjs          ← 单元测试（21 tests）
├── data/knowledge_index.json          ← 知识点索引
├── state/                             ← 运行时状态（gitignored）
├── archive/                           ← 答题归档（gitignored）
└── docs/开发文档/                  ← 开发文档
    ├── DESIGN.md                      ← 本文件
    ├── profile_schema.md              ← Profile 结构规范
    ├── card_schema.md                 ← 概念卡片结构规范
    ├── SYSTEM.reference.md            ← 旧版 SYSTEM.md（历史参考）
    └── review.md                      ← 开源本地化复核报告
```

---

## 2. Extension 入口

### 2.1 注册的命令

| 命令 | 触发 | 流程 |
|------|------|------|
| `/review` | 用户输入 | TUI 选择 profile → 模式 → 范围 → 题型 → 发送 prompt 给 agent |
| `/review-init` | 用户输入 | 输入源目录和科目名 → 创建 draft profile → 发送 init prompt 给 agent |
| `/review-fix` | 用户输入 | 选择 profile → 输入反馈 → active 则先创建 revision draft → 发送 fix prompt 给 agent |

所有命令 prompt 都通过 `injectReviewCore()` 强制注入 `review-core` 主规则。

### 2.2 注册的工具

| 工具 | agent 角色中调用 | 职责 |
|------|-----------------|------|
| `review_card` | 模式 1 出题前 | 在 TUI 中渲染知识点卡片，返回 `practice/next_card/skip/exit` |
| `review_exam_points` | 模式 2 出题前 | 渲染章节考点总结，返回 `practice/skip/exit` |
| `review_chapter` | 模式 3 出题前 | 渲染章节或小节材料，返回 `practice/next_section/skip/exit` |
| `review_answer` | 出题后 | 渲染结构化题目并收集用户答案 |
| `review_archive` | 判题+讨论后 | 归档题目答案，更新进度/错题本/知识链 |
| `review_turn_action` | 归档后**必须**调用 | 显示统一题后菜单（下一题/看卡片/看章节/提示/追问/提高难度/总结/退出） |
| `review_summary` | 用户要求总结时 | 保存 session 总结报告 |
| `review_profile_write` | 初始化/修订时 | 安全写入 draft profile 文件（拒绝非 draft） |
| `review_profile_enable` | 用户确认启用时 | 将 draft 切换为 active（替换 active 时归档原版） |

### 2.3 工具契约

每个工具都有 typebox schema 校验，agent 必须传入结构化参数。关键契约：

```
review_answer 需要的题目 JSON:
  { type, question_text, options?, correct_answer, knowledge_points, difficulty, explanation_l1, source_basis }

review_archive 需要的归档数据:
  { user_answer, is_correct, grading?, discussion_summary?, knowledge_chain_l3?, ... }

review_card 返回:
  { action: "practice" | "next_card" | "skip" | "exit", knowledge_point_id, card_found }

review_turn_action 返回:
  { action: "next_question" | "show_card" | "show_chapter" | "hint" | "discuss" | "increase_difficulty" | "summary" | "exit" }
```

---

## 3. 复习模式与流程

### 3.1 三种模式

| 模式 | ID | 前置代码工具 | 流程 |
|------|-----|-------------|------|
| 概念卡片+练习 | `card_practice` | `review_card` | 卡片展示 → 生成题目 → `review_answer` → 判题 → 讨论 → `review_archive` → `review_turn_action` |
| 直接练习 | `practice` | `review_exam_points`（有章节时） | 考点展示 → 出题 → 判题 → 归档 → 题后菜单 |
| 章节笔记学习 | `chapter_study` | `review_chapter` | 材料展示 → 出题 → 判题 → 归档 → 题后菜单 |

### 3.2 单题生命周期 (agent 视角)

```
1. Read profile 资料 (subject.md, knowledge_index.json)
2. 按模式调用前置代码工具 (review_card / review_exam_points / review_chapter)
3. 返回 practice → 参考 review-question 生成一题结构化 JSON
4. 调用 review_answer → TUI 渲染 → 用户作答
5. 参考 review-grade 判题 + L1 解析
6. 可选讨论 (参考 review-discuss)
7. 调用 review_archive 归档
8. 调用 review_turn_action 获取下一步
9. 循环或退出
```

### 3.3 上下文管理

上下文由 pi-agent 自动管理（auto-compact）。extension 不做手动 compact 调用。初始 prompt 通过 `review-core` 主规则注入运行时契约。

---

## 4. Profile 系统

### 4.1 生命周期

```
draft ──(review_profile_enable)──→ active ──(被修订版替代)──→ archived
                                      │
                                      └──(/review-fix)──→ {id}__draft_{date} (draft)
```

- `draft` — 可编辑，`/review` 不显示
- `active` — 不可编辑，`/review` 可选
- `archived` — 历史版本，保留在磁盘用于回滚

### 4.2 Profile 目录结构

```
review_profiles/{subject_id}/
├── profile.json              ← subjectId, name, status, paths, revision metadata
├── subject.md                ← 科目描述和考试目标
├── knowledge_index.json      ← { chapters: { "1": { title, knowledge_points: [...] } } }
├── cards/                    ← 知识点卡片 *.md
├── chapters/                 ← 章节笔记 *.md
├── exam_points/              ← 考点总结 *.md
├── source_map.json           ← 源文件映射
└── quality_report.md         ← 质量评估报告
```

### 4.3 知识索引结构

```json
{
  "chapters": {
    "1": {
      "title": "章节标题",
      "knowledge_points": [
        {
          "id": "kp_stable_id",
          "name": "知识点名称",
          "aliases": ["别名"],
          "tags": ["tag"],
          "question_types": ["choice", "judgment", "short_answer"],
          "difficulty_baseline": "S-U",
          "related": ["kp_other"],
          "common_misconceptions": ["常见误区"],
          "generation_hints": "出题提示"
        }
      ]
    }
  }
}
```

---

## 5. 题目体系

### 5.1 题型

| 题型 | 代码 | 适用难度 |
|------|------|----------|
| 正误判断 | judgment | S-R, S-U |
| 单项选择 | choice | S-U, M-U, M-A |
| 多项选择 | multi_choice | M-U, M-A |
| 简述题 | short_answer | M-A, C-A |

### 5.2 难度矩阵 (5 级)

| 级别 | 广度 × 认知 | 含义 |
|------|-------------|------|
| S-R | Single × Recall | 单一知识点记忆/识别 |
| S-U | Single × Understand | 单一知识点理解/区分 |
| M-U | Multi × Understand | 2-3 关联概念比较 |
| M-A | Multi × Analyze | 多概念综合推理 |
| C-A | Chain × Analyze | 知识链条综合 |

### 5.3 难度自适应

- 自动: 正确率 ≥80% 升级，<50% 降级
- 手动: 题后菜单选择「提高难度」或 agent 调用 `review_turn_action: increase_difficulty`
- 基线: 每个知识点有 `difficulty_baseline`

---

## 6. 数据设计

### 6.1 状态文件 (state/)

| 文件 | 内容 |
|------|------|
| `progress.json` | 当前 session + 历史汇总 |
| `wrong_book.json` | 错题记录 + 错误类型统计 |
| `knowledge_chains.json` | 跨知识点关联 |
| `card_progress.json` | 卡片 seen/practice/correct 统计 |

### 6.2 归档结构 (archive/)

```
archive/
├── sessions/{session_id}/
│   ├── q_20260605_001.json    # 结构化归档
│   └── q_20260605_001.md      # 可读 MD
└── summaries/
    └── {session_id}_总结.md   # session meta-复盘
```

### 6.3 知识点索引 (data/knowledge_index.json)

覆盖 20 章 74 个知识点。每个知识点含 id、name、aliases、tags、question_types、difficulty_baseline、related、common_misconceptions、generation_hints。

---

## 7. Skill 体系

14 个 skill 按角色分类：

| 角色 | Skill | 用途 |
|------|-------|------|
| **主规则** | review-core | 运行时契约、工具路由、模式流程、profile 生命周期 |
| **核心** | review-question / grade / discuss / summary | 出题/判题/讨论/复盘 |
| **初始化** | review-init / fix | 资料包创建和修订 |
| **子 skill** | review-profile-{structure,index,cards,exam-points,quality} | profile 构建各环节 |

review-core 通过 `injectReviewCore()` 强制注入每个命令 prompt。子 skill 由 agent 按阶段通过 `/skill:xxx` 参考引用。

---

## 8. 设计决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 运行形态 | pi-agent extension | 复用 pi TUI、上下文管理、认证体系 |
| 交互入口 | `/review` 命令 | 零配置启动，首次体验可选 demo profile |
| UI 渲染 | 代码工具 (pi-tui) | 一致性、可控性、避免 agent 自由发挥 |
| Profile 安全 | draft 只写 + revision 副本 | 防止意外破坏 active profile |
| 题目验证 | typebox schema | 运行时确保 agent 输出结构正确 |
| 上下文 | pi-agent 自动 compact | 不手动管理，减少复杂度 |
| 工具参数 | structured JSON | 机器可读，支持校验和 autocomplete |
| 卡片匹配 | fuzzy bidirectional | 兼容新旧命名风格 |

---

## 9. 已归档的旧架构

以下组件已移入 `docs/legacy/`，不再使用：

- `review_cli.mjs` — 旧 Node.js CLI
- `review_cli.py` — 旧 Python CLI
- `lib/session.mjs` — 旧 SDK 会话封装
- `lib/terminal.mjs` — 旧终端渲染

旧版 `SYSTEM.md` 工作流已被 extension + skill 注入取代。
