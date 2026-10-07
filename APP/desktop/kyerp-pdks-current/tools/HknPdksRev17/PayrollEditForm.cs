using System;
using System.Collections.Generic;
using System.Drawing;
using System.Windows.Forms;

namespace QuickDataTool;

public sealed class PayrollEditForm : Form
{
    private readonly Dictionary<string, TextBox> boxes = new(StringComparer.OrdinalIgnoreCase);
    private readonly CheckBox autoHours = new()
    {
        Text = "Normal Gün değişince Normal Saat / Net Gün / Net Saat otomatik hesaplansın",
        AutoSize = true,
        Checked = true,
        Padding = new Padding(0, 4, 0, 6)
    };

    public static readonly string[] Fields = PayrollOverrideService.UiEditFields;
    public bool AutoHours => autoHours.Checked;

    public string Get(string key) => boxes.TryGetValue(key, out var box) ? box.Text.Trim() : "";

    public Dictionary<string, string> Values()
    {
        var result = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var field in Fields) result[field] = Get(field);
        return result;
    }

    public PayrollEditForm(string card, IReadOnlyDictionary<string, string> values)
    {
        Text = "Bordro Düzenle - " + card;
        Width = 700;
        Height = 690;
        StartPosition = FormStartPosition.CenterParent;
        Font = new Font("Segoe UI", 9f);

        var outer = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            Padding = new Padding(14),
            ColumnCount = 2,
            AutoScroll = true
        };
        outer.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 220f));
        outer.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100f));

        var title = new Label
        {
            Text = "BORDRO DÜZENLE",
            AutoSize = true,
            Font = new Font("Segoe UI", 11f, FontStyle.Bold),
            Padding = new Padding(0, 0, 0, 6)
        };
        outer.Controls.Add(title, 0, outer.RowCount);
        outer.SetColumnSpan(title, 2);
        outer.RowCount++;

        outer.Controls.Add(autoHours, 0, outer.RowCount);
        outer.SetColumnSpan(autoHours, 2);
        outer.RowCount++;

        AddGroup(outer, "NORMAL ÇALIŞMA");
        AddField(outer, values, "DMAAS", "Maaşı");
        AddField(outer, values, "GUN1", "N.Çalışma Gün");
        AddField(outer, values, "SAAT1", "N.Çalışma Saat");
        AddField(outer, values, "UCRET1", "Normal Ücret");
        AddField(outer, values, "NCGUN", "Net Gün");
        AddField(outer, values, "NCSAAT", "Net Saat");
        AddField(outer, values, "NCUCRET", "Net Çalışma Ücreti");

        AddGroup(outer, "MESAİ / İZİN");
        AddField(outer, values, "SAAT2", "H.İ.M. Saat");
        AddField(outer, values, "UCRET2", "H.İ.M. Ücret");
        AddField(outer, values, "SAAT3", "H.S.M. Saat");
        AddField(outer, values, "UCRET3", "H.S.M. Ücret");
        AddField(outer, values, "GUN4", "Ücretsiz İzin Gün");
        AddField(outer, values, "SAAT4", "Ücretsiz İzin Saat");

        AddGroup(outer, "DEVAM / KESİNTİ");
        AddField(outer, values, "DEVG", "Devamsızlık Gün");
        AddField(outer, values, "DEVS", "Devamsızlık Saat");
        AddField(outer, values, "GECS", "Geç Saat");
        AddField(outer, values, "EKS", "Eksik Saat");
        AddField(outer, values, "EKKAZ", "Ek Kazanç");
        AddField(outer, values, "EKKES", "Kesinti");

        AddGroup(outer, "MAAŞ / ÖDEME");
        AddField(outer, values, "EX2", "Banka");
        AddField(outer, values, "NCMAAS", "Maaş");
        AddField(outer, values, "NCKALAN", "Net / Maaş Kalan");
        AddField(outer, values, "FMSAAT", "Mesai Saat");
        AddField(outer, values, "FMUCRET", "Mesai Ücret");
        AddField(outer, values, "FMODENEN", "Mesai Ödenen");
        AddField(outer, values, "FMKALAN", "Mesai Kalan");

        var save = new Button { Text = "Kaydet", DialogResult = DialogResult.OK, Width = 120, Height = 34 };
        var cancel = new Button { Text = "Vazgeç", DialogResult = DialogResult.Cancel, Width = 120, Height = 34 };
        var buttons = new FlowLayoutPanel { Dock = DockStyle.Top, FlowDirection = FlowDirection.RightToLeft, Height = 46 };
        buttons.Controls.Add(save);
        buttons.Controls.Add(cancel);
        outer.Controls.Add(buttons, 0, outer.RowCount);
        outer.SetColumnSpan(buttons, 2);

        Controls.Add(outer);
        AcceptButton = save;
        CancelButton = cancel;
        AppTheme.Apply(this);
    }

    private void AddField(TableLayoutPanel outer, IReadOnlyDictionary<string,string> values, string field, string label)
    {
        values.TryGetValue(field, out var value);
        var box = new TextBox { Dock = DockStyle.Top, Text = value ?? "" };
        boxes[field] = box;
        outer.Controls.Add(new Label { Text = label, Dock = DockStyle.Top, Height = 27, Padding = new Padding(0, 4, 0, 0) }, 0, outer.RowCount);
        outer.Controls.Add(box, 1, outer.RowCount);
        outer.RowCount++;
    }

    private static void AddGroup(TableLayoutPanel outer, string text)
    {
        var label = new Label
        {
            Text = text,
            AutoSize = true,
            Font = new Font("Segoe UI", 9f, FontStyle.Bold),
            ForeColor = Color.MidnightBlue,
            Padding = new Padding(0, 9, 0, 3)
        };
        outer.Controls.Add(label, 0, outer.RowCount);
        outer.SetColumnSpan(label, 2);
        outer.RowCount++;
    }
}
