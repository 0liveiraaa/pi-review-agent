# Demo 发布验收记录

日期：2026-06-06

范围：计划四 demo 发布验收。目标是确认当前 `workspace/` 是否已经具备 clone 后运行 demo 的基础条件，并记录自动验收、手动 TUI 验收、已修复问题和剩余发布建议。

状态：计划四已完成。

## 自动验收结果

已执行：

```powershell
npm run setup-review
npm run check
npm test
```

结果：

- `npm run setup-review` 通过。
- `npm run check` 通过。
- `npm test` 通过，21 个测试全部 pass。

`setup-review` 当前识别到：

- 扩展入口：`workspace/.pi/extensions/review/index.ts`
- 配置文件：`workspace/.pi/review.config.json`，默认 `courseName: "Pi Review Demo"`、`profile: "demo-review"`
- skills：12 个
- lib modules：8 个
- review profiles：`cpp-oop [active]`、`demo-review [active]`
- package：`pi-review v3.0.0`

## Demo Profile 状态

`review_profiles/demo-review/` 是自包含 active demo seed profile。发布态必须保持 `demo-review` 本体 active；手动验证 `/review-fix` 产生的 `demo-review__draft_*` 不应留在 `review_profiles/` 中作为 active profile。

内容概况：

- 2 章：`1`、`2`
- 6 个知识点
- 6 张卡片
- 2 个章节材料文件
- 2 份考点总结
- `subject.md`
- `knowledge_index.json`
- `source_map.json`
- `quality_report.md`

代码校验结果：

- `assertValidProfileShape("demo-review")` 通过。
- `loadProfile("demo-review").status === "active"`。
- `listActiveProfiles()` 包含 `demo-review`。
- 不存在 active 的 `demo-review__draft_*` 残留。
- `loadProfileCard()` 能读取 `active_recall` 卡片。
- `listChapterMaterials(profile, "1")` 能读到章节材料。
- `loadExamPoints(profile, "1")` 能读到考点总结。

结论：demo seed profile 已满足“模式 1/2/3 最小可跑通”的资料条件，并已恢复为稳定发布态。

## 运行状态与仓库清洁度

`git ls-files workspace/state workspace/archive workspace/node_modules workspace/__pycache__ workspace/nul` 当前只返回：

```text
workspace/state/.gitkeep
```

这是合理的占位文件。

当前本地仍存在运行生成文件：

- `state/card_progress.json`
- `state/progress.json`
- `state/wrong_book.json`
- `state/knowledge_chains.json`

这些文件已被 `.gitignore` 忽略，不会进入开源提交。demo 发布前仍建议本地重置一次，避免手动演示时带入旧会话状态。

## 手动 TUI 验收结果

以下项目已在 pi TUI 中完成手动验证：

| 项目 | 结果 | 说明 |
| --- | --- | --- |
| 从 `workspace/` 启动 `pi` | 通过 | pi-agent 能发现本地 `.pi/extensions/review/index.ts`。 |
| `/review` 命令 | 通过 | 能进入 profile、模式、范围选择流程。 |
| 选择 `学习方法 Demo` | 通过 | demo profile 可用于首次体验。 |
| 模式 1：概念卡片 + 练习 | 通过 | 能看到代码渲染卡片；Enter 后进入出题和 `review_answer`；归档后进入题后动作。 |
| 模式 2：直接练习 | 通过 | 能展示 `review_exam_points`，再进入题目生成、答题、归档和题后动作。 |
| 模式 3：章节笔记学习 | 通过 | 能展示章节/小节材料；选择出题后进入题目生成和答题。 |
| `review_turn_action` | 通过 | 三种模式归档后均可进入统一题后动作菜单。 |
| `/review-fix` draft 修订 | 通过 | 能对 draft profile 发送修订 prompt。 |
| `/review-fix` active 修订 | 通过 | 选择 active profile 时会创建 revision draft，不直接修改 active。 |
| `review_profile_write` | 通过 | 仍只允许写入 draft profile。 |
| `review_profile_enable` | 通过 | 用户确认后可启用 draft；revision draft 启用时保留旧 active 为历史版本。 |

结论：计划四要求的 demo 手动验收项已完成。

## 本阶段已修复问题

### 1. 长内容 TUI 顶栏/进度条错位

现象：进入卡片展示或答题阶段时，长卡片、长章节材料或长题干会让 TUI 进度条/状态区域顶到最上方，终端重绘错位。

原因：`ctx.ui.custom()` 渲染函数只接收宽度参数，原实现一次性返回 80-120 行内容，超过可视区域后会挤压 pi-agent 全局状态区域。

修复：

- 卡片、章节材料、考点总结面板限制为固定可视行数。
- 超出内容支持 `J/K` 或方向键上下滚动。
- 多选题/简答题输入框的长题干限制显示行数，避免撑爆布局。

验证：

- `npm run check` 通过。
- `npm test` 通过。
- `.pi/extensions/review/index.ts` 可通过 pi-agent 使用的 jiti 路径加载。

### 2. `/review-fix` active profile 创建 revision draft 失败

现象：在 `/review-fix` 中选择 active profile 后输入修订反馈，TUI 可能直接掉回 shell，且没有生成 revision draft。

原因：旧实现使用 `fs.cpSync(source.root, targetRoot, { recursive: true })` 复制 profile 目录。在当前 Windows + 中文路径环境下该调用会失败，且错误没有被 `/review-fix` 命令捕获。

修复：

- `createRevisionDraft()` 改为显式递归复制目录和文件，不再依赖 `cpSync`。
- `/review-fix` 创建 revision draft 时增加 `try/catch`，失败时通过 TUI notify 明确提示错误。
- 单元测试增加断言：revision draft 必须复制原 profile 子目录文件。

验证：

- 临时 profile 的 active -> revision draft 创建成功。
- 真实 `review_profiles/` 未残留测试 draft。
- `npm run check` 通过。
- `npm test` 通过。

## Demo 发布前建议修正

### 1. 默认 profile 仍偏 C++

状态：已完成。

`setup-review` 输出当前配置为：

```text
course: Pi Review Demo, profile: demo-review
```

当前 `.pi/review.config.json` 默认使用：

```json
{
  "courseName": "Pi Review Demo",
  "profile": "demo-review"
}
```

`cpp-oop` 应保留为 legacy bridge，而不是默认印象。

### 2. 本地状态建议提供 reset 脚本

状态：已完成。

真实 state 已经不再被 git 跟踪，但开发者或演示者本地可能保留旧状态。建议新增：

```text
npm run reset-demo-profile
```

行为：

- 恢复 `review_profiles/demo-review/profile.json` 为发布态 active。
- 移出 `review_profiles/demo-review__draft_*` 手动验收残留。
- 不删除 `state/.gitkeep`。

说明：state reset 后续可作为单独脚本补充；当前计划四重点修复 demo seed profile 发布态。

### 3. setup-review 可增强 demo 指引

状态：已完成。

当前 setup 输出包含：

```text
First demo path:
  /review -> 学习方法 Demo -> any mode
```

这样新用户第一次运行不会被 `cpp-oop` 和 `demo-review` 两个 active profile 分散注意。

## 当前结论

计划四已完成。当前 demo 发布的代码、资料和 TUI 验收均已具备基础条件；自动验收和手动验收均通过。

计划四已完成。当前 demo 发布的代码、资料、配置和 TUI 验收均已具备基础条件；自动验收和手动验收均通过。

最终 release audit 时仍建议再跑一遍：

```powershell
npm run reset-demo-profile
npm run setup-review
npm run check
npm test
```
