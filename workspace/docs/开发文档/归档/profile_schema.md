# Profile Schema 说明

复习资料包 (review profile) 是 `/review` 复习的核心数据单元。每个 profile 是一个独立目录，包含结构化科目资料。

## 目录结构

```
review_profiles/{subject_id}/
├── profile.json              ← profile 元数据（必需）
├── subject.md                ← 科目描述 Markdown（必需）
├── knowledge_index.json      ← 知识点索引（必需）
├── cards/                    ← 概念卡片 *.md（可选，但建议）
├── chapters/                 ← 章节笔记 *.md（可选）
├── exam_points/              ← 考点总结 *.md（可选）
├── source_map.json           ← 源文件映射（自动生成）
└── quality_report.md         ← 质量评估（自动生成）
```

## profile.json

```json
{
  "subjectId": "cpp-oop",
  "name": "C++ 面向对象程序设计",
  "status": "active",
  "createdAt": "2026-06-05T...",
  "updatedAt": "2026-06-05T...",
  "paths": {
    "subject": "subject.md",
    "knowledgeIndex": "knowledge_index.json",
    "cards": "cards",
    "chapters": "chapters",
    "examPoints": "exam_points",
    "sourceMap": "source_map.json",
    "qualityReport": "quality_report.md"
  },
  "revisionOf": "cpp-oop__draft_20260606",
  "revisionReason": "修订卡片内容",
  "revisionCreatedAt": "2026-06-06T..."
}
```

### 字段说明

| 字段 | 必需 | 说明 |
|------|------|------|
| `subjectId` | 是 | 唯一标识，小写字母数字和短横线 |
| `name` | 是 | 显示名称 |
| `status` | 是 | `draft` / `active` / `archived` |
| `createdAt` | 是 | ISO 时间戳 |
| `updatedAt` | 是 | 最后修改时间 |
| `paths` | 是 | 各文件相对于 profile 根目录的路径 |
| `revisionOf` | 否 | 如果是修订草稿，指向原 active 的 subjectId |
| `revisionReason` | 否 | 修订原因（用户反馈） |

### 状态转换

```
draft (可编辑) ──review_profile_enable──→ active (可复习)
active ──/review-fix──→ {id}__draft_{date} (draft)
draft ──review_profile_enable──→ active (替换原 active)
                                      └→ 原 active 标记为 archived
```

### 安全约束

- `review_profile_write` 只接受 `status === "draft"` 的 profile
- 非 `legacy-bridge` profile 的 paths 不允许包含 `..`
- 文件写入范围限制在 profile 根目录内

## knowledge_index.json

```json
{
  "subject": "C++ 面向对象程序设计",
  "chapters": {
    "1": {
      "title": "第一章标题",
      "knowledge_points": [
        {
          "id": "kp_identifier",
          "name": "知识点名称",
          "aliases": ["别名1", "别名2"],
          "tags": ["标签1", "标签2"],
          "question_types": ["choice", "judgment", "short_answer"],
          "difficulty_baseline": "S-U",
          "exam_level": "high",
          "related": ["kp_other_id"],
          "common_misconceptions": ["常见误区1", "常见误区2"],
          "generation_hints": "出题提示: 结合常见误区出混淆选项",
          "status": "active"
        }
      ]
    }
  }
}
```

### 字段说明

| 字段 | 必需 | 说明 |
|------|------|------|
| `subject` | 是 | 科目名称 |
| `chapters` | 是 | 章节对象，key 为章节号字符串 |
| `chapters.{id}.title` | 是 | 章节标题 |
| `chapters.{id}.knowledge_points` | 是 | 知识点数组（不能空） |
| `kp.id` | 是 | 知识点唯一 ID |
| `kp.name` | 是 | 知识点名称 |
| `kp.aliases` | 否 | 别名，用于范围匹配和卡片搜索 |
| `kp.tags` | 否 | 标签，用于范围匹配 |
| `kp.question_types` | 是 | 适用题型，至少一个 |
| `kp.difficulty_baseline` | 是 | 初始难度等级 |
| `kp.exam_level` | 否 | 考试重要性（low/medium/high） |
| `kp.related` | 否 | 关联知识点 ID 列表 |
| `kp.common_misconceptions` | 否 | 常见误区列表 |
| `kp.generation_hints` | 否 | 出题提示 |
| `kp.status` | 否 | `active` / `removed`（removed 时 card queue 跳过） |

### 难度等级

| 值 | 含义 |
|----|------|
| `S-R` | Single × Recall |
| `S-U` | Single × Understand |
| `M-U` | Multi × Understand |
| `M-A` | Multi × Analyze |
| `C-A` | Chain × Analyze |

### 题型

| 值 | 题目类型 |
|----|----------|
| `judgment` | 正误判断 |
| `choice` | 单项选择 |
| `multi_choice` | 多项选择 |
| `short_answer` | 简述题 |

## subject.md

科目描述的 Markdown 文件。包含课程概述、考试目标、重点领域。agent 在出题前会 Read 此文件了解课程背景。

## source_map.json

```json
{
  "files": [
    { "path": "reference/01-章节笔记/...", "size": 1234 }
  ]
}
```

自动生成的源文件索引，记录初始化时扫描到的所有 Markdown/txt 文件。

## quality_report.md

由 agent 在初始化或修订后生成的质量评估报告 Markdown。包含覆盖度分析、缺失内容、改进建议。

## 内置 Profile

### cpp-oop (active)

C++ 面向对象程序设计课程资料包。使用 `legacy-bridge` 布局，桥接 `reference/` 目录下的既有资料（章节笔记和概念卡片在 workspace 外部）。

### demo-review (active)

学习方法主题的新手体验 profile，适合首次克隆后直接试用。包含：
- 2 章 / 6 个知识点
- 6 张概念卡片
- 2 份考点总结
- 可跑通三种模式

首次体验路径：
```
pi
/review
选择: 学习方法 Demo
任选模式 → 完成一题 → 题后菜单选择下一步
```
