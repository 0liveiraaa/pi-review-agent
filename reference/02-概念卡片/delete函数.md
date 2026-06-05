---
type: concept
course: 面向对象程序设计
name: delete函数
aliases: ["= delete", deleted function]
tags: [cpp, cpp11, 函数]
---

# delete 函数

[[delete函数]] 是 C++11 引入的语法，用于明确禁止某个函数被调用。

```cpp
class A {
public:
    A(const A&) = delete;
};
```

这常用于禁止拷贝构造、禁止赋值或禁止某些不希望出现的重载。

相关：[[禁止拷贝]]、[[拷贝构造函数]]、[[9.4 使用自定义拷贝构造函数]]

