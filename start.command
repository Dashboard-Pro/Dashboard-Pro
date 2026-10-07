#!/bin/bash
# macOS: doble clic para arrancar el dashboard (equivalente a start.bat)
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo ""
  echo "  Falta Node.js: instala la versión LTS desde https://nodejs.org y vuelve a abrir start.command."
  open https://nodejs.org/
  read -r -p "  Pulsa Intro para cerrar…"
  exit 1
fi
if ! node -e "process.exit(Number(process.versions.node.split('.')[0]) < 18 ? 1 : 0)"; then
  echo ""
  echo "  Tu Node.js es demasiado antiguo (hace falta la 18 o más nueva): instala la LTS desde https://nodejs.org."
  open https://nodejs.org/
  read -r -p "  Pulsa Intro para cerrar…"
  exit 1
fi
# El servidor abre el navegador cuando ya está escuchando
SFL_OPEN_BROWSER=1 node tools/run.js
