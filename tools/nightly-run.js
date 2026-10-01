// Procesa el volcado nocturno aunque el dashboard esté cerrado (lo lanza una tarea programada; ver
// tools/install-nightly-task.ps1). Si el dashboard está abierto, se lo pide a él y no descarga nada aquí.
//   node tools/nightly-run.js
// Solo actúa si en config.json está activado "Procesar el volcado cada noche" (config.nightlyDump).
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const CONFIG_FILE = process.env.SFL_CONFIG || path.join(ROOT, "config.json");
const DATA_DIR = process.env.SFL_DATA_DIR || path.join(ROOT, "data");
const UPSTREAM = process.env.SFL_UPSTREAM || "https://api.sunflower-land.com/community";
// Registro: pantalla y, si se pasa --log <archivo> (la tarea programada), también a ese archivo
const logArg = process.argv.indexOf("--log");
const LOG_FILE = logArg > 0 ? process.argv[logArg + 1] : null;
const log = (m) => {
  const line = `[${new Date().toISOString()}] ${m}`;
  console.log(line);
  if (LOG_FILE) try { fs.appendFileSync(LOG_FILE, line + "\n"); } catch { /* sin registro */ }
};

async function main() {
  let config;
  try { config = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8")); } catch { return log("sin config.json: nada que hacer"); }
  if (!config.nightlyDump) return log("el volcado nocturno está desactivado en Ajustes");
  if (!config.apiKey) return log("falta la API key");
  const port = config.port || 4173;

  // 1. ¿Dashboard abierto? Que lo haga él (tiene su cola, su caché y su sincronización)
  try {
    const r = await fetch(`http://127.0.0.1:${port}/api/dump`, { method: "POST", headers: { "content-type": "application/json" }, body: '{"enabled":true}', signal: AbortSignal.timeout(5000) });
    if (r.ok) return log("el dashboard está abierto: lo procesa él");
  } catch { /* cerrado: seguimos aquí */ }

  // 2. Cerrado: una sola consulta al índice con la key; el archivo se baja del CDN sin key
  const fetchData = async (type) => {
    const r = await fetch(`${UPSTREAM}/data?type=${encodeURIComponent(type)}`, { headers: { "x-api-key": config.apiKey }, signal: AbortSignal.timeout(60_000) });
    return { status: r.status, body: await r.text() };
  };
  const nightly = require("../cloud/nightly").createNightly({
    dataDir: DATA_DIR, publicDir: path.join(ROOT, "public"), fetchData, getConfig: () => config, log,
  });
  const st = await nightly.ingest();
  if (st.lastError) { log(`error: ${st.lastError.message}`); process.exitCode = 1; return; }
  log(`resúmenes guardados: ${st.dates.join(", ")}`);

  // 3. Subirlo a GitHub para el otro ordenador (si esta carpeta es el repositorio y no está apagado)
  if (config.gitSync === false) return;
  const git = require("../cloud/gitsync").createGitSync({ repoDir: ROOT, dataDir: DATA_DIR, log });
  if (await git.check()) {
    await git.sync({ force: true });
    if (git.state.lastError) log(`GitHub: ${git.state.lastError.message}`);
  }
}

main().catch((e) => { log(`error: ${e.message}`); process.exitCode = 1; });
