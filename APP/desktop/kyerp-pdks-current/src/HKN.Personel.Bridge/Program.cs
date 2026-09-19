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
    const uint SWP_NOACTIVATE = 0x0010, SWP_SHOWWINDOW = 0x0040;
    const int SW_SHOW = 5, GWL_STYLE = -16;

    const uint TB_SETBUTTONINFOW = 0x0440;
    const uint TBIF_TEXT = 0x00000002, TBIF_STATE = 0x00000004, TBIF_BYINDEX = 0x80000000;
    const byte TBSTATE_ENABLED = 0x04;
    const int PersonelButtonIndex = 5;

    const uint PROCESS_VM_OPERATION = 0x0008, PROCESS_VM_READ = 0x0010, PROCESS_VM_WRITE = 0x0020, PROCESS_QUERY_INFORMATION = 0x0400;
    const uint MEM_COMMIT_RESERVE = 0x3000, MEM_RELEASE = 0x8000, PAGE_READWRITE = 0x04;

    static IntPtr statusLabel, embedded, lastToolbar;
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
                    EnsureNativePersonelButton(main);
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
                if (down && !wasDown)
                {
                    var toolbar = lastToolbar;
                    if (toolbar != IntPtr.Zero && IsWindow(toolbar)
                        && GetWindowRect(toolbar, out var rect) && GetCursorPos(out var point))
                    {
                        uint dpi = GetDpiForWindow(toolbar);
                        if (dpi == 0) dpi = 96;
                        int buttonWidth = Math.Max(50, (int)Math.Round(64 * (dpi / 96.0)));
                        int buttonHeight = Math.Max(45, (int)Math.Round(60 * (dpi / 96.0)));
                        int left = rect.Left + PersonelButtonIndex * buttonWidth;
                        int right = left + buttonWidth;
                        int bottom = Math.Min(rect.Bottom, rect.Top + buttonHeight);

                        if (point.X >= left && point.X < right && point.Y >= rect.Top && point.Y < bottom)
                            OpenPersonel();
                    }
                }
                wasDown = down;
            }
            catch { }
            Thread.Sleep(40);
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
            var textBytes = Encoding.Unicode.GetBytes(text + "\0");
            if (!WriteProcessMemory(process, remoteText, textBytes, new UIntPtr((uint)textBytes.Length), out _)) return false;

            // Hedef.exe 32-bit Delphi uygulamasıdır; 32-bit TBBUTTONINFO yapısı 32 byte'tır.
            var info = new byte[32];
            BitConverter.GetBytes((uint)32).CopyTo(info, 0);
            BitConverter.GetBytes(TBIF_BYINDEX | TBIF_TEXT | TBIF_STATE).CopyTo(info, 4);
            info[16] = TBSTATE_ENABLED;
            BitConverter.GetBytes(unchecked((int)remoteText.ToInt64())).CopyTo(info, 24);
            BitConverter.GetBytes(text.Length).CopyTo(info, 28);

            if (!WriteProcessMemory(process, remote, info, new UIntPtr((uint)info.Length), out _)) return false;
            var result = SendMessage(toolbar, TB_SETBUTTONINFOW, new IntPtr(index), remote);
            return result != IntPtr.Zero;
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