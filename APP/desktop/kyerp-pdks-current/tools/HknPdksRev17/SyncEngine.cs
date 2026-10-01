using System.Data;
using System.Diagnostics;
using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using FirebirdSql.Data.FirebirdClient;
using KYERP.PDKS.Core;

namespace QuickDataTool;

internal sealed class TnfFormat
{
    public int CardStart { get; set; } = 1;
    public int CardLen { get; set; } = 5;
    public int YearStart { get; set; } = 17;
    public int YearLen { get; set; } = 2;
    public int MonthStart { get; set; } = 15;
    public int MonthLen { get; set; } = 2;
    public int DayStart { get; set; } = 13;
    public int DayLen { get; set; } = 2;
    public int TypeStart { get; set; } = 20;
    public int TypeLen { get; set; } = 1;
    public int HourStart { get; set; } = 7;
    public int HourLen { get; set; } = 2;
    public int MinuteStart { get; set; } = 10;
    public int MinuteLen { get; set; } = 2;
    public int CodeStart { get; set; } = 22;
    public int CodeLen { get; set; } = 3;
    public string TypeValue { get; set; } = "1";
    public string CodeValue { get; set; } = "001";
    public string Separators { get; set; } = "6=,;9=:;12=,;19=,;21=,";

    public string Build(string card, DateTime date, string time)
    {
        var fields = new (int Start, int Length, string Value)[]
        {
            (CardStart, CardLen, card), (YearStart, YearLen, date.ToString("yy")),
            (MonthStart, MonthLen, date.ToString("MM")), (DayStart, DayLen, date.ToString("dd")),
            (HourStart, HourLen, time[..2]), (MinuteStart, MinuteLen, time[3..]),
            (TypeStart, TypeLen, TypeValue), (CodeStart, CodeLen, CodeValue)
        };
        var separators = Separators.Split(';', StringSplitOptions.RemoveEmptyEntries)
            .Select(value => value.Split('=')).ToDictionary(value => int.Parse(value[0]), value => value[1][0]);
        var buffer = Enumerable.Repeat(' ', Math.Max(fields.Max(field => field.Start + field.Length - 1),
            separators.Keys.DefaultIfEmpty(1).Max())).ToArray();
        foreach (var field in fields)
        {
            if (field.Start < 1 || field.Length < 1 || field.Value.Length > field.Length)
                throw new FormatException("TNF alanı taşacak; kart/saat kısaltılmaz.");
            field.Value.PadLeft(field.Length, '0').CopyTo(0, buffer, field.Start - 1, field.Length);
        }
        foreach (var separator in separators) buffer[separator.Key - 1] = separator.Value;
        return new string(buffer);
    }

    public bool TryParse(string raw, int index, out TnfMovement movement)
    {
        movement = null!;
        try
        {
            raw = raw.TrimStart('\uFEFF');
            foreach (var separator in Separators.Split(';', StringSplitOptions.RemoveEmptyEntries))
            {
                var parts = separator.Split('=');
                var position = int.Parse(parts[0]) - 1;
                if (position < 0 || position >= raw.Length || parts[1].Length != 1 || raw[position] != parts[1][0]) return false;
            }
            string Slice(int start, int length) => raw.Substring(start - 1, length).Trim();
            var card = Slice(CardStart, CardLen);
            var date = DateTime.ParseExact(Slice(DayStart, DayLen) + Slice(MonthStart, MonthLen) + Slice(YearStart, YearLen),
                "ddMMyy", CultureInfo.InvariantCulture);
            var hour = int.Parse(Slice(HourStart, HourLen));
            var minute = int.Parse(Slice(MinuteStart, MinuteLen));
            if (card.Length == 0 || hour is < 0 or > 23 || minute is < 0 or > 59) return false;
            movement = new(index, raw, card, date.Date, $"{hour:00}:{minute:00}",
                Slice(TypeStart, TypeLen) == TypeValue && Slice(CodeStart, CodeLen) == CodeValue);
            return true;
        }
        catch (Exception exception) when (exception is ArgumentException or FormatException or OverflowException)
        {
            return false;
        }
    }
}

internal sealed record DbMovement(int Id, string Card, DateTime Date, string Side, string Time, string Tur);
internal sealed record TnfMovement(int Index, string Raw, string Card, DateTime Date, string Time, bool Standard = true);
internal sealed record EmploymentRule(string Card, string Name, DateTime? Hire, DateTime? Exit, bool? Active, bool Ambiguous = false, string? StatusCode = null, string RawStatus = "")
{
    public string EffectiveStatus(DateTime reference)
    {
        if (Ambiguous || Hire is null || Exit < Hire && Active == false) return "İNCELE";
        if (reference < Hire && (Exit is null || Exit >= Hire)) return "HENÜZ İŞE BAŞLAMAMIŞ";
        if (Exit >= Hire && reference > Exit) return "PASİF / ÇIKIŞ YAPMIŞ";
        if (Exit < Hire && reference > Exit && reference < Hire) return "İŞE GİRİŞLER ARASI";
        return "AKTİF";
    }

    public string StatusNote(DateTime reference)
    {
        var effective = EffectiveStatus(reference);
        return Active == true && effective.StartsWith("PASİF") || Active == false && effective == "AKTİF"
            ? "DURUM/TARİH ÇELİŞKİSİ: DB durum alanı tarih ile çelişkili" : "";
    }

    public (string? Reason, bool Certain) Evaluate(DateTime day)
    {
        if (Ambiguous) return ("AYNI KARTTA ÇOKLU PERSONEL / DÖNEM BELİRSİZ", false);
        if (Hire is null) return ("İŞE GİRİŞ TARİHİ EKSİK", false);
        if (Exit < Hire)
        {
            if (Active == false) return ("PERSONEL TARİHLERİ ÇELİŞKİLİ", false);
            if (day > Exit && day < Hire) return ("ESKİ ÇIKIŞ / SON GİRİŞ ARASI", true);
            return (null, false);
        }
        if (day < Hire) return ("İŞE GİRİŞ ÖNCESİ", true);
        if (Exit is not null && day > Exit) return ("ÇIKIŞ SONRASI; DAHA YENİ İŞE GİRİŞ YOK", true);
        return (null, false);
    }
}

internal sealed record AuditRequest(string Path, DateTime Start, DateTime End, string Card, TnfFormat Format, bool Exact = false);
internal sealed record AuditSnapshot(AuditRequest Request, DataTable Table, List<DbMovement> Db,
    Dictionary<string, EmploymentRule> People, string[] Lines, Encoding Encoding, string FileHash,
    string DbHash, long DbMilliseconds, long TnfMilliseconds, long CompareMilliseconds);

internal static partial class SyncEngine
{
    internal static bool? ActiveStatus(string value)
    {
        var status = value.Replace('ı', 'I').ToUpperInvariant().Replace('İ', 'I').Replace('Ş', 'S')
            .Replace('Ç', 'C').Replace('Ğ', 'G').Replace('Ü', 'U').Replace('Ö', 'O');
        if (status.Contains("PASIF") || status.Contains("AYRIL") || status.Contains("CIKTI") || status.Contains("PASSIVE")) return false;
        if (status.Contains("AKTIF") || status.Contains("CALIS") || status.Contains("ACTIVE")) return true;
        return null;
    }

    public static string LogPath => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "HKN-PDKS", "PERF.log");

    public static void Log(string message)
    {
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(LogPath)!);
            File.AppendAllText(LogPath, $"{DateTime.Now:O} {message}{Environment.NewLine}");
        }
        catch (IOException) { }
        catch (UnauthorizedAccessException) { }
    }

    public static async Task<AuditSnapshot> ReadAsync(FirebirdDatabase database, AuditRequest request,
        CancellationToken cancellation, IProgress<string>? progress = null, bool listOnly = false)
    {
        var timer = Stopwatch.StartNew();
        progress?.Report("TNF bir kez okunuyor...");
        Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);
        var bytes = await File.ReadAllBytesAsync(request.Path, cancellation).ConfigureAwait(false);
        var encoding = bytes.AsSpan().StartsWith(new byte[] { 0xEF, 0xBB, 0xBF }) ? new UTF8Encoding(true) : Encoding.GetEncoding(1254);
        var lines = new List<string>();
        using (var reader = new StringReader(encoding.GetString(bytes).TrimStart('\uFEFF')))
            while (reader.ReadLine() is { } line) { cancellation.ThrowIfCancellationRequested(); lines.Add(line); }
        var tnf = new List<TnfMovement>();
        var invalid = new List<string>();
        for (var index = 0; index < lines.Count; index++)
        {
            cancellation.ThrowIfCancellationRequested();
            if (string.IsNullOrWhiteSpace(lines[index])) continue;
            if (!request.Format.TryParse(lines[index], index, out var movement)) invalid.Add(lines[index]);
            else if (movement.Date >= request.Start && movement.Date < request.End &&
                (request.Card.Length == 0 || request.Card == movement.Card)) tnf.Add(movement);
        }
        var tnfMilliseconds = timer.ElapsedMilliseconds;
        timer.Restart();
        progress?.Report("DB hareketleri ve ilgili kartların personel bilgileri okunuyor...");
        var (movements, people) = await ReadDbAsync(database, request, tnf.Select(movement => movement.Card).Distinct().ToArray(), cancellation).ConfigureAwait(false);
        var dbMilliseconds = timer.ElapsedMilliseconds;
        timer.Restart();
        progress?.Report("Kart + tarih karşılaştırılıyor...");
        var table = listOnly ? ListTerminal(tnf, people, cancellation) : request.Exact ? CompareExact(movements, tnf, people, cancellation) : Compare(movements, tnf, people, request.Format, cancellation);
        foreach (var raw in invalid) table.Rows.Add("", "", "", "", "", "", "", raw, "BOZUK TNF / İNCELE", "İNCELE", -1, -1, false);
        return new(request, table, movements, people, lines.ToArray(), encoding, Convert.ToHexString(SHA256.HashData(bytes)),
            DbFingerprint(movements, people), dbMilliseconds, tnfMilliseconds, timer.ElapsedMilliseconds);
    }

    static async Task<(List<DbMovement>, Dictionary<string, EmploymentRule>)> ReadDbAsync(
        FirebirdDatabase database, AuditRequest request, string[] terminalCards, CancellationToken cancellation)
    {
        cancellation.ThrowIfCancellationRequested();
        using var connection = database.OpenConnection();
        using var transaction = connection.BeginTransaction(new FbTransactionOptions
        {
            TransactionBehavior = FbTransactionBehavior.Read | FbTransactionBehavior.Concurrency | FbTransactionBehavior.Wait
        });
        var movements = new List<DbMovement>();
        var people = new Dictionary<string, EmploymentRule>(StringComparer.Ordinal);
        var range = "((GTARIH>=@A and GTARIH<@B) or (CTARIH>=@A and CTARIH<@B))" + (request.Card.Length == 0 ? "" : " and PKNO=@P");
        var relevantCards = terminalCards.Concat(request.Card.Length == 0 ? [] : new[] { request.Card }).Distinct().ToArray();
        var terminalUnion = string.Concat(relevantCards.Select((card, index) => $" union select cast(@T{index} as varchar(20)) from rdb$database"));
        var sql = "with selected_moves as (select SIRA,PKNO,GTARIH,GSAAT,GTUR,CTARIH,CSAAT,CTUR from GIRCIK where " + range + "), " +
            "cards as (select distinct PKNO from selected_moves" + terminalUnion + ") " +
            "select 'M' RECORDTYPE,g.*,cast(null as varchar(100)) AD,cast(null as varchar(100)) SOYAD," +
            "cast(null as date) IGTARIH,cast(null as date) ICTARIH,cast(null as varchar(20)) DURUM,cast(null as varchar(100)) DURUMAD " +
            "from selected_moves g union all " +
            "select 'P',null,k.PKNO,null,null,null,null,null,null,k.AD,k.SOYAD,k.IGTARIH,k.ICTARIH,k.DURUM,d.AD " +
            "from cards c join KIMLIK k on k.PKNO=c.PKNO left join DURUM d on d.KOD=k.DURUM";
        using var command = new FbCommand(sql, connection, transaction) { CommandTimeout = 60 };
        command.Parameters.Add(new FbParameter("@A", request.Start));
        command.Parameters.Add(new FbParameter("@B", request.End));
        if (request.Card.Length > 0) command.Parameters.Add(new FbParameter("@P", request.Card));
        for (var index = 0; index < relevantCards.Length; index++) command.Parameters.Add(new FbParameter($"@T{index}", relevantCards[index]));
        using var reader = await command.ExecuteReaderAsync(cancellation).ConfigureAwait(false);
        while (await reader.ReadAsync(cancellation).ConfigureAwait(false))
        {
            cancellation.ThrowIfCancellationRequested();
            var card = Convert.ToString(reader["PKNO"])!.Trim();
            DateTime? Date(string column) => reader[column] == DBNull.Value ? null : Convert.ToDateTime(reader[column]).Date;
            if (Convert.ToString(reader["RECORDTYPE"]) == "P")
            {
                var status = Convert.ToString(reader["DURUMAD"]) ?? "";
                var rule = new EmploymentRule(card, $"{reader["AD"]} {reader["SOYAD"]}".Trim(), Date("IGTARIH"), Date("ICTARIH"),
                    ActiveStatus(status), StatusCode: reader["DURUM"] == DBNull.Value ? null : Convert.ToString(reader["DURUM"]), RawStatus: status);
                people[card] = people.TryGetValue(card, out var previous) ? previous with { Ambiguous = true } : rule;
                continue;
            }
            void Add(string prefix, string side)
            {
                var date = Date(prefix + "TARIH");
                if (date is null || date < request.Start || date >= request.End) return;
                var time = Convert.ToString(reader[prefix + "SAAT"])?.Trim() ?? "";
                movements.Add(new(Convert.ToInt32(reader["SIRA"]), card, date.Value, side, time, Convert.ToString(reader[prefix + "TUR"])?.Trim() ?? ""));
            }
            Add("G", "Giriş");
            Add("C", "Çıkış");
        }
        reader.Close();
        transaction.Rollback();
        return (movements, people);
    }

    public static string DbFingerprint(IEnumerable<DbMovement> movements, Dictionary<string, EmploymentRule> people)
    {
        var text = JsonSerializer.Serialize(movements.OrderBy(movement => movement.Id).ThenBy(movement => movement.Side)) +
            JsonSerializer.Serialize(people.OrderBy(person => person.Key));
        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(text)));
    }
}
