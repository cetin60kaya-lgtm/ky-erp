namespace HKN.Personel.Native;

internal sealed class AboutKy6Form : Form
{
    public AboutKy6Form()
    {
        Text="KY PDKS 6.4.0 CANLI Hakkında";
        StartPosition=FormStartPosition.CenterParent;
        ClientSize=new Size(760,560);
        FormBorderStyle=FormBorderStyle.FixedDialog;
        MaximizeBox=false;
        MinimizeBox=false;
        Font=new Font("Segoe UI",9f);
        Build();
    }

    void Build()
    {
        var p=PdksAppearance.Current;
        BackColor=p.Canvas;
        var root=new TableLayoutPanel{Dock=DockStyle.Fill,RowCount=3,Padding=new Padding(18),BackColor=p.Canvas};
        root.RowStyles.Add(new RowStyle(SizeType.Absolute,112));
        root.RowStyles.Add(new RowStyle(SizeType.Percent,100));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute,56));

        var hero=PdksUiKit.Card(18);
        var heroGrid=new TableLayoutPanel{Dock=DockStyle.Fill,RowCount=3,BackColor=p.Surface,Margin=Padding.Empty};
        heroGrid.RowStyles.Add(new RowStyle(SizeType.Absolute,38));
        heroGrid.RowStyles.Add(new RowStyle(SizeType.Absolute,28));
        heroGrid.RowStyles.Add(new RowStyle(SizeType.Percent,100));
        heroGrid.Controls.Add(new Label{Text="KY PDKS 6.4",Dock=DockStyle.Fill,Font=new Font("Segoe UI",20f,FontStyle.Bold),ForeColor=p.Text,TextAlign=ContentAlignment.MiddleLeft},0,0);
        heroGrid.Controls.Add(new Label{Text="Personel • Terminal • Puantaj • Bordro • Raporlama",Dock=DockStyle.Fill,Font=new Font("Segoe UI",10f,FontStyle.Bold),ForeColor=p.Primary,TextAlign=ContentAlignment.MiddleLeft},0,1);
        heroGrid.Controls.Add(new Label{Text="Canlı çalışma düzeni • güvenli veri erişimi • kontrollü düzeltme akışı",Dock=DockStyle.Fill,ForeColor=p.Muted,TextAlign=ContentAlignment.MiddleLeft},0,2);
        hero.Controls.Add(heroGrid);
        root.Controls.Add(hero,0,0);

        var body=PdksUiKit.Card(20);
        body.Controls.Add(new Label
        {
            Dock=DockStyle.Fill,
            AutoSize=false,
            TextAlign=ContentAlignment.TopLeft,
            ForeColor=p.Text,
            Font=new Font("Segoe UI",9.2f),
            Text="KY PDKS; kart hareketi, personel, puantaj ve bordro operasyonunu tek masaüstü çalışma alanında toplar.\r\n\r\n" +
                 "• Tek komut kataloğu: menüler, yetkiler ve kısayollar aynı kaynaktan yönetilir.\r\n" +
                 "• Standart işlem akışı: Terminal → Giriş/Çıkış → Personel/İzin → Puantaj → Bordro → Rapor.\r\n" +
                 "• Hakediş ve resmî bordro ayrıdır; PEK ve banka ödemesi kendi kurallarıyla hesaplanır.\r\n" +
                 "• Tema modu ile vurgu rengi bağımsızdır; açık/koyu tema ve renk seçimi kalıcıdır.\r\n" +
                 "• Terminal kayıtları kaynak kanıt olarak korunur; otomatik fiziksel cihaz silme kapalıdır.\r\n" +
                 "• TNF + Firebird veri akışı doğrulama ve mükerrer kontrol katmanlarıyla yürütülür.\r\n" +
                 "• Rol/yetki, yedekleme, işlem geçmişi ve veri kaynağı yönetimi uygulama içinde merkezi olarak sunulur."
        });
        root.Controls.Add(body,0,1);

        var actions=PdksUiKit.ActionBar(true,p.Canvas);
        actions.Controls.Add(PdksUiKit.Button("Kapat",100,PdksActionRole.Quiet,Close));
        root.Controls.Add(actions,0,2);
        Controls.Add(root);
    }}
