' Clothing Asset Library - silent launcher for the reasoning server (no console window)
' Run this file with wscript to start "node server.js" in the background.
' When registered into the Windows Startup folder by install-autostart.bat,
' it launches automatically at every logon.
' NOTE: keep this file ASCII-only. wscript decodes .vbs using the system ANSI
' codepage, so non-ASCII bytes (e.g. Chinese comments) can crash the parser.

Dim fso, shell, scriptDir, serverDir, nodeExe, cmd
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

' This vbs lives in server\scripts; the server root is its parent folder.
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
serverDir = fso.GetParentFolderName(scriptDir)

' Prefer the standard Node install path; fall back to node.exe on PATH.
nodeExe = "C:\Program Files\nodejs\node.exe"
If Not fso.FileExists(nodeExe) Then
  nodeExe = "node.exe"
End If

' Set the working directory to the server root so config.json / providers resolve.
shell.CurrentDirectory = serverDir

' Launch node server.js. 0 = hidden window, False = do not wait (stays resident).
cmd = """" & nodeExe & """ server.js"
shell.Run cmd, 0, False
