# 锥管模具 SolidWorks 桥接（v0）

> **网页工具仍是主入口，不会替换。** 计算、分段、示意图继续用  
> `ui-prototype/thread-calc/cone-mold.html`（及 `cone-mold-online.html` / `锥管模具分段.html`）。  
> 本目录只是可选桥接：网页点「导出 SW JSON」→ SW 宏读入建模。

> 配套网页：`ui-prototype/thread-calc/cone-mold.html`（「导出 SW JSON」）  
> 本目录：**先用 VBA 宏读包旋转成实体**；螺纹/止口细节与 C# Add-in 二期再做。

---

## 1. 目标（本骨架做到什么）

| 做 | 不做（二期） |
|----|--------------|
| 读 `cone.mold.v0` JSON | HTTP / 账号同步 |
| 校验 `schema` / `ok` | 完整 UI 面板 |
| 新建零件：内锥实心旋转体 + 各外套薄壁旋转体（多实体） | 接头螺纹、止口、退刀槽特征 |
| Web **mm** → SW API **米（÷1000）**，`Y_up_top_origin` | 装配约束 / 分零件保存 |

---

## 2. 落地路径

```text
阶段 A（现在）  网页导出 JSON + VBA：旋转内锥与外套
阶段 B          VBA：按 joints[] 切螺纹/止口草图
阶段 C          C# Add-in：属性面板 + 一键更新
```

| 路径 | 说明 |
|------|------|
| `sw-plugin/cone-mold/README.md` | 本说明 |
| `sw-plugin/cone-mold/PSEUDOCODE.md` | 语言无关伪代码 |
| `sw-plugin/cone-mold/vba/ConeMoldImport.bas` | VBA 宏 |
| `sw-plugin/cone-mold/samples/demo-cone-mold-v0.json` | 默认方案样例 |

---

## 3. 网页导出

1. 打开锥管模具工具，点「生成方案」  
2. 点「导出 SW JSON」→ 下载 `cone-mold-v0-*.json`  
3. 或用本目录 `samples/demo-cone-mold-v0.json` 做离线试跑  

导出字段由 `exportConeMoldSwPackage()`（`cone-mold-math.js`）生成。

---

## 4. VBA 安装（SW2020+）

1. SolidWorks：工具 → 宏 → 新建 → 保存为 `ConeMoldImport.swp`  
2. 编辑：删除默认空模块，**导入** `vba/ConeMoldImport.bas`  
3. 运行宏：`ConeMoldImportFromJson`  
4. 在输入框粘贴 JSON **完整路径**（SW VBA 无 Office 文件对话框）  
   例：`D:\...\sw-plugin\cone-mold\samples\demo-cone-mold-v0.json`  
5. 特征树应出现内锥旋转体 + 若干外套薄壁旋转体  

读文件优先 `ADODB.Stream`（UTF-8）；无 ADODB 时回退系统码页（样例为 ASCII 数字仍可）。

---

## 5. 单位与坐标

| Web 包 | SolidWorks API |
|--------|----------------|
| `unit: "mm"` | 草图/特征坐标 = **米** → 全部 ÷1000 |
| `coord: "Y_up_top_origin"` | 原点在模具**顶面中心**，+Y 向上，顶→底为 −Y |

界面常显示 mm，但 `CreateLine` / `FeatureRevolve2` 的 API 单位是米。若忘记 ÷1000，零件会放大 1000 倍。

---

## 6. 验收（阶段 A）

- [ ] 网页能导出且 `schema === "cone.mold.v0"`  
- [ ] 宏能读样例并提示套数  
- [ ] 内锥顶/底直径、总高与 JSON 一致（允许显示圆整）  
- [ ] 外套段数 = `sleeveCount`，外径与 `sleeves[].outerOd` 对应  
- [ ] 坐标系：顶面在 Y=0 附近，底端在 −Y  

---

## 7. 下一步

1. 按 `joints[]` 在对接面加螺纹大径/止口/退刀槽  
2. 可选：每套外套另存为独立零件再装配  
3. 需要时把 `PSEUDOCODE.md` 迁到 C# Add-in  

---

## 修订记录

| 日期 | 说明 |
|------|------|
| 2026-09-19 | 首版：网页导出 + VBA 旋转内锥/外套 |
