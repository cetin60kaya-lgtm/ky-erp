using System;
using System.Collections.Generic;
using System.Windows.Forms;

namespace QuickDataTool;

public sealed class PayrollEditForm : Form
{
    private readonly Dictionary<string, TextBox> boxes = new(StringComparer.OrdinalIgnoreCase);
    private readonly CheckBox autoHours = new()
    {
        Text = "Normal Gün değişirse SAAT1 + NCGUN + NCSAAT günlük çalışma süresine göre otomatik eşitlensin",
        AutoSize = true,
        Checked = true
    };

    public static readonly string[] Fields = PayrollOverrideService.EditableFields;
    public bool AutoHours => autoHours.Checked;

    public string Get(string key) => boxes[key].Text.Trim();

    public Dictionary<string, string> Values()
    {
        var result = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var field in Fields) result[field] = Get(field);
        return result;
    }

    public PayrollEditForm(string card, DataGridViewRow row)
        : this(card, FromRow(row))
    {
    }

    public PayrollEditForm(string card, IReadOnlyDictionary<string, string> values)
    {
        Text = "Bordro Düzenle - " + card;
        Width = 790;
        Height = 800;
        StartPosition = FormStartPosition.CenterParent;

        var outer = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            Padding = new Padding(14),
            ColumnCount = 2,
            AutoScroll = true
        };
        outer.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 220f));
        outer.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100f));

        var note = new Label
        {
            Text = "Yalnız değiştirdiğiniz alanlar MANUEL OVERRIDE olarak saklanır. Diğer maaş / ödeme / kesinti alanlarına dokunulmaz.",
            AutoSize = true,
            MaximumSize = new System.Drawing.Size(700, 0),
            ForeColor = System.Drawing.Color.DarkSlateBlue
        };
        outer.Controls.Add(note, 0, outer.RowCount);
        outer.SetColumnSpan(note, 2);
        outer.RowCount++;

        outer.Controls.Add(autoHours, 0, outer.RowCount);
        outer.SetColumnSpan(autoHours, 2);
        outer.RowCount++;

        foreach (var field in Fields)
        {
            values.TryGetValue(field, out var value);
            var box = new TextBox { Dock = DockStyle.Top, Text = value ?? "" };
            boxes[field] = box;
            outer.Controls.Add(new Label { Text = LabelFor(field), Dock = DockStyle.Top, Height = 28 }, 0, outer.RowCount);
            outer.Controls.Add(box, 1, outer.RowCount);
            outer.RowCount++;
        }

        var save = new Button { Text = "Kaydet", DialogResult = DialogResult.OK, Width = 120 };
        var cancel = new Button { Text = "Vazgeç", DialogResult = DialogResult.Cancel, Width = 120 };
        var buttons = new FlowLayoutPanel
        {
            Dock = DockStyle.Top,
            FlowDirection = FlowDirection.RightToLeft,
            Height = 48
        };
        buttons.Controls.Add(save);
        buttons.Controls.Add(cancel);
        outer.Controls.Add(buttons, 0, outer.RowCount);
        outer.SetColumnSpan(buttons, 2);

        Controls.Add(outer);
        AcceptButton = save;
        CancelButton = cancel;
    }

    private static Dictionary<string, string> FromRow(DataGridViewRow row)
    {
        var result = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var field in Fields)
        {
            var grid = row.DataGridView;
            result[field] = grid != null && grid.Columns.Contains(field)
                ? Convert.ToString(row.Cells[field].Value) ?? ""
                : "";
        }
        return result;
    }

    private static string LabelFor(string field) => field switch
    {
        "GUN1" => "Normal Gün (GUN1)",
        "SAAT1" => "Normal Saat (SAAT1)",
        "UCRET1" => "Normal Ücret (UCRET1)",
        "NCGUN" => "Net Çalışma Günü (NCGUN)",
        "NCSAAT" => "Net Çalışma Saati (NCSAAT)",
        "NCUCRET" => "Net Çalışma Ücreti (NCUCRET)",
        "FMSAAT" => "Fazla Mesai Saati (FMSAAT)",
        "FMUCRET" => "Fazla Mesai Ücreti (FMUCRET)",
        "FMODENEN" => "Mesai Ödenen (FMODENEN)",
        "FMKALAN" => "Mesai Kalan (FMKALAN)",
        "EKKAZ" => "Ek Kazanç (EKKAZ)",
        "EKKES" => "Ek Kesinti (EKKES)",
        "NCMAAS" => "Maaş (NCMAAS)",
        "NCKALAN" => "Maaş Kalan (NCKALAN)",
        _ => field
    };
}