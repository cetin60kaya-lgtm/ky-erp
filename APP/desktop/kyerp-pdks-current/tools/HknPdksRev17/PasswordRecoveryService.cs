using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace QuickDataTool;

internal static class PasswordRecoveryService
{
    internal sealed record Verifier(string Salt, string Expected);
    static readonly string Root = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "HKN-PDKS");
    static readonly string PasswordPath = Path.Combine(Root, "REV25_PASSWORD.json");
    static readonly string RecoveryPath = Path.Combine(Root, "REV25_RECOVERY.json");
    internal static readonly string RecoveryTextPath = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments), "HKN PDKS", "REV25_KURTARMA_KODU.txt");

    internal static Verifier CurrentPassword(Verifier embedded)
    {
        try
        {
            if (!File.Exists(PasswordPath)) return embedded;
            return JsonSerializer.Deserialize<Verifier>(File.ReadAllText(PasswordPath, Encoding.UTF8)) ?? embedded;
        }
        catch { return embedded; }
    }

    internal static bool Verify(string secret, Verifier verifier)
    {
        try
        {
            var salt = Convert.FromBase64String(verifier.Salt);
            var expected = Convert.FromBase64String(verifier.Expected);
            var actual = Rfc2898DeriveBytes.Pbkdf2(Encoding.UTF8.GetBytes(secret ?? ""), salt, 210000, HashAlgorithmName.SHA256, 32);
            return expected.Length == actual.Length && CryptographicOperations.FixedTimeEquals(actual, expected);
        }
        catch { return false; }
    }

    internal static void SetPassword(string password)
    {
        if (string.IsNullOrWhiteSpace(password) || password.Length < 6)
            throw new InvalidOperationException("Yeni şifre en az 6 karakter olmalıdır.");
        Directory.CreateDirectory(Root);
        File.WriteAllText(PasswordPath, JsonSerializer.Serialize(CreateVerifier(password)), new UTF8Encoding(false));
    }

    internal static void EnsureRecoveryCode(bool regenerateIfTextMissing = false)
    {
        Directory.CreateDirectory(Root);
        var textDirectory = Path.GetDirectoryName(RecoveryTextPath)!;
        Directory.CreateDirectory(textDirectory);
        if (File.Exists(RecoveryPath) && (!regenerateIfTextMissing || File.Exists(RecoveryTextPath))) return;
        var code = GenerateCode();
        File.WriteAllText(RecoveryPath, JsonSerializer.Serialize(CreateVerifier(code)), new UTF8Encoding(false));
        File.WriteAllText(RecoveryTextPath,
            "HKN PDKS REV25 KURTARMA KODU\r\n\r\n" +
            code + "\r\n\r\n" +
            "Bu kod yalnız bu Windows kullanıcı hesabındaki HKN PDKS şifresini sıfırlamak içindir.\r\n" +
            "Kodu güvenli bir yerde saklayın.\r\n", new UTF8Encoding(true));
    }

    internal static bool VerifyRecovery(string code)
    {
        if (!File.Exists(RecoveryPath)) return false;
        try
        {
            var verifier = JsonSerializer.Deserialize<Verifier>(File.ReadAllText(RecoveryPath, Encoding.UTF8));
            return verifier is not null && Verify(code.Trim().ToUpperInvariant(), verifier);
        }
        catch { return false; }
    }

    internal static void RegenerateRecoveryCode() => EnsureRecoveryCode(true);

    static Verifier CreateVerifier(string secret)
    {
        var salt = RandomNumberGenerator.GetBytes(24);
        var expected = Rfc2898DeriveBytes.Pbkdf2(Encoding.UTF8.GetBytes(secret), salt, 210000, HashAlgorithmName.SHA256, 32);
        return new(Convert.ToBase64String(salt), Convert.ToBase64String(expected));
    }

    static string GenerateCode()
    {
        const string alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        Span<char> chars = stackalloc char[12];
        for (var i = 0; i < chars.Length; i++) chars[i] = alphabet[RandomNumberGenerator.GetInt32(alphabet.Length)];
        return $"{new string(chars[..4])}-{new string(chars[4..8])}-{new string(chars[8..])}";
    }
}
