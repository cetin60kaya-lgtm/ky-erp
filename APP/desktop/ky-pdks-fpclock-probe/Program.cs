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
        private readonly Button _run = new Button { Text = "BAĞIMLILIKLARI BUL + CİHAZI OKU", AutoSize = true, Height = 34 };
        private readonly Label _state = new Label { Text = "Hazır", AutoSize = true, Padding = new Padding(8, 8, 0, 0) };
        private readonly TextBox _log = new TextBox { Multiline = true, ReadOnly = true, ScrollBars = ScrollBars.Both, WordWrap = false, Dock = DockStyle.Fill, Font = new System.Drawing.Font("Consolas", 9.2f) };
        private readonly StringBuilder _report = new StringBuilder();

        public ProbeForm()
        {
            Text = "KY PDKS · FP_CLOCK Bağımlılık + Doğrudan Cihaz Testi v5";
            Width = 1160;
            Height = 780;
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
                Height = 76,
                Padding = new Padding(10, 7, 10, 5),
                Text = "SALT OKUMA / TANILAMA v5: FP_CLOCK.ocx ve TMPCCOMM.dll PE import tablolarını okuyup eksik native DLL'i ismen bulur, çalışan Hedef uygulamasının modül klasörlerini ve diskleri tarar, bulunan bağımlılık yollarını öne alıp doğrudan COM yüklemeyi tekrar dener. Registry değiştirmez; cihazda saat/zil/kapı/silme/reset yapmaz."
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
            object factoryObj = null;
            object com = null;
            string oldPath = Environment.GetEnvironmentVariable("PATH") ?? "";

            try
            {
                string ip = _ip.Text.Trim();
                int port = (int)_port.Value;
                int dn = (int)_dn.Value;
                int key = (int)_key.Value;

                Log("KY PDKS - FP_CLOCK BAĞIMLILIK + DOĞRUDAN CİHAZ TESTİ v5.0");
                Log($"Hedef: {ip}:{port} · Cihaz No={dn} · Comm Key={key}");
                Log("RISS / Hedef500 TXT köprüsü / Windows COM kaydı kullanılmıyor.");
                Log();

                TcpPrecheck(ip, port);
                Log();

                string ocxPath = FindFpClock();
                if (string.IsNullOrWhiteSpace(ocxPath))
                    throw new FileNotFoundException("FP_CLOCK.ocx sabit disklerde bulunamadı.");

                string supportDir = Path.GetDirectoryName(ocxPath);
                string appDir = Directory.GetParent(supportDir)?.FullName ?? supportDir;
                string parentDir = Directory.GetParent(appDir)?.FullName ?? appDir;
                string tmpPath = Path.Combine(supportDir, "TMPCCOMM.dll");

                Log("FP_CLOCK.ocx BULUNDU: " + ocxPath);
                Log("Boyut: " + new FileInfo(ocxPath).Length.ToString("N0") + " bayt");
                Log("Support: " + supportDir);
                Log("Uygulama kökü: " + appDir);
                Log("TMPCCOMM.dll: " + (File.Exists(tmpPath) ? "BULUNDU · " + tmpPath : "BULUNAMADI"));

                var classes = InspectTypeLibrary(ocxPath);
                if (classes.Count == 0) throw new InvalidOperationException("FP_CLOCK.ocx TypeLib içinde COM coclass bulunamadı.");
                var selected = classes.OrderByDescending(c => c.Methods.Any(m => Eq(m.Name, "OpenCommPort")))
                                      .ThenByDescending(c => c.Methods.Any(m => Eq(m.Name, "SetIPAddress")))
                                      .First();
                Log($"COM: {selected.Name} · CLSID={selected.Guid:B} · Metot={selected.Methods.Count}");
                Log("Kritik: " + string.Join(", ", selected.Methods.Where(m => IsInteresting(m.Name)).OrderBy(m => m.Name).Select(m => m.Name + "(" + m.ParamCount + ")").Distinct()));

                Log();
                Log("NATIVE BAĞIMLILIK ANALİZİ");
                Log("------------------------------------------------------------");
                var searchDirs = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                AddDir(searchDirs, supportDir);
                AddDir(searchDirs, appDir);
                AddDir(searchDirs, parentDir);
                AddDir(searchDirs, Environment.SystemDirectory);
                AddDir(searchDirs, Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Windows), "SysWOW64"));
                AddDir(searchDirs, Environment.GetFolderPath(Environment.SpecialFolder.Windows));
                CollectRunningHedefModuleDirs(searchDirs);

                var missingNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                var visited = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                if (File.Exists(tmpPath)) AnalyzeDependencyTree(tmpPath, searchDirs, missingNames, visited, 0);
                AnalyzeDependencyTree(ocxPath, searchDirs, missingNames, visited, 0);

                if (missingNames.Count > 0)
                {
                    Log();
                    Log("Eksik görünen importlar aranıyor...");
                    foreach (string name in missingNames.ToList())
                    {
                        if (IsApiSet(name)) continue;
                        string found = FindDependencyOnDisk(name, new[] { parentDir, appDir, supportDir });
                        if (!string.IsNullOrWhiteSpace(found))
                        {
                            Log("  BULUNDU: " + name + " -> " + found);
                            AddDir(searchDirs, Path.GetDirectoryName(found));
                            missingNames.Remove(name);
                        }
                        else
                        {
                            Log("  BULUNAMADI: " + name);
                        }
                    }
                }

                string searchPath = string.Join(";", searchDirs.Where(Directory.Exists));
                Environment.SetEnvironmentVariable("PATH", searchPath + ";" + oldPath);
                SetDllDirectory(supportDir);
                Log();
                Log("DLL arama yolları hazırlandı: " + searchDirs.Count + " klasör");

                foreach (string file in new[] { tmpPath })
                {
                    if (!File.Exists(file)) continue;
                    IntPtr h = LoadLibraryEx(file, IntPtr.Zero, LOAD_WITH_ALTERED_SEARCH_PATH);
                    if (h == IntPtr.Zero)
                    {
                        int err = Marshal.GetLastWin32Error();
                        Log(Path.GetFileName(file) + " LoadLibraryEx HATA · Win32=" + err);
                    }
                    else
                    {
                        loaded.Add(h);
                        Log(Path.GetFileName(file) + " YÜKLENDİ.");
                    }
                }

                IntPtr hOcx = LoadLibraryEx(ocxPath, IntPtr.Zero, LOAD_WITH_ALTERED_SEARCH_PATH);
                if (hOcx == IntPtr.Zero)
                {
                    int err = Marshal.GetLastWin32Error();
                    throw new InvalidOperationException("FP_CLOCK.ocx LoadLibraryEx başarısız. Win32=" + err + ". Yukarıdaki import listesinde eksik DLL adı görünmelidir.");
                }
                loaded.Add(hOcx);
                Log("FP_CLOCK.ocx native olarak YÜKLENDİ.");

                IntPtr p = GetProcAddress(hOcx, "DllGetClassObject");
                if (p == IntPtr.Zero) throw new MissingMethodException("FP_CLOCK.ocx içinde DllGetClassObject export'u bulunamadı.");
                var getClassObject = (DllGetClassObjectDelegate)Marshal.GetDelegateForFunctionPointer(p, typeof(DllGetClassObjectDelegate));

                Guid clsid = selected.Guid;
                Guid iidFactory = new Guid("00000001-0000-0000-C000-000000000046");
                int hr = getClassObject(ref clsid, ref iidFactory, out factoryObj);
                Log("DllGetClassObject HRESULT: 0x" + hr.ToString("X8"));
                if (hr < 0 || factoryObj == null) Marshal.ThrowExceptionForHR(hr);

                var factory = (IClassFactory)factoryObj;
                Guid iidDispatch = new Guid("00020400-0000-0000-C000-000000000046");
                hr = factory.CreateInstance(null, ref iidDispatch, out com);
                Log("IClassFactory.CreateInstance HRESULT: 0x" + hr.ToString("X8"));
                if (hr < 0 || com == null) Marshal.ThrowExceptionForHR(hr);
                Log("FP_CLOCK COM NESNESİ OLUŞTURULDU.");

                Type t = com.GetType();
                var setIpMethod = selected.Methods.FirstOrDefault(m => Eq(m.Name, "SetIPAddress"));
                object setResult = CallSetIp(t, com, setIpMethod?.ParamCount ?? 3, ip, port, dn, key);
                Log("SetIPAddress sonucu: " + Format(setResult));

                var openMethod = selected.Methods.FirstOrDefault(m => Eq(m.Name, "OpenCommPort"));
                object openResult = CallOpen(t, com, openMethod?.ParamCount ?? 1, dn);
                Log("OpenCommPort ham sonucu: " + Format(openResult) + " · Not: bu API ailesinde False=başarı olabilir.");

                Log();
                bool timeOk = TryReadTime(t, com, selected, dn);
                TryReadStatus(t, com, selected, dn);
                TryReadInfo(t, com, selected, dn);

                Log();
                if (timeOk)
                {
                    Log("SONUÇ: FP_CLOCK ÜZERİNDEN CİHAZLA DOĞRUDAN HABERLEŞME KURULDU.");
                    _state.Text = "BAĞLANTI BAŞARILI";
                }
                else
                {
                    Log("SONUÇ: Native zincir yüklendi; cihaz çağrısı yapıldı fakat GetDeviceTime henüz doğrulanmadı.");
                    _state.Text = "NATIVE OK / CİHAZ DOĞRULANMADI";
                }
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
                try { if (com != null && Marshal.IsComObject(com)) Marshal.FinalReleaseComObject(com); } catch { }
                try { if (factoryObj != null && Marshal.IsComObject(factoryObj)) Marshal.FinalReleaseComObject(factoryObj); } catch { }
                for (int i = loaded.Count - 1; i >= 0; i--) { try { if (loaded[i] != IntPtr.Zero) FreeLibrary(loaded[i]); } catch { } }
                try { SetDllDirectory(null); Environment.SetEnvironmentVariable("PATH", oldPath); } catch { }

                string report = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), "KY-PDKS-FPClock-Cihaz-Raporu-v5.txt");
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
            Log("FP_CLOCK dosya keşfi başlıyor...");
            var candidates = new List<string>();
            foreach (Process p in Process.GetProcesses())
            {
                try
                {
                    string title = p.MainWindowTitle ?? "";
                    string name = p.ProcessName ?? "";
                    if (title.IndexOf("Hedef", StringComparison.OrdinalIgnoreCase) < 0 &&
                        title.IndexOf("Terminal", StringComparison.OrdinalIgnoreCase) < 0 &&
                        name.IndexOf("Hedef", StringComparison.OrdinalIgnoreCase) < 0 &&
                        name.IndexOf("Terminal", StringComparison.OrdinalIgnoreCase) < 0) continue;
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

            string[] known = {
                @"C:\Hedef500\Terminal Bilgi Aktar\support\FP_CLOCK.ocx",
                @"D:\Hedef500\Terminal Bilgi Aktar\support\FP_CLOCK.ocx",
                @"E:\Hedef500\Terminal Bilgi Aktar\support\FP_CLOCK.ocx",
                @"C:\HEDEF\Terminal Bilgi Aktar\support\FP_CLOCK.ocx",
                @"D:\HEDEF\Terminal Bilgi Aktar\support\FP_CLOCK.ocx",
                @"E:\HEDEF\Terminal Bilgi Aktar\support\FP_CLOCK.ocx",
                @"D:\personel yedek son\Terminal Bilgi Aktar\support\FP_CLOCK.ocx"
            };
            foreach (var k in known) AddCandidate(candidates, k);

            foreach (string p in candidates.Distinct(StringComparer.OrdinalIgnoreCase))
            {
                Log("Aday: " + p + (File.Exists(p) ? " · BULUNDU" : ""));
                if (File.Exists(p)) return p;
            }

            foreach (DriveInfo d in DriveInfo.GetDrives().Where(x => x.IsReady && x.DriveType == DriveType.Fixed))
            {
                string found = SearchExactFile(d.RootDirectory.FullName, "FP_CLOCK.ocx", 7, 40000);
                if (!string.IsNullOrWhiteSpace(found))
                {
                    Log("Disk taramasında BULUNDU: " + found);
                    return found;
                }
            }
            return null;
        }

        private void CollectRunningHedefModuleDirs(HashSet<string> dirs)
        {
            Log("Çalışan Hedef/Terminal modülleri kontrol ediliyor...");
            foreach (Process p in Process.GetProcesses())
            {
                try
                {
                    string title = p.MainWindowTitle ?? "";
                    string name = p.ProcessName ?? "";
                    if (title.IndexOf("Hedef", StringComparison.OrdinalIgnoreCase) < 0 &&
                        title.IndexOf("Terminal", StringComparison.OrdinalIgnoreCase) < 0 &&
                        name.IndexOf("Hedef", StringComparison.OrdinalIgnoreCase) < 0 &&
                        name.IndexOf("Terminal", StringComparison.OrdinalIgnoreCase) < 0) continue;

                    Log("  Proses: " + name + " · " + title);
                    foreach (ProcessModule m in p.Modules)
                    {
                        try
                        {
                            string path = m.FileName;
                            AddDir(dirs, Path.GetDirectoryName(path));
                            string fn = Path.GetFileName(path);
                            if (fn.IndexOf("COMM", StringComparison.OrdinalIgnoreCase) >= 0 ||
                                fn.IndexOf("CLOCK", StringComparison.OrdinalIgnoreCase) >= 0 ||
                                fn.IndexOf("FP_", StringComparison.OrdinalIgnoreCase) >= 0)
                                Log("    Yüklü modül: " + path);
                        }
                        catch { }
                    }
                }
                catch { }
                finally { try { p.Dispose(); } catch { } }
            }
        }

        private void AnalyzeDependencyTree(string file, HashSet<string> searchDirs, HashSet<string> missing, HashSet<string> visited, int depth)
        {
            if (depth > 4 || string.IsNullOrWhiteSpace(file) || !File.Exists(file)) return;
            string full = Path.GetFullPath(file);
            if (!visited.Add(full)) return;

            List<string> imports;
            try { imports = ReadPeImports(full); }
            catch (Exception ex) { Log(new string(' ', depth * 2) + Path.GetFileName(full) + " PE OKUNAMADI: " + ex.Message); return; }

            Log(new string(' ', depth * 2) + Path.GetFileName(full) + " importları (" + imports.Count + "):");
            foreach (string name in imports)
            {
                string indent = new string(' ', depth * 2 + 2);
                if (IsApiSet(name))
                {
                    Log(indent + name + " -> APISET");
                    continue;
                }

                string resolved = ResolveDependency(name, searchDirs);
                if (string.IsNullOrWhiteSpace(resolved))
                {
                    Log(indent + name + " -> EKSİK");
                    missing.Add(name);
                    continue;
                }

                Log(indent + name + " -> " + resolved);
                string dir = Path.GetDirectoryName(resolved);
                AddDir(searchDirs, dir);

                if (depth < 3 && !IsWindowsPath(resolved) &&
                    (name.EndsWith(".dll", StringComparison.OrdinalIgnoreCase) || name.EndsWith(".ocx", StringComparison.OrdinalIgnoreCase)))
                    AnalyzeDependencyTree(resolved, searchDirs, missing, visited, depth + 1);
            }
        }

        private List<string> ReadPeImports(string path)
        {
            byte[] b = File.ReadAllBytes(path);
            if (b.Length < 0x100 || b[0] != (byte)'M' || b[1] != (byte)'Z') throw new InvalidDataException("MZ başlığı yok.");
            int pe = BitConverter.ToInt32(b, 0x3C);
            if (pe < 0 || pe + 256 > b.Length) throw new InvalidDataException("PE offset geçersiz.");
            if (b[pe] != (byte)'P' || b[pe + 1] != (byte)'E') throw new InvalidDataException("PE imzası yok.");

            ushort sectionCount = BitConverter.ToUInt16(b, pe + 6);
            ushort optionalSize = BitConverter.ToUInt16(b, pe + 20);
            int opt = pe + 24;
            ushort magic = BitConverter.ToUInt16(b, opt);
            int dd = magic == 0x10B ? opt + 96 : (magic == 0x20B ? opt + 112 : -1);
            if (dd < 0 || dd + 16 > b.Length) throw new InvalidDataException("PE optional header desteklenmiyor.");

            uint importRva = BitConverter.ToUInt32(b, dd + 8);
            if (importRva == 0) return new List<string>();

            int secTable = opt + optionalSize;
            var sections = new List<PeSection>();
            for (int i = 0; i < sectionCount; i++)
            {
                int o = secTable + i * 40;
                if (o + 40 > b.Length) break;
                sections.Add(new PeSection
                {
                    VirtualSize = BitConverter.ToUInt32(b, o + 8),
                    VirtualAddress = BitConverter.ToUInt32(b, o + 12),
                    RawSize = BitConverter.ToUInt32(b, o + 16),
                    RawAddress = BitConverter.ToUInt32(b, o + 20)
                });
            }

            Func<uint, int> map = rva =>
            {
                foreach (var s in sections)
                {
                    uint span = Math.Max(s.VirtualSize, s.RawSize);
                    if (rva >= s.VirtualAddress && rva < s.VirtualAddress + span)
                    {
                        long off = (long)s.RawAddress + (rva - s.VirtualAddress);
                        if (off >= 0 && off < b.Length) return (int)off;
                    }
                }
                if (rva < b.Length) return (int)rva;
                return -1;
            };

            int imp = map(importRva);
            if (imp < 0) throw new InvalidDataException("Import RVA eşlenemedi.");
            var result = new List<string>();
            for (int n = 0; n < 512; n++)
            {
                int o = imp + n * 20;
                if (o + 20 > b.Length) break;
                uint original = BitConverter.ToUInt32(b, o);
                uint stamp = BitConverter.ToUInt32(b, o + 4);
                uint chain = BitConverter.ToUInt32(b, o + 8);
                uint nameRva = BitConverter.ToUInt32(b, o + 12);
                uint thunk = BitConverter.ToUInt32(b, o + 16);
                if (original == 0 && stamp == 0 && chain == 0 && nameRva == 0 && thunk == 0) break;
                int no = map(nameRva);
                if (no < 0) continue;
                string name = ReadAsciiZ(b, no);
                if (!string.IsNullOrWhiteSpace(name) && !result.Contains(name, StringComparer.OrdinalIgnoreCase)) result.Add(name);
            }
            return result;
        }

        private static string ReadAsciiZ(byte[] b, int o)
        {
            int e = o;
            while (e < b.Length && e - o < 260 && b[e] != 0) e++;
            return Encoding.ASCII.GetString(b, o, e - o);
        }

        private string ResolveDependency(string name, IEnumerable<string> searchDirs)
        {
            foreach (string dir in searchDirs.Where(x => !string.IsNullOrWhiteSpace(x)).Distinct(StringComparer.OrdinalIgnoreCase))
            {
                try
                {
                    string p = Path.Combine(dir, name);
                    if (File.Exists(p)) return p;
                }
                catch { }
            }

            IntPtr h = LoadLibraryEx(name, IntPtr.Zero, 0);
            if (h != IntPtr.Zero)
            {
                try
                {
                    var sb = new StringBuilder(1024);
                    uint n = GetModuleFileName(h, sb, sb.Capacity);
                    if (n > 0) return sb.ToString();
                }
                finally { FreeLibrary(h); }
            }
            return null;
        }

        private string FindDependencyOnDisk(string name, IEnumerable<string> preferredRoots)
        {
            foreach (string r in preferredRoots.Where(Directory.Exists).Distinct(StringComparer.OrdinalIgnoreCase))
            {
                string f = SearchExactFile(r, name, 7, 50000);
                if (!string.IsNullOrWhiteSpace(f)) return f;
            }

            foreach (DriveInfo d in DriveInfo.GetDrives().Where(x => x.IsReady && x.DriveType == DriveType.Fixed))
            {
                string f = SearchExactFile(d.RootDirectory.FullName, name, 5, 70000);
                if (!string.IsNullOrWhiteSpace(f)) return f;
            }
            return null;
        }

        private string SearchExactFile(string root, string fileName, int maxDepth, int maxDirs)
        {
            var q = new Queue<Tuple<string, int>>();
            q.Enqueue(Tuple.Create(root, 0));
            int scanned = 0;
            while (q.Count > 0 && scanned < maxDirs)
            {
                var item = q.Dequeue();
                string dir = item.Item1;
                int depth = item.Item2;
                scanned++;
                try
                {
                    string direct = Path.Combine(dir, fileName);
                    if (File.Exists(direct)) return direct;
                    if (depth >= maxDepth) continue;
                    foreach (string sub in Directory.EnumerateDirectories(dir))
                    {
                        string n = Path.GetFileName(sub) ?? "";
                        if (n.Equals("$Recycle.Bin", StringComparison.OrdinalIgnoreCase) ||
                            n.Equals("System Volume Information", StringComparison.OrdinalIgnoreCase) ||
                            n.Equals("WinSxS", StringComparison.OrdinalIgnoreCase) ||
                            n.Equals("node_modules", StringComparison.OrdinalIgnoreCase) ||
                            n.Equals(".git", StringComparison.OrdinalIgnoreCase)) continue;
                        q.Enqueue(Tuple.Create(sub, depth + 1));
                    }
                }
                catch { }
            }
            return null;
        }

        private static void AddCandidate(List<string> list, string p) { if (!string.IsNullOrWhiteSpace(p)) list.Add(p); }
        private static void AddDir(HashSet<string> dirs, string p) { if (!string.IsNullOrWhiteSpace(p) && Directory.Exists(p)) dirs.Add(p); }

        private static bool IsApiSet(string name)
        {
            return name.StartsWith("api-ms-win-", StringComparison.OrdinalIgnoreCase) ||
                   name.StartsWith("ext-ms-win-", StringComparison.OrdinalIgnoreCase);
        }

        private static bool IsWindowsPath(string path)
        {
            string w = Environment.GetFolderPath(Environment.SpecialFolder.Windows);
            return !string.IsNullOrWhiteSpace(w) && path.StartsWith(w, StringComparison.OrdinalIgnoreCase);
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

        private bool TryReadTime(Type t, object com, ComCandidate c, int dn)
        {
            if (!c.Methods.Any(x => Eq(x.Name, "GetDeviceTime"))) { Log("GetDeviceTime: metot yok"); return false; }
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
            catch (Exception ex) { Log("GetDeviceTime HATA: " + Unwrap(ex).Message); return false; }
        }

        private void TryReadStatus(Type t, object com, ComCandidate c, int dn)
        {
            if (!c.Methods.Any(x => Eq(x.Name, "GetDeviceStatus"))) { Log("GetDeviceStatus: metot yok"); return; }
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
            if (!c.Methods.Any(x => Eq(x.Name, "GetDeviceInfo"))) { Log("GetDeviceInfo: metot yok"); return; }
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

        private static object Invoke(Type t, object target, string name, object[] args) =>
            t.InvokeMember(name, BindingFlags.InvokeMethod, null, target, args, CultureInfo.InvariantCulture);

        private static bool IsInteresting(string s)
        {
            string x = (s ?? "").ToLowerInvariant();
            return x.Contains("comm") || x.Contains("device") || x.Contains("ipaddress") || x.Contains("log") ||
                   x.Contains("bell") || x.Contains("door") || x.Contains("enroll") || x.Contains("user");
        }

        private static bool Eq(string a, string b) => string.Equals(a, b, StringComparison.OrdinalIgnoreCase);
        private static string Format(object v) => v == null ? "(null)" : Convert.ToString(v, CultureInfo.InvariantCulture);
        private static Exception Unwrap(Exception ex) => ex is TargetInvocationException && ex.InnerException != null ? ex.InnerException : ex;

        private sealed class ComCandidate { public string Name; public Guid Guid; public List<MethodDesc> Methods = new List<MethodDesc>(); }
        private sealed class MethodDesc { public string Name; public int ParamCount; }
        private sealed class PeSection { public uint VirtualSize; public uint VirtualAddress; public uint RawSize; public uint RawAddress; }

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
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode)]
        private static extern uint GetModuleFileName(IntPtr hModule, StringBuilder lpFilename, int nSize);
        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool FreeLibrary(IntPtr hModule);
    }
}
