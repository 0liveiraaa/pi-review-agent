---
name: review-init
description: 跨科目复习资料包初始化技能。用于从 Markdown/文本笔记生成可审核的 draft 资料包。当执行 /review-init 时使用，负责分析源资料、生成规范化文件并输出质量报告。
---

# 资料包初始化技能

这是 `.pi/skills/review-init/SKILL.md` 的源模板。

## 接口定义

- 输入：`subjectId`、科目名称、资料包根目录、源 `.md` / `.txt` 文件列表。
- 工具：`review_profile_write`。
- 输出：`subject.md`、`knowledge_index.json`、`cards/`、`chapters/`、`exam_points/`、`source_map.json`、`quality_report.md`。

## 待实现

具体的笔记分析和资料包生成策略应由技能作者填充。详见 `.pi/skills/review-init/SKILL.md` 中的完整实现。
