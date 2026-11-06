' Para o Estudio de Series (backend + frontend) sem abrir terminal.
' Arquivo so ASCII de proposito: o Windows le .vbs como ANSI; os acentos da mensagem saem de ChrW.
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
pasta = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = pasta
sh.Run "cmd /c node scripts\parar.js", 0, True
nome = "Est" & ChrW(250) & "dio de S" & ChrW(233) & "ries"
MsgBox nome & " parado.", 64, nome
