# 02 - Training Assets Skill 与数学题型模板计划

## Summary

将 `/review-init` 从“一步生成完整学习产品”拆成两阶段：

```text
/review-init
  -> 基础资料整理：subject / knowledge_index / chapters / cards / exam_points / source_map / quality_report

/review-enhance 或 review-profile-training-assets skill
  -> 教学增强：unit_summaries / misconceptions / extensions / problem_templates
```

核心目标是让资料包不只是“可读材料”，而是能支撑数学、离散数学等科目的深度训练。尤其要补齐当前出题体系偏概念抽查的问题，引入“题型模板 + 解法步骤 + rubric 判题”的中间层。

## 背景问题

当前 `/review-init` 更像资料归档器：

```text
源资料 -> 章节材料 -> 知识点索引 -> 卡片 -> 考点总结
```

这对 C++ 概念复习基本够用，但对数学类科目不足：

- 数学题难度主要来自题型结构，不只是单个知识点。
- 当前题型偏 `judgment/choice/short_answer`，容易变成概念抽查。
- 缺少证明、计算、推导、步骤诊断、变式训练。
- 缺少每章的单元总结、易混淆点和重要引申知识。
- `/review-fix` 能改文件，但没有统一生成“训练资产”的专门方法论。

离散数学 `lisan` profile 的实际演进说明：当资料包包含“每章证明思想总结、概念辨析、引申知识”时，复习质量明显更接近数学训练需求。因此应把这种能力标准化为一个独立 skill。

## Key Decisions

- `review-init` 只负责基础结构化，不强制生成全部训练资产。
- 新增独立 skill：`review-profile-training-assets`。
- 训练资产可以在 init 后生成，也可以在 `/review-fix` 中按章节重建。
- 新增目录：

```text
unit_summaries/
misconceptions/
extensions/
problem_templates/
```

- 数学/离散数学优先支持 `problem_templates/`，但结构应可扩展到编程、文科、论文阅读等其它 domain。

## 新资料包结构

在基础 profile 内新增：

```text
active/
├── subject.md
├── knowledge_index.json
├── chapters/
├── cards/
├── exam_points/
├── unit_summaries/
│   ├── 第1章-整除性与互质.md
│   └── 第2章-同余.md
├── misconceptions/
│   ├── 第1章-易混淆点.md
│   └── 第2章-易混淆点.md
├── extensions/
│   ├── 第1章-重要引申知识.md
│   └── 第2章-重要引申知识.md
├── problem_templates/
│   ├── bezout-solution.md
│   ├── linear-congruence.md
│   └── graph-isomorphism.md
├── source_map.json
└── quality_report.md
```

目录职责：

- `unit_summaries/`：每章知识结构、核心链路、复习顺序。
- `misconceptions/`：易错易混、反例、判断题陷阱。
- `extensions/`：重要引申知识、常见变形、考试拐弯方式。
- `problem_templates/`：题型特征、适用条件、解法步骤、常见变式、评分 rubric。

## Skill 设计

新增：

```text
workspace/skills/review-profile-training-assets/SKILL.md
```

该 skill 的职责：

1. 读取 `subject.md`、`knowledge_index.json`、`chapters/`、`exam_points/`。
2. 按章节生成 `unit_summaries/`。
3. 按章节生成 `misconceptions/`。
4. 按章节生成 `extensions/`。
5. 为适合训练的知识点生成 `problem_templates/`。
6. 更新 `quality_report.md`，加入训练资产覆盖率。

不负责：

- 原始资料切分。
- 大规模重写章节材料。
- 启用 profile。
- 删除旧文件。

## 与命令流程的关系

### 方案 A：不新增命令，先由 init/fix prompt 调用 skill

`/review-init` 完成基础资料包后提示：

```text
基础资料包已生成。若用户希望继续生成单元总结、易混淆点、引申知识和题型模板，请继续使用 /skill:review-profile-training-assets。
```

`/review-fix` 可根据用户反馈调用该 skill：

```text
用户：重新生成第 2 章题型模板
-> /skill:review-profile-training-assets
-> 只改 problem_templates/ 与对应 quality_report
```

### 方案 B：后续新增 `/review-enhance`

独立命令：

```text
/review-enhance
```

流程：

```text
选择 profile
选择增强范围：全部 / 某章 / 某知识点
选择资产类型：总结 / 易混淆点 / 引申知识 / 题型模板 / 全部
发送增强 prompt
agent 调用 review_profile_write 写入 draft
```

本轮建议先实现方案 A，命令层保持简单。

## Problem Template 标准

示例：

```md
---
id: linear-congruence-basic
name: 一次同余式求解
chapter: "2"
knowledge_points:
  - linear-congruence
difficulty: M-U
question_types:
  - calculation
  - derivation
tags:
  - 数论
  - 同余
status: active
---

# 一次同余式求解

## 题型特征
给定 ax ≡ b (mod m)，要求判断是否有解并求全部剩余类解。

## 适用条件
- d = gcd(a, m)
- d | b 时有解
- d ∤ b 时无解

## 解题步骤
1. 计算 d = gcd(a, m)
2. 判断 d 是否整除 b
3. 两边同除 d
4. 求 a/d 在模 m/d 下的逆元
5. 得到一个特解
6. 写出 d 个模 m 的解

## 常见变形
- 系数较大，需要先化简
- b 为负数
- 需要用贝祖等式求逆元

## 易错点
- 忘记有 d 个不同解
- 把模 m/d 的解直接当成模 m 的完整解
- d 不整除 b 时仍强行求逆元

## 评分 Rubric
- 正确计算 gcd：2分
- 正确判断可解性：2分
- 正确求逆元或特解：3分
- 正确写出全部解：3分

## 生成约束
- 初级题使用小整数
- 中级题要求手算 gcd
- 高级题加入负数或多步化简
```

## 数学题型扩展方向

后续 `Question.type` 可扩展：

- `calculation`：计算题
- `derivation`：推导题
- `proof`：证明题
- `application`：应用题
- `step_diagnosis`：步骤诊断题
- `template_variant`：题型模板变式题

判题也应从单纯 `is_correct` 演进为 rubric：

```json
{
  "is_correct": false,
  "score": 6,
  "max_score": 10,
  "step_results": [
    {
      "step": "公式选择",
      "status": "correct"
    },
    {
      "step": "化简",
      "status": "wrong",
      "comment": "符号处理错误"
    }
  ],
  "main_error_type": "calculation_error",
  "next_hint": "重新检查第二行到第三行的符号变化"
}
```

本计划先产出模板文件，不强制一次性改完整判题系统。

## Quality Report 新增检查项

`quality_report.md` 应新增训练资产覆盖率：

- 每章是否有 `unit_summaries`。
- 每章是否有 `misconceptions`。
- 每章是否有 `extensions`。
- 每章是否有 `exam_points`。
- 每个高频知识点是否至少对应一个 `problem_template`。
- 每个 `problem_template` 是否包含：
  - 题型特征
  - 适用条件
  - 解题步骤
  - 常见变形
  - 易错点
  - 评分 Rubric
  - 生成约束

## Code Changes

- 新增 skill：`workspace/skills/review-profile-training-assets/SKILL.md`。
- 更新 `review-init` skill：
  - 明确只做基础资料整理。
  - 完成后提示可继续使用 training-assets skill。
- 更新 `review-fix` skill：
  - 允许针对训练资产进行局部重建。
  - 禁止未经用户确认大范围覆盖基础章节材料。
- 更新 profile shape 校验：
  - training assets 可选。
  - 如果存在 `problem_templates/`，应校验 frontmatter 的 `id/name/knowledge_points/status`。
- 更新 `quality_report` 生成要求。

## Test Plan

- skill 文件存在，安装检查能发现。
- `/review-init` prompt 不强制一次性生成训练资产。
- `/review-fix` prompt 能引用 `review-profile-training-assets`。
- profile 校验允许没有 training assets 的基础 profile。
- profile 校验能读取并校验一个标准 problem template。
- demo 或 fixture profile 包含至少 2 个 problem templates。
- `npm run check`
- `npm test`
- `npm run check-package`

## Manual Acceptance

- 对离散数学 profile 执行增强后，每章有：
  - unit summary
  - misconceptions
  - extensions
- 至少为数论和图论各生成 2 个 problem templates。
- 直接练习模式能在 prompt 中引用 problem_templates 作为出题依据。
- agent 出题不再只抽查概念，而能生成计算、证明、步骤判断类题目。

## Execution Order

建议在 `01-profile-family-layout.md` 完成后执行本计划。

原因：

- training assets 是资料包内容层能力。
- profile family 是资料包生命周期和路径模型。
- 先稳定 active/draft/archive/_user，再扩展内容目录，风险更低。

## Assumptions

- 本计划不做完整真题自动切分。
- 真题系统后续建立在 problem_templates 之上。
- 首版以数学/离散数学为主要验证对象，但 skill 描述保持通用。
- 不在 init 中强制生成所有训练资产，避免 token 消耗过高和失败面过大。
