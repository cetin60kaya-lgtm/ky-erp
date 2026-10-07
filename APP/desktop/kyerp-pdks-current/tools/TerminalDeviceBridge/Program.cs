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
        var password = args.Length > 4 ? int.Parse(args[4], CultureInfo.InvariantCulture) : 0;
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
                if (!clock.SetIPAddress(ref endpoint, port, password)) return Fail("Cihaz IP/port ayarı kabul edilmedi.");
                if (!clock.OpenCommPort(machine)) { int err = 0; try { clock.GetLastError(ref err); } catch { } return Fail("Kart cihazına bağlantı açılamadı. SDK hata kodu: " + err); }
                try
                {
                    clock.ReadMark = false;
                    int year = 0, month = 0, day = 0, hour = 0, minute = 0, dayOfWeek = 0;
                    bool timeOk = clock.GetDeviceTime(machine, ref year, ref month, ref day, ref hour, ref minute, ref dayOfWeek);
                    int users = Status(clock, machine, 2);
                    int newLogs = Status(clock, machine, 6);
                    int cards = Status(clock, machine, 7);
                    var deviceTime = timeOk
                        ? new DateTime(year, month, day, hour, minute, 0).ToString("s", CultureInfo.InvariantCulture)
                        : "";
                    Console.WriteLine("STATUS|OK|" + deviceTime + "|" + newLogs + "|" + users + "|" + cards);
                    var identity = ReadIdentity(clock, machine);
                    Console.WriteLine("IDENTITY|" + Safe(identity.SerialNumber) + "|" + Safe(identity.ProductCode) + "|" + Safe(identity.FirmwareVersion));
                    if (mode == "read") ReadNew(clock, machine);
                    else if (mode == "readall") ReadAll(clock, machine);
                    else if (mode == "users") ReadUsers(clock, machine);
                    else if (mode == "deleteuser")
                    {
                        int enroll;
                        if (args.Length < 6 || !int.TryParse(args[5], NumberStyles.Integer, CultureInfo.InvariantCulture, out enroll))
                            return Fail("Silinecek kullanıcı numarası geçersiz.");
                        bool ok = DeleteUser(clock, machine, enroll);
                        Console.WriteLine(ok ? "ACTION|OK|DELETEUSER|" + enroll : "ACTION|ERROR|DELETEUSER|" + enroll);
                        return ok ? 0 : 5;
                    }
                    else if (mode == "clearusers")
                    {
                        int removed = ClearUsers(clock, machine);
                        Console.WriteLine(removed >= 0 ? "ACTION|OK|CLEARUSERS|" + removed : "ACTION|ERROR|CLEARUSERS");
                        return removed >= 0 ? 0 : 6;
                    }
                    else if (mode == "movecard")
                    {
                        int oldEnroll;
                        int newEnroll;
                        if (args.Length < 7 ||
                            !int.TryParse(args[5], NumberStyles.Integer, CultureInfo.InvariantCulture, out oldEnroll) ||
                            !int.TryParse(args[6], NumberStyles.Integer, CultureInfo.InvariantCulture, out newEnroll))
                            return Fail("Kart taşıma için eski/yeni kullanıcı numarası geçersiz.");
                        bool ok = MoveCard(clock, machine, oldEnroll, newEnroll);
                        Console.WriteLine(ok ? "ACTION|OK|MOVECARD|" + oldEnroll + "|" + newEnroll : "ACTION|ERROR|MOVECARD|" + oldEnroll + "|" + newEnroll);
                        return ok ? 0 : 7;
                    }
                    else if (mode == "clearlogs")
                    {
                        bool ok = clock.EmptyGeneralLogData(machine);
                        Console.WriteLine(ok ? "ACTION|OK|CLEARLOGS" : "ACTION|ERROR|CLEARLOGS");
                        return ok ? 0 : 3;
                    }
                    else if (mode == "settime")
                    {
                        bool ok = clock.SetDeviceTime(machine);
                        Console.WriteLine(ok ? "ACTION|OK|SETTIME" : "ACTION|ERROR|SETTIME");
                        return ok ? 0 : 4;
                    }
                    return 0;
                }
                finally { try { clock.CloseCommPort(); } catch { } }
            }
            catch (Exception ex) { return Fail(ex.GetBaseException().Message); }
        }
    }

    private sealed class DeviceIdentity
    {
        public string SerialNumber = "";
        public string ProductCode = "";
        public string FirmwareVersion = "";
    }

    private static DeviceIdentity ReadIdentity(dynamic clock, int machine)
    {
        var result = new DeviceIdentity();
        try
        {
            string value = "";
            if (clock.GetSerialNumber(machine, ref value)) result.SerialNumber = value ?? "";
        }
        catch { }
        try
        {
            string value = "";
            if (clock.GetProductCode(machine, ref value)) result.ProductCode = value ?? "";
        }
        catch { }
        try
        {
            string value = "";
            if (clock.GetFirmwareVersion(machine, ref value)) result.FirmwareVersion = value ?? "";
        }
        catch { }
        return result;
    }

    private sealed class UserRow
    {
        public int Enroll;
        public int Privilege;
        public int Enabled;
        public readonly System.Collections.Generic.HashSet<int> Backups = new System.Collections.Generic.HashSet<int>();
    }

    private static void ReadUsers(dynamic clock, int machine)
    {
        var users = new System.Collections.Generic.Dictionary<int, UserRow>();
        bool prepared = false;
        try { prepared = clock.ReadAllUserID(machine); } catch { prepared = false; }
        if (prepared)
        {
            while (true)
            {
                int enroll = 0, enrollMachine = 0, backup = 0, privilege = 0, enabled = 0;
                bool ok;
                try { ok = clock.GetAllUserID(machine, ref enroll, ref enrollMachine, ref backup, ref privilege, ref enabled); }
                catch { break; }
                if (!ok) break;
                UserRow row;
                if (!users.TryGetValue(enroll, out row))
                {
                    row = new UserRow { Enroll = enroll, Privilege = privilege, Enabled = enabled };
                    users[enroll] = row;
                }
                row.Backups.Add(backup);
            }
        }

        foreach (var pair in users)
        {
            var row = pair.Value;
            string name = "";
            try
            {
                object value = "";
                int enrollMachine = machine;
                if (clock.GetUserName(0, machine, row.Enroll, enrollMachine, ref value))
                    name = Convert.ToString(value, CultureInfo.InvariantCulture) ?? "";
            }
            catch { }

            var backups = string.Join(",", new System.Collections.Generic.List<int>(row.Backups).ConvertAll(x => x.ToString(CultureInfo.InvariantCulture)).ToArray());
            Console.WriteLine("USER|" + row.Enroll.ToString(CultureInfo.InvariantCulture) + "|" +
                Safe(name) + "|" + backups + "|" + row.Privilege.ToString(CultureInfo.InvariantCulture) + "|" +
                row.Enabled.ToString(CultureInfo.InvariantCulture));
        }
        Console.WriteLine("USERS_END|" + users.Count.ToString(CultureInfo.InvariantCulture));
    }

    private static bool DeleteUser(dynamic clock, int machine, int enroll)
    {
        bool any = false;
        try { any = clock.DeleteEnrollData(machine, enroll, machine, 12) || any; } catch { }
        for (int backup = 20; backup <= 27; backup++)
        {
            try { any = clock.DeleteEnrollData(machine, enroll, machine, backup) || any; } catch { }
        }
        try { any = clock.DeleteEnrollData(machine, enroll, machine, 50) || any; } catch { }
        return any;
    }

    private static int ClearUsers(dynamic clock, int machine)
    {
        var ids = new System.Collections.Generic.HashSet<int>();
        try
        {
            if (!clock.ReadAllUserID(machine)) return -1;
            while (true)
            {
                int enroll = 0, enrollMachine = 0, backup = 0, privilege = 0, enabled = 0;
                bool ok = clock.GetAllUserID(machine, ref enroll, ref enrollMachine, ref backup, ref privilege, ref enabled);
                if (!ok) break;
                ids.Add(enroll);
            }
        }
        catch { return -1; }

        int removed = 0;
        foreach (var id in ids)
            if (DeleteUser(clock, machine, id)) removed++;
        return removed;
    }

    private static bool MoveCard(dynamic clock, int machine, int oldEnroll, int newEnroll)
    {
        if (oldEnroll == newEnroll) return true;
        int privilege = 0;
        int cardNumber = 0;
        object data = 0;
        bool read = false;
        try { read = clock.GetEnrollData(machine, oldEnroll, machine, 11, ref privilege, ref data, ref cardNumber); }
        catch { read = false; }
        if (!read) return false;

        bool written = false;
        try { written = clock.SetEnrollData(machine, newEnroll, machine, 11, privilege, ref data, cardNumber); }
        catch { written = false; }
        if (!written) return false;

        int verifyPrivilege = 0;
        int verifyCard = 0;
        object verifyData = 0;
        bool verified = false;
        try { verified = clock.GetEnrollData(machine, newEnroll, machine, 11, ref verifyPrivilege, ref verifyData, ref verifyCard); }
        catch { verified = false; }
        if (!verified || verifyCard != cardNumber) return false;

        try
        {
            object name = "";
            int enrollMachine = machine;
            if (clock.GetUserName(0, machine, oldEnroll, enrollMachine, ref name))
                clock.SetUserName(0, machine, newEnroll, machine, ref name);
        }
        catch { }

        try { return clock.DeleteEnrollData(machine, oldEnroll, machine, 11); }
        catch { return false; }
    }

    private static string Safe(string value)
    {
        return (value ?? "").Replace("|", "/").Replace("\r", " ").Replace("\n", " ");
    }

    private static void ReadNew(dynamic clock, int machine)
    {
        var count = 0;
        bool prepared = false;
        try { prepared = clock.ReadGeneralLogData(machine); }
        catch { prepared = false; }

        if (prepared)
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

    private static void ReadAll(dynamic clock, int machine)
    {
        var count = 0;
        bool prepared = false;
        try { prepared = clock.ReadAllGLogData(machine); }
        catch { prepared = false; }

        if (prepared)
        {
            bool useAllGetter = true;
            while (true)
            {
                int terminal = 0, enroll = 0, enrollMachine = 0, verify = 0, inout = 0, evt = 0;
                int year = 0, month = 0, day = 0, hour = 0, minute = 0, second = 0;
                bool ok;
                try
                {
                    if (useAllGetter)
                        ok = clock.GetAllGLogDataWithSecond(
                            machine, ref terminal, ref enroll, ref enrollMachine, ref verify, ref inout, ref evt,
                            ref year, ref month, ref day, ref hour, ref minute, ref second);
                    else
                        ok = clock.GetGeneralLogDataWithSecond(
                            machine, ref terminal, ref enroll, ref enrollMachine, ref verify, ref inout, ref evt,
                            ref year, ref month, ref day, ref hour, ref minute, ref second);
                }
                catch
                {
                    if (!useAllGetter) break;
                    useAllGetter = false;
                    continue;
                }
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
