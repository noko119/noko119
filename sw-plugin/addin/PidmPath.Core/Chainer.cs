using System;
using System.Collections.Generic;
using System.Linq;

namespace PidmPath.Core
{
    /// <summary>从 SW 读回的原始草图线段（直线/圆弧），坐标为米。</summary>
    public class RawSegment
    {
        public object Key;               // SW 实体句柄（可空）
        public bool IsArc;
        public Vec3 A, B, Mid;           // Mid 仅弧有效
        public double R;                 // 弧半径
        public Dictionary<string, string> Attrs = new Dictionary<string, string>(); // 已存 PIDM_* 属性
    }

    /// <summary>从 SW 读回的原始草图点（滚筒/附件），坐标为米。</summary>
    public class RawPoint
    {
        public object Key;
        public Vec3 P;
        public Dictionary<string, string> Attrs = new Dictionary<string, string>();
    }

    public class ChainResult
    {
        public List<OrientedSegment> Ordered = new List<OrientedSegment>();
        public bool Closed;
        public List<string> Warnings = new List<string>();
    }

    public class OrientedSegment
    {
        public RawSegment Seg;
        public bool Reversed;
        public Vec3 Start => Reversed ? Seg.B : Seg.A;
        public Vec3 End => Reversed ? Seg.A : Seg.B;
    }

    public static class Chainer
    {
        public const double DefaultTol = 1e-4; // 0.1 mm

        /// <summary>端点容差串接。开链从度为 1 的端点出发；闭链从最靠近 startHint 的端点出发。</summary>
        public static ChainResult Chain(IList<RawSegment> segs, Vec3? startHint = null, double tol = DefaultTol)
        {
            var res = new ChainResult();
            if (segs == null || segs.Count == 0) return res;

            // 端点聚类
            var clusters = new List<Vec3>();
            int ClusterOf(Vec3 p)
            {
                for (int i = 0; i < clusters.Count; i++) if (clusters[i].DistanceTo(p) <= tol) return i;
                clusters.Add(p); return clusters.Count - 1;
            }
            var endA = segs.Select(s => ClusterOf(s.A)).ToArray();
            var endB = segs.Select(s => ClusterOf(s.B)).ToArray();
            var adj = new Dictionary<int, List<int>>();
            for (int i = 0; i < segs.Count; i++)
            {
                if (!adj.ContainsKey(endA[i])) adj[endA[i]] = new List<int>();
                if (!adj.ContainsKey(endB[i])) adj[endB[i]] = new List<int>();
                adj[endA[i]].Add(i); adj[endB[i]].Add(i);
            }
            var deg1 = adj.Where(kv => kv.Value.Count == 1).Select(kv => kv.Key).ToList();
            var branchy = adj.Where(kv => kv.Value.Count > 2).Select(kv => kv.Key).ToList();
            if (branchy.Count > 0) res.Warnings.Add($"有 {branchy.Count} 处端点连接了 3 条以上线段，已按最顺直方向串接，请检查是否有重复线。");

            int start;
            if (deg1.Count > 0)
            {
                start = deg1[0];
                if (startHint.HasValue) start = deg1.OrderBy(c => clusters[c].DistanceTo(startHint.Value)).First();
                else start = deg1.OrderBy(c => clusters[c].X).ThenBy(c => clusters[c].Z).First();
                if (deg1.Count > 2) res.Warnings.Add($"检测到 {deg1.Count} 个自由端点，路径可能不连续（有断口）。");
            }
            else
            {
                res.Closed = true;
                start = startHint.HasValue
                    ? adj.Keys.OrderBy(c => clusters[c].DistanceTo(startHint.Value)).First()
                    : adj.Keys.OrderBy(c => clusters[c].X).ThenBy(c => clusters[c].Z).First();
            }

            var used = new bool[segs.Count];
            int cur = start; Vec3? lastDir = null;
            while (true)
            {
                var candidates = adj[cur].Where(i => !used[i]).ToList();
                if (candidates.Count == 0) break;
                int pick = candidates[0];
                if (candidates.Count > 1 && !lastDir.HasValue)
                {
                    // 闭环起点：优先沿已标记为承载的线段出发（保证 尾→头 方向）
                    string BranchOf(int i) => segs[i].Attrs.TryGetValue(PidmKeys.Branch, out var b) ? b : null;
                    var carry = candidates.Where(i => BranchOf(i) == Branches.Carry).ToList();
                    var nonRet = candidates.Where(i => BranchOf(i) != Branches.Return).ToList();
                    if (carry.Count > 0) pick = carry[0];
                    else if (nonRet.Count > 0 && nonRet.Count < candidates.Count) pick = nonRet[0];
                    else
                    {
                        // 无属性：取 +X 方向分量最大者（承载通常从尾向头正向）
                        pick = candidates.OrderByDescending(i =>
                        {
                            var other = endA[i] == cur ? segs[i].B : segs[i].A;
                            return (other - clusters[cur]).Normalized().X;
                        }).First();
                    }
                }
                else if (candidates.Count > 1 && lastDir.HasValue)
                {
                    pick = candidates.OrderByDescending(i =>
                    {
                        var other = endA[i] == cur ? segs[i].B : segs[i].A;
                        var d = (other - clusters[cur]).Normalized();
                        return d.X * lastDir.Value.X + d.Y * lastDir.Value.Y + d.Z * lastDir.Value.Z;
                    }).First();
                }
                used[pick] = true;
                var os = new OrientedSegment { Seg = segs[pick], Reversed = endA[pick] != cur };
                res.Ordered.Add(os);
                lastDir = (os.End - os.Start).Normalized();
                cur = os.Reversed ? endA[pick] : endB[pick];
                if (res.Closed && cur == start) break;
            }
            int unused = used.Count(u => !u);
            if (unused > 0) res.Warnings.Add($"有 {unused} 条线段未能接入路径（与主链不相连），已忽略。");
            return res;
        }
    }
}
