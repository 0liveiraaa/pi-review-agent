> **✅ 已完成**（2026-06-06）
> 本文档对应的工作已全部完成：
> - profile 修订闭环（draft→active→archived）
> - 三种模式产品化（代码工具+agent 生成内容）
> - demo profile（demo-review）
> - 卡片系统升级（cards.mjs + card_progress.json）
> - 旧 CLI 清理归档
> - 文档重写（DESIGN v4.0, README, schema 文档）
>
> 当前状态与本文档描述一致，细节见 `docs/开发文档/DESIGN.md`。

# Review 下一阶段产品化计划：资料包修订闭环、模式 2/3、示例 Profile、卡片系统

## Summary

下一阶段目标是把 Review 从“能用的复习扩展”推进到“可持续使用的学习产品”。核心策略：

- `/review-fix` 统一承担资料包修订入口。
- active 资料包不原地修改；修订时复制为 draft，确认后再替换启用。
- 优先产品化模式 2、模式 3，让三种模式都从“prompt 驱动”逐步变为“代码稳定交互 + agent 生成内容”。
- 添加 demo profile，保证新用户 clone 后能直接体验。
- 卡片系统升级为可导航、可追踪、可用于学习状态更新的产品模块。

## Key Changes

### 1. 资料包使用-修改闭环

- `/review-fix` 支持选择 draft 或 active profile。
- 选择 draft：沿用当前修订流程。
- 选择 active：调用新增工具创建修订草稿，例如 `cpp-oop__draft_20260606`，并在 `profile.json` 中记录：
  - `status: "draft"`
  - `revisionOf: "cpp-oop"`
  - `revisionCreatedAt`
  - `revisionReason`
- `review_profile_write` 仍只允许写 draft，不允许直接写 active。
- `review_profile_enable` 升级为支持“修订草稿启用”：
  - 如果 draft 没有 `revisionOf`，按普通新 profile 启用。
  - 如果 draft 有 `revisionOf`，将原 active 标记为 `archived` 或 `superseded`，再把 draft 改为 active。
  - 保留旧 profile 目录，不删除，避免误改后无法回退。
- 新增 profile 状态：
  - `draft`：可编辑，不进入 `/review` 普通列表。
  - `active`：可复习。
  - `archived` 或 `superseded`：历史版本，不进入普通 `/review`，但可用于回滚。
- `/review-fix` skill 更新为：
  - 可修订 draft。
  - 可从 active 创建修订草稿。
  - 严禁直接写 active。
  - 用户明确确认后才启用修订版。

### 2. 模式 2 产品化：直接做题

- 新增 `review_exam_points` 工具，用代码读取并展示当前章节的 `exam_points/`。
- 模式 `practice` 的流程调整为：
  - 用户选择章节/知识点/文本范围。
  - 代码解析范围并展示可练习知识点列表。
  - 如果有章节考点总结，先调用 `review_exam_points` 展示考试导向摘要。
  - agent 再基于 `subject.md`、`knowledge_index.json`、`exam_points/` 生成题目。
- 直接练习模式不展示卡片，除非用户在题后动作中主动要求“看卡片”。
- 增加题目来源说明：题目生成后附带 `source_basis` 字段，说明来自哪个知识点或考点总结。

### 3. 模式 3 产品化：章节学习

- 新增 `review_chapter` 工具，用代码读取并展示 `chapters/` 下当前章节或小节内容。
- 模式 `chapter_study` 的流程调整为：
  - 用户先选择章节。
  - 代码列出该章节小节。
  - 用户选择小节或“按顺序学习”。
  - `review_chapter` 展示小节内容。
  - 用户选择“出题 / 下一小节 / 跳过 / 退出”。
  - 只有选择“出题”后，agent 才生成题目并调用 `review_answer`。
- 章节学习不再让 agent 自由转述整章材料；agent 只负责解释、补充、出题和判题。

### 4. 统一题后动作菜单

- 新增 `review_turn_action` 工具，统一三种模式题后动作：
  - 下一题
  - 看卡片
  - 看章节
  - 提示
  - 追问
  - 提高难度
  - 总结
  - 退出
- `review_archive` 完成后，agent 必须调用 `review_turn_action` 获取下一步。
- `review_turn_action` 返回结构化结果，后续由 agent 根据当前模式继续：
  - `next_question`
  - `show_card`
  - `show_chapter`
  - `hint`
  - `discuss`
  - `increase_difficulty`
  - `summary`
  - `exit`

### 5. 卡片产品化升级

- 标准新卡片要求 frontmatter：
  - `id`
  - `name`
  - `aliases`
  - `difficulty`
  - `tags`
  - `chapter`
  - `source`
  - `status`
- 代码继续兼容旧 C++ 卡片，不批量重写 legacy 卡片。
- `review_card` 增加：
  - 当前卡片位置，例如 `3/18`。
  - 卡片缺失提示：缺哪个知识点 ID、建议文件名是什么。
  - 默认隐藏“出题提示”，避免提前暴露考点陷阱。
- 新增 card queue：
  - 当前章节知识点顺序。
  - 未看过优先。
  - 错题相关优先。
  - 低掌握度优先。
- 新增卡片学习状态文件，例如 `state/card_progress.json`：
  - `seen_count`
  - `practice_count`
  - `correct_count`
  - `last_seen_at`
  - `last_practiced_at`
  - `confidence`
- `review_card` 展示后更新 `seen_count`。
- `review_archive` 根据答题结果更新对应卡片的练习统计。

### 6. 示例 Profile

- 新增一个最小 demo profile，放在 `workspace/review_profiles/demo-review/`。
- demo profile 默认为 `active`，用于新用户第一次运行 `/review`。
- demo 内容控制在：
  - 2 章
  - 5-8 个知识点
  - 5-8 张卡片
  - 2 份考点总结
  - 可跑通模式 1、模式 2、模式 3
- demo 科目建议用中性主题，避免继续强化 C++ 特化印象。
- README 中把首次体验路径改为：
  - `npm install`
  - `npm run setup-review`
  - `pi`
  - `/review`
  - 选择 demo profile

## Test Plan

- 单元测试：

  - active profile 创建 revision draft。
  - `review_profile_write` 仍拒绝 active，允许 revision draft。
  - revision draft 启用后，旧 active 变为 `archived/superseded`，新 profile 进入 active 列表。
  - `/review` 只列 active，不列 draft 和 archived。
  - `review_card` 能读取新 frontmatter，也兼容旧卡片。
  - card queue 按未看、错题、低掌握度排序。
  - `review_chapter` 能列小节并读取章节内容。
  - `review_exam_points` 能读取章节考点总结。
  - `review_turn_action` 返回结构化动作。
- 集成测试：

  - demo profile 三种模式各完成一题。
  - active profile 经 `/review-fix` 创建修订草稿，修订后启用。
  - 启用修订版后 `/review` 只显示新 active。
  - 旧 active 可在内部列表中看到 archived 状态。
  - 模式 2 先展示考点总结，再出题。
  - 模式 3 先展示章节小节，再出题。
- 手动验收：

  - 新用户从 `workspace/` 启动 pi 后能直接选择 demo profile。
  - 模式 1：卡片 → 出题 → 判题 → 题后菜单。
  - 模式 2：考点总结 → 出题 → 判题 → 题后菜单。
  - 模式 3：章节小节 → 出题 → 判题 → 题后菜单。
  - 对 active profile 使用 `/review-fix` 不会破坏当前 active，直到用户确认启用。

## Assumptions

- active 资料包修订采用“复制草稿”策略，不做原地降级，不允许热修 active。
- `/review-fix` 是唯一资料包修订入口，不新增单独 `/review-draft` 命令。
- 本阶段安装和插件市场适配延后。
- 旧 C++ profile 继续兼容，不强制迁移卡片格式。
- 模式 2/3 优先实现“代码展示 + agent 出题”，暂不做复杂 Markdown 高亮、全文搜索或分页折叠。
