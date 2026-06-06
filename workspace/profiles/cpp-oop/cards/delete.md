---
type: concept
course: 面向对象程序设计
name: delete
tags: [概念卡片, cpp, 动态内存, 堆区]
---

# delete

`delete` 是 C++ 中用于释放由 `new` 创建的动态对象的运算符。

```cpp
int* p = new int(55);
delete p;
```

`delete p;` 释放的是 `p` 指向的堆对象，不是销毁指针变量 `p` 本身。

关联课程：[[3.8 变量的存储与作用域]]

