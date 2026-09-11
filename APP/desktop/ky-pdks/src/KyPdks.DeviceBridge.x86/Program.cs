using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using System.Web.Script.Serialization;
using System.Windows.Forms;

namespace KyPdks.DeviceBridge
{
    internal static class Program
    {
        [STAThread]
        private static int Main(string[] args)
        {
            var options = BridgeOptions.Parse(args);
            OleInitialize(IntPtr.Zero);
            try
            {
                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);
                Application.Run(new BridgeForm(options));
                return 0;
            }
            catch (Exception ex)
            {
                try { File.WriteAllText(options.StateFile, new JavaScriptSerializer().Serialize(new { connected = false, error = ex.Message, updatedAt = DateTimeOffset.Now.ToString("O") })); } catch { }
                return 2;
            }
            finally { OleUninitialize(); }
        }

        [DllImport("ole32.dll")] private static extern int OleInitialize(IntPtr pvReserved);
        [DllImport("ole32.dll")] private static extern void OleUninitialize();
    }

    internal sealed class BridgeOptions
    {
        public string Ip = "192.168.1.224";
        public int Port = 5005;
        public int DeviceNo = 1;
        public int CommKey = 0;
        public int ScanMs = 1000;
        public string QueueDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "KY ERP", "PDKS", "DeviceQueue");
        public string StateFile = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "KY ERP", "PDKS", "device-bridge-state.json");

        public static BridgeOptions Parse(string[] args)
        {
            var o = new BridgeOptions();
            for (int i = 0; i < args.Length; i++)
            {
                string k = args[i].Trim().ToLowerInvariant();
                string v = i + 1 < args.Length ? args[i + 1] : "";
                if (k == "--ip" && v.Length > 0) { o.Ip = v; i++; }
                else if (k == "--port" && int.TryParse(v, out var p)) { o.Port = p; i++; }
                else if (k == "--device" && int.TryParse(v, out var d)) { o.DeviceNo = d; i++; }
                else if (k == "--key" && int.TryParse(v, out var c)) { o.CommKey = c; i++; }
                else if (k == "--scan" && int.TryParse(v, out var s)) { o.ScanMs = Math.Max(500, Math.Min(30000, s)); i++; }
                else if (k == "--queue" && v.Length > 0) { o.QueueDir = v; i++; }
                else if (k == "--state" && v.Length > 0) { o.StateFile = v; i++; }
            }
            return o;
        }
    }

    internal sealed class BridgeForm : Form
    {
        private static readonly Guid FpClockClsid = new Guid("87733EE1-D095-442B-A200-6DE90C5C8318");
        private const uint LOAD_WITH_ALTERED_SEARCH_PATH = 0x00000008;
        private readonly BridgeOptions _o;
        private readonly JavaScriptSerializer _json = new JavaScriptSerializer();
        private readonly Timer _timer = new Timer();
        private readonly List<IntPtr> _loaded = new List<IntPtr>();
        private readonly HashSet<string> _seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        private NativeAxHost _host;
        private object _com;
        private Type _type;
        private bool _polling;
        private string _oldPath = "";
        private DateTime _lastState = DateTime.MinValue;
        private string _lastPunch = "";

        public BridgeForm(BridgeOptions options)
        {
            _o = options;
            ShowInTaskbar = false;
            FormBorderStyle = FormBorderStyle.None;
            Width = Height = 1;
            Left = Top = -32000;
            Opacity = 0.01;
            StartPosition = FormStartPosition.Manual;
            Shown += (_, __) => BeginInvoke(new Action(StartBridge));
            FormClosed += (_, __) => Cleanup();
        }

        private void StartBridge()
        {
            try
            {
                Directory.CreateDirectory(_o.QueueDir);
                Directory.CreateDirectory(Path.GetDirectoryName(_o.StateFile));
                Connect();
                _timer.Interval = _o.ScanMs;
                _timer.Tick += (_, __) => Poll();
                _timer.Start();
                Poll();
            }
            catch (Exception ex)
            {
                WriteState(false, ex.Message, null, null);
                Console.Error.WriteLine("BRIDGE_ERROR " + ex);
                Environment.ExitCode = 2;
                Close();
            }
        }

        private void Connect()
        {
            string runtime = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "runtime");
            string ocx = FindFile("FP_CLOCK.ocx", new[] {
                Path.Combine(runtime, "FP_CLOCK.ocx"),
                @"D:\personel yedek son\Terminal Bilgi Aktar\support\FP_CLOCK.ocx",
                @"C:\Hedef500\Terminal Bilgi Aktar\support\FP_CLOCK.ocx"
            });
            if (ocx == null) throw new FileNotFoundException("FP_CLOCK.ocx bulunamadı.");
            string support = Path.GetDirectoryName(ocx);
            string tmp = Path.Combine(support, "TMPCCOMM.dll");
            if (!File.Exists(tmp)) throw new FileNotFoundException("TMPCCOMM.dll bulunamadı.", tmp);
            string ch = FindFile("CH375DLL.DLL", new[] {
                Path.Combine(runtime, "CH375DLL.DLL"),
                Path.Combine(support, "CH375DLL.DLL"),
                @"C:\Program Files\SAi\SAi Production Suite 21\Program\CH375DLL.DLL"
            });

            var dirs = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            AddDir(dirs, runtime); AddDir(dirs, support); AddDir(dirs, Path.GetDirectoryName(ch));
            AddDir(dirs, Environment.SystemDirectory);
            AddDir(dirs, Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Windows), "SysWOW64"));
            _oldPath = Environment.GetEnvironmentVariable("PATH") ?? "";
            Environment.SetEnvironmentVariable("PATH", string.Join(";", dirs) + ";" + _oldPath);
            SetDllDirectory(support);

            if (ch != null) LoadKeep(ch);
            LoadKeep(tmp);
            IntPtr hOcx = LoadKeep(ocx);
            IntPtr p = GetProcAddress(hOcx, "DllGetClassObject");
            if (p == IntPtr.Zero) throw new MissingMethodException("FP_CLOCK.ocx DllGetClassObject bulunamadı.");
            var getClassObject = (DllGetClassObjectDelegate)Marshal.GetDelegateForFunctionPointer(p, typeof(DllGetClassObjectDelegate));
            object raw = CreateNativeControl(getClassObject, FpClockClsid);

            _host = new NativeAxHost(FpClockClsid, raw) { Width = 1, Height = 1, Left = -100, Top = -100, Visible = true };
            ((ISupportInitialize)_host).BeginInit();
            Controls.Add(_host);
            ((ISupportInitialize)_host).EndInit();
            _host.CreateControl();
            Application.DoEvents();

            _com = _host.NativeObject ?? throw new InvalidOperationException("FP_CLOCK ActiveX başlatılamadı.");
            _type = _com.GetType();

            object[] setArgs = { _o.Ip, _o.Port, _o.CommKey };
            var setPm = new ParameterModifier(3); setPm[0] = true;
            if (!AsBool(_type.InvokeMember("SetIPAddress", BindingFlags.InvokeMethod, null, _com, setArgs, new[] { setPm }, CultureInfo.InvariantCulture, null)))
                throw new InvalidOperationException("SetIPAddress başarısız.");
            if (!AsBool(Invoke("OpenCommPort", new object[] { _o.DeviceNo })))
                throw new InvalidOperationException("OpenCommPort başarısız.");

            try { _type.InvokeMember("ReadMark", BindingFlags.SetProperty, null, _com, new object[] { false }, CultureInfo.InvariantCulture); } catch { }
            Console.WriteLine("BRIDGE_CONNECTED " + _o.Ip + ":" + _o.Port);
            WriteState(true, "", ReadDeviceTime(), ReadCounters());
        }

        private void Poll()
        {
            if (_polling || _com == null) return;
            _polling = true;
            try
            {
                int added = 0;
                object read = Invoke("ReadGeneralLogData", new object[] { _o.DeviceNo });
                if (AsBool(read))
                {
                    while (added < 1000 && TryReadPunch(out var punch))
                    {
                        string fingerprint = punch.cardNo + "|" + punch.eventAt;
                        if (_seen.Add(fingerprint))
                        {
                            WritePunch(punch);
                            _lastPunch = punch.cardNo + " · " + punch.eventAt;
                            added++;
                        }
                    }
                }
                if ((DateTime.Now - _lastState).TotalSeconds >= 5)
                    WriteState(true, "", ReadDeviceTime(), ReadCounters());
            }
            catch (Exception ex)
            {
                WriteState(false, Unwrap(ex).Message, null, null);
                Console.Error.WriteLine("BRIDGE_POLL_ERROR " + Unwrap(ex).Message);
                _timer.Stop();
                Close();
            }
            finally { _polling = false; }
        }

        private bool TryReadPunch(out PunchDto punch)
        {
            punch = null;
            try
            {
                object[] a = { _o.DeviceNo, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0 };
                var pm = new ParameterModifier(a.Length); for (int i = 1; i < a.Length; i++) pm[i] = true;
                object ret = _type.InvokeMember("GetGeneralLogDataWithSecond", BindingFlags.InvokeMethod, null, _com, a, new[] { pm }, CultureInfo.InvariantCulture, null);
                if (!AsBool(ret)) return false;
                int enroll = I(a[2]), verify = I(a[4]), inout = I(a[5]), evt = I(a[6]);
                var dt = new DateTime(I(a[7]), I(a[8]), I(a[9]), I(a[10]), I(a[11]), I(a[12]));
                punch = new PunchDto {
                    cardNo = Math.Max(0, enroll).ToString("D5", CultureInfo.InvariantCulture),
                    eventAt = dt.ToString("O", CultureInfo.InvariantCulture),
                    direction = Direction(verify, inout),
                    verifyMode = verify, inout = inout, eventCode = evt,
                    machineNo = I(a[1]), enrollMachineNo = I(a[3]),
                    source = "FP_CLOCK_DIRECT"
                };
                return true;
            }
            catch (MissingMethodException)
            {
                return TryReadPunchLegacy(out punch);
            }
            catch (TargetInvocationException ex) when (Unwrap(ex) is MissingMethodException)
            {
                return TryReadPunchLegacy(out punch);
            }
        }

        private bool TryReadPunchLegacy(out PunchDto punch)
        {
            punch = null;
            object[] a = { _o.DeviceNo, 0, 0, 0, 0, 0, 0, 0, 0, 0 };
            var pm = new ParameterModifier(a.Length); for (int i = 1; i < a.Length; i++) pm[i] = true;
            object ret = _type.InvokeMember("GetGeneralLogData", BindingFlags.InvokeMethod, null, _com, a, new[] { pm }, CultureInfo.InvariantCulture, null);
            if (!AsBool(ret)) return false;
            int enroll = I(a[2]), verify = I(a[4]);
            var dt = new DateTime(I(a[5]), I(a[6]), I(a[7]), I(a[8]), I(a[9]), 0);
            punch = new PunchDto {
                cardNo = Math.Max(0, enroll).ToString("D5", CultureInfo.InvariantCulture),
                eventAt = dt.ToString("O", CultureInfo.InvariantCulture),
                direction = Direction(verify, 0), verifyMode = verify, inout = 0, eventCode = 0,
                machineNo = I(a[1]), enrollMachineNo = I(a[3]), source = "FP_CLOCK_DIRECT"
            };
            return true;
        }

        private string ReadDeviceTime()
        {
            try
            {
                object[] a = { _o.DeviceNo, 0, 0, 0, 0, 0, 0 };
                var pm = new ParameterModifier(7); for (int i = 1; i < 7; i++) pm[i] = true;
                object ret = _type.InvokeMember("GetDeviceTime", BindingFlags.InvokeMethod, null, _com, a, new[] { pm }, CultureInfo.InvariantCulture, null);
                if (!AsBool(ret)) return "";
                return string.Format(CultureInfo.InvariantCulture, "{0:D4}-{1:D2}-{2:D2}T{3:D2}:{4:D2}:00", I(a[1]), I(a[2]), I(a[3]), I(a[4]), I(a[5]));
            }
            catch { return ""; }
        }

        private Dictionary<string, int> ReadCounters()
        {
            var result = new Dictionary<string, int>();
            for (int code = 1; code <= 7; code++)
            {
                try
                {
                    object[] a = { _o.DeviceNo, code, 0 };
                    var pm = new ParameterModifier(3); pm[2] = true;
                    object ret = _type.InvokeMember("GetDeviceStatus", BindingFlags.InvokeMethod, null, _com, a, new[] { pm }, CultureInfo.InvariantCulture, null);
                    if (AsBool(ret)) result[code.ToString(CultureInfo.InvariantCulture)] = I(a[2]);
                }
                catch { }
            }
            return result;
        }

        private void WritePunch(PunchDto punch)
        {
            string name = DateTime.Now.ToString("yyyyMMdd_HHmmss_fff", CultureInfo.InvariantCulture) + "_" + punch.cardNo + "_" + Guid.NewGuid().ToString("N") + ".json";
            string target = Path.Combine(_o.QueueDir, name);
            string temp = target + ".tmp";
            File.WriteAllText(temp, _json.Serialize(punch), new UTF8Encoding(false));
            File.Move(temp, target);
            Console.WriteLine("PUNCH " + punch.cardNo + " " + punch.eventAt);
        }

        private void WriteState(bool connected, string error, string deviceTime, Dictionary<string, int> counters)
        {
            _lastState = DateTime.Now;
            var payload = new {
                connected = connected,
                host = _o.Ip,
                port = _o.Port,
                deviceNo = _o.DeviceNo,
                deviceTime = deviceTime ?? "",
                managerCount = Counter(counters, 1),
                userCount = Counter(counters, 2),
                fingerprintCount = Counter(counters, 3),
                passwordCount = Counter(counters, 4),
                managementLogCount = Counter(counters, 5),
                timeLogCount = Counter(counters, 6),
                cardCount = Counter(counters, 7),
                lastPunch = _lastPunch,
                error = error ?? "",
                updatedAt = DateTimeOffset.Now.ToString("O")
            };
            string dir = Path.GetDirectoryName(_o.StateFile); if (!string.IsNullOrWhiteSpace(dir)) Directory.CreateDirectory(dir);
            string temp = _o.StateFile + ".tmp";
            File.WriteAllText(temp, _json.Serialize(payload), new UTF8Encoding(false));
            if (File.Exists(_o.StateFile)) File.Delete(_o.StateFile);
            File.Move(temp, _o.StateFile);
        }

        private static int Counter(Dictionary<string, int> c, int code) => c != null && c.TryGetValue(code.ToString(CultureInfo.InvariantCulture), out var v) ? v : -1;
        private static string Direction(int verify, int inout)
        {
            int low = verify & 0xFF;
            if (low >= 51 && low <= 53) return "IN";
            if (low >= 101 && low <= 103) return "OUT";
            int status = (verify >> 8) & 0xFF;
            if (status == 0 || status == 4) return "IN";
            if (status == 1 || status == 5) return "OUT";
            if (inout == 1) return "IN";
            if (inout == 2 || inout == 3) return "OUT";
            return "AUTO";
        }

        private object Invoke(string name, object[] args) => _type.InvokeMember(name, BindingFlags.InvokeMethod, null, _com, args, CultureInfo.InvariantCulture);
        private static bool AsBool(object v) { try { return Convert.ToBoolean(v, CultureInfo.InvariantCulture); } catch { return false; } }
        private static int I(object v) { try { return Convert.ToInt32(v, CultureInfo.InvariantCulture); } catch { return 0; } }
        private static Exception Unwrap(Exception e) => e is TargetInvocationException && e.InnerException != null ? e.InnerException : e;

        private static string FindFile(string name, IEnumerable<string> candidates)
        {
            foreach (string p in candidates.Where(x => !string.IsNullOrWhiteSpace(x)))
                if (File.Exists(p)) return p;
            return null;
        }
        private static void AddDir(HashSet<string> d, string p) { if (!string.IsNullOrWhiteSpace(p) && Directory.Exists(p)) d.Add(p); }
        private IntPtr LoadKeep(string path)
        {
            IntPtr h = LoadLibraryEx(path, IntPtr.Zero, LOAD_WITH_ALTERED_SEARCH_PATH);
            if (h == IntPtr.Zero) throw new InvalidOperationException(Path.GetFileName(path) + " yüklenemedi. Win32=" + Marshal.GetLastWin32Error());
            _loaded.Add(h); return h;
        }

        private static object CreateNativeControl(DllGetClassObjectDelegate fn, Guid clsid)
        {
            object factoryObj; Guid iidFactory = new Guid("00000001-0000-0000-C000-000000000046");
            int hr = fn(ref clsid, ref iidFactory, out factoryObj);
            if (hr < 0 || factoryObj == null) Marshal.ThrowExceptionForHR(hr);
            try
            {
                var factory = (IClassFactory)factoryObj;
                Guid iidDispatch = new Guid("00020400-0000-0000-C000-000000000046");
                object obj; hr = factory.CreateInstance(null, ref iidDispatch, out obj);
                if (hr < 0 || obj == null) Marshal.ThrowExceptionForHR(hr);
                return obj;
            }
            finally { try { if (Marshal.IsComObject(factoryObj)) Marshal.FinalReleaseComObject(factoryObj); } catch { } }
        }

        private void Cleanup()
        {
            try { _timer.Stop(); } catch { }
            try { if (_com != null && _type != null) Invoke("CloseCommPort", new object[0]); } catch { }
            try { _host?.Dispose(); } catch { }
            try { SetDllDirectory(null); Environment.SetEnvironmentVariable("PATH", _oldPath); } catch { }
        }

        private sealed class PunchDto
        {
            public string cardNo;
            public string eventAt;
            public string direction;
            public int verifyMode;
            public int inout;
            public int eventCode;
            public int machineNo;
            public int enrollMachineNo;
            public string source;
        }

        private sealed class NativeAxHost : AxHost
        {
            private readonly object _obj;
            public NativeAxHost(Guid g, object o) : base(g.ToString("B")) { _obj = o; }
            protected override object CreateInstanceCore(Guid clsid) => _obj;
            public object NativeObject => GetOcx();
        }

        [ComImport, Guid("00000001-0000-0000-C000-000000000046"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        private interface IClassFactory
        {
            [PreserveSig] int CreateInstance([MarshalAs(UnmanagedType.Interface)] object pUnkOuter, ref Guid riid, [MarshalAs(UnmanagedType.Interface)] out object ppvObject);
            [PreserveSig] int LockServer([MarshalAs(UnmanagedType.Bool)] bool fLock);
        }
        [UnmanagedFunctionPointer(CallingConvention.StdCall)]
        private delegate int DllGetClassObjectDelegate(ref Guid rclsid, ref Guid riid, [MarshalAs(UnmanagedType.Interface)] out object ppv);
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] private static extern bool SetDllDirectory(string lpPathName);
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] private static extern IntPtr LoadLibraryEx(string lpFileName, IntPtr hFile, uint dwFlags);
        [DllImport("kernel32.dll", CharSet = CharSet.Ansi, SetLastError = true)] private static extern IntPtr GetProcAddress(IntPtr hModule, string lpProcName);
    }
}
