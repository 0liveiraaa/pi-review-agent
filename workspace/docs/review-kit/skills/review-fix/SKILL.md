---
name: review-fix
description: 跨科目复习资料包修订技能。用于根据用户自然语言反馈迭代修订 draft 资料包。当执行 /review-fix 时使用，负责读取现有 draft、应用修订并更新质量报告。
---

# 资料包修订技能

这是 `.pi/skills/review-fix/SKILL.md` 的源模板。

## 接口定义

- 输入：`subjectId`、科目名称、资料包根目录、用户反馈、现有 draft 文件。
- 工具：`review_profile_write`、`review_profile_enable`。
- 输出：修订后的 draft 文件和更新后的 `quality_report.md`。

## 待实现

具体的草稿修订和确认策略应由技能作者填充。详见 `.pi/skills/review-fix/SKILL.md` 中的完整实现。
