using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using FirebirdSql.Data.FirebirdClient;

namespace KyPdks.Unified;

internal sealed record LocalEvidenceReport(
    bool Ready,
    string Code,
    string Message,
    bool FdbValidated,
    bool TnfValidated,
    bool TnfTouched,
    int FdbNormalCount,
    int TnfCount,
    int MissingInTnf,
    int ExtraInTnf,
    string EvidenceSha256);

internal static class FirebirdTnfReadOnlyVerifier
{
    internal static async Task<LocalEvidenceReport> VerifyAsync(
        string? cardNo,
        DateTime? workDate,
        CancellationToken cancellationToken = default)
    {
        try
        {
            var dbPath = ResolveDatabasePath();
            if (dbPath is null || !File.Exists(dbPath))
                return Failed("FDB_PATH_NOT_READY", "Firebird veri dosyası bulunamadı.");

            var password = Read("KY_PDKS_DB_PASSWORD");
            if (string.IsNullOrWhiteSpace(password))
                return Failed("FDB_PASSWORD_REQUIRED", "Firebird parolası ortam değişkeninde bulunamadı.");

            var builder = new FbConnectionStringBuilder
            {
                Database = dbPath,
                UserID = Read("KY_PDKS_DB_USER", "SYSDBA"),
                Password = password,
                DataSource = Read("KY_PDKS_DB_HOST", "127.0.0.1"),
                Port = int.TryParse(Read("KY_PDKS_DB_PORT", "3050"), out var port) ? port : 3050,
                Dialect = 3,
                Charset = Read("KY_PDKS_DB_CHARSET", "NONE"),
                Pooling = false,
            };
            await using var connection = new FbConnection(builder.ToString());
            await connection.OpenAsync(cancellationToken);

            foreach (var table in new[] { "KIMLIK", "GIRCIK" })
            {
                await using var tableCommand = new FbCommand(
                    "select count(*) from rdb$relations where trim(rdb$relation_name)=@T", connection);
                tableCommand.Parameters.AddWithValue("@T", table);
                var count = Convert.ToInt32(await tableCommand.ExecuteScalarAsync(cancellationToken), CultureInfo.InvariantCulture);
                if (count != 1) return Failed("FDB_SCHEMA_NOT_READY", $"Firebird {table} tablosu bulunamadı.");
            }

            var normalizedCard = NormalizeCard(cardNo);
            if (!string.IsNullOrWhiteSpace(normalizedCard))
            {
                await using var personCommand = new FbCommand(
                    "select count(*) from KIMLIK where PKNO=@PK", connection);
                personCommand.Parameters.AddWithValue("@PK", normalizedCard);
                var count = Convert.ToInt32(await personCommand.ExecuteScalarAsync(cancellationToken), CultureInfo.InvariantCulture);
                if (count < 1) return Failed("FDB_PERSON_NOT_FOUND", $"Kart {normalizedCard} Firebird KIMLIK içinde bulunamadı.");
            }

            if (workDate is null)
            {
                var hash = Hash($"FDB|{Path.GetFileName(dbPath)}|{normalizedCard}|SCHEMA_OK");
                return new(true, "FDB_READONLY_OK",
                    "Firebird şeması ve kişi eşlemesi salt okunur doğrulandı; TNF bu komut için değiştirilmedi.",
                    true, false, false, 0, 0, 0, 0, hash);
            }

            var day = workDate.Value.Date;
            var expected = await ReadFdbNormalLinesAsync(connection, normalizedCard, day, cancellationToken);
            var tnfPath = ResolveTnfPath(day.Year);
            if (tnfPath is null || !File.Exists(tnfPath))
                return Failed("TNF_FILE_NOT_READY", $"TR{day.Year}.Tnf bulunamadı.");

            var actual = new HashSet<string>(StringComparer.Ordinal);
            foreach (var line in await File.ReadAllLinesAsync(tnfPath, cancellationToken))
            {
                if (!TryParseTnf(line, out var parsed)) continue;
                if (parsed.Day != day) continue;
                if (!string.IsNullOrWhiteSpace(normalizedCard) &&
                    !string.Equals(parsed.Card, normalizedCard, StringComparison.Ordinal)) continue;
                actual.Add(parsed.Line);
            }

            var missing = expected.Except(actual, StringComparer.Ordinal).Count();
            var extra = actual.Except(expected, StringComparer.Ordinal).Count();
            var exact = missing == 0 && extra == 0;
            var evidenceHash = Hash(string.Join("\n", expected.Order()) + "\n--TNF--\n" + string.Join("\n", actual.Order()));
            return new(exact, exact ? "FDB_TNF_READONLY_MATCH" : "FDB_TNF_READONLY_MISMATCH",
                exact
                    ? $"FDB ↔ TNF salt okunur mutabakatı tam: {expected.Count} normal hareket."
                    : $"FDB ↔ TNF farkı: FDB={expected.Count}, TNF={actual.Count}, eksik={missing}, fazla={extra}.",
                true, exact, false, expected.Count, actual.Count, missing, extra, evidenceHash);
        }
        catch (Exception error)
        {
            return Failed("FDB_TNF_VERIFY_ERROR", error.Message);
        }
    }

    private static async Task<HashSet<string>> ReadFdbNormalLinesAsync(
        FbConnection connection,
        string cardNo,
        DateTime day,
        CancellationToken cancellationToken)
    {
        var expected = new HashSet<string>(StringComparer.Ordinal);
        var sql = @"select PKNO,GTARIH,GSAAT,GTUR,CTARIH,CSAAT,CTUR from GIRCIK
                    where (@PK='' or PKNO=@PK)
                      and ((GTARIH>=@D and GTARIH<@N) or (CTARIH>=@D and CTARIH<@N))
                    order by SIRA";
        await using var command = new FbCommand(sql, connection);
        command.Parameters.AddWithValue("@PK", cardNo);
        command.Parameters.AddWithValue("@D", day);
        command.Parameters.AddWithValue("@N", day.AddDays(1));
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            var card = NormalizeCard(reader["PKNO"]?.ToString());
            AddSide(expected, card, day, reader, "G");
            AddSide(expected, card, day, reader, "C");
        }
        return expected;
    }

    private static void AddSide(HashSet<string> expected, string card, DateTime day, FbDataReader row, string prefix)
    {
        if (row[prefix + "TARIH"] is DBNull || row[prefix + "SAAT"] is DBNull) return;
        var date = Convert.ToDateTime(row[prefix + "TARIH"], CultureInfo.InvariantCulture).Date;
        if (date != day) return;
        var type = Convert.ToString(row[prefix + "TUR"], CultureInfo.InvariantCulture)?.Trim() ?? string.Empty;
        if (string.Equals(type, "E", StringComparison.OrdinalIgnoreCase)) return;
        var raw = Convert.ToString(row[prefix + "SAAT"], CultureInfo.InvariantCulture)?.Trim() ?? string.Empty;
        if (!TimeSpan.TryParse(raw, CultureInfo.InvariantCulture, out var time) &&
            !TimeSpan.TryParse(raw, new CultureInfo("tr-TR"), out time)) return;
        expected.Add($"{card},{time.Hours:00}:{time.Minutes:00},{day:ddMMyy},1,001");
    }

    private static bool TryParseTnf(string raw, out (string Card, DateTime Day, string Line) parsed)
    {
        parsed = default;
        var line = (raw ?? string.Empty).Trim();
        var p = line.Split(',');
        if (p.Length != 5 || p[3].Trim() != "1" || p[4].Trim() != "001") return false;
        var card = NormalizeCard(p[0]);
        if (string.IsNullOrWhiteSpace(card) ||
            !TimeSpan.TryParseExact(p[1].Trim(), "hh\\:mm", CultureInfo.InvariantCulture, out _) ||
            !DateTime.TryParseExact(p[2].Trim(), "ddMMyy", CultureInfo.InvariantCulture,
                DateTimeStyles.None, out var day)) return false;
        parsed = (card, day.Date, $"{card},{p[1].Trim()},{p[2].Trim()},1,001");
        return true;
    }

    private static string NormalizeCard(string? value)
    {
        var card = (value ?? string.Empty).Trim();
        return card.Length == 0 || card.Any(ch => !char.IsDigit(ch)) ? string.Empty : card.PadLeft(5, '0');
    }

    private static string? ResolveDatabasePath()
    {
        var direct = Read("KY_PDKS_DB_PATH");
        if (!string.IsNullOrWhiteSpace(direct)) return direct;
        var root = Read("KY_PDKS_COMPANY_ROOT");
        return string.IsNullOrWhiteSpace(root) ? null : Path.Combine(root, "DATA", "KY_PDKS_DATA.FDB");
    }

    private static string? ResolveTnfPath(int year)
    {
        var root = Read("KY_PDKS_TNF_ROOT");
        if (string.IsNullOrWhiteSpace(root))
        {
            var companyRoot = Read("KY_PDKS_COMPANY_ROOT");
            if (string.IsNullOrWhiteSpace(companyRoot)) return null;
            root = Path.Combine(companyRoot, "TNF");
        }
        return Path.Combine(root, $"TR{year}.Tnf");
    }

    private static string Read(string name, string fallback = "")
    {
        var value = Environment.GetEnvironmentVariable(name);
        if (!string.IsNullOrWhiteSpace(value)) return value.Trim();
        try
        {
            value = Environment.GetEnvironmentVariable(name, EnvironmentVariableTarget.User);
        }
        catch { value = null; }
        return string.IsNullOrWhiteSpace(value) ? fallback : value.Trim();
    }

    private static string Hash(string value) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(value))).ToLowerInvariant();

    private static LocalEvidenceReport Failed(string code, string message) =>
        new(false, code, message, false, false, false, 0, 0, 0, 0, Hash(code + "|" + message));
}
