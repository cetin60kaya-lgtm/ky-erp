using System.Data;
using System.Globalization;
using System.Text;
using FirebirdSql.Data.FirebirdClient;
using KYERP.PDKS.Core;

namespace QuickDataTool;

internal sealed record WorkTimePolicy(int Entry, int EntryEarly, int EntryLate, int Exit, int ExitEarly,
    int ExitLate, int DayRollover, int DayEnd, int NormalStart, int NormalEnd, int DailyWork, bool FromDatabase)
{
    internal static WorkTimePolicy Default { get; } = new(510, 495, 525, 1140, 1110, 1170, 420, 420, 510, 1140, 450, false);
    internal static string Format(int minutes) => $"{minutes / 60:00}:{minutes % 60:00}";
    internal string Source => FromDatabase ? "Hedef DB" : "Sabit Varsayılan";
    internal string Information => $"Hedef çalışma ayarı: {Format(Entry)} / {Format(EntryEarly)}–{Format(EntryLate)} | {Format(Exit)} / {Format(ExitEarly)}–{Format(ExitLate)} | Kaynak: {Source}";
    internal string ClassifyEntry(int minutes) => minutes < EntryEarly ? "ERKEN GELİŞ" : minutes > EntryLate ? "GEÇ GİRİŞ" : "NORMAL";
    internal string ClassifyExit(int minutes) => minutes < ExitEarly ? "ERKEN ÇIKIŞ" : minutes > ExitLate ? "GEÇ ÇIKIŞ / mesai adayı" : "NORMAL";
    internal static bool IsError(string kind) => kind is not ("NORMAL" or "ERKEN GELİŞ" or "GEÇ ÇIKIŞ / mesai adayı" or "E KAYIT");
    internal bool Valid => EntryEarly <= Entry && Entry <= EntryLate && ExitEarly <= Exit && Exit <= ExitLate &&
        EntryLate < ExitEarly && NormalStart < NormalEnd && DailyWork > 0;

    internal static WorkTimePolicy Parse(DataTable table)
    {
        if (!table.Columns.Contains("AD")) return Default;
        var rows = table.AsEnumerable().Where(row => Normalize(Convert.ToString(row["AD"]) ?? "") == "HAFTAICI").ToArray();
        if (rows.Length != 1) return Default;
        var row = rows[0];
        int Minute(string field, bool extended = false)
        {
            if (!table.Columns.Contains(field) || row[field] == DBNull.Value) throw new FormatException(field);
            var text = Convert.ToString(row[field], CultureInfo.InvariantCulture)?.Trim() ?? "";
            var minute = int.TryParse(text, out var number) ? number : MonthlyDbAudit.Clock(text, out var parsed) ? parsed : -1;
            if (minute < 0 || minute >= (extended ? 2880 : 1440)) throw new FormatException(field);
            return minute % 1440;
        }
        try
        {
            var policy = new WorkTimePolicy(Minute("IGIRISS"), Minute("EGTOL"), Minute("GGTOL"), Minute("DCIKISS"),
                Minute("ECTOL"), Minute("GCTOL"), Minute("GDSAAT"), Minute("GUNBIT", true), Minute("BASLAMAS1"),
                Minute("BITISS1"), Minute("MAKSURE1"), true);
            return policy.Valid ? policy : Default;
        }
        catch (FormatException) { return Default; }
    }

    static string Normalize(string value) => string.Concat(value.ToUpperInvariant().Replace('İ', 'I').Replace('ı', 'I')
        .Normalize(NormalizationForm.FormD).Where(character => CharUnicodeInfo.GetUnicodeCategory(character) != UnicodeCategory.NonSpacingMark && char.IsLetterOrDigit(character)));

    internal static WorkTimePolicy Read(FbConnection connection, FbTransaction transaction, CancellationToken token)
    {
        token.ThrowIfCancellationRequested();
        try
        {
            using var command = new FbCommand("select * from PUANBILGI", connection, transaction) { CommandTimeout = 15 };
            using var registration = token.Register(command.Cancel);
            using var adapter = new FbDataAdapter(command);
            var table = new DataTable();
            adapter.Fill(table);
            token.ThrowIfCancellationRequested();
            return Parse(table);
        }
        catch (FbException) { token.ThrowIfCancellationRequested(); return Default; }
    }

    internal static WorkTimePolicy Read(FirebirdDatabase database, CancellationToken token)
    {
        using var connection = database.OpenConnection();
        using var transaction = connection.BeginTransaction(new FbTransactionOptions { TransactionBehavior = FbTransactionBehavior.Read | FbTransactionBehavior.Concurrency | FbTransactionBehavior.NoWait });
        var policy = Read(connection, transaction, token);
        transaction.Rollback();
        return policy;
    }
}
