# 锥管模具 SW 读包伪代码（语言无关 / C# 可映射）

```text
FUNCTION ImportConeMold(filePath):
  json = ReadUtf8(filePath)
  root = ParseJson(json)

  ASSERT root.ok == true
  ASSERT root.schema == "cone.mold.v0"
  ASSERT root.unit == "mm"
  ASSERT root.coord == "Y_up_top_origin"

  // Web mm → SW API m
  FUNCTION M(mm): RETURN mm * 0.001

  cone = root.cone
  sleeves = root.sleeves   // sorted by index ascending
  totalH = root.totalHeight

  model = NewPartDocument()
  IF model is null THEN RETURN Fail("无法新建零件")

  // —— 1) 内锥实心旋转体（绕 Y）——
  // 顶面中心原点：顶 z0 → Y=0；向下 z 增大 → Y = -(z - cone.z0) 再整体平移使顶在 Y=0
  // 约定实现：顶圆在 Y=0，底圆在 Y = -M(cone.height)（仅锥段）或按 z0/z1 对齐总高
  yTop = 0
  yBot = -M(cone.z1 - cone.z0)   // 锥段高度；若含余量可按 z0→z1 相对顶面

  sketch = InsertSketchOnFrontPlane(model)
  // 半截面（X≥0）：顶半径 → 底半径 → 轴
  rTop = M(cone.topDia) / 2
  rBot = M(cone.bottomDia) / 2
  CreateLine(sketch, 0, yTop, rTop, yTop)
  CreateLine(sketch, rTop, yTop, rBot, yBot)
  CreateLine(sketch, rBot, yBot, 0, yBot)
  CreateLine(sketch, 0, yBot, 0, yTop)   // 轴
  ExitSketch(sketch)
  FeatureRevolve2(model, sketch, axis=Y, angle=360deg, solid=true)
  RenameFeature("CM_CONE")

  // —— 2) 各外套薄壁旋转体 ——
  FOR EACH s IN sleeves:
    y0 = -M(s.z0)     // 顶面 Y=0，向下为负
    y1 = -M(s.z1)
    rOut = M(s.outerOd) / 2
    rInTop = M(s.coneAtTop) / 2
    rInBot = M(s.coneAtBot) / 2

    sk = InsertSketchOnFrontPlane(model)
    // 外轮廓（右）：(rOut,y0)-(rOut,y1)
    // 内轮廓（锥）：(rInBot,y1)-(rInTop,y0)
    // 顶/底封闭成封闭环，绕 Y 旋转成薄壁管段
    CreateClosedProfile(sk,
      (rOut, y0), (rOut, y1), (rInBot, y1), (rInTop, y0))
    // 若需显式轴：再加 (0,y0)-(0,y1) 作旋转轴参考
    ExitSketch(sk)
    FeatureRevolve2(model, sk, axis=Y, angle=360deg, solid=true, merge=false)
    RenameFeature("CM_SLEEVE_" + s.index)
  END FOR

  Rebuild(model)
  RETURN Ok(sleeves.Count)
END FUNCTION


// —— 阶段 B（后续）——
FUNCTION CutJointDetails(root, model):
  FOR EACH j IN root.joints WHERE j.ok:
    // 在 Y = -M(j.z) 附近切平面
    // 母端：止口、退刀槽 Dg、螺纹大径
    // 公端：退刀槽 df、螺纹
    // 参考网页 joints[].locator / engage / undercut / majorDia / pitch
  END FOR
END FUNCTION
```

## 字段映射速查

| JSON | 用途 |
|------|------|
| `cone.topDia` / `bottomDia` / `z0` / `z1` | 内锥 |
| `sleeves[].outerOd` | 外套外径 |
| `sleeves[].coneAtTop` / `coneAtBot` | 段内锥内径 |
| `sleeves[].z0` / `z1` | 段轴向范围（mm，自顶向下） |
| `joints[]` | 二期螺纹/止口 |

## 注意

- `FeatureRevolve2` 多实体时 `merge` 应为 false，避免外套并入内锥。  
- 解析可用脚本引擎 / JSON 库；VBA 样例用轻量字符串提取（与 PIDM 宏同风格）。  
- 界面 mm 与 API 米勿混用。
