using System;
using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json;

namespace PidmPath.Core
{
    [JsonObject(MemberSerialization.OptIn)]
    public class CheckItem
    {
        [JsonProperty("code")] public string Code;
        [JsonProperty("level")] public string Level; // error | warn | info
        [JsonProperty("message")] public string Message;
        [JsonProperty("ref", NullValueHandling = NullValueHandling.Ignore)] public string Ref; // 手册章节
        [JsonProperty("target", NullValueHandling = NullValueHandling.Ignore)] public string Target; // node/seg id
        public override string ToString() => $"[{Level}] {Code}: {Message}" + (Ref != null ? $"（{Ref}）" : "");
    }

    [JsonObject(MemberSerialization.OptIn)]
    public class ClosureResult
    {
        [JsonProperty("ok")] public bool Ok => Items.All(i => i.Level != "error");
        [JsonProperty("items")] public List<CheckItem> Items = new List<CheckItem>();
        public IEnumerable<CheckItem> Errors => Items.Where(i => i.Level == "error");
        public IEnumerable<CheckItem> Warnings => Items.Where(i => i.Level == "warn");
    }

    /// <summary>门禁检查：契约 CL_* + 手册侧型规则提示。</summary>
    public static class Checks
    {
        public static ClosureResult Run(PathModel m)
        {
            var r = new ClosureResult();
            void Add(string code, string level, string msg, string @ref = null, string target = null)
                => r.Items.Add(new CheckItem { Code = code, Level = level, Message = msg, Ref = @ref, Target = target });

            m.RecomputeGeometry();
            var L = m.Line;
            var carry = m.CarryNodes.ToList();
            var carrySegs = m.Segments.Where(s => s.Branch == Branches.Carry).ToList();
            var retSegs = m.Segments.Where(s => s.Branch == Branches.Return).ToList();

            // ---- 契约门禁 ----
            if (m.Nodes.Count < 3) Add("CL_NODES_MIN", "error", "节点数不足 3。");
            if (m.Nodes.Any(n => double.IsNaN(n.X) || double.IsNaN(n.Y) || double.IsNaN(n.Z) || double.IsInfinity(n.X + n.Y + n.Z)))
                Add("CL_XYZ_FINITE", "error", "存在非有限坐标。");
            if (retSegs.Count == 0) Add("CL_LOOP", "error", "没有回程分支，路径未闭环。请用 Auto 回程或手画回程并标为回程。");
            else
            {
                var order = CharacteristicPoints.LoopOrder(m);
                var last = order.LastOrDefault();
                bool closes = last != null && carry.Count > 0 && m.Segments.Any(s => s.Branch == Branches.Return &&
                    ((s.FromId == last.Id && s.ToId == carry.First().Id) || (s.ToId == last.Id && s.FromId == carry.First().Id)));
                if (!closes && !(last != null && last.Id == carry.First().Id)) Add("CL_LOOP", "error", "回程末端未接回尾滚筒/承载首点，存在断口。");
            }
            var drives = m.Nodes.Where(n => n.Type == NodeTypes.Drive).ToList();
            var mains = drives.Where(n => n.IsMainDrive).ToList();
            if (drives.Count == 0) Add("CL_MAIN_DRIVE", "error", "没有传动滚筒。");
            else if (mains.Count != 1) Add("CL_MAIN_DRIVE", "error", $"主传动滚筒必须恰好 1 个，当前 {mains.Count} 个。", "3.5.3.2");
            var leave = m.Nodes.FirstOrDefault(n => n.PointRole == PointRoles.Leave);
            if (leave == null) Add("CL_LEAVE_IS_S1", "error", "未指定奔离点（张力点 S1）。请在主传动滚筒上点“奔离点”。", "3.5.3.2");
            else if (mains.Count == 1 && leave.Id != mains[0].Id) Add("CL_LEAVE_IS_S1", "error", "奔离点必须是主传动滚筒。", "3.5.3.2", leave.Id);
            if (!m.Nodes.Any(n => n.PointRole == PointRoles.Manual1) || !m.Nodes.Any(n => n.PointRole == PointRoles.Manual2))
                Add("CL_P1_P2", "warn", "手定特性点 1/2 未全部指定（网页计算时可补）。");
            foreach (var n in m.Nodes.Where(n => n.IsDrum && !(n.DrumDmm > 0)))
                Add("CL_DRUM_D", "error", $"{NodeTypes.Label(n.Type)} {n.Id} 缺直径 D。", null, n.Id);
            foreach (var s in m.Segments.Where(s => s.Curve != "none" && !(s.R > 0)))
                Add("CL_ARC_R", "error", $"弧段 {s.Id} 缺曲率半径 R。", "3.11", s.Id);
            foreach (var s in m.Segments.Where(s => string.IsNullOrEmpty(s.SubId)))
                Add("CL_SEG_CLASS", "error", $"段 {s.Id} 未分类，请先“自动分类”。", null, s.Id);
            var drafts = m.Segments.Count(s => !string.IsNullOrEmpty(s.SubId) && s.ClassifyStatus != "confirmed");
            if (drafts > 0) Add("CL_SEG_CLASS", "warn", $"{drafts} 段分类仍为 draft，导出前建议“确认分类”。");
            foreach (var n in drives.Where(n => !(n.Mu > 0)))
                Add("CL_DRIVE_MU", "warn", $"传动滚筒 {n.Id} 未填摩擦系数 μ（表3-12），网页将用默认值。", "表3-12", n.Id);
            foreach (var n in m.Nodes.Where(n => n.Type == NodeTypes.Takeup && string.IsNullOrEmpty(n.TakeupKind)))
                Add("CL_TAKEUP_KIND", "error", $"拉紧滚筒 {n.Id} 未选拉紧类型。", "2.3.6", n.Id);

            // ---- 手册侧型规则 ----
            // 2.3.2 倾角
            foreach (var s in carrySegs)
                foreach (var h in ManualRules.InclineHints(s.DeltaDeg, L.V, L.TroughAngle))
                    Add("MR_INCLINE", "warn", $"段 {s.Id}：{h}", "2.3.2", s.Id);

            // 2.3.3 机尾长度：受料段起点 → 尾滚筒
            var tail = carry.FirstOrDefault(n => n.Type == NodeTypes.Tail) ?? carry.FirstOrDefault();
            var loadSeg = carrySegs.FirstOrDefault(s => s.HasFlag("load"));
            if (tail != null && loadSeg != null)
            {
                var a = m.Node(loadSeg.FromId); var b = m.Node(loadSeg.ToId);
                var mid = (a.P + b.P) * 0.5;
                var l = mid.DistanceTo(tail.P) * 1000;
                var rec = ManualRules.RecommendedTailLengthMm(L.B);
                if (l < rec) Add("MR_TAIL_LEN", "warn", $"受料中心到尾滚筒 {l:F0} mm < 推荐机尾长度 {rec:F0} mm（B={L.B}）。", "2.3.3", loadSeg.Id);
                if (Math.Abs(loadSeg.DeltaDeg) > 1) Add("MR_LOAD_FLAT", "warn", $"受料段倾角 {loadSeg.DeltaDeg:F1}°，受料段应尽量设计为水平段。", "2.3.3", loadSeg.Id);
                if (!(loadSeg.ChuteLengthM > 0)) Add("MR_CHUTE", "warn", $"受料段 {loadSeg.Id} 未填导料槽长度（FS1/Fgl 需要）。", "3.4.4", loadSeg.Id);
                // 压轮：凹弧起点距导料槽 <5 m
                var concave = carrySegs.FirstOrDefault(s => s.Curve == "concave");
                if (concave != null)
                {
                    var cs = m.Node(concave.FromId);
                    var d = cs.P.DistanceTo(b.P);
                    bool hasRoller = m.Attachments.Any(x => x.Kind == AttachmentKinds.PressureRoller);
                    if (d < ManualRules.PressureRollerDistanceM && !hasRoller)
                        Add("MR_PRESS_ROLLER", "warn", $"凹弧起点距导料槽出口 {d:F1} m < 5 m，必须在导料槽与凹弧起点间设置压轮。", "2.3.3 图2-2", concave.Id);
                }
            }
            else if (loadSeg == null) Add("MR_LOAD_SEG", "warn", "未标记受料段（load）。", "2.3.3");

            // 2.3.4 卸料段
            var lastCarry = carrySegs.LastOrDefault();
            if (lastCarry != null)
                foreach (var h in ManualRules.DischargeHints(lastCarry.DeltaDeg, L.V)) Add("MR_DISCHARGE", "info", h, "2.3.4", lastCarry.Id);

            // 2.3.5 / 3.11 弧段
            ManualRules.ConvexRmin(L.B, L.TroughAngle, L.BeltCore, out var rLo, out var rHi);
            foreach (var s in m.Segments.Where(s => s.Curve == "convex" && s.R > 0))
            {
                if (s.R < rLo) Add("MR_CONVEX_R", "warn", $"凸弧 {s.Id} R={s.R:F1} m < Rmin {rLo:F1}~{rHi:F1} m（{(L.BeltCore == "steel" ? "钢绳芯" : "织物芯")}，B={L.B}，λ={L.TroughAngle}°）。", "3.11.1 式3-72/3-73", s.Id);
                if (s.L > ManualRules.ConvexLengthDenseIdlerM || L.BeltCore == "steel")
                    Add("MR_CONVEX_IDLER", "info", $"凸弧 {s.Id} 长 {s.L:F1} m（>5 m 或钢绳芯）：下分支应加密托辊成弧，不宜用改向滚筒。", "2.3.5", s.Id);
            }
            foreach (var s in m.Segments.Where(s => s.Curve == "concave"))
                Add("MR_CONCAVE_R", "info", $"凹弧 {s.Id} 最小半径 R≥(1.3~1.5)·F/(qB·g) 取决于起点张力，由网页计算后回填；凹弧段不得设调心托辊。", "3.11.2 式3-74 / 2.3.5", s.Id);

            // 2.3.7 过渡段
            var head = carry.LastOrDefault();
            var transHead = carrySegs.FirstOrDefault(s => s.HasFlag("trans_head"));
            var minA = ManualRules.MinTransitionLengthM(L.B, L.BeltCore, L.TensionUtilization);
            if (transHead == null) Add("MR_TRANS", "info", $"未标记机头过渡段；推荐最小过渡段长度 A≈{minA:F2} m（张力利用率 {L.TensionUtilization}%）。", "2.3.7 表2-4");
            else if (transHead.L < minA) Add("MR_TRANS", "warn", $"机头过渡段 {transHead.L:F2} m < 推荐最小 {minA:F2} m。", "2.3.7 表2-4", transHead.Id);
            if (L.TroughAngle >= 45 && !carrySegs.Any(s => s.HasFlag("trans_tail")))
                Add("MR_TRANS_TAIL", "info", "采用 45° 深槽托辊时，尾部改向滚筒与第一组 45° 托辊间至少加一组 35°（或30°）过渡托辊。", "2.3.7");

            // 2.3.6 拉紧
            var takeups = m.Nodes.Where(n => n.Type == NodeTypes.Takeup).ToList();
            if (takeups.Count == 0) Add("MR_TAKEUP", "warn", "没有拉紧滚筒。三种拉紧方式中应优先采用中部重锤拉紧并尽量靠近传动滚筒。", "2.3.6");
            foreach (var t in takeups)
                foreach (var h in ManualRules.TakeupHints(t.TakeupKind, m.TotalCarryLength, L.Rho < 1000))
                    Add("MR_TAKEUP", "info", h, "2.3.6", t.Id);

            // 2.4 滚筒匹配
            var mainD = mains.FirstOrDefault()?.DrumDmm;
            if (mainD > 0)
                foreach (var n in m.Nodes.Where(n => n.Type == NodeTypes.Bend && n.DrumDmm > 0))
                {
                    var rec = ManualRules.MatchBendDiameter(mainD.Value, n.BendKind, L.B);
                    if (Math.Abs(rec - n.DrumDmm.Value) > 1)
                        Add("MR_DRUM_MATCH", "info", $"改向滚筒 {n.Id}（{BendKinds.Label(n.BendKind)}）D={n.DrumDmm} mm，按传动滚筒 D={mainD} 匹配推荐 {rec} mm（合力不够时可放大）。", "2.4 表2-5", n.Id);
                }

            // 3.5.1 包角
            ManualRules.WrapAngleGuide(drives.Count >= 2, out var wLo, out var wHi);
            var wrapSum = drives.Sum(n => n.WrapDeg ?? 0);
            if (drives.Count > 0 && wrapSum > 0 && (wrapSum < wLo - 15 || wrapSum > wHi + 15))
                Add("MR_WRAP", "info", $"传动滚筒总围包角 {wrapSum:F0}°，经验值 {wLo:F0}~{wHi:F0}°。", "3.5.1");

            // 3.4.5 清扫器
            if (!m.Attachments.Any(a => a.Kind == AttachmentKinds.CleanerHead)) Add("MR_CLEANER", "info", "未放置头部清扫器（卸料滚筒处）。", "4.8.1");
            if (!m.Attachments.Any(a => a.Kind == AttachmentKinds.CleanerReturn)) Add("MR_CLEANER", "info", "未放置空段清扫器（尾部改向滚筒前、垂直拉紧第一个 90° 改向前）。", "4.8.2");

            // 2.5 托辊间距
            foreach (var s in m.Segments.Where(s => s.Curve == "convex" && s.AIdler.HasValue && s.AIdler > ManualRules.ConvexIdlerSpacing(L.A0Default) + 1e-6))
                Add("MR_IDLER", "info", $"凸弧段 {s.Id} 托辊间距 {s.AIdler} m，一般取承载间距的 1/2（{ManualRules.ConvexIdlerSpacing(L.A0Default):F2} m）。", "2.5", s.Id);

            m.Closure = r;
            return r;
        }
    }
}
