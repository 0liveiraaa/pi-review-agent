# 概念卡片 Schema 说明

概念卡片存放在每个 profile 的 `cards/` 目录下，文件名格式为 `{name}.md`。

## 卡片格式

支持两种格式：结构化卡片（推荐）和旧版自由格式。

### 结构化卡片（推荐）

```markdown
---
id: kp_identifier
name: 知识点名称
aliases: [别名1, 别名2]
difficulty: S-U
exam_level: high
chapter: "1"
source: chapters/1.1-标题.md
status: active
tags: [标签1, 标签2]
---

# 知识点名称

## 定义
核心概念定义。

## 关键要点
- 要点1
- 要点2

## 代码示例
```cpp
// 示例代码
```

## 常见误区
- 误区1：...
- 误区2：...

## 关联
- [[关联知识点1]]
- [[关联知识点2]]
```

### Frontmatter 字段

| 字段 | 必需 | 默认值 | 说明 |
|------|------|--------|------|
| `id` | 否 | 自动 | 对应 `knowledge_index.json` 中的知识点 ID |
| `name` | 否 | 文件名 | 知识点名称 |
| `aliases` | 否 | [] | 别名列表，用于模糊匹配 |
| `difficulty` | 否 | 继承 KP | 难度等级 |
| `exam_level` | 否 | 继承 KP | low / medium / high |
| `chapter` | 否 | 继承 KP | 章节号 |
| `source` | 否 | "" | 来源文件路径 |
| `status` | 否 | "active" | active / removed |
| `tags` | 否 | [] | 标签列表 |

### 推荐 sections

| Section 标题 | 用途 |
|-------------|------|
| `定义` | 核心概念定义 |
| `关键要点` | 不可忘记的要点 |
| `代码示例` | C++ 代码示例 |
| `推导` | 概念推导过程 |
| `常见误区` | 考试常考易错点 |
| `关联` | 关联知识点 |

Sections 会在 TUI 中按上述顺序渲染，其他 sections 按 Markdown 出现顺序渲染。

### 旧版自由格式

无 frontmatter 或 sections 的纯 Markdown。会被整体读取作为卡片内容。

```markdown
# auto

auto 用于类型推导。

使用 auto 声明变量时，编译器根据初始化表达式推导变量类型。

例：
    auto x = 42;        // int
    auto y = 3.14;      // double
    auto z = new Foo(); // Foo*
```

旧版卡片兼容读取，但缺少结构化信息（难度、别名、关联等）。

## 匹配逻辑

`loadProfileCard(profile, kp)` 按以下顺序查找卡片文件：

1. **ID 精确匹配** — 文件名为 `{kp.id}.md`
2. **名称精确匹配** — 文件名为 `{kp.name}.md`
3. **别名精确匹配** — 文件名为 `{aliases[i]}.md`
4. **模糊匹配** — 文件名包含知识点名称或知识点名称包含文件名（大小写不敏感）

## 卡片队列

`buildCardQueue()` 根据以下因素排序：

1. **未看过** 优先于看过的
2. **错题相关** 知识点优先（最近 20 条错题）
3. **低掌握度** 优先（`confidence: low` → `medium` → `high`）
4. **知识索引顺序** 作为最后排序因子

### 掌握度计算

`confidence` 由 `card_progress.json` 中的统计数据决定：

| 条件 | 置信度 |
|------|--------|
| 练习0次、看过≥2次 | medium |
| 练习0次、看过<2次 | low |
| 练习≥3次且正确率≥80% | high |
| 正确率≥50% | medium |
| 其他 | low |

### card_progress.json

```json
{
  "cards": {
    "kp_id": {
      "seen_count": 3,
      "practice_count": 2,
      "correct_count": 1,
      "confidence": "medium",
      "last_seen_at": "2026-06-06T...",
      "last_practiced_at": "2026-06-06T..."
    }
  }
}
```

通过 `markCardSeen()` 在每次展示卡片时更新 `seen_count`，通过 `updateCardPractice()` 在每次归档时更新练习统计。

## 卡片渲染

在 `card_practice` 模式中，agent 必须先调用 `review_card` 工具展示卡片：

```
review_card(subject_id, knowledge_point_id 或 knowledge_point_name)
  → 返回 { action: "practice" | "next_card" | "skip" | "exit",
           knowledge_point_id, card_found }
```

- `practice` → agent 生成题目并调用 `review_answer`
- `next_card` → agent 选择下一个知识点并再次调用 `review_card`
- `skip` → agent 跳过当前知识点
- `exit` → 结束卡片流程

TUI 渲染时按固定顺序展示 sections：定义 → 关键要点 → 代码示例 → 推导 → 常见误区 → 关联。旧版卡片直接展示原始 Markdown 前 80 行。
