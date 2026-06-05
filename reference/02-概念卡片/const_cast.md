---
type: concept
course: 面向对象程序设计
name: const_cast
tags: [cpp, 概念卡片, 类型转换, const]
---

# const_cast

`const_cast` 用于添加或去除 `const`、`volatile` 等限定符。

```cpp
const A& ca = a;
A& ra = const_cast<A&>(ca);
```

它只改变限定符，不负责普通类型之间的转换。强行修改真正的常对象是不安全的。

相关：[[16.3 类型转换操作符]]、[[const]]、[[常对象]]
