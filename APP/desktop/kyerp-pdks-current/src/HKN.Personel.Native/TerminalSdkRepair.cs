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
        var resolution = TerminalSdkLocator.Resolve();
        var sdk = resolution.CompleteSdk && !string.IsNullOrWhiteSpace(resolution.SourceFolder)
            ? resolution.SourceFolder!
            : Path.Combine(AppContext.BaseDirectory, "TerminalSdk");

        var missing = CopyFiles.Where(x => !File.Exists(Path.Combine(sdk, x))).ToArray();
        if (missing.Length > 0)
        {
            MessageBox.Show(
                "Çalışan Hedef terminal SDK seti otomatik bulunamadı.\r\n\r\nEksik: " + string.Join(", ", missing) +
                "\r\n\r\nHedef PDKS açıkken tekrar deneyin veya TerminalSdk klasörünü tam paket olarak kullanın.",
                "Terminal Sürücüsü", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return false;
        }

        if (resolution.ActiveXRegistered)
        {
            if (MessageBox.Show(
                    "FP_CLOCK 32-bit ActiveX zaten Windows'ta kayıtlı görünüyor. Yine de Hedef'te çalışan SDK setiyle kayıt yenilensin mi?\r\n\r\nHedef kurulum dosyaları değiştirilmez; yalnız Windows 32-bit bileşen kaydı yenilenir.",
                    "Terminal Sürücüsünü Onar",
                    MessageBoxButtons.YesNo,
                    MessageBoxIcon.Question) != DialogResult.Yes)
                return false;
        }
        else if (MessageBox.Show(
                     "Kart cihazı için Hedef PDKS'de kullanılan 32-bit terminal bileşenleri bulundu.\r\n\r\nWindows ActiveX kaydı şimdi otomatik yapılsın mı? Hedef klasöründeki dosyalar değiştirilmez.",
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
  $src=Join-Path $S $f
  if(-not (Test-Path -LiteralPath $src)){{ continue }}
  $dst=Join-Path $W $f
  if($f -ieq 'MFC42.DLL' -and (Test-Path -LiteralPath $dst)){{ continue }}
  Copy-Item -LiteralPath $src -Destination $dst -Force
}}
$reg=Join-Path $W 'regsvr32.exe'
foreach($f in @({regArray})){{
  $target=Join-Path $W $f
  if(-not (Test-Path -LiteralPath $target)){{ continue }}
  & $reg /s $target
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
            return false;
        }
        catch (Exception ex)
        {
            PdksErrorPresenter.Show(owner,ex,"Terminal Sürücüsü",MessageBoxIcon.Warning,"Terminal.DriverRepair");
            return false;
        }
    }
}
