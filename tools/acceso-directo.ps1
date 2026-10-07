# Crea el acceso directo "SFL Console" (icono propio; abre la app sin ventana de consola) en el escritorio y en el
# menu Inicio (asi sale tambien al buscar en Windows). Con -SiFalta solo lo crea si aun no existe en el escritorio.
param([switch]$SiFalta)
$ErrorActionPreference = 'Stop'
$dir = Split-Path -Parent $PSScriptRoot
$desk = Join-Path ([Environment]::GetFolderPath('Desktop')) 'SFL Console.lnk'
if ($SiFalta -and (Test-Path $desk)) { exit 0 }
$menu = Join-Path ([Environment]::GetFolderPath('Programs')) 'SFL Console.lnk'
$ws = New-Object -ComObject WScript.Shell
foreach ($lnk in @($desk, $menu)) {
  $s = $ws.CreateShortcut($lnk)
  $s.TargetPath = Join-Path $env:WINDIR 'System32\wscript.exe'
  $s.Arguments = '//nologo "' + (Join-Path $dir 'tools\app.vbs') + '"'
  $s.WorkingDirectory = $dir
  $s.IconLocation = (Join-Path $dir 'public\icon.ico') + ',0'
  $s.Description = 'SFL Console - tu granja de Sunflower Land'
  $s.Save()
}
Write-Host '  Acceso directo "SFL Console" creado en el escritorio y en el menu Inicio.'
