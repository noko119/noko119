# 皮带机 PIDM

**产品形态（已定规则）：网页主应用 + SolidWorks 薄插件。**

- 网页：订阅获客、路径录入（**2D + 3D 双操作**）、逐点张力/功率计算、报告冻结
- SW 薄插件：路径同步成骨架、DTⅡ分类、点序、几何提取、回传

详细强制规则见：[`docs/PROJECT_RULES.md`](./docs/PROJECT_RULES.md)

网页工具材料准备表：[`docs/WEB_TOOL_MATERIALS_CHECKLIST.md`](./docs/WEB_TOOL_MATERIALS_CHECKLIST.md)

## UI 原型

见 [`ui-prototype/`](./ui-prototype/)：

| 页面 | 说明 |
|------|------|
| `index.html` | SW 薄插件五面板（分类/点序/提取/审核/发送） |
| `path-editor.html` | **网页路径编辑器**：2D 操作 ↔ 3D 操作，XYZ 表联动 |

本地预览：

```bash
cd ui-prototype && python3 -m http.server 8080
```

- 五面板：`http://localhost:8080/`
- 路径编辑：`http://localhost:8080/path-editor.html`
