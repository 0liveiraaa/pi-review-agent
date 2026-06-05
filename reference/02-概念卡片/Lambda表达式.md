---
type: concept
course: 面向对象程序设计
name: Lambda表达式
aliases: [lambda, 匿名函数]
tags: [概念卡片, cpp, 表达式, 函数对象]
---

# Lambda表达式

[[Lambda表达式]]是现代 C++ 中的匿名函数表达式，可以直接在需要函数行为的位置定义一段可调用逻辑。

```cpp
auto add = [](int a, int b) {
    return a + b;
};
```

它在 C++11 后引入，类似概念也广泛存在于其他现代编程语言中。

关联课程：[[3.9 表达式]]

