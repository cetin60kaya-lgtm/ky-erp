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

namespace KyPdksFpClockProbeV7
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

        [DllImport("ole32.dll")] private static extern int OleInitialize(IntPtr pvReserved);
        [DllImport("ole32.dll")] private static extern void OleUninitialize();
    }

    internal sealed class ProbeForm : Form
    {
        private readonly TextBox _ip = new TextBox { Width = 125, Text = "192.168.1.224" };
        private readonly NumericUpDown _port = new NumericUpDown { Minimum = 1, Maximum = 65535, Value = 5005, Width = 78 };
        private readonly NumericUpDown _dn = new NumericUpDown { Minimum = 1, Maximum = 255, Value = 1, Width = 60 };
        private readonly NumericUpDown _key = new NumericUpDown { Minimum = 0, Maximum = 99999999, Value = 0, Width = 90 };
        private readonly Button _run = new Button { Text = "REF STRING İLE CİHAZI OKU", AutoSize = true, Height = 34 };
        private readonly Label _state = new Label { Text = "Hazır", AutoSize = true, Padding = new Padding(8, 8, 0, 0) };
        private readonly TextBox _log = new TextBox { Multiline = true, ReadOnly = true, ScrollBars = ScrollBars.Both, WordWrap = false, Dock = DockStyle.Fill, Font = new System.Drawing.Font("Consolas", 9.2f) };
        private readonly StringBuilder _report = new StringBuilder();
        private NativeAxHost _axHost;
        private readonly List<IntPtr> _loaded = new List<IntPtr>();

        private static readonly Guid FpClockClsid = new Guid("87733EE1-D095-442B-A200-6DE90C5C8318");
        private const uint LOAD_WITH_ALTERED_SEARCH_PATH = 0x00000008;

        public ProbeForm()
        {
            Text = "KY PDKS · FP_CLOCK Doğrudan Cihaz Testi v7";
            Width = 1180;
            Height = 800;
            StartPosition = FormStartPosition.CenterScreen;

            var row = new FlowLayoutPanel { Dock = DockStyle.Top, Height = 56, Padding = new Padding(8), WrapContents = false };
            row.Controls.Add(new Label { Text = "IP", AutoSize = true, Padding = new Padding(0, 7, 0, 0) }); row.Controls.Add(_ip);
            row.Controls.Add(new Label { Text = "Port", AutoSize = true, Padding = new Padding(8, 7, 0, 0) }); row.Controls.Add(_port);
            row.Controls.Add(new Label { Text = "Cihaz No", AutoSize = true, Padding = new Padding(8, 7, 0, 0) }); row.Controls.Add(_dn);
            row.Controls.Add(new Label { Text = "Comm Key", AutoSize = true, Padding = new Padding(8, 7, 0, 0) }); row.Controls.Add(_key);
            row.Controls.Add(_run); row.Controls.Add(_state);

            Controls.Add(_log);
            Controls.Add(new Label { Dock = DockStyle.Top, Height = 76, Padding = new Padding(10, 7, 10, 5), Text = "SALT OKUMA v7: Resmî SBXPC/FP_CLOCK imzasına göre SetIPAddress(ref string, int, int) çağrılır. v6'daki DISP_E_TYPEMISMATCH bu ref-string marshaling eksikliğinden kaynaklanıyordu. Cihazda saat/zil/kapı/silme/reset işlemi yapılmaz." });
            Controls.Add(row);
            _run.Click += (_, __) => RunProbe();
        }

        private void Log(string s = "")
        {
            string line = $"[{DateTime.Now:HH:mm:ss}] {s}";
            _report.AppendLine(line);
            _log.AppendText(line + Environment.NewLine);
            Application.DoEvents();
        }

        private void RunProbe()
        {
            if (!_run.Enabled) return;
            _run.Enabled = false; _state.Text = "Çalışıyor..."; _log.Clear(); _report.Clear();
            string oldPath = Environment.GetEnvironmentVariable("PATH") ?? "";
            try
            {
                string ip = _ip.Text.Trim(); int port = (int)_port.Value; int dn = (int)_dn.Value; int key = (int)_key.Value;
                Log("KY PDKS - FP_CLOCK REF STRING DOĞRUDAN CİHAZ TESTİ v7.0");
                Log($"Hedef: {ip}:{port} · Cihaz No={dn} · Comm Key={key}");
                Log("Resmî imza: SetIPAddress(ref string IPAddress, int Port, int Password)");
                Log(); TcpPrecheck(ip, port); Log();

                string ocx = FindExactOnDrives("FP_CLOCK.ocx");
                if (string.IsNullOrWhiteSpace(ocx)) throw new FileNotFoundException("FP_CLOCK.ocx bulunamadı.");
                string support = Path.GetDirectoryName(ocx);
                string tmp = Path.Combine(support, "TMPCCOMM.dll");
                if (!File.Exists(tmp)) throw new FileNotFoundException("TMPCCOMM.dll bulunamadı.");
                string ch = FindExactOnDrives("CH375DLL.DLL");
                Log("FP_CLOCK.ocx: " + ocx); Log("TMPCCOMM.dll: " + tmp); Log("CH375DLL.DLL: " + (ch ?? "BULUNAMADI"));

                var dirs = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                AddDir(dirs, support); AddDir(dirs, Directory.GetParent(support)?.FullName); AddDir(dirs, Environment.SystemDirectory); AddDir(dirs, Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Windows), "SysWOW64")); if (!string.IsNullOrWhiteSpace(ch)) AddDir(dirs, Path.GetDirectoryName(ch));
                Environment.SetEnvironmentVariable("PATH", string.Join(";", dirs) + ";" + oldPath); SetDllDirectory(support);
                if (!string.IsNullOrWhiteSpace(ch)) LoadKeep(ch, "CH375DLL.DLL"); LoadKeep(tmp, "TMPCCOMM.dll"); IntPtr hOcx = LoadKeep(ocx, "FP_CLOCK.ocx");

                IntPtr p = GetProcAddress(hOcx, "DllGetClassObject"); if (p == IntPtr.Zero) throw new MissingMethodException("DllGetClassObject yok.");
                var getClassObject = (DllGetClassObjectDelegate)Marshal.GetDelegateForFunctionPointer(p, typeof(DllGetClassObjectDelegate));
                object raw = CreateNativeControl(getClassObject, FpClockClsid); Log("Native IDispatch nesnesi oluşturuldu.");

                _axHost?.Dispose();
                _axHost = new NativeAxHost(FpClockClsid, raw) { Width = 1, Height = 1, Left = -100, Top = -100, Visible = true };
                ((ISupportInitialize)_axHost).BeginInit(); Controls.Add(_axHost); ((ISupportInitialize)_axHost).EndInit(); _axHost.CreateControl(); Application.DoEvents();
                object com = _axHost.NativeObject; if (com == null) throw new InvalidOperationException("AxHost GetOcx null döndürdü.");
                Log("ActiveX host hazır · IsHandleCreated=" + _axHost.IsHandleCreated);

                Type t = com.GetType();
                object[] setArgs = { ip, port, key };
                var setPm = new ParameterModifier(3); setPm[0] = true;
                object setRet = t.InvokeMember("SetIPAddress", BindingFlags.InvokeMethod, null, com, setArgs, new[] { setPm }, CultureInfo.InvariantCulture, null);
                Log("SetIPAddress(ref string) sonucu: " + F(setRet) + " · IP geri=" + F(setArgs[0]));

                object openRet = t.InvokeMember("OpenCommPort", BindingFlags.InvokeMethod, null, com, new object[] { dn }, CultureInfo.InvariantCulture);
                Log("OpenCommPort sonucu: " + F(openRet));

                bool ok = ReadTime(t, com, dn);
                if (!ok) TryLastError(t, com);
                if (ok) { ReadStatus(t, com, dn); ReadInfo(t, com, dn); Log(); Log("SONUÇ: FP_CLOCK İLE CİHAZ DOĞRUDAN OKUNDU."); _state.Text = "BAĞLANTI BAŞARILI"; }
                else { Log(); Log("SONUÇ: SetIPAddress/OpenCommPort çalıştı ancak cihaz saati doğrulanamadı."); _state.Text = "OTURUM AÇILDI / OKUMA YOK"; }
            }
            catch (Exception ex)
            {
                var r = U(ex); Log(); Log("HATA: " + D(r)); TryLogLastErrorFromHost(); _state.Text = "HATA";
            }
            finally
            {
                try { SetDllDirectory(null); Environment.SetEnvironmentVariable("PATH", oldPath); } catch { }
                string report = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), "KY-PDKS-FPClock-Cihaz-Raporu-v7.txt");
                try { File.WriteAllText(report, _report.ToString(), new UTF8Encoding(true)); Log("Rapor: " + report); } catch { }
                _run.Enabled = true;
            }
        }

        private bool ReadTime(Type t, object com, int dn)
        {
            try
            {
                object[] a = { dn, 0, 0, 0, 0, 0, 0 }; var pm = new ParameterModifier(7); for (int i = 1; i < 7; i++) pm[i] = true;
                object ret = t.InvokeMember("GetDeviceTime", BindingFlags.InvokeMethod, null, com, a, new[] { pm }, CultureInfo.InvariantCulture, null);
                Log($"GetDeviceTime: {F(ret)} · {a[1]}-{a[2]}-{a[3]} {a[4]}:{a[5]} · DOW={a[6]}");
                int y; return int.TryParse(F(a[1]), out y) && y >= 2000 && y <= 2100;
            }
            catch (Exception ex) { Log("GetDeviceTime HATA: " + D(U(ex))); return false; }
        }

        private void ReadStatus(Type t, object com, int dn)
        {
            Log("GetDeviceStatus:"); for (int code = 1; code <= 7; code++) { try { object[] a = { dn, code, 0 }; var pm = new ParameterModifier(3); pm[2] = true; object r = t.InvokeMember("GetDeviceStatus", BindingFlags.InvokeMethod, null, com, a, new[] { pm }, CultureInfo.InvariantCulture, null); Log($"  {code}: {a[2]} · {F(r)}"); } catch (Exception ex) { Log($"  {code}: HATA · {D(U(ex))}"); } }
        }

        private void ReadInfo(Type t, object com, int dn)
        {
            Log("GetDeviceInfo:"); for (int code = 1; code <= 9; code++) { try { object[] a = { dn, code, 0 }; var pm = new ParameterModifier(3); pm[2] = true; object r = t.InvokeMember("GetDeviceInfo", BindingFlags.InvokeMethod, null, com, a, new[] { pm }, CultureInfo.InvariantCulture, null); Log($"  {code}: {a[2]} · {F(r)}"); } catch (Exception ex) { Log($"  {code}: HATA · {D(U(ex))}"); } }
        }

        private void TryLastError(Type t, object com)
        {
            try { object[] a = { 0 }; var pm = new ParameterModifier(1); pm[0] = true; object r = t.InvokeMember("GetLastError", BindingFlags.InvokeMethod, null, com, a, new[] { pm }, CultureInfo.InvariantCulture, null); Log("GetLastError: " + a[0] + " · ret=" + F(r)); } catch (Exception ex) { Log("GetLastError okunamadı: " + D(U(ex))); }
        }

        private void TryLogLastErrorFromHost()
        {
            try { object com = _axHost?.NativeObject; if (com != null) TryLastError(com.GetType(), com); } catch { }
        }

        private void TcpPrecheck(string ip, int port)
        {
            var sw = Stopwatch.StartNew(); using (var c = new TcpClient()) { var ar = c.BeginConnect(ip, port, null, null); if (!ar.AsyncWaitHandle.WaitOne(2500)) throw new TimeoutException("TCP zaman aşımı."); c.EndConnect(ar); sw.Stop(); Log($"TCP: BAŞARILI · {sw.ElapsedMilliseconds} ms · {c.Client.LocalEndPoint} -> {c.Client.RemoteEndPoint}"); }
        }

        private string FindExactOnDrives(string name)
        {
            string[] known = name.Equals("FP_CLOCK.ocx", StringComparison.OrdinalIgnoreCase) ? new[] { @"D:\personel yedek son\Terminal Bilgi Aktar\support\FP_CLOCK.ocx", @"C:\Hedef500\Terminal Bilgi Aktar\support\FP_CLOCK.ocx" } : name.Equals("CH375DLL.DLL", StringComparison.OrdinalIgnoreCase) ? new[] { @"C:\Program Files\SAi\SAi Production Suite 21\Program\CH375DLL.DLL" } : new string[0];
            foreach (var p in known) if (File.Exists(p)) return p;
            foreach (DriveInfo d in DriveInfo.GetDrives().Where(x => x.IsReady && x.DriveType == DriveType.Fixed)) { var q = new Queue<Tuple<string,int>>(); q.Enqueue(Tuple.Create(d.RootDirectory.FullName,0)); int n=0; while(q.Count>0 && n++<90000){ var it=q.Dequeue(); try { string f=Path.Combine(it.Item1,name); if(File.Exists(f)) return f; if(it.Item2>=7) continue; foreach(string s in Directory.EnumerateDirectories(it.Item1)){ string z=Path.GetFileName(s)??""; if(z.Equals("$Recycle.Bin",StringComparison.OrdinalIgnoreCase)||z.Equals("System Volume Information",StringComparison.OrdinalIgnoreCase)||z.Equals("WinSxS",StringComparison.OrdinalIgnoreCase)||z.Equals("node_modules",StringComparison.OrdinalIgnoreCase)||z.Equals(".git",StringComparison.OrdinalIgnoreCase)) continue; q.Enqueue(Tuple.Create(s,it.Item2+1)); } } catch{} } }
            return null;
        }

        private IntPtr LoadKeep(string path, string label) { IntPtr h = LoadLibraryEx(path, IntPtr.Zero, LOAD_WITH_ALTERED_SEARCH_PATH); if (h == IntPtr.Zero) throw new InvalidOperationException(label + " yüklenemedi · Win32=" + Marshal.GetLastWin32Error()); _loaded.Add(h); Log(label + " YÜKLENDİ."); return h; }
        private static object CreateNativeControl(DllGetClassObjectDelegate fn, Guid clsid) { object facObj; Guid iidFac=new Guid("00000001-0000-0000-C000-000000000046"); int hr=fn(ref clsid,ref iidFac,out facObj); if(hr<0||facObj==null) Marshal.ThrowExceptionForHR(hr); try { var fac=(IClassFactory)facObj; Guid iidDisp=new Guid("00020400-0000-0000-C000-000000000046"); object obj; hr=fac.CreateInstance(null,ref iidDisp,out obj); if(hr<0||obj==null) Marshal.ThrowExceptionForHR(hr); return obj; } finally { try { if(Marshal.IsComObject(facObj)) Marshal.FinalReleaseComObject(facObj); } catch{} } }
        private static void AddDir(HashSet<string> d,string p){ if(!string.IsNullOrWhiteSpace(p)&&Directory.Exists(p)) d.Add(p); }
        private static string F(object v)=>v==null?"(null)":Convert.ToString(v,CultureInfo.InvariantCulture);
        private static Exception U(Exception e)=>e is TargetInvocationException&&e.InnerException!=null?e.InnerException:e;
        private static string D(Exception e)=>e is COMException c?c.Message+" · HRESULT=0x"+c.ErrorCode.ToString("X8"):e.Message+" · "+e.GetType().FullName;

        private sealed class NativeAxHost : AxHost { private readonly object _obj; public NativeAxHost(Guid g,object o):base(g.ToString("B")){_obj=o;} protected override object CreateInstanceCore(Guid clsid)=>_obj; public object NativeObject=>GetOcx(); }
        [ComImport,Guid("00000001-0000-0000-C000-000000000046"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] private interface IClassFactory { [PreserveSig] int CreateInstance([MarshalAs(UnmanagedType.Interface)] object pUnkOuter,ref Guid riid,[MarshalAs(UnmanagedType.Interface)] out object ppvObject); [PreserveSig] int LockServer([MarshalAs(UnmanagedType.Bool)] bool fLock); }
        [UnmanagedFunctionPointer(CallingConvention.StdCall)] private delegate int DllGetClassObjectDelegate(ref Guid rclsid,ref Guid riid,[MarshalAs(UnmanagedType.Interface)] out object ppv);
        [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] private static extern bool SetDllDirectory(string lpPathName);
        [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] private static extern IntPtr LoadLibraryEx(string lpFileName,IntPtr hFile,uint dwFlags);
        [DllImport("kernel32.dll",CharSet=CharSet.Ansi,SetLastError=true)] private static extern IntPtr GetProcAddress(IntPtr hModule,string lpProcName);
        [DllImport("ole32.dll")] private static extern int OleInitialize(IntPtr pvReserved);
        [DllImport("ole32.dll")] private static extern void OleUninitialize();
    }
}
