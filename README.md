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
| [`docs/silent-idler/FINAL_SCHEME.md`](./docs/silent-idler/FINAL_SCHEME.md) | **静音托辊推荐方案（最终版）** |
| [`docs/silent-idler/SILENT_SEAT_PRINCIPLE.md`](./docs/silent-idler/SILENT_SEAT_PRINCIPLE.md) | **静音轴承座原理纠正（示意图+说明）** |
| [`docs/silent-idler/COLOR_LEGEND.md`](./docs/silent-idler/COLOR_LEGEND.md) | **CAD 颜色对照** |
| [`docs/silent-idler/INNER_RACE_SHAFT.md`](./docs/silent-idler/INNER_RACE_SHAFT.md) | **内圈与轴能否隔离** |
| [`docs/silent-idler/COMPLETE_BEARING.md`](./docs/silent-idler/COMPLETE_BEARING.md) | **完整轴承半剖示意** |
| [`docs/silent-idler/IMPROVE_COMPETITOR.md`](./docs/silent-idler/IMPROVE_COMPETITOR.md) | 竞品静音托辊更静音改进（示意图+说明） |
| [`docs/silent-idler/EXISTING_SEAT_IMPROVE.md`](./docs/silent-idler/EXISTING_SEAT_IMPROVE.md) | **现有阻尼座能否改进（示意图+说明）** |
| [`docs/silent-idler/BEARING_IMPROVE.md`](./docs/silent-idler/BEARING_IMPROVE.md) | **绿色轴承隔振/降噪改进（示意图+说明）** |
| [`docs/silent-idler/GREEN_MUFFLER_IMPROVE.md`](./docs/silent-idler/GREEN_MUFFLER_IMPROVE.md) | 轴承隔音套改进（示意图+说明） |
| [`docs/silent-idler/OUTER_RACE_ISOLATOR.md`](./docs/silent-idler/OUTER_RACE_ISOLATOR.md) | 外圈—座隔振套改进（轴承画全） |
| [`docs/silent-idler/ISOLATOR_OPTIMIZE.md`](./docs/silent-idler/ISOLATOR_OPTIMIZE.md) | 隔振套减震优化（对着三版零件） |
| [`docs/silent-idler/DAMPER_SEAT_QUIETER.md`](./docs/silent-idler/DAMPER_SEAT_QUIETER.md) | 减震座更静音优化 |
| [`docs/silent-idler/GLOBAL_SILENT_PHILOSOPHY.md`](./docs/silent-idler/GLOBAL_SILENT_PHILOSOPHY.md) | **国外静音理念与可推翻路径** |
| [`docs/silent-idler/RIB_SEAT_DETAIL.md`](./docs/silent-idler/RIB_SEAT_DETAIL.md) | **减震筋/端面/座体细部** |
| [`docs/silent-idler/TWO_PARTS_ASSEMBLE.md`](./docs/silent-idler/TWO_PARTS_ASSEMBLE.md) | **减震座+轴承怎么装** |
| [`docs/silent-idler/INTEGRAL_SEAT_AXON.md`](./docs/silent-idler/INTEGRAL_SEAT_AXON.md) | **一体减震座轴测图** |
| [`docs/silent-idler/OVERALL_END_ASSEMBLY.md`](./docs/silent-idler/OVERALL_END_ASSEMBLY.md) | **端组整体效果示意** |
| [`docs/silent-idler/PHI159_AXIAL_LENGTHS.md`](./docs/silent-idler/PHI159_AXIAL_LENGTHS.md) | **Φ159 各段轴向长度** |
| [`docs/silent-idler/RIB_ANGLE_DEGREES.md`](./docs/silent-idler/RIB_ANGLE_DEGREES.md) | **减震筋周向角度** |
| [`docs/silent-idler/RED_SEAL_SOUND.md`](./docs/silent-idler/RED_SEAL_SOUND.md) | **红色密封能否隔音（示意图+说明）** |
| [`docs/silent-idler/RED_SEAL_IMPROVE.md`](./docs/silent-idler/RED_SEAL_IMPROVE.md) | **红色密封改进（示意图+说明）** |
| [`docs/silent-idler/DARK_BLUE_THERMAL.md`](./docs/silent-idler/DARK_BLUE_THERMAL.md) | **深蓝软件与热变形（示意图+说明）** |
| [`docs/silent-idler/INTEGRATED_DESIGN.md`](./docs/silent-idler/INTEGRATED_DESIGN.md) | 静音托辊完善版过程稿 |
| [`docs/silent-idler/CAD_OPTIMIZATION.md`](./docs/silent-idler/CAD_OPTIMIZATION.md) | 现 CAD 端部结构优化改法 |
| [`docs/silent-idler/LIP_SEAL_REDESIGN.md`](./docs/silent-idler/LIP_SEAL_REDESIGN.md) | 唇型密封改型（单外唇+迷宫） |
| [`docs/silent-idler/DESIGN.md`](./docs/silent-idler/DESIGN.md) | 静音托辊基础结构设计与示意图 |
| [`docs/silent-idler/REFERENCES.md`](./docs/silent-idler/REFERENCES.md) | 静音托辊方案依据与出处（标准/手册/厂商） |

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
