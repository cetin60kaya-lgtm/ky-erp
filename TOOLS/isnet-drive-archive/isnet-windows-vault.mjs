// Local Windows DPAPI CurrentUser credential vault. The portal password is never
// passed on the command line, logged, synced to Drive or returned to a browser.
// Only an explicit user action may load the credential to start a portal login.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const PS = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$inputData = [Console]::In.ReadToEnd() | ConvertFrom-Json
$login = ([string]$inputData.username).Trim()
if ($login.Length -lt 1 -or $login.Length -gt 128) { throw 'LOGIN_INVALID' }
$utf8 = [Text.Encoding]::UTF8
$sha = [Security.Cryptography.SHA256]::Create()
try {
    $hash = [BitConverter]::ToString($sha.ComputeHash($utf8.GetBytes($login.ToUpperInvariant()))).Replace('-', '').ToLowerInvariant()
} finally { $sha.Dispose() }
$dir = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'KY ERP\Desktop\IsNet-Vault'
$target = Join-Path $dir ($hash + '.bin')
$entropy = $utf8.GetBytes('KYERP_ISNET_CURRENTUSER_V1:' + $login.ToUpperInvariant())
$mode = [string]$inputData.mode
if ($mode -eq 'save') {
    $pass = [string]$inputData.password
    if ($pass.Length -lt 1 -or $pass.Length -gt 512) { throw 'PASSWORD_INVALID' }
    [void][IO.Directory]::CreateDirectory($dir)
    $cipher = [Security.Cryptography.ProtectedData]::Protect($utf8.GetBytes($pass), $entropy, [Security.Cryptography.DataProtectionScope]::CurrentUser)
    $tmp = Join-Path $dir ([Guid]::NewGuid().ToString('N') + '.tmp')
    try { [IO.File]::WriteAllBytes($tmp, $cipher); Move-Item -LiteralPath $tmp -Destination $target -Force }
    finally { if (Test-Path -LiteralPath $tmp) { Remove-Item -LiteralPath $tmp -Force } }
    Write-Output '{"ok":true}'
} elseif ($mode -eq 'load') {
    if (-not (Test-Path -LiteralPath $target -PathType Leaf)) { Write-Output '{"ok":false,"reason":"NOT_FOUND"}'; exit 0 }
    $cipher = [IO.File]::ReadAllBytes($target)
    $clear = [Security.Cryptography.ProtectedData]::Unprotect($cipher, $entropy, [Security.Cryptography.DataProtectionScope]::CurrentUser)
    @{ok=$true;password=$utf8.GetString($clear)} | ConvertTo-Json -Compress
} elseif ($mode -eq 'delete') {
    if (Test-Path -LiteralPath $target -PathType Leaf) { Remove-Item -LiteralPath $target -Force }
    Write-Output '{"ok":true}'
} else { throw 'INVALID_OPERATION' }
`;
const encoded = Buffer.from(PS, "utf16le").toString("base64");
export async function windowsIsnetCredential(mode, username, password = "") {
  if (process.platform !== "win32") throw Error("VAULT_WINDOWS_ONLY");
  if (!["save", "load", "delete"].includes(mode)) throw Error("VAULT_OPERATION_INVALID");
  const login = String(username || "").trim();
  if (!login || login.length > 128) throw Error("VAULT_USERNAME_INVALID");
  const ps = join(process.env.SystemRoot || "C:\\Windows",
    "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  if (!existsSync(ps)) throw Error("VAULT_WINDOWS_POWERSHELL_UNAVAILABLE");
  const input = JSON.stringify({mode, username: login, password: mode === "save" ? String(password) : ""});
  const result = await new Promise((resolve, reject) => {
    const child = spawn(ps, ["-NoProfile", "-NonInteractive", "-NoLogo", "-EncodedCommand", encoded],
      {windowsHide: true, stdio: ["pipe", "pipe", "ignore"]});
    let data = "";
    const timeout = setTimeout(() => child.kill(), 12000);
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", text => {
      data += text;
      if (data.length > 8192) child.kill();
    });
    child.on("error", () => { clearTimeout(timeout); reject(Error("VAULT_PROCESS_FAILED")); });
    child.on("close", code => {
      clearTimeout(timeout);
      if (code !== 0) return reject(Error("VAULT_WINDOWS_OPERATION_FAILED"));
      try { resolve(JSON.parse(data.trim())); }
      catch { reject(Error("VAULT_RESPONSE_INVALID")); }
    });
    child.stdin.on("error", () => {});
    child.stdin.end(input, "utf8");
  });
  if (!result || result.ok !== true) {
    if (mode === "load" && result?.reason === "NOT_FOUND") throw Error("VAULT_CREDENTIAL_NOT_FOUND");
    throw Error("VAULT_OPERATION_FAILED");
  }
  if (mode === "load") {
    if (typeof result.password !== "string" || !result.password) throw Error("VAULT_CREDENTIAL_EMPTY");
    return result.password;
  }
  return true;
}
