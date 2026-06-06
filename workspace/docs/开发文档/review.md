> **📌 复核已办结**（2026-06-06）
> 本文档之后的清理工作已在同日完成，包括：
> - node_modules/ 和运行产物从 git 跟踪移除
> - package.json 更名为 pi-review@3.0.0
> - 旧 CLI 归档至 docs/legacy/
> - 文档重写（DESIGN v4.0、README、profile/card schema）
> - 各项变更均已通过 git status 和 npm run check 验证

# Review 开源本地化实现复核报告

审查日期：2026-06-06  
结论：开源 v1 已切换为“独立项目 + `workspace/` 本地运行”形态。pi 资源、配置、skills、文档模板均已收敛到 `workspace/` 下；根目录 `.pi` 不再作为运行入口。

---

## 当前状态

- 用户应进入 `workspace/` 后运行 `npm run setup-review` 和 `pi`。
- 扩展入口位于 `workspace/.pi/extensions/review/index.ts`。
- skills 位于 `workspace/.pi/skills/`。
- 配置位于 `workspace/.pi/review.config.json`。
- skill 模板位于 `workspace/docs/review-kit/skills/`。
- `SYSTEM.md` 仍保留在 `workspace/.pi/SYSTEM.md` 作为开发参考，但 review 运行时主规则由 prompt 显式注入 `/skill:review-core`。

---

## 已完成

- `/review`、`/review-init`、`/review-fix` 的 prompt 都会显式提到 `review-core`。
- `/review` prompt 同时提示按阶段参考 `review-question`、`review-grade`、`review-discuss`、`review-summary`。
- 新增 `review-core` 主 skill，负责总规则、子 skill 路由和 profile 生命周期边界。
- `review_config.mjs` 已改为以 `workspace/` 为根解析路径。
- 默认路径已改为 `data/`、`archive/`、`state/`、`review_profiles/`。
- C++ profile 保持 `legacy-bridge`，继续桥接根目录 `reference/` 和既有资料。
- 非 `legacy-bridge` profile 禁止 paths 中包含 `..`。
- `writeProfileFile()` 在库层拒绝写入非 draft profile。
- `setup-review` 会检查 `workspace/.pi` 关键文件，并从 `workspace/docs/review-kit/skills` 补齐缺失 skill 模板。
- 根目录旧 `.pi` 和旧 `docs/review-kit` 已移除，避免从仓库根目录误加载旧入口。

---

## 测试结果

已通过：

```text
npm run check
npm test
npm run setup-review
```

当前单元测试覆盖：

- workspace 根路径解析。
- active profile 扫描。
- 默认 C++ profile shape。
- draft 写入路径限制。
- active profile 写入拒绝。
- 非 legacy profile 的 `..` path 拒绝。
- review/init/fix prompt 的 skill 注入检查。

---

## 剩余风险

- 跨科目资料生成策略仍是占位 skill，尚未实现真实资料切分质量。
- 当前未做 `pi install` 包分发；这是开源 v1 的有意取舍。
- 默认 C++ profile 仍是 legacy bridge，不是新 profile 标准模板。
- 若未来要全局安装，应另做 pi package，而不是修改 pi-agent 的全局 node_modules。

---

## 建议下一步

1. 由其它 AI 补全 `review-init`、`review-fix` 和 `review-profile-*` 的具体资料整理策略。
2. 给 `/review-init` 增加更清晰的 TUI 提示：draft 创建不等于资料包生成完成。
3. 后续准备开源时清理 Windows 保留名 `nul` 和临时 profile 删除记录，避免 `git add -A` 失败。
