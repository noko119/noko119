# 皮带机 PIDM · UI 网页原型

## 页面

| 文件 | 用途 |
|------|------|
| `index.html` | SolidWorks 薄插件五面板（分类 / 点序 / 提取 / 审核 / 发送） |
| `path-editor.html` | **网页路径编辑器**：2D 操作 + 3D 操作，同一套 XYZ |

## 路径编辑器（定稿能力）

按 `docs/PROJECT_RULES.md` §3.1：

- **3D 操作**：透视观察、空间拖点改 XYZ、滚筒块放置
- **2D 俯视 XY**：平面拖拽改 X/Y
- **2D 侧视 XZ**：改坡度/高差（X/Z）
- **XYZ 表**：改坐标即时回写视图
- 导出 JSON（后续对接网页↔SW 契约）

## 本地打开

```bash
cd ui-prototype
python3 -m http.server 8080
```

- 五面板：`http://localhost:8080/`
- 路径编辑：`http://localhost:8080/path-editor.html`

> `path-editor.html` 使用 ES module + CDN Three.js，请用本地 HTTP 服务打开（勿直接 `file://`）。

## 说明

- 原型展示交互与数据流，不连接 SolidWorks，不执行真实计算。
- 分类口径按 DTⅡ 手册十二大项 + 细分。
