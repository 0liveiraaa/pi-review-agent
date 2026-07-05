# 通用知识 Profile 框架设想

更新日期：2026-06-07

## 核心想法

Pi Review Agent 当前表面上是一个复习插件，但它真正有潜力的部分不是“做题”，而是把任意知识材料转化成可学习、可追踪、可复盘的 profile。

如果继续抽象，可以把它从课程复习工具升级为一个通用知识积累框架：

```text
任意知识材料
-> 结构化 profile
-> TUI 稳定交互
-> agent 理解、解释、提问、总结
-> archive/state 长期积累
```

这个框架可以覆盖课程复习、真题训练、论文阅读、读书笔记、技术文档学习、语言学习、项目知识库等场景。

## 产品定位

建议定位为：

> 基于 pi-agent 的个人知识学习运行时。它把资料包结构、交互流程、学习状态和 agent 能力组织起来，让用户能持续阅读、理解、记忆、练习和复盘。

这意味着项目不再只是“复习助手”，而是：

- 知识资料结构化工具。
- 学习交互运行时。
- 个人学习记录系统。
- agent 驱动的理解检查和复盘系统。

## 统一抽象

### Profile

Profile 是一组可学习资料的最小产品单元。

它可以是一门课、一篇论文、一本书、一组真题、一个技术框架、一个项目知识库。

```json
{
  "subjectId": "paper-transformer",
  "name": "Attention Is All You Need",
  "profile_type": "paper",
  "status": "active",
  "createdAt": "2026-06-07T00:00:00.000Z"
}
```

### Material

Material 是原始或规范化资料。

```text
chapters/     顺序阅读材料
cards/        可记忆知识单元
questions/    理解检查问题
summaries/    资料总结
sources/      原始来源映射
```

### Interaction

Interaction 是学习过程中的稳定交互。

```text
阅读 -> 提问 -> 回答 -> 反馈 -> 复盘 -> 下一步
```

不同 profile type 可以有不同交互模式，但底层仍复用同一套状态、归档和 UI 工具。

### State

State 是长期学习状态。

```text
看过什么
做过什么
错过什么
掌握程度如何
上次复习是什么时候
下一步应该看什么
```

### Archive

Archive 是学习证据。

它记录每次阅读、答题、讨论、总结，而不是只保存最终结论。

## Profile 类型

### `course`

课程复习。

适合：

- 大学课程。
- 章节笔记。
- 知识点复习。
- 考前刷题。

核心资料：

```text
subject.md
knowledge_index.json
cards/
chapters/
exam_points/
past_papers/
```

核心模式：

- 卡片复习。
- 直接练习。
- 章节学习。
- 真题训练。

### `paper`

论文阅读。

适合：

- 单篇论文精读。
- 多篇论文组会准备。
- 研究方向文献积累。

核心资料：

```text
paper/
  metadata.json
  abstract.md
  problem.md
  method.md
  evidence.md
  limitations.md
  related_work.md
  claims.json
  reading_questions.json
cards/
chapters/
archive/
```

核心模式：

- 速读摘要。
- 精读章节。
- 方法拆解。
- 证据链检查。
- 批判性问答。
- 生成阅读报告。

论文阅读不应被强行套成考试复习。它的目标不是“答对题”，而是理解论文主张、证据、方法和局限。

### `book`

读书笔记。

适合：

- 技术书。
- 理论书。
- 教材。
- 长篇非虚构。

核心资料：

```text
book/
  metadata.json
  outline.md
  chapter_notes/
  key_arguments.json
cards/
chapters/
reading_logs/
```

核心模式：

- 顺序阅读。
- 章节总结。
- 观点提炼。
- 概念卡片。
- 读后复述。

### `exam`

真题和考试训练。

适合：

- 历年真题。
- 模拟卷。
- 高频题型训练。

核心资料：

```text
past_papers/
templates/
style_report.md
knowledge_index.json
```

核心模式：

- 随机真题。
- 按章节抽题。
- 按题型抽题。
- 仿真出题。
- 考前冲刺。

### `docs`

技术文档学习。

适合：

- API 文档。
- 框架文档。
- 项目内部文档。

核心资料：

```text
docs/
  concepts/
  api/
  workflows/
  examples/
cards/
tasks/
```

核心模式：

- 概念学习。
- API 查询。
- 示例理解。
- 实操任务。
- 故障排查问答。

### `language`

语言学习。

适合：

- 单词。
- 语法。
- 阅读材料。
- 翻译训练。

核心资料：

```text
vocabulary/
grammar/
reading/
examples/
cards/
```

核心模式：

- 单词卡片。
- 语法辨析。
- 翻译练习。
- 阅读理解。
- 错句复盘。

## 论文阅读 Profile 示例

```text
review_profiles/attention-is-all-you-need/
  profile.json
  subject.md
  knowledge_index.json
  paper/
    metadata.json
    abstract.md
    problem.md
    method.md
    evidence.md
    limitations.md
    related_work.md
    claims.json
    reading_questions.json
  chapters/
    01-introduction.md
    02-background.md
    03-model-architecture.md
    04-experiments.md
  cards/
    self_attention.md
    multi_head_attention.md
    positional_encoding.md
  source_map.json
  quality_report.md
```

### `paper/metadata.json`

```json
{
  "title": "Attention Is All You Need",
  "authors": ["Ashish Vaswani", "Noam Shazeer"],
  "year": 2017,
  "venue": "NeurIPS",
  "url": "",
  "reading_goal": "理解 Transformer 的核心结构、贡献和实验依据"
}
```

### `paper/claims.json`

```json
{
  "claims": [
    {
      "id": "claim_001",
      "text": "完全基于 attention 的模型可以替代循环和卷积结构完成序列转导任务。",
      "evidence": ["evidence_001", "evidence_002"],
      "related_methods": ["self_attention", "multi_head_attention"],
      "confidence": 0.9
    }
  ]
}
```

### `paper/reading_questions.json`

```json
{
  "questions": [
    {
      "id": "rq_001",
      "type": "concept_check",
      "question": "Self-attention 为什么可以并行计算？",
      "knowledge_points": ["self_attention"],
      "difficulty": "S-U"
    },
    {
      "id": "rq_002",
      "type": "critical_review",
      "question": "论文实验是否足以证明 attention 可以全面替代 RNN？",
      "knowledge_points": ["experimental_evidence", "model_comparison"],
      "difficulty": "M-A"
    }
  ]
}
```

## 交互设计

### 通用入口

短期仍保留 `/review`，通过 profile type 区分流程。

```text
/review
-> 选择 profile
-> 根据 profile_type 展示模式
```

长期可以新增更语义化入口：

```text
/learn
/read-paper
/review
```

但不建议过早拆命令。先把 profile type 跑通，再决定是否新增命令。

### 论文阅读流程

```text
选择 paper profile
-> 选择阅读模式
   1. 速读摘要
   2. 精读章节
   3. 方法拆解
   4. 证据链检查
   5. 批判性问答
   6. 生成阅读报告
```

### 阅读后动作

论文阅读不适合只用“下一题”。应提供：

- 下一节。
- 解释这一段。
- 生成卡片。
- 提问检查理解。
- 追问相关工作。
- 质疑论文结论。
- 总结当前章节。
- 结束并生成阅读报告。

## 技术实现方向

### 1. Profile Type

在 `profile.json` 增加：

```json
{
  "profile_type": "course"
}
```

默认值为 `course`，保持兼容。

### 2. Material Loader

新增通用 material loader：

```text
lib/materials/
  course.mjs
  paper.mjs
  book.mjs
  exam.mjs
```

每个 loader 负责读取对应资料层，但对外返回统一结构：

```json
{
  "profileType": "paper",
  "sections": [],
  "cards": [],
  "questions": [],
  "metadata": {}
}
```

### 3. Mode Registry

不要在扩展入口里硬编码所有模式。可以引入 mode registry：

```js
const modesByProfileType = {
  course: ["card_practice", "practice", "chapter_study", "past_paper"],
  paper: ["skim", "deep_read", "method_breakdown", "evidence_check", "critical_qa"],
  book: ["chapter_read", "argument_map", "recall"],
};
```

### 4. Skill Router

`review-core` 可以升级为通用学习核心 skill，并根据 profile type 路由：

```text
profile_type = course -> course-review skills
profile_type = paper  -> paper-reading skills
profile_type = exam   -> exam-training skills
```

短期可以仍使用现有 skill，只新增 `paper-reading` skill。

### 5. Archive Schema

当前 archive 主要围绕 question turn。论文阅读需要记录 reading turn。

建议 archive 支持：

```json
{
  "turn_type": "question" | "reading" | "discussion" | "summary",
  "profile_type": "paper",
  "material_ref": "paper/method.md#multi-head-attention",
  "user_action": "explain_section",
  "agent_output": "...",
  "created_at": "..."
}
```

## 与当前实现的关系

当前实现可以直接复用：

- profile 生命周期：draft、active、archived。
- 受控写文件工具。
- skills 注入机制。
- 章节展示工具。
- 卡片展示工具。
- 归档和总结。
- state 数据目录。
- TUI 选择器和输入工具。

需要新增或改造：

- `profile_type`。
- 不同类型的模式列表。
- paper 专用资料层。
- reading turn archive。
- paper reading skills。
- 针对论文的阅读后动作菜单。

## 最小可行版本

MVP 不要试图支持所有知识类型。建议只做 `paper`，因为它和课程复习差异足够明显，能验证框架是否真的泛用。

MVP 范围：

1. 支持 `profile_type: "paper"`。
2. 手工创建一个 paper demo profile。
3. `/review` 识别 paper profile 并显示论文阅读模式。
4. 实现 `review_paper_section` 工具，代码展示论文小节。
5. agent 根据 paper skill 进行解释、提问和总结。
6. session 结束生成阅读报告。

暂不做：

- PDF 自动解析。
- 多论文综述。
- citation graph。
- 自动 claim extraction。
- Web UI。

## Paper Demo 选择建议

demo 论文应满足：

- 内容短。
- 结构清楚。
- 没有版权风险。
- 适合展示“问题、方法、证据、局限”。

可以选择自写一篇模拟论文，避免版权问题。比如：

```text
《A Small Study on Spaced Review for Terminal-Based Learning》
```

这样既能展示论文阅读流程，又不会引入真实论文版权和长度问题。

## 分阶段计划

### 阶段 1：抽象 profile type

目标：不破坏 course review，增加类型分流。

任务：

- `profile.json` 支持 `profile_type`。
- active profile 列表展示类型。
- `/review` 根据类型显示不同模式。
- 测试默认缺省为 `course`。

### 阶段 2：paper demo profile

目标：用手工资料证明论文阅读模式可用。

任务：

- 新增一个 paper demo profile。
- 编写 `paper/metadata.json`、`problem.md`、`method.md`、`evidence.md`、`limitations.md`。
- 建立少量 cards 和 reading questions。

### 阶段 3：paper section 工具

目标：代码负责稳定展示论文材料。

任务：

- 新增 `review_paper_section`。
- 支持选择章节和阅读动作。
- 输出阅读位置和后续动作。

### 阶段 4：paper skill

目标：让 agent 知道论文阅读不是考试复习。

任务：

- 新增 `paper-reading` skill。
- 定义速读、精读、方法拆解、证据检查、批判性问答规范。
- 定义阅读报告模板。

### 阶段 5：reading archive

目标：记录长期阅读积累。

任务：

- archive 支持 `turn_type: "reading"`。
- 总结报告区分阅读、问答和讨论。
- state 记录章节阅读进度。

## 风险

### 范围膨胀

通用知识框架很容易膨胀成“什么都想做”。必须坚持 profile type 分阶段落地，先 course，再 paper，再考虑 book/docs。

### 交互混乱

如果所有类型都塞进 `/review`，用户可能不知道自己在做复习还是阅读。需要在选择 profile 后明确切换模式名称和提示。

### Agent 行为不稳定

论文阅读需要更强的批判性和结构化输出。必须通过 paper skill 和结构化 archive 限制 agent，不要让它泛泛总结。

### 与原产品定位冲突

如果过早宣传“通用知识框架”，可能稀释当前复习产品。建议对外仍叫 Review Agent，对内逐步建设通用 profile runtime。

## 推荐结论

这个想法值得做，但不要马上全面泛化。最佳路径是：

```text
先保持课程复习稳定
-> 增加 profile_type
-> 做 paper demo
-> 验证阅读模式
-> 再把通用知识 profile 作为长期方向
```

如果 paper profile 能跑通，说明这个项目的核心价值就从“复习插件”升级成了“个人知识学习运行时”。
