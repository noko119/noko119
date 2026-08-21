# 皮带机 PIDM

SolidWorks 皮带机路径分类提取 → 网页逐点张力计算（架构与 UI 原型）。

## 生产线部件选型（3.10 / 3.11 / 3.12）

托辊加工线中间物流、机械手上料、智能料仓的导轨 / 气缸 / 伺服 / 导向 / 型钢 / 四缸选型：[`生产线选型/`](./生产线选型/)

```bash
cd 生产线选型 && ./start.sh
```

四工种身份：`.cursor/agents/line-*-engineer.md`

## UI 原型

见 [`ui-prototype/`](./ui-prototype/)：

- 打开 `ui-prototype/index.html` 即可预览五面板界面
- 或执行：

```bash
cd ui-prototype && python3 -m http.server 8080
```
