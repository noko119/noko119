using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;

namespace PidmPath.Core
{
    /// <summary>草图原始数据 ↔ PathModel 的装配与属性编解码。</summary>
    public static class ModelBuilder
    {
        public const double DrumSnapTol = 0.05; // 滚筒点吸附到路径节点的容差 m

        public static PathModel Build(ChainResult chain, IList<RawPoint> points, LineParams line, List<string> warnings)
        {
            var m = new PathModel { Line = line ?? new LineParams() };
            warnings = warnings ?? new List<string>();
            if (chain.Ordered.Count == 0) return m;

            // 节点
            PathNode NodeAt(Vec3 p)
            {
                var ex = m.Nodes.FirstOrDefault(n => n.P.DistanceTo(p) <= Chainer.DefaultTol);
                if (ex != null) return ex;
                var n2 = new PathNode { Id = m.NewNodeId(), X = p.X, Y = p.Y, Z = p.Z, Seq = m.Nodes.Count + 1 };
                m.Nodes.Add(n2); return n2;
            }

            foreach (var os in chain.Ordered)
            {
                var a = NodeAt(os.Start); var b = NodeAt(os.End);
                var s = new PathSegment { Id = m.NewSegId(), FromId = a.Id, ToId = b.Id, SwEntity = os.Seg.Key };
                ApplySegmentAttrs(s, os.Seg.Attrs);
                if (os.Seg.IsArc)
                {
                    if (s.Curve == "none")
                    {
                        // 弧中点在弦上方 → 凸弧；下方 → 凹弧
                        var chordMidZ = (os.Start.Z + os.End.Z) / 2;
                        s.Curve = os.Seg.Mid.Z >= chordMidZ ? "convex" : "concave";
                    }
                    if (!s.R.HasValue && os.Seg.R > 0) s.R = os.Seg.R;
                }
                m.Segments.Add(s);
            }

            // 分支：节点分支由相邻段决定（全为回程 → 回程）
            foreach (var n in m.Nodes)
            {
                var adj = m.Segments.Where(s => s.FromId == n.Id || s.ToId == n.Id).ToList();
                n.Branch = adj.Count > 0 && adj.All(s => s.Branch == Branches.Return) ? Branches.Return : Branches.Carry;
            }

            // 滚筒 / 附件点
            foreach (var rp in points ?? new List<RawPoint>())
            {
                if (rp.Attrs.ContainsKey(PidmKeys.AttKind))
                {
                    var att = new Attachment { Id = m.NewAttId(), Kind = rp.Attrs[PidmKeys.AttKind], X = rp.P.X, Y = rp.P.Y, Z = rp.P.Z, SwEntity = rp.Key };
                    if (rp.Attrs.TryGetValue(PidmKeys.AttId, out var aid) && !string.IsNullOrEmpty(aid)) att.Id = aid;
                    att.SegmentId = NearestSegment(m, rp.P)?.Id;
                    m.Attachments.Add(att);
                    continue;
                }
                if (!rp.Attrs.ContainsKey(PidmKeys.Type)) continue;
                var node = m.Nodes.OrderBy(n => n.P.DistanceTo(rp.P)).FirstOrDefault();
                if (node == null || node.P.DistanceTo(rp.P) > DrumSnapTol)
                {
                    warnings.Add($"滚筒点 {rp.P} 不在路径节点上（>{DrumSnapTol * 1000:F0} mm），已忽略；请把滚筒放在折点上。");
                    continue;
                }
                ApplyNodeAttrs(node, rp.Attrs);
                node.SwEntity = rp.Key;
            }

            // 重新编号：承载先按链序，回程接续
            int seq = 1;
            foreach (var n in m.Nodes) n.Seq = seq++;
            m.RecomputeGeometry();
            m.Closure = null;
            return m;
        }

        public static PathSegment NearestSegment(PathModel m, Vec3 p)
        {
            PathSegment best = null; double bd = double.MaxValue;
            foreach (var s in m.Segments)
            {
                var a = m.Node(s.FromId); var b = m.Node(s.ToId);
                if (a == null || b == null) continue;
                var d = PointSegDist(p, a.P, b.P);
                if (d < bd) { bd = d; best = s; }
            }
            return best;
        }

        public static double PointSegDist(Vec3 p, Vec3 a, Vec3 b)
        {
            var ab = b - a; var l2 = ab.X * ab.X + ab.Y * ab.Y + ab.Z * ab.Z;
            if (l2 < 1e-18) return p.DistanceTo(a);
            var ap = p - a;
            var t = Math.Max(0, Math.Min(1, (ap.X * ab.X + ap.Y * ab.Y + ap.Z * ab.Z) / l2));
            return p.DistanceTo(a + ab * t);
        }

        // ---------- 属性编解码 ----------
        static readonly CultureInfo Inv = CultureInfo.InvariantCulture;
        static double? D(Dictionary<string, string> a, string k)
            => a.TryGetValue(k, out var v) && double.TryParse(v, NumberStyles.Float, Inv, out var d) ? d : (double?)null;
        static string S(Dictionary<string, string> a, string k) => a.TryGetValue(k, out var v) && !string.IsNullOrEmpty(v) ? v : null;

        public static void ApplySegmentAttrs(PathSegment s, Dictionary<string, string> a)
        {
            if (a == null || a.Count == 0) return;
            s.Id = S(a, PidmKeys.SegId) ?? s.Id;
            s.Branch = S(a, PidmKeys.Branch) ?? s.Branch;
            s.MajorId = S(a, PidmKeys.Major) ?? s.MajorId;
            s.SubId = S(a, PidmKeys.Sub) ?? s.SubId;
            s.AIdler = D(a, PidmKeys.AIdler) ?? s.AIdler;
            s.Curve = S(a, PidmKeys.Curve) ?? s.Curve;
            s.R = D(a, PidmKeys.R) ?? s.R;
            s.ChuteLengthM = D(a, PidmKeys.ChuteLen) ?? s.ChuteLengthM;
            s.ChuteWidthM = D(a, PidmKeys.ChuteWidth) ?? s.ChuteWidthM;
            s.AccelLengthM = D(a, PidmKeys.AccelLen) ?? s.AccelLengthM;
            s.TiltIdlerDeg = D(a, PidmKeys.TiltIdlerDeg) ?? s.TiltIdlerDeg;
            s.ClassifyStatus = S(a, PidmKeys.Classify) ?? s.ClassifyStatus;
            var f = S(a, PidmKeys.Flags);
            if (f != null) s.Flags = f.Split(new[] { ';', ',' }, StringSplitOptions.RemoveEmptyEntries).Select(x => x.Trim()).ToList();
            if (s.AIdler.HasValue && s.AIdler.Value <= 0) s.AIdler = null;
            if (s.R.HasValue && s.R.Value <= 0) s.R = null;
        }

        public static Dictionary<string, string> SegmentAttrs(PathSegment s)
        {
            var a = new Dictionary<string, string>
            {
                [PidmKeys.SegId] = s.Id ?? "",
                [PidmKeys.Branch] = s.Branch ?? Branches.Carry,
                [PidmKeys.Major] = s.MajorId ?? "",
                [PidmKeys.Sub] = s.SubId ?? "",
                [PidmKeys.AIdler] = (s.AIdler ?? 0).ToString(Inv),
                [PidmKeys.Curve] = s.Curve ?? "none",
                [PidmKeys.R] = (s.R ?? 0).ToString(Inv),
                [PidmKeys.Flags] = string.Join(";", s.Flags ?? new List<string>()),
                [PidmKeys.ChuteLen] = (s.ChuteLengthM ?? 0).ToString(Inv),
                [PidmKeys.ChuteWidth] = (s.ChuteWidthM ?? 0).ToString(Inv),
                [PidmKeys.AccelLen] = (s.AccelLengthM ?? 0).ToString(Inv),
                [PidmKeys.TiltIdlerDeg] = (s.TiltIdlerDeg ?? 0).ToString(Inv),
                [PidmKeys.Classify] = s.ClassifyStatus ?? "draft",
            };
            return a;
        }

        public static void ApplyNodeAttrs(PathNode n, Dictionary<string, string> a)
        {
            if (a == null || a.Count == 0) return;
            n.Id = S(a, PidmKeys.NodeId) ?? n.Id;
            n.Type = S(a, PidmKeys.Type) ?? n.Type;
            n.DrumDmm = D(a, PidmKeys.DMm) ?? n.DrumDmm;
            n.DriveRole = S(a, PidmKeys.DriveRole) ?? n.DriveRole;
            n.IsMainDrive = n.Type == NodeTypes.Drive && n.DriveRole == "main";
            n.Mu = D(a, PidmKeys.Mu) ?? n.Mu;
            n.WrapDeg = D(a, PidmKeys.WrapDeg) ?? n.WrapDeg;
            n.TakeupKind = S(a, PidmKeys.TakeupKind) ?? n.TakeupKind;
            n.TakeupTravelM = D(a, PidmKeys.TakeupTravel) ?? n.TakeupTravelM;
            n.PointRole = S(a, PidmKeys.PointRole) ?? n.PointRole;
            n.BendKind = S(a, PidmKeys.BendKind) ?? n.BendKind;
            n.StdCode = S(a, PidmKeys.StdCode) ?? n.StdCode;
            if (n.DrumDmm.HasValue && n.DrumDmm.Value <= 0) n.DrumDmm = null;
            if (n.Mu.HasValue && n.Mu.Value <= 0) n.Mu = null;
            if (n.WrapDeg.HasValue && n.WrapDeg.Value <= 0) n.WrapDeg = null;
            if (n.TakeupTravelM.HasValue && n.TakeupTravelM.Value <= 0) n.TakeupTravelM = null;
        }

        public static Dictionary<string, string> NodeAttrs(PathNode n)
        {
            return new Dictionary<string, string>
            {
                [PidmKeys.NodeId] = n.Id ?? "",
                [PidmKeys.Type] = n.Type ?? NodeTypes.Node,
                [PidmKeys.DMm] = (n.DrumDmm ?? 0).ToString(Inv),
                [PidmKeys.DriveRole] = n.Type == NodeTypes.Drive ? (n.IsMainDrive ? "main" : (n.DriveRole ?? "aux")) : (n.DriveRole ?? "none"),
                [PidmKeys.Mu] = (n.Mu ?? 0).ToString(Inv),
                [PidmKeys.WrapDeg] = (n.WrapDeg ?? 0).ToString(Inv),
                [PidmKeys.TakeupKind] = n.TakeupKind ?? "",
                [PidmKeys.TakeupTravel] = (n.TakeupTravelM ?? 0).ToString(Inv),
                [PidmKeys.PointRole] = n.PointRole ?? PointRoles.None,
                [PidmKeys.BendKind] = n.BendKind ?? "",
                [PidmKeys.StdCode] = n.StdCode ?? "",
            };
        }

        public static Dictionary<string, string> AttachmentAttrs(Attachment a)
            => new Dictionary<string, string> { [PidmKeys.AttId] = a.Id ?? "", [PidmKeys.AttKind] = a.Kind ?? "" };

        /// <summary>所有属性定义的参数名清单（AddIn 注册 AttributeDef 用）。</summary>
        public static string[] SegmentParamNames => SegmentAttrs(new PathSegment()).Keys.ToArray();
        public static string[] NodeParamNames => NodeAttrs(new PathNode()).Keys.ToArray();
        public static string[] AttachmentParamNames => AttachmentAttrs(new Attachment()).Keys.ToArray();
    }
}
