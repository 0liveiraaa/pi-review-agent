---
type: concept
course: 面向对象程序设计
name: operator delete
aliases: [operator-delete]
tags: [cpp, 动态内存管理, 运算符重载]
---

# operator delete

[[operator delete]] 是 `delete` 表达式底层用于释放原始内存的函数。

```cpp
static void operator delete(void* p);
```

它负责释放内存，不负责对象清理。对象清理由析构函数完成。

相关：[[delete运算符]]、[[operator new]]、[[析构函数]]、[[11.4 重载operator new和operator delete]]

