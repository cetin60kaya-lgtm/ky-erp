using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using KYERP.PDKS.Core;

internal static class Program
{
    static readonly string PersonelExe = PdksOptions.FromEnvironment().PersonelExecutable;
    static readonly string HedefExe = Path.Combine(Path.GetDirectoryName(PersonelExe) ?? AppContext.BaseDirectory, "Hedef.exe");

    const uint WM_CLOSE = 0x0010;
    const uint WS_CHILD = 0x40000000, WS_VISIBLE = 0x10000000, WS_POPUP = 0x80000000;
    const uint WS_CAPTION = 0x00C00000, WS_THICKFRAME = 0x00040000, WS_SYSMENU = 0x00080000;
    const uint WS_MINIMIZEBOX = 0x00020000, WS_MAXIMIZEBOX = 0x00010000;
    const uint SS_BITMAP = 0x0000000E, STM_SETIMAGE = 0x0172, IMAGE_BITMAP = 0;
    const uint SWP_NOACTIVATE = 0x0010, SWP_SHOWWINDOW = 0x0040;
    const uint SRCCOPY = 0x00CC0020;
    const int SW_HIDE = 0, SW_SHOW = 5, GWL_STYLE = -16;
    const int COLOR_BTNFACE = 15, TRANSPARENT = 1;
    const uint DT_CENTER = 0x00000001, DT_VCENTER = 0x00000004, DT_SINGLELINE = 0x00000020, DT_NOPREFIX = 0x00000800;

    const int PersonelIndex = 5;

    static IntPtr personelOverlay, personelBitmap, toolbarHandle, overlayFont, statusLabel, embedded;
    static int overlayX, overlayWidth, overlayHeight, opening;

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
    [DllImport("user32.dll")] static extern bool DestroyWindow(IntPtr hWnd);
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
    [DllImport("user32.dll")] static extern uint GetDpiForWindow(IntPtr hWnd);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern IntPtr GetModuleHandle(string? name);
    [DllImport("user32.dll")] static extern IntPtr GetDC(IntPtr hWnd);
    [DllImport("user32.dll")] static extern int ReleaseDC(IntPtr hWnd, IntPtr hdc);
    [DllImport("user32.dll")] static extern bool FillRect(IntPtr hdc, ref RECT rect, IntPtr brush);
    [DllImport("user32.dll")] static extern IntPtr GetSysColorBrush(int index);
    [DllImport("user32.dll")] static extern int DrawText(IntPtr hdc, string text, int count, ref RECT rect, uint format);
    [DllImport("user32.dll")] static extern int SetBkMode(IntPtr hdc, int mode);
    [DllImport("user32.dll")] static extern uint SetTextColor(IntPtr hdc, uint color);
    [DllImport("user32.dll")] static extern IntPtr SelectObject(IntPtr hdc, IntPtr obj);
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
                    EnsurePersonelInNativeToolbar(main);
                    EnsureStatusBrand(main);
                    ResizeEmbedded(main);
                }
            }
            catch { }
            Thread.Sleep(350);
        }
    }

    static void EnsurePersonelInNativeToolbar(IntPtr main)
    {
        var toolbar = FindDescendant(main, "TToolBar");
        if (toolbar == IntPtr.Zero || !GetClientRect(toolbar, out var client)) return;

        uint dpi = GetDpiForWindow(toolbar);
        if (dpi == 0) dpi = 96;
        double scale = dpi / 96.0;

        int width = Math.Max(50, (int)Math.Round(64 * scale));
        int x = PersonelIndex * width;
        int height = Math.Max(45, Math.Min(client.Bottom, (int)Math.Round(60 * scale)));

        bool recreate = personelOverlay == IntPtr.Zero || !IsWindow(personelOverlay)
                        || toolbarHandle != toolbar || overlayX != x
                        || overlayWidth != width || overlayHeight != height;

        if (recreate)
        {
            if (personelOverlay != IntPtr.Zero && IsWindow(personelOverlay)) DestroyWindow(personelOverlay);
            if (personelBitmap != IntPtr.Zero) { DeleteObject(personelBitmap); personelBitmap = IntPtr.Zero; }

            toolbarHandle = toolbar;
            overlayX = x;
            overlayWidth = width;
            overlayHeight = height;

            BuildPersonelBitmap(toolbar, x, width, height, dpi);
            personelOverlay = CreateWindowEx(
                0, "STATIC", "", WS_CHILD | WS_VISIBLE | SS_BITMAP,
                x, 0, width, height, toolbar, IntPtr.Zero, GetModuleHandle(null), IntPtr.Zero);

            if (personelOverlay != IntPtr.Zero && personelBitmap != IntPtr.Zero)
                SendMessage(personelOverlay, STM_SETIMAGE, new IntPtr(IMAGE_BITMAP), personelBitmap);
        }

        if (personelOverlay != IntPtr.Zero)
            SetWindowPos(personelOverlay, IntPtr.Zero, x, 0, width, height, SWP_NOACTIVATE | SWP_SHOWWINDOW);
    }

    static void BuildPersonelBitmap(IntPtr toolbar, int x, int width, int height, uint dpi)
    {
        var source = GetDC(toolbar);
        if (source == IntPtr.Zero) return;
        var memory = CreateCompatibleDC(source);
        var bitmap = CreateCompatibleBitmap(source, width, height);

        if (memory != IntPtr.Zero && bitmap != IntPtr.Zero)
        {
            var old = SelectObject(memory, bitmap);
            BitBlt(memory, 0, 0, width, height, source, x, 0, SRCCOPY);

            int textTop = Math.Max(24, (int)Math.Round(34 * (dpi / 96.0)));
            var textRect = new RECT { Left = 1, Top = textTop, Right = width - 1, Bottom = height - 1 };
            FillRect(memory, ref textRect, GetSysColorBrush(COLOR_BTNFACE));

            int fontHeight = -Math.Max(9, (int)Math.Round(9 * (dpi / 96.0)));
            if (overlayFont != IntPtr.Zero) DeleteObject(overlayFont);
            overlayFont = CreateFont(fontHeight, 0, 0, 0, 700, 0, 0, 0, 1, 0, 0, 5, 0, "Tahoma");
            var oldFont = overlayFont != IntPtr.Zero ? SelectObject(memory, overlayFont) : IntPtr.Zero;
            SetBkMode(memory, TRANSPARENT);
            SetTextColor(memory, Rgb(0, 0, 180));
            DrawText(memory, "Personel", -1, ref textRect, DT_CENTER | DT_VCENTER | DT_SINGLELINE | DT_NOPREFIX);
            if (oldFont != IntPtr.Zero) SelectObject(memory, oldFont);

            SelectObject(memory, old);
            personelBitmap = bitmap;
        }
        else if (bitmap != IntPtr.Zero)
        {
            DeleteObject(bitmap);
        }

        if (memory != IntPtr.Zero) DeleteDC(memory);
        ReleaseDC(toolbar, source);
    }

    static void ClickLoop()
    {
        bool wasDown = false;
        while (true)
        {
            try
            {
                bool down = (GetAsyncKeyState(0x01) & 0x8000) != 0;
                if (down && !wasDown && personelOverlay != IntPtr.Zero && IsWindow(personelOverlay)
                    && GetCursorPos(out var point) && GetWindowRect(personelOverlay, out var rect)
                    && point.X >= rect.Left && point.X < rect.Right
                    && point.Y >= rect.Top && point.Y < rect.Bottom)
                {
                    OpenPersonel();
                }
                wasDown = down;
            }
            catch { }
            Thread.Sleep(40);
        }
    }

    static void EnsureStatusBrand(IntPtr main)
    {
        var status = FindDescendant(main, "TStatusBar");
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

        int top = 0;
        var coolBar = FindDescendant(main, "TCoolBar");
        if (coolBar != IntPtr.Zero && GetWindowRect(coolBar, out var barRect) && GetWindowRect(main, out var mainRect))
            top = Math.Max(0, barRect.Bottom - mainRect.Top);
        if (top <= 0) top = 80;

        int statusHeight = 22;
        int width = Math.Max(600, client.Right);
        int height = Math.Max(300, client.Bottom - top - statusHeight);
        SetWindowPos(embedded, IntPtr.Zero, 0, top, width, height, SWP_NOACTIVATE | SWP_SHOWWINDOW);
    }

    static string ClassName(IntPtr hWnd)
    {
        var text = new StringBuilder(128);
        GetClassName(hWnd, text, text.Capacity);
        return text.ToString();
    }

    static IntPtr FindDescendant(IntPtr parent, string className)
    {
        IntPtr found = IntPtr.Zero;
        EnumChildWindows(parent, (child, _) =>
        {
            if (string.Equals(ClassName(child), className, StringComparison.Ordinal))
            {
                found = child;
                return false;
            }
            return true;
        }, IntPtr.Zero);
        return found;
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

    static uint Rgb(byte r, byte g, byte b) => (uint)(r | (g << 8) | (b << 16));
}