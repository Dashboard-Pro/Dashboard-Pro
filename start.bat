@echo off
cd /d "%~dp0"
title SFL Console

rem Sin Node.js el servidor no arranca y la ventana solo muestra "no hay conexion": se avisa antes
where node >nul 2>nul
if errorlevel 1 goto nonode
node -e "process.exit(Number(process.versions.node.split('.')[0]) < 18 ? 1 : 0)"
if errorlevel 1 goto oldnode

rem "start.bat consola": como antes, con esta ventana abierta y lo que escribe el servidor a la vista
if /i "%~1"=="consola" goto consola

rem La primera vez: acceso directo "SFL Console" con su icono en el escritorio y en el menu Inicio
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\acceso-directo.ps1" -SiFalta

rem App: servidor sin consola y ventana propia (se abre cuando el servidor ya escucha)
wscript //nologo "%~dp0tools\app.vbs"
exit /b

:consola
set SFL_OPEN_BROWSER=app
node tools/run.js
echo.
echo   El dashboard se ha cerrado. Si arriba sale un error, copialo para pedir ayuda.
pause
exit /b

:nonode
echo.
echo   Falta Node.js: instala la version LTS desde https://nodejs.org
echo   y despues vuelve a abrir start.bat.
echo.
start "" https://nodejs.org/
pause
exit /b 1

:oldnode
echo.
echo   Tu Node.js es demasiado antiguo: hace falta la version 18 o mas nueva.
echo   Instala la version LTS desde https://nodejs.org y vuelve a abrir start.bat.
echo.
start "" https://nodejs.org/
pause
exit /b 1
