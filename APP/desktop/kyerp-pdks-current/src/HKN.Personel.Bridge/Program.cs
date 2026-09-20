using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using KYERP.PDKS.Core;

internal static class Program
{
    static readonly string PersonelExe = ResolvePersonelExecutable();
    static readonly string HedefExe = ResolveHedefExecutable();

    const uint WM_CLOSE = 0x0010, WM_LBUTTONDOWN = 0x0201, WM_LBUTTONUP = 0x0202, STM_SETIMAGE = 0x0172;
    const uint WS_CHILD = 0x40000000, WS_VISIBLE = 0x10000000, WS_POPUP = 0x80000000;
    const uint WS_CAPTION = 0x00C00000, WS_THICKFRAME = 0x00040000, WS_SYSMENU = 0x00080000;
    const uint WS_MINIMIZEBOX = 0x00020000, WS_MAXIMIZEBOX = 0x00010000;
    const uint SWP_NOACTIVATE = 0x0010, SWP_SHOWWINDOW = 0x0040;
    const uint SS_BITMAP = 0x0000000E, SRCCOPY = 0x00CC0020;
    const int IMAGE_BITMAP = 0, DEFAULT_GUI_FONT = 17, TRANSPARENT = 1;
    const uint DT_CENTER = 0x00000001, DT_VCENTER = 0x00000004, DT_SINGLELINE = 0x00000020;
    const int SW_HIDE = 0, SW_SHOW = 5, GWL_STYLE = -16;
    const uint MF_BYPOSITION = 0x00000400, MF_STRING = 0x00000000, MF_POPUP = 0x00000010;

    const uint TB_SETBUTTONINFOA = 0x0442;
    const uint TBIF_TEXT = 0x00000002, TBIF_STATE = 0x00000004, TBIF_BYINDEX = 0x80000000;
    const byte TBSTATE_ENABLED = 0x04;
    const int PersonelButtonIndex = 5;

    const uint PROCESS_VM_OPERATION = 0x0008, PROCESS_VM_READ = 0x0010, PROCESS_VM_WRITE = 0x0020, PROCESS_QUERY_INFORMATION = 0x0400;
    const uint MEM_COMMIT_RESERVE = 0x3000, MEM_RELEASE = 0x8000, PAGE_READWRITE = 0x04;

    static IntPtr statusLabel, embedded, lastToolbar, toolbarSkin, toolbarSkinBitmap;
    static int toolbarOffsetX, toolbarOffsetY, toolbarButtonWidth, toolbarButtonHeight;
    static DateTime lastToolbarPatch = DateTime.MinValue;
    static int opening;

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
    [DllImport("user32.dll")] static extern uint GetDpiForWindow(IntPtr hWnd);
    [DllImport("user32.dll")] static extern IntPtr SetParent(IntPtr child, IntPtr parent);
    [DllImport("user32.dll")] static extern IntPtr GetParent(IntPtr child);
    [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr hWnd, IntPtr after, int x, int y, int cx, int cy, uint flags);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern bool SetWindowText(IntPtr hWnd, string text);
    [DllImport("user32.dll")] static extern IntPtr GetWindowLongPtr(IntPtr hWnd, int index);
    [DllImport("user32.dll")] static extern IntPtr SetWindowLongPtr(IntPtr hWnd, int index, IntPtr value);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern IntPtr CreateWindowEx(uint ex, string cls, string text, uint style, int x, int y, int w, int h, IntPtr parent, IntPtr menu, IntPtr instance, IntPtr param);
    [DllImport("user32.dll")] static extern bool InvalidateRect(IntPtr hWnd, IntPtr rect, bool erase);
    [DllImport("user32.dll")] static extern bool UpdateWindow(IntPtr hWnd);
    [DllImport("user32.dll")] static extern IntPtr GetDC(IntPtr hWnd);
    [DllImport("user32.dll")] static extern int ReleaseDC(IntPtr hWnd, IntPtr hDC);
    [DllImport("gdi32.dll")] static extern IntPtr CreateCompatibleDC(IntPtr hdc);
    [DllImport("gdi32.dll")] static extern IntPtr CreateCompatibleBitmap(IntPtr hdc, int cx, int cy);
    [DllImport("gdi32.dll")] static extern IntPtr SelectObject(IntPtr hdc, IntPtr obj);
    [DllImport("gdi32.dll")] static extern bool DeleteDC(IntPtr hdc);
    [DllImport("gdi32.dll")] static extern bool DeleteObject(IntPtr obj);
    [DllImport("gdi32.dll")] static extern bool BitBlt(IntPtr dst, int x, int y, int cx, int cy, IntPtr src, int sx, int sy, uint rop);
    [DllImport("gdi32.dll")] static extern uint SetTextColor(IntPtr hdc, uint color);
    [DllImport("gdi32.dll")] static extern int SetBkMode(IntPtr hdc, int mode);
    [DllImport("gdi32.dll")] static extern IntPtr GetStockObject(int obj);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int DrawText(IntPtr hdc, string text, int count, ref RECT rect, uint format);
    [DllImport("user32.dll")] static extern IntPtr GetMenu(IntPtr hWnd);
    [DllImport("user32.dll")] static extern int GetMenuItemCount(IntPtr hMenu);
    [DllImport("user32.dll")] static extern IntPtr GetSubMenu(IntPtr hMenu, int nPos);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetMenuString(IntPtr hMenu, uint uIDItem, StringBuilder lpString, int cchMax, uint flags);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern bool ModifyMenu(IntPtr hMenu, uint uPosition, uint uFlags, UIntPtr uIDNewItem, string lpNewItem);
    [DllImport("user32.dll")] static extern bool DeleteMenu(IntPtr hMenu, uint uPosition, uint uFlags);
    [DllImport("user32.dll")] static extern bool DrawMenuBar(IntPtr hWnd);
    [DllImport("user32.dll")] static extern IntPtr SendMessage(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern IntPtr GetModuleHandle(string? name);

    [DllImport("kernel32.dll")] static extern IntPtr OpenProcess(uint access, bool inheritHandle, uint processId);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
    [DllImport("kernel32.dll")] static extern IntPtr VirtualAllocEx(IntPtr process, IntPtr address, UIntPtr size, uint allocationType, uint protect);
    [DllImport("kernel32.dll")] static extern bool VirtualFreeEx(IntPtr process, IntPtr address, UIntPtr size, uint freeType);
    [DllImport("kernel32.dll")] static extern bool WriteProcessMemory(IntPtr process, IntPtr address, byte[] buffer, UIntPtr size, out UIntPtr written);

    [STAThread]
    static void Main()
    {
        using var mutex = new Mutex(true, @"Local\HKN.Hedef500.Personel.Bridge", out bool first);
        if (!first) return;

        EnsurePrimaryApplicationRunning();
        new Thread(NativeWatcher) { IsBackground = true }.Start();
        new Thread(ShellLoop) { IsBackground = true }.Start();
        new Thread(ClickLoop) { IsBackground = true }.Start();
        while (true) Thread.Sleep(1000);
    }

    static string ResolvePersonelExecutable()
    {
        var configured = PdksOptions.FromEnvironment().PersonelExecutable;
        var parent = Directory.GetParent(AppContext.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar))?.FullName;
        string?[] candidates =
        [
            configured,
            Path.Combine(AppContext.BaseDirectory, "HKN.Personel.Native.exe"),
            parent is null ? null : Path.Combine(parent, "HKN.Personel.Native.exe"),
            @"D:\Hedef500\Hedef500\HKN.Personel.Native.exe",
            @"C:\Hedef500\Hedef500\HKN.Personel.Native.exe"
        ];
        return candidates.FirstOrDefault(path => !string.IsNullOrWhiteSpace(path) && File.Exists(path)) ?? configured;
    }

    static string ResolveHedefExecutable()
    {
        var configured = Environment.GetEnvironmentVariable("KY_PDKS_HEDEF_EXE");
        var personelDir = Path.GetDirectoryName(PersonelExe);
        var parent = Directory.GetParent(AppContext.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar))?.FullName;
        string?[] candidates =
        [
            configured,
            personelDir is null ? null : Path.Combine(personelDir, "Hedef.exe"),
            Path.Combine(AppContext.BaseDirectory, "Hedef.exe"),
            parent is null ? null : Path.Combine(parent, "Hedef.exe"),
            @"D:\Hedef500\Hedef500\Hedef.exe",
            @"C:\Hedef500\Hedef500\Hedef.exe"
        ];
        return candidates.FirstOrDefault(path => !string.IsNullOrWhiteSpace(path) && File.Exists(path)) ?? string.Empty;
    }

    static void EnsurePrimaryApplicationRunning()
    {
        try
        {
            if (Process.GetProcessesByName("Hedef").Length > 0) return;
            if (!string.IsNullOrWhiteSpace(HedefExe) && File.Exists(HedefExe))
            {
                Process.Start(new ProcessStartInfo(HedefExe)
                {
                    UseShellExecute = true,
                    WorkingDirectory = Path.GetDirectoryName(HedefExe)!
                });
                return;
            }

            if (Process.GetProcessesByName("HKN.Personel.Native").Length == 0 && File.Exists(PersonelExe))
            {
                Process.Start(new ProcessStartInfo(PersonelExe)
                {
                    UseShellExecute = true,
                    WorkingDirectory = Path.GetDirectoryName(PersonelExe)!
                });
            }
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
                    var appWindow = FindWindowForProcess(process.Id, "TApplication");
                    if (appWindow != IntPtr.Zero) SetWindowText(appWindow, "KYERP PDKS");
                    CleanLegacyMenu(main);
                    EnsureClassicToolbar(main);
                    HideLegacyHome(main);
                    EnsureStatusBrand(main);
                    ResizeEmbedded(main);
                }
            }
            catch { }
            Thread.Sleep(350);
        }
    }

    static void ClickLoop()
    {
        bool wasDown = false;
        while (true)
        {
            try
            {
                bool down = (GetAsyncKeyState(0x01) & 0x8000) != 0;
                if (down && !wasDown && toolbarSkin != IntPtr.Zero && IsWindow(toolbarSkin)
                    && GetWindowRect(toolbarSkin, out var rect) && GetCursorPos(out var point))
                {
                    int relX = point.X - rect.Left - toolbarOffsetX;
                    int relY = point.Y - rect.Top - toolbarOffsetY;
                    if (toolbarButtonWidth > 0 && relX >= 0 && relY >= 0 && relY < toolbarButtonHeight)
                    {
                        int index = relX / toolbarButtonWidth;
                        if (index >= 0 && index <= 10)
                        {
                            if (index == PersonelButtonIndex) OpenPersonel();
                            else ForwardLegacyToolbarClick(index);
                        }
                    }
                }
                wasDown = down;
            }
            catch { }
            Thread.Sleep(40);
        }
    }

    static void HideLegacyHome(IntPtr main)
    {
        IntPtr largestPanel = IntPtr.Zero;
        long largestArea = 0;
        EnumChildWindows(main, (child, _) =>
        {
            if (ClassName(child) == "TPanel" && IsWindowVisible(child) && GetWindowRect(child, out var r))
            {
                long area = Math.Max(0, r.Right - r.Left) * (long)Math.Max(0, r.Bottom - r.Top);
                if (area > largestArea) { largestArea = area; largestPanel = child; }
            }
            return true;
        }, IntPtr.Zero);
        if (largestPanel != IntPtr.Zero) ShowWindow(largestPanel, SW_HIDE);
    }

    static void EnsureClassicToolbar(IntPtr main)
    {
        var coolBar = FindDescendant(main, "TCoolBar");
        var toolbar = FindDescendant(main, "TToolBar");
        if (coolBar == IntPtr.Zero || toolbar == IntPtr.Zero) return;
        lastToolbar = toolbar;
        if (!GetWindowRect(coolBar, out var cr) || !GetWindowRect(toolbar, out var tr)) return;
        int width = Math.Max(1, cr.Right - cr.Left), height = Math.Max(1, cr.Bottom - cr.Top);
        uint dpi = GetDpiForWindow(toolbar); if (dpi == 0) dpi = 96;
        toolbarButtonWidth = Math.Max(50, (int)Math.Round(64 * (dpi / 96.0)));
        toolbarButtonHeight = Math.Max(1, tr.Bottom - tr.Top);
        toolbarOffsetX = Math.Max(0, tr.Left - cr.Left);
        toolbarOffsetY = Math.Max(0, tr.Top - cr.Top);
        if (toolbarSkin == IntPtr.Zero || !IsWindow(toolbarSkin))
        {
            toolbarSkin = CreateWindowEx(0, "STATIC", string.Empty, WS_POPUP | WS_VISIBLE,
                0, 0, width, height, IntPtr.Zero, IntPtr.Zero, IntPtr.Zero, IntPtr.Zero);
            if (toolbarSkin != IntPtr.Zero)
            {
                SetParent(toolbarSkin, main);
                long skinStyle = GetWindowLongPtr(toolbarSkin, GWL_STYLE).ToInt64();
                skinStyle &= ~((long)WS_POPUP | WS_CAPTION | WS_THICKFRAME | WS_SYSMENU);
                skinStyle |= WS_CHILD | WS_VISIBLE;
                SetWindowLongPtr(toolbarSkin, GWL_STYLE, new IntPtr(skinStyle));
            }
        }
        if (toolbarSkin != IntPtr.Zero)
        {
            SetWindowPos(toolbarSkin, IntPtr.Zero, 0, 0, width, height, SWP_NOACTIVATE | SWP_SHOWWINDOW);
            PaintClassicToolbar(coolBar, toolbarSkin, width, height, dpi);
        }
    }

    static void PaintClassicToolbar(IntPtr coolBar, IntPtr skin, int width, int height, uint dpi)
    {
        IntPtr src = GetDC(coolBar), dst = GetDC(skin);
        if (src == IntPtr.Zero || dst == IntPtr.Zero)
        {
            if (src != IntPtr.Zero) ReleaseDC(coolBar, src);
            if (dst != IntPtr.Zero) ReleaseDC(skin, dst);
            return;
        }
        BitBlt(dst, 0, 0, width, height, src, 0, 0, SRCCOPY);
        int bw = toolbarButtonWidth, bh = toolbarButtonHeight;
        int sourceX = toolbarOffsetX + bw, destX = toolbarOffsetX + PersonelButtonIndex * bw;
        if (sourceX + bw <= width && destX + bw <= width)
        {
            BitBlt(dst, destX, toolbarOffsetY, bw, bh, src, sourceX, toolbarOffsetY, SRCCOPY);
            int textH = Math.Max(18, (int)Math.Round(20 * (dpi / 96.0)));
            int blankX = Math.Min(width - bw, toolbarOffsetX + 11 * bw + 8);
            if (blankX >= 0)
                BitBlt(dst, destX, toolbarOffsetY + bh - textH, bw, textH, src, blankX, toolbarOffsetY + bh - textH, SRCCOPY);
            IntPtr font = GetStockObject(DEFAULT_GUI_FONT), priorFont = SelectObject(dst, font);
            SetBkMode(dst, TRANSPARENT); SetTextColor(dst, 0x00CC3300);
            var rr = new RECT { Left = destX, Top = toolbarOffsetY + bh - textH, Right = destX + bw, Bottom = toolbarOffsetY + bh };
            DrawText(dst, "Personel", -1, ref rr, DT_CENTER | DT_VCENTER | DT_SINGLELINE);
            SelectObject(dst, priorFont);
        }
        ReleaseDC(coolBar, src); ReleaseDC(skin, dst);
    }

    static IntPtr CaptureClassicToolbar(IntPtr coolBar, int width, int height, uint dpi)
    {
        IntPtr src = GetDC(coolBar); if (src == IntPtr.Zero) return IntPtr.Zero;
        IntPtr mem = CreateCompatibleDC(src); if (mem == IntPtr.Zero) { ReleaseDC(coolBar, src); return IntPtr.Zero; }
        IntPtr bmp = CreateCompatibleBitmap(src, width, height); if (bmp == IntPtr.Zero) { DeleteDC(mem); ReleaseDC(coolBar, src); return IntPtr.Zero; }
        IntPtr old = SelectObject(mem, bmp);
        BitBlt(mem, 0, 0, width, height, src, 0, 0, SRCCOPY);
        int bw = toolbarButtonWidth, bh = toolbarButtonHeight;
        int sourceX = toolbarOffsetX + bw, destX = toolbarOffsetX + PersonelButtonIndex * bw;
        if (sourceX + bw <= width && destX + bw <= width)
        {
            BitBlt(mem, destX, toolbarOffsetY, bw, bh, mem, sourceX, toolbarOffsetY, SRCCOPY);
            int textH = Math.Max(18, (int)Math.Round(20 * (dpi / 96.0)));
            int blankX = Math.Min(width - bw, toolbarOffsetX + 11 * bw + 8);
            if (blankX >= 0)
                BitBlt(mem, destX, toolbarOffsetY + bh - textH, bw, textH, mem, blankX, toolbarOffsetY + bh - textH, SRCCOPY);
            IntPtr font = GetStockObject(DEFAULT_GUI_FONT), priorFont = SelectObject(mem, font);
            SetBkMode(mem, TRANSPARENT); SetTextColor(mem, 0x00CC3300);
            var rr = new RECT { Left = destX, Top = toolbarOffsetY + bh - textH, Right = destX + bw, Bottom = toolbarOffsetY + bh };
            DrawText(mem, "Personel", -1, ref rr, DT_CENTER | DT_VCENTER | DT_SINGLELINE);
            SelectObject(mem, priorFont);
        }
        SelectObject(mem, old); DeleteDC(mem); ReleaseDC(coolBar, src); return bmp;
    }

    static void ForwardLegacyToolbarClick(int index)
    {
        if (lastToolbar == IntPtr.Zero || !IsWindow(lastToolbar)) return;
        int x = index * toolbarButtonWidth + toolbarButtonWidth / 2;
        int y = Math.Max(1, toolbarButtonHeight / 2);
        var lp = new IntPtr((y << 16) | (x & 0xFFFF));
        PostMessage(lastToolbar, WM_LBUTTONDOWN, new IntPtr(1), lp);
        PostMessage(lastToolbar, WM_LBUTTONUP, IntPtr.Zero, lp);
    }

    static string MenuText(IntPtr menu, int position)
    {
        var buffer = new StringBuilder(256);
        GetMenuString(menu, (uint)position, buffer, buffer.Capacity, MF_BYPOSITION);
        return buffer.ToString();
    }

    static void CleanLegacyMenu(IntPtr main)
    {
        var menu = GetMenu(main); if (menu == IntPtr.Zero) return;
        string[] labels = ["Ayarlar", "Personel TanÄ±mlarÄ±", "Personel Ä°ÅŸlemleri", "Raporlar", "AraÃ§lar", "Terminal / Veri AktarÄ±mÄ±"];
        int count = GetMenuItemCount(menu);
        for (int i = 0; i < labels.Length && i < count; i++)
        {
            var sub = GetSubMenu(menu, i);
            if (sub != IntPtr.Zero)
                ModifyMenu(menu, (uint)i, MF_BYPOSITION | MF_POPUP | MF_STRING, (UIntPtr)(ulong)sub.ToInt64(), labels[i]);
        }
        if (GetMenuItemCount(menu) > labels.Length) DeleteMenu(menu, (uint)labels.Length, MF_BYPOSITION);
        DrawMenuBar(main);
    }

    static void CleanLegacySubMenu(IntPtr menu)
    {
        for (int i = GetMenuItemCount(menu) - 1; i >= 0; i--)
        {
            var text = MenuText(menu, i).Replace("&", string.Empty).Trim();
            if (text.Contains("Aktivasyon", StringComparison.OrdinalIgnoreCase) ||
                text.Contains("Lisans", StringComparison.OrdinalIgnoreCase) ||
                text.Contains("Hedef", StringComparison.OrdinalIgnoreCase) ||
                text.Contains("HakkÄ±nda", StringComparison.OrdinalIgnoreCase))
            {
                DeleteMenu(menu, (uint)i, MF_BYPOSITION);
                continue;
            }
            var sub = GetSubMenu(menu, i);
            if (sub != IntPtr.Zero) CleanLegacySubMenu(sub);
        }
    }

    static void EnsureNativePersonelButton(IntPtr main)
    {
        var toolbar = FindDescendant(main, "TToolBar");
        if (toolbar == IntPtr.Zero) return;
        var now = DateTime.UtcNow;
        if (toolbar == lastToolbar && (now - lastToolbarPatch).TotalSeconds < 1.5) return;

        if (PatchToolbarButton(toolbar, PersonelButtonIndex, "Personel"))
        {
            lastToolbar = toolbar;
            lastToolbarPatch = now;
            InvalidateRect(toolbar, IntPtr.Zero, true);
            UpdateWindow(toolbar);
        }
    }

    static bool PatchToolbarButton(IntPtr toolbar, int index, string text)
    {
        GetWindowThreadProcessId(toolbar, out uint targetPid);
        if (targetPid == 0) return false;

        uint access = PROCESS_QUERY_INFORMATION | PROCESS_VM_OPERATION | PROCESS_VM_READ | PROCESS_VM_WRITE;
        var process = OpenProcess(access, false, targetPid);
        if (process == IntPtr.Zero) return false;

        IntPtr remote = IntPtr.Zero;
        try
        {
            remote = VirtualAllocEx(process, IntPtr.Zero, new UIntPtr(256), MEM_COMMIT_RESERVE, PAGE_READWRITE);
            if (remote == IntPtr.Zero) return false;

            var remoteText = new IntPtr(remote.ToInt64() + 64);
            var textBytes = Encoding.ASCII.GetBytes(text + "\0");
            if (!WriteProcessMemory(process, remoteText, textBytes, new UIntPtr((uint)textBytes.Length), out _)) return false;

            var info = new byte[32];
            BitConverter.GetBytes((uint)32).CopyTo(info, 0);
            BitConverter.GetBytes(TBIF_BYINDEX | TBIF_TEXT | TBIF_STATE).CopyTo(info, 4);
            info[16] = TBSTATE_ENABLED;
            BitConverter.GetBytes(unchecked((int)remoteText.ToInt64())).CopyTo(info, 24);
            BitConverter.GetBytes(text.Length).CopyTo(info, 28);

            if (!WriteProcessMemory(process, remote, info, new UIntPtr((uint)info.Length), out _)) return false;
            return SendMessage(toolbar, TB_SETBUTTONINFOA, new IntPtr(index), remote) != IntPtr.Zero;
        }
        finally
        {
            if (remote != IntPtr.Zero) VirtualFreeEx(process, remote, UIntPtr.Zero, MEM_RELEASE);
            CloseHandle(process);
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
            if (hedef is null)
            {
                if (Process.GetProcessesByName("HKN.Personel.Native").Length == 0 && File.Exists(PersonelExe))
                    Process.Start(new ProcessStartInfo(PersonelExe) { UseShellExecute = true, WorkingDirectory = Path.GetDirectoryName(PersonelExe)! });
                return;
            }

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
        if (top <= 0) top = 130;

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
}

