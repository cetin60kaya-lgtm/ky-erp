using System.Text.Json;

namespace HKN.Personel.Native;

internal sealed record TerminalDeviceSettings(
    int DeviceNo,
    string DeviceName,
    int MachineNo,
    string ConnectionType,
    string ComPort,
    int BaudRate,
    string IpAddress,
    int IpPort,
    string Direction,
    string TransferFile,
    bool DeleteAfterValidatedTransfer,
    bool BackupBeforeTransfer,
    int ToleranceMinutes)
{
    public static TerminalDeviceSettings Default => new(
        1,
        "Cihaz1",
        1,
        "Ethernet",
        "COM1",
        38400,
        "192.168.127.10",
        5005,
        "GİRİ�?",
        @"C:\Hedef500\Terminal Bilgi Aktar\timerecords.txt",
        false,
        true,
        5);
}

internal static class TerminalDeviceSettingsStore
{
    static readonly JsonSerializerOptions Json = new() { WriteIndented = true };
    static string FilePath => Path.Combine(CompanyDataPaths.Config, "terminal-device.json");

    public static TerminalDeviceSettings Load()
    {
        CompanyDataPaths.Ensure();
        try
        {
            if (!File.Exists(FilePath))
            {
                var first = TerminalDeviceSettings.Default;
                Save(first);
                return first;
            }

            var loaded = JsonSerializer.Deserialize<TerminalDeviceSettings>(File.ReadAllText(FilePath));
            var normalized = Normalize(loaded ?? TerminalDeviceSettings.Default);
            // 6.3.3 safety migration: older test builds could persist automatic device deletion as true.
            // Never carry that destructive preference forward silently.
            if (loaded is not null && loaded.DeleteAfterValidatedTransfer)
                Save(normalized);
            return normalized;
        }
        catch
        {
            return TerminalDeviceSettings.Default;
        }
    }

    public static void Save(TerminalDeviceSettings value)
    {
        CompanyDataPaths.Ensure();
        var normalized = Normalize(value);
        File.WriteAllText(FilePath, JsonSerializer.Serialize(normalized, Json));
    }

    static TerminalDeviceSettings Normalize(TerminalDeviceSettings value)
    {
        var defaults = TerminalDeviceSettings.Default;
        return value with
        {
            DeviceNo = value.DeviceNo <= 0 ? defaults.DeviceNo : value.DeviceNo,
            DeviceName = string.IsNullOrWhiteSpace(value.DeviceName) ? defaults.DeviceName : value.DeviceName.Trim(),
            MachineNo = value.MachineNo <= 0 ? defaults.MachineNo : value.MachineNo,
            ConnectionType = string.IsNullOrWhiteSpace(value.ConnectionType) ? defaults.ConnectionType : value.ConnectionType.Trim(),
            ComPort = string.IsNullOrWhiteSpace(value.ComPort) ? defaults.ComPort : value.ComPort.Trim(),
            BaudRate = value.BaudRate <= 0 ? defaults.BaudRate : value.BaudRate,
            IpAddress = string.IsNullOrWhiteSpace(value.IpAddress) ? defaults.IpAddress : value.IpAddress.Trim(),
            IpPort = value.IpPort <= 0 ? defaults.IpPort : value.IpPort,
            Direction = string.IsNullOrWhiteSpace(value.Direction) ? defaults.Direction : value.Direction.Trim(),
            TransferFile = string.IsNullOrWhiteSpace(value.TransferFile) ? defaults.TransferFile : value.TransferFile.Trim(),
            DeleteAfterValidatedTransfer = false,
            BackupBeforeTransfer = true,
            ToleranceMinutes = Math.Clamp(value.ToleranceMinutes, 0, 60)
        };
    }
}
