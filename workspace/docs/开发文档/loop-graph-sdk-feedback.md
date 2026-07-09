# pi-loop-graph-sdk 使用反馈

本文档来自 pi-review-agent 接入 Loop Graph SDK 过程中遇到的实际问题，供 SDK 团队参考迭代。

## 背景

pi-review-agent 定义了一个 `review_single_turn` graph，包含 7 个节点：

```
prepare_review_turn → show_material → generate_question → answer_question
                                                              ↓
                                                         grade_answer
                                                              ↓
                                                         archive_turn
                                                              ↓
                                                     choose_turn_action → END
```

节点分为两类：

- **工具调用节点**（如 `show_material`、`answer_question`）：执行时调用 TUI 工具与用户交互。
- **skill 模式节点**（如 `generate_question`、`grade_answer`）：通过 `skill: "review-question"` 加载 skill 文件，让 agent 阅读 skill 规则后自主完成推理。

Graph 注册方式：

```javascript
const loop = sdk.createLoopGraphExtension(pi, {
  defaultTools: [
    "review_card",
    "review_exam_points",
    "review_chapter",
    "review_answer",
    "review_archive",
    "review_turn_action",
  ],
});
```

---

## 问题 1：`defaultTools` 不流入 skill 模式节点

### 现象

`generate_question` 节点声明为 `skill: "review-question"`，没有写 `tools` 数组。运行时 trace 显示该节点只拿到两个工具：

```json
{"type":"tools_changed","nodeId":"generate_question","tools":["read","__graph_complete__"]}
```

`defaultTools` 中配置的 6 个工具没有进入该节点。

### 影响

如果给一个 skill 模式节点增加需求——比如让它能调用一个新工具来列目录——开发者必须在节点上显式声明 `tools: ["new_tool"]`，无法通过全局 `defaultTools` 统一管理。工具集的增删现在分散在多个节点声明中，维护成本高。

### 期望行为

以下两种方案任选其一即可：

**方案 A**：`defaultTools` 对所有节点生效，包括 skill 模式节点。节点级 `tools` 仅做增量追加。

**方案 B**：如果 skill 模式有意隔离工具集，起码在文档中明确说明这一点，并提供 `extraTools` 或类似机制让开发者在不放弃 skill 模式的前提下注入额外工具。

---

## 问题 2：工具重复注册导致模型 400 错误，且去重行为不一致

### 现象

在 pi-review-agent 的 extension 中通过 `pi.registerTool()` 注册了一个名为 `review_list_dir` 的工具。随后在 graph 的 `generate_question` 节点上声明 `tools: ["review_list_dir"]`。

启动 graph 后，DeepSeek API 返回：

```
Error: 400: {"message":"Tool names must be unique.","type":"invalid_request_error"}
```

说明 SDK 在构造发给模型的 tools 列表时，将 extension 层注册的 `review_list_dir` 和节点 `tools` 数组中的 `review_list_dir` **重复添加**了。

### 对比：为什么 `review_card` 没有重复？

同一 graph 中，`showMaterial` 节点声明了：

```javascript
tools: ["review_card", "review_exam_points", "review_chapter"]
```

`review_card` 同样在 `pi.registerTool()` 和节点 `tools` 中同时出现，但从未触发 400 错误。说明 SDK 在 **工具调用节点** 的路径上做了去重，但在 **skill 模式节点** 的路径上没有。

### 影响

开发者需要小心避免 extension 层和节点层注册同名工具——但哪些场景需要避免、哪些不需要，行为不一致，只能靠试错发现。

### 期望行为

**短期**：在所有节点类型的 tools 组装路径上，统一做 name-based dedup（同一个 tool name 只出现一次，last-wins 或 first-wins）。

**长期**：在 graph 注册阶段就检测全局 + 节点级 tools 的冲突，提前报明确错误（例如 `Tool "review_list_dir" is registered at both extension and node level for node "generate_question"`），而不是等到 API 调用时才让模型返回 400。

---

## 问题 3：skill 模式节点缺少正交的工具注入点

### 现象

`createAgentExecute` 的 fallback 实现只处理 `prompt` 字段：

```javascript
function defaultAgentExecute(options = {}) {
  return async (_instance, input) => ({
    nodeId: "",
    status: "ok",
    result: {
      prompt: typeof options.prompt === "function" ? options.prompt(input) : options.prompt || "",
      input: input.data,
    },
  });
}
```

没有 `tools`、`extraTools` 等字段。skill 模式下的工具集完全由节点级 `tools` 数组控制。如果开发者想在 skill prompt 之外追加一个辅助工具（比如列目录），只能去改节点定义，无法在 `createAgentExecute` 的 options 中正交追加。

### 影响

skill 节点、prompt、工具三者的声明分散在 graph 定义的不同位置，缺少一个集中的 options 入口。对简单场景影响不大，但随着节点复杂度增加，每次加工具都要理解 SDK 的 tools 组装路径，不符合直觉。

### 期望行为

`createAgentExecute` 的 options 支持 `tools` / `extraTools` 字段，语义清晰：

```javascript
execute: createAgentExecute({
  skill: "review-question",
  tools: ["review_list_dir"],        // 追加到此节点的工具集
  prompt(input) { ... },
})
```

无论节点类型（工具调用 / skill / code），从这个入口追加的工具都应该正确合入最终发给模型的 tools 列表。

---

## 问题 4：模型 400 错误导致 graph 直接终止，无恢复机制

### 现象

上述 duplicate tool name 导致 DeepSeek 返回 400 时，graph 立即结束：

```
图结束（无边匹配 generate_question）
```

agent 在错误的同一轮对话中继续尝试读文件（因为错误没有清空上下文），但 graph 框架已经判定节点失败、无后续边可走，用户需要重启整个流程。

### 影响

工具名称冲突这种 deterministic 错误，应该由 SDK 在注册阶段就检测并拒绝，而不是等到运行时从模型那里拿到 400 才发现。即便发生了，也应该有基本的重试或降级路径，而不是直接终止 graph。

### 期望行为

1. **注册期校验**：graph 注册时，SDK 检查所有节点的 tools 列表，检测 name 冲突并立即报错，阻止 graph 启动。
2. **运行期兜底**：如果某些错误只能在运行时发现（比如模型不支持某工具 schema），SDK 应提供节点级 `onError` / `retry` 配置，让 graph 作者决定是跳过该节点、重试、还是终止。

---

## 问题 5：模型 400 错误后 graph 终止但 agent 不知情，形成"僵尸"状态

### 现象

问题 2 的 duplicate tool name 触发 400 错误后，graph 框架立即：

```
[loop_graph_complete]
图结束（无边匹配 generate_question）
```

但 agent 的对话上下文**没有收到任何失败信号**。agent 继续正常推理、读取资料文件（路径正确）、生成题目、甚至多次尝试调用 `__graph_complete__` 提交结果——但 graph 框架已经退出，`__graph_complete__` 调用被静默丢弃。用户看到 agent 正常工作却"卡住"，需要手动干预。

### 影响

- agent 在"僵尸"状态下消耗 token，生成的结果全部丢失
- 用户体验极差：agent 看起来在工作但 graph 永远不前进
- 问题的根因（duplicate tool name）对用户/开发者完全不可见——只能看到"图结束"，不知道原因

### 期望行为

1. 如果节点因 API 错误失败，框架应该**向 agent 注入错误信息**（如 `节点执行失败: Tool names must be unique`），让 agent 知道出错了，而不是假装一切正常。
2. 或者，框架应**阻止后续 agent 推理**——既然节点已终止，不要再把 prompt 发给 agent 产生垃圾对话。
3. 更根本的：这些问题应该在注册期就检测出来（见问题 4）。

---

## 总结

| # | 问题 | 严重程度 | 建议优先级 |
|---|------|----------|-----------|
| 1 | `defaultTools` 不流入 skill 节点 | 中 | P1 |
| 2 | 工具去重行为不一致（skill 节点路径无去重） | 高 | P0 |
| 3 | `createAgentExecute` 缺少 tools/extraTools 注入点 | 低 | P2 |
| 4 | 注册期无校验，运行时 400 直接终止 graph | 高 | P0 |
| 5 | 400 错误后 graph 终止但 agent 不知情，形成"僵尸"对话 | 高 | P0 |
