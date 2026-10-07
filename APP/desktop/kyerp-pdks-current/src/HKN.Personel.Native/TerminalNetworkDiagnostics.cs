using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Runtime.InteropServices;

namespace HKN.Personel.Native;

internal sealed record TerminalNetworkProbeResult(bool AddressValid, bool PortOpen, string Message);

internal static class TerminalNetworkDiagnostics
{
    [DllImport("iphlpapi.dll", ExactSpelling = true)]
    static extern int SendARP(uint destIp, uint srcIp, byte[] macAddr, ref int physicalAddrLen);

    public static async Task<TerminalNetworkProbeResult> CheckAsync(string ip, int port, CancellationToken cancellationToken = default)
    {
        if (!IPAddress.TryParse(ip, out _))
            return new(false, false, $"Geçersiz terminal IP adresi: {ip}");
        if (port is < 1 or > 65535)
            return new(true, false, $"Geçersiz terminal portu: {port}");

        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(TimeSpan.FromSeconds(2));
        try
        {
            using var client = new TcpClient();
            await client.ConnectAsync(ip, port, timeout.Token);
            return new(true, true, $"Ağ bağlantısı hazır: {ip}:{port}");
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            return new(true, false, $"{ip}:{port} erişilemiyor. Cihaz kapalı olabilir veya Ethernet/ağ bağlantısı yok.");
        }
        catch (SocketException ex) when (ex.SocketErrorCode == SocketError.ConnectionRefused)
        {
            return new(true, false, $"{ip} erişiliyor ancak {port} portu bağlantıyı reddediyor. Kart cihazında Ethernet haberleşme portunu kontrol edin.");
        }
        catch (SocketException ex)
        {
            return new(true, false, $"{ip}:{port} erişilemiyor ({ex.SocketErrorCode}). Cihaz kapalı olabilir; IP, Ethernet kablosu ve ağ bağlantısını kontrol edin.");
        }
        catch (Exception ex)
        {
            return new(true, false, $"Terminal ağ kontrolü başarısız: {ex.GetBaseException().Message}");
        }
    }

    public static async Task<string> ResolveMacAsync(string ip, CancellationToken cancellationToken = default)
    {
        if (!IPAddress.TryParse(ip, out var address) || address.AddressFamily != AddressFamily.InterNetwork)
            return "";

        try
        {
            using var ping = new Ping();
            _ = await ping.SendPingAsync(address, 900);
        }
        catch { }

        cancellationToken.ThrowIfCancellationRequested();
        try
        {
            var bytes = address.GetAddressBytes();
            var destination = BitConverter.ToUInt32(bytes, 0);
            var mac = new byte[6];
            var length = mac.Length;
            var result = SendARP(destination, 0, mac, ref length);
            if (result != 0 || length <= 0) return "";
            return string.Join("-", mac.Take(length).Select(x => x.ToString("X2")));
        }
        catch
        {
            return "";
        }
    }
}
