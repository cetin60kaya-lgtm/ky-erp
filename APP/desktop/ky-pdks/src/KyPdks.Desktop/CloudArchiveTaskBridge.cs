using System.Runtime.InteropServices;
using System.Security.Principal;
using System.Text;
using System.Text.Json;

namespace KyPdks.Desktop;

/// <summary>
/// On-demand, current-user, non-elevated Task Scheduler broker for read-only
/// cloud mount verification. A WPF/WebView2 process protected by Windows
/// RedirectionGuard must not follow an untrusted user-created junction.
/// Task Scheduler starts the already installed, restricted local verifier in
/// a separate process; no security mitigation is disabled.
/// </summary>
public static class CloudArchiveTaskBridge
{
    private static readonly UTF8Encoding Utf8 = new(false);
    private static readonly string Root = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "KY ERP", "Desktop", "ArchiveProbe");

    private static string NodeExe => Path.Combine(AppContext.BaseDirectory,
        "Integrations", "bin", "node.exe");
    private static string RunnerScript => Path.Combine(AppContext.BaseDirectory,
        "Integrations", "file-hub-agent", "archive-root-task.mjs");

    public static bool Available => File.Exists(NodeExe) && File.Exists(RunnerScript);

    private static string CurrentSid =>
        WindowsIdentity.GetCurrent().User?.Value ??
        throw new InvalidOperationException("Windows kullanıcı kimliği okunamadı.");

    private static string TaskName => "KYERP.CloudArchiveProbe." + CurrentSid.Replace('-', '_');
    private static bool _taskRegisteredForProcess;

    /// <summary>
    /// Extract a strictly matching response envelope. Exposed for regression
    /// tests: a stale result can never approve a different request.
    /// </summary>
    public static string? GetMatchingPayload(string text, string expectedId)
    {
        using var json = JsonDocument.Parse(text);
        var root = json.RootElement;
        if (!root.TryGetProperty("id", out var id) ||
            id.GetString() != expectedId) return null;
        if (root.TryGetProperty("error", out var error) &&
            error.ValueKind == JsonValueKind.String)
            throw new IOException("Yerel klasör doğrulama görevi: " + error.GetString());
        if (!root.TryGetProperty("payload", out var data) ||
            data.ValueKind != JsonValueKind.Object)
            throw new InvalidDataException("Klasör doğrulama yanıtı geçersiz.");
        return data.GetRawText();
    }

    private static void StartOnDemandTask()
    {
        var schedulerType = Type.GetTypeFromProgID("Schedule.Service")
            ?? throw new InvalidOperationException("Windows görev zamanlayıcı bulunamadı.");
        dynamic service = Activator.CreateInstance(schedulerType)
            ?? throw new InvalidOperationException("Windows görev zamanlayıcı açılamadı.");
        service.Connect();
        dynamic folder = service.GetFolder("\\");
        dynamic registered;
        if (!_taskRegisteredForProcess)
        {
            dynamic definition = service.NewTask(0);
            definition.RegistrationInfo.Description =
                "KY ERP salt okunur Google Drive/OneDrive klasör doğrulaması; isteğe bağlı";
            definition.Principal.UserId = WindowsIdentity.GetCurrent().Name;
            definition.Principal.LogonType = 3; // TASK_LOGON_INTERACTIVE_TOKEN
            definition.Principal.RunLevel = 0;  // TASK_RUNLEVEL_LUA, never elevated
            definition.Settings.Enabled = true;
            definition.Settings.AllowDemandStart = true;
            definition.Settings.ExecutionTimeLimit = "PT1M";
            // A new inspection may be requested while the previous task is
            // finalizing its response. Queue the next run; IgnoreNew loses it.
            definition.Settings.MultipleInstances = 1; // TASK_INSTANCES_QUEUE
            definition.Settings.DisallowStartIfOnBatteries = false;
            definition.Settings.StopIfGoingOnBatteries = false;
            dynamic action = definition.Actions.Create(0); // TASK_ACTION_EXEC
            action.Path = NodeExe;
            action.Arguments = "\"" + RunnerScript + "\"";
            action.WorkingDirectory = Path.GetDirectoryName(RunnerScript);
            // On-demand only: no logon, time or recurring trigger.
            registered = folder.RegisterTaskDefinition(
                TaskName, definition, 6, WindowsIdentity.GetCurrent().Name,
                null, 3, null); // TASK_CREATE_OR_UPDATE; INTERACTIVE_TOKEN
            _taskRegisteredForProcess = true;
        }
        else
        {
            // Do not rewrite a still-running task definition for every
            // confirmation step. Verify the installed executable every time.
            registered = folder.GetTask(TaskName);
            dynamic current = registered.Definition.Actions.Item(1);
            string actualPath = current.Path;
            string actualArgs = current.Arguments;
            if (!actualPath.Equals(NodeExe, StringComparison.OrdinalIgnoreCase) ||
                !actualArgs.Equals("\"" + RunnerScript + "\"", StringComparison.Ordinal))
                throw new UnauthorizedAccessException(
                    "Windows salt okunur doğrulama görevi beklenmeyen bir işlem gösteriyor.");
        }
        registered.Run(null);
    }

    public static string CallReadOnly(string inputJson)
    {
        if (!Available) throw new FileNotFoundException(
            "KY ERP salt okunur arşiv bileşeni kurulu değil.");
        if (inputJson.Length > 65536)
            throw new InvalidOperationException("Klasör kontrol isteği çok büyük.");

        var sid = CurrentSid;
        using var gate = new Mutex(false, @"Local\KYERP.CloudArchiveProbe." +
            sid.Replace('-', '_'));
        bool held = false;
        try
        {
            try { held = gate.WaitOne(TimeSpan.FromSeconds(60)); }
            catch (AbandonedMutexException) { held = true; }
            if (!held) throw new TimeoutException("Başka bir klasör kontrolü devam ediyor.");

            Directory.CreateDirectory(Root);
            var requestFile = Path.Combine(Root, "request.json");
            var pendingFile = Path.Combine(Root, "request.pending");
            var responseFile = Path.Combine(Root, "response.json");
            var id = Guid.NewGuid().ToString("N");
            var request = "{\"id\":\"" + id + "\",\"request\":" + inputJson + "}";
            File.Delete(responseFile);
            File.WriteAllText(pendingFile, request, Utf8);
            File.Move(pendingFile, requestFile, true);

            try
            {
                StartOnDemandTask();
                var deadline = DateTime.UtcNow.AddSeconds(48);
                while (DateTime.UtcNow < deadline)
                {
                    if (File.Exists(responseFile))
                    {
                        try
                        {
                            var matching = GetMatchingPayload(
                                File.ReadAllText(responseFile, Utf8), id);
                            if (matching is not null) return matching;
                            File.Delete(responseFile);
                        }
                        catch (IOException) when (!File.Exists(responseFile))
                        {
                            // Task may still be atomically publishing its reply.
                        }
                    }
                    Thread.Sleep(150);
                }
                throw new TimeoutException(
                    "Windows yerel bulut klasör kontrolü yanıt vermedi.");
            }
            finally
            {
                // All requests/results stay in this Windows user's AppData.
                // Never write to the Google Drive archive.
                try { File.Delete(requestFile); } catch (IOException) { }
                try { File.Delete(pendingFile); } catch (IOException) { }
                try { File.Delete(responseFile); } catch (IOException) { }
            }
        }
        finally
        {
            if (held) gate.ReleaseMutex();
        }
    }
}
