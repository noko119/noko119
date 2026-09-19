using System;
using System.Collections.Generic;
using System.Linq;

namespace PidmPath.Core
{
    /// <summary>对 PathModel 的结构性编辑（拆段、插点、圆化角点、设滚筒等），供模板与按钮共用。</summary>
    public static class PathEdit
    {
        /// <summary>在段 seg 上点 p 处拆分为两段，返回新节点。属性复制到两段。</summary>
        public static PathNode SplitSegment(PathModel m, PathSegment seg, Vec3 p)
        {
            var n = new PathNode { Id = m.NewNodeId(), X = p.X, Y = p.Y, Z = p.Z, Type = NodeTypes.Node, Branch = seg.Branch };
            int idx = m.Nodes.IndexOf(m.Node(seg.FromId));
            m.Nodes.Insert(Math.Min(m.Nodes.Count, idx + 1), n);
            var s2 = new PathSegment
            {
                Id = m.NewSegId(), FromId = n.Id, ToId = seg.ToId, Branch = seg.Branch, MajorId = seg.MajorId, SubId = seg.SubId,
                AIdler = seg.AIdler, Flags = new List<string>(seg.Flags ?? new List<string>()), ClassifyStatus = "draft"
            };
            seg.ToId = n.Id;
            m.Segments.Insert(m.Segments.IndexOf(seg) + 1, s2);
            Renumber(m);
            return n;
        }

        /// <summary>在节点 after 之后（沿其分支段方向）插入一串节点：after → p1 → p2 … → 原下一节点。</summary>
        public static List<PathNode> InsertAfter(PathModel m, PathNode after, IList<Vec3> pts, string branch)
        {
            var created = new List<PathNode>();
            var outSeg = m.Segments.FirstOrDefault(s => s.FromId == after.Id && s.Branch == branch);
            if (outSeg == null || pts.Count == 0) return created;
            var origTo = outSeg.ToId;
            var prev = after;
            int segIdx = m.Segments.IndexOf(outSeg);
            int nodeIdx = m.Nodes.IndexOf(after);
            PathSegment cur = outSeg;
            for (int i = 0; i < pts.Count; i++)
            {
                var n = new PathNode { Id = m.NewNodeId(), X = pts[i].X, Y = pts[i].Y, Z = pts[i].Z, Type = NodeTypes.Node, Branch = branch };
                m.Nodes.Insert(++nodeIdx, n); created.Add(n);
                cur.ToId = n.Id;
                var next = new PathSegment { Id = m.NewSegId(), FromId = n.Id, ToId = origTo, Branch = branch, ClassifyStatus = "draft" };
                m.Segments.Insert(++segIdx, next);
                cur = next; prev = n;
            }
            Renumber(m);
            return created;
        }

        /// <summary>把节点 corner 处两相邻同分支段圆化为弧段（凸/凹按几何自动判断，可强制）。</summary>
        public static PathSegment FilletAt(PathModel m, PathNode corner, double R, string forceCurve = null)
        {
            var sIn = m.Segments.FirstOrDefault(s => s.ToId == corner.Id);
            var sOut = m.Segments.FirstOrDefault(s => s.FromId == corner.Id);
            if (sIn == null || sOut == null) return null;
            var p0 = m.Node(sIn.FromId).P; var p1 = corner.P; var p2 = m.Node(sOut.ToId).P;
            if (!Geometry.FilletCorner(p0, p1, p2, R, out var t1, out var t2, out var mid, out var theta)) return null;

            int ci = m.Nodes.IndexOf(corner);
            m.Nodes.RemoveAt(ci);
            var nA = new PathNode { Id = m.NewNodeId(), X = t1.X, Y = t1.Y, Z = t1.Z, Type = NodeTypes.Node, Branch = corner.Branch };
            m.Nodes.Insert(ci, nA);
            var nB = new PathNode { Id = m.NewNodeId(), X = t2.X, Y = t2.Y, Z = t2.Z, Type = NodeTypes.Node, Branch = corner.Branch };
            m.Nodes.Insert(ci + 1, nB);
            sIn.ToId = nA.Id; sOut.FromId = nB.Id;
            string curve = forceCurve ?? (mid.Z >= (t1.Z + t2.Z) / 2 ? "convex" : "concave");
            var arc = new PathSegment
            {
                Id = m.NewSegId(), FromId = nA.Id, ToId = nB.Id, Branch = corner.Branch, Curve = curve, R = R, ThetaDeg = theta,
                ArcMid = new[] { mid.X, mid.Y, mid.Z }, ClassifyStatus = "draft"
            };
            m.Segments.Insert(m.Segments.IndexOf(sIn) + 1, arc);
            Renumber(m);
            m.RecomputeGeometry();
            return arc;
        }

        /// <summary>整体反向：节点序倒置、段 from/to 互换。用于识别时链方向与运行方向相反的情况。</summary>
        public static void ReverseDirection(PathModel m)
        {
            m.Nodes.Reverse();
            m.Segments.Reverse();
            foreach (var s in m.Segments) { var t = s.FromId; s.FromId = s.ToId; s.ToId = t; }
            Renumber(m);
            m.RecomputeGeometry();
        }

        /// <summary>若承载首点不是尾滚筒而末点是，则说明识别方向反了。</summary>
        public static bool LooksReversed(PathModel m)
        {
            var c = m.CarryNodes.ToList();
            if (c.Count < 2) return false;
            bool firstTail = c.First().Type == NodeTypes.Tail || (c.First().Type == NodeTypes.Takeup && c.Last().Type != NodeTypes.Tail && c.Last().Type != NodeTypes.Takeup);
            bool lastTail = c.Last().Type == NodeTypes.Tail;
            bool firstHead = c.First().Type == NodeTypes.Head || (c.First().Type == NodeTypes.Drive && c.Last().Type != NodeTypes.Drive && c.Last().Type != NodeTypes.Head);
            return !firstTail && (lastTail || firstHead);
        }

        public static void Renumber(PathModel m)
        {
            int seq = 1; foreach (var n in m.Nodes) n.Seq = seq++;
        }

        public static void SetDrum(PathNode n, string type, double dMm, string driveRole = null, string bendKind = null, string takeupKind = null)
        {
            n.Type = type; n.DrumDmm = dMm;
            if (type == NodeTypes.Drive) { n.DriveRole = driveRole ?? "aux"; n.IsMainDrive = n.DriveRole == "main"; }
            else { n.DriveRole = "none"; n.IsMainDrive = false; }
            if (type == NodeTypes.Bend) n.BendKind = bendKind;
            if (type == NodeTypes.Takeup) n.TakeupKind = takeupKind;
        }

        /// <summary>设主驱：唯一化，并把奔离点默认设在主驱上。</summary>
        public static void SetMainDrive(PathModel m, PathNode n)
        {
            foreach (var d in m.Nodes.Where(x => x.Type == NodeTypes.Drive))
            {
                d.IsMainDrive = d == n; d.DriveRole = d == n ? "main" : "aux";
            }
            foreach (var x in m.Nodes.Where(x => x.PointRole == PointRoles.Leave)) x.PointRole = PointRoles.None;
            n.PointRole = PointRoles.Leave;
        }

        /// <summary>相邻滚筒中心距（沿闭环走向）。</summary>
        public static List<(PathNode a, PathNode b, double dist)> DrumGaps(PathModel m)
        {
            var order = CharacteristicPoints.LoopOrder(m).Where(n => n.IsDrum).ToList();
            var res = new List<(PathNode, PathNode, double)>();
            for (int i = 0; i < order.Count; i++)
            {
                var a = order[i]; var b = order[(i + 1) % order.Count];
                if (a == b) continue;
                res.Add((a, b, a.P.DistanceTo(b.P)));
            }
            return res;
        }
    }
}
