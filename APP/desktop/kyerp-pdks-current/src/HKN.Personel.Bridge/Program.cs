using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using KYERP.PDKS.Core;

internal static class Program
{
    static readonly string PersonelExe = PdksOptions.FromEnvironment().PersonelExecutable;
    static readonly string HedefExe = Path.Combine(Path.GetDirectoryName(PersonelExe) ?? AppContext.BaseDirectory, "Hedef.exe");

    const uint WM_CLOSE = 0x0010, WM_LBUTTONDOWN = 0x0201, WM_LBUTTONUP = 0x0202;
    const uint MK_LBUTTON = 0x0001;
    const uint WS_CHILD = 0x40000000, WS_VISIBLE = 0x10000000, WS_POPUP = 0x80000000;
    const uint WS_CAPTION = 0x00C00000, WS_THICKFRAME = 0x00040000, WS_SYSMENU = 0x00080000;
    const uint WS_MINIMIZEBOX = 0x00020000, WS_MAXIMIZEBOX = 0x00010000;
    const uint SS_BITMAP = 0x0000000E, STM_SETIMAGE = 0x0172, IMAGE_BITMAP = 0;
    const uint SWP_NOACTIVATE = 0x0010, SWP_SHOWWINDOW = 0x0040;
    const uint RDW_INVALIDATE = 0x0001, RDW_UPDATENOW = 0x0100, RDW_ALLCHILDREN = 0x0080;
    const uint SRCCOPY = 0x00CC0020;
    const int SW_HIDE = 0, SW_SHOW = 5, GWL_STYLE = -16;
    const int COLOR_BTNFACE = 15, TRANSPARENT = 1;
    const uint DT_CENTER = 0x00000001, DT_VCENTER = 0x00000004, DT_SINGLELINE = 0x00000020, DT_NOPREFIX = 0x00000800;

    const int ToolbarHeight = 58;
    const int PersonelIndex = 5;
    static readonly int[] Widths = { 53, 53, 53, 53, 53, 53, 53, 53, 53, 53, 58 };

    static IntPtr shellWindow, shellBitmap, shellMain, shellFont, statusLabel, embedded;
    static int shellWidth, opening;

    delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
    [StructLayout(LayoutKind.Sequential)] struct POINT { public int X, Y; }
    [StructLayout(LayoutKind.Sequential)] struct RECT { public int Left, Top, Right, Bottom; }

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
    [DllImport("user32.dll")] static extern bool GetCursorPos(out POINT point);
    [DllImport("user32.dll")] static extern short GetAsyncKeyState(int key);
    [DllImport("user32.dll")] static extern IntPtr SetParent(IntPtr child, IntPtr parent);
    [DllImport("user32.dll")] static extern IntPtr GetParent(IntPtr child);
    [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr hWnd, IntPtr after, int x, int y, int cx, int cy, uint flags);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern bool SetWindowText(IntPtr hWnd, string text);
    [DllImport("user32.dll")] static extern IntPtr GetWindowLongPtr(IntPtr hWnd, int index);
    [DllImport("user32.dll")] static extern IntPtr SetWindowLongPtr(IntPtr hWnd, int index, IntPtr value);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern IntPtr SendMessage(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern IntPtr CreateWindowEx(uint ex, string cls, string text, uint style, int x, int y, int w, int h, IntPtr parent, IntPtr menu, IntPtr instance, IntPtr param);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern IntPtr GetModuleHandle(string? name);
    [DllImport("user32.dll")] static extern IntPtr GetDC(IntPtr hWnd);
    [DllImport("user32.dll")] static extern int ReleaseDC(IntPtr hWnd, IntPtr hdc);
    [DllImport("user32.dll")] static extern bool FillRect(IntPtr hdc, ref RECT rect, IntPtr brush);
    [DllImport("user32.dll")] static extern IntPtr GetSysColorBrush(int index);
    [DllImport("user32.dll")] static extern int DrawText(IntPtr hdc, string text, int count, ref RECT rect, uint format);
    [DllImport("user32.dll")] static extern int SetBkMode(IntPtr hdc, int mode);
    [DllImport("user32.dll")] static extern uint SetTextColor(IntPtr hdc, uint color);
    [DllImport("user32.dll")] static extern IntPtr SelectObject(IntPtr hdc, IntPtr obj);
    [DllImport("user32.dll")] static extern bool RedrawWindow(IntPtr hWnd, IntPtr updateRect, IntPtr updateRgn, uint flags);
    [DllImport("gdi32.dll")] static extern IntPtr CreateCompatibleDC(IntPtr hdc);
    [DllImport("gdi32.dll")] static extern IntPtr CreateCompatibleBitmap(IntPtr hdc, int cx, int cy);
    [DllImport("gdi32.dll")] static extern bool DeleteDC(IntPtr hdc);
    [DllImport("gdi32.dll")] static extern bool DeleteObject(IntPtr obj);
    [DllImport("gdi32.dll")] static extern bool BitBlt(IntPtr dest, int x, int y, int cx, int cy, IntPtr src, int sx, int sy, uint rop);
    [DllImport("gdi32.dll", CharSet = CharSet.Unicode)] static extern IntPtr CreateFont(int h, int w, int esc, int ori, int weight, uint italic, uint underline, uint strike, uint charset, uint outPrecision, uint clipPrecision, uint quality, uint pitchAndFamily, string face);

    [STAThread]
    static void Main()
    {
        using var mutex = new Mutex(true, @"Local\HKN.Hedef500.Personel.Bridge", out bool first);
        if (!first) return;

        EnsureHedefRunning();
        new Thread(NativeWatcher) { IsBackground = true }.Start();
        new Thread(ShellLoop) { IsBackground = true }.Start();
        new Thread(ClickLoop) { IsBackground = true }.Start();
        while (true) Thread.Sleep(1000);
    }

    static void EnsureHedefRunning()
    {
        try
        {
            if (Process.GetProcessesByName("Hedef").Length > 0) return;
            if (!File.Exists(HedefExe)) return;
            Process.Start(new ProcessStartInfo(HedefExe)
            {
                UseShellExecute = true,
                WorkingDirectory = Path.GetDirectoryName(HedefExe)!
            });
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
                    EnsureToolbarMirror(main);
                    EnsureStatusBrand(main);
                    ResizeEmbedded(main);
                }
            }
            catch { }
            Thread.Sleep(350);
        }
    }

    static void EnsureToolbarMirror(IntPtr main)
    {
        if (!GetClientRect(main, out var client)) return;
        int width = Math.Max(700, client.Right);
        bool recreate = shellWindow == IntPtr.Zero || !IsWindow(shellWindow) || shellMain != main;
        bool resize = !recreate && shellWidth != width;

        if (recreate)
        {
            shellMain = main;
            shellWidth = width;
            BuildToolbarBitmap(main, width);
            shellWindow = CreateWindowEx(
                0, "STATIC", "", WS_CHILD | WS_VISIBLE | SS_BITMAP,
                0, 0, width, ToolbarHeight, main, IntPtr.Zero, GetModuleHandle(null), IntPtr.Zero);
            if (shellWindow != IntPtr.Zero && shellBitmap != IntPtr.Zero)
                SendMessage(shellWindow, STM_SETIMAGE, new IntPtr(IMAGE_BITMAP), shellBitmap);
        }
        else if (resize)
        {
            shellWidth = width;
            ShowWindow(shellWindow, SW_HIDE);
            BuildToolbarBitmap(main, width);
            if (shellBitmap != IntPtr.Zero)
                SendMessage(shellWindow, STM_SETIMAGE, new IntPtr(IMAGE_BITMAP), shellBitmap);
        }

        if (shellWindow != IntPtr.Zero)
        {
            SetWindowPos(shellWindow, IntPtr.Zero, 0, 0, width, ToolbarHeight, SWP_NOACTIVATE | SWP_SHOWWINDOW);
            ShowWindow(shellWindow, SW_SHOW);
        }
    }

    static void BuildToolbarBitmap(IntPtr main, int width)
    {
        RedrawWindow(main, IntPtr.Zero, IntPtr.Zero, RDW_INVALIDATE | RDW_UPDATENOW | RDW_ALLCHILDREN);
        Thread.Sleep(50);

        var source = GetDC(main);
        if (source == IntPtr.Zero) return;
        var memory = CreateCompatibleDC(source);
        var bitmap = CreateCompatibleBitmap(source, width, ToolbarHeight);
        if (memory != IntPtr.Zero && bitmap != IntPtr.Zero)
        {
            var old = SelectObject(memory, bitmap);
            BitBlt(memory, 0, 0, width, ToolbarHeight, source, 0, 0, SRCCOPY);
            DrawActivePersonel(memory);
            SelectObject(memory, old);

            if (shellBitmap != IntPtr.Zero) DeleteObject(shellBitmap);
            shellBitmap = bitmap;
        }
        else if (bitmap != IntPtr.Zero)
        {
            DeleteObject(bitmap);
        }

        if (memory != IntPtr.Zero) DeleteDC(memory);
        ReleaseDC(main, source);
    }

    static void DrawActivePersonel(IntPtr hdc)
    {
        int left = 0;
        for (int i = 0; i < PersonelIndex; i++) left += Widths[i];
        int right = left + Widths[PersonelIndex];

        var textRect = new RECT { Left = left + 1, Top = 28, Right = right - 1, Bottom = ToolbarHeight - 1 };
        FillRect(hdc, ref textRect, GetSysColorBrush(COLOR_BTNFACE));

        if (shellFont == IntPtr.Zero)
            shellFont = CreateFont(-11, 0, 0, 0, 700, 0, 0, 0, 1, 0, 0, 5, 0, "Tahoma");

        var oldFont = shellFont != IntPtr.Zero ? SelectObject(hdc, shellFont) : IntPtr.Zero;
        SetBkMode(hdc, TRANSPARENT);
        SetTextColor(hdc, Rgb(0, 0, 180));
        DrawText(hdc, "Personel", -1, ref textRect, DT_CENTER | DT_VCENTER | DT_SINGLELINE | DT_NOPREFIX);
        if (oldFont != IntPtr.Zero) SelectObject(hdc, oldFont);
    }

    static void ClickLoop()
    {
        bool wasDown = false;
        while (true)
        {
            try
            {
                bool down = (GetAsyncKeyState(0x01) & 0x8000) != 0;
                if (down && !wasDown && shellWindow != IntPtr.Zero && IsWindow(shellWindow)
                    && GetCursorPos(out var point) && GetWindowRect(shellWindow, out var rect)
                    && point.X >= rect.Left && point.X < rect.Right && point.Y >= rect.Top && point.Y < rect.Bottom)
                {
                    int x = point.X - rect.Left;
                    int index = HitTestButton(x);
                    if (index == PersonelIndex) OpenPersonel();
                    else if (index >= 0) ForwardLegacyToolbarClick(x, point.Y - rect.Top);
                }
                wasDown = down;
            }
            catch { }
            Thread.Sleep(40);
        }
    }

    static int HitTestButton(int x)
    {
        int cursor = 0;
        for (int i = 0; i < Widths.Length; i++)
        {
            if (x >= cursor && x < cursor + Widths[i]) return i;
            cursor += Widths[i];
        }
        return -1;
    }

    static void ForwardLegacyToolbarClick(int x, int y)
    {
        var process = Process.GetProcessesByName("Hedef").FirstOrDefault();
        if (process is null) return;
        var main = FindWindowForProcess(process.Id, "TAnaf");
        if (main == IntPtr.Zero) return;

        HideEmbedded();
        if (shellWindow != IntPtr.Zero && IsWindow(shellWindow)) ShowWindow(shellWindow, SW_HIDE);
        SetForegroundWindow(main);
        Thread.Sleep(30);

        var lParam = MakeLParam(x, Math.Clamp(y, 1, ToolbarHeight - 2));
        PostMessage(main, WM_LBUTTONDOWN, new IntPtr(MK_LBUTTON), lParam);
        PostMessage(main, WM_LBUTTONUP, IntPtr.Zero, lParam);
        Thread.Sleep(80);

        if (shellWindow != IntPtr.Zero && IsWindow(shellWindow))
            SetWindowPos(shellWindow, IntPtr.Zero, 0, 0, shellWidth, ToolbarHeight, SWP_NOACTIVATE | SWP_SHOWWINDOW);
    }

    static IntPtr MakeLParam(int x, int y) => new((y << 16) | (x & 0xFFFF));
    static uint Rgb(byte r, byte g, byte b) => (uint)(r | (g << 8) | (b << 16));

    static void EnsureStatusBrand(IntPtr main)
    {
        IntPtr status = IntPtr.Zero;
        EnumChildWindows(main, (child, _) =>
        {
            if (GetParent(child) == main && ClassName(child) == "TStatusBar")
            {
                status = child;
                return false;
            }
            return true;
        }, IntPtr.Zero);

        if (status == IntPtr.Zero || !GetClientRect(status, out var rect)) return;
        if (statusLabel == IntPtr.Zero || !IsWindow(statusLabel))
            statusLabel = CreateWindowEx(
                0, "STATIC", "www.kyerp.net", WS_CHILD | WS_VISIBLE | 0x00000001,
                Math.Max(0, (rect.Right - 180) / 2), 2, 180, 17,
                status, IntPtr.Zero, GetModuleHandle(null), IntPtr.Zero);

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
                p = Process.Start(new ProcessStartInfo(PersonelExe)
                {
                    UseShellExecute = true,
                    WorkingDirectory = Path.GetDirectoryName(PersonelExe)!
                });
                if (p is null) return;
                for (int i = 0; i < 60 && p.MainWindowHandle == IntPtr.Zero; i++)
                {
                    Thread.Sleep(100);
                    p.Refresh();
                }
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
        finally
        {
            Thread.Sleep(150);
            Interlocked.Exchange(ref opening, 0);
        }
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
            if (string.Equals(ClassName(hwnd), className, StringComparison.Ordinal))
            {
                found = hwnd;
                return false;
            }
            return true;
        }, IntPtr.Zero);
        return found;
    }
}