using System.Globalization;
using System.Text;
using System.Text.Json;
using KYERP.PDKS.Core.Attendance;
using KYERP.PDKS.Core.Terminal;

namespace HKN.Personel.Native;

internal sealed record TerminalTransferErrorRow(
    DateTime TransferAt,
    string Card,
    DateTime OccurredAt,
    string Reason,
    string Line,
    string ErrorFile);

internal sealed record TerminalTransferJournalState(
    DateTime? LastTransferAt,
    int ReadCount,
    int DuplicateCount,
    int SkippedCount,
    string[] TransferFiles,
    string[] ErrorFiles,
    TerminalTransferErrorRow[] RecentErrors)
{
    public static TerminalTransferJournalState Empty => new(null, 0, 0, 0, [], [], []);
}

internal static class TerminalTransferJournalService
{
    static readonly object Gate = new();
    static readonly JsonSerializerOptions Json = new() { WriteIndented = true };
    static readonly CultureInfo Tr = CultureInfo.GetCultureInfo("tr-TR");
    static string StateFile => Path.Combine(CompanyDataPaths.Config, "terminal-transfer-journal.json");

    public static TerminalTransferJournalState ReadState()
    {
        lock (Gate)
        {
            CompanyDataPaths.Ensure();
            try
            {
                return File.Exists(StateFile)
                    ? JsonSerializer.Deserialize<TerminalTransferJournalState>(File.ReadAllText(StateFile), Json) ?? TerminalTransferJournalState.Empty
                    : TerminalTransferJournalState.Empty;
            }
            catch
            {
                return TerminalTransferJournalState.Empty;
            }
        }
    }

    public static TerminalTransferJournalState WriteBatch(
        IReadOnlyList<TerminalDevicePunch> punches,
        IReadOnlyList<AttendanceImportItemResult> importItems,
        DateTime? transferAt = null)
    {
        lock (Gate)
        {
            CompanyDataPaths.Ensure();
            var at = transferAt ?? DateTime.Now;
            var transferFiles = new List<string>();
            var errorFiles = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var errorRows = new List<TerminalTransferErrorRow>();

            foreach (var monthGroup in punches
                .OrderBy(x => x.OccurredAt)
                .GroupBy(x => new { x.OccurredAt.Year, x.OccurredAt.Month }))
            {
                var path = Path.Combine(CompanyDataPaths.Tnf, $"TR{monthGroup.Key.Month:00}{monthGroup.Key.Year:0000}.Tnf");
                AppendBlock(path, at, monthGroup.Select(ToTnfLine));
                transferFiles.Add(path);
            }

            var duplicateItems = importItems
                .Where(x => x.Status.Equals("Duplicate", StringComparison.OrdinalIgnoreCase))
                .OrderBy(x => x.Record.OccurredAt)
                .ToArray();

            foreach (var yearGroup in duplicateItems.GroupBy(x => x.Record.OccurredAt.Year))
            {
                var path = Path.Combine(CompanyDataPaths.Tnf, $"ER{yearGroup.Key:0000}.Err");
                AppendBlock(path, at, yearGroup.Select(x => ToTnfLine(x.Record)));
                errorFiles.Add(path);
                foreach (var item in yearGroup)
                    errorRows.Add(ToErrorRow(item, at, path));
            }

            foreach (var monthGroup in duplicateItems.GroupBy(x => new { x.Record.OccurredAt.Year, x.Record.OccurredAt.Month }))
            {
                var monthName = Tr.DateTimeFormat.GetMonthName(monthGroup.Key.Month);
                monthName = Tr.TextInfo.ToTitleCase(monthName);
                var path = Path.Combine(CompanyDataPaths.Tnf, $"ER{monthName}{monthGroup.Key.Year:0000}.Err");
                AppendBlock(path, at, monthGroup.Select(x => ToTnfLine(x.Record)));
                errorFiles.Add(path);
            }

            // Skipped rows are not duplicates; persist their reasons in a separate
            // diagnostic ERR file so the terminal screen can explain failed batches.
            var skippedItems = importItems
                .Where(x => x.Status.Equals("Skipped", StringComparison.OrdinalIgnoreCase))
                .OrderBy(x => x.Record.OccurredAt)
                .ToArray();
            foreach (var yearGroup in skippedItems.GroupBy(x => x.Record.OccurredAt.Year))
            {
                var path = Path.Combine(CompanyDataPaths.Tnf, $"ER{yearGroup.Key:0000}_Skipped.Err");
                AppendBlock(path, at, yearGroup.Select(x =>
                    $"{ToTnfLine(x.Record)} | SKIPPED | {x.Reason}"));
                errorFiles.Add(path);
                foreach (var item in yearGroup)
                    errorRows.Add(ToErrorRow(item, at, path));
            }

            var previous = ReadStateUnsafe();
            var recent = previous.RecentErrors
                .Concat(errorRows)
                .OrderByDescending(x => x.TransferAt)
                .ThenByDescending(x => x.OccurredAt)
                .Take(500)
                .ToArray();

            var state = new TerminalTransferJournalState(
                at,
                punches.Count,
                duplicateItems.Length,
                importItems.Count(x => x.Status.Equals("Skipped", StringComparison.OrdinalIgnoreCase)),
                transferFiles.Distinct(StringComparer.OrdinalIgnoreCase).ToArray(),
                errorFiles.ToArray(),
                recent);

            WriteState(state);
            return state;
        }
    }

    public static string DescribeLast()
    {
        var state = ReadState();
        if (!state.LastTransferAt.HasValue) return "Henüz PS-2000 aktarım günlüğü yok.";
        var transfer = state.TransferFiles.Length == 0
            ? "—"
            : string.Join(", ", state.TransferFiles.Select(Path.GetFileName));
        var errors = state.ErrorFiles.Length == 0
            ? "ERR yok"
            : string.Join(", ", state.ErrorFiles.Select(Path.GetFileName));
        return $"Son aktarım {state.LastTransferAt:dd.MM.yyyy HH:mm:ss} • Okunan {state.ReadCount} • Tekrar {state.DuplicateCount} • Atlanan {state.SkippedCount} • TNF {transfer} • {errors}";
    }

    public static void OpenFolder()
    {
        CompanyDataPaths.Ensure();
        System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(CompanyDataPaths.Tnf) { UseShellExecute = true });
    }

    internal static string Header(DateTime at)
    {
        var day = at.ToString("dd MMMM yyyy dddd HH:mm:ss", Tr);
        return $"*********************************  {day} ********************************";
    }

    internal static string ToTnfLine(TerminalDevicePunch punch) =>
        $"{NormalizeCard(punch.EmployeeCode)},{punch.OccurredAt:HH:mm},{punch.OccurredAt:ddMMyy},1,001";

    internal static string ToTnfLine(ProfiledTerminalRecord record) =>
        $"{NormalizeCard(record.EmployeeCode)},{record.OccurredAt:HH:mm},{record.OccurredAt:ddMMyy},1,001";

    static void AppendBlock(string path, DateTime at, IEnumerable<string> lines)
    {
        var payload = lines.ToArray();
        if (payload.Length == 0) return;
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        var text = new StringBuilder();
        if (File.Exists(path) && new FileInfo(path).Length > 0)
            text.AppendLine();
        text.AppendLine(Header(at));
        foreach (var line in payload) text.AppendLine(line);
        text.AppendLine();
        File.AppendAllText(path, text.ToString(), new UTF8Encoding(false));
    }

    static TerminalTransferErrorRow ToErrorRow(AttendanceImportItemResult item, DateTime transferAt, string path) =>
        new(
            transferAt,
            NormalizeCard(item.Record.EmployeeCode),
            item.Record.OccurredAt,
            string.IsNullOrWhiteSpace(item.Reason) ? "Kart Tekrarı" : item.Reason,
            ToTnfLine(item.Record),
            path);

    static string NormalizeCard(string value)
    {
        var text = (value ?? string.Empty).Trim();
        return int.TryParse(text, NumberStyles.Integer, CultureInfo.InvariantCulture, out var numeric)
            ? numeric.ToString("00000", CultureInfo.InvariantCulture)
            : text.PadLeft(5, '0');
    }

    static TerminalTransferJournalState ReadStateUnsafe()
    {
        try
        {
            return File.Exists(StateFile)
                ? JsonSerializer.Deserialize<TerminalTransferJournalState>(File.ReadAllText(StateFile), Json) ?? TerminalTransferJournalState.Empty
                : TerminalTransferJournalState.Empty;
        }
        catch
        {
            return TerminalTransferJournalState.Empty;
        }
    }

    static void WriteState(TerminalTransferJournalState value)
    {
        var tmp = StateFile + ".tmp";
        File.WriteAllText(tmp, JsonSerializer.Serialize(value, Json), Encoding.UTF8);
        File.Move(tmp, StateFile, true);
    }
}
