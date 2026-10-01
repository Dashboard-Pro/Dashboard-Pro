// Cliente de sincronización de la app LOCAL con la nube. Vive en el servidor local: el token del
// dispositivo se guarda en config.json igual que la key y nunca llega al navegador. La API key del
// jugador no se envía jamás a la nube.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { isDoc, mergeDoc } = require("./merge");

function createCloudClient({ dataDir, getConfig, saveConfig, log = () => {} }) {
  const state = { syncing: false, lastError: null, lastSync: null, lastResult: null };
  const cfg = () => getConfig().cloud || null;

  async function call(method, route, body) {
    const c = cfg();
    if (!c?.url || !c?.token) throw new Error("No vinculado");
    const r = await fetch(c.url.replace(/\/+$/, "") + route, {
      method, headers: { authorization: `Bearer ${c.token}`, "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(30_000),
    });
    const json = await r.json().catch(() => ({}));
    if (r.status === 401) throw Object.assign(new Error("La nube ya no reconoce este ordenador: vuelve a vincularlo"), { status: 401 });
    if (!r.ok) throw Object.assign(new Error(json.error || `Error ${r.status}`), { status: r.status });
    return json;
  }

  async function link(url, code) {
    const base = String(url || "").trim().replace(/\/+$/, "");
    if (!/^https?:\/\/[^\s/]+/i.test(base)) throw new Error("Dirección de la nube inválida (debe empezar por https://)");
    const r = await fetch(`${base}/api/link`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: String(code || "").trim().toUpperCase(), deviceName: os.hostname() }), signal: AbortSignal.timeout(20_000),
    });
    const json = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(json.error || `La nube respondió ${r.status}`);
    saveConfig({ cloud: { url: base, token: json.token, user: json.user?.name || null, linkedAt: Date.now() } });
    return json;
  }
  function unlink() { saveConfig({ cloud: null }); state.lastSync = null; }

  // Documentos locales: costes, archivo de operaciones de cada granja y precios de cada mes
  const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return d; } };
  function localDocs() {
    const out = new Map();
    out.set("costs", path.join(dataDir, "costs.json"));
    let files = [];
    try { files = fs.readdirSync(dataDir); } catch { /* sin datos aún */ }
    for (const f of files) {
      let m = f.match(/^trades-([A-Za-z0-9]+)\.json$/);
      if (m) out.set(`trades:${m[1]}`, path.join(dataDir, f));
      m = f.match(/^prices-(\d{4}-\d{2})\.json$/);
      if (m) out.set(`prices:${m[1]}`, path.join(dataDir, f));
    }
    return out;
  }
  const fileOf = (doc) => path.join(dataDir, doc === "costs" ? "costs.json" : doc.startsWith("trades:") ? `trades-${doc.slice(7)}.json` : `prices-${doc.slice(7)}.json`);

  // Una pasada: sube lo cambiado desde la última vez, trae lo nuevo de la nube y mezcla sin perder nada
  async function sync({ full = false } = {}) {
    if (!cfg()?.token || state.syncing) return state;
    state.syncing = true;
    const since = full ? 0 : state.lastSync || 0;
    let up = 0, down = 0;
    try {
      const remote = await call("GET", "/api/sync");
      const remoteAt = new Map((remote.docs || []).map((d) => [d.doc, d.updatedAt]));
      const docs = localDocs();
      for (const d of remoteAt.keys()) if (isDoc(d) && !docs.has(d)) docs.set(d, fileOf(d));
      fs.mkdirSync(dataDir, { recursive: true });
      for (const [doc, file] of docs) {
        let mtime = 0;
        try { mtime = fs.statSync(file).mtimeMs; } catch { /* no existe en local */ }
        const localChanged = mtime > since;
        const remoteChanged = (remoteAt.get(doc) || 0) > since;
        if (!localChanged && !remoteChanged) continue;
        const local = readJson(file, null);
        const res = local != null && localChanged ? await call("PUT", `/api/sync/${encodeURIComponent(doc)}`, { body: local }) : await call("GET", `/api/sync/${encodeURIComponent(doc)}`);
        if (local != null && localChanged) up++;
        const merged = local == null ? res.body : mergeDoc(doc, local, res.body);
        if (JSON.stringify(merged) !== JSON.stringify(local)) { fs.writeFileSync(file, JSON.stringify(merged)); down++; }
      }
      state.lastSync = Date.now();
      state.lastError = null;
      state.lastResult = { up, down, at: state.lastSync };
      if (up || down) log(`  [nube] sincronizado: ${up} subidos, ${down} actualizados en local`);
    } catch (e) {
      state.lastError = { at: Date.now(), message: e.message };
    } finally {
      state.syncing = false;
    }
    return state;
  }

  // El ordenador confirma su granja con la nube (vínculo "provisional": lo verifica su propia key)
  const claimFarm = (farmId, username) => call("POST", "/api/farm/claim", { farmId: String(farmId), username }).catch(() => null);

  const status = () => {
    const c = cfg();
    return { linked: Boolean(c?.token), url: c?.url || null, user: c?.user || null, linkedAt: c?.linkedAt || null, ...state };
  };
  return { link, unlink, sync, claimFarm, status };
}

module.exports = { createCloudClient };
