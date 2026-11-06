# Cria (ou atualiza) os atalhos "Estudio de Series" e "Parar Estudio de Series" na Area de Trabalho, com icone.
# Uso: botao direito > "Executar com o PowerShell"  (ou: powershell -ExecutionPolicy Bypass -File criar-atalho.ps1)
# Este arquivo e so ASCII de proposito: o PowerShell 5.1 le .ps1 sem BOM como ANSI e estragava os acentos
# ("EstÃºdio"). Os acentos dos nomes saem dos codigos abaixo, que funcionam em qualquer codificacao.
$u = [char]0x00FA  # u com acento agudo
$e = [char]0x00E9  # e com acento agudo
$nomeAbrir = "Est${u}dio de S${e}ries"
$nomeParar = "Parar Est${u}dio de S${e}ries"

$pasta = Split-Path -Parent $MyInvocation.MyCommand.Path
$desktop = [Environment]::GetFolderPath('Desktop')
$shell = New-Object -ComObject WScript.Shell

# Remove atalhos antigos com o nome estragado (criados por versoes anteriores deste script).
$ruim = ([char]0x00C3).ToString()
Get-ChildItem -LiteralPath $desktop -Filter '*.lnk' | Where-Object { $_.Name -like "*Est${ruim}*dio de S${ruim}*ries.lnk" } | Remove-Item -Force

$abrir = $shell.CreateShortcut((Join-Path $desktop "$nomeAbrir.lnk"))
$abrir.TargetPath = Join-Path $env:WINDIR 'System32\wscript.exe'
$abrir.Arguments = '"' + (Join-Path $pasta 'Abrir Estudio.vbs') + '"'
$abrir.WorkingDirectory = $pasta
$abrir.IconLocation = (Join-Path $pasta 'assets\estudio.ico') + ',0'
$abrir.Description = "Abre o $nomeAbrir no navegador"
$abrir.Save()

$parar = $shell.CreateShortcut((Join-Path $desktop "$nomeParar.lnk"))
$parar.TargetPath = Join-Path $env:WINDIR 'System32\wscript.exe'
$parar.Arguments = '"' + (Join-Path $pasta 'Parar Estudio.vbs') + '"'
$parar.WorkingDirectory = $pasta
$parar.IconLocation = (Join-Path $pasta 'assets\estudio-parar.ico') + ',0'
$parar.Description = "Para o $nomeAbrir"
$parar.Save()

Write-Output "Atalhos criados na Area de Trabalho: '$nomeAbrir' e '$nomeParar'."
