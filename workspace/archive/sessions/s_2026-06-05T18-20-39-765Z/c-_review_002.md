---
question_id: c-_review_002
knowledge_points: virtual_dispatch_rule, dynamic_polymorphism
difficulty: M-U
type: judgment
timestamp: 2026-06-05T18:24:11.726Z
is_correct: true
---

# 题目归档: c-_review_002

## 题目
判断以下说法是否正确：给定代码 A* pa = new B; void* pv = nullptr; pa->f(pv); 最终输出为 'B::f(void*)'。

## 用户答案
错误

## 正确答案 + 解析
错误

❌ 说法错误。A 中没有 f(void*) 版本，void* 不能隐式转换为 A*，因此编译错误。核心规律：目标对象按动态类型分派虚函数，参数按静态类型匹配重载，两者独立发生。

## 讨论总结
### 错误根因
无
### 确认的知识点
- 无
### 用户自我纠正
无
### 遗留问题
- 无

## 知识链 (Level 3)
（无）

## 后续建议
继续按当前范围复习。