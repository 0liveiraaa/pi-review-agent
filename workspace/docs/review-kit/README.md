# 复习助手安装套件

本目录记录了跨科目复习助手的轻量安装流程。

## 安装

在仓库根目录或 `workspace/` 目录按当前 README 执行安装检查：

```powershell
npm install
npm install -g --ignore-scripts @earendil-works/pi-coding-agent  # 如果尚未安装
npm run setup-review
```

或在 `workspace/` 目录下执行：

```powershell
npm run setup-review
pi
```

安装脚本执行以下最小化检查：

- 验证 `workspace/extensions/review/index.ts` 存在
- 验证 `workspace/skills/review-core/SKILL.md` 存在
- 验证 `workspace/skills/review-init/SKILL.md` 存在
- 验证 `workspace/skills/review-fix/SKILL.md` 存在
- 验证 `workspace/review.config.json` 存在
- 验证 bundled demo profile 存在
- 验证用户数据目录 `~/.pi/agent/review-data` 可写
- 输出用户下一步可执行的命令

## 命令

- `/review` 启动复习，让用户选择一个 active 状态下的科目资料包。
- `/review-init` 从 `.md` / `.txt` 笔记创建 draft 资料包。
- `/review-fix` 让用户选择 draft 资料包，用自然语言反馈进行修订。

## 资料包生命周期

1. `/review-init` 在用户数据目录 `~/.pi/agent/review-data/review_profiles/{subjectId}/draft` 创建草稿。
2. AI 通过 `review_profile_write` 写入规范化文件。
3. 用户查看 `quality_report.md`。
4. `/review-fix` 更新 draft，直到用户确认可用。
5. AI 调用 `review_profile_enable`，draft 进入同一资料包 family 的 `active` 槽位，然后 `/review` 即可使用该资料包。

## 构建技能说明

当前实现使用命令提示词 + 受控工具的方式，而非重型安装器。后续可按科目定制的构建技能可添加至 `workspace/skills/`。

当前构建技能：

- `review-core`：主流程编排和子技能路由。
- `review-init`：从 Markdown/文本笔记构建 draft 资料包。
- `review-fix`：根据自然语言反馈修订 draft 资料包。
- `review-profile-structure`：章节结构规范化。
- `review-profile-index`：知识点索引生成。
- `review-profile-cards`：概念卡片生成。
- `review-profile-exam-points`：考点总结生成。
- `review-profile-quality`：质量报告审核。
- `review-profile-training-assets`：单元总结、易混淆点、引申知识和题型模板等训练资产生成。
