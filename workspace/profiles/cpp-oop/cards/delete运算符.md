---
type: concept
course: 面向对象程序设计
name: delete运算符
aliases: [delete, operator delete]
tags: [cpp, 动态内存管理]
---

# delete运算符

[[delete运算符]] 用于释放由 [[new运算符]] 创建的单个对象。

```cpp
delete p;
```

它大致完成：

1. 调用对象析构函数。
2. 释放对象占用的堆内存。

`new` 应配对 `delete`，`new[]` 应配对 `delete[]`。

其中原始内存释放步骤由 [[operator delete]] 完成。

相关：[[new运算符]]、[[operator delete]]、[[析构函数]]、[[动态内存管理]]、[[11.3 单对象的动态分配及释放]]、[[11.4 重载operator new和operator delete]]
