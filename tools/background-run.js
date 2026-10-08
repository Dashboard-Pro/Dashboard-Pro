// Pasada de fondo con el dashboard cerrado (la lanza la tarea programada "SFL Dashboard - en segundo plano", ver
// tools/install-background-task.ps1): guarda tus operaciones del mercado y la foto de precios del día, procesa el
// volcado nocturno si hay uno nuevo y sincroniza data/. Si el dashboard está abierto, no hace nada.
//   node tools/background-run.js [--log <archivo>]
"use strict";
const fs = require("node:fs");
const logArg = process.argv.indexOf("--log");
const LOG_FILE = logArg > 0 ? process.argv[logArg + 1] : null;
if (LOG_FILE) {
  // El registro no crece sin fin: se vacía al pasar de 1 MB
  try { if (fs.statSync(LOG_FILE).size > 1_000_000) fs.writeFileSync(LOG_FILE, ""); } catch { /* aún no existe */ }
  const write = (args) => { try { fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${args.map(String).join(" ").trim()}\n`); } catch { /* sin registro */ } };
  for (const k of ["log", "warn", "error"]) { const orig = console[k]; console[k] = (...a) => { write(a); orig(...a); }; }
}
process.env.SFL_BACKGROUND = "1";
delete process.env.SFL_OPEN_BROWSER;
delete process.env.SFL_APP;
process.env.SFL_GAMEDATA_AUTO ??= "0";
require("../server.js");
