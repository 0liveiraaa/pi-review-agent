# 质量报告

状态：可发布，active。

本 profile 已整理为自包含资料包，不再依赖根目录 `reference/`。

## 已包含内容

- 知识点索引：`knowledge_index.json`
- 章节笔记：`chapters/`
- 概念卡片：`cards/`
- 考点总结：`exam_points/`
- 来源映射：`source_map.json`

## 使用说明

这是班级共享用的预制 C++ profile。用户通过 git/pi package 安装后，可以直接在 `/review` 中选择 `C++ 面向对象程序设计`，无需消耗 token 重新执行 `/review-init`。

## 后续可改进

- 对章节笔记做更细的 section 标准化。
- 对卡片 frontmatter 做批量清洗，补齐 `difficulty`、`chapter`、`status` 等字段。
- 将历年试题整理为单独的题源 profile 或 exam set，不混入当前基础复习包。
