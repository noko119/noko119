using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Runtime.InteropServices;
using Microsoft.Win32;
using PidmPath.Core;
using SolidWorks.Interop.sldworks;
using SolidWorks.Interop.swconst;
using SolidWorks.Interop.swpublished;

namespace PidmPath.AddIn
{
    /// <summary>
    /// SolidWorks Add-in 入口：CommandManager 选项卡「DTⅡ 路径」+ 任务窗格。
    /// 注册：regasm /codebase PidmPath.AddIn.dll（64 位 regasm）。
    /// </summary>
    [ComVisible(true)]
    [Guid("D3F0A6C1-8B2E-4F5A-9C7D-1E2B3A4C5D6F")]
    [ProgId("PidmPath.AddIn.SwAddin")]
    public class SwAddin : ISwAddin
    {
        public const string Title = "PIDM DTⅡ 皮带机路径";
        public const string Description = "在 3D 草图中绘制闭环皮带机路径，按 DTⅡ(A) 手册标注区段/滚筒/拉紧属性并导出给网页计算。";
        const string TabName = "DTⅡ 路径";

        ISldWorks _sw;
        int _cookie;
        ICommandManager _cmdMgr;
        SketchIO _io;
        Commands _cmd;
        TaskpaneView _tpView;
        TaskPaneHost _pane;
        readonly List<int> _groupIds = new List<int>();

        // ---------------------------------------------------------------- 按钮定义
        class Btn { public string Name, Tip, Callback; public Btn(string n, string t, string cb) { Name = n; Tip = t; Callback = cb; } }
        class Grp { public int Id; public string Icon, Title, Tip; public Btn[] Buttons; }

        static readonly Grp[] Groups =
        {
            new Grp { Id = 1, Icon = "start", Title = "开始", Tip = "线体与模板", Buttons = new[]
            {
                new Btn("新建路径", "新建 PIDM_PATH_SKEL 3D 草图并填写线体参数（B、v、ρ、带芯、槽角、承载-回程间距）", nameof(OnNewPath)),
                new Btn("侧型模板", "按手册表13-1 常用侧型（A~L × 剖面1~5）一键生成可编辑骨架", nameof(OnSideType)),
                new Btn("线体信息", "修改带宽/带速/密度/带芯/槽角/张力利用率（决定托辊间距、过渡段、凸弧 Rmin）", nameof(OnLineInfo)),
                new Btn("从网页导入", "读取网页导出的 pidm.path.v0 JSON 并重画骨架", nameof(OnImport)),
            }},
            new Grp { Id = 2, Icon = "carry", Title = "承载分支", Tip = "承载线识别与区段性质（2.3 侧型设计）", Buttons = new[]
            {
                new Btn("识别路径", "把草图直线/圆弧/样条串成点序，计算 L/H/Ln/δ 并写入属性", nameof(OnRecognize)),
                new Btn("标为承载", "选中线段 → 承载分支", nameof(OnMarkCarry)),
                new Btn("标为回程", "选中线段 → 回程分支（Advanced 手工回程）", nameof(OnMarkReturn)),
                new Btn("受料段", "选中线段 → 受料段：导料槽长/宽、加速段（FS1/FbA/Fgl）", nameof(OnLoadSection)),
                new Btn("卸料段", "选中线段 → 头部/犁式/中部卸料段", nameof(OnUnloadSection)),
                new Btn("过渡段", "选中线段 → 机头/机尾过渡段（表2-4 最小长度）", nameof(OnTransition)),
                new Btn("前倾托辊", "选中线段 → 前倾托辊段 Lε、ε（式3-25/3-26）", nameof(OnTiltIdler)),
                new Btn("凸弧", "选中折点/相邻两线 → 凸弧段 R（式3-72/3-73 Rmin）", nameof(OnConvex)),
                new Btn("凹弧", "选中折点/相邻两线 → 凹弧段 R（式3-74，压轮/调心托辊提示）", nameof(OnConcave)),
                new Btn("托辊间距", "选中线段 → 本段 a0/aU（表2-7）", nameof(OnIdlerSpacing)),
            }},
            new Grp { Id = 3, Icon = "drums", Title = "滚筒与附件", Tip = "滚筒（表2-5 匹配）与清扫器/卸料器/压轮", Buttons = new[]
            {
                new Btn("传动滚筒", "选中路径点 → 传动滚筒：D、主/辅、μ（表3-12）、包角", nameof(OnDrive)),
                new Btn("改向滚筒", "选中路径点 → 改向滚筒：180°尾/中/头探头、90°、<45°，D 按表2-5 匹配", nameof(OnBend)),
                new Btn("拉紧滚筒", "选中路径点 → 拉紧滚筒：垂直重锤/车式/螺旋/绞车、行程（2.3.6）", nameof(OnTakeup)),
                new Btn("尾滚筒", "选中路径点 → 尾部改向滚筒", nameof(OnTail)),
                new Btn("头滚筒", "选中路径点 → 头部（探头/卸料）滚筒", nameof(OnHead)),
                new Btn("设主驱", "选中传动滚筒 → 主传动（唯一，奔离点 S1）", nameof(OnSetMainDrive)),
                new Btn("滚筒属性", "选中滚筒点 → 修改属性", nameof(OnDrumProps)),
                new Btn("清扫器", "选中点 → 头部/空段清扫器（FS2 计数）", nameof(OnCleaner)),
                new Btn("犁式卸料", "选中点 → 犁式卸料器（式3-30）", nameof(OnPlow)),
                new Btn("压轮", "选中点 → 压轮（凹弧起点距导料槽 <5 m 时，2.3.3）", nameof(OnPressureRoller)),
            }},
            new Grp { Id = 4, Icon = "loop", Title = "回程与闭环", Tip = "Auto 回程 / 闭合", Buttons = new[]
            {
                new Btn("Auto 回程", "按承载线法向偏移自动生成回程并闭环（对标 Belt Analyst Auto Return）", nameof(OnAutoReturn)),
                new Btn("闭合检查", "回程是否接回尾滚筒、断口、N1/N2 绕带统计", nameof(OnClosure)),
                new Btn("滚筒间距", "相邻滚筒中心距、拉紧 L′/H′", nameof(OnDrumGaps)),
            }},
            new Grp { Id = 5, Icon = "deliver", Title = "分类与交付", Tip = "DTⅡ 分类 / 特性点 / 门禁 / 导出", Buttons = new[]
            {
                new Btn("自动分类", "按分支/倾角/弧/附件填 major/sub（字典 01~12）", nameof(OnAutoClassify)),
                new Btn("确认分类", "选中线段 → 人工改 sub_id 并确认", nameof(OnConfirmClassify)),
                new Btn("奔离点", "选中主传动滚筒 → 张力点 S1（3.5.3.2）", nameof(OnLeavePoint)),
                new Btn("手定点1", "选中点 → 手定特性点 1", nameof(OnManual1)),
                new Btn("手定点2", "选中点 → 手定特性点 2", nameof(OnManual2)),
                new Btn("特性点", "预览逐点张力法特性点编号（3.5.3）", nameof(OnCharPoints)),
                new Btn("门禁检查", "契约 CL_* + 手册侧型规则检查", nameof(OnGate)),
                new Btn("导出到网页", "导出 pidm.path.v0 JSON（几何+标签，无计算结果）", nameof(OnExport)),
                new Btn("面板", "显示/刷新右侧任务窗格", nameof(OnPane)),
            }},
        };

        // ---------------------------------------------------------------- ISwAddin
        public bool ConnectToSW(object ThisSW, int Cookie)
        {
            _sw = (ISldWorks)ThisSW;
            _cookie = Cookie;
            _sw.SetAddinCallbackInfo2(0, this, _cookie);
            _io = new SketchIO(_sw);
            _cmd = new Commands(_sw, _io, () => _pane);
            _cmdMgr = _sw.GetCommandManager(_cookie);
            BuildUI();
            BuildTaskPane();
            return true;
        }

        public bool DisconnectFromSW()
        {
            foreach (var id in _groupIds) _cmdMgr.RemoveCommandGroup2(id, true);
            try { _tpView?.DeleteView(); } catch { }
            _tpView = null; _pane = null; _cmdMgr = null; _sw = null;
            GC.Collect(); GC.WaitForPendingFinalizers();
            return true;
        }

        // ---------------------------------------------------------------- UI
        static string IconDir => Path.Combine(Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location) ?? "", "Icons");
        static readonly int[] IconSizes = { 20, 32, 40, 64, 96, 128 };

        void BuildUI()
        {
            var docTypes = new[] { (int)swDocumentTypes_e.swDocPART, (int)swDocumentTypes_e.swDocASSEMBLY };
            var boxes = new List<int[]>();
            foreach (var g in Groups)
            {
                int errors = 0;
                var cg = _cmdMgr.CreateCommandGroup2(g.Id, TabName + " · " + g.Title, g.Tip, g.Tip, -1, true, ref errors);
                if (cg == null) continue;
                cg.IconList = IconSizes.Select(s => Path.Combine(IconDir, $"{g.Icon}_{s}.png")).ToArray();
                cg.MainIconList = IconSizes.Select(s => Path.Combine(IconDir, $"{g.Icon}_main_{s}.png")).ToArray();
                var idxs = new List<int>();
                for (int i = 0; i < g.Buttons.Length; i++)
                {
                    var b = g.Buttons[i];
                    int idx = cg.AddCommandItem2(b.Name, -1, b.Tip, b.Name, i, b.Callback, nameof(EnableAlways), g.Id * 100 + i,
                        (int)(swCommandItemType_e.swMenuItem | swCommandItemType_e.swToolbarItem));
                    idxs.Add(idx);
                }
                cg.HasToolbar = true; cg.HasMenu = true;
                cg.Activate();
                _groupIds.Add(g.Id);
                boxes.Add(idxs.Select(i => cg.get_CommandID(i)).ToArray());
            }

            foreach (var dt in docTypes)
            {
                var tab = _cmdMgr.GetCommandTab(dt, TabName);
                if (tab != null) { _cmdMgr.RemoveCommandTab(tab); tab = null; }
                tab = _cmdMgr.AddCommandTab(dt, TabName);
                if (tab == null) continue;
                foreach (var ids in boxes)
                {
                    var box = tab.AddCommandTabBox();
                    var texts = ids.Select(_ => (int)swCommandTabButtonTextDisplay_e.swCommandTabButton_TextBelow).ToArray();
                    box.AddCommands(ids, texts);
                }
            }
        }

        void BuildTaskPane()
        {
            try
            {
                var icon = Path.Combine(IconDir, "taskpane_40.png");
                _tpView = _sw.CreateTaskpaneView2(icon, TabName);
                _pane = (TaskPaneHost)_tpView.AddControl(TaskPaneHost.ProgIdValue, "");
                if (_pane != null) _pane.RefreshRequested += (s, e) => Safe(_cmd.RefreshPane);
            }
            catch { _pane = null; }
        }

        public int EnableAlways() => 1;

        static void Safe(Action a)
        {
            try { a(); }
            catch (Exception ex) { Msg.Error("操作失败：" + ex.Message + "\n\n" + ex.StackTrace); }
        }

        // ---------------------------------------------------------------- 回调（SW 按名称调用，必须 public）
        public void OnNewPath() => Safe(_cmd.NewPath);
        public void OnSideType() => Safe(_cmd.SideTypeTemplate);
        public void OnLineInfo() => Safe(_cmd.LineInfo);
        public void OnImport() => Safe(_cmd.ImportJson);

        public void OnRecognize() => Safe(_cmd.Recognize);
        public void OnMarkCarry() => Safe(() => _cmd.MarkBranch(Branches.Carry));
        public void OnMarkReturn() => Safe(() => _cmd.MarkBranch(Branches.Return));
        public void OnLoadSection() => Safe(_cmd.LoadSection);
        public void OnUnloadSection() => Safe(_cmd.UnloadSection);
        public void OnTransition() => Safe(_cmd.TransitionSection);
        public void OnTiltIdler() => Safe(_cmd.TiltIdlerSection);
        public void OnConvex() => Safe(() => _cmd.Arc("convex"));
        public void OnConcave() => Safe(() => _cmd.Arc("concave"));
        public void OnIdlerSpacing() => Safe(_cmd.IdlerSpacing);

        public void OnDrive() => Safe(() => _cmd.InsertDrum(NodeTypes.Drive));
        public void OnBend() => Safe(() => _cmd.InsertDrum(NodeTypes.Bend));
        public void OnTakeup() => Safe(() => _cmd.InsertDrum(NodeTypes.Takeup));
        public void OnTail() => Safe(() => _cmd.InsertDrum(NodeTypes.Tail));
        public void OnHead() => Safe(() => _cmd.InsertDrum(NodeTypes.Head));
        public void OnSetMainDrive() => Safe(_cmd.SetMainDrive);
        public void OnDrumProps() => Safe(_cmd.DrumProps);
        public void OnCleaner() => Safe(() => _cmd.Attachment("cleaner"));
        public void OnPlow() => Safe(() => _cmd.Attachment(AttachmentKinds.Plow));
        public void OnPressureRoller() => Safe(() => _cmd.Attachment(AttachmentKinds.PressureRoller));

        public void OnAutoReturn() => Safe(_cmd.AutoReturnCmd);
        public void OnClosure() => Safe(_cmd.ClosureCheck);
        public void OnDrumGaps() => Safe(_cmd.DrumGaps);

        public void OnAutoClassify() => Safe(_cmd.AutoClassify);
        public void OnConfirmClassify() => Safe(_cmd.ConfirmClassify);
        public void OnLeavePoint() => Safe(() => _cmd.SetPointRole(PointRoles.Leave));
        public void OnManual1() => Safe(() => _cmd.SetPointRole(PointRoles.Manual1));
        public void OnManual2() => Safe(() => _cmd.SetPointRole(PointRoles.Manual2));
        public void OnCharPoints() => Safe(_cmd.CharacteristicPointsCmd);
        public void OnGate() => Safe(_cmd.GateCheck);
        public void OnExport() => Safe(_cmd.Export);
        public void OnPane() => Safe(() => { if (_tpView == null) BuildTaskPane(); _tpView?.ShowView(); _cmd.RefreshPane(); });

        // ---------------------------------------------------------------- 无界面自测（外部 COM 调用）
        /// <summary>
        /// PowerShell:  $sw = New-Object -ComObject SldWorks.Application
        ///              $a  = $sw.GetAddInObject("PidmPath.AddIn.SwAddin")
        ///              $a.RunSmokeTest("C:\temp\pidm-smoke", "C1")
        /// </summary>
        public string RunSmokeTest(string outDir, string sideType)
        {
            try { return _cmd.RunSmokeTest(outDir, string.IsNullOrWhiteSpace(sideType) ? "C1" : sideType); }
            catch (Exception ex) { return "[FAIL] " + ex.Message + "\n" + ex.StackTrace; }
        }

        /// <summary>插件是否已连接（COM 探活）。</summary>
        public string Ping() => $"{Title} ok; SW {_sw?.RevisionNumber()}; groups {_groupIds.Count}; pane {(_pane != null ? "yes" : "no")}";

        // ---------------------------------------------------------------- COM 注册
        [ComRegisterFunction]
        public static void RegisterFunction(Type t)
        {
            try
            {
                var key = $"SOFTWARE\\SolidWorks\\Addins\\{{{t.GUID}}}";
                using (var k = Registry.LocalMachine.CreateSubKey(key))
                {
                    k.SetValue(null, 0);
                    k.SetValue("Description", Description);
                    k.SetValue("Title", Title);
                }
                using (var k = Registry.CurrentUser.CreateSubKey($"Software\\SolidWorks\\AddInsStartup\\{{{t.GUID}}}"))
                    k.SetValue(null, 1);
            }
            catch (Exception ex) { Console.WriteLine("注册失败: " + ex.Message); }
        }

        [ComUnregisterFunction]
        public static void UnregisterFunction(Type t)
        {
            try
            {
                Registry.LocalMachine.DeleteSubKey($"SOFTWARE\\SolidWorks\\Addins\\{{{t.GUID}}}", false);
                Registry.CurrentUser.DeleteSubKey($"Software\\SolidWorks\\AddInsStartup\\{{{t.GUID}}}", false);
            }
            catch { }
        }
    }
}
