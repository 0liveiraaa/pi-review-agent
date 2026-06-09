# 03 - 开局难度配置

状态：已实现，待真实 pi TUI 手动复验。

## 目标

复习开始时即可选择难度策略，不再依赖题后“提高难度”。

## 实施范围

- `/review` 选择题型后增加难度选择。
- 难度选项为自动、`S-R`、`S-U`、`M-U`、`M-A`、`C-A`。
- `ReviewSelection`、`initSession()`、`buildReviewStartPrompt()` 记录并注入 `difficulty_policy`。
- 自动模式继续使用现有 `selectDifficulty()`。
- session 写入 `profile_id`、`mode`、`question_type_policy`、`difficulty_policy`，便于后续画像和推荐复用。

## 验收

- 开局选择 `M-U` 后 prompt 明确显示手动难度 `M-U`。
- 自动模式与旧逻辑兼容。
- `progress.current_session` 能看到 profile、mode、题型策略和难度策略。

