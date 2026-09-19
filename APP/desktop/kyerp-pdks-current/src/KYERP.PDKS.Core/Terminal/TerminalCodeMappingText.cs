namespace KYERP.PDKS.Core.Terminal;

public static class TerminalCodeMappingText
{
    public static string Format(IReadOnlyDictionary<string, string> mapping) =>
        string.Join("; ", mapping.OrderBy(item => item.Key, StringComparer.OrdinalIgnoreCase)
            .Select(item => $"{item.Key}={item.Value}"));

    public static Dictionary<string, string> Parse(string? value, string fieldName)
    {
        var result = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var part in (value ?? string.Empty).Split([';', '\r', '\n'], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            var separator = part.IndexOf('=');
            if (separator < 1 || separator == part.Length - 1)
                throw new ArgumentException($"{fieldName} 'kod=değer' biçiminde olmalıdır.");
            var code = part[..separator].Trim();
            var description = part[(separator + 1)..].Trim();
            if (!result.TryAdd(code, description))
                throw new ArgumentException($"{fieldName} içinde yinelenen kod var: {code}");
        }
        return result;
    }
}
