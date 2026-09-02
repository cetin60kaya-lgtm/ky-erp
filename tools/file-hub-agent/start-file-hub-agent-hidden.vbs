Option Explicit

Dim shell, fso, baseDir, cmdPath, command
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
baseDir = fso.GetParentFolderName(WScript.ScriptFullName)
cmdPath = fso.BuildPath(baseDir, "start-file-hub-agent.cmd")

If Not fso.FileExists(cmdPath) Then
  WScript.Quit 2
End If

command = "cmd.exe /c """ & cmdPath & """"
shell.Run command, 0, False
