using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;

namespace KyPdks.Shared;

public sealed record ErpPeriodCloseResult(int BlockingCount, int OkCount, int TotalChecks, bool IsLocked);
public sealed record ErpPayrollRow(string EmployeeId, string PersonnelCode, string FullName, decimal Salary, decimal Overtime, decimal Advance, decimal Deduction, decimal Bank, decimal Cash, decimal Net);
public sealed record ErpPdksProfile(string Scope, bool Audit, string UserName, string Role);

public sealed class ErpApiException(string message, HttpStatusCode statusCode, string code = "") : Exception(message)
{
    public HttpStatusCode StatusCode { get; } = statusCode;
    public string Code { get; } = code;
}

public sealed class ErpApiClient : IDisposable
{
    private readonly HttpClient _http;

    public ErpApiClient(string baseAddress = "https://api.kyerp.net")
    {
        _http = new HttpClient { BaseAddress = new Uri(baseAddress.TrimEnd('/')), Timeout = TimeSpan.FromSeconds(30) };
        _http.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        _http.DefaultRequestHeaders.UserAgent.ParseAdd("KY-PDKS-Windows/1.4.0");
    }

    public async Task<AuthFlow> LoginAsync(string identity, string password, string deviceLabel, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(identity) || string.IsNullOrEmpty(password))
            throw new InvalidOperationException("Kullanıcı adı/e-posta ve parola zorunludur.");
        using var document = await SendAsync(HttpMethod.Post, "/api/auth/login", new { username = identity.Trim(), password, deviceLabel }, "", ct);
        return ParseAuth(document.RootElement);
    }

    public async Task<AuthFlow> VerifyMfaAsync(AuthFlow flow, string code, string provider = "", CancellationToken ct = default)
    {
        var digits = new string((code ?? "").Where(char.IsDigit).ToArray());
        if (digits.Length != 6) throw new InvalidOperationException("Authenticator uygulamasındaki 6 haneli kodu girin.");
        using var document = await SendAsync(HttpMethod.Post, "/api/auth/mfa/verify", new
        {
            challengeId = flow.ChallengeId,
            challengeToken = flow.ChallengeToken,
            code = digits,
            provider = string.IsNullOrWhiteSpace(provider) ? flow.Provider : provider,
            resetProvider = "",
        }, "", ct);
        return ParseAuth(document.RootElement);
    }

    public async Task<AuthFlow> CheckApprovalAsync(AuthFlow flow, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(flow.ApprovalId) || string.IsNullOrWhiteSpace(flow.ApprovalToken))
            throw new InvalidOperationException("Onay oturumu bulunamadı.");
        using var document = await SendAsync(HttpMethod.Post, $"/api/auth/approval/{Uri.EscapeDataString(flow.ApprovalId)}/status", new { approvalToken = flow.ApprovalToken }, "", ct);
        return ParseAuth(document.RootElement);
    }

    public async Task<AuthFlow> GetMeAsync(string token, CancellationToken ct = default)
    {
        using var document = await SendAsync(HttpMethod.Get, "/api/auth/me", null, token, ct);
        var root = Unwrap(document.RootElement);
        var user = root.TryGetProperty("user", out var userNode) ? userNode : default;
        return new AuthFlow(
            "AUTHENTICATED", token,
            user.ValueKind == JsonValueKind.Object ? Text(user, "username") : "",
            user.ValueKind == JsonValueKind.Object ? Text(user, "fullName", "full_name") : "",
            user.ValueKind == JsonValueKind.Object ? Text(user, "role") : "",
            "", "", "", "", "", "");
    }

    public async Task<ErpPdksProfile> GetPdksProfileAsync(string token, CancellationToken ct = default)
    {
        using var document = await SendAsync(HttpMethod.Get, "/api/ik/personnel-control/profile", null, token, ct);
        var data = Unwrap(document.RootElement);
        return new ErpPdksProfile(Text(data, "scope"), Bool(data, "audit"), Text(data, "username"), Text(data, "role"));
    }

    public async Task LogoutAsync(string token, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(token)) return;
        using var responseDocument = await SendAsync(HttpMethod.Post, "/api/auth/logout", new { }, token, ct);
    }

    public async Task<IReadOnlyList<CachedPerson>> GetPdksPeopleAsync(string token, CancellationToken ct = default)
    {
        using var document = await SendAsync(HttpMethod.Get, "/api/ik/personnel-control/people", null, token, ct);
        var data = Unwrap(document.RootElement);
        if (data.ValueKind != JsonValueKind.Array) return Array.Empty<CachedPerson>();
        var list = new List<CachedPerson>();
        foreach (var row in data.EnumerateArray())
        {
            var sgk = Text(row, "sgkStatus", "sgk_status");
            var status = Text(row, "status", "personnelStatus", "activePassive", "active_passive");
            var card = PunchParser.NormalizeCard(Text(row, "cardNo", "card_no"));
            var passive = status.Contains("PAS", StringComparison.OrdinalIgnoreCase)
                || status.Contains("CIK", StringComparison.OrdinalIgnoreCase)
                || status.Contains("AYRIL", StringComparison.OrdinalIgnoreCase);
            if (passive || string.IsNullOrWhiteSpace(card)) continue;
            list.Add(new CachedPerson(
                Text(row, "id"), Text(row, "personnelCode", "code"), Text(row, "fullName", "full_name"),
                Text(row, "department"), Text(row, "title"), sgk, status, card,
                Text(row, "startDate", "hire_date"), Text(row, "exitDate", "exit_date")));
        }
        return list;
    }

    public async Task<IReadOnlyList<AttendanceDayRow>> GetAttendanceMonthAsync(string token, CachedPerson person, int year, int month, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(person.Id)) return Array.Empty<AttendanceDayRow>();
        var path = $"/api/ik/personnel-control/people/{Uri.EscapeDataString(person.Id)}/attendance?year={year}&month={month}";
        using var document = await SendAsync(HttpMethod.Get, path, null, token, ct);
        var data = Unwrap(document.RootElement);
        if (data.ValueKind != JsonValueKind.Object || !data.TryGetProperty("days", out var days) || days.ValueKind != JsonValueKind.Array)
            return Array.Empty<AttendanceDayRow>();

        var list = new List<AttendanceDayRow>();
        foreach (var row in days.EnumerateArray())
        {
            list.Add(new AttendanceDayRow(
                person.Id, person.PersonnelCode, person.FullName, person.Department, person.CardNo,
                Text(row, "date"), Text(row, "status"), Text(row, "entry"), Text(row, "exit"),
                Number(row, "lateMinutes", 0), Number(row, "earlyMinutes", 0), Number(row, "overtimeMinutes", 0),
                Bool(row, "missingPunch"), Number(row, "eventCount", 0), Text(row, "note"), "ERP"));
        }
        return list;
    }

    public async Task AddTimeEventAsync(string token, CachedPerson person, string workDate, string eventTime, string direction, string note, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(person.Id)) throw new InvalidOperationException("Personel seçin.");
        if (!DateOnly.TryParse(workDate, out var parsedDate)) throw new InvalidOperationException("Tarih geçersiz.");
        if (eventTime.Length < 5 || !TimeOnly.TryParse(eventTime[..5], out var parsedTime)) throw new InvalidOperationException("Saat geçersiz. Örnek: 08:30");
        using var responseDocument = await SendAsync(HttpMethod.Post,
            $"/api/ik/personnel-control/people/{Uri.EscapeDataString(person.Id)}/time-event",
            new
            {
                cardNo = person.CardNo,
                workDate = parsedDate.ToString("yyyy-MM-dd"),
                eventTime = parsedTime.ToString("HH:mm"),
                direction = string.IsNullOrWhiteSpace(direction) ? "AUTO" : direction.Trim().ToUpperInvariant(),
                source = "KY_PDKS_WINDOWS",
                note = string.IsNullOrWhiteSpace(note) ? "KY PDKS manuel kart kaydı" : note.Trim(),
            }, token, ct);
    }

    public async Task SaveDayOverrideAsync(string token, CachedPerson person, string workDate, string status, string entry, string exit,
        int lateMinutes, int earlyMinutes, int overtimeMinutes, bool missingPunch, string note, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(person.Id)) throw new InvalidOperationException("Personel seçin.");
        using var responseDocument = await SendAsync(HttpMethod.Post,
            $"/api/ik/personnel-control/people/{Uri.EscapeDataString(person.Id)}/day-override",
            new
            {
                workDate,
                status = string.IsNullOrWhiteSpace(status) ? "AUTO" : status.Trim().ToUpperInvariant(),
                entry = string.IsNullOrWhiteSpace(entry) ? null : entry.Trim()[..Math.Min(5, entry.Trim().Length)],
                exit = string.IsNullOrWhiteSpace(exit) ? null : exit.Trim()[..Math.Min(5, exit.Trim().Length)],
                lateMinutes = Math.Max(0, lateMinutes),
                earlyMinutes = Math.Max(0, earlyMinutes),
                overtimeMinutes = Math.Max(0, overtimeMinutes),
                missingPunch,
                note = note ?? "",
            }, token, ct);
    }

    public async Task SaveLeaveAsync(string token, CachedPerson person, string startDate, string endDate, string type, string note, string userName, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(person.Id)) throw new InvalidOperationException("Personel seçin.");
        if (!DateOnly.TryParse(startDate, out var start) || !DateOnly.TryParse(endDate, out var end) || end < start)
            throw new InvalidOperationException("İzin tarihleri geçersiz.");

        var annual = string.Equals(type, "YILLIK_IZIN", StringComparison.OrdinalIgnoreCase);
        object body = annual
            ? new
            {
                employeeId = person.Id,
                recordType = "Yıllık izin",
                startDate = start.ToString("yyyy-MM-dd"),
                returnDate = end.AddDays(1).ToString("yyyy-MM-dd"),
                status = "APPROVED",
                effectType = "Ücretli",
                note = note ?? "",
                userName = userName ?? "KY PDKS",
                allowDepartmentConflict = false,
            }
            : new
            {
                employeeId = person.Id,
                recordType = "İzin",
                startDate = start.ToString("yyyy-MM-dd"),
                endDate = end.ToString("yyyy-MM-dd"),
                effectType = "Kayıt",
                note = note ?? "",
                userName = userName ?? "KY PDKS",
            };

        using var responseDocument = await SendAsync(HttpMethod.Post, "/api/ik/personnel-control/operations/leave", body, token, ct);
    }

    public async Task SaveAdvanceAsync(string token, CachedPerson person, string date, decimal amount, string note, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(person.Id)) throw new InvalidOperationException("Personel seçin.");
        if (amount <= 0) throw new InvalidOperationException("Avans tutarı sıfırdan büyük olmalıdır.");
        using var responseDocument = await SendAsync(HttpMethod.Post, "/api/ik/personnel-control/operations/advance", new
        {
            employeeId = person.Id,
            date,
            adjustmentType = "Avans",
            amount,
            hourOrDay = 0,
            paymentMethod = "Elden",
            payrollEffect = "BORDRO_AZALTIR",
            note = note ?? "",
            status = "APPROVED",
        }, token, ct);
    }

    public async Task<ErpPeriodCloseResult> ClosePeriodAsync(string token, int year, int month, string reason, string userName, CancellationToken ct = default)
    {
        using var document = await SendAsync(HttpMethod.Post, "/api/ik/personnel-control/operations/period-close", new
        {
            year,
            month,
            @lock = true,
            reason = string.IsNullOrWhiteSpace(reason) ? "KY PDKS kontrollü kapanış" : reason,
            userName = userName ?? "KY PDKS",
        }, token, ct);
        var data = Unwrap(document.RootElement);
        return new ErpPeriodCloseResult(Number(data, "blockingCount", 0), Number(data, "okCount", 0), Number(data, "totalChecks", 0), Bool(data, "isLocked"));
    }

    public async Task<IReadOnlyList<ErpPayrollRow>> GetPayrollAsync(string token, int year, int month, CancellationToken ct = default)
    {
        using var document = await SendAsync(HttpMethod.Get, $"/api/ik/personnel-control/operations/payroll?year={year}&month={month}", null, token, ct);
        var data = Unwrap(document.RootElement);
        var lines = data.ValueKind == JsonValueKind.Object && data.TryGetProperty("lines", out var node) && node.ValueKind == JsonValueKind.Array
            ? node : default;
        if (lines.ValueKind != JsonValueKind.Array) return Array.Empty<ErpPayrollRow>();
        var result = new List<ErpPayrollRow>();
        foreach (var row in lines.EnumerateArray())
        {
            var employee = row.TryGetProperty("employee", out var employeeNode) && employeeNode.ValueKind == JsonValueKind.Object ? employeeNode : default;
            var final = row.TryGetProperty("final", out var finalNode) && finalNode.ValueKind == JsonValueKind.Object ? finalNode : default;
            var system = row.TryGetProperty("system", out var systemNode) && systemNode.ValueKind == JsonValueKind.Object ? systemNode : default;
            result.Add(new ErpPayrollRow(
                Text(row, "employeeId"),
                employee.ValueKind == JsonValueKind.Object ? Text(employee, "code", "personnelCode") : Text(row, "personnelCode"),
                employee.ValueKind == JsonValueKind.Object ? Text(employee, "fullName") : Text(row, "fullName"),
                DecimalNumber(row, "salary", DecimalNumber(system, "salary", 0)),
                DecimalNumber(row, "overtimeAmount", DecimalNumber(system, "overtimeAmount", 0)),
                DecimalNumber(row, "advanceAmount", DecimalNumber(system, "advanceAmount", 0)),
                DecimalNumber(row, "deductionAmount", DecimalNumber(system, "deductionAmount", 0)),
                DecimalNumber(row, "bankAmount", DecimalNumber(final, "bank", 0)),
                DecimalNumber(row, "cashAmount", DecimalNumber(final, "cash", 0)),
                DecimalNumber(row, "totalAmount", DecimalNumber(final, "total", DecimalNumber(row, "net", 0)))));
        }
        return result;
    }

    public async Task<SyncResult> SyncPunchesAsync(string token, IReadOnlyList<PunchRow> punches, string deviceLabel, CancellationToken ct = default)
    {
        if (punches.Count == 0) return new SyncResult(new HashSet<string>(), new Dictionary<string, string>(), 0, 0);
        var rows = punches.Select(row => new
        {
            localId = row.Id,
            cardNo = row.CardNo,
            workDate = row.WorkDate,
            eventTime = row.EventTime.Length >= 5 ? row.EventTime[..5] : row.EventTime,
            direction = string.IsNullOrWhiteSpace(row.Direction) ? "AUTO" : row.Direction,
            source = deviceLabel,
            note = $"KY PDKS · {row.Source}{(string.IsNullOrWhiteSpace(row.SourceRef) ? "" : $" · {row.SourceRef}")}",
        }).ToArray();

        using var document = await SendAsync(HttpMethod.Post, "/api/ik/personnel-control/time-events/import", new { source = deviceLabel, rows }, token, ct);
        var data = Unwrap(document.RootElement);
        var rejected = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        if (data.ValueKind == JsonValueKind.Object && data.TryGetProperty("rejected", out var rejectedNode) && rejectedNode.ValueKind == JsonValueKind.Array)
        {
            foreach (var item in rejectedNode.EnumerateArray())
            {
                var localId = Text(item, "localId");
                if (string.IsNullOrWhiteSpace(localId)) continue;
                rejected[localId] = Text(item, "reason") is { Length: > 0 } rejectReason ? rejectReason : "ERP kart kaydını reddetti.";
            }
        }

        var accepted = punches.Where(row => !rejected.ContainsKey(row.Id)).Select(row => row.Id).ToHashSet(StringComparer.OrdinalIgnoreCase);
        var acceptedCount = Number(data, "acceptedCount", accepted.Count);
        var rejectedCount = Number(data, "rejectedCount", rejected.Count);
        return new SyncResult(accepted, rejected, acceptedCount, rejectedCount);
    }

    private async Task<JsonDocument> SendAsync(HttpMethod method, string path, object? body, string token, CancellationToken ct)
    {
        using var request = new HttpRequestMessage(method, path);
        if (body is not null) request.Content = JsonContent.Create(body);
        if (!string.IsNullOrWhiteSpace(token)) request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        using var response = await _http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, ct);
        var raw = await response.Content.ReadAsStringAsync(ct);
        JsonDocument document;
        try { document = JsonDocument.Parse(string.IsNullOrWhiteSpace(raw) ? "{}" : raw); }
        catch { throw new ErpApiException($"KY ERP geçersiz yanıt döndürdü (HTTP {(int)response.StatusCode}).", response.StatusCode, "INVALID_RESPONSE"); }

        if (!response.IsSuccessStatusCode || IsExplicitFailure(document.RootElement))
        {
            var message = ErrorMessage(document.RootElement) ?? $"KY ERP isteği başarısız (HTTP {(int)response.StatusCode}).";
            var code = ErrorCode(document.RootElement);
            document.Dispose();
            throw new ErpApiException(message, response.StatusCode, code);
        }
        return document;
    }

    private static AuthFlow ParseAuth(JsonElement rootElement)
    {
        var root = Unwrap(rootElement);
        var user = root.ValueKind == JsonValueKind.Object && root.TryGetProperty("user", out var userNode) ? userNode : default;
        var provider = Text(root, "provider");
        if (string.IsNullOrWhiteSpace(provider) && root.ValueKind == JsonValueKind.Object && root.TryGetProperty("availableProviders", out var providers) && providers.ValueKind == JsonValueKind.Array)
            provider = providers.EnumerateArray().Select(v => v.GetString()).FirstOrDefault(v => !string.IsNullOrWhiteSpace(v)) ?? "";
        return new AuthFlow(
            Text(root, "stage"), Text(root, "token"),
            user.ValueKind == JsonValueKind.Object ? Text(user, "username") : "",
            user.ValueKind == JsonValueKind.Object ? Text(user, "fullName", "full_name") : "",
            user.ValueKind == JsonValueKind.Object ? Text(user, "role") : "",
            Text(root, "challengeId"), Text(root, "challengeToken"), provider,
            Text(root, "approvalId"), Text(root, "approvalToken"), Text(root, "message"));
    }

    private static JsonElement Unwrap(JsonElement root)
    {
        if (root.ValueKind == JsonValueKind.Object && root.TryGetProperty("data", out var data)) return data;
        return root;
    }

    private static bool IsExplicitFailure(JsonElement root) => root.ValueKind == JsonValueKind.Object && root.TryGetProperty("ok", out var ok) && ok.ValueKind == JsonValueKind.False;

    private static string? ErrorMessage(JsonElement root)
    {
        if (root.ValueKind != JsonValueKind.Object) return null;
        if (root.TryGetProperty("error", out var error) && error.ValueKind == JsonValueKind.Object)
        {
            var message = Text(error, "message");
            if (!string.IsNullOrWhiteSpace(message)) return message;
        }
        var direct = Text(root, "message");
        return string.IsNullOrWhiteSpace(direct) ? null : direct;
    }

    private static string ErrorCode(JsonElement root)
    {
        if (root.ValueKind == JsonValueKind.Object && root.TryGetProperty("error", out var error) && error.ValueKind == JsonValueKind.Object) return Text(error, "code");
        return Text(root, "code");
    }

    private static string Text(JsonElement node, params string[] names)
    {
        if (node.ValueKind != JsonValueKind.Object) return "";
        foreach (var name in names)
        {
            if (!node.TryGetProperty(name, out var value)) continue;
            return value.ValueKind == JsonValueKind.String ? value.GetString() ?? "" : value.ToString();
        }
        return "";
    }

    private static int Number(JsonElement node, string name, int fallback)
    {
        if (node.ValueKind == JsonValueKind.Object && node.TryGetProperty(name, out var value) && value.TryGetInt32(out var number)) return number;
        return fallback;
    }

    private static decimal DecimalNumber(JsonElement node, string name, decimal fallback)
    {
        if (node.ValueKind != JsonValueKind.Object || !node.TryGetProperty(name, out var value)) return fallback;
        if (value.ValueKind == JsonValueKind.Number && value.TryGetDecimal(out var number)) return number;
        if (value.ValueKind == JsonValueKind.String && decimal.TryParse(value.GetString(), System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out number)) return number;
        return fallback;
    }

    private static bool Bool(JsonElement node, string name)
    {
        if (node.ValueKind != JsonValueKind.Object || !node.TryGetProperty(name, out var value)) return false;
        return value.ValueKind switch
        {
            JsonValueKind.True => true,
            JsonValueKind.False => false,
            JsonValueKind.Number => value.TryGetInt32(out var number) && number != 0,
            JsonValueKind.String => value.GetString() is string stringValue && (stringValue.Equals("true", StringComparison.OrdinalIgnoreCase) || stringValue == "1"),
            _ => false,
        };
    }

    public void Dispose() => _http.Dispose();
}
