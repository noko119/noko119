# 皮带机 PIDM

SolidWorks 皮带机路径分类提取 → 网页逐点张力计算（架构与 UI 原型）。

## 本机计算 · 第 1 步

运量–带宽–带速。手册 PDF 放在你自己电脑上，用 Miniconda 跑。

见 [`calc/README-m01.md`](./calc/README-m01.md)。

本机双击文件夹里的 `打开本机计算.bat`。工具可以放在任意目录，不必放到 `C:\Users\HP\noko119`。

整夹拷到其他 Windows 电脑也能用：那台电脑需要已安装 Miniconda 或 Python，第一次在菜单里选「安装抽手册依赖」。每台电脑各自登记自己的手册路径。

```text
打开本机计算.bat
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

