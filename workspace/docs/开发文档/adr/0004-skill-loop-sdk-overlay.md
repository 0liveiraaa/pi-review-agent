# ADR 0004: 用 Skill Loop SDK 组织 ReAct + Workflow

> 状态：accepted
> 日期：2026-07-05

## 背景

Pi Review Agent 当前已经具备 profile、skill、工具、TUI、归档和学习画像，但工作流仍主要散落在命令实现、工具返回文本和 skill 约束中。这样可以运行，却容易出现三类问题：

- agent 需要凭 prompt 自觉决定何时调用关键工具。
- profile、章节、卡片、归档、doctor 等模块各自形成局部兼容层。
- 后续扩展到真题、论文阅读、技术文档学习等场景时，容易复制一套新的流程逻辑。

项目领域语言已经把这种工作流称为技能回路：由节点组成的有向图，每个节点内部允许 ReAct，节点之间由可检验条件流转。

## 决策

采用 ReAct + workflow 的混合主控模型，并为 Pi Review Agent 建立内部 Skill Loop SDK。

第一阶段以 Pi Review Agent 内部工程 SDK 形态落地，优先组织 `/review`、`/review-init`、`/review-fix`。长期目标是沉淀为 pi-agent extension 开发中可复用的工作流编排范式。

Skill Loop SDK 的核心抽象包括：

- workflow：一个可运行的技能回路。
- node：由 goal、context、tools、mechanism、entry/exit conditions 定义的工作阶段。
- transition：节点之间的转移规则。
- run log：节点执行、工具调用、用户动作、agent 输出和失败原因的结构化记录。
- improvement suggestion：会话后由用户和 agent 共同审查的回路优化建议。

工作流主控边界如下：

- 代码负责必须稳定的部分：状态转移、安全边界、工具权限、资料解析、写入与归档。
- agent 负责语义弹性的部分：内容生成、解释、追问、策略判断和优化建议。
- agent 可以建议调整技能回路，但长期配置必须经用户确认。

## 配置叠加

技能回路配置采用三层叠加：

1. 默认回路：由代码包提供，作为稳定基线。
2. Profile 回路：由 Profile 资料包声明，作为可分享的场景推荐流程。
3. 用户覆盖：由用户私有运行数据保存，表达个人偏好和历史优化结果。

运行时按默认回路、Profile 回路、用户覆盖的顺序合并。Profile 回路属于可分享资料包；用户覆盖不随资料包分享。

## 后果

正向后果：

- `/review` 等命令可以逐步从大段命令逻辑收敛为节点图。
- doctor、profile contract、material resolver 和 review loop 可以围绕同一组节点与配置诊断。
- 运行记录能够成为学习画像和回路优化的输入。
- 后续真题系统、论文阅读、技术文档学习可以复用同一套编排语言。

代价：

- 需要新增一层抽象，短期会增加少量设计和测试成本。
- 需要避免过早泛化。第一版只服务当前 review 场景，不承诺支持任意外部工作流。
- 需要明确用户确认边界，防止 agent 在会话中隐式改写长期回路。

## 实施原则

- 先内部落地，再考虑通用化。
- 先表达现有行为，再改变用户体验。
- 先记录运行事实，再生成优化建议。
- 保留现有 pi-agent command/tool 能力，不替代 pi-agent SDK。
- Profile 可分享内容和用户私有运行数据继续分离。

