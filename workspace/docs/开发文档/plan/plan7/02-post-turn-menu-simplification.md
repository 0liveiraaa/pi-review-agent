# 02 - 题后菜单生命周期简化

状态：已实现，已补自动化回归；真实 pi TUI 可继续作为发布前手动复验项。

## 目标

把 `review_turn_action` 从全功能菜单改成复习续航菜单，避免章节学习或答题结束后反复出现低频、不合时机的选项。

## 实施范围

- `review_turn_action` 只保留 `next_question`、`show_card`、`show_chapter`、`summary`、`exit`。
- 移除题后默认的 `hint`、`discuss`、`increase_difficulty`。
- 提示和追问归属答题中或自然对话；难度调整归属开局配置。
- 更新 `review-core`、`review-question`、`DESIGN.md` 中的工具契约和流程描述。

## 验收

- 归档后不再显示“提示/追问/提高难度”。
- 三种模式都能通过简化菜单继续复习、查看资料、总结或退出。
- 测试断言新的 action 集合。

## 当前实现记录

- `review_turn_action` 只返回 `next_question`、`show_card`、`show_chapter`、`summary`、`exit`。
- 答题中的“提示/追问”保留在 `review_answer` 阶段，不再出现在题后菜单。
- 难度调整已前置到 `/review` 开局配置，不再作为题后动作。
- 单元测试已断言题后 action 集合，防止后续回退。
