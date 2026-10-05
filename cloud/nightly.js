// Volcado nocturno de todas las granjas (Community API, type=nightlyDump) → resumen diario pequeño en data/.
//
// Cómo funciona: la API (con key, por la cola) solo da el índice de archivos; el archivo de cada día
// (~800 MB .jsonl.gz con las granjas activas en los últimos 90 días) se baja del CDN del juego SIN key y sin
// límite, y se procesa en streaming línea a línea (memoria plana, ~1 min). No se guarda el volcado: solo
// `data/dump/AAAA-MM-DD.json` (percentiles, tu posición, suministro de items, boosts más usados por isla y
// nivel), que viaja por GitHub como el resto de data/.
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const readline = require("node:readline");
const { Readable } = require("node:stream");

const CDN = process.env.SFL_DUMP_CDN || "https://community.sunflower-land.com";
const Q = 100; // percentiles guardados por métrica (0…100)
const BANDS = [0, 20, 40, 60, 80, 100, 125, 150]; // tramos de nivel para "jugadores como tú"
const MIN_SHARE = 0.03; // boosts con menos de un 3% de dueños en un grupo no se guardan

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const alive = (o) => Object.values(o || {}).filter((x) => x && !x.removedAt).length;
// Las colmenas guardan un removedAt antiguo aunque sigan colocadas: cuentan las que tienen posición
const placed = (o) => Object.values(o || {}).filter((x) => x && Number.isFinite(x.x)).length;
// Mejoras de nodos y edificios con boost (no son NFT colocables pero sí cuentan como boost que se tiene)
const UPGRADES = new Set(["Toolshed", "Warehouse", "Ancient Tree", "Sacred Tree", "Fused Stone Rock", "Reinforced Stone Rock",
  "Refined Iron Rock", "Tempered Iron Rock", "Pure Gold Rock", "Prime Gold Rock"]);
const band = (lvl) => BANDS.filter((b) => lvl >= b).pop();

function loadGame(publicDir) {
  const txt = fs.readFileSync(path.join(publicDir, "gamedata.js"), "utf8");
  return JSON.parse(txt.slice(txt.indexOf("{"), txt.lastIndexOf("}") + 1));
}
function levelOf(xp, L) {
  let lvl = 1;
  for (const k of Object.keys(L).map(Number).sort((a, b) => a - b)) { if (xp >= L[k]) lvl = k; else break; }
  return lvl;
}

// Métricas de una granja. Mismas definiciones para todas: tu fila sale del mismo volcado.
const METRICS = {
  level: "Nivel", flower: "FLOWER", coins: "Coins", gems: "Gemas", worth: "Patrimonio (FLOWER)",
  expansions: "Expansiones", skills: "Skills", plots: "Parcelas", trees: "Árboles", stones: "Piedras",
  iron: "Hierro", gold: "Oro", crimstones: "Crimstone", oil: "Oil", fruitPatches: "Frutales",
  flowerBeds: "Macizos", beehives: "Colmenas", nfts: "NFTs",
};
// Orden de las islas para la carrera de expansiones (las de ascensión van después de las normales)
const ISLE_RANK = { basic: 0, spring: 1, desert: 2, volcano: 3, swamp: 4, spooky: 5, crystal: 6, galaxy: 7, marble: 8 };
function metricsOf(f, ctx) {
  const inv = f.inventory || {}, wr = f.wardrobe || {};
  let worth = num(f.balance), nfts = 0;
  for (const [name, q] of Object.entries(inv)) {
    const p = ctx.price[name];
    if (p) worth += p * num(q);
    if (ctx.nftSet.has(name) && num(q) > 0) nfts++;
  }
  for (const [name, q] of Object.entries(wr)) {
    const p = ctx.wearPrice[name];
    if (p) worth += p * num(q);
    if (num(q) > 0) nfts++;
  }
  // Pets NFT: por su grupo de boost (la misma regla que la página NFTs), nunca por su propio listado, que solo
  // es lo que pide el dueño. Buds: al floor de la colección.
  for (const p of Object.values(f.pets?.nfts || {})) {
    const t = p?.traits || {}, own = ctx.petOwn[p?.id];
    // Un grupo formado solo por este pet (su propio listado) no vale como referencia: se pasa al siguiente
    const val = (sid) => {
      const v = ctx.petGroup[sid];
      if (v == null) return null;
      const n = ctx.petGroupN[sid] ?? (own != null && v === own ? 1 : 2);
      return own != null && n <= 1 ? null : v;
    };
    worth += val(`${t.type}|${t.aura}|${t.bib}`) ?? val(`*|${t.aura}|${t.bib}`) ?? val(`${t.type}|${t.aura}`) ?? val(t.type) ?? ctx.petFloor ?? 0;
    nfts++;
  }
  for (const b of Object.values(f.buds || {})) { if (b) { worth += ctx.budFloor || 0; nfts++; } }
  return {
    level: levelOf(num(f.bumpkin?.experience), ctx.G.levelExperience || {}),
    flower: num(f.balance), coins: num(f.coins), gems: num(inv.Gem), worth,
    expansions: num(inv["Basic Land"]), skills: Object.keys(f.bumpkin?.skills || {}).length,
    plots: alive(f.crops), trees: alive(f.trees), stones: alive(f.stones), iron: alive(f.iron), gold: alive(f.gold),
    crimstones: alive(f.crimstones), oil: alive(f.oilReserves), fruitPatches: alive(f.fruitPatches),
    flowerBeds: alive(f.flowers?.flowerBeds), beehives: placed(f.beehives), nfts,
  };
}

function quantiles(arr) {
  if (!arr.length) return [];
  const s = Float64Array.from(arr).sort();
  return Array.from({ length: Q + 1 }, (_, i) => Number(s[Math.min(s.length - 1, Math.floor((i / Q) * (s.length - 1)))].toPrecision(6)));
}
// % de granjas con un valor estrictamente menor (y empates a la mitad): tu posición
function percentileOf(arr, v) {
  let lo = 0, eq = 0;
  for (const x of arr) { if (x < v) lo++; else if (x === v) eq++; }
  return arr.length ? ((lo + eq / 2) / arr.length) * 100 : null;
}

function createNightly({ dataDir, publicDir, fetchData, getConfig, log = () => {} }) {
  const dir = path.join(dataDir, "dump");
  const state = { running: false, phase: null, lastError: null, lastRunAt: null, progress: null };

  const files = () => { try { return fs.readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort(); } catch { return []; } };
  const read = (date) => { try { return JSON.parse(fs.readFileSync(path.join(dir, `${date}.json`), "utf8")); } catch { return null; } };

  // Precio por nombre con el último día del archivo de precios (floor), para el patrimonio
  function prices(G) {
    const out = { price: {}, wearPrice: {}, petGroup: {}, petGroupN: {}, petOwn: {}, petFloor: null, budFloor: null };
    const months = (() => { try { return fs.readdirSync(dataDir).filter((f) => /^prices-\d{4}-\d{2}\.json$/.test(f)).sort(); } catch { return []; } })();
    if (!months.length) return out;
    let m;
    try { m = JSON.parse(fs.readFileSync(path.join(dataDir, months.pop()), "utf8")); } catch { return out; }
    const day = m[Object.keys(m).sort().pop()] || {};
    for (const [n, id] of Object.entries(G.itemIds || {})) if (day[`collectibles-${id}`]) out.price[n] = day[`collectibles-${id}`];
    for (const [n, id] of Object.entries(G.wearableIds || {})) if (day[`wearables-${id}`]) out.wearPrice[n] = day[`wearables-${id}`];
    for (const [k, v] of Object.entries(day)) {
      if (k.startsWith("_pet-")) out.petGroup[k.slice(5)] = v;
      else if (k.startsWith("_petn-")) out.petGroupN[k.slice(6)] = v;
      else if (k.startsWith("pets-")) out.petOwn[k.slice(5)] = v;
    }
    out.petFloor = day["_col-pets"] || null;
    out.budFloor = day["_col-buds"] || null;
    return out;
  }

  async function manifest() {
    const r = await fetchData("nightlyDump");
    if (r.status !== 200) throw new Error(`índice del volcado: HTTP ${r.status}`);
    const list = JSON.parse(r.body).data || [];
    return list.filter((f) => /^\d{4}-\d{2}-\d{2}\/active\.jsonl\.gz$/.test(f.filename)).sort((a, b) => a.filename.localeCompare(b.filename));
  }

  async function ingest({ force = false } = {}) {
    if (state.running) return status();
    state.running = true; state.lastError = null; state.phase = "índice"; state.progress = null;
    const t0 = Date.now();
    try {
      const list = await manifest();
      const newest = list.pop();
      if (!newest) throw new Error("todavía no hay ningún volcado publicado");
      const date = newest.filename.slice(0, 10);
      if (!force && read(date)) { state.phase = null; return status(); }

      const G = loadGame(publicDir);
      const ctx = { G, ...prices(G), nftSet: new Set(G.nftCollectibles || []) };
      const buffs = new Set(Object.keys(G.buffs || {}));
      const me = String(getConfig().farmId || "");
      // Tus amigos (data/friends.json): se guarda su fila completa, igual que la tuya
      const friendIds = new Set((() => {
        try { return Object.entries(JSON.parse(fs.readFileSync(path.join(dataDir, "friends.json"), "utf8"))).filter(([, v]) => v?.value).map(([k]) => k); } catch { return []; }
      })());
      const friends = {};
      const now = Date.now();

      const vals = Object.fromEntries(Object.keys(METRICS).map((k) => [k, []]));
      const groups = {}; // "isla|tramo" → { n, vals, boosts }
      const items = {}, wearables = {};
      const islands = {}, factions = {};
      let farms = 0, skipped = 0, vip = 0, active1 = 0, active7 = 0, mine = null;
      // Carrera de expansiones: isla (por orden, ascendidas después) y parcelas; se guardan las 100 primeras y tu puesto
      const raceScores = [], race = [];
      const streaks = { active: 0, 7: 0, 14: 0, 30: 0, 60: 0, 100: 0 }, ascension = {};

      state.phase = "descargando";
      // Sin cabeceras: el CDN es público y la key nunca sale de la API oficial
      const res = await fetch(`${CDN}/${newest.filename}`, { signal: AbortSignal.timeout(30 * 60_000) });
      if (!res.ok || !res.body) throw new Error(`descarga del volcado: HTTP ${res.status}`);
      const total = Number(res.headers.get("content-length")) || newest.size || 0;
      let got = 0;
      const src = Readable.fromWeb(res.body);
      src.on("data", (c) => { got += c.length; state.progress = total ? got / total : null; });
      const rl = readline.createInterface({ input: src.pipe(zlib.createGunzip()), crlfDelay: Infinity });
      for await (const line of rl) {
        if (!line) continue;
        let o;
        try { o = JSON.parse(line); } catch { skipped++; continue; }
        if (o.isBlacklisted || !o.farm) { skipped++; continue; }
        const f = o.farm, m = metricsOf(f, ctx);
        farms++;
        for (const k in vals) vals[k].push(m[k]);
        const isl = f.island?.type || "basic", fac = f.faction?.name || "ninguna";
        islands[isl] = (islands[isl] || 0) + 1;
        factions[fac] = (factions[fac] || 0) + 1;
        if (num(f.vip?.expiresAt) > now) vip++;
        const la = num(o.lastActivity);
        if (now - la < 86400_000) active1++;
        if (now - la < 7 * 86400_000) active7++;

        const asc = num(f.island?.ascensionLevel), score = (ISLE_RANK[isl] ?? 0) * 1000 + num(f.inventory?.["Basic Land"]);
        raceScores.push(score);
        if (race.length < 100 || score > race[race.length - 1].score) {
          const bc = f.expansionConstruction;
          race.push({ score, id: o.id, nftId: o.nftId, username: f.username || null, island: isl, asc, lands: num(f.inventory?.["Basic Land"]),
            build: bc?.readyAt ? { from: num(bc.createdAt), to: num(bc.readyAt) } : null, equipped: f.bumpkin?.equipped || null });
          race.sort((a, b) => b.score - a.score || (a.build?.to ?? Infinity) - (b.build?.to ?? Infinity));
          if (race.length > 100) race.pop();
        }
        if (asc) ascension[asc] = (ascension[asc] || 0) + 1;
        const st = num(f.desert?.digging?.streak?.count);
        if (st > 0) { streaks.active++; for (const b of [7, 14, 30, 60, 100]) if (st >= b) streaks[b]++; }

        // Suministro: unidades totales y cuántas granjas tienen cada item
        const owned = new Set();
        for (const [n, q] of Object.entries(f.inventory || {})) {
          const v = num(q);
          if (v <= 0) continue;
          const it = (items[n] ||= [0, 0]); it[0] += v; it[1]++;
          if (buffs.has(n) && (ctx.nftSet.has(n) || UPGRADES.has(n))) owned.add(n); // no cultivos ni consumibles
        }
        for (const [n, q] of Object.entries(f.wardrobe || {})) {
          const v = num(q);
          if (v <= 0) continue;
          const it = (wearables[n] ||= [0, 0]); it[0] += v; it[1]++;
          if (buffs.has(n)) owned.add(n);
        }
        const key = `${isl}|${band(m.level)}`;
        const g = (groups[key] ||= { n: 0, vals: Object.fromEntries(Object.keys(METRICS).map((k) => [k, []])), boosts: {} });
        g.n++;
        for (const k in g.vals) g.vals[k].push(m[k]);
        for (const n of owned) g.boosts[n] = (g.boosts[n] || 0) + 1;

        const isMe = me && (String(o.id) === me || String(o.nftId) === me);
        const fid = friendIds.has(String(o.id)) ? String(o.id) : friendIds.has(String(o.nftId)) ? String(o.nftId) : null;
        if (isMe || fid) {
          const row = { id: o.id, nftId: o.nftId, island: isl, band: band(m.level), metrics: m, boosts: [...owned],
            username: f.username || null, equipped: f.bumpkin?.equipped || null, faction: f.faction?.name || null,
            vip: num(f.vip?.expiresAt) > now, lastActivity: la || null };
          if (isMe) mine = row;
          if (fid) friends[fid] = row;
        }
      }
      if (!farms) throw new Error("el volcado no trae granjas");

      state.phase = "resumiendo";
      // Posición de una granja entre todas y dentro de su grupo (isla + tramo de nivel)
      const ranked = (row) => {
        const g = groups[`${row.island}|${row.band}`];
        const pos = (all) => Object.fromEntries(Object.entries(all).map(([k, a]) => [k, Number(percentileOf(a, row.metrics[k]).toFixed(2))]));
        return { ...row, pct: pos(vals), groupPct: pos(g.vals) };
      };
      const out = {
        date, file: newest.filename, generatedAt: Date.now(), secs: Math.round((Date.now() - t0) / 1000),
        farms, skipped, vip, active1, active7, islands, factions, metricNames: METRICS,
        metrics: Object.fromEntries(Object.entries(vals).map(([k, a]) => [k, quantiles(a)])),
        groups: Object.fromEntries(Object.entries(groups).map(([k, g]) => [k, {
          n: g.n,
          median: Object.fromEntries(Object.entries(g.vals).map(([m, a]) => [m, quantiles(a)[Q / 2] ?? 0])),
          p90: Object.fromEntries(Object.entries(g.vals).map(([m, a]) => [m, quantiles(a)[Q * 0.9] ?? 0])),
          boosts: Object.fromEntries(Object.entries(g.boosts).filter(([, c]) => c / g.n >= MIN_SHARE).sort((a, b) => b[1] - a[1]).slice(0, 80)),
        }])),
        items, wearables, streaks, ascension,
        race: race.map(({ score, ...r }) => r),
        raceMine: mine ? (() => { const sc = (ISLE_RANK[mine.island] ?? 0) * 1000 + mine.metrics.expansions; return { rank: raceScores.filter((x) => x > sc).length + 1, score: sc }; })() : null,
        me: mine && ranked(mine),
        friends: Object.fromEntries(Object.entries(friends).map(([k, row]) => [k, ranked(row)])),
      };
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, `${date}.json`), JSON.stringify(out));
      // Se guardan 60 días de resúmenes (~150 KB cada uno)
      for (const old of files().slice(0, -60)) fs.rmSync(path.join(dir, old), { force: true });
      state.lastRunAt = Date.now();
      log(`  Volcado nocturno ${date}: ${farms} granjas en ${out.secs} s`);
      return status();
    } catch (e) {
      state.lastError = { at: Date.now(), message: e.message };
      log(`  Volcado nocturno: ${e.message}`);
      return status();
    } finally {
      state.running = false; state.phase = null; state.progress = null;
    }
  }

  function status() {
    const list = files();
    return { ...state, enabled: Boolean(getConfig().nightlyDump), dates: list.map((f) => f.slice(0, 10)) };
  }
  // Resumen de un día (el último si no se pide) y el anterior, para ver cambios de suministro
  function summary(date) {
    const list = files().map((f) => f.slice(0, 10));
    const d = date && list.includes(date) ? date : list[list.length - 1];
    if (!d) return null;
    const cur = read(d), i = list.indexOf(d);
    const prev = i > 0 ? read(list[i - 1]) : null;
    return { ...cur, prev: prev ? { date: prev.date, farms: prev.farms, items: prev.items, wearables: prev.wearables } : null };
  }

  // Evolución día a día (de los resúmenes guardados) de tu granja y de tus amigos → { id: [{ date, …métricas }] }
  const HIST_KEYS = ["level", "worth", "flower", "expansions", "nfts", "skills"];
  function history(ids = []) {
    const want = new Set(ids.map(String));
    const out = { me: [] };
    for (const f of files()) {
      const d = read(f.slice(0, 10));
      if (!d) continue;
      const pick = (row) => ({ date: d.date, ...Object.fromEntries(HIST_KEYS.map((k) => [k, row.metrics[k]])), pctWorth: row.pct?.worth ?? null, pctLevel: row.pct?.level ?? null });
      if (d.me) out.me.push(pick(d.me));
      for (const [id, row] of Object.entries(d.friends || {})) if (!want.size || want.has(id)) (out[id] ||= []).push(pick(row));
    }
    return out;
  }
  // Métricas de una granja ahora mismo (misma definición que el volcado), para "ver en directo" a un amigo
  function liveMetrics(farm) {
    const G = loadGame(publicDir);
    return metricsOf(farm, { G, ...prices(G), nftSet: new Set(G.nftCollectibles || []) });
  }

  return { ingest, status, summary, history, liveMetrics };
}

module.exports = { createNightly, metricsOf, METRICS };
