// Arranca el servidor y lo vuelve a arrancar si sale pidiendo reinicio (código 42: tras instalar una actualización desde
// Ajustes). Es lo que usan npm start, start.bat, start.command y la app (tools/app.vbs).
// SFL_LOG_FILE: sin consola (modo app), lo que escribe el servidor va a ese archivo (se vacía si pasa de 1 MB).
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const RESTART_CODE = 42;
function output() {
  const file = process.env.SFL_LOG_FILE;
  if (!file) return "inherit";
  try {
    if (fs.existsSync(file) && fs.statSync(file).size > 1_000_000) fs.writeFileSync(file, "");
    const fd = fs.openSync(file, "a");
    fs.writeSync(fd, `\n── ${new Date().toISOString()} ──\n`);
    return ["ignore", fd, fd];
  } catch { return "ignore"; }
}
function start() {
  const child = spawn(process.execPath, [path.join(__dirname, "..", "server.js"), ...process.argv.slice(2)], { stdio: output() });
  child.on("exit", (code, signal) => {
    // Tras una actualización no se vuelve a abrir otra ventana (la que había se recarga sola)
    if (code === RESTART_CODE) { console.log("  Reiniciando con la versión nueva…\n"); delete process.env.SFL_OPEN_BROWSER; return start(); }
    process.exit(code ?? (signal ? 1 : 0));
  });
  for (const s of ["SIGINT", "SIGTERM"]) process.once(s, () => child.kill(s));
}
start();
