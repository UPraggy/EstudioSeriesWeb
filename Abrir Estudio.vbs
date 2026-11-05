' Abre o Estúdio de Séries sem janela de terminal: sobe backend + frontend e abre o navegador.
' Dá para criar um atalho deste arquivo na Área de Trabalho (ou rodar "criar-atalho.ps1").
' Log: logs\estudio-<data>.log  ·  Para parar: "Parar Estudio.vbs"
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
pasta = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = pasta
sh.Run "cmd /c node scripts\dev.js", 0, False
