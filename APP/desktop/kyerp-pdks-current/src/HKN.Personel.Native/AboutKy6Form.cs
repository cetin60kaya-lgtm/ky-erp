namespace HKN.Personel.Native;

internal sealed class AboutKy6Form : Form
{
    public AboutKy6Form()
    {
        Text = "KY PDKS 6.0 Hakkında";
        StartPosition = FormStartPosition.CenterParent;
        ClientSize = new Size(650, 430);
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false; MinimizeBox = false;
        Font = new Font("Segoe UI", 9f);
        Build();
    }

    void Build()
    {
        var root = new TableLayoutPanel { Dock = DockStyle.Fill, RowCount = 4, Padding = new Padding(24) };
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 62));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 48));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 48));
        root.Controls.Add(new Label { Text = "KY PDKS 6.0", Dock = DockStyle.Fill, Font = new Font("Segoe UI", 24f, FontStyle.Bold), ForeColor = Color.FromArgb(30,75,145) }, 0, 0);
        root.Controls.Add(new Label { Text = "KY 5.0.29'dan KY 6.0'a yeni nesil geçiş", Dock = DockStyle.Fill, Font = new Font("Segoe UI", 12f, FontStyle.Bold) }, 0, 1);
        var text = new Label
        {
            Dock = DockStyle.Fill,
            AutoSize = false,
            TextAlign = ContentAlignment.TopLeft,
            Text = "KY PDKS 6.0; yılların saha kullanım mantığını modern KYERP altyapısıyla birleştiren kapsamlı bir yenilemedir.\n\n" +
                   "• Canlı terminal ve denetim merkezi\n" +
                   "• Gelişmiş personel, aktif/pasif ve tarihçe yönetimi\n" +
                   "• Puantaj, bordro, izin, ek kazanç/kesinti ve ödeme akışları\n" +
                   "• Manuel E kayıt takibi ve TNF ham veri izi\n" +
                   "• Hakan Emprime için sabit şirket veri alanı\n" +
                   "• Güvenli yedekleme / geri yükleme\n" +
                   "• Yeni nesil bölmeli çalışma alanı ve gelişmiş raporlama\n\n" +
                   "KY 6.0, günlük kullanımı hızlandırırken geçmiş veriyi ve denetim izini korumak üzere tasarlanmıştır."
        };
        root.Controls.Add(text, 0, 2);
        var close = new Button { Text = "Kapat", Width = 110, Height = 32, Anchor = AnchorStyles.Right };
        close.Click += (_, _) => Close();
        root.Controls.Add(close, 0, 3);
        Controls.Add(root);
    }
}
