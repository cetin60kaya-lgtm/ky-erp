using System;
using System.Collections.Generic;
using System.Linq;
using System.Windows.Forms;

namespace QuickDataTool;

public sealed class PayrollEditForm : Form
{
    private readonly Dictionary<string, TextBox> boxes = new(StringComparer.OrdinalIgnoreCase);
    private readonly Dictionary<string, string> originals = new(StringComparer.OrdinalIgnoreCase);

    public static readonly string[] Fields =
    [
        "DMAAS",
        "GUN1","SAAT1","UCRET1","GUN2","SAAT2","UCRET2","GUN3","SAAT3","UCRET3",
        "GUN4","SAAT4","UCRET4","GUN5","SAAT5","UCRET5","GUN6","SAAT6","UCRET6",
        "GUN7","SAAT7","UCRET7","GUN8","SAAT8","UCRET8","GUN9","SAAT9","UCRET9",
        "GUN10","SAAT10","UCRET10",
        "NCGUN","NCSAAT","NCUCRET","NCODENEN",
        "FMSAAT","FMUCRET","FMODENEN","FMKALAN",
        "DEVS","DEVG","DEVU","DEVCEZAS","DEVCEZAU",
        "ERS","ERG","ERU","ERCEZAS","ERCEZAU",
        "GECS","GECG","GECU","GECCEZAS","GECCEZAU",
        "EKS","EKG","EKU","EKCEZAS","EKCEZAU",
        "AYS","AYU","TOPEKS","YOLU","YEMEKU","DEVIR",
        "EX1","EX2","EX3","EX4","EX5","EX6",
        "EKKES","EKKAZ","NCMAAS","NCKALAN","SSKG","BOLUM","MESAIKESINTIS"
    ];

    public IEnumerable<string> ChangedFields =>
        Fields.Where(key => boxes.TryGetValue(key, out var box) &&
                            !string.Equals((originals.TryGetValue(key, out var old) ? old : "").Trim(),
                                           box.Text.Trim(), StringComparison.Ordinal));

    public string Get(string key) => boxes.TryGetValue(key, out var box) ? box.Text.Trim() : "";

    public PayrollEditForm(string card, DataGridViewRow row)
    {
        Text = "Bordro Düzenle - " + card;
        Width = 820;
        Height = 780;
        MinimumSize = new System.Drawing.Size(720, 620);
        StartPosition = FormStartPosition.CenterParent;
        Font = new System.Drawing.Font("Segoe UI", 9f);

        var root = new TableLayoutPanel { Dock = DockStyle.Fill, RowCount = 3, ColumnCount = 1, Padding = new Padding(10) };
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 34));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 54));

        root.Controls.Add(new Label
        {
            Text = "REV26 • Tüm bordro bölümleri düzenlenebilir. Elle girilen değerler otomatik olarak ezilmez.",
            Dock = DockStyle.Fill,
            TextAlign = System.Drawing.ContentAlignment.MiddleLeft,
            ForeColor = System.Drawing.Color.DarkBlue
        }, 0, 0);

        var tabs = new TabControl { Dock = DockStyle.Fill };
        tabs.TabPages.Add(BuildPage("Çalışma / Gün-Saat", row,
            ["DMAAS","GUN1","SAAT1","UCRET1","GUN2","SAAT2","UCRET2","GUN3","SAAT3","UCRET3",
             "GUN4","SAAT4","UCRET4","GUN5","SAAT5","UCRET5","GUN6","SAAT6","UCRET6",
             "GUN7","SAAT7","UCRET7","GUN8","SAAT8","UCRET8","GUN9","SAAT9","UCRET9","GUN10","SAAT10","UCRET10"]));

        tabs.TabPages.Add(BuildPage("Net / Mesai", row,
            ["NCGUN","NCSAAT","NCUCRET","NCODENEN","FMSAAT","FMUCRET","FMODENEN","FMKALAN","NCMAAS","NCKALAN","MESAIKESINTIS"]));

        tabs.TabPages.Add(BuildPage("Devam / Kesinti", row,
            ["DEVS","DEVG","DEVU","DEVCEZAS","DEVCEZAU",
             "ERS","ERG","ERU","ERCEZAS","ERCEZAU",
             "GECS","GECG","GECU","GECCEZAS","GECCEZAU",
             "EKS","EKG","EKU","EKCEZAS","EKCEZAU"]));

        tabs.TabPages.Add(BuildPage("Ödeme / Ekler", row,
            ["AYS","AYU","TOPEKS","YOLU","YEMEKU","DEVIR","EX1","EX2","EX3","EX4","EX5","EX6","EKKES","EKKAZ","SSKG","BOLUM"]));

        root.Controls.Add(tabs, 0, 1);

        var save = new Button { Text = "Kaydet", Width = 120, Height = 34 };
        var cancel = new Button { Text = "Vazgeç", Width = 120, Height = 34, DialogResult = DialogResult.Cancel };
        save.Click += (_, _) =>
        {
            DialogResult = DialogResult.OK;
            Close();
        };

        var bar = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.RightToLeft, Padding = new Padding(6) };
        bar.Controls.Add(save);
        bar.Controls.Add(cancel);
        root.Controls.Add(bar, 0, 2);

        Controls.Add(root);
        AcceptButton = save;
        CancelButton = cancel;
    }

    private TabPage BuildPage(string title, DataGridViewRow row, IEnumerable<string> fields)
    {
        var page = new TabPage(title) { Padding = new Padding(6) };
        var panel = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 2, AutoScroll = true, Padding = new Padding(10) };
        panel.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 230));
        panel.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));

        foreach (var field in fields)
        {
            var value = Cell(row, field);
            originals[field] = value;
            var box = new TextBox { Dock = DockStyle.Top, Text = value, BorderStyle = BorderStyle.FixedSingle };
            boxes[field] = box;
            var r = panel.RowCount++;
            panel.RowStyles.Add(new RowStyle(SizeType.Absolute, 31));
            panel.Controls.Add(new Label
            {
                Text = LabelFor(field),
                Dock = DockStyle.Fill,
                TextAlign = System.Drawing.ContentAlignment.MiddleLeft
            }, 0, r);
            panel.Controls.Add(box, 1, r);
        }

        page.Controls.Add(panel);
        return page;
    }

    private static string Cell(DataGridViewRow row, string key) =>
        row.DataGridView?.Columns.Contains(key) == true ? Convert.ToString(row.Cells[key].Value) ?? "" : "";

    private static string LabelFor(string key) => key switch
    {
        "DMAAS" => "Maaş",
        "GUN1" => "Normal Gün",
        "SAAT1" => "Normal Saat",
        "UCRET1" => "Normal Ücret",
        "GUN2" => "H.İ.M Gün",
        "SAAT2" => "H.İ.M Saat",
        "UCRET2" => "H.İ.M Ücret",
        "GUN3" => "H.S.M Gün",
        "SAAT3" => "H.S.M Saat",
        "UCRET3" => "H.S.M Ücret",
        "GUN4" => "Ücretsiz İzin Gün",
        "SAAT4" => "Ücretsiz İzin Saat",
        "UCRET4" => "Ücretsiz İzin Ücret",
        "NCGUN" => "Net Gün",
        "NCSAAT" => "Net Saat",
        "NCUCRET" => "Net Çalışma Ücreti",
        "NCODENEN" => "Banka / Ödenen",
        "FMSAAT" => "Mesai Saat",
        "FMUCRET" => "Mesai Ücret",
        "FMODENEN" => "Mesai Ödenen",
        "FMKALAN" => "Mesai Kalan",
        "DEVS" => "Devamsızlık Saat",
        "DEVG" => "Devamsızlık Gün",
        "DEVU" => "Devamsızlık Ücret",
        "GECS" => "Geç Saat",
        "GECG" => "Geç Gün",
        "GECU" => "Geç Kesinti",
        "ERS" => "Erken Çıkış Saat",
        "ERG" => "Erken Çıkış Gün",
        "ERU" => "Erken Çıkış Kesinti",
        "EKS" => "Eksik Saat",
        "EKG" => "Eksik Gün",
        "EKU" => "Eksik Kesinti",
        "EKKAZ" => "Ek Kazanç",
        "EKKES" => "Ek Kesinti",
        "YOLU" => "Yol",
        "YEMEKU" => "Yemek",
        "DEVIR" => "Devir",
        "NCMAAS" => "Net / Maaş",
        "NCKALAN" => "Net / Maaş Kalan",
        "MESAIKESINTIS" => "Mesai Kesinti Saati",
        _ => key
    };
}
