using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;

namespace HKN.Personel.Native;

internal sealed record TerminalNetworkProbeResult(bool AddressValid, bool PortOpen, string Message);

internal static class TerminalNetworkDiagnostics
{
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
            return new(true, false, $"{ip}:{port} zaman aşımına uğradı. Cihaz IP/port veya ağ bağlantısı yanlış olabilir.");
        }
        catch (SocketException ex) when (ex.SocketErrorCode == SocketError.ConnectionRefused)
        {
            return new(true, false, $"{ip} erişiliyor ancak {port} portu bağlantıyı reddediyor. Kart cihazında Ethernet haberleşme portunu kontrol edin.");
        }
        catch (SocketException ex)
        {
            return new(true, false, $"{ip}:{port} ağ bağlantısı açılamadı ({ex.SocketErrorCode}). IP, kablo/ağ ve cihaz portunu kontrol edin.");
        }
        catch (Exception ex)
        {
            return new(true, false, $"Terminal ağ kontrolü başarısız: {ex.GetBaseException().Message}");
        }
    }
}
