# Docs Cleanup And Evolution Route Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clean stale project documentation, align it with the current pi-agent package/runtime state, and consolidate scattered product thoughts into a stable evolution route.

**Architecture:** Treat documentation as three layers: a factual current-state layer, a domain-language layer, and a roadmap layer. Archive obsolete thinking instead of deleting it; update live docs so they describe the current implementation and the next execution sequence: stabilize technical debt, refactor around loop semantics, split profiles into shareable packages, add personal knowledge management, then build the past-paper system.

**Tech Stack:** Markdown documentation, pi-agent extension concepts, `workspace/docs/开发文档`, `workspace/docs/review-kit`, root project docs, PowerShell/npm verification commands.

---

## Scope And Guardrails

Do not implement product features in this plan. This is a documentation and planning cleanup pass.

Do not delete historical docs. Move stale docs into `workspace/docs/开发文档/归档/` or add a top-level archive notice.

Do not rewrite bundled profile content except when documenting profile status. Profile data cleanup belongs to separate technical-debt implementation plans.

Do not stage, commit, or revert unrelated working-tree changes unless the user explicitly asks. This repository currently has unrelated modified/deleted/untracked docs, so inspect status before editing.

Use this pi-agent development reference when touching pi terminology:

```text
C:\Users\25173\AppData\Roaming\npm\node_modules\@earendil-works\pi-coding-agent
```

Verification commands:

```powershell
npm run check
npm run test
npm run check-package
```

`npm run setup-review` is also useful after changing docs that mention package contents or profile setup.

PowerShell may print a local profile warning about `OpenSpecCompletion.ps1`; ignore it if the command exit code is 0.

---

## Current Known Facts To Preserve

- Root `package.json` is a wrapper package whose `pi.extensions` points at `./workspace/extensions/review/index.ts`.
- `workspace/package.json` is the package-local shape whose `pi.extensions` points at `./extensions/review`.
- The runtime extension entry is `workspace/extensions/review/index.ts`.
- There is currently no `workspace/.pi` directory.
- Bundled profiles live in `workspace/profiles/`.
- User-writable review data defaults to `%USERPROFILE%\.pi\agent\review-data`, or `PI_REVIEW_DATA` when explicitly set.
- Runtime profile families use `active/`, `draft/`, `archived/`, and `_user/`.
- Current commands are `/review`, `/review-init`, and `/review-fix`.
- Current review tools include `review_card`, `review_exam_points`, `review_chapter`, `review_answer`, `review_archive`, `review_turn_action`, `review_summary`, `review_profile_write`, and `review_profile_enable`.
- The current technical-debt ordering is P0 usage bugs, P1 profile maintenance, P2 promotion experience.
- The high-level product route is: stabilize current version -> refactor around loop semantics -> independent/shareable profiles -> personalized knowledge management -> past-paper system.

---

## File Structure

### Live Docs To Modify

- `AGENTS.md`: keep as the concise agent working guide. Only update if plan execution discovers a factual mismatch.
- `workspace/docs/开发文档/CONTEXT.md`: domain glossary only. Add or refine terms such as `技能回路`, `节点`, `Profile 资料包`, and perhaps `演进回路` only if terminology is resolved.
- `workspace/docs/开发文档/DESIGN.md`: current-state architecture. Remove stale paths and stale runtime descriptions.
- `workspace/docs/开发文档/产品/产品迭代路线.md`: replace overlapping older roadmap content with the canonical evolution route.
- `workspace/docs/开发文档/产品/后续演进指导.md`: either archive as superseded or rewrite as a short execution guide that points to the canonical roadmap.
- `workspace/docs/开发文档/产品/Pi插件包适配路线.md`: archive or shrink to a current package-state note.
- `README.md`: only touch if docs cleanup requires user-facing wording fixes; otherwise leave to a separate README task.

### Archive Targets

- `workspace/docs/开发文档/归档/产品/`
- `workspace/docs/开发文档/归档/架构/`
- `workspace/docs/开发文档/归档/运维/`
- `workspace/docs/开发文档/归档/plan/`

Create missing archive subdirectories as needed.

### New Docs To Create

- `workspace/docs/开发文档/产品/标准化演进路线.md`
- `workspace/docs/开发文档/产品/技术债优先级.md`
- Optional: `workspace/docs/开发文档/adr/0003-loop-first-stabilization.md` if the final design makes a hard-to-reverse decision that future maintainers need to remember.

---

## Task 1: Inventory Live Docs And Classify Them

**Files:**
- Read: `workspace/docs/开发文档/**/*.md`
- Read: `README.md`
- Read: `AGENTS.md`
- Create: `workspace/docs/开发文档/归档/README.md` if missing

- [ ] **Step 1: Capture current git state**

Run:

```powershell
git status --short
```

Expected: output may include existing unrelated docs changes. Do not revert them.

- [ ] **Step 2: List development docs**

Run:

```powershell
rg --files workspace/docs/开发文档 -g "*.md"
```

Expected: list includes `CONTEXT.md`, `DESIGN.md`, `产品/*.md`, `归档/*.md`, `adr/*.md`, and possibly `plan/*.md`.

- [ ] **Step 3: Build a classification table**

Create or update `workspace/docs/开发文档/归档/README.md` with this structure:

```markdown
# 开发文档归档说明

本目录保存历史方案、旧实现说明和已经被当前路线替代的文档。归档文档不作为当前实现依据；需要判断当前事实时，以 `AGENTS.md`、`workspace/docs/开发文档/DESIGN.md`、`workspace/docs/开发文档/CONTEXT.md` 和 `workspace/docs/开发文档/产品/标准化演进路线.md` 为准。

## 归档原则

- 事实过时但仍有历史价值：归档。
- 已被新路线吸收：归档，并在新路线中保留结论。
- 当前实现仍依赖：保留在 live docs。
- 仅作为参考资料：保留在 `参考资料/`，不归入路线。

## 当前 Live Docs

| 文档 | 用途 |
| --- | --- |
| `../CONTEXT.md` | 项目领域语言，不含实现细节。 |
| `../DESIGN.md` | 当前实现架构事实。 |
| `../产品/标准化演进路线.md` | 产品和工程演进主路线。 |
| `../产品/技术债优先级.md` | 当前技术债分级和验收口径。 |

## 已归档主题

| 文档 | 归档原因 |
| --- | --- |
```

- [ ] **Step 4: Fill the archive table**

Add rows for every document moved or marked as superseded during subsequent tasks. Use this exact wording style:

```markdown
| `产品/后续演进指导.md` | 被 `产品/标准化演进路线.md` 吸收；其中 `lisan/problem_templates` 近期主线不再作为当前优先级。 |
```

- [ ] **Step 5: Verify the archive note renders**

Run:

```powershell
Get-Content -Raw workspace/docs/开发文档/归档/README.md
```

Expected: file contains no placeholder markers or empty table rows.

---

## Task 2: Normalize Domain Language In CONTEXT.md

**Files:**
- Modify: `workspace/docs/开发文档/CONTEXT.md`

- [ ] **Step 1: Read the current glossary**

Run:

```powershell
Get-Content -Raw workspace/docs/开发文档/CONTEXT.md
```

Expected: existing terms include `推理原子`, `原子图`, `技能回路`, `节点`, `知识点`, `原子方案`, and `种子池`.

- [ ] **Step 2: Keep implementation details out**

Edit `workspace/docs/开发文档/CONTEXT.md` so definitions remain one or two sentences and do not describe concrete files, commands, or code modules.

Use these canonical additions/refinements:

```markdown
**Profile 资料包 (Profile Package)**：
一门课程或学习主题的可复习资料集合，包含学科说明、知识索引、卡片、章节材料、考点总结和质量说明。它是可迁移、可审查、可版本化、可分享的学习资产。
_Avoid_: 资料缓存, profile 文件夹, 课程包

**运行数据 (Runtime Data)**：
用户在复习过程中产生的私有状态，包括答题归档、总结、学习画像和进度信息。运行数据不属于可分享的 Profile 资料包。
_Avoid_: profile 数据, bundled 数据, 用户资料包

**演进回路 (Evolution Loop)**：
项目迭代的治理闭环：发现问题、修复技术债、验证行为、同步文档、再进入下一轮规划。它约束工程节奏，不等同于用户复习流程。
_Avoid_: 开发流程, 版本计划, 随手整理
```

- [ ] **Step 3: Clarify loop distinction**

Ensure `技能回路` stays about agent workflow nodes and `演进回路` stays about project governance. If both terms exist, their definitions must not overlap.

- [ ] **Step 4: Verify no implementation paths leaked into CONTEXT.md**

Run:

```powershell
Select-String -Path workspace/docs/开发文档/CONTEXT.md -Pattern "workspace/|extensions/|lib/|review.config|npm|pi "
```

Expected: no matches, unless a term explicitly needs `pi-agent` as a product name. If matches appear, remove implementation details from the glossary.

---

## Task 3: Rewrite DESIGN.md As Current-State Architecture

**Files:**
- Modify: `workspace/docs/开发文档/DESIGN.md`
- Read: `AGENTS.md`
- Read: `workspace/package.json`
- Read: `workspace/lib/review_config.mjs`
- Read: `workspace/lib/review_profiles.mjs`
- Read: `workspace/extensions/review/index.ts`

- [ ] **Step 1: Confirm current package facts**

Run:

```powershell
Get-Content -Raw workspace/package.json
Get-Content -Raw workspace/lib/review_config.mjs
rg -n "registerCommand|registerTool|review_summary|DATA_ROOT|profilesDir|seedBundledProfiles" workspace/extensions/review/index.ts workspace/lib
```

Expected: package-local `pi.extensions` is `./extensions/review`; `DATA_ROOT` defaults to `~/.pi/agent/review-data`; registered commands/tools match current code.

- [ ] **Step 2: Replace stale architecture sections**

Rewrite `workspace/docs/开发文档/DESIGN.md` around these headings:

```markdown
# Pi Review Agent 当前架构

> 状态：current
> 维护口径：描述当前实现事实，不承载未来路线

## 1. 运行形态
## 2. Package 布局
## 3. Extension 命令和工具
## 4. Profile 资料包与运行数据
## 5. Review 单题流程
## 6. Skill 体系
## 7. 已知技术债
## 8. 旧架构归档
```

- [ ] **Step 3: Use current package/data wording**

Include this exact data distinction:

```markdown
Bundled profiles live in `workspace/profiles/` and are treated as package resources. User-writable review data lives under `%USERPROFILE%\.pi\agent\review-data` by default, or under `PI_REVIEW_DATA` when explicitly configured. Runtime profile families use `active/`, `draft/`, `archived/`, and `_user/`.
```

- [ ] **Step 4: Remove stale claims**

Run:

```powershell
Select-String -Path workspace/docs/开发文档/DESIGN.md -Pattern "workspace/.pi|review_profiles/.*cpp-oop|21 tests|state/|archive/|cd workspace && pi|v0.78"
```

Expected: no matches that present those as current facts. Historical mentions are allowed only under `旧架构归档`.

- [ ] **Step 5: Verify design doc points future work elsewhere**

Ensure `DESIGN.md` does not include the full product roadmap. It should link to `产品/标准化演进路线.md` for future direction.

---

## Task 4: Create The Canonical Evolution Route

**Files:**
- Create: `workspace/docs/开发文档/产品/标准化演进路线.md`
- Read: `workspace/docs/开发文档/产品/产品迭代路线.md`
- Read: `workspace/docs/开发文档/产品/后续演进指导.md`
- Read: `workspace/docs/开发文档/CONTEXT.md`

- [ ] **Step 1: Write the route document**

Create `workspace/docs/开发文档/产品/标准化演进路线.md` with this structure:

```markdown
# Pi Review Agent 标准化演进路线

> 状态：current
> 更新日期：2026-07-05

## 路线判断

当前阶段不是继续堆新功能，而是先稳定当前版本、清理技术债，并用统一的 loop 语言重构 agent 工作流和工程治理。后续功能必须建立在可诊断、可验证、可分享的资料包基础上。

## 核心原则

### 代码稳定，Agent 灵活

需要一致交互、状态更新、路径安全、数据校验的部分由代码实现。需要解释、变体生成、语义判断、资料重组的部分交给 agent 和 skill。

### Profile 是产品资产

Profile 资料包不是缓存，而是可迁移、可审查、可版本化、可分享的学习资产。运行数据必须和可分享资料包分离。

### Loop 先服务稳定性

短期先把技能回路和演进回路说清楚：agent 工作流要可编排、工程迭代要可验证。产品学习 loop 在稳定版本之后再做成用户入口。

## 标准路线

### 阶段 0：文档和事实收敛

目标：清理过时 docs，统一当前事实和领域语言。

交付：

- `CONTEXT.md` 只保留领域语言。
- `DESIGN.md` 只描述当前实现。
- 旧路线和旧架构进入 `归档/`。
- 技术债优先级单独成文。

验收：

- 新 agent 能通过 `AGENTS.md`、`CONTEXT.md`、`DESIGN.md`、本路线理解项目。
- live docs 不再互相矛盾。

### 阶段 1：稳定当前版本和技术债清理

目标：先修影响使用和长期维护的问题，不新增大功能。

交付：

- P0 使用 bug 被复核并修复或明确外部依赖。
- profile path/data root 口径统一。
- duplicate extension/tool registration 有诊断。
- `doctor/prune` 设计进入实现计划。
- README 和安装错误提示能告诉用户数据在哪里。

验收：

- `npm run check`、`npm run test`、`npm run check-package` 通过。
- 新用户能知道如何启动、如何修复常见问题、数据保存在哪里。

### 阶段 2：基于技能回路重构实现和产品逻辑

目标：把 `/review`、`/review-init`、`/review-fix` 的 agent 工作流表达为可验证的节点序列。

交付：

- 节点定义包含 goal、context、tools、mechanism、entry/exit conditions。
- 每个命令的流程可以映射到技能回路。
- review tools 的责任边界被稳定下来。

验收：

- agent 不需要靠自由发挥决定何时调用关键工具。
- 每个节点失败时都有可诊断输出或下一步修复建议。

### 阶段 3：Profile 独立和分享

目标：让 profile 成为可导入、可导出、可发布的资料包。

交付：

- profile export/import 设计。
- `_user/` 运行数据不进入分享包。
- profile metadata 包含作者、课程、版本、来源、许可。
- quality report 和 source map 进入分享前检查。

验收：

- 一个用户能导出 profile，另一个用户能直接导入 `/review`。
- 分享包不包含个人答题记录。

### 阶段 4：个性化知识管理

目标：把长期学习画像变成可执行推荐，而不是只作为 summary 结果。

交付：

- 今日推荐入口或 `/review` 首页推荐。
- 推荐依据包括错题、低 confidence、久未复习、未看卡片、summary lingering questions。
- 学习画像仍属于运行数据。

验收：

- 用户不选择章节也能开始合理复习。
- 推荐原因可解释。

### 阶段 5：真题系统

目标：profile 能包含真题，系统能展示、归档、分析并生成真题风格练习。

交付：

- `past_papers/` 资料层设计。
- 真题展示工具设计。
- 真题归档字段。
- 真题知识点映射和风格分析。

验收：

- 能随机抽取真题。
- 能按知识点找到相关真题。
- 能生成不复制原题的真题风格题。

## 明确暂缓

- PDF/Word/PPT/OCR 全格式导入。
- Web UI。
- 云同步。
- 多人班级看板。
- 完整真题自动切分。
```

- [ ] **Step 2: Verify no stale priority remains**

Run:

```powershell
Select-String -Path workspace/docs/开发文档/产品/标准化演进路线.md -Pattern "lisan|problem_templates|马上|万能导入器"
```

Expected: no matches. The canonical route should not make `lisan` or `problem_templates` the main current path.

- [ ] **Step 3: Link the route from DESIGN.md**

Add a short sentence in `workspace/docs/开发文档/DESIGN.md`:

```markdown
Future product direction is tracked in `产品/标准化演进路线.md`; this document only records current architecture.
```

---

## Task 5: Create The Technical Debt Priority Doc

**Files:**
- Create: `workspace/docs/开发文档/产品/技术债优先级.md`
- Read: `workspace/docs/开发文档/产品/标准化演进路线.md`
- Read: tests in `workspace/test/review_core.test.mjs`

- [ ] **Step 1: Write the technical debt doc**

Create `workspace/docs/开发文档/产品/技术债优先级.md` with this content:

```markdown
# 技术债优先级

> 状态：current
> 更新日期：2026-07-05

本文件只记录当前技术债排序和验收口径。具体实现计划应另起 plan。

## P0：影响使用的 bug

这些问题优先于任何新功能。

| 问题 | 当前判断 | 验收口径 |
| --- | --- | --- |
| TUI 滚动、长题干、进度条上弹 | 已调查为 pi-agent 兼容性问题，需要记录复现条件和上游状态 | 文档说明现状；如果本仓库可规避，提供最小规避方案；否则不把它混入本仓库功能计划 |
| profile 路径/data root 混乱 | 当前代码已引入 `%USERPROFILE%\.pi\agent\review-data` 和 `PI_REVIEW_DATA`，docs 和诊断仍需统一 | docs、doctor、错误提示都指向同一数据目录模型 |
| 章节匹配错误 | 已有测试覆盖 decimal section overmatch，仍需防回归 | 测试覆盖典型章节号、小节号、关键词范围 |
| duplicate extension/tool registration | 需要诊断重复加载来源，例如 root package、workspace package、旧 `.pi` 或全局安装并存 | doctor 能提示重复来源和建议保留的 canonical 入口 |

## P1：影响资料包长期维护

| 问题 | 当前判断 | 验收口径 |
| --- | --- | --- |
| active 元数据残留旧 revision 链 | 影响 profile 可读性和 revision 判断 | profile doctor 能报告旧字段，fix/prune 有 dry-run |
| archived/draft 目录膨胀但没有 doctor/prune | 长期使用会积累无效目录 | prune 默认 dry-run，明确保留 active、当前 draft、最近 archived |
| quality_report 和 source_map 过时 | 资料包可信度下降 | quality report 能说明生成时间、来源统计、缺口 |
| skill 运行目录和 template 源不同步 | 修改 skill 时容易漏同步 review-kit 模板 | `check-package` 或 docs 明确同步要求 |
| 卡片匹配依赖中文文件名，缺少 id/alias frontmatter | 分享和重命名时不稳定 | 新卡片优先使用 frontmatter id/name/aliases，文件名只作为兼容 fallback |

## P2：影响推广体验

| 问题 | 当前判断 | 验收口径 |
| --- | --- | --- |
| 安装脚本错误信息不够可执行 | 新用户遇错后不知道怎么修 | 错误信息包含原因、检查命令、修复命令 |
| 用户不知道数据保存在哪里 | 会误删或找不到 summary/profile | README、doctor、启动提示都显示数据目录 |

## 不进入本轮

- Profile export/import。
- 个性化知识管理入口。
- 真题系统。
- 全格式导入。
```

- [ ] **Step 2: Link from the route doc**

Add this line under 阶段 1 in `标准化演进路线.md`:

```markdown
详细分级和验收口径见 `技术债优先级.md`。
```

- [ ] **Step 3: Verify P0/P1/P2 are in one place**

Run:

```powershell
rg -n "P0|P1|P2|技术债优先级" workspace/docs/开发文档
```

Expected: `技术债优先级.md` is the canonical current document. Older docs may contain historical mentions only if archived or explicitly superseded.

---

## Task 6: Archive Or Supersede Overlapping Product Docs

**Files:**
- Move or modify: `workspace/docs/开发文档/产品/产品迭代路线.md`
- Move or modify: `workspace/docs/开发文档/产品/后续演进指导.md`
- Move or modify: `workspace/docs/开发文档/产品/Pi插件包适配路线.md`
- Modify: `workspace/docs/开发文档/归档/README.md`

- [ ] **Step 1: Decide archive strategy**

Use this default strategy unless the user says otherwise:

- Move `产品/后续演进指导.md` to `归档/产品/后续演进指导.md`.
- Move `产品/Pi插件包适配路线.md` to `归档/产品/Pi插件包适配路线.md`.
- Keep `产品/产品迭代路线.md` only if rewritten as a short pointer to `标准化演进路线.md`; otherwise archive it too.

- [ ] **Step 2: Move files with PowerShell**

Run:

```powershell
New-Item -ItemType Directory -Force workspace/docs/开发文档/归档/产品 | Out-Null
Move-Item -LiteralPath "workspace/docs/开发文档/产品/后续演进指导.md" -Destination "workspace/docs/开发文档/归档/产品/后续演进指导.md"
Move-Item -LiteralPath "workspace/docs/开发文档/产品/Pi插件包适配路线.md" -Destination "workspace/docs/开发文档/归档/产品/Pi插件包适配路线.md"
```

If `产品迭代路线.md` is archived too, run:

```powershell
Move-Item -LiteralPath "workspace/docs/开发文档/产品/产品迭代路线.md" -Destination "workspace/docs/开发文档/归档/产品/产品迭代路线.md"
```

- [ ] **Step 3: If keeping 产品迭代路线.md, shrink it**

Replace its content with:

```markdown
# 产品迭代路线

> 状态：superseded

当前标准路线见 `标准化演进路线.md`。本文件仅作为旧入口保留，避免历史链接失效。
```

- [ ] **Step 4: Update archive README**

Add rows:

```markdown
| `产品/后续演进指导.md` | 被 `产品/标准化演进路线.md` 吸收；旧的 `lisan/problem_templates` 近期主线不再作为当前优先级。 |
| `产品/Pi插件包适配路线.md` | package 适配事实已进入 `DESIGN.md` 和 `AGENTS.md`；旧层次路线归档。 |
| `产品/产品迭代路线.md` | 被 `产品/标准化演进路线.md` 替代或缩减为旧链接入口。 |
```

- [ ] **Step 5: Verify no broken live references**

Run:

```powershell
rg -n "后续演进指导|Pi插件包适配路线|产品迭代路线" README.md AGENTS.md workspace/docs/开发文档 workspace/docs/review-kit
```

Expected: live references either point to `标准化演进路线.md` or explicitly label old docs as archived.

---

## Task 7: Add A Docs Index For Future Agents

**Files:**
- Create or modify: `workspace/docs/开发文档/README.md`

- [ ] **Step 1: Create the docs index**

Create `workspace/docs/开发文档/README.md`:

```markdown
# Pi Review Agent 开发文档入口

本目录只保存当前开发依据和必要历史资料。新 agent 应按以下顺序阅读：

1. `../../../AGENTS.md`：仓库工作约定和当前事实。
2. `CONTEXT.md`：领域语言。
3. `DESIGN.md`：当前实现架构。
4. `产品/标准化演进路线.md`：产品和工程演进路线。
5. `产品/技术债优先级.md`：当前技术债排序和验收口径。

## 当前文档

| 文档 | 用途 |
| --- | --- |
| `CONTEXT.md` | 项目领域语言，不含实现细节。 |
| `DESIGN.md` | 当前实现事实，不承载未来路线。 |
| `产品/标准化演进路线.md` | 标准化演进路线。 |
| `产品/技术债优先级.md` | 技术债分级和验收标准。 |
| `adr/` | 难以逆转且需要解释的架构决策。 |
| `参考资料/` | 外部或原始参考材料。 |
| `归档/` | 历史方案和旧实现说明。 |

## 维护规则

- 当前事实写入 `DESIGN.md`。
- 项目语言写入 `CONTEXT.md`。
- 未来路线写入 `产品/标准化演进路线.md`。
- 技术债排序写入 `产品/技术债优先级.md`。
- 旧想法不要删除，归档并说明被什么替代。
```

- [ ] **Step 2: Verify relative links are readable**

Run:

```powershell
Get-Content -Raw workspace/docs/开发文档/README.md
```

Expected: the path `../../../AGENTS.md` is present and points from `workspace/docs/开发文档/README.md` to root `AGENTS.md`.

---

## Task 8: Decide Whether ADR 0003 Is Needed

**Files:**
- Optional create: `workspace/docs/开发文档/adr/0003-loop-first-stabilization.md`

- [ ] **Step 1: Check whether the decision meets ADR criteria**

Create ADR 0003 only if the team agrees this is a hard-to-reverse product/architecture decision:

```text
Before new product systems, the project will stabilize current runtime and express agent/product evolution through loop language.
```

This qualifies if future maintainers might otherwise restart from真题系统, Web UI, or all-format import before fixing core stability.

- [ ] **Step 2: If qualified, create the ADR**

Create `workspace/docs/开发文档/adr/0003-loop-first-stabilization.md`:

```markdown
# Loop-first stabilization before new product systems

The project will stabilize the current pi-agent review runtime and express agent workflow plus engineering governance through loop terminology before building profile sharing, personalized knowledge management, or the past-paper system. This keeps new product work dependent on diagnosable runtime behavior, clean profile/data boundaries, and synchronized documentation instead of adding features on top of unstable paths.
```

- [ ] **Step 3: If not qualified, do not create ADR**

If the decision feels reversible or obvious, skip the ADR and record the route only in `标准化演进路线.md`.

---

## Task 9: Final Consistency Pass

**Files:**
- Read all live docs touched by this plan.

- [ ] **Step 1: Search for stale path claims**

Run:

```powershell
rg -n "workspace/.pi|\\.pi/extensions|review_profiles/\\{subject_id\\}|workspace/review_profiles|cd workspace && pi|21 tests|v0\\.78|state/learning_profiles|archive/sessions" AGENTS.md README.md workspace/docs/开发文档
```

Expected: matches are either absent, in archived docs, or clearly marked as historical. Live docs should prefer current package/data-root wording.

- [ ] **Step 2: Search for superseded roadmap focus**

Run:

```powershell
rg -n "lisan|problem_templates|完整真题自动切分|PDF / Word / PPT|Web UI|云同步" workspace/docs/开发文档/产品 workspace/docs/开发文档/DESIGN.md
```

Expected: live docs mention these only as examples, deferred items, or archived history. They should not be current next steps.

- [ ] **Step 3: Run package checks**

Run:

```powershell
npm run check
npm run test
npm run check-package
```

Expected:

- `npm run check` exits 0.
- `npm run test` exits 0.
- `npm run check-package` exits 0.

- [ ] **Step 4: Summarize the diff**

Run:

```powershell
git status --short
git diff --stat
```

Expected: changes are limited to documentation files planned above, plus any pre-existing unrelated changes that were already present before execution.

- [ ] **Step 5: Prepare handoff summary**

Write a concise summary for the user:

```markdown
Docs cleanup completed.

Changed:
- Current architecture now lives in `workspace/docs/开发文档/DESIGN.md`.
- Canonical route now lives in `workspace/docs/开发文档/产品/标准化演进路线.md`.
- Technical debt priorities now live in `workspace/docs/开发文档/产品/技术债优先级.md`.
- Superseded product docs were archived under `workspace/docs/开发文档/归档/产品/`.

Verified:
- `npm run check`
- `npm run test`
- `npm run check-package`

Notes:
- Existing unrelated working-tree changes were left untouched.
```

---

## Self-Review Checklist

- [ ] Every live doc has one owner purpose: glossary, architecture, route, or debt.
- [ ] No live doc claims `.pi/extensions` or `workspace/review_profiles` is the current runtime layout.
- [ ] No live doc makes `lisan/problem_templates` the immediate main route unless the user re-approves that.
- [ ] P0/P1/P2 debt appears canonically in `技术债优先级.md`.
- [ ] The route preserves the user-approved sequence: stabilize -> loop refactor -> profile sharing -> personalized knowledge management -> past-paper system.
- [ ] Archived docs are not deleted.
- [ ] Verification commands were run and results recorded.
