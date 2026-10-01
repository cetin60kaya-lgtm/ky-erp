using System;
using System.IO;
using System.Text;
using System.Threading;
using System.Windows.Forms;

namespace QuickDataTool;

internal static class CrashGuard
{
	internal static void Install()
	{
		Application.SetUnhandledExceptionMode(UnhandledExceptionMode.CatchException);
		Application.ThreadException += delegate(object _, ThreadExceptionEventArgs e)
		{
			Log(e.Exception);
		};
		AppDomain.CurrentDomain.UnhandledException += delegate(object _, UnhandledExceptionEventArgs e)
		{
			if (e.ExceptionObject is Exception ex)
			{
				Log(ex);
			}
		};
	}

	private static void Log(Exception ex)
	{
		try
		{
			string text = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "HKN-PDKS");
			Directory.CreateDirectory(text);
			string text2 = Path.Combine(text, "QUICKDATA_HATA.log");
			File.AppendAllText(text2, $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] {ex}\r\n\r\n", Encoding.UTF8);
			MessageBox.Show("Bir işlem hatası yakalandı.\n\n" + ex.Message + "\n\nKayıt: " + text2, "HKN PDKS", MessageBoxButtons.OK, MessageBoxIcon.Hand);
		}
		catch
		{
		}
	}
}
