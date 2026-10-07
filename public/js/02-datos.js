// SFL Console — API y almacén con caché (LOADERS), modelo de la granja (temporizadores y nodos).
// Scripts clásicos que comparten el ámbito global en el orden de index.html (antes, un solo app.js).
"use strict";

/* ════════════════════════════════════════════════════════════════════════
   4. API y almacén de datos con caché
   ════════════════════════════════════════════════════════════════════════ */
async function api(path) {
  setBusy(+1);
  try {
    const r = await fetch(path);
    const off = r.headers.get("x-server-offset");
    if (off != null) S.clockOffset = Number(off) || 0;
    // Antigüedad real del dato: si la API falla, el proxy sirve su última copia buena (x-cache: stale)
    if (r.ok && r.headers.get("x-fetched-at")) FETCHED.set(path, { at: Number(r.headers.get("x-fetched-at")), cache: r.headers.get("x-cache") });
    const text = await r.text();
    let body = {};
    try { body = text ? JSON.parse(text) : {}; } catch { /* cuerpo vacío */ }
    // Errores de conexión (502/503/504) activan el aviso global; cualquier respuesta buena lo quita
    if (r.status >= 502 && r.status <= 504 && !path.startsWith("/api/ext/")) setApiDown(true, body.error);
    else if (r.ok && path.startsWith("/api/farm") || r.ok && path.startsWith("/api/data")) setApiDown(false);
    if (!r.ok) {
      const msg = body.error || {
        401: "API key inválida o la granja ya no tiene VIP / nivel 50+",
        404: "No encontrado",
        429: "La API está frenando peticiones; reintenta en unos segundos",
        400: "Petición inválida",
      }[r.status] || `Error ${r.status}`;
      throw Object.assign(new Error(msg), { status: r.status });
    }
    return body;
  } finally {
    setBusy(-1);
  }
}
const data = (type, params = {}) => api(`/api/data?${new URLSearchParams({ type, ...params })}`);
const FETCHED = new Map(); // ruta → { at: cuándo obtuvo el proxy el dato de SFL, cache }
const fetchedAt = (path) => FETCHED.get(path)?.at ?? Date.now();

function setBusy(d) {
  S.busy += d;
  const el = $("#apiState");
  if (!el) return;
  el.innerHTML = S.busy > 0 ? `<i class="dot busy"></i>${S.busy} en cola` : S.apiDown ? `<i class="dot err"></i>sin conexión` : `<i class="dot"></i>ok`;
  $("#refreshBtn")?.classList.toggle("spin", S.busy > 0);
}

// Aviso global cuando no hay conexión con la API (en vez de depender solo de los errores de cada módulo)
function setApiDown(down, msg) {
  if (Boolean(S.apiDown) === down) return;
  S.apiDown = down;
  let bar = $("#apiBanner");
  if (down) {
    if (!bar) {
      bar = document.createElement("div");
      bar.id = "apiBanner";
      bar.className = "banner";
      $(".main").insertBefore(bar, $("#page"));
    }
    bar.innerHTML = `${sprite("warn", 16)}<div><b>Sin conexión con Sunflower Land</b><span>${esc(msg || "")} Se reintenta cada minuto; lo ya cargado sigue visible.</span></div>
      <button class="btn sm ghost" data-action="refresh">Reintentar ahora</button>`;
  } else {
    bar?.remove();
    toast("Conexión recuperada");
  }
  setBusy(0);
}

const store = {};
const has = (k) => store[k]?.data !== undefined;
// Falló la carga y no hay datos (para no dejar un "cargando…" para siempre si una fuente externa no responde)
const loadFailed = (k) => !has(k) && Boolean(store[k]?.error);
function load(name, fn, maxAge) {
  const s = (store[name] ||= {});
  if (s.data !== undefined && (!maxAge || now() - s.at < maxAge)) return Promise.resolve(s.data);
  if (s.promise) return s.promise;
  s.promise = fn()
    .then((d) => { s.data = d; s.error = null; s.at = now(); renderChrome(); return d; })
    .catch((e) => { s.error = e; if (name === "farm") renderChrome(); throw e; })
    .finally(() => { s.promise = null; });
  return s.promise;
}

const LOADERS = {
  status: () => load("status", () => api("/api/status"), 8_000),
  farm: () => load("farm", async () => {
    if (!S.farmId) throw Object.assign(new Error("Añade tu Farm ID en Ajustes para ver tu granja."), { code: "nofarm" });
    const path = `/api/farm/${encodeURIComponent(S.farmId)}`;
    const res = await api(path);
    const model = buildFarmModel(res.farm);
    if (!has("farm")) primeNotified(model.timers);
    return { ...res, ...model, fetchedAt: fetchedAt(path) };
  }, 55_000),
  activity: () => load("activity", async () => {
    const res = await data("marketplaceActivity");
    const [date, report] = Object.entries(res.data.reports).sort().pop();
    return { date, flowerPrice: res.data.flowerPrice, totals: report.totals, items: report.items, fetchedAt: fetchedAt("/api/data?type=marketplaceActivity") };
  }, 60_000),
  activityPrev: () => load("activityPrev", async () => {
    const date = utcDay(1);
    try {
      const res = await data("marketplaceActivity", { date });
      const rep = res.data.reports[date] || Object.values(res.data.reports)[0];
      return { date, items: rep?.items || {}, totals: rep?.totals || null };
    } catch {
      return { date, items: {}, totals: null };
    }
  }, 0),
  // Al cargar el perfil, el servidor archiva sus operaciones: refrescamos también el historial.
  profile: () => LOADERS.farm().then((f) => load("profile", () => data("marketplaceProfile", { farmId: f.id }).then((r) => {
    if (store.history) store.history.at = 0;
    return r.data;
  }), 120_000)),
  history: () => LOADERS.farm().then((f) => load("history", () => api(`/api/history?farmId=${encodeURIComponent(f.id)}`), 60_000)),
  // Historial diario del floor de tus NFTs (archivo local del servidor, sin tocar la API de SFL)
  // Patrimonio día a día: tus fotos diarias + histórico de precios de lo que tienes hoy (para estimar hacia atrás)
  wealth: () => Promise.all([LOADERS.farm(), LOADERS.activity()]).then(() => load("wealth", async () => {
    const keys = [...new Set((holdings()?.rows || []).map(wKey))];
    const [snaps, pr] = await Promise.all([
      api(`/api/wealth?farmId=${encodeURIComponent(store.farm.data.id ?? S.farmId)}`).catch(() => ({})),
      api(`/api/prices?keys=${encodeURIComponent(keys.join(","))}`),
    ]);
    return { snaps, series: pr.series || {} };
  }, 600_000)),
  nftPrices: () => Promise.all([LOADERS.farm(), LOADERS.activity()]).then(() =>
    load("nftPrices", () => api(`/api/prices?keys=${encodeURIComponent(nftKeys().join(","))}`), 600_000)),
  // Historial diario del floor de los recursos vendibles (crops, madera, minerales…) → para "temporada" (10-estrategia.js)
  resourceHist: () => LOADERS.farm().then(() =>
    load("resourceHist", () => api(`/api/prices?keys=${encodeURIComponent(resourceKeys().join(","))}`), 600_000)),
  // sfl.world (comunidad, sin key). Si falla, lo que depende de ello simplemente no se muestra.
  worldNfts: () => load("worldNfts", async () => {
    // Sin sfl.world: suministro del volcado nocturno oficial (unidades en granjas activas) y boost = texto del juego
    const d = await api("/api/ext/nfts").catch(async (e) => {
      const dump = await LOADERS.dump().catch(() => null);
      if (!dump?.items) throw e;
      const row = (collection, ids, src) => Object.entries(ids || {}).map(([name, id]) => ({ collection, id, name, supply: src[name]?.[0] || null,
        have_boost: G.buffs?.[name] ? 1 : 0, boost_text: [].concat(G.buffs?.[name] || []).join(" · ") }));
      return { collectibles: row("collectibles", G.itemIds, dump.items), wearables: row("wearables", G.wearableIds, dump.wearables || {}), updatedAt: dump.date, source: "dump" };
    });
    const map = {};
    for (const x of [...(d.collectibles || []), ...(d.wearables || [])]) {
      map[`${x.collection}-${x.id}`] = { supply: x.supply || null, boost: x.have_boost ? String(x.boost_text || "").trim() : "" };
    }
    return { map, updatedAt: d.updatedAt };
  }, 3600_000),
  fx: () => load("fx", () => api("/api/ext/exchange"), 900_000),
  // Listados de OpenSea (el servidor usa su key; cada item: precio unitario más bajo en USD y WETH)
  opensea: () => load("opensea", () => api("/api/ext/opensea"), 1800_000),
  friends: () => load("friends", () => api("/api/friends"), 60_000),
  // Evolución diaria (resúmenes del volcado) de tu granja y tus amigos
  friendHist: () => LOADERS.friends().then((f) => load("friendHist", () => api(`/api/dump/history?ids=${Object.keys(f || {}).join(",")}`), 3600_000)),
  // Resumen del volcado nocturno de todas las granjas (lo genera tu servidor; null si aún no hay ninguno)
  dump: () => load("dump", () => api("/api/dump/summary").catch((e) => { if (e.status === 404) return null; throw e; }), 3600_000),
  flowerRecipes: () => load("flowerRecipes", () => api("/api/ext/flowers").then((d) => d.recipes || {}), 86400_000),
  // Crafting Box (recetas en rejilla 3×3) y pedidos posibles de cada NPC, de sfl.world
  craftRecipes: () => load("craftRecipes", () => api("/api/ext/crafting").then((d) => d.groups || []), 86400_000),
  npcDeliveries: () => load("npcDeliveries", () => api("/api/ext/deliveries"), 86400_000),
  worldAuctions: () => load("worldAuctions", () => api("/api/ext/auctions").then((d) => d.list || []), 3 * 3600_000),
  myBoosts: () => LOADERS.farm().then((f) => load("myBoosts", () => api(`/api/ext/boosts/${encodeURIComponent(f.nft_id ?? f.id)}`), 6 * 3600_000)),
  stats: () => load("stats", () => data("statsLeaderboard").then((r) => r.data), 3600_000),
  tickets: () => LOADERS.farm().then((f) => load("tickets", () => data("ticketLeaderboard", { farmId: f.id, limit: 100 }).then((r) => r.data), 600_000)),
  auctions: () => load("auctions", () => data("auctions").then((r) => r.data.auctions), 3600_000),
  raffles: () => load("raffles", () => data("raffles").then((r) => r.data), 3600_000),
  discord: () => load("discord", () => data("discordAnnouncements").then((r) => r.data), 300_000),
};

/* Monta un widget: pinta skeleton, espera dependencias, pinta; repinta cuando
   llegan las dependencias "soft" (opcionales). Se re-ejecuta en cada refresco. */
const RETRY = {};
function mount(id, { deps = [], soft = [], render, loading = "block" }) {
  const entry = { id, deps, soft, render };
  entry.paint = () => {
    const el = document.getElementById(id);
    if (!el || !deps.every(has)) return;
    // No repintar mientras escribes dentro del módulo (p. ej. un coste en Mi inventario)
    if (el.contains(document.activeElement) && /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return;
    try {
      const html = render(el);
      // Un <img> dentro de un <svg> el navegador lo saca fuera y descuadra el módulo (pasó en Próximas horas)
      if (html.includes("<img") && /<svg\b(?:(?!<\/svg>)[\s\S])*?<img\b/.test(html)) { console.error(`${id}: <img> dentro de <svg>`); markJsError(); }
      el.innerHTML = html;
    } catch (err) { console.error(err); markJsError(err); el.innerHTML = ErrorState(err, id); }
  };
  entry.run = () => {
    const el = document.getElementById(id);
    if (!el) return;
    const ready = deps.every(has);
    if (ready) entry.paint();
    else el.innerHTML = Loading(loading);
    Promise.all(deps.map((d) => LOADERS[d]()))
      .then(() => {
        entry.paint();
        const missing = soft.filter((d) => !has(d));
        if (missing.length) Promise.allSettled(missing.map((d) => LOADERS[d]())).then(entry.paint);
      })
      .catch((err) => {
        const e2 = document.getElementById(id);
        if (e2 && !deps.every(has)) e2.innerHTML = ErrorState(err, id);
      });
  };
  RETRY[id] = entry.run;
  S.mounts.push(entry);
  entry.run();
}
const repaint = (dep) => S.mounts.forEach((m) => (!dep || m.deps.includes(dep) || m.soft.includes(dep)) && m.paint());
const rerun = () => S.mounts.forEach((m) => m.run());
const setSub = (id, html) => { const el = document.getElementById(id + "-sub"); if (el) el.innerHTML = html; };

/* ════════════════════════════════════════════════════════════════════════
   5. Modelo de la granja: temporizadores + nodos del mapa
   ════════════════════════════════════════════════════════════════════════ */
const CATS = {
  crops: { label: "Cultivos", spr: "carrot", color: "#f5c542" },
  fruits: { label: "Frutales", spr: "apple", color: "#f0676a" },
  flowers: { label: "Flores", spr: "flower", color: "#f08bd0" },
  bees: { label: "Colmenas", spr: "honey", color: "#ffc93c" },
  mushrooms: { label: "Setas", spr: "mushroom", color: "#d98b6a" },
  greenhouse: { label: "Invernadero", spr: "pot", color: "#86e05c" },
  trees: { label: "Árboles", spr: "tree", color: "#58b04a" },
  stones: { label: "Piedra", spr: "stone", color: "#b9c3bd" },
  iron: { label: "Hierro", spr: "iron", color: "#d08e62" },
  gold: { label: "Oro", spr: "gold", color: "#ffd24a" },
  crimstones: { label: "Crimstone", spr: "crim", color: "#e0526b" },
  sunstones: { label: "Sunstone", spr: "sunst", color: "#ffb347" },
  oil: { label: "Petróleo", spr: "oil", color: "#8c8cff" },
  cooking: { label: "Cocina", spr: "cook", color: "#f0a24a" },
  compost: { label: "Compost", spr: "compost", color: "#b08a5a" },
  cropMachine: { label: "Crop Machine", spr: "machine", color: "#6cb4ee" },
  animals: { label: "Animales", spr: "chicken", color: "#b596f0" },
  lava: { label: "Lava", spr: "lava", color: "#ff7a45" },
  salt: { label: "Sal", spr: "salt", color: "#dfe7ea" },
  traps: { label: "Trampas", spr: "crab", color: "#ff8a65" },
  pets: { label: "Mascotas", spr: "paw", color: "#c9a27a" },
  daily: { label: "Cofre diario", spr: "chest", color: "#e8b04a" },
};
const nextUtcMidnight = (ts) => { const d = new Date(ts); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1); };

// Nodos colocados en la isla (los del inventario no tienen x/y). Si ninguno trae
// coordenadas asumimos que la API las omite y los contamos todos.
function placedNodes(obj = {}) {
  const all = Object.entries(obj).filter(([, n]) => n && !n.removedAt);
  const withXY = all.filter(([, n]) => n.x !== undefined);
  return withXY.length ? withXY : all;
}

// El juego aplica los boosts moviendo hacia atrás plantedAt/choppedAt/minedAt, así que "listo" es esa marca +
// el tiempo base. Con su modelo nuevo (SPEED_BOOSTS) guarda la hora real + baseDurationMs (duración con los
// boosts permanentes): entonces "listo" es marca + baseDurationMs. Los boosts temporales de ese modelo (tótems,
// shrines, relojes de arena) van aparte y aquí no se descuentan: como mucho, algo sale listo un poco antes.
const readyAt = (start, baseSecs, part) => toNum(start) + (part?.baseDurationMs != null ? toNum(part.baseDurationMs) : baseSecs * 1000);
function buildFarmModel(farm) {
  const timers = [], nodes = [];
  const T = (cat, name, start, ready, extra = {}) => {
    if (!Number.isFinite(ready)) return null;
    const t = { cat, name, start: Number.isFinite(start) ? start : ready, ready, ...extra };
    timers.push(t);
    return t;
  };
  const N = (kind, n, name, timer, dw = 1, dh = 1) => {
    if (n && Number.isFinite(n.x) && Number.isFinite(n.y)) nodes.push({ kind, x: n.x, y: n.y, w: n.width || dw, h: n.height || dh, name, timer });
  };

  for (const [id, plot] of Object.entries(farm.crops || {})) {
    if (!plot || plot.removedAt) continue;
    const c = plot.crop;
    const secs = c && G.crops[c.name];
    const t = secs ? T("crops", c.name, c.plantedAt, readyAt(c.plantedAt, secs, c), { id }) : null;
    N("crops", plot, c?.name || "Parcela libre", t);
  }
  for (const [id, patch] of Object.entries(farm.fruitPatches || {})) {
    if (!patch || patch.removedAt) continue;
    const f = patch.fruit;
    const secs = f && G.fruitSeeds[G.fruitSeedOf[f.name]];
    const ref = f && (f.harvestedAt || f.plantedAt);
    const t = secs ? T("fruits", f.name, ref, ref + secs * 1000, { id, note: f.harvestsLeft != null ? `${f.harvestsLeft} cosechas` : "" }) : null;
    N("fruits", patch, f?.name || "Frutal libre", t, 2, 2);
  }
  for (const [id, bed] of Object.entries(farm.flowers?.flowerBeds || {})) {
    if (!bed || bed.removedAt) continue;
    const f = bed.flower;
    const secs = f && G.flowerSeeds[G.flowerSeedOf[f.name]];
    const t = secs ? T("flowers", f.name, f.plantedAt, f.plantedAt + secs * 1000, { id }) : null;
    N("flowers", bed, f?.name || "Macizo libre", t, 3, 1);
  }
  // Colmenas (updateBeehives/beehiveProduction del juego): se llenan con 24 h de flor a la velocidad de cada
  // flor adjunta. Lista = cuando lo producido llega a 24 h; sin flores programadas se para.
  const t0 = now();
  for (const [id, hive] of Object.entries(farm.beehives || {})) {
    if (!hive || !Number.isFinite(hive.x)) continue; // guardan un removedAt antiguo aunque sigan puestas
    const FULL = 24 * 3600_000, upd = toNum(hive.honey?.updatedAt);
    const flowers = (hive.flowers || []).slice().sort((a, b) => a.attachedAt - b.attachedAt);
    const producedAt = (ts) => flowers.reduce((p, f) => p + Math.max(Math.min(ts, f.attachedUntil) - Math.max(upd, f.attachedAt), 0) * (f.rate ?? 1), toNum(hive.honey?.produced));
    let left = FULL - producedAt(t0), fullAt = left <= 0 ? t0 : null;
    for (const f of flowers) {
      if (fullAt) break;
      const a = Math.max(t0, upd, f.attachedAt), b = f.attachedUntil, rate = f.rate ?? 1;
      if (b <= a) continue;
      if ((b - a) * rate >= left) fullAt = a + left / rate; else left -= (b - a) * rate;
    }
    const pctFull = Math.min(100, (producedAt(t0) / FULL) * 100);
    const note = `${fmt(pctFull, 0)}% de miel${fullAt ? "" : " · sin flores: se parará"}`;
    const t = fullAt ? T("bees", "Colmena", upd, fullAt, { id, note }) : null;
    N("bees", hive, "Colmena", t);
  }
  // Setas: aparecen desde el servidor; las que hay en la granja se pueden recoger ya
  for (const [id, m] of Object.entries(farm.mushrooms?.mushrooms || {})) {
    if (!m) continue;
    T("mushrooms", m.name || "Seta", toNum(farm.mushrooms.spawnedAt) || now(), toNum(farm.mushrooms.spawnedAt) || now(), { id, note: m.amount ? `×${fmt(m.amount, 1)}` : "" });
  }
  for (const [id, pot] of Object.entries(farm.greenhouse?.pots || {})) {
    const p = pot?.plant;
    if (!p) continue;
    const secs = G.greenhouseCrops[p.name] ?? G.greenhouseFruitSeeds[G.greenhouseFruitSeedOf[p.name]];
    if (secs) T("greenhouse", p.name, p.plantedAt, p.plantedAt + secs * 1000, { id });
  }
  for (const [id, tr] of placedNodes(farm.trees)) {
    if (!tr.wood) continue;
    N("trees", tr, tr.name || "Árbol", T("trees", tr.name || "Árbol", tr.wood.choppedAt, readyAt(tr.wood.choppedAt, G.recovery.tree, tr.wood), { id }), 2, 2);
  }
  const rocks = [["stones", "Piedra", G.recovery.stone, 1], ["iron", "Hierro", G.recovery.iron, 1], ["gold", "Oro", G.recovery.gold, 1],
    ["crimstones", "Crimstone", G.recovery.crimstone, 2], ["sunstones", "Sunstone", G.recovery.sunstone, 2]];
  for (const [key, label, secs, size] of rocks) {
    for (const [id, r] of placedNodes(farm[key])) {
      if (!r.stone) continue;
      const note = r.minesLeft != null ? `${r.minesLeft} restantes` : "";
      N(key, r, r.name || label, T(key, r.name || label, r.stone.minedAt, readyAt(r.stone.minedAt, secs, r.stone), { id, note }), size, size);
    }
  }
  for (const [id, o] of placedNodes(farm.oilReserves)) {
    if (!o.oil) continue;
    N("oil", o, "Pozo de petróleo", T("oil", "Pozo de petróleo", o.oil.drilledAt, readyAt(o.oil.drilledAt, G.recovery.oil, o.oil), { id }), 2, 2);
  }
  for (const [building, list] of Object.entries(farm.buildings || {})) {
    for (const b of list || []) {
      if (b.removedAt) continue;
      for (const p of [].concat(b.crafting || [], b.processing || [])) {
        if (p?.readyAt) T("cooking", p.name, p.startedAt, p.readyAt, { note: building });
      }
      if (b.producing?.readyAt) {
        const items = Object.keys(b.producing.items || {}).join(", ") || building;
        T("compost", items, b.producing.startedAt, b.producing.readyAt, { note: building });
      }
      for (const q of b.queue || []) {
        if (q?.readyAt) T("cropMachine", q.crop, q.startTime, q.readyAt, { note: `${q.seeds} semillas` });
      }
    }
  }
  for (const house of [farm.henHouse, farm.barn]) {
    for (const [id, a] of Object.entries(house?.animals || {})) {
      if (a?.awakeAt) T("animals", a.type, a.asleepAt, a.awakeAt, { id, note: "despierta" });
    }
  }
  for (const [id, pit] of Object.entries(farm.lavaPits || {})) {
    if (pit?.readyAt && !pit.collectedAt && !pit.removedAt) T("lava", "Pozo de lava", pit.startedAt, pit.readyAt, { id });
  }
  // Salinas: una carga cada 7 h (types/salt.ts). Con cargas guardadas ya hay algo que recoger.
  const SALT_GEN = 7 * 3600_000;
  for (const [id, n] of Object.entries(farm.saltFarm?.nodes || {})) {
    const s = n?.salt;
    if (!s?.nextChargeAt) continue;
    const stored = toNum(s.storedCharges);
    if (stored > 0) {
      const since = toNum(s.claimedAt) || s.nextChargeAt - SALT_GEN;
      T("salt", "Salina", since - SALT_GEN, since, { id, note: `${stored} carga${stored > 1 ? "s" : ""}` });
    } else {
      T("salt", "Salina", Math.max(toNum(s.claimedAt), s.nextChargeAt - SALT_GEN), s.nextChargeAt, { id });
    }
  }
  for (const [id, spot] of Object.entries(farm.crabTraps?.trapSpots || {})) {
    const w = spot?.waterTrap;
    if (w?.readyAt) T("traps", w.type || "Trampa", w.placedAt, w.readyAt, { id });
  }
  // Mascotas: las peticiones de comida se renuevan a medianoche UTC
  const petsGen = toNum(farm.pets?.requestsGeneratedAt);
  for (const p of [...Object.values(farm.pets?.common || {}), ...Object.values(farm.pets?.nfts || {})]) {
    const food = p?.requests?.food || [];
    if (!food.length || !petsGen) continue;
    const pending = food.length - (p.requests.foodFed || []).length;
    if (pending > 0) T("pets", p.name, petsGen, petsGen, { id: p.name, note: `${pending} comida${pending > 1 ? "s" : ""} pendiente${pending > 1 ? "s" : ""}` });
    else T("pets", p.name, petsGen, nextUtcMidnight(petsGen), { id: p.name, note: "nuevas peticiones" });
  }
  // Cofre diario: se puede abrir cuando cambia el día UTC (claimDailyReward.ts)
  const chestAt = toNum(farm.dailyRewards?.chest?.collectedAt);
  if (chestAt) T("daily", "Cofre diario", chestAt, nextUtcMidnight(chestAt), { id: "chest", note: `racha ${toNum(farm.dailyRewards.streaks)}` });
  timers.sort((a, b) => a.ready - b.ready);
  return { timers, nodes };
}

// Agrupa temporizadores del mismo tipo que terminan en el mismo minuto.
function groupTimers(list) {
  const groups = new Map();
  for (const t of list) {
    const k = `${t.cat}|${t.name}|${Math.round(t.ready / 60000)}|${t.note || ""}`;
    const g = groups.get(k);
    if (g) g.count++;
    else groups.set(k, { ...t, count: 1 });
  }
  return [...groups.values()];
}

function perCategory(timers) {
  const t = now(), out = {};
  for (const x of timers) {
    const c = (out[x.cat] ||= { ready: 0, total: 0, next: null });
    c.total++;
    if (x.ready <= t) c.ready++;
    else if (!c.next || x.ready < c.next.ready) c.next = x;
  }
  return out;
}
const readyCount = () => (has("farm") ? store.farm.data.timers.filter((x) => x.ready <= now()).length : 0);

function bumpkinLevel(xp) {
  const L = G.levelExperience;
  let lvl = 1;
  for (const k of Object.keys(L).map(Number).sort((a, b) => a - b)) {
    if (xp >= L[k]) lvl = k; else break;
  }
  const cur = L[lvl] ?? 0, next = L[lvl + 1];
  return { lvl, p: next ? (xp - cur) / (next - cur) : 1, toNext: next ? next - xp : 0 };
}
