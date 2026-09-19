using System.Diagnostics;
using System.Net.Sockets;
using System.Runtime.InteropServices;
using System.Text;
using Microsoft.Win32;

namespace HKNHedefShell;

internal static class Native
{
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc cb, IntPtr lp);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetClassName(IntPtr hWnd, StringBuilder s, int n);
    [DllImport("user32.dll", SetLastError=true)] public static extern IntPtr SetParent(IntPtr child, IntPtr parent);
    [DllImport("user32.dll", SetLastError=true)] public static extern int GetWindowLong(IntPtr h, int index);
    [DllImport("user32.dll", SetLastError=true)] public static extern int SetWindowLong(IntPtr h, int index, int value);
    [DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr h, int x, int y, int w, int he, bool repaint);
    [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr h, out RECT r);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern bool SetWindowText(IntPtr h, string text);
    [DllImport("user32.dll")] public static extern IntPtr GetMenu(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern int GetMenuItemCount(IntPtr hMenu);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetMenuString(IntPtr hMenu,uint uIDItem,StringBuilder lpString,int cchMax,uint flags);
    [DllImport("user32.dll")] public static extern bool DeleteMenu(IntPtr hMenu,uint uPosition,uint uFlags);
    [DllImport("user32.dll")] public static extern bool DrawMenuBar(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT p);
    [DllImport("user32.dll")] public static extern bool ScreenToClient(IntPtr h, ref POINT p);
    [DllImport("user32.dll")] public static extern short GetAsyncKeyState(int vKey);
    public const int GWL_STYLE=-16, WS_CHILD=0x40000000, WS_POPUP=unchecked((int)0x80000000); public const uint MF_BYPOSITION=0x00000400;
    [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
    [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X, Y; }
    public static IntPtr FindTop(int pid, string cls)
    {
        IntPtr found = IntPtr.Zero;
        EnumWindows((h, _) => { GetWindowThreadProcessId(h, out var p); if (p == pid) { var b=new StringBuilder(128); GetClassName(h,b,b.Capacity); if (b.ToString()==cls){found=h;return false;} } return true; }, IntPtr.Zero);
        return found;
    }
}

internal sealed class ShellContext : ApplicationContext
{
    readonly System.Windows.Forms.Timer timer = new() { Interval = 400 };
    readonly Form panel = new();
    readonly WebBrowser web = new();
    readonly Button personelBtn = new();
    readonly Button canliBtn = new();
    Process? hedef;
    IntPtr hedefHwnd = IntPtr.Zero;
    bool docked;
    bool lastMouseDown;
    bool menuCleaned;

    public ShellContext()
    {
        SetBrowserMode();
        EnsureServer();
        EnsureHedef();
        BuildUi();
        timer.Tick += (_,__) => Tick();
        timer.Start();
    }

    static void SetBrowserMode()
    {
        try {
            using var k=Registry.CurrentUser.CreateSubKey(@"Software\Microsoft\Internet Explorer\Main\FeatureControl\FEATURE_BROWSER_EMULATION");
            k?.SetValue("HKNHedefShell.exe", 11001, RegistryValueKind.DWord);
        } catch { }
    }

    static bool PortOpen(int port)
    {
        try { using var c=new TcpClient(); return c.ConnectAsync("127.0.0.1",port).Wait(250) && c.Connected; }
        catch { return false; }
    }

    static void EnsureServer()
    {
        if (PortOpen(5051)) return;
        var psi=new ProcessStartInfo("C:\\Program Files\\nodejs\\node.exe", "server.js") {
            WorkingDirectory=@"D:\Hedef500\HKN_PERSONEL", UseShellExecute=false,
            CreateNoWindow=true, WindowStyle=ProcessWindowStyle.Hidden
        };
        Process.Start(psi);
    }

    void EnsureHedef()
    {
        hedef=Process.GetProcessesByName("Hedef").FirstOrDefault();
        if (hedef!=null) return;
        var exe=@"D:\Hedef500\Hedef500\Hedef.exe";
        if (File.Exists(exe)) hedef=Process.Start(new ProcessStartInfo(exe){WorkingDirectory=Path.GetDirectoryName(exe)!});
    }

    static Bitmap MakeIcon(bool live)
    {
        var bmp=new Bitmap(24,24);
        using var g=Graphics.FromImage(bmp);
        g.Clear(Color.Transparent);
        using var p=new Pen(Color.RoyalBlue,2);
        if(live){g.DrawLine(p,2,13,7,13);g.DrawLine(p,7,13,10,6);g.DrawLine(p,10,6,14,18);g.DrawLine(p,14,18,18,10);g.DrawLine(p,18,10,22,10);}
        else {g.DrawEllipse(p,8,2,8,8);g.DrawArc(p,4,10,16,11,190,160);}
        return bmp;
    }

    void StyleToolButton(Button b,string text,bool live)
    {
        b.Text=text; b.Width=72; b.Height=46; b.FlatStyle=FlatStyle.Flat;
        b.FlatAppearance.BorderSize=0; b.BackColor=SystemColors.Control; b.ForeColor=Color.Navy;
        b.Font=new Font("MS Sans Serif",8,FontStyle.Bold); b.Image=MakeIcon(live);
        b.TextImageRelation=TextImageRelation.ImageAboveText; b.UseVisualStyleBackColor=false;
    }

    void BuildUi()
    {
        StyleToolButton(personelBtn,"Per. Bilgileri",false);
        StyleToolButton(canliBtn,"Canlı Kontrol",true);
        personelBtn.Click += (_,__) => ShowPage("personel");
        canliBtn.Click += (_,__) => ShowPage("canli");

        panel.FormBorderStyle=FormBorderStyle.None;
        panel.ShowInTaskbar=false;
        panel.BackColor=SystemColors.Control;
        web.Dock=DockStyle.Fill;
        web.ScriptErrorsSuppressed=true;
        web.IsWebBrowserContextMenuEnabled=false;
        panel.Controls.Add(web);
        panel.Show();
        panel.Hide();
        personelBtn.Show();
        canliBtn.Show();
    }

    void ShowPage(string view)
    {
        web.Navigate("http://127.0.0.1:5051/embedded.html#"+view);
        panel.Show();
        panel.BringToFront();
        personelBtn.BackColor=view=="personel"?Color.FromArgb(220,235,248):SystemColors.Control;
        canliBtn.BackColor=view=="canli"?Color.FromArgb(220,235,248):SystemColors.Control;
    }

    void DockControl(Control c)
    {
        var s=Native.GetWindowLong(c.Handle,Native.GWL_STYLE);
        Native.SetWindowLong(c.Handle,Native.GWL_STYLE,(s|Native.WS_CHILD)&~Native.WS_POPUP);
        Native.SetParent(c.Handle,hedefHwnd);
    }

    void Tick()
    {
        if (hedef==null || hedef.HasExited) { EnsureHedef(); docked=false; hedefHwnd=IntPtr.Zero; return; }
        if (hedefHwnd==IntPtr.Zero) hedefHwnd=Native.FindTop(hedef.Id,"TAnaf");
        if (hedefHwnd==IntPtr.Zero) return;
        Native.SetWindowText(hedefHwnd,"Hedef");
        if(!menuCleaned){var m=Native.GetMenu(hedefHwnd);if(m!=IntPtr.Zero){for(int i=Native.GetMenuItemCount(m)-1;i>=0;i--){var b=new StringBuilder(128);Native.GetMenuString(m,(uint)i,b,b.Capacity,Native.MF_BYPOSITION);if(b.ToString().Replace("&","").Trim().Equals("HakkÄ±nda",StringComparison.OrdinalIgnoreCase)){Native.DeleteMenu(m,(uint)i,Native.MF_BYPOSITION);Native.DrawMenuBar(hedefHwnd);break;}}menuCleaned=true;}}
        if (!docked)
        {
            DockControl(panel);
            DockControl(personelBtn);
            DockControl(canliBtn);
            docked=true;
            ShowPage("personel");
        }
        if (!Native.GetClientRect(hedefHwnd,out var r)) return;
        int w=Math.Max(700,r.Right-r.Left), h=Math.Max(400,r.Bottom-r.Top);
        personelBtn.Show();
        Native.MoveWindow(personelBtn.Handle,278,24,72,46,true);
        Native.MoveWindow(canliBtn.Handle,600,24,82,46,true);
        Native.MoveWindow(panel.Handle,0,72,w,Math.Max(250,h-96),true);
        bool down=(Native.GetAsyncKeyState(0x01)&0x8000)!=0;
        if(down&&!lastMouseDown&&Native.GetCursorPos(out var pt))
        {
            Native.ScreenToClient(hedefHwnd,ref pt);
            bool onPerson=pt.X>=278&&pt.X<=350&&pt.Y>=24&&pt.Y<=70;
            bool onLive=pt.X>=600&&pt.X<=682&&pt.Y>=24&&pt.Y<=70;
            if(onPerson) ShowPage("personel"); else if(onLive) ShowPage("canli"); else if(pt.Y>=20&&pt.Y<=72) panel.Hide();
        }
        lastMouseDown=down;
    }
}

internal static class Program
{
    [STAThread]
    static void Main()
    {
        Application.SetHighDpiMode(HighDpiMode.DpiUnaware);
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        using var mutex=new Mutex(true,"HKN_HEDEF_SHELL",out bool first);
        if(!first) return;
        Application.Run(new ShellContext());
    }
}
