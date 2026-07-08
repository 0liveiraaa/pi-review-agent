# Pi Review Agent 当前架构

> 状态：current
> 维护口径：描述当前实现事实，不承载未来路线

## 1. 运行形态

本复习助手以 **pi-agent extension** 形态运行，所有交互在 pi-agent TUI 中完成。用户通过 pi-agent 的斜杠命令触发复习流程，agent 在对话中调用代码工具完成渲染、数据操作和状态管理。

```
用户 → pi-agent TUI
         └── review extension (workspace/extensions/review/index.ts)
               ├── Commands: /review, /review-init, /review-fix
               └── Tools: review_card / review_exam_points / review_chapter
                          review_answer / review_archive / review_turn_action
                          review_summary / review_profile_write / review_profile_enable
                    → lib/*.mjs（业务逻辑，8 个 ESM 模块）
                    → skills/*/SKILL.md（注入 agent prompt）
```

### 入口注册

- Root `package.json` 中 `pi.extensions` 指向 `./workspace/extensions/review/index.ts`。
- `workspace/package.json` 中 `pi.extensions` 指向 `./extensions/review`。
- 运行时扩展入口仅为 `workspace/extensions/review/index.ts`，无重复入口。

### 交互边界

| 特点                       | 说明                                                                     |
| -------------------------- | ------------------------------------------------------------------------ |
| **Extension 驱动**   | 命令和工具通过`pi.registerCommand()` / `pi.registerTool()` 注册      |
| **代码渲染 UI**      | 卡片、章节、考点、题后菜单由代码工具渲染，agent 只负责生成题目内容和判题 |
| **Profile 生命周期** | `draft → active → archived`，修订 active 时自动创建 draft 副本       |
| **Skill 注入**       | `review-core` 主规则强制注入每个命令 prompt，子 skill 按阶段参考       |
| **Typebox 校验**     | 所有工具参数用`Type.Object()` 做运行时 JSON schema 校验                |

## 2. Package 布局

```
workspace/
├── extensions/review/index.ts         ← 扩展主入口
├── skills/                            ← 13 个 SKILL.md
│   ├── review-core/                   ← 主规则：运行时契约、工具路由、模式流程
│   ├── review-question/               ← 出题规则（难度体系、题型模板）
│   ├── review-grade/                  ← 判题格式
│   ├── review-discuss/                ← 讨论规则
│   ├── review-summary/                ← 复盘 JSON 格式 + 会话总结模板
│   ├── review-init/                   ← 资料包初始化
│   ├── review-fix/                    ← 资料包修订
│   └── review-profile-*/              ← profile 构建子 skill（结构/索引/卡片/考点/质量）
├── profiles/                          ← 内置 bundled profiles（只读资源）
│   ├── cpp-oop/                       ← C++ 面向对象程序设计
│   └── demo-review/                   ← 学习方法 Demo
├── lib/                               ← 核心库（8 个 ESM 模块）
│   ├── state.mjs                      ← 状态文件 I/O、归档、会话管理
│   ├── cards.mjs                      ← 概念卡片加载（fuzzy 文件名匹配）
│   ├── chapters.mjs                   ← 章节笔记扫描（YAML frontmatter 解析）
│   ├── review_config.mjs              ← 配置加载与路径解析
│   ├── review_engine.mjs              ← 复习目标解析、prompt 构建
│   ├── review_question.mjs            ← 题目规范化、多选题答案解析
│   ├── review_profiles.mjs            ← Profile CRUD（创建/加载/写入/启用/修订）
│   └── review_materials.mjs           ← 章节材料和考点总结加载
├── review.config.json                 ← 默认课程配置
├── scripts/setup-review.mjs           ← 环境完整性 doctor
├── test/review_core.test.mjs          ← 单元测试
├── AGENTS.md                          ← 仓库工作约定和当前事实（仓库根目录）
└── docs/开发文档/                     ← 开发文档
    ├── CONTEXT.md                     ← 领域语言
    ├── DESIGN.md                      ← 本文件
    ├── README.md                      ← 开发文档入口
    ├── 产品/标准化演进路线.md          ← 产品和工程演进路线
    ├── 产品/技术债优先级.md            ← 技术债分级和验收标准
    ├── adr/                           ← 架构决策记录
    ├── 参考资料/                      ← 外部或原始参考材料
    └── 归档/                          ← 历史方案和旧实现说明
```

## 3. Extension 命令和工具

### 3.1 注册的命令

| 命令             | 触发     | 流程                                                                                     |
| ---------------- | -------- | ---------------------------------------------------------------------------------------- |
| `/review`      | 用户输入 | TUI 选择 profile → 展示学习画像 → 模式 → 范围 → 题型 → 难度 → 发送 prompt 给 agent |
| `/review-init` | 用户输入 | 输入源目录和科目名 → 创建 draft profile → 发送 init prompt 给 agent                    |
| `/review-fix`  | 用户输入 | 选择 profile → 输入反馈 → active 则先创建 revision draft → 发送 fix prompt 给 agent   |

所有命令 prompt 都通过 `injectReviewCore()` 强制注入 `review-core` 主规则。

### 3.2 注册的工具

| 工具                      | agent 角色中调用         | 职责                                                          |
| ------------------------- | ------------------------ | ------------------------------------------------------------- |
| `review_card`           | 模式 1 出题前            | 在 TUI 中渲染知识点卡片，返回`practice/next_card/skip/exit` |
| `review_exam_points`    | 模式 2 出题前            | 渲染章节考点总结，返回`practice/skip/exit`                  |
| `review_chapter`        | 模式 3 出题前            | 渲染章节或小节材料，返回`practice/next_section/skip/exit`   |
| `review_answer`         | 出题后                   | 滚动渲染完整结构化题目并收集用户答案，答题中可请求提示/追问   |
| `review_archive`        | 判题+讨论后              | 归档题目答案，更新进度/错题本/知识链                          |
| `review_turn_action`    | 归档后**必须**调用 | 显示题后续航菜单（下一题/看卡片/看章节/总结/退出）            |
| `review_summary`        | 用户要求总结时           | 保存 session 总结报告，并更新该科目的学习画像                 |
| `review_profile_write`  | 初始化/修订时            | 安全写入 draft profile 文件（拒绝非 draft）                   |
| `review_profile_enable` | 用户确认启用时           | 将 draft 切换为 active（替换 active 时归档原版）              |

### 3.3 工具契约

```text
review_answer 需要的题目 JSON:
  { type, question_text, options?, correct_answer, knowledge_points, difficulty, explanation_l1, source_basis }

review_archive 需要的归档数据:
  { user_answer, is_correct, grading?, discussion_summary?, knowledge_chain_l3?, ... }

review_card 返回:
  { action: "practice" | "next_card" | "skip" | "exit", knowledge_point_id, card_found }

review_turn_action 返回:
  { action: "next_question" | "show_card" | "show_chapter" | "summary" | "exit" }
```

## 4. Profile 资料包与运行数据

### 4.1 数据目录模型

- **Bundled profiles**（只读资源）：`workspace/profiles/`，随包发布。
- **用户运行数据**（可写）：默认 `%USERPROFILE%\.pi\agent\review-data`，可通过环境变量 `PI_REVIEW_DATA` 覆盖。
- 用户运行数据目录下包含 `review_profiles/`（用户 profile）、`archive/`（答题归档）、`state/`（运行时状态）。

### 4.2 生命周期

```
draft ──(review_profile_enable)──→ active ──(被修订版替代)──→ archived
                                      │
                                      └──(/review-fix)──→ {id}__draft_{date} (draft)
```

- `draft` — 可编辑，`/review` 不显示
- `active` — 不可编辑，`/review` 可选
- `archived` — 历史版本，保留在磁盘用于回滚

### 4.3 Profile 目录结构

```
review_profiles/{subject_id}/
├── profile.json              ← subjectId, name, status, paths, revision metadata
├── subject.md                ← 科目描述和考试目标
├── knowledge_index.json      ← { chapters: { "1": { title, knowledge_points: [...] } } }
├── cards/                    ← 知识点卡片 *.md
├── chapters/                 ← 章节笔记 *.md
├── exam_points/              ← 考点总结 *.md
├── source_map.json           ← 源文件映射
├── quality_report.md         ← 质量评估报告
└── _user/                    ← 私有运行数据（不进入分享）
    ├── summaries/
    │   └── {session_id}_总结.md
    └── learning_profile.json
```

### 4.4 Profile family 目录结构（数据根目录内）

每个 subject 独立维护 family slot：

```
review_profiles/{subjectId}/
├── active/    ← 当前可用 profile
├── draft/     ← 编辑中的 profile
├── archived/  ← 被替代的历史版本
└── _user/     ← 用户私有运行数据
```

代码通过 `getProfileFamilyRoot(subjectId)` → `getActiveProfileRoot(subjectId)` → `join(familyRoot, "active")` 解析。运行时默认使用 `active/` 中的 profile，`draft/` 和 `archived/` 通过 `/review-fix` 管理。

### 4.5 运行数据与资料包分离

- 运行数据（答题归档、总结、学习画像、进度）属于用户私有状态，不进入可分享的资料包。
- `_user/` 目录下的内容不参与 profile export/import。
- `review_archive` 写入用户数据目录的 `archive/sessions/`。
- `review_summary` 写入 profile 的 `_user/summaries/` 并更新 `_user/learning_profile.json`。

### 4.6 Revision 命名

```text
{rootSubjectId}__draft_{YYYYMMDD}
{rootSubjectId}__draft_{YYYYMMDD}_v2
```

`profile.json` 记录 `revisionOf`、`revisionRoot`、`revisionCreatedAt`、`revisionReason`。

## 5. Review 单题流程

### 5.1 三种模式

| 模式          | ID                | 前置代码工具                       | 流程                                                                                           |
| ------------- | ----------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------- |
| 概念卡片+练习 | `card_practice` | `review_card`                    | 卡片展示 → 生成题目 →`review_answer` → 判题 → 讨论 → `review_archive` → 题后续航菜单 |
| 直接练习      | `practice`      | `review_exam_points`（有章节时） | 考点展示 → 出题 → 判题 → 归档 → 题后续航菜单                                               |
| 章节笔记学习  | `chapter_study` | `review_chapter`                 | 材料展示 → 出题 → 判题 → 归档 → 题后续航菜单                                               |

### 5.2 单题生命周期（agent 视角）

```
1. Read profile 资料（subject.md, knowledge_index.json）
2. 按模式调用前置代码工具（review_card / review_exam_points / review_chapter）
3. 返回 practice → 参考 review-question 生成一题结构化 JSON
4. 调用 review_answer → TUI 滚动渲染完整题目 → 用户作答或请求提示/追问
5. 参考 review-grade 判题 + L1 解析
6. 可选讨论（参考 review-discuss）
7. 调用 review_archive 归档
8. 调用 review_turn_action 获取下一步续航动作
9. 循环或退出
```

### 5.3 题目体系

| 题型     | 代码         | 适用难度      |
| -------- | ------------ | ------------- |
| 正误判断 | judgment     | S-R, S-U      |
| 单项选择 | choice       | S-U, M-U, M-A |
| 多项选择 | multi_choice | M-U, M-A      |
| 简述题   | short_answer | M-A, C-A      |

### 5.4 难度矩阵

| 级别 | 广度 × 认知         | 含义                |
| ---- | -------------------- | ------------------- |
| S-R  | Single × Recall     | 单一知识点记忆/识别 |
| S-U  | Single × Understand | 单一知识点理解/区分 |
| M-U  | Multi × Understand  | 2-3 关联概念比较    |
| M-A  | Multi × Analyze     | 多概念综合推理      |
| C-A  | Chain × Analyze     | 知识链条综合        |

## 6. Skill 体系

13 个 skill 按角色分类：

| 角色               | Skill                                                      | 用途                                             |
| ------------------ | ---------------------------------------------------------- | ------------------------------------------------ |
| **主规则**   | review-core                                                | 运行时契约、工具路由、模式流程、profile 生命周期 |
| **核心**     | review-question / grade / discuss / summary                | 出题/判题/讨论/复盘                              |
| **初始化**   | review-init / fix                                          | 资料包创建和修订                                 |
| **子 skill** | review-profile-{structure,index,cards,exam-points,quality} | profile 构建各环节                               |
| **子 skill** | review-profile-training-assets                             | 训练资产（problem templates）构建                |

review-core 通过 `injectReviewCore()` 强制注入每个命令 prompt。子 skill 由 agent 按阶段通过 `/skill:xxx` 参考引用。

## 7. 已知技术债

### P0：影响使用的 bug

- TUI 滚动、长题干、进度条上弹（pi-agent 兼容性问题）
- profile 路径/data root 口径需统一
- 章节匹配错误（已有 decimal section overmatch 测试）
- duplicate extension/tool registration 诊断

### P1：影响资料包长期维护

- active 元数据残留旧 revision 链
- archived/draft 目录膨胀但没有 doctor/prune
- quality_report 和 source_map 过时
- skill 运行目录和 template 源不同步
- 卡片匹配依赖中文文件名

### P2：影响推广体验

- 安装脚本错误信息不够可执行
- 用户不知道数据保存在哪里

详细分级和验收口径见 `产品/技术债优先级.md`。

## 8. 旧架构归档

以下组件已移入 `归档/`，不再使用：

- `review_cli.mjs` — 旧 Node.js CLI
- `review_cli.py` — 旧 Python CLI
- `lib/session.mjs` — 旧 SDK 会话封装
- `lib/terminal.mjs` — 旧终端渲染
- 旧版 `SYSTEM.md` 工作流已被 extension + skill 注入取代

---

## 9. 尚未落地的设计方向

当前实现还不是 Skill Loop SDK。`/review`、`/review-init`、`/review-fix` 仍由 command 组装 prompt，再由 agent 按 skill 约束调用工具。

后续设计方向见 `adr/0004-skill-loop-sdk-overlay.md`：以回路图为核心，把命令流程表达为可运行图；节点承载工作，边承载状态迁移，运行时负责驱动节点和边，并通过运行记录和异常诊断图提供诊断能力。

未来产品方向由 `产品/标准化演进路线.md` 跟踪；本文档以当前架构事实为主。
