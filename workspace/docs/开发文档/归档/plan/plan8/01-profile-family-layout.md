# 01 - Profile Family Layout 重构计划

状态：已完成（2026-06-10）

## Summary

将当前“每次 revision 都生成一个顶层 subjectId 目录”的模型，重构为“一个 subjectId 对应一个 profile family”。每个科目的 active、draft、archived 和用户私有数据都收敛在同一个 subject 目录下。

目标结构：

```text
review_profiles/
└── lisan/
    ├── active/
    │   ├── profile.json
    │   ├── subject.md
    │   ├── knowledge_index.json
    │   ├── cards/
    │   ├── chapters/
    │   ├── exam_points/
    │   └── source_map.json
    ├── draft/
    │   └── ...                  # /review-fix 时从 active 复制
    ├── archived/
    │   ├── 20260610-165648/
    │   └── 20260612-101233/
    └── _user/
        ├── summaries/
        ├── sessions/
        ├── learning_profile.json
        └── card_progress.json
```

## 背景问题

当前真实数据中已经出现：

- `lisan`
- `lisan__draft_20260608`
- `lisan__draft_20260608__draft_20260608`
- `lisan__draft_20260610`

虽然新的 revision 命名修复已经避免继续嵌套，但顶层目录仍会堆积，用户也很难理解哪个才是当前可用版本。

更深层原因是当前模型把“版本”伪装成“科目”。这会导致：

- subjectId 不稳定。
- archived profile 污染顶层目录。
- `_user/` 用户画像绑定到某个 revision，版本切换时容易丢失或错读。
- `/review-fix` 演进链难以解释。
- 后续 prune/export/插件市场发布都会复杂化。

## Key Decisions

- `subjectId` 永远稳定，例如 `lisan`，不再生成 `lisan__draft_...` 作为新科目 id。
- `/review` 永远读取 `review_profiles/{subjectId}/active/`。
- `/review-fix` 从 `active/` 复制生成 `draft/`，只允许修改 `draft/`。
- 启用 draft 时：
  - `active/` 移动到 `archived/{timestamp}/`
  - `draft/` 移动为 `active/`
  - `draft/` 消失
- `_user/` 属于整个 subject family，不参与 active/draft/archive 复制和移动。
- 初始化时直接生成 `active/`，不再先生成 draft。基础资料包不需要归档初始版本。
- 删除能力本轮不做；历史 archived 只收纳，不自动清理。

## Key Changes

### 1. 新 Profile Family API

新增或重构 `workspace/lib/review_profiles.mjs`：

- `getProfileFamilyRoot(subjectId)`
- `getActiveProfileRoot(subjectId)`
- `getDraftProfileRoot(subjectId)`
- `getArchivedProfileRoot(subjectId, timestamp)`
- `loadProfile(subjectId)` 默认读取 `active/profile.json`
- `loadDraftProfile(subjectId)` 读取 `draft/profile.json`
- `listProfileFamilies()` 列出有 `active/profile.json` 的 subject family
- `listActiveProfiles()` 返回 active profile
- `listEditableProfiles()` 返回 active + draft，但按 subject family 聚合展示

返回对象新增：

```js
{
  subjectId,
  familyRoot,
  root,          // active 或 draft 的实际资料根目录
  slot: "active" | "draft" | "archived",
  userRoot,      // familyRoot/_user
  archivedRoot
}
```

### 2. 修改初始化流程

`/review-init`：

- 创建 `review_profiles/{subjectId}/active/`
- 写入基础资料包文件
- 创建 `review_profiles/{subjectId}/_user/`
- 不创建 `draft/`
- `profile.json.status` 可保留为 `active`，但状态语义由 slot 决定

如果 subject family 已存在：

- 默认拒绝覆盖。
- 后续可提示用户使用 `/review-fix`。

### 3. 修改修订流程

`/review-fix`：

- 选择 active profile 时，复制 `active/` 到 `draft/`。
- 如果 `draft/` 已存在：
  - 默认提示用户继续修订现有 draft。
  - 不自动覆盖。
- agent 只能通过 `review_profile_write` 写入 `draft/`。
- `review_profile_enable` 启用时移动目录：

```text
active/ -> archived/{timestamp}/
draft/  -> active/
```

写入 revision metadata：

```json
{
  "subjectId": "lisan",
  "version": "20260610-165648",
  "revision": 3,
  "revisionReason": "...",
  "updatedAt": "..."
}
```

### 4. 用户私有数据迁移

新位置：

```text
review_profiles/{subjectId}/_user/
```

包含：

- `summaries/`
- `sessions/`
- `learning_profile.json`
- `card_progress.json`

`review_summary`、`loadLearningProfile()`、`saveLearningProfile()`、后续 card progress 都应走 `familyRoot/_user/`。

### 5. 旧结构兼容与迁移

必须先支持旧结构 fallback，再做迁移工具。

迁移脚本建议：

```text
workspace/scripts/migrate-profile-family.mjs
```

迁移策略：

- 找出同一 root subject 的 profile 链，例如 `lisan*`。
- 选择当前 `status: active` 的目录作为 `active/`。
- 其它 `archived` / 旧 draft 迁入 `archived/{timestamp}-{oldSubjectId}/`。
- 若旧 profile 有 `_user/`，合并到 family `_user/`。
- 不删除旧目录，默认 dry-run；用户确认后再 move。

本轮实现可以先只做代码兼容，不强制迁移真实数据。

### 6. Doctor 诊断

新增诊断项，优先作为脚本或未来 `/review-doctor`：

- 顶层旧 revision 目录数量。
- subject family 是否有 active。
- 是否存在 draft。
- archived 数量。
- `_user/` 是否存在。
- active 是否包含 stale 目录，例如 `cards_nt/`、`chapters_nt/`、`exam_points_nt/`。

## Test Plan

- `loadProfile("lisan")` 读取 `review_profiles/lisan/active/profile.json`。
- `/review-init` 创建 `subjectId/active/` 和 `subjectId/_user/`。
- `/review-fix` 从 active 创建 draft，不复制 `_user/`。
- `review_profile_write` 只允许写入 `draft/`。
- `review_profile_enable` 将 old active 移到 `archived/{timestamp}/`，将 draft 移为 active。
- `_user/learning_profile.json` 在启用 draft 后仍保留不动。
- `listActiveProfiles()` 只列 subject family 的 active，不列 archived。
- 旧结构 `lisan__draft_20260610` 仍可 fallback 读取。
- `npm run check`
- `npm test`
- `npm run check-package`

## Manual Acceptance

- 新用户 `/review-init` 后，`/review` 能直接看到新科目。
- 对 active profile 执行 `/review-fix` 后，能看到 `draft/` 被创建。
- 启用 draft 后，`draft/` 消失，旧 active 进入 `archived/`。
- summary 和学习画像在版本切换后不丢失。
- 顶层 profile 列表不再出现 `__draft_...`。

## 实施结果

- 已实现 family-aware profile API，并保留旧顶层 profile fallback。
- 已将真实用户数据目录 `C:\Users\25173\.pi\agent\review-data\review_profiles` 迁移为：
  - `cpp-oop/active|archived|_user`
  - `demo-review/active|_user`
  - `lisan/active|archived|_user`
- 迁移后再次 dry-run 显示：`No legacy top-level profiles found.`
- 已新增 `scripts/migrate-profile-family.mjs`，默认 dry-run，传 `--apply` 才移动真实目录。
- 已通过：
  - `npm run check`
  - `npm test`
  - `npm run check-package`

## Assumptions

- 本计划只改 profile 生命周期，不改资料包内容质量。
- 不自动删除旧目录。
- 真实数据迁移必须 dry-run 优先。
- `_user/` 始终是用户私有运行数据，不参与资料包分享和导出。
