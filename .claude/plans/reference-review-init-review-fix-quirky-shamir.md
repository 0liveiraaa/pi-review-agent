# 为 review-init / review-fix 创建测试数据集

## Context

从 `reference/` 复制少量内容作为 review-init 和 review-fix 的测试数据，放在 `workspace/test/fixtures/` 下。要求：不要太多、能快速验证机制即可。

## 操作步骤

### 1. 创建夹具目录

```
workspace/test/fixtures/source-notes/
└── 01-章节笔记/
    └── 19-20/       ← 从 reference/01-章节笔记/19-20/ 复制
        19.1 静态多态和动态多态.md
        19.2 虚机制的作用.md
```

选择第 19 章 2 个文件（~7KB）的原因：
- 最小的章节组 19-20/，2 个文件足够验证 scanSourceFiles → createDraftProfile → review_profile_write 的完整链路
- 内容相关（多态/虚机制），review-init 能生成有凝聚力的知识索引
- 文件小，1 秒可读完
- 不复制概念卡片（用户说"不要太多"）

### 2. 执行命令

```bash
mkdir -p "C:/Users/25173/Desktop/面向对象程序设计/workspace/test/fixtures/source-notes/01-章节笔记/19-20/"
cp "C:/Users/25173/Desktop/面向对象程序设计/reference/01-章节笔记/19-20/19.1 静态多态和动态多态.md" "C:/Users/25173/Desktop/面向对象程序设计/workspace/test/fixtures/source-notes/01-章节笔记/19-20/"
cp "C:/Users/25173/Desktop/面向对象程序设计/reference/01-章节笔记/19-20/19.2 虚机制的作用.md" "C:/Users/25173/Desktop/面向对象程序设计/workspace/test/fixtures/source-notes/01-章节笔记/19-20/"
```

### 3. 验证方式

```bash
ls -la "C:/Users/25173/Desktop/面向对象程序设计/workspace/test/fixtures/source-notes/01-章节笔记/19-20/"
```
能看到 2 个 .md 文件即可。

### 4. 使用场景

- **review-init 测试**：sourceDir = `test/fixtures/source-notes/` → scanSourceFiles → 读 2 个 .md → 生成 draft profile
- **review-fix 测试**：对生成的 draft 执行修订 → 验证写约束 → 启用
- **手工快速验证**：在 pi 里跑 `/review-init test/fixtures/source-notes/` 看实际效果
