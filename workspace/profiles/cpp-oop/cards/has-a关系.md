---
type: concept
course: 面向对象程序设计
name: has-a关系
aliases: [有一个关系, contain-a, implemented-in-terms-of]
tags: [cpp, 类间关系, 组合, 继承]
status: 初稿
priority: high
---

# has-a关系

[[has-a关系]] 表示一个对象拥有、包含或借助另一个对象完成实现。它通常更适合用[[组合]]等水平关系表达，而不是用公有继承。

例如：

```text
运动员有一辆自行车
运动员不是一种自行车
```

因此 `Player` 和 `Bike` 更适合：

```cpp
class Player {
private:
    Bike bike;
};
```

而不是：

```cpp
class Player : private Bike {
};
```

相关：[[组合]]、[[黑盒复用]]、[[私有继承]]、[[继承和组合的选择]]
