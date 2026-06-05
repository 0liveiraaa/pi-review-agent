# Pi 复习助手

这是项目本地的 pi-agent 复习助手，需要在 `workspace/` 目录下运行。

## 快速开始

```powershell
npm install
npm install -g --ignore-scripts @earendil-works/pi-coding-agent  # 如果尚未安装 pi
npm run setup-review
pi
```

然后使用：

- `/review` 选择 active 科目并开始复习。
- `/review-init` 从 Markdown 或文本笔记创建 draft 科目资料包。
- `/review-fix` 用自然语言反馈修订 draft 资料包。

## 项目本地设计

扩展、技能和配置文件均位于 `workspace/.pi/` 目录下。本项目不会修改 pi-agent 的全局安装，也不会在安装过程中写入 `~/.pi/agent`。

`SYSTEM.md` 仅作为开发参考保留。运行时复习行为由 `/review` 命令通过 `review-core` 和任务特定技能注入。
