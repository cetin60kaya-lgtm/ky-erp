using System;
using System.Collections.Generic;
using System.Drawing;
using System.Windows.Forms;

namespace QuickDataTool;

public sealed class BulkPayrollEditForm : Form
{
    private readonly Dictionary<string, CheckBox> enabled = new(StringComparer.OrdinalIgnoreCase);
    private readonly Dictionary<string, TextBox> values = new(StringComparer.OrdinalIgnoreCase);
    private readonly CheckBox autoHours = new()
    {
        Text = "Normal Gün değişince Normal Saat / Net Gün / Net Saat otomatik hesaplansın",
        AutoSize = true,
        Checked = true,
        Padding = new Padding(0, 4, 0, 6)
    };

    public bool AutoHours => autoHours.Checked;

    public BulkPayrollEditForm(int selectedCount)
    {
        Text = $"Toplu Bordro Düzenle - {selectedCount} Personel";
        Width = 680;
        Height = 670;
        StartPosition = FormStartPosition.CenterParent;
        Font = new Font("Segoe UI", 9f);

        var outer = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            Padding = new Padding(14),
            ColumnCount = 3,
            AutoScroll = true
        };
        outer.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 38f));
        outer.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 220f));
        outer.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100f));

        var note = new Label
        {
            Text = "Yalnız işaretlediğiniz alanlar seçili personellere uygulanır.",
            AutoSize = true,
            Font = new Font("Segoe UI", 10f, FontStyle.Bold),
            Padding = new Padding(0, 0, 0, 8)
        };
        outer.Controls.Add(note, 0, outer.RowCount);
        outer.SetColumnSpan(note, 3);
        outer.RowCount++;

        outer.Controls.Add(autoHours, 0, outer.RowCount);
        outer.SetColumnSpan(autoHours, 3);
        outer.RowCount++;

        AddGroup(outer, "NORMAL ÇALIŞMA");
        AddField(outer, "GUN1", "N.Çalışma Gün");
        AddField(outer, "SAAT1", "N.Çalışma Saat");
        AddField(outer, "UCRET1", "Normal Ücret");
        AddField(outer, "NCGUN", "Net Gün");
        AddField(outer, "NCSAAT", "Net Saat");
        AddField(outer, "NCUCRET", "Net Çalışma Ücreti");

        AddGroup(outer, "MESAİ / İZİN");
        AddField(outer, "SAAT2", "H.İ.M. Saat");
        AddField(outer, "UCRET2", "H.İ.M. Ücret");
        AddField(outer, "SAAT3", "H.S.M. Saat");
        AddField(outer, "UCRET3", "H.S.M. Ücret");
        AddField(outer, "GUN4", "Ücretsiz İzin Gün");
        AddField(outer, "SAAT4", "Ücretsiz İzin Saat");

        AddGroup(outer, "DEVAM / KESİNTİ");
        AddField(outer, "DEVG", "Devamsızlık Gün");
        AddField(outer, "DEVS", "Devamsızlık Saat");
        AddField(outer, "GECS", "Geç Saat");
        AddField(outer, "EKS", "Eksik Saat");
        AddField(outer, "EKKAZ", "Ek Kazanç");
        AddField(outer, "EKKES", "Kesinti");

        AddGroup(outer, "MAAŞ / ÖDEME");
        AddField(outer, "EX2", "Banka");
        AddField(outer, "NCMAAS", "Maaş");
        AddField(outer, "NCKALAN", "Net / Maaş Kalan");
        AddField(outer, "FMSAAT", "Mesai Saat");
        AddField(outer, "FMUCRET", "Mesai Ücret");
        AddField(outer, "FMODENEN", "Mesai Ödenen");
        AddField(outer, "FMKALAN", "Mesai Kalan");

        var apply = new Button { Text = "Seçililere Uygula", DialogResult = DialogResult.OK, Width = 150, Height = 34 };
        var cancel = new Button { Text = "Vazgeç", DialogResult = DialogResult.Cancel, Width = 120, Height = 34 };
        var buttons = new FlowLayoutPanel { Dock = DockStyle.Top, FlowDirection = FlowDirection.RightToLeft, Height = 46 };
        buttons.Controls.Add(apply);
        buttons.Controls.Add(cancel);
        outer.Controls.Add(buttons, 0, outer.RowCount);
        outer.SetColumnSpan(buttons, 3);

        Controls.Add(outer);
        AcceptButton = apply;
        CancelButton = cancel;
    }

    public Dictionary<string,string> SelectedValues()
    {
        var result = new Dictionary<string,string>(StringComparer.OrdinalIgnoreCase);
        foreach (var field in enabled.Keys)
            if (enabled[field].Checked)
                result[field] = values[field].Text.Trim();
        return result;
    }

    private void AddField(TableLayoutPanel outer, string field, string label)
    {
        var check = new CheckBox { AutoSize = true, Padding = new Padding(4, 5, 0, 0) };
        var box = new TextBox { Dock = DockStyle.Top, Enabled = false };
        check.CheckedChanged += (_, _) => box.Enabled = check.Checked;
        enabled[field] = check;
        values[field] = box;
        outer.Controls.Add(check, 0, outer.RowCount);
        outer.Controls.Add(new Label { Text = label, Dock = DockStyle.Top, Height = 27, Padding = new Padding(0, 4, 0, 0) }, 1, outer.RowCount);
        outer.Controls.Add(box, 2, outer.RowCount);
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
        outer.SetColumnSpan(label, 3);
        outer.RowCount++;
    }
}
