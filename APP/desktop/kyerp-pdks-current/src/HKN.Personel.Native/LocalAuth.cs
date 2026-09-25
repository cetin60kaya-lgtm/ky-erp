using System.Security.Cryptography;
using System.Text.Json;

namespace HKN.Personel.Native;

public sealed class LocalUser
{
    public string UserName { get; set; } = "";
    public string PasswordHash { get; set; } = "";
    public string Salt { get; set; } = "";
    public bool IsActive { get; set; } = true;
    public bool IsAdmin { get; set; }
    public List<string> Permissions { get; set; } = [];

    public bool Can(PdksModule module) => IsAdmin || Permissions.Contains(module.ToString(), StringComparer.OrdinalIgnoreCase);
    public override string ToString() => UserName;
}

internal static class LocalAuthStore
{
    static readonly string Dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "KYERP", "PDKS");
    static readonly string FilePath = Path.Combine(Dir, "users.json");
    static readonly JsonSerializerOptions JsonOptions = new() { WriteIndented = true };

    public static bool HasUsers => Load().Count > 0;

    public static List<LocalUser> Load()
    {
        Directory.CreateDirectory(Dir);
        if (!File.Exists(FilePath)) return [];
        try { return JsonSerializer.Deserialize<List<LocalUser>>(File.ReadAllText(FilePath), JsonOptions) ?? []; }
        catch { return []; }
    }

    public static void Save(List<LocalUser> users)
    {
        Directory.CreateDirectory(Dir);
        File.WriteAllText(FilePath, JsonSerializer.Serialize(users, JsonOptions));
    }

    public static LocalUser CreateUser(string userName, string password, bool active, bool admin, IEnumerable<string> permissions)
    {
        var salt = RandomNumberGenerator.GetBytes(16);
        var hash = Hash(password, salt);
        return new LocalUser
        {
            UserName = userName.Trim().ToUpperInvariant(), Salt = Convert.ToBase64String(salt),
            PasswordHash = Convert.ToBase64String(hash), IsActive = active, IsAdmin = admin,
            Permissions = permissions.Distinct(StringComparer.OrdinalIgnoreCase).ToList()
        };
    }

    public static void SetPassword(LocalUser user, string password)
    {
        var salt = RandomNumberGenerator.GetBytes(16);
        user.Salt = Convert.ToBase64String(salt);
        user.PasswordHash = Convert.ToBase64String(Hash(password, salt));
    }

    public static bool Validate(string userName, string password, out LocalUser? user)
    {
        user = Load().FirstOrDefault(x => x.UserName.Equals(userName.Trim(), StringComparison.OrdinalIgnoreCase));
        if (user is null || !user.IsActive || string.IsNullOrEmpty(user.Salt) || string.IsNullOrEmpty(user.PasswordHash)) return false;
        try
        {
            var actual = Hash(password, Convert.FromBase64String(user.Salt));
            return CryptographicOperations.FixedTimeEquals(actual, Convert.FromBase64String(user.PasswordHash));
        }
        catch { return false; }
    }

    static byte[] Hash(string password, byte[] salt) => Rfc2898DeriveBytes.Pbkdf2(password, salt, 120_000, HashAlgorithmName.SHA256, 32);
}
