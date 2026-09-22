using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text;
using System.Windows.Forms;
using PidmPath.Core;
using SolidWorks.Interop.sldworks;

namespace PidmPath.AddIn
{
    /// <summary>按钮对应的操作。约定：先在 SW 里选中线段/点，再点按钮。</summary>
    internal class Commands
    {
        readonly ISldWorks _sw;
        readonly SketchIO _io;
        readonly Func<TaskPaneHost> _pane;
        const double SelTol = 1e-4;

        public Commands(ISldWorks sw, SketchIO io, Func<TaskPaneHost> pane) { _sw = sw; _io = io; _pane = pane; }

        // ================================================================== 加载 / 保存
        ModelDoc2 Doc()
        {
            var d = _io.ActiveDoc;
            if (d == null) Msg.Warn("请先打开零件或装配体（Z 向上）。");
            return d;
        }

        LineParams LoadLine(ModelDoc2 doc)
        {
            var json = _io.LoadCache(doc);
            if (string.IsNullOrEmpty(json)) return new LineParams();
            try { return JsonIO.Deserialize(json).Line ?? new LineParams(); } catch { return new LineParams(); }
        }

        PathModel LoadCached(ModelDoc2 doc)
        {
            var json = _io.LoadCache(doc);
            if (string.IsNullOrEmpty(json)) return null;
            try { return JsonIO.Deserialize(json); } catch { return null; }
        }

        /// <summary>从草图重建模型：几何 + 实体属性；缺属性的滚筒点用缓存按坐标兜底。</summary>
        PathModel Load(ModelDoc2 doc, List<string> warnings, bool quiet = false)
        {
            var feat = _io.FindPathSketch(doc);
            if (feat == null) { if (!quiet) Msg.Warn($"未找到草图 {PidmKeys.SketchName}。请先“新建路径”或“侧型模板”。"); return null; }
            var cached = LoadCached(doc);
            var line = cached?.Line ?? new LineParams();
            if (string.IsNullOrEmpty(line.SketchKind)) line.SketchKind = SketchKinds.Space3d;
            var data = _io.Read(doc, feat, line.SketchKind);
            warnings.AddRange(data.Warnings);
            if (data.Segments.Count == 0) { if (!quiet) Msg.Warn("草图里没有线段，请先绘制承载中心线。"); return null; }
            var tailHint = cached?.CarryNodes.FirstOrDefault()?.P;
            var chain = Chainer.Chain(data.Segments, tailHint);
            warnings.AddRange(chain.Warnings);
            var m = ModelBuilder.Build(chain, data.Points, line, warnings);

            if (cached != null)
            {
                // 缓存兜底：滚筒/点序/附件按坐标匹配
                foreach (var cn in cached.Nodes.Where(n => n.IsDrum || n.PointRole != PointRoles.None))
                {
                    var n = m.Nodes.OrderBy(x => x.P.DistanceTo(cn.P)).FirstOrDefault();
                    if (n == null || n.P.DistanceTo(cn.P) > ModelBuilder.DrumSnapTol) continue;
                    if (!n.IsDrum && cn.IsDrum)
                    {
                        n.Type = cn.Type; n.DrumDmm = cn.DrumDmm; n.DriveRole = cn.DriveRole; n.IsMainDrive = cn.IsMainDrive; n.Mu = cn.Mu;
                        n.WrapDeg = cn.WrapDeg; n.TakeupKind = cn.TakeupKind; n.TakeupTravelM = cn.TakeupTravelM; n.BendKind = cn.BendKind; n.StdCode = cn.StdCode; n.Label = cn.Label;
                    }
                    if (n.PointRole == PointRoles.None) n.PointRole = cn.PointRole;
                    if (string.IsNullOrEmpty(n.Label)) n.Label = cn.Label;
                }
                foreach (var ca in cached.Attachments)
                    if (!m.Attachments.Any(a => a.P.DistanceTo(ca.P) < ModelBuilder.DrumSnapTol)) m.Attachments.Add(ca);
                // 缓存里的段属性（用户改过几何但属性丢失时按端点匹配）
                foreach (var s in m.Segments.Where(s => string.IsNullOrEmpty(s.SubId) && s.Branch == Branches.Carry))
                {
                    var a = m.Node(s.FromId).P; var b = m.Node(s.ToId).P;
                    var cs = cached.Segments.FirstOrDefault(x => { var ca = cached.Node(x.FromId); var cb = cached.Node(x.ToId); return ca != null && cb != null && ((ca.P.DistanceTo(a) < 1e-3 && cb.P.DistanceTo(b) < 1e-3) || (ca.P.DistanceTo(b) < 1e-3 && cb.P.DistanceTo(a) < 1e-3)); });
                    if (cs == null) continue;
                    s.Branch = cs.Branch; s.MajorId = cs.MajorId; s.SubId = cs.SubId; s.AIdler = cs.AIdler; s.Flags = new List<string>(cs.Flags ?? new List<string>());
                    s.ChuteLengthM = cs.ChuteLengthM; s.ChuteWidthM = cs.ChuteWidthM; s.AccelLengthM = cs.AccelLengthM; s.TiltIdlerDeg = cs.TiltIdlerDeg; s.ClassifyStatus = cs.ClassifyStatus;
                    if (cs.Curve != "none") { s.Curve = cs.Curve; s.R = s.R ?? cs.R; }
                }
                foreach (var n in m.Nodes)
                {
                    var adj = m.Segments.Where(s => s.FromId == n.Id || s.ToId == n.Id).ToList();
                    n.Branch = adj.Count > 0 && adj.All(s => s.Branch == Branches.Return) ? Branches.Return : Branches.Carry;
                }
                m.PointOrder = cached.PointOrder ?? m.PointOrder;
            }
            if (PathEdit.LooksReversed(m)) { PathEdit.ReverseDirection(m); warnings.Add("识别方向已按 尾→头 自动反转。"); }
            m.RecomputeGeometry();
            return m;
        }

        void Save(ModelDoc2 doc, PathModel m, bool redraw)
        {
            m.RecomputeGeometry();
            if (!_io.EnterPathSketch(doc, true, m.Line.SketchKind)) { Msg.Error("无法进入路径草图。"); return; }
            try
            {
                if (redraw) _io.Redraw(doc, m); else _io.WriteBackAttrs(doc, m);
            }
            finally { _io.ExitSketch(doc); }
            _io.SaveCache(doc, JsonIO.Serialize(m));
            doc.GraphicsRedraw2();
            _pane()?.Update(m);
        }

        // ================================================================== 选择映射
        List<PathSegment> SelectedSegments(ModelDoc2 doc, PathModel m)
        {
            _io.ReadSelection(doc, out var ends, out _);
            var res = new List<PathSegment>();
            foreach (var (a, b) in ends)
            {
                var s = m.Segments.FirstOrDefault(x =>
                {
                    var pa = m.Node(x.FromId).P; var pb = m.Node(x.ToId).P;
                    return (pa.DistanceTo(a) < SelTol && pb.DistanceTo(b) < SelTol) || (pa.DistanceTo(b) < SelTol && pb.DistanceTo(a) < SelTol);
                });
                if (s != null && !res.Contains(s)) res.Add(s);
            }
            return res;
        }

        /// <summary>选中的点 → 路径节点（不在节点上但在段上则拆段新建节点）。</summary>
        PathNode SelectedNode(ModelDoc2 doc, PathModel m, bool splitIfOnSegment, out bool geometryChanged)
        {
            geometryChanged = false;
            _io.ReadSelection(doc, out var ends, out var pts);
            Vec3? p = null;
            if (pts.Count > 0) p = pts[0];
            else if (ends.Count == 1)
            {
                // 选了一条线：取离鼠标最近无法得知，取该线两端中“非滚筒”的一端不可靠 → 提示
                return null;
            }
            if (!p.HasValue) return null;
            var n = m.Nodes.OrderBy(x => x.P.DistanceTo(p.Value)).FirstOrDefault();
            if (n != null && n.P.DistanceTo(p.Value) <= ModelBuilder.DrumSnapTol) return n;
            if (!splitIfOnSegment) return null;
            var seg = ModelBuilder.NearestSegment(m, p.Value);
            if (seg == null) return null;
            var a = m.Node(seg.FromId).P; var b = m.Node(seg.ToId).P;
            if (ModelBuilder.PointSegDist(p.Value, a, b) > ModelBuilder.DrumSnapTol) return null;
            geometryChanged = true;
            return PathEdit.SplitSegment(m, seg, p.Value);
        }

        // ================================================================== 组 1 开始
        public void NewPath()
        {
            var doc = Doc(); if (doc == null) return;
            var line = LoadLine(doc);
            if (!EditLine(line, "新建路径 — 线体基本信息")) return;
            if (!_io.EnterPathSketch(doc, true, line.SketchKind)) { Msg.Error("无法创建路径草图。"); return; }
            var m = new PathModel { Line = line };
            _io.SaveCache(doc, JsonIO.Serialize(m));
            string how = line.SketchKind == SketchKinds.PlanarXz
                ? "已进入【2D 侧型】草图（前视 XZ）：画长度与高程，Y=0。\n有水平转弯请改选 3D 或 2D 俯视。"
                : line.SketchKind == SketchKinds.PlanarXy
                    ? "已进入【2D 俯视】草图（上视 XY）：画平面走向，高程 Z 请改 3D 或侧视。"
                    : "已进入【3D 空间】草图：可画平面侧型（Y=0）或空间折线。";
            Msg.Info($"{how}\n草图名 {PidmKeys.SketchName}。用直线/圆弧画承载中心线（尾→头），退出草图后点“识别路径”。");
        }

        bool EditLine(LineParams line, string title)
        {
            var dlg = new PropertyDialog(title, new[]
            {
                FieldSpec.Combo("sketch", "路径草图", new[]
                {
                    (SketchKinds.PlanarXz, "2D 侧型（前视平面，画坡度/提升）"),
                    (SketchKinds.PlanarXy, "2D 俯视（上视平面，画水平走向）"),
                    (SketchKinds.Space3d, "3D 空间路径（可平面也可转弯/折线）"),
                }, title.Contains("新建") ? SketchKinds.PlanarXz : (line.SketchKind ?? SketchKinds.PlanarXz), "同一套 XYZ：2D 只是画在一个基准面上；导出给网页仍是三维坐标"),
                FieldSpec.Text("name", "线体名称", line.Name),
                FieldSpec.Number("B", "带宽 B (mm)", line.B, "表2-3 / 决定机尾长度、过渡段、凸弧 Rmin"),
                FieldSpec.Number("v", "带速 v (m/s)", line.V, "2.2 / 2.3.2：>2.5 m/s 倾角减 2°~4°"),
                FieldSpec.Number("rho", "堆积密度 ρ (kg/m³)", line.Rho, "表2-7：≤1600 → a0=1.2 m；>1600 → a0=1.0 m"),
                FieldSpec.Combo("core", "带芯类型", new[] { ("fabric", "织物芯（EP/NN/CC）"), ("steel", "钢绳芯（ST）") }, line.BeltCore, "影响过渡段长(表2-4)与凸弧 Rmin(式3-72/73)"),
                FieldSpec.Number("trough", "托辊槽角 λ (°)", line.TroughAngle, "35 标准；45 深槽需尾部加过渡"),
                FieldSpec.Number("gap", "承载-回程间距 (m)", line.CarryReturnGap, "Auto 回程偏移量（≈机架高度）"),
                FieldSpec.Combo("util", "输送带张力利用率", new[] { (">90", ">90%"), ("60-90", "60%~90%"), ("<60", "<60%") }, line.TensionUtilization, "表2-4 过渡段长度系数"),
                FieldSpec.Number("Q", "输送量 Q (t/h) 可选", line.Q),
            });
            if (dlg.ShowDialog() != DialogResult.OK) return false;
            line.SketchKind = dlg.Str("sketch") ?? line.SketchKind;
            line.Name = dlg.Str("name"); line.B = dlg.Num("B") ?? line.B; line.V = dlg.Num("v") ?? line.V; line.Rho = dlg.Num("rho") ?? line.Rho;
            line.BeltCore = dlg.Str("core"); line.TroughAngle = dlg.Num("trough") ?? line.TroughAngle; line.CarryReturnGap = dlg.Num("gap") ?? line.CarryReturnGap;
            line.TensionUtilization = dlg.Str("util"); line.Q = dlg.Num("Q");
            ManualRules.DefaultIdlerSpacing(line.Rho, out var a0, out var aU); line.A0Default = a0; line.AUDefault = aU;
            return true;
        }

        public void LineInfo()
        {
            var doc = Doc(); if (doc == null) return;
            var warnings = new List<string>();
            var m = Load(doc, warnings, quiet: true) ?? new PathModel { Line = LoadLine(doc) };
            if (!EditLine(m.Line, "线体基本信息")) return;
            if (m.Segments.Count > 0) Save(doc, m, false); else _io.SaveCache(doc, JsonIO.Serialize(m));
            Msg.Info($"已保存。默认托辊间距 a0={m.Line.A0Default} m，aU={m.Line.AUDefault} m（表2-7）。");
        }

        public void SideTypeTemplate()
        {
            var doc = Doc(); if (doc == null) return;
            var line = LoadLine(doc);
            var classes = SideTypes.Classes.Select(c => (c.cls, $"{c.cls}  {c.name}")).ToArray();
            var profiles = SideTypes.Profiles.Select(p => (p.v.ToString(), $"{p.v}  {p.name}")).ToArray();
            var dlg = new PropertyDialog("侧型模板（手册表13-1，12 类 × 5 剖面）", new[]
            {
                FieldSpec.Combo("cls", "类别（驱动/拉紧布置）", classes, "C"),
                FieldSpec.Combo("prof", "剖面（承载形状）", profiles, "1"),
                FieldSpec.Number("Ln", "水平机长 Ln (m)", 100),
                FieldSpec.Number("H", "提升高度 H (m)", 10, "下运填负值"),
                FieldSpec.Number("tail", "尾部水平段长 (m)", 6, "受料段；推荐机尾长度见 2.3.3"),
                FieldSpec.Number("head", "头部水平段长 (m)", 6, "卸料段 2.3.4"),
                FieldSpec.Number("R", "凸/凹弧 R (m)", 60, "凸弧 Rmin 见式3-72/3-73；凹弧由网页按张力回填"),
                FieldSpec.Number("gap", "承载-回程间距 (m)", line.CarryReturnGap),
                FieldSpec.Number("D", "传动滚筒 D (mm)", 800, "改向滚筒按表2-5 自动匹配"),
                FieldSpec.Number("B", "带宽 B (mm)", line.B),
                FieldSpec.Number("rho", "堆积密度 ρ (kg/m³)", line.Rho),
                FieldSpec.Combo("sketch", "画在", new[]
                {
                    (SketchKinds.PlanarXz, "2D 侧型（前视，推荐）"),
                    (SketchKinds.Space3d, "3D 空间草图"),
                }, line.SketchKind == SketchKinds.Space3d ? SketchKinds.Space3d : SketchKinds.PlanarXz),
            }, "生成可编辑骨架：承载线 + 回程 + 滚筒 + 拉紧 + 清扫器点，全部可再改。现有 PIDM_PATH_SKEL 内容将被替换。");
            if (dlg.ShowDialog() != DialogResult.OK) return;
            var code = dlg.Str("cls") + dlg.Str("prof");
            line.B = dlg.Num("B") ?? line.B; line.Rho = dlg.Num("rho") ?? line.Rho;
            line.SketchKind = dlg.Str("sketch") ?? SketchKinds.PlanarXz;
            var p = new SideTypes.Params
            {
                Ln = dlg.Num("Ln") ?? 100, H = dlg.Num("H") ?? 10, TailFlat = dlg.Num("tail") ?? 6, HeadFlat = dlg.Num("head") ?? 6,
                ArcR = dlg.Num("R") ?? 60, Gap = dlg.Num("gap") ?? 1, DriveD = dlg.Num("D") ?? 800, Line = line
            };
            PathModel m;
            try { m = SideTypes.Build(code, p); }
            catch (Exception ex) { Msg.Error("生成失败：" + ex.Message); return; }
            if (_io.FindPathSketch(doc) != null && !Msg.Confirm("将清空现有 PIDM_PATH_SKEL 并重画为侧型 " + code + "，继续？")) return;
            Save(doc, m, true);
            var r = Checks.Run(m);
            Msg.Info($"已生成侧型 {code}：节点 {m.Nodes.Count}，段 {m.Segments.Count}，滚筒 {m.Drums.Count()}。\n门禁：{r.Errors.Count()} 错误 / {r.Warnings.Count()} 警告。\n下一步：拖动草图点调整位置 → 识别路径 → 自动分类 → 门禁检查 → 导出。");
        }

        public void ImportJson()
        {
            var doc = Doc(); if (doc == null) return;
            using (var ofd = new OpenFileDialog { Filter = "PIDM 路径 JSON|*.json", Title = "从网页导入路径包" })
            {
                if (ofd.ShowDialog() != DialogResult.OK) return;
                PathModel m;
                try { m = JsonIO.Load(ofd.FileName); }
                catch (Exception ex) { Msg.Error("读取失败：" + ex.Message); return; }
                if (string.IsNullOrEmpty(m.Line.SketchKind) || m.Line.SketchKind == SketchKinds.Space3d)
                    m.Line.SketchKind = SketchKinds.Infer(m.Nodes);
                if (_io.FindPathSketch(doc) != null && !Msg.Confirm("将用导入路径重画 PIDM_PATH_SKEL，继续？")) return;
                Save(doc, m, true);
                Msg.Info($"已导入：{m.Line.Name}，节点 {m.Nodes.Count}，段 {m.Segments.Count}。");
            }
        }

        // ================================================================== 组 2 承载
        public void Recognize()
        {
            var doc = Doc(); if (doc == null) return;
            var warnings = new List<string>();
            var m = Load(doc, warnings); if (m == null) return;
            if (m.Segments.All(s => string.IsNullOrEmpty(s.SubId))) Classifier.AutoClassify(m);
            Save(doc, m, false);
            var sb = new StringBuilder();
            sb.AppendLine($"识别完成：节点 {m.Nodes.Count}，段 {m.Segments.Count}（承载 {m.Segments.Count(s => s.Branch == Branches.Carry)} / 回程 {m.Segments.Count(s => s.Branch == Branches.Return)}）");
            sb.AppendLine($"承载展开长 ΣL = {m.TotalCarryLength:F2} m，水平投影 Ln = {m.HorizontalLength:F2} m，净提升 H = {m.NetLift:F2} m");
            var chainClosed = m.Segments.Any(s => s.Branch == Branches.Return);
            sb.AppendLine(chainClosed ? "已有回程分支。" : "尚无回程：放好滚筒后点“Auto 回程”，或手画回程线并“标为回程”。");
            foreach (var w in warnings) sb.AppendLine("⚠ " + w);
            Msg.Info(sb.ToString());
        }

        public void MarkBranch(string branch)
        {
            var doc = Doc(); if (doc == null) return;
            var w = new List<string>(); var m = Load(doc, w); if (m == null) return;
            var sel = SelectedSegments(doc, m);
            if (sel.Count == 0) { Msg.Warn("请先在草图中选中要标记的线段。"); return; }
            foreach (var s in sel) { s.Branch = branch; s.ClassifyStatus = "draft"; s.SubId = null; s.MajorId = null; }
            foreach (var n in m.Nodes)
            {
                var adj = m.Segments.Where(s => s.FromId == n.Id || s.ToId == n.Id).ToList();
                n.Branch = adj.Count > 0 && adj.All(s => s.Branch == Branches.Return) ? Branches.Return : Branches.Carry;
            }
            Classifier.AutoClassify(m);
            Save(doc, m, true);
            Msg.Info($"已把 {sel.Count} 段标为{(branch == Branches.Return ? "回程" : "承载")}。");
        }

        public void LoadSection()
        {
            var doc = Doc(); if (doc == null) return;
            var w = new List<string>(); var m = Load(doc, w); if (m == null) return;
            var sel = SelectedSegments(doc, m);
            if (sel.Count == 0) { Msg.Warn("请先选中受料段线段。"); return; }
            var s0 = sel[0];
            var dlg = new PropertyDialog("受料段（07 load）", new[]
            {
                FieldSpec.Combo("kind", "类型", new[] { ("load.1", "单点受料段"), ("load.2", "多点受料段"), ("load.3", "受料加速段") }, s0.SubId ?? "load.1"),
                FieldSpec.Number("chute", "导料槽拦板长度 l (m)", s0.ChuteLengthM ?? 3.0, "式3-27 Fgl；槽体 1500/2000 mm 组合（4.11）"),
                FieldSpec.Number("bw", "导料槽拦板内宽 b (m)", s0.ChuteWidthM ?? DefaultChuteWidth(m.Line.B), "表3-11 默认"),
                FieldSpec.Number("accel", "加速段长度 lb (m)", s0.AccelLengthM, "式 FbA 加速段；可空"),
                FieldSpec.Number("a", "受料段托辊间距 (m)", s0.AIdler ?? ManualRules.LoadIdlerSpacing(m.Line.A0Default), "2.5：承载间距的 1/2~1/3（缓冲托辊）"),
            }, "受料段应尽量水平；受料中心到尾滚筒距离 ≥ 推荐机尾长度（2.3.3）。");
            if (dlg.ShowDialog() != DialogResult.OK) return;
            foreach (var s in sel)
            {
                s.SetFlag("load", true); s.SetFlag("multi", dlg.Str("kind") == "load.2"); s.SetFlag("accel", dlg.Str("kind") == "load.3");
                s.ChuteLengthM = dlg.Num("chute"); s.ChuteWidthM = dlg.Num("bw"); s.AccelLengthM = dlg.Num("accel"); s.AIdler = dlg.Num("a");
                s.SubId = dlg.Str("kind"); s.MajorId = "load"; s.ClassifyStatus = "confirmed";
            }
            Save(doc, m, false);
        }

        static double DefaultChuteWidth(double bMm)
        {
            // 表3-11 导料槽拦板内宽 b/m
            var tbl = new (double B, double b)[] { (400, .3), (500, .315), (650, .4), (800, .495), (1000, .61), (1200, .73), (1400, .85), (1600, 1.1), (1800, 1.25), (2000, 1.4), (2200, 1.6), (2400, 1.8) };
            return tbl.OrderBy(t => Math.Abs(t.B - bMm)).First().b;
        }

        public void UnloadSection()
        {
            var doc = Doc(); if (doc == null) return;
            var w = new List<string>(); var m = Load(doc, w); if (m == null) return;
            var sel = SelectedSegments(doc, m);
            if (sel.Count == 0) { Msg.Warn("请先选中卸料段线段。"); return; }
            var dlg = new PropertyDialog("卸料段（08 unload）", new[]
            {
                FieldSpec.Combo("kind", "类型", new[] { ("unload.1", "头部卸料段"), ("unload.2", "犁式卸料段（式3-30）"), ("unload.3", "中部卸料段（卸料车，加 H′）") }, sel[0].SubId ?? "unload.1"),
            }, "倾斜输送机的卸料段最好水平；v≥3.15 m/s 应为水平段（2.3.4）。犁式卸料器带速 ≤2 m/s，卸料车 ≤2.5 m/s（2.2）。");
            if (dlg.ShowDialog() != DialogResult.OK) return;
            var k = dlg.Str("kind");
            foreach (var s in sel)
            {
                s.SetFlag("unload_head", k == "unload.1"); s.SetFlag("plow", k == "unload.2"); s.SetFlag("unload_mid", k == "unload.3");
                s.SubId = k; s.MajorId = "unload"; s.ClassifyStatus = "confirmed";
            }
            Save(doc, m, false);
        }

        public void TransitionSection()
        {
            var doc = Doc(); if (doc == null) return;
            var w = new List<string>(); var m = Load(doc, w); if (m == null) return;
            var sel = SelectedSegments(doc, m);
            if (sel.Count == 0) { Msg.Warn("请先选中过渡段线段（头部滚筒 → 第一组正常槽型托辊）。"); return; }
            var minA = ManualRules.MinTransitionLengthM(m.Line.B, m.Line.BeltCore, m.Line.TensionUtilization);
            var dlg = new PropertyDialog("过渡段（09 trans）", new[]
            {
                FieldSpec.Combo("kind", "位置", new[] { ("trans.1", "机头过渡段"), ("trans.2", "机尾过渡段") }, sel[0].SubId ?? "trans.1"),
            }, $"表2-4 推荐最小过渡段长度 A = {minA:F2} m（B={m.Line.B}，{(m.Line.BeltCore == "steel" ? "钢绳芯" : "织物芯")}，利用率 {m.Line.TensionUtilization}%）。所选段长 {sel[0].L:F2} m。");
            if (dlg.ShowDialog() != DialogResult.OK) return;
            var k = dlg.Str("kind");
            foreach (var s in sel) { s.SetFlag("trans_head", k == "trans.1"); s.SetFlag("trans_tail", k == "trans.2"); s.SubId = k; s.MajorId = "trans"; s.ClassifyStatus = "confirmed"; }
            Save(doc, m, false);
        }

        public void TiltIdlerSection()
        {
            var doc = Doc(); if (doc == null) return;
            var w = new List<string>(); var m = Load(doc, w); if (m == null) return;
            var sel = SelectedSegments(doc, m);
            if (sel.Count == 0) { Msg.Warn("请先选中装有前倾托辊的线段。"); return; }
            var dlg = new PropertyDialog("前倾托辊段（式3-25/3-26）", new[]
            {
                FieldSpec.Number("eps", "托辊前倾角 ε (°)", sel[0].TiltIdlerDeg ?? 1.5, "表3-7：1°20′~1°35′；0 = 取消"),
            }, "Lε = 装有前倾托辊的输送机长度；上下托辊都前倾时合并计算（3.4.4）。");
            if (dlg.ShowDialog() != DialogResult.OK) return;
            var e = dlg.Num("eps") ?? 0;
            foreach (var s in sel) { s.TiltIdlerDeg = e > 0 ? e : (double?)null; s.SetFlag("tilt_idler", e > 0); }
            Save(doc, m, false);
        }

        public void Arc(string curve)
        {
            var doc = Doc(); if (doc == null) return;
            var w = new List<string>(); var m = Load(doc, w); if (m == null) return;
            PathNode corner = SelectedNode(doc, m, false, out _);
            if (corner == null)
            {
                var sel = SelectedSegments(doc, m);
                if (sel.Count == 2)
                {
                    var shared = new[] { sel[0].FromId, sel[0].ToId }.Intersect(new[] { sel[1].FromId, sel[1].ToId }).FirstOrDefault();
                    if (shared != null) corner = m.Node(shared);
                }
            }
            if (corner == null) { Msg.Warn("请选中折点（草图点）或相邻两条线段。"); return; }
            if (corner.IsDrum) { Msg.Warn("滚筒处不能做弧段。"); return; }
            ManualRules.ConvexRmin(m.Line.B, m.Line.TroughAngle, m.Line.BeltCore, out var rLo, out var rHi);
            string banner = curve == "convex"
                ? $"凸弧 Rmin = {rLo:F1}~{rHi:F1} m（式3-72/3-73，B={m.Line.B}，λ={m.Line.TroughAngle}°）。>5 m 或钢绳芯：下分支加密托辊成弧（2.3.5）。"
                : "凹弧 R ≥ (1.3~1.5)·F/(qB·g)，F 为凹弧起点张力（式3-74）→ 由网页计算后回填校核。凹弧段禁设调心托辊；起点距导料槽 <5 m 须设压轮。";
            var dlg = new PropertyDialog(curve == "convex" ? "凸弧段" : "凹弧段", new[]
            {
                FieldSpec.Number("R", "曲率半径 R (m)", curve == "convex" ? Math.Ceiling(rHi) : 100),
            }, banner);
            if (dlg.ShowDialog() != DialogResult.OK) return;
            var R = dlg.Num("R") ?? 0;
            if (R <= 0) return;
            var arc = PathEdit.FilletAt(m, corner, R, curve);
            if (arc == null) { Msg.Warn("R 过大放不下（切线长超过相邻段长）或两段共线，请减小 R。"); return; }
            arc.AIdler = curve == "convex" ? ManualRules.ConvexIdlerSpacing(m.Line.A0Default) : (double?)null;
            Classifier.AutoClassify(m);
            Save(doc, m, true);
            Msg.Info($"已生成{(curve == "convex" ? "凸" : "凹")}弧：R={R} m，θ={arc.ThetaDeg:F2}°，弧弦长 {arc.L:F2} m。");
        }

        public void IdlerSpacing()
        {
            var doc = Doc(); if (doc == null) return;
            var w = new List<string>(); var m = Load(doc, w); if (m == null) return;
            var sel = SelectedSegments(doc, m);
            if (sel.Count == 0) { Msg.Warn("请先选中线段。"); return; }
            var isRet = sel[0].Branch == Branches.Return;
            var def = sel[0].AIdler ?? (isRet ? m.Line.AUDefault : m.Line.A0Default);
            var dlg = new PropertyDialog("托辊间距（表2-7 / 2.5）", new[]
            {
                FieldSpec.Number("a", isRet ? "回程托辊间距 aU (m)" : "承载托辊间距 a0 (m)", def, $"默认 a0={m.Line.A0Default} m，aU={m.Line.AUDefault} m；凸弧段 1/2；受料段 1/2~1/3"),
            });
            if (dlg.ShowDialog() != DialogResult.OK) return;
            foreach (var s in sel) s.AIdler = dlg.Num("a");
            Save(doc, m, false);
        }

        // ================================================================== 组 3 滚筒 / 附件
        public void InsertDrum(string type)
        {
            var doc = Doc(); if (doc == null) return;
            var w = new List<string>(); var m = Load(doc, w); if (m == null) return;
            var n = SelectedNode(doc, m, true, out var geomChanged);
            if (n == null) { Msg.Warn("请先选中路径上的一个草图点（折点或线上的点）。滚筒必须落在路径折点上。"); return; }
            if (!EditDrum(m, n, type)) return;
            Save(doc, m, geomChanged);
            var gaps = PathEdit.DrumGaps(m).Where(g => g.a == n || g.b == n).Select(g => $"{NodeTypes.Label(g.a.Type)}→{NodeTypes.Label(g.b.Type)} {g.dist:F2} m");
            Msg.Info($"已放置{NodeTypes.Label(type)} {n.Id}，D={n.DrumDmm} mm。\n相邻滚筒间距：{string.Join("；", gaps)}");
        }

        public void DrumProps()
        {
            var doc = Doc(); if (doc == null) return;
            var w = new List<string>(); var m = Load(doc, w); if (m == null) return;
            var n = SelectedNode(doc, m, false, out _);
            if (n == null || !n.IsDrum) { Msg.Warn("请先选中一个滚筒点。"); return; }
            if (!EditDrum(m, n, n.Type)) return;
            Save(doc, m, false);
        }

        bool EditDrum(PathModel m, PathNode n, string type)
        {
            var mainD = m.MainDrive?.DrumDmm ?? m.Nodes.FirstOrDefault(x => x.Type == NodeTypes.Drive)?.DrumDmm;
            var specs = new List<FieldSpec>();
            string title = NodeTypes.Label(type);
            switch (type)
            {
                case NodeTypes.Drive:
                    ManualRules.WrapAngleGuide(m.Nodes.Count(x => x.Type == NodeTypes.Drive && x != n) >= 1, out var lo, out var hi);
                    specs.Add(FieldSpec.Number("D", "直径 D (mm)", n.DrumDmm ?? 800, "表2-6 按张力利用率的最小直径；系列 " + string.Join("/", ManualRules.DrumSeries.Select(d => d.ToString()))));
                    specs.Add(FieldSpec.Combo("role", "驱动角色", new[] { ("main", "主传动（奔离点 S1）"), ("aux", "辅传动") }, n.IsMainDrive || m.MainDrive == null ? "main" : (n.DriveRole ?? "aux"), "全线主驱唯一（3.5.3.2）"));
                    specs.Add(FieldSpec.Combo("surf", "滚筒表面", new[] { ("rubber", "人字形沟槽橡胶 μ≈0.35~0.40"), ("bare", "光滑裸露钢 μ≈0.35~0.40"), ("ceramic", "陶瓷覆盖面 μ≈0.40~0.45"), ("polyurethane", "聚氨酯 μ≈0.40~0.45") }, "rubber", "表3-12（干态）"));
                    specs.Add(FieldSpec.Number("mu", "摩擦系数 μ（可覆盖）", n.Mu, "空 = 按表面类型取默认"));
                    specs.Add(FieldSpec.Number("wrap", "围包角 φ (°)", n.WrapDeg ?? (lo + hi) / 2, $"经验 {lo:F0}~{hi:F0}°（3.5.1）；增面轮可增大"));
                    specs.Add(FieldSpec.Text("code", "图号/型号（可选）", n.StdCode ?? ""));
                    break;
                case NodeTypes.Bend:
                case NodeTypes.Head:
                case NodeTypes.Tail:
                    var bk = n.BendKind ?? (type == NodeTypes.Tail ? BendKinds.Tail180 : type == NodeTypes.Head ? BendKinds.Head180 : BendKinds.Mid180);
                    var recD = mainD.HasValue ? ManualRules.MatchBendDiameter(mainD.Value, bk, m.Line.B) : (double?)null;
                    specs.Add(FieldSpec.Combo("bk", "改向类型", new[]
                    {
                        (BendKinds.Tail180, BendKinds.Label(BendKinds.Tail180)), (BendKinds.Mid180, BendKinds.Label(BendKinds.Mid180)),
                        (BendKinds.Head180, BendKinds.Label(BendKinds.Head180)), (BendKinds.Bend90, BendKinds.Label(BendKinds.Bend90)), (BendKinds.BendLt45, BendKinds.Label(BendKinds.BendLt45)),
                    }, bk, "表2-5 / 表3-10 列头"));
                    specs.Add(FieldSpec.Number("D", "直径 D (mm)", n.DrumDmm ?? recD ?? 630, recD.HasValue ? $"按传动滚筒 D={mainD} 匹配推荐 {recD} mm（表2-5）" : "先放传动滚筒可自动匹配（表2-5）"));
                    specs.Add(FieldSpec.Text("code", "图号（表3-27，可选）", n.StdCode ?? ""));
                    break;
                case NodeTypes.Takeup:
                    var recT = mainD.HasValue ? ManualRules.MatchBendDiameter(mainD.Value, BendKinds.Tail180, m.Line.B) : (double?)null;
                    specs.Add(FieldSpec.Combo("tk", "拉紧类型", new[]
                    {
                        (TakeupKinds.Gravity, TakeupKinds.Label(TakeupKinds.Gravity)), (TakeupKinds.Car, TakeupKinds.Label(TakeupKinds.Car)),
                        (TakeupKinds.Screw, TakeupKinds.Label(TakeupKinds.Screw)), (TakeupKinds.Winch, TakeupKinds.Label(TakeupKinds.Winch)),
                    }, n.TakeupKind ?? TakeupKinds.Gravity, "2.3.6：优先中部重锤靠近传动滚筒；螺旋仅 L<30 m"));
                    specs.Add(FieldSpec.Number("D", "直径 D (mm)", n.DrumDmm ?? recT ?? 630));
                    specs.Add(FieldSpec.Number("S", "拉紧行程 S (m)", n.TakeupTravelM, "式3-71：S=1.5·ε·L/2 + 安装行程；由网页校核"));
                    specs.Add(FieldSpec.Text("code", "型号（表6-30，可选）", n.StdCode ?? ""));
                    break;
            }
            var dlg = new PropertyDialog(title, specs);
            if (dlg.ShowDialog() != DialogResult.OK) return false;
            n.Type = type; n.DrumDmm = dlg.Num("D"); n.StdCode = dlg.Str("code");
            switch (type)
            {
                case NodeTypes.Drive:
                    n.DriveRole = dlg.Str("role"); n.IsMainDrive = n.DriveRole == "main";
                    n.Mu = dlg.Num("mu") ?? ManualRules.DefaultMu(dlg.Str("surf")); n.WrapDeg = dlg.Num("wrap");
                    if (n.IsMainDrive) PathEdit.SetMainDrive(m, n);
                    break;
                case NodeTypes.Takeup:
                    n.TakeupKind = dlg.Str("tk"); n.TakeupTravelM = dlg.Num("S"); n.DriveRole = "none"; n.IsMainDrive = false;
                    break;
                default:
                    n.BendKind = dlg.Str("bk"); n.DriveRole = "none"; n.IsMainDrive = false;
                    break;
            }
            n.Label = NodeTypes.Label(type);
            return true;
        }

        public void SetMainDrive()
        {
            var doc = Doc(); if (doc == null) return;
            var w = new List<string>(); var m = Load(doc, w); if (m == null) return;
            var n = SelectedNode(doc, m, false, out _);
            if (n == null || n.Type != NodeTypes.Drive) { Msg.Warn("请先选中一个传动滚筒点。"); return; }
            PathEdit.SetMainDrive(m, n);
            Save(doc, m, false);
            Msg.Info($"主传动 = {n.Id}，奔离点 S1 已设在此（3.5.3.2）。其余传动滚筒改为辅驱。");
        }

        public void Attachment(string kind)
        {
            var doc = Doc(); if (doc == null) return;
            var w = new List<string>(); var m = Load(doc, w); if (m == null) return;
            _io.ReadSelection(doc, out _, out var pts);
            if (pts.Count == 0) { Msg.Warn("请先在路径附近选中/绘制一个草图点作为附件位置。"); return; }
            var p = pts[0];
            string k = kind;
            if (kind == "cleaner")
            {
                var dlg = new PropertyDialog("清扫器（式3-28 n 个数）", new[]
                {
                    FieldSpec.Combo("k", "类型", new[] { (AttachmentKinds.CleanerHead, "头部清扫器（卸料滚筒处，4.8.1）"), (AttachmentKinds.CleanerReturn, "空段清扫器（尾部改向前 / 垂直拉紧第一个90°改向前，4.8.2）") }, AttachmentKinds.CleanerHead),
                }, "网页按 n 个清扫器计算 FS2；空段清扫器按 1.5·Fr 折算时在网页处理。");
                if (dlg.ShowDialog() != DialogResult.OK) return;
                k = dlg.Str("k");
            }
            var seg = ModelBuilder.NearestSegment(m, p);
            m.Attachments.Add(new Attachment { Id = m.NewAttId(), Kind = k, X = p.X, Y = p.Y, Z = p.Z, SegmentId = seg?.Id });
            if (k == AttachmentKinds.Plow && seg != null) { seg.SetFlag("plow", true); seg.SubId = "unload.2"; seg.MajorId = "unload"; }
            Save(doc, m, false);
            Msg.Info($"已放置{AttachmentKinds.Label(k)}（关联段 {seg?.Id}）。");
        }

        // ================================================================== 组 4 回程 / 闭环
        public void AutoReturnCmd()
        {
            var doc = Doc(); if (doc == null) return;
            var w = new List<string>(); var m = Load(doc, w); if (m == null) return;
            if (m.CarryNodes.Count() < 2) { Msg.Warn("承载节点不足。"); return; }
            var dlg = new PropertyDialog("Auto 回程（对标 Belt Analyst Auto Return）", new[]
            {
                FieldSpec.Number("gap", "承载-回程间距 (m)", m.Line.CarryReturnGap, "沿承载线法向向下偏移；头/尾滚筒处直接接入"),
            }, m.Segments.Any(s => s.Branch == Branches.Return) ? "已有回程将被覆盖（含手工回程与其上的滚筒）。手工细调请用 Advanced：直接改回程线后“标为回程”。" : "生成后可直接拖动回程点、拆段插滚筒（Advanced）。");
            if (dlg.ShowDialog() != DialogResult.OK) return;
            var gap = dlg.Num("gap") ?? m.Line.CarryReturnGap;
            if (m.Segments.Any(s => s.Branch == Branches.Return) && !Msg.Confirm("覆盖现有回程？")) return;
            m.Line.CarryReturnGap = gap;
            AutoReturn.Generate(m, gap);
            Classifier.AutoClassify(m);
            Save(doc, m, true);
            Msg.Info($"回程已生成：{m.Segments.Count(s => s.Branch == Branches.Return)} 段。下一步：在回程上放拉紧滚筒/改向滚筒（选点 → 拉紧滚筒）。");
        }

        public void ClosureCheck()
        {
            var doc = Doc(); if (doc == null) return;
            var w = new List<string>(); var m = Load(doc, w); if (m == null) return;
            var r = Checks.Run(m);
            var loop = r.Items.Where(i => i.Code == "CL_LOOP" || i.Code == "CL_NODES_MIN").ToList();
            var sb = new StringBuilder();
            sb.AppendLine(loop.Count == 0 ? "✔ 路径闭环：回程末端已接回尾滚筒。" : string.Join("\n", loop.Select(i => "✘ " + i.Message)));
            sb.AppendLine($"承载 {m.Segments.Count(s => s.Branch == Branches.Carry)} 段 / 回程 {m.Segments.Count(s => s.Branch == Branches.Return)} 段，总展开长 {m.TotalLength:F2} m");
            ManualRules.WrapCounts(m, out var n1, out var n2);
            sb.AppendLine($"绕带滚筒数 N1={n1}，改向滚筒数 N2={n2}（式3-23 缠绕/轴承阻力用）");
            foreach (var x in w) sb.AppendLine("⚠ " + x);
            Msg.Info(sb.ToString(), "闭合检查");
            _pane()?.Update(m);
        }

        public void DrumGaps()
        {
            var doc = Doc(); if (doc == null) return;
            var w = new List<string>(); var m = Load(doc, w); if (m == null) return;
            var gaps = PathEdit.DrumGaps(m);
            if (gaps.Count == 0) { Msg.Warn("尚无滚筒。"); return; }
            var sb = new StringBuilder("相邻滚筒中心距（沿运行方向）：\n\n");
            foreach (var g in gaps) sb.AppendLine($"{g.a.Id,-5}{NodeTypes.Label(g.a.Type),-6} → {g.b.Id,-5}{NodeTypes.Label(g.b.Type),-6}  {g.dist,9:F3} m   ΔH={g.b.Z - g.a.Z,8:F3} m");
            if (ManualRules.TakeupLH(m, out var lp, out var hp)) sb.AppendLine($"\n拉紧装置 ↔ 头部传动滚筒：L′={lp:F2} m，H′={hp:F2} m（式3-70）");
            new ReportDialog("滚筒间距", sb.ToString()).ShowDialog();
        }

        // ================================================================== 组 5 分类 / 点序 / 交付
        public void AutoClassify()
        {
            var doc = Doc(); if (doc == null) return;
            var w = new List<string>(); var m = Load(doc, w); if (m == null) return;
            Classifier.AutoClassify(m);
            Save(doc, m, false);
            var groups = m.Segments.GroupBy(s => s.MajorId).Select(g => $"{g.Key}: {g.Count()}");
            Msg.Info("自动分类完成（字典 01~12）：\n" + string.Join("，", groups) + "\n\n人工确认请选段后点“确认分类”。");
        }

        public void ConfirmClassify()
        {
            var doc = Doc(); if (doc == null) return;
            var w = new List<string>(); var m = Load(doc, w); if (m == null) return;
            var sel = SelectedSegments(doc, m);
            if (sel.Count == 0)
            {
                if (!Msg.Confirm("未选中线段：把全部已分类段标为 confirmed？")) return;
                foreach (var s in m.Segments.Where(s => !string.IsNullOrEmpty(s.SubId))) s.ClassifyStatus = "confirmed";
                Save(doc, m, false); return;
            }
            var opts = Classifier.SubCatalog.Select(c => (c.sub, $"{c.sub}  {c.name}")).ToArray();
            var dlg = new PropertyDialog("确认分类", new[] { FieldSpec.Combo("sub", "细分 sub_id", opts, sel[0].SubId ?? "carryH.1") },
                $"所选 {sel.Count} 段：L={sel.Sum(s => s.L):F2} m，δ={sel[0].DeltaDeg:F2}°，分支 {sel[0].Branch}");
            if (dlg.ShowDialog() != DialogResult.OK) return;
            foreach (var s in sel) { s.SubId = dlg.Str("sub"); s.MajorId = Classifier.MajorOf(s.SubId); s.ClassifyStatus = "confirmed"; }
            Save(doc, m, false);
        }

        public void SetPointRole(string role)
        {
            var doc = Doc(); if (doc == null) return;
            var w = new List<string>(); var m = Load(doc, w); if (m == null) return;
            var n = SelectedNode(doc, m, false, out _);
            if (n == null) { Msg.Warn("请先选中一个路径点。"); return; }
            if (role == PointRoles.Leave && n.Type != NodeTypes.Drive) { Msg.Warn("奔离点必须是（主）传动滚筒（3.5.3.2）。"); return; }
            foreach (var x in m.Nodes.Where(x => x.PointRole == role)) x.PointRole = PointRoles.None;
            n.PointRole = role;
            if (role == PointRoles.Leave) PathEdit.SetMainDrive(m, n);
            m.PointOrder.LeavePointNodeId = m.Nodes.FirstOrDefault(x => x.PointRole == PointRoles.Leave)?.Id;
            m.PointOrder.ManualP1NodeId = m.Nodes.FirstOrDefault(x => x.PointRole == PointRoles.Manual1)?.Id;
            m.PointOrder.ManualP2NodeId = m.Nodes.FirstOrDefault(x => x.PointRole == PointRoles.Manual2)?.Id;
            Save(doc, m, false);
        }

        public void CharacteristicPointsCmd()
        {
            var doc = Doc(); if (doc == null) return;
            var w = new List<string>(); var m = Load(doc, w); if (m == null) return;
            var pts = CharacteristicPoints.Build(m, w);
            m.PointOrder.AutoPoints = pts;
            var sb = new StringBuilder("特性点（3.5.3 逐点张力法，沿运行方向；仅编号与位置，张力由网页计算）：\n\n");
            foreach (var p in pts)
            {
                var n = m.Node(p.NodeId);
                sb.AppendLine($"S{p.TensionIndex,-3} {n.Id,-5} {n.P}  {p.Side,-9} {p.Note}");
            }
            foreach (var x in w) sb.AppendLine("⚠ " + x);
            _io.SaveCache(doc, JsonIO.Serialize(m));
            new ReportDialog("特性点预览", sb.ToString()).ShowDialog();
        }

        public void GateCheck()
        {
            var doc = Doc(); if (doc == null) return;
            var w = new List<string>(); var m = Load(doc, w); if (m == null) return;
            var r = Checks.Run(m);
            _io.SaveCache(doc, JsonIO.Serialize(m));
            _pane()?.Update(m);
            new ReportDialog(r.Ok ? "门禁检查：通过（可导出）" : "门禁检查：有错误（不可正式导出）", FormatChecks(r, w)).ShowDialog();
        }

        static string FormatChecks(ClosureResult r, List<string> extra)
        {
            var sb = new StringBuilder();
            sb.AppendLine($"错误 {r.Errors.Count()}  警告 {r.Warnings.Count()}  提示 {r.Items.Count(i => i.Level == "info")}\n");
            foreach (var lvl in new[] { "error", "warn", "info" })
                foreach (var i in r.Items.Where(x => x.Level == lvl))
                    sb.AppendLine($"{(lvl == "error" ? "✘" : lvl == "warn" ? "⚠" : "ℹ")} [{i.Code}] {i.Message}{(i.Ref != null ? $"   ——手册 {i.Ref}" : "")}");
            foreach (var e in extra) sb.AppendLine("⚠ " + e);
            return sb.ToString();
        }

        public void Export()
        {
            var doc = Doc(); if (doc == null) return;
            var w = new List<string>(); var m = Load(doc, w); if (m == null) return;
            m.PointOrder.AutoPoints = CharacteristicPoints.Build(m, w);
            m.PointOrder.LeavePointNodeId = m.Nodes.FirstOrDefault(x => x.PointRole == PointRoles.Leave)?.Id;
            m.PointOrder.ManualP1NodeId = m.Nodes.FirstOrDefault(x => x.PointRole == PointRoles.Manual1)?.Id;
            m.PointOrder.ManualP2NodeId = m.Nodes.FirstOrDefault(x => x.PointRole == PointRoles.Manual2)?.Id;
            var r = Checks.Run(m);
            if (!r.Ok && !Msg.Confirm($"门禁有 {r.Errors.Count()} 个错误，网页将拒绝正式计算。仍以“草稿”导出？\n\n{string.Join("\n", r.Errors.Take(6).Select(e => "✘ " + e.Message))}")) return;
            using (var sfd = new SaveFileDialog { Filter = "PIDM 路径 JSON|*.json", FileName = $"{Sanitize(m.Line.Name)}-pidm-path-v0.json", Title = "导出到网页" })
            {
                if (sfd.ShowDialog() != DialogResult.OK) return;
                m.Source = "sw_addin";
                JsonIO.Save(m, sfd.FileName);
                _io.SaveCache(doc, JsonIO.Serialize(m));
                Msg.Info($"已导出 {sfd.FileName}\n\n在网页 path-editor 中“导入 JSON”即可提取几何并计算（张力/功率/选型均在网页）。");
            }
        }

        static string Sanitize(string s) => string.Concat((s ?? "path").Select(c => Path_Invalid.Contains(c) ? '_' : c));
        static readonly char[] Path_Invalid = System.IO.Path.GetInvalidFileNameChars();

        public void RefreshPane()
        {
            var doc = Doc(); if (doc == null) return;
            var w = new List<string>(); var m = Load(doc, w, quiet: true);
            if (m != null) { Checks.Run(m); _pane()?.Update(m); }
        }

        // ================================================================== 无界面自测（COM 调用，不弹对话框）
        /// <summary>
        /// 真机冒烟：新建零件 → 生成侧型 C1 → 画草图写属性 → 从草图读回 → 门禁 → 导出 JSON → 保存零件。
        /// 返回多行报告；任何一步失败返回含 "FAIL" 的报告。
        /// </summary>
        public string RunSmokeTest(string outDir, string sideType = "C1")
        {
            var sb = new StringBuilder();
            void Ok(string s) => sb.AppendLine("[OK]   " + s);
            void Fail(string s) => sb.AppendLine("[FAIL] " + s);
            void Info(string s) => sb.AppendLine("[INFO] " + s);
            var sw = System.Diagnostics.Stopwatch.StartNew();
            try
            {
                if (string.IsNullOrWhiteSpace(outDir)) outDir = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "pidm-sw-smoke");
                System.IO.Directory.CreateDirectory(outDir);
                Info($"SolidWorks {_sw.RevisionNumber()}  输出目录 {outDir}");

                // 1 新建零件
                var tpl = _sw.GetUserPreferenceStringValue((int)SolidWorks.Interop.swconst.swUserPreferenceStringValue_e.swDefaultTemplatePart);
                if (string.IsNullOrEmpty(tpl) || !System.IO.File.Exists(tpl)) { Fail("默认零件模板不存在: " + tpl); return sb.ToString(); }
                var doc = (ModelDoc2)_sw.NewDocument(tpl, 0, 0, 0);
                if (doc == null) { Fail("NewDocument 返回 null"); return sb.ToString(); }
                Ok("新建零件 " + doc.GetTitle());

                // 2 生成模板
                var line = new LineParams { Name = "smoke-" + sideType, B = 1000, V = 2.0, Rho = 1600 };
                var m = SideTypes.Build(sideType, new SideTypes.Params { Ln = 120, H = 15, TailFlat = 8, HeadFlat = 6, ArcR = 60, Gap = 1.0, DriveD = 800, Line = line });
                Ok($"侧型 {sideType} 内存模型：节点 {m.Nodes.Count} 段 {m.Segments.Count} 滚筒 {m.Drums.Count()} 附件 {m.Attachments.Count}");

                // 3 画草图 + 写属性
                Save(doc, m, true);
                var feat = _io.FindPathSketch(doc);
                if (feat == null) { Fail("草图 PIDM_PATH_SKEL 未创建"); return sb.ToString(); }
                Ok("草图 PIDM_PATH_SKEL 已创建，类型 " + feat.GetTypeName2());
                var data = _io.Read(doc, feat);
                Info($"草图实体：线/弧 {data.Segments.Count}，带属性点 {data.Points.Count}");
                if (data.Segments.Count != m.Segments.Count) Fail($"线段数不符：草图 {data.Segments.Count} vs 模型 {m.Segments.Count}"); else Ok("线段数一致");
                int expectPts = m.Drums.Count() + m.Attachments.Count;
                if (data.Points.Count != expectPts) Fail($"属性点数不符：草图 {data.Points.Count} vs 期望 {expectPts}"); else Ok("滚筒/附件点数一致");
                int withAttr = data.Segments.Count(s => s.Attrs.Count > 0);
                if (withAttr != data.Segments.Count) Fail($"仅 {withAttr}/{data.Segments.Count} 条线段带 PIDM_SEG 属性（Attribute 写入失败）"); else Ok("所有线段带 PIDM_SEG 属性");
                if (!string.IsNullOrEmpty(_io.LoadCache(doc))) Ok("文档自定义属性 JSON 缓存已写入"); else Fail("JSON 缓存未写入");

                // 4 从草图读回
                var warnings = new List<string>();
                var back = Load(doc, warnings, quiet: true);
                if (back == null) { Fail("从草图读回失败"); return sb.ToString(); }
                foreach (var w in warnings) Info("读回提示: " + w);
                if (back.Nodes.Count != m.Nodes.Count) Fail($"读回节点数 {back.Nodes.Count} ≠ {m.Nodes.Count}"); else Ok("读回节点数一致");
                if (back.Drums.Count() != m.Drums.Count()) Fail($"读回滚筒数 {back.Drums.Count()} ≠ {m.Drums.Count()}"); else Ok("读回滚筒数一致");
                if (back.MainDrive == null) Fail("读回后无主传动"); else Ok($"读回主传动 {back.MainDrive.Id} D={back.MainDrive.DrumDmm}");
                if (Math.Abs(back.TotalLength - m.TotalLength) > 1e-3) Fail($"读回总长 {back.TotalLength:F3} ≠ {m.TotalLength:F3}"); else Ok($"读回总长一致 {back.TotalLength:F2} m");
                int arcs = back.Segments.Count(s => s.Curve != "none");
                if (arcs != m.Segments.Count(s => s.Curve != "none")) Fail($"读回弧段数 {arcs}"); else Ok($"读回弧段 {arcs} 条");
                if (back.CarryNodes.First().Type != NodeTypes.Tail && back.CarryNodes.First().Type != NodeTypes.Takeup) Fail("读回方向错误：承载首点不是尾滚筒"); else Ok("读回方向 尾→头");

                // 5 门禁
                var r = Checks.Run(back);
                if (r.Errors.Any()) Fail("门禁错误：" + string.Join(" | ", r.Errors.Select(e => e.Code + " " + e.Message))); else Ok($"门禁 0 错误 / {r.Warnings.Count()} 警告 / {r.Items.Count(i => i.Level == "info")} 提示");

                // 6 导出 + 保存
                back.PointOrder.AutoPoints = CharacteristicPoints.Build(back, warnings);
                var json = System.IO.Path.Combine(outDir, $"smoke-{sideType}-pidm-path-v0.json");
                JsonIO.Save(back, json);
                Ok("导出 " + json);
                var part = System.IO.Path.Combine(outDir, $"smoke-{sideType}.SLDPRT");
                int errs = 0, warns = 0;
                bool saved = doc.Extension.SaveAs3(part, (int)SolidWorks.Interop.swconst.swSaveAsVersion_e.swSaveAsCurrentVersion, (int)SolidWorks.Interop.swconst.swSaveAsOptions_e.swSaveAsOptions_Silent, null, null, ref errs, ref warns);
                if (saved) Ok("保存零件 " + part); else Fail($"保存零件失败 err={errs} warn={warns}");

                // 7 重开验证持久化
                _sw.CloseDoc(doc.GetTitle());
                int e2 = 0, w2 = 0;
                var reopened = (ModelDoc2)_sw.OpenDoc6(part, (int)SolidWorks.Interop.swconst.swDocumentTypes_e.swDocPART, (int)SolidWorks.Interop.swconst.swOpenDocOptions_e.swOpenDocOptions_Silent, "", ref e2, ref w2);
                if (reopened == null) Fail("重开零件失败");
                else
                {
                    var w3 = new List<string>();
                    var again = Load(reopened, w3, quiet: true);
                    if (again == null) Fail("重开后读取路径失败");
                    else if (again.Drums.Count() != m.Drums.Count() || again.MainDrive == null) Fail($"重开后属性丢失：滚筒 {again.Drums.Count()}，主驱 {(again.MainDrive == null ? "无" : "有")}");
                    else Ok("重开后属性完整（滚筒/主驱/分类保留）");
                    _pane()?.Update(again);
                }
            }
            catch (Exception ex)
            {
                Fail("异常：" + ex.GetType().Name + " " + ex.Message);
                sb.AppendLine(ex.StackTrace);
            }
            sb.AppendLine($"耗时 {sw.ElapsedMilliseconds} ms   结果：{(sb.ToString().Contains("[FAIL]") ? "FAIL" : "PASS")}");
            return sb.ToString();
        }
    }
}
