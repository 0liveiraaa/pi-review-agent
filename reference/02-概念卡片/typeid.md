---
type: concept
course: 面向对象程序设计
name: typeid
tags: [cpp, 概念卡片, RTTI, 类型识别]
---

# typeid

`typeid` 是 C++ 的运行时类型识别操作符，用于获得表达式的类型信息。

对指针变量使用 `typeid(p)` 时，得到的是指针本身的静态类型；对多态对象或引用使用 `typeid(*p)`、`typeid(ref)` 时，可能得到对象的动态类型。

相关：[[18.8 运行时类型识别（RTTI）]]、[[RTTI]]、[[dynamic_cast]]

