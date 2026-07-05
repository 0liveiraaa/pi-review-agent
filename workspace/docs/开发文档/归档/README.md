# 开发文档归档说明

本目录保存历史方案、旧实现说明和已经被当前路线替代的文档。归档文档不作为当前实现依据；需要判断当前事实时，以 `AGENTS.md`、`workspace/docs/开发文档/DESIGN.md`、`workspace/docs/开发文档/CONTEXT.md` 和 `workspace/docs/开发文档/产品/标准化演进路线.md` 为准。

## 归档原则

- 事实过时但仍有历史价值：归档。
- 已被新路线吸收：归档，并在新路线中保留结论。
- 当前实现仍依赖：保留在 live docs。
- 仅作为参考资料：保留在 `参考资料/`，不归入路线。

## 当前 Live Docs

| 文档 | 用途 |
| --- | --- |
| `../CONTEXT.md` | 项目领域语言，不含实现细节。 |
| `../DESIGN.md` | 当前实现架构事实。 |
| `../产品/标准化演进路线.md` | 产品和工程演进主路线。 |
| `../产品/技术债优先级.md` | 当前技术债分级和验收口径。 |

## 已归档主题

| 文档 | 归档原因 |
| --- | --- |
| `产品/后续演进指导.md` | 被 `产品/标准化演进路线.md` 吸收；旧的 `lisan/problem_templates` 近期主线不再作为当前优先级。 |
| `产品/Pi插件包适配路线.md` | package 适配事实已进入 `DESIGN.md` 和 `AGENTS.md`；旧层次路线归档。 |
| `产品/产品迭代路线.md` | 被 `产品/标准化演进路线.md` 替代或缩减为旧链接入口。 |
| `归档/SYSTEM.reference.md` | 旧版 SYSTEM.md 工作流已被 extension + skill 注入取代。 |
| `归档/profile_schema.md` | profile schema 当前事实已进入 `DESIGN.md` 和 `review_profiles.mjs`。 |
| `归档/card_schema.md` | 卡片 schema 当前事实已进入 `cards.mjs` 和 `review-core` skill。 |
