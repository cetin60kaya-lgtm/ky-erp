using System.Text.Json;

namespace HKN.Personel.Native;

internal sealed record TerminalHardwareProfile(
    int DeviceNo,
    string DeviceName,
    int MachineNo,
    string ConnectionType,
    string ComPort,
    int BaudRate,
    string IpAddress,
    int IpPort,
    string Direction,
    string TransferPath,
    bool DeleteAfterTransfer,
    bool BackupBeforeTransfer)
{
    public static TerminalHardwareProfile Default => new(
        1,
        "Cihaz1",
        1,
        "Ethernet",
        "COM1",
        38400,
        "192.168.1.224",
        5005,
        "GİRİŞ",
        Path.Combine(CompanyDataPaths.Tnf, $"TR{DateTime.Today.Year}.Tnf"),
        true,
        true);
}

internal static class TerminalHardwareProfileStore
{
    static readonly JsonSerializerOptions Json = new() { WriteIndented = true };
    static string FilePath => Path.Combine(CompanyDataPaths.Config, "terminal-device.json");

    public static TerminalHardwareProfile Load()
    {
        CompanyDataPaths.Ensure();
        try
        {
            if (!File.Exists(FilePath))
            {
                Save(TerminalHardwareProfile.Default);
                return TerminalHardwareProfile.Default;
            }
            var value = JsonSerializer.Deserialize<TerminalHardwareProfile>(File.ReadAllText(FilePath));
            return value ?? TerminalHardwareProfile.Default;
        }
        catch
        {
            return TerminalHardwareProfile.Default;
        }
    }

    public static void Save(TerminalHardwareProfile value)
    {
        CompanyDataPaths.Ensure();
        Directory.CreateDirectory(CompanyDataPaths.Config);
        File.WriteAllText(FilePath, JsonSerializer.Serialize(value, Json));
        ApplyToProcess(value);
    }

    public static void ApplyToProcess(TerminalHardwareProfile value)
    {
        Environment.SetEnvironmentVariable("KY_PDKS_TERMINAL_IP", value.IpAddress, EnvironmentVariableTarget.Process);
        Environment.SetEnvironmentVariable("KY_PDKS_TERMINAL_PORT", value.IpPort.ToString(), EnvironmentVariableTarget.Process);
        Environment.SetEnvironmentVariable("KY_PDKS_TERMINAL_MACHINE", value.MachineNo.ToString(), EnvironmentVariableTarget.Process);
    }
}
