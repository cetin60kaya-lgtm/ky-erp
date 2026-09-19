using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using KYERP.PDKS.Core;

internal static class Program
{
    static readonly string PersonelExe = PdksOptions.FromEnvironment().PersonelExecutable;
    static readonly string HedefExe = Path.Combine(Path.GetDirectoryName(PersonelExe) ?? AppContext.BaseDirectory, "Hedef.exe");

    const uint WM_CLOSE = 0x0010, WM_COMMAND = 0x0111, WM_PAINT = 0x000F, WM_ERASEBKGND = 0x0014, WM_LBUTTONDOWN = 0x0201;
    const uint WS_CHILD = 0x40000000, WS_VISIBLE = 0x10000000, WS_POPUP = 0x80000000;
    const uint WS_CAPTION = 0x00C00000, WS_THICKFRAME = 0x00040000, WS_SYSMENU = 0x00080000;
    const uint WS_MINIMIZEBOX = 0x00020000, WS_MAXIMIZEBOX = 0x00010000;
    const uint MF_BYPOSITION = 0x00000400, MF_POPUP = 0x00000010, MF_STRING = 0x00000000;
    const uint SWP_NOACTIVATE = 0x0010, SWP_SHOWWINDOW = 0x0040;
    const int SW_HIDE = 0, SW_SHOW = 5, GWL_STYLE = -16;
    const int COLOR_BTNFACE = 15, COLOR_3DSHADOW = 16, COLOR_3DHILIGHT = 20;
    const int TRANSPARENT = 1, DT_CENTER = 0x00000001, DT_WORDBREAK = 0x00000010, DT_NOPREFIX = 0x00000800;
    const uint SRCCOPY = 0x00CC0020, DI_NORMAL = 0x0003;
    const uint RDW_INVALIDATE = 0x0001, RDW_UPDATENOW = 0x0100, RDW_ALLCHILDREN = 0x0080;

    const int ToolbarHeight = 58;
    const string ShellClassName = "KYERP.PDKS.LegacyMirrorToolbar";

    static readonly string[] Labels =
    {
        "Bilgi Aktar", "Gruplar", "Dönemler", "Bölümler", "Giriş-Çıkışlar",
        "Personel", "Avanslar", "Puantaj", "Puantaj Son.", "Bordro", "Çalışma Tarihi"
    };

    static readonly string[] Actions =
    {
        "BILGI", "GRUPLAR", "DONEMLER", "BOLUMLER", "GIRISCIKIS",
        "PERSONEL", "AVANSLAR", "PUANTAJ", "PUANTAJSON", "BORDRO", "CALISMA"
    };

    // İlk 5 butonun toplamı 264 px; eski Hedef çubuğundaki Personel konumu bire bir korunur.
    static readonly int[] Widths = { 50, 50, 50, 50, 64, 84, 55, 55, 65, 55, 70 };

    static IntPtr shellWindow, shellMain, capturedBar, shellFont, statusLabel, embedded;
    static int capturedWidth, opening;
    static bool shellClassRegistered;
    static readonly WndProcDelegate ShellWndProcDelegate = ShellWndProc;

    delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
    delegate IntPtr WndProcDelegate(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam);

    [StructLayout(LayoutKind.Sequential)] struct POINT { public int X, Y; }
    [StructLayout(LayoutKind.Sequential)] struct RECT { public int Left, Top, Right, Bottom; }
    [StructLayout(LayoutKind.Sequential)] struct PAINTSTRUCT { public IntPtr hdc; public int fErase; public RECT rcPaint; public int fRestore; public int fIncUpdate; [MarshalAs(UnmanagedType.ByValArray, SizeConst = 32)] public byte[] rgbReserved; }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    struct WNDCLASSEX
    {
        public uint cbSize, style;
        public IntPtr lpfnWndProc;
        public int cbClsExtra, cbWndExtra;
        public IntPtr hInstance, hIcon, hCursor, hbrBackground;
        [MarshalAs(UnmanagedType.LPWStr)] public string? lpszMenuName;
        [MarshalAs(UnmanagedType.LPWStr)] public string lpszClassName;
        public IntPtr hIconSm;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    struct SHSTOCKICONINFO
    {
        public uint cbSize;
        public IntPtr hIcon;
        public int iSysImageIndex, iIcon;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)] public string szPath;
    }

    [DllImport("user32.dll")] static extern bool EnumWindows(EnumWindowsProc callback, IntPtr lParam);
    [DllImport("user32.dll")] static extern bool EnumChildWindows(IntPtr parent, EnumWindowsProc callback, IntPtr lParam);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr hWnd, StringBuilder text, int maxCount);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll")] static extern bool IsWindow(IntPtr hWnd);
    [DllImport("user32.dll")] static extern bool PostMessage(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam);
    [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr hWnd, int command);
    [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
    [DllImport("user32.dll")] static extern bool GetClientRect(IntPtr hWnd, out RECT rect);
    [DllImport("user32.dll")] static extern IntPtr SetParent(IntPtr child, IntPtr parent);
    [DllImport("user32.dll")] static extern IntPtr GetParent(IntPtr child);
    [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr hWnd, IntPtr after, int x, int y, int cx, int cy, uint flags);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern bool SetWindowText(IntPtr hWnd, string text);
    [DllImport("user32.dll")] static extern IntPtr GetWindowLongPtr(IntPtr hWnd, int index);
    [DllImport("user32.dll")] static extern IntPtr SetWindowLongPtr(IntPtr hWnd, int index, IntPtr value);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern IntPtr SendMessage(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern IntPtr CreateWindowEx(uint ex, string cls, string text, uint style, int x, int y, int w, int h, IntPtr parent, IntPtr menu, IntPtr instance, IntPtr param);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern ushort RegisterClassEx(ref WNDCLASSEX wndClass);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern IntPtr DefWindowProc(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam);
    [DllImport("user32.dll")] static extern IntPtr LoadCursor(IntPtr instance, IntPtr cursorName);
    [DllImport("user32.dll")] static extern IntPtr BeginPaint(IntPtr hWnd, out PAINTSTRUCT ps);
    [DllImport("user32.dll")] static extern bool EndPaint(IntPtr hWnd, ref PAINTSTRUCT ps);
    [DllImport("user32.dll")] static extern IntPtr GetDC(IntPtr hWnd);
    [DllImport("user32.dll")] static extern int ReleaseDC(IntPtr hWnd, IntPtr hdc);
    [DllImport("user32.dll")] static extern bool FillRect(IntPtr hdc, ref RECT rect, IntPtr brush);
    [DllImport("user32.dll")] static extern IntPtr GetSysColorBrush(int index);
    [DllImport("user32.dll")] static extern bool InvalidateRect(IntPtr hWnd, IntPtr rect, bool erase);
    [DllImport("user32.dll")] static extern bool RedrawWindow(IntPtr hWnd, IntPtr updateRect, IntPtr updateRgn, uint flags);
    [DllImport("user32.dll")] static extern int DrawText(IntPtr hdc, string text, int count, ref RECT rect, uint format);
    [DllImport("user32.dll")] static extern int SetBkMode(IntPtr hdc, int mode);
    [DllImport("user32.dll")] static extern uint SetTextColor(IntPtr hdc, uint color);
    [DllImport("user32.dll")] static extern IntPtr SelectObject(IntPtr hdc, IntPtr obj);
    [DllImport("user32.dll")] static extern bool DrawIconEx(IntPtr hdc, int x, int y, IntPtr icon, int cx, int cy, uint step, IntPtr brush, uint flags);
    [DllImport("gdi32.dll")] static extern IntPtr CreateCompatibleDC(IntPtr hdc);
    [DllImport("gdi32.dll")] static extern IntPtr CreateCompatibleBitmap(IntPtr hdc, int cx, int cy);
    [DllImport("gdi32.dll")] static extern bool DeleteDC(IntPtr hdc);
    [DllImport("gdi32.dll")] static extern bool DeleteObject(IntPtr obj);
    [DllImport("gdi32.dll")] static extern bool BitBlt(IntPtr dest, int x, int y, int cx, int cy, IntPtr src, int sx, int sy, uint rop);
    [DllImport("gdi32.dll", CharSet = CharSet.Unicode)] static extern IntPtr CreateFont(int h, int w, int esc, int ori, int weight, uint italic, uint underline, uint strike, uint charset, uint outPrecision, uint clipPrecision, uint quality, uint pitchAndFamily, string face);
    [DllImport("gdi32.dll")] static extern IntPtr CreatePen(int style, int width, uint color);
    [DllImport("gdi32.dll")] static extern bool MoveToEx(IntPtr hdc, int x, int y, IntPtr oldPoint);
    [DllImport("gdi32.dll")] static extern bool LineTo(IntPtr hdc, int x, int y);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern IntPtr GetModuleHandle(string? name);
    [DllImport("shell32.dll", CharSet = CharSet.Unicode)] static extern int SHGetStockIconInfo(uint siid, uint flags, ref SHSTOCKICONINFO info);
    [DllImport("user32.dll")] static extern IntPtr GetMenu(IntPtr hWnd);
    [DllImport("user32.dll")] static extern int GetMenuItemCount(IntPtr menu);
    [DllImport("user32.dll")] static extern IntPtr GetSubMenu(IntPtr menu, int position);
    [DllImport("user32.dll")] static extern uint GetMenuItemID(IntPtr menu, int position);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetMenuString(IntPtr menu, uint item, StringBuilder text, int maxCount, uint flags);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern bool ModifyMenu(IntPtr menu, uint position, uint flags, UIntPtr idNewItem, string newText);
    [DllImport("user32.dll")] static extern bool RemoveMenu(IntPtr menu, uint position, uint flags);
    [DllImport("user32.dll")] static extern bool DrawMenuBar(IntPtr hWnd);

    [STAThread]
    static void Main()
    {
        using var mutex = new Mutex(true, @"Local\HKN.Hedef500.Personel.Bridge", out bool first);
        if (!first) return;
        EnsureHedefRunning();
        new Thread(NativeWatcher) { IsBackground = true }.Start();
        new Thread(ShellLoop) { IsBackground = true }.Start();
        while (true) Thread.Sleep(1000);
    }

    static void EnsureHedefRunning()
    {
        try
        {
            if (Process.GetProcessesByName("Hedef").Length > 0) return;
            if (!File.Exists(HedefExe)) return;
            Process.Start(new ProcessStartInfo(HedefExe) { UseShellExecute = true, WorkingDirectory = Path.GetDirectoryName(HedefExe)! });
        }
        catch { }
    }

    static void NativeWatcher()
    {
        while (true)
        {
            try
            {
                foreach (var process in Process.GetProcessesByName("Hedef"))
                {
                    var legacyPersonel = FindWindowForProcess(process.Id, "TPersonelF");
                    if (legacyPersonel == IntPtr.Zero || !IsWindowVisible(legacyPersonel)) continue;
                    PostMessage(legacyPersonel, WM_CLOSE, IntPtr.Zero, IntPtr.Zero);
                    Thread.Sleep(100);
                    OpenPersonel();
                    break;
                }
            }
            catch { }
            Thread.Sleep(250);
        }
    }

    static void ShellLoop()
    {
        while (true)
        {
            try
            {
                foreach (var process in Process.GetProcessesByName("Hedef"))
                {
                    var main = FindWindowForProcess(process.Id, "TAnaf");
                    if (main == IntPtr.Zero) continue;
                    SetWindowText(main, "KYERP PDKS");
                    RewriteTopMenu(main);
                    EnsureLegacyMirrorShell(main);
                    EnsureStatusBrand(main);
                    ResizeEmbedded(main);
                }
            }
            catch { }
            Thread.Sleep(350);
        }
    }

    static void RewriteTopMenu(IntPtr main)
    {
        var menu = GetMenu(main);
        if (menu == IntPtr.Zero) return;
        string[] labels = { "Ayarlar", "Personel Tanımları", "Personel İşlemleri", "Raporlar", "Araçlar", "Terminal / Veri Aktarımı" };
        int count = GetMenuItemCount(menu);
        for (int i = 0; i < Math.Min(labels.Length, count); i++)
        {
            var sub = GetSubMenu(menu, i);
            if (sub != IntPtr.Zero) ModifyMenu(menu, (uint)i, MF_BYPOSITION | MF_POPUP, ToUIntPtr(sub), labels[i]);
            else ModifyMenu(menu, (uint)i, MF_BYPOSITION | MF_STRING, new UIntPtr(GetMenuItemID(menu, i)), labels[i]);
        }
        for (int i = count - 1; i >= labels.Length; i--) RemoveMenu(menu, (uint)i, MF_BYPOSITION);
        DrawMenuBar(main);
    }

    static void EnsureLegacyMirrorShell(IntPtr main)
    {
        if (!GetClientRect(main, out var client)) return;
        int width = Math.Max(700, client.Right);

        if (shellWindow == IntPtr.Zero || !IsWindow(shellWindow) || shellMain != main)
        {
            shellMain = main;
            RestoreLegacyHeader(main);
            RedrawWindow(main, IntPtr.Zero, IntPtr.Zero, RDW_INVALIDATE | RDW_UPDATENOW | RDW_ALLCHILDREN);
            Thread.Sleep(80);
            CaptureLegacyToolbar(main, width);
            RegisterShellClass();
            shellWindow = CreateWindowEx(0, ShellClassName, "", WS_CHILD | WS_VISIBLE, 0, 0, width, ToolbarHeight, main, IntPtr.Zero, GetModuleHandle(null), IntPtr.Zero);
            if (shellFont == IntPtr.Zero) shellFont = CreateFont(-11, 0, 0, 0, 700, 0, 0, 0, 1, 0, 0, 5, 0, "Tahoma");
        }

        HideLegacyHeader(main);
        if (shellWindow != IntPtr.Zero)
        {
            SetWindowPos(shellWindow, IntPtr.Zero, 0, 0, width, ToolbarHeight, SWP_NOACTIVATE | SWP_SHOWWINDOW);
            InvalidateRect(shellWindow, IntPtr.Zero, false);
        }
    }

    static void RegisterShellClass()
    {
        if (shellClassRegistered) return;
        var wc = new WNDCLASSEX
        {
            cbSize = (uint)Marshal.SizeOf<WNDCLASSEX>(),
            lpfnWndProc = Marshal.GetFunctionPointerForDelegate(ShellWndProcDelegate),
            hInstance = GetModuleHandle(null),
            hCursor = LoadCursor(IntPtr.Zero, new IntPtr(32512)),
            hbrBackground = GetSysColorBrush(COLOR_BTNFACE),
            lpszClassName = ShellClassName,
            lpszMenuName = null
        };
        RegisterClassEx(ref wc);
        shellClassRegistered = true;
    }

    static void RestoreLegacyHeader(IntPtr main)
    {
        if (!GetWindowRect(main, out var mainRect)) return;
        EnumChildWindows(main, (child, _) =>
        {
            if (GetParent(child) != main || child == shellWindow) return true;
            if (ClassName(child) == "TStatusBar") return true;
            if (!GetWindowRect(child, out var rect)) return true;
            int top = rect.Top - mainRect.Top;
            int height = rect.Bottom - rect.Top;
            if (top < 145 && height > 8 && height <= 125) ShowWindow(child, SW_SHOW);
            return true;
        }, IntPtr.Zero);
    }

    static void HideLegacyHeader(IntPtr main)
    {
        if (!GetWindowRect(main, out var mainRect)) return;
        EnumChildWindows(main, (child, _) =>
        {
            if (GetParent(child) != main || child == shellWindow) return true;
            if (ClassName(child) == "TStatusBar") return true;
            if (!GetWindowRect(child, out var rect)) return true;
            int top = rect.Top - mainRect.Top;
            int height = rect.Bottom - rect.Top;
            bool topControl = top < 145 && height > 8 && height <= 125;
            bool toolbarClass = ClassName(child).Contains("ToolBar", StringComparison.OrdinalIgnoreCase)
                                || ClassName(child).Contains("CoolBar", StringComparison.OrdinalIgnoreCase)
                                || ClassName(child).Contains("ControlBar", StringComparison.OrdinalIgnoreCase);
            if (topControl || toolbarClass) ShowWindow(child, SW_HIDE);
            return true;
        }, IntPtr.Zero);
    }

    static void CaptureLegacyToolbar(IntPtr main, int width)
    {
        var source = GetDC(main);
        if (source == IntPtr.Zero) return;
        var memory = CreateCompatibleDC(source);
        var bitmap = CreateCompatibleBitmap(source, width, ToolbarHeight);
        if (memory != IntPtr.Zero && bitmap != IntPtr.Zero)
        {
            var old = SelectObject(memory, bitmap);
            BitBlt(memory, 0, 0, width, ToolbarHeight, source, 0, 0, SRCCOPY);
            SelectObject(memory, old);
            if (capturedBar != IntPtr.Zero) DeleteObject(capturedBar);
            capturedBar = bitmap;
            capturedWidth = width;
        }
        if (memory != IntPtr.Zero) DeleteDC(memory);
        ReleaseDC(main, source);
    }

    static IntPtr ShellWndProc(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam)
    {
        if (msg == WM_ERASEBKGND) return new IntPtr(1);
        if (msg == WM_PAINT)
        {
            var hdc = BeginPaint(hWnd, out var ps);
            try { PaintToolbar(hdc, hWnd); }
            finally { EndPaint(hWnd, ref ps); }
            return IntPtr.Zero;
        }
        if (msg == WM_LBUTTONDOWN)
        {
            int x = unchecked((short)(long)lParam) & 0xFFFF;
            int cursor = 0;
            for (int i = 0; i < Widths.Length; i++)
            {
                if (x >= cursor && x < cursor + Widths[i])
                {
                    string action = Actions[i];
                    ThreadPool.QueueUserWorkItem(_ => ExecuteToolbarAction(action));
                    break;
                }
                cursor += Widths[i];
            }
            return IntPtr.Zero;
        }
        return DefWindowProc(hWnd, msg, wParam, lParam);
    }

    static void PaintToolbar(IntPtr hdc, IntPtr hWnd)
    {
        if (!GetClientRect(hWnd, out var client)) return;
        FillRect(hdc, ref client, GetSysColorBrush(COLOR_BTNFACE));

        if (capturedBar != IntPtr.Zero)
        {
            var memory = CreateCompatibleDC(hdc);
            if (memory != IntPtr.Zero)
            {
                var old = SelectObject(memory, capturedBar);
                BitBlt(hdc, 0, 0, Math.Min(client.Right, capturedWidth), ToolbarHeight, memory, 0, 0, SRCCOPY);
                SelectObject(memory, old);
                DeleteDC(memory);
            }
        }

        DrawActivePersonel(hdc);
    }

    static void DrawActivePersonel(IntPtr hdc)
    {
        int left = 0;
        for (int i = 0; i < 5; i++) left += Widths[i];
        int right = left + Widths[5];
        var rect = new RECT { Left = left, Top = 0, Right = right, Bottom = ToolbarHeight };
        FillRect(hdc, ref rect, GetSysColorBrush(COLOR_BTNFACE));

        DrawSeparator(hdc, left, ToolbarHeight, COLOR_3DHILIGHT);
        DrawSeparator(hdc, right - 1, ToolbarHeight, COLOR_3DSHADOW);

        var iconInfo = new SHSTOCKICONINFO { cbSize = (uint)Marshal.SizeOf<SHSTOCKICONINFO>(), szPath = string.Empty };
        if (SHGetStockIconInfo(96, 0x101, ref iconInfo) == 0 && iconInfo.hIcon != IntPtr.Zero)
            DrawIconEx(hdc, left + (Widths[5] - 16) / 2, 7, iconInfo.hIcon, 16, 16, 0, IntPtr.Zero, DI_NORMAL);

        var textRect = new RECT { Left = left + 2, Top = 29, Right = right - 2, Bottom = ToolbarHeight - 2 };
        var oldFont = shellFont != IntPtr.Zero ? SelectObject(hdc, shellFont) : IntPtr.Zero;
        SetBkMode(hdc, TRANSPARENT);
        SetTextColor(hdc, Rgb(0, 0, 180));
        DrawText(hdc, "Personel", -1, ref textRect, DT_CENTER | DT_WORDBREAK | DT_NOPREFIX);
        if (oldFont != IntPtr.Zero) SelectObject(hdc, oldFont);
    }

    static void DrawSeparator(IntPtr hdc, int x, int height, int systemColor)
    {
        uint color = systemColor == COLOR_3DSHADOW ? Rgb(160, 160, 160) : Rgb(255, 255, 255);
        var pen = CreatePen(0, 1, color);
        if (pen == IntPtr.Zero) return;
        var old = SelectObject(hdc, pen);
        MoveToEx(hdc, x, 1, IntPtr.Zero);
        LineTo(hdc, x, height - 1);
        SelectObject(hdc, old);
        DeleteObject(pen);
    }

    static uint Rgb(byte r, byte g, byte b) => (uint)(r | (g << 8) | (b << 16));

    static void ExecuteToolbarAction(string action)
    {
        var process = Process.GetProcessesByName("Hedef").FirstOrDefault();
        if (process is null) return;
        var main = FindWindowForProcess(process.Id, "TAnaf");
        if (main == IntPtr.Zero) return;

        if (action == "PERSONEL")
        {
            OpenPersonel();
            return;
        }

        HideEmbedded();
        string[] targets = action switch
        {
            "BILGI" => new[] { "bilgi aktar", "bilgi transfer" },
            "GRUPLAR" => new[] { "gruplar", "grup" },
            "DONEMLER" => new[] { "dönemler", "donemler", "dönem" },
            "BOLUMLER" => new[] { "bölümler", "bolumler", "bölüm" },
            "GIRISCIKIS" => new[] { "giriş-çıkış", "giriş çıkış", "giriş ve çıkış" },
            "AVANSLAR" => new[] { "avanslar", "avans" },
            "PUANTAJ" => new[] { "puantaj" },
            "PUANTAJSON" => new[] { "puantaj son", "puantaj sonuç", "puantaj sonuc" },
            "BORDRO" => new[] { "bordro" },
            "CALISMA" => new[] { "çalışma tarihi", "calisma tarihi" },
            _ => Array.Empty<string>()
        };

        if (TryFindMenuCommand(GetMenu(main), targets, action, out uint commandId))
            PostMessage(main, WM_COMMAND, new IntPtr(unchecked((int)commandId)), IntPtr.Zero);
    }

    static bool TryFindMenuCommand(IntPtr menu, string[] targets, string action, out uint commandId)
    {
        commandId = uint.MaxValue;
        if (menu == IntPtr.Zero || targets.Length == 0) return false;
        int count = GetMenuItemCount(menu);

        // Önce tam eşleşme aranır; Puantaj ile Puantaj Sonucu birbirine karışmaz.
        for (int pass = 0; pass < 2; pass++)
        {
            for (int i = 0; i < count; i++)
            {
                var sub = GetSubMenu(menu, i);
                if (sub != IntPtr.Zero && TryFindMenuCommand(sub, targets, action, out commandId)) return true;

                uint id = GetMenuItemID(menu, i);
                if (id == uint.MaxValue) continue;
                string normalized = Normalize(MenuText(menu, i));

                foreach (var target in targets)
                {
                    string candidate = Normalize(target);
                    bool match = pass == 0 ? normalized == candidate : normalized.Contains(candidate, StringComparison.OrdinalIgnoreCase);
                    if (action == "PUANTAJ" && normalized.Contains("son", StringComparison.OrdinalIgnoreCase)) match = false;
                    if (match) { commandId = id; return true; }
                }
            }
        }
        return false;
    }

    static string MenuText(IntPtr menu, int position)
    {
        var text = new StringBuilder(256);
        GetMenuString(menu, (uint)position, text, text.Capacity, MF_BYPOSITION);
        return text.ToString().Replace("&", string.Empty).Trim();
    }

    static string Normalize(string value)
    {
        return value.ToLowerInvariant()
            .Replace("ı", "i").Replace("ş", "s").Replace("ğ", "g")
            .Replace("ü", "u").Replace("ö", "o").Replace("ç", "c")
            .Replace(".", string.Empty).Replace("-", " ")
            .Replace("  ", " ").Trim();
    }

    static void EnsureStatusBrand(IntPtr main)
    {
        IntPtr status = IntPtr.Zero;
        EnumChildWindows(main, (child, _) =>
        {
            if (GetParent(child) == main && ClassName(child) == "TStatusBar") { status = child; return false; }
            return true;
        }, IntPtr.Zero);
        if (status == IntPtr.Zero || !GetClientRect(status, out var rect)) return;

        if (statusLabel == IntPtr.Zero || !IsWindow(statusLabel))
            statusLabel = CreateWindowEx(0, "STATIC", "www.kyerp.net", WS_CHILD | WS_VISIBLE | 0x00000001, Math.Max(0, (rect.Right - 180) / 2), 2, 180, 17, status, IntPtr.Zero, GetModuleHandle(null), IntPtr.Zero);

        SetWindowPos(statusLabel, IntPtr.Zero, Math.Max(0, (rect.Right - 180) / 2), 2, 180, 17, SWP_NOACTIVATE | SWP_SHOWWINDOW);
    }

    static void OpenPersonel()
    {
        if (Interlocked.Exchange(ref opening, 1) != 0) return;
        try
        {
            var hedef = Process.GetProcessesByName("Hedef").FirstOrDefault();
            if (hedef is null) return;
            var main = FindWindowForProcess(hedef.Id, "TAnaf");
            if (main == IntPtr.Zero) return;

            var p = Process.GetProcessesByName("HKN.Personel.Native").FirstOrDefault();
            if (p is null)
            {
                if (!File.Exists(PersonelExe)) return;
                p = Process.Start(new ProcessStartInfo(PersonelExe) { UseShellExecute = true, WorkingDirectory = Path.GetDirectoryName(PersonelExe)! });
                if (p is null) return;
                for (int i = 0; i < 60 && p.MainWindowHandle == IntPtr.Zero; i++) { Thread.Sleep(100); p.Refresh(); }
            }

            p.Refresh();
            var ph = p.MainWindowHandle;
            if (ph == IntPtr.Zero) return;
            embedded = ph;
            SetParent(ph, main);
            long style = GetWindowLongPtr(ph, GWL_STYLE).ToInt64();
            style &= ~((long)WS_MINIMIZEBOX | WS_MAXIMIZEBOX | WS_POPUP | WS_CAPTION | WS_THICKFRAME | WS_SYSMENU);
            style |= WS_CHILD | WS_VISIBLE;
            SetWindowLongPtr(ph, GWL_STYLE, new IntPtr(style));
            ShowWindow(ph, SW_SHOW);
            ResizeEmbedded(main);
            SetForegroundWindow(ph);
        }
        catch { }
        finally { Thread.Sleep(150); Interlocked.Exchange(ref opening, 0); }
    }

    static void ResizeEmbedded(IntPtr main)
    {
        if (embedded == IntPtr.Zero || !IsWindow(embedded) || !GetClientRect(main, out var client)) return;
        int statusHeight = 22;
        int width = Math.Max(600, client.Right);
        int height = Math.Max(300, client.Bottom - ToolbarHeight - statusHeight);
        SetWindowPos(embedded, IntPtr.Zero, 0, ToolbarHeight, width, height, SWP_NOACTIVATE | SWP_SHOWWINDOW);
    }

    static void HideEmbedded()
    {
        if (embedded != IntPtr.Zero && IsWindow(embedded)) ShowWindow(embedded, SW_HIDE);
    }

    static string ClassName(IntPtr hWnd)
    {
        var text = new StringBuilder(128);
        GetClassName(hWnd, text, text.Capacity);
        return text.ToString();
    }

    static IntPtr FindWindowForProcess(int pid, string className)
    {
        IntPtr found = IntPtr.Zero;
        EnumWindows((hwnd, _) =>
        {
            GetWindowThreadProcessId(hwnd, out uint processId);
            if (processId != (uint)pid) return true;
            if (string.Equals(ClassName(hwnd), className, StringComparison.Ordinal)) { found = hwnd; return false; }
            return true;
        }, IntPtr.Zero);
        return found;
    }

    static UIntPtr ToUIntPtr(IntPtr value) => unchecked((UIntPtr)(ulong)value.ToInt64());
}