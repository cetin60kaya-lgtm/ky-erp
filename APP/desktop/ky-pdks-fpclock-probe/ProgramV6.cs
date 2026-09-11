using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Net.Sockets;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using System.Windows.Forms;
using ComTypes = System.Runtime.InteropServices.ComTypes;

namespace KyPdksFpClockProbeV6
{
    internal static class Program
    {
        [STAThread]
        private static void Main()
        {
            OleInitialize(IntPtr.Zero);
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new ProbeForm());
            OleUninitialize();
        }

        [DllImport("ole32.dll")]
        private static extern int OleInitialize(IntPtr pvReserved);
        [DllImport("ole32.dll")]
        private static extern void OleUninitialize();
    }

    internal sealed class ProbeForm : Form
    {
        private readonly TextBox _ip = new TextBox { Width = 125, Text = "192.168.1.224" };
        private readonly NumericUpDown _port = new NumericUpDown { Minimum = 1, Maximum = 65535, Value = 5005, Width = 78 };
        private readonly NumericUpDown _dn = new NumericUpDown { Minimum = 1, Maximum = 255, Value = 1, Width = 60 };
        private readonly NumericUpDown _key = new NumericUpDown { Minimum = 0, Maximum = 99999999, Value = 0, Width = 90 };
        private readonly Button _run = new Button { Text = "ACTIVEX HOST İLE CİHAZI OKU", AutoSize = true, Height = 34 };
        private readonly Label _state = new Label { Text = "Hazır", AutoSize = true, Padding = new Padding(8, 8, 0, 0) };
        private readonly TextBox _log = new TextBox { Multiline = true, ReadOnly = true, ScrollBars = ScrollBars.Both, WordWrap = false, Dock = DockStyle.Fill, Font = new System.Drawing.Font("Consolas", 9.1f) };
        private readonly StringBuilder _report = new StringBuilder();
        private NativeAxHost _axHost;

        public ProbeForm()
        {
            Text = "KY PDKS · FP_CLOCK ActiveX Host Cihaz Testi v6";
            Width = 1180;
            Height = 800;
            StartPosition = FormStartPosition.CenterScreen;

            var row = new FlowLayoutPanel { Dock = DockStyle.Top, Height = 56, Padding = new Padding(8), WrapContents = false };
            row.Controls.Add(new Label { Text = "IP", AutoSize = true, Padding = new Padding(0, 7, 0, 0) });
            row.Controls.Add(_ip);
            row.Controls.Add(new Label { Text = "Port", AutoSize = true, Padding = new Padding(8, 7, 0, 0) });
            row.Controls.Add(_port);
            row.Controls.Add(new Label { Text = "Cihaz No", AutoSize = true, Padding = new Padding(8, 7, 0, 0) });
            row.Controls.Add(_dn);
            row.Controls.Add(new Label { Text = "Comm Key", AutoSize = true, Padding = new Padding(8, 7, 0, 0) });
            row.Controls.Add(_key);
            row.Controls.Add(_run);
            row.Controls.Add(_state);

            var note = new Label
            {
                Dock = DockStyle.Top,
                Height = 80,
                Padding = new Padding(10, 7, 10, 5),
                Text = "SALT OKUMA / TANILAMA v6: v5 ile native bağımlılıklar ve COM nesnesi doğrulandı. Bu sürüm FP_CLOCK'u eski VB/ActiveX uygulaması gibi gerçek bir gizli ActiveX host içinde başlatır. Windows COM kaydını değiştirmez. Cihaza saat/zil/kapı/silme/reset komutu göndermez."
            };

            Controls.Add(_log);
            Controls.Add(note);
            Controls.Add(row);
            _run.Click += (_, __) => RunProbe();
        }

        private void Log(string text = "")
        {
            string line = $"[{DateTime.Now:HH:mm:ss}] {text}";
            _report.AppendLine(line);
            _log.AppendText(line + Environment.NewLine);
            Application.DoEvents();
        }

        private void RunProbe()
        {
            if (!_run.Enabled) return;
            _run.Enabled = false;
            _state.Text = "Çalışıyor...";
            _log.Clear();
            _report.Clear();

            var loaded = new List<IntPtr>();
            string oldPath = Environment.GetEnvironmentVariable("PATH") ?? "";
            try
            {
                string ip = _ip.Text.Trim();
                int port = (int)_port.Value;
                int dn = (int)_dn.Value;
                int key = (int)_key.Value;

                Log("KY PDKS - FP_CLOCK ACTIVEX HOST DOĞRUDAN CİHAZ TESTİ v6.0");
                Log($"Hedef: {ip}:{port} · Cihaz No={dn} · Comm Key={key}");
                Log("RISS / Hedef500 TXT köprüsü / Windows COM kaydı kullanılmıyor.");
                Log();
                TcpPrecheck(ip, port);
                Log();

                string ocxPath = FindExactOnDrives("FP_CLOCK.ocx");
                if (string.IsNullOrWhiteSpace(ocxPath)) throw new FileNotFoundException("FP_CLOCK.ocx bulunamadı.");
                string supportDir = Path.GetDirectoryName(ocxPath);
                string appDir = Directory.GetParent(supportDir)?.FullName ?? supportDir;
                string tmpPath = Path.Combine(supportDir, "TMPCCOMM.dll");
                if (!File.Exists(tmpPath)) throw new FileNotFoundException("TMPCCOMM.dll FP_CLOCK yanında bulunamadı.");

                Log("FP_CLOCK.ocx: " + ocxPath);
                Log("TMPCCOMM.dll: " + tmpPath);

                var cls = InspectTypeLibrary(ocxPath);
                Log($"COM CLSID: {cls.Guid:B} · metot={cls.Methods.Count}");
                foreach (var m in cls.Methods.Where(x => Eq(x.Name, "SetIPAddress") || Eq(x.Name, "OpenCommPort") || Eq(x.Name, "GetDeviceTime")))
                    Log("İMZA: " + m.Name + "(" + string.Join(", ", m.Parameters.Select(p => p.Name + ":VT=" + p.Vt + (p.ByRef ? " BYREF" : ""))) + ") -> VT=" + m.ReturnVt);

                var dirs = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                AddDir(dirs, supportDir);
                AddDir(dirs, appDir);
                AddDir(dirs, Directory.GetParent(appDir)?.FullName);
                AddDir(dirs, Environment.SystemDirectory);
                AddDir(dirs, Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Windows), "SysWOW64"));

                string ch375 = ResolveOrFind("CH375DLL.DLL", dirs);
                if (!string.IsNullOrWhiteSpace(ch375))
                {
                    AddDir(dirs, Path.GetDirectoryName(ch375));
                    Log("CH375DLL.DLL: " + ch375);
                }
                else Log("CH375DLL.DLL: BULUNAMADI");

                string path = string.Join(";", dirs.Where(Directory.Exists));
                Environment.SetEnvironmentVariable("PATH", path + ";" + oldPath);
                SetDllDirectory(supportDir);
                Log("DLL arama yolları: " + dirs.Count);

                if (!string.IsNullOrWhiteSpace(ch375)) LoadAndKeep(ch375, loaded, "CH375DLL.DLL");
                LoadAndKeep(tmpPath, loaded, "TMPCCOMM.dll");
                IntPtr hOcx = LoadAndKeep(ocxPath, loaded, "FP_CLOCK.ocx");

                IntPtr proc = GetProcAddress(hOcx, "DllGetClassObject");
                if (proc == IntPtr.Zero) throw new MissingMethodException("DllGetClassObject export bulunamadı.");
                var getClassObject = (DllGetClassObjectDelegate)Marshal.GetDelegateForFunctionPointer(proc, typeof(DllGetClassObjectDelegate));

                object rawControl = CreateNativeControl(getClassObject, cls.Guid);
                Log("Native IDispatch nesnesi oluşturuldu.");

                _axHost?.Dispose();
                _axHost = new NativeAxHost(cls.Guid, rawControl)
                {
                    Width = 1,
                    Height = 1,
                    Left = -50,
                    Top = -50,
                    Visible = true
                };
                ((ISupportInitialize)_axHost).BeginInit();
                Controls.Add(_axHost);
                ((ISupportInitialize)_axHost).EndInit();
                _axHost.CreateControl();
                Application.DoEvents();
                Log("ActiveX host oluşturuldu · IsHandleCreated=" + _axHost.IsHandleCreated + " · State=" + _axHost.HostState);

                object com = _axHost.NativeObject;
                if (com == null) throw new InvalidOperationException("AxHost GetOcx() null döndürdü.");
                Log("ActiveX host içindeki FP_CLOCK nesnesi alındı.");

                Type t = com.GetType();
                try
                {
                    object setResult = Invoke(t, com, "SetIPAddress", new object[] { ip, port, key });
                    Log("SetIPAddress sonucu: " + Format(setResult));
                }
                catch (Exception ex)
                {
                    Log("SetIPAddress HATA: " + Describe(Unwrap(ex)));
                    throw;
                }

                object openResult = Invoke(t, com, "OpenCommPort", new object[] { dn });
                Log("OpenCommPort sonucu: " + Format(openResult));

                bool ok = TryReadTime(t, com, dn);
                TryReadStatus(t, com, dn);
                TryReadInfo(t, com, dn);

                Log();
                if (ok)
                {
                    Log("SONUÇ: FP_CLOCK ACTIVEX HOST ÜZERİNDEN CİHAZ DOĞRUDAN OKUNDU.");
                    _state.Text = "BAĞLANTI BAŞARILI";
                }
                else
                {
                    Log("SONUÇ: ActiveX başlatıldı fakat cihaz saati doğrulanamadı.");
                    _state.Text = "ACTIVEX OK / CİHAZ DOĞRULANMADI";
                }
            }
            catch (Exception ex)
            {
                Exception root = Unwrap(ex);
                Log();
                Log("HATA: " + Describe(root));
                _state.Text = "HATA";
            }
            finally
            {
                try { SetDllDirectory(null); Environment.SetEnvironmentVariable("PATH", oldPath); } catch { }
                // AxHost COM nesnesini yaşattığı için native modülleri form kapanana kadar unload etmiyoruz.
                string report = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), "KY-PDKS-FPClock-Cihaz-Raporu-v6.txt");
                try { File.WriteAllText(report, _report.ToString(), new UTF8Encoding(true)); Log("Rapor: " + report); } catch { }
                _run.Enabled = true;
            }
        }

        private static object CreateNativeControl(DllGetClassObjectDelegate getClassObject, Guid clsid)
        {
            object factoryObj;
            Guid iidFactory = new Guid("00000001-0000-0000-C000-000000000046");
            int hr = getClassObject(ref clsid, ref iidFactory, out factoryObj);
            if (hr < 0 || factoryObj == null) Marshal.ThrowExceptionForHR(hr);
            try
            {
                var factory = (IClassFactory)factoryObj;
                Guid iidDispatch = new Guid("00020400-0000-0000-C000-000000000046");
                object obj;
                hr = factory.CreateInstance(null, ref iidDispatch, out obj);
                if (hr < 0 || obj == null) Marshal.ThrowExceptionForHR(hr);
                return obj;
            }
            finally
            {
                try { if (factoryObj != null && Marshal.IsComObject(factoryObj)) Marshal.FinalReleaseComObject(factoryObj); } catch { }
            }
        }

        private bool TryReadTime(Type t, object com, int dn)
        {
            try
            {
                object[] a = { dn, 0, 0, 0, 0, 0, 0 };
                var pm = new ParameterModifier(a.Length);
                for (int i = 1; i < a.Length; i++) pm[i] = true;
                object ret = t.InvokeMember("GetDeviceTime", BindingFlags.InvokeMethod, null, com, a, new[] { pm }, CultureInfo.InvariantCulture, null);
                Log($"GetDeviceTime: {Format(ret)} · {a[1]}-{a[2]}-{a[3]} {a[4]}:{a[5]} · DOW={a[6]}");
                int year = 0; try { year = Convert.ToInt32(a[1]); } catch { }
                return year >= 2000 && year <= 2100;
            }
            catch (Exception ex) { Log("GetDeviceTime HATA: " + Describe(Unwrap(ex))); return false; }
        }

        private void TryReadStatus(Type t, object com, int dn)
        {
            Log("GetDeviceStatus:");
            for (int code = 1; code <= 7; code++)
            {
                try
                {
                    object[] a = { dn, code, 0 };
                    var pm = new ParameterModifier(3); pm[2] = true;
                    object ret = t.InvokeMember("GetDeviceStatus", BindingFlags.InvokeMethod, null, com, a, new[] { pm }, CultureInfo.InvariantCulture, null);
                    Log($"  {code}: {a[2]} · {Format(ret)}");
                }
                catch (Exception ex) { Log($"  {code}: HATA · {Describe(Unwrap(ex))}"); }
            }
        }

        private void TryReadInfo(Type t, object com, int dn)
        {
            Log("GetDeviceInfo:");
            for (int code = 1; code <= 9; code++)
            {
                try
                {
                    object[] a = { dn, code, 0 };
                    var pm = new ParameterModifier(3); pm[2] = true;
                    object ret = t.InvokeMember("GetDeviceInfo", BindingFlags.InvokeMethod, null, com, a, new[] { pm }, CultureInfo.InvariantCulture, null);
                    Log($"  {code}: {a[2]} · {Format(ret)}");
                }
                catch (Exception ex) { Log($"  {code}: HATA · {Describe(Unwrap(ex))}"); }
            }
        }

        private ComClass InspectTypeLibrary(string path)
        {
            ComTypes.ITypeLib lib;
            int hr = LoadTypeLibEx(path, REGKIND.REGKIND_NONE, out lib);
            if (hr != 0 || lib == null) Marshal.ThrowExceptionForHR(hr);
            try
            {
                for (int i = 0; i < lib.GetTypeInfoCount(); i++)
                {
                    lib.GetTypeInfoType(i, out ComTypes.TYPEKIND kind);
                    if (kind != ComTypes.TYPEKIND.TKIND_COCLASS) continue;
                    lib.GetTypeInfo(i, out ComTypes.ITypeInfo ti);
                    IntPtr pa = IntPtr.Zero;
                    try
                    {
                        ti.GetTypeAttr(out pa);
                        var attr = (ComTypes.TYPEATTR)Marshal.PtrToStructure(pa, typeof(ComTypes.TYPEATTR));
                        var methods = new List<MethodDesc>();
                        for (int n = 0; n < attr.cImplTypes; n++)
                        {
                            try
                            {
                                ti.GetRefTypeOfImplType(n, out int href);
                                ti.GetRefTypeInfo(href, out ComTypes.ITypeInfo iface);
                                try { CollectMethods(iface, methods); }
                                finally { if (Marshal.IsComObject(iface)) Marshal.ReleaseComObject(iface); }
                            }
                            catch { }
                        }
                        if (methods.Any(m => Eq(m.Name, "OpenCommPort"))) return new ComClass { Guid = attr.guid, Methods = methods };
                    }
                    finally { if (pa != IntPtr.Zero) ti.ReleaseTypeAttr(pa); if (Marshal.IsComObject(ti)) Marshal.ReleaseComObject(ti); }
                }
            }
            finally { if (Marshal.IsComObject(lib)) Marshal.ReleaseComObject(lib); }
            throw new InvalidOperationException("FP_CLOCK COM coclass bulunamadı.");
        }

        private static void CollectMethods(ComTypes.ITypeInfo ti, List<MethodDesc> methods)
        {
            IntPtr pa = IntPtr.Zero;
            ti.GetTypeAttr(out pa);
            try
            {
                var attr = (ComTypes.TYPEATTR)Marshal.PtrToStructure(pa, typeof(ComTypes.TYPEATTR));
                for (int i = 0; i < attr.cFuncs; i++)
                {
                    IntPtr pf = IntPtr.Zero;
                    try
                    {
                        ti.GetFuncDesc(i, out pf);
                        var fd = (ComTypes.FUNCDESC)Marshal.PtrToStructure(pf, typeof(ComTypes.FUNCDESC));
                        var names = new string[Math.Max(1, fd.cParams + 1)];
                        ti.GetNames(fd.memid, names, names.Length, out int got);
                        if (got == 0) continue;
                        var ps = new List<ParamDesc>();
                        int elemSize = Marshal.SizeOf(typeof(ComTypes.ELEMDESC));
                        for (int p = 0; p < fd.cParams; p++)
                        {
                            IntPtr ep = IntPtr.Add(fd.lprgelemdescParam, p * elemSize);
                            var ed = (ComTypes.ELEMDESC)Marshal.PtrToStructure(ep, typeof(ComTypes.ELEMDESC));
                            short vt = ed.tdesc.vt;
                            bool byref = (vt & (short)VarEnum.VT_BYREF) != 0 || vt == (short)VarEnum.VT_PTR;
                            ps.Add(new ParamDesc { Name = (p + 1 < got && !string.IsNullOrWhiteSpace(names[p + 1])) ? names[p + 1] : "p" + (p + 1), Vt = vt, ByRef = byref });
                        }
                        methods.Add(new MethodDesc { Name = names[0], Parameters = ps, ReturnVt = fd.elemdescFunc.tdesc.vt });
                    }
                    finally { if (pf != IntPtr.Zero) ti.ReleaseFuncDesc(pf); }
                }
            }
            finally { if (pa != IntPtr.Zero) ti.ReleaseTypeAttr(pa); }
        }

        private void TcpPrecheck(string ip, int port)
        {
            var sw = Stopwatch.StartNew();
            using (var c = new TcpClient())
            {
                var ar = c.BeginConnect(ip, port, null, null);
                if (!ar.AsyncWaitHandle.WaitOne(2500)) throw new TimeoutException("TCP zaman aşımı.");
                c.EndConnect(ar); sw.Stop();
                Log($"TCP: BAŞARILI · {sw.ElapsedMilliseconds} ms · {c.Client.LocalEndPoint} -> {c.Client.RemoteEndPoint}");
            }
        }

        private string ResolveOrFind(string name, HashSet<string> dirs)
        {
            foreach (string d in dirs)
            {
                try { string p = Path.Combine(d, name); if (File.Exists(p)) return p; } catch { }
            }
            return FindExactOnDrives(name);
        }

        private string FindExactOnDrives(string name)
        {
            string[] known = name.Equals("FP_CLOCK.ocx", StringComparison.OrdinalIgnoreCase)
                ? new[] { @"D:\personel yedek son\Terminal Bilgi Aktar\support\FP_CLOCK.ocx", @"C:\Hedef500\Terminal Bilgi Aktar\support\FP_CLOCK.ocx", @"D:\Hedef500\Terminal Bilgi Aktar\support\FP_CLOCK.ocx" }
                : new string[0];
            foreach (string p in known) if (File.Exists(p)) return p;

            foreach (DriveInfo drive in DriveInfo.GetDrives().Where(d => d.IsReady && d.DriveType == DriveType.Fixed))
            {
                var q = new Queue<Tuple<string, int>>(); q.Enqueue(Tuple.Create(drive.RootDirectory.FullName, 0)); int scanned = 0;
                while (q.Count > 0 && scanned < 90000)
                {
                    var it = q.Dequeue(); scanned++;
                    try
                    {
                        string f = Path.Combine(it.Item1, name);
                        if (File.Exists(f)) return f;
                        if (it.Item2 >= 7) continue;
                        foreach (string sub in Directory.EnumerateDirectories(it.Item1))
                        {
                            string n = Path.GetFileName(sub) ?? "";
                            if (n.Equals("$Recycle.Bin", StringComparison.OrdinalIgnoreCase) || n.Equals("System Volume Information", StringComparison.OrdinalIgnoreCase) || n.Equals("WinSxS", StringComparison.OrdinalIgnoreCase) || n.Equals("node_modules", StringComparison.OrdinalIgnoreCase) || n.Equals(".git", StringComparison.OrdinalIgnoreCase)) continue;
                            q.Enqueue(Tuple.Create(sub, it.Item2 + 1));
                        }
                    }
                    catch { }
                }
            }
            return null;
        }

        private static IntPtr LoadAndKeep(string path, List<IntPtr> loaded, string label)
        {
            IntPtr h = LoadLibraryEx(path, IntPtr.Zero, LOAD_WITH_ALTERED_SEARCH_PATH);
            if (h == IntPtr.Zero) throw new InvalidOperationException(label + " yüklenemedi · Win32=" + Marshal.GetLastWin32Error());
            loaded.Add(h);
            return h;
        }

        private static object Invoke(Type t, object target, string name, object[] args) => t.InvokeMember(name, BindingFlags.InvokeMethod, null, target, args, CultureInfo.InvariantCulture);
        private static string Format(object v) => v == null ? "(null)" : Convert.ToString(v, CultureInfo.InvariantCulture);
        private static bool Eq(string a, string b) => string.Equals(a, b, StringComparison.OrdinalIgnoreCase);
        private static Exception Unwrap(Exception ex) => ex is TargetInvocationException && ex.InnerException != null ? ex.InnerException : ex;
        private static string Describe(Exception ex)
        {
            if (ex is COMException ce) return ce.Message + " · HRESULT=0x" + ce.ErrorCode.ToString("X8");
            return ex.Message + " · " + ex.GetType().FullName;
        }
        private static void AddDir(HashSet<string> dirs, string p) { if (!string.IsNullOrWhiteSpace(p) && Directory.Exists(p)) dirs.Add(p); }

        private sealed class ComClass { public Guid Guid; public List<MethodDesc> Methods = new List<MethodDesc>(); }
        private sealed class MethodDesc { public string Name; public List<ParamDesc> Parameters = new List<ParamDesc>(); public short ReturnVt; }
        private sealed class ParamDesc { public string Name; public short Vt; public bool ByRef; }

        private sealed class NativeAxHost : AxHost
        {
            private readonly object _instance;
            public NativeAxHost(Guid clsid, object instance) : base(clsid.ToString("B")) { _instance = instance; }
            protected override object CreateInstanceCore(Guid clsid) { return _instance; }
            public object NativeObject => GetOcx();
            public int HostState => (int)ActiveXState;
        }

        [ComImport, Guid("00000001-0000-0000-C000-000000000046"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        private interface IClassFactory
        {
            [PreserveSig] int CreateInstance([MarshalAs(UnmanagedType.Interface)] object pUnkOuter, ref Guid riid, [MarshalAs(UnmanagedType.Interface)] out object ppvObject);
            [PreserveSig] int LockServer([MarshalAs(UnmanagedType.Bool)] bool fLock);
        }

        [UnmanagedFunctionPointer(CallingConvention.StdCall)]
        private delegate int DllGetClassObjectDelegate(ref Guid rclsid, ref Guid riid, [MarshalAs(UnmanagedType.Interface)] out object ppv);

        private enum REGKIND { REGKIND_DEFAULT = 0, REGKIND_REGISTER = 1, REGKIND_NONE = 2 }
        private const uint LOAD_WITH_ALTERED_SEARCH_PATH = 0x00000008;

        [DllImport("oleaut32.dll", CharSet = CharSet.Unicode, PreserveSig = true)]
        private static extern int LoadTypeLibEx(string szFile, REGKIND regkind, out ComTypes.ITypeLib pptlib);
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern bool SetDllDirectory(string lpPathName);
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern IntPtr LoadLibraryEx(string lpFileName, IntPtr hFile, uint dwFlags);
        [DllImport("kernel32.dll", CharSet = CharSet.Ansi, SetLastError = true)]
        private static extern IntPtr GetProcAddress(IntPtr hModule, string lpProcName);
        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool FreeLibrary(IntPtr hModule);
    }
}
