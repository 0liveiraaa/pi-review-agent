# 复习助手安装套件

本目录记录了跨科目复习助手的轻量安装流程。

## 安装

在 `workspace/` 目录下执行：

```powershell
npm install
npm install -g --ignore-scripts @earendil-works/pi-coding-agent  # 如果尚未安装
npm run setup-review
pi
```

安装脚本执行以下最小化项目本地检查：

- 验证 `workspace/.pi/extensions/review/index.ts` 存在
- 验证 `workspace/.pi/skills/review-core/SKILL.md` 存在
- 验证 `workspace/.pi/skills/review-init/SKILL.md` 存在
- 验证 `workspace/.pi/skills/review-fix/SKILL.md` 存在
- 验证 `workspace/.pi/review.config.json` 存在
- 验证 `workspace/review_profiles/` 存在
- 输出用户下一步可执行的命令

## 命令

- `/review` 启动复习，让用户选择一个 active 状态下的科目资料包。
- `/review-init` 从 `.md` / `.txt` 笔记创建 draft 资料包。
- `/review-fix` 让用户选择 draft 资料包，用自然语言反馈进行修订。

## 资料包生命周期

1. `/review-init` 创建 `review_profiles/{subjectId}`，状态为 `draft`。
2. AI 通过 `review_profile_write` 写入规范化文件。
3. 用户查看 `quality_report.md`。
4. `/review-fix` 更新 draft，直到用户确认可用。
5. AI 调用 `review_profile_enable`，然后 `/review` 即可使用该资料包。

## 构建技能说明

当前实现使用命令提示词 + 受控工具的方式，而非重型安装器。后续可按科目定制的构建技能可添加至此目录，并通过扩展安装脚本复制到 `workspace/.pi/skills/`。

当前构建技能：

- `review-core`：主流程编排和子技能路由。
- `review-init`：从 Markdown/文本笔记构建 draft 资料包。
- `review-fix`：根据自然语言反馈修订 draft 资料包。
- `review-profile-structure`：章节结构规范化。
- `review-profile-index`：知识点索引生成。
- `review-profile-cards`：概念卡片生成。
- `review-profile-exam-points`：考点总结生成。
- `review-profile-quality`：质量报告审核。
