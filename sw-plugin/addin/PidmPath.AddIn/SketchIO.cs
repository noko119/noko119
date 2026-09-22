using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using PidmPath.Core;
using SolidWorks.Interop.sldworks;
using SolidWorks.Interop.swconst;

namespace PidmPath.AddIn
{
    /// <summary>
    /// SolidWorks 草图读写：PIDM_PATH_SKEL 3D 草图 ↔ PathModel。
    /// 真相源 = 草图几何 + 实体 Attribute；另在文档自定义属性里保存 JSON 缓存（滚筒点属性兜底 / 线体参数）。
    /// API 单位：米。
    /// </summary>
    internal class SketchIO
    {
        readonly ISldWorks _sw;
        readonly AttributeDef _segDef, _nodeDef, _attDef;

        public SketchIO(ISldWorks sw)
        {
            _sw = sw;
            _segDef = Define(PidmKeys.AttrDefSegment, ModelBuilder.SegmentParamNames);
            _nodeDef = Define(PidmKeys.AttrDefNode, ModelBuilder.NodeParamNames);
            _attDef = Define(PidmKeys.AttrDefAttachment, ModelBuilder.AttachmentParamNames);
        }

        AttributeDef Define(string name, string[] parameters)
        {
            var def = (AttributeDef)_sw.DefineAttribute(name);
            foreach (var p in parameters) def.AddParameter(p, (int)swParamType_e.swParamTypeString, 0, 0);
            def.Register();
            return def;
        }

        public ModelDoc2 ActiveDoc => (ModelDoc2)_sw.ActiveDoc;

        // ------------------------------------------------------------------ 草图定位
        public Feature FindPathSketch(ModelDoc2 doc)
        {
            var f = (Feature)doc.FirstFeature();
            while (f != null)
            {
                // 2D 草图 "ProfileFeature"，3D 草图 "3DProfileFeature"
                if (f.Name == PidmKeys.SketchName && f.GetTypeName2().EndsWith("ProfileFeature")) return f;
                f = (Feature)f.GetNextFeature();
            }
            return null;
        }

        /// <summary>
        /// 进入 PIDM_PATH_SKEL 编辑。不存在则按 kind 新建：3d → 3D 草图；2d-xz → 前视平面；2d-xy → 上视平面。
        /// 已有草图形态与 kind 不符时删掉重建（例如从 3D 改 2D 侧型）。
        /// </summary>
        public bool EnterPathSketch(ModelDoc2 doc, bool createIfMissing, string kind = null)
        {
            kind = string.IsNullOrEmpty(kind) ? SketchKinds.Space3d : kind;
            var feat = FindPathSketch(doc);
            if (feat != null && !KindMatches(feat, kind))
            {
                doc.ClearSelection2(true);
                feat.Select2(false, 0);
                doc.Extension.DeleteSelection2((int)swDeleteSelectionOptions_e.swDelete_Absorbed);
                feat = null;
            }
            var skm = doc.SketchManager;
            if (feat == null)
            {
                if (!createIfMissing) return false;
                doc.ClearSelection2(true);
                if (SketchKinds.IsPlanar(kind))
                {
                    if (!SelectRefPlane(doc, kind == SketchKinds.PlanarXy)) return false;
                    skm.InsertSketch(true);
                }
                else
                {
                    skm.Insert3DSketch(true);
                }
                var active = skm.ActiveSketch;
                if (active == null) return false;
                var af = SketchFeature(active);
                try { if (af != null) af.Name = PidmKeys.SketchName; } catch { }
                return true;
            }
            if (skm.ActiveSketch != null)
            {
                var cur = SketchFeature(skm.ActiveSketch);
                if (cur != null && cur.Name == PidmKeys.SketchName) return true;
                ExitSketch(doc);
            }
            doc.ClearSelection2(true);
            feat.Select2(false, 0);
            doc.EditSketchOrSingleSketchFeature();
            return skm.ActiveSketch != null;
        }

        static bool KindMatches(Feature feat, string kind)
        {
            var sk = feat.GetSpecificFeature2() as Sketch;
            if (sk == null) return false;
            bool want3d = !SketchKinds.IsPlanar(kind);
            return sk.Is3D() == want3d;
        }

        /// <summary>选基准面。false=前视（2D 侧型），true=上视（2D 俯视）。中英默认名都试。</summary>
        static bool SelectRefPlane(ModelDoc2 doc, bool top)
        {
            string[] names = top
                ? new[] { "Top Plane", "上视基准面", "Top", "上视" }
                : new[] { "Front Plane", "前视基准面", "Front", "前视" };
            foreach (var n in names)
            {
                if (doc.Extension.SelectByID2(n, "PLANE", 0, 0, 0, false, 0, null, 0)) return true;
            }
            // 按特征顺序：零件默认 前视、上视、右视
            var planes = new List<Feature>();
            var f = (Feature)doc.FirstFeature();
            while (f != null)
            {
                if (f.GetTypeName2() == "RefPlane") planes.Add(f);
                f = (Feature)f.GetNextFeature();
            }
            int idx = top ? 1 : 0;
            if (planes.Count > idx)
            {
                doc.ClearSelection2(true);
                return planes[idx].Select2(false, 0);
            }
            return false;
        }

        /// <summary>Sketch 与 Feature 是同一 COM 对象的两个接口，可直接转换。</summary>
        static Feature SketchFeature(Sketch sk) => sk as Feature;

        public void ExitSketch(ModelDoc2 doc)
        {
            if (doc.SketchManager.ActiveSketch == null) return;
            // 3D 草图用 Insert3DSketch(true) 退出；2D 用 InsertSketch(true)
            var sk = doc.SketchManager.ActiveSketch;
            if (sk.Is3D()) doc.SketchManager.Insert3DSketch(true);
            else doc.SketchManager.InsertSketch(true);
        }

        // ------------------------------------------------------------------ 读
        public class SketchData
        {
            public List<RawSegment> Segments = new List<RawSegment>();
            public List<RawPoint> Points = new List<RawPoint>();
            public List<string> Warnings = new List<string>();
        }

        string _uvKind = SketchKinds.Space3d;

        public SketchData Read(ModelDoc2 doc, Feature sketchFeat, string kindHint = null)
        {
            var data = new SketchData();
            var sk = (Sketch)sketchFeat.GetSpecificFeature2();
            _uvKind = sk.Is3D() ? SketchKinds.Space3d : (SketchKinds.IsPlanar(kindHint) ? kindHint : SketchKinds.PlanarXz);
            var segs = sk.GetSketchSegments() as object[];
            if (segs != null)
                foreach (SketchSegment ss in segs)
                {
                    if (ss.ConstructionGeometry) continue;
                    var t = (swSketchSegments_e)ss.GetType();
                    switch (t)
                    {
                        case swSketchSegments_e.swSketchLINE:
                        {
                            var l = (SketchLine)ss;
                            var a = (SketchPoint)l.GetStartPoint2(); var b = (SketchPoint)l.GetEndPoint2();
                            data.Segments.Add(new RawSegment { Key = ss, A = V(a), B = V(b), Attrs = ReadAttrs(ss, _segDef) });
                            break;
                        }
                        case swSketchSegments_e.swSketchARC:
                        {
                            var arc = (SketchArc)ss;
                            var a = V((SketchPoint)arc.GetStartPoint2()); var b = V((SketchPoint)arc.GetEndPoint2());
                            var c = V((SketchPoint)arc.GetCenterPoint2());
                            var r = arc.GetRadius();
                            var chordMid = (a + b) * 0.5;
                            var dirToChord = (chordMid - c);
                            Vec3 mid = dirToChord.Length > 1e-9 ? c + dirToChord.Normalized() * r : c + new Vec3(0, 0, r);
                            data.Segments.Add(new RawSegment { Key = ss, IsArc = true, A = a, B = b, Mid = mid, R = r, Attrs = ReadAttrs(ss, _segDef) });
                            break;
                        }
                        case swSketchSegments_e.swSketchSPLINE:
                        {
                            // 样条离散为 8 段直线
                            var curve = (Curve)ss.GetCurve();
                            double s0, s1; bool closed, periodic;
                            curve.GetEndParams(out s0, out s1, out closed, out periodic);
                            const int N = 8; Vec3? prev = null;
                            for (int i = 0; i <= N; i++)
                            {
                                var pt = (double[])curve.Evaluate2(s0 + (s1 - s0) * i / N, 0);
                                var p = new Vec3(pt[0], pt[1], pt[2]);
                                if (prev.HasValue) data.Segments.Add(new RawSegment { Key = ss, A = prev.Value, B = p, Attrs = ReadAttrs(ss, _segDef) });
                                prev = p;
                            }
                            data.Warnings.Add("样条已按 8 段折线离散（网页可再细化）。");
                            break;
                        }
                        default:
                            data.Warnings.Add($"忽略不支持的草图实体类型 {t}。");
                            break;
                    }
                }

            var pts = sk.GetSketchPoints2() as object[];
            if (pts != null)
                foreach (SketchPoint sp in pts)
                {
                    var na = ReadAttrs(sp, _nodeDef);
                    var aa = na.Count > 0 ? new Dictionary<string, string>() : ReadAttrs(sp, _attDef);
                    var attrs = na.Count > 0 ? na : aa;
                    if (attrs.Count == 0) continue;
                    data.Points.Add(new RawPoint { Key = sp, P = V(sp), Attrs = attrs });
                }
            return data;
        }

        Vec3 V(SketchPoint p) => SketchKinds.ToWorld(_uvKind, p.X, p.Y, p.Z);

        void Uv(Vec3 world, out double u, out double v, out double w) => SketchKinds.ToSketch(_uvKind, world, out u, out v, out w);

        Dictionary<string, string> ReadAttrs(object entityObj, AttributeDef def)
        {
            var res = new Dictionary<string, string>();
            try
            {
                var ent = entityObj as Entity;
                if (ent == null) return res;
                var att = (SolidWorks.Interop.sldworks.Attribute)ent.FindAttribute(def, 0);
                if (att == null) return res;
                foreach (var name in ParamNames(def))
                {
                    var prm = (Parameter)att.GetParameter(name);
                    if (prm != null) res[name] = prm.GetStringValue();
                }
            }
            catch { }
            return res;
        }

        string[] ParamNames(AttributeDef def)
        {
            if (ReferenceEquals(def, _segDef)) return ModelBuilder.SegmentParamNames;
            if (ReferenceEquals(def, _nodeDef)) return ModelBuilder.NodeParamNames;
            return ModelBuilder.AttachmentParamNames;
        }

        // ------------------------------------------------------------------ 写属性
        /// <summary>把字典写到实体 Attribute（已存在则更新）。返回是否成功。</summary>
        public bool WriteAttrs(ModelDoc2 doc, object entityObj, AttributeDef def, Dictionary<string, string> values, string instanceName)
        {
            try
            {
                var ent = entityObj as Entity;
                if (ent == null) return false;
                var att = (SolidWorks.Interop.sldworks.Attribute)ent.FindAttribute(def, 0);
                if (att == null)
                {
                    att = (SolidWorks.Interop.sldworks.Attribute)def.CreateInstance5(doc, entityObj, instanceName, 0, (int)swInConfigurationOpts_e.swAllConfiguration);
                    if (att == null) return false;
                }
                foreach (var kv in values)
                {
                    var prm = (Parameter)att.GetParameter(kv.Key);
                    prm?.SetStringValue2(kv.Value ?? "", (int)swInConfigurationOpts_e.swAllConfiguration, "");
                }
                return true;
            }
            catch { return false; }
        }

        public AttributeDef SegDef => _segDef;
        public AttributeDef NodeDef => _nodeDef;
        public AttributeDef AttDef => _attDef;

        // ------------------------------------------------------------------ 缓存（自定义属性，分块）
        const int ChunkSize = 6000;
        public void SaveCache(ModelDoc2 doc, string json)
        {
            var cpm = doc.Extension.get_CustomPropertyManager("");
            int n = (json.Length + ChunkSize - 1) / ChunkSize;
            cpm.Add3(PidmKeys.LinePropJson + "_N", (int)swCustomInfoType_e.swCustomInfoText, n.ToString(), (int)swCustomPropertyAddOption_e.swCustomPropertyReplaceValue);
            for (int i = 0; i < n; i++)
            {
                var part = json.Substring(i * ChunkSize, Math.Min(ChunkSize, json.Length - i * ChunkSize));
                cpm.Add3(PidmKeys.LinePropJson + "_" + i, (int)swCustomInfoType_e.swCustomInfoText, part, (int)swCustomPropertyAddOption_e.swCustomPropertyReplaceValue);
            }
        }

        public string LoadCache(ModelDoc2 doc)
        {
            try
            {
                var cpm = doc.Extension.get_CustomPropertyManager("");
                string val, res; bool wr;
                cpm.Get5(PidmKeys.LinePropJson + "_N", false, out val, out res, out wr);
                if (!int.TryParse(val, out var n) || n <= 0) return null;
                var sb = new StringBuilder();
                for (int i = 0; i < n; i++)
                {
                    cpm.Get5(PidmKeys.LinePropJson + "_" + i, false, out val, out res, out wr);
                    sb.Append(val);
                }
                return sb.ToString();
            }
            catch { return null; }
        }

        // ------------------------------------------------------------------ 画
        /// <summary>清空 PIDM_PATH_SKEL 并按模型全部重画（线/弧/滚筒点/附件点），随后写属性。要求已处于草图编辑态。</summary>
        public void Redraw(ModelDoc2 doc, PathModel m)
        {
            var skm = doc.SketchManager;
            var sk = skm.ActiveSketch;
            if (sk == null) throw new InvalidOperationException("未处于 PIDM_PATH_SKEL 草图编辑状态。");
            _uvKind = sk.Is3D() ? SketchKinds.Space3d : (SketchKinds.IsPlanar(m.Line.SketchKind) ? m.Line.SketchKind : SketchKinds.PlanarXz);

            // 删除现有实体
            doc.ClearSelection2(true);
            var segs = sk.GetSketchSegments() as object[];
            var pts = sk.GetSketchPoints2() as object[];
            bool any = false;
            if (segs != null) foreach (SketchSegment ss in segs) { ss.Select4(true, null); any = true; }
            if (pts != null) foreach (SketchPoint sp in pts) { if (sp.Type == (int)swSketchPointType_e.swSketchPointType_User) { sp.Select4(true, null); any = true; } }
            if (any) doc.Extension.DeleteSelection2((int)swDeleteSelectionOptions_e.swDelete_Absorbed);
            doc.ClearSelection2(true);

            skm.AddToDB = true;
            skm.DisplayWhenAdded = false;
            try
            {
                foreach (var s in m.Segments)
                {
                    var a = m.Node(s.FromId); var b = m.Node(s.ToId);
                    if (a == null || b == null) continue;
                    SketchSegment ss;
                    Uv(a.P, out var au, out var av, out var aw);
                    Uv(b.P, out var bu, out var bv, out var bw);
                    if (s.Curve != "none" && s.ArcMid != null)
                    {
                        Uv(new Vec3(s.ArcMid[0], s.ArcMid[1], s.ArcMid[2]), out var mu, out var mv, out var mw);
                        ss = skm.Create3PointArc(au, av, aw, bu, bv, bw, mu, mv, mw);
                    }
                    else
                        ss = skm.CreateLine(au, av, aw, bu, bv, bw);
                    if (ss == null) continue;
                    s.SwEntity = ss;
                    try { ss.Color = s.Branch == Branches.Return ? Rgb(251, 146, 60) : Rgb(59, 130, 246); } catch { }
                    WriteAttrs(doc, ss, _segDef, ModelBuilder.SegmentAttrs(s), "PIDM_SEG_" + s.Id);
                }
                foreach (var n in m.Nodes.Where(n => n.IsDrum))
                {
                    Uv(n.P, out var nu, out var nv, out var nw);
                    var sp = skm.CreatePoint(nu, nv, nw);
                    if (sp == null) continue;
                    n.SwEntity = sp;
                    WriteAttrs(doc, sp, _nodeDef, ModelBuilder.NodeAttrs(n), "PIDM_NODE_" + n.Id);
                }
                foreach (var a in m.Attachments)
                {
                    Uv(a.P, out var au2, out var av2, out var aw2);
                    var sp = skm.CreatePoint(au2, av2, aw2);
                    if (sp == null) continue;
                    a.SwEntity = sp;
                    WriteAttrs(doc, sp, _attDef, ModelBuilder.AttachmentAttrs(a), "PIDM_ATT_" + a.Id);
                }
            }
            finally
            {
                skm.AddToDB = false;
                skm.DisplayWhenAdded = true;
            }
        }

        /// <summary>只回写属性（几何不变）：段按实体句柄，滚筒按已有点或新建点。</summary>
        public void WriteBackAttrs(ModelDoc2 doc, PathModel m)
        {
            var skm = doc.SketchManager;
            var sk = skm.ActiveSketch;
            _uvKind = (sk != null && !sk.Is3D())
                ? (SketchKinds.IsPlanar(m.Line.SketchKind) ? m.Line.SketchKind : SketchKinds.PlanarXz)
                : SketchKinds.Space3d;
            foreach (var s in m.Segments)
                if (s.SwEntity != null) WriteAttrs(doc, s.SwEntity, _segDef, ModelBuilder.SegmentAttrs(s), "PIDM_SEG_" + s.Id);
            skm.AddToDB = true; skm.DisplayWhenAdded = false;
            try
            {
                foreach (var n in m.Nodes)
                {
                    if (!n.IsDrum && n.PointRole == PointRoles.None) { continue; }
                    if (n.SwEntity == null)
                    {
                        Uv(n.P, out var nu, out var nv, out var nw);
                        n.SwEntity = skm.CreatePoint(nu, nv, nw);
                    }
                    if (n.SwEntity != null) WriteAttrs(doc, n.SwEntity, _nodeDef, ModelBuilder.NodeAttrs(n), "PIDM_NODE_" + n.Id);
                }
                foreach (var a in m.Attachments)
                {
                    if (a.SwEntity == null)
                    {
                        Uv(a.P, out var au, out var av, out var aw);
                        a.SwEntity = skm.CreatePoint(au, av, aw);
                    }
                    if (a.SwEntity != null) WriteAttrs(doc, a.SwEntity, _attDef, ModelBuilder.AttachmentAttrs(a), "PIDM_ATT_" + a.Id);
                }
            }
            finally { skm.AddToDB = false; skm.DisplayWhenAdded = true; }
        }

        static int Rgb(int r, int g, int b) => r | (g << 8) | (b << 16);

        // ------------------------------------------------------------------ 选择
        /// <summary>当前选中的草图线段端点（用于映射到模型段）与草图点坐标。</summary>
        public void ReadSelection(ModelDoc2 doc, out List<(Vec3 a, Vec3 b)> segEnds, out List<Vec3> points)
        {
            segEnds = new List<(Vec3, Vec3)>(); points = new List<Vec3>();
            var feat = FindPathSketch(doc);
            if (feat != null)
            {
                var sk = feat.GetSpecificFeature2() as Sketch;
                if (sk != null && !sk.Is3D())
                {
                    var cache = LoadCache(doc);
                    string hint = SketchKinds.PlanarXz;
                    if (!string.IsNullOrEmpty(cache))
                    {
                        try { var lm = JsonIO.Deserialize(cache); if (SketchKinds.IsPlanar(lm.Line?.SketchKind)) hint = lm.Line.SketchKind; } catch { }
                    }
                    _uvKind = hint;
                }
                else _uvKind = SketchKinds.Space3d;
            }
            var sel = (SelectionMgr)doc.SelectionManager;
            int n = sel.GetSelectedObjectCount2(-1);
            for (int i = 1; i <= n; i++)
            {
                var type = (swSelectType_e)sel.GetSelectedObjectType3(i, -1);
                var obj = sel.GetSelectedObject6(i, -1);
                if (type == swSelectType_e.swSelSKETCHSEGS || type == swSelectType_e.swSelEXTSKETCHSEGS)
                {
                    var ss = (SketchSegment)obj;
                    var t = (swSketchSegments_e)ss.GetType();
                    if (t == swSketchSegments_e.swSketchLINE)
                    {
                        var l = (SketchLine)ss;
                        segEnds.Add((V((SketchPoint)l.GetStartPoint2()), V((SketchPoint)l.GetEndPoint2())));
                    }
                    else if (t == swSketchSegments_e.swSketchARC)
                    {
                        var arc = (SketchArc)ss;
                        segEnds.Add((V((SketchPoint)arc.GetStartPoint2()), V((SketchPoint)arc.GetEndPoint2())));
                    }
                }
                else if (type == swSelectType_e.swSelSKETCHPOINTS || type == swSelectType_e.swSelEXTSKETCHPOINTS)
                {
                    points.Add(V((SketchPoint)obj));
                }
            }
        }
    }
}
