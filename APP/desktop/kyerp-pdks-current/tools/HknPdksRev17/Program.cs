using System;
using System.Windows.Forms;

namespace QuickDataTool;

internal static class Program
{
	[STAThread]
	private static void Main()
	{
		string[] array = new string[6] { "KY_PDKS_DB_PATH", "KY_PDKS_DB_HOST", "KY_PDKS_DB_PORT", "KY_PDKS_DB_USER", "KY_PDKS_DB_PASSWORD", "KY_PDKS_DB_CHARSET" };
		foreach (string variable in array)
		{
			if (string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable(variable)))
			{
				string? environmentVariable = Environment.GetEnvironmentVariable(variable, EnvironmentVariableTarget.User);
				if (!string.IsNullOrWhiteSpace(environmentVariable))
				{
					Environment.SetEnvironmentVariable(variable, environmentVariable);
				}
			}
		}
		ApplicationConfiguration.Initialize();
		CrashGuard.Install();
		using (PasswordGateForm passwordGateForm = new PasswordGateForm())
		{
			if (passwordGateForm.ShowDialog() != DialogResult.OK)
			{
				return;
			}
		}
		Application.Run(new MainForm());
	}
}
