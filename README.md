# 皮带机 PIDM

SolidWorks 皮带机路径分类提取 → 网页逐点张力计算（架构与 UI 原型）。

## UI 原型

见 [`ui-prototype/`](./ui-prototype/)：

- 打开 `ui-prototype/index.html` 即可预览五面板界面
- 或执行：

```bash
cd ui-prototype && python3 -m http.server 8080
```

## DTII(A) 托辊选型计算页

见 [`dtii-roller-calc/`](./dtii-roller-calc/)：

- 打开 `dtii-roller-calc/index.html` 即可即时计算
- 或执行：

```bash
cd dtii-roller-calc && ./start.sh
```

### Firebase 联网部署

纯前端，可用 Firebase Hosting 部署后手机/电脑联网动态计算。步骤见 [`dtii-roller-calc/FIREBASE.md`](./dtii-roller-calc/FIREBASE.md)。
