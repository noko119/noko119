using System;
using System.Collections.Generic;
using System.Linq;

namespace PidmPath.Core
{
    /// <summary>区段分类：字典 01~12（docs/DTII_SEGMENT_DICTIONARY.md）。</summary>
    public static class Classifier
    {
        public const double HorizontalTolDeg = 1.0;

        public static readonly (string sub, string name)[] SubCatalog =
        {
            ("carryH.1","一般承载水平段"),("carryH.2","受料后水平段"),("carryH.3","卸料前水平段"),
            ("carryI.1","上运倾斜段"),("carryI.2","下运倾斜段"),
            ("retH.1","一般回程水平段"),("retH.2","拉紧区前后水平段"),
            ("retI.1","回程上运段"),("retI.2","回程下运段"),
            ("convex.1","承载凸弧段"),("convex.2","回程凸弧段"),
            ("concave.1","承载凹弧段"),("concave.2","回程凹弧段"),
            ("load.1","单点受料段"),("load.2","多点受料段"),("load.3","受料加速段"),
            ("unload.1","头部卸料段"),("unload.2","犁式卸料段"),("unload.3","中部卸料段"),
            ("trans.1","机头过渡段"),("trans.2","机尾过渡段"),
        };

        public static string MajorOf(string sub) => string.IsNullOrEmpty(sub) ? null : sub.Split('.')[0];

        /// <summary>自动分类：只改 draft 段，confirmed 段保持人工结果。force=true 时全部重分。</summary>
        public static void AutoClassify(PathModel m, bool force = false)
        {
            m.RecomputeGeometry();
            var carry = m.Segments.Where(s => s.Branch == Branches.Carry).ToList();
            var tk = m.Nodes.Where(n => n.Type == NodeTypes.Takeup).ToList();
            foreach (var s in m.Segments)
            {
                if (!force && s.ClassifyStatus == "confirmed" && !string.IsNullOrEmpty(s.SubId)) continue;
                string sub = null;
                bool ret = s.Branch == Branches.Return;
                bool flat = Math.Abs(s.DeltaDeg) <= HorizontalTolDeg;

                if (s.Curve == "convex") sub = ret ? "convex.2" : "convex.1";
                else if (s.Curve == "concave") sub = ret ? "concave.2" : "concave.1";
                else if (s.HasFlag("load")) sub = s.HasFlag("multi") ? "load.2" : (s.HasFlag("accel") ? "load.3" : "load.1");
                else if (s.HasFlag("unload_head")) sub = "unload.1";
                else if (s.HasFlag("plow")) sub = "unload.2";
                else if (s.HasFlag("unload_mid")) sub = "unload.3";
                else if (s.HasFlag("trans_head")) sub = "trans.1";
                else if (s.HasFlag("trans_tail")) sub = "trans.2";
                else if (ret)
                {
                    if (flat)
                    {
                        bool nearTakeup = tk.Any(t => t.Id == s.FromId || t.Id == s.ToId);
                        sub = nearTakeup ? "retH.2" : "retH.1";
                    }
                    else sub = s.DeltaDeg > 0 ? "retI.1" : "retI.2";
                }
                else
                {
                    if (flat)
                    {
                        int idx = carry.IndexOf(s);
                        var prev = idx > 0 ? carry[idx - 1] : null;
                        var next = idx >= 0 && idx < carry.Count - 1 ? carry[idx + 1] : null;
                        if (prev != null && prev.HasFlag("load")) sub = "carryH.2";
                        else if (next == null || (next != null && next.HasFlag("unload_head"))) sub = idx == carry.Count - 1 ? "carryH.3" : "carryH.1";
                        else sub = "carryH.1";
                    }
                    else sub = s.DeltaDeg > 0 ? "carryI.1" : "carryI.2";
                }
                s.SubId = sub;
                s.MajorId = MajorOf(sub);
                if (force || s.ClassifyStatus != "confirmed") s.ClassifyStatus = "draft";
            }
        }

        public static string SubName(string sub) => SubCatalog.FirstOrDefault(c => c.sub == sub).name ?? sub;
    }

    /// <summary>Auto Return：按承载生成回程（法向偏移，对标 Belt Analyst Auto Return）。</summary>
    public static class AutoReturn
    {
        /// <summary>删除现有回程，按承载点列生成回程折线（首尾与承载头/尾滚筒相接构成闭环）。返回新增回程节点（不含首尾承载节点）。</summary>
        public static List<PathNode> Generate(PathModel m, double gapM)
        {
            // 清除旧回程
            var retSegs = m.Segments.Where(s => s.Branch == Branches.Return).ToList();
            foreach (var s in retSegs) m.Segments.Remove(s);
            var retNodes = m.Nodes.Where(n => n.Branch == Branches.Return).ToList();
            foreach (var n in retNodes) m.Nodes.Remove(n);

            var carry = m.CarryNodes.ToList();
            if (carry.Count < 2) return new List<PathNode>();
            var pts = carry.Select(n => n.P).ToList();
            var off = Geometry.OffsetPolyline(pts, gapM);

            // 回程走向：从头(承载末) → 尾(承载首)，内部点用偏移点；首尾直接接到头/尾滚筒
            var created = new List<PathNode>();
            var head = carry.Last(); var tail = carry.First();
            var chainNodes = new List<PathNode> { head };
            for (int i = off.Count - 1; i >= 0; i--)
            {
                // 首末偏移点保留：对应胶带从头/尾滚筒下缘奔离/趋入
                var n = new PathNode { Id = m.NewNodeId(), X = off[i].X, Y = off[i].Y, Z = off[i].Z, Type = NodeTypes.Node, Branch = Branches.Return };
                m.Nodes.Add(n); created.Add(n); chainNodes.Add(n);
            }
            chainNodes.Add(tail);
            for (int i = 0; i < chainNodes.Count - 1; i++)
            {
                m.Segments.Add(new PathSegment
                {
                    Id = m.NewSegId(), FromId = chainNodes[i].Id, ToId = chainNodes[i + 1].Id,
                    Branch = Branches.Return, AIdler = null, ClassifyStatus = "draft"
                });
            }
            int seq = 1; foreach (var n in m.Nodes) n.Seq = seq++;
            m.RecomputeGeometry();
            return created;
        }
    }

    /// <summary>3.5.3 特性点：从主传动奔离点起沿运行方向编号。</summary>
    public static class CharacteristicPoints
    {
        public static List<CharacteristicPoint> Build(PathModel m, List<string> warnings)
        {
            var list = new List<CharacteristicPoint>();
            var order = LoopOrder(m);
            if (order.Count == 0) return list;
            var leave = m.Nodes.FirstOrDefault(n => n.PointRole == PointRoles.Leave) ?? m.MainDrive;
            if (leave == null) { warnings?.Add("未指定奔离点（主传动滚筒），特性点从承载首点起编。"); leave = order[0]; }
            int start = order.IndexOf(leave); if (start < 0) start = 0;
            int idx = 1;
            for (int k = 0; k < order.Count; k++)
            {
                var n = order[(start + k) % order.Count];
                bool isDrum = n.IsDrum;
                bool arcEnd = m.Segments.Any(s => s.Curve != "none" && (s.FromId == n.Id || s.ToId == n.Id));
                if (!isDrum && !arcEnd) continue;
                if (k == 0)
                {
                    list.Add(new CharacteristicPoint { TensionIndex = idx++, NodeId = n.Id, Side = "leave", Note = "S1 主传动奔离点（不打滑最小张力）" });
                    continue;
                }
                if (isDrum)
                {
                    string note = NodeTypes.Label(n.Type);
                    if (n.Type == NodeTypes.Takeup) note += "（F0 = S趋入 + S奔离，式3-66）";
                    if (n.Type == NodeTypes.Tail) note += "（承载分支最小张力处，须与下垂度校核比较）";
                    list.Add(new CharacteristicPoint { TensionIndex = idx++, NodeId = n.Id, Side = "approach", Note = note + " 趋入" });
                    list.Add(new CharacteristicPoint { TensionIndex = idx++, NodeId = n.Id, Side = "leave", Note = note + " 奔离" });
                }
                else
                {
                    list.Add(new CharacteristicPoint { TensionIndex = idx++, NodeId = n.Id, Side = "start", Note = "凸/凹弧起止点张力（式3-74 凹弧 R 用）" });
                }
            }
            return list;
        }

        /// <summary>闭环运行顺序：承载 尾→头，再回程 头→尾。</summary>
        public static List<PathNode> LoopOrder(PathModel m)
        {
            var carry = m.CarryNodes.ToList();
            var ret = m.ReturnNodes.ToList();
            var order = new List<PathNode>(carry);
            // 回程节点按其段链顺序：从头滚筒出发跟随回程段
            if (carry.Count > 0 && ret.Count > 0)
            {
                var cur = carry.Last(); var visited = new HashSet<string>();
                while (true)
                {
                    var seg = m.Segments.FirstOrDefault(s => s.Branch == Branches.Return && s.FromId == cur.Id && !visited.Contains(s.Id))
                              ?? m.Segments.FirstOrDefault(s => s.Branch == Branches.Return && s.ToId == cur.Id && !visited.Contains(s.Id));
                    if (seg == null) break;
                    visited.Add(seg.Id);
                    var nxt = m.Node(seg.FromId == cur.Id ? seg.ToId : seg.FromId);
                    if (nxt == null || nxt.Branch != Branches.Return) break;
                    order.Add(nxt); cur = nxt;
                }
            }
            return order;
        }
    }
}
