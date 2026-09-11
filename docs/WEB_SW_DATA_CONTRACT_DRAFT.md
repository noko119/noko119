# 网页 ↔ SolidWorks 数据契约（草稿 v0）

> 状态：**设计草稿 v0，待产品主设确认**  
> 包格式：JSON（UTF-8）  
> 主 Schema：`pidm.bundle.v0`  
> 内含：`pidm.path.v0` + `pidm.extract.v0` + 版本元数据

---

## 1. 真相源（再声明）

| 数据 | 写入方 | 权威 |
|------|--------|------|
| 业务路径（节点/区段分类意图） | Web | Web 录入为先 |
| 路径几何提取（L/H/δ/Ln/点序） | Web | **Web 必须正确提取**，可直接驱动计算（`source=web_path`） |
| 装配核对 / 模型专有量 | SW | SW 回传后可升 `geometry_version` 并复算；与 Web 冲突以核对规则解决 |
| 计算结果 | Web 计算服务 | Web |
| 字典 major/sub | 共用 | `DTII_SEGMENT_DICTIONARY.md` |

禁止：网页与 SW 各存一套互不同步的路径坐标当正式版。

---

## 2. 包结构 `pidm.bundle.v0`

```json
{
  "schema": "pidm.bundle.v0",
  "bundle_id": "b_20260911_001",
  "project_id": "p_xxx",
  "line_id": "line_xxx",
  "versions": {
    "schema": "pidm.bundle.v0",
    "path_schema": "pidm.path.v0",
    "geometry": "G12",
    "coeff": "coeff-v0",
    "algorithm": "DTII-P2P-v0.1"
  },
  "direction": "web_to_sw",
  "path": { },
  "extract": { },
  "calc_ref": {
    "calc_id": null,
    "status": "not_run"
  },
  "audit": {
    "closure_ok": false,
    "errors": [],
    "warnings": []
  }
}
```

### 方向

| direction | 含义 |
|-----------|------|
| `web_to_sw` | Web 下发路径，SW 生成/更新骨架 |
| `sw_to_web` | SW 上传提取结果，Web 可复算 |

---

## 3. Web → SW：`path` 载荷

复用 `PATH_INPUT_FIELD_SCHEMA.md` 的 `line/nodes/segments/point_order`。

SW 插件职责：

1. 校验 schema + closure（error 则拒绝写入）  
2. 在约定装配下创建/更新 **总骨架草图**（Z-up 与 Web 一致或按映射表转换）  
3. 按节点插入/更新 **滚筒草图块**（`sw_block_id` / 类型+ D）  
4. 区段写入属性：`major_id`,`sub_id`,`name_tree`  
5. 回写本地映射表：`node.id ↔ SW 草图点/块实例`

### 坐标系

| 项 | 约定 |
|----|------|
| Web | `Z_up_right`，单位 m |
| SW | 默认与模板装配一致；若模板为 Y-up，插件内做一次固定变换并在 bundle 记录 `axis_map` |

```json
"axis_map": {
  "web": "Z_up_right",
  "sw": "Y_up_right",
  "map": "x->x, y->-z, z->y"
}
```

v0 推荐：SW 测试装配直接采用 **Z 向上**，`axis_map=identity`，减少错。

---

## 4. SW → Web：`extract` 载荷 `pidm.extract.v0`

| 字段 | 类型 | 说明 |
|------|------|------|
| geometry_version | string | 如 G13，每次成功提取递增 |
| extracted_at | iso8601 | |
| segments[] | array | 见下 |
| drums[] | array | 见下 |
| point_order | object | 确认后的张力点序 |
| raw_refs | object | SW 文件路径、配置名等（可选） |

### extract.segments[]

| 字段 | 说明 |
|------|------|
| path_segment_id | 对应 path.segments.id |
| L_m, delta_deg, H_m | 提取几何 |
| a_idler_m | 托辊间距 |
| R_m, theta_deg | 弧段 |
| major_id, sub_id | 分类（可与 path 核对） |
| completeness | complete/partial |
| sw_feature_name | 模型树名 |

### extract.drums[]

| 字段 | 说明 |
|------|------|
| path_node_id | |
| D_mm | |
| type | drive/bend/takeup/… |
| drive_role | main/aux/none |
| wrap_angle_deg | |
| center_xyz_m | 提取中心点 |
| sw_instance | 块实例名 |

---

## 5. 滚筒草图块属性规范（SW 设计库）

写入块自定义属性（名称固定，大小写敏感）：

| 属性名 | 示例 | 说明 |
|--------|------|------|
| PIDM_TYPE | drive | tail/head/drive/bend/takeup |
| PIDM_D_MM | 630 | 直径 mm |
| PIDM_DRIVE_ROLE | main | main/aux/none |
| PIDM_BLOCK_ID | DRUM_D630_DRIVE | 库内唯一 |
| PIDM_STD_CODE | 140B307 | 可选手册图号 |

块坐标系：

- 原点：滚筒轴线中点（或与胶带中心线交点，**模板内统一**）  
- X：沿线前进方向（约定）  
- Z：竖直向上（若装配 Z-up）

---

## 6. 点序同步

| 步骤 | 谁 |
|------|----|
| Web 指定奔离点、手定1/2 | Web |
| SW 高亮确认/微调 | SW |
| 自动生成其余张力点 | SW 或 Web（同一算法库，**优先 Web 算法、SW 只读显示**） |
| 回传 `point_order` | SW → Web（若在 SW 改过） |

冲突：以 **更新时间 + geometry_version** 解决；正式冻结后 SW 改几何必须升版本。

---

## 7. API 草图（Web，后期实现）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/bundles` | 创建 bundle |
| GET | `/api/bundles/{id}` | 拉取 |
| POST | `/api/bundles/{id}/to-sw` | 标记下发 |
| POST | `/api/bundles/{id}/from-sw` | 插件上传 extract |
| POST | `/api/calc/run` | 绑定 bundle 版本计算 |

插件侧可先 **文件交换**（导出/导入 JSON），不挡 M1–M3。

---

## 8. 版本与冻结

正式计算必须写入 `versions` 四元组。  
冻结后：

- 不得覆盖原 `calc_id` 结果  
- 几何变更 → `geometry` 递增 → 新计算  

---

## 9. 决议 / 仍可细化

**已确认（2026-09-11）：** SW 测试装配采用 **Z-up**，与 Web `Z_up_right` 一致，`axis_map=identity`。

仍可细化（不挡实现）：

1. 块原点定义：轴线中点 vs 带面切点（v0 先按轴线中点）  
2. 首期交换用文件还是 HTTP（v0 先文件 JSON）

---

## 修订记录

| 日期 | 说明 |
|------|------|
| 2026-09-11 | v0 契约草稿 |
