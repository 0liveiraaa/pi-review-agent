---
type: concept
course: 面向对象程序设计
name: endl
tags: [cpp, 流, 输出]
---

# endl

[[endl]] 是标准库中的输出流操纵符，通常完成两件事：

1. 输出换行。
2. 刷新输出缓冲区。

```cpp
std::cout << i << std::endl;
```

频繁使用 `endl` 会频繁刷新，可能比输出 `'\n'` 更慢。

相关：[[cout]]、[[输出流]]、[[流]]、[[12.7 流]]
