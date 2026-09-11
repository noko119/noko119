# 皮带机 PIDM · UI 网页原型

## 页面

| 文件 | 用途 |
|------|------|
| `index.html` | SolidWorks 薄插件五面板（分类 / 点序 / 提取 / 审核 / 发送） |
| `path-editor.html` | **网页路径编辑器**：2D + 3D，导出 `pidm.path.v0` + 闭环检查 |
| `calc.html` | **逐步透明计算**：GC-01 主链对照（DTII-P2P-v0.2） |

## 路径编辑器（定稿能力）

按 `docs/PROJECT_RULES.md` §3.1：

- **3D 操作**：透视观察、空间拖点改 XYZ、滚筒块放置
- **2D 俯视 XY**：平面拖拽改 X/Y
- **2D 侧视 XZ**：改坡度/高差（X/Z）
- **XYZ 表**：改坐标即时回写视图
- 导出 `pidm.path.v0`（含 segments / point_order / closure）

## 计算原型

- 引擎：`calc/dtii-engine.js`（**1:1 / 2:1 / 1:2** 双驱配比）
- 锚定算例：`calc/gc01-case.js`（**v1 唯一黄金算例 GC-01**）
- 每步可展开：输入 → 公式 → 中间值 → 结果；并与期望对照
- SW 读包：见仓库 `docs/SW_PACKAGE_READ_GUIDE.md`

## 本地打开

```bash
cd ui-prototype
python3 -m http.server 8080
```

冒烟回归：

```bash
node smoke-test.mjs
```

- 五面板：`http://localhost:8080/`
- 路径编辑：`http://localhost:8080/path-editor.html`
- 计算：`http://localhost:8080/calc.html`

> 请用本地 HTTP 服务打开（勿直接 `file://`）。

## 说明

- 原型展示交互与数据流，不连接 SolidWorks。
- 分类口径按 DTⅡ 手册十二大项 + 细分。
- GC-01 主链已可本地回归。
