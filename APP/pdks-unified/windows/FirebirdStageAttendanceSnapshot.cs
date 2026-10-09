using System.Globalization;
using System.Text;
using System.Text.Json;
using FirebirdSql.Data.FirebirdClient;

namespace KyPdks.Unified;

/// <summary>
/// A read-only, local-only extraction of REAL KIMLIK/GIRCIK rows from a
/// gbak-restored stage FDB. The result MUST NEVER be uploaded to GitHub/Drive.
/// This is not proof of a live terminal or an approved payroll transaction.
/// </summary>
internal static class FirebirdStageAttendanceSnapshot
{
    private sealed record Person(string CardNo, string FullName, string? GroupCode,
        string? EmploymentStart, string? EmploymentEnd, string? LegacyStatus);
    private sealed record Punch(string EventId, string CardNo, string WorkDate,
        string Time, string Direction, string LegacyType, string Source);
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        WriteIndented = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
    };

    internal static async Task<string> RunAsync(CancellationToken token = default)
    {
        if (Environment.GetEnvironmentVariable("KY_PDKS_ISOLATED_COPY") != "1")
            throw new InvalidOperationException("STAGE_SNAPSHOT_OPT_IN_REQUIRED");
        var path = Environment.GetEnvironmentVariable("KY_PDKS_STAGE_FDB_PATH") ?? "";
        var full = Path.GetFullPath(path);
        if (!System.Text.RegularExpressions.Regex.IsMatch(full,
                @"^D:\\KYERP\\_TEMP\\PDKS_COPY_STAGE_[^\\]+\\KY_PDKS_STAGE\.FDB$",
                System.Text.RegularExpressions.RegexOptions.IgnoreCase))
            throw new InvalidOperationException("STAGE_SNAPSHOT_COPY_PATH_ONLY");
        if (!File.Exists(full) || (File.GetAttributes(full) & FileAttributes.ReparsePoint) != 0)
            throw new InvalidOperationException("STAGE_SNAPSHOT_COPY_REQUIRED");

        var startText = Environment.GetEnvironmentVariable("KY_PDKS_SNAPSHOT_START") ?? "";
        var endText = Environment.GetEnvironmentVariable("KY_PDKS_SNAPSHOT_END") ?? "";
        if (!DateTime.TryParseExact(startText, "yyyy-MM-dd", CultureInfo.InvariantCulture,
                DateTimeStyles.None, out var start) ||
            !DateTime.TryParseExact(endText, "yyyy-MM-dd", CultureInfo.InvariantCulture,
                DateTimeStyles.None, out var end) || end < start || (end - start).TotalDays > 30)
            throw new InvalidOperationException("STAGE_SNAPSHOT_DATE_RANGE_31_DAYS_MAX");
        var dest = Environment.GetEnvironmentVariable("KY_PDKS_SNAPSHOT_OUTPUT") ?? "";
        if (string.IsNullOrWhiteSpace(dest))
            throw new InvalidOperationException("STAGE_SNAPSHOT_OUTPUT_REQUIRED");
        dest = Path.GetFullPath(dest);
        var approvedDir = Path.GetFullPath(@"D:\KYERP\_TEMP\PDKS_PRIVATE_SNAPSHOTS");
        if (!string.Equals(Path.GetDirectoryName(dest), approvedDir,
                StringComparison.OrdinalIgnoreCase) ||
            !dest.EndsWith(".json", StringComparison.OrdinalIgnoreCase) ||
            File.Exists(dest))
            throw new InvalidOperationException("STAGE_SNAPSHOT_OUTPUT_LOCAL_ONLY_NO_OVERWRITE");

        var password = Environment.GetEnvironmentVariable("KY_PDKS_DB_PASSWORD") ??
            Environment.GetEnvironmentVariable("KY_PDKS_DB_PASSWORD",
                EnvironmentVariableTarget.User) ?? "";
        if (string.IsNullOrWhiteSpace(password))
            throw new InvalidOperationException("STAGE_SNAPSHOT_DB_PASSWORD_REQUIRED");
        var builder = new FbConnectionStringBuilder
        {
            Database = full,
            UserID = Environment.GetEnvironmentVariable("KY_PDKS_DB_USER") ?? "SYSDBA",
            Password = password,
            DataSource = Environment.GetEnvironmentVariable("KY_PDKS_DB_HOST") ?? "127.0.0.1",
            Port = int.TryParse(Environment.GetEnvironmentVariable("KY_PDKS_DB_PORT"),
                out var port) ? port : 3050,
            Charset = Environment.GetEnvironmentVariable("KY_PDKS_DB_CHARSET") ?? "NONE",
            Dialect = 3,
            Pooling = false,
        };
        await using var connection = new FbConnection(builder.ToString());
        await connection.OpenAsync(token);

        // Do not import salaries, SGK, national identity number, addresses,
        // biometrics or any other KIMLIK columns.
        var people = new List<Person>();
        const string personSql =
            "SELECT PKNO,AD,SOYAD,GRUP,IGTARIH,ICTARIH,DURUM FROM KIMLIK " +
            "WHERE PKNO IS NOT NULL ORDER BY PKNO";
        await using (var command = new FbCommand(personSql, connection))
        await using (var reader = await command.ExecuteReaderAsync(token))
        {
            while (await reader.ReadAsync(token))
            {
                var card = Card(reader["PKNO"]);
                if (card.Length == 0) continue;
                people.Add(new Person(card,
                    (Value(reader["AD"]) + " " + Value(reader["SOYAD"])).Trim(),
                    Value(reader["GRUP"]), DateText(reader["IGTARIH"]),
                    DateText(reader["ICTARIH"]), Value(reader["DURUM"])));
                if (people.Count > 15000)
                    throw new InvalidOperationException("STAGE_SNAPSHOT_PERSON_LIMIT");
            }
        }

        // Explicit GIRCIK entry/exit sides are independent evidence. Never
        // infer IN/OUT from TNF row order; never relabel legacy type E.
        const string punchSql =
            "SELECT SIRA,PKNO,GTARIH,GSAAT,GTUR,CTARIH,CSAAT,CTUR " +
            "FROM GIRCIK WHERE (GTARIH>=@Start AND GTARIH<@ExclusiveEnd) " +
            "OR (CTARIH>=@Start AND CTARIH<@ExclusiveEnd) ORDER BY SIRA";
        var punchRows = new List<Punch>();
        var invalid = 0;
        await using (var command = new FbCommand(punchSql, connection))
        {
            command.Parameters.AddWithValue("@Start", start);
            command.Parameters.AddWithValue("@ExclusiveEnd", end.AddDays(1));
            await using var reader = await command.ExecuteReaderAsync(token);
            while (await reader.ReadAsync(token))
            {
                var card = Card(reader["PKNO"]);
                var ordinal = Value(reader["SIRA"]);
                Append(reader, punchRows, ref invalid, card, ordinal, "GTARIH", "GSAAT", "GTUR", "IN", start, end);
                Append(reader, punchRows, ref invalid, card, ordinal, "CTARIH", "CSAAT", "CTUR", "OUT", start, end);
                if (punchRows.Count > 60000)
                    throw new InvalidOperationException("STAGE_SNAPSHOT_PUNCH_LIMIT");
            }
        }

        var payload = new
        {
            schemaVersion = 1,
            kind = "KY_PDKS_FIREBIRD_STAGE_ONLY",
            source = "GBAK_RESTORED_COPY_KIMLIK_GIRCIK",
            database = Path.GetFileName(full),
            snapshotFdbWriteTime = File.GetLastWriteTimeUtc(full).ToString("o", CultureInfo.InvariantCulture),
            generatedAt = DateTimeOffset.UtcNow.ToString("o", CultureInfo.InvariantCulture),
            start = start.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            end = end.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            // SQL column G is entry and C is exit; no terminal RAW proof.
            directionsFromGircikColumns = true,
            physicalTerminalVerified = false,
            annualTnfVerified = false,
            cloudVerified = false,
            liveRealTime = false,
            productionWritten = false,
            personnel = people,
            punches = punchRows,
            invalidSourcePunchCount = invalid,
        };
        Directory.CreateDirectory(approvedDir);
        var json = JsonSerializer.Serialize(payload, JsonOptions);
        var tmp = Path.Combine(approvedDir, "." + Guid.NewGuid().ToString("N") + ".part");
        await using (var file = new FileStream(tmp,FileMode.CreateNew,FileAccess.Write,
            FileShare.None,65536,FileOptions.WriteThrough))
        {
            var bytes = new UTF8Encoding(false).GetBytes(json);
            await file.WriteAsync(bytes,token);
            file.Flush(true);
        }
        File.Move(tmp,dest,false);
        return JsonSerializer.Serialize(new
        {
            code = "PASS_LOCAL_REAL_FDB_COPY_SNAPSHOT_READONLY",
            personCount = people.Count,
            punchCount = punchRows.Count,
            invalidSourcePunchCount = invalid,
            outputLocalOnly = dest,
            physicalTerminalVerified = false,
            liveDatabaseWritten = false,
            tnfWritten = false,
        },JsonOptions);
    }
    private static void Append(FbDataReader row,List<Punch> to,ref int invalid,
        string card,string ordinal,string dateColumn,string hourColumn,
        string typeColumn,string direction,DateTime start,DateTime end)
    {
        if (row[dateColumn] is DBNull || row[hourColumn] is DBNull) return;
        if (!DateTime.TryParse(Value(row[dateColumn]),out var day) ||
            day.Date < start || day.Date > end) return;
        var raw = Value(row[hourColumn]);
        if (card.Length == 0 ||
            (!TimeSpan.TryParse(raw,CultureInfo.InvariantCulture,out var time) &&
             !TimeSpan.TryParse(raw,new CultureInfo("tr-TR"),out time)) ||
            time < TimeSpan.Zero || time >= TimeSpan.FromDays(1))
        { invalid++;return; }
        to.Add(new Punch(ordinal + ":" + direction,card,
            day.ToString("yyyy-MM-dd",CultureInfo.InvariantCulture),
            $"{time.Hours:00}:{time.Minutes:00}:{time.Seconds:00}",
            direction,Value(row[typeColumn]),"GIRCIK_STAGE"));
    }
    private static string Card(object raw)
    {
        var card = Value(raw);
        return card.Length == 0 || card.Length > 5 ||
               card.Any(ch => ch is < '0' or > '9')
            ? "" : card.PadLeft(5,'0');
    }
    private static string Value(object? raw) =>
        raw is null or DBNull ? "" : Convert.ToString(raw,CultureInfo.InvariantCulture)?.Trim() ?? "";
    private static string? DateText(object? raw) =>
        raw is null or DBNull ? null :
        DateTime.TryParse(Value(raw),out var dt) ?
            dt.ToString("yyyy-MM-dd",CultureInfo.InvariantCulture) : null;
}
