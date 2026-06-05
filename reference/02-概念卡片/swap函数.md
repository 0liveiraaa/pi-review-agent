---
type: concept
course: 面向对象程序设计
name: swap函数
aliases: [swap, 交换函数]
tags: [cpp, 函数, 资源管理]
---

# swap函数

[[swap函数]] 用于交换两个对象或两个变量的内容。

在资源管理类中，`swap` 常被用来辅助实现赋值逻辑：先构造一个临时副本，再交换当前对象与临时对象的资源，让临时对象析构时释放旧资源。

本课程第 9 章的基础要求仍是掌握直接写法：

```cpp
if (this != &rhs) {
    delete resource;
    resource = new Resource(*rhs.resource);
}
return *this;
```

`swap` 是后续更现代、更安全写法的延伸。

相关：[[自定义赋值函数]]、[[深拷贝]]、[[资源管理]]、[[9.6 自定义赋值函数]]

