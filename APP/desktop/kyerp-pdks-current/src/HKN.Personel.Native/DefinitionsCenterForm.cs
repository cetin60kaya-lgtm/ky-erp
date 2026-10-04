namespace HKN.Personel.Native;

public sealed class DefinitionsCenterForm : Form
{
    readonly Action<string> openDefinitions;
    readonly Action<PdksCommandId> navigate;

    public DefinitionsCenterForm(Action<string> openDefinitionTab, Action<PdksCommandId> commandNavigator)
    {
        openDefinitions=openDefinitionTab;
        navigate=commandNavigator;
        Text="Tanımlar Merkezi";
        StartPosition=FormStartPosition.CenterParent;
        Size=new Size(1180,720);
        MinimumSize=new Size(960,620);
        Font=new Font("Segoe UI",9f);
        BackColor=PdksAppearance.Current.Canvas;
        Build();
    }

    void Build()
    {
        var p=PdksAppearance.Current;
        var root=new TableLayoutPanel
        {
            Dock=DockStyle.Fill,ColumnCount=1,RowCount=3,
            Padding=new Padding(18),BackColor=p.Canvas
        };
        root.RowStyles.Add(new RowStyle(SizeType.Absolute,64));
        root.RowStyles.Add(new RowStyle(SizeType.Percent,100));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute,46));

        var hero=new Panel{Dock=DockStyle.Fill,BackColor=p.Canvas};
        hero.Controls.Add(new Label
        {
            Text="Tanımlar Merkezi",Location=new Point(0,0),AutoSize=true,
            Font=new Font("Segoe UI",17f,FontStyle.Bold),ForeColor=p.Text
        });
        hero.Controls.Add(new Label
        {
            Text="Personel, çalışma düzeni ve bordro tanımlarını tek yerde yönetin.",
            Location=new Point(2,36),AutoSize=true,Font=new Font("Segoe UI",9f),ForeColor=p.Muted
        });
        root.Controls.Add(hero,0,0);

        var columns=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=2,BackColor=p.Canvas};
        columns.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,46));
        columns.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,54));
        columns.Controls.Add(Section("Personel / Organizasyon",
        [
            ("Bölümler","Personelin bağlı olduğu bölüm tanımları",()=>openDefinitions("Bölümler")),
            ("Servisler","Servis / ulaşım tanımları",()=>openDefinitions("Servisler")),
            ("Görevler","Görev ve pozisyon tanımları",()=>openDefinitions("Görevler")),
            ("Durum","Personel durum tanımları",()=>openDefinitions("Durum")),
            ("Firma / İşyeri","Personelin bağlı olduğu işyeri; tek firma kullanılıyorsa tek kayıt yeterlidir",()=>openDefinitions("Firma"))
        ]),0,0);

        columns.Controls.Add(Section("Çalışma / Bordro",
        [
            ("Çalışma Grupları","Yalnız MESAİLİ GRUP ve İDARİ GRUP",()=>navigate(PdksCommandId.Groups)),
            ("Yıllık Dönemler","Yıl seçilir; 12 ay ve grup altyapısı sistem tarafından otomatik yönetilir",()=>navigate(PdksCommandId.Periods)),
            ("Genel Tatiller","Resmî ve özel tatil günleri",()=>navigate(PdksCommandId.Holidays)),
            ("Günlük Çalışma Saatleri","Normal günlük süre ve alan tanımları",()=>navigate(PdksCommandId.DailyWorkHours)),
            ("Yıllık Çalışma Planı","Yıllık çalışma takvimi",()=>navigate(PdksCommandId.AnnualWorkPlan)),
            ("Bordro Alanları","Bordro alan ve katsayıları",()=>openDefinitions("Bordro")),
            ("Kazanç / Kesinti Türleri","Avans, kazanç ve kesinti tipleri",()=>navigate(PdksCommandId.EarningsTypes))
        ]),1,0);

        root.Controls.Add(columns,0,1);
        root.Controls.Add(new Label
        {
            Text="Buradaki tanımlar günlük işlemlerin temelidir. Çalışma grupları sabittir; yıllık dönemler ay bazında otomatik hazırlanır ve kullanıcı teknik grup kayıtlarıyla uğraşmaz.",
            Dock=DockStyle.Fill,TextAlign=ContentAlignment.MiddleLeft,ForeColor=p.Muted,
            Font=new Font("Segoe UI",8.6f),Padding=new Padding(4,12,0,0)
        },0,2);
        Controls.Add(root);
    }

    Control Section(string title,(string Title,string Hint,Action Open)[] items)
    {
        var p=PdksAppearance.Current;
        var card=PdksUiKit.Card(16);
        card.Margin=new Padding(0,0,12,0);
        var layout=new TableLayoutPanel
        {
            Dock=DockStyle.Fill,ColumnCount=1,RowCount=items.Length+1,
            BackColor=p.Surface,Padding=new Padding(12)
        };
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute,42));
        for(var i=0;i<items.Length;i++)layout.RowStyles.Add(new RowStyle(SizeType.Percent,100f/items.Length));
        layout.Controls.Add(PdksUiKit.SectionTitle(title),0,0);
        for(var i=0;i<items.Length;i++)
            layout.Controls.Add(Item(items[i].Title,items[i].Hint,items[i].Open),0,i+1);
        card.Controls.Add(layout);
        return card;
    }

    Control Item(string title,string hint,Action open)
    {
        var p=PdksAppearance.Current;
        var panel=new Panel{Dock=DockStyle.Fill,BackColor=p.Surface,Margin=new Padding(0,3,0,3),Cursor=Cursors.Hand};
        panel.Paint+=(_,e)=>
        {
            using var pen=new Pen(p.Border);
            e.Graphics.DrawLine(pen,0,panel.Height-1,panel.Width,panel.Height-1);
        };
        var name=new Label
        {
            Text=title,Location=new Point(10,8),Size=new Size(220,24),AutoEllipsis=true,
            Font=new Font("Segoe UI",9.5f,FontStyle.Bold),ForeColor=p.Text,Cursor=Cursors.Hand
        };
        var desc=new Label
        {
            Text=hint,Location=new Point(240,8),Anchor=AnchorStyles.Left|AnchorStyles.Right|AnchorStyles.Top,
            Size=new Size(Math.Max(180,panel.Width-290),24),AutoEllipsis=true,
            Font=new Font("Segoe UI",8.3f),ForeColor=p.Muted,Cursor=Cursors.Hand
        };
        var arrow=new Label
        {
            Text="›",Dock=DockStyle.Right,Width=34,TextAlign=ContentAlignment.MiddleCenter,
            Font=new Font("Segoe UI",17f),ForeColor=p.Primary,Cursor=Cursors.Hand
        };
        void Run(object? _,EventArgs __)=>open();
        panel.Click+=Run;name.Click+=Run;desc.Click+=Run;arrow.Click+=Run;
        panel.Controls.Add(arrow);panel.Controls.Add(desc);panel.Controls.Add(name);
        panel.Resize+=(_,_)=>desc.Width=Math.Max(160,panel.Width-290);
        return panel;
    }
}
