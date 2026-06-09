# 02 - 题后菜单生命周期简化

状态：已实现，待真实 pi TUI 手动复验。

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

