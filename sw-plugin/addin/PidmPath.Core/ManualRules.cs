using System;
using System.Collections.Generic;
using System.Linq;

namespace PidmPath.Core
{
    /// <summary>
    /// 《DTⅡ(A)型带式输送机设计手册（第2版）》中与"侧型/路径"直接相关的查表与规则。
    /// 只做查表、比大小、给提示，不做张力计算（张力/功率归网页）。
    /// 章节页码以手册第2版为准。
    /// </summary>
    public static class ManualRules
    {
        /// <summary>标准滚筒直径系列 mm（表2-5/表3-10 列值）。</summary>
        public static readonly double[] DrumSeries = { 200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1400, 1600, 1800, 2000 };

        /// <summary>表2-7 常用托辊间距：堆积密度 ≤1.6 t/m³ → 1200/3000；>1.6 → 1000/3000（mm）。</summary>
        public static void DefaultIdlerSpacing(double rhoKgM3, out double a0, out double aU)
        {
            a0 = rhoKgM3 <= 1600 ? 1.2 : 1.0;
            aU = 3.0;
        }

        /// <summary>2.5：凸弧段托辊间距 = 承载间距 1/2；受料段 = 1/2～1/3。</summary>
        public static double ConvexIdlerSpacing(double a0) => a0 / 2;
        public static double LoadIdlerSpacing(double a0) => a0 / 2;

        /// <summary>2.3.3 推荐机尾长度 l（受料中心线 → 尾部改向滚筒中心线），mm。</summary>
        public static double RecommendedTailLengthMm(double bMm)
        {
            if (bMm <= 500) return 2000;
            if (bMm <= 800) return 2500;
            if (bMm <= 1200) return 3000;
            return 3500;
        }

        /// <summary>2.3.3：凹弧起点距导料槽 &lt; 5 m 时必须设置压轮（图2-2）。</summary>
        public const double PressureRollerDistanceM = 5.0;

        /// <summary>表2-4 推荐最小过渡段长度 A（头部滚筒中心线 → 第一组正常槽型托辊）。</summary>
        public static double MinTransitionLengthM(double bMm, string beltCore, string utilization)
        {
            double k;
            bool steel = beltCore == "steel";
            switch (utilization)
            {
                case ">90": k = steel ? 3.4 : 1.6; break;
                case "<60": k = steel ? 1.8 : 1.0; break;
                default: k = steel ? 2.6 : 1.3; break; // 60~90
            }
            return k * bMm / 1000.0;
        }

        /// <summary>3.11.1 凸弧最小曲率半径：织物芯 (38~42)·B·sinλ，钢绳芯 (100~167)·B·sinλ（B 单位 m）。返回下限与上限。</summary>
        public static void ConvexRmin(double bMm, double troughAngleDeg, string beltCore, out double rLow, out double rHigh)
        {
            var s = Math.Sin(troughAngleDeg * Math.PI / 180) * bMm / 1000.0;
            if (beltCore == "steel") { rLow = 100 * s; rHigh = 167 * s; }
            else { rLow = 38 * s; rHigh = 42 * s; }
        }

        /// <summary>2.3.5：凸弧长度超过 5 m 或钢绳芯带 → 下分支应加密托辊成弧，不宜用改向滚筒。</summary>
        public const double ConvexLengthDenseIdlerM = 5.0;

        /// <summary>3.5.1：围包角经验值。单滚筒 190°～210°，双滚筒 ≈400°。</summary>
        public static void WrapAngleGuide(bool dualDrive, out double lo, out double hi)
        {
            if (dualDrive) { lo = 380; hi = 420; } else { lo = 190; hi = 210; }
        }

        /// <summary>表3-12 传动滚筒与胶带摩擦系数（干态）默认值。</summary>
        public static double DefaultMu(string surface)
        {
            switch (surface)
            {
                case "bare": return 0.35;      // 光滑裸露钢滚筒 0.35~0.40
                case "ceramic": return 0.40;   // 陶瓷覆盖面 0.40~0.45
                case "polyurethane": return 0.40;
                default: return 0.35;          // 人字形沟槽橡胶 0.35~0.40
            }
        }

        /// <summary>
        /// 表2-5/表3-10 滚筒直径匹配：由传动滚筒直径推荐各类改向滚筒直径。
        /// 规律：180°尾部/中部改向 = 低一档；180°头部探头(增面) = 同档；90° = 低两档；&lt;45° = 低三档；下限 200/250。
        /// </summary>
        public static double MatchBendDiameter(double driveDmm, string bendKind, double bMm)
        {
            int idx = Array.IndexOf(DrumSeries, DrumSeries.OrderBy(d => Math.Abs(d - driveDmm)).First());
            int step;
            switch (bendKind)
            {
                case BendKinds.Head180: step = 0; break;
                case BendKinds.Tail180:
                case BendKinds.Mid180: step = 1; break;
                case BendKinds.Bend90: step = 2; break;
                case BendKinds.BendLt45: step = 3; break;
                default: step = 1; break;
            }
            double floor = bMm <= 400 ? 200 : 250;
            int j = Math.Max(0, idx - step);
            return Math.Max(floor, DrumSeries[j]);
        }

        /// <summary>2.3.6 拉紧装置类型/位置规则提示。</summary>
        public static IEnumerable<string> TakeupHints(string kind, double totalCarryLengthM, bool lightMaterial)
        {
            if (kind == TakeupKinds.Screw)
            {
                var lim = lightMaterial ? 50 : 30;
                if (totalCarryLengthM > lim) yield return $"螺旋拉紧一般只用于机长 <{lim} m 的输送机（2.3.6），当前承载长 {totalCarryLengthM:F1} m，建议改用重锤/车式。";
            }
            if (kind == TakeupKinds.Gravity) yield return "垂直重锤拉紧应优先置于中部并尽量靠近传动滚筒（2.3.6）。";
            if (kind == TakeupKinds.Car) yield return "车式重锤拉紧可置于中部或尾部，条件允许尽量中部靠近传动滚筒（2.3.6）。";
            if (kind == TakeupKinds.Winch) yield return "电动绞车拉紧用于长距离输送机，置于中部并靠近中部传动滚筒（2.3.6）。";
        }

        /// <summary>2.3.2 倾角提示。</summary>
        public static IEnumerable<string> InclineHints(double deltaDeg, double vMs, double troughAngleDeg, double generalMaxDeg = 18)
        {
            var a = Math.Abs(deltaDeg);
            if (a < 0.5) yield break;
            var max = generalMaxDeg;
            if (troughAngleDeg >= 45) max += 2;               // 45° 槽角可提高 2°~3°
            if (vMs > 2.5) max -= 2;                            // 带速 >2.5 m/s 减 2°~4°
            if (deltaDeg < 0) max -= 2;                         // 下运减 2°~4°
            if (a > max) yield return $"倾角 {a:F1}° 超过一般散料推荐值（≈{max:F0}°，2.3.2），请核对物料最大倾角表或采取特殊措施。";
        }

        /// <summary>2.3.4 卸料段提示。</summary>
        public static IEnumerable<string> DischargeHints(double lastCarryDeltaDeg, double vMs)
        {
            if (Math.Abs(lastCarryDeltaDeg) > 1 && vMs >= 3.15)
                yield return "带速 ≥3.15 m/s 的输送机卸料段一般应设计为水平段（2.3.4）。";
            else if (Math.Abs(lastCarryDeltaDeg) > 1)
                yield return "倾斜输送机的卸料段最好设计成水平段，便于头架/驱动装置标准化（2.3.4）。";
        }

        /// <summary>3.4.3：附加阻力需要的绕带次数 N1（输送带绕过的滚筒次数）与改向滚筒数 N2。</summary>
        public static void WrapCounts(PathModel m, out int n1, out int n2)
        {
            n1 = m.Nodes.Count(n => n.IsDrum);
            n2 = m.Nodes.Count(n => n.IsDrum && n.Type != NodeTypes.Drive);
        }

        /// <summary>3.10.2 式(3-70)：垂直拉紧装置与头部传动滚筒的水平距 L′ 与承载分支高差 H′。</summary>
        public static bool TakeupLH(PathModel m, out double lPrime, out double hPrime)
        {
            lPrime = hPrime = 0;
            var tk = m.Nodes.FirstOrDefault(n => n.Type == NodeTypes.Takeup);
            var dr = m.MainDrive ?? m.Nodes.FirstOrDefault(n => n.Type == NodeTypes.Drive);
            if (tk == null || dr == null) return false;
            lPrime = Math.Sqrt(Math.Pow(tk.X - dr.X, 2) + Math.Pow(tk.Y - dr.Y, 2));
            hPrime = dr.Z - tk.Z;
            return true;
        }
    }
}
