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
    public string MacAddress { get; init; } = "";
    public string Manufacturer { get; init; } = "";
    public string Model { get; init; } = "";
    public string SerialNumber { get; init; } = "";
    public string FirmwareVersion { get; init; } = "";
    public string AdapterProfile { get; init; } = "FP_CLOCK";
    public string LogReadMode { get; init; } = "New";

    public string HardwareKey => string.IsNullOrWhiteSpace(MacAddress)
        ? $"LEGACY-{DeviceNo}"
        : NormalizeMac(MacAddress);

    public string IdentityText
    {
        get
        {
            var parts = new[] { Manufacturer, Model }.Where(x => !string.IsNullOrWhiteSpace(x)).ToArray();
            return parts.Length == 0 ? AdapterProfile : string.Join(" / ", parts);
        }
    }

    public static TerminalDeviceSettings Default => new(
        1,
        "cihaz1",
        1,
        "Ethernet",
        "COM1",
        38400,
        "192.168.1.224",
        5005,
        "GİRİŞ",
        File.Exists(@"D:\Hedef500\Hedef500\Terminal Bilgi Aktar\timerecords.txt") ? @"D:\Hedef500\Hedef500\Terminal Bilgi Aktar\timerecords.txt" : @"C:\Hedef500\Terminal Bilgi Aktar\timerecords.txt",
        false,
        true,
        5);

    public static string NormalizeMac(string? value) =>
        string.Join("-", (value ?? "").Replace(":", "").Replace("-", "").Replace(".", "")
            .Chunk(2).Select(x => new string(x)).Where(x => x.Length == 2)).ToUpperInvariant();
}

internal sealed record TerminalDeviceRegistry(string ActiveKey, List<TerminalDeviceSettings> Devices);

internal static class TerminalDeviceSettingsStore
{
    static readonly object Gate = new();
    static readonly JsonSerializerOptions Json = new() { WriteIndented = true };
    static string LegacyFilePath => Path.Combine(CompanyDataPaths.Config, "terminal-device.json");
    static string RegistryFilePath => Path.Combine(CompanyDataPaths.Config, "terminal-devices.json");

    public static TerminalDeviceSettings Load()
    {
        lock (Gate)
        {
            var registry = ReadRegistry();
            var active = registry.Devices.FirstOrDefault(x => x.HardwareKey.Equals(registry.ActiveKey, StringComparison.OrdinalIgnoreCase))
                ?? registry.Devices.FirstOrDefault()
                ?? TerminalDeviceSettings.Default;
            return Normalize(active);
        }
    }

    public static IReadOnlyList<TerminalDeviceSettings> LoadAll()
    {
        lock (Gate)
            return ReadRegistry().Devices.Select(Normalize).OrderBy(x => x.DeviceNo).ToArray();
    }

    public static void Save(TerminalDeviceSettings value)
    {
        lock (Gate)
        {
            CompanyDataPaths.Ensure();
            var normalized = Normalize(value);
            var registry = ReadRegistry();
            var devices = registry.Devices.Select(Normalize).ToList();
            var index = devices.FindIndex(x => x.HardwareKey.Equals(normalized.HardwareKey, StringComparison.OrdinalIgnoreCase));
            if (index < 0 && string.IsNullOrWhiteSpace(normalized.MacAddress))
                index = devices.FindIndex(x => x.DeviceNo == normalized.DeviceNo);
            if (index >= 0) devices[index] = normalized;
            else devices.Add(normalized);
            WriteRegistry(new TerminalDeviceRegistry(normalized.HardwareKey, devices));
            WriteLegacy(normalized);
        }
    }

    public static TerminalDeviceSettings SelectForDetectedMac(string? macAddress, string ipAddress)
    {
        lock (Gate)
        {
            var mac = TerminalDeviceSettings.NormalizeMac(macAddress);
            if (string.IsNullOrWhiteSpace(mac)) return Load();

            var registry = ReadRegistry();
            var existing = registry.Devices.FirstOrDefault(x =>
                TerminalDeviceSettings.NormalizeMac(x.MacAddress).Equals(mac, StringComparison.OrdinalIgnoreCase));
            if (existing is not null)
            {
                var selected = Normalize(existing);
                WriteRegistry(registry with { ActiveKey = selected.HardwareKey });
                WriteLegacy(selected);
                return selected;
            }

            var basis = registry.Devices.FirstOrDefault(x => x.HardwareKey.Equals(registry.ActiveKey, StringComparison.OrdinalIgnoreCase))
                ?? registry.Devices.FirstOrDefault()
                ?? TerminalDeviceSettings.Default;
            var nextNo = registry.Devices.Count == 0 ? 1 : registry.Devices.Max(x => x.DeviceNo) + 1;
            var detected = Normalize(basis with
            {
                DeviceNo = nextNo,
                DeviceName = $"cihaz{nextNo}",
                IpAddress = string.IsNullOrWhiteSpace(ipAddress) ? basis.IpAddress : ipAddress,
                MacAddress = mac,
                Manufacturer = GuessManufacturer(mac),
                Model = "",
                SerialNumber = "",
                FirmwareVersion = "",
                AdapterProfile = "FP_CLOCK",
                LogReadMode = "All"
            });
            var devices = registry.Devices.Select(Normalize).ToList();
            devices.Add(detected);
            WriteRegistry(new TerminalDeviceRegistry(detected.HardwareKey, devices));
            WriteLegacy(detected);
            return detected;
        }
    }

    public static TerminalDeviceSettings UpdateDetectedIdentity(
        string? macAddress,
        string? manufacturer,
        string? model,
        string? serialNumber,
        string? firmwareVersion)
    {
        lock (Gate)
        {
            var mac = TerminalDeviceSettings.NormalizeMac(macAddress);
            var registry = ReadRegistry();
            var index = registry.Devices.FindIndex(x =>
                (!string.IsNullOrWhiteSpace(mac) && TerminalDeviceSettings.NormalizeMac(x.MacAddress).Equals(mac, StringComparison.OrdinalIgnoreCase)) ||
                x.HardwareKey.Equals(registry.ActiveKey, StringComparison.OrdinalIgnoreCase));
            if (index < 0) return Load();

            var current = Normalize(registry.Devices[index]);
            var updated = Normalize(current with
            {
                MacAddress = string.IsNullOrWhiteSpace(mac) ? current.MacAddress : mac,
                Manufacturer = string.IsNullOrWhiteSpace(manufacturer) ? current.Manufacturer : manufacturer.Trim(),
                Model = string.IsNullOrWhiteSpace(model) ? current.Model : model.Trim(),
                SerialNumber = string.IsNullOrWhiteSpace(serialNumber) ? current.SerialNumber : serialNumber.Trim(),
                FirmwareVersion = string.IsNullOrWhiteSpace(firmwareVersion) ? current.FirmwareVersion : firmwareVersion.Trim()
            });
            registry.Devices[index] = updated;
            WriteRegistry(registry with { ActiveKey = updated.HardwareKey });
            WriteLegacy(updated);
            return updated;
        }
    }

    public static void SetActive(TerminalDeviceSettings value)
    {
        lock (Gate)
        {
            var normalized = Normalize(value);
            var registry = ReadRegistry();
            if (!registry.Devices.Any(x => x.HardwareKey.Equals(normalized.HardwareKey, StringComparison.OrdinalIgnoreCase)))
                registry.Devices.Add(normalized);
            WriteRegistry(registry with { ActiveKey = normalized.HardwareKey });
            WriteLegacy(normalized);
        }
    }

    public static bool Remove(TerminalDeviceSettings value)
    {
        lock (Gate)
        {
            var registry = ReadRegistry();
            var removed = registry.Devices.RemoveAll(x => x.HardwareKey.Equals(value.HardwareKey, StringComparison.OrdinalIgnoreCase)) > 0;
            if (!removed) return false;
            var active = registry.Devices.FirstOrDefault();
            WriteRegistry(new TerminalDeviceRegistry(active?.HardwareKey ?? "", registry.Devices));
            if (active is not null) WriteLegacy(active);
            return true;
        }
    }

    static TerminalDeviceRegistry ReadRegistry()
    {
        CompanyDataPaths.Ensure();
        try
        {
            if (File.Exists(RegistryFilePath))
            {
                var registry = JsonSerializer.Deserialize<TerminalDeviceRegistry>(File.ReadAllText(RegistryFilePath), Json);
                if (registry is not null && registry.Devices.Count > 0)
                    return registry with { Devices = registry.Devices.Select(Normalize).ToList() };
            }
        }
        catch { }

        TerminalDeviceSettings first;
        try
        {
            first = File.Exists(LegacyFilePath)
                ? JsonSerializer.Deserialize<TerminalDeviceSettings>(File.ReadAllText(LegacyFilePath), Json) ?? TerminalDeviceSettings.Default
                : TerminalDeviceSettings.Default;
        }
        catch { first = TerminalDeviceSettings.Default; }

        first = Normalize(first);
        var created = new TerminalDeviceRegistry(first.HardwareKey, new List<TerminalDeviceSettings> { first });
        WriteRegistry(created);
        return created;
    }

    static void WriteRegistry(TerminalDeviceRegistry registry)
    {
        CompanyDataPaths.Ensure();
        var clean = registry with { Devices = registry.Devices.Select(Normalize).ToList() };
        var temporary = RegistryFilePath + ".tmp";
        File.WriteAllText(temporary, JsonSerializer.Serialize(clean, Json));
        File.Move(temporary, RegistryFilePath, true);
    }

    static void WriteLegacy(TerminalDeviceSettings value)
    {
        File.WriteAllText(LegacyFilePath, JsonSerializer.Serialize(Normalize(value), Json));
    }

    static string GuessManufacturer(string mac)
    {
        if (mac.StartsWith("00-23-79-", StringComparison.OrdinalIgnoreCase))
            return "Union Business Machines Co. Ltd.";
        return "";
    }

    static TerminalDeviceSettings Normalize(TerminalDeviceSettings value)
    {
        var defaults = TerminalDeviceSettings.Default;
        var mac = TerminalDeviceSettings.NormalizeMac(value.MacAddress);
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
            DeleteAfterValidatedTransfer = value.DeleteAfterValidatedTransfer,
            BackupBeforeTransfer = value.BackupBeforeTransfer,
            ToleranceMinutes = Math.Clamp(value.ToleranceMinutes, 0, 60),
            MacAddress = mac,
            Manufacturer = value.Manufacturer?.Trim() ?? "",
            Model = value.Model?.Trim() ?? "",
            SerialNumber = value.SerialNumber?.Trim() ?? "",
            FirmwareVersion = value.FirmwareVersion?.Trim() ?? "",
            AdapterProfile = string.IsNullOrWhiteSpace(value.AdapterProfile) ? "FP_CLOCK" : value.AdapterProfile.Trim(),
            LogReadMode = value.LogReadMode.Equals("All", StringComparison.OrdinalIgnoreCase) ? "All" : "New"
        };
    }
}
