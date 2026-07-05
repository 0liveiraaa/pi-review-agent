# 08 - 资料包私有记忆与 Revision 清理

状态：已完成（2026-06-09）

## 目标

将 summary 和学习画像从全局 `archive/`、`state/learning_profiles/` 收敛到用户数据目录中对应资料包的 `_user/` 下，同时修复 revision draft 多次修订后 subjectId 层层嵌套的问题。

## 已实施范围

- 新增 profile 私有运行目录：
  - `review_profiles/{subjectId}/_user/summaries/`
  - `review_profiles/{subjectId}/_user/learning_profile.json`
- `review_summary` 新写入 profile 私有 summaries，并更新 profile 私有 learning profile。
- `/review` 优先读取所选 profile 的 `_user/learning_profile.json`。
- 旧全局 `state/learning_profiles/{subjectId}.json` 仍作为 fallback，避免历史画像丢失。
- `createRevisionDraft()` 改为基于 root subjectId 命名：
  - `{root}__draft_{YYYYMMDD}`
  - `{root}__draft_{YYYYMMDD}_v2`
  - `{root}__draft_{YYYYMMDD}_v3`
- revision draft metadata 新增：
  - `revisionRoot`
  - `revisionNumber`
  - `revisionOf`
  - `revisionCreatedAt`
  - `revisionReason`
- 启用 revision draft 时继续归档原 active，保留历史目录，不自动删除。
- `/review` 只显示 active profile；`/review-fix` 可显示 active 和 draft；archived 不进入普通使用流。

## 当前策略

`_user/` 是用户私有运行数据，不属于可分享资料包内容。后续做 profile export 或插件市场打包时必须排除 `_user/`。

历史 draft/archived 目录本轮只隐藏不删除。后续可增加 `review_profile_prune` 或 `/review-doctor`，默认 dry-run，用户确认后再清理。

## 验收结果

- `npm run check` 通过。
- `npm test` 通过，当前 26 个测试全部通过。
- 已新增测试覆盖：
  - revision draft 二次修订不会生成 `__draft_...__draft_...`。
  - revision draft 使用 root subjectId 和 `_vN` 版本号。
  - summary 写入 profile 私有 `_user/summaries/`。
  - learning profile 写入并优先读取 profile 私有 `_user/learning_profile.json`。

## 后续

- 可在 `/review-doctor` 或安装检查中统计 draft/archived 数量。
- 可设计 `review_profile_prune({ keepArchived, deleteDraftOlderThanDays, dryRun })`，但不应默认删除。
