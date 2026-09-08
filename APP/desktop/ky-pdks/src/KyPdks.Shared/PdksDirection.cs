namespace KyPdks.Shared;

public static class PdksDirection
{
    public static string Normalize(string? value)
        => (value ?? "").Trim().ToUpperInvariant() switch
        {
            "GIRIS" or "GİRİŞ" or "IN" or "ENTRY" => "IN",
            "CIKIS" or "ÇIKIŞ" or "OUT" or "EXIT" => "OUT",
            _ => "AUTO",
        };

    public static string Apply(string? configuredDirection, string? parsedDirection)
    {
        var configured = Normalize(configuredDirection);
        return configured != "AUTO" ? configured : Normalize(parsedDirection);
    }
}
