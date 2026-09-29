using System.Text;

namespace HKN.Personel.Native;

internal static class ManualEditAudit
{
    static readonly object Gate = new();
    public static void Record(string action, string card, DateTime day, string entry, string exit)
    {
        try
        {
            CompanyDataPaths.Ensure();
            var path = Path.Combine(CompanyDataPaths.Logs, $"manual-edits-{DateTime.Today:yyyy}.csv");
            lock (Gate)
            {
                var fresh = !File.Exists(path);
                using var sw = new StreamWriter(path, true, new UTF8Encoding(true));
                if (fresh) sw.WriteLine("Timestamp;WindowsUser;Action;Card;Day;Entry;Exit");
                sw.WriteLine(string.Join(";", Q(DateTime.Now.ToString("O")), Q(Environment.UserName), Q(action), Q(card), Q(day.ToString("yyyy-MM-dd")), Q(entry), Q(exit)));
            }
        }
        catch { }
    }

    static string Q(string value) => "\"" + value.Replace("\"", "\"\"") + "\"";
}
