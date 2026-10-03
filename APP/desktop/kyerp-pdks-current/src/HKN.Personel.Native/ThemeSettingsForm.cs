namespace HKN.Personel.Native;

public sealed class ThemeSettingsForm : Form
{
    readonly ComboBox mode = new(){DropDownStyle=ComboBoxStyle.DropDownList};
    readonly ComboBox sidebar = new(){DropDownStyle=ComboBoxStyle.DropDownList};
    readonly FlowLayoutPanel accents = new(){Dock=DockStyle.Fill,WrapContents=false,Padding=new Padding(0,1,0,0)};
    readonly Panel preview = new(){Dock=DockStyle.Fill};
    PdksAccent selectedAccent = PdksAppearance.Accent;
    Color selectedCustomAccent = PdksAppearance.CustomAccentColor;

    public ThemeSettingsForm()
    {
        Text="Tema ve Görünüm";
        StartPosition=FormStartPosition.CenterParent;
        Size=new Size(760,560);
        MinimumSize=new Size(720,520);
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
        root.RowStyles.Add(new RowStyle(SizeType.Absolute,86));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute,174));
        root.RowStyles.Add(new RowStyle(SizeType.Percent,100));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute,54));

        var hero=PdksUiKit.Card(14);
        var heroLayout=new TableLayoutPanel{Dock=DockStyle.Fill,RowCount=2,BackColor=p.Surface,Margin=Padding.Empty};
        heroLayout.RowStyles.Add(new RowStyle(SizeType.Absolute,32));
        heroLayout.RowStyles.Add(new RowStyle(SizeType.Percent,100));
        heroLayout.Controls.Add(new Label{
            Text="Tema ve Görünüm",Dock=DockStyle.Fill,TextAlign=ContentAlignment.MiddleLeft,Font=new Font("Segoe UI",13f,FontStyle.Bold),ForeColor=p.Text},0,0);
        heroLayout.Controls.Add(new Label{
            Text="Uygulama teması, sol menü görünümü ve vurgu rengi birbirinden bağımsızdır. Her seçim kalıcı olarak kaydedilir.",Dock=DockStyle.Fill,TextAlign=ContentAlignment.MiddleLeft,Font=new Font("Segoe UI",8.8f),ForeColor=p.Muted},0,1);
        hero.Controls.Add(heroLayout);
        root.Controls.Add(hero,0,0);

        var settings=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=2,RowCount=3,Padding=new Padding(18,14,18,10),BackColor=p.Surface,Margin=new Padding(0,10,0,10)};
        settings.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,150));settings.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,100));
        settings.RowStyles.Add(new RowStyle(SizeType.Absolute,42));
        settings.RowStyles.Add(new RowStyle(SizeType.Absolute,42));
        settings.RowStyles.Add(new RowStyle(SizeType.Percent,100));
        settings.Controls.Add(Label("Uygulama Teması"),0,0);
        mode.Items.AddRange(["Açık","Koyu"]);mode.Dock=DockStyle.Fill;mode.Margin=new Padding(0,6,0,6);settings.Controls.Add(mode,1,0);
        settings.Controls.Add(Label("Sol Menü"),0,1);
        sidebar.Items.AddRange(["Açık","Koyu","Temayı Takip Et"]);sidebar.Dock=DockStyle.Fill;sidebar.Margin=new Padding(0,6,0,6);settings.Controls.Add(sidebar,1,1);
        settings.Controls.Add(Label("Vurgu Rengi"),0,2);
        foreach(var a in Enum.GetValues<PdksAccent>())
        {
            var sample=a==PdksAccent.Custom?selectedCustomAccent:PdksAppearance.AccentColor(a);
            var b=new Button{
                Text=a==PdksAccent.Custom?"Özel":PdksAppearance.AccentName(a),Tag=a,Width=60,Height=30,FlatStyle=FlatStyle.Flat,
                BackColor=sample,ForeColor=BestText(sample),
                Font=new Font("Segoe UI",8.1f,FontStyle.Bold),Cursor=Cursors.Hand,Margin=new Padding(0,0,5,0)
            };
            b.FlatAppearance.BorderSize=selectedAccent==a?3:1;
            b.Click+=(_,_)=>
            {
                var picked=(PdksAccent)b.Tag!;
                if(picked==PdksAccent.Custom)
                {
                    using var dialog=new ColorDialog{Color=selectedCustomAccent,FullOpen=true};
                    if(dialog.ShowDialog(this)!=DialogResult.OK)return;
                    selectedCustomAccent=dialog.Color;
                    b.BackColor=selectedCustomAccent;
                    b.ForeColor=BestText(selectedCustomAccent);
                }
                selectedAccent=picked;
                UpdateAccentSelection();
                UpdatePreview();
            };
            accents.Controls.Add(b);
        }
        settings.Controls.Add(accents,1,2);
        root.Controls.Add(settings,0,1);

        preview.Margin=new Padding(0,0,0,10);
        root.Controls.Add(preview,0,2);

        var actions=PdksUiKit.ActionBar(true,p.Canvas);
        var apply=PdksUiKit.Button("Uygula",110,PdksActionRole.Primary);var close=PdksUiKit.Button("Kapat",96,PdksActionRole.Quiet);
        apply.Click+=(_,_)=>ApplySelection();close.Click+=(_,_)=>Close();
        actions.Controls.Add(close);actions.Controls.Add(apply);root.Controls.Add(actions,0,3);

        Controls.Add(root);
        mode.SelectedIndexChanged+=(_,_)=>UpdatePreview();
        sidebar.SelectedIndexChanged+=(_,_)=>UpdatePreview();
    }

    void LoadCurrent()
    {
        mode.SelectedIndex=PdksAppearance.Mode==PdksThemeMode.Dark?1:0;
        sidebar.SelectedIndex=PdksAppearance.SidebarMode switch
        {
            PdksSidebarMode.Dark => 1,
            PdksSidebarMode.FollowTheme => 2,
            _ => 0
        };
        selectedAccent=PdksAppearance.Accent;
        selectedCustomAccent=PdksAppearance.CustomAccentColor;
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
        if(mode.SelectedIndex<0 || sidebar.SelectedIndex<0)return;
        var previewMode=mode.SelectedIndex==1?PdksThemeMode.Dark:PdksThemeMode.Light;
        var previewSidebar=sidebar.SelectedIndex switch
        {
            1 => PdksSidebarMode.Dark,
            2 => PdksSidebarMode.FollowTheme,
            _ => PdksSidebarMode.Light
        };
        var palette=BuildPreviewPalette(previewMode,selectedAccent,selectedCustomAccent,previewSidebar);

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

    static PdksPalette BuildPreviewPalette(PdksThemeMode themeMode,PdksAccent accent,Color customAccent,PdksSidebarMode sidebarMode)
    {
        var primary=accent==PdksAccent.Custom?customAccent:PdksAppearance.AccentColor(accent);
        var darkSidebar=sidebarMode==PdksSidebarMode.Dark ||
                        (sidebarMode==PdksSidebarMode.FollowTheme && themeMode==PdksThemeMode.Dark);
        var side=darkSidebar?Color.FromArgb(15,23,42):Color.White;
        var sideHover=darkSidebar?Color.FromArgb(30,41,59):Blend(primary,Color.White,.91);
        var sideText=darkSidebar?Color.FromArgb(241,245,249):Color.FromArgb(15,23,42);
        var sideMuted=darkSidebar?Color.FromArgb(148,163,184):Color.FromArgb(71,85,105);

        if(themeMode==PdksThemeMode.Dark)
            return new PdksPalette("Koyu",true,Color.FromArgb(11,18,32),Color.FromArgb(17,24,39),Color.FromArgb(24,33,49),side,sideHover,Color.FromArgb(241,245,249),Color.FromArgb(148,163,184),Color.FromArgb(51,65,85),primary,Blend(primary,Color.FromArgb(17,24,39),.78),sideText,sideMuted,Color.FromArgb(34,197,94),Color.FromArgb(245,158,11),Color.FromArgb(248,113,113),Color.FromArgb(69,27,31),Color.FromArgb(30,41,59),Color.FromArgb(30,41,59),Color.FromArgb(15,23,42));
        return new PdksPalette("Açık",false,Color.FromArgb(244,247,251),Color.White,Color.FromArgb(248,250,252),side,sideHover,Color.FromArgb(15,23,42),Color.FromArgb(100,116,139),Color.FromArgb(226,232,240),primary,Blend(primary,Color.White,.90),sideText,sideMuted,Color.FromArgb(22,163,74),Color.FromArgb(202,118,35),Color.FromArgb(185,28,28),Color.FromArgb(255,241,240),Blend(primary,Color.White,.84),Color.FromArgb(241,245,249),Color.White);
    }

    static Color Blend(Color a,Color b,double amountOfB)
    {
        amountOfB=Math.Clamp(amountOfB,0,1);var amountOfA=1d-amountOfB;
        return Color.FromArgb(
            (int)Math.Round(a.R*amountOfA+b.R*amountOfB),
            (int)Math.Round(a.G*amountOfA+b.G*amountOfB),
            (int)Math.Round(a.B*amountOfA+b.B*amountOfB));
    }

    void ApplySelection()
    {
        var selectedMode=mode.SelectedIndex==1?PdksThemeMode.Dark:PdksThemeMode.Light;
        var selectedSidebar=sidebar.SelectedIndex switch
        {
            1 => PdksSidebarMode.Dark,
            2 => PdksSidebarMode.FollowTheme,
            _ => PdksSidebarMode.Light
        };
        if(selectedAccent==PdksAccent.Custom)
            PdksAppearance.SetCustomAccent(selectedMode,selectedCustomAccent,selectedSidebar);
        else
            PdksAppearance.Set(selectedMode,selectedAccent,selectedSidebar);
        PdksTheme.ReapplyOpenForms();
        DialogResult=DialogResult.OK;
        Close();
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
