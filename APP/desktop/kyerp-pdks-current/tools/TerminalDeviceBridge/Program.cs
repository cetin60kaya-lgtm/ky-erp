using System;
using System.Globalization;
using System.Windows.Forms;

public sealed class ClockHost : AxHost
{
    public ClockHost() : base("{87733EE1-D095-442B-A200-6DE90C5C8318}") { }
    public object Clock { get { return GetOcx(); } }
}

internal static class Program
{
    [STAThread]
    private static int Main(string[] args)
    {
        var mode = args.Length > 0 ? args[0].ToLowerInvariant() : "status";
        var ip = args.Length > 1 ? args[1] : "192.168.1.224";
        var port = args.Length > 2 ? int.Parse(args[2], CultureInfo.InvariantCulture) : 5005;
        var machine = args.Length > 3 ? int.Parse(args[3], CultureInfo.InvariantCulture) : 1;
        Application.EnableVisualStyles();
        using (var form = HiddenForm())
        using (var host = new ClockHost())
        {
            host.Dock = DockStyle.Fill;
            form.Controls.Add(host);
            form.Show();
            Application.DoEvents();
            dynamic clock = host.Clock;
            if (clock == null) return Fail("FP_CLOCK ActiveX başlatılamadı.");
            try
            {
                string endpoint = ip;
                if (!clock.SetIPAddress(ref endpoint, port, 0)) return Fail("Cihaz IP/port ayarı kabul edilmedi.");
                if (!clock.OpenCommPort(machine)) return Fail("Kart cihazına bağlantı açılamadı.");
                try
                {
                    clock.ReadMark = false;
                    int year = 0, month = 0, day = 0, hour = 0, minute = 0, second = 0;
                    bool timeOk = clock.GetDeviceTime(machine, ref year, ref month, ref day, ref hour, ref minute, ref second);
                    int users = Status(clock, machine, 2);
                    int newLogs = Status(clock, machine, 6);
                    int cards = Status(clock, machine, 7);
                    var deviceTime = timeOk
                        ? new DateTime(year, month, day, hour, minute, second).ToString("s", CultureInfo.InvariantCulture)
                        : "";
                    Console.WriteLine("STATUS|OK|" + deviceTime + "|" + newLogs + "|" + users + "|" + cards);
                    if (mode == "read") ReadNew(clock, machine, newLogs);
                    return 0;
                }
                finally { try { clock.CloseCommPort(); } catch { } }
            }
            catch (Exception ex) { return Fail(ex.GetBaseException().Message); }
        }
    }
    private static void ReadNew(dynamic clock, int machine, int announced)
    {
        var count = 0;
        if (announced > 0 && clock.ReadGeneralLogData(machine))
        {
            while (true)
            {
                int terminal = 0, enroll = 0, enrollMachine = 0, verify = 0, inout = 0, evt = 0;
                int year = 0, month = 0, day = 0, hour = 0, minute = 0, second = 0;
                bool ok = clock.GetGeneralLogDataWithSecond(
                    machine, ref terminal, ref enroll, ref enrollMachine, ref verify, ref inout, ref evt,
                    ref year, ref month, ref day, ref hour, ref minute, ref second);
                if (!ok) break;
                DateTime at;
                try { at = new DateTime(year, month, day, hour, minute, second); }
                catch { continue; }
                Console.WriteLine("LOG|" + enroll.ToString("00000", CultureInfo.InvariantCulture) + "|" +
                    at.ToString("s", CultureInfo.InvariantCulture) + "|" + inout + "|" + verify + "|" + evt + "|" + terminal);
                count++;
            }
        }
        Console.WriteLine("END|" + count);
    }

    private static int Status(dynamic clock, int machine, int code)
    {
        int value = 0;
        try { return clock.GetDeviceStatus(machine, code, ref value) ? value : -1; }
        catch { return -1; }
    }
    private static Form HiddenForm()
    {
        return new Form
        {
            ShowInTaskbar = false,
            StartPosition = FormStartPosition.Manual,
            Left = -2000,
            Top = -2000,
            Width = 32,
            Height = 32,
            FormBorderStyle = FormBorderStyle.FixedToolWindow
        };
    }

    private static int Fail(string message)
    {
        Console.WriteLine("STATUS|ERROR|" + (message ?? "Bilinmeyen hata").Replace("|", "/").Replace("\r", " ").Replace("\n", " "));
        return 2;
    }
}
