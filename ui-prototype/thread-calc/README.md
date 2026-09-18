# 螺纹尺寸推导（THREAD LAB）

给定公制螺纹规格，生成内外螺纹**牙顶 / 牙底 / 中径**与**退刀槽（推导槽）**数据。

## 打开

```bash
cd ui-prototype && python3 -m http.server 8080
# http://localhost:8080/thread-calc/
```

## 输入

- 代号：`M20`、`M20×1.5`、`M16*1`
- 或直接改公称直径 d、螺距 P
- 退刀槽长度：普通 g1 / 短 g2 / 长 g3

## 输出

| 对象 | 牙顶 | 牙底 | 中径 |
|------|------|------|------|
| 外螺纹 | 大径 d | 小径 d3（圆底） | d2 |
| 内螺纹 | 小径 D1 | 大径 D | D2 |

另附 GB/T 3 退刀槽 df/Dg、槽宽、圆角，以及毛坯/底孔加工参考。

## 自测

```bash
node ui-prototype/thread-calc/smoke-test.mjs
```
