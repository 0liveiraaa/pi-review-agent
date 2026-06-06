# Pi 复习助手 🎯

> **AI 驱动的课程期末复习助手** — 在 pi-agent TUI 中与 AI 对话式刷题、背卡片、学章节。
>
> 专为 C++ 面向对象程序设计课程设计，但支持任意课程。

---

## ✨ 项目特色

### 🤖 AI 智能全链路复习指导

基于 LLM（大语言模型）从你的学习笔记开始**生成复习资料**,并同时根据复习资料自动**生成题目**，支持多种题型，难度从简单回忆到复杂综合分析共 5 个等级,并提供完善的**解析**和**复盘指导**。

### 🎯 三种复习模式

| 模式                       | 适合场景           | 流程                             |
| -------------------------- | ------------------ | -------------------------------- |
| **📇 概念卡片+练习** | 背概念、记定义     | 先看卡片记要点 → 做相关题目巩固 |
| **✍️ 直接练习**    | 刷题冲刺、考前突击 | 先看章节考点总结 → 直接做题     |
| **📖 章节笔记学习**  | 系统学习、查漏补缺 | 先阅读章节笔记 → 生成理解性问题 |

### 📊 智能追踪

- **错题本** — 自动记录答错的题目，后续优先复现
- **知识链路** — 追踪知识点掌握程度，发现薄弱环节
- **进度统计** — 复习了多少、正确率如何，一目了然

### 🔄 Profile 生命周期管理

```
draft (草稿/可编辑) → active (已启用/可复习) → archived (已归档/可回滚)
```

- 用 `/review-init` 从笔记创建复习资料包
- 资料包随时可以用 `/review-fix` 修订
- 修订版确认启用后，原版自动归档，支持一键回滚

### 🎚️ 五级难度体系

题目难度 = **知识广度 × 认知层次**：

| 难度                  | 缩写 | 说明                |
| --------------------- | ---- | ------------------- |
| ⭐ 单一·回忆         | S-R  | 单个概念，记忆/识别 |
| ⭐⭐ 单一·理解       | S-U  | 单个概念，理解/辨析 |
| ⭐⭐⭐ 多概念·理解   | M-U  | 2-3 个相关概念比较  |
| ⭐⭐⭐⭐ 多概念·分析 | M-A  | 多概念推理分析      |
| ⭐⭐⭐⭐⭐ 链路·分析 | C-A  | 知识链综合运用      |

---

## 📦 安装方法

### 前置要求

- **Node.js** >= 22（[下载地址](https://nodejs.org/)）
- 一个可用的 **LLM API Key**（在 pi 中配置）

### 🚀 方法一：一键安装（推荐 · 无需任何技术知识）

下载本项目后，**双击根目录下的 `install.cmd`**，脚本会自动：

1. ✅ 检查 Node.js 环境
2. ✅ 全局安装 pi-agent（运行平台）
3. ✅ 安装所有项目依赖
4. ✅ 运行完整性检查

全程无需手动输入任何命令，等待提示"安装成功"即可。

> 💡 如果使用 Git Bash 或 WSL，可以运行 `bash install.sh`。

### 🛠️ 方法二：手动安装

```bash
# 1. 全局安装 pi-agent 运行平台
npm install -g @earendil-works/pi-coding-agent

# 2. 进入 workspace 目录安装依赖
cd workspace
npm install

# 3. 验证安装完整性
npm run setup-review

# 4. 启动！
pi
```

### 📥 方法三：作为 pi package 安装

```bash
# 从本地路径安装
pi install ./workspace

# 或从 git 安装
pi install git:git@github.com:0liveiraaa/pi-review-agent
```

---

## 🎮 使用方法

### 快速开始

```bash
# 进入项目目录
cd pi-review-agent/workspace

# 启动 pi-agent
pi
```

### 核心命令

进入 pi 后，在输入框内输入以下**斜杠命令**：

| 命令             | 用途                                                                   | 首次使用？     |
| ---------------- | ---------------------------------------------------------------------- | -------------- |
| `/review`      | 🎯**开始复习** — 选择 profile → 选择模式 → 选择范围 → 开刷！ | ✅ 从这里开始  |
| `/review-init` | 📝**创建复习资料包** — 把你的笔记/Markdown 转成复习资料         | 有笔记时使用   |
| `/review-fix`  | ✏️**修订资料包** — 修改已有资料包的内容                       | 需要修改时使用 |

### 首次复习体验

1. 输入 `pi` 启动 pi-agent
2. 输入 `/review`
3. 选择 `学习方法 Demo` profile（内置示例，无需配置）
4. 选择一种模式，推荐 **直接练习**
5. 选择复习范围
6. AI 会根据资料自动出题，回答后给出解析
7. 每次答题后可以选择：**下一题/看提示/追问/提高难度/做总结/退出**

### 高级用法

#### 创建自己的复习资料包

1. 准备课程笔记（Markdown 格式）
2. 在 pi 中输入 `/review-init`
3. 按照指引填写课程基本信息
4. AI 会自动分析笔记，生成结构化的复习资料包
5. 完成后在 pi 中输入 `/review` 即可使用

#### 修订已有资料包

1. 在 pi 中输入 `/review-fix`
2. 选择要修订的 profile
3. 提供修订意见
4. 确认启用后，原版自动备份

---

## 🏗️ 难度系统详解

复习时你可以选择难度范围，AI 会根据选择生成相应难度的题目：

| 难度等级      | 认知要求  | 题目示例                                               |
| ------------- | --------- | ------------------------------------------------------ |
| **S-R** | 识别/回忆 | "什么是构造函数？"                                     |
| **S-U** | 理解/区分 | "构造函数的参数可以设置默认值吗？为什么？"             |
| **M-U** | 比较/关联 | "构造函数和析构函数在执行顺序上有什么不同？"           |
| **M-A** | 推理/分析 | "以下代码中，构造和析构的顺序是什么？为什么？"         |
| **C-A** | 综合/评价 | "设计一个类层次结构，用虚函数实现多态，分析内存布局。" |

---

## 📁 项目结构

```
pi-review-agent/
├── install.cmd                       ← 一键安装脚本（Windows）
├── install.sh                        ← 一键安装脚本（bash）
├── workspace/                        ← 主要工作目录
│   ├── extensions/review/index.ts    ← 入口：注册所有 review 命令和工具
│   ├── skills/                       ← 14 个 SKILL.md（AI 行为规范）
│   │   ├── review-core/              ← 核心规则
│   │   ├── review-question/          ← 出题规则
│   │   ├── review-grade/             ← 评分规则
│   │   ├── review-discuss/           ← 讨论规则
│   │   ├── review-summary/           ← 总结报告规则
│   │   └── review-init/             ← 初始化规则
│   ├── lib/                          ← 核心库模块
│   │   ├── review_engine.mjs         ← 复习引擎
│   │   ├── review_question.mjs       ← 题目处理
│   │   ├── review_profiles.mjs       ← Profile 管理
│   │   ├── review_materials.mjs      ← 资料加载
│   │   ├── review_config.mjs         ← 配置管理
│   │   ├── state.mjs                 ← 状态管理（进度、错题本）
│   │   ├── cards.mjs                 ← 概念卡片
│   │   └── chapters.mjs              ← 章节处理
│   ├── review.config.json            ← 默认课程配置
│   ├── profiles/demo-review/         ← 内置新手体验资料包
│   ├── review_profiles/              ← 用户的复习资料包
│   │   ├── cpp-oop/                  ← C++ OOP 课程资料包
│   │   └── demo-review/              ← 新手体验资料包
│   ├── data/knowledge_index.json     ← 知识点索引（20章74个知识点）
│   ├── state/                        ← 运行时状态（错题本、进度）
│   ├── archive/                      ← 答题记录归档
│   ├── docs/开发文档/                ← 开发文档
│   ├── scripts/                      ← 工具脚本
│   └── test/                         ← 测试
└── package.json                      ← 根 manifest
```

---

## 🧪 开发命令

```bash
cd workspace

npm run setup-review     # 完整性检查（doctor）
npm run check            # 语法检查所有模块
npm test                 # 运行单元测试（22 tests）
npm run check-package    # pi package 完整性检查
```

---

## 📋 依赖关系

```
Node.js >= 22
   └── @earendil-works/pi-coding-agent  (pi 运行平台)
         ├── @earendil-works/pi-tui      (终端 UI 框架)
         └── typebox                     (JSON Schema 校验)
   └── workspace/
         ├── marked                      (Markdown 渲染)
         └── pi-review 扩展              ← 本项目的代码
```

---

## 📄 开源协议

MIT
