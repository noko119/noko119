using System;
using System.Drawing;
using System.Linq;
using System.Runtime.InteropServices;
using System.Windows.Forms;
using PidmPath.Core;

namespace PidmPath.AddIn
{
    /// <summary>右侧任务窗格：节点/滚筒表、区段表、检查结果。</summary>
    [ComVisible(true)]
    [ProgId(ProgIdValue)]
    [Guid("6B0C2A5E-4D7F-4C8B-9E31-2F7A8C5D1E90")]
    [ClassInterface(ClassInterfaceType.AutoDual)]
    public class TaskPaneHost : UserControl
    {
        public const string ProgIdValue = "PidmPath.AddIn.TaskPaneHost";
        readonly TabControl _tabs = new TabControl { Dock = DockStyle.Fill };
        readonly ListView _nodes = MakeList(new[] { ("序", 34), ("ID", 44), ("类型", 70), ("X", 62), ("Y", 50), ("Z", 62), ("D", 50), ("角色/属性", 120) });
        readonly ListView _segs = MakeList(new[] { ("ID", 40), ("分支", 44), ("sub_id", 80), ("L", 62), ("ΔH", 56), ("δ°", 50), ("托辊", 44), ("状态", 60) });
        readonly ListView _checks = MakeList(new[] { ("级别", 44), ("代码", 110), ("说明", 330), ("手册", 90) });
        readonly Label _summary = new Label { Dock = DockStyle.Top, Height = 48, Padding = new Padding(6), Text = "DTⅡ 路径 — 点“识别路径”或“门禁检查”刷新", Font = new Font("Microsoft YaHei UI", 9f) };
        public event EventHandler RefreshRequested;

        public TaskPaneHost()
        {
            Dock = DockStyle.Fill; Font = new Font("Microsoft YaHei UI", 9f);
            var btn = new Button { Text = "刷新", Dock = DockStyle.Top, Height = 28 };
            btn.Click += (s, e) => RefreshRequested?.Invoke(this, EventArgs.Empty);
            _tabs.TabPages.Add(Page("节点/滚筒", _nodes));
            _tabs.TabPages.Add(Page("区段", _segs));
            _tabs.TabPages.Add(Page("检查", _checks));
            Controls.Add(_tabs); Controls.Add(_summary); Controls.Add(btn);
        }

        static TabPage Page(string t, Control c) { var p = new TabPage(t); c.Dock = DockStyle.Fill; p.Controls.Add(c); return p; }

        static ListView MakeList((string, int)[] cols)
        {
            var lv = new ListView { View = View.Details, FullRowSelect = true, GridLines = true, HideSelection = false };
            foreach (var (n, w) in cols) lv.Columns.Add(n, w);
            return lv;
        }

        public void Update(PathModel m)
        {
            if (m == null) return;
            _summary.Text = $"{m.Line.Name}  B={m.Line.B}  v={m.Line.V}  侧型 {m.Line.SideType ?? "-"}\n节点 {m.Nodes.Count}  段 {m.Segments.Count}  ΣL={m.TotalLength:F1} m  Ln={m.HorizontalLength:F1} m  H={m.NetLift:F2} m";
            _nodes.BeginUpdate(); _nodes.Items.Clear();
            foreach (var n in m.Nodes)
            {
                var extra = n.Type == NodeTypes.Drive ? (n.IsMainDrive ? "主驱" : "辅驱") + (n.WrapDeg.HasValue ? $" φ{n.WrapDeg:F0}°" : "") + (n.Mu.HasValue ? $" μ{n.Mu:F2}" : "")
                    : n.Type == NodeTypes.Takeup ? TakeupKinds.Label(n.TakeupKind) : n.Type == NodeTypes.Bend || n.Type == NodeTypes.Tail || n.Type == NodeTypes.Head ? BendKinds.Label(n.BendKind) : "";
                if (n.PointRole != PointRoles.None) extra += " [" + (n.PointRole == PointRoles.Leave ? "S1 奔离" : n.PointRole == PointRoles.Manual1 ? "手定1" : "手定2") + "]";
                var it = new ListViewItem(new[] { n.Seq.ToString(), n.Id, NodeTypes.Label(n.Type) + (n.Branch == Branches.Return ? "·回" : ""), $"{n.X:F2}", $"{n.Y:F2}", $"{n.Z:F2}", n.DrumDmm?.ToString("F0") ?? "", extra });
                if (n.IsDrum) it.BackColor = Color.FromArgb(255, 248, 225);
                _nodes.Items.Add(it);
            }
            _nodes.EndUpdate();
            _segs.BeginUpdate(); _segs.Items.Clear();
            foreach (var s in m.Segments)
            {
                var it = new ListViewItem(new[] { s.Id, s.Branch == Branches.Return ? "回程" : "承载", s.SubId ?? "—", $"{s.L:F2}", $"{s.H:F2}", $"{s.DeltaDeg:F1}", s.AIdler?.ToString("F2") ?? "", s.ClassifyStatus });
                if (s.Curve != "none") it.BackColor = Color.FromArgb(230, 240, 255);
                if (s.Branch == Branches.Return) it.ForeColor = Color.FromArgb(180, 90, 20);
                _segs.Items.Add(it);
            }
            _segs.EndUpdate();
            _checks.BeginUpdate(); _checks.Items.Clear();
            if (m.Closure != null)
                foreach (var c in m.Closure.Items.OrderBy(i => i.Level == "error" ? 0 : i.Level == "warn" ? 1 : 2))
                {
                    var it = new ListViewItem(new[] { c.Level == "error" ? "错误" : c.Level == "warn" ? "警告" : "提示", c.Code, c.Message, c.Ref ?? "" });
                    it.ForeColor = c.Level == "error" ? Color.Firebrick : c.Level == "warn" ? Color.DarkGoldenrod : Color.DimGray;
                    _checks.Items.Add(it);
                }
            _checks.EndUpdate();
        }
    }
}
