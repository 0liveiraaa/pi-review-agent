---
type: concept
course: 面向对象程序设计
name: size_t
tags: [cpp, 类型, 内存]
---

# size_t

[[size_t]] 是 C/C++ 中用于表示对象大小、内存字节数和容器长度的无符号整数类型。

```cpp
void* operator new(size_t size);
```

它与平台相关，32 位和 64 位环境下大小可能不同。

相关：[[sizeof运算符]]、[[operator new]]、[[11.4 重载operator new和operator delete]]

