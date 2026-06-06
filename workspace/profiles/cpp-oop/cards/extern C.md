---
type: concept
course: 面向对象程序设计
name: extern C
aliases: [extern "C"]
tags: [概念卡片, cpp, C, 链接]
---

# extern C

`extern "C"` 告诉 C++ 编译器按 C 语言链接方式处理指定函数，避免 C++ [[名字重整]]。

```cpp
extern "C" {
    void f(int);
}
```

常用于 C 与 C++ 互调、动态链接库导出接口。

关联课程：[[5.4 函数重载]]

