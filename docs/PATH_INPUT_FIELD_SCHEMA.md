# 路径录入字段总表（PATH Schema v0）

> 状态：**设计草稿 v0，待产品主设确认**  
> Schema ID：`pidm.path.v0`  
> 原则：2D/3D/表格 **共用同一套节点 XYZ**；单位默认 **m / ° / mm（注明）**

---

## 1. 对象层次

```text
Project
  └── BeltLine（一条皮带机方案）
        ├── LineParams（整线参数）
        ├── Nodes[]（节点 / 滚筒）
        ├── Segments[]（区段：node_i → node_{i+1}）
        ├── PointOrder（张力点序）
        └── ClosureReport（闭环检查结果）
```

运行方向：默认沿 `Nodes` 数组顺序；回程可由 Auto Return 生成或手工录入（v0 手工+后续 Auto Return）。

---

## 2. 整线参数 `LineParams`

| 字段 | 类型 | 必填 | 单位 | 说明 |
|------|------|------|------|------|
| line_id | string | ✓ | — | 方案内唯一 |
| name | string | ✓ | — | 显示名 |
| Q | number | ✓ | t/h | 输送量 |
| rho | number | ✓ | kg/m³ | 松散密度 |
| B | number | ✓ | mm | 带宽 |
| v | number | ✓ | m/s | 带速 |
| material_size_max | number | | mm | 粒度上限 |
| repose_angle | number | | ° | 静堆积角 |
| Ln | number | | m | 水平机长（可算可填） |
| H | number | | m | 提升高度（可算可填） |
| a0_default | number | ✓ | m | 默认上托辊间距 |
| aU_default | number | ✓ | m | 默认下托辊间距 |
| trough_angle | number | | ° | 托辊槽角 λ |
| idler_diameter | number | | mm | 托辊直径 |
| belt_type | string | | — | 如 St2000 |
| cover_top_mm | number | | mm | 上胶厚 |
| cover_bot_mm | number | | mm | 下胶厚 |
| coord_system | string | ✓ | — | 固定 `Z_up_right`（Z 向上，右手系） |
| length_unit | string | ✓ | — | 固定 `m` |

---

## 3. 节点 `Node`

| 字段 | 类型 | 必填 | 单位 | 说明 |
|------|------|------|------|------|
| id | string | ✓ | — | 稳定 UUID/短码 |
| seq | int | ✓ | — | 几何顺序 1…n（路径序，非张力序） |
| x, y, z | number | ✓ | m | 空间坐标 |
| type | enum | ✓ | — | `node\|tail\|head\|drive\|bend\|takeup` |
| label | string | | — | 显示名 |
| drum_D_mm | number | 条件 | mm | 滚筒类必填 |
| wrap_angle_deg | number | | ° | 包角 φ（传动/增面） |
| friction_mu | number | | — | 滚筒与带摩擦系数 μ |
| drive_role | enum | 条件 | — | `main\|aux\|none`；传动必填 |
| is_main_drive | bool | | — | 主驱标记；全线至多 1 个 true |
| takeup_kind | enum | 条件 | — | `gravity\|car\|screw` |
| takeup_travel_m | number | | m | 拉紧行程 |
| sw_block_id | string | | — | 对应设计库块名/图号 |
| props | object | | — | 扩展属性袋 |

**条件必填：**

- `type in (drive,bend,takeup,tail,head)` → `drum_D_mm`  
- `type=drive` → `drive_role`，且全局恰好一个 `main`

---

## 4. 区段 `Segment`

连接 `from_node_id` → `to_node_id`（通常相邻 seq）。

| 字段 | 类型 | 必填 | 单位 | 说明 |
|------|------|------|------|------|
| id | string | ✓ | — | |
| from_node_id | string | ✓ | — | |
| to_node_id | string | ✓ | — | |
| major_id | string | ✓ | — | 字典大项，如 `carryI` |
| sub_id | string | ✓ | — | 如 `carryI.1` |
| branch | enum | ✓ | — | `carry\|return` |
| L | number | ✓* | m | 段长；*可自 XYZ 计算后确认 |
| delta_deg | number | | ° | 倾角 δ |
| H | number | | m | 高差（to.z−from.z） |
| a_idler | number | | m | 本段托辊间距（空则用默认） |
| R | number | 条件 | m | 凸/凹弧半径 |
| theta_deg | number | 条件 | ° | 圆心角 |
| skirt_length_m | number | | m | 导料槽长等 |
| flags | string[] | | — | 如 `loading`,`cleaning` |
| classify_status | enum | ✓ | — | `draft\|confirmed` |
| extract_status | enum | ✓ | — | `empty\|partial\|complete\|stale` |
| name_tree | string | | — | 模型树名缓存 |

**计算派生（只读，可缓存）：**

- `L_calc = ‖P_to − P_from‖`  
- `H_calc = z_to − z_from`  
- `delta_calc = atan2(H, √(dx²+dy²))`

用户确认后写入 `L/H/delta_deg`；若 XYZ 变则 `extract_status=stale`。

---

## 5. 张力点序 `PointOrder`

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| leave_point_node_id | string | ✓ | 奔离点，对应张力点 **S1** |
| manual_p1_node_id | string | ✓ | 手定特性点1（可与奔离点同一） |
| manual_p2_node_id | string | ✓ | 手定特性点2 |
| auto_points | array | | `{ tension_index, node_id\|segment_side, note }` |
| direction | enum | ✓ | `running_dir` 沿运行方向累加 |

**规则（v0）：**

1. 用户指定点 1、点 2；其余按运行方向自动编号  
2. 主传动奔离点强制映射为张力序号 1  
3. 同一几何点两侧张力可用 `S_i` / `S_{i+1}` 区分趋入/奔离（契约用 `side: approach\|leave`）

---

## 6. 闭环检查 `ClosureChecks`（发送/计算前门禁）

| 检查码 | 级别 | 规则 |
|--------|------|------|
| CL_LOOP | error | 路径在业务上闭环（头尾逻辑闭合或显式开式输送已声明） |
| CL_NODES_MIN | error | 节点数 ≥ 3 |
| CL_SEG_CLASS | error | 每段已选 major/sub 且 confirmed |
| CL_XYZ_FINITE | error | 所有 XYZ 为有限数 |
| CL_MAIN_DRIVE | error | 主驱动恰好 1 个 |
| CL_LEAVE_IS_S1 | error | 奔离点已设且 = 张力点1 |
| CL_P1_P2 | error | 手定1、2 已设 |
| CL_DRUM_D | error | 滚筒节点有 D |
| CL_ARC_R | error | 凸凹弧段有 R、θ |
| CL_STALE | warn | 无 stale 提取；有则警告不可正式冻结 |
| CL_SCHEMA | error | 通过 schema 校验 |

`error` 阻止正式计算冻结与「发送 SW」；`warn` 可演示模式继续。

---

## 7. JSON 外形（示意）

```json
{
  "schema": "pidm.path.v0",
  "line": {
    "line_id": "demo-01",
    "name": "示例坡道",
    "Q": 1700,
    "rho": 1800,
    "B": 1400,
    "v": 2,
    "a0_default": 1.2,
    "aU_default": 3.0,
    "coord_system": "Z_up_right",
    "length_unit": "m"
  },
  "nodes": [
    {
      "id": "n1",
      "seq": 1,
      "x": 0,
      "y": 0,
      "z": 0,
      "type": "tail",
      "drum_D_mm": 630
    }
  ],
  "segments": [],
  "point_order": {
    "leave_point_node_id": "n_drive",
    "manual_p1_node_id": "n_drive",
    "manual_p2_node_id": "n2",
    "direction": "running_dir"
  },
  "closure": { "ok": false, "items": [] }
}
```

---

## 8. 与编辑器现状差距（实现任务）

当前 `path-editor` 导出仅有 nodes 列表。M1 需补：

- segments 自动生成 + 分类字段  
- line 参数面板  
- point_order 面板  
- closure 检查按钮  
- schema 升为 `pidm.path.v0` 完整包

---

## 修订记录

| 日期 | 说明 |
|------|------|
| 2026-09-11 | v0 字段总表 + 闭环检查码 |
