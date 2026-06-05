---
type: concept
course: 面向对象程序设计
name: new数组
aliases: [new[], operator new[]]
tags: [cpp, 动态内存管理, 数组]
---

# new数组

[[new数组]] 指使用 `new[]` 动态创建数组。

```cpp
A* p = new A[n];
```

它会分配连续空间，并对每个元素调用构造函数。

相关：[[delete数组]]、[[动态数组]]、[[operator new]]、[[11.5 数组的动态分配及释放]]

