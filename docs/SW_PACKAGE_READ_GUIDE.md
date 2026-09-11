# SolidWorks 读包说明（v0）

> 状态：实现指引 v0（与 `WEB_SW_DATA_CONTRACT_DRAFT.md` 配套）  
> 目标：插件（或人工）能从 Web 导出的 JSON **读入 → 建/更新骨架 → 回写提取包**  
> 坐标系：**Z 向上**（已确认）

---

## 1. 你要准备什么（本地）

| 项 | 要求 |
|----|------|
| SolidWorks | 建议 2024 |
| 测试装配 | 空装配或皮带机总装模板，**Z 向上** |
| 设计库 | 滚筒草图块（尾/头/传动/改向/拉紧），属性见 §4 |
| 交换方式 | v0：**文件 JSON**（先不用 HTTP） |

推荐目录（可自定）：

```text
D:\PIDM_exchange\
  inbox\     Web → SW 下发包
  outbox\    SW → Web 提取包
  archive\   历史版本
```

---

## 2. Web 导出什么文件

### 2.1 路径包（最小可读）

路径编辑器导出：`pidm-path-v0.json`（schema `pidm.path.v0`）

关键字段：

```json
{
  "schema": "pidm.path.v0",
  "line": { "line_id": "...", "name": "...", "coord_system": "Z_up_right" },
  "nodes": [
    {
      "id": "n1",
      "seq": 1,
      "x": 0, "y": 0, "z": 0,
      "type": "tail",
      "drum_D_mm": 630,
      "is_main_drive": false
    }
  ],
  "segments": [
    {
      "id": "seg_1",
      "from_node_id": "n1",
      "to_node_id": "n2",
      "major_id": "carryI",
      "sub_id": "carryI.1",
      "L": 80.0,
      "delta_deg": 10.4,
      "H": 14.5,
      "classify_status": "draft"
    }
  ],
  "point_order": {
    "leave_point_node_id": "n_drive",
    "manual_p1_node_id": "n_drive",
    "manual_p2_node_id": "n2",
    "direction": "running_dir"
  },
  "closure": { "ok": true, "items": [] }
}
```

### 2.2 完整交换包（推荐联调）

schema：`pidm.bundle.v0`（见契约文档）

```json
{
  "schema": "pidm.bundle.v0",
  "bundle_id": "b_20260911_001",
  "direction": "web_to_sw",
  "versions": {
    "path_schema": "pidm.path.v0",
    "geometry": "G0",
    "coeff": "coeff-v0",
    "algorithm": "DTII-P2P-v0.2"
  },
  "path": { },
  "extract": { },
  "audit": { "closure_ok": true, "errors": [], "warnings": [] }
}
```

v0 可先只放 `path`，`extract` 留空对象。

---

## 3. SW 读包步骤（插件或人工清单）

### A. 打开 / 校验

1. 读取 JSON（UTF-8）  
2. 检查 `schema` 是否为 `pidm.path.v0` 或 bundle 内 `path`  
3. 检查 `closure.ok`：  
   - `false` 且存在 `level=error` → **拒绝写入**，弹出 `items[]`  
   - 仅 `warn` → 可继续，但标记“非正式”  
4. 确认 `line.coord_system` / `axis_map`：v0 期望 **Z_up + identity**

### B. 写入总骨架

1. 在约定装配下找或建草图：`PIDM_PATH_SKEL`（名称固定）  
2. 按 `nodes[].seq` 顺序写 3D 草图折线点：`(x,y,z)` 单位 **米**（SW API 亦为米，**不要 ×1000**）  
3. 删除/更新旧点，避免双真相：以本次 `nodes[].id` 映射表为准  
4. 可用仓库宏：`sw-plugin/vba/PidmPathImport.bas`（见 `sw-plugin/README.md`）  

映射表建议存装配属性或旁路 JSON：

| Web node.id | SW 草图点名 / 实体 ID |
|-------------|----------------------|
| n1 | PIDM_N_n1 |

### C. 插入 / 更新滚筒块

对 `type ∈ {tail,head,drive,bend,takeup}`：

1. 按 `sw_block_id` 或 `type + drum_D_mm` 匹配设计库块  
2. 插入到节点坐标，轴线方向：默认沿相邻段切向（v0 可先垂直于路径平面法向约定）  
3. 写入块属性（§4）  
4. `is_main_drive=true` 的 drive：**全局唯一**，属性 `PIDM_DRIVE_ROLE=main`

### D. 区段属性

对每个 `segments[]`：

- 在对应草图线段（或派生特征）写：  
  `PIDM_MAJOR` / `PIDM_SUB` / `PIDM_SEG_ID` / `PIDM_NAME_TREE`  
- `classify_status=draft` 时在模型树加前缀 `?_` 提示未确认（可选）

### E. 点序

1. 读取 `point_order.leave_point_node_id` → 张力点 **S1**  
2. 高亮手定 p1/p2  
3. 其余点可暂不自动编号（v0）；编号算法优先在 Web

---

## 4. 滚筒块属性（必须）

| 属性名 | 示例 | 说明 |
|--------|------|------|
| PIDM_TYPE | drive | tail/head/drive/bend/takeup |
| PIDM_D_MM | 630 | 直径 mm |
| PIDM_DRIVE_ROLE | main | main/aux/none |
| PIDM_BLOCK_ID | DRUM_D630_DRIVE | 库内唯一 |
| PIDM_NODE_ID | n5 | 回写映射用 |
| PIDM_STD_CODE | 140B307 | 可选 |

块原点：轴线中点；Z：竖直向上。

---

## 5. SW → Web 回写（extract）

成功提取后写 `outbox/pidm-extract-v0.json`：

```json
{
  "schema": "pidm.extract.v0",
  "geometry_version": "G1",
  "extracted_at": "2026-09-11T12:00:00+08:00",
  "segments": [
    {
      "path_segment_id": "seg_1",
      "L_m": 80.12,
      "delta_deg": 10.41,
      "H_m": 14.48,
      "a_idler_m": 1.2,
      "major_id": "carryI",
      "sub_id": "carryI.1",
      "completeness": "complete",
      "sw_feature_name": "01_carryI_carryI.1"
    }
  ],
  "drums": [
    {
      "path_node_id": "n5",
      "D_mm": 800,
      "type": "drive",
      "drive_role": "main",
      "wrap_angle_deg": 210,
      "center_xyz_m": [260, 0, 57],
      "sw_instance": "DRUM_DRIVE_MAIN-1"
    }
  ],
  "point_order": {
    "leave_point_node_id": "n5",
    "manual_p1_node_id": "n5",
    "manual_p2_node_id": "n2",
    "direction": "running_dir"
  }
}
```

规则：

- 每次成功提取：`geometry_version` 递增（G1→G2…）  
- Web 收到后可复算；正式冻结绑定该几何版本  

---

## 6. 验收清单（联调通过标准）

- [ ] Web 导出路径 JSON，`closure` 无 error  
- [ ] SW 读入后骨架点 XYZ 与 Web 一致（mm 换算正确）  
- [ ] 主驱动块有且仅有 1 个 `PIDM_DRIVE_ROLE=main`  
- [ ] 区段 `major/sub` 能在模型树或属性中看到  
- [ ] 提取包 `segments[].L_m` 与骨架长度误差 < 约定阈值（建议 0.05 m）  
- [ ] 改 Web 一点坐标再下发，SW 更新而非复制第二套线  

---

## 7. 常见错误

| 现象 | 原因 | 处理 |
|------|------|------|
| 坡度反了 / 高差错 | 装配 Y-up 却当 Z-up | 改 Z-up 或写 `axis_map` |
| 双主驱 | 两块都写了 main | 读包时强制唯一 |
| 点乱序 | 未按 `seq` | 严格按 seq 建折线 |
| 单位差 1000 倍 | 误把 API 米当成毫米再 ×1000 | Web=m，SW API=m；界面显示 mm 勿混淆 |
| 宏找不到 | 未导入 .bas | 见 `sw-plugin/README.md` |
| 拒绝写入 | closure error | 先在 Web 点「闭环检查」 |

---

## 8. 与计算页的关系

- 路径包只负责几何与分类意图  
- 张力/功率在 Web `calc.html`（GC-01 回归）  
- SW **不**在 v0 内嵌整套 DTⅡ 计算内核  

---

## 修订记录

| 日期 | 说明 |
|------|------|
| 2026-09-11 | 首版：文件交换读包/写骨架/提取回传说明 |
