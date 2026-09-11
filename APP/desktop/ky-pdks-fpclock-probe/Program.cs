using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;
using System.Text;
using System.Windows.Forms;

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
        private readonly TextBox _ocx = new TextBox { Width = 520, Text = @"C:\Hedef500\Terminal Bilgi Aktar\support\FP_CLOCK.ocx" };
        private readonly TextBox _ip = new TextBox { Width = 125, Text = "192.168.1.224" };
        private readonly NumericUpDown _port = new NumericUpDown { Minimum = 1, Maximum = 65535, Value = 5005, Width = 78 };
        private readonly NumericUpDown _dn = new NumericUpDown { Minimum = 1, Maximum = 255, Value = 1, Width = 60 };
        private readonly NumericUpDown _key = new NumericUpDown { Minimum = 0, Maximum = 99999999, Value = 0, Width = 90 };
        private readonly Button _run = new Button { Text = "FP_CLOCK İLE CİHAZI OKU", AutoSize = true, Height = 34 };
        private readonly Label _state = new Label { Text = "Hazır", AutoSize = true, Padding = new Padding(8, 8, 0, 0) };
        private readonly TextBox _log = new TextBox { Multiline = true, ReadOnly = true, ScrollBars = ScrollBars.Both, WordWrap = false, Dock = DockStyle.Fill, Font = new System.Drawing.Font("Consolas", 9.5f) };
        private readonly StringBuilder _report = new StringBuilder();

        public ProbeForm()
        {
            Text = "KY PDKS · FP_CLOCK Doğrudan Cihaz Okuma Testi";
            Width = 1040;
            Height = 700;
            StartPosition = FormStartPosition.CenterScreen;

            var row1 = new FlowLayoutPanel { Dock = DockStyle.Top, Height = 42, Padding = new Padding(8), WrapContents = false };
            row1.Controls.Add(new Label { Text = "FP_CLOCK.ocx", AutoSize = true, Padding = new Padding(0, 7, 0, 0) });
            row1.Controls.Add(_ocx);

            var row2 = new FlowLayoutPanel { Dock = DockStyle.Top, Height = 50, Padding = new Padding(8), WrapContents = false };
            row2.Controls.Add(new Label { Text = "IP", AutoSize = true, Padding = new Padding(0, 7, 0, 0) });
            row2.Controls.Add(_ip);
            row2.Controls.Add(new Label { Text = "Port", AutoSize = true, Padding = new Padding(8, 7, 0, 0) });
            row2.Controls.Add(_port);
            row2.Controls.Add(new Label { Text = "Cihaz No", AutoSize = true, Padding = new Padding(8, 7, 0, 0) });
            row2.Controls.Add(_dn);
            row2.Controls.Add(new Label { Text = "Comm Key", AutoSize = true, Padding = new Padding(8, 7, 0, 0) });
            row2.Controls.Add(_key);
            row2.Controls.Add(_run);
            row2.Controls.Add(_state);

            var note = new Label
            {
                Dock = DockStyle.Top,
                Height = 55,
                Padding = new Padding(10, 5, 10, 5),
                Text = "SALT OKUMA TESTİ: Hedef500/TXT köprüsü kullanılmaz. Cihaz saati, durum ve cihaz bilgileri okunur. Saat ayarlama, zil, kapı, kullanıcı silme, log silme veya yeniden başlatma komutu gönderilmez."
            };

            Controls.Add(_log);
            Controls.Add(note);
            Controls.Add(row2);
            Controls.Add(row1);
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
            object com = null;
            Type comType = null;
            bool closeAttempted = false;

            try
            {
                var ocxPath = _ocx.Text.Trim();
                var ip = _ip.Text.Trim();
                var port = (int)_port.Value;
                var dn = (int)_dn.Value;
                var key = (int)_key.Value;

                Log("KY PDKS - FP_CLOCK DOĞRUDAN CİHAZ OKUMA TESTİ v1.0");
                Log($"OCX: {ocxPath}");
                Log($"Hedef: {ip}:{port} · Cihaz No={dn} · Comm Key={key}");
                Log("Hedef500 Terminal Bilgi Aktar EXE/TXT köprüsü kullanılmıyor.");
                Log();

                if (!File.Exists(ocxPath)) throw new FileNotFoundException("FP_CLOCK.ocx bulunamadı.", ocxPath);
                var fvi = FileVersionInfo.GetVersionInfo(ocxPath);
                Log($"FP_CLOCK.ocx bulundu · Boyut={new FileInfo(ocxPath).Length:n0} bayt · Sürüm={fvi.FileVersion ?? "?"}");

                var candidates = InspectTypeLibrary(ocxPath);
                if (candidates.Count == 0) throw new InvalidOperationException("OCX TypeLib içinde oluşturulabilir COM sınıfı bulunamadı.");

                foreach (var c in candidates)
                    Log($"COM sınıfı: {c.Name} · ProgID={c.ProgId ?? "(yok)"} · CLSID={c.Guid:B} · Metot={c.Methods.Count}");

                var selected = candidates
                    .OrderByDescending(c => c.Methods.Contains("SetIPAddress", StringComparer.OrdinalIgnoreCase) && c.Methods.Contains("OpenCommPort", StringComparer.OrdinalIgnoreCase))
                    .ThenByDescending(c => (c.ProgId ?? "").IndexOf("FP_CLOCK", StringComparison.OrdinalIgnoreCase) >= 0)
                    .First();

                Log();
                Log($"Seçilen COM: {selected.Name} · {selected.Guid:B}");
                Log("Kritik metotlar: " + string.Join(", ", selected.Methods.Where(IsInteresting).Distinct(StringComparer.OrdinalIgnoreCase).OrderBy(x => x)));

                comType = Type.GetTypeFromCLSID(selected.Guid, true);
                com = Activator.CreateInstance(comType);
                Log("COM nesnesi oluşturuldu.");

                object setIp;
                try
                {
                    setIp = Invoke(comType, com, "SetIPAddress", new object[] { ip, port, key }, null);
                }
                catch
                {
                    setIp = Invoke(comType, com, "SetIPAddress", new object[] { ip, port, key }, new[] { true, false, false });
                }
                Log("SetIPAddress taşıma hedefi sonucu: " + Format(setIp));

                var open = Invoke(comType, com, "OpenCommPort", new object[] { dn }, null);
                Log("OpenCommPort ham sonucu: " + Format(open));

                Log();
                ReadDeviceTime(comType, com, dn);
                ReadDeviceStatus(comType, com, dn);
                ReadDeviceInfo(comType, com, dn);

                Log();
                Log("SONUÇ: FP_CLOCK üzerinden cihaz okuma çağrıları tamamlandı.");
                _state.Text = "TEST TAMAMLANDI";
            }
            catch (Exception ex)
            {
                var root = ex is TargetInvocationException && ex.InnerException != null ? ex.InnerException : ex;
                Log();
                Log("HATA: " + root.Message);
                Log("Tip: " + root.GetType().FullName);
                if (root is COMException ce) Log($"HRESULT: 0x{ce.ErrorCode:X8}");
                _state.Text = "HATA";
            }
            finally
            {
                try
                {
                    if (com != null && comType != null)
                    {
                        try { Invoke(comType, com, "CloseCommPort", new object[0], null); closeAttempted = true; }
                        catch { }
                        if (Marshal.IsComObject(com)) Marshal.FinalReleaseComObject(com);
                    }
                }
                catch { }

                if (closeAttempted) Log("CloseCommPort çağrıldı.");
                var report = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), "KY-PDKS-FPClock-Cihaz-Raporu.txt");
                try { File.WriteAllText(report, _report.ToString(), new UTF8Encoding(true)); Log("Rapor: " + report); } catch { }
                _run.Enabled = true;
            }
        }

        private List<ComCandidate> InspectTypeLibrary(string path)
        {
            var result = new List<ComCandidate>();
            ITypeLib lib;
            LoadTypeLibEx(path, REGKIND.REGKIND_NONE, out lib);
            try
            {
                int count = lib.GetTypeInfoCount();
                Log($"TypeLib yüklendi · TypeInfo sayısı={count}");
                for (int i = 0; i < count; i++)
                {
                    lib.GetTypeInfoType(i, out TYPEKIND kind);
                    if (kind != TYPEKIND.TKIND_COCLASS) continue;
                    lib.GetTypeInfo(i, out ITypeInfo ti);
                    IntPtr pAttr = IntPtr.Zero;
                    try
                    {
                        ti.GetTypeAttr(out pAttr);
                        var attr = Marshal.PtrToStructure<TYPEATTR>(pAttr);
                        ti.GetDocumentation(-1, out string name, out _, out _, out _);
                        var methods = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                        for (int impl = 0; impl < attr.cImplTypes; impl++)
                        {
                            try
                            {
                                ti.GetRefTypeOfImplType(impl, out int href);
                                ti.GetRefTypeInfo(href, out ITypeInfo iface);
                                CollectMethods(iface, methods);
                            }
                            catch { }
                        }
                        var progId = GetProgId(attr.guid);
                        result.Add(new ComCandidate { Name = name ?? "COM", Guid = attr.guid, ProgId = progId, Methods = methods });
                    }
                    finally
                    {
                        if (pAttr != IntPtr.Zero) ti.ReleaseTypeAttr(pAttr);
                        if (Marshal.IsComObject(ti)) Marshal.ReleaseComObject(ti);
                    }
                }
            }
            finally
            {
                if (Marshal.IsComObject(lib)) Marshal.ReleaseComObject(lib);
            }
            return result;
        }

        private static void CollectMethods(ITypeInfo ti, HashSet<string> methods)
        {
            IntPtr pAttr = IntPtr.Zero;
            try
            {
                ti.GetTypeAttr(out pAttr);
                var attr = Marshal.PtrToStructure<TYPEATTR>(pAttr);
                for (int i = 0; i < attr.cFuncs; i++)
                {
                    IntPtr pFunc = IntPtr.Zero;
                    try
                    {
                        ti.GetFuncDesc(i, out pFunc);
                        var fd = Marshal.PtrToStructure<FUNCDESC>(pFunc);
                        var names = new string[Math.Max(1, fd.cParams + 1)];
                        ti.GetNames(fd.memid, names, names.Length, out int got);
                        if (got > 0 && !string.IsNullOrWhiteSpace(names[0])) methods.Add(names[0]);
                    }
                    catch { }
                    finally { if (pFunc != IntPtr.Zero) ti.ReleaseFuncDesc(pFunc); }
                }
            }
            finally { if (pAttr != IntPtr.Zero) ti.ReleaseTypeAttr(pAttr); }
        }

        private static object Invoke(Type t, object target, string name, object[] args, bool[] byRef)
        {
            ParameterModifier[] mods = null;
            if (byRef != null && byRef.Length == args.Length)
            {
                var pm = new ParameterModifier(args.Length);
                for (int i = 0; i < byRef.Length; i++) pm[i] = byRef[i];
                mods = new[] { pm };
            }
            return t.InvokeMember(name, BindingFlags.InvokeMethod, null, target, args, mods, CultureInfo.InvariantCulture, null);
        }

        private void ReadDeviceTime(Type t, object com, int dn)
        {
            try
            {
                var args = new object[] { dn, 0, 0, 0, 0, 0, 0 };
                var ret = Invoke(t, com, "GetDeviceTime", args, new[] { false, true, true, true, true, true, true });
                Log($"GetDeviceTime: {Format(ret)} · {args[1]:D4}-{args[2]:D2}-{args[3]:D2} {args[4]:D2}:{args[5]:D2} · HaftanınGünü={args[6]}");
            }
            catch (Exception ex) { Log("GetDeviceTime HATA: " + Unwrap(ex).Message); }
        }

        private void ReadDeviceStatus(Type t, object com, int dn)
        {
            Log("Cihaz durum sayaçları:");
            var names = new Dictionary<int, string> { [1] = "Yönetici", [2] = "Kullanıcı", [3] = "Parmak", [4] = "Şifre", [5] = "Yeni yönetim log", [6] = "Yeni hareket log", [7] = "Kart" };
            foreach (var kv in names)
            {
                try
                {
                    var args = new object[] { dn, kv.Key, 0 };
                    var ret = Invoke(t, com, "GetDeviceStatus", args, new[] { false, false, true });
                    Log($"  {kv.Value}: {args[2]} · sonuç={Format(ret)}");
                }
                catch (Exception ex) { Log($"  {kv.Value}: HATA · {Unwrap(ex).Message}"); }
            }
        }

        private void ReadDeviceInfo(Type t, object com, int dn)
        {
            Log("Cihaz bilgi alanları:");
            var names = new Dictionary<int, string> { [1] = "Azami yönetici", [2] = "Cihaz no", [3] = "Dil", [4] = "Otomatik kapanma", [5] = "Kilit kontrol", [6] = "Hareket log uyarı eşiği", [7] = "Yönetim log uyarı eşiği", [8] = "Doğrulama aralığı", [9] = "Baudrate kodu" };
            foreach (var kv in names)
            {
                try
                {
                    var args = new object[] { dn, kv.Key, 0 };
                    var ret = Invoke(t, com, "GetDeviceInfo", args, new[] { false, false, true });
                    Log($"  {kv.Value}: {args[2]} · sonuç={Format(ret)}");
                }
                catch (Exception ex) { Log($"  {kv.Value}: HATA · {Unwrap(ex).Message}"); }
            }
        }

        private static Exception Unwrap(Exception ex) => ex is TargetInvocationException && ex.InnerException != null ? ex.InnerException : ex;
        private static string Format(object value) => value == null ? "(null)" : Convert.ToString(value, CultureInfo.InvariantCulture);
        private static bool IsInteresting(string s)
        {
            var x = s.ToLowerInvariant();
            return x.Contains("comm") || x.Contains("device") || x.Contains("ipaddress") || x.Contains("log") || x.Contains("bell") || x.Contains("door") || x.Contains("user") || x.Contains("enroll");
        }

        private static string GetProgId(Guid clsid)
        {
            IntPtr ptr;
            var g = clsid;
            int hr = ProgIDFromCLSID(ref g, out ptr);
            if (hr != 0 || ptr == IntPtr.Zero) return null;
            try { return Marshal.PtrToStringUni(ptr); }
            finally { Marshal.FreeCoTaskMem(ptr); }
        }

        private sealed class ComCandidate
        {
            public string Name;
            public Guid Guid;
            public string ProgId;
            public HashSet<string> Methods;
        }

        private enum REGKIND { REGKIND_DEFAULT = 0, REGKIND_REGISTER = 1, REGKIND_NONE = 2 }

        [DllImport("oleaut32.dll", CharSet = CharSet.Unicode, PreserveSig = false)]
        private static extern void LoadTypeLibEx(string szFile, REGKIND regKind, out ITypeLib typeLib);

        [DllImport("ole32.dll", CharSet = CharSet.Unicode)]
        private static extern int ProgIDFromCLSID(ref Guid clsid, out IntPtr lplpszProgID);
    }
}
