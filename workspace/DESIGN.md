# 期末复习助手 — 项目设计文档

> 版本: v2.0
> 日期: 2026-06-05
> 课程: 面向对象程序设计 (C++)
> 状态: M2 完成 + 交互细化中

---

## 1. 项目概述

### 1.1 目标

构建一个 AI 驱动的期末复习助手，运行在 Pi Coding Agent 上，以知识点卡片 + 题目考察 + 深度讨论的方式辅助复习。支持三种复习模式。

### 1.2 核心设计原则

| 原则 | 说明 |
|------|------|
| **代码管状态，Agent 管语言** | Python 负责流程/状态/数据，Pi 负责理解和生成 |
| **每题独立调用，无 session 污染** | 每个子任务通过 `pi -p` 独立调用 |
| **JSON 传上下文，MD 存历史** | JSON 轻量注入下一题，MD 保留完整记录 |
| **先本地后远程** | 卡片优先代码直读，归档优先本地生成，减少 pi 调用 |

### 1.3 技术栈

```
Python 3.x (标准库，零外部依赖)
  ├── CLI 交互层（命令解析 + 状态管理 + Pi 调用调度）
  ├── JSON 状态文件（进度 / 错题本 / 知识链索引）
  └── MD 归档文件（完整对话 + 复盘分析）

Pi Coding Agent (pi -p --print 模式, deepseek-v4-flash)
  ├── 系统提示: .pi/SYSTEM.md (自动加载)
  ├── Skill: .pi/skills/review-assistant/SKILL.md (按需加载)
  ├── 工具: --tools read (可查阅 reference/ 参考资料)
  └── 角色: 题目生成 / 判题 / 解析 / 讨论 / 归档
```

### 1.4 项目结构

```
面向对象程序设计/
├── .pi/
│   ├── SYSTEM.md                          # 系统提示 (自动加载)
│   └── skills/review-assistant/SKILL.md   # 复习助手 Skill (172→250+行)
├── reference/                             # 课程资料
│   ├── 00-课程总览.md
│   ├── 01-章节笔记/{6.5,6.6,6.7,6.8}/   # 按学期分组的章节笔记
│   ├── 02-概念卡片/                       # 500 个概念卡片 MD
│   ├── 04-考点整理/{6.5,6.6,6.7}/        # 考点速记
│   └── 历年考试题/
└── workspace/
    ├── DESIGN.md                          # 本文件
    ├── review_cli.py                      # Python CLI 主入口 (~1450行)
    ├── state/
    │   ├── progress.json                  # 复习进度
    │   ├── wrong_book.json                # 错题本
    │   └── knowledge_chains.json          # 知识链索引
    ├── archive/
    │   ├── sessions/{session_id}/         # 每 session 的题目归档
    │   │   ├── q_20260605_001.json
    │   │   └── q_20260605_001.md
    │   └── summaries/                    # session 总结报告
    │       └── {session_id}_总结.md
    ├── data/
    │   └── knowledge_index.json           # 20章74个知识点索引
    └── schemas/                           # JSON Schema (设计参考)
```

---

## 2. 交互流程

### 2.1 三种复习模式

```
用户启动 CLI
  │
  ├─ 模式 1: 卡片→做题
  │   └─ 展示知识卡片 (代码直读 reference/02-概念卡片/) → 做题 → 讨论 → 下一题
  │
  ├─ 模式 2: 直接做题 (默认)
  │   └─ 直接出题 → 作答 → 判题 → 讨论 → 下一题
  │
  └─ 模式 3: 单元学习
      └─ 选章节 → 列小节 → 逐节学习(内容+1题) → 章节综合回顾(3题)
```

### 2.2 结构化指令

| 指令 | 别名 | 功能 |
|------|------|------|
| `下一题` | `n` | 确认理解，归档当前题，进入下一题 |
| `跳过` | `skip` | 跳过当前卡片/题目 |
| `提示` | `hint` | 请求引导性提示（不直接给答案） |
| `更难` | `harder`, `加难度` | 提升下一题一个难度级别 |
| `总结` | `sum` | 结束会话，生成全局复盘 |
| `退出` | `q` | 中断会话，保存进度 |

### 2.3 题目生命周期 (模式 1/2)

```
┌─────────────────────────────────────────┐
│  一次题目生命周期                         │
│                                         │
│  [可选] 卡片展示 (代码直读, 0次pi调用)     │
│  调用1: 生成题目 (60s)                    │
│  调用2: 判题 + L1 解析 (60s)              │
│  调用3-N: 讨论 (60s/次)                   │
│  调用N+1: 归档                            │
│    ├─ 答对+无追问: 本地快速归档 (0次pi)    │
│    └─ 其他: pi 生成归档 (90s)             │
└─────────────────────────────────────────┘
```

### 2.4 单元学习流程 (模式 3)

```
选择章节 (1-20)
  ↓
扫描 01-章节笔记, 列出小节
  ↓
┌─ For each 小节 ───────────────────────┐
│ 1. 代码直读 MD 展示内容 (0次pi)        │
│ 2. Pi 生成 1 道小节题 (60s)           │
│ 3. 判题 (60s) → 追问 → 快速归档       │
└───────────────────────────────────────┘
  ↓
章节综合回顾:
  Pi 生成 3 道混合题 (90s)
  逐题作答 → 判题 → 快速归档
```

---

## 3. 题目体系

### 3.1 题型

| 题型 | 代码 | 适用难度 | 特点 |
|------|------|----------|------|
| 正误判断 | judgment | S-R, S-U | 一句陈述，判断正误 |
| 单项选择 | choice | S-U, M-U, M-A | 4 选项，1 正确，3 干扰 |
| 简述题 | short_answer | M-A, C-A | 开放式问题，按要点给分 |

### 3.2 难度矩阵 (5 级)

| 级别 | 广度 × 认知 | 含义 | 题型 |
|------|-------------|------|------|
| **S-R** | Single × Recall | 单个知识点，记忆/识别 | 判断 |
| **S-U** | Single × Understand | 单个知识点，理解/区分 | 判断、选择 |
| **M-U** | Multi × Understand | 2-3个关联概念，理解比较 | 选择 |
| **M-A** | Multi × Analyze | 多概念综合推理 | 选择、简述 |
| **C-A** | Chain × Analyze | 知识链条综合 | 简述 |

### 3.3 难度自适应

- **自动**: 正确率 ≥80% 升级，<50% 降级
- **手动**: 用户输入 `更难` 提升一级（仅影响下一题）
- **基线**: 每个知识点有 `difficulty_baseline`

---

## 4. 解析深度 (Level 1-3)

| Level | 触发时机 | 内容 |
|-------|----------|------|
| L1 | 判题后立即展示 | 正确答案 + 直接解释 |
| L2 | 讨论中自然展开 | 关联知识点、代码示例、概念对比 |
| L3 | 归档时整理 | 知识链条: 知识点1 → 知识点2 → 知识点3 |

---

## 5. 数据设计

### 5.1 知识点索引 (`data/knowledge_index.json`)

覆盖全部 20 章，74 个知识点。每个知识点包含:
- `id`, `name`, `chapter`, `exam_level`
- `question_types`: 支持的题型列表
- `difficulty_baseline`: 难度基线
- `related`: 关联知识点 ID 列表
- `common_misconceptions`: 常见误区
- `generation_hints`: 出题提示

### 5.2 状态文件

**progress.json** — 当前 session + 历史汇总
```json
{
  "current_session": {
    "session_id", "scope", "mode",
    "total_questions", "correct", "incorrect",
    "covered_knowledge_points", "remaining_knowledge_points",
    "last_lingering_question", "last_discussion",
    "_next_difficulty_up", "_wrong_book_mode"
  },
  "history": {
    "total_questions_answered", "total_correct", "total_incorrect",
    "chapters_covered", "sessions": [...]
  }
}
```

**wrong_book.json** — 错题记录 + 错误类型统计
```json
{
  "entries": [{ "question_id", "knowledge_points", "error_type", "error_detail", "timestamp" }],
  "error_type_stats": { "概念混淆": N, "知识遗漏": N, "推理错误": N, "粗心失误": N }
}
```

**knowledge_chains.json** — 跨知识点关联
```json
{
  "chains": [{ "chain": "A → B → C", "nodes": [...], "first_seen": "..." }],
  "knowledge_points_linked": [...]
}
```

### 5.3 归档结构

```
archive/
├── sessions/
│   └── {session_id}/
│       ├── q_20260605_001.json    # 结构化归档
│       └── q_20260605_001.md      # 可读的 MD 归档
└── summaries/
    └── {session_id}_总结.md       # Session 总结报告
```

每道题归档包含: question_id, knowledge_points, difficulty, type, timestamp, question_text, user_answer, correct_answer, explanation_l1, is_correct, discussion_summary, knowledge_chain_l3, suggestion_next。

Session 总结报告包含: 总体评价、逐题回顾表、薄弱环节、知识体系、下次建议。

---

## 6. 上下文策略

### 6.1 Pi 调用的两层上下文

**第一层 — 自动加载 (每次调用都生效)**:
- `.pi/SYSTEM.md` (24行): 角色定义 + 核心行为 + 确认信号
- `.pi/skills/review-assistant/SKILL.md` (250+行): 难度体系 + 题型模板 + 判题标准 + 讨论规则 + 归档格式 + 总结模板

**第二层 — Python 注入 (每次 call_pi 传入)**:
- 题目生成: 复习范围 + 进度 + 知识点详情 + 误区 + 关联 + 薄弱点 + 知识链 + 遗留问题
- 判题: 题目 JSON + 用户答案
- 讨论: 题目 + 判题结果 + 讨论历史 + 用户追问
- 归档: 题目 + 答案 + 判题结果 + 完整讨论历史
- 总结: session 数据 + 全部题目归档 JSON

### 6.2 跨题上下文传递

每道新题的 build_context 注入:
- 上一题的遗留问题 (last_lingering_question)
- 上一题的讨论要点 (last_discussion, 保留最后 4 条)
- 近期薄弱点 (get_recent_weaknesses)
- 已建立的知识链 (knowledge_chains)

---

## 7. 设计决策记录

| # | 决策 | 选择 | 理由 |
|---|------|------|------|
| 1 | 单门课 vs 通用框架 | 单门课 | 先跑通闭环 |
| 2 | 运行平台 | Pi Coding Agent | 原生 Skill 自动发现 |
| 3 | 系统提示方式 | .pi/SYSTEM.md | Pi 原生支持，无需 --system-prompt |
| 4 | Skill 组织 | 单个 SKILL.md | 一个复习助手涵盖所有子任务 |
| 5 | 题目来源 | LLM 生成 | 基于 reference/ 资料实时生成 |
| 6 | 难度体系 | S/M/C × R/U/A = 5级 | 广度×认知，适配考试 |
| 7 | 节奏控制 | 用户驱动 (结构化指令) | 用户掌控复习进度 |
| 8 | 卡片 vs 题目顺序 | 用户可选 (三种模式) | 适配不同复习习惯 |
| 9 | 讨论主动性 | 助手不主动追问 | 减少实现复杂度 |
| 10 | 确认方式 | 结构化指令 (n/下一题) | 明确无歧义 |
| 11 | 记忆策略 | JSON (上下文传递) + MD (完整记录) | wiki 式记忆 |
| 12 | 架构模式 | Python 管流程 + Pi 管语言 | 职责分离 |
| 13 | 模型选择 | deepseek-v4-flash | 速度快，成本低 |
| 14 | 卡片策略 | 代码直读 MD → LLM 兜底 | 优先本地，减少 pi 调用 |
| 15 | 归档策略 | 答对无追问本地归档 → pi 归档兜底 | 减少不必要的 pi 调用 |
| 16 | Session 组织 | 按 session 分文件夹 | 便于回顾和总结 |
| 17 | 总结报告 | 收集全部归档 → pi 生成 | 一次性全面复盘 |

---

## 8. 实现状态

### 已完成

- [x] 三种复习模式 (卡片→做题 / 直接做题 / 单元学习)
- [x] 三种题型 (判断 / 选择 / 简述)
- [x] 5 级难度体系 + 自适应 + 手动 `更难`
- [x] 20 章 74 个知识点索引
- [x] 范围匹配 (章节号 / 中文数字 / 关键字 / 错题)
- [x] 知识卡片代码直读 (reference/02-概念卡片/)
- [x] 单元学习 (01-章节笔记 小节推进)
- [x] Session 分文件夹归档 + 总结报告
- [x] 错题本 + 知识链索引
- [x] 输入校验 (空答案拦截 / 模式选择校验)
- [x] 快速归档 (答对无追问本地生成)
- [x] 上下文跨题传递 (遗留问题 + 讨论要点 + 薄弱点 + 知识链)
- [x] deepseek-v4-flash 模型 + 差异化超时设置

### 待做 (交互细化，不启动 M3)

- [ ] 统一模式间的命令集 (模式 3 缺少 `提示`/`更难` 等)
- [ ] 模式 3 添加 session 总结
- [ ] 模式 3 的 _fast_archive 传入正确的 kp 信息
- [ ] "回顾" 命令 — 查看当前 session 已做题
- [ ] 优化 "全部覆盖" 后的交互引导
- [ ] 章节进度可视化
- [ ] 范围输入支持章节名模糊匹配
- [ ] 状态文件大小控制 (progress.json sessions 列表裁剪)
