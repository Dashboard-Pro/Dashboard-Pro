// SFL Console — Utilidades, sprites pixel e iconos del juego, componentes reutilizables.
// Scripts clásicos que comparten el ámbito global en el orden de index.html (antes, un solo app.js).
"use strict";


const G = window.GAME;
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

/* ════════════════════════════════════════════════════════════════════════
   1. Utilidades
   ════════════════════════════════════════════════════════════════════════ */
function readLS(k, d) {
  try { const v = localStorage.getItem("sfl-dash:" + k); return v == null ? d : JSON.parse(v); } catch { return d; }
}
function writeLS(k, v) {
  try { localStorage.setItem("sfl-dash:" + k, JSON.stringify(v)); } catch { /* sin almacenamiento */ }
}

const S = {
  page: null,
  farmId: null,
  homeFarm: null, // la granja configurada (Ajustes o tu cuenta)
  viewing: null, // otra granja abierta con ?farm=ID: solo lectura, no se guarda nada suyo en data/
  clockOffset: 0,
  rangeH: readLS("range", 24),
  farmFilter: null,
  boardAll: false,
  marketTab: "all",
  marketSort: readLS("msort", { key: "todayVolume", dir: -1 }),
  marketQuery: "",
  marketCol: "",
  marketLimit: 120,
  board: "coins",
  skillTree: readLS("tree", "Crops"),
  skillFilter: "all",
  coinRate: readLS("coinRate", null), // coins por FLOWER (null = tasa oficial del banco)
  p2pTax: readLS("tax", true), // descontar el 10% de comisión al valorar lo que entregas
  ticketBoost: readLS("tboost", null), // tickets extra por boosts del capítulo (null = automático)
  visitH: readLS("visitH", 8), // cada cuántas horas entras al juego
  simSet: new Set(readLS("simSet", [])), // boosts que estás probando en el Simulador
  simKind: "all",
  simAll: false,
  mapLayers: new Set(readLS("mapLayers", ["res", "crops", "build", "deco"])), // capas del Mapa
  mapZoom: 1,
  mapReady: false,
  refTab: readLS("refTab", "chests"), // pestaña de Referencia
  refChest: "BASIC_REWARDS",
  costs: readLS("costs", {}), // coste de compra por unidad introducido a mano (clave de mercado → FLOWER)
  showDone: false,
  histType: "all",
  nftSort: readLS("nsort", { key: "value", dir: -1 }),
  nftCol: "all",
  auHistQ: "",
  missionTab: readLS("missionTab", "orders"),
  stratTab: readLS("stratTab", "flower"),
  supplyView: readLS("supplyView", "resources"),
  friendSel: readLS("friendSel", null),
  friendLive: {}, // id → granja en directo (botón ↻ en Amigos), solo en memoria
  gameIcons: readLS("gameIcons", true),
  watch: new Set(readLS("watch", [])),
  notify: readLS("notify", false),
  notified: new Set(),
  mounts: [],
  busy: 0,
};
const now = () => Date.now() + S.clockOffset;

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const nfCache = {};
const nf = (d) => (nfCache[d] ||= new Intl.NumberFormat(LOCALE, { maximumFractionDigits: d }));
function fmt(n, d) {
  if (n == null || Number.isNaN(n)) return "—";
  const a = Math.abs(n);
  if (d == null) d = a >= 1000 ? 0 : a >= 10 ? 1 : a >= 1 ? 2 : a >= 0.01 ? 4 : 6;
  return nf(d).format(n);
}
const compactF = new Intl.NumberFormat(LOCALE, { notation: "compact", maximumFractionDigits: 1 });
const compact = (n) => (n == null || Number.isNaN(n) ? "—" : compactF.format(n));
const pct = (n, d = 1) => {
  if (n == null || !Number.isFinite(n)) return "—";
  if (Math.abs(n) < 0.5 * 10 ** -d) return "0%";
  return `${n > 0 ? "+" : ""}${fmt(n, d)}%`;
};
const toNum = (v) => (v == null ? 0 : Number(v) || 0);
// La API devuelve fechas como ISO o como epoch ms en texto ("1790122895647").
const toTs = (v) => (v == null ? NaN : /^\d+$/.test(String(v)) ? Number(v) : Date.parse(v));
const clamp01 = (x) => Math.min(1, Math.max(0, x));

function dur(ms) {
  if (ms <= 0) return "LISTO";
  const s = Math.ceil(ms / 1000);
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (d) return `${d}d ${String(h).padStart(2, "0")}h`;
  if (h) return `${h}h ${String(m).padStart(2, "0")}m`;
  if (m) return `${m}m ${String(sec).padStart(2, "0")}s`;
  return `${sec}s`;
}
function ago(ts) {
  const s = Math.round((now() - ts) / 1000);
  if (!Number.isFinite(s)) return "—";
  if (s < 60) return "ahora";
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`;
  return `hace ${Math.floor(s / 86400)} d`;
}
const hhmm = (ts) => new Date(ts).toLocaleTimeString(LOCALE, { hour: "2-digit", minute: "2-digit" });
// "14:05" si es en las próximas 24 h, "jue 14:05" si más tarde
const at = (ts) => (Math.abs(ts - now()) < 20 * 3600_000 ? hhmm(ts) : new Date(ts).toLocaleString(LOCALE, { weekday: "short", hour: "2-digit", minute: "2-digit" }));
const dateShort = (ts) => new Date(ts).toLocaleString(LOCALE, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
const utcDay = (offsetDays = 0) => new Date(Date.now() - offsetDays * 86400_000).toISOString().slice(0, 10);

function toast(msg, ms = 3000) {
  const t = $("#toast");
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), ms);
}

/* ════════════════════════════════════════════════════════════════════════
   2. Sprites pixel-art (8×8). Una letra = un color de la paleta.
   ════════════════════════════════════════════════════════════════════════ */
const PAL = {
  Y: "#f5c542", O: "#9a6212", H: "#fff6d6", G: "#6fbf4a", g: "#3f8a3a", B: "#8a5a2b", b: "#5c3b1e",
  R: "#e0526b", r: "#9c2f45", W: "#f1dfb8", K: "#3b2a1a", S: "#aeb8b1", s: "#6f7a74", L: "#e3eae5",
  P: "#f08bd0", C: "#c46a3c", A: "#f0a24a", a: "#b8711f", V: "#8c8cff", v: "#d6d6ff", T: "#6cb4ee", t: "#3d7fb8",
  I: "#c98b62", i: "#8e5a3a", x: "currentColor",
};
const SPRITES = {
  sun: ["...YY...", ".Y.YY.Y.", "..YYYY..", "YYYOOYYY", "YYYOOYYY", "..YYYY..", ".Y.YY.Y.", "...YY..."],
  sprout: ["........", ".GG...GG", ".gGG.GGg", "...gG...", "....G...", ".BBBBBB.", "BBbBBbBB", ".BBBBBB."],
  coin: ["..YYYY..", ".YYYYYO.", "YYHYYYYO", "YHYYYYYO", "YYYYYYYO", "YYYYYYYO", ".YYYYOO.", "..OOOO.."],
  trophy: ["YYYYYYYY", "YOYYYYOY", "YOYYYYOY", ".YYYYYO.", "..YYYO..", "...YO...", "..BBBB..", ".BBBBBB."],
  calendar: [".K....K.", "RRRRRRRR", "rrrrrrrr", "WWWWWWWW", "WKWWKWWW", "WWWWWWWW", "WWKWWKWW", "WWWWWWWW"],
  gear: ["...SS...", ".S.SS.S.", "..SSSS..", "SSS..SSS", "SSS..SSS", "..SSSS..", ".S.SS.S.", "...SS..."],
  carrot: [".....G.G", "......G.", "....AA..", "...AAA..", "..AAa...", ".AAa....", ".Aa.....", "A......."],
  apple: ["....B...", "...BG...", ".RRRRRR.", "RRHRRRRR", "RRRRRRRR", "RRRRRRRr", ".RRRRRr.", "..RR.R.."],
  flower: ["........", "...PP...", "..PYYP..", "...PP...", "....G...", "..G.G...", "...GG...", "....G..."],
  pot: ["...GG...", "..GgGG..", "...GG...", "....G...", ".CCCCCC.", "..CCCC..", "..CCCC..", "...CC..."],
  tree: ["..GGGG..", ".GGGGgG.", "GGGGGGGG", "GgGGGGgG", ".GGGGGG.", "...BB...", "...BB...", "..BBBB.."],
  stone: ["........", "..SSSS..", ".SLSSSS.", "SSLSSSSs", "SSSSSSSs", "SSSSSSss", ".sssss..", "........"],
  iron: ["........", "..IIII..", ".ILIIII.", "IILIIIIi", "IIIIIIIi", "IIIIIIii", ".iiiii..", "........"],
  gold: ["........", "..YYYY..", ".YHYYYY.", "YYHYYYYO", "YYYYYYYO", "YYYYYYOO", ".OOOOO..", "........"],
  crim: ["........", "..RRRR..", ".RHRRRr.", "RRRRRRRr", ".RRRRRr.", "..RRRr..", "...Rr...", "........"],
  sunst: ["........", "..AAAA..", ".AHAAAa.", "AAAAAAAa", ".AAAAAa.", "..AAAa..", "...Aa...", "........"],
  oil: ["...V....", "...V....", "..VVV...", ".VVVVV..", ".VvVVV..", ".VVVVV..", "..VVV...", "........"],
  cook: [".S..S...", "..S..S..", "........", "AAAAAAAA", ".AAAAAA.", ".AAAAAa.", "..AAaa..", "........"],
  compost: [".bbbbbb.", "BBBBBBBB", ".BGBBGB.", ".BBBBBB.", ".BBGBBB.", ".BBBBGB.", ".BBBBBB.", "........"],
  machine: ["...TT...", ".T.TT.T.", "..TTTT..", "TTT..TTT", "TTT..TTT", "..TTTT..", ".T.TT.T.", "...TT..."],
  chicken: ["...RR...", "..WWWW..", ".WWKWW..", ".WWWWWAA", "WWWWWW..", "WWWWWW..", ".WWWW...", "..A.A..."],
  lava: ["...RR...", "..RAAR..", "...RR...", "..bBBb..", ".bBBBBb.", ".BBRBBB.", "bBBBBBBb", "BBBBBBBB"],
  ticket: ["........", "RRRRRRRR", "RWWWWWWR", ".RWRRWR.", ".RWRRWR.", "RWWWWWWR", "RRRRRRRR", "........"],
  hammer: ["SSSSSS..", "SSSSSS..", "..BB....", "..BB....", "..BB....", "..BB....", "..BB....", "........"],
  shirt: ["........", ".TT..TT.", "TTTTTTTT", "TTTTTTTT", ".TTTTTT.", ".TTTTTT.", ".TTTTTT.", "........"],
  paw: ["........", ".B.BB.B.", ".B.BB.B.", "........", "..BBBB..", ".BBBBBB.", ".BBBBBB.", "..B..B.."],
  bell: ["...YY...", "..YYYY..", ".YYYYYY.", ".YYYYYY.", ".YYYYYY.", "YYYYYYYY", "........", "...YY..."],
  warn: ["...RR...", "..RRRR..", "..RWWR..", ".RRWWRR.", ".RRWWRR.", "RRRRRRRR", "RRRWWRRR", "RRRRRRRR"],
  star: ["...xx...", "...xx...", "xxxxxxxx", ".xxxxxx.", "..xxxx..", ".xxxxxx.", ".xx..xx.", "........"],
  chat: ["TTTTTTTT", "TWWWWWWT", "TWTTTTWT", "TWWWWWWT", "TTTTTTTT", ".TT.....", ".T......", "........"],
  bolt: ["....YY..", "...YY...", "..YY....", ".YYYYYY.", "....YY..", "...YY...", "..YY....", ".Y......"],
  fish: ["........", "..TTT..T", ".TTTTTTT", "TKTTTTT.", ".TTTTTTT", "..TTT..T", "........", "........"],
  barrel: [".BBBBBB.", "BbBBBBbB", "SSSSSSSS", "BbBBBBbB", "BbBBBBbB", "SSSSSSSS", "BbBBBBbB", ".BBBBBB."],
  lock: ["..SSSS..", ".S....S.", ".S....S.", "YYYYYYYY", "YYYOOYYY", "YYYOOYYY", "YYYYYYYY", "........"],
  check: ["........", ".......G", "......GG", "G....GG.", "GG..GG..", ".GGGG...", "..GG....", "........"],
  salt: ["........", "...WW...", "..WLLW..", ".WLWWLW.", "WWLWWLWW", ".WWWWWW.", "..SSSS..", "........"],
  crab: ["R......R", "RR....RR", ".R.RR.R.", "..RRRR..", ".RKRRKR.", "RRRRRRRR", ".R.RR.R.", "R......R"],
  chest: ["........", ".BBBBBB.", "BbbbbbbB", "BBBYYBBB", "BBBYYBBB", "BbbbbbbB", "BBBBBBBB", "........"],
  target: ["..RRRR..", ".RWWWWR.", "RWRRRRWR", "RWRWWRWR", "RWRWWRWR", "RWRRRRWR", ".RWWWWR.", "..RRRR.."],
  gem: ["........", "..TTTT..", ".TLTTtT.", "TLTTTTtt", ".TTTTtt.", "..TTtt..", "...Tt...", "........"],
  flag: ["BRRRRR..", "BRRRRRRR", "BRRRRRR.", "BRRRR...", "B.......", "B.......", "B.......", "BB......"],
  friends: ["........", ".II..WW.", "IIII.WWW", ".II..WW.", "........", "GGGGTTTT", "GGGGTTTT", "GGG..TTT"],
  honey: ["..bbbb..", ".bYYYYb.", "bYYHYYYb", "bYYYYYOb", "bYYYYYOb", "bYYYYOOb", ".bOOOOb.", "..bbbb.."],
  heart: ["........", ".RR..RR.", "RRRRRRRR", "RRRRRRRR", ".RRRRRR.", "..RRRR..", "...RR...", "........"],
  mushroom: ["..RRRR..", ".RRWRRR.", "RRRRRWRR", "RWRRRRRR", "..WWWW..", "...WW...", "...WW...", "..WWWW.."],
  globe: ["..tTTt..", ".TGGTTt.", "TGGGTTTt", "TTGGGTTt", "TTTGGGTt", "tTTTGGtt", ".tTTTtt.", "..tttt.."],
  scroll: [".WWWWWW.", "BWWWWWWB", ".WKKKKW.", ".WWWWWW.", ".WKKKW..", ".WWWWWW.", "BWWWWWWB", ".WWWWWW."],
};
const spriteCache = {};
// Iconos oficiales del juego, cargados de sus servidores (no se copian al proyecto: el arte es del juego y del
// pack Sunnyside). Items: la ruta de ITEM_DETAILS (gamedata.itemImages) → "g:" servidor de recursos del juego,
// "a:" src/assets del repo público por jsDelivr. Wearables: src/assets/wearables/<id>.webp. Buds y pets: sus CDN.
const SFL_ASSETS = "https://sunflower-land.com/game-assets/";
const SFL_REPO = "https://cdn.jsdelivr.net/gh/sunflower-land/sunflower-land@main/src/";
const assetUrl = (v) => (v?.startsWith("g:") ? SFL_ASSETS + v.slice(2) : v?.startsWith("a:") ? SFL_REPO + v.slice(2) : null);
let itemById = null; // id → nombre (para las claves del mercado)
const GAME_IMG = {
  collectibles: (id) => assetUrl(G.itemImages?.[(itemById ||= Object.fromEntries(Object.entries(G.itemIds).map(([n, i]) => [i, n])))[id]]),
  wearables: (id) => `${SFL_REPO}assets/wearables/${id}.webp`,
  buds: (id) => `https://buds.sunflower-land.com/small-nfts/${id}.webp`,
  pets: (id) => `https://pets.sunflower-land.com/marketplace/${id}_animated.webp`,
};
// ref = clave del mercado ("collectibles-601", "pets-12"…) o nombre de item/wearable
function gameImgUrl(ref) {
  const m = String(ref ?? "").match(/^(collectibles|wearables|pets|buds)-(\d+)$/);
  if (m) return GAME_IMG[m[1]](m[2]);
  if (G.itemImages?.[ref]) return assetUrl(G.itemImages[ref]);
  if (G.wearableIds?.[ref] != null) return GAME_IMG.wearables(G.wearableIds[ref]);
  return null;
}
// Icono del juego (si falla la carga, desaparece); sin imagen conocida, el sprite pixel de respaldo
function Gi(ref, size = 16, fallback = "") {
  const u = S.gameIcons !== false && gameImgUrl(ref);
  if (!u) return fallback ? sprite(fallback, size, true) : "";
  return `<img class="gi" src="${esc(u)}" alt="" width="${size}" height="${size}" loading="lazy" decoding="async" onerror="this.remove()">`;
}
// Iconos de categoría que tienen un item equivalente en el juego
const SPRITE_ITEM = { honey: "Honey", mushroom: "Wild Mushroom", carrot: "Carrot", apple: "Apple", flower: "Red Pansy", tree: "Wood", stone: "Stone", iron: "Iron", gold: "Gold",
  crim: "Crimstone", sunst: "Sunstone", oil: "Oil", gem: "Gem", fish: "Anchovy", crab: "Crab", chicken: "Egg", compost: "Sprout Mix", pot: "Grape", cook: "Pumpkin Soup", lava: "Obsidian" };
function sprite(name, size = 16, pixel = false) {
  if (!pixel && SPRITE_ITEM[name] && S.gameIcons !== false && G.itemImages?.[SPRITE_ITEM[name]]) return Gi(SPRITE_ITEM[name], size, "").replace('class="gi"', 'class="gi spr"');
  const key = name + ":" + size;
  if (spriteCache[key]) return spriteCache[key];
  const rows = SPRITES[name];
  if (!rows) return "";
  let r = "";
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length;) {
      const c = row[x];
      if (c === ".") { x++; continue; }
      let e = x;
      while (e < row.length && row[e] === c) e++;
      r += `<rect x="${x}" y="${y}" width="${e - x}" height="1" fill="${PAL[c]}"/>`;
      x = e;
    }
  });
  return (spriteCache[key] = `<svg class="spr" viewBox="0 0 8 8" width="${size}" height="${size}" shape-rendering="crispEdges" aria-hidden="true">${r}</svg>`);
}

/* ════════════════════════════════════════════════════════════════════════
   3. Componentes reutilizables (devuelven HTML)
   ════════════════════════════════════════════════════════════════════════ */
const Mod = ({ id, span = 12, title, icon, sub = "", act = "", flush = false, alt = false, foot = "", cls = "" }) => `
  <section class="mod s-${span}${alt ? " alt" : ""}${cls ? ` ${cls}` : ""}">
    ${title ? `<header class="mod-h">${icon ? sprite(icon, 16) : ""}<h2>${title}</h2><span class="sub" id="${id}-sub">${sub}</span><div class="act">${act}</div></header>` : ""}
    <div class="mod-b${flush ? " flush" : ""}" id="${id}"></div>
    ${foot}
  </section>`;

// Acciones por clic de las páginas (data-act="nombre:valor"); cada archivo registra las suyas
const ACTIONS = {};

const Kcell = (label, value, ctx = "", tone = "") =>
  `<div class="kcell"><span class="eyebrow">${label}</span><div class="v ${tone}">${value}</div>${ctx ? `<div class="ctx">${ctx}</div>` : ""}</div>`;

const Cd = (ts, cls = "") => `<span class="cd ${cls} ${ts <= now() ? "up" : ""}" data-ready="${ts}">${dur(ts - now())}</span>`;

const Bar = (start, end, color) => {
  const p = clamp01((now() - start) / Math.max(1, end - start));
  return `<div class="pbar${p >= 1 ? " done" : ""}"><i style="--c:${color};width:${(p * 100).toFixed(1)}%" data-start="${start}" data-end="${end}"></i></div>`;
};

/* Leyendas de color reutilizables. Legend("clave") pinta un icono (?) que muestra la leyenda
   en el tooltip común; todas las tablas que colorean valores usan una de estas. */
const LEGENDS = {
  delta: { title: "Colores de variación", rows: [["up", "Sube respecto a la referencia (ayer, tu compra…)"], ["down", "Baja respecto a la referencia"], ["dim", "Sin cambios o sin datos para comparar"]] },
  opensea: { title: "Precio en OpenSea (FLOWER)", rows: [["up", "Más barato en OpenSea que el floor del juego: cómpralo allí (pulsa el precio)"], ["down", "Más caro en OpenSea: mejor en el juego"], ["dim", "Casi igual (±3%) o sin listados"]] },
  profit: { title: "Colores de beneficio", rows: [["up", "Ganas valor: te compensa"], ["down", "Pierdes valor: no te compensa"], ["dim", "Sin precio de mercado para calcularlo"]] },
  perTicket: { title: "Coste por ticket", rows: [["up", "Barato: por debajo de la mediana de tus pedidos"], ["down", "Caro: por encima de la mediana"], ["dim", "Sin tickets (pedido de coins o FLOWER)"]] },
  needs: { title: "Lo que pide el pedido", rows: [["up", "Lo tienes todo (tienes/necesitas)"], ["down", "Te falta: se valora a floor en «Falta comprar»"], ["dim", "Sin precio: no se suma al valor"]] },
  cycle: { title: "Ciclo real", rows: [["down", "Más largo que el crecimiento: el cultivo espera a tu próxima visita"], ["text", "Igual que el crecimiento: lo recoges justo a tiempo"]] },
  skills: { title: "Estado de las skills", rows: [["green", "Aprendida (✓)"], ["sun", "Disponible: puedes aprenderla ya"], ["dim", "Bloqueada (candado): tier, isla o puntos"]] },
};
const SWATCH = { up: "var(--green)", green: "var(--green)", down: "var(--red)", dim: "var(--faint)", sun: "var(--sun)", text: "var(--text)" };
function legendHTML(key) {
  const l = LEGENDS[key];
  if (!l) return "";
  return `<b>${esc(l.title)}</b><div class="lg">${l.rows.map(([c, t]) => `<div><i style="background:${SWATCH[c]}"></i>${esc(t)}</div>`).join("")}</div>`;
}
const Legend = (key) => `<button type="button" class="help" data-legend="${key}" aria-label="${esc(LEGENDS[key]?.title || "Ayuda")}: ${esc((LEGENDS[key]?.rows || []).map((r) => r[1]).join(". "))}">?</button>`;

const Star = (key) => `<button class="star${S.watch.has(key) ? " on" : ""}" data-star="${esc(key)}" title="Seguir en watchlist">${sprite("star", 12)}</button>`;

const Seg = (items, active, attr) =>
  `<div class="seg">${items.map(([v, l]) => `<button data-${attr}="${v}" class="${String(v) === String(active) ? "on" : ""}">${l}</button>`).join("")}</div>`;
// Igual que Seg, pero el clic va a ACTIONS[action](valor) (data-act): no hace falta registrar un atributo nuevo
const SegAct = (items, active, action) =>
  `<div class="seg">${items.map(([v, l]) => `<button data-act="${action}:${v}" class="${String(v) === String(active) ? "on" : ""}">${l}</button>`).join("")}</div>`;

function Loading(kind = "block", n = 6) {
  if (kind === "rows") return Array.from({ length: n }, (_, i) => `<div class="sk-row"><span class="sk"></span><span class="sk" style="width:${55 + ((i * 37) % 40)}%"></span><span class="sk"></span></div>`).join("");
  if (kind === "hero") return `<div class="sk-hero"><span class="sk"></span><span class="sk" style="width:70%"></span><span class="sk" style="width:55%"></span></div>`;
  return `<div class="sk-block"><span class="sk" style="width:62%"></span><span class="sk" style="width:88%"></span><span class="sk" style="width:74%"></span></div>`;
}
const Empty = (icon, title, text = "", action = "") =>
  `<div class="state">${sprite(icon, 32)}<h3>${title}</h3>${text ? `<p>${text}</p>` : ""}${action}</div>`;
function ErrorState(e, retryKey) {
  const setup = e?.code === "nofarm" || e?.status === 401;
  return `<div class="state err">${sprite("warn", 28)}<h3>${setup ? "Falta configurar" : "No se pudo cargar"}</h3><p>${esc(e?.message || e)}</p>
    ${setup ? `<a class="btn sm" href="#settings">Ir a Ajustes</a>` : retryKey ? `<button class="btn ghost sm" data-retry="${esc(retryKey)}">Reintentar</button>` : ""}</div>`;
}
