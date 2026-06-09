# 07 - TUI 使用逻辑优化计划

## Summary

本计划处理 TUI 稳定性修复后暴露出的使用逻辑问题。目标不是改 review 核心架构，而是减少阻塞步骤、降低用户遗忘题干的概率、让工具返回后的下一步更明确。

当前三项问题尚未完全修复：

- 学习画像每次选择 profile 后都会阻塞显示，用户必须按 Enter。
- 选择题先展示题目面板，再进入“选择答案”列表，用户可能忘记题干。
- 卡片/章节面板的 N/S/Enter 结束 UI 后，后续动作依赖 agent 正确理解工具结果，用户可能感觉按了没反应。

## Priority

### P0：学习画像不再默认阻塞

当前行为：

- `/review` 选择 profile 后立即调用 `showScrollableTextPanel(ctx, "学习画像", ...)`。
- 即使没有真实历史画像，也需要 Enter 继续。

修复目标：

- 无历史画像时不弹面板。
- 有历史画像时默认只显示非阻塞摘要，或在 profile 选择描述/状态栏中提示。
- 只有用户明确选择“查看学习画像”时，才打开完整滚动面板。

建议实现：

- 新增判断函数，例如 `hasLearningProfileContent(profileText)`。
- `chooseReviewSelection()` 中：
  - 如果 profile 无 `recent_sessions`，跳过学习画像面板。
  - 如果有画像，先用 `ctx.ui.notify()` 或 status 显示一句摘要。
  - 可在 profile 选择后增加一个轻量选择项：`开始复习` / `查看学习画像`。
- `buildReviewStartPrompt()` 仍继续注入学习画像，不影响 agent 获取长期状态。

验收：

- 新用户第一次 `/review` 不会被“暂无历史画像”面板打断。
- 有历史画像时，agent prompt 仍包含画像。
- 用户需要时能查看完整画像。

### P1：选择题题干与选项同屏

当前行为：

- `review_answer` 先用 `showScrollableTextPanel()` 展示题目。
- Enter 后进入 `selectItem(ctx, "选择答案", options)`。
- 选择列表中不再显示题干，用户可能忘记题目。

修复目标：

- 单选题/判断题在同一个 TUI 面板中显示题干摘要和选项选择器。
- 长题干仍可先滚动阅读，但选择时至少保留 3-5 行题干摘要。

建议实现：

- 新增 `selectAnswerWithQuestion(ctx, question)`。
- 对 `choice` / `judgment`：
  - 面板顶部显示题干前 3-5 行摘要。
  - 中部显示 `SelectList`。
  - 如果题干过长，底部提示“Esc 取消；可先在上一屏滚动查看完整题干”。
- 或者复用 `selectItem`，增加可选 `headerLines` 参数。
- 多选题仍可文本输入，但输入面板标题保留题干摘要和选项摘要。

验收：

- 单选/判断选择答案时能看到题干摘要。
- 长题干仍能完整滚动查看。
- 选择题不需要用户记住上一屏内容。

### P2：工具返回后的下一步更明确

当前行为：

- `review_card` 返回 `review_card action=next_card...`。
- `review_chapter` 返回 `review_chapter action=next_section...`。
- 后续完全依赖 agent 按 prompt 继续调用工具或出题。

修复目标：

- 工具返回文本明确告诉 agent 下一步该做什么。
- 用户能看到更清楚的动作反馈。
- 暂不实现完整代码状态机。

建议实现：

- `review_card` tool result 文本根据 action 输出：
  - `practice`：`User chose practice. Generate one question now and call review_answer.`
  - `next_card`：`User chose next_card. Select the next related knowledge point and call review_card again. Do not generate a question yet.`
  - `skip`：`User skipped this card. Choose another target or ask the user.`
  - `exit`：`User exited card review. Ask whether to summarize or stop.`
- `review_chapter` 同理：
  - `next_section`：明确要求选择下一小节并再次调用 `review_chapter`。
- `review_exam_points`：
  - `practice`：明确进入出题。
  - `skip/exit`：明确不要出题。
- `review-core` 和 `review-question` 保持现有契约，但可以补一句“工具 result 文本优先作为下一步控制信号”。

验收：

- N/S/Enter 后 agent 能更稳定地按返回动作继续。
- 工具结果文本对用户和 agent 都可读。
- 不引入新状态机，不改变工具 schema。

## Test Plan

- `npm run check`
- `npm test`
- `npm run check-package`

手动验收：

- 第一次 `/review` 选择 demo profile，不出现空学习画像阻塞面板。
- 有 summary 后 `/review`，能看到简短画像提示，且 prompt 仍注入画像。
- 单选题/判断题选择答案时，选择器上方能看到题干摘要。
- 在卡片中按 N 后，agent 继续下一张卡片，而不是直接出题或沉默。
- 在章节中按 N 后，agent 继续下一小节或明确说明没有下一小节。

## Out of Scope

- 不实现完整 ReviewTurnController。
- 不改 profile schema。
- 不新增命令。
- 不重写 pi-tui 基础组件。

