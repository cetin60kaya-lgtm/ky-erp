using System;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Net.Sockets;
using System.Reflection;
using System.Text;
using System.Threading.Tasks;
using System.Windows.Forms;
using Riss.Devices;

namespace KyPdksDeviceProbe
{
    internal static class Program
    {
        [STAThread]
        private static void Main()
        {
            AppDomain.CurrentDomain.AssemblyResolve += ResolveEmbeddedRiss;
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new ProbeForm());
        }

        private static Assembly ResolveEmbeddedRiss(object sender, ResolveEventArgs args)
        {
            try
            {
                if (!string.Equals(new AssemblyName(args.Name).Name, "Riss.Devices", StringComparison.OrdinalIgnoreCase)) return null;
                var asm = Assembly.GetExecutingAssembly();
                using (var stream = asm.GetManifestResourceStream("KyPdksDeviceProbe.Riss.Devices.dll"))
                {
                    if (stream == null) return null;
                    var bytes = new byte[stream.Length];
                    var read = 0;
                    while (read < bytes.Length)
                    {
                        var n = stream.Read(bytes, read, bytes.Length - read);
                        if (n <= 0) break;
                        read += n;
                    }
                    return Assembly.Load(bytes);
                }
            }
            catch { return null; }
        }
    }

    internal sealed class ProbeForm : Form
    {
        private readonly TextBox _ip = new TextBox { Text = "192.168.1.224", Width = 145 };
        private readonly NumericUpDown _port = new NumericUpDown { Minimum = 1, Maximum = 65535, Value = 5005, Width = 80 };
        private readonly NumericUpDown _dn = new NumericUpDown { Minimum = 1, Maximum = 9999, Value = 1, Width = 65 };
        private readonly TextBox _password = new TextBox { Text = "0", Width = 70 };
        private readonly Button _run = new Button { Text = "CİHAZA BAĞLAN VE OKU", AutoSize = true, Height = 34 };
        private readonly TextBox _output = new TextBox { Multiline = true, ScrollBars = ScrollBars.Both, ReadOnly = true, WordWrap = false, Dock = DockStyle.Fill, Font = new System.Drawing.Font("Consolas", 10f) };
        private readonly Label _state = new Label { Text = "Hazır", AutoSize = true, Padding = new Padding(8, 8, 0, 0) };
        private readonly StringBuilder _report = new StringBuilder();

        public ProbeForm()
        {
            Text = "KY PDKS · Doğrudan Cihaz Okuma Testi";
            Width = 930;
            Height = 650;
            StartPosition = FormStartPosition.CenterScreen;

            var top = new FlowLayoutPanel { Dock = DockStyle.Top, Height = 74, Padding = new Padding(10), AutoSize = false };
            top.Controls.Add(new Label { Text = "IP", AutoSize = true, Padding = new Padding(0, 7, 0, 0) });
            top.Controls.Add(_ip);
            top.Controls.Add(new Label { Text = "Port", AutoSize = true, Padding = new Padding(8, 7, 0, 0) });
            top.Controls.Add(_port);
            top.Controls.Add(new Label { Text = "Cihaz No", AutoSize = true, Padding = new Padding(8, 7, 0, 0) });
            top.Controls.Add(_dn);
            top.Controls.Add(new Label { Text = "Şifre", AutoSize = true, Padding = new Padding(8, 7, 0, 0) });
            top.Controls.Add(_password);
            top.Controls.Add(_run);
            top.Controls.Add(_state);

            var note = new Label
            {
                Dock = DockStyle.Top,
                Height = 44,
                Padding = new Padding(10, 4, 10, 4),
                Text = "SALT OKUMA: cihaz ayarı, saat, kullanıcı, zil, kapı, reset veya kayıt silme komutu göndermez. Hedef500/TXT kullanılmaz."
            };

            Controls.Add(_output);
            Controls.Add(note);
            Controls.Add(top);
            _run.Click += async (_, __) => await RunProbeAsync();
        }

        private void Log(string text = "")
        {
            var line = $"[{DateTime.Now:HH:mm:ss}] {text}";
            _report.AppendLine(line);
            _output.AppendText(line + Environment.NewLine);
            _output.SelectionStart = _output.TextLength;
            _output.ScrollToCaret();
            Application.DoEvents();
        }

        private async Task RunProbeAsync()
        {
            if (!_run.Enabled) return;
            _run.Enabled = false;
            _state.Text = "Çalışıyor...";
            _output.Clear();
            _report.Clear();
            var host = _ip.Text.Trim();
            var port = (int)_port.Value;
            var dn = (int)_dn.Value;
            var password = _password.Text;

            try
            {
                Log("KY PDKS - DOĞRUDAN REALAND/RISS CİHAZ OKUMA TESTİ v1.0");
                Log($"Hedef: {host}:{port} · DN={dn} · SDK=Riss.Devices (2911)");
                Log("Hedef500/TXT köprüsü kullanılmıyor.");
                Log();

                var tcpMs = await ProbeTcpAsync(host, port);
                Log($"TCP: BAŞARILI · {tcpMs} ms");
                Log("RISS SDK bağlantısı açılıyor...");

                DirectRissReadOnlyProbe.Run(host, port, dn, password, Log);
                Log();
                Log("SONUÇ: Cihaz Realand/RISS SDK üzerinden doğrudan okunabildi.");
                _state.Text = "BAĞLANTI BAŞARILI";
            }
            catch (Exception ex)
            {
                var root = ex.GetBaseException();
                Log();
                Log("HATA: " + root.Message);
                Log("Tip: " + root.GetType().FullName);
                _state.Text = "HATA";
            }
            finally
            {
                var reportPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), "KY-PDKS-Direct-Cihaz-Raporu.txt");
                try
                {
                    _report.AppendLine($"[{DateTime.Now:HH:mm:ss}] Rapor: {reportPath}");
                    File.WriteAllText(reportPath, _report.ToString(), new UTF8Encoding(true));
                }
                catch { }
                _run.Enabled = true;
            }
        }

        private static async Task<long> ProbeTcpAsync(string host, int port)
        {
            var sw = Stopwatch.StartNew();
            using (var client = new TcpClient())
            {
                var connect = client.ConnectAsync(host, port);
                var timeout = Task.Delay(3000);
                if (await Task.WhenAny(connect, timeout) != connect) throw new TimeoutException("TCP bağlantısı 3 saniyede kurulamadı.");
                await connect;
            }
            sw.Stop();
            return sw.ElapsedMilliseconds;
        }
    }

    internal static class DirectRissReadOnlyProbe
    {
        public static void Run(string host, int port, int dn, string password, Action<string> log)
        {
            DeviceConnection connection = null;
            Device device = null;
            try
            {
                device = new Device
                {
                    DN = dn,
                    Password = password,
                    Model = "ZDC2911",
                    ConnectionModel = 5,
                    CommunicationType = CommunicationType.Tcp,
                    IpAddress = host,
                    IpPort = port
                };

                connection = DeviceConnection.CreateConnection(ref device);
                if (connection == null) throw new InvalidOperationException("DeviceConnection.CreateConnection null döndürdü.");
                var openResult = connection.Open();
                log($"RISS Open(): {openResult}");
                if (openResult <= 0) throw new InvalidOperationException("TCP port açık fakat RISS SDK cihaz oturumu açılamadı. Cihaz şifresi veya firmware/protokol varyantını kontrol edeceğiz.");

                log("RISS SDK: DOĞRUDAN CİHAZ BAĞLANTISI BAŞARILI");
                DumpDeviceObject(device, log);
                ReadDeviceTime(connection, ref device, log);
                ReadDeviceStatus(connection, ref device, log);
                ReadMac(connection, ref device, log);
                ReadModel(connection, ref device, log);
                ReadFirmware(connection, ref device, log);
            }
            finally
            {
                try { connection?.Close(); } catch { }
            }
        }

        private static void DumpDeviceObject(Device device, Action<string> log)
        {
            log("CİHAZ NESNESİ:");
            foreach (var prop in typeof(Device).GetProperties(BindingFlags.Instance | BindingFlags.Public).Where(p => p.CanRead))
            {
                try
                {
                    var value = prop.GetValue(device, null);
                    if (value != null && !string.IsNullOrWhiteSpace(Convert.ToString(value)))
                        log($"  {prop.Name}: {value}");
                }
                catch { }
            }
        }

        private static void ReadDeviceTime(DeviceConnection c, ref Device d, Action<string> log)
        {
            object ep = new object(); object ed = new object();
            var ok = c.GetProperty(DeviceProperty.DeviceTime, ep, ref d, ref ed);
            log(ok && ed is DateTime ? $"Cihaz Saati: {(DateTime)ed:yyyy-MM-dd HH:mm:ss}" : "Cihaz Saati: okunamadı");
        }

        private static void ReadDeviceStatus(DeviceConnection c, ref Device d, Action<string> log)
        {
            object ep = new object(); object ed = new object();
            var ok = c.GetProperty(DeviceProperty.Status, ep, ref d, ref ed);
            var x = ed as UInt32[];
            if (!ok || x == null || x.Length < 9) { log("Cihaz Durumu: okunamadı"); return; }
            log($"Durum · Kullanıcı={x[0]} Yönetici={x[1]} Parmak={x[2]} Kart={x[3]} Şifre={x[4]} YönetimLog={x[5]} HareketLog={x[6]} GeçmişYönetim={x[7]} GeçmişHareket={x[8]}");
        }

        private static void ReadMac(DeviceConnection c, ref Device d, Action<string> log)
        {
            object ep = new object(); object ed = new object();
            var ok = c.GetProperty(DeviceProperty.MacAddress, ep, ref d, ref ed);
            var bytes = ed as byte[];
            if (!ok || bytes == null) { log("MAC: okunamadı"); return; }
            log("MAC: " + string.Join(":", bytes.Select(b => b.ToString("X2"))));
        }

        private static void ReadModel(DeviceConnection c, ref Device d, Action<string> log)
        {
            object ep = new object(); object ed = Zd2911Utils.DeviceModel;
            var ok = c.GetProperty(DeviceProperty.Model, ep, ref d, ref ed);
            log(ok ? "Cihaz Model Bilgisi: " + Convert.ToString(ed) : "Cihaz Model Bilgisi: okunamadı");
        }

        private static void ReadFirmware(DeviceConnection c, ref Device d, Action<string> log)
        {
            object ep = new object(); object ed = Zd2911Utils.DeviceFirmwareVersion;
            var ok = c.GetProperty(DeviceProperty.FirmwareVersion, ep, ref d, ref ed);
            log(ok ? "Firmware: " + Convert.ToString(ed) : "Firmware: okunamadı");
        }
    }
}
