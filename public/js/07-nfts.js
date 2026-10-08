// SFL Console — NFTs: valor, coste, origen y evolución.
// Scripts clásicos que comparten el ámbito global en el orden de index.html (antes, un solo app.js).
"use strict";

/* ── NFTs: seguimiento de lo que tienes con su coste ────────────────────── */
// NFT = wearable, o coleccionable que se coloca en la granja (decoraciones, boosts…; sin flores). Las
// listas salen del código del juego (npm run gamedata). Sin ellas: todo lo que no sea materia prima
// (TRADE_LIMITS) y, en último caso, lo que se vende de una en una.
const TRADE_RES = new Set(G.tradeResources || []);
const NFT_COLL = new Set(G.nftCollectibles || []);
function isNft(key, name) {
  const col = colOf(key);
  if (col === "wearables" || col === "pets" || col === "buds") return true;
  if (col !== "collectibles") return false;
  if (NFT_COLL.size) return NFT_COLL.has(name);
  if (TRADE_RES.size) return !TRADE_RES.has(name);
  const it = store.activity?.data?.items[key];
  return !it || !it.trades || it.quantity / it.trades < 1.5;
}
// Serie de precios de un NFT: la suya, o la del floor de su colección si se valora por estimación
const seriesKey = (r) => (r.estimate === "type" ? `_pet-${r.petRef.pick.group.sid}` : r.estimate ? `_col-${colOf(r.key)}` : r.key);
const nftKeys = () => [...new Set((holdings()?.rows || []).filter((r) => isNft(r.key, r.name)).map(seriesKey))];
const UNIQUE_COLS = new Set(["pets", "buds"]);
// Rasgos de un pet/bud para distinguirlo (tipo, pelaje, color…)
const traitsText = (t) => (t ? ["type", "fur", "colour", "stem", "aura", "bib"].map((k) => t[k]).filter((v) => typeof v === "string").join(" · ") : "");

// Floor de hace N días según las fotos diarias del servidor (la más reciente en o antes de esa fecha)
function floorDaysAgo(series, days) {
  const target = new Date(now() - days * 86400_000).toISOString().slice(0, 10);
  let v = null;
  for (const s of series || []) { if (s.date <= target) v = s.floor; else break; }
  return v;
}
// De dónde salió cada NFT: marketplace (con precio), subasta ganada (sfl.world), fabricado, tienda del
// juego o excavado (contadores farmActivity de tu granja). Un NFT puede tener varios orígenes.
function nftOrigins(r, buy) {
  const A = store.farm?.data?.farm?.farmActivity || {};
  const out = [];
  if (buy) out.push({ kind: "market", label: `marketplace${buy.n > 1 ? ` ×${buy.n}` : ""}`, tip: `Comprado en el marketplace|${buy.n} compra${buy.n === 1 ? "" : "s"}, media ${fmt(buy.unit)} FLOWER/u|de tu historial de operaciones` });
  const won = auctionWins()[r.name];
  if (won) out.push({ kind: "auction", label: "subasta", tip: `Subasta ganada|${dateShort(won.a.endAt)} · puesto #${won.e.rank} · pagaste ${bidText(won.a, won.e)}${won.cost != null ? ` ≈ ${fmt(won.cost, 1)} FLOWER` : ""}|fuente: sfl.world` });
  const n = (s) => toNum(A[`${r.name} ${s}`]);
  if (n("Crafted")) out.push({ kind: "craft", label: `fabricado${n("Crafted") > 1 ? ` ×${fmt(n("Crafted"), 0)}` : ""}`, tip: "Fabricado / minteado por ti|Lo hiciste en el juego: su coste fueron los ingredientes|contador de actividad de tu granja" });
  if (n("Bought")) out.push({ kind: "shop", label: "tienda", tip: "Comprado en una tienda del juego|Pagado con coins, gemas o ítems de temporada, no en el marketplace|contador de actividad de tu granja" });
  if (n("Dug")) out.push({ kind: "dug", label: "excavado", tip: "Excavado|Salió de la excavación: te costó 0|contador de actividad de tu granja" });
  return out;
}
// Subastas que ganaste (sfl.world), por premio, con lo pagado pasado a FLOWER (gemas al precio de la tienda)
function auctionWins() {
  const list = store.worldAuctions?.data;
  if (!list || !has("farm")) return {};
  if (auctionWins.c?.list === list && auctionWins.c?.fx === store.fx?.data) return auctionWins.c.out;
  const out = {};
  const fpg = flowerPerGem();
  for (const a of list) {
    const e = a.result?.leaderboard?.find((x) => isMe(x.farmId));
    if (!e || e.rank > (a.result.supply ?? a.supply)) continue;
    const gems = toNum(e.items?.Gem), other = Object.keys(e.items || {}).some((k) => k !== "Gem" && e.items[k] > 0);
    const cost = other || (gems && !fpg) ? null : toNum(e.sfl) + gems * (fpg || 0);
    const name = auPrize(a);
    if (!out[name] || a.endAt > out[name].a.endAt) out[name] = { a, e, cost };
  }
  auctionWins.c = { list, fx: store.fx?.data, out };
  return out;
}
// Tus listados activos en el marketplace (de tu granja): nombre → { unit: el más barato, qty, count }
function myListings() {
  const out = {};
  for (const l of Object.values(store.farm?.data?.farm?.trades?.listings || {})) {
    const [[name, qty] = []] = Object.entries(l.items || {});
    if (!name || !l.sfl) continue;
    const o = (out[name] ||= { unit: Infinity, qty: 0, count: 0 });
    o.unit = Math.min(o.unit, l.sfl / Math.max(1, qty));
    o.qty += toNum(qty);
    o.count++;
  }
  return out;
}

function nftModel() {
  const h = holdings();
  if (!h) return null;
  const buys = purchaseCosts();
  const wins = auctionWins();
  const listed = myListings();
  const series = store.nftPrices?.data?.series || {};
  const world = store.worldNfts?.data?.map || {};
  const net = S.p2pTax ? 0.9 : 1;
  const ch =(a, b) => (a != null && b ? ((a - b) / b) * 100 : null);
  const rows = h.rows.filter((r) => isNft(r.key, r.name)).map((r) => {
    const manual = S.costs[r.key], auto = buys[r.key];
    const won = wins[r.name];
    const cost = manual ?? auto?.unit ?? won?.cost ?? null;
    const ser = series[seriesKey(r)] || [];
    const prev = r.prevValue != null ? r.prevValue / r.qty : null;
    return {
      ...r, cost, costSrc: manual != null ? "manual" : auto ? "auto" : won?.cost != null ? "auction" : null, auto, since: auto?.last || (won ? won.a.endAt : null),
      origins: nftOrigins(r, auto), listing: listed[r.name] || null,
      invested: cost != null ? cost * r.qty : null,
      pl: cost != null ? (r.price * net - cost) * r.qty : null,
      plPct: cost ? ((r.price * net - cost) / cost) * 100 : null,
      vsBuy: ch(r.price, cost),
      d1: ch(r.price, prev), d7: ch(r.price, floorDaysAgo(ser, 7)), d30: ch(r.price, floorDaysAgo(ser, 30)),
      series: ser, boost: world[r.key]?.boost || "", supply: world[r.key]?.supply ?? null,
    };
  });
  const withCost = rows.filter((r) => r.pl != null);
  // Beneficio realizado: ventas de NFTs con coste conocido (tu media de compra o el coste manual)
  const me = has("farm") ? store.farm.data.id : null;
  let realized = 0, soldN = 0;
  for (const tr of allTrades()) {
    const key = `${tr.collection}-${tr.itemId}`;
    if (tradeSide(tr, me) !== "sell" || !isNft(key, itemName(key))) continue;
    const cost = S.costs[key] ?? buys[key]?.unit;
    if (cost == null) continue;
    realized += toNum(tr.sfl) * net - cost * toNum(tr.quantity);
    soldN++;
  }
  const value = rows.reduce((s, r) => s + r.value, 0);
  const prevValue = rows.reduce((s, r) => s + (r.prevValue ?? r.value), 0);
  return {
    rows, value, d1: rows.some((r) => r.prevValue != null) ? ch(value, prevValue) : null, withCost,
    invested: withCost.reduce((s, r) => s + r.invested, 0),
    pl: withCost.reduce((s, r) => s + r.pl, 0),
    valueWithCost: withCost.reduce((s, r) => s + r.value, 0),
    realized, soldN, hasSeries: Object.values(series).some((s) => s.length),
  };
}
const signed = (v, d) => `${v >= 0 ? "+" : ""}${fmt(v, d ?? (Math.abs(v) < 1 ? 3 : 1))}`;
const tone = (v) => (v == null || Math.abs(v) < 1e-9 ? "dim" : v > 0 ? "up" : "down");

// Mini gráfico escalonado de los últimos 30 días (+ floor en vivo), con tu precio de compra punteado
function Spark(series, live, cost) {
  const pts = (series || []).filter((s) => s.date !== todayUTC()).slice(-30).map((s) => s.floor);
  if (live != null) pts.push(live);
  if (pts.length < 2) return `<span class="faint spark-none" title="El servidor guarda el floor una vez al día: la línea aparece a partir del segundo día">—</span>`;
  const W = 96, H = 26;
  const vals = cost != null ? [...pts, cost] : pts;
  const lo = Math.min(...vals), hi = Math.max(...vals), span = hi - lo || hi * 0.1 || 1;
  const X = (i) => (i / (pts.length - 1)) * (W - 2) + 1;
  const Y = (v) => H - 2 - ((v - lo) / span) * (H - 4);
  let d = `M${X(0)},${Y(pts[0])}`;
  for (let i = 1; i < pts.length; i++) d += ` H${X(i)} V${Y(pts[i])}`;
  const up = pts[pts.length - 1] >= (cost ?? pts[0]);
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true">
    ${cost != null ? `<line x1="0" x2="${W}" y1="${Y(cost)}" y2="${Y(cost)}" stroke="var(--sun)" stroke-dasharray="3 2" opacity=".7"/>` : ""}
    <path d="${d}" fill="none" stroke="${up ? "var(--green)" : "var(--red)"}" stroke-width="1.5"/></svg>`;
}

function wNftKpis() {
  const m = nftModel();
  if (!m) return Loading("block");
  const fp = store.activity.data.flowerPrice || 0;
  const plPct = m.invested ? (m.pl / m.invested) * 100 : null;
  return `<div class="kstrip">
    ${Kcell("Valor a floor", `${fmt(m.value, 1)}`, `FLOWER · ${money(m.value)} · ${m.rows.length} NFT${m.rows.length === 1 ? "" : "s"}`, "sun")}
    ${Kcell(`Hoy${Legend("delta")}`, `<span class="${tone(m.d1)}">${pct(m.d1)}</span>`, "valor vs floor de ayer")}
    ${Kcell("Invertido", m.withCost.length ? fmt(m.invested, 1) : "—", m.withCost.length ? `en ${m.withCost.length} con precio de compra` : "pon tus precios de compra abajo")}
    ${Kcell(`Si vendes todo${Legend("profit")}`, m.withCost.length ? `<span class="${tone(m.pl)}">${signed(m.pl)}</span>` : "—", m.withCost.length ? `${pct(plPct)} sobre lo invertido${S.p2pTax ? " · −10% comisión" : ""}` : "")}
    ${Kcell("Ya ganado", m.soldN ? `<span class="${tone(m.realized)}">${signed(m.realized)}</span>` : "—", m.soldN ? `en ${m.soldN} venta${m.soldN === 1 ? "" : "s"} de NFTs con coste` : "ventas de NFTs con coste conocido")}
  </div>`;
}

function nftMover(r, key) {
  return `<div class="mv nfm" data-open="${r.key}">${Gi(r.key, 12, colIcon(r.key))}<span class="nm">${esc(r.name)}</span>
    ${Spark(r.series, r.price, r.cost)}<span class="v"><b class="${tone(r[key])}">${pct(r[key], Math.abs(r[key]) >= 10 ? 0 : 1)}</b></span></div>`;
}
function wNftMovers(dir) {
  const m = nftModel();
  const key = m.withCost.length ? "vsBuy" : "d7";
  const list = m.rows.filter((r) => r[key] != null && (dir > 0 ? r[key] > 0 : r[key] < 0)).sort((a, b) => dir * (b[key] - a[key])).slice(0, 5);
  setSub(dir > 0 ? "nf-up" : "nf-down", key === "vsBuy" ? "desde tu compra" : "en 7 días");
  if (!list.length) return Empty(dir > 0 ? "star" : "check", dir > 0 ? "Nada en positivo" : "Nada en negativo",
    key === "vsBuy" ? (dir > 0 ? "Ninguno vale más que lo que pagaste." : "Ninguno vale menos que lo que pagaste.") : "Aún no hay 7 días de historial de precios.");
  return list.map((r) => nftMover(r, key)).join("");
}

const NFT_COLS = [
  { key: "name", label: "NFT", align: "" },
  { key: "origin", label: "Origen", align: "", sort: false },
  { key: "boost", label: "Boost", align: "", sort: false },
  { key: "qty", label: "Cant." },
  { key: "cost", label: "Compra / u" },
  { key: "price", label: "Floor" },
  { key: "vsBuy", label: "vs compra", legend: "delta" },
  { key: "d1", label: "24 h" },
  { key: "d7", label: "7 d" },
  { key: "d30", label: "30 d" },
  { key: "spark", label: "30 días", sort: false },
  { key: "pl", label: "Si vendes", legend: "profit" },
];
// Búsqueda de compras antiguas (servidor, en segundo plano): NFTs sin compra en tu historial
async function startRescan() {
  const m = nftModel();
  if (!m || !has("farm")) return;
  if (S.viewing) return toast("La búsqueda de compras antiguas solo se hace en tu granja");
  const keys = m.rows.filter((r) => !r.auto).map((r) => r.key);
  if (!keys.length) return toast("Todos tus NFTs ya tienen su compra en el historial");
  try {
    const r = await fetch("/api/rescan", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ farmId: store.farm.data.id, me: store.farm.data.id, keys }) });
    const st = await r.json();
    if (!r.ok && r.status !== 409) throw new Error(st.error);
    toast(r.status === 409 ? "Ya hay una búsqueda en marcha" : `Buscando tus compras en ${keys.length} NFTs (≈ ${Math.ceil((keys.length * 5.2) / 60)} min)…`, 4000);
    pollRescan();
  } catch (e) { toast(`No se pudo empezar: ${e.message}`); }
}
function rescanButton(st) {
  const b = $("#nfRescan");
  if (!b) return;
  b.disabled = Boolean(st?.running);
  b.textContent = st?.running ? `Buscando… ${st.done}/${st.total}${st.found ? ` · ${st.found} encontrada${st.found === 1 ? "" : "s"}` : ""}` : "Buscar mis compras antiguas";
}
let rescanTimer = null;
async function pollRescan() {
  clearTimeout(rescanTimer);
  let st;
  try { st = await fetch("/api/rescan").then((r) => r.json()); } catch { return; }
  rescanButton(st);
  if (st.running) { rescanTimer = setTimeout(pollRescan, 4000); return; }
  if (!st.finishedAt || pollRescan.seen === st.finishedAt) return;
  pollRescan.seen = st.finishedAt;
  toast(st.found ? `Rescatadas ${st.found} compra${st.found === 1 ? "" : "s"} antiguas: ya cuentan en tu precio de compra` : "Búsqueda terminada: no había compras tuyas en las últimas ventas de esos NFTs", 6000);
  if (store.history) store.history.at = 0;
  LOADERS.history().then(() => repaint("activity")).catch(() => {});
}

// Etiqueta del precio estimado de un pet/bud, con todas las referencias en el tooltip
function estimateTag(r) {
  const p = r.petRef;
  if (r.estimate === "type") {
    const pk = p.pick;
    const lines = p.groups.map((g) => `${g === pk.group ? "▸ " : ""}${g.label}: ${g.floors.length ? `${g.floors.length} a la venta desde ${fmt(g.floor)}` : "ninguno a la venta"}, ${g.sales.length ? `${g.sales.length} venta${g.sales.length === 1 ? "" : "s"} (mediana ${fmt(g.median)})${g.dropped ? ` sin contar ${g.dropped} rara${g.dropped === 1 ? "" : "s"}` : ""}` : "sin ventas"}.`).join(" ");
    const lvTxt = pk.level ? ` de nivel ${pk.level.from}–${pk.level.to} (el tuyo es ${pk.level.my}; ${pk.level.n} de ${pk.level.known} con nivel conocido)` : "";
    const how = pk.basis === "ventas" ? `mediana de ventas de ${pk.group.label}${lvTxt}` : `el más barato a la venta de ${pk.group.label}${lvTxt}`;
    return `<span class="tag" data-tip="${esc(`Valorado por su boost|Tu pet: ${petBoostText(p) || "sin boost"}. Sin listados ni ventas propias, vale ${fmt(pk.value)} FLOWER: ${how}. ${lines}|${pk.level ? "por nivel parecido al tuyo" : "sin nivel: el de los pets del mercado se va guardando poco a poco"} · rasgos visuales no incluidos · ventas = última venta de cada pet del informe`)}">${pk.basis === "ventas" ? "ventas" : "floor"} ${esc(pk.group.key === "t" ? p.type : pk.group.key === "ab" ? "mismo boost" : pk.group.label)}</span>`;
  }
  return `<span class="tag" data-tip="Precio estimado|No tiene listados ni ventas propias: se valora al floor de la colección (el ${colOf(r.key) === "pets" ? "pet" : "bud"} más barato a la venta). Uno con mejores rasgos puede valer bastante más.|">floor colección</span>`;
}

function wNftTable() {
  const m = nftModel();
  const q = S.marketQuery.trim().toLowerCase();
  const inCol = (r) => S.nftCol === "all" || (S.nftCol === "unique" ? UNIQUE_COLS.has(colOf(r.key)) : S.nftCol === "boost" ? Boolean(r.boost) : colOf(r.key) === S.nftCol);
  let rows = m.rows.filter((r) => inCol(r) && (!q || r.name.toLowerCase().includes(q) || traitsText(r.traits).toLowerCase().includes(q)));
  rows = sortRows(rows, S.nftSort);
  setSub("nf-table", `${rows.length} de ${m.rows.length} · ${m.withCost.length} con precio de compra`);
  if (!m.rows.length) return Empty("trophy", "Sin NFTs con mercado", "No tienes coleccionables ni wearables que se vendan en el marketplace.");
  if (!rows.length) return Empty("trophy", "Sin resultados", "Ningún NFT coincide con el filtro.");
  const th = `<tr>${NFT_COLS.map((c) => `<th ${c.sort === false ? "" : `data-nsort="${c.key}"`} class="${c.align ?? "r"}${S.nftSort.key === c.key ? ` sorted${S.nftSort.dir > 0 ? " asc" : ""}` : ""}">${c.label}${c.legend ? Legend(c.legend) : ""}</th>`).join("")}</tr>`;
  const cell = (v) => `<td class="r ${tone(v)}">${pct(v, v != null && Math.abs(v) >= 10 ? 0 : 1)}</td>`;
  return `<div class="tbl-wrap"><table class="tbl nft-tbl"><thead>${th}</thead><tbody>${rows.map((r) => `
    <tr data-open="${r.key}"><td class="w"><div class="name">${Gi(r.key, 24, colIcon(r.key))}<span>${esc(r.name)}</span></div>${[traitsText(r.traits), r.supply ? `supply ${fmt(r.supply, 0)}` : "", r.since ? `comprado ${dateShort(r.since)}` : ""].filter(Boolean).map((t) => `<div class="ctx">${esc(t)}</div>`).join("")}</td>
      <td class="origin">${r.origins.length ? r.origins.map((o) => `<span class="tag og-${o.kind}" data-tip="${esc(o.tip)}">${esc(o.label)}</span>`).join(" ") : `<span class="faint" data-tip="Origen desconocido|No está en tu historial ni en los contadores de tu granja: pudo ser una compra anterior a lo que guarda la API, un regalo o un premio. Prueba «Buscar mis compras antiguas»|">?</span>`}</td>
      <td class="boost">${r.boost ? `<span class="bst">${esc(r.boost)}</span>` : `<span class="faint">—</span>`}</td>
      <td class="r">${fmt(r.qty)}</td>
      <td class="r cost-cell"><input class="cost-in ${r.costSrc || ""}" data-cost="${r.key}" inputmode="decimal" value="${S.costs[r.key] ?? ""}"
        placeholder="${r.auto ? fmt(r.auto.unit) : r.costSrc === "auction" ? fmt(r.cost, 1) : r.origins.some((o) => o.kind === "dug") ? "0" : "—"}" title="${r.auto ? `Automático: media de ${r.auto.n} compra${r.auto.n === 1 ? "" : "s"} (${fmt(r.auto.unit)}). Escribe para sobrescribir; vacío = automático.` : r.costSrc === "auction" ? "Automático: lo que pujaste en la subasta, con las gemas pasadas a FLOWER al precio de la tienda. Escribe para sobrescribir." : "Escribe lo que pagaste por unidad (0 si te tocó gratis)"}" />
        ${r.costSrc === "auto" ? `<span class="tag blue" title="De tu historial de compras">auto</span>` : r.costSrc === "auction" ? `<span class="tag blue" title="Lo que pujaste en la subasta (sfl.world)">subasta</span>` : ""}</td>
      <td class="r"><b>${fmt(r.price)}</b>${r.estimate ? `<div>${estimateTag(r)}</div>` : ""}${r.listing ? `<div class="ctx" data-tip="Tu listado activo|Lo tienes a la venta a ${fmt(r.listing.unit)} FLOWER/u (${fmt(r.listing.qty)} ud)|">listado a <b>${fmt(r.listing.unit)}</b></div>` : ""}</td>
      ${cell(r.vsBuy)}${cell(r.d1)}${cell(r.d7)}${cell(r.d30)}
      <td class="r">${Spark(r.series, r.price, r.cost)}</td>
      <td class="r">${r.pl != null ? `<b class="${tone(r.pl)}">${signed(r.pl)}</b><div class="ctx">${r.plPct != null ? pct(r.plPct, 0) : "gratis"}</div>` : `<span class="dim">—</span>`}</td></tr>`).join("")}
    </tbody></table></div>
    <div class="mod-f"><span>Si vendes = (floor${S.p2pTax ? " − 10% comisión" : ""} − compra) × cantidad · línea amarilla = tu precio de compra</span>
      <span>${m.hasSeries ? "7 d / 30 d: fotos diarias del floor en dashboard/data/" : "7 d / 30 d se llenan solos: el servidor guarda el floor cada día"}</span></div>`;
}
