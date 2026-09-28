namespace HKN.Personel.Native;

internal sealed class AboutKy6Form : Form
{
    public AboutKy6Form()
    {
        Text = "KY PDKS 6.1 TEST Hakkında";
        StartPosition = FormStartPosition.CenterParent;
        ClientSize = new Size(690, 470);
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false; MinimizeBox = false;
        Font = new Font("Segoe UI", 9f);
        Build();
    }

    void Build()
    {
        var root = new TableLayoutPanel { Dock = DockStyle.Fill, RowCount = 5, Padding = new Padding(24) };
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 62));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 42));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 36));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 48));
        root.Controls.Add(new Label { Text = "KY PDKS 6.1 TEST", Dock = DockStyle.Fill, Font = new Font("Segoe UI", 24f, FontStyle.Bold), ForeColor = Color.FromArgb(30,75,145) }, 0, 0);
        root.Controls.Add(new Label { Text = "Operasyon Komuta Merkezi Revizyonu", Dock = DockStyle.Fill, Font = new Font("Segoe UI", 12f, FontStyle.Bold) }, 0, 1);
        root.Controls.Add(new Label { Text = "TEST SÜRÜMÜ • saha kabulü tamamlanmadan canlı sürüm olarak işaretlenmez", Dock = DockStyle.Fill, Font = new Font("Segoe UI", 9f, FontStyle.Bold), ForeColor = Color.FromArgb(190,82,54) }, 0, 2);
        var text = new Label
        {
            Dock = DockStyle.Fill,
            AutoSize = false,
            TextAlign = ContentAlignment.TopLeft,
            Text = "REV 6.1 ile günlük kullanım daha görünür ve yönlendirici hale getirildi.\n\n" +
                   "• Ana ekranda Günlük Operasyon Komuta Merkezi\n" +
                   "• Aktif, gelen, izinli, kart basmayan, çıkış bekleyen ve işlem bekleyen sayaçları\n" +
                   "• Sorun varsa kullanıcıyı önce Canlı İzleme ekranına yönlendiren durum mesajı\n" +
                   "• Canlı terminal ve denetim merkezi\n" +
                   "• Personel, izin, puantaj, bordro ve ödeme akışları\n" +
                   "• Hızlı Kullanım Rehberi ile ekranların amacı ve önerilen işlem sırası\n" +
                   "• TNF gerçek kayıt izi ve manuel düzeltme denetimi\n" +
                   "• PDF / Excel / yazdırma ve kalıcı tablo düzenleri\n\n" +
                   "Bu paket test sürümüdür. Gerçek terminal + gerçek DATABASE.GDB saha testi sonrasında final kabul yapılacaktır."
        };
        root.Controls.Add(text, 0, 3);
        var close = new Button { Text = "Kapat", Width = 110, Height = 32, Anchor = AnchorStyles.Right };
        close.Click += (_, _) => Close();
        root.Controls.Add(close, 0, 4);
        Controls.Add(root);
    }
}
