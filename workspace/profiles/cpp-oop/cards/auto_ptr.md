---
type: concept
course: 面向对象程序设计
name: auto_ptr
tags: [cpp, 智能指针, 历史特性]
---

# auto_ptr

[[auto_ptr]] 是早期 C++ 标准库中的智能指针类型，后来已经被废弃。

课程中用它说明智能指针思想：对象内部保存裸指针，析构时自动 `delete`。

现代 C++ 中通常使用 `std::unique_ptr`、[[共享指针]] 等替代。

相关：[[智能指针]]、[[RAII]]、[[11.6 智能指针和共享指针]]

