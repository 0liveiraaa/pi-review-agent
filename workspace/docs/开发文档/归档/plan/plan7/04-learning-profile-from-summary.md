# 04 - Summary 驱动学习画像

状态：已实现，待真实 pi TUI 手动复验。

## 目标

让 `archive/summaries` 和 session 结果沉淀为每个科目的长期学习画像，并在每次 `/review` 前注入给 agent。

## 实施范围

- 新增用户私有状态 `state/learning_profiles/{subject_id}.json`。
- `review_summary` 保存报告后同步更新对应科目的学习画像。
- `/review` 启动并选择 profile 后读取画像，注入最近复习表现、薄弱点、错误类型、遗留问题和下次建议。
- 画像字段保持最小：`recent_sessions`、`accuracy`、`weak_points`、`error_types`、`lingering_questions`、`next_suggestions`、`updated_at`。
- 不自动修改资料包；如需优化资料包，仍由用户通过 `/review-fix` 创建 revision draft。

## 验收

- 第一次复习无画像时 prompt 不臆造历史。
- 生成 summary 后再次 `/review` 能注入近期画像。
- learning profile 写入用户数据目录，不进入可分享 profile。

