# SolidWorks 插件：皮带机路径（v0）

> **正式 C# Add-in 在 [`addin/`](addin/README.md)**：CommandManager 选项卡「DTⅡ 路径」，5 组 36 个按钮（按 DTⅡ(A) 手册反推，见 `docs/SW_PLUGIN_PATH_BUTTONS.md`），在 SW 里画路径、打标签、导出 `pidm.path.v0` 给网页计算。  
> 下文的 VBA 宏是早期"只读包画骨架"的验证版，保留备用。

---

# 附：VBA 宏骨架：读路径 JSON（v0）

> 配套：`SW_PACKAGE_READ_GUIDE.md`、`WEB_SW_DATA_CONTRACT_DRAFT.md`

---

## 1. 目标（本骨架做到什么）

| 做 | 不做（二期） |
|----|--------------|
| 选文件读 `pidm.path.v0` | HTTP 拉取 |
| 校验 schema / closure.error | 完整 UI 面板 |
| 在当前装配建/更新 3D 草图折线 `PIDM_PATH_SKEL` | 自动插设计库滚筒块 |
| 节点坐标 **米（API 同为米）**，Z-up | Y-up 坐标变换 |
| 写出映射旁路 JSON（node.id → 草图点名） | 完整 extract 回传 |

---

## 2. 推荐落地路径

```text
阶段 A（现在）  VBA 宏：读 JSON → 画骨架折线
阶段 B          VBA/插件：插滚筒块 + 写 PIDM_* 属性
阶段 C          C# Add-in：五面板 UI + 与 Web 同账号
```

仓库文件：

| 路径 | 说明 |
|------|------|
| `sw-plugin/README.md` | 本说明 |
| `sw-plugin/PSEUDOCODE.md` | 语言无关伪代码（C# 可直接照搬） |
| `sw-plugin/vba/PidmPathImport.bas` | VBA 宏源码 |
| `sw-plugin/samples/demo-path-v0.json` | 最小样例路径包 |

---

## 3. VBA 安装步骤（SW2024）

1. 打开目标装配（**Z 向上**）  
2. 工具 → 宏 → 新建 → 保存为 `PidmPathImport.swp`  
3. 编辑：删除默认空模块，**导入** `sw-plugin/vba/PidmPathImport.bas`  
   （或把 `.bas` 内容粘贴进模块）  
4. 运行宏：`PidmImportPathFromJson`  
5. 在弹出框中粘贴 JSON 完整路径（SolidWorks VBA 无 Office 文件对话框）  
   例如：`D:\...\sw-plugin\samples\demo-path-v0.json`  
6. 检查特征树是否出现草图 **`PIDM_PATH_SKEL`**，折线点是否与 Web 一致  

若 JSON 解析失败：确认文件为 UTF-8，且 `schema` 为 `pidm.path.v0`（或 bundle 内含 `path`）。  
读文件优先用 `ADODB.Stream`（UTF-8）；若系统无 ADODB，回退为系统默认码页（样例 JSON 为纯 ASCII 仍可）。

---

## 4. 单位与坐标

| Web | SolidWorks API 草图 |
|-----|---------------------|
| m | **m（不要 ×1000）** |
| Z_up_right | 装配 Z 向上，不变换 |

> 注意：SW 界面常显示 mm，但 `SketchManager.CreatePoint/CreateLine` 的 API 单位是米。  
> 若错误 ×1000，骨架会放大 1000 倍。

---

## 5. 验收（阶段 A）

- [ ] 能选到 JSON 并提示节点数  
- [ ] `closure` 有 error 时宏中止并列出错误码  
- [ ] 草图 `PIDM_PATH_SKEL` 点序 = `nodes[].seq`  
- [ ] 样例文件首尾点坐标正确（见 sample 注释）  
- [ ] 再跑一次宏：更新同一草图，不复制第二套线  

---

## 6. 下一步（你本地做完 A 后）

1. 设计库块属性按契约 §5 打好 `PIDM_*`  
2. 在宏里按 `type` 插入块（阶段 B）  
3. 需要时把本伪代码迁到 C# Add-in  

---

## 修订记录

| 日期 | 说明 |
|------|------|
| 2026-09-11 | 首版：伪代码 + VBA 读包画骨架 |
| 2026-09-11 | 修：去掉非法空数组 ReDim、Office FileDialog、TypeName 冲突；草图重命名改找 3DProfileFeature；API 单位说明 |
