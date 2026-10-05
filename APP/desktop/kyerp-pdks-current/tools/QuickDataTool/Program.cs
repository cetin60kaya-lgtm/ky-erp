using System;
using System.Windows.Forms;

namespace QuickDataTool;

internal static class Program
{
    [STAThread]
    static void Main(string[] args)
    {
        string[] keys = ["KY_PDKS_DB_PATH","KY_PDKS_DB_HOST","KY_PDKS_DB_PORT","KY_PDKS_DB_USER","KY_PDKS_DB_PASSWORD","KY_PDKS_DB_CHARSET"];
        foreach (var key in keys)
        {
            if (!string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable(key))) continue;
            var value = Environment.GetEnvironmentVariable(key, EnvironmentVariableTarget.User);
            if (!string.IsNullOrWhiteSpace(value)) Environment.SetEnvironmentVariable(key, value);
        }
        if (args.Length >= 2 && string.Equals(args[0], "--inspect-aug26", StringComparison.OrdinalIgnoreCase))
        {
            August2026Patch.Inspect(args[1]);
            return;
        }
        if (args.Length >= 2 && string.Equals(args[0], "--apply-aug26", StringComparison.OrdinalIgnoreCase))
        {
            August2026Patch.Apply(args[1]);
            return;
        }
        ApplicationConfiguration.Initialize();
        Application.Run(new MainForm());
    }
}
