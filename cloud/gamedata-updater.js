// Datos del juego (public/gamedata.js) al día sin hacer nada: si faltan o tienen más de 7 días, se regeneran
// desde el repositorio oficial del juego en segundo plano. Se generan en un archivo aparte y solo sustituyen
// al actual si pasan una comprobación (que no falte nada ni haya encogido): un cambio del juego que rompa la
// extracción nunca deja el dashboard sin datos. gamedata.js no va al repositorio: cada ordenador tiene el suyo.
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const MAX_AGE_MS = 7 * 86400_000;
const REQUIRED = ["crops", "itemIds", "wearableIds", "skills", "chores", "foods", "recipes", "buffs", "expansions", "flowerSeedOf", "itemImages", "levelExperience",
  // Páginas nuevas (excavación, producción, simulador, animales, mapa, referencia): un archivo sin ellas se regenera ya
  "diggingFormations", "seedPrices", "boostFx", "animals", "itemDims", "chests", "fishing",
  // Capítulo y facción (tienda de Stella, pase, colección, tienda de Eldric)
  "megastore", "chapterTracks", "factionShop",
  // Guías del juego (retiro, edificios, tiendas, forja solar, entregas de NPCs)
  "releases", "buildings", "buildingUpgrades", "floatingShop", "nodePrices", "npcDeliveryLevels", "expansionNodes", "npcGifts", "mapPieces"];
const MIN = { itemIds: 1000, wearableIds: 400, crops: 10, skills: 50, foods: 40, recipes: 50, buffs: 200, flowerSeedOf: 40, itemImages: 1000 };

const parse = (file) => {
  const txt = fs.readFileSync(file, "utf8");
  return JSON.parse(txt.slice(txt.indexOf("{"), txt.lastIndexOf("}") + 1));
};
const size = (v) => (Array.isArray(v) ? v.length : v && typeof v === "object" ? Object.keys(v).length : 0);

// ¿Es aceptable el archivo nuevo? Devuelve el motivo si no lo es
function problemWith(next, prev) {
  for (const k of REQUIRED) if (!size(next[k])) return `falta ${k}`;
  for (const [k, n] of Object.entries(MIN)) if (size(next[k]) < n) return `${k}: solo ${size(next[k])}`;
  if (prev) for (const k of Object.keys(MIN)) if (size(next[k]) < size(prev[k]) * 0.9) return `${k} ha encogido (${size(prev[k])} → ${size(next[k])})`;
  return null;
}

function createGameDataUpdater({ root, log = () => {} }) {
  const file = path.join(root, "public", "gamedata.js");
  const state = { running: false, lastCheck: null, lastUpdate: null, lastError: null };
  const generatedAt = () => { try { return Date.parse(parse(file).generatedAt) || null; } catch { return null; } };

  function run(out) {
    return new Promise((resolve, reject) => {
      const p = spawn(process.execPath, [path.join(root, "tools", "extract-gamedata.mjs"), "--online", "--out", out], { cwd: root, stdio: ["ignore", "ignore", "pipe"] });
      let err = "";
      p.stderr.on("data", (c) => (err += c));
      const kill = setTimeout(() => p.kill(), 5 * 60_000);
      p.on("close", (code) => { clearTimeout(kill); code === 0 ? resolve() : reject(new Error(err.trim().split("\n").pop() || `código ${code}`)); });
    });
  }

  async function update({ force = false } = {}) {
    if (state.running) return status();
    const at = generatedAt();
    state.lastCheck = Date.now();
    // Reciente pero de una versión anterior del extractor (le faltan datos que usan las páginas nuevas): se regenera
    let outdated = false;
    try { const cur = parse(file); outdated = REQUIRED.some((k) => !size(cur[k])); } catch { /* no hay archivo */ }
    if (!force && at && !outdated && Date.now() - at < MAX_AGE_MS) return status();
    state.running = true;
    const tmp = path.join(root, "public", `.gamedata-${process.pid}.js`);
    try {
      log(`  Datos del juego: ${at ? "actualizando" : "descargando"} desde el repositorio oficial…`);
      await run(tmp);
      let prev = null;
      try { prev = parse(file); } catch { /* no había */ }
      const why = problemWith(parse(tmp), prev);
      if (why) throw new Error(`el resultado no es fiable (${why}); se mantienen los datos actuales`);
      fs.renameSync(tmp, file);
      state.lastUpdate = Date.now();
      state.lastError = null;
      log("  Datos del juego actualizados");
    } catch (e) {
      state.lastError = { at: Date.now(), message: e.message };
      log(`  Datos del juego: ${e.message}`);
    } finally {
      fs.rmSync(tmp, { force: true });
      state.running = false;
    }
    return status();
  }
  // Si falta el archivo (clon nuevo, o git lo acaba de quitar al dejar de subirse), se genera ya
  const ensure = () => (fs.existsSync(file) ? Promise.resolve(status()) : update({ force: true }));
  const status = () => ({ ...state, generatedAt: generatedAt() });

  return { update, ensure, status };
}

module.exports = { createGameDataUpdater, problemWith };
