using System;
using System.Collections.Generic;
using System.Linq;

namespace PidmPath.Core
{
    public static class Geometry
    {
        public const double Deg = 180.0 / Math.PI;

        public static void SegmentMetrics(Vec3 a, Vec3 b, out double L, out double H, out double Ln, out double deltaDeg)
        {
            var d = b - a;
            L = d.Length;
            H = d.Z;
            Ln = Math.Sqrt(d.X * d.X + d.Y * d.Y);
            deltaDeg = Math.Atan2(H, Ln) * Deg;
        }

        /// <summary>沿运行方向"向下"的法向（在段所在竖直面内，垂直于段方向）。用于承载→回程偏移。</summary>
        public static Vec3 DownNormal(Vec3 dir)
        {
            var u = dir.Normalized();
            var hx = u.X; var hy = u.Y; var hz = u.Z;
            var hl = Math.Sqrt(hx * hx + hy * hy);
            if (hl < 1e-9) return new Vec3(-1, 0, 0); // 竖直段，退化取 -X
            var ex = hx / hl; var ey = hy / hl;
            // 段方向 = cosδ·h + sinδ·z；下法向 = sinδ·h − cosδ·z
            var cos = hl; var sin = hz;
            return new Vec3(sin * ex, sin * ey, -cos).Normalized();
        }

        /// <summary>对折线做等距偏移（顶点取相邻法向平均），返回新点列。</summary>
        public static List<Vec3> OffsetPolyline(IList<Vec3> pts, double gap)
        {
            var res = new List<Vec3>();
            if (pts.Count == 0) return res;
            if (pts.Count == 1) { res.Add(pts[0] + new Vec3(0, 0, -gap)); return res; }
            for (int i = 0; i < pts.Count; i++)
            {
                Vec3 n;
                if (i == 0) n = DownNormal(pts[1] - pts[0]);
                else if (i == pts.Count - 1) n = DownNormal(pts[i] - pts[i - 1]);
                else
                {
                    var n1 = DownNormal(pts[i] - pts[i - 1]);
                    var n2 = DownNormal(pts[i + 1] - pts[i]);
                    n = (n1 + n2).Normalized();
                    // 角平分线上保持等距：除以 cos(半角)
                    var c = Math.Max(0.35, Vdot(n, n1));
                    n = n * (1 / c);
                }
                res.Add(pts[i] + n * gap);
            }
            return res;
        }

        static double Vdot(Vec3 a, Vec3 b) => a.X * b.X + a.Y * b.Y + a.Z * b.Z;

        /// <summary>三点圆：由弦两端与弧上一点求半径。</summary>
        public static double CircleRadius(Vec3 a, Vec3 m, Vec3 b)
        {
            var ab = (b - a).Length; var am = (m - a).Length; var mb = (b - m).Length;
            var s = (ab + am + mb) / 2;
            var area = Math.Sqrt(Math.Max(0, s * (s - ab) * (s - am) * (s - mb)));
            if (area < 1e-12) return double.PositiveInfinity;
            return ab * am * mb / (4 * area);
        }

        /// <summary>把角点圆化：给两相邻段（p0→p1→p2）和 R，返回弧起点、弧终点、弧中点（切点法）。</summary>
        public static bool FilletCorner(Vec3 p0, Vec3 p1, Vec3 p2, double R, out Vec3 t1, out Vec3 t2, out Vec3 mid, out double thetaDeg)
        {
            t1 = t2 = mid = p1; thetaDeg = 0;
            var u1 = (p0 - p1).Normalized(); var u2 = (p2 - p1).Normalized();
            var cosA = Math.Max(-1, Math.Min(1, Vdot(u1, u2)));
            var A = Math.Acos(cosA);               // 两段夹角
            if (A < 1e-6 || Math.Abs(Math.PI - A) < 1e-6) return false;
            var tlen = R / Math.Tan(A / 2);       // 切线长
            var l1 = (p0 - p1).Length; var l2 = (p2 - p1).Length;
            if (tlen > l1 * 0.95 || tlen > l2 * 0.95) return false; // R 过大放不下
            t1 = p1 + u1 * tlen; t2 = p1 + u2 * tlen;
            var bis = (u1 + u2).Normalized();
            var centerDist = R / Math.Sin(A / 2);
            var center = p1 + bis * centerDist;
            mid = center + ((p1 - center).Normalized()) * R;
            thetaDeg = (Math.PI - A) * Deg;
            return true;
        }
    }
}
