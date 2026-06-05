---
type: concept
course: 面向对象程序设计
name: inline
tags: [cpp, 关键字, 成员函数]
---

# inline

[[inline]] 是 C++ 中建议编译器在调用点展开函数体的关键字。

它不是强制命令，是否真正内联由编译器决定。

```cpp
inline void A::f() {
}
```

`inline` 需要和函数定义一起出现才有实际意义。

相关：[[内联实现]]、[[外联实现]]、[[编译期依赖]]、[[7.3 外联实现和内联实现]]

