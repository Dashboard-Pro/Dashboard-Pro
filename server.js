// Servidor local del dashboard: sirve /public y hace de proxy hacia la Community API.
// - La API key vive aquí (config.json), nunca en el navegador.
// - Todas las peticiones a la API pasan por una cola con 5,2 s de separación (límite: ~1 cada 5 s por IP).
// - Cada tipo de dato tiene su caché para no gastar peticiones.
// Sin dependencias: node server.js

const http = require("node:http");
const zlib = require("node:zlib");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = __dirname;
const PUBLIC = path.join(ROOT, "public");
const CONFIG_FILE = process.env.SFL_CONFIG || path.join(ROOT, "config.json");
// SFL_UPSTREAM permite apuntar a testnet (https://api-dev.sunflower-land.com/community) o al mock de tools/.
const UPSTREAM = process.env.SFL_UPSTREAM || "https://api.sunflower-land.com/community";
const MIN_GAP_MS = Number(process.env.SFL_MIN_GAP_MS) || 5200;
const BACKOFF_MS = 11000;

const TTL = {
  farm: 45_000,
  marketplaceActivity: 60_000,
  marketplaceActivityPast: 24 * 3600_000, // los días pasados no cambian
  tradeable: 30_000,
  marketplaceProfile: 120_000,
  ticketLeaderboard: 10 * 60_000,
  statsLeaderboard: 3 * 3600_000,
  auctions: 60 * 60_000,
  auctionResults: 10 * 60_000,
  raffles: 60 * 60_000,
  raffleResults: 10 * 60_000,
  discordAnnouncements: 5 * 60_000,
  pets: 15 * 60_000,
  nightlyDump: 60 * 60_000, // manifiesto del volcado diario de todas las granjas
};
const DATA_TYPES = new Set(Object.keys(TTL).filter((t) => t !== "farm" && t !== "marketplaceActivityPast"));

// ── Config ───────────────────────────────────────────────────────────────────
function loadConfig() {
  try {
    return { port: 4173, ...JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8")) };
  } catch {
    return { port: 4173 };
  }
}
let config = loadConfig();
if (process.env.SFL_API_KEY) config.apiKey = process.env.SFL_API_KEY;
if (process.env.SFL_FARM_ID) config.farmId = process.env.SFL_FARM_ID;
if (process.env.PORT) config.port = Number(process.env.PORT);

function saveConfig(patch) {
  config = { ...config, ...patch };
  if (CLOUD) return; // la nube se configura solo con variables de entorno
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

// ── Modo ─────────────────────────────────────────────────────────────────────
// local (por defecto): la app de cada jugador, con su key en config.json.
// nube (SFL_MODE=cloud): versión web + cuentas de Discord + sincronización; key del administrador por
// variable de entorno, datos de usuarios en CLOUD_DATA_DIR. Ver cloud/ y ROADMAP.md.
const CLOUD = process.env.SFL_MODE === "cloud";
const CLOUD_URL = (process.env.CLOUD_URL || `http://localhost:${config.port}`).replace(/\/+$/, "");
if (CLOUD) {
  config.farmId = null; // en la nube no hay una granja "del servidor": cada visitante elige la suya
}
// Límite por visitante en la nube (además de la cola hacia SFL): 90 peticiones/min por IP
const rateHits = new Map();
function rateOk(req) {
  const ip = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
  const now = Date.now(), win = rateHits.get(ip) || [];
  const recent = win.filter((t) => now - t < 60_000);
  recent.push(now);
  rateHits.set(ip, recent);
  if (rateHits.size > 5000) rateHits.clear();
  return recent.length <= 90;
}
// En la nube muchas personas comparten el límite de 1 petición / 5 s: las granjas se cachean 10 min
// (los temporizadores se calculan en el navegador, así que siguen corriendo entre refrescos)
if (CLOUD) TTL.farm = 10 * 60_000;

// ── Cola hacia la API ────────────────────────────────────────────────────────
const cache = new Map(); // key -> { at, status, body, serverDate }
const inflight = new Map(); // key -> Promise
const queue = [];
let lastCallAt = 0;
let draining = false;
let serverOffsetMs = 0; // hora del servidor - hora local
const stats = { upstreamCalls: 0, cacheHits: 0, throttled: 0, retried: 0, lastError: null, lastOkAt: null };
const errorLog = []; // últimos errores reales con su hora: { at, status, path }

// Errores de la API que merecen reintento: fallos del servidor de SFL/Cloudflare (5xx) o de red.
const isTransient = (status) => status >= 500;
// SFL_RETRY_MS permite acortarlos en los tests (p. ej. "50,50,50")
const RETRY_DELAYS = process.env.SFL_RETRY_MS ? process.env.SFL_RETRY_MS.split(",").map(Number) : [5_000, 15_000, 45_000];

function recordError(status, path) {
  const e = { at: Date.now(), status, path };
  stats.lastError = e;
  errorLog.push(e);
  if (errorLog.length > 50) errorLog.shift();
}

function enqueue(url) {
  return new Promise((resolve) => {
    queue.push({ url, resolve, notBefore: 0, retries: 0 });
    drain();
  });
}

// Cola serie con 5,2 s entre llamadas. Un trabajo en espera de reintento (notBefore) no bloquea
// a los demás: se atiende el primero que ya pueda salir.
async function drain() {
  if (draining) return;
  draining = true;
  while (queue.length) {
    const nowT = Date.now();
    let idx = queue.findIndex((j) => j.notBefore <= nowT);
    if (idx < 0) {
      await sleep(Math.min(...queue.map((j) => j.notBefore)) - nowT);
      continue;
    }
    const wait = lastCallAt + MIN_GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastCallAt = Date.now();
    const job = queue[idx];
    const res = await callUpstream(job.url);
    if (res.status === 429 && job.retries < 3) {
      stats.throttled++;
      job.retries++;
      lastCallAt = Date.now() + BACKOFF_MS - MIN_GAP_MS;
      continue;
    }
    if (isTransient(res.status) && job.retries < RETRY_DELAYS.length) {
      stats.retried++;
      job.notBefore = Date.now() + RETRY_DELAYS[job.retries++];
      continue;
    }
    idx = queue.indexOf(job);
    queue.splice(idx, 1);
    job.resolve(res);
  }
  draining = false;
}

async function callUpstream(url) {
  stats.upstreamCalls++;
  const sentAt = Date.now();
  try {
    const r = await fetch(url, { headers: { "x-api-key": config.apiKey || "" } });
    const body = await r.text();
    const date = r.headers.get("date");
    if (date) {
      // La cabecera Date tiene resolución de 1 s; la media ida/vuelta basta para relojes de cuenta atrás.
      const mid = (sentAt + Date.now()) / 2;
      serverOffsetMs = Math.round(0.7 * serverOffsetMs + 0.3 * (Date.parse(date) + 500 - mid));
    }
    const path = url.replace(UPSTREAM, "");
    // 404/400 son respuestas normales (item o subasta inexistente); el resto sí son errores
    if (r.status >= 500 || r.status === 401 || r.status === 403 || r.status === 429) recordError(r.status, path);
    else if (r.ok) stats.lastOkAt = Date.now();
    return { status: r.status, body };
  } catch (err) {
    recordError("red", url.replace(UPSTREAM, ""));
    return { status: 502, body: JSON.stringify({ error: "No se pudo contactar con Sunflower Land: sin conexión a internet o la API está caída." }) };
  }
}

async function cached(key, url, ttl) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttl) {
    stats.cacheHits++;
    return { ...hit, cache: "hit" };
  }
  if (!inflight.has(key)) {
    inflight.set(
      key,
      enqueue(url).then((res) => {
        inflight.delete(key);
        if (res.status === 200) cache.set(key, { ...res, at: Date.now() });
        return res;
      }),
    );
  }
  const res = await inflight.get(key);
  // Si falla pero teníamos una copia vieja, mejor servir la vieja que un error.
  if (res.status !== 200 && hit) return { ...hit, cache: "stale" };
  return { ...res, at: Date.now(), cache: "miss" };
}

// ── sfl.world (API pública de la comunidad, sin key) ─────────────────────────
// Va por su propio camino: nunca lleva tu API key y no gasta el límite de la API oficial. Se cachea
// generosamente porque sfl.world actualiza cada 15 min–1 día; si cae, se sirve la última copia buena.
const WORLD = process.env.SFL_WORLD || "https://sfl.world/api";
const EXT = {
  nfts: { url: () => "/v1/nfts", ttl: 3600_000 }, // floor, supply y boost de cada NFT
  exchange: { url: () => "/v1.1/exchange", ttl: 900_000 }, // FLOWER en €/$…, precio de las gemas
  auctions: { url: () => "/v1/auctions", ttl: 3 * 3600_000 }, // subastas pasadas con resultados
  boosts: { url: (a) => `/v1/land/${a}`, ttl: 6 * 3600_000, arg: /^\d{1,20}$/ }, // multiplicadores de una granja
  land: { url: (a) => `/v1.1/land/${a}`, ttl: 3600_000, arg: /^\d{1,20}$/ }, // resumen de una granja
  user: { url: (a) => `/v1/land/info/username/${encodeURIComponent(a)}`, ttl: 86400_000, arg: /^[^/\\?#%]{1,40}$/ }, // nombre → granja
  // Recetas de cruce de flores (semilla + ingrediente → flor): el juego no las publica y la API oficial no
  // trae el códice; sfl.world las tiene en una página HTML que convertimos a JSON.
  flowers: { url: () => "/info/flowers", site: true, ttl: 86400_000, parse: parseFlowerRecipes },
  // Recetas de la Crafting Box (el repo del juego las deja vacías: van en el servidor) y pedidos posibles de cada NPC
  crafting: { url: () => "/info/crafting", site: true, ttl: 86400_000, parse: parseCraftingRecipes },
  deliveries: { url: () => "/info/deliveries", site: true, ttl: 86400_000, parse: parseNpcDeliveries },
};
const htmlText = (x) => x.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').trim();
// Crafting Box de sfl.world → { groups: [{ name, recipes: [{ name, type, grid: [9 × nombre|null] }] }] }
function parseCraftingRecipes(html) {
  const groups = [];
  const parts = html.split(/<div class="ta-center bg-gray[^"]*">/).slice(1);
  for (const part of parts) {
    const gname = htmlText(part.slice(0, part.indexOf("</div>")));
    const recipes = [];
    for (const [, block] of part.matchAll(/<div style="width: 11rem;"[^>]*>([\s\S]*?<table class="p-1 m-auto">[\s\S]*?<\/table>)/g)) {
      const name = htmlText(block.match(/<div class="b">([\s\S]*?)<\/div>/)?.[1] || "");
      const type = htmlText(block.match(/<div class="small">([\s\S]*?)<\/div>/)?.[1] || "");
      const table = block.slice(block.indexOf('<table class="p-1 m-auto">'));
      const grid = [...table.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(([, td]) => td.match(/title="([^"]+)"/)?.[1]?.replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'") || null);
      if (name && grid.length === 9) recipes.push({ name, type, grid });
    }
    if (recipes.length) groups.push({ name: gname, recipes });
  }
  return groups.length ? { groups } : null;
}
// Entregas de sfl.world → { npcs: [{ npc, kind: FLOWER|COINS|TICKETS…, avg, orders: [{ items, reward }] }], updated }
function parseNpcDeliveries(html) {
  const npcs = [];
  const cards = html.split('<div class="card-header h5">').slice(1);
  for (const card of cards) {
    const kind = htmlText(card.slice(0, card.indexOf("</div>")));
    for (const blk of card.split('<td colspan="2" class="ta-left b">').slice(1)) {
      const npc = htmlText(blk.slice(0, blk.indexOf("</td>"))).toLowerCase();
      const avg = Number(blk.match(/AVG Reward<\/td><td[^>]*>(?:<img[^>]*>)?([\d.,]+)/)?.[1]?.replace(/,/g, "")) || null;
      const body = blk.match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1] || "";
      const orders = [...body.matchAll(/<tr><td class="ta-left"><table class="p-1">([\s\S]*?)<\/table><\/td><td class="ta-left">([\s\S]*?)<\/td>/g)].map(([, itemsHtml, rewardHtml]) => {
        const items = {};
        for (const [, n, q] of itemsHtml.matchAll(/\/>([^<:]+):\s*([\d.]+)<\/div>/g)) items[htmlText(n)] = (items[htmlText(n)] || 0) + Number(q);
        const reward = Number(htmlText(rewardHtml).replace(/,/g, "")) || null;
        return { items, reward };
      }).filter((o) => Object.keys(o.items).length);
      if (npc) npcs.push({ npc, kind, avg, orders });
    }
  }
  const updated = htmlText(html.match(/Updated <b>([^<]+)<\/b>/)?.[1] || "") || null;
  return npcs.length ? { npcs, updated } : null;
}
// Página de flores de sfl.world → { recipes: { flor: { seed, via: [ingrediente…] } } }; null si no se reconoce
function parseFlowerRecipes(html) {
  const recipes = {};
  for (const [, t] of html.matchAll(/<table class="w175">([\s\S]*?)<\/table>/g)) {
    const name = t.match(/<th[^>]*>(?:\s*<img[^>]*>)?\s*([^<]+?)\s*<\/th>/)?.[1];
    const seed = t.match(/<b>([^<]+ Seed)<\/b>/)?.[1];
    if (!name || !seed) continue;
    const via = [...t.matchAll(/<td class="p-2 ta-left small">([\s\S]*?)<\/td>/g)]
      .map(([, x]) => x.replace(/<[^>]+>/g, "").replace(/\([^)]*\)/g, "").replace(/&amp;/g, "&").trim())
      .filter(Boolean);
    recipes[name] = { seed, via };
  }
  return Object.keys(recipes).length ? { recipes } : null;
}
const extStats = { calls: 0, cacheHits: 0, lastError: null, lastOkAt: null };
async function extCached(key, url, ttl, parse) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttl) { extStats.cacheHits++; return { ...hit, cache: "hit" }; }
  if (!inflight.has(key)) {
    inflight.set(key, (async () => {
      extStats.calls++;
      try {
        const r = await fetch(url, { headers: { "user-agent": "SFL-Dashboard (local)" }, signal: AbortSignal.timeout(20_000) });
        let body = await r.text();
        if (r.ok && parse) {
          const out = parse(body);
          if (!out) {
            extStats.lastError = { at: Date.now(), status: "formato", path: url };
            return { status: 502, body: JSON.stringify({ error: "sfl.world cambió el formato de la página" }) };
          }
          body = JSON.stringify(out);
        }
        if (r.ok) { extStats.lastOkAt = Date.now(); cache.set(key, { status: 200, body, at: Date.now() }); }
        else if (r.status !== 404) extStats.lastError = { at: Date.now(), status: r.status, path: url };
        return { status: r.status, body };
      } catch {
        extStats.lastError = { at: Date.now(), status: "red", path: url };
        return { status: 502, body: JSON.stringify({ error: "No se pudo contactar con sfl.world" }) };
      } finally { inflight.delete(key); }
    })());
  }
  const res = await inflight.get(key);
  if (res.status !== 200 && res.status !== 404 && hit) return { ...hit, cache: "stale" };
  return { ...res, at: Date.now(), cache: "miss" };
}

// ── OpenSea (listados de la colección de coleccionables en Polygon) ──────────
// Para comparar el floor del juego con el de OpenSea y comprar donde esté más barato. Su API pide key: si
// pones la tuya en config.json (`openseaKey`) se usa esa; si no, el servidor pide una gratuita al momento
// (POST /api/v2/auth/keys, 7 días, 600 lecturas/h) y la renueva sola. Vive en config.json: nunca al navegador.
// Toda la colección son ~20 páginas de 100 listados → caché de 30 min (~40 lecturas/h).
const OPENSEA = process.env.SFL_OPENSEA || "https://api.opensea.io";
const OS_COLLECTIONS = { collectibles: { slug: "sunflower-land-collectibles", contract: "0x22d5f9b75c524fec1d6619787e582644cd4d7422" } };
const OS_TTL = 30 * 60_000;
const osStats = { calls: 0, lastError: null, lastOkAt: null };
async function osFetch(pathQ, init = {}) {
  osStats.calls++;
  const r = await fetch(OPENSEA + pathQ, { ...init, headers: { accept: "application/json", "user-agent": "SFL-Dashboard (local)", ...(init.headers || {}) }, signal: AbortSignal.timeout(20_000) });
  const body = await r.json().catch(() => null);
  return { status: r.status, body };
}
async function openseaKey(renew = false) {
  if (config.openseaKey) return config.openseaKey;
  const k = config.openseaInstant;
  if (!renew && k?.key && Date.parse(k.expiresAt) - Date.now() > 12 * 3600_000) return k.key;
  const r = await osFetch("/api/v2/auth/keys", { method: "POST" });
  if (r.status !== 200 && r.status !== 201 || !r.body?.api_key) throw new Error(`no se pudo obtener una key de OpenSea (${r.status})`);
  saveConfig({ openseaInstant: { key: r.body.api_key, expiresAt: r.body.expires_at } });
  return r.body.api_key;
}
// Precio unitario de cada item: el listado más barato (precio / cantidad del lote, ERC-1155) en USD y en la
// moneda del listado (WETH en Polygon), cuántos listados hay y cuántas unidades en total.
async function fetchOpenseaListings() {
  let key = await openseaKey();
  const get = async (pathQ) => {
    let r = await osFetch(pathQ, { headers: { "x-api-key": key } });
    if (r.status === 401 && !config.openseaKey) { key = await openseaKey(true); r = await osFetch(pathQ, { headers: { "x-api-key": key } }); }
    if (r.status !== 200) throw new Error(`OpenSea respondió ${r.status}`);
    return r.body;
  };
  const items = {}, tokens = {};
  for (const [col, { slug, contract }] of Object.entries(OS_COLLECTIONS)) {
    let next = "";
    for (let page = 0; page < 60; page++) {
      const d = await get(`/api/v2/listings/collection/${slug}/best?limit=100${next ? `&next=${encodeURIComponent(next)}` : ""}`);
      for (const l of d.listings || []) {
        const offer = l.protocol_data?.parameters?.offer?.[0];
        const cur = l.price?.current;
        const amount = Number(offer?.startAmount) || 1;
        if (!offer || !cur || l.status && l.status !== "ACTIVE") continue;
        const unit = Number(cur.value) / 10 ** (cur.decimals ?? 18) / amount;
        if (!(unit > 0)) continue;
        const token = l.protocol_data.parameters.consideration?.[0]?.token;
        if (token) tokens[token.toLowerCase()] = cur.currency;
        const k = `${col}-${offer.identifierOrCriteria}`;
        const it = (items[k] ||= { price: Infinity, currency: cur.currency, token, listings: 0, qty: 0, contract });
        it.listings++;
        it.qty += Number(l.remaining_quantity) || 0;
        if (unit < it.price) Object.assign(it, { price: unit, currency: cur.currency, token });
      }
      next = d.next;
      if (!next) break;
      await new Promise((r) => setTimeout(r, 250)); // sin ráfagas
    }
  }
  // Precio en USD de cada moneda de pago (normalmente solo WETH)
  const usdOf = {};
  for (const t of Object.keys(tokens)) {
    const d = await get(`/api/v2/chain/polygon/payment_token/${t}`).catch(() => null);
    if (Number(d?.usdPrice) > 0) usdOf[t] = Number(d.usdPrice);
  }
  for (const it of Object.values(items)) {
    const rate = usdOf[String(it.token).toLowerCase()];
    it.usd = rate ? it.price * rate : null;
    delete it.token;
  }
  return { items, usdOf: Object.fromEntries(Object.entries(usdOf).map(([t, v]) => [tokens[t], v])), updatedAt: Date.now() };
}
async function openseaCached() {
  const key = "ext:opensea";
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < OS_TTL) return { ...hit, cache: "hit" };
  // Tras un fallo (p. ej. 429 al pedir la key) no se reintenta hasta pasados 10 min
  if (osStats.lastError && Date.now() - osStats.lastError.at < 10 * 60_000 && (osStats.lastOkAt || 0) < osStats.lastError.at) {
    return hit ? { ...hit, cache: "stale" } : { status: 502, body: JSON.stringify({ error: "OpenSea no responde; se reintenta en unos minutos" }), at: Date.now(), cache: "miss" };
  }
  if (!inflight.has(key)) {
    inflight.set(key, fetchOpenseaListings().then((out) => {
      osStats.lastOkAt = Date.now();
      const r = { status: 200, body: JSON.stringify(out), at: Date.now() };
      cache.set(key, r);
      return r;
    }, (err) => {
      osStats.lastError = { at: Date.now(), status: String(err.message || err).slice(0, 120) };
      return { status: 502, body: JSON.stringify({ error: "No se pudo contactar con OpenSea" }) };
    }).finally(() => inflight.delete(key)));
  }
  const res = await inflight.get(key);
  if (res.status !== 200 && hit) return { ...hit, cache: "stale" };
  return { ...res, at: res.at || Date.now(), cache: "miss" };
}

// ── HTTP ─────────────────────────────────────────────────────────────────────
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".json": "application/json",
};

const SECURITY_HEADERS = {
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "no-referrer",
  "cross-origin-resource-policy": "same-origin",
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...SECURITY_HEADERS, ...headers });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}

// Solo se atiende a este mismo dashboard: protege frente a DNS rebinding (otra web haciéndose pasar
// por localhost) y frente a formularios de otras webs que intenten cambiar la configuración.
function allowedHost(host) {
  if (CLOUD && String(host || "").toLowerCase() === new URL(CLOUD_URL).host.toLowerCase()) return true;
  return new RegExp(`^(localhost|127\\.0\\.0\\.1|\\[::1\\]):${config.port}$`, "i").test(host || "");
}
function sameOriginWrite(req) {
  const origin = req.headers.origin;
  if (origin && !allowedHost(origin.replace(/^https?:\/\//i, ""))) return false;
  return /^application\/json\b/i.test(req.headers["content-type"] || "");
}

function status() {
  return {
    hasKey: Boolean(config.apiKey),
    gameData: gameUpdater.status(),
    farmId: config.farmId ?? null,
    queue: queue.length,
    nextSlotInMs: Math.max(0, lastCallAt + MIN_GAP_MS - Date.now()),
    serverOffsetMs,
    ...stats,
    errorsLastHour: errorLog.filter((e) => Date.now() - e.at < 3600_000).length,
    recentErrors: errorLog.slice(-5).reverse(),
    world: extStats,
    opensea: osStats,
    now: Date.now(),
  };
}

// ── Archivo de operaciones ───────────────────────────────────────────────────
// La API solo devuelve tus 50 últimas operaciones: las vamos guardando para no perder ninguna.
const DATA_DIR = process.env.SFL_DATA_DIR || path.join(ROOT, "data");
const archiveFile = (farmId) => path.join(DATA_DIR, `trades-${String(farmId).replace(/[^A-Za-z0-9]/g, "")}.json`);
function readArchive(farmId) {
  try {
    return JSON.parse(fs.readFileSync(archiveFile(farmId), "utf8"));
  } catch {
    return { trades: {} };
  }
}
const who = (x) => (x ? { id: x.id, username: x.username } : undefined);
function archiveTrades(farmId, trades, via) {
  if (!farmId || !Array.isArray(trades)) return 0;
  const a = readArchive(farmId);
  let added = 0;
  for (const t of trades) {
    if (!t?.id || t.itemId == null || a.trades[t.id]) continue;
    a.trades[t.id] = {
      id: t.id, collection: t.collection, itemId: t.itemId, quantity: t.quantity, sfl: t.sfl, source: t.source,
      fulfilledAt: t.fulfilledAt, initiatedBy: who(t.initiatedBy), fulfilledBy: who(t.fulfilledBy), via, archivedAt: Date.now(),
    };
    added++;
  }
  if (added) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    a.updatedAt = Date.now();
    fs.writeFileSync(archiveFile(farmId), JSON.stringify(a));
    cloudSyncSoon();
  }
  return added;
}
// ¿Es la granja configurada? La API la conoce por dos números (id de granja y nft_id): vale cualquiera
function isOwnFarm(id) {
  if (!config.farmId || id == null) return false;
  let d = null;
  try { d = JSON.parse(cache.get(`farm:${config.farmId}`)?.body || "null"); } catch { /* sin caché: solo el configurado */ }
  return [config.farmId, d?.id, d?.nft_id, d?.nftId].filter((x) => x != null).map(String).includes(String(id));
}
function archiveFromProfile(farmId, body) {
  try {
    const d = JSON.parse(body).data;
    return archiveTrades(farmId, d?.trades, "perfil");
  } catch {
    return 0;
  }
}

// ── Foto diaria de precios ───────────────────────────────────────────────────
// Guarda el floor de cada item una vez por día (se actualiza durante el día) para ver
// cómo evoluciona el valor de lo que compraste. Un archivo por mes.
let lastPriceWrite = 0;
// Grupos de comparación de un pet (igual que petTypeRef en public/js/03-interfaz.js): tipo · tipo+aura · aura+collar · los tres
const petGroupIds = (type, aura, bib) => [type, `${type}|${aura}`, `*|${aura}|${bib}`, `${type}|${aura}|${bib}`];
// Datos del juego desde public/gamedata.js (se relee si se regenera con npm run gamedata)
let gameCache = { mtime: 0, data: null };
function gameData() {
  try {
    const file = path.join(PUBLIC, "gamedata.js");
    const mtime = fs.statSync(file).mtimeMs;
    if (mtime !== gameCache.mtime) {
      const txt = fs.readFileSync(file, "utf8");
      gameCache = { mtime, data: JSON.parse(txt.slice(txt.indexOf("{"), txt.lastIndexOf("}") + 1)) };
    }
    return gameCache.data;
  } catch { return null; }
}
const petTraits = () => gameData()?.petNfts || null;
// Tus listados activos (de tu granja en caché) → { "pets-499": precio por unidad }. No son precio de
// mercado: si el floor del día es tu propio listado, no se guarda como floor.
function ownListingPrices() {
  const out = {};
  try {
    const f = JSON.parse(cache.get(`farm:${config.farmId}`)?.body || "null")?.farm;
    const G = gameData();
    for (const l of Object.values(f?.trades?.listings || {})) {
      const [[name, qty] = []] = Object.entries(l.items || {});
      if (!name || !l.sfl) continue;
      const pet = name.match(/^Pet #(\d+)$/), bud = name.match(/^Bud #(\d+)$/);
      const key = pet ? `pets-${pet[1]}` : bud ? `buds-${bud[1]}` : G?.itemIds?.[name] != null ? `collectibles-${G.itemIds[name]}` : G?.wearableIds?.[name] != null ? `wearables-${G.wearableIds[name]}` : null;
      if (key) out[key] = Math.min(out[key] ?? Infinity, l.sfl / Math.max(1, Number(qty) || 1));
    }
  } catch { /* sin granja en caché: no se filtra nada */ }
  return out;
}
const isOwnFloor = (own, key, it) => own[key] != null && it.floor > 0 && Math.abs(it.floor - own[key]) <= own[key] * 1e-6;
// Cada informe nuevo del mercado: foto diaria de precios y, en la nube, revisión de alertas premium
let lastAlertCheck = 0;
function onMarket(body) {
  recordPrices(body);
  if (!CLOUD || Date.now() - lastAlertCheck < (Number(process.env.ALERTS_MIN_INTERVAL_MS) || 5 * 60_000)) return;
  lastAlertCheck = Date.now();
  try {
    const d = JSON.parse(body).data;
    const [, report] = Object.entries(d?.reports || {}).sort().pop() || [];
    cloud.checkAlerts(report?.items).catch(() => {});
  } catch { /* informe ilegible: se revisará en el siguiente */ }
}
function recordPrices(body) {
  if (Date.now() - lastPriceWrite < 10 * 60_000) return;
  let d;
  try { d = JSON.parse(body).data; } catch { return; }
  const [date, report] = Object.entries(d?.reports || {}).sort().pop() || [];
  if (!date || !report?.items) return;
  const file = path.join(DATA_DIR, `prices-${date.slice(0, 7)}.json`);
  let month = {};
  try { month = JSON.parse(fs.readFileSync(file, "utf8")); } catch { /* mes nuevo */ }
  const day = {};
  const own = ownListingPrices();
  for (const [key, it] of Object.entries(report.items)) {
    // Si el floor es tu propio listado, vale la última venta (o nada)
    const p = isOwnFloor(own, key, it) ? it.latestSale : it.floor ?? it.latestSale;
    if (p) day[key] = Number(p.toPrecision(6));
  }
  day._flower = d.flowerPrice;
  // Pets y buds son únicos: se guarda también el floor de cada colección (el más barato a la venta)
  for (const col of ["pets", "buds"]) {
    const floors = Object.entries(report.items).filter(([k, it]) => k.startsWith(col + "-") && it.floor > 0 && !isOwnFloor(own, k, it)).map(([, it]) => it.floor);
    if (floors.length) day[`_col-${col}`] = Math.min(...floors);
  }
  // …y el valor de cada grupo de pets con el mismo boost (tipo, tipo+aura, aura+collar, los tres), con
  // los rasgos de gamedata.js: mediana de ventas si hay 3 o más, si no el más barato a la venta.
  // Misma regla que usa el dashboard para valorar tu pet, así su gráfico sigue a su grupo.
  const pets = petTraits();
  if (pets) {
    const groups = {};
    for (const [k, it] of Object.entries(report.items)) {
      const m = k.match(/^pets-(\d+)$/);
      const t = m && pets.ids[m[1]];
      if (!t) continue;
      const [type, aura, bib] = [pets.types[t[0]], pets.auras[t[2]], pets.bibs?.[t[3]]];
      for (const sid of petGroupIds(type, aura, bib)) {
        const g = (groups[sid] ||= { floors: [], sales: [], n: 0 });
        g.n++;
        if (it.floor > 0 && !isOwnFloor(own, k, it)) g.floors.push(it.floor);
        if (it.latestSale > 0) g.sales.push(it.latestSale);
      }
    }
    for (const [sid, g] of Object.entries(groups)) {
      g.sales.sort((a, b) => a - b);
      const v = g.sales.length >= 3 ? g.sales[g.sales.length >> 1] : g.floors.length ? Math.min(...g.floors) : null;
      if (v) { day[`_pet-${sid}`] = v; day[`_petn-${sid}`] = g.n; } // _petn: cuántos pets forman el grupo
    }
  }
  month[date] = day;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(month));
  lastPriceWrite = Date.now();
}
// Serie diaria de varios items leyendo cada archivo mensual una sola vez → { key: [{date, floor}] }
function priceSeriesMany(keys) {
  const out = Object.fromEntries(keys.map((k) => [k, []]));
  let files = [];
  try { files = fs.readdirSync(DATA_DIR).filter((f) => /^prices-\d{4}-\d{2}\.json$/.test(f)).sort(); } catch { return out; }
  for (const f of files) {
    try {
      const month = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), "utf8"));
      for (const [date, day] of Object.entries(month).sort()) {
        for (const k of keys) if (day[k] != null) out[k].push({ date, floor: day[k] });
      }
    } catch { /* archivo dañado: se ignora */ }
  }
  return out;
}
const priceSeries = (key) => priceSeriesMany([key])[key];

// ── Costes introducidos a mano ───────────────────────────────────────────────
const COSTS_FILE = path.join(DATA_DIR, "costs.json");
function readCosts() {
  try { return JSON.parse(fs.readFileSync(COSTS_FILE, "utf8")); } catch { return {}; }
}
function writeCosts(costs) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(COSTS_FILE, JSON.stringify(costs, null, 1));
}
// ── Avisos a Discord (webhook del propio jugador) ────────────────────────────
const DISCORD_HOOK_RE = /^https:\/\/(?:(?:ptb|canary)\.)?discord(?:app)?\.com\/api\/webhooks\/\d{5,25}\/[\w-]{20,100}$/;
const DEFAULT_NOTIFY_CATS = ["bees", "flowers", "pets", "crops", "fruits"];
const NOTIFY_GAP_MS = Number(process.env.SFL_NOTIFY_GAP_MS) || 60_000;
const notifyState = { pending: [], timer: null, lastSentAt: 0, lastError: null };
async function discordSend(content) {
  try {
    // A Discord solo va el texto del aviso: nunca la key ni datos de la granja más allá de lo que está listo
    // NOTIFY_WEBHOOK_OVERRIDE: solo para las pruebas (npm test), apunta al simulador
    const r = await fetch(process.env.NOTIFY_WEBHOOK_OVERRIDE || config.discordHook, { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "SFL Dashboard", content: content.slice(0, 1900) }), signal: AbortSignal.timeout(15_000) });
    if (!r.ok) throw new Error(`Discord respondió ${r.status}`);
    notifyState.lastSentAt = Date.now();
    notifyState.lastError = null;
    return true;
  } catch (e) {
    notifyState.lastError = { at: Date.now(), message: e.message };
    return false;
  }
}
function queueNotify(lines) {
  for (const l of lines) if (!notifyState.pending.includes(l)) notifyState.pending.push(l);
  if (notifyState.timer) return;
  const wait = Math.max(0, notifyState.lastSentAt + NOTIFY_GAP_MS - Date.now());
  notifyState.timer = setTimeout(async () => {
    notifyState.timer = null;
    const batch = notifyState.pending.splice(0, 20);
    if (batch.length && config.discordHook) await discordSend(`🌻 **Listo en tu granja**\n${batch.map((l) => `• ${l}`).join("\n")}`);
  }, wait);
}

const FRIENDS_FILE = path.join(DATA_DIR, "friends.json");
function readFriends() { try { return JSON.parse(fs.readFileSync(FRIENDS_FILE, "utf8")); } catch { return {}; } }
const visibleCosts = (costs) => Object.fromEntries(Object.entries(costs).filter(([, v]) => v?.value != null));

// Consulta el perfil cada 20 min aunque el dashboard esté cerrado en el navegador
async function backgroundArchive() {
  if (!config.apiKey) return;
  // Nube (o local sin granja): solo la foto diaria de precios del mercado, que es pública
  if (CLOUD || !config.farmId) {
    const a = await cached("data:type=marketplaceActivity", `${UPSTREAM}/data?type=marketplaceActivity`, TTL.marketplaceActivity);
    if (a.status === 200) onMarket(a.body);
    return;
  }
  const f = await cached(`farm:${config.farmId}`, `${UPSTREAM}/farms/${config.farmId}`, TTL.farm);
  if (f.status !== 200) return;
  const id = JSON.parse(f.body).id;
  const params = new URLSearchParams([["farmId", String(id)], ["type", "marketplaceProfile"]]);
  const r = await cached(`data:${params}`, `${UPSTREAM}/data?${params}`, TTL.marketplaceProfile);
  if (r.status === 200) {
    const n = archiveFromProfile(id, r.body);
    if (n) console.log(`  [historial] ${n} operaciones nuevas archivadas`);
  }
  // Y la foto de precios del día
  const a = await cached("data:type=marketplaceActivity", `${UPSTREAM}/data?type=marketplaceActivity`, TTL.marketplaceActivity);
  if (a.status === 200) onMarket(a.body);
}

// ── Rescate de compras antiguas ──────────────────────────────────────────────
// Cada NFT guarda sus 10 últimas ventas. Recorre los que le pases buscando operaciones tuyas y las
// archiva: así aparece lo que pagaste por NFTs comprados antes de las 50 que da tu perfil. Va de uno
// en uno por la cola normal (5,2 s entre llamadas), así que lo que pidas mientras tanto se intercala.
let rescan = { running: false, total: 0, done: 0, found: 0, startedAt: null, finishedAt: null, errors: 0 };
const tradeSideOf = (tr, me) => {
  const f = String(tr.fulfilledBy?.id), i = String(tr.initiatedBy?.id), m = String(me);
  if ((tr.source === "listing" && f === m) || (tr.source === "offer" && i === m)) return "buy";
  if ((tr.source === "listing" && i === m) || (tr.source === "offer" && f === m)) return "sell";
  return null;
};
async function runRescan(farmId, me, keys) {
  rescan = { running: true, total: keys.length, done: 0, found: 0, startedAt: Date.now(), finishedAt: null, errors: 0 };
  for (const key of keys) {
    const [collection, id] = key.split("-");
    const params = new URLSearchParams([["collection", collection], ["id", id], ["type", "tradeable"]]);
    try {
      const r = await cached(`data:${params}`, `${UPSTREAM}/data?${params}`, TTL.tradeable);
      if (r.status === 200) {
        const sales = JSON.parse(r.body)?.data?.history?.sales || [];
        const mine = sales.filter((s) => tradeSideOf(s, me)).map((s) => ({ ...s, itemId: s.itemId ?? Number(id), collection: s.collection ?? collection }));
        if (mine.length) rescan.found += archiveTrades(farmId, mine, "item");
      } else if (r.status !== 404) rescan.errors++;
    } catch { rescan.errors++; }
    rescan.done++;
  }
  rescan.running = false;
  rescan.finishedAt = Date.now();
}

async function readBody(req, max = 1_000_000) {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > max) throw new Error("Cuerpo demasiado grande");
  }
  return JSON.parse(raw || "{}");
}

// ── Nube: cuentas, sincronización y premium (solo con SFL_MODE=cloud) ────────
// Las consultas a SFL que hace la nube (p. ej. verificar una granja) van por la misma cola y caché.
function fetchData(type, params = {}) {
  const q = new URLSearchParams([...Object.entries(params).map(([k, v]) => [k, String(v)]), ["type", type]].sort());
  return cached(`data:${q}`, `${UPSTREAM}/data?${q}`, TTL[type] || 60_000);
}
const cloud = CLOUD
  ? require("./cloud/server").createCloud({
    dataDir: process.env.CLOUD_DATA_DIR || path.join(DATA_DIR, "cloud"), publicUrl: CLOUD_URL, send,
    readBody: (req) => readBody(req, 8_000_000), fetchData,
  })
  : null;
// App local: cliente de sincronización con la nube (el token del ordenador vive en config.json)
const cloudClient = CLOUD ? null : require("./cloud/client").createCloudClient({
  dataDir: DATA_DIR, getConfig: () => config, saveConfig, log: (m) => console.log(m),
});
// App local: sincronización de data/ por GitHub (activa por defecto si esta carpeta es un clon del repo;
// se apaga en Ajustes con config.gitSync = false). Es la opción sin nube para quien usa varios ordenadores.
const gitSync = CLOUD ? null : require("./cloud/gitsync").createGitSync({ repoDir: ROOT, dataDir: DATA_DIR, log: (m) => console.log(m) });
// App local: volcado nocturno de todas las granjas → data/dump/ (se activa en Ajustes: son ~800 MB al día)
// Datos del juego al día (public/gamedata.js se regenera solo si falta o tiene más de 7 días)
const gameUpdater = require("./cloud/gamedata-updater").createGameDataUpdater({ root: ROOT, log: (m) => console.log(m) });
const GAMEDATA_AUTO = process.env.SFL_GAMEDATA_AUTO !== "0";
const DUMP_MIN_GAP_MS = Number(process.env.SFL_DUMP_MIN_GAP_MS) || 10 * 60_000;
const nightly = CLOUD ? null : require("./cloud/nightly").createNightly({
  dataDir: DATA_DIR, publicDir: PUBLIC, fetchData, getConfig: () => config, log: (m) => console.log(m),
});
const gitSyncOn = () => Boolean(gitSync && config.gitSync !== false && gitSync.state.available);
let syncTimer = null, gitTimer = null;
function cloudSyncSoon() {
  // Costes u operaciones nuevas: a GitHub en 1 min (agrupando cambios seguidos) y a la nube en 5 s
  if (gitSyncOn()) { clearTimeout(gitTimer); gitTimer = setTimeout(() => gitSync.sync().catch(() => {}), 60_000); }
  if (!cloudClient?.status().linked) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => cloudClient.sync().catch(() => {}), 5_000);
}
// Confirma a la nube qué granja usa este ordenador (vínculo provisional, validado con su propia key)
async function cloudClaimFarm() {
  if (!cloudClient?.status().linked || !config.apiKey || !config.farmId) return;
  const f = await cached(`farm:${config.farmId}`, `${UPSTREAM}/farms/${config.farmId}`, TTL.farm);
  if (f.status !== 200) return;
  const d = JSON.parse(f.body);
  await cloudClient.claimFarm(d.nft_id ?? d.id ?? config.farmId, d.farm?.username);
}
// Documento sincronizado del usuario con sesión web (nube)
function cloudDoc(user, doc) {
  const row = cloud.db.prepare("SELECT body FROM sync_docs WHERE user_id = ? AND doc = ?").get(user.id, doc);
  return row ? JSON.parse(row.body) : null;
}
function cloudPutDoc(user, doc, body) {
  const { mergeDoc } = require("./cloud/merge");
  const cur = cloudDoc(user, doc);
  const merged = cur ? mergeDoc(doc, cur, body) : body;
  cloud.db.prepare(`INSERT INTO sync_docs (user_id, doc, body, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, doc) DO UPDATE SET body = excluded.body, updated_at = excluded.updated_at`).run(user.id, doc, JSON.stringify(merged), Date.now());
  return merged;
}

async function handleApi(req, res, url) {
  const p = url.pathname;

  if (p === "/api/status") return send(res, 200, { ...status(), mode: CLOUD ? "cloud" : "local", cloud: cloudClient ? cloudClient.status() : null });

  if (!CLOUD && (p === "/api/gitsync" || p === "/api/gitsync/now")) {
    const out = () => ({ ...gitSync.status(), enabled: config.gitSync !== false });
    if (req.method === "GET") return send(res, 200, out());
    if (p === "/api/gitsync") {
      const body = await readBody(req).catch(() => ({}));
      saveConfig({ gitSync: Boolean(body.enabled) });
      if (body.enabled) { await gitSync.check(); gitSync.sync({ force: true }).catch(() => {}); }
      return send(res, 200, out());
    }
    await gitSync.check();
    await gitSync.sync({ force: true });
    return send(res, 200, out());
  }

  // Avisos a Discord: tu webhook (config.json, nunca vuelve al navegador) y las categorías elegidas. Los manda
  // el dashboard cuando algo queda listo; el servidor los agrupa y como mucho envía uno por minuto.
  if (!CLOUD && p === "/api/gamedata/update") {
    if (req.method !== "POST") return send(res, 200, gameUpdater.status());
    gameUpdater.update({ force: true }).catch(() => {}); // en segundo plano: ~20 s
    return send(res, 202, { ...gameUpdater.status(), running: true });
  }

  if (!CLOUD && p.startsWith("/api/notify")) {
    const out = () => ({ configured: Boolean(config.discordHook), cats: config.discordCats || DEFAULT_NOTIFY_CATS, lastError: notifyState.lastError, lastSentAt: notifyState.lastSentAt });
    if (req.method === "GET" && p === "/api/notify") return send(res, 200, out());
    if (req.method !== "POST") return send(res, 405, { error: "Método no permitido" });
    let body;
    try { body = await readBody(req); } catch { return send(res, 400, { error: "JSON inválido" }); }
    if (p === "/api/notify/config") {
      const patch = {};
      if (body.clear) patch.discordHook = null;
      else if (body.url != null && String(body.url).trim()) {
        const u = String(body.url).trim();
        if (!DISCORD_HOOK_RE.test(u)) return send(res, 400, { error: "No parece un webhook de Discord (https://discord.com/api/webhooks/…)" });
        patch.discordHook = u;
      }
      if (Array.isArray(body.cats)) patch.discordCats = body.cats.filter((c) => /^[a-zA-Z]{1,20}$/.test(c)).slice(0, 30);
      saveConfig(patch);
      return send(res, 200, out());
    }
    if (!config.discordHook) return send(res, 400, { error: "Primero guarda tu webhook de Discord" });
    if (p === "/api/notify/test") {
      const ok = await discordSend("🌻 Prueba del SFL Dashboard: los avisos llegarán aquí.");
      return send(res, ok ? 200 : 502, ok ? out() : { error: notifyState.lastError?.message || "Discord no respondió" });
    }
    if (p === "/api/notify") {
      const lines = (Array.isArray(body.lines) ? body.lines : []).map((l) => String(l).slice(0, 200)).slice(0, 20);
      if (!lines.length) return send(res, 400, { error: "Nada que avisar" });
      queueNotify(lines);
      return send(res, 202, out());
    }
    return send(res, 404, { error: "Ruta desconocida" });
  }

  // Un amigo en directo: su granja ahora (por la cola, con caché) con las métricas del volcado
  const live = !CLOUD && p.match(/^\/api\/friends\/live\/(\d{1,20})$/);
  if (live) {
    if (!config.apiKey) return send(res, 401, { error: "Falta la API key. Pégala en Ajustes." });
    const r = await cached(`farm:${live[1]}`, `${UPSTREAM}/farms/${live[1]}`, TTL.farm);
    if (r.status !== 200) return send(res, r.status, r.body || "{}");
    const d = JSON.parse(r.body);
    return send(res, 200, { id: d.id, nftId: d.nft_id ?? null, username: d.farm?.username || null, island: d.farm?.island?.type || "basic",
      equipped: d.farm?.bumpkin?.equipped || null, metrics: nightly.liveMetrics(d.farm), at: r.at }, { "x-fetched-at": String(r.at), "x-cache": r.cache });
  }

  // Amigos: granjas que sigues (data/friends.json, se mezcla entre ordenadores como los costes)
  if (!CLOUD && p === "/api/friends") {
    if (req.method === "GET") return send(res, 200, visibleCosts(readFriends()));
    if (req.method !== "POST") return send(res, 405, { error: "Método no permitido" });
    let body;
    try { body = await readBody(req); } catch { return send(res, 400, { error: "JSON inválido" }); }
    const id = String(body.id ?? "").trim();
    if (!/^\d{1,20}$/.test(id)) return send(res, 400, { error: "ID de granja inválido" });
    const all = readFriends();
    all[id] = body.remove ? { value: null, at: Date.now() } : { value: { name: String(body.name || "").slice(0, 40) || null }, at: Date.now() };
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(FRIENDS_FILE, JSON.stringify(all, null, 1));
    cloudSyncSoon();
    return send(res, 200, visibleCosts(all));
  }

  if (!CLOUD && p.startsWith("/api/dump")) {
    if (p === "/api/dump/summary") {
      const s = nightly.summary(url.searchParams.get("date"));
      return s ? send(res, 200, s) : send(res, 404, { error: "Todavía no hay ningún volcado procesado" });
    }
    if (req.method === "GET" && p === "/api/dump") return send(res, 200, nightly.status());
    if (p === "/api/dump/history") {
      const ids = (url.searchParams.get("ids") || "").split(",").filter((x) => /^\d{1,20}$/.test(x)).slice(0, 50);
      return send(res, 200, nightly.history(ids));
    }
    if (req.method !== "POST") return send(res, 405, { error: "Método no permitido" });
    if (p === "/api/dump") {
      const body = await readBody(req).catch(() => ({}));
      saveConfig({ nightlyDump: Boolean(body.enabled) });
      if (body.enabled && config.apiKey) nightly.ingest().then(() => cloudSyncSoon()).catch(() => {});
      return send(res, 200, nightly.status());
    }
    if (p === "/api/dump/now") {
      if (!config.apiKey) return send(res, 401, { error: "Falta la API key. Pégala en Ajustes." });
      // Cada vez son ~800 MB: como mucho una cada 10 min (salvo que la anterior fallara)
      const st = nightly.status();
      const wait = st.lastRunAt && !st.lastError ? st.lastRunAt + DUMP_MIN_GAP_MS - Date.now() : 0;
      if (st.running) return send(res, 409, { error: "Ya se está procesando", ...st });
      if (wait > 0) return send(res, 429, { error: `Ya se procesó hace poco: espera ${Math.ceil(wait / 60_000)} min`, ...st });
      nightly.ingest({ force: true }).then(() => cloudSyncSoon()).catch(() => {}); // en segundo plano: ~1-2 min
      return send(res, 202, { ...nightly.status(), running: true });
    }
    return send(res, 404, { error: "Ruta desconocida" });
  }

  if (CLOUD) {
    if (await cloud.handle(req, res, url)) return;
    // En la nube no hay configuración ni tareas pesadas desde el navegador
    if (p === "/api/config" || p === "/api/rescan") return send(res, 403, { error: "No disponible en la versión web" });
    // Costes e historial: los de tu cuenta (sincronizados desde tu app), nunca archivos compartidos
    if (p === "/api/costs" || p === "/api/history") {
      const user = cloud.userFromSession(req);
      if (p === "/api/costs") {
        if (req.method === "POST") {
          if (!user) return send(res, 401, { error: "Entra con Discord para guardar tus precios de compra" });
          let body;
          try { body = await readBody(req); } catch { return send(res, 400, { error: "JSON inválido" }); }
          const patch = body.costs && typeof body.costs === "object" ? body.costs : { [body.key]: body.value };
          const now = Date.now(), upd = {};
          for (const [k, v] of Object.entries(patch)) {
            if (!k || k === "undefined") continue;
            upd[k] = v == null || v === "" || !Number.isFinite(Number(v)) || Number(v) < 0 ? { value: null, at: now } : { value: Number(v), at: now };
          }
          return send(res, 200, visibleCosts(cloudPutDoc(user, "costs", upd)));
        }
        return send(res, 200, user ? visibleCosts(cloudDoc(user, "costs") || {}) : {});
      }
      const farmId = url.searchParams.get("farmId") || "";
      if (req.method === "POST") {
        if (!user) return send(res, 200, { added: 0 });
        let body;
        try { body = await readBody(req); } catch { return send(res, 400, { error: "JSON inválido" }); }
        const trades = Object.fromEntries((body.trades || []).filter((t) => t?.id).map((t) => [t.id, { ...t, via: body.via || "item" }]));
        cloudPutDoc(user, `trades:${String(body.farmId).replace(/[^A-Za-z0-9]/g, "")}`, { trades });
        return send(res, 200, { added: Object.keys(trades).length });
      }
      const doc = user && /^[A-Za-z0-9]+$/.test(farmId) ? cloudDoc(user, `trades:${farmId}`) : null;
      return send(res, 200, { trades: Object.values(doc?.trades || {}), updatedAt: doc?.updatedAt || null });
    }
  } else if (p === "/api/cloud" || p.startsWith("/api/cloud/")) {
    // App local ↔ nube: vincular con un código, sincronizar y desvincular
    if (p === "/api/cloud") return send(res, 200, cloudClient.status());
    if (req.method !== "POST") return send(res, 405, { error: "Método no permitido" });
    try {
      if (p === "/api/cloud/link") {
        const body = await readBody(req);
        await cloudClient.link(body.url, body.code);
        await cloudClient.sync({ full: true });
        await cloudClaimFarm().catch(() => {});
        return send(res, 200, cloudClient.status());
      }
      if (p === "/api/cloud/sync") { await cloudClient.sync({ full: true }); return send(res, 200, cloudClient.status()); }
      if (p === "/api/cloud/unlink") { cloudClient.unlink(); return send(res, 200, cloudClient.status()); }
    } catch (e) {
      return send(res, 400, { error: e.message });
    }
    return send(res, 404, { error: "Ruta desconocida" });
  }

  if (p === "/api/history") {
    if (req.method === "POST") {
      let body;
      try { body = await readBody(req); } catch { return send(res, 400, { error: "JSON inválido" }); }
      const added = archiveTrades(body.farmId, body.trades, body.via || "item");
      return send(res, 200, { added });
    }
    const farmId = url.searchParams.get("farmId");
    if (!farmId) return send(res, 400, { error: "Falta farmId" });
    const a = readArchive(farmId);
    return send(res, 200, { trades: Object.values(a.trades), updatedAt: a.updatedAt || null });
  }

  // Foto diaria de tu patrimonio (data/wealth-<granja>.json): la manda el dashboard al calcularlo, como mucho
  // cada 30 min; una entrada por día (la última del día gana). Viaja por GitHub con el resto de data/.
  if (p === "/api/wealth") {
    const farmId = String(url.searchParams.get("farmId") || "");
    if (!/^\d{1,20}$/.test(farmId)) return send(res, 400, { error: "farmId inválido" });
    const file = path.join(DATA_DIR, `wealth-${farmId}.json`);
    let doc = {};
    try { doc = JSON.parse(fs.readFileSync(file, "utf8")); } catch { /* aún no hay */ }
    if (req.method !== "POST") return send(res, 200, doc);
    let body;
    try { body = await readBody(req); } catch { return send(res, 400, { error: "JSON inválido" }); }
    const s = body.snapshot || {};
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s.date || "") || !Number.isFinite(s.total)) return send(res, 400, { error: "Foto inválida" });
    const items = Object.fromEntries(Object.entries(s.items || {}).filter(([k, v]) => /^[\w|*# -]{1,80}$/.test(k) && Array.isArray(v)).slice(0, 400)
      .map(([k, [q, v]]) => [k, [Number(q) || 0, Number(v) || 0]]));
    doc[s.date] = { total: s.total, balance: Number(s.balance) || 0, inv: Number(s.inv) || 0, items, at: Date.now() };
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(doc));
    cloudSyncSoon();
    return send(res, 200, { ok: true, days: Object.keys(doc).length });
  }

  if (p === "/api/prices") {
    const many = url.searchParams.get("keys");
    if (many) {
      const keys = [...new Set(many.split(",").map((k) => k.trim()).filter(Boolean))].slice(0, 500);
      return send(res, 200, { series: priceSeriesMany(keys) });
    }
    const key = url.searchParams.get("key");
    if (!key) return send(res, 400, { error: "Falta key" });
    return send(res, 200, { key, series: priceSeries(key) });
  }

  if (p === "/api/costs") {
    if (req.method === "POST") {
      let body;
      try { body = await readBody(req); } catch { return send(res, 400, { error: "JSON inválido" }); }
      const costs = readCosts();
      // Acepta un coste suelto {key, value} o varios a la vez {costs: {...}} (migración desde el navegador)
      const patch = body.costs && typeof body.costs === "object" ? body.costs : { [body.key]: body.value };
      for (const [k, v] of Object.entries(patch)) {
        if (!k || k === "undefined") continue;
        // Borrar deja una marca con su hora (value: null) para que la sincronización no lo resucite
        if (v == null || v === "" || !Number.isFinite(Number(v)) || Number(v) < 0) { if (costs[k]) costs[k] = { value: null, at: Date.now() }; }
        else costs[k] = { value: Number(v), at: costs[k]?.value === Number(v) ? costs[k].at : Date.now() };
      }
      writeCosts(costs);
      cloudSyncSoon();
      return send(res, 200, visibleCosts(costs));
    }
    return send(res, 200, visibleCosts(readCosts()));
  }

  if (p === "/api/config" && req.method === "POST") {
    let body;
    try {
      body = await readBody(req);
    } catch {
      return send(res, 400, { error: "JSON inválido" });
    }
    const patch = {};
    if (typeof body.apiKey === "string" && body.apiKey.trim()) {
      if (!body.apiKey.trim().startsWith("sfl.")) return send(res, 400, { error: "La key debe empezar por sfl." });
      patch.apiKey = body.apiKey.trim();
      cache.clear();
    }
    if (body.farmId !== undefined) patch.farmId = String(body.farmId).trim() || null;
    saveConfig(patch);
    return send(res, 200, status());
  }

  // OpenSea: su key (propia o gratuita automática) se queda en el servidor
  if (p === "/api/ext/opensea") {
    const r = await openseaCached();
    return send(res, r.status, r.body || "{}", { "x-fetched-at": String(r.at), "x-cache": r.cache });
  }

  // sfl.world no necesita key
  const ext = p.match(/^\/api\/ext\/([a-z]+)(?:\/([^/]+))?$/);
  if (ext) {
    const def = EXT[ext[1]];
    if (!def) return send(res, 404, { error: "Fuente desconocida" });
    let arg;
    try { arg = ext[2] === undefined ? undefined : decodeURIComponent(ext[2]).trim(); } catch { arg = null; }
    if (def.arg ? !def.arg.test(arg || "") : arg !== undefined) return send(res, 400, { error: "Parámetro inválido" });
    const key = `ext:${ext[1]}:${String(arg ?? "").toLowerCase()}`;
    const base = def.site ? WORLD.replace(/\/api\/?$/, "") : WORLD; // las páginas cuelgan de la web, no de /api
    const r = await extCached(key, base + def.url(arg), def.ttl, def.parse);
    return send(res, r.status, r.body || "{}", { "x-fetched-at": String(r.at), "x-cache": r.cache });
  }

  if (!config.apiKey) return send(res, 401, { error: "Falta la API key. Pégala en Ajustes." });

  const meta = (r) => ({
    "x-cache": r.cache,
    "x-fetched-at": String(r.at),
    "x-server-offset": String(serverOffsetMs),
  });

  if (p === "/api/rescan") {
    if (req.method !== "POST") return send(res, 200, rescan);
    if (rescan.running) return send(res, 409, { error: "Ya hay una búsqueda en marcha", ...rescan });
    let body;
    try { body = await readBody(req); } catch { return send(res, 400, { error: "JSON inválido" }); }
    const keys = [...new Set((Array.isArray(body.keys) ? body.keys : []).filter((k) => /^(collectibles|wearables|pets|buds)-\d+$/.test(k)))].slice(0, 400);
    if (!body.farmId || body.me == null || !keys.length) return send(res, 400, { error: "Faltan farmId, me o keys" });
    runRescan(String(body.farmId), body.me, keys);
    return send(res, 202, rescan);
  }

  const farm = p.match(/^\/api\/farm\/([A-Za-z0-9]+)$/);
  if (farm) {
    const r = await cached(`farm:${farm[1]}`, `${UPSTREAM}/farms/${farm[1]}`, TTL.farm);
    return send(res, r.status, r.body || "{}", meta(r));
  }

  if (p === "/api/data") {
    const type = url.searchParams.get("type");
    if (!DATA_TYPES.has(type)) return send(res, 400, { error: `type no soportado: ${type}` });
    const params = new URLSearchParams([...url.searchParams].sort());
    let ttl = TTL[type];
    if (type === "marketplaceActivity" && params.get("date")) ttl = TTL.marketplaceActivityPast;
    const r = await cached(`data:${params}`, `${UPSTREAM}/data?${params}`, ttl);
    // Solo se archiva el historial de tu granja: ver otras (?farm=, fichas de jugador) no llena data/ de granjas ajenas
    if (type === "marketplaceProfile" && r.status === 200 && (CLOUD || isOwnFarm(params.get("farmId")))) archiveFromProfile(params.get("farmId"), r.body);
    if (type === "marketplaceActivity" && !params.get("date") && r.status === 200) onMarket(r.body);
    return send(res, r.status, r.body || "{}", meta(r));
  }

  return send(res, 404, { error: "Ruta desconocida" });
}

// Archivos del dashboard: ETag (el navegador pregunta y recibe un 304 si no cambió) y gzip para el texto.
// En local apenas se nota; en la versión web ahorra ~75% de transferencia (gamedata.js 300 KB → ~60 KB).
const gzCache = new Map(); // archivo → { etag, gz }
function serveStatic(req, res, pathname) {
  const rel = pathname === "/" ? "index.html" : decodeURIComponent(pathname).replace(/^\/+/, "");
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC + path.sep)) return send(res, 403, { error: "No" });
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, { error: "No encontrado" });
    const etag = `W/"${st.size.toString(36)}-${Math.floor(st.mtimeMs).toString(36)}"`;
    const type = MIME[path.extname(file)] || "application/octet-stream";
    const head = { "content-type": type, "cache-control": "no-cache", etag, vary: "accept-encoding", ...SECURITY_HEADERS };
    if (req.headers["if-none-match"] === etag) { res.writeHead(304, head); return res.end(); }
    fs.readFile(file, (err2, data) => {
      if (err2) return send(res, 404, { error: "No encontrado" });
      const gzipOk = /\bgzip\b/.test(req.headers["accept-encoding"] || "") && /text|javascript|json|svg/.test(type) && data.length > 1024;
      if (!gzipOk) { res.writeHead(200, head); return res.end(data); }
      let c = gzCache.get(file);
      if (!c || c.etag !== etag) { c = { etag, gz: zlib.gzipSync(data) }; gzCache.set(file, c); }
      res.writeHead(200, { ...head, "content-encoding": "gzip" });
      res.end(c.gz);
    });
  });
}

const server = http.createServer((req, res) => {
  if (!allowedHost(req.headers.host)) return send(res, 403, { error: "Host no permitido" });
  if (!["GET", "POST", "PUT"].includes(req.method)) return send(res, 405, { error: "Método no permitido" });
  let url;
  try {
    url = new URL(req.url, "http://localhost");
    decodeURIComponent(url.pathname);
  } catch {
    return send(res, 400, { error: "URL inválida" });
  }
  // Escrituras: solo JSON y desde el propio dashboard (o sin Origin: servidor a servidor). El webhook de
  // pagos de la nube es la única excepción (llega como formulario y se valida con su token).
  const webhook = CLOUD && url.pathname === "/api/billing/kofi";
  if (req.method !== "GET" && !webhook && !sameOriginWrite(req)) return send(res, 403, { error: "Origen no permitido" });
  if (CLOUD && url.pathname.startsWith("/api/") && !rateOk(req)) return send(res, 429, { error: "Demasiadas peticiones: espera un momento" });
  if (url.pathname.startsWith("/api/") || (CLOUD && url.pathname.startsWith("/auth/"))) {
    handleApi(req, res, url).catch((err) => send(res, 500, { error: err.message }));
  } else {
    serveStatic(req, res, url.pathname);
  }
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Local: solo escucha en 127.0.0.1 (la key no queda expuesta a tu red). Nube: en todas las interfaces,
// detrás del proxy HTTPS del alojamiento.
server.listen(config.port, CLOUD ? process.env.HOST || "0.0.0.0" : "127.0.0.1", () => {
  console.log(`\n  🌻 SFL Dashboard${CLOUD ? " (nube)" : ""} → ${CLOUD ? CLOUD_URL : `http://localhost:${config.port}`}\n`);
  if (!config.apiKey) console.log(CLOUD ? "  (falta SFL_API_KEY del administrador)\n" : "  (sin API key: pégala en Ajustes dentro del dashboard)\n");
  if (CLOUD) {
    const c = cloud.info();
    console.log(`  login Discord: ${c.discord ? "sí" : "NO (DISCORD_CLIENT_ID)"}${c.devLogin ? " · login de pruebas ACTIVADO" : ""} · premium: ${c.premium ? "activado" : "apagado"}\n`);
  }
  setTimeout(() => backgroundArchive().catch(() => {}), 15_000);
  setInterval(() => backgroundArchive().catch(() => {}), 20 * 60_000);
  if (cloudClient) {
    setTimeout(() => cloudClient.sync().catch(() => {}), 20_000);
    setInterval(() => cloudClient.sync().catch(() => {}), 10 * 60_000);
  }
  // Datos del juego: si faltan, ya; si tienen más de 7 días, a los 2 min y luego una vez al día. Cada 10 min se
  // comprueba que el archivo sigue ahí (git lo quita en los ordenadores que aún lo tenían en el repositorio)
  if (GAMEDATA_AUTO) {
    gameUpdater.ensure().catch(() => {});
    setTimeout(() => gameUpdater.update().catch(() => {}), 2 * 60_000);
    setInterval(() => gameUpdater.update().catch(() => {}), 24 * 3600_000);
    setInterval(() => gameUpdater.ensure().catch(() => {}), 10 * 60_000);
  }
  // Volcado nocturno: sale hacia las 22:00 UTC; cada hora se mira si hay uno nuevo (1 consulta al índice)
  if (nightly) {
    const tick = () => { if (config.nightlyDump && config.apiKey) nightly.ingest().then((s) => { if (!s.lastError) cloudSyncSoon(); }).catch(() => {}); };
    setTimeout(tick, 90_000);
    setInterval(tick, 60 * 60_000);
  }
  // GitHub: al arrancar trae lo del otro ordenador (y sube lo propio), luego cada 15 min
  if (gitSync && config.gitSync !== false) {
    gitSync.check().then((ok) => {
      if (!ok) return;
      console.log(`  Sincronización de data/ con GitHub: activa (${gitSync.state.available.remote})\n`);
      setTimeout(() => gitSync.sync({ force: true }).catch(() => {}), 5_000);
      setInterval(() => { if (config.gitSync !== false) gitSync.sync().catch(() => {}); }, 15 * 60_000);
    });
  }
});
