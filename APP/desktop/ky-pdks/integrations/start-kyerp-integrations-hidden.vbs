Option Explicit
Dim sh, fs, script
Set sh = CreateObject("WScript.Shell")
Set fs = CreateObject("Scripting.FileSystemObject")
script = fs.BuildPath(fs.GetParentFolderName(WScript.ScriptFullName), "start-kyerp-integrations.ps1")
sh.Run "powershell.exe -NoProfile -NonInteractive -ExecutionPolicy RemoteSigned -File """ & script & """", 0, False
