---
type: concept
course: 面向对象程序设计
name: this指针
tags: [cpp, 类, 成员函数, this指针]
---

# this指针

[[this指针]] 是非静态成员函数中隐含的指针，指向当前调用该成员函数的对象。

在 `Student` 的普通成员函数中，`this` 可以理解为：

```cpp
Student* const this
```

`this` 本身不能改指向，但普通成员函数可以通过 `this` 修改当前对象的数据成员。

```cpp
this->score_ += 1;
```

在 [[常成员函数]] 中，`this` 类似：

```cpp
const Student* const this
```

此时不能通过 `this` 修改当前对象的普通数据成员。

`this` 是指针，`*this` 表示当前对象本身。成员函数返回 `*this` 的引用时，可以支持 [[链式调用]] 或 [[链式赋值]]。

相关：[[成员函数]]、[[thiscall]]、[[常成员函数]]、[[返回引用]]、[[链式调用]]、[[链式赋值]]、[[7.1 成员函数的实现]]、[[7.2 this指针]]、[[9.6 自定义赋值函数]]
