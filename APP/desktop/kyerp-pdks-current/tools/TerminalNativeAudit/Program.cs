using System.Diagnostics;
using System.Net.Sockets;
using System.Reflection;
using HKN.Personel.Native;

const string ip = "192.168.1.224";
const int primaryPort = 5005;
const int fallbackPort = 5001;
const string expectedMac = "00-01-A9-12-2D-00";

var stamp = DateTime.Now.ToString("yyyyMMdd-HHmmss");
var root = Environment.GetEnvironmentVariable("KYERP_PDKS_ROOT")
    ?? @"D:\Googledrive\KYERP-PDKS-MASAUSTU";
var outDir = Path.Combine(root, "08_TEST", "TERMINAL_NATIVE", stamp);
Directory.CreateDirectory(outDir);
var lines = new List<string>();
void Log(string text) { Console.WriteLine(text); lines.Add(text); }

Log($"TIME={DateTime.Now:O}");
Log($"DEVICE_IP={ip}");
Log($"EXPECTED_MAC={expectedMac}");
Log($"PRIMARY_FP_CLOCK_PORT={primaryPort}");
Log($"FALLBACK_NATIVE_PORT={fallbackPort}");
static async Task<bool> TcpOpen(string ip, int port)
{
    try
    {
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(3));
        using var client = new TcpClient();
        await client.ConnectAsync(ip, port, cts.Token);
        return client.Connected;
    }
    catch { return false; }
}

var arp = Process.Start(new ProcessStartInfo("arp", "-a")
{
    RedirectStandardOutput = true,
    UseShellExecute = false,
    CreateNoWindow = true
});
var arpText = arp is null ? "" : await arp.StandardOutput.ReadToEndAsync();
if (arp is not null) await arp.WaitForExitAsync();
var macFound = arpText.Contains("00-01-a9-12-2d-00", StringComparison.OrdinalIgnoreCase);
var primaryOpen = await TcpOpen(ip, primaryPort);
var fallbackOpen = await TcpOpen(ip, fallbackPort);
Log($"MAC_MATCH={macFound}");
Log($"PRIMARY_5005_OPEN={primaryOpen}");
Log($"FALLBACK_5001_OPEN={fallbackOpen}");
var asm = typeof(LegacyTerminalSettingsForm).Assembly;
var clientType = asm.GetType("HKN.Personel.Native.TerminalDeviceClient")!;
var readMethod = clientType.GetMethod("ReadAsync", BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic)!;

async Task<object> InvokeRead(bool punches)
{
    var task = (Task)readMethod.Invoke(null, new object?[] { punches, CancellationToken.None })!;
    await task;
    return task.GetType().GetProperty("Result")!.GetValue(task)!;
}

var status = await InvokeRead(false);
var statusType = status.GetType();
var statusConnected = (bool)statusType.GetProperty("Connected")!.GetValue(status)!;
var statusMessage = Convert.ToString(statusType.GetProperty("Message")!.GetValue(status)) ?? "";
var statusTime = Convert.ToString(statusType.GetProperty("DeviceTime")!.GetValue(status)) ?? "";
Log($"APP_STATUS_CONNECTED={statusConnected}");
Log($"APP_STATUS_MESSAGE={statusMessage}");
Log($"APP_DEVICE_TIME={statusTime}");

var read = await InvokeRead(true);
var readType = read.GetType();
var readConnected = (bool)readType.GetProperty("Connected")!.GetValue(read)!;
var punchesObj = readType.GetProperty("Punches")!.GetValue(read) as System.Collections.ICollection;
var punchCount = punchesObj?.Count ?? 0;
Log($"APP_READ_CONNECTED={readConnected}");
Log($"APP_READ_PUNCH_COUNT={punchCount}");

var pass = macFound && primaryOpen && statusConnected && readConnected;
Log($"STATUS_RESULT={(pass ? "PASS" : "FAIL")}");
Log("WRITE_TO_DEVICE=DISABLED");
Log("DELETE_FROM_DEVICE=DISABLED");
await File.WriteAllLinesAsync(Path.Combine(outDir, "RESULT.txt"), lines);
await File.WriteAllTextAsync(Path.Combine(root, "08_TEST", "TERMINAL_NATIVE", "LATEST.txt"), outDir);
Console.WriteLine($"RESULT={outDir}");
Environment.ExitCode = pass ? 0 : 2;
