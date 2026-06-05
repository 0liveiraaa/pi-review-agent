---
type: concept
course: 面向对象程序设计
name: delete数组
aliases: [delete[], operator delete[]]
tags: [cpp, 动态内存管理, 数组]
---

# delete数组

[[delete数组]] 指使用 `delete[]` 释放由 `new[]` 创建的动态数组。

```cpp
delete[] p;
```

它会对每个数组元素调用析构函数，然后释放整块数组空间。

相关：[[new数组]]、[[动态数组]]、[[operator delete]]、[[11.5 数组的动态分配及释放]]

