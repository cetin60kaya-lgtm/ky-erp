using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Net.Sockets;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows.Forms;
using ComTypes = System.Runtime.InteropServices.ComTypes;

namespace KyPdksFpClockProbe
{
    internal static class Program
    {
        [STAThread]
        private static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new ProbeForm());
        }
    }

    internal sealed class ProbeForm : Form
    {
        private readonly TextBox _ip = new TextBox { Width = 125, Text = "192.168.1.224" };
        private readonly NumericUpDown _port = new NumericUpDown { Minimum = 1, Maximum = 65535, Value = 5005, Width = 78 };
        private readonly NumericUpDown _dn = new NumericUpDown { Minimum = 1, Maximum = 255, Value = 1, Width = 60 };
        private readonly NumericUpDown _key = new NumericUpDown { Minimum = 0, Maximum = 99999999, Value = 0, Width = 90 };
        private readonly Button _run = new Button { Text = "FP_CLOCK DOSYASINI BUL + CİHAZI OKU", AutoSize = true, Height = 34 };
        private readonly Label _state = new Label { Text = "Hazır", AutoSize = true, Padding = new Padding(8, 8, 0, 0) };
        private readonly TextBox _log = new TextBox { Multiline = true, ReadOnly = true, ScrollBars = ScrollBars.Both, WordWrap = false, Dock = DockStyle.Fill, Font = new System.Drawing.Font("Consolas", 9.3f) };
        private readonly StringBuilder _report = new StringBuilder();

        public ProbeForm()
        {
            Text = "KY PDKS · FP_CLOCK Doğrudan Cihaz Okuma Testi v3";
            Width = 1100;
            Height = 720;
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
                Height = 70,
                Padding = new Padding(10, 7, 10, 5),
                Text = "SALT OKUMA / TANILAMA: Sabit C:\\Hedef500 yoluna bağlı değildir. Açık Hedef/Terminal uygulamasının gerçek klasörünü, C/D/E sürücülerindeki Hedef500 ve Terminal Bilgi Aktar klasörlerini ve gerekirse diski arar. FP_CLOCK.ocx bulunursa Windows COM kaydı değiştirilmeden registration-free activation context ile yüklemeyi dener. Cihaza saat, zil, kapı, silme veya reset komutu göndermez."
            };

            Controls.Add(_log);
            Controls.Add(note);
            Controls.Add(row);
            _run.Click += (_, __) => RunProbe();
        }

        private void Log(string text = "")
        {
            var line = $"[{DateTime.Now:HH:mm:ss}] {text}";
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

            IntPtr act = IntPtr.Zero;
            UIntPtr cookie = UIntPtr.Zero;
            object com = null;

            try
            {
                string ip = _ip.Text.Trim();
                int port = (int)_port.Value;
                int dn = (int)_dn.Value;
                int key = (int)_key.Value;

                Log("KY PDKS - FP_CLOCK DOĞRUDAN CİHAZ OKUMA TESTİ v3.0");
                Log($"Hedef: {ip}:{port} · Cihaz No={dn} · Comm Key={key}");
                Log("RISS kullanılmıyor. Hedef500 EXE/TXT köprüsü kullanılmıyor.");
                Log();

                TcpPrecheck(ip, port);
                Log();

                string ocxPath = FindFpClock();
                if (string.IsNullOrWhiteSpace(ocxPath))
                    throw new FileNotFoundException("FP_CLOCK.ocx açık Hedef uygulamasının klasöründe ve sabit sürücülerde bulunamadı.");

                string supportDir = Path.GetDirectoryName(ocxPath);
                Log("FP_CLOCK.ocx BULUNDU: " + ocxPath);
                Log("Boyut: " + new FileInfo(ocxPath).Length.ToString("N0") + " bayt");
                string dep = Path.Combine(supportDir, "TMPCCOMM.dll");
                Log("TMPCCOMM.dll: " + (File.Exists(dep) ? "BULUNDU · " + dep : "BULUNAMADI"));

                var classes = InspectTypeLibrary(ocxPath);
                if (classes.Count == 0)
                    throw new InvalidOperationException("FP_CLOCK.ocx TypeLib içinde COM coclass bulunamadı.");

                foreach (var c in classes)
                {
                    Log($"COM: {c.Name} · CLSID={c.Guid:B} · Metot={c.Methods.Count}");
                    var ints = c.Methods.Where(m => IsInteresting(m.Name)).OrderBy(m => m.Name).Select(m => m.Name + "(" + m.ParamCount + ")").Distinct();
                    Log("  Kritik: " + string.Join(", ", ints));
                }

                var selected = classes
                    .OrderByDescending(c => c.Methods.Any(m => Eq(m.Name, "OpenCommPort")))
                    .ThenByDescending(c => c.Methods.Any(m => Eq(m.Name, "SetIPAddress")))
                    .First();

                Log();
                Log($"Seçilen COM sınıfı: {selected.Name} · {selected.Guid:B}");

                string sandbox = PrepareSandbox(supportDir, selected.Guid);
                Log("Registration-free çalışma klasörü: " + sandbox);
                string manifest = Path.Combine(sandbox, "fpclock.manifest");

                SetDllDirectory(sandbox);
                var ctx = new ACTCTX
                {
                    cbSize = Marshal.SizeOf(typeof(ACTCTX)),
                    lpSource = manifest,
                    lpAssemblyDirectory = sandbox,
                    dwFlags = ACTCTX_FLAG_ASSEMBLY_DIRECTORY_VALID
                };
                act = CreateActCtx(ref ctx);
                if (act == INVALID_HANDLE_VALUE)
                    throw new InvalidOperationException("CreateActCtx başarısız. Win32=" + Marshal.GetLastWin32Error());
                if (!ActivateActCtx(act, out cookie))
                    throw new InvalidOperationException("ActivateActCtx başarısız. Win32=" + Marshal.GetLastWin32Error());

                Log("Registration-free COM activation context AKTİF.");

                Type t = Type.GetTypeFromCLSID(selected.Guid, true);
                com = Activator.CreateInstance(t);
                Log("FP_CLOCK COM nesnesi OLUŞTURULDU.");

                var setIpMethod = selected.Methods.FirstOrDefault(m => Eq(m.Name, "SetIPAddress"));
                if (setIpMethod == null) throw new MissingMethodException("SetIPAddress metodu bulunamadı.");
                object setResult = CallSetIp(t, com, setIpMethod.ParamCount, ip, port, dn, key);
                Log("SetIPAddress sonucu: " + Format(setResult));

                var openMethod = selected.Methods.FirstOrDefault(m => Eq(m.Name, "OpenCommPort"));
                if (openMethod == null) throw new MissingMethodException("OpenCommPort metodu bulunamadı.");
                object openResult = CallOpen(t, com, openMethod.ParamCount, dn);
                Log("OpenCommPort sonucu: " + Format(openResult));

                bool opened = LooksSuccessful(openResult);
                Log("FP_CLOCK OTURUMU: " + (opened ? "BAŞARILI" : "SONUÇ BAŞARI OLARAK DOĞRULANAMADI"));

                if (opened)
                {
                    Log();
                    TryReadTime(t, com, selected, dn);
                    TryReadStatus(t, com, selected, dn);
                    TryReadInfo(t, com, selected, dn);
                }

                Log();
                Log(opened
                    ? "SONUÇ: CİHAZLA FP_CLOCK ÜZERİNDEN DOĞRUDAN HABERLEŞME KURULDU."
                    : "SONUÇ: OCX doğru yüklendi fakat cihaz oturumu henüz açılmadı; ham sonuç yukarıda.");
                _state.Text = opened ? "BAĞLANTI BAŞARILI" : "OCX OK / OTURUM YOK";
            }
            catch (Exception ex)
            {
                Exception root = Unwrap(ex);
                Log();
                Log("HATA: " + root.Message);
                Log("Tip: " + root.GetType().FullName);
                if (root is COMException ce) Log("HRESULT: 0x" + ce.ErrorCode.ToString("X8"));
                _state.Text = "HATA";
            }
            finally
            {
                try
                {
                    if (com != null && Marshal.IsComObject(com)) Marshal.FinalReleaseComObject(com);
                }
                catch { }
                try
                {
                    if (cookie != UIntPtr.Zero) DeactivateActCtx(0, cookie);
                    if (act != IntPtr.Zero && act != INVALID_HANDLE_VALUE) ReleaseActCtx(act);
                    SetDllDirectory(null);
                }
                catch { }

                string report = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), "KY-PDKS-FPClock-Cihaz-Raporu-v3.txt");
                try { File.WriteAllText(report, _report.ToString(), new UTF8Encoding(true)); Log("Rapor: " + report); } catch { }
                _run.Enabled = true;
            }
        }

        private void TcpPrecheck(string ip, int port)
        {
            var sw = Stopwatch.StartNew();
            using (var c = new TcpClient())
            {
                var ar = c.BeginConnect(ip, port, null, null);
                if (!ar.AsyncWaitHandle.WaitOne(2500)) throw new TimeoutException("TCP bağlantı zaman aşımı.");
                c.EndConnect(ar);
                sw.Stop();
                Log($"TCP: BAŞARILI · {sw.ElapsedMilliseconds} ms · {c.Client.LocalEndPoint} -> {c.Client.RemoteEndPoint}");
            }
        }

        private string FindFpClock()
        {
            var candidates = new List<string>();

            Log("FP_CLOCK dosya keşfi başlıyor...");

            foreach (Process p in Process.GetProcesses())
            {
                try
                {
                    string title = p.MainWindowTitle ?? "";
                    string name = p.ProcessName ?? "";
                    if (title.IndexOf("Hedef", StringComparison.OrdinalIgnoreCase) < 0 &&
                        title.IndexOf("Terminal", StringComparison.OrdinalIgnoreCase) < 0 &&
                        name.IndexOf("Hedef", StringComparison.OrdinalIgnoreCase) < 0 &&
                        name.IndexOf("Terminal", StringComparison.OrdinalIgnoreCase) < 0)
                        continue;

                    string exe = p.MainModule?.FileName;
                    if (string.IsNullOrWhiteSpace(exe)) continue;
                    Log("Açık uygulama: " + name + " · " + exe);
                    string dir = Path.GetDirectoryName(exe);
                    AddCandidate(candidates, Path.Combine(dir, "support", "FP_CLOCK.ocx"));
                    AddCandidate(candidates, Path.Combine(dir, "Terminal Bilgi Aktar", "support", "FP_CLOCK.ocx"));
                    AddCandidate(candidates, Path.Combine(Directory.GetParent(dir)?.FullName ?? dir, "Terminal Bilgi Aktar", "support", "FP_CLOCK.ocx"));
                }
                catch { }
                finally { try { p.Dispose(); } catch { } }
            }

            string[] roots = { @"C:\Hedef500", @"D:\Hedef500", @"E:\Hedef500", @"C:\HEDEF", @"D:\HEDEF", @"E:\HEDEF" };
            foreach (string r in roots)
            {
                AddCandidate(candidates, Path.Combine(r, "Terminal Bilgi Aktar", "support", "FP_CLOCK.ocx"));
                AddCandidate(candidates, Path.Combine(r, "support", "FP_CLOCK.ocx"));
            }

            foreach (string p in candidates.Distinct(StringComparer.OrdinalIgnoreCase))
            {
                Log("Aday: " + p + (File.Exists(p) ? " · BULUNDU" : ""));
                if (File.Exists(p)) return p;
            }

            foreach (DriveInfo d in DriveInfo.GetDrives().Where(x => x.IsReady && x.DriveType == DriveType.Fixed))
            {
                Log("Hızlı klasör taraması: " + d.RootDirectory.FullName);
                string found = SearchDriveSmart(d.RootDirectory.FullName);
                if (!string.IsNullOrWhiteSpace(found)) return found;
            }

            return null;
        }

        private static void AddCandidate(List<string> list, string p)
        {
            if (!string.IsNullOrWhiteSpace(p)) list.Add(p);
        }

        private string SearchDriveSmart(string root)
        {
            var q = new Queue<Tuple<string, int>>();
            q.Enqueue(Tuple.Create(root, 0));
            int scanned = 0;
            const int maxDirs = 25000;

            while (q.Count > 0 && scanned < maxDirs)
            {
                var item = q.Dequeue();
                string dir = item.Item1;
                int depth = item.Item2;
                scanned++;
                try
                {
                    string direct = Path.Combine(dir, "FP_CLOCK.ocx");
                    if (File.Exists(direct))
                    {
                        Log("Disk taramasında BULUNDU: " + direct);
                        return direct;
                    }

                    if (depth >= 6) continue;
                    foreach (string sub in Directory.EnumerateDirectories(dir))
                    {
                        string n = Path.GetFileName(sub) ?? "";
                        if (n.Equals("$Recycle.Bin", StringComparison.OrdinalIgnoreCase) ||
                            n.Equals("System Volume Information", StringComparison.OrdinalIgnoreCase) ||
                            n.Equals("WinSxS", StringComparison.OrdinalIgnoreCase) ||
                            n.Equals("node_modules", StringComparison.OrdinalIgnoreCase) ||
                            n.Equals(".git", StringComparison.OrdinalIgnoreCase))
                            continue;

                        bool priority = n.IndexOf("hedef", StringComparison.OrdinalIgnoreCase) >= 0 ||
                                        n.IndexOf("terminal", StringComparison.OrdinalIgnoreCase) >= 0 ||
                                        n.IndexOf("pdks", StringComparison.OrdinalIgnoreCase) >= 0 ||
                                        n.IndexOf("support", StringComparison.OrdinalIgnoreCase) >= 0;
                        if (priority) q.Enqueue(Tuple.Create(sub, depth + 1));
                        else if (depth < 3) q.Enqueue(Tuple.Create(sub, depth + 1));
                    }
                }
                catch { }
            }
            Log("  Taranan klasör: " + scanned);
            return null;
        }

        private List<ComCandidate> InspectTypeLibrary(string path)
        {
            var result = new List<ComCandidate>();
            ComTypes.ITypeLib lib;
            int hr = LoadTypeLibEx(path, REGKIND.REGKIND_NONE, out lib);
            if (hr != 0 || lib == null) Marshal.ThrowExceptionForHR(hr);
            try
            {
                int count = lib.GetTypeInfoCount();
                Log("TypeLib yüklendi · TypeInfo=" + count);
                for (int i = 0; i < count; i++)
                {
                    lib.GetTypeInfoType(i, out ComTypes.TYPEKIND kind);
                    if (kind != ComTypes.TYPEKIND.TKIND_COCLASS) continue;
                    lib.GetTypeInfo(i, out ComTypes.ITypeInfo ti);
                    IntPtr pAttr = IntPtr.Zero;
                    try
                    {
                        ti.GetTypeAttr(out pAttr);
                        var attr = (ComTypes.TYPEATTR)Marshal.PtrToStructure(pAttr, typeof(ComTypes.TYPEATTR));
                        ti.GetDocumentation(-1, out string name, out _, out _, out _);
                        var methods = new List<MethodDesc>();
                        for (int impl = 0; impl < attr.cImplTypes; impl++)
                        {
                            try
                            {
                                ti.GetRefTypeOfImplType(impl, out int href);
                                ti.GetRefTypeInfo(href, out ComTypes.ITypeInfo iface);
                                try { CollectMethods(iface, methods); }
                                finally { if (Marshal.IsComObject(iface)) Marshal.ReleaseComObject(iface); }
                            }
                            catch { }
                        }
                        result.Add(new ComCandidate { Name = name ?? "COM", Guid = attr.guid, Methods = methods });
                    }
                    finally
                    {
                        if (pAttr != IntPtr.Zero) ti.ReleaseTypeAttr(pAttr);
                        if (Marshal.IsComObject(ti)) Marshal.ReleaseComObject(ti);
                    }
                }
            }
            finally { if (Marshal.IsComObject(lib)) Marshal.ReleaseComObject(lib); }
            return result;
        }

        private static void CollectMethods(ComTypes.ITypeInfo ti, List<MethodDesc> methods)
        {
            IntPtr pAttr = IntPtr.Zero;
            try
            {
                ti.GetTypeAttr(out pAttr);
                var attr = (ComTypes.TYPEATTR)Marshal.PtrToStructure(pAttr, typeof(ComTypes.TYPEATTR));
                for (int i = 0; i < attr.cFuncs; i++)
                {
                    IntPtr pFunc = IntPtr.Zero;
                    try
                    {
                        ti.GetFuncDesc(i, out pFunc);
                        var fd = (ComTypes.FUNCDESC)Marshal.PtrToStructure(pFunc, typeof(ComTypes.FUNCDESC));
                        var names = new string[Math.Max(1, fd.cParams + 1)];
                        ti.GetNames(fd.memid, names, names.Length, out int got);
                        if (got > 0 && !string.IsNullOrWhiteSpace(names[0]))
                            methods.Add(new MethodDesc { Name = names[0], ParamCount = fd.cParams });
                    }
                    catch { }
                    finally { if (pFunc != IntPtr.Zero) ti.ReleaseFuncDesc(pFunc); }
                }
            }
            finally { if (pAttr != IntPtr.Zero) ti.ReleaseTypeAttr(pAttr); }
        }

        private string PrepareSandbox(string supportDir, Guid clsid)
        {
            string dir = Path.Combine(Path.GetTempPath(), "KY-PDKS-FPClock-v3");
            if (Directory.Exists(dir))
            {
                try { Directory.Delete(dir, true); } catch { }
            }
            Directory.CreateDirectory(dir);

            foreach (string file in Directory.EnumerateFiles(supportDir))
            {
                try { File.Copy(file, Path.Combine(dir, Path.GetFileName(file)), true); } catch { }
            }

            string manifest = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\r\n" +
                "<assembly manifestVersion=\"1.0\" xmlns=\"urn:schemas-microsoft-com:asm.v1\">\r\n" +
                "  <assemblyIdentity type=\"win32\" name=\"KY.PDKS.FPClock.Activation\" version=\"1.0.0.0\"/>\r\n" +
                "  <file name=\"FP_CLOCK.ocx\">\r\n" +
                "    <comClass clsid=\"" + clsid.ToString("B") + "\" threadingModel=\"Apartment\"/>\r\n" +
                "  </file>\r\n" +
                "</assembly>";
            File.WriteAllText(Path.Combine(dir, "fpclock.manifest"), manifest, new UTF8Encoding(false));
            return dir;
        }

        private object CallSetIp(Type t, object com, int pc, string ip, int port, int dn, int key)
        {
            if (pc == 2) return Invoke(t, com, "SetIPAddress", new object[] { ip, port });
            if (pc == 3) return Invoke(t, com, "SetIPAddress", new object[] { ip, port, key });
            if (pc == 4) return Invoke(t, com, "SetIPAddress", new object[] { ip, port, dn, key });

            Exception last = null;
            foreach (object[] a in new[] { new object[] { ip, port, key }, new object[] { ip, port }, new object[] { ip, port, dn, key } })
            {
                try { return Invoke(t, com, "SetIPAddress", a); } catch (Exception ex) { last = ex; }
            }
            throw last ?? new MissingMethodException("SetIPAddress çağrı biçimi belirlenemedi.");
        }

        private object CallOpen(Type t, object com, int pc, int dn)
        {
            if (pc == 0) return Invoke(t, com, "OpenCommPort", new object[0]);
            if (pc == 1) return Invoke(t, com, "OpenCommPort", new object[] { dn });
            Exception last = null;
            foreach (object[] a in new[] { new object[] { dn }, new object[0] })
            {
                try { return Invoke(t, com, "OpenCommPort", a); } catch (Exception ex) { last = ex; }
            }
            throw last ?? new MissingMethodException("OpenCommPort çağrı biçimi belirlenemedi.");
        }

        private void TryReadTime(Type t, object com, ComCandidate c, int dn)
        {
            var m = c.Methods.FirstOrDefault(x => Eq(x.Name, "GetDeviceTime"));
            if (m == null) { Log("GetDeviceTime: metot yok"); return; }
            try
            {
                object[] a = { dn, 0, 0, 0, 0, 0, 0 };
                var pm = new ParameterModifier(a.Length);
                for (int i = 1; i < a.Length; i++) pm[i] = true;
                object ret = t.InvokeMember("GetDeviceTime", BindingFlags.InvokeMethod, null, com, a, new[] { pm }, CultureInfo.InvariantCulture, null);
                Log($"GetDeviceTime: {Format(ret)} · {a[1]}-{a[2]}-{a[3]} {a[4]}:{a[5]} · DOW={a[6]}");
            }
            catch (Exception ex) { Log("GetDeviceTime HATA: " + Unwrap(ex).Message); }
        }

        private void TryReadStatus(Type t, object com, ComCandidate c, int dn)
        {
            var m = c.Methods.FirstOrDefault(x => Eq(x.Name, "GetDeviceStatus"));
            if (m == null) { Log("GetDeviceStatus: metot yok"); return; }
            Log("GetDeviceStatus sayaçları:");
            for (int code = 1; code <= 7; code++)
            {
                try
                {
                    object[] a = { dn, code, 0 };
                    var pm = new ParameterModifier(3); pm[2] = true;
                    object ret = t.InvokeMember("GetDeviceStatus", BindingFlags.InvokeMethod, null, com, a, new[] { pm }, CultureInfo.InvariantCulture, null);
                    Log($"  Kod {code}: {a[2]} · sonuç={Format(ret)}");
                }
                catch (Exception ex) { Log($"  Kod {code}: HATA · {Unwrap(ex).Message}"); }
            }
        }

        private void TryReadInfo(Type t, object com, ComCandidate c, int dn)
        {
            var m = c.Methods.FirstOrDefault(x => Eq(x.Name, "GetDeviceInfo"));
            if (m == null) { Log("GetDeviceInfo: metot yok"); return; }
            Log("GetDeviceInfo alanları:");
            for (int code = 1; code <= 9; code++)
            {
                try
                {
                    object[] a = { dn, code, 0 };
                    var pm = new ParameterModifier(3); pm[2] = true;
                    object ret = t.InvokeMember("GetDeviceInfo", BindingFlags.InvokeMethod, null, com, a, new[] { pm }, CultureInfo.InvariantCulture, null);
                    Log($"  Kod {code}: {a[2]} · sonuç={Format(ret)}");
                }
                catch (Exception ex) { Log($"  Kod {code}: HATA · {Unwrap(ex).Message}"); }
            }
        }

        private static object Invoke(Type t, object target, string name, object[] args)
        {
            return t.InvokeMember(name, BindingFlags.InvokeMethod, null, target, args, CultureInfo.InvariantCulture);
        }

        private static bool LooksSuccessful(object v)
        {
            if (v == null) return true;
            if (v is bool b) return b;
            try { return Convert.ToInt64(v, CultureInfo.InvariantCulture) > 0; } catch { }
            string s = Convert.ToString(v, CultureInfo.InvariantCulture);
            return string.Equals(s, "true", StringComparison.OrdinalIgnoreCase) || string.Equals(s, "ok", StringComparison.OrdinalIgnoreCase);
        }

        private static bool IsInteresting(string s)
        {
            string x = (s ?? "").ToLowerInvariant();
            return x.Contains("comm") || x.Contains("device") || x.Contains("ipaddress") || x.Contains("log") || x.Contains("bell") || x.Contains("door") || x.Contains("enroll") || x.Contains("user");
        }

        private static bool Eq(string a, string b) => string.Equals(a, b, StringComparison.OrdinalIgnoreCase);
        private static string Format(object v) => v == null ? "(null)" : Convert.ToString(v, CultureInfo.InvariantCulture);
        private static Exception Unwrap(Exception ex) => ex is TargetInvocationException && ex.InnerException != null ? ex.InnerException : ex;

        private sealed class ComCandidate
        {
            public string Name;
            public Guid Guid;
            public List<MethodDesc> Methods = new List<MethodDesc>();
        }

        private sealed class MethodDesc
        {
            public string Name;
            public int ParamCount;
        }

        private const uint ACTCTX_FLAG_ASSEMBLY_DIRECTORY_VALID = 0x004;
        private static readonly IntPtr INVALID_HANDLE_VALUE = new IntPtr(-1);

        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        private struct ACTCTX
        {
            public int cbSize;
            public uint dwFlags;
            [MarshalAs(UnmanagedType.LPWStr)] public string lpSource;
            public ushort wProcessorArchitecture;
            public ushort wLangId;
            [MarshalAs(UnmanagedType.LPWStr)] public string lpAssemblyDirectory;
            [MarshalAs(UnmanagedType.LPWStr)] public string lpResourceName;
            [MarshalAs(UnmanagedType.LPWStr)] public string lpApplicationName;
            public IntPtr hModule;
        }

        private enum REGKIND
        {
            REGKIND_DEFAULT = 0,
            REGKIND_REGISTER = 1,
            REGKIND_NONE = 2
        }

        [DllImport("oleaut32.dll", CharSet = CharSet.Unicode, PreserveSig = true)]
        private static extern int LoadTypeLibEx(string szFile, REGKIND regkind, out ComTypes.ITypeLib pptlib);

        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern bool SetDllDirectory(string lpPathName);

        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern IntPtr CreateActCtx(ref ACTCTX pActCtx);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool ActivateActCtx(IntPtr hActCtx, out UIntPtr lpCookie);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool DeactivateActCtx(uint dwFlags, UIntPtr ulCookie);

        [DllImport("kernel32.dll")]
        private static extern void ReleaseActCtx(IntPtr hActCtx);
    }
}
