---
type: concept
course: 面向对象程序设计
name: using namespace
tags: [cpp, 名字空间, 名字汇入]
---

# using namespace

`using namespace N;` 表示把名字空间 `N` 中的所有名字汇入当前作用域。

```cpp
using namespace std;
cout << "hello" << endl;
```

它书写方便，但容易扩大命名冲突范围。头文件中尤其应慎用。

相关：[[名字汇入]]、[[名字空间]]、[[命名冲突]]、[[12.4 名字汇入]]
