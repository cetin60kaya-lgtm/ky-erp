using System.Drawing.Drawing2D;

namespace HKN.Personel.Native;

internal enum PdksToolbarIcon
{
    Transfer, Live, Groups, Periods, Departments, EntryExit,
    Personnel, Advances, Timesheet, Results, Payroll, WorkDate
}

internal static class PdksToolbarIcons
{
    public static Bitmap Create(PdksToolbarIcon kind)
    {
        var b = new Bitmap(36, 36);
        using var g = Graphics.FromImage(b);
        g.SmoothingMode = SmoothingMode.AntiAlias;
        g.PixelOffsetMode = PixelOffsetMode.HighQuality;
        g.Clear(Color.Transparent);
        switch (kind)
        {
            case PdksToolbarIcon.Transfer: DrawTransfer(g); break;
            case PdksToolbarIcon.Live: DrawLive(g); break;
            case PdksToolbarIcon.Groups: DrawGroups(g); break;
            case PdksToolbarIcon.Periods: DrawCalendar(g, Color.FromArgb(64, 110, 180), false); break;
            case PdksToolbarIcon.Departments: DrawDepartments(g); break;
            case PdksToolbarIcon.EntryExit: DrawEntryExit(g); break;
            case PdksToolbarIcon.Personnel: DrawPersonnel(g); break;
            case PdksToolbarIcon.Advances: DrawMoney(g); break;
            case PdksToolbarIcon.Timesheet: DrawTimesheet(g); break;
            case PdksToolbarIcon.Results: DrawResults(g); break;
            case PdksToolbarIcon.Payroll: DrawPayroll(g); break;
            case PdksToolbarIcon.WorkDate: DrawCalendar(g, Color.FromArgb(46, 139, 87), true); break;
        }
        return b;
    }

    static Pen P(Color c, float w = 2f) => new(c, w) { StartCap = LineCap.Round, EndCap = LineCap.Round };
    static Brush B(Color c) => new SolidBrush(c);
    static void DrawTransfer(Graphics g)
    {
        using var blue = P(Color.FromArgb(38, 96, 170), 2.4f);
        using var dark = P(Color.FromArgb(55, 62, 72), 2f);
        g.DrawRoundedRectangle(dark, new RectangleF(7, 5, 22, 25), 3);
        g.DrawLine(dark, 11, 10, 25, 10); g.DrawLine(dark, 11, 14, 21, 14);
        g.DrawLine(blue, 4, 22, 18, 22); g.DrawLine(blue, 13, 17, 18, 22); g.DrawLine(blue, 13, 27, 18, 22);
        g.DrawLine(blue, 32, 26, 20, 26); g.DrawLine(blue, 25, 21, 20, 26); g.DrawLine(blue, 25, 31, 20, 26);
    }

    static void DrawLive(Graphics g)
    {
        using var green = P(Color.FromArgb(22, 145, 84), 2.4f);
        using var dark = P(Color.FromArgb(55, 62, 72), 1.8f);
        g.DrawEllipse(dark, 4, 4, 28, 28);
        g.DrawLines(green, new[]{new PointF(6,19),new PointF(11,19),new PointF(14,12),new PointF(18,25),new PointF(22,16),new PointF(25,19),new PointF(31,19)});
        using var dot = B(Color.FromArgb(22, 145, 84)); g.FillEllipse(dot, 16, 16, 4, 4);
    }

    static void DrawGroups(Graphics g)
    {
        using var blue = P(Color.FromArgb(50, 105, 175), 2f);
        using var fill = B(Color.FromArgb(205, 224, 246));
        g.FillEllipse(fill, 13, 5, 10, 10); g.DrawEllipse(blue, 13, 5, 10, 10);
        g.FillEllipse(fill, 3, 10, 8, 8); g.DrawEllipse(blue, 3, 10, 8, 8);
        g.FillEllipse(fill, 25, 10, 8, 8); g.DrawEllipse(blue, 25, 10, 8, 8);
        g.DrawArc(blue, 10, 14, 16, 16, 190, 160); g.DrawArc(blue, 0, 18, 14, 12, 190, 150); g.DrawArc(blue, 22, 18, 14, 12, 200, 150);
    }

    static void DrawCalendar(Graphics g, Color color, bool check)
    {
        using var p = P(color, 2f); using var fill = B(Color.FromArgb(245, 248, 252));
        g.FillRectangle(fill, 5, 8, 26, 23); g.DrawRectangle(p, 5, 8, 26, 23);
        g.DrawLine(p, 5, 14, 31, 14); g.DrawLine(p, 11, 5, 11, 11); g.DrawLine(p, 25, 5, 25, 11);
        if (check) { using var ok=P(Color.FromArgb(20,140,75),2.8f); g.DrawLines(ok,new[]{new PointF(11,23),new PointF(16,27),new PointF(25,18)}); }
        else { using var d=B(color); g.FillEllipse(d,10,18,4,4); g.FillEllipse(d,17,18,4,4); g.FillEllipse(d,24,18,4,4); g.FillEllipse(d,10,25,4,4); }
    }
    static void DrawDepartments(Graphics g)
    {
        using var p=P(Color.FromArgb(104,76,155),2f); using var f=B(Color.FromArgb(230,221,245));
        g.FillRectangle(f,13,4,10,7); g.DrawRectangle(p,13,4,10,7);
        foreach(var x in new[]{4,13,22}) { g.FillRectangle(f,x,25,10,7); g.DrawRectangle(p,x,25,10,7); }
        g.DrawLine(p,18,11,18,19); g.DrawLine(p,9,19,27,19); g.DrawLine(p,9,19,9,25); g.DrawLine(p,18,19,18,25); g.DrawLine(p,27,19,27,25);
    }

    static void DrawEntryExit(Graphics g)
    {
        using var dark=P(Color.FromArgb(65,70,78),2f); using var green=P(Color.FromArgb(25,145,82),2.5f); using var red=P(Color.FromArgb(190,65,55),2.5f);
        g.DrawRectangle(dark,13,5,12,26); g.DrawEllipse(dark,21,17,2,2);
        g.DrawLine(green,3,13,16,13); g.DrawLine(green,11,8,16,13); g.DrawLine(green,11,18,16,13);
        g.DrawLine(red,33,24,21,24); g.DrawLine(red,26,19,21,24); g.DrawLine(red,26,29,21,24);
    }

    static void DrawPersonnel(Graphics g)
    {
        using var p=P(Color.FromArgb(35,105,170),2f); using var fill=B(Color.FromArgb(225,239,252));
        g.FillRoundedRectangle(fill,new RectangleF(4,6,28,24),3); g.DrawRoundedRectangle(p,new RectangleF(4,6,28,24),3);
        g.DrawEllipse(p,8,11,7,7); g.DrawArc(p,7,18,10,8,190,160); g.DrawLine(p,19,13,28,13); g.DrawLine(p,19,18,28,18); g.DrawLine(p,19,23,25,23);
    }

    static void DrawMoney(Graphics g)
    {
        using var p=P(Color.FromArgb(190,125,20),2f); using var f=B(Color.FromArgb(255,241,196));
        g.FillEllipse(f,4,4,28,28); g.DrawEllipse(p,4,4,28,28);
        using var font=new Font("Arial",18,FontStyle.Bold,GraphicsUnit.Pixel); using var b=B(Color.FromArgb(160,95,10));
        g.DrawString("₺",font,b,new PointF(11,8));
    }

    static void DrawTimesheet(Graphics g)
    {
        using var p=P(Color.FromArgb(40,120,155),2f); using var f=B(Color.FromArgb(226,244,248));
        g.FillRectangle(f,5,6,26,25); g.DrawRectangle(p,5,6,26,25); g.DrawLine(p,5,13,31,13);
        g.DrawLine(p,14,13,14,31); g.DrawLine(p,23,13,23,31); g.DrawLine(p,5,22,31,22);
        using var ok=P(Color.FromArgb(30,145,80),2.3f); g.DrawLines(ok,new[]{new PointF(16,18),new PointF(19,20),new PointF(22,16)});
    }
    static void DrawResults(Graphics g)
    {
        using var p=P(Color.FromArgb(75,90,115),2f); using var ok=P(Color.FromArgb(30,145,80),2.3f);
        g.DrawRectangle(p,7,4,23,28);
        for(int y=11;y<=25;y+=7){g.DrawLines(ok,new[]{new PointF(10,y),new PointF(12,y+2),new PointF(15,y-2)});g.DrawLine(p,18,y,27,y);}
    }

    static void DrawPayroll(Graphics g)
    {
        using var p=P(Color.FromArgb(55,90,145),2f); using var f=B(Color.FromArgb(236,242,252));
        g.FillRectangle(f,7,4,22,28); g.DrawRectangle(p,7,4,22,28);
        g.DrawLine(p,11,10,25,10); g.DrawLine(p,11,14,22,14); g.DrawLine(p,11,27,25,27);
        using var font=new Font("Arial",13,FontStyle.Bold,GraphicsUnit.Pixel); using var b=B(Color.FromArgb(40,120,70));
        g.DrawString("₺",font,b,new PointF(14,15));
    }

    static void DrawRoundedRectangle(this Graphics g, Pen p, RectangleF r, float radius)
    {
        using var path=Rounded(r,radius); g.DrawPath(p,path);
    }
    static void FillRoundedRectangle(this Graphics g, Brush b, RectangleF r, float radius)
    {
        using var path=Rounded(r,radius); g.FillPath(b,path);
    }
    static GraphicsPath Rounded(RectangleF r,float radius)
    {
        var d=radius*2;var path=new GraphicsPath();
        path.AddArc(r.X,r.Y,d,d,180,90);path.AddArc(r.Right-d,r.Y,d,d,270,90);
        path.AddArc(r.Right-d,r.Bottom-d,d,d,0,90);path.AddArc(r.X,r.Bottom-d,d,d,90,90);path.CloseFigure();return path;
    }
}
