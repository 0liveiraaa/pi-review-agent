 📋 代码审查报告：期末复习助手 (C++ OOP)

 审查范围: 全部源文件（workspace/ 和 .pi/）
 代码总量: ~1200行 (JS/TS) + ~600行 Markdown（Skill 文档）
 审查日期: 2026-06-05

 ────────────────────────────────────────────────────────────────────────────────

### 一、整体评价

 该项目是对期末复习助手的 第三次迭代（SDK v3），整体设计成熟，架构清晰。核心亮点：

1. 复盘驱动上下文管理 — compact + 复盘 JSON 的方案优雅地解决了 LLM 长期上下文膨胀问题
2. 双接口设计 — 既提供 CLI（review_cli.mjs）也提供 TUIExtension（index.ts），覆盖两种使用场景
3. Skill 拆分合理 — 4 个独立 Skill + 1 个合并版，职责分明，可维护性好
4. 知识点索引完善 — 20 章 74 个知识点，含别名、误区、生成提示

 ────────────────────────────────────────────────────────────────────────────────

### 二、架构层面

 ┌──────────┬────────────────────────────────────┬────────────────────────────────────────┐
 │ 维度     │ 优点                               │ 待改进                                 │
 ├──────────┼────────────────────────────────────┼────────────────────────────────────────┤
 │ 模块化   │ lib/ 按职责拆分清晰，依赖关系单向  │ review_cli.mjs 过于臃肿 (~370 行)，与  │
 │          │                                    │ state.mjs 存在重复逻辑                 │
 ├──────────┼────────────────────────────────────┼────────────────────────────────────────┤
 │ 双接口   │ 扩展版和 CLI 版共享                │ 扩展版和 CLI                           │
 │          │ lib/review_engine.mjs /            │ 版各自实现了两套归档逻辑（saveQuestion │
 │          │ review_question.mjs / state.mjs    │ () vs                                  │
 │          │                                    │ buildArchive()），可能产生行为不一致   │
 ├──────────┼────────────────────────────────────┼────────────────────────────────────────┤
 │ 错误处理 │ 顶层 try-catch 覆盖 CLI 入口       │ saveJSON / readJSON                    │
 │          │                                    │ 无文件锁，进程并发时可能损坏           │
 └──────────┴────────────────────────────────────┴────────────────────────────────────────┘

 ────────────────────────────────────────────────────────────────────────────────

### 三、代码质量

#### ⚠️ 严重问题

##### 1. review_cli.mjs — 未使用的导入和变量

```javascript
   // review_cli.mjs L5                                                                   
   import { prompt, compact, disposeSession } from "./lib/session.mjs";                   
   // L19                                                                                 
   import { renderMarkdown, printMD, printOptions, divider, title as mdTitle } from       
 "./lib/terminal.mjs";                                                                    
```

- printMD, renderMarkdown, mdTitle 在 CLI 中从未使用过
- prompt (from session.mjs) 与 question (from readline) 命名相似度高，易混淆

##### 2. 两个版本归档逻辑重复

 review_cli.mjs 的 saveQuestion()（L52-78）和 index.ts 的 buildArchive()（L239-281）做的是同一件事但实现不同：

- CLI 版依赖 LLM 生成复盘 JSON（prompt → agent 输出复盘）
- 扩展版在工具函数内自行构建

 后果: 修改存档字段需要改两处，容易漏改。

##### 3. state.mjs 中 initSession/saveProgress 在每次调用时读写磁盘

```javascript
   // state.mjs L69-79                                                                    
   export function initSession(scope, kpIds) {                                            
     const progress = loadProgress();  // 读盘                                            
     // ... 构建 session                                                                  
     saveProgress(progress);           // 写盘                                            
     return session;                                                                      
   }                                                                                      
```

 selectDifficulty()、generateQuestionId()、selectKnowledgePoint() 等方法每次调用都
 loadProgress() 读盘，高频操作下性能堪忧。

#### ⚠️ 中等问题

##### 4. review_cli.mjs 中 saveQuestion() 的 parseFupan 容错不足

```javascript
   function parseFupan(output) {                                                          
     const m = output.match(/```json\s*\n([\s\S]*?)\n```/);                               
     if (!m) return null;                                                                 
     try { return JSON.parse(m[1]); } catch { return null; }                              
   }                                                                                      
```

 当 LLM 输出中包含多个代码块时（比如在讨论中演示代码后又输出复盘），[\s\S]*?
 会匹配第一个代码块而非最后一个。应改为：

```javascript
   const m = output.match(/```json\s*\n([\s\S]*?)\n```\s*$/);                             
   // 或使用反向匹配匹配最后一个代码块                                                    
```

##### 5. terminal.mjs 的 ANSI 渲染代码嵌套过深

```javascript
   function renderTokens(tokens, lines, theme, indent) {                                  
     for (const token of tokens) {                                                        
       switch (token.type) {                                                              
         case "code":                                                                     
           if (token.lang === "cpp" || token.lang === "c++") {                            
             // ... 深嵌套                                                                
           }                                                                              
         // ... 多个 case 分支                                                            
       }                                                                                  
     }                                                                                    
   }                                                                                      
```

 整个文件 ~250 行，renderTokens + renderInlineTokens + highlightCpp
 构成三层嵌套。建议将每个 case 分支提取为独立函数。

##### 6. 扩展版 index.ts 硬编码路径

```typescript
   import { ... } from "../../../workspace/lib/review_engine.mjs";                        
```

 路径 ../../../workspace/lib/ 依赖项目在 面向对象程序设计/ 之下的特定目录布局。如移动 .pi/
 目录或重命名父目录，路径失效。

##### 7. review_cli.mjs 中 Mode 3 的题后选项逻辑重复

```javascript
   // L236-266 单元学习中                                                                 
   if (postChoice === '1') {                                                              
     // ... harder 题逻辑                                                                 
     const harderResp = await prompt(...);                                                
     const harderAns = await smartAnswerInput(harderResp);                                
     ...                                                                                  
     const harderGrade = await prompt(...);                                               
     const hf = await saveQuestion(...);                                                  
     await compact();                                                                     
   }                                                                                      
```

 这段代码与主循环中的出题-作答-判题-归档-压缩逻辑几乎完全重复，应提取为 askAndGrade()
 函数。

#### ✅ 做得好的地方

##### 8. cards.mjs 的模糊匹配策略合理

```javascript
   if (kpName.includes(stem) || stem.includes(kpName)) { ... }                            
```

 双向包含匹配比简单的 substring 更鲁棒，能处理"类的继承"←→"继承"这样的匹配。

##### 9. state.mjs 中 classifyError 基于正则的错题分类

```javascript
   export function classifyError(archive) {                                               
     const misconception = archive.discussion_summary?.core_misconception || "";          
     if (/混淆|分不清|搞混|弄混|混为一谈/.test(misconception)) return "概念混淆";         
     if (/遗漏|忘记|忽略|不知道|不了解|没考虑到/.test(misconception)) return "知识遗漏";  
     if (/推理|逻辑|推导|判断|分析/.test(misconception)) return "推理错误";               
     return "概念混淆";  // 兜底                                                          
   }                                                                                      
```

 用简单的关键词分类替代了复杂的 NLP，在有限场景下够用且无额外依赖。

##### 10. review_question.mjs 中多选题答案解析完善

```javascript
   export function parseChoiceAnswer(raw, question) {                                     
     // 支持: "BD", "B D", "B,D", "B和D", "B与D"                                          
     const letters = text.toUpperCase()                                                   
       .replace(/[\s,，、;；]/g, "")                                                      
       .split("")                                                                         
       .filter(c => c >= "A" && c <= "Z")                                                 
       .filter(c => c.charCodeAt(0) - 64 <= max);  // 防越界                              
     return [...new Set(letters)].join("");  // 去重                                      
   }                                                                                      
```

 ────────────────────────────────────────────────────────────────────────────────

### 四、安全与健壮性

 ┌─────────────────────────┬──────────┬────────────────────────────────────────────┐
 │ 问题                    │ 严重程度 │ 说明                                       │
 ├─────────────────────────┼──────────┼────────────────────────────────────────────┤
 │ saveJSON 无原子写入     │ ⚠️ 中    │ 写入过程中进程终止会导致 JSON 截断         │
 ├─────────────────────────┼──────────┼────────────────────────────────────────────┤
 │ readJSON 无缺失文件处理 │ ⚠️ 中    │ 若 .json 文件不存在/损坏，直接抛异常       │
 ├─────────────────────────┼──────────┼────────────────────────────────────────────┤
 │ 路径 hardcode           │ ⚠️ 中    │ index.ts 依赖精确目录层级                  │
 ├─────────────────────────┼──────────┼────────────────────────────────────────────┤
 │ 无输入长度限制          │ 🟢 低    │ 用户输入通过 question() 收集，未做长度限制 │
 └─────────────────────────┴──────────┴────────────────────────────────────────────┘

 ────────────────────────────────────────────────────────────────────────────────

### 五、性能

 ┌──────────────────────────────┬─────────────────────────────────────────────────────────┐
 │ 问题                         │ 说明                                                    │
 ├──────────────────────────────┼─────────────────────────────────────────────────────────┤
 │ loadProgress() 高频调用      │ 每轮出题+判题+复盘阶段调用约 8-10 次 I/O                │
 ├──────────────────────────────┼─────────────────────────────────────────────────────────┤
 │ generateQuestionId()         │ 每次生成题目 ID 时遍历 archive/sessions/                │
 │ 扫描目录                     │ 下的所有文件找最大序号                                  │
 ├──────────────────────────────┼─────────────────────────────────────────────────────────┤
 │ compact() 吞异常             │ try/catch {} 静默忽略失败，可能造成上下文持续膨胀       │
 └──────────────────────────────┴─────────────────────────────────────────────────────────┘

 ────────────────────────────────────────────────────────────────────────────────

### 六、建议改进清单

#### 优先级 P0（影响功能正确性）

1. 修复 parseFupan 多代码块问题 — 用正向后向匹配确保匹配最后一个 ````json` 块
2. 统一归档逻辑 — 将 saveQuestion() 和 buildArchive() 合并到 state.mjs 中

#### 优先级 P1（影响开发效率和可维护性）

3. 提取 askAndGrade() 共用函数 — 消除 Mode 1/2 主循环和 Mode 3 之间的重复代码
4. 引入内存缓存 — 在 state.mjs 中增加 ProgressCache，减少磁盘 I/O：

```javascript
   let _progressCache = null;                                                             
   export function getProgress() {                                                        
     if (!_progressCache) _progressCache = loadJSON(PROGRESS_FILE);                       
     return _progressCache;                                                               
   }                                                                                      
   export function flushProgress() { saveJSON(PROGRESS_FILE, _progressCache); }           
```

#### 优先级 P2（代码质量提升）

5. 清理未使用的导入/变量 — review_cli.mjs 中的 printMD, renderMarkdown, mdTitle
6. terminal.mjs 拆分渲染函数 — 将 renderTokens 的各 case 分支提取到独立函数
7. 添加 generateQuestionId() 的增量缓存 — 记录当前日期的 maxSeq 在 progress.json中，避免每次扫描目录
8. 扩展版路径改为配置驱动 — 使用 .pi/review.config.json 中的路径而非硬编码 ../../..

 ────────────────────────────────────────────────────────────────────────────────

### 七、总结

 这是一个结构清晰、功能完整的期末复习工具。最大的优点是"复盘驱动"的上下文管理策略和难度自适
 应体系，设计文档（DESIGN.md）详细记录了每项决策的背景和理由。

 核心建议: 优先解决双接口归档逻辑重复和 parseFupan 容错问题，其次是减少 I/O
 频率。代码风格整体优秀，可以在后续迭代中逐步重构。
