# 皮带机 PIDM

**产品形态（已定规则）：网页主应用 + SolidWorks 薄插件。**

- 网页：订阅获客、路径录入（**2D + 3D 双操作**）、逐点张力/功率计算、报告冻结
- SW 薄插件：路径同步成骨架、DTⅡ分类、点序、几何提取、回传

## 文档

| 文档 | 说明 |
|------|------|
| [`docs/PROJECT_RULES.md`](./docs/PROJECT_RULES.md) | 强制产品规则 |
| [`docs/DESIGN_OVERVIEW.md`](./docs/DESIGN_OVERVIEW.md) | **设计总览 / MVP 里程碑** |
| [`docs/DTII_SEGMENT_DICTIONARY.md`](./docs/DTII_SEGMENT_DICTIONARY.md) | DTⅡ 十二大项字典 |
| [`docs/PATH_INPUT_FIELD_SCHEMA.md`](./docs/PATH_INPUT_FIELD_SCHEMA.md) | 路径字段与闭环检查 |
| [`docs/WEB_SW_DATA_CONTRACT_DRAFT.md`](./docs/WEB_SW_DATA_CONTRACT_DRAFT.md) | 网页↔SW 契约 |
| [`docs/SW_PACKAGE_READ_GUIDE.md`](./docs/SW_PACKAGE_READ_GUIDE.md) | **SW 读包/回写操作说明** |
| [`sw-plugin/`](./sw-plugin/) | **SW VBA 读 JSON 骨架**（伪代码 + 宏 + 样例） |
| [`docs/DEFAULT_COEFFICIENTS_V0.md`](./docs/DEFAULT_COEFFICIENTS_V0.md) | 默认系数 + GC-01 锚定 |
| [`docs/WEB_TOOL_MATERIALS_CHECKLIST.md`](./docs/WEB_TOOL_MATERIALS_CHECKLIST.md) | 材料准备表 |
| [`docs/golden-cases/GC-01_blast_furnace_feeder.md`](./docs/golden-cases/GC-01_blast_furnace_feeder.md) | 黄金算例 |

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

| 页面 | 说明 |
|------|------|
| `index.html` | SW 薄插件五面板（分类/点序/提取/审核/发送） |
| `path-editor.html` | **路径编辑器**：2D↔3D，导出 `pidm.path.v0` |
| `calc.html` | **逐步透明计算**：对齐 GC-01 |

本地预览：

```bash
cd ui-prototype && python3 -m http.server 8080
```

- 五面板：`http://localhost:8080/`
- 路径编辑：`http://localhost:8080/path-editor.html`
- 计算：`http://localhost:8080/calc.html`
