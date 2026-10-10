using System.Globalization;
using System.Windows.Forms;

// Read-only, 32-bit FP_CLOCK bridge based on the working legacy
// TerminalDeviceBridge. No enrollment, Delete*, Empty*, SetDeviceTime,
// EnableDevice, ReadMark assignment or terminal log acknowledgement.
internal sealed class ClockControl : AxHost
{
    internal ClockControl() : base("{87733EE1-D095-442B-A200-6DE90C5C8318}") { }
    internal object? Instance => GetOcx();
}

internal static class Program
{
    [STAThread]
    private static int Main(string[] args)
    {
        if (args.Length != 4 ||
            (args[0] != "--status" && args[0] != "--read") ||
            !System.Net.IPAddress.TryParse(args[1], out var ip) ||
            ip.AddressFamily != System.Net.Sockets.AddressFamily.InterNetwork ||
            !int.TryParse(args[2], NumberStyles.None, CultureInfo.InvariantCulture, out var port) ||
            port < 1 || port > 65535 ||
            !int.TryParse(args[3], NumberStyles.None, CultureInfo.InvariantCulture, out var machine) ||
            machine < 1 || machine > 255)
        {
            Console.Error.WriteLine("ERROR|INVALID_ARGUMENTS");
            return 2;
        }

        // Password must never appear on a process command line or in stdout.
        var secret = Environment.GetEnvironmentVariable("KY_PDKS_FP_CLOCK_PASSWORD");
        if (!int.TryParse(secret ?? "0", NumberStyles.Integer,
            CultureInfo.InvariantCulture, out var password))
        {
            Console.Error.WriteLine("ERROR|PASSWORD_CONFIGURATION_INVALID");
            return 2;
        }

        try
        {
            Application.EnableVisualStyles();
            using var form = new Form {
                ShowInTaskbar = false, StartPosition = FormStartPosition.Manual,
                Left = -2000, Top = -2000, Width = 32, Height = 32,
                FormBorderStyle = FormBorderStyle.FixedToolWindow
            };
            using var host = new ClockControl { Dock = DockStyle.Fill };
            form.Controls.Add(host);
            form.Show();
            Application.DoEvents();
            dynamic clock = host.Instance ??
                throw new InvalidOperationException("FP_CLOCK_OCX_UNAVAILABLE");
            var connected = false;
            try
            {
                var endpoint = ip.ToString();
                if (!(bool)clock.SetIPAddress(ref endpoint, port, password))
                    throw new InvalidOperationException("FP_CLOCK_ENDPOINT_REJECTED");
                if (!(bool)clock.OpenCommPort(machine))
                    throw new InvalidOperationException("FP_CLOCK_OFFLINE");
                connected = true;

                int year=0, month=0, day=0, hour=0, minute=0, week=0;
                string timestamp="";
                try
                {
                    if ((bool)clock.GetDeviceTime(machine,ref year,ref month,
                        ref day,ref hour,ref minute,ref week))
                        timestamp = new DateTime(year,month,day,hour,minute,0)
                            .ToString("s",CultureInfo.InvariantCulture);
                }
                catch { /* Clock drift cannot be invented. */ }
                var users=ReadCount(clock,machine,2);
                var pending=ReadCount(clock,machine,6);
                var cards=ReadCount(clock,machine,7);
                Console.WriteLine($"STATUS|OK|{timestamp}|{pending}|{users}|{cards}");
                if (args[0]=="--read") ReadLogs(clock,machine);
                return 0;
            }
            finally
            {
                if (connected)
                {
                    try { clock.CloseCommPort(); } catch { }
                }
            }
        }
        catch (Exception ex)
        {
            var code=ex.GetBaseException().Message;
            // Never echo SDK exceptions: they may include credentials/addresses.
            var allowed = new[] {
                "FP_CLOCK_OCX_UNAVAILABLE","FP_CLOCK_ENDPOINT_REJECTED",
                "FP_CLOCK_OFFLINE","FP_CLOCK_READ_PREPARE_FAILED",
                "FP_CLOCK_READ_GETTER_FAILED"
            };
            Console.Error.WriteLine("ERROR|"+(allowed.Contains(code) ? code : "FP_CLOCK_DRIVER_ERROR"));
            return 3;
        }
    }

    private static int ReadCount(dynamic clock,int machine,int category)
    {
        try
        {
            int value=0;
            return (bool)clock.GetDeviceStatus(machine,category,ref value) ? value : -1;
        }
        catch { return -1; }
    }

    private static void ReadLogs(dynamic clock,int machine)
    {
        bool ready;
        try { ready=(bool)clock.ReadGeneralLogData(machine); }
        catch { throw new InvalidOperationException("FP_CLOCK_READ_PREPARE_FAILED"); }
        if (!ready)
            throw new InvalidOperationException("FP_CLOCK_READ_PREPARE_FAILED");
        var count=0;
        while (count<10000)
        {
            int terminal=0,enroll=0,enrollMachine=0,verify=0,direction=0,evt=0;
            int year=0,month=0,day=0,hour=0,minute=0,second=0;
            bool ok;
            try
            {
                ok=(bool)clock.GetGeneralLogDataWithSecond(machine,ref terminal,
                    ref enroll,ref enrollMachine,ref verify,ref direction,ref evt,
                    ref year,ref month,ref day,ref hour,ref minute,ref second);
            }
            catch { throw new InvalidOperationException("FP_CLOCK_READ_GETTER_FAILED"); }
            if (!ok) break;
            DateTime stamp;
            try { stamp=new DateTime(year,month,day,hour,minute,second); }
            catch { continue; }
            if (enroll<0 || enroll>99999) continue;
            Console.WriteLine("LOG|"+enroll.ToString("00000",CultureInfo.InvariantCulture)+
                "|"+stamp.ToString("s",CultureInfo.InvariantCulture)+
                "|"+direction+"|"+verify+"|"+evt+"|"+terminal);
            count++;
        }
        Console.WriteLine("END|"+count.ToString(CultureInfo.InvariantCulture));
    }
}
