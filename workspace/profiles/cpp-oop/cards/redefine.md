---
type: concept
course: 面向对象程序设计
name: redefine
aliases: [重定义]
tags: [cpp, 继承, 成员函数, 易错]
status: 初稿
priority: high
---

# redefine

[[redefine]] 指派生类中重新定义了与基类中某个普通成员函数同名、同参数列表的函数。课程中强调它通常指“相同函数原型”的重新定义。

```cpp
class Base {
public:
    void g();
};

class Derived : public Base {
public:
    void g(); // redefine
};
```

它和[[override]]的区别是：override 发生在[[虚函数]]语境中；redefine 不强调虚函数机制。

相关：[[override]]、[[同名隐藏]]、[[继承]]
