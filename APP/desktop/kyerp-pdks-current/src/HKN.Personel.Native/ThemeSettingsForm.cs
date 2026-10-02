namespace HKN.Personel.Native;

public sealed class ThemeSettingsForm : Form
{
    readonly ComboBox mode = new(){DropDownStyle=ComboBoxStyle.DropDownList};
    readonly FlowLayoutPanel accents = new(){Dock=DockStyle.Fill,WrapContents=false,Padding=new Padding(0,5,0,0)};
    readonly Panel preview = new(){Dock=DockStyle.Fill};
    PdksAccent selectedAccent = PdksAppearance.Accent;

    public ThemeSettingsForm()
    {
        Text="Tema ve Görünüm";
        StartPosition=FormStartPosition.CenterParent;
        Size=new Size(720,520);
        MinimumSize=new Size(680,480);
        Font=new Font("Segoe UI",9f);
        Build();
        LoadCurrent();
    }

    void Build()
    {
        var p=PdksAppearance.Current;
        BackColor=p.Canvas;
        ForeColor=p.Text;

        var root=new TableLayoutPanel{Dock=DockStyle.Fill,RowCount=4,Padding=new Padding(18),BackColor=p.Canvas};
        root.RowStyles.Add(new RowStyle(SizeType.Absolute,68));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute,126));
        root.RowStyles.Add(new RowStyle(SizeType.Percent,100));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute,54));

        var hero=new Panel{Dock=DockStyle.Fill,BackColor=p.Surface,Padding=new Padding(18)};
        hero.Controls.Add(new Label{
            Text="Tema ve Görünüm",Dock=DockStyle.Top,Height=28,Font=new Font("Segoe UI",13f,FontStyle.Bold),ForeColor=p.Text});
        hero.Controls.Add(new Label{
            Text="Tema (açık/koyu) ile vurgu rengini birbirinden bağımsız seçin.",Dock=DockStyle.Bottom,Height=22,Font=new Font("Segoe UI",8.8f),ForeColor=p.Muted});
        root.Controls.Add(hero,0,0);

        var settings=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=2,RowCount=2,Padding=new Padding(18,14,18,10),BackColor=p.Surface,Margin=new Padding(0,10,0,10)};
        settings.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,150));settings.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,100));
        settings.RowStyles.Add(new RowStyle(SizeType.Absolute,42));settings.RowStyles.Add(new RowStyle(SizeType.Percent,100));
        settings.Controls.Add(Label("Tema"),0,0);
        mode.Items.AddRange(["Açık","Koyu"]);mode.Dock=DockStyle.Fill;mode.Margin=new Padding(0,6,0,6);settings.Controls.Add(mode,1,0);
        settings.Controls.Add(Label("Vurgu Rengi"),0,1);
        foreach(var a in Enum.GetValues<PdksAccent>())
        {
            var b=new Button{
                Text=PdksAppearance.AccentName(a),Tag=a,Width=86,Height=32,FlatStyle=FlatStyle.Flat,
                BackColor=PdksAppearance.AccentColor(a),ForeColor=BestText(PdksAppearance.AccentColor(a)),
                Font=new Font("Segoe UI",8.3f,FontStyle.Bold),Cursor=Cursors.Hand,Margin=new Padding(0,0,8,0)
            };
            b.FlatAppearance.BorderSize=selectedAccent==a?3:1;
            b.Click+=(_,_)=>{selectedAccent=(PdksAccent)b.Tag!;UpdateAccentSelection();UpdatePreview();};
            accents.Controls.Add(b);
        }
        settings.Controls.Add(accents,1,1);
        root.Controls.Add(settings,0,1);

        preview.Margin=new Padding(0,0,0,10);
        root.Controls.Add(preview,0,2);

        var actions=new FlowLayoutPanel{Dock=DockStyle.Fill,FlowDirection=FlowDirection.RightToLeft,WrapContents=false,Padding=new Padding(0,9,0,0),BackColor=p.Canvas};
        var apply=Button("Uygula",110,true);var close=Button("Kapat",96,false);
        apply.Click+=(_,_)=>ApplySelection();close.Click+=(_,_)=>Close();
        actions.Controls.Add(close);actions.Controls.Add(apply);root.Controls.Add(actions,0,3);

        Controls.Add(root);
        mode.SelectedIndexChanged+=(_,_)=>UpdatePreview();
    }

    void LoadCurrent()
    {
        mode.SelectedIndex=PdksAppearance.Mode==PdksThemeMode.Dark?1:0;
        selectedAccent=PdksAppearance.Accent;
        UpdateAccentSelection();
        UpdatePreview();
    }

    void UpdateAccentSelection()
    {
        foreach(var b in accents.Controls.OfType<Button>())
            b.FlatAppearance.BorderSize=(PdksAccent)b.Tag! == selectedAccent ? 3 : 1;
    }

    void UpdatePreview()
    {
        if(mode.SelectedIndex<0)return;
        var previewMode=mode.SelectedIndex==1?PdksThemeMode.Dark:PdksThemeMode.Light;
        var oldMode=PdksAppearance.Mode;
        var oldAccent=PdksAppearance.Accent;
        var palette=BuildPreviewPalette(previewMode,selectedAccent);

        preview.Controls.Clear();
        preview.BackColor=palette.Canvas;
        var shell=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=2,Padding=new Padding(0),BackColor=palette.Canvas};
        shell.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,150));shell.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,100));
        var side=new Panel{Dock=DockStyle.Fill,BackColor=palette.Sidebar,Padding=new Padding(12)};
        side.Controls.Add(new Label{Text="KY PDKS",Dock=DockStyle.Top,Height=36,Font=new Font("Segoe UI",11f,FontStyle.Bold),ForeColor=palette.SidebarText});
        side.Controls.Add(new Label{Text="Personel\nPuantaj\nBordro\nRaporlar",Dock=DockStyle.Fill,Padding=new Padding(6,16,0,0),Font=new Font("Segoe UI",9f,FontStyle.Bold),ForeColor=palette.SidebarMuted});
        shell.Controls.Add(side,0,0);
        var main=new Panel{Dock=DockStyle.Fill,BackColor=palette.Canvas,Padding=new Padding(18)};
        var card=new Panel{Dock=DockStyle.Top,Height=118,BackColor=palette.Surface,Padding=new Padding(18)};
        card.Controls.Add(new Label{Text="Önizleme",Dock=DockStyle.Top,Height=28,Font=new Font("Segoe UI",12f,FontStyle.Bold),ForeColor=palette.Text});
        card.Controls.Add(new Label{Text="Bu görünüm uygulamanın tamamında kullanılacak.",Dock=DockStyle.Top,Height=26,ForeColor=palette.Muted});
        var accent=new Panel{Dock=DockStyle.Bottom,Height=8,BackColor=palette.Primary};
        card.Controls.Add(accent);main.Controls.Add(card);shell.Controls.Add(main,1,0);
        preview.Controls.Add(shell);
    }

    static PdksPalette BuildPreviewPalette(PdksThemeMode themeMode,PdksAccent accent)
    {
        var currentMode=PdksAppearance.Mode;
        var currentAccent=PdksAppearance.Accent;
        if(currentMode==themeMode && currentAccent==accent)return PdksAppearance.Current;

        var primary=PdksAppearance.AccentColor(accent);
        if(themeMode==PdksThemeMode.Dark)
            return new PdksPalette("Koyu",true,Color.FromArgb(11,18,32),Color.FromArgb(17,24,39),Color.FromArgb(24,33,49),Color.FromArgb(8,15,28),Color.FromArgb(30,41,59),Color.FromArgb(241,245,249),Color.FromArgb(148,163,184),Color.FromArgb(51,65,85),primary,Color.FromArgb(30,41,59),Color.FromArgb(241,245,249),Color.FromArgb(148,163,184),Color.FromArgb(34,197,94),Color.FromArgb(245,158,11),Color.FromArgb(248,113,113),Color.FromArgb(69,27,31),Color.FromArgb(30,41,59),Color.FromArgb(30,41,59),Color.FromArgb(15,23,42));
        return new PdksPalette("Açık",false,Color.FromArgb(244,247,251),Color.White,Color.FromArgb(248,250,252),Color.FromArgb(15,23,42),Color.FromArgb(30,41,59),Color.FromArgb(15,23,42),Color.FromArgb(100,116,139),Color.FromArgb(226,232,240),primary,Color.FromArgb(239,246,255),Color.White,Color.FromArgb(203,213,225),Color.FromArgb(22,163,74),Color.FromArgb(202,118,35),Color.FromArgb(185,28,28),Color.FromArgb(255,241,240),Color.FromArgb(219,234,254),Color.FromArgb(241,245,249),Color.White);
    }

    void ApplySelection()
    {
        var selectedMode=mode.SelectedIndex==1?PdksThemeMode.Dark:PdksThemeMode.Light;
        PdksAppearance.Set(selectedMode,selectedAccent);
        PdksTheme.ReapplyOpenForms();
    }

    static Label Label(string text)=>new(){Text=text,Dock=DockStyle.Fill,TextAlign=ContentAlignment.MiddleLeft,Font=new Font("Segoe UI",8.7f,FontStyle.Bold),ForeColor=PdksAppearance.Current.Muted};

    static Button Button(string text,int width,bool primary)
    {
        var p=PdksAppearance.Current;
        var b=new Button{Text=text,Width=width,Height=34,FlatStyle=FlatStyle.Flat,Font=new Font("Segoe UI",8.8f,FontStyle.Bold),BackColor=primary?p.Primary:p.Surface,ForeColor=primary?Color.White:p.Text,Cursor=Cursors.Hand,Margin=new Padding(8,0,0,0)};
        b.FlatAppearance.BorderColor=primary?p.Primary:p.Border;return b;
    }

    static Color BestText(Color background)
    {
        var luminance=(0.299*background.R+0.587*background.G+0.114*background.B)/255d;
        return luminance>.62?Color.Black:Color.White;
    }
}
