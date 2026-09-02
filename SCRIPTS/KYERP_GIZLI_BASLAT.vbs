Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
target = fso.BuildPath(scriptDir, "KYERP_GIZLI_BASLAT.ps1")
shell.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -File """ & target & """", 0, False
