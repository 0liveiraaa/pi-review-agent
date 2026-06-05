# 期末复习助手 — 项目设计文档

> 版本: v3.0
> 日期: 2026-06-05
> 课程: 面向对象程序设计 (C++)
> 状态: SDK 版本完成，交互细化完成

---

## 1. 项目概述

### 1.1 目标

构建一个 AI 驱动的期末复习助手，运行在 Pi Coding Agent SDK 上，以知识点卡片 + 题目考察 + 深度讨论 + 复盘驱动的方式辅助复习。支持三种复习模式。

### 1.2 核心设计原则

| 原则 | 说明 |
|------|------|
| **复盘驱动** | 每题结束后 agent 生成结构化复盘 JSON，对话细节被 compact 压缩，只保留复盘记录在上下文中 |
| **Agent 自主阅读** | agent 使用 Read 工具主动查阅 reference/ 下的小节笔记和概念卡片 |
| **一次性加载，KV cache 复用** | 全部 4 个 skill 在 session 启动时一次性注入 system prompt，compact 保护不被压缩 |
| **先本地后远程** | 卡片优先代码直读 MD，复盘由程序统一保存 |

### 1.3 技术栈

```
Node.js (ESM, 零外部依赖除 pi SDK)
  ├── review_cli.mjs           # 主入口 (~420行)
  └── lib/
      ├── session.mjs           # pi SDK AgentSession 封装
      ├── state.mjs             # JSON 状态文件读写
      ├── cards.mjs             # 概念卡片加载 (reference/02-概念卡片/)
      ├── chapters.mjs          # 章节笔记解析 (reference/01-章节笔记/)
      └── terminal.mjs          # 终端可视化 (Markdown 渲染 + 选项打印)

Pi Coding Agent SDK (@earendil-works/pi-coding-agent v0.78)
  ├── createAgentSession()      # 持久会话 (一次创建，全程复用)
  ├── ModelRegistry             # 模型管理 (deepseek/deepseek-v4-flash)
  ├── DefaultResourceLoader     # 系统提示 + Skill 加载
  └── 工具: read, bash         # 文件阅读 + 目录列举

marked                         # Markdown → ANSI 终端渲染
```

### 1.4 项目结构

```
面向对象程序设计/
├── .pi/
│   ├── SYSTEM.md                          # 系统提示 (agent 角色 + 行为 + 技能列表 + reference 结构)
│   └── skills/                            # 4 个独立技能 (一次性全部加载)
│       ├── review-question/SKILL.md        # 难度体系 + 题型模板
│       ├── review-grade/SKILL.md           # 判题格式 + L1-L3 解析
│       ├── review-discuss/SKILL.md         # L2 讨论 + 代码示例风格
│       └── review-summary/SKILL.md         # 每题复盘格式 + 会话总结模板
├── reference/                             # 课程资料 (agent 通过 Read 工具访问)
│   ├── 00-课程总览.md
│   ├── 01-章节笔记/{6.5,6.6,6.7,6.8}/   # 按学期分组的小节笔记
│   ├── 02-概念卡片/                       # 500 个概念卡片 MD
│   ├── 04-考点整理/{6.5,6.6,6.7}/        # 考点速记
│   └── 历年考试题/
└── workspace/
    ├── DESIGN.md                          # 本文件
    ├── package.json                       # ESM + npm 依赖
    ├── review_cli.mjs                     # 主入口 (~420行)
    ├── review_cli.py                      # Python 版本 (保留参考, 不再使用)
    ├── lib/
    │   ├── session.mjs                    # pi SDK 会话封装 (~100行)
    │   ├── state.mjs                      # 状态管理 (~280行)
    │   ├── cards.mjs                      # 概念卡片加载 (~35行)
    │   ├── chapters.mjs                   # 章节笔记解析 (~70行)
    │   └── terminal.mjs                   # 终端可视化 (~250行)
    ├── state/
    │   ├── progress.json                  # 复习进度
    │   ├── wrong_book.json                # 错题本
    │   └── knowledge_chains.json          # 知识链索引
    ├── archive/
    │   ├── sessions/{session_id}/         # 每 session 的题目归档
    │   │   ├── q_*.json                   # 结构化复盘
    │   │   └── q_*.md                     # 可读 MD
    │   └── summaries/                    # session 总结报告
    │       └── {session_id}_总结.md
    ├── data/
    │   └── knowledge_index.json           # 20章74个知识点索引
    └── schemas/                           # JSON Schema (设计参考)
```

---

## 2. 交互流程

### 2.1 先模式后范围

```
启动
  ↓
模式选择 (1/2/3)
  ├─ 1,2 → 输入复习范围 → 匹配知识点 → 复盘驱动循环
  └─ 3   → 输入章节号 → 列小节 → 复盘驱动循环
```

### 2.2 三种复习模式

| 模式 | 流程 | 特点 |
|------|------|------|
| 1. 卡片→做题 | 知识卡片 → 做题 → 判题 → 讨论 → 复盘 | 先复习再考察 |
| 2. 直接做题 (默认) | 出题 → 判题 → 讨论 → 复盘 | 快速刷题 |
| 3. 单元学习 | agent Read小节 → 简述 → 题后选项(更难/继续/下一) → 复盘 | 结构化推进 |

### 2.3 结构化指令

| 指令 | 别名 | 功能 |
|------|------|------|
| `下一题` | `n` | 归档 + 复盘 → 下一题 |
| `跳过` | `skip` | 跳过当前卡片/题目 |
| `提示` | `hint` | 引导性提示（不直接给答案） |
| `更难` | `harder`, `加难度` | 提升下一题一个难度级别 |
| `总结` | `sum` | 结束会话 → 生成 meta-复盘 |
| `退出` | `q` | 中断会话 |

### 2.4 复盘驱动的题目生命周期

```
┌─────────────────────────────────────────┐
│  一次题目生命周期 (同一 AgentSession 内)   │
│                                         │
│  1. agent 生成题目 (或 Read 小节后生成)    │
│  2. 用户作答 (选择: 编号输入 / 自由文本)    │
│  3. agent 判题 + L1 解析                 │
│  4. [可选] 讨论 (L2)                     │
│  5. saveQuestion() → 复盘 JSON + 归档    │
│  6. compact() → 对话细节丢弃, 复盘保留    │
│                                         │
│  题后选项 (Mode 3):                      │
│    1. 更难 → 同小节生成 M-U 题            │
│    2. 继续提问 → 自由追问                 │
│    3. 下一小节 (默认)                     │
└─────────────────────────────────────────┘
```

### 2.5 上下文演变

```
初始: [4个skill全文, SYSTEM.md, reference目录结构, 章节小节列表]
题1后: [4个skill, SYSTEM.md, ref结构, 章节信息, 复盘₁]    ← 对话细节已丢弃
题2后: [4个skill, SYSTEM.md, ref结构, 章节信息, 复盘₁, 复盘₂]
...
退出: agent 基于全部复盘记录生成 meta-复盘 → summaries/
```

---

## 3. 题目体系

### 3.1 题型

| 题型 | 代码 | 适用难度 | 特点 |
|------|------|----------|------|
| 正误判断 | judgment | S-R, S-U | 一句陈述，判断正误 |
| 单项选择 | choice | S-U, M-U, M-A | 4 选项，支持多选输入 (如 BD) |
| 简述题 | short_answer | M-A, C-A | 开放式问题，按要点给分 |

### 3.2 难度矩阵 (5 级)

| 级别 | 广度 × 认知 | 含义 | 适用题型 |
|------|-------------|------|----------|
| **S-R** | Single × Recall | 单一知识点，记忆/识别 | 判断 |
| **S-U** | Single × Understand | 单一知识点，理解/区分 | 判断、选择 |
| **M-U** | Multi × Understand | 2-3个关联概念，理解比较 | 选择 |
| **M-A** | Multi × Analyze | 多概念综合推理 | 选择、简述 |
| **C-A** | Chain × Analyze | 知识链条综合 | 简述 |

### 3.3 难度自适应

- **自动**: 正确率 ≥80% 升级，<50% 降级
- **手动**: 用户输入 `更难` 或题后选择「挑战更难的题」
- **基线**: 每个知识点有 `difficulty_baseline`

---

## 4. 解析深度 (Level 1-3)

| Level | 触发时机 | 内容 |
|-------|----------|------|
| L1 | 判题后立即展示 | 正确答案 + 直接解释 |
| L2 | 讨论中自然展开 | 关联知识点、代码示例、概念对比 |
| L3 | 复盘时整理 | 知识链条: 知识点1 → 知识点2 → 知识点3 |

---

## 5. 数据设计

### 5.1 知识点索引 (`data/knowledge_index.json`)

覆盖全部 20 章，74 个知识点。每个知识点:
- `id`, `name`, `chapter`, `exam_level`
- `question_types`, `difficulty_baseline`
- `related`, `common_misconceptions`, `generation_hints`

### 5.2 状态文件 (与 Python 版本 schema 兼容)

**progress.json** — 当前 session + 历史汇总
**wrong_book.json** — 错题记录 + 错误类型统计
**knowledge_chains.json** — 跨知识点关联

### 5.3 归档结构

```
archive/
├── sessions/
│   └── {session_id}/
│       ├── q_20260605_001.json    # 结构化归档 (含复盘 _fupan 字段)
│       └── q_20260605_001.md      # 可读 MD
└── summaries/
    └── {session_id}_总结.md       # session meta-复盘
```

### 5.4 复盘 JSON 格式 (每题)

```json
{
  "section": "11.1 存储空间",
  "question_summary": "题目的一句话概括",
  "user_answer": "错误",
  "is_correct": true,
  "core_learning": "本题的核心知识点/收获",
  "weak_point": null,
  "error_root_cause": null,
  "knowledge_chain": ["知识点1", "知识点2", "知识点3"]
}
```

---

## 6. 上下文策略

### 6.1 初始上下文 (一次性注入)

- `.pi/SYSTEM.md` (角色 + 行为 + reference 目录结构)
- 全部 4 个 skill 的完整内容
- 当前章节/范围 + 小节文件路径列表

### 6.2 compact 策略

```
compact 指令: "丢弃本题的详细判题和讨论文本。
保留: 技能文档(review-question/grades/discuss/summary)、
参考资料目录结构、章节信息、所有复盘记录。
将本题对话压缩为一条复盘记录。"
```

- skill 内容永不压缩 (KV cache 复用)
- 只压缩对话细节 → 复盘记录
- 上下文线性增长 (每条复盘 ~200 字节)

### 6.3 统一归档函数 `saveQuestion()`

```javascript
saveQuestion(questionText, userAnswer, grading, meta, sessionId)
  ├── prompt("生成复盘 JSON")
  ├── parseFupan()
  ├── 构建 archive (统一结构)
  ├── writeArchiveFiles()  → sessions/{sid}/q_xxx.json + .md
  ├── updateStateFromArchive()
  └── return fupan
```

所有出题路径 (普通/更难/继续) 共用此函数。

---

## 7. 可视化

### 7.1 Markdown 渲染 (terminal.mjs)

使用 `marked` 解析 + 自定义 ANSI 主题:
- 标题: 粗体青色
- 代码块: 带边框 + C++ 关键词高亮
- 内联代码: 黄色
- 引用: 暗色 + 竖线边框
- 粗体/斜体: ANSI 样式

### 7.2 选项打印

选择题时打印彩色选项编号 (A/B/C/D)，用户键盘输入字母。支持多选: `BD` / `B D` / `B,D` / `B和D`。

---

## 8. 设计决策记录

| # | 决策 | 选择 | 理由 |
|---|------|------|------|
| 1 | 单门课 vs 通用框架 | 单门课 | 期末需求紧迫 |
| 2 | 运行方式 | pi SDK (AgentSession) | 持久上下文，无子进程开销 |
| 3 | 语言 | Node.js (ESM) | pi SDK 为 JS 原生 |
| 4 | Skill 组织 | 拆分 4 个，一次性加载 | 方便维护，KV cache 复用 |
| 5 | 上下文管理 | 复盘驱动 + compact 保护 | 上下文永不膨胀 |
| 6 | 题目来源 | Agent 自主 Read + LLM 生成 | 基于真实小节内容，不靠训练数据猜 |
| 7 | 难度体系 | S/M/C × R/U/A = 5级 | 广度×认知，适配考试 |
| 8 | 节奏控制 | 用户驱动 + 题后选项 | 灵活度与推进速度兼顾 |
| 9 | 交互顺序 | 先模式后范围 | Mode 3 不需要范围输入 |
| 10 | 模型选择 | deepseek-v4-flash | 速度快，成本低 |
| 11 | 卡片策略 | 代码直读 MD → LLM 兜底 | 优先本地 |
| 12 | 归档策略 | 统一 saveQuestion() | 所有出题路径结构一致 |
| 13 | 工具策略 | read + bash | 文件阅读 + 目录列举 |
| 14 | 终端渲染 | marked + ANSI 主题 | 代码高亮 + Markdown 美化 |
| 15 | 多选题 | 多字母输入 (BD/B和D) | 适配多正确选项的题目 |

---

## 9. 实现状态

### 已完成

- [x] pi SDK 架构 (AgentSession 持久上下文)
- [x] 三种复习模式 (卡片→做题 / 直接做题 / 单元学习)
- [x] 三种题型 (判断 / 选择 / 简述) + 5 级难度体系
- [x] 4 个独立 Skill (一次性加载，compact 保护)
- [x] 复盘驱动上下文管理 (compact 丢弃对话，保留复盘)
- [x] 先模式后范围的交互流程
- [x] Agent 自主 Read 小节内容 (真实内容出题)
- [x] 统一 saveQuestion() 归档函数
- [x] 题后选项菜单 (更难 / 继续提问 / 下一小节)
- [x] 卡片 skip 防死循环 + 多选题多字母输入
- [x] Markdown 终端渲染 + C++ 代码高亮
- [x] 20 章 74 个知识点索引
- [x] 范围匹配 (章节号 / 中文数字 / 关键字)
- [x] Session 分文件夹归档 + meta-复盘总结报告
- [x] 错题本 + 知识链索引
- [x] 输入校验 (空答案拦截 / 模式选择校验)
- [x] Agent 可访问 archive (bash ls + read 历史复盘)

### 已知限制

- `compact()` 效果依赖 pi SDK 实现
- 状态文件无并发保护
- 无 CLI 参数解析 (仅交互模式)
