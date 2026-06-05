---
type: concept
course: 面向对象程序设计
name: newdefine
aliases: [新定义]
tags: [cpp, 继承, 成员函数]
status: 初稿
priority: medium
---

# newdefine

[[newdefine]] 指派生类中定义了一个基类中没有同名函数的新成员函数。

```cpp
class Base {
public:
    void f();
};

class Derived : public Base {
public:
    void g(); // newdefine
};
```

判断标准是函数名在基类中不存在，不涉及参数列表比较。

相关：[[redefine]]、[[函数重载]]、[[同名隐藏]]
