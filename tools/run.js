// Arranca el servidor y lo vuelve a arrancar si sale pidiendo reinicio (código 42: tras instalar una actualización desde
// Ajustes). Es lo que usan npm start, start.bat y start.command.
const { spawn } = require("node:child_process");
const path = require("node:path");

const RESTART_CODE = 42;
function start() {
  const child = spawn(process.execPath, [path.join(__dirname, "..", "server.js"), ...process.argv.slice(2)], { stdio: "inherit" });
  child.on("exit", (code, signal) => {
    // Tras una actualización no se vuelve a abrir otra pestaña (la que había se recarga sola)
    if (code === RESTART_CODE) { console.log("  Reiniciando con la versión nueva…\n"); delete process.env.SFL_OPEN_BROWSER; return start(); }
    process.exit(code ?? (signal ? 1 : 0));
  });
  for (const s of ["SIGINT", "SIGTERM"]) process.once(s, () => child.kill(s));
}
start();
