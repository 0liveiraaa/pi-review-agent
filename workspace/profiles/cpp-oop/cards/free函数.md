---
type: concept
course: 面向对象程序设计
name: free函数
aliases: [free]
tags: [C, cpp, 内存]
---

# free函数

[[free函数]] 是 C 语言标准库中的动态内存释放函数，释放 `malloc` 等函数申请的原始内存，不会调用 C++ 析构函数。

```cpp
free(p);
```

在 C++ 对象管理中，通常使用 [[delete运算符]] 释放由 `new` 创建的对象。

相关：[[malloc函数]]、[[delete运算符]]、[[析构函数]]、[[11.3 单对象的动态分配及释放]]

