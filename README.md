# 皮带机 PIDM

SolidWorks 皮带机路径分类提取 → 网页逐点张力计算（架构与 UI 原型）。

## 本机计算 · 第 1 步

运量–带宽–带速。手册 PDF 放在你自己电脑上，用 Miniconda 跑。

见 [`calc/README-m01.md`](./calc/README-m01.md)。

```text
scripts\extract-handbook.bat --pages 80-95
scripts\run-m01.bat --Q 800 --rho 1.6 --v 2.5
```

## UI 原型

见 [`ui-prototype/`](./ui-prototype/)：

- 打开 `ui-prototype/index.html` 即可预览五面板界面
- 或执行：

```bash
cd ui-prototype && python3 -m http.server 8080
```

