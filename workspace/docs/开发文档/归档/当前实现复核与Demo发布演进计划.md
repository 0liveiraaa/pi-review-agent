> **✅ 复核已办结**（2026-06-06）
> 本文档列出的阻塞项已在同日处理完成：
> - node_modules/ 已从 git 跟踪移除 + .gitignore
> - package.json 已更名为 pi-review@3.0.0，移除旧入口
> - review_cli.mjs / review_cli.py / lib/session.mjs / lib/terminal.mjs 已归档至 docs/legacy/
> - 所有开发文档已重写或标注 legacy
> - DESIGN.md 已更新至 v4.0

# 当前实现复核与 Demo 发布演进计划

日期：2026-06-06

范围：依据 `plan_v2.md` 复核当前 `workspace/` 实现，重点关注产品化完成度、旧代码清理、开源 demo 风险、开发文档过时内容，以及从当前状态到可 demo 发布的演进路线。

## 结论摘要

当前实现已经具备“可继续打磨成 demo”的地基：`/review`、`/review-init`、`/review-fix`、profile 生命周期、代码渲染卡片、模式 2/3 材料展示、题后动作菜单、demo profile、核心单元测试都已经存在，并且 `npm run check` 与 `npm test` 通过。

但当前仓库形态还不能直接作为开源 demo 发布。主要阻塞不是核心逻辑缺失，而是：

- 仓库仍跟踪 `node_modules/`、个人归档、运行状态、`__pycache__/`、旧 CLI 文件等不适合开源的内容。
- `package.json` 仍把旧 `review_cli.mjs` 作为入口，项目名和描述仍是 C++ 特化。
- `review_cli.mjs`、`review_cli.py`、`lib/session.mjs`、`lib/terminal.mjs` 已经与 pi TUI 扩展产品形态脱节。
- `workspace/nul` 会导致 Windows 下 `git add -A` 失败，必须删除并防止再次生成。
- 多份开发文档仍描述旧的 C++ 单体 CLI / SYSTEM.md / root `.pi` 架构，需要归档或重写。
- 终端输出中多处中文呈现为乱码；JSON 可被 Node 正确读取，说明至少部分是 PowerShell 显示编码问题，但源码、README、测试快照中的中文仍需要做一次 UTF-8 读写审计。

## plan_v2.md 实现复核

| 计划项 | 当前状态 | 评价 |
| --- | --- | --- |
| `/review-fix` 支持 draft 和 active | 已实现 | active 会先复制成 revision draft，再发送修订 prompt。 |
| active 不允许原地修改 | 已实现 | `review_profile_write` 拒绝非 draft profile。 |
| revision draft 启用后归档旧 active | 已实现 | `enableProfile()` 会将原 profile 标记为 `archived` 并记录 `supersededBy`。 |
| 新增 `draft/active/archived` 状态 | 基本实现 | 代码支持 `draft`、`active`、`archived`；文档和 UI 还需要补充“回滚/历史版本”说明。 |
| 模式 2 使用 `review_exam_points` | 已实现工具 | 工具已注册并能读取 `exam_points/`，但流程仍依赖 agent 遵守 prompt，尚未由代码状态机强制串联。 |
| 模式 3 使用 `review_chapter` | 已实现工具 | 工具已注册并能选择/展示章节材料；同样仍依赖 agent 遵守 prompt。 |
| 统一题后动作 `review_turn_action` | 已实现工具 | 工具已注册并返回结构化动作；但“archive 后必须调用”的约束仍主要在 skill/prompt 中。 |
| 卡片 frontmatter 标准 | 部分实现 | `cards.mjs` 能解析 frontmatter 并兼容旧卡片；标准卡片 schema 还没有独立校验。 |
| 卡片队列 | 已实现初版 | 支持未看、弱点、低掌握度排序；排序逻辑可继续产品化。 |
| `state/card_progress.json` | 已实现 | `seen_count/practice_count/correct_count/confidence` 已更新；开源时应重置为空状态。 |
| `review_archive` 更新卡片练习统计 | 已实现 | 通过 `updateStateFromArchive()` 关联知识点更新卡片统计。 |
| demo profile | 已实现 | `demo-review` 已存在且 active，测试覆盖 cards/chapters/exam_points。 |
| README 首次体验指向 demo | 部分实现 | README 已写 demo 路径，但终端显示存在中文编码风险，且 package 默认仍是 C++。 |

## 当前验证结果

已执行：

```powershell
npm run check
npm test
```

结果：

- `npm run check` 通过。
- `npm test` 通过，21 个测试全部 pass。
- 测试覆盖了 profile 生命周期、active 修订草稿、路径安全、review prompt、卡片归一化、card queue、card progress、demo profile。

附带环境噪音：

- PowerShell 启动时会报 `OpenSpecCompletion.ps1` 不存在。这不是本项目错误，但会污染命令输出。

## 关键代码风险

### 1. 产品入口仍指向旧 CLI

`workspace/package.json` 当前仍是：

- `name: "cpp-review-assistant"`
- `description` 仍是 C++ 期末复习助手
- `main: "review_cli.mjs"`
- `start: "node review_cli.mjs"`
- `check` 仍检查 `review_cli.mjs`

这与当前产品形态冲突。开源 demo 应明确以 `workspace/.pi/extensions/review/index.ts` 为主入口，旧 CLI 不能再作为 package main/start。

建议：

- package name 改为中性名称，例如 `pi-review-assistant` 或 `pi-review-workspace`。
- 移除或改写 `start`。可改成 `npm run setup-review && pi` 的说明型脚本，或者不提供 start。
- `check` 应检查当前主路径：`lib/*.mjs`、`scripts/*.mjs`、必要时加扩展 import smoke test。
- `review_cli.mjs` 若保留，只能作为 `legacy`，不能是入口。

### 2. `review_cli.py` 不适合进入开源主项目

`workspace/review_cli.py` 是大型旧原型，C++ 特化，且与当前 pi TUI 扩展架构不一致。它容易让用户误判项目入口，也会增加维护负担。

建议：

- 最好删除。
- 如果确实有历史参考价值，移动到 `docs/legacy/review_cli.py`，并在文件顶部写明“不再维护，不是运行入口”。

### 3. `review_cli.mjs` 与新架构冲突

`review_cli.mjs` 仍是 standalone readline CLI，使用旧的 session/prompt/compact 风格。当前产品已经转向 pi extension + tools + profile。

建议：

- 从 package 入口移除。
- 短期可迁移到 `docs/legacy/review_cli.mjs`。
- 如果要保留 CLI 能力，后续应重写为薄包装，只调用同一套 `ReviewEngine/Profile/State` 模块，而不是保留旧业务流程。

### 4. `lib/session.mjs` 和 `lib/terminal.mjs` 可能是遗留模块

这两个模块目前更像旧 CLI 支撑：

- `lib/session.mjs` 关联旧 `.pi/SYSTEM.md` / skill loading / compact 方案。
- `lib/terminal.mjs` 偏旧 CLI 展示，并包含 C++ 特化高亮。

建议：

- 用依赖搜索确认是否仍被新扩展引用。
- 若只被旧 CLI 引用，则与旧 CLI 一并迁移到 `docs/legacy/` 或删除。
- 不要让未来开发继续在这两个模块上扩展功能。

### 5. prompt 约束仍强依赖 agent 遵守

模式 2/3 的工具已经实现，但流程仍主要是：

```text
扩展生成 prompt -> agent 读 prompt -> agent 调工具 -> agent 出题
```

这比之前好很多，但还不是完整代码状态机。风险是 agent 可能跳过 `review_exam_points`、`review_chapter` 或 `review_turn_action`。

建议：

- demo 阶段可以接受，但文档要如实说明。
- 下一阶段应把模式 1/2/3 的“前置材料展示”至少半固化到扩展命令流程中：用户选择模式后，代码先展示材料，再把材料选择结果发给 agent。
- 长期目标是 `ReviewTurnController`：用代码维护 `material_shown -> question_generated -> answered -> archived -> next_action` 状态。

### 6. `review_materials.mjs` 的章节匹配偏脆弱

当前章节匹配主要基于文件名正则和章节号。它能跑 demo，但对不同科目的章节命名、中文编号、嵌套目录、小节 ID 会不稳定。

建议：

- 优先从 `knowledge_index.json` 的 `chapters.{chapterId}` 读取章节 metadata。
- `chapters/` 和 `exam_points/` 文件最好通过 `source_map.json` 或 profile index 建立显式映射。
- 文件名匹配只作为 fallback。

### 7. 卡片解析是可用初版，但还缺 schema 和缺失处理

`cards.mjs` 已支持 frontmatter、标题、section、id/name/alias/fuzzy 匹配。但还有几个后续风险：

- frontmatter 解析是简易 parser，不支持复杂 YAML。
- 缺失卡片时只返回建议路径，不会写入质量报告。
- 卡片 section 名仍依赖中文标题，跨语言/跨科目时需要标准 key 或别名表。
- “出题提示隐藏”依赖 section 名匹配，若生成器使用不同标题可能漏出。

建议：

- demo 发布前加一份 `card_schema.md` 或 JSON schema。
- 标准 section 同时支持中文显示名和稳定 key，例如 `definition`、`key_points`、`misconceptions`、`question_hints`。
- `review-profile-quality` 应检查缺失卡片、重复卡片、无法匹配卡片。

### 8. 当前仓库包含 Windows 保留名 `nul`

`workspace/nul` 是未跟踪文件，但会导致：

```text
error: invalid path 'nul'
fatal: adding files failed
```

建议：

- 立即删除 `workspace/nul`。
- `.gitignore` 增加 `/nul`、`nul` 或更严格的 Windows 保留名防护说明。

### 9. 中文编码需要一次集中审计

Node 读取 JSON 能正确显示中文，说明部分文件内容是正常 UTF-8；但 PowerShell `Get-Content` 输出中大量文案呈现乱码，包括扩展 TUI 文案、README、plan_v2、测试断言片段。

建议：

- 用 VS Code 或 Node 脚本确认文件本体是否 UTF-8 正常。
- 所有 Markdown、JSON、TS、MJS 统一保存为 UTF-8。
- 测试里不要保留乱码字面量；如果文件本体确实已经乱码，应修复为中文。
- README 和 skill 文案是用户第一触点，必须优先确认。

## 开源 demo 前必须清理的仓库内容

### 必须从 git 跟踪移除

当前 `git ls-files` 显示以下内容已被跟踪，不适合开源主仓库：

- `workspace/node_modules/`
- `workspace/__pycache__/`
- `workspace/archive/`
- `workspace/state/progress.json`
- `workspace/state/knowledge_chains.json`
- `workspace/state/wrong_book.json`
- `workspace/review_cli.py`
- `workspace/review_cli.mjs`
- `workspace/lib/session.mjs`
- `workspace/lib/terminal.mjs`
- `workspace/review_profiles/c-_/`

处理建议：

- `node_modules/`、`__pycache__/`：从仓库移除并加入 `.gitignore`。
- `archive/`：作为用户运行产物，不应提交；如需示例，放 `docs/examples/archive-sample/`。
- `state/*.json`：用户学习状态，不应提交真实数据；可提交 `.gitkeep` 或 `*.example.json`。
- `review_profiles/c-_/`：看起来是一次生成/测试资料包，且命名异常，不适合作为 demo 资料。
- 旧 CLI 与 legacy lib：删除或移动到 `docs/legacy/`。

### 可以保留但要重新定位

- `review_profiles/cpp-oop/`：可保留为 `legacy-bridge` 示例，但不应作为默认 profile，也不应让 README 首次体验依赖它。
- `docs/开发文档/SYSTEM.reference.md`：可作为历史参考，但应标注“legacy，不参与运行时”。
- `docs/开发文档/开源就绪审计.md`：可保留为旧审计记录，但需要标注审计日期和哪些结论已被后续实现覆盖。

## 过时开发文档修订建议

### `DESIGN.md`

当前设计文档仍偏旧架构，应重写或归档。需要移除/替换：

- C++ 单科目特化主叙述。
- standalone `review_cli.mjs` 作为核心入口。
- root `.pi/SYSTEM.md` 作为运行时主机制。
- 旧 AgentSession/compact 主流程。
- 旧 reference 目录作为默认资料模型。

建议新 `DESIGN.md` 结构：

- 产品目标：pi-agent 本地 review 扩展。
- 主入口：`workspace/.pi/extensions/review/index.ts`。
- 核心模块：profile、materials、cards、question、state、archive。
- 三种模式：card practice / direct practice / chapter study。
- profile 生命周期：draft / active / archived。
- agent 与代码职责边界。
- demo profile 与 legacy bridge 的关系。

### `review.md`

当前 `review.md` 是上一阶段实现复核，内容已经落后。应更新：

- 增加 plan_v2 的实现状态。
- 增加 revision draft 闭环。
- 增加 `review_exam_points`、`review_chapter`、`review_turn_action`。
- 增加 demo profile 状态。
- 删除“skill 空壳”等已经不准确的描述。
- 明确当前剩余风险是仓库清理、旧入口、流程状态机和文档同步。

### `plan.md` / `plan_v2.md`

`plan.md` 是前一阶段计划，`plan_v2.md` 是当前阶段计划。建议：

- 移到 `docs/开发文档/plans/`。
- 文件名前加日期和状态，例如 `2026-06-06-plan-v2-implemented.md`。
- 在顶部增加 `Status: implemented / partially implemented / superseded`。

### `SYSTEM.reference.md`

建议移动到 `docs/legacy/SYSTEM.reference.md`，顶部加：

```text
本文件是旧 C++ review 原型的系统提示参考，不再作为运行时入口。
当前运行时通过 workspace/.pi/skills/review-core/SKILL.md 注入。
```

### `开源就绪审计.md`

保留为历史审计可以，但应增加“已更新审计见当前实现复核与 Demo 发布演进计划”。避免后续 AI 或协作者把旧结论当作当前事实。

## 从当前实现到可 demo 发布的演进计划

### 阶段 0：仓库止血

目标：保证仓库可以被正常 `git add`、不会提交个人运行产物、不会误导用户入口。

任务：

- 删除 `workspace/nul`。
- 新增/更新 `.gitignore`，至少忽略：
  - `workspace/node_modules/`
  - `workspace/__pycache__/`
  - `workspace/archive/`
  - `workspace/state/*.json`
  - `workspace/nul`
  - `.cache/`
- 从 git tracking 移除 `node_modules`、`archive`、`__pycache__`、真实 state 文件。
- 保留 `workspace/state/.gitkeep` 或 `workspace/state/*.example.json`。
- 删除或迁移 `review_cli.py`、`review_cli.mjs`、`lib/session.mjs`、`lib/terminal.mjs`。
- 删除或迁移异常 profile：`review_profiles/c-_/`。

验收：

- `git add -A -- .` 不再因 `nul` 失败。
- `git status --short` 不出现 `node_modules`、个人 archive、真实学习 state。

### 阶段 1：入口与 package 产品化

目标：让用户和协作者明确项目唯一主入口是 pi extension。

任务：

- 修改 `package.json`：
  - 改中性 package name。
  - 改中性 description。
  - 移除 `main: review_cli.mjs`。
  - 移除旧 `start`，或改为只提示 `pi` 启动方式。
  - `check` 不再围绕旧 CLI。
- 更新 `package-lock.json` 的 package metadata。
- `setup-review.mjs` 增加更完整的 doctor 输出：
  - 检查 `.pi/extensions/review/index.ts`。
  - 检查关键 skills。
  - 检查 demo profile。
  - 检查 `archive/`、`state/` 是否可写。
  - 检查是否从 `workspace/` 启动。

验收：

- 新用户看到 `package.json` 不会以为这是 C++ CLI 项目。
- `npm run setup-review` 输出清晰下一步：`pi` -> `/review` -> demo profile。

### 阶段 2：文档重写

目标：让 README 和开发文档与当前代码一致。

任务：

- 重写 `workspace/README.md`：
  - 项目定位：pi-agent 本地 review 扩展。
  - 快速开始：`npm install`、`npm run setup-review`、`pi`、`/review`。
  - 首次体验：选择 `学习方法 Demo`。
  - 三个命令说明：`/review`、`/review-init`、`/review-fix`。
  - 说明不会修改 pi-agent 全局目录。
- 重写或归档 `DESIGN.md`。
- 更新 `review.md` 为当前状态，或让本文件成为新的主审计文档。
- 新增 `PROFILE_SCHEMA.md`：
  - `profile.json`
  - `knowledge_index.json`
  - `cards/*.md`
  - `chapters/`
  - `exam_points/`
  - `source_map.json`
  - `quality_report.md`

验收：

- README 与实际命令一致。
- 开发文档不再把 `review_cli.mjs` / `.pi/SYSTEM.md` 描述为主入口。

### 阶段 3：demo profile 打磨

目标：让 clone 后第一次体验稳定、短、能体现三种模式价值。

任务：

- 确认 `demo-review` 资料完整：
  - 2 章。
  - 5-8 个知识点。
  - 5-8 张标准卡片。
  - 2 份 `exam_points`。
  - 章节材料能跑模式 3。
- 确认 demo 文案中性，不再强化 C++ 特化。
- 重置所有运行状态：
  - `state/card_progress.json` 为空或不提交。
  - `progress/wrong_book/knowledge_chains` 不提交真实数据。
- 手动跑通：
  - 模式 1：卡片 -> 出题 -> 答题 -> 归档 -> 题后菜单。
  - 模式 2：考点总结 -> 出题 -> 答题 -> 题后菜单。
  - 模式 3：章节材料 -> 出题 -> 答题 -> 题后菜单。

验收：

- 一个新用户不需要 C++ reference 资料也能完成 demo。
- demo profile 的所有文件均自包含。

### 阶段 4：流程可靠性增强

目标：降低 agent 不按 prompt 调工具导致的体验波动。

任务：

- 引入轻量 `ReviewTurnController` 或等价模块，至少记录：
  - selected profile
  - mode
  - chapter / knowledge point
  - material shown
  - current question metadata
  - last archive
  - next action
- 模式 2 在命令阶段先展示 `review_exam_points` 或至少将其作为强制工具调用前置步骤。
- 模式 3 在命令阶段先展示 `review_chapter` 或至少强制选章节/小节后再出题。
- `review_archive` 后如果 agent 没调用 `review_turn_action`，通过 skill 和状态提示进行二次约束。

验收：

- 三种模式的“先看材料再出题”不再完全依赖 agent 自觉。
- 题后菜单成为统一的继续入口。

### 阶段 5：profile init/fix 质量闭环

目标：让跨科目资料包可持续迭代。

任务：

- `review-init` 生成 draft 后，明确提示“尚未启用，需要 `/review-fix` 复核”。
- `review-fix` 对 active 创建 revision draft 后，UI 明确显示原 active 未被修改。
- `review_profile_enable` 启用 revision 后，提供旧版本 archived 信息。
- `quality_report.md` 必须包含：
  - 缺失卡片。
  - 无法映射章节。
  - 重复知识点。
  - 低置信度切分。
  - 建议用户确认项。
- 增加回滚计划：先文档化，后续再实现工具。

验收：

- 用户能形成“使用 -> 发现问题 -> `/review-fix` 修订 -> 确认启用 -> 继续使用”的闭环。

### 阶段 6：demo 发布候选

目标：发布一个可被他人 clone 后复现的 demo 版本。

发布前检查清单：

- `git status` 干净或只包含预期源码改动。
- `npm install` 后 `npm run setup-review` 通过。
- `npm run check` 通过。
- `npm test` 通过。
- 从 `workspace/` 运行 `pi` 后能看到：
  - `/review`
  - `/review-init`
  - `/review-fix`
- `/review` 能选择 `学习方法 Demo`。
- 三种模式至少各跑通一题。
- 仓库不包含：
  - `node_modules`
  - 个人 archive
  - 个人 state
  - `__pycache__`
  - `nul`
  - 旧 CLI 主入口

## 后续产品化优先级

优先级 1：

- 清理仓库和入口。
- 修订 README / DESIGN。
- demo profile 手动验收。

优先级 2：

- 强化模式 2/3 的代码状态机。
- 增加 profile/card schema 文档和校验。
- 增加 `doctor` 检查。

优先级 3：

- profile 回滚。
- 更完整的 Markdown 渲染、分页、搜索。
- 插件市场适配。

## 当前不建议做的事

- 不建议继续扩展 `review_cli.mjs` 或 `review_cli.py`。
- 不建议把 C++ legacy profile 作为开源默认体验。
- 不建议在 demo 发布前接入 pi-agent 全局目录或修改全局安装。
- 不建议现在实现复杂自定义 compaction；当前自动 compaction + archive/state 已足够 demo。

