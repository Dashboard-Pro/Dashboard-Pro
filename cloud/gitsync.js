// Sincronización automática de data/ entre ordenadores a través del repositorio de GitHub.
// Pensada para quien usa la app en varios sitios (p. ej. Windows en casa y Mac fuera) sin montar la nube.
//
// Cada pasada:
//   1. guarda en un commit solo los cambios de data/ (nunca código a medias),
//   2. trae lo del otro ordenador (git fetch),
//   3. mezcla cada archivo de data/ con la misma lógica sin conflictos que la nube (merge.js): costes por hora,
//      operaciones por id, precios por día. No se pierde nada aunque los dos ordenadores estén encendidos,
//   4. integra origin (si choca código, no fuerza nada: aborta y avisa) y sube (git push).
// Usa el git y las credenciales del sistema (gh auth login). La key (config.json) está en .gitignore.
const { execFile } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { mergeDoc } = require("./merge");

function createGitSync({ repoDir, dataDir, log = () => {}, pricesEveryMs = 6 * 3600_000 }) {
  const state = { enabled: false, running: false, lastSync: null, lastError: null, lastResult: null, available: null, lastPricesAt: 0 };
  const rel = path.relative(repoDir, dataDir).split(path.sep).join("/") || "data";
  const inside = !rel.startsWith("..") && !path.isAbsolute(rel);

  const git = (args, opts = {}) => new Promise((resolve, reject) => {
    execFile("git", args, { cwd: repoDir, timeout: 60_000, maxBuffer: 50 * 1024 * 1024, windowsHide: true, ...opts }, (err, stdout, stderr) => {
      if (err) return reject(Object.assign(new Error((stderr || err.message).trim().split("\n").slice(-3).join(" ")), { stdout }));
      resolve(stdout);
    });
  });

  // Documento de merge.js que corresponde a cada archivo de data/
  const docOf = (file) => {
    const b = path.basename(file);
    if (b === "costs.json") return "costs";
    if (b === "friends.json") return "friends";
    const w = b.match(/^wealth-(\d+)\.json$/);
    if (w) return `wealth:${w[1]}`;
    let m = b.match(/^trades-([A-Za-z0-9]+)\.json$/);
    if (m) return `trades:${m[1]}`;
    m = b.match(/^prices-(\d{4}-\d{2})\.json$/);
    return m ? `prices:${m[1]}` : null;
  };

  async function check() {
    if (!inside) { state.available = false; state.lastError = { at: Date.now(), message: "La carpeta de datos no está dentro del repositorio" }; return false; }
    try {
      await git(["rev-parse", "--is-inside-work-tree"]);
      const remote = (await git(["remote", "get-url", "origin"])).trim();
      const branch = (await git(["rev-parse", "--abbrev-ref", "HEAD"])).trim();
      state.available = { remote, branch };
    } catch (e) {
      state.available = false;
      state.lastError = { at: Date.now(), message: "Esta carpeta no es un repositorio de git con remoto (clónala desde GitHub)" };
    }
    return state.available;
  }

  async function sync({ force = false } = {}) {
    if (state.running) return state;
    state.running = true;
    const host = os.hostname();
    let pulled = 0, pushed = false;
    try {
      if (!state.available && !(await check())) throw new Error(state.lastError.message);
      const { branch } = state.available;
      // 1. Commit solo de data/. Costes e historial siempre; el histórico de precios (cambia cada 20 min y
      //    pesa) como mucho cada pricesEveryMs para no llenar el repositorio de commits
      //    (si el otro ordenador ha subido algo, todo data/: git no integra sobre cambios sin guardar)
      await git(["fetch", "-q", "origin", branch]);
      const behind = Number((await git(["rev-list", "--count", `HEAD..origin/${branch}`])).trim());
      const withPrices = force || behind > 0 || Date.now() - state.lastPricesAt >= pricesEveryMs;
      if (withPrices) { await git(["add", "-A", "--", rel]); state.lastPricesAt = Date.now(); }
      else {
        await git(["add", "-A", "--", `${rel}/costs.json`, `:(glob)${rel}/trades-*.json`]).catch(() => {});
        await git(["add", "-A", "--", `${rel}/friends.json`]).catch(() => {});
        await git(["add", "-A", "--", `:(glob)${rel}/wealth-*.json`]).catch(() => {});
        await git(["add", "-A", "--", `:(glob)${rel}/dump/*.json`]).catch(() => {}); // resúmenes del volcado nocturno
      }
      const staged = (await git(["diff", "--cached", "--name-only", "--", rel])).trim();
      if (staged) await git(["commit", "-q", "-m", `datos (${host})`, "--", rel]);
      // 2. Lo del otro ordenador
      if (behind > 0) {
        // 3. Mezcla sin conflictos de cada archivo de data/ que haya cambiado en origin
        const changed = (await git(["diff", "--name-only", `HEAD...origin/${branch}`, "--", rel])).trim().split("\n").filter(Boolean);
        let wrote = false;
        for (const f of changed) {
          const doc = docOf(f);
          if (!doc) continue;
          let remote = null, local = null;
          try { remote = JSON.parse(await git(["show", `origin/${branch}:${f}`])); } catch { /* borrado en origin */ }
          try { local = JSON.parse(fs.readFileSync(path.join(repoDir, f), "utf8")); } catch { /* no existe aquí */ }
          if (remote == null) continue;
          const merged = local == null ? remote : mergeDoc(doc, local, remote);
          fs.mkdirSync(path.dirname(path.join(repoDir, f)), { recursive: true });
          fs.writeFileSync(path.join(repoDir, f), JSON.stringify(merged));
          wrote = true;
          pulled++;
        }
        if (wrote) {
          await git(["add", "-A", "--", rel]);
          if ((await git(["diff", "--cached", "--name-only"])).trim()) await git(["commit", "-q", "-m", `datos: mezcla con el otro ordenador (${host})`, "--", rel]);
        }
        // 4. Integrar origin: data/ ya contiene la mezcla, así que en data/ gana lo local
        try {
          await git(["merge", "-q", "--no-edit", `origin/${branch}`]);
        } catch (e) {
          const conflicts = (await git(["diff", "--name-only", "--diff-filter=U"])).trim().split("\n").filter(Boolean);
          // Sin conflictos listados = git se negó a empezar (p. ej. cambios de código sin guardar en esos archivos)
          if (!conflicts.length) throw new Error(`No se pudo traer lo del otro ordenador: ${e.message}`);
          const outside = conflicts.filter((f) => !f.startsWith(`${rel}/`));
          if (outside.length) {
            await git(["merge", "--abort"]).catch(() => {});
            throw new Error(`Hay cambios de código que chocan (${outside.join(", ")}): resuélvelo a mano con git pull`);
          }
          for (const f of conflicts) await git(["checkout", "--ours", "--", f]);
          await git(["add", "-A", "--", rel]);
          await git(["commit", "-q", "--no-edit"]);
        }
      }
      // Subir si vamos por delante
      const ahead = Number((await git(["rev-list", "--count", `origin/${branch}..HEAD`])).trim());
      if (ahead > 0) { await git(["push", "-q", "origin", branch]); pushed = true; }
      state.lastSync = Date.now();
      state.lastError = null;
      state.lastResult = { pulled, pushed, at: state.lastSync };
      if (pulled || pushed) log(`  [git] data/ sincronizado: ${pulled} archivos mezclados${pushed ? ", subido" : ""}`);
    } catch (e) {
      state.lastError = { at: Date.now(), message: e.message };
      log(`  [git] no se pudo sincronizar: ${e.message}`);
    } finally {
      state.running = false;
    }
    return state;
  }

  return { sync, check, state, status: () => ({ ...state }) };
}

module.exports = { createGitSync };
