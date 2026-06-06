---
type: concept
course: 面向对象程序设计
name: pragma once
tags: [概念卡片, cpp, 头文件, 预处理]
---

# pragma once

[[pragma once]]是一种常见的头文件防重复包含写法：

```cpp
#pragma once
```

它的作用类似[[包含警戒]]，让当前头文件在同一个编译单元中只被包含一次。它简洁，但依赖编译器支持。

关联课程：[[2.8 包含警戒]]

