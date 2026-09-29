using System.Diagnostics;
using System.Text;

namespace HKN.Personel.Native;

internal static class TerminalSdkRepair
{
    static readonly string[] CopyFiles = ["TMPCCOMM.dll", "CH375DLL.DLL", "MFC42.DLL", "MSFLXGRD.OCX", "comdlg32.ocx", "FP_CLOCK.ocx", "smbutton.ocx"];
    static readonly string[] RegisterFiles = ["MSFLXGRD.OCX", "comdlg32.ocx", "FP_CLOCK.ocx", "smbutton.ocx"];

    public static bool LooksLikeRegistrationProblem(string? message)
    {
        if (string.IsNullOrWhiteSpace(message)) return false;
        return message.Contains("class not registered", StringComparison.OrdinalIgnoreCase) ||
               message.Contains("80040154", StringComparison.OrdinalIgnoreCase) ||
               message.Contains("ActiveX", StringComparison.OrdinalIgnoreCase) ||
               message.Contains("sınıf kay", StringComparison.OrdinalIgnoreCase) ||
               message.Contains("sinif kay", StringComparison.OrdinalIgnoreCase) ||
               message.Contains("OCX", StringComparison.OrdinalIgnoreCase);
    }

    public static bool TryRepair(IWin32Window owner)
    {
        var sdk = Path.Combine(AppContext.BaseDirectory, "TerminalSdk");
        var missing = CopyFiles.Where(x => !File.Exists(Path.Combine(sdk, x))).ToArray();
        if (missing.Length > 0)
        {
            MessageBox.Show("Terminal sürücü paketi eksik: " + string.Join(", ", missing), "Terminal Sürücüsü", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return false;
        }

        if (MessageBox.Show(
                "Kart cihazı sürücüsünün Windows 32-bit bileşen kaydı eksik görünüyor.\r\n\r\nŞimdi otomatik onarılsın mı? Windows yalnız bir kez yönetici onayı isteyebilir.",
                "Terminal Sürücüsünü Onar",
                MessageBoxButtons.YesNo,
                MessageBoxIcon.Question) != DialogResult.Yes)
            return false;

        try
        {
            var qSdk = sdk.Replace("'", "''");
            var copyArray = string.Join(",", CopyFiles.Select(x => "'" + x.Replace("'", "''") + "'"));
            var regArray = string.Join(",", RegisterFiles.Select(x => "'" + x.Replace("'", "''") + "'"));
            var script = $@"
$ErrorActionPreference='Stop'
$S='{qSdk}'
$W=Join-Path $env:WINDIR 'SysWOW64'
$copy=@({copyArray})
foreach($f in $copy){{
  $dst=Join-Path $W $f
  if($f -ieq 'MFC42.DLL' -and (Test-Path -LiteralPath $dst)){{ continue }}
  Copy-Item -LiteralPath (Join-Path $S $f) -Destination $dst -Force
}}
$reg=Join-Path $W 'regsvr32.exe'
foreach($f in @({regArray})){{
  & $reg /s (Join-Path $W $f)
  if($LASTEXITCODE -ne 0){{ exit $LASTEXITCODE }}
}}
exit 0
";
            var encoded = Convert.ToBase64String(Encoding.Unicode.GetBytes(script));
            using var process = Process.Start(new ProcessStartInfo
            {
                FileName = "powershell.exe",
                Arguments = "-NoProfile -ExecutionPolicy Bypass -EncodedCommand " + encoded,
                UseShellExecute = true,
                Verb = "runas",
                WorkingDirectory = AppContext.BaseDirectory
            });
            if (process is null) return false;
            if (!process.WaitForExit(45000))
            {
                try { process.Kill(true); } catch { }
                MessageBox.Show("Terminal sürücüsü onarımı zaman aşımına uğradı.", "Terminal Sürücüsü", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return false;
            }
            if (process.ExitCode != 0)
            {
                MessageBox.Show("Terminal sürücüsü kaydedilemedi. Hata kodu: " + process.ExitCode, "Terminal Sürücüsü", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return false;
            }
            return true;
        }
        catch (System.ComponentModel.Win32Exception ex) when (ex.NativeErrorCode == 1223)
        {
            return false; // UAC cancelled by user.
        }
        catch (Exception ex)
        {
            MessageBox.Show("Terminal sürücüsü onarılamadı: " + ex.GetBaseException().Message, "Terminal Sürücüsü", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return false;
        }
    }
}
