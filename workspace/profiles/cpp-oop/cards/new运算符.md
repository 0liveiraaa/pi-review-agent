---
type: concept
course: 面向对象程序设计
name: new运算符
aliases: [new, operator new]
tags: [cpp, 动态内存管理]
---

# new运算符

[[new运算符]] 用于在 [[自由存储区]] 中动态创建对象。

```cpp
T* p = new T(参数列表);
```

它大致完成：

1. 申请足够的原始内存。
2. 调用对象构造函数。
3. 返回对象地址。

其中原始内存申请步骤由 [[operator new]] 完成。

相关：[[delete运算符]]、[[operator new]]、[[构造函数]]、[[动态内存管理]]、[[11.3 单对象的动态分配及释放]]、[[11.4 重载operator new和operator delete]]
