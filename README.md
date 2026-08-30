# 皮带机 PIDM

SolidWorks 皮带机路径分类提取 → 网页逐点张力计算（架构与 UI 原型）。

## 图纸库（Obsidian）

厂家图纸存放库在 [`图纸库/`](./图纸库/)。用 Obsidian **打开该文件夹作为库**（不要打开仓库根目录）。

三位驻库身份（Cursor 自定义子代理）：

- 工艺工程师：`.cursor/agents/belt-process-engineer.md`
- 机械工程师：`.cursor/agents/belt-mechanical-engineer.md`
- 计算机工程师：`.cursor/agents/belt-computer-engineer.md`

首页：[`图纸库/00-首页.md`](./图纸库/00-首页.md)

## 原料采购清单

滚筒 / 托辊订单到手后，给采购用的交互页：[`原料采购/`](./原料采购/)

- 打开 `原料采购/index.html`，或 `cd 原料采购 && ./start.sh`
- 工艺裕量可调；部件手选手填；整批汇总钢管、圆钢、钢板、标准件

## UI 原型

见 [`ui-prototype/`](./ui-prototype/)：

- 打开 `ui-prototype/index.html` 即可预览五面板界面
- 或执行：

```bash
cd ui-prototype && python3 -m http.server 8080
```

PIDM 五面板是路径分类 / 张力计算原型，**不是**工程图标题栏标注工具。标注进库用图纸库模板勾选，约定见 [`图纸库/99-计算机/工程图标注.md`](./图纸库/99-计算机/工程图标注.md)。`.slddrw` 不进 Git。
