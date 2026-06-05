---
type: concept
course: 面向对象程序设计
name: extern
tags: [概念卡片, cpp, 声明, 链接]
---

# extern

[[extern]]常用于声明某个变量或函数具有外部链接，告诉编译器该实体可能在其他编译单元中定义。

例如 `extern int a;` 是声明，不分配存储空间；真正的 `int a;` 定义通常只能出现一次。

关联课程：[[2.8 包含警戒]]

