using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using KYERP.PDKS.Core;

internal static class Program
{
    static readonly string PersonelExe=PdksOptions.FromEnvironment().PersonelExecutable;
    static readonly string HedefExe=Path.Combine(Path.GetDirectoryName(PersonelExe) ?? AppContext.BaseDirectory,"Hedef.exe");
    const uint WM_CLOSE=0x0010, WS_CHILD=0x40000000, WS_VISIBLE=0x10000000;
    const uint WS_CAPTION=0x00C00000, WS_THICKFRAME=0x00040000, WS_SYSMENU=0x00080000;
    const uint WS_MINIMIZEBOX=0x00020000, WS_MAXIMIZEBOX=0x00010000, WS_POPUP=0x80000000;
    const int GWL_STYLE=-16, SW_SHOW=5;
    const uint SWP_NOACTIVATE=0x0010, SWP_SHOWWINDOW=0x0040;
    static readonly IntPtr HWND_BOTTOM=new(1);
    static IntPtr brandPanel, statusLabel, toolbarPersonel, toolbarIcon, toolbarText, toolbarFont, toolbarHIcon, embedded;
    static int opening;

    delegate bool EnumWindowsProc(IntPtr hWnd,IntPtr lParam);
    [StructLayout(LayoutKind.Sequential)] struct POINT{public int X,Y;}
    [StructLayout(LayoutKind.Sequential)] struct RECT{public int Left,Top,Right,Bottom;}
    [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)] struct SHSTOCKICONINFO{public uint cbSize;public IntPtr hIcon;public int iSysImageIndex;public int iIcon;[MarshalAs(UnmanagedType.ByValTStr,SizeConst=260)]public string szPath;}
    [DllImport("user32.dll")] static extern bool EnumWindows(EnumWindowsProc lpEnumFunc,IntPtr lParam);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hWnd,out uint processId);
    [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern int GetClassName(IntPtr hWnd,StringBuilder lpClassName,int nMaxCount);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll")] static extern bool IsWindow(IntPtr hWnd);
    [DllImport("user32.dll")] static extern bool PostMessage(IntPtr hWnd,uint msg,IntPtr wParam,IntPtr lParam);
    [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr hWnd,int nCmdShow);
    [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr hWnd,out RECT rect);
    [DllImport("user32.dll")] static extern bool GetClientRect(IntPtr hWnd,out RECT rect);
    [DllImport("user32.dll")] static extern IntPtr SetParent(IntPtr child,IntPtr parent);
    [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr hWnd,IntPtr after,int x,int y,int cx,int cy,uint flags);
    [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern bool SetWindowText(IntPtr hWnd,string text);
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] static extern IntPtr GetWindowLongPtr(IntPtr hWnd,int index);
    [DllImport("user32.dll")] static extern IntPtr SetWindowLongPtr(IntPtr hWnd,int index,IntPtr value);
    [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern IntPtr FindWindowEx(IntPtr parent,IntPtr after,string cls,string? title);
    [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern IntPtr SendMessage(IntPtr hWnd,uint msg,IntPtr wParam,IntPtr lParam);
    [DllImport("gdi32.dll",CharSet=CharSet.Unicode)] static extern IntPtr CreateFont(int h,int w,int esc,int ori,int weight,uint italic,uint underline,uint strike,uint charset,uint outPrecision,uint clipPrecision,uint quality,uint pitchAndFamily,string face);
    [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern IntPtr CreateWindowEx(uint ex,string cls,string text,uint style,int x,int y,int w,int h,IntPtr parent,IntPtr menu,IntPtr inst,IntPtr param);
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode)] static extern IntPtr GetModuleHandle(string? name);
    [DllImport("shell32.dll",CharSet=CharSet.Unicode)] static extern int SHGetStockIconInfo(uint siid,uint flags,ref SHSTOCKICONINFO psii);
    [DllImport("user32.dll")] static extern IntPtr GetMenu(IntPtr hWnd);
    [DllImport("user32.dll")] static extern int GetMenuItemCount(IntPtr hMenu);
    [DllImport("user32.dll")] static extern bool RemoveMenu(IntPtr hMenu,uint uPosition,uint uFlags);
    [DllImport("user32.dll")] static extern bool DrawMenuBar(IntPtr hWnd);

    [STAThread]
    static void Main()
    {
        using var mutex=new Mutex(true,@"Local\HKN.Hedef500.Personel.Bridge",out bool first);
        if(!first)return;
        EnsureHedefRunning();
        new Thread(NativeWatcher){IsBackground=true}.Start();
        new Thread(BrandLoop){IsBackground=true}.Start();
        while(true)Thread.Sleep(1000);
    }

    static void EnsureHedefRunning()
    {
        try
        {
            if(Process.GetProcessesByName("Hedef").Length>0)return;
            if(!File.Exists(HedefExe))return;
            Process.Start(new ProcessStartInfo(HedefExe){UseShellExecute=true,WorkingDirectory=Path.GetDirectoryName(HedefExe)!});
        }
        catch{}
    }

    static void NativeWatcher()
    {
        while(true)
        {
            try
            {
                foreach(var h in Process.GetProcessesByName("Hedef"))
                {
                    var personel=FindWindowForProcess(h.Id,"TPersonelF");
                    if(personel==IntPtr.Zero||!IsWindowVisible(personel))continue;
                    PostMessage(personel,WM_CLOSE,IntPtr.Zero,IntPtr.Zero); Thread.Sleep(100); OpenPersonel(); break;
                }
            }
            catch{}
            Thread.Sleep(250);
        }
    }

    static void BrandLoop()
    {
        while(true)
        {
            try
            {
                foreach(var h in Process.GetProcessesByName("Hedef"))
                {
                    var main=FindWindowForProcess(h.Id,"TAnaf"); if(main==IntPtr.Zero)continue;
                    SetWindowText(main,"KY PDKS"); HideLegacyBrand(main); HideAboutMenu(main); EnsureBrandBackground(main); ResizeEmbedded(main);
                }
            }
            catch{}
            Thread.Sleep(400);
        }
    }

    static void HideAboutMenu(IntPtr main)
    {
        const uint MF_BYPOSITION=0x00000400;
        var menu=GetMenu(main); if(menu==IntPtr.Zero)return;
        int n=GetMenuItemCount(menu);
        if(n==7){RemoveMenu(menu,6,MF_BYPOSITION);DrawMenuBar(main);}
    }

    static void HideLegacyBrand(IntPtr main)
    {
        var panel=FindWindowEx(main,IntPtr.Zero,"TPanel",null);
        if(panel!=IntPtr.Zero)ShowWindow(panel,0);
        var status=FindWindowEx(main,IntPtr.Zero,"TStatusBar",null);
        if(status!=IntPtr.Zero)
        {
            GetClientRect(status,out RECT sr);
            if(statusLabel==IntPtr.Zero||!IsWindow(statusLabel))
                statusLabel=CreateWindowEx(0,"STATIC","www.kyerp.net",WS_CHILD|WS_VISIBLE|0x00000001,Math.Max(0,(sr.Right-180)/2),2,180,17,status,IntPtr.Zero,GetModuleHandle(null),IntPtr.Zero);
            SetWindowPos(statusLabel,IntPtr.Zero,Math.Max(0,(sr.Right-180)/2),2,180,17,SWP_NOACTIVATE|SWP_SHOWWINDOW);
        }
    }

    static void EnsureBrandBackground(IntPtr main)
    {
        if(!GetClientRect(main,out RECT c))return; int w=Math.Max(100,c.Right), h=Math.Max(100,c.Bottom);
        if(brandPanel==IntPtr.Zero||!IsWindow(brandPanel))
            brandPanel=CreateWindowEx(0,"STATIC","",WS_CHILD|WS_VISIBLE|0x00000006,0,82,w,Math.Max(50,h-104),main,IntPtr.Zero,GetModuleHandle(null),IntPtr.Zero);
    }

    static void EnsurePersonelToolbar(IntPtr main)
    {
        const uint SS_ICON=0x00000003, SS_CENTER=0x00000001;
        if(toolbarPersonel==IntPtr.Zero||!IsWindow(toolbarPersonel))
        {
            toolbarPersonel=CreateWindowEx(0,"BUTTON","",WS_VISIBLE,0,0,84,79,IntPtr.Zero,IntPtr.Zero,GetModuleHandle(null),IntPtr.Zero);
            if(toolbarPersonel!=IntPtr.Zero){SetParent(toolbarPersonel,main);long st=GetWindowLongPtr(toolbarPersonel,GWL_STYLE).ToInt64();st&=~((long)WS_POPUP);st|=WS_CHILD|WS_VISIBLE;SetWindowLongPtr(toolbarPersonel,GWL_STYLE,new IntPtr(st));}
        }
        if(toolbarPersonel!=IntPtr.Zero)
        {
            if(toolbarIcon==IntPtr.Zero||!IsWindow(toolbarIcon))toolbarIcon=CreateWindowEx(0,"STATIC","",WS_CHILD|WS_VISIBLE|SS_ICON,30,5,24,24,toolbarPersonel,IntPtr.Zero,GetModuleHandle(null),IntPtr.Zero);
            if(toolbarHIcon==IntPtr.Zero){var si=new SHSTOCKICONINFO{cbSize=(uint)Marshal.SizeOf<SHSTOCKICONINFO>(),szPath=""};if(SHGetStockIconInfo(96,0x101,ref si)==0)toolbarHIcon=si.hIcon;}
            if(toolbarIcon!=IntPtr.Zero&&toolbarHIcon!=IntPtr.Zero)SendMessage(toolbarIcon,0x0170,toolbarHIcon,IntPtr.Zero);
            if(toolbarText==IntPtr.Zero||!IsWindow(toolbarText))toolbarText=CreateWindowEx(0,"STATIC","Per. Bilgileri",WS_CHILD|WS_VISIBLE|SS_CENTER,2,34,80,35,toolbarPersonel,IntPtr.Zero,GetModuleHandle(null),IntPtr.Zero);
            if(toolbarFont==IntPtr.Zero)toolbarFont=CreateFont(12,0,0,0,700,0,0,0,1,0,0,5,0,"Segoe UI");
            if(toolbarFont!=IntPtr.Zero&&toolbarText!=IntPtr.Zero)SendMessage(toolbarText,0x0030,toolbarFont,(IntPtr)1);
            SetWindowPos(toolbarPersonel,IntPtr.Zero,264,0,84,79,SWP_NOACTIVATE|SWP_SHOWWINDOW);
        }
    }

    static void ResizeEmbedded(IntPtr main)
    {
        if(embedded==IntPtr.Zero||!IsWindow(embedded))return;
        if(!GetClientRect(main,out RECT c))return;
        int w=Math.Min(2050,Math.Max(1200,c.Right-300));
        int h=Math.Min(950,Math.Max(650,c.Bottom-260));
        int x=Math.Max(30,(c.Right-w)/2), y=120;
        SetWindowPos(embedded,IntPtr.Zero,x,y,w,h,SWP_NOACTIVATE|SWP_SHOWWINDOW|0x0020);
    }

    static void OpenPersonel()
    {
        if(Interlocked.Exchange(ref opening,1)!=0)return;
        try
        {
            var hedef=Process.GetProcessesByName("Hedef").FirstOrDefault(); if(hedef is null)return;
            var main=FindWindowForProcess(hedef.Id,"TAnaf"); if(main==IntPtr.Zero)return;
            var p=Process.GetProcessesByName("HKN.Personel.Native").FirstOrDefault();
            if(p is null)
            {
                if(!File.Exists(PersonelExe))return;
                p=Process.Start(new ProcessStartInfo(PersonelExe){UseShellExecute=true,WorkingDirectory=Path.GetDirectoryName(PersonelExe)!});
                if(p is null)return;
                for(int i=0;i<50&&p.MainWindowHandle==IntPtr.Zero;i++){Thread.Sleep(100);p.Refresh();}
            }
            p.Refresh(); var ph=p.MainWindowHandle; if(ph==IntPtr.Zero)return;
            embedded=ph; SetParent(ph,main);
            long style=GetWindowLongPtr(ph,GWL_STYLE).ToInt64();
            style&=~((long)WS_MINIMIZEBOX|WS_MAXIMIZEBOX|WS_POPUP);
            style|=WS_CHILD|WS_VISIBLE|WS_CAPTION|WS_SYSMENU|WS_THICKFRAME; SetWindowLongPtr(ph,GWL_STYLE,new IntPtr(style));
            ShowWindow(ph,SW_SHOW); ResizeEmbedded(main); SetForegroundWindow(ph);
        }
        catch{}
        finally{Thread.Sleep(200);Interlocked.Exchange(ref opening,0);}
    }

    static IntPtr FindWindowForProcess(int pid,string className)
    {
        IntPtr found=IntPtr.Zero;
        EnumWindows((hwnd,_)=>
        {
            GetWindowThreadProcessId(hwnd,out uint p); if(p!=(uint)pid)return true;
            var b=new StringBuilder(128);GetClassName(hwnd,b,b.Capacity);
            if(string.Equals(b.ToString(),className,StringComparison.Ordinal)){found=hwnd;return false;}
            return true;
        },IntPtr.Zero);
        return found;
    }
}
