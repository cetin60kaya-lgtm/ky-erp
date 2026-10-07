using System;
using System.Collections.Generic;
using System.Drawing;
using System.Linq;
using System.Windows.Forms;

namespace QuickDataTool;

public sealed class PayrollEditForm : Form
{
    private readonly Dictionary<string, TextBox> boxes = new(StringComparer.OrdinalIgnoreCase);
    private readonly CheckBox autoHours = new()
    {
        Text = "Normal Gün değişince Normal Saat / Net Gün / Net Saat otomatik hesaplansın",
        AutoSize = true,
        Checked = false,
        Padding = new Padding(0, 4, 0, 6)
    };

    public static readonly string[] Fields = PayrollOverrideService.EditableFields;
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
        Width = 760;
        Height = 760;
        StartPosition = FormStartPosition.CenterParent;
        Font = new Font("Segoe UI", 9f);

        var root = new TableLayoutPanel { Dock = DockStyle.Fill, RowCount = 3, ColumnCount = 1, Padding = new Padding(10) };
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 64));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 52));

        var head = new Panel { Dock = DockStyle.Fill };
        head.Controls.Add(autoHours);
        autoHours.Dock = DockStyle.Bottom;
        head.Controls.Add(new Label
        {
            Text = "BORDRO DÜZENLE • REV26",
            Dock = DockStyle.Top,
            Height = 28,
            Font = new Font("Segoe UI", 11f, FontStyle.Bold)
        });
        root.Controls.Add(head, 0, 0);

        var tabs = new TabControl { Dock = DockStyle.Fill };
        tabs.TabPages.Add(Page("Normal Çalışma", values,
            "DMAAS","GUN1","SAAT1","UCRET1","NCGUN","NCSAAT","NCUCRET","NCODENEN","NCMAAS","NCKALAN"));
        tabs.TabPages.Add(Page("Mesai / İzin", values,
            "GUN2","SAAT2","UCRET2","GUN3","SAAT3","UCRET3","GUN4","SAAT4","UCRET4",
            "GUN5","SAAT5","UCRET5","GUN6","SAAT6","UCRET6","GUN7","SAAT7","UCRET7",
            "GUN8","SAAT8","UCRET8","GUN9","SAAT9","UCRET9","GUN10","SAAT10","UCRET10",
            "FMSAAT","FMUCRET","FMODENEN","FMKALAN"));
        tabs.TabPages.Add(Page("Devam / Kesinti", values,
            "DEVS","DEVG","DEVU","DEVCEZAS","DEVCEZAU","ERS","ERG","ERU","ERCEZAS","ERCEZAU",
            "GECS","GECG","GECU","GECCEZAS","GECCEZAU","EKS","EKG","EKU","EKCEZAS","EKCEZAU",
            "AYS","AYU","TOPEKS","MESAIKESINTIS"));
        tabs.TabPages.Add(Page("Ödeme / Ekler", values,
            "YOLU","YEMEKU","DEVIR","EX1","EX2","EX3","EX4","EX5","EX6","EKKES","EKKAZ","SSKG","BOLUM"));
        root.Controls.Add(tabs, 0, 1);

        var save = new Button { Text = "Kaydet", DialogResult = DialogResult.OK, Width = 120, Height = 34 };
        var cancel = new Button { Text = "Vazgeç", DialogResult = DialogResult.Cancel, Width = 120, Height = 34 };
        var buttons = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.RightToLeft, Padding = new Padding(6) };
        buttons.Controls.Add(save);
        buttons.Controls.Add(cancel);
        root.Controls.Add(buttons, 0, 2);

        Controls.Add(root);
        AcceptButton = save;
        CancelButton = cancel;
        AppTheme.Apply(this);
    }

    private TabPage Page(string title, IReadOnlyDictionary<string,string> values, params string[] fields)
    {
        var page = new TabPage(title) { Padding = new Padding(8) };
        var table = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 2, AutoScroll = true, Padding = new Padding(8) };
        table.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 220f));
        table.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100f));
        foreach (var field in fields.Where(Fields.Contains))
        {
            values.TryGetValue(field, out var value);
            var box = new TextBox { Dock = DockStyle.Top, Text = value ?? "" };
            boxes[field] = box;
            table.Controls.Add(new Label { Text = LabelFor(field), Dock = DockStyle.Top, Height = 27, Padding = new Padding(0, 4, 0, 0) }, 0, table.RowCount);
            table.Controls.Add(box, 1, table.RowCount);
            table.RowCount++;
        }
        page.Controls.Add(table);
        return page;
    }

    private static string LabelFor(string f) => f switch
    {
        "DMAAS"=>"Maaş","GUN1"=>"Normal Çalışma Gün","SAAT1"=>"Normal Çalışma Saat","UCRET1"=>"Normal Ücret",
        "NCGUN"=>"Net Gün","NCSAAT"=>"Net Saat","NCUCRET"=>"Net Çalışma Ücreti","NCODENEN"=>"Net Ödenen",
        "NCMAAS"=>"Maaş","NCKALAN"=>"Net / Maaş Kalan",
        "SAAT2"=>"H.İ.M. Saat","UCRET2"=>"H.İ.M. Ücret","SAAT3"=>"H.S.M. Saat","UCRET3"=>"H.S.M. Ücret",
        "GUN4"=>"Ücretsiz İzin Gün","SAAT4"=>"Ücretsiz İzin Saat","UCRET4"=>"Ücretsiz İzin Ücret",
        "FMSAAT"=>"Mesai Saat","FMUCRET"=>"Mesai Ücret","FMODENEN"=>"Mesai Ödenen","FMKALAN"=>"Mesai Kalan",
        "DEVG"=>"Devamsızlık Gün","DEVS"=>"Devamsızlık Saat","DEVU"=>"Devamsızlık Ücret",
        "GECS"=>"Geç Saat","GECG"=>"Geç Gün","GECU"=>"Geç Kesinti",
        "ERS"=>"Erken Çıkış Saat","ERG"=>"Erken Çıkış Gün","ERU"=>"Erken Çıkış Kesinti",
        "EKS"=>"Eksik Saat","EKG"=>"Eksik Gün","EKU"=>"Eksik Kesinti",
        "EKKAZ"=>"Ek Kazanç","EKKES"=>"Kesinti","YOLU"=>"Yol","YEMEKU"=>"Yemek","DEVIR"=>"Devir",
        "EX2"=>"Banka","SSKG"=>"SSK Gün","BOLUM"=>"Bölüm","MESAIKESINTIS"=>"Mesai Kesinti Saat",
        _=>f
    };
}
