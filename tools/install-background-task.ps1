# Crea (o actualiza) la tarea programada de Windows que, con el dashboard cerrado, guarda cada 3 horas tus operaciones
# del mercado (la API solo da las 50 ultimas) y la foto de precios, y procesa el volcado nocturno. Sustituye a la tarea
# "SFL Dashboard - volcado nocturno" (esta hace lo mismo y mas). Sin permisos de administrador: es de tu usuario.
#   powershell -ExecutionPolicy Bypass -File tools\install-background-task.ps1           (crear)
#   powershell -ExecutionPolicy Bypass -File tools\install-background-task.ps1 -Quitar   (quitar)
param([switch]$Quitar)
$ErrorActionPreference = "Stop"
$name = "SFL Dashboard - en segundo plano"
$old = "SFL Dashboard - volcado nocturno"
if (Get-ScheduledTask -TaskName $old -ErrorAction SilentlyContinue) { Unregister-ScheduledTask -TaskName $old -Confirm:$false }
if ($Quitar) {
  if (Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue) { Unregister-ScheduledTask -TaskName $name -Confirm:$false }
  Write-Host "Tarea quitada."
  exit 0
}
$root = Split-Path -Parent $PSScriptRoot
$node = (Get-Command node).Source
$script = Join-Path $root "tools\background-run.js"
$logFile = Join-Path $env:LOCALAPPDATA "sfl-dashboard-fondo.log"

# conhost --headless: sin ventana negra; el script escribe su propio registro
$action = New-ScheduledTaskAction -Execute "conhost.exe" -Argument "--headless `"$node`" `"$script`" --log `"$logFile`"" -WorkingDirectory $root
# Cada 3 horas empezando a las 00:45 (el volcado sale hacia las 22:00 UTC = 00:00 en Espana en verano)
$trigger = New-ScheduledTaskTrigger -Once -At "00:45" -RepetitionInterval (New-TimeSpan -Hours 3)
# Si el PC estaba apagado o dormido a esa hora, se hace en cuanto se encienda
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 30) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName $name -Action $action -Trigger $trigger -Settings $settings `
  -Description "SFL Dashboard: guarda tus operaciones y la foto de precios y procesa el volcado nocturno aunque el dashboard este cerrado" -Force | Out-Null
Write-Host "Tarea creada: cada 3 horas (y al encender el PC si se paso la hora). Registro en $logFile"
