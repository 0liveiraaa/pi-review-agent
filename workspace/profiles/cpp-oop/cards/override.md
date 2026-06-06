---
type: concept
course: 面向对象程序设计
name: override
aliases: [覆盖, 重写]
tags: [cpp, 概念卡片, 继承, 虚函数, 多态]
---

# override

[[override]] 指派生类对基类中的[[虚函数]]给出同原型的新实现，也常译为重写或覆写。

```cpp
class Base {
public:
    virtual void h();
};

class Derived : public Base {
public:
    void h() override;
};
```

它和[[redefine]]容易混淆：

| 术语 | 是否强调虚函数 | 核心含义 |
|---|---|---|
| redefine | 不强调 | 派生类重新定义同名同原型普通函数 |
| override | 强调 | 派生类重写基类虚函数 |

相关：[[18.2 虚函数]]、[[虚函数]]、[[动态编联]]、[[多态]]、[[redefine]]
