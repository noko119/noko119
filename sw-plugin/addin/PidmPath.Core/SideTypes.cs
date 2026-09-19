using System;
using System.Collections.Generic;
using System.Linq;

namespace PidmPath.Core
{
    /// <summary>
    /// 手册表13-1 常用侧型（12 类 A~L × 剖面 1~5，共 43 种）骨架生成。
    /// 类别 = 驱动/拉紧布置；数字 = 承载剖面。生成的是可编辑骨架，尺寸由参数给定。
    /// </summary>
    public static class SideTypes
    {
        public class Params
        {
            public double Ln = 100;          // 水平机长 m
            public double H = 10;            // 提升高度 m（可负=下运）
            public double TailFlat = 6;      // 尾部水平段（受料段）长 m
            public double HeadFlat = 6;      // 头部水平段（卸料段）长 m
            public double ArcR = 60;         // 凸/凹弧 R m
            public double Gap = 1.0;         // 承载-回程间距 m
            public double DriveD = 800;      // 传动滚筒 D mm
            public double TakeupDrop = 4;    // 垂直拉紧下垂深度 m
            public LineParams Line = new LineParams();
        }

        public static readonly (string cls, string name)[] Classes =
        {
            ("A","头部单传动 + 尾部螺旋拉紧"),
            ("B","头部单传动 + 尾部车式重锤拉紧"),
            ("C","头部单传动 + 头部附近垂直重锤拉紧"),
            ("D","头部单传动(带增面轮) + 垂直重锤拉紧"),
            ("E","中部单传动(头部探头滚筒) + 垂直重锤拉紧"),
            ("F","中部单传动(头部双改向) + 垂直重锤拉紧"),
            ("G","中部单传动 + 车式重锤拉紧"),
            ("H","中部单传动(头部双改向) + 车式重锤拉紧"),
            ("I","头部-中部双传动 + 垂直重锤拉紧"),
            ("J","头部-中部双传动(变体) + 垂直重锤拉紧"),
            ("K","头部-中部双传动(变体) + 车式拉紧"),
            ("L","中部双传动 + 垂直重锤拉紧"),
        };

        public static readonly (int v, string name)[] Profiles =
        {
            (1,"水平受料 → 凹弧 → 倾斜 → 凸弧 → 水平卸料"),
            (2,"倾斜 → 凸弧 → 水平卸料"),
            (3,"水平受料 → 凹弧 → 倾斜"),
            (4,"直线倾斜"),
            (5,"水平"),
        };

        /// <summary>按代号（如 "C4"）生成骨架。</summary>
        public static PathModel Build(string code, Params p)
        {
            if (string.IsNullOrWhiteSpace(code) || code.Length < 2) throw new ArgumentException("侧型代号格式如 C4");
            var cls = code.Substring(0, 1).ToUpperInvariant();
            if (!int.TryParse(code.Substring(1), out var prof) || prof < 1 || prof > 5) throw new ArgumentException("剖面号 1~5");
            if (!Classes.Any(c => c.cls == cls)) throw new ArgumentException("类别 A~L");

            var m = new PathModel { Line = p.Line ?? new LineParams() };
            m.Line.SideType = code;
            m.Line.CarryReturnGap = p.Gap;
            BuildProfile(m, prof, p);
            ArrangeDrums(m, cls, p);
            Classifier.AutoClassify(m, true);
            m.RecomputeGeometry();
            return m;
        }

        // ---------- 承载剖面 ----------
        static void BuildProfile(PathModel m, int prof, Params p)
        {
            var pts = new List<Vec3>();
            double x = 0, z = 0;
            pts.Add(new Vec3(0, 0, 0));
            switch (prof)
            {
                case 1:
                    x += p.TailFlat; pts.Add(new Vec3(x, 0, 0));
                    x = p.Ln - p.HeadFlat; z = p.H; pts.Add(new Vec3(x, 0, z));
                    pts.Add(new Vec3(p.Ln, 0, p.H));
                    break;
                case 2:
                    x = p.Ln - p.HeadFlat; z = p.H; pts.Add(new Vec3(x, 0, z));
                    pts.Add(new Vec3(p.Ln, 0, p.H));
                    break;
                case 3:
                    x += p.TailFlat; pts.Add(new Vec3(x, 0, 0));
                    pts.Add(new Vec3(p.Ln, 0, p.H));
                    break;
                case 4:
                    pts.Add(new Vec3(p.Ln, 0, p.H));
                    break;
                default:
                    pts.Add(new Vec3(p.Ln, 0, 0));
                    break;
            }
            for (int i = 0; i < pts.Count; i++)
                m.Nodes.Add(new PathNode { Id = m.NewNodeId(), Seq = i + 1, X = pts[i].X, Y = pts[i].Y, Z = pts[i].Z, Branch = Branches.Carry });
            for (int i = 0; i < pts.Count - 1; i++)
                m.Segments.Add(new PathSegment { Id = m.NewSegId(), FromId = m.Nodes[i].Id, ToId = m.Nodes[i + 1].Id, Branch = Branches.Carry });

            // 受料/卸料/过渡标记
            var first = m.Segments.First(); var last = m.Segments.Last();
            if (prof == 1 || prof == 3 || prof == 5) { first.SetFlag("load", true); first.ChuteLengthM = Math.Min(3.0, first.L > 0 ? first.L : 3.0); }
            else { first.SetFlag("load", true); }
            if (prof == 1 || prof == 2) last.SetFlag("unload_head", true);

            // 圆化中间角点（凹弧在尾部折点，凸弧在头部折点）
            if (prof == 1 || prof == 3)
            {
                var corner = m.Nodes[1];
                PathEdit.FilletAt(m, corner, p.ArcR, "concave");
            }
            if (prof == 1 || prof == 2)
            {
                var headCorner = m.Nodes[m.Nodes.Count - 2];
                PathEdit.FilletAt(m, headCorner, p.ArcR, "convex");
            }
            m.RecomputeGeometry();
            ManualRules.DefaultIdlerSpacing(m.Line.Rho, out var a0, out var aU);
            m.Line.A0Default = a0; m.Line.AUDefault = aU;
        }

        // ---------- 驱动/拉紧布置 ----------
        static void ArrangeDrums(PathModel m, string cls, Params p)
        {
            var carry = m.CarryNodes.ToList();
            var tail = carry.First(); var head = carry.Last();
            double D = p.DriveD;
            double bendD = ManualRules.MatchBendDiameter(D, BendKinds.Tail180, m.Line.B);
            double bend90 = ManualRules.MatchBendDiameter(D, BendKinds.Bend90, m.Line.B);
            double snubD = ManualRules.MatchBendDiameter(D, BendKinds.Head180, m.Line.B);

            // 尾部
            switch (cls)
            {
                case "A": PathEdit.SetDrum(tail, NodeTypes.Takeup, bendD, takeupKind: TakeupKinds.Screw); tail.Label = "尾部螺旋拉紧滚筒"; break;
                case "B": PathEdit.SetDrum(tail, NodeTypes.Takeup, bendD, takeupKind: TakeupKinds.Car); tail.Label = "尾部车式拉紧滚筒"; break;
                default: PathEdit.SetDrum(tail, NodeTypes.Tail, bendD, bendKind: BendKinds.Tail180); tail.Label = "尾部改向滚筒"; break;
            }

            bool headDrive = "ABCDIJK".Contains(cls);
            bool midDrive = "EFGHIJKL".Contains(cls);
            bool dual = "IJKL".Contains(cls);
            string takeup = "CDEFIJL".Contains(cls) ? TakeupKinds.Gravity : ("GHK".Contains(cls) ? TakeupKinds.Car : null);

            // 头部
            if (headDrive)
            {
                PathEdit.SetDrum(head, NodeTypes.Drive, D, driveRole: "main");
                head.Label = "头部传动滚筒"; head.WrapDeg = 210; head.Mu = ManualRules.DefaultMu("rubber");
            }
            else
            {
                PathEdit.SetDrum(head, NodeTypes.Head, snubD, bendKind: BendKinds.Head180);
                head.Label = "头部探头(卸料)滚筒";
            }

            // 回程
            AutoReturn.Generate(m, p.Gap);
            // 水平方向：从头部指向尾部
            var horiz = tail.P - head.P; horiz.Z = 0; var dir = horiz.Normalized();

            double cursor = 2.5; // 距头滚筒的水平游标 m
            // 沿回程折线（头→尾）按水平距离取点，并拆分所在段
            PathNode Insert(double along, string type, double d, string role = null, string bk = null, string tk = null, string label = null)
            {
                var at = ReturnPointAt(m, head, along, out var seg);
                var n = PathEdit.SplitSegment(m, seg, at);
                PathEdit.SetDrum(n, type, d, role, bk, tk); n.Label = label;
                return n;
            }

            if (cls == "D" || midDrive)
            {
                // 增面/探头改向 + 中部传动（在回程线下方形成 S 形绕带）
                if (cls == "D")
                {
                    Insert(cursor, NodeTypes.Bend, snubD, bk: BendKinds.Head180, label: "增面滚筒");
                }
                if (midDrive)
                {
                    var snub = Insert(cursor, NodeTypes.Bend, snubD, bk: BendKinds.Head180, label: "增面/改向滚筒");
                    var retLevel = snub.P;
                    var drv = new Vec3(retLevel.X - dir.X * 1.5, retLevel.Y - dir.Y * 1.5, retLevel.Z - 1.4 * p.Gap);
                    var ins = PathEdit.InsertAfter(m, snub, new[] { drv }, Branches.Return).First();
                    PathEdit.SetDrum(ins, NodeTypes.Drive, D, driveRole: dual && headDrive ? "aux" : "main");
                    ins.Label = "中部传动滚筒"; ins.WrapDeg = 210; ins.Mu = ManualRules.DefaultMu("rubber");
                    if (cls == "L")
                    {
                        var drv2 = new Vec3(drv.X + dir.X * 3.0, drv.Y + dir.Y * 3.0, drv.Z);
                        var ins2 = PathEdit.InsertAfter(m, ins, new[] { drv2 }, Branches.Return).First();
                        PathEdit.SetDrum(ins2, NodeTypes.Drive, D, driveRole: "aux"); ins2.Label = "中部第二传动滚筒"; ins2.WrapDeg = 190; ins2.Mu = ins.Mu;
                    }
                }
                cursor += 6;
            }
            if ("FH".Contains(cls))
            {
                // 头部双改向：头滚筒后紧接一个改向
                Insert(1.2, NodeTypes.Bend, bendD, bk: BendKinds.Mid180, label: "头部第二改向滚筒");
            }

            if (takeup == TakeupKinds.Gravity)
            {
                // 90° 改向 → 拉紧滚筒(下垂) → 90° 改向
                var b1 = Insert(cursor, NodeTypes.Bend, bend90, bk: BendKinds.Bend90, label: "拉紧前90°改向");
                var at = b1.P;
                var down = new Vec3(at.X + dir.X * 1.0, at.Y + dir.Y * 1.0, at.Z - p.TakeupDrop);
                var up = new Vec3(at.X + dir.X * 2.0, at.Y + dir.Y * 2.0, at.Z);
                var ins = PathEdit.InsertAfter(m, b1, new[] { down, up }, Branches.Return);
                PathEdit.SetDrum(ins[0], NodeTypes.Takeup, bendD, takeupKind: TakeupKinds.Gravity); ins[0].Label = "垂直重锤拉紧滚筒"; ins[0].TakeupTravelM = 1.0;
                PathEdit.SetDrum(ins[1], NodeTypes.Bend, bend90, bendKind: BendKinds.Bend90); ins[1].Label = "拉紧后90°改向";
            }
            else if (takeup == TakeupKinds.Car)
            {
                var tk = Insert(cursor + 4, NodeTypes.Takeup, bendD, tk: TakeupKinds.Car, label: "车式重锤拉紧滚筒");
                tk.TakeupTravelM = 2.0;
            }

            // 主驱/奔离点
            var main = m.Nodes.FirstOrDefault(n => n.Type == NodeTypes.Drive && n.DriveRole == "main") ?? m.Nodes.FirstOrDefault(n => n.Type == NodeTypes.Drive);
            if (main != null) PathEdit.SetMainDrive(m, main);

            // 附件：头部清扫器（头滚筒处）、空段清扫器（尾滚筒前回程）、导料槽出口紧接凹弧时的压轮（2.3.3 图2-2）
            m.Attachments.Add(new Attachment { Id = m.NewAttId(), Kind = AttachmentKinds.CleanerHead, NearNodeId = head.Id, X = head.X, Y = head.Y, Z = head.Z - 0.3 });
            var loadSeg = m.Segments.FirstOrDefault(s => s.HasFlag("load"));
            var concave = m.Segments.FirstOrDefault(s => s.Curve == "concave" && s.Branch == Branches.Carry);
            if (loadSeg != null && concave != null)
            {
                var cs = m.Node(concave.FromId);
                var le = m.Node(loadSeg.ToId);
                if (cs != null && le != null && cs.P.DistanceTo(le.P) < ManualRules.PressureRollerDistanceM)
                    m.Attachments.Add(new Attachment { Id = m.NewAttId(), Kind = AttachmentKinds.PressureRoller, SegmentId = concave.Id, NearNodeId = cs.Id, X = cs.X, Y = cs.Y, Z = cs.Z + 0.3, Note = "凹弧起点距导料槽 <5 m，按 2.3.3 设置" });
            }
            var lastRet = m.Segments.Last(s => s.Branch == Branches.Return);
            var lr = m.Node(lastRet.FromId).P; var tl = m.Node(lastRet.ToId).P;
            var cp = tl + (lr - tl).Normalized() * Math.Min(2.0, lr.DistanceTo(tl) * 0.5);
            m.Attachments.Add(new Attachment { Id = m.NewAttId(), Kind = AttachmentKinds.CleanerReturn, SegmentId = lastRet.Id, X = cp.X, Y = cp.Y, Z = cp.Z });
            PathEdit.Renumber(m);
        }

        /// <summary>沿回程（头→尾）累计水平投影长度到 along 处的点，并给出所在段。</summary>
        static Vec3 ReturnPointAt(PathModel m, PathNode head, double along, out PathSegment seg)
        {
            var order = CharacteristicPoints.LoopOrder(m);
            int hi = order.IndexOf(head);
            double acc = 0;
            seg = null;
            for (int i = hi; i < order.Count; i++)
            {
                var a = order[i]; var b = i + 1 < order.Count ? order[i + 1] : order[0];
                var s = m.Segments.FirstOrDefault(x => x.Branch == Branches.Return && x.FromId == a.Id && x.ToId == b.Id);
                if (s == null) continue;
                var d = b.P - a.P; var h = Math.Sqrt(d.X * d.X + d.Y * d.Y);
                if (h < 1e-9) continue; // 竖直段（滚筒下缘）不计水平
                if (acc + h >= along)
                {
                    var t = (along - acc) / h;
                    t = Math.Max(0.05, Math.Min(0.95, t)); // 避免落在端点上
                    seg = s;
                    return a.P + d * t;
                }
                acc += h;
            }
            // 超出：取最后一段中点
            seg = m.Segments.Last(x => x.Branch == Branches.Return);
            return (m.Node(seg.FromId).P + m.Node(seg.ToId).P) * 0.5;
        }
    }
}
