// Actualizaciones de la copia pública (github.com/Dashboard-Pro/Dashboard-Pro): compara el version.json de esta carpeta con
// el de GitHub y, si hay una versión nueva, la baja y el servidor se reinicia (tools/run.js lo vuelve a arrancar).
//   · Si la carpeta es un clon de git de ese repo: git pull --ff-only.
//   · Si se descargó como .zip (sin git): baja el .tar.gz de GitHub y sustituye los archivos del programa.
// Nunca toca config.json (tu key) ni data/ (tu historial). En una carpeta de desarrollo (sin version.json, o un clon de otro
// repo) no hace nada: ahí manda git.
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const { execFile } = require("node:child_process");

const KEEP = /^(config\.json$|data\/|\.git\/|node_modules\/|\.gamesrc\/|public\/gamedata\.js$|public\/\.gamedata-)/;

// Lee un .tar (sin comprimir) → [{ name, body }] de los archivos normales (los de GitHub traen cabeceras pax)
function untar(buf) {
  const out = [];
  let off = 0, nextName = null;
  const str = (a, b) => buf.toString("utf8", a, b).replace(/\0.*$/s, "");
  while (off + 512 <= buf.length) {
    if (buf.subarray(off, off + 512).every((x) => x === 0)) break;
    const size = parseInt(str(off + 124, off + 136).trim() || "0", 8);
    const type = String.fromCharCode(buf[off + 156] || 48);
    const prefix = str(off + 345, off + 500);
    let name = (prefix ? `${prefix}/` : "") + str(off, off + 100);
    const body = buf.subarray(off + 512, off + 512 + size);
    if (type === "x") {
      const m = body.toString("utf8").match(/\d+ path=([^\n]*)\n/);
      if (m) nextName = m[1];
    } else if (type === "0" || type === "\0") {
      if (nextName) name = nextName;
      out.push({ name, body: Buffer.from(body) });
      nextName = null;
    } else if (type !== "g") nextName = null;
    off += 512 + Math.ceil(size / 512) * 512;
  }
  return out;
}

function createUpdater({ root, repo = "Dashboard-Pro/Dashboard-Pro", fetchImpl = fetch,
  rawBase = process.env.UPDATE_RAW || `https://raw.githubusercontent.com/${repo}/main`,
  tarUrl = process.env.UPDATE_TAR || `https://codeload.github.com/${repo}/tar.gz/refs/heads/main` } = {}) {
  const state = { remote: null, checkedAt: 0, error: null, busy: false };
  const readLocal = () => { try { return JSON.parse(fs.readFileSync(path.join(root, "version.json"), "utf8")); } catch { return null; } };
  const git = (args) => new Promise((resolve, reject) => execFile("git", args, { cwd: root, timeout: 120_000 }, (e, so, se) => (e ? reject(new Error((se || e.message).trim())) : resolve(so.trim()))));

  async function method() {
    if (!fs.existsSync(path.join(root, ".git"))) return "zip";
    try { return (await git(["remote", "get-url", "origin"])).toLowerCase().includes(repo.toLowerCase()) ? "git" : null; } catch { return null; }
  }
  async function info() {
    const local = readLocal(), m = local ? await method() : null;
    const available = Boolean(local && m && state.remote && state.remote.sha !== local.sha && (state.remote.date || "") >= (local.date || ""));
    return { enabled: Boolean(local && m), local, remote: state.remote, available, method: m, busy: state.busy, error: state.error, checkedAt: state.checkedAt };
  }
  async function check(force = false) {
    if (!readLocal()) return info();
    if (force || Date.now() - state.checkedAt > 3600_000) {
      try {
        const r = await fetchImpl(`${rawBase}/version.json?t=${Date.now()}`, { headers: { "user-agent": "SFL-Dashboard (updater)" }, signal: AbortSignal.timeout(15_000) });
        if (!r.ok) throw new Error(`GitHub respondió ${r.status}`);
        state.remote = await r.json();
        state.error = null;
      } catch (e) { state.error = e.message; }
      state.checkedAt = Date.now();
    }
    return info();
  }
  // Escribe los archivos del paquete (quitando la carpeta raíz "Repo-main/"), sin salirse de la carpeta ni tocar lo tuyo
  function install(entries) {
    let written = 0;
    for (const e of entries) {
      const rel = e.name.split("/").slice(1).join("/");
      if (!rel || rel.endsWith("/") || KEEP.test(rel) || rel.split("/").includes("..") || path.isAbsolute(rel)) continue;
      const out = path.join(root, rel);
      if (!out.startsWith(path.resolve(root) + path.sep)) continue;
      try { if (fs.readFileSync(out).equals(e.body)) continue; } catch { /* archivo nuevo */ }
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, e.body);
      written++;
    }
    return written;
  }
  async function apply() {
    const i = await check(true);
    if (!i.enabled) throw new Error("Esta copia no se actualiza sola (carpeta de desarrollo)");
    if (state.busy) throw new Error("Ya se está actualizando");
    state.busy = true;
    try {
      if (i.method === "git") {
        await git(["pull", "--ff-only"]);
        return { method: "git" };
      }
      const r = await fetchImpl(tarUrl, { headers: { "user-agent": "SFL-Dashboard (updater)" }, signal: AbortSignal.timeout(120_000) });
      if (!r.ok) throw new Error(`No se pudo descargar la versión nueva (${r.status})`);
      const entries = untar(zlib.gunzipSync(Buffer.from(await r.arrayBuffer())));
      if (!entries.some((e) => /\/server\.js$/.test(e.name))) throw new Error("El paquete descargado no parece el dashboard");
      return { method: "zip", files: install(entries) };
    } finally { state.busy = false; }
  }
  return { state, check, info, apply };
}

module.exports = { createUpdater, untar };
