using System.Globalization;
using System.Security.Cryptography;
using System.Text;

namespace KyPdks.Shared;

public sealed record RawPunch(
    string CardNo,
    DateTime EventAt,
    string Source,
    string SourceRef,
    string RawLine,
    string Direction = "AUTO")
{
    public string WorkDate => EventAt.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
    public string EventTime => EventAt.ToString("HH:mm:ss", CultureInfo.InvariantCulture);
    public string ApiEventTime => EventAt.ToString("HH:mm", CultureInfo.InvariantCulture);

    public string Fingerprint
    {
        get
        {
            var normalized = $"{CardNo.Trim()}|{EventAt:yyyy-MM-ddTHH:mm:ss}";
            var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(normalized));
            return Convert.ToHexString(bytes).ToLowerInvariant();
        }
    }
}

public sealed record PunchRow(
    string Id,
    string CardNo,
    string WorkDate,
    string EventTime,
    string Direction,
    string Source,
    string SourceRef,
    string SyncState,
    string SyncError,
    string FullName = "",
    string PersonnelCode = "",
    string Department = "");

public sealed record CachedPerson(
    string Id,
    string PersonnelCode,
    string FullName,
    string Department,
    string Title,
    string SgkStatus,
    string Status,
    string CardNo,
    string StartDate,
    string ExitDate);

public sealed record AttendanceDayRow(
    string EmployeeId,
    string PersonnelCode,
    string FullName,
    string Department,
    string CardNo,
    string Date,
    string Status,
    string Entry,
    string Exit,
    int LateMinutes,
    int EarlyMinutes,
    int OvertimeMinutes,
    bool MissingPunch,
    int EventCount,
    string Note,
    string DataSource = "LOCAL");

public sealed record TimesheetRow(
    string EmployeeId,
    string PersonnelCode,
    string FullName,
    string Department,
    string CardNo,
    int WorkedDays,
    int AnnualLeaveDays,
    int LeaveDays,
    int MissingPunchDays,
    int NoPunchDays,
    int LateDays,
    int LateMinutes,
    int EarlyMinutes,
    int OvertimeMinutes);

public sealed record LocalSnapshot(
    int PendingCount,
    int SyncedCount,
    int ErrorCount,
    int TodayCount,
    bool AgentOnline,
    string AgentMode,
    string LastAgentMessage,
    PunchRow? LastPunch,
    IReadOnlyList<PunchRow> Rows);

public sealed record AuthFlow(
    string Stage,
    string Token,
    string UserName,
    string FullName,
    string Role,
    string ChallengeId,
    string ChallengeToken,
    string Provider,
    string ApprovalId,
    string ApprovalToken,
    string? Message);

public sealed record SyncResult(
    HashSet<string> AcceptedLocalIds,
    Dictionary<string, string> Rejected,
    int AcceptedCount,
    int RejectedCount);

public sealed record StoredSession(
    string Token,
    string UserName,
    string FullName,
    string Role,
    long ExpiresAtUnix,
    string DeviceLabel,
    DateTimeOffset SavedAt)
{
    public bool IsUsable => !string.IsNullOrWhiteSpace(Token) && ExpiresAtUnix > DateTimeOffset.UtcNow.ToUnixTimeSeconds() + 10;
}

public sealed class PdksConfig
{
    public string SourceMode { get; set; } = "FILE";
    public string TcpHost { get; set; } = "127.0.0.1";
    public int TcpPort { get; set; } = 4370;
    public string SerialPort { get; set; } = "COM1";
    public int SerialBaud { get; set; } = 9600;
    public int ScanIntervalMs { get; set; } = 1000;
    public int SyncIntervalSeconds { get; set; } = 30;
    public bool AutoSync { get; set; } = true;
    public bool FileImportEnabled { get; set; } = true;
    public string LineEncoding { get; set; } = "windows-1254";

    public string NormalizedMode => (SourceMode ?? "FILE").Trim().ToUpperInvariant() switch
    {
        "TCP_SERVER" => "TCP_SERVER",
        "TCP_CLIENT" => "TCP_CLIENT",
        "SERIAL" => "SERIAL",
        _ => "FILE",
    };

    public void Normalize()
    {
        SourceMode = NormalizedMode;
        TcpHost = string.IsNullOrWhiteSpace(TcpHost) ? "127.0.0.1" : TcpHost.Trim();
        TcpPort = Math.Clamp(TcpPort, 1, 65535);
        SerialPort = string.IsNullOrWhiteSpace(SerialPort) ? "COM1" : SerialPort.Trim().ToUpperInvariant();
        SerialBaud = SerialBaud is 1200 or 2400 or 4800 or 9600 or 19200 or 38400 or 57600 or 115200 ? SerialBaud : 9600;
        ScanIntervalMs = Math.Clamp(ScanIntervalMs, 250, 30000);
        SyncIntervalSeconds = Math.Clamp(SyncIntervalSeconds, 10, 3600);
        LineEncoding = string.IsNullOrWhiteSpace(LineEncoding) ? "windows-1254" : LineEncoding.Trim();
    }
}
