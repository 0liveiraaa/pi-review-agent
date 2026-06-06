---
type: concept
course: 面向对象程序设计
name: dynamic_cast
tags: [cpp, 概念卡片, 类型转换, 多态]
---

# dynamic_cast

`dynamic_cast` 是运行时类型转换操作符，常用于[[向下类型转换]]。

```cpp
Base* p = new Derived;
Derived* d = dynamic_cast<Derived*>(p);
```

指针形式转换失败返回空指针；引用形式转换失败会抛出异常。它属于 [[RTTI]]，通常要求基类是带[[虚函数]]的多态类型。

常见判断方式：

```cpp
if (Derived* d = dynamic_cast<Derived*>(p)) {
    d->onlyDerived();
}
```

相关：[[16.3 类型转换操作符]]、[[18.8 运行时类型识别（RTTI）]]、[[虚函数]]、[[虚函数表]]
