using System;
using System.Collections.Generic;
using System.Linq;
using PidmPath.Core;
using Xunit;

namespace PidmPath.Core.Tests
{
    public class CoreTests
    {
        static RawSegment Line(double x1, double z1, double x2, double z2) =>
            new RawSegment { A = new Vec3(x1, 0, z1), B = new Vec3(x2, 0, z2) };

        [Fact]
        public void Chain_OpenPolyline_OrdersAndOrients()
        {
            // 乱序 + 反向的三段折线
            var segs = new List<RawSegment> { Line(50, 5, 100, 5), Line(10, 0, 0, 0), Line(10, 0, 50, 5) };
            var r = Chainer.Chain(segs);
            Assert.False(r.Closed);
            Assert.Equal(3, r.Ordered.Count);
            Assert.Equal(0, r.Ordered[0].Start.X, 6);
            Assert.Equal(100, r.Ordered[2].End.X, 6);
            Assert.Empty(r.Warnings);
        }

        [Fact]
        public void Chain_ClosedLoop_Detected()
        {
            var segs = new List<RawSegment> { Line(0, 0, 100, 10), Line(100, 10, 100, 9), Line(100, 9, 0, -1), Line(0, -1, 0, 0) };
            var r = Chainer.Chain(segs, new Vec3(0, 0, 0));
            Assert.True(r.Closed);
            Assert.Equal(4, r.Ordered.Count);
        }

        [Fact]
        public void Build_ComputesGeometry_PerManualFormulas()
        {
            // GC-01：L=310 m，δ=10°25′40″ → Ln=L·cosδ≈304.88
            double delta = 10.4278 * Math.PI / 180, L = 310;
            var segs = new List<RawSegment> { Line(0, 0, L * Math.Cos(delta), L * Math.Sin(delta)) };
            var m = ModelBuilder.Build(Chainer.Chain(segs), new List<RawPoint>(), new LineParams(), new List<string>());
            var s = m.Segments.Single();
            Assert.Equal(304.88, s.Ln, 1);
            Assert.Equal(10.4278, s.DeltaDeg, 3);
            Assert.Equal(310, s.L, 6);
            Assert.Equal(L * Math.Sin(delta), s.H, 6);
        }

        [Fact]
        public void Build_AttachesDrumPointAttrs()
        {
            var segs = new List<RawSegment> { Line(0, 0, 100, 10) };
            var pts = new List<RawPoint>
            {
                new RawPoint { P = new Vec3(100, 0, 10), Attrs = new Dictionary<string,string>{ {PidmKeys.Type,"drive"},{PidmKeys.DMm,"800"},{PidmKeys.DriveRole,"main"} } },
                new RawPoint { P = new Vec3(0.01, 0, 0), Attrs = new Dictionary<string,string>{ {PidmKeys.Type,"tail"},{PidmKeys.DMm,"630"} } },
            };
            var warn = new List<string>();
            var m = ModelBuilder.Build(Chainer.Chain(segs), pts, new LineParams(), warn);
            Assert.Empty(warn);
            Assert.Equal("drive", m.Nodes.Last().Type);
            Assert.True(m.Nodes.Last().IsMainDrive);
            Assert.Equal(630, m.Nodes.First().DrumDmm);
        }

        [Fact]
        public void AutoReturn_ClosesLoop_WithGap()
        {
            var segs = new List<RawSegment> { Line(0, 0, 60, 0), Line(60, 0, 160, 20) };
            var m = ModelBuilder.Build(Chainer.Chain(segs), new List<RawPoint>(), new LineParams(), new List<string>());
            PathEdit.SetDrum(m.Nodes.First(), NodeTypes.Tail, 630, bendKind: BendKinds.Tail180);
            PathEdit.SetDrum(m.Nodes.Last(), NodeTypes.Drive, 800, "main");
            AutoReturn.Generate(m, 1.0);
            Assert.Contains(m.Segments, s => s.Branch == Branches.Return);
            var ret = m.ReturnNodes.ToList();
            Assert.Equal(3, ret.Count);
            // 尾滚筒下方偏移点：水平段处偏移量 = gap
            var underTail = ret.Last();
            Assert.Equal(0, underTail.X, 6);
            Assert.Equal(-1.0, underTail.Z, 6);
            // 折点处偏移量略大于 gap（角平分线上等距）
            Assert.True(ret[1].Z < 0 && ret[1].Z > -1.5);
            var order = CharacteristicPoints.LoopOrder(m);
            Assert.Equal(m.Nodes.Count, order.Count);
            // 回程最后一段接回尾滚筒
            var last = m.Segments.Last(s => s.Branch == Branches.Return);
            Assert.Equal(m.Nodes.First().Id, last.ToId);
        }

        [Fact]
        public void Fillet_CreatesConvexArc_WithTheta()
        {
            var segs = new List<RawSegment> { Line(0, 0, 100, 20), Line(100, 20, 120, 20) };
            var m = ModelBuilder.Build(Chainer.Chain(segs), new List<RawPoint>(), new LineParams(), new List<string>());
            var corner = m.Nodes[1];
            var arc = PathEdit.FilletAt(m, corner, 40);
            Assert.NotNull(arc);
            Assert.Equal("convex", arc.Curve);
            Assert.Equal(40, arc.R);
            Assert.Equal(3, m.Segments.Count);
            Assert.Equal(Math.Atan2(20, 100) * 180 / Math.PI, arc.ThetaDeg.Value, 1); // 转角 = 两段倾角差
            Assert.NotNull(arc.ArcMid);
            Assert.Equal(4, m.Nodes.Count);
        }

        [Fact]
        public void Classifier_AssignsDictionaryIds()
        {
            var segs = new List<RawSegment> { Line(0, 0, 10, 0), Line(10, 0, 110, 20), Line(110, 20, 120, 20) };
            var m = ModelBuilder.Build(Chainer.Chain(segs), new List<RawPoint>(), new LineParams(), new List<string>());
            m.Segments[0].SetFlag("load", true);
            AutoReturn.Generate(m, 1);
            Classifier.AutoClassify(m);
            Assert.Equal("load.1", m.Segments[0].SubId);
            Assert.Equal("carryI.1", m.Segments[1].SubId);
            Assert.Equal("carryH.3", m.Segments[2].SubId);
            Assert.All(m.Segments.Where(s => s.Branch == Branches.Return), s => Assert.StartsWith("ret", s.SubId));
            Assert.Equal("carryI", m.Segments[1].MajorId);
        }

        [Fact]
        public void ManualRules_Tables()
        {
            ManualRules.DefaultIdlerSpacing(1800, out var a0, out var aU);
            Assert.Equal(1.0, a0); Assert.Equal(3.0, aU);
            ManualRules.DefaultIdlerSpacing(1200, out a0, out aU);
            Assert.Equal(1.2, a0);
            Assert.Equal(3500, ManualRules.RecommendedTailLengthMm(1400));
            Assert.Equal(2000, ManualRules.RecommendedTailLengthMm(500));
            Assert.Equal(1.6 * 1.4, ManualRules.MinTransitionLengthM(1400, "fabric", ">90"), 6);
            Assert.Equal(2.6 * 1.4, ManualRules.MinTransitionLengthM(1400, "steel", "60-90"), 6);
            ManualRules.ConvexRmin(1400, 35, "steel", out var lo, out var hi);
            Assert.Equal(100 * 1.4 * Math.Sin(35 * Math.PI / 180), lo, 6);
            Assert.Equal(167 * 1.4 * Math.Sin(35 * Math.PI / 180), hi, 6);
            // 表2-5：传动 800 → 180°尾部 630，探头 800，90° 500，<45° 400
            Assert.Equal(630, ManualRules.MatchBendDiameter(800, BendKinds.Tail180, 1000));
            Assert.Equal(800, ManualRules.MatchBendDiameter(800, BendKinds.Head180, 1000));
            Assert.Equal(500, ManualRules.MatchBendDiameter(800, BendKinds.Bend90, 1000));
            Assert.Equal(400, ManualRules.MatchBendDiameter(800, BendKinds.BendLt45, 1000));
            Assert.Equal(250, ManualRules.MatchBendDiameter(315, BendKinds.BendLt45, 500)); // 下限
        }

        [Fact]
        public void Checks_ErrorsThenPass()
        {
            var segs = new List<RawSegment> { Line(0, 0, 10, 0), Line(10, 0, 110, 20), Line(110, 20, 120, 20) };
            var m = ModelBuilder.Build(Chainer.Chain(segs), new List<RawPoint>(), new LineParams { B = 1400, Rho = 1800 }, new List<string>());
            var r0 = Checks.Run(m);
            Assert.False(r0.Ok);
            Assert.Contains(r0.Errors, e => e.Code == "CL_LOOP");
            Assert.Contains(r0.Errors, e => e.Code == "CL_MAIN_DRIVE");

            PathEdit.SetDrum(m.Nodes.First(), NodeTypes.Tail, 630, bendKind: BendKinds.Tail180);
            PathEdit.SetDrum(m.Nodes.Last(), NodeTypes.Drive, 800, "main");
            m.Nodes.Last().Mu = 0.35; m.Nodes.Last().WrapDeg = 210;
            PathEdit.SetMainDrive(m, m.Nodes.Last());
            m.Segments[0].SetFlag("load", true); m.Segments[0].ChuteLengthM = 3;
            AutoReturn.Generate(m, 1);
            var tk = PathEdit.SplitSegment(m, m.Segments.First(s => s.Branch == Branches.Return), new Vec3(60, 0, -1.3));
            PathEdit.SetDrum(tk, NodeTypes.Takeup, 630, takeupKind: TakeupKinds.Gravity);
            Classifier.AutoClassify(m);
            foreach (var s in m.Segments) s.ClassifyStatus = "confirmed";
            m.Nodes.First().PointRole = PointRoles.Manual1; tk.PointRole = PointRoles.Manual2;
            m.Attachments.Add(new Attachment { Id = "a1", Kind = AttachmentKinds.CleanerHead });
            m.Attachments.Add(new Attachment { Id = "a2", Kind = AttachmentKinds.CleanerReturn });
            var r = Checks.Run(m);
            Assert.True(r.Ok, string.Join("\n", r.Errors));
            // 机尾长度提示：受料中点 5 m > 3.5 m 不应告警
            Assert.DoesNotContain(r.Items, i => i.Code == "MR_TAIL_LEN");
        }

        [Fact]
        public void CharacteristicPoints_StartAtLeavePoint()
        {
            var m = SideTypes.Build("C1", new SideTypes.Params { Ln = 120, H = 15 });
            var pts = CharacteristicPoints.Build(m, new List<string>());
            Assert.True(pts.Count >= 6);
            Assert.Equal(1, pts[0].TensionIndex);
            Assert.Equal(m.MainDrive.Id, pts[0].NodeId);
            Assert.Contains(pts, p => p.Note.Contains("F0"));
        }

        [Theory]
        [InlineData("A")] [InlineData("B")] [InlineData("C")] [InlineData("D")] [InlineData("E")] [InlineData("F")]
        [InlineData("G")] [InlineData("H")] [InlineData("I")] [InlineData("J")] [InlineData("K")] [InlineData("L")]
        public void SideTypes_AllClassesAllProfiles_BuildClosedLoops(string cls)
        {
            for (int v = 1; v <= 5; v++)
            {
                var code = cls + v;
                var m = SideTypes.Build(code, new SideTypes.Params { Ln = 150, H = v == 5 ? 0 : 20, ArcR = 50, Line = new LineParams { B = 1200, Rho = 1700 } });
                Assert.Equal(code, m.Line.SideType);
                Assert.Single(m.Nodes.Where(n => n.Type == NodeTypes.Drive && n.IsMainDrive));
                Assert.Contains(m.Nodes, n => n.Type == NodeTypes.Takeup);
                Assert.Contains(m.Nodes, n => n.PointRole == PointRoles.Leave);
                var r = Checks.Run(m);
                var blocking = r.Errors.Where(e => e.Code != "CL_SEG_CLASS").ToList();
                Assert.True(blocking.Count == 0, code + ": " + string.Join(" | ", blocking));
                var order = CharacteristicPoints.LoopOrder(m);
                Assert.Equal(m.Nodes.Count, order.Count);
                if ("IJKL".Contains(cls)) Assert.True(m.Nodes.Count(n => n.Type == NodeTypes.Drive) >= 2, code);
                if (v == 1 || v == 2) Assert.Contains(m.Segments, s => s.Curve == "convex");
                if (v == 1 || v == 3) Assert.Contains(m.Segments, s => s.Curve == "concave");
                // 段几何闭合：每段端点都存在
                Assert.All(m.Segments, s => { Assert.NotNull(m.Node(s.FromId)); Assert.NotNull(m.Node(s.ToId)); Assert.True(s.L > 1e-6, code + " zero-length " + s.Id); });
            }
        }

        [Fact]
        public void Json_RoundTrip()
        {
            var m = SideTypes.Build("D2", new SideTypes.Params { Ln = 200, H = 30 });
            var json = JsonIO.Serialize(m);
            Assert.Contains("\"schema\": \"pidm.path.v0\"", json);
            var back = JsonIO.Deserialize(json);
            Assert.Equal(m.Nodes.Count, back.Nodes.Count);
            Assert.Equal(m.Segments.Count, back.Segments.Count);
            Assert.Equal(m.MainDrive.Id, back.MainDrive.Id);
            Assert.Equal(m.TotalLength, back.TotalLength, 6);
            var arc = back.Segments.First(s => s.Curve == "convex");
            Assert.NotNull(arc.ArcMid);
        }

        [Fact]
        public void Attr_RoundTrip()
        {
            var s = new PathSegment { Id = "s7", Branch = "return", SubId = "retH.2", MajorId = "retH", AIdler = 3, Curve = "none", ChuteLengthM = 2.5 };
            s.SetFlag("load", true);
            var a = ModelBuilder.SegmentAttrs(s);
            var s2 = new PathSegment(); ModelBuilder.ApplySegmentAttrs(s2, a);
            Assert.Equal("s7", s2.Id); Assert.Equal("return", s2.Branch); Assert.Equal(3, s2.AIdler); Assert.True(s2.HasFlag("load")); Assert.Null(s2.R);
            var n = new PathNode { Id = "n3", Type = "takeup", DrumDmm = 500, TakeupKind = "gravity", TakeupTravelM = 1.5, PointRole = "manual2" };
            var n2 = new PathNode(); ModelBuilder.ApplyNodeAttrs(n2, ModelBuilder.NodeAttrs(n));
            Assert.Equal("takeup", n2.Type); Assert.Equal(500, n2.DrumDmm); Assert.Equal("gravity", n2.TakeupKind); Assert.Equal("manual2", n2.PointRole);
        }

        [Fact]
        public void DrumGaps_ListsNeighborDistances()
        {
            var m = SideTypes.Build("A4", new SideTypes.Params { Ln = 100, H = 0 });
            var gaps = PathEdit.DrumGaps(m);
            Assert.NotEmpty(gaps);
            Assert.All(gaps, g => Assert.True(g.dist > 0));
        }
    
        [Fact]
        public void Chain_ClosedLoop_StartsAlongCarry_AndReverseFallback()
        {
            // 闭环：承载(带属性) 0,0 → 100,10；回程 100,9 → 0,-1
            var c1 = Line(0, 0, 100, 10); c1.Attrs[PidmKeys.Branch] = "carry";
            var r1 = Line(100, 10, 100, 9); r1.Attrs[PidmKeys.Branch] = "return";
            var r2 = Line(100, 9, 0, -1); r2.Attrs[PidmKeys.Branch] = "return";
            var r3 = Line(0, -1, 0, 0); r3.Attrs[PidmKeys.Branch] = "return";
            var chain = Chainer.Chain(new List<RawSegment> { r2, r3, c1, r1 }, new Vec3(0, 0, 0));
            Assert.True(chain.Closed);
            Assert.Same(c1, chain.Ordered[0].Seg);
            Assert.False(chain.Ordered[0].Reversed);

            var m = ModelBuilder.Build(chain, new List<RawPoint>(), new LineParams(), new List<string>());
            Assert.Equal(Branches.Return, m.Segments[1].Branch);
            // 人为反向后 LooksReversed 应为真并可恢复
            PathEdit.SetDrum(m.Nodes.First(), NodeTypes.Tail, 500, bendKind: BendKinds.Tail180);
            PathEdit.SetDrum(m.CarryNodes.Last(), NodeTypes.Drive, 800, "main");
            Assert.False(PathEdit.LooksReversed(m));
            PathEdit.ReverseDirection(m);
            Assert.True(PathEdit.LooksReversed(m));
            PathEdit.ReverseDirection(m);
            Assert.Equal(NodeTypes.Tail, m.CarryNodes.First().Type);
        }

        [Fact]
        public void SketchKinds_RoundTrip_AndInfer()
        {
            var w = SketchKinds.ToWorld(SketchKinds.PlanarXz, 80, 12, 99);
            Assert.Equal(80, w.X); Assert.Equal(0, w.Y); Assert.Equal(12, w.Z);
            SketchKinds.ToSketch(SketchKinds.PlanarXz, w, out var u, out var v, out var ww);
            Assert.Equal(80, u); Assert.Equal(12, v); Assert.Equal(0, ww);

            var plan = SketchKinds.ToWorld(SketchKinds.PlanarXy, 10, 4);
            Assert.Equal(10, plan.X); Assert.Equal(4, plan.Y); Assert.Equal(0, plan.Z);

            var m = SideTypes.Build("C4", new SideTypes.Params { Ln = 80, H = 8 });
            Assert.Equal(SketchKinds.PlanarXz, SketchKinds.Infer(m.Nodes));
            var json = JsonIO.Serialize(m);
            Assert.Contains("sketch_kind", json);
        }
    }
}
