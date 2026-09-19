# PIDM DTⅡ 皮带机路径 — SolidWorks C# Add-in

> 定位：**SW 只画路径、只打标签，不算张力/功率/选型**。计算全部在网页（`ui-prototype/path-editor.html` → 计算页）。  
> 依据：《DTⅡ(A) 型带式输送机设计手册（第 2 版）》2.3～2.5、3.4、3.5、3.10、3.11、3.13、表 13-1、4.7～4.12。  
> 按钮设计与手册条目对照：[`docs/SW_PLUGIN_PATH_BUTTONS.md`](../../docs/SW_PLUGIN_PATH_BUTTONS.md)。  
> 数据契约：[`docs/WEB_SW_DATA_CONTRACT_DRAFT.md`](../../docs/WEB_SW_DATA_CONTRACT_DRAFT.md)（`pidm.path.v0`）。

---

## 1. 目录

| 路径 | 内容 |
|------|------|
| `PidmPath.Core/` | 与 SW 无关的核心库（netstandard2.0）：模型、串链、Auto 回程、分类、手册规则、门禁、侧型模板、JSON。**可在 Linux/macOS 上单测** |
| `PidmPath.AddIn/` | SolidWorks 插件（net48 x64）：CommandManager 选项卡「DTⅡ 路径」5 组 36 个按钮、任务窗格、草图读写、属性写入 |
| `PidmPath.Core.Tests/` | xUnit 单元测试（26 个，覆盖 43 种侧型闭环、分类、规则表、JSON 往返） |
| `tools/build.ps1` | 编译 + 测试 |
| `tools/register.ps1` | RegAsm 注册 / 反注册（管理员） |
| `tools/make_icons.py` | 生成按钮图标条（已生成到 `PidmPath.AddIn/Icons/`） |
| `../samples/sw-export-C1-path-v0.json` | 插件导出示例（侧型 C1），可直接在网页「导入 JSON(SW)」 |

---

## 2. 环境

| 项 | 要求 |
|----|------|
| SolidWorks | 2020～2024（互操作程序集用 32.1 = SW2024；低版本一般向下兼容，如报错可改 csproj 中 `SolidWorks.Interop.*` 版本号到对应年份：2020=28、2021=29、2022=30、2023=31） |
| .NET Framework | 4.8 运行时（SW 自带） |
| 编译 | .NET SDK 8（Windows；核心库/测试亦可在 Linux 编译） |
| 权限 | 注册需管理员（写 `HKLM\SOFTWARE\SolidWorks\Addins`） |

---

## 3. 安装（Windows）

```powershell
cd sw-plugin\addin
.\tools\build.ps1                 # 生成 PidmPath.AddIn\bin\Release\PidmPath.AddIn.dll
# 以管理员打开 PowerShell：
.\tools\register.ps1              # regasm /codebase
```

启动 SolidWorks → 工具 → 插件 → 勾选「PIDM DTⅡ 皮带机路径」（启动时加载）。打开任意零件/装配体后，CommandManager 出现选项卡 **「DTⅡ 路径」**，右侧任务窗格出现同名面板。

卸载：`.\tools\register.ps1 -Unregister`。

### 真机无界面冒烟（推荐先跑）

```powershell
.\tools\sw-smoke.ps1              # 启动 SW → 新建零件 → 生成侧型 C1 → 写属性 → 读回校验 → 门禁 → 导出 JSON → 保存重开
.\tools\sw-smoke.ps1 -SideType L1 -KeepOpen
```

全程不点按钮，输出 `tools\sw-smoke-report.txt`，末行 `结果：PASS/FAIL`。原理：插件公开了 COM 方法 `RunSmokeTest(outDir, sideType)` 与 `Ping()`，脚本用 `GetAddInObject("PidmPath.AddIn.SwAddin")` 调用。
在 Windows 上用 Cursor 打开本仓库，让本地 agent 运行此脚本即可自动测试并根据报告修复。

> 若 SW 提示"无法加载插件"：① 确认用的是 `Framework64\v4.0.30319\RegAsm.exe`；② DLL 所在目录含 `PidmPath.Core.dll`、`Newtonsoft.Json.dll`、`Icons\`；③ 右键 DLL → 属性 → 解除锁定（脚本已自动 `Unblock-File`）。

---

## 4. 一条皮带机的最短操作流

```text
① 新建路径          → 填 B / v / ρ / 带芯 / 槽角 / 承载-回程间距 → 进入 3D 草图 PIDM_PATH_SKEL
② 画承载中心线      → 直线 + 圆弧（凸/凹弧）或先画折线；尾→头；Z 向上；单位米（API 单位）
③ 识别路径          → 串成点序，算 L/H/Ln/δ，写入线段属性
④ 放滚筒            → 选折点 → 尾滚筒 / 传动滚筒(主) / 头滚筒；改向滚筒 D 按表 2-5 自动匹配
⑤ Auto 回程         → 法向偏移生成回程并闭环
⑥ 回程上放拉紧      → 选回程线上一点 → 拉紧滚筒（垂直重锤 / 车式 / 螺旋）；90° 改向
⑦ 区段性质          → 选线段 → 受料段(导料槽长) / 卸料段 / 过渡段 / 前倾托辊 / 托辊间距
⑧ 自动分类 → 确认   → sub_id 字典 01~12
⑨ 奔离点 / 手定点   → S1 在主传动；手定点 1/2
⑩ 门禁检查          → CL_* 契约 + 手册规则（机尾长、Rmin、过渡段、滚筒匹配、压轮、清扫器…）
⑪ 导出到网页        → *.pidm-path-v0.json → 网页「导入 JSON(SW)」→ 提取并计算
```

或者：**侧型模板** 一键生成表 13-1 的任一侧型（A～L × 剖面 1～5 = 43 种）骨架，再拖点改尺寸。

---

## 5. 数据落在哪

| 内容 | 存放 | 说明 |
|------|------|------|
| 路径几何 | 3D 草图 `PIDM_PATH_SKEL` 的直线/圆弧 | 真相源；蓝=承载、橙=回程 |
| 区段属性 | 每条线段的 SW **Attribute**（定义 `PIDM_SEG`，参数 `PIDM_BRANCH/PIDM_SUB/PIDM_A_IDLER_M/PIDM_CURVE/PIDM_R_M/PIDM_FLAGS/PIDM_CHUTE_L_M/...`） | 跟随实体，复制/镜像不丢 |
| 滚筒属性 | 折点上的草图点 **Attribute**（定义 `PIDM_NODE`，参数 `PIDM_TYPE/PIDM_D_MM/PIDM_DRIVE_ROLE/PIDM_MU/PIDM_WRAP_DEG/PIDM_TAKEUP_KIND/PIDM_BEND_KIND/PIDM_POINT_ROLE`） | 与契约 §5 命名一致 |
| 附件 | 草图点 Attribute（`PIDM_ATT`） | 清扫器 / 犁式卸料 / 压轮 |
| 线体参数 + 全量 JSON 缓存 | 文档自定义属性 `PIDM_LINE_JSON_N`, `_0.._n` | 属性丢失时按坐标兜底 |

导出的 JSON **只有几何与标签**：`nodes / segments / attachments / point_order / closure`。没有张力、功率、带强、电机。

---

## 6. 单元测试（任何平台）

```bash
cd sw-plugin/addin
dotnet test PidmPath.Core.Tests -c Release
```

覆盖：乱序线段串链、闭环方向、GC-01 几何公式、滚筒点吸附、Auto 回程闭合、凸弧圆化 θ、分类字典、表 2-7/2-4/2-5/式 3-72 规则值、门禁从错到过、43 种侧型骨架均闭环且主驱唯一、JSON/属性往返。

---

## 7. 已知边界（v0）

- 只处理 **一条** 皮带机（一个 `PIDM_PATH_SKEL`）/文档。
- 弧段读回为三点弧；样条按 8 段离散。
- 滚筒必须放在**折点**上（选线上任意点时会自动拆段成折点）。
- 凹弧 R 的下限依赖张力（式 3-74），SW 只提示，由网页回填校核。
- 未做设计库滚筒实体块自动插入（二期：按 `PIDM_D_MM` 拉设计库块）。
