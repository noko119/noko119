using System;
using System.Collections.Generic;
using System.Drawing;
using System.Globalization;
using System.Linq;
using System.Windows.Forms;

namespace PidmPath.AddIn
{
    /// <summary>通用属性对话框：按字段定义动态生成（文本/数值/下拉/勾选），返回字典。</summary>
    internal class FieldSpec
    {
        public string Key, Label, Hint;
        public string Kind = "text";           // text | number | combo | check
        public string Default = "";
        public (string value, string label)[] Options;
        public static FieldSpec Text(string key, string label, string def = "", string hint = null) => new FieldSpec { Key = key, Label = label, Default = def, Hint = hint };
        public static FieldSpec Number(string key, string label, double? def, string hint = null) => new FieldSpec { Key = key, Label = label, Kind = "number", Default = def.HasValue ? def.Value.ToString(CultureInfo.InvariantCulture) : "", Hint = hint };
        public static FieldSpec Combo(string key, string label, (string, string)[] options, string def, string hint = null) => new FieldSpec { Key = key, Label = label, Kind = "combo", Options = options, Default = def, Hint = hint };
        public static FieldSpec Check(string key, string label, bool def, string hint = null) => new FieldSpec { Key = key, Label = label, Kind = "check", Default = def ? "1" : "0", Hint = hint };
    }

    internal class PropertyDialog : Form
    {
        readonly Dictionary<string, Control> _controls = new Dictionary<string, Control>();
        readonly List<FieldSpec> _specs;
        public Dictionary<string, string> Values { get; } = new Dictionary<string, string>();

        public PropertyDialog(string title, IEnumerable<FieldSpec> specs, string banner = null)
        {
            _specs = specs.ToList();
            Text = title;
            FormBorderStyle = FormBorderStyle.FixedDialog;
            StartPosition = FormStartPosition.CenterParent;
            MaximizeBox = MinimizeBox = false;
            Font = new Font("Microsoft YaHei UI", 9f);
            AutoScaleMode = AutoScaleMode.Dpi;
            int w = 460, y = 12;
            if (!string.IsNullOrEmpty(banner))
            {
                var b = new Label { Text = banner, Left = 12, Top = y, Width = w - 24, Height = 44, ForeColor = Color.FromArgb(70, 70, 70) };
                Controls.Add(b); y += 50;
            }
            foreach (var s in _specs)
            {
                var lab = new Label { Text = s.Label, Left = 12, Top = y + 4, Width = 150 };
                Controls.Add(lab);
                Control c;
                switch (s.Kind)
                {
                    case "combo":
                        var cb = new ComboBox { Left = 170, Top = y, Width = 270, DropDownStyle = ComboBoxStyle.DropDownList };
                        foreach (var o in s.Options) cb.Items.Add(new Opt(o.value, o.label));
                        var idx = Array.FindIndex(s.Options, o => o.value == s.Default);
                        cb.SelectedIndex = idx >= 0 ? idx : 0;
                        c = cb; break;
                    case "check":
                        c = new CheckBox { Left = 170, Top = y, Width = 270, Checked = s.Default == "1", Text = "" }; break;
                    default:
                        c = new TextBox { Left = 170, Top = y, Width = 270, Text = s.Default }; break;
                }
                Controls.Add(c); _controls[s.Key] = c;
                y += 30;
                if (!string.IsNullOrEmpty(s.Hint))
                {
                    var h = new Label { Text = s.Hint, Left = 170, Top = y - 4, Width = 270, Height = 30, ForeColor = Color.Gray, Font = new Font(Font.FontFamily, 8f) };
                    Controls.Add(h); y += 26;
                }
            }
            var ok = new Button { Text = "确定", Left = w - 190, Top = y + 8, Width = 80, DialogResult = DialogResult.OK };
            var cancel = new Button { Text = "取消", Left = w - 100, Top = y + 8, Width = 80, DialogResult = DialogResult.Cancel };
            ok.Click += (s2, e) => Collect();
            Controls.Add(ok); Controls.Add(cancel);
            AcceptButton = ok; CancelButton = cancel;
            ClientSize = new Size(w, y + 48);
        }

        void Collect()
        {
            Values.Clear();
            foreach (var s in _specs)
            {
                var c = _controls[s.Key];
                switch (s.Kind)
                {
                    case "combo": Values[s.Key] = ((Opt)((ComboBox)c).SelectedItem)?.Value ?? ""; break;
                    case "check": Values[s.Key] = ((CheckBox)c).Checked ? "1" : "0"; break;
                    default: Values[s.Key] = ((TextBox)c).Text.Trim(); break;
                }
            }
        }

        public double? Num(string key)
        {
            if (!Values.TryGetValue(key, out var v) || string.IsNullOrWhiteSpace(v)) return null;
            v = v.Replace('，', ',').Replace(",", "");
            return double.TryParse(v, NumberStyles.Float, CultureInfo.InvariantCulture, out var d) ? d : (double?)null;
        }
        public string Str(string key) => Values.TryGetValue(key, out var v) ? v : null;
        public bool Bool(string key) => Values.TryGetValue(key, out var v) && v == "1";

        class Opt { public string Value, Label; public Opt(string v, string l) { Value = v; Label = l; } public override string ToString() => Label; }
    }

    internal static class Msg
    {
        public static void Info(string text, string title = "DTⅡ 路径") => MessageBox.Show(text, title, MessageBoxButtons.OK, MessageBoxIcon.Information);
        public static void Warn(string text, string title = "DTⅡ 路径") => MessageBox.Show(text, title, MessageBoxButtons.OK, MessageBoxIcon.Warning);
        public static void Error(string text, string title = "DTⅡ 路径") => MessageBox.Show(text, title, MessageBoxButtons.OK, MessageBoxIcon.Error);
        public static bool Confirm(string text, string title = "DTⅡ 路径") => MessageBox.Show(text, title, MessageBoxButtons.YesNo, MessageBoxIcon.Question) == DialogResult.Yes;
    }

    /// <summary>滚动文本结果窗（检查结果、特性点、滚筒间距）。</summary>
    internal class ReportDialog : Form
    {
        public ReportDialog(string title, string text)
        {
            Text = title; StartPosition = FormStartPosition.CenterParent; Width = 720; Height = 520;
            Font = new Font("Microsoft YaHei UI", 9f);
            var tb = new TextBox { Multiline = true, ReadOnly = true, ScrollBars = ScrollBars.Both, Dock = DockStyle.Fill, Text = text, WordWrap = false, Font = new Font("Consolas", 9.5f) };
            Controls.Add(tb);
        }
    }
}
