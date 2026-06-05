---
type: concept
course: 面向对象程序设计
name: explicit关键字
aliases: [explicit]
tags: [cpp, 构造函数, 类型转换]
---

# explicit 关键字

[[explicit关键字]] 可用于修饰构造函数或转换函数，禁止它们被编译器用于隐式类型转换。

```cpp
class A {
public:
    explicit A(int value);
};
```

加上 `explicit` 后，必须显式构造对象：

```cpp
A a(100);
```

而不能让编译器自动把 `100` 转成 `A`。

转换函数也可以写成 `explicit operator float() const`，表示只允许显式转换。

相关：[[转换构造函数]]、[[转换函数]]、[[隐式类型转换]]、[[构造函数]]、[[8.1 自定义构造函数]]、[[12.1 转换函数]]
