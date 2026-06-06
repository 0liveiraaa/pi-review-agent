# 跨科目 Review Profile 初始化与复核计划

## Summary

实现跨科目兼容的核心路径：新增 `/review-init` 创建可复核 draft 资料包，新增 `/review-fix` 根据用户反馈迭代修订，用户确认后资料包才进入 `/review` 的科目选择列表。首版只支持 Markdown/文本资料，采用通用模板，不按科目类型分支。

资料包存放在项目内 `workspace/review_profiles/{subjectId}`，便于版本管理、迁移和多科目发现。

## Key Changes

- 新增资料包结构：

  - `subject.md`：科目元描述、考试目标、资料说明、出题风格。
  - `knowledge_index.json`：章节、知识点、别名、标签、题型建议、难度基线。
  - `cards/`：知识点卡片，对应模式 1。
  - `chapters/`：规范化章节/小节材料，对应模式 3。
  - `exam_points/`：每章考点总结，对应模式 2 出题参考。
  - `source_map.json`：规范化文件到原始文件的来源映射。
  - `quality_report.md`：低置信度切分、缺失章节、重复知识点、待确认项。
  - `profile.json`：`subjectId`、名称、状态 `draft|active`、路径配置、创建时间。
- 新增 `/review-init`：

  - 用户选择或输入源资料文件夹和输出 subject id。
  - 只处理 `.md/.txt` 首版输入。
  - agent 使用 init 专用技能分析资料，调用受控写文件工具生成 draft profile。
  - 写文件工具只允许写入当前 draft 目录，禁止任意路径写入。
  - 生成后输出质量报告，不自动启用。
- 新增 `/review-fix`：

  - TUI 选择一个 draft profile。
  - 用户输入自然语言反馈，例如“第 2 章知识点太碎”“这些卡片合并”。
  - agent 读取 draft、source map 和质量报告，调用同一写文件工具修订资料包。
  - 修订后重写 `quality_report.md`。
  - 用户明确确认后，将 `profile.json.status` 改为 `active`。
- 更新 `/review`：

  - 启动时每次列出 `active` profiles 让用户选择科目。
  - 选择科目后，模式 1/2/3 都读取该 profile 的配置和资料目录。
  - 不再默认固定 C++；C++ 只是一个默认 active profile。
  - draft profile 不进入普通 `/review` 列表。
- 技能与安装：

  - init/fix 专用技能源文件放在项目文档/模板目录中，配 README。
  - 提供最低努力安装脚本，如 `npm run setup-review`，复制 extension、skills、config 到 `.pi` 并检查依赖。
  - README 面向低技术用户说明：让自己的 agent 执行安装脚本即可。

## Public Interfaces

- Commands:
  - `/review`：选择 active 科目并开始复习。
  - `/review-init`：从 Markdown/文本资料生成 draft profile。
  - `/review-fix`：选择 draft，用自然语言反馈修订。
- Tools:
  - `review_profile_write`：受控写入 profile 文件。
  - `review_profile_enable`：用户确认后启用 draft。
  - 继续保留 `review_answer`、`review_archive`、`review_summary`。
- Profile states:
  - `draft`：可修订，不进入 `/review` 普通选择。
  - `active`：可复习，可归档。
  - 可选未来状态：`archived`。

## Test Plan

- Unit tests:
  - 扫描 `workspace/review_profiles` 只返回 active profiles。
  - `review_profile_write` 拒绝越界路径，允许写入 draft 内相对路径。
  - profile schema 校验：`profile.json`、`knowledge_index.json`、`source_map.json`。
  - `/review` 根据所选 profile 正确列章节和知识点。
- Integration checks:
  - 用一组小型 Markdown 测试资料生成 draft。
  - 对 draft 执行一次 `/review-fix` 风格修订。
  - 启用后 `/review` 能选择该科目并进入三种模式。
- Existing checks:
  - `npm run check`
  - `npm test`
  - pi 扩展加载测试。

## Assumptions

- 首版只支持 `.md/.txt`，PDF/DOC 以后作为单独导入器处理。
- 首版使用通用模板，不按编程/数学/文科/语言分科目类型生成。
- 用户必须确认后才能启用 draft。
- `/review-fix` 使用“TUI 选择 draft + 自然语言反馈”。
- 安装采用轻量脚本和 README，不做完整 pi 插件市场分发。



我觉得你的方案整体成立，而且比“只在 `.pi/review.config.json` 里换路径”更正确。

核心判断：

`/review-init` 应该负责把一个任意笔记文件夹转成标准“科目资料包”。这个资料包至少包含：

- `subject.md`：科目元描述，告诉 agent 这是什么课、考试目标、答题风格、题型偏好、资料目录说明
- `knowledge_index.json`：结构化知识点索引，供模式 2 直接做题和补全使用
- `cards/`：知识点卡片，供模式 1 使用
- `chapters/`：按章节/小节整理后的学习材料，供模式 3 使用
- `exam_points/`：每章考点总结，供出题和复习总结参考
- `skills/` 或 `prompt-profile.md`：科目特化规则，比如 C++ 要出代码题，数学要重推导，英语要重语境和错因

但我会挑战一个关键点：**`/review-init` 不能只“生成”，还必须支持“审核和修订”。**

原因是跨科目最难的不是文件结构，而是知识点切分质量。比如：

- C++ 可以按“概念/机制/误区/代码例子”切知识点
- 数学可能要按“定义/定理/题型/常见变形”切
- 文科可能要按“概念/人物/论点/材料分析模板”切
- 语言类可能要按“词汇/语法/语用场景/错题模式”切

如果 `/review-init` 一次生成后直接投入 `/review`，很容易出现知识点过粗、卡片重复、章节归属不准、考点总结像摘要而不是可考点的问题。

我的推荐方向是：

`/review-init <source-folder> <subject-output-folder>` 生成标准资料包，但标记为 draft。然后 `/review` 只读取通过校验的 profile。初始化流程应该包含：

1. 扫描源文件夹
2. 识别科目类型和资料结构
3. 生成 `subject.md`
4. 生成章节树
5. 生成知识点索引
6. 生成卡片和考点总结
7. 生成质量报告：缺失章节、重复知识点、低置信度切分、无法解析文件
8. 用户确认后才设为可用 profile

第一个关键问题是这个：

你希望 `/review-init` 生成的资料包在产品语义上是什么？下面这个选择会决定整个实现。

- **可直接使用的最终资料包**：初始化后马上能 `/review` 使用，速度快，但质量风险高。
- **可审核草稿资料包（推荐）**：初始化后生成 draft + 质量报告，用户或 agent 复核后再启用，适合跨科目长期使用。
- **只生成索引，不改写资料**：保留原始笔记，只生成 `knowledge_index.json` 和映射，侵入性最低，但模式 1/3 的体验会弱一些。 回答:我建议第二点,让用户复核迭代确认

这就把产品边界定清楚了：**/review-init** 不是“自动整理完就交付”，而是“生成可审核草稿资料包，再通过迭代确认启用”。这个选择很好，因为它允许跨科目，但不假装 LLM 第一次切分就一定正确。

**Asked** **1 question**

已锁定为“对话修订”：**/review-init** 生成 draft 后，用户通过自然语言说“第 3 章切太碎了”“这些知识点合并”“这个卡片不准”，agent 修改资料包并重新给质量报告。这样首版不需要做沉重的逐项审核 TUI。

**Asked** **1 question**

那就把资料包作为项目资产处理：**workspace/review_profiles/{subjectId}**。这样 **/review** 可以扫描 profiles 列表让用户选科目，也方便把成熟资料包提交/备份/迁移。

**Asked** **1 question**

这意味着资料包会有两层：规范化学习材料和 **source_map.json**。**/review** 主要读规范化材料；如果用户质疑某个卡片或知识点，agent 可以回溯到原始文件位置。

**Asked** **1 question**

首版限定 Markdown/文本会让质量可控。当前项目资料主干也是 Markdown，所以可以先把跨科目资料包跑通；PDF/DOC 以后作为“导入到 Markdown”的前置能力，而不是塞进 **/review-init** 首版。

**Asked** **1 question**

我会记下这个取舍，但要明确风险：全通用模板能最快跨科目，但生成质量会更依赖复核迭代，尤其数学/语言类可能需要后续手动补“题型策略”。实现上可以先做通用模板，同时在 schema 里预留 **subject_type** 和 **question_policy**，但首版不按类型分支。

**Asked** **1 question**

每次都选择科目会牺牲一点效率，但很适合多科目场景，能避免“以为在复习 A，实际读了 B 的资料包”。**/review** 可以先显示 profile 列表，再进入现有的模式 1/2/3 选择。

**Asked** **1 question**

你的补充很关键：确认后启用，同时允许 agent 用专门的修复能力迭代 draft。我建议把“子技能”理解为一组 init/fix 专用 prompt 模板或 skill 文件：**structure**、**index**、**cards**、**exam-points**、**qa-report**，**/review-init** 和 **/review-fix** 都调用这些能力，只是输入不同。

**Asked** **1 question**

那就用两个命令：**/review-init** 创建 draft，**/review-fix** 修订 draft。内部可以共享同一套“资料包构建技能”，外部用户只需要理解两个动作。

**Asked** **1 question**

这个建议比直接塞 **.pi/skills** 更适合“给低技术用户分发”：仓库里保留 **review-kit/** 或 **docs/review-init/** 作为源，README 指导或脚本把 skills/extensions/config 安装进 **.pi**。这样项目代码、技能模板和使用说明都能一起版本化。

**Asked** **1 question**

我同意：最低努力的一键脚本足够，不需要马上做完整插件分发。更现实的路线是 README 写“让你的 agent 运行 **npm run setup-review**”，脚本只做复制/检查/提示，复杂生成逻辑仍由 **/review-init** 的 agent 流程承担。

**Asked** **1 question**

**Worked for 12m 20s**

很好。这样 **/review-init** 不直接让 agent 随意写路径，而是让 agent 调用一个受控工具：传入 subjectId、文件类型、相对路径、内容，工具只允许写到该 draft profile 目录下。这个对低技术用户尤其重要。
