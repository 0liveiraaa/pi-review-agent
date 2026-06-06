---
type: concept
course: 面向对象程序设计
name: static_cast
tags: [cpp, 概念卡片, 类型转换]
---

# static_cast

`static_cast` 是 C++ 的静态类型转换操作符，用于编译期有明确转换规则的场景。

```cpp
int n = static_cast<int>(3.14);
```

它比 C 风格强制转换更清楚，但不进行运行时真实类型检查。向下转换需要运行时判断时，应考虑 [[dynamic_cast]]。

相关：[[16.3 类型转换操作符]]
