---
type: concept
course: 面向对象程序设计
name: malloc函数
aliases: [malloc]
tags: [C, cpp, 内存]
---

# malloc函数

[[malloc函数]] 是 C 语言标准库中的动态内存申请函数，只按字节数申请原始内存，不会调用 C++ 构造函数。

```cpp
void* p = malloc(sizeof(A));
```

在 C++ 对象管理中，通常使用 [[new运算符]] 创建对象。

相关：[[free函数]]、[[new运算符]]、[[动态内存管理]]、[[11.3 单对象的动态分配及释放]]

