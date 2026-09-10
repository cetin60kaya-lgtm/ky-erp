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
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new ProbeForm());
        }
    }

    internal sealed class ProbeForm : Form
    {
        private readonly TextBox _ip = new TextBox { Text = "192.168.1.224", Width = 150 };
        private readonly NumericUpDown _port = new NumericUpDown { Minimum = 1, Maximum = 65535, Value = 5005, Width = 85 };
        private readonly NumericUpDown _dn = new NumericUpDown { Minimum = 1, Maximum = 9999, Value = 1, Width = 70 };
        private readonly TextBox _password = new TextBox { Text = "0", Width = 80 };
        private readonly Button _run = new Button { Text = "CİHAZA BAĞLAN VE OKU", AutoSize = true, Height = 34 };
        private readonly TextBox _output = new TextBox { Multiline = true, ScrollBars = ScrollBars.Both, ReadOnly = true, WordWrap = false, Dock = DockStyle.Fill, Font = new System.Drawing.Font("Consolas", 10f) };
        private readonly Label _state = new Label { Text = "Hazır", AutoSize = true };
        private readonly StringBuilder _report = new StringBuilder();

        public ProbeForm()
        {
            Text = "KY PDKS · Doğrudan Cihaz Okuma Testi";
            Width = 920;
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
                Height = 42,
                Padding = new Padding(10, 4, 10, 4),
                Text = "SALT OKUMA: cihaz ayarı, saat, kullanıcı, zil, kapı, reset veya kayıt silme komutu göndermez. Hedef500 kullanılmaz."
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
            DeviceConnection connection = null;
            Device device = null;

            try
            {
                Log("KY PDKS - DOĞRUDAN REALAND/RISS CİHAZ OKUMA TESTİ v1.0");
                Log($"Hedef: {host}:{port} · DN={dn} · SDK: Riss.Devices.dll");
                Log("Hedef500/TXT köprüsü kullanılmıyor.");
                Log();

                var tcpMs = await ProbeTcpAsync(host, port);
                Log($"TCP: BAŞARILI · {tcpMs} ms");

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

                Log("RISS SDK bağlantısı açılıyor...");
                connection = DeviceConnection.CreateConnection(ref device);
                if (connection == null) throw new InvalidOperationException("DeviceConnection.CreateConnection null döndürdü.");
                var openResult = connection.Open();
                Log($"RISS Open(): {openResult}");
                if (openResult <= 0) throw new InvalidOperationException("TCP port açık fakat RISS SDK cihaz oturumu açılamadı. Şifre/firmware/protokol varyantını kontrol edeceğiz.");

                Log("RISS SDK: DOĞRUDAN CİHAZ BAĞLANTISI BAŞARILI");
                Log();

                DumpDeviceObject(device);
                ReadDeviceTime(connection, ref device);
                ReadDeviceStatus(connection, ref device);
                ReadMac(connection, ref device);
                ReadModel(connection, ref device);
                ReadFirmware(connection, ref device);

                Log();
                Log("SONUÇ: Cihaz Realand/RISS SDK üzerinden doğrudan okunabildi.");
                _state.Text = "BAĞLANTI BAŞARILI";
            }
            catch (Exception ex)
            {
                Log();
                Log("HATA: " + ex.GetBaseException().Message);
                Log("Tip: " + ex.GetBaseException().GetType().FullName);
                _state.Text = "HATA";
            }
            finally
            {
                try { connection?.Close(); } catch { }
                var reportPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), "KY-PDKS-Direct-Cihaz-Raporu.txt");
                try
                {
                    File.WriteAllText(reportPath, _report.ToString(), new UTF8Encoding(true));
                    Log("Rapor: " + reportPath);
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

        private void DumpDeviceObject(Device device)
        {
            Log("CİHAZ NESNESİ:");
            foreach (var prop in typeof(Device).GetProperties(BindingFlags.Instance | BindingFlags.Public).Where(p => p.CanRead))
            {
                try
                {
                    var value = prop.GetValue(device, null);
                    if (value != null && !string.IsNullOrWhiteSpace(Convert.ToString(value)))
                        Log($"  {prop.Name}: {value}");
                }
                catch { }
            }
        }

        private void ReadDeviceTime(DeviceConnection c, ref Device d)
        {
            object ep = new object(); object ed = new object();
            var ok = c.GetProperty(DeviceProperty.DeviceTime, ep, ref d, ref ed);
            Log(ok ? $"Cihaz Saati: {(DateTime)ed:yyyy-MM-dd HH:mm:ss}" : "Cihaz Saati: okunamadı");
        }

        private void ReadDeviceStatus(DeviceConnection c, ref Device d)
        {
            object ep = new object(); object ed = new object();
            var ok = c.GetProperty(DeviceProperty.Status, ep, ref d, ref ed);
            if (!ok || !(ed is UInt32[] x) || x.Length < 9) { Log("Cihaz Durumu: okunamadı"); return; }
            Log($"Durum · Kullanıcı={x[0]} Yönetici={x[1]} Parmak={x[2]} Kart={x[3]} Şifre={x[4]} YönetimLog={x[5]} HareketLog={x[6]} GeçmişYönetim={x[7]} GeçmişHareket={x[8]}");
        }

        private void ReadMac(DeviceConnection c, ref Device d)
        {
            object ep = new object(); object ed = new object();
            var ok = c.GetProperty(DeviceProperty.MacAddress, ep, ref d, ref ed);
            if (!ok || !(ed is byte[] bytes)) { Log("MAC: okunamadı"); return; }
            Log("MAC: " + string.Join(":", bytes.Select(b => b.ToString("X2"))));
        }

        private void ReadModel(DeviceConnection c, ref Device d)
        {
            object ep = new object(); object ed = Zd2911Utils.DeviceModel;
            var ok = c.GetProperty(DeviceProperty.Model, ep, ref d, ref ed);
            Log(ok ? "Cihaz Model Bilgisi: " + Convert.ToString(ed) : "Cihaz Model Bilgisi: okunamadı");
        }

        private void ReadFirmware(DeviceConnection c, ref Device d)
        {
            object ep = new object(); object ed = Zd2911Utils.DeviceFirmwareVersion;
            var ok = c.GetProperty(DeviceProperty.FirmwareVersion, ep, ref d, ref ed);
            Log(ok ? "Firmware: " + Convert.ToString(ed) : "Firmware: okunamadı");
        }
    }
}
