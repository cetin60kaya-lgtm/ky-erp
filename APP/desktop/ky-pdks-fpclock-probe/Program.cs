using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using System.Windows.Forms;
using Microsoft.Win32;

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
        private readonly Button _run = new Button { Text = "FP_CLOCK İLE CİHAZI BUL VE OKU", AutoSize = true, Height = 34 };
        private readonly Label _state = new Label { Text = "Hazır", AutoSize = true, Padding = new Padding(8, 8, 0, 0) };
        private readonly TextBox _log = new TextBox { Multiline = true, ReadOnly = true, ScrollBars = ScrollBars.Both, WordWrap = false, Dock = DockStyle.Fill, Font = new System.Drawing.Font("Consolas", 9.5f) };
        private readonly StringBuilder _report = new StringBuilder();

        public ProbeForm()
        {
            Text = "KY PDKS · FP_CLOCK Doğrudan Cihaz Okuma Testi v2";
            Width = 1040;
            Height = 690;
            StartPosition = FormStartPosition.CenterScreen;

            var row = new FlowLayoutPanel { Dock = DockStyle.Top, Height = 52, Padding = new Padding(8), WrapContents = false };
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
                Height = 72,
                Padding = new Padding(10, 5, 10, 5),
                Text = "SALT OKUMA TESTİ. Sabit OCX yolu kullanılmaz. Önce çalışan Hedef/Terminal Bilgi Aktar prosesindeki yüklü FP_CLOCK.ocx modülünü, sonra 32-bit COM kayıtlarını ve yaygın klasörleri otomatik bulur. Cihaz saati/durum/bilgi alanlarını okur; saat ayarlama, zil, kapı, silme veya reset komutu göndermez."
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
            object com = null;
            Type comType = null;

            try
            {
                var ip = _ip.Text.Trim();
                var port = (int)_port.Value;
                var dn = (int)_dn.Value;
                var key = (int)_key.Value;

                Log("KY PDKS - FP_CLOCK DOĞRUDAN CİHAZ OKUMA TESTİ v2.0");
                Log($"Hedef: {ip}:{port} · Cihaz No={dn} · Comm Key={key}");
                Log("Hedef500 Terminal Bilgi Aktar EXE/TXT köprüsü kullanılmıyor.");
                Log();

                var loaded = FindLoadedFpClockModules();
                foreach (var p in loaded) Log("Çalışan proses modülü: " + p);

                var registered = FindRegisteredFpClockClasses();
                foreach (var r in registered)
                    Log($"32-bit COM kaydı: CLSID={r.Clsid:B} · Server={r.ServerPath ?? "?"} · ProgID={r.ProgId ?? "?"}");

                var files = FindFpClockFiles(loaded.Select(x => Path.GetDirectoryName(x)).Where(x => !string.IsNullOrWhiteSpace(x)));
                foreach (var f in files) Log("FP_CLOCK.ocx dosyası: " + f);

                if (registered.Count == 0)
                    throw new InvalidOperationException("FP_CLOCK ActiveX için 32-bit COM kaydı bulunamadı. Çalışan eski uygulama varsa açık bırakıp tekrar deneyin.");

                Exception last = null;
                RegisteredCom selected = null;
                foreach (var item in registered)
                {
                    try
                    {
                        comType = Type.GetTypeFromCLSID(item.Clsid, true);
                        com = Activator.CreateInstance(comType);
                        Log($"COM nesnesi oluşturuldu: {item.Clsid:B}");

                        var setArgs = new object[] { ip, port, key };
                        object setResult = Invoke(comType, com, "SetIPAddress", setArgs, null);
                        Log("SetIPAddress bağlantı hedefi sonucu: " + Format(setResult));

                        var openArgs = new object[] { dn };
                        object openResult = Invoke(comType, com, "OpenCommPort", openArgs, null);
                        Log("OpenCommPort ham sonucu: " + Format(openResult));
                        selected = item;
                        break;
                    }
                    catch (Exception ex)
                    {
                        last = Unwrap(ex);
                        Log($"CLSID {item.Clsid:B} uygun değil: {last.Message}");
                        try { if (com != null && Marshal.IsComObject(com)) Marshal.FinalReleaseComObject(com); } catch { }
                        com = null;
                        comType = null;
                    }
                }

                if (selected == null)
                    throw new InvalidOperationException("FP_CLOCK COM sınıfı bulundu ancak SetIPAddress/OpenCommPort ile oturum açılamadı. Son hata: " + (last?.Message ?? "bilinmiyor"));

                Log();
                ReadDeviceTime(comType, com, dn);
                ReadDeviceStatus(comType, com, dn);
                ReadDeviceInfo(comType, com, dn);

                Log();
                Log("SONUÇ: FP_CLOCK üzerinden doğrudan cihaz okuma çağrıları tamamlandı.");
                _state.Text = "TEST TAMAMLANDI";
            }
            catch (Exception ex)
            {
                var root = Unwrap(ex);
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
                        try { Invoke(comType, com, "CloseCommPort", Array.Empty<object>(), null); Log("CloseCommPort çağrıldı."); } catch { }
                        if (Marshal.IsComObject(com)) Marshal.FinalReleaseComObject(com);
                    }
                }
                catch { }

                var report = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), "KY-PDKS-FPClock-Cihaz-Raporu.txt");
                try { File.WriteAllText(report, _report.ToString(), new UTF8Encoding(true)); Log("Rapor: " + report); } catch { }
                _run.Enabled = true;
            }
        }

        private List<string> FindLoadedFpClockModules()
        {
            var result = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var p in Process.GetProcesses())
            {
                try
                {
                    var name = p.ProcessName ?? "";
                    bool relevant = name.IndexOf("hedef", StringComparison.OrdinalIgnoreCase) >= 0 || name.IndexOf("terminal", StringComparison.OrdinalIgnoreCase) >= 0;
                    if (!relevant) continue;
                    foreach (ProcessModule m in p.Modules)
                    {
                        var f = m.FileName;
                        if (!string.IsNullOrWhiteSpace(f) && Path.GetFileName(f).Equals("FP_CLOCK.ocx", StringComparison.OrdinalIgnoreCase))
                            result.Add(f);
                    }
                }
                catch { }
            }
            return result.ToList();
        }

        private List<RegisteredCom> FindRegisteredFpClockClasses()
        {
            var result = new List<RegisteredCom>();
            using (var root = RegistryKey.OpenBaseKey(RegistryHive.ClassesRoot, RegistryView.Registry32))
            using (var clsids = root.OpenSubKey("CLSID"))
            {
                if (clsids == null) return result;
                foreach (var sub in clsids.GetSubKeyNames())
                {
                    Guid g;
                    if (!Guid.TryParse(sub, out g)) continue;
                    try
                    {
                        using (var ck = clsids.OpenSubKey(sub))
                        using (var server = ck?.OpenSubKey("InprocServer32"))
                        {
                            var path = Convert.ToString(server?.GetValue(null), CultureInfo.InvariantCulture);
                            if (string.IsNullOrWhiteSpace(path) || path.IndexOf("FP_CLOCK.ocx", StringComparison.OrdinalIgnoreCase) < 0) continue;
                            string prog = null;
                            try { using (var pk = ck.OpenSubKey("ProgID")) prog = Convert.ToString(pk?.GetValue(null), CultureInfo.InvariantCulture); } catch { }
                            result.Add(new RegisteredCom { Clsid = g, ServerPath = Environment.ExpandEnvironmentVariables(path.Trim('"')), ProgId = prog });
                        }
                    }
                    catch { }
                }
            }
            return result;
        }

        private List<string> FindFpClockFiles(IEnumerable<string> extraDirs)
        {
            var result = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var candidates = new List<string>
            {
                @"C:\Hedef500\Terminal Bilgi Aktar\support\FP_CLOCK.ocx",
                @"C:\Hedef500\support\FP_CLOCK.ocx",
                @"C:\Windows\SysWOW64\FP_CLOCK.ocx",
                @"C:\Windows\System32\FP_CLOCK.ocx",
                Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "FP_CLOCK.ocx")
            };
            candidates.AddRange(extraDirs.Where(x => !string.IsNullOrWhiteSpace(x)).Select(x => Path.Combine(x, "FP_CLOCK.ocx")));
            foreach (var c in candidates)
            {
                try { if (File.Exists(c)) result.Add(Path.GetFullPath(c)); } catch { }
            }
            return result.ToList();
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
                Log($"GetDeviceTime: {Format(ret)} · {args[1]}-{args[2]}-{args[3]} {args[4]}:{args[5]} · HaftanınGünü={args[6]}");
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

        private sealed class RegisteredCom
        {
            public Guid Clsid { get; set; }
            public string ServerPath { get; set; }
            public string ProgId { get; set; }
        }
    }
}
