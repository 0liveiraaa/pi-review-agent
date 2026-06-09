# 06 - TUI 稳定性 Debug 与最小修复计划

## Summary

本计划用于排查并修复 `/review` TUI 中疑似渲染风暴、滚动回顶、进度条持续跳动、终端崩溃的问题。当前判断不需要大重构，先做 TUI 生命周期稳定性补丁：`done()` 后停止处理、按需 `requestRender()`、render 纯函数化、按 width 缓存长内容。

目标是降低崩溃风险，并保留现有 pi-agent 工具和 agent 驱动流程。

## Debug Goals

- 确认是否存在 `done()` 后仍调用 `requestRender()` 的竞态。
- 确认 `Editor.handleInput()` 与外层 `tui.requestRender()` 是否造成重复重绘。
- 确认滚动面板是否在 `render()` 中写状态导致回顶。
- 确认长文本/长代码块是否在每次滚动时全量重算造成 TUI 卡顿。
- 复验修复后卡片、章节、考点、题目四类面板均稳定。

## Suspected Risk Points

### 1. `done()` 后继续执行

涉及位置：

- `showReviewCard().handleInput`
- `showMaterialPanel().handleInput`
- `selectItem().handleInput`
- `textInput().handleInput`
- `showScrollableTextPanel().handleInput`

问题模式：

```ts
done(value);
// 没有 return，后续仍可能 requestRender()
tui.requestRender();
```

修复要求：

- 每个 `ctx.ui.custom()` 内部加 `let closed = false`。
- 封装 `finish(value)`：
  - 如果 `closed` 为 true，直接 return。
  - 设置 `closed = true`。
  - 调用 `done(value)`。
- `handleInput` 开头：

```ts
if (closed) return;
```

- 所有完成分支必须：

```ts
return finish(value);
```

### 2. 无条件 `requestRender()`

风险位置：

- `selectItem` 每次输入后都 `requestRender()`。
- `textInput` 调用 `editor.handleInput(data)` 后又手动 `requestRender()`。
- 滚动面板即使按键没有改变状态，也 `requestRender()`。

修复要求：

- `textInput` 去掉外层无条件 `tui.requestRender()`，因为 `Editor` 内部已触发 render。
- 滚动面板只在 scroll 变化时 request render。
- Enter/Esc/N/S 这类完成动作不再 request render。
- SelectList 可先保留，但建议仅在方向键或选择变化时 request render。

### 3. `render()` 中写状态

当前模式：

```ts
const windowed = renderWindowedLines(lines, scroll);
scroll = windowed.safeScroll;
totalLines = windowed.total;
```

风险：

- render 不是纯函数。
- terminal resize、父级 invalidate、工具状态刷新可能导致 scroll 被反复 clamp。
- 可能表现为滚动回顶或进度条持续刷新。

修复要求：

- `render()` 不修改 `scroll`。
- 在输入处理时更新 scroll。
- 在 width 或内容变化时，通过独立函数 clamp scroll。
- 缓存记录 `width` 和 `totalLines`。

### 4. 长内容重复重算

风险：

- `wrapPlainBlock()` 在每次 cache 失效后全量处理长章节/长代码。
- 用户按住 J/K 时，可能反复 split/flatMap/truncate。

修复要求：

- 为滚动面板维护 `wrappedCache`：

```ts
let wrappedCache: { width: number; lines: string[] } | undefined;
```

- width 不变时，滚动只 slice 可见窗口。
- width 变化时才重新 wrap。

## Implementation Plan

### Step 1：新增小型 helper，不做大重构

在 `workspace/extensions/review/index.ts` 内新增局部 helper：

- `createFinish(done)` 或内联 `finish`
- `requestRenderIfChanged(tui, before, after)`
- `getWrappedLines(width, buildRawLines)`

不要改命令注册、工具注册、profile、prompt、state 逻辑。

### Step 2：修复完成动作竞态

对所有 `ctx.ui.custom()` 返回对象做以下修改：

- 加 `closed`。
- 用 `finish()` 替代直接 `done()`。
- `finish()` 后立即 return。
- `handleInput` 开头 guard。

优先级：

1. `showReviewCard`
2. `showMaterialPanel`
3. `showScrollableTextPanel`
4. `selectItem`
5. `textInput`

### Step 3：降低重绘频率

- 滚动面板：
  - 只有 scroll 实际变化才 `cache = undefined` 并 `requestRender()`。
  - 非滚动、非完成、无效按键不触发 render。
- `textInput`：
  - 删除外层 `tui.requestRender()`。
  - `cache = undefined` 可以保留，但只在外层标题变化时需要；当前标题不变，可考虑删除外层 cache 或让 `Editor` 自己驱动。
- `selectItem`：
  - 如果不容易判断 SelectList 是否变化，先只加 closed guard；后续再细化。

### Step 4：修复滚动 cache

滚动面板 cache 推荐结构：

```ts
let renderCache: { width: number; scroll: number; lines: string[] } | undefined;
let wrappedCache: { width: number; lines: string[] } | undefined;
```

要求：

- width 变化时清空 wrappedCache。
- scroll 变化时只清空 renderCache。
- render 中不写 scroll。
- scroll clamp 在 handleInput 后执行。

### Step 5：保留现有用户体验

修复后按键语义保持不变：

- 卡片：Enter 出题，N 下一张，S 跳过，Esc 退出，J/K 或方向键滚动。
- 章节/考点：Enter 出题，N 下一节，S 跳过，Esc 退出，J/K 或方向键滚动。
- 题目：Enter 作答，Esc 取消，J/K 或方向键滚动。
- 选择器：方向键选择，Enter 确认，Esc 取消。

## Test Plan

### Static Checks

必须通过：

```bash
npm run check
npm test
npm run check-package
```

### Manual Reproduction

#### 1. 长题干

- 构造或让 agent 生成含 50 行代码块的 `short_answer`。
- 调用 `review_answer`。
- 按住 J/K 滚动 10 秒。
- 验收：
  - 不回顶。
  - 不出现持续跳动的小进度条。
  - Enter 后正常进入输入。
  - Esc 后正常取消。

#### 2. 章节材料

- `/review` → 章节笔记学习 → 选择有较长材料的章节。
- 在 `review_chapter` 面板中滚动。
- 验收：
  - 滚动位置稳定。
  - Enter/N/S/Esc 后不会继续刷新旧面板。

#### 3. 卡片材料

- `/review` → 概念卡片 + 练习。
- 打开一张较长卡片。
- 按住 J/K，之后按 N/S/Esc。
- 验收：
  - 不回顶。
  - 完成动作后不再看到旧卡片刷新。

#### 4. 选择器与输入框

- 连续经过 profile、模式、范围、题型、难度选择。
- 在每个选择器里按上下键、Esc、Enter。
- 验收：
  - 不闪烁异常。
  - 不出现二次确认或重复提交。

## Acceptance Criteria

- 所有 `done()` 分支后没有尾随 `requestRender()`。
- 所有 custom UI 都有 `closed` guard。
- 滚动面板无效按键不触发 render。
- 滚动面板 render 不写 scroll 状态。
- 长内容按 width 缓存，不在每次滚动时全量重算。
- `npm run check`、`npm test`、`npm run check-package` 均通过。

## Out of Scope

- 不重构 review 流程为代码状态机。
- 不替换 pi-tui 的 `Editor` / `SelectList`。
- 不修改 agent prompt 逻辑。
- 不新增新的 TUI 组件库。
- 不实现复杂 Markdown 高亮或分页器。

