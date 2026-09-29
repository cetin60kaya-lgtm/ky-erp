using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace KyPdks.Shared;

public sealed class PdksPaths
{
    public string Root { get; }
    public string Data => Path.Combine(Root, "Data");
    public string Import => Path.Combine(Root, "Import");
    public string Archive => Path.Combine(Root, "Archive");
    public string Reject => Path.Combine(Root, "Reject");
    public string Backup => Path.Combine(Root, "Backup");
    public string Logs => Path.Combine(Root, "Logs");
    public string Database => Path.Combine(Data, "pdks.db");
    public string ConfigFile => Path.Combine(Root, "config.json");
    public string DeviceFile => Path.Combine(Root, "device.id");
    public string UserRoot => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "KY ERP", "PDKS");
    public string SessionFile => Path.Combine(UserRoot, "session.bin");
    public string DeviceId { get; }
    public string DeviceLabel => $"PDKS-WINDOWS:{Environment.MachineName}:{DeviceId}";

    public PdksPaths(string? rootOverride = null)
    {
        Root = string.IsNullOrWhiteSpace(rootOverride)
            ? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "KY ERP", "PDKS")
            : Path.GetFullPath(rootOverride);
        foreach (var path in new[] { Root, Data, Import, Archive, Reject, Backup, Logs }) Directory.CreateDirectory(path);
        var id = File.Exists(DeviceFile) ? File.ReadAllText(DeviceFile).Trim() : "";
        if (string.IsNullOrWhiteSpace(id))
        {
            id = Guid.NewGuid().ToString("N");
            File.WriteAllText(DeviceFile, id, Encoding.UTF8);
        }
        DeviceId = id;
    }
}

public sealed class ConfigStore(PdksPaths paths)
{
    private static readonly JsonSerializerOptions Json = new() { WriteIndented = true, PropertyNameCaseInsensitive = true };

    public PdksConfig Load()
    {
        try
        {
            if (!File.Exists(paths.ConfigFile))
            {
                var created = new PdksConfig();
                Save(created);
                return created;
            }
            var config = JsonSerializer.Deserialize<PdksConfig>(File.ReadAllText(paths.ConfigFile, Encoding.UTF8), Json) ?? new PdksConfig();
            config.Normalize();
            return config;
        }
        catch
        {
            return new PdksConfig();
        }
    }

    public void Save(PdksConfig config)
    {
        config.Normalize();
        var temp = paths.ConfigFile + ".tmp";
        File.WriteAllText(temp, JsonSerializer.Serialize(config, Json), new UTF8Encoding(false));
        File.Move(temp, paths.ConfigFile, true);
    }
}

// ERP oturumu yalnız masaüstünde giriş yapan Windows kullanıcısına aittir.
// Agent bu dosyayı okumaz; uygulama kapalıyken yalnız kart toplama devam eder.
public sealed class SecureSessionStore(PdksPaths paths)
{
    private static readonly JsonSerializerOptions Json = new() { PropertyNameCaseInsensitive = true };
    private static readonly byte[] Entropy = Encoding.UTF8.GetBytes("KYERP-PDKS-WINDOWS-V1");

    public void Save(string token, string userName, string fullName, string role)
    {
        var exp = JwtExpiry(token);
        if (exp <= 0) throw new InvalidOperationException("KY ERP oturum tokenı geçerli bir süre bilgisi taşımıyor.");
        Directory.CreateDirectory(paths.UserRoot);
        var payload = new StoredSession(token, userName, fullName, role, exp, paths.DeviceLabel, DateTimeOffset.Now);
        var clear = JsonSerializer.SerializeToUtf8Bytes(payload, Json);
        var encrypted = ProtectedData.Protect(clear, Entropy, DataProtectionScope.CurrentUser);
        var temp = paths.SessionFile + ".tmp";
        File.WriteAllBytes(temp, encrypted);
        File.Move(temp, paths.SessionFile, true);
    }

    public StoredSession? Load()
    {
        try
        {
            if (!File.Exists(paths.SessionFile)) return null;
            var encrypted = File.ReadAllBytes(paths.SessionFile);
            var clear = ProtectedData.Unprotect(encrypted, Entropy, DataProtectionScope.CurrentUser);
            var session = JsonSerializer.Deserialize<StoredSession>(clear, Json);
            return session?.DeviceLabel == paths.DeviceLabel ? session : null;
        }
        catch
        {
            return null;
        }
    }

    public void Clear()
    {
        try { if (File.Exists(paths.SessionFile)) File.Delete(paths.SessionFile); } catch { }
    }

    public static long JwtExpiry(string token)
    {
        try
        {
            var parts = token.Split('.');
            if (parts.Length != 3) return 0;
            var raw = parts[1].Replace('-', '+').Replace('_', '/');
            raw += new string('=', (4 - raw.Length % 4) % 4);
            using var document = JsonDocument.Parse(Convert.FromBase64String(raw));
            return document.RootElement.TryGetProperty("exp", out var exp) && exp.TryGetInt64(out var value) ? value : 0;
        }
        catch { return 0; }
    }
}
