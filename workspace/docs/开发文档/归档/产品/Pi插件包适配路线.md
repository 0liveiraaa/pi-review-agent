# Pi 插件包适配路线

更新日期：2026-06-06

## 当前结论

根据 pi-agent 自带文档 `docs/packages.md`、`docs/extensions.md`，Review 当前已经完成“层次 1：最小 pi package 适配”：

- `workspace/package.json` 已包含 `keywords: ["pi-package"]`。
- `workspace/package.json` 已包含 `pi.extensions` 和 `pi.skills`。
- `@earendil-works/pi-coding-agent`、`@earendil-works/pi-tui`、`typebox` 已放入 `peerDependencies`，范围为 `"*"`。
- 本地 demo 路径仍可用：`cd workspace && pi && /review`。
- 也具备本地包安装基础：`pi install ./workspace` 或在 `workspace/` 内执行 `pi install .`。

本轮已完成层次 2 迁移：`pi.extensions` 指向 `./extensions/review`，`pi.skills` 指向 `./skills`。旧 `.pi/` 路径保留以兼容本地 `cd workspace && pi` 的自动发现。

## 官方机制要点

pi package 通过 `package.json` 的 `pi` 字段声明资源：

```json
{
  "keywords": ["pi-package"],
  "pi": {
    "extensions": ["./extensions"],
    "skills": ["./skills"]
  }
}
```

`pi install` 支持 npm、git、本地路径三类来源。安装记录默认写入用户设置；加 `-l` 写入项目 `.pi/settings.json`。

核心 pi SDK 依赖不应随包重复打包，应作为 peer 依赖：

- `@earendil-works/pi-coding-agent`
- `@earendil-works/pi-tui`
- `typebox`

普通运行时依赖继续放在 `dependencies`。

## 层次 1：已完成 ✅

目标：让项目可以作为本地 pi package 被安装，同时不破坏 workspace 本地运行。

当前可用命令：

```powershell
cd workspace
npm install
npm run setup-review
pi
```

本地包安装验证命令：

```powershell
cd ..
pi install ./workspace
pi list
```

如果只想写入当前项目设置，而不是用户全局设置：

```powershell
cd ..
pi install ./workspace -l
```

注意：`pi install` 会改写 pi 的 settings。正式发布前建议先用本地路径或临时扩展验证，不要修改 pi-agent 全局安装目录。

## 层次 2：标准目录适配 ✅ 已完成 (2026-06-06)

目标：从”workspace 本地项目”过渡到”标准 pi package 项目”，但仍不急于 npm 发布。

已完成迁移：

| 原路径 | 新路径 | 说明 |
| --- | --- | --- |
| `.pi/extensions/review/index.ts` | `extensions/review/index.ts` | ✅ 已完成 |
| `.pi/skills/` | `skills/` | ✅ 已完成 |
| `.pi/review.config.json` | `review.config.json` (workspace 根) | ✅ 已完成 |
| `review_profiles/demo-review/` | `profiles/demo-review/` (模板) + `review_profiles/demo-review/` (用户数据) | ✅ 已完成 |
| 用户数据写死路径 | `DATA_ROOT` 稳定解析 (PI_REVIEW_DATA → ~/.pi/agent/review-data) | ✅ 已完成 |
| 无 pi 包检查 | `npm run check-package` | ✅ 已完成 |

层次 2 最重要的架构点是“包内只读资源”和“用户可写数据”分离：

- 包内资源：extension、skills、demo profile 模板。
- 用户数据：review profiles、archive、state、summaries。

否则通过 npm/git 安装后，`/review-init`、`/review-fix` 可能会把用户资料写进包安装目录，后续 `pi update` 时存在覆盖或丢失风险。

## 层次 3：插件市场 / npm 发布

目标：作为公开 pi package 发布。

发布前必须补齐：

- npm 元数据：`repository`、`homepage`、`bugs`、`files`、`engines`。
- 包内容白名单：避免发布 `archive/`、`state/`、用户 profile 草稿、`docs/legacy/`、`node_modules/`。
- 用户数据目录策略：默认使用全局用户数据目录 `~/.pi/agent/review-data`，只允许 `PI_REVIEW_DATA` 显式覆盖；不再受当前 `PI_PROJECT_DIR` 影响。
- 首次启动引导：没有 profile 时自动提供 demo profile 或引导 `/review-init`。
- 包安装验收：`pi install git:...`、`pi install npm:...`、`pi -e ...` 三类路径都要测。
- 预览资产：按 pi gallery 文档可选添加 `pi.image` 或 `pi.video`。

## 建议下一步

短期不要马上大迁移目录。先做两件事：

1. 增加 package 安装验证脚本，例如 `npm run check-package`，检查 `package.json.pi`、资源路径、peer deps、发布文件黑名单。
2. 做用户数据目录分离设计，把 `review_profiles/`、`archive/`、`state/` 从“当前 workspace 固定路径”抽象为 profile store / runtime store。

完成这两点后，再迁移到 `extensions/`、`skills/` 标准目录会更稳。
