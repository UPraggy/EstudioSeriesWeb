# Cria (ou atualiza) o atalho "Estúdio de Séries" na Área de Trabalho, com ícone, apontando para "Abrir Estudio.vbs".
# Uso: botão direito > "Executar com o PowerShell"  (ou: powershell -ExecutionPolicy Bypass -File criar-atalho.ps1)
$pasta = Split-Path -Parent $MyInvocation.MyCommand.Path
$desktop = [Environment]::GetFolderPath('Desktop')
$shell = New-Object -ComObject WScript.Shell

$abrir = $shell.CreateShortcut((Join-Path $desktop 'Estúdio de Séries.lnk'))
$abrir.TargetPath = Join-Path $env:WINDIR 'System32\wscript.exe'
$abrir.Arguments = '"' + (Join-Path $pasta 'Abrir Estudio.vbs') + '"'
$abrir.WorkingDirectory = $pasta
$abrir.IconLocation = (Join-Path $pasta 'assets\estudio.ico') + ',0'
$abrir.Description = 'Abre o Estúdio de Séries no navegador'
$abrir.Save()

$parar = $shell.CreateShortcut((Join-Path $desktop 'Parar Estúdio de Séries.lnk'))
$parar.TargetPath = Join-Path $env:WINDIR 'System32\wscript.exe'
$parar.Arguments = '"' + (Join-Path $pasta 'Parar Estudio.vbs') + '"'
$parar.WorkingDirectory = $pasta
$parar.IconLocation = (Join-Path $pasta 'assets\estudio-parar.ico') + ',0'
$parar.Description = 'Para o Estúdio de Séries'
$parar.Save()

Write-Output "Atalhos criados na Área de Trabalho: 'Estúdio de Séries' e 'Parar Estúdio de Séries'."
