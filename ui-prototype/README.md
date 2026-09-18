# 皮带机 PIDM · UI 网页原型

## 页面

| 文件 | 用途 |
|------|------|
| `index.html` | SolidWorks 薄插件五面板（分类 / 点序 / 提取 / 审核 / 发送） |
| `path-editor.html` | **网页路径编辑器**：2D + 3D，**正确提取几何**，导出 `pidm.path.v0` |
| `calc.html` | **逐步透明计算**：GC-01 对照 **或** 路径提取包计算 |
| `thread-calc/` | **螺纹尺寸推导**：给定规格输出内外螺纹牙顶/牙底/中径与退刀槽 |

## 定稿流程

按 `docs/PROJECT_RULES.md` **§1.1 大厂对标** + **§3.0 大厂主流程**（强制）：

```text
① 先画承载中心线（用户自由绘制，非整机预制）
② Auto Return（默认）生成回程并锁定跟随
③ Advanced：复杂回程可手改（多滚筒/双驱/重锤等）
④ Easy 向导 / DXF 导入中心线（P1）
⑤ 局部模板可插入且可再改（P1）
⑥ 竖曲线（凸/凹弧）+ 包角/D/2 偏移（P2）
⑦ GC-01 等样例仅演示/回归，非主交互
  → 网页正确提取 L / Ln / H / δ / 点序 / 滚筒
  → 一键计算（DTII-P2P-v0.2）
```

路径编辑器按钮：

- **Easy / 导入（对标 Sidewinder + 大厂 DXF）**
  - **Easy 向导**：少参数（Ln/H/间距）快搭斜坡机 + Auto Return
  - **导入 DXF**：LINE / LWPOLYLINE 中心线 → 承载 → Auto Return（样例：`samples/sample-carry.xz.dxf`）
- **回程模式（对标 Belt Analyst）**
  - **Auto Return（默认）**：只画/改承载；回程自动生成并**锁定跟随**
  - **Advanced**：承载/回程可分改（拖/插/删回程点）；切回 Auto 会按承载重算回程（覆盖手改）
  - 间距可调；蓝=承载，橙=回程
- **局部模板（对标 Sidewinder，P1）**
  - **插入双驱绕法** / **插入重锤拉紧**：需 Advanced；插入后可继续编辑
  - **演示：GC-01复杂回程**：仅演示对照，非整机主交互（§3.0）
- **剖面确认（对标 BA Finalize）**
  - **配对航段**：承载↔回程自动配对
  - **Finalize**：闭环/主驱/D/包角/曲线检查并可锁定
- **工业绘图（P2）**
  - **插入竖曲线**：选中转角 → 凸/凹弧 + 最小半径示意
  - **重算包角**：邻段几何写 φ
  - **D/2 偏移**：滚筒节点按直径角平分线修正中心线

原有按钮：

- **提取几何**：显示整线与各段 L/H/δ
- **提取并计算**：写入提取包并跳转 `calc.html?source=path`

## 路径编辑器（定稿能力）

按 `docs/PROJECT_RULES.md` §3.0 / §3.1 / §5：

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
- 螺纹推导：`http://localhost:8080/thread-calc/`

> 请用本地 HTTP 服务打开（勿直接 `file://`）。

## 说明

- 网页几何提取必须正确，可直接驱动计算（非演示凑数）。
- SW 用于骨架同步与模型专有量核对增强。
- 分类口径按 DTⅡ 手册十二大项 + 细分。
- GC-01 主链已可本地回归。
- Auto Return 已落地：示例坡道默认带闭环回程；可调间距，Advanced 可手改回程。
- P1 已落地：Easy 向导、DXF 导入、双驱/重锤局部模板（可再改）。
- P2 已落地：竖曲线（凸/凹弧）、包角重算、滚筒 D/2 偏移。
- 大厂缺口补齐（本轮）：
  - **Flight 段表**（L/H/δ/a/R/配对/状态，可编辑）
  - **Easy 向导面板 + 机型库**（非 prompt 链）
  - **Finalize** 剖面锁定检查 + DTⅡ 示意包角/竖曲线校核
  - **DXF 导出往返**、**Excel 兼容 CSV** 节点/Flight 导入导出
  - **承载↔回程配对航段**

