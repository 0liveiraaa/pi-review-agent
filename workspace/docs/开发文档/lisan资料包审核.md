# lisan 资料包审核记录

审核时间：2026-06-10

审核对象：

```text
C:\Users\25173\.pi\agent\review-data\review_profiles\lisan
```

## 结论

`lisan` 资料包目前是可用的 active profile，核心 schema 校验通过，章节材料和考点总结覆盖较完整。它已经适合作为离散数学复习的基础资料包。

但它还不是一个干净、稳定、适合长期迭代的资料包。主要问题集中在四类：

- active 元数据仍保留旧 draft/revision 痕迹。
- active 目录里混入了未被 profile 引用的 `_nt` 旁路目录。
- 卡片覆盖不足，尤其图论部分很多 knowledge point 无法匹配到卡片。
- `quality_report.md` 和 `source_map.json` 仍写着旧 draft subject id，统计也已过时。

本次审核期间已修复一个代码侧问题：章节匹配不会再把 `2.1/3.1/4.1` 错误归入第 1 章。

## 当前结构

```text
lisan/
├── active/
├── archived/
└── _user/
```

当前 active 统计：

| 项目 | 数量 |
| --- | ---: |
| 章节 | 6 |
| 知识点 | 32 |
| 章节材料 | 33 |
| 卡片 | 16 |
| 考点总结 | 7 |
| 未引用旁路目录 | 3 |
| archived 版本 | 3 |
| _user 文件 | 0 |

章节分布：

| 章 | 标题 | 小节 | 知识点 |
| --- | --- | ---: | ---: |
| 1 | 整除性与互质 | 8 | 8 |
| 2 | 同余与一次同余式 | 3 | 2 |
| 3 | 图的基本概念 | 7 | 7 |
| 4 | 树 | 5 | 5 |
| 5 | 有向图与 Euler 图 | 6 | 6 |
| 6 | Hamilton 图 | 4 | 4 |

## 已发现问题

### P0：章节读取过度匹配

现象：

- 读取第 1 章时，原先会同时读到 `2.1`、`3.1`、`4.1`、`5.1`、`6.1`。
- 读取第 2 章时，原先会同时读到 `1.2`、`3.2`、`4.2` 等。

原因：

- `review_materials.mjs` 的 `chapterMatch()` 使用了过宽的正则，导致小节编号中的 `.1/.2` 被当成章节号。

处理：

- 已修复为只匹配文件名前缀中的章节号。
- 已补单测 `chapter material matching does not overmatch decimal section numbers`。

验证：

```text
1:8, 2:3, 3:7, 4:5, 5:6, 6:4
```

### P1：active 元数据仍残留旧 revision 信息

`active/profile.json` 当前仍包含：

```json
{
  "revisionOf": "lisan__draft_20260608__draft_20260608",
  "legacySubjectId": "lisan__draft_20260610",
  "revisionRoot": "lisan",
  "slot": "active"
}
```

这不会阻止 `/review` 使用，但会误导后续维护：

- active 看起来像从嵌套 draft 启用而来。
- 后续自动生成质量报告或导出资料包时，可能把旧 revision 链当成当前事实。

建议：

- 保留 `revisionRoot: "lisan"`、`slot: "active"`。
- 将 `revisionOf`、`legacySubjectId` 这类历史迁移字段移入 `migrationHistory` 或直接从 active 元数据中清理。
- 清理动作应通过 `/review-fix` 创建 draft 后启用，不建议直接热改 active。

### P1：质量报告和 source map 过时

`quality_report.md` 仍写：

```text
Subject ID: lisan__draft_20260610
状态: draft
知识点: 34
卡片: 17
```

实际 active 为：

```text
subjectId: lisan
status: active
knowledge points: 32
cards: 16
```

`source_map.json` 也仍写：

```json
{
  "subject_id": "lisan__draft_20260610"
}
```

建议：

- 重写 `quality_report.md`，以当前 active 实际结构为准。
- 重写 `source_map.json.subject_id` 为 `lisan`。
- 在报告中明确：第 1-2 章为数论，第 3-6 章为图论。

### P1：卡片覆盖不足

当前 knowledge point 共 32 个，卡片 16 张。代码匹配后仍有 13 个知识点找不到卡片：

```text
graph-basic-defs
degree-handshake
paths-connectivity
graph-matrices
dijkstra-algorithm
proof-ideas-extensions-ch3
tree-definitions
mst-other-algorithms
proof-ideas-extensions-ch4
digraph-basics
directed-tree
proof-ideas-extensions-ch5
hamilton-basics
```

其中部分并非完全缺内容，而是卡片文件名过泛，例如：

- `Dijkstra算法.md` 不能稳定匹配 `dijkstra-algorithm / 权图与Dijkstra最短路算法`
- `Hamilton图.md` 不能覆盖 `hamilton-basics / Hamilton路与必要条件`

建议：

- 给现有卡片补标准 frontmatter：`id/name/aliases/chapter/status`。
- 对图论补齐每个高频知识点的独立卡片。
- 对“证明思想与补充结论”类知识点，可以保留综合卡片，但需要在 aliases 中显式声明对应 id。

### P2：active 下存在未引用旁路目录

active 下有：

```text
cards_nt/          11 files
chapters_nt/       13 files
exam_points_nt/    3 files
```

这些目录不在 `profile.json.paths` 中，因此普通 `/review` 不会读取。它们更像旧草稿或中间产物。

风险：

- 后续人工维护时容易误改错目录。
- 其它 AI 读取整个 active 目录时可能把 `_nt` 和正式目录混在一起。

建议：

- 如果内容已合并到正式目录，移动到 archived 对应版本或删除。
- 如果仍有价值，先合并到正式 `cards/chapters/exam_points/`，再清理 `_nt`。

### P2：第 1 章考点总结重复

`exam_points/` 下有两个第 1 章总结：

```text
第1章-整除性-考点总结.md
第1章-整除性与互质-考点总结.md
```

代码会同时读取两份，模式 2 出题前可能给 agent 注入重复或冲突的考点摘要。

建议：

- 合并为一份 `第1章-整除性与互质-考点总结.md`。
- 删除或归档较旧的 `第1章-整除性-考点总结.md`。

### P3：训练资产尚未标准化

当前章节材料里已经包含证明思想、补充结论、概念辨析，但还没有拆成标准目录：

```text
unit_summaries/
misconceptions/
extensions/
problem_templates/
```

这对数学类复习影响较大，因为数学题不应只靠概念抽查，还需要：

- 证明模板
- 计算模板
- 步骤诊断
- 常见变式
- rubric 判分规则

建议下一轮用 `review-profile-training-assets` 思路整理，而不是在 `/review-init` 阶段一次性硬生成。

## 建议整理顺序

### 第一步：创建修订 draft

通过 `/review-fix` 选择 `lisan` active，让系统复制出 draft。不要直接修改 active。

### 第二步：清理元数据

- `profile.json`
  - `subjectId: "lisan"`
  - `name: "离散数学（数论 + 图论）"`
  - `status: "draft"`，启用后为 `active`
  - 清理旧 `revisionOf / legacySubjectId`，或收敛到 `migrationHistory`
- `source_map.json`
  - `subject_id: "lisan"`
- `quality_report.md`
  - 重写当前实际统计

### 第三步：合并重复和旁路目录

- 合并第 1 章重复考点总结。
- 核对 `_nt` 目录是否有独有内容。
- 没有独有内容则移入 archived 或删除。

### 第四步：补齐卡片匹配

优先补这些：

```text
图的基本定义与术语
点的度数与握手定理
路、回路与连通性
树的定义与等价命题
有向图基本概念
有向树与转化定理
Hamilton路与必要条件
```

对已有但匹配失败的卡片，优先补 frontmatter，而不是只改文件名。

### 第五步：抽取数学训练资产

先做第 1-2 章数论试点：

```text
problem_templates/
├── bezout-identity.md
├── linear-congruence.md
└── euclidean-algorithm.md
```

模板采用启发式，不要硬套固定格式：

- 题型如何识别
- 解题步骤或证明路线
- 常见失败点
- 变式生成规则
- rubric 判分

## 当前可用性判断

| 模式 | 当前状态 | 说明 |
| --- | --- | --- |
| 模式 1：卡片 + 练习 | 部分可用 | 数论较好，图论卡片覆盖不足 |
| 模式 2：直接练习 | 可用 | 考点总结较完整，但第 1 章有重复 |
| 模式 3：章节学习 | 可用 | 章节匹配 bug 已修复，章节材料覆盖好 |

## 后续建议

建议下一步不要先做大规模资料重写，而是先做一个 `lisan` 整理 draft：

```text
修订目标：
1. 清理 active 元数据和过时质量报告。
2. 合并重复 exam_points。
3. 移除或归档 *_nt 旁路目录。
4. 为图论核心知识点补齐卡片或 aliases。
5. 先为数论第 1-2 章生成 problem_templates 试点。
```

