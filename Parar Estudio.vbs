' Para o Estúdio de Séries (backend + frontend) sem abrir terminal.
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
pasta = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = pasta
sh.Run "cmd /c node scripts\parar.js", 0, True
MsgBox "Estúdio de Séries parado.", 64, "Estúdio de Séries"
