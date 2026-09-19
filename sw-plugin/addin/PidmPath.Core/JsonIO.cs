using System;
using System.IO;
using System.Text;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace PidmPath.Core
{
    public static class JsonIO
    {
        static readonly JsonSerializerSettings Settings = new JsonSerializerSettings
        {
            Formatting = Formatting.Indented,
            NullValueHandling = NullValueHandling.Include,
        };

        public static string Serialize(PathModel m)
        {
            m.RecomputeGeometry();
            if (m.Closure == null) Checks.Run(m);
            return JsonConvert.SerializeObject(m, Settings);
        }

        public static void Save(PathModel m, string path)
        {
            File.WriteAllText(path, Serialize(m), new UTF8Encoding(false));
        }

        /// <summary>读取 pidm.path.v0 或 bundle（含 path）。</summary>
        public static PathModel Load(string path) => Deserialize(File.ReadAllText(path, Encoding.UTF8));

        public static PathModel Deserialize(string json)
        {
            var root = JObject.Parse(json);
            var schema = (string)root["schema"] ?? "";
            JObject pathObj = root;
            if (schema.StartsWith("pidm.bundle")) pathObj = (JObject)root["path"] ?? throw new InvalidDataException("bundle 内无 path");
            var ps = (string)pathObj["schema"] ?? "";
            if (!ps.StartsWith("pidm.path")) throw new InvalidDataException($"不支持的 schema: {ps}");
            var m = pathObj.ToObject<PathModel>(JsonSerializer.Create(Settings));
            // 网页导出的节点可能没有 branch 字段：按段推断
            foreach (var n in m.Nodes)
            {
                if (string.IsNullOrEmpty(n.Branch))
                {
                    bool anyCarry = false, anyRet = false;
                    foreach (var s in m.Segments)
                    {
                        if (s.FromId != n.Id && s.ToId != n.Id) continue;
                        if (s.Branch == Branches.Return) anyRet = true; else anyCarry = true;
                    }
                    n.Branch = anyRet && !anyCarry ? Branches.Return : Branches.Carry;
                }
                if (n.Type == NodeTypes.Drive && n.IsMainDrive) n.DriveRole = "main";
            }
            foreach (var s in m.Segments) if (string.IsNullOrEmpty(s.Curve)) s.Curve = "none";
            m.RecomputeGeometry();
            return m;
        }
    }
}
