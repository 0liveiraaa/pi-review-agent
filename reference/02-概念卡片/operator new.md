---
type: concept
course: 面向对象程序设计
name: operator new
aliases: [operator-new]
tags: [cpp, 动态内存管理, 运算符重载]
---

# operator new

[[operator new]] 是 `new` 表达式底层用于申请原始内存的函数。

```cpp
static void* operator new(size_t size);
```

它负责分配内存，不负责初始化对象。对象初始化由构造函数完成。

相关：[[new运算符]]、[[operator delete]]、[[size_t]]、[[11.4 重载operator new和operator delete]]

