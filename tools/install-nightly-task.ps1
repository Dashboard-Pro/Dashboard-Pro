# Crea (o actualiza) la tarea programada de Windows que procesa el volcado nocturno cada noche aunque el
# dashboard esté cerrado. Solo en el PC de casa. Uso (PowerShell, en la carpeta del dashboard):
#   powershell -ExecutionPolicy Bypass -File tools\install-nightly-task.ps1
# Para quitarla:  Unregister-ScheduledTask -TaskName "SFL Dashboard - volcado nocturno" -Confirm:$false
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$node = (Get-Command node).Source
$script = Join-Path $root "tools\nightly-run.js"
$logFile = Join-Path $env:LOCALAPPDATA "sfl-dashboard-nightly.log"

# conhost --headless: sin ventana negra a medianoche; el script escribe su propio registro
$action = New-ScheduledTaskAction -Execute "conhost.exe" -Argument "--headless `"$node`" `"$script`" --log `"$logFile`"" -WorkingDirectory $root
# El volcado sale hacia las 22:00 UTC (00:00 en España en verano): a las 00:45 ya está
$trigger = New-ScheduledTaskTrigger -Daily -At "00:45"
# Si el PC estaba apagado a esa hora, se hace en cuanto se encienda
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 30) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName "SFL Dashboard - volcado nocturno" -Action $action -Trigger $trigger -Settings $settings `
  -Description "Procesa el volcado nocturno de Sunflower Land (data/dump) aunque el dashboard esté cerrado" -Force | Out-Null
Write-Host "Tarea creada: cada día a las 00:45 (o al encender el PC si estaba apagado). Registro en $logFile"
