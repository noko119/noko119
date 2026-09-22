using System;
using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json;

namespace PidmPath.Core
{
    /// <summary>属性名常量：写入 SW 草图实体 Attribute / 块属性，名称固定、大小写敏感。</summary>
    public static class PidmKeys
    {
        public const string AttrDefSegment = "PIDM_SEG";
        public const string AttrDefNode = "PIDM_NODE";
        public const string AttrDefAttachment = "PIDM_ATT";
        public const string SketchName = "PIDM_PATH_SKEL";
        public const string LinePropJson = "PIDM_LINE_JSON";

        // segment
        public const string SegId = "PIDM_SEG_ID";
        public const string Branch = "PIDM_BRANCH";
        public const string Major = "PIDM_MAJOR";
        public const string Sub = "PIDM_SUB";
        public const string Seq = "PIDM_SEQ";
        public const string AIdler = "PIDM_A_IDLER_M";
        public const string Curve = "PIDM_CURVE";
        public const string R = "PIDM_R_M";
        public const string Flags = "PIDM_FLAGS";
        public const string ChuteLen = "PIDM_CHUTE_L_M";
        public const string ChuteWidth = "PIDM_CHUTE_B_M";
        public const string AccelLen = "PIDM_ACCEL_L_M";
        public const string TiltIdlerDeg = "PIDM_TILT_DEG";
        public const string Classify = "PIDM_CLASSIFY";

        // node / drum
        public const string NodeId = "PIDM_NODE_ID";
        public const string Type = "PIDM_TYPE";
        public const string DMm = "PIDM_D_MM";
        public const string DriveRole = "PIDM_DRIVE_ROLE";
        public const string Mu = "PIDM_MU";
        public const string WrapDeg = "PIDM_WRAP_DEG";
        public const string TakeupKind = "PIDM_TAKEUP_KIND";
        public const string TakeupTravel = "PIDM_TAKEUP_S_M";
        public const string PointRole = "PIDM_POINT_ROLE";
        public const string BendKind = "PIDM_BEND_KIND";
        public const string StdCode = "PIDM_STD_CODE";

        // attachment
        public const string AttId = "PIDM_ATT_ID";
        public const string AttKind = "PIDM_ATT_KIND";
    }

    public static class NodeTypes
    {
        public const string Node = "node";
        public const string Tail = "tail";
        public const string Head = "head";
        public const string Drive = "drive";
        public const string Bend = "bend";
        public const string Takeup = "takeup";
        public static readonly string[] Drums = { Tail, Head, Drive, Bend, Takeup };
        public static bool IsDrum(string t) => Drums.Contains(t);
        public static string Label(string t)
        {
            switch (t)
            {
                case Tail: return "尾滚筒";
                case Head: return "头滚筒";
                case Drive: return "传动滚筒";
                case Bend: return "改向滚筒";
                case Takeup: return "拉紧滚筒";
                default: return "节点";
            }
        }
    }

    public static class Branches
    {
        public const string Carry = "carry";
        public const string Return = "return";
    }

    /// <summary>改向滚筒细分（手册表2-5/表3-10 列头）。</summary>
    public static class BendKinds
    {
        public const string Tail180 = "tail180";      // 180° 尾部改向
        public const string Mid180 = "mid180";        // 180° 中部改向
        public const string Head180 = "head180";      // 180° 头部（探头/增面）
        public const string Bend90 = "bend90";        // 90° 改向
        public const string BendLt45 = "lt45";        // <45° 改向
        public static string Label(string k)
        {
            switch (k)
            {
                case Tail180: return "180°尾部改向";
                case Mid180: return "180°中部改向";
                case Head180: return "180°头部探头/增面";
                case Bend90: return "90°改向";
                case BendLt45: return "<45°改向";
                default: return k ?? "";
            }
        }
    }

    public static class TakeupKinds
    {
        public const string Gravity = "gravity";   // 垂直重锤
        public const string Car = "car";           // 车式重锤
        public const string Screw = "screw";       // 螺旋
        public const string Winch = "winch";       // 电动绞车
        public static string Label(string k)
        {
            switch (k)
            {
                case Gravity: return "垂直重锤拉紧";
                case Car: return "车式重锤拉紧";
                case Screw: return "螺旋拉紧";
                case Winch: return "电动绞车拉紧";
                default: return k ?? "";
            }
        }
    }

    public static class AttachmentKinds
    {
        public const string CleanerHead = "cleaner_head";      // 头部清扫器
        public const string CleanerReturn = "cleaner_return";  // 空段清扫器
        public const string Plow = "plow";                     // 犁式卸料器
        public const string Tripper = "tripper";               // 卸料车
        public const string PressureRoller = "pressure_roller";// 压轮
        public const string Chute = "chute";                   // 导料槽
        public static string Label(string k)
        {
            switch (k)
            {
                case CleanerHead: return "头部清扫器";
                case CleanerReturn: return "空段清扫器";
                case Plow: return "犁式卸料器";
                case Tripper: return "卸料车";
                case PressureRoller: return "压轮";
                case Chute: return "导料槽";
                default: return k ?? "";
            }
        }
    }

    public static class PointRoles
    {
        public const string None = "none";
        public const string Leave = "leave";     // 奔离点 S1
        public const string Manual1 = "manual1";
        public const string Manual2 = "manual2";
    }

    [JsonObject(MemberSerialization.OptIn)]
    public class LineParams
    {
        [JsonProperty("line_id")] public string LineId = "line-1";
        [JsonProperty("name")] public string Name = "皮带机";
        [JsonProperty("Q")] public double? Q;
        [JsonProperty("rho")] public double Rho = 1600;          // kg/m³
        [JsonProperty("B")] public double B = 1000;              // mm
        [JsonProperty("v")] public double V = 2.0;               // m/s
        [JsonProperty("belt_core")] public string BeltCore = "fabric"; // fabric | steel
        [JsonProperty("a0_default")] public double A0Default = 1.2;
        [JsonProperty("aU_default")] public double AUDefault = 3.0;
        [JsonProperty("trough_angle")] public double TroughAngle = 35;
        [JsonProperty("carry_return_gap_m")] public double CarryReturnGap = 1.0;
        [JsonProperty("side_type")] public string SideType;      // 表13-1 代号，如 C4
        [JsonProperty("tension_utilization")] public string TensionUtilization = "60-90"; // >90 | 60-90 | <60 （表2-4）
        [JsonProperty("coord_system")] public string CoordSystem = "Z_up_right";
        [JsonProperty("length_unit")] public string LengthUnit = "m";
        /// <summary>SW 草图形态：3d | 2d-xz（侧型平面）| 2d-xy（俯视平面）。网页始终是同一套 XYZ。</summary>
        [JsonProperty("sketch_kind")] public string SketchKind = SketchKinds.Space3d;
    }

    /// <summary>SW 路径草图形态。2D 草图坐标 (u,v) ↔ PIDM 世界坐标 (X,Y,Z)，Z 向上。</summary>
    public static class SketchKinds
    {
        public const string Space3d = "3d";
        public const string PlanarXz = "2d-xz";
        public const string PlanarXy = "2d-xy";
        public static bool IsPlanar(string k) => k == PlanarXz || k == PlanarXy;
        public static string Label(string k)
        {
            switch (k)
            {
                case PlanarXz: return "2D 侧型（前视 XZ）";
                case PlanarXy: return "2D 俯视（上视 XY）";
                default: return "3D 空间路径";
            }
        }

        /// <summary>草图平面坐标 → PIDM 世界点。3D 时 (u,v,w) 原样。</summary>
        public static Vec3 ToWorld(string kind, double u, double v, double w = 0)
        {
            switch (kind)
            {
                case PlanarXz: return new Vec3(u, 0, v);
                case PlanarXy: return new Vec3(u, v, 0);
                default: return new Vec3(u, v, w);
            }
        }

        /// <summary>PIDM 世界点 → 草图 CreateLine/CreatePoint 用的 (u,v,w)。2D 时 w=0。</summary>
        public static void ToSketch(string kind, Vec3 p, out double u, out double v, out double w)
        {
            switch (kind)
            {
                case PlanarXz: u = p.X; v = p.Z; w = 0; break;
                case PlanarXy: u = p.X; v = p.Y; w = 0; break;
                default: u = p.X; v = p.Y; w = p.Z; break;
            }
        }

        /// <summary>按节点是否落在平面上推断草图形态。</summary>
        public static string Infer(IEnumerable<PathNode> nodes)
        {
            var list = nodes?.ToList() ?? new List<PathNode>();
            if (list.Count == 0) return Space3d;
            bool flatY = list.All(n => Math.Abs(n.Y) < 1e-6);
            bool flatZ = list.All(n => Math.Abs(n.Z) < 1e-6);
            if (flatY && !flatZ) return PlanarXz;
            if (flatZ) return PlanarXy;
            return Space3d;
        }
    }

    [JsonObject(MemberSerialization.OptIn)]
    public class PathNode
    {
        [JsonProperty("id")] public string Id;
        [JsonProperty("seq")] public int Seq;
        [JsonProperty("x")] public double X;
        [JsonProperty("y")] public double Y;
        [JsonProperty("z")] public double Z;
        [JsonProperty("type")] public string Type = NodeTypes.Node;
        [JsonProperty("branch")] public string Branch = Branches.Carry;
        [JsonProperty("label", NullValueHandling = NullValueHandling.Ignore)] public string Label;
        [JsonProperty("drum_D_mm", NullValueHandling = NullValueHandling.Ignore)] public double? DrumDmm;
        [JsonProperty("bend_kind", NullValueHandling = NullValueHandling.Ignore)] public string BendKind;
        [JsonProperty("drive_role", NullValueHandling = NullValueHandling.Ignore)] public string DriveRole;
        [JsonProperty("is_main_drive")] public bool IsMainDrive;
        [JsonProperty("friction_mu", NullValueHandling = NullValueHandling.Ignore)] public double? Mu;
        [JsonProperty("wrap_angle_deg", NullValueHandling = NullValueHandling.Ignore)] public double? WrapDeg;
        [JsonProperty("takeup_kind", NullValueHandling = NullValueHandling.Ignore)] public string TakeupKind;
        [JsonProperty("takeup_travel_m", NullValueHandling = NullValueHandling.Ignore)] public double? TakeupTravelM;
        [JsonProperty("point_role")] public string PointRole = PointRoles.None;
        [JsonProperty("sw_block_id", NullValueHandling = NullValueHandling.Ignore)] public string StdCode;
        [JsonIgnore] public object SwEntity;

        public bool IsDrum => NodeTypes.IsDrum(Type);
        public Vec3 P => new Vec3(X, Y, Z);
    }

    [JsonObject(MemberSerialization.OptIn)]
    public class PathSegment
    {
        [JsonProperty("id")] public string Id;
        [JsonProperty("from_node_id")] public string FromId;
        [JsonProperty("to_node_id")] public string ToId;
        [JsonProperty("branch")] public string Branch = Branches.Carry;
        [JsonProperty("major_id")] public string MajorId;
        [JsonProperty("sub_id")] public string SubId;
        [JsonProperty("L")] public double L;
        [JsonProperty("H")] public double H;
        [JsonProperty("Ln")] public double Ln;
        [JsonProperty("delta_deg")] public double DeltaDeg;
        [JsonProperty("a_idler", NullValueHandling = NullValueHandling.Ignore)] public double? AIdler;
        [JsonProperty("curve")] public string Curve = "none"; // none | convex | concave
        [JsonProperty("R", NullValueHandling = NullValueHandling.Ignore)] public double? R;
        [JsonProperty("theta_deg", NullValueHandling = NullValueHandling.Ignore)] public double? ThetaDeg;
        /// <summary>弧段弧上中点 [x,y,z]（SW 三点弧绘制用）；直线段为 null。</summary>
        [JsonProperty("arc_mid", NullValueHandling = NullValueHandling.Ignore)] public double[] ArcMid;
        [JsonProperty("flags")] public List<string> Flags = new List<string>();
        [JsonProperty("chute_length_m", NullValueHandling = NullValueHandling.Ignore)] public double? ChuteLengthM;
        [JsonProperty("chute_width_m", NullValueHandling = NullValueHandling.Ignore)] public double? ChuteWidthM;
        [JsonProperty("accel_length_m", NullValueHandling = NullValueHandling.Ignore)] public double? AccelLengthM;
        [JsonProperty("tilt_idler_deg", NullValueHandling = NullValueHandling.Ignore)] public double? TiltIdlerDeg;
        [JsonProperty("classify_status")] public string ClassifyStatus = "draft";
        [JsonProperty("extract_status")] public string ExtractStatus = "complete";
        [JsonIgnore] public object SwEntity;

        public bool HasFlag(string f) => Flags != null && Flags.Contains(f);
        public void SetFlag(string f, bool on)
        {
            if (Flags == null) Flags = new List<string>();
            if (on && !Flags.Contains(f)) Flags.Add(f);
            if (!on) Flags.Remove(f);
        }
    }

    [JsonObject(MemberSerialization.OptIn)]
    public class Attachment
    {
        [JsonProperty("id")] public string Id;
        [JsonProperty("kind")] public string Kind;
        [JsonProperty("segment_id", NullValueHandling = NullValueHandling.Ignore)] public string SegmentId;
        [JsonProperty("near_node_id", NullValueHandling = NullValueHandling.Ignore)] public string NearNodeId;
        [JsonProperty("x")] public double X;
        [JsonProperty("y")] public double Y;
        [JsonProperty("z")] public double Z;
        [JsonProperty("note", NullValueHandling = NullValueHandling.Ignore)] public string Note;
        [JsonIgnore] public object SwEntity;
        public Vec3 P => new Vec3(X, Y, Z);
    }

    [JsonObject(MemberSerialization.OptIn)]
    public class PointOrder
    {
        [JsonProperty("leave_point_node_id")] public string LeavePointNodeId;
        [JsonProperty("manual_p1_node_id")] public string ManualP1NodeId;
        [JsonProperty("manual_p2_node_id")] public string ManualP2NodeId;
        [JsonProperty("direction")] public string Direction = "running_dir";
        [JsonProperty("auto_points")] public List<CharacteristicPoint> AutoPoints = new List<CharacteristicPoint>();
    }

    [JsonObject(MemberSerialization.OptIn)]
    public class CharacteristicPoint
    {
        [JsonProperty("tension_index")] public int TensionIndex;
        [JsonProperty("node_id")] public string NodeId;
        [JsonProperty("side")] public string Side; // approach | leave | start | end
        [JsonProperty("note")] public string Note;
    }

    [JsonObject(MemberSerialization.OptIn)]
    public class PathModel
    {
        [JsonProperty("schema")] public string Schema = "pidm.path.v0";
        [JsonProperty("source")] public string Source = "sw_addin";
        [JsonProperty("line")] public LineParams Line = new LineParams();
        [JsonProperty("nodes")] public List<PathNode> Nodes = new List<PathNode>();
        [JsonProperty("segments")] public List<PathSegment> Segments = new List<PathSegment>();
        [JsonProperty("attachments")] public List<Attachment> Attachments = new List<Attachment>();
        [JsonProperty("point_order")] public PointOrder PointOrder = new PointOrder();
        [JsonProperty("closure")] public ClosureResult Closure;

        public PathNode Node(string id) => Nodes.FirstOrDefault(n => n.Id == id);
        public PathSegment Segment(string id) => Segments.FirstOrDefault(s => s.Id == id);
        public IEnumerable<PathNode> CarryNodes => Nodes.Where(n => n.Branch == Branches.Carry).OrderBy(n => n.Seq);
        public IEnumerable<PathNode> ReturnNodes => Nodes.Where(n => n.Branch == Branches.Return).OrderBy(n => n.Seq);
        public IEnumerable<PathNode> Drums => Nodes.Where(n => n.IsDrum);
        public PathNode MainDrive => Nodes.FirstOrDefault(n => n.Type == NodeTypes.Drive && n.IsMainDrive);

        /// <summary>按点序刷新每段的 L/H/Ln/δ（手册强制公式：L=‖ΔP‖，H=Δz，Ln=√(dx²+dy²)，δ=atan2(H,Ln)）。</summary>
        public void RecomputeGeometry()
        {
            foreach (var s in Segments)
            {
                var a = Node(s.FromId); var b = Node(s.ToId);
                if (a == null || b == null) continue;
                Geometry.SegmentMetrics(a.P, b.P, out s.L, out s.H, out s.Ln, out s.DeltaDeg);
                if (s.Curve != "none" && s.R.HasValue && s.R.Value > 0 && s.L > 0)
                {
                    // 弦长 → 圆心角
                    var half = Math.Min(1.0, s.L / (2 * s.R.Value));
                    s.ThetaDeg = 2 * Math.Asin(half) * 180 / Math.PI;
                }
            }
        }

        /// <summary>整线水平机长与净提升（受料→卸料）；简化为承载首末节点。</summary>
        public double TotalCarryLength => Segments.Where(s => s.Branch == Branches.Carry).Sum(s => s.L);
        public double TotalLength => Segments.Sum(s => s.L);
        public double NetLift
        {
            get
            {
                var c = CarryNodes.ToList();
                return c.Count >= 2 ? c.Last().Z - c.First().Z : 0;
            }
        }
        public double HorizontalLength => Segments.Where(s => s.Branch == Branches.Carry).Sum(s => s.Ln);

        public string NewNodeId() => "n" + (Nodes.Count == 0 ? 1 : Nodes.Max(n => ParseNum(n.Id, "n")) + 1);
        public string NewSegId() => "s" + (Segments.Count == 0 ? 1 : Segments.Max(n => ParseNum(n.Id, "s")) + 1);
        public string NewAttId() => "a" + (Attachments.Count == 0 ? 1 : Attachments.Max(n => ParseNum(n.Id, "a")) + 1);
        static int ParseNum(string id, string prefix)
        {
            if (id != null && id.StartsWith(prefix) && int.TryParse(id.Substring(prefix.Length), out var n)) return n;
            return 0;
        }
    }

    public struct Vec3
    {
        public double X, Y, Z;
        public Vec3(double x, double y, double z) { X = x; Y = y; Z = z; }
        public static Vec3 operator +(Vec3 a, Vec3 b) => new Vec3(a.X + b.X, a.Y + b.Y, a.Z + b.Z);
        public static Vec3 operator -(Vec3 a, Vec3 b) => new Vec3(a.X - b.X, a.Y - b.Y, a.Z - b.Z);
        public static Vec3 operator *(Vec3 a, double k) => new Vec3(a.X * k, a.Y * k, a.Z * k);
        public double Length => Math.Sqrt(X * X + Y * Y + Z * Z);
        public Vec3 Normalized() { var l = Length; return l > 1e-12 ? this * (1 / l) : this; }
        public double DistanceTo(Vec3 o) => (this - o).Length;
        public override string ToString() => $"({X:F3},{Y:F3},{Z:F3})";
    }
}
