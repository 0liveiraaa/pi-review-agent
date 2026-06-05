# 给其它 AI 的 Skill 修改提示词

请修改 `workspace/.pi/skills/` 中相对不重要但仍需补全的资料包生成类 skill：

- `review-init`
- `review-fix`
- `review-profile-structure`
- `review-profile-index`
- `review-profile-cards`
- `review-profile-exam-points`
- `review-profile-quality`

不要修改这些核心运行时 skill，除非我另行要求：

- `review-core`
- `review-question`
- `review-grade`
- `review-discuss`
- `review-summary`

## 总目标

这些 skill 用于把用户提供的 Markdown/txt 资料整理成可审核的 `draft` review profile，并支持后续 `/review-fix` 迭代修订。请保持跨科目通用，不要写死 C++。

## 必须匹配当前代码的 knowledge_index.json 结构

当前 `/review` 代码读取的是 `chapters.{chapterId}.knowledge_points` 数组。请生成这个最小兼容结构：

```json
{
  "subject": "科目名称",
  "chapters": {
    "1": {
      "title": "章节标题",
      "knowledge_points": [
        {
          "id": "stable-id",
          "name": "知识点名称",
          "aliases": ["别名"],
          "tags": ["标签"],
          "question_types": ["choice", "judgment", "short_answer"],
          "difficulty_baseline": "S-U",
          "related": ["related-id"],
          "common_misconceptions": ["具体误区"],
          "generation_hints": "具体出题提示"
        }
      ]
    }
  }
}
```

可以额外添加 `sections`、`tags`、`subject_id` 等字段，但不能省略 `chapters.*.knowledge_points`。不要只生成顶层 `knowledge_points`。

## 工具边界

- 资料包文件只能通过 `review_profile_write` 写入。
- 不要用 Bash、Write、Edit 直接写 profile 文件。
- `/review-init` 完成后 profile 必须保持 `draft`。
- `/review-fix` 只有在用户明确说“确认启用 / 启用 / 设为 active / 开始复习”时，才调用 `review_profile_enable`。
- 不要修改 active profile。active profile 只能复习，不能修订。

## profile 文件结构

请围绕以下结构生成或修订：

- `subject.md`
- `knowledge_index.json`
- `cards/`
- `chapters/`
- `exam_points/`
- `source_map.json`
- `quality_report.md`
- `profile.json` 由代码创建，不要重写，除非修订状态需要通过工具完成。

## 跨科目要求

- 不要把题型、例子、代码语言固定为 C++。
- 如果是编程科目，可以生成代码示例；如果是数学，使用公式/推导；如果是文科，使用论点/材料分析；如果是语言学习，使用语境/例句。
- `subject.md` 里可以描述该科目的题型偏好和出题风格。
- 如果无法判断科目类型，在 `quality_report.md` 标记低置信度，不要硬猜。

## 质量报告要求

`quality_report.md` 必须诚实列出：

- 缺失文件
- 低置信度切分
- 未映射源文件
- 重复或过碎知识点
- 可能不准确的定义
- 是否建议启用

严重问题未解决时，不要建议直接启用。

## 写作风格

- 保持明确、可执行、少空话。
- 每个步骤说明输入、输出、使用哪个工具。
- 不要让 skill 要求“一次读完所有源文件”作为硬规则；源文件很多时允许分批读取和阶段汇报。
- 不要要求生成几百张卡片时一次性完成；允许分批生成，并在 `quality_report.md` 标记未完成项。

## 完成后自检

修改后请检查：

- 所有 skill frontmatter 都有合法 `name` 和 `description`。
- 所有路径都在 profile draft 内。
- 所有新 profile 都能被当前代码的 `/review` 读取章节和知识点。
- 没有把 C++ 特化规则写进通用 skill。
