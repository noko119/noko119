# 皮带机 PIDM · UI 网页原型

## 页面

| 文件 | 用途 |
|------|------|
| `index.html` | SolidWorks 薄插件五面板（分类 / 点序 / 提取 / 审核 / 发送） |
| `path-editor.html` | **网页路径编辑器**：2D + 3D，**正确提取几何**，导出 `pidm.path.v0` |
| `calc.html` | **逐步透明计算**：GC-01 对照 **或** 路径提取包计算 |

## 定稿流程

```text
画/改路径（2D/3D）
  → 网页正确提取 L / Ln / H / δ / 点序 / 滚筒
  → 一键计算（DTII-P2P-v0.2）
```

路径编辑器按钮：

- **提取几何**：显示整线与各段 L/H/δ
- **提取并计算**：写入提取包并跳转 `calc.html?source=path`

## 路径编辑器（定稿能力）

按 `docs/PROJECT_RULES.md` §3.1 / §5：

- **3D 操作**：透视观察、空间拖点改 XYZ、滚筒块放置
- **2D 俯视 XY**：平面拖拽改 X/Y
- **2D 侧视 XZ**：改坡度/高差（X/Z）
- **XYZ 表**：改坐标即时回写视图
- **Web 提取**：`calc/path-extract.js` → `pidm.extract.v0`（`source=web_path`）
- 导出 `pidm.path.v0`（含 segments / point_order / extract / closure）

提取公式（强制）：

- 段：`L=‖ΔP‖`，`H=Δz`，`Ln=√(dx²+dy²)`，`δ=atan2(H,Ln)`
- 线：`L=ΣL_i`，`Ln=ΣLn_i`，`H=z_last−z_first`，`δ=atan2(H,Ln)`

## 计算原型

- 引擎：`calc/dtii-engine.js`（**1:1 / 2:1 / 1:2** 双驱配比）
- 锚定算例：`calc/gc01-case.js`（**v1 唯一黄金算例 GC-01**）
- 路径驱动：`calc/path-extract.js` → `buildCalcInputFromExtract`
- 每步可展开：输入 → 公式 → 中间值 → 结果
- SW 读包：见仓库 `docs/SW_PACKAGE_READ_GUIDE.md`

## 本地打开

```bash
cd ui-prototype
python3 -m http.server 8080
```

冒烟回归：

```bash
node smoke-test.mjs
```

- 五面板：`http://localhost:8080/`
- 路径编辑：`http://localhost:8080/path-editor.html`
- 计算：`http://localhost:8080/calc.html`

> 请用本地 HTTP 服务打开（勿直接 `file://`）。

## 说明

- 网页几何提取必须正确，可直接驱动计算（非演示凑数）。
- SW 用于骨架同步与模型专有量核对增强。
- 分类口径按 DTⅡ 手册十二大项 + 细分。
- GC-01 主链已可本地回归。
