---
type: concept
course: 面向对象程序设计
name: using声明
aliases: [using declaration]
tags: [cpp, 名字空间, 名字汇入, 继承]
status: 初稿
priority: medium
---

# using声明

[[using声明]] 指 `using N::x;` 这种只汇入指定名字的写法。

```cpp
using std::cout;
using std::endl;
```

它比 `using namespace N;` 更精确，因为只把需要的名字引入当前作用域。

在继承体系中，`using Base::f;` 可以把基类中名为 `f` 的一组重载函数引入派生类作用域，用来缓解[[同名隐藏]]。

```cpp
class Derived : public Base {
public:
    using Base::f;
    void f(double);
};
```

相关：[[名字汇入]]、[[using namespace]]、[[作用域解析符]]、[[同名隐藏]]、[[12.4 名字汇入]]
