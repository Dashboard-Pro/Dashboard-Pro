@echo off
cd /d "%~dp0"
title SFL Dashboard

rem Sin Node.js el servidor no arranca y el navegador solo muestra "no hay conexion": se avisa antes
where node >nul 2>nul
if errorlevel 1 goto nonode
node -e "process.exit(Number(process.versions.node.split('.')[0]) < 18 ? 1 : 0)"
if errorlevel 1 goto oldnode

rem El servidor abre el navegador cuando ya esta escuchando (antes se abria antes de tiempo)
set SFL_OPEN_BROWSER=1
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
