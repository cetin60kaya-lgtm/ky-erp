namespace HKN.Personel.Native;

public enum PdksActionRole
{
    Primary,
    Secondary,
    Danger,
    Quiet
}

public static class PdksUiKit
{
    public const int ButtonHeight = 34;
    public const int SectionGap = 12;
    public const int CardRadius = 10;

    public static Button Button(string text,int width=110,PdksActionRole role=PdksActionRole.Secondary,Action? action=null)
    {
        var p=PdksAppearance.Current;
        var b=new Button
        {
            Text=text,
            Width=width,
            Height=ButtonHeight,
            MinimumSize=new Size(width,ButtonHeight),
            MaximumSize=new Size(width,ButtonHeight),
            FlatStyle=FlatStyle.Flat,
            Font=new Font("Segoe UI",8.8f,FontStyle.Bold),
            Cursor=Cursors.Hand,
            Margin=new Padding(8,0,0,0),
            Padding=new Padding(7,1,7,1),
            Tag=role
        };
        ApplyButtonPalette(b,p,role);
        if(action is not null)b.Click+=(_,_)=>action();
        return b;
    }

    public static FlowLayoutPanel ActionBar(bool rightAligned=true,Color? background=null)
    {
        var p=PdksAppearance.Current;
        return new FlowLayoutPanel
        {
            Dock=DockStyle.Fill,
            FlowDirection=rightAligned?FlowDirection.RightToLeft:FlowDirection.LeftToRight,
            WrapContents=false,
            Padding=new Padding(0,10,0,0),
            BackColor=background??p.Canvas,
            Margin=Padding.Empty
        };
    }

    public static Panel Card(int padding=0)
    {
        var p=PdksAppearance.Current;
        var panel=new BorderedPanel
        {
            Dock=DockStyle.Fill,
            BackColor=p.Surface,
            Padding=new Padding(padding),
            BorderColor=p.Border,
            Radius=CardRadius,
            Margin=Padding.Empty
        };
        return panel;
    }

    public static Label SectionTitle(string text,int height=34) => new()
    {
        Text=text,
        Dock=DockStyle.Fill,
        Height=height,
        Font=new Font("Segoe UI",11f,FontStyle.Bold),
        ForeColor=PdksAppearance.Current.Text,
        TextAlign=ContentAlignment.MiddleLeft
    };

    public static Label FieldLabel(string text) => new()
    {
        Text=text,
        Dock=DockStyle.Fill,
        TextAlign=ContentAlignment.MiddleLeft,
        ForeColor=PdksAppearance.Current.Muted,
        Font=new Font("Segoe UI",8.4f,FontStyle.Bold)
    };

    public static void ApplyButtonPalette(Button b,PdksPalette p,PdksActionRole role)
    {
        b.FlatAppearance.BorderSize=1;
        switch(role)
        {
            case PdksActionRole.Primary:
                b.BackColor=p.Primary;b.ForeColor=Color.White;b.FlatAppearance.BorderColor=p.Primary;
                break;
            case PdksActionRole.Danger:
                b.BackColor=p.DangerSoft;b.ForeColor=p.Danger;b.FlatAppearance.BorderColor=p.Danger;
                break;
            case PdksActionRole.Quiet:
                b.BackColor=p.SurfaceAlt;b.ForeColor=p.Muted;b.FlatAppearance.BorderColor=p.Border;
                break;
            default:
                b.BackColor=p.Surface;b.ForeColor=p.Text;b.FlatAppearance.BorderColor=p.Border;
                break;
        }
    }

    public static PdksActionRole InferRole(Button button)
    {
        if(button.Tag is PdksActionRole role)return role;
        var text=(button.Text??string.Empty).Trim();
        if(text.Contains("Sil",StringComparison.OrdinalIgnoreCase) || text.Contains("Çıkart",StringComparison.OrdinalIgnoreCase))
            return PdksActionRole.Danger;
        if(text.Contains("Kaydet",StringComparison.OrdinalIgnoreCase) ||
           text.Contains("Oluştur",StringComparison.OrdinalIgnoreCase) ||
           text.Contains("Hesapla",StringComparison.OrdinalIgnoreCase) ||
           text.Contains("Aktar",StringComparison.OrdinalIgnoreCase) ||
           text.Equals("Göster",StringComparison.OrdinalIgnoreCase))
            return PdksActionRole.Primary;
        if(text.Contains("Kapat",StringComparison.OrdinalIgnoreCase) || text.Equals("Çıkış",StringComparison.OrdinalIgnoreCase))
            return PdksActionRole.Quiet;
        return PdksActionRole.Secondary;
    }

    sealed class BorderedPanel:Panel
    {
        public Color BorderColor{get;set;}=Color.LightGray;
        public int Radius{get;set;}=10;
        public BorderedPanel(){DoubleBuffered=true;ResizeRedraw=true;}
        protected override void OnPaint(PaintEventArgs e)
        {
            base.OnPaint(e);
            e.Graphics.SmoothingMode=System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
            using var path=Round(new Rectangle(0,0,Math.Max(1,Width-1),Math.Max(1,Height-1)),Radius);
            using var pen=new Pen(BorderColor);
            e.Graphics.DrawPath(pen,path);
        }
        static System.Drawing.Drawing2D.GraphicsPath Round(Rectangle r,int radius)
        {
            var d=Math.Max(2,radius*2);
            var p=new System.Drawing.Drawing2D.GraphicsPath();
            p.AddArc(r.Left,r.Top,d,d,180,90);
            p.AddArc(r.Right-d,r.Top,d,d,270,90);
            p.AddArc(r.Right-d,r.Bottom-d,d,d,0,90);
            p.AddArc(r.Left,r.Bottom-d,d,d,90,90);
            p.CloseFigure();
            return p;
        }
    }
}
