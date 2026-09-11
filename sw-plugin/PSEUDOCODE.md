# PIDM SW 读包伪代码（语言无关 / C# 可映射）

```text
FUNCTION ImportPathBundle(filePath):
  json = ReadUtf8(filePath)
  root = ParseJson(json)

  path = root
  IF root.schema == "pidm.bundle.v0" THEN
    path = root.path
  END IF

  ASSERT path.schema == "pidm.path.v0"

  // 1) 闭环门禁
  IF path.closure exists THEN
    errors = path.closure.items WHERE level == "error"
    IF errors.Count > 0 OR path.closure.ok == false AND errors.Count > 0 THEN
      ShowErrors(errors)
      RETURN Fail
    END IF
  END IF

  // 2) 坐标系
  coord = path.line.coord_system OR path.line.coordSystem OR "Z_up_right"
  ASSERT coord contains "Z_up"   // v0：不做 Y-up 映射

  // 3) 打开文档
  model = ActiveAssemblyDoc()
  IF model is null THEN RETURN Fail("请先打开装配")

  // 4) 取/建骨架草图
  sketchName = "PIDM_PATH_SKEL"
  sketch = FindOrCreate3DSketch(model, sketchName)
  ClearSketchGeometry(sketch)   // 更新而非复制

  // 5) 按 seq 排序节点
  nodes = Sort(path.nodes, by seq ascending)
  points = []
  map = {}   // node.id -> sketch point name

  FOR EACH n IN nodes:
    // SolidWorks API 草图坐标单位 = 米（与 Web 一致，禁止 ×1000）
    X = n.x
    Y = n.y
    Z = n.z
    pt = CreateSketchPoint(sketch, X, Y, Z)
    NameEntity(pt, "PIDM_N_" + n.id)
    points.Add(pt)
    map[n.id] = "PIDM_N_" + n.id
  END FOR

  // 6) 连折线
  FOR i = 0 TO points.Count - 2:
    CreateSketchLine(sketch, points[i], points[i+1])
  END FOR

  ExitSketch(sketch)

  // 7) 主驱唯一性检查（只警告）
  mains = nodes WHERE type == "drive" AND (is_main_drive OR is_mainDrive OR mainDrive)
  IF mains.Count != 1 THEN Warn("主驱动数量=" + mains.Count)

  // 8) 旁路映射写出（可选）
  WriteJson(SiblingPath(filePath, ".map.json"), {
    geometry_hint: "G_local",
    sketch: sketchName,
    node_map: map
  })

  RETURN Ok(nodes.Count)
END FUNCTION


// —— 阶段 B（后续）——
FUNCTION InsertDrums(path, map):
  FOR EACH n IN path.nodes WHERE type IN drumTypes:
    block = ResolveBlock(n.sw_block_id, n.type, n.drum_D_mm OR n.drum_D_mm)
    inst = InsertBlockAt(map[n.id], block)
    SetProp(inst, "PIDM_TYPE", n.type)
    SetProp(inst, "PIDM_D_MM", n.drum_D_mm)
    SetProp(inst, "PIDM_NODE_ID", n.id)
    role = "none"
    IF n.type == "drive" THEN
      role = (n.is_main_drive ? "main" : "aux")
    END IF
    SetProp(inst, "PIDM_DRIVE_ROLE", role)
  END FOR
END FUNCTION


// —— 阶段 B/C：提取回传 ——
FUNCTION ExportExtract(path, map) -> extractJson:
  segs = []
  FOR EACH s IN path.segments:
    L = MeasureLength(s.from_node_id, s.to_node_id) / 1000  // mm→m
    segs.Add({
      path_segment_id: s.id,
      L_m: L,
      delta_deg: s.delta_deg,
      H_m: s.H,
      major_id: s.major_id,
      sub_id: s.sub_id,
      completeness: "partial",
      sw_feature_name: s.name_tree
    })
  END FOR
  RETURN {
    schema: "pidm.extract.v0",
    geometry_version: NextGeoVersion(),
    extracted_at: NowIso(),
    segments: segs,
    drums: [],
    point_order: path.point_order OR path.point_order
  }
END FUNCTION
```

### C# Add-in 映射提示

| 伪代码 | SolidWorks API |
|--------|----------------|
| ActiveAssemblyDoc | `ISldWorks.ActiveDoc` as `AssemblyDoc` |
| FindOrCreate3DSketch | `FeatureByName` / `Insert3DSketch` |
| CreateSketchPoint | `SketchManager.CreatePoint` |
| CreateSketchLine | `SketchManager.CreateLine` |
| SetProp | `CustomPropertyManager.Add3` |

JSON：C# 用 `System.Text.Json`；VBA 用本仓库自带轻量解析（仅支持本 schema 子集）。
