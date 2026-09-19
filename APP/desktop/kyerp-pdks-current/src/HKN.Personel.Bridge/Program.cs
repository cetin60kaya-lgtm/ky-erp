using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using KYERP.PDKS.Core;

internal static class Program
{
    static readonly string PersonelExe = PdksOptions.FromEnvironment().PersonelExecutable;
    static readonly string HedefExe = Path.Combine(Path.GetDirectoryName(PersonelExe) ?? AppContext.BaseDirectory, "Hedef.exe");

    const uint WM_CLOSE = 0x0010, WM_COMMAND = 0x0111, WM_SETFONT = 0x0030;
    const uint WS_CHILD = 0x40000000, WS_VISIBLE = 0x10000000, WS_POPUP = 0x80000000;
    const uint WS_CAPTION = 0x00C00000, WS_THICKFRAME = 0x00040000, WS_SYSMENU = 0x00080000;
    const uint WS_MINIMIZEBOX = 0x00020000, WS_MAXIMIZEBOX = 0x00010000;
    const uint BS_FLAT = 0x00008000, SS_CENTER = 0x00000001, SS_WHITERECT = 0x00000006;
    const uint MF_BYPOSITION = 0x00000400, MF_POPUP = 0x00000010, MF_STRING = 0x00000000;
    const uint SWP_NOACTIVATE = 0x0010, SWP_SHOWWINDOW = 0x0040;
    const int GWL_STYLE = -16, SW_HIDE = 0, SW_SHOW = 5;

    static IntPtr shellBar, shellTitle, shellFont, statusLabel, embedded;
    static readonly Dictionary<IntPtr, string> shellButtons = new();
    static int opening;

    delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [StructLayout(LayoutKind.Sequential)]
    struct POINT { public int X, Y; }

    [StructLayout(LayoutKind.Sequential)]
    struct RECT { public int Left, Top, Right, Bottom; }

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
    [DllImport("gdi32.dll", CharSet = CharSet.Unicode)] static extern IntPtr CreateFont(int h, int w, int esc, int ori, int weight, uint italic, uint underline, uint strike, uint charset, uint outPrecision, uint clipPrecision, uint quality, uint pitchAndFamily, string face);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern IntPtr CreateWindowEx(uint ex, string cls, string text, uint style, int x, int y, int w, int h, IntPtr parent, IntPtr menu, IntPtr instance, IntPtr param);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern IntPtr GetModuleHandle(string? name);
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
                    RewriteTopMenu(main);
                    HideLegacyHeader(main);
                    EnsureShell(main);
                    EnsureStatusBrand(main);
                    ResizeEmbedded(main);
                }
            }
            catch { }
            Thread.Sleep(300);
        }
    }

    static void RewriteTopMenu(IntPtr main)
    {
        var menu = GetMenu(main);
        if (menu == IntPtr.Zero) return;

        string[] labels =
        {
            "Ayarlar",
            "Personel Tanımları",
            "Personel İşlemleri",
            "Raporlar",
            "Araçlar",
            "Terminal / Veri Aktarımı"
        };

        int count = GetMenuItemCount(menu);
        int renameCount = Math.Min(labels.Length, count);
        for (int i = 0; i < renameCount; i++)
        {
            var sub = GetSubMenu(menu, i);
            if (sub != IntPtr.Zero)
            {
                ModifyMenu(menu, (uint)i, MF_BYPOSITION | MF_POPUP, ToUIntPtr(sub), labels[i]);
            }
            else
            {
                uint id = GetMenuItemID(menu, i);
                ModifyMenu(menu, (uint)i, MF_BYPOSITION | MF_STRING, new UIntPtr(id), labels[i]);
            }
        }

        for (int i = count - 1; i >= labels.Length; i--)
            RemoveMenu(menu, (uint)i, MF_BYPOSITION);

        DrawMenuBar(main);
    }

    static void HideLegacyHeader(IntPtr main)
    {
        if (!GetWindowRect(main, out var mainRect)) return;

        EnumChildWindows(main, (child, _) =>
        {
            if (GetParent(child) != main) return true;
            if (child == shellBar) return true;

            var className = ClassName(child);
            if (className == "TStatusBar") return true;
            if (!GetWindowRect(child, out var rect)) return true;

            int top = rect.Top - mainRect.Top;
            int height = Math.Max(0, rect.Bottom - rect.Top);

            bool headerControl = top < 145 && height > 8 && height <= 125;
            bool knownToolbar = className.Contains("ToolBar", StringComparison.OrdinalIgnoreCase)
                                || className.Contains("CoolBar", StringComparison.OrdinalIgnoreCase)
                                || className.Contains("ControlBar", StringComparison.OrdinalIgnoreCase);

            if (headerControl || knownToolbar) ShowWindow(child, SW_HIDE);
            return true;
        }, IntPtr.Zero);
    }

    static void EnsureShell(IntPtr main)
    {
        if (!GetClientRect(main, out var client)) return;
        int width = Math.Max(900, client.Right - client.Left);

        if (shellBar == IntPtr.Zero || !IsWindow(shellBar))
        {
            shellBar = CreateWindowEx(
                0, "STATIC", "", WS_CHILD | WS_VISIBLE | SS_WHITERECT,
                0, 0, width, 78, main, IntPtr.Zero, GetModuleHandle(null), IntPtr.Zero);

            shellFont = CreateFont(16, 0, 0, 0, 600, 0, 0, 0, 1, 0, 0, 5, 0, "Segoe UI");

            shellTitle = CreateWindowEx(
                0, "STATIC", "KYERP PDKS", WS_CHILD | WS_VISIBLE,
                18, 12, 138, 22, shellBar, IntPtr.Zero, GetModuleHandle(null), IntPtr.Zero);
            ApplyFont(shellTitle);

            CreateShellButton("Personel", "PERSONEL", 170, 12, 112);
            CreateShellButton("Giriş / Çıkış", "GIRISCIKIS", 288, 12, 124);
            CreateShellButton("Puantaj", "PUANTAJ", 418, 12, 104);
            CreateShellButton("Bordro", "BORDRO", 528, 12, 98);
            CreateShellButton("Terminal", "TERMINAL", 632, 12, 104);
            CreateShellButton("Kullanıcılar", "KULLANICI", 742, 12, 116);
        }

        SetWindowPos(shellBar, IntPtr.Zero, 0, 0, width, 78, SWP_NOACTIVATE | SWP_SHOWWINDOW);
    }

    static void CreateShellButton(string text, string action, int x, int y, int width)
    {
        var button = CreateWindowEx(
            0, "BUTTON", text, WS_CHILD | WS_VISIBLE | BS_FLAT,
            x, y, width, 42, shellBar, IntPtr.Zero, GetModuleHandle(null), IntPtr.Zero);
        if (button == IntPtr.Zero) return;
        shellButtons[button] = action;
        ApplyFont(button);
    }

    static void ApplyFont(IntPtr handle)
    {
        if (handle != IntPtr.Zero && shellFont != IntPtr.Zero)
            SendMessage(handle, WM_SETFONT, shellFont, new IntPtr(1));
    }

    static void EnsureStatusBrand(IntPtr main)
    {
        IntPtr status = IntPtr.Zero;
        EnumChildWindows(main, (child, _) =>
        {
            if (GetParent(child) != main) return true;
            if (ClassName(child) == "TStatusBar")
            {
                status = child;
                return false;
            }
            return true;
        }, IntPtr.Zero);

        if (status == IntPtr.Zero) return;
        if (!GetClientRect(status, out var rect)) return;

        if (statusLabel == IntPtr.Zero || !IsWindow(statusLabel))
        {
            statusLabel = CreateWindowEx(
                0, "STATIC", "www.kyerp.net", WS_CHILD | WS_VISIBLE | SS_CENTER,
                Math.Max(0, (rect.Right - 180) / 2), 2, 180, 17,
                status, IntPtr.Zero, GetModuleHandle(null), IntPtr.Zero);
            ApplyFont(statusLabel);
        }

        SetWindowPos(statusLabel, IntPtr.Zero, Math.Max(0, (rect.Right - 180) / 2), 2, 180, 17, SWP_NOACTIVATE | SWP_SHOWWINDOW);
    }

    static void ClickLoop()
    {
        bool wasDown = false;
        while (true)
        {
            try
            {
                bool down = (GetAsyncKeyState(0x01) & 0x8000) != 0;
                if (down && !wasDown && GetCursorPos(out var point))
                {
                    foreach (var pair in shellButtons.ToArray())
                    {
                        if (!IsWindow(pair.Key) || !GetWindowRect(pair.Key, out var rect)) continue;
                        if (point.X < rect.Left || point.X >= rect.Right || point.Y < rect.Top || point.Y >= rect.Bottom) continue;
                        ExecuteShellAction(pair.Value);
                        break;
                    }
                }
                wasDown = down;
            }
            catch { }
            Thread.Sleep(40);
        }
    }

    static void ExecuteShellAction(string action)
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
            "GIRISCIKIS" => new[] { "giriş ve çıkış", "giriş-çıkış", "giriş çıkış" },
            "PUANTAJ" => new[] { "puantaj" },
            "BORDRO" => new[] { "bordro" },
            "TERMINAL" => new[] { "terminal veri transfer", "terminal", "veri aktar" },
            "KULLANICI" => new[] { "kullanıcı", "kullanici" },
            _ => Array.Empty<string>()
        };

        if (TryFindMenuCommand(GetMenu(main), targets, out uint commandId))
            PostMessage(main, WM_COMMAND, new IntPtr(unchecked((int)commandId)), IntPtr.Zero);
    }

    static bool TryFindMenuCommand(IntPtr menu, string[] targets, out uint commandId)
    {
        commandId = uint.MaxValue;
        if (menu == IntPtr.Zero || targets.Length == 0) return false;

        int count = GetMenuItemCount(menu);
        for (int i = 0; i < count; i++)
        {
            string text = MenuText(menu, i);
            string normalized = Normalize(text);

            var sub = GetSubMenu(menu, i);
            if (sub != IntPtr.Zero && TryFindMenuCommand(sub, targets, out commandId)) return true;

            uint id = GetMenuItemID(menu, i);
            if (id == uint.MaxValue) continue;

            foreach (var target in targets)
            {
                string candidate = Normalize(target);
                if (normalized.Contains(candidate, StringComparison.OrdinalIgnoreCase))
                {
                    commandId = id;
                    return true;
                }
            }
        }

        return false;
    }

    static string MenuText(IntPtr menu, int position)
    {
        var text = new StringBuilder(256);
        GetMenuString(menu, (uint)position, text, text.Capacity, MF_BYPOSITION);
        return text.ToString();
    }

    static string Normalize(string value)
    {
        return value.Trim().ToLowerInvariant()
            .Replace("&", "")
            .Replace('ı', 'i').Replace('İ', 'i')
            .Replace('ş', 's').Replace('Ş', 's')
            .Replace('ğ', 'g').Replace('Ğ', 'g')
            .Replace('ü', 'u').Replace('Ü', 'u')
            .Replace('ö', 'o').Replace('Ö', 'o')
            .Replace('ç', 'c').Replace('Ç', 'c');
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

            var process = Process.GetProcessesByName("HKN.Personel.Native").FirstOrDefault();
            if (process is null)
            {
                if (!File.Exists(PersonelExe)) return;
                process = Process.Start(new ProcessStartInfo(PersonelExe)
                {
                    UseShellExecute = true,
                    WorkingDirectory = Path.GetDirectoryName(PersonelExe)!
                });
                if (process is null) return;

                for (int i = 0; i < 60 && process.MainWindowHandle == IntPtr.Zero; i++)
                {
                    Thread.Sleep(100);
                    process.Refresh();
                }
            }

            process.Refresh();
            var form = process.MainWindowHandle;
            if (form == IntPtr.Zero) return;

            embedded = form;
            SetParent(form, main);

            long style = GetWindowLongPtr(form, GWL_STYLE).ToInt64();
            style &= ~((long)WS_POPUP | WS_CAPTION | WS_THICKFRAME | WS_SYSMENU | WS_MINIMIZEBOX | WS_MAXIMIZEBOX);
            style |= WS_CHILD | WS_VISIBLE;
            SetWindowLongPtr(form, GWL_STYLE, new IntPtr(style));

            ShowWindow(form, SW_SHOW);
            ResizeEmbedded(main);
            SetForegroundWindow(main);
        }
        catch { }
        finally
        {
            Thread.Sleep(150);
            Interlocked.Exchange(ref opening, 0);
        }
    }

    static void HideEmbedded()
    {
        if (embedded != IntPtr.Zero && IsWindow(embedded)) ShowWindow(embedded, SW_HIDE);
    }

    static void ResizeEmbedded(IntPtr main)
    {
        if (embedded == IntPtr.Zero || !IsWindow(embedded)) return;
        if (!GetClientRect(main, out var client)) return;

        int width = Math.Max(700, client.Right - client.Left);
        int height = Math.Max(450, client.Bottom - client.Top - 102);
        SetWindowPos(embedded, IntPtr.Zero, 0, 78, width, height, SWP_NOACTIVATE | SWP_SHOWWINDOW);
    }

    static IntPtr FindWindowForProcess(int processId, string className)
    {
        IntPtr found = IntPtr.Zero;
        EnumWindows((window, _) =>
        {
            GetWindowThreadProcessId(window, out uint owner);
            if (owner != (uint)processId) return true;
            if (!string.Equals(ClassName(window), className, StringComparison.Ordinal)) return true;
            found = window;
            return false;
        }, IntPtr.Zero);
        return found;
    }

    static string ClassName(IntPtr window)
    {
        var text = new StringBuilder(128);
        GetClassName(window, text, text.Capacity);
        return text.ToString();
    }

    static UIntPtr ToUIntPtr(IntPtr value)
    {
        return IntPtr.Size == 8
            ? new UIntPtr(unchecked((ulong)value.ToInt64()))
            : new UIntPtr(unchecked((uint)value.ToInt32()));
    }
}
