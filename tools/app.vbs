' SFL Console como app de Windows: arranca el servidor sin ventana de consola y el propio servidor abre la ventana de la
' app (Chrome o Edge en modo --app) cuando ya escucha. Al cerrar la ventana, el servidor se cierra solo a los 5 minutos.
' Lo que escribe el servidor queda en dashboard.log. Lo abren start.bat y el acceso directo "SFL Console".
Option Explicit
Dim sh, fso, dir, env, rc
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
dir = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
sh.CurrentDirectory = dir

' Node.js instalado y en la version 18 o mas nueva (sin el, la ventana solo diria "no hay conexion")
rc = sh.Run("cmd /c node -e ""process.exit(Number(process.versions.node.split('.')[0]) < 18 ? 1 : 0)""", 0, True)
If rc <> 0 Then
  If sh.Run("cmd /c where node", 0, True) <> 0 Then
    MsgBox "Falta Node.js." & vbCrLf & vbCrLf & "Instala la version LTS desde https://nodejs.org y vuelve a abrir SFL Console.", vbExclamation, "SFL Console"
  Else
    MsgBox "Tu Node.js es demasiado antiguo: hace falta la version 18 o mas nueva." & vbCrLf & vbCrLf & "Instala la version LTS desde https://nodejs.org y vuelve a abrir SFL Console.", vbExclamation, "SFL Console"
  End If
  sh.Run "https://nodejs.org/"
  WScript.Quit 1
End If

Set env = sh.Environment("Process")
env("SFL_OPEN_BROWSER") = "app"
env("SFL_APP") = "1"
env("SFL_LOG_FILE") = dir & "\dashboard.log"
sh.Run "node tools\run.js", 0, False
