// SFL Console — Widgets de Granja y de Mercado.
// Scripts clásicos que comparten el ámbito global en el orden de index.html (antes, un solo app.js).
"use strict";

/* ── Widgets de Granja ──────────────────────────────────────────────────── */
function wCats() {
  const f = store.farm.data;
  const per = perCategory(f.timers);
  const total = readyCount();
  const keys = Object.keys(CATS).filter((k) => per[k]);
  return `<button class="cat all ${!S.farmFilter ? "on" : ""}" data-filter="all">${sprite("sun", 18)}<span class="nm">Todo</span><span class="cnt ${total ? "hot" : ""}">${total}/${f.timers.length}</span>
      <span class="ctx" style="grid-column:2/4">${keys.length} categorías · pulsa para filtrar</span></button>` +
    keys.map((k) => {
      const v = per[k];
      const nx = v.next;
      return `<button class="cat ${S.farmFilter === k ? "on" : ""}" data-filter="${k}">${sprite(CATS[k].spr, 18)}
        <span class="nm">${CATS[k].label}</span><span class="cnt ${v.ready ? "hot" : ""}">${v.ready}/${v.total}</span>
        ${nx ? Bar(nx.start, nx.ready, CATS[k].color) : `<div class="pbar done"><i style="width:100%"></i></div>`}
        <span class="nx">${nx ? `<span data-ready="${nx.ready}">${dur(nx.ready - now())}</span>` : "todo listo"}</span></button>`;
    }).join("");
}

function wBoard() {
  const t = now();
  const list = store.farm.data.timers.filter((x) => !S.farmFilter || x.cat === S.farmFilter);
  const groups = groupTimers(list);
  const shown = S.boardAll ? groups : groups.slice(0, 40);
  const readyN = list.filter((x) => x.ready <= t).length;
  setSub("fm-board", `${readyN} listos · ${list.length - readyN} en curso${S.farmFilter ? ` · ${CATS[S.farmFilter].label}` : ""}`);
  if (!groups.length) return Empty("sprout", "Nada por aquí", "No hay temporizadores en esta categoría.");
  return `<div class="tbl-wrap board"><table class="tbl"><thead><tr><th></th><th>Qué</th><th>Progreso</th><th class="r">Hora</th><th class="r">Falta</th></tr></thead><tbody>
    ${shown.map((g) => `<tr class="${g.ready <= t ? "ready" : ""}"><td class="ic">${timerIcon(g, 16)}</td>
      <td><div class="name"><span>${esc(g.name)}</span>${g.count > 1 ? `<span class="tag">×${g.count}</span>` : ""}${g.note ? `<span class="dim">${esc(g.note)}</span>` : ""}</div></td>
      <td class="bar">${Bar(g.start, g.ready, CATS[g.cat].color)}</td>
      <td class="r dim">${at(g.ready)}</td><td class="r">${g.ready <= t ? `<span class="ok-tag">LISTO</span>` : Cd(g.ready)}</td></tr>`).join("")}
    </tbody></table></div>
    ${groups.length > 40 ? `<button class="showmore" data-action="boardAll">${S.boardAll ? "Mostrar menos" : `Mostrar los ${groups.length} grupos`}</button>` : ""}`;
}

function notifyToggle() {
  const ok = "Notification" in window;
  return `<label class="toggle" title="${ok ? "Notificación del navegador cuando algo madure" : "Tu navegador no soporta notificaciones"}">
    <input type="checkbox" id="notifyToggle" ${S.notify ? "checked" : ""} ${ok ? "" : "disabled"} /><i></i>Avisos</label>
    ${SegAct([[0, "al momento"], [5, "5 min antes"], [15, "15 min"], [30, "30 min"]], S.notifyEarly, "notifyearly")}`;
}

/* ── Widgets de Mercado ─────────────────────────────────────────────────── */
function wMarketKpis() {
  const a = store.activity.data;
  const pt = has("activityPrev") ? store.activityPrev.data.totals : null;
  const vol = pt ? a.totals.volume - pt.volume : null;
  const trades = pt ? a.totals.trades - pt.trades : null;
  const hoursUtc = new Date().getUTCHours() + new Date().getUTCMinutes() / 60;
  const h = holdings();
  const p = store.profile?.data;
  const rows = marketRows();
  const listed = rows.filter((r) => r.listingCount).length;
  return `<div class="kstrip">
    ${Kcell("FLOWER / USD", `$${fmt(a.flowerPrice, 4)}`, `1 USD = ${fmt(1 / a.flowerPrice, 1)} FLOWER`)}
    ${Kcell("Volumen hoy", vol == null ? "…" : `${compact(vol)}<small>FLW</small>`, vol == null ? "cargando ayer…" : `≈ $${compact(vol * a.flowerPrice)} · ${fmt(hoursUtc, 1)} h de día UTC`)}
    ${Kcell("Trades hoy", trades == null ? "…" : compact(trades), trades == null ? "" : `${fmt(trades / Math.max(0.5, hoursUtc), 0)} por hora`)}
    ${Kcell("Items con listados", fmt(listed, 0), `de ${fmt(rows.length, 0)} con mercado`)}
    ${h ? Kcell("Tu inventario", `${compact(h.total)}<small>FLW</small>`, `${h.rows.length} items con precio · ${money(h.total)}`) : Kcell("Tu inventario", "…", "cargando granja…")}
    ${p ? profitCell(p) : Kcell("Beneficio trading", "…", "")}
  </div>`;
}

// `profit` no siempre viene en la respuesta; entonces mostramos el neto de 7 días.
function profitCell(p) {
  const signed = (n) => `<span class="${Math.abs(n) < 0.05 ? "faint" : n > 0 ? "up" : "down"}">${n > 0 ? "+" : ""}${fmt(n, Math.abs(n) < 100 ? 1 : 0)}</span>`;
  const earned = toNum(p.weeklyFlowerEarned), spent = toNum(p.weeklyFlowerSpent);
  if (Number.isFinite(p.profit)) return Kcell("Beneficio trading", signed(p.profit), `7 días: <span class="up">+${fmt(earned, 0)}</span> / <span class="down">−${fmt(spent, 0)}</span>`);
  return Kcell("Neto 7 días", signed(earned - spent), `+${fmt(earned, 1)} / −${fmt(spent, 1)} · ${fmt(p.totalTrades, 0)} trades totales`);
}

function wMovers() {
  const rows = marketRows().filter((r) => r.todayVolume).sort((x, y) => y.todayVolume - x.todayVolume).slice(0, 8);
  const max = rows[0]?.todayVolume || 1;
  setSub("mk-movers", "por volumen FLOWER");
  if (!rows.length) return Empty("coin", "Sin actividad aún", "El día UTC acaba de empezar.");
  return rows.map((r, i) => `<div class="mv cellbar" data-open="${r.key}"><span class="rankno">${i + 1}</span><span class="nm">${Gi(r.key, 14)}${esc(r.name)}</span>
    <span class="v"><b>${compact(r.todayVolume)}</b> · ${fmt(r.todayTrades, 0)} tr <span class="${r.change > 0 ? "up" : r.change < 0 ? "down" : ""}">${pct(r.change, 0)}</span></span><i style="width:${((r.todayVolume / max) * 100).toFixed(1)}%"></i></div>`).join("");
}

function wOpportunities() {
  const rows = marketRows();
  const crossed = rows.filter((r) => r.floor && r.bestOffer && r.bestOffer >= r.floor);
  // Solo spreads operables: libro con profundidad, algo de actividad y un margen razonable
  const wide = rows.filter((r) => r.spread != null && r.spread >= 5 && r.spread <= 40 && r.listingCount >= 3 && r.offerCount >= 3 && (r.todayTrades ?? r.trades ?? 0) >= 5)
    .sort((a, b) => b.spread - a.spread).slice(0, 8 - Math.min(crossed.length, 4));
  setSub("mk-spread", `${crossed.length} cruzados · ${wide.length} spreads amplios`);
  if (!crossed.length && !wide.length) return Empty("bell", "Mercado ajustado", "No hay libros cruzados ni spreads amplios ahora mismo.");
  return (crossed.length ? `<div class="grp"><i class="dot"></i>Libro cruzado · oferta ≥ floor</div>${crossed.slice(0, 4).map((r) => `<div class="mv" data-open="${r.key}">${Gi(r.key, 14, colIcon(r.key))}<span class="nm">${esc(r.name)}</span>
    <span class="v">floor <b>${fmt(r.floor)}</b> · oferta <b class="up">${fmt(r.bestOffer)}</b></span></div>`).join("")}` : "") +
    (wide.length ? `<div class="grp">Spread amplio · margen para market-making</div>${wide.map((r) => `<div class="mv" data-open="${r.key}">${Gi(r.key, 14, colIcon(r.key))}<span class="nm">${esc(r.name)}</span>
    <span class="v"><b>${fmt(r.spread, 1)}%</b> · ${fmt(r.bestOffer)} → ${fmt(r.floor)}</span></div>`).join("")}` : "");
}

const MK_COLS = [
  { key: "name", label: "Item", align: "" },
  { key: "floor", label: "Floor" },
  { key: "bestOffer", label: "Mejor oferta" },
  { key: "spread", label: "Spread" },
  { key: "latestSale", label: "Última" },
  { key: "change", label: "Δ ayer", legend: "delta" },
  { key: "todayVolume", label: "Vol. hoy" },
  { key: "todayTrades", label: "Trades hoy" },
  { key: "listingCount", label: "List. / Of." },
  { key: "osDiff", label: "OpenSea", legend: "opensea" },
];
const MINE_COLS = [
  { key: "name", label: "Item", align: "" },
  { key: "qty", label: "Cantidad" },
  { key: "price", label: "Floor" },
  { key: "bestOffer", label: "Mejor oferta" },
  { key: "value", label: "Valor" },
  { key: "delta", label: "Δ ayer", legend: "delta" },
  { key: "cost", label: "Coste / u" },
  { key: "pl", label: "Si vendes", legend: "profit" },
  { key: "share", label: "% cartera" },
];

// Precio medio de compra según tus últimas operaciones del marketplace (la API da las 50 últimas).
// Compraste si aceptaste un listado (fulfilledBy = tú) o si aceptaron tu oferta (initiatedBy = tú).
// Lado de una operación desde tu punto de vista: listado aceptado por ti o tu oferta aceptada = compra.
function tradeSide(tr, me) {
  if ((tr.source === "listing" && tr.fulfilledBy?.id === me) || (tr.source === "offer" && tr.initiatedBy?.id === me)) return "buy";
  if ((tr.source === "listing" && tr.initiatedBy?.id === me) || (tr.source === "offer" && tr.fulfilledBy?.id === me)) return "sell";
  return null;
}
// Todas las operaciones conocidas: archivo local (crece con el tiempo) + las 50 últimas del perfil.
function allTrades() {
  const byId = new Map();
  for (const tr of store.history?.data?.trades || []) byId.set(tr.id, tr);
  for (const tr of store.profile?.data?.trades || []) if (!byId.has(tr.id)) byId.set(tr.id, tr);
  return [...byId.values()];
}

function purchaseCosts() {
  if (!has("farm")) return {};
  const h = store.history?.data, p = store.profile?.data;
  if (purchaseCosts.c && purchaseCosts.c.h === h && purchaseCosts.c.p === p) return purchaseCosts.c.out;
  const me = store.farm.data.id;
  const out = {};
  for (const tr of allTrades()) {
    if (tradeSide(tr, me) !== "buy" || !tr.quantity || tr.itemId == null) continue;
    const o = (out[`${tr.collection}-${tr.itemId}`] ||= { paid: 0, qty: 0, n: 0, last: 0 });
    o.paid += toNum(tr.sfl);
    o.qty += toNum(tr.quantity);
    o.n++;
    o.last = Math.max(o.last, toNum(tr.fulfilledAt));
  }
  for (const o of Object.values(out)) o.unit = o.paid / o.qty;
  purchaseCosts.c = { h, p, out };
  return out;
}

function wHistory() {
  const me = store.farm.data.id;
  const a = store.activity.data;
  const net = S.p2pTax ? 0.9 : 1;
  const q = S.marketQuery.trim().toLowerCase();
  const trades = allTrades().map((tr) => {
    const key = `${tr.collection}-${tr.itemId}`;
    const side = tradeSide(tr, me);
    const unit = toNum(tr.sfl) / Math.max(1, toNum(tr.quantity));
    const it = a.items[key];
    const nowP = it ? it.floor ?? it.latestSale : null;
    const other = side === "buy" ? (tr.source === "listing" ? tr.initiatedBy : tr.fulfilledBy) : (tr.source === "listing" ? tr.fulfilledBy : tr.initiatedBy);
    // Compra: cuánto ganarías vendiendo hoy. Venta: cuánto habrías sacado de más (o de menos) esperando.
    const vsNow = nowP == null ? null : side === "buy" ? (nowP * net - unit) * tr.quantity : (unit - nowP) * tr.quantity;
    return { ...tr, key, side, unit, name: itemName(key), nowP, vsNow, other };
  }).filter((t) => t.side && (S.histType === "all" || t.side === S.histType) && colMatch(t.key) && (!q || t.name.toLowerCase().includes(q)))
    .sort((x, y) => toNum(y.fulfilledAt) - toNum(x.fulfilledAt));
  const spent = trades.filter((t) => t.side === "buy").reduce((s, t) => s + toNum(t.sfl), 0);
  const earned = trades.filter((t) => t.side === "sell").reduce((s, t) => s + toNum(t.sfl), 0);
  const oldest = trades.length ? trades[trades.length - 1].fulfilledAt : null;
  const archived = store.history?.data?.trades?.length || 0;
  setSub("mk-table", `${trades.length} operaciones${oldest ? ` desde ${dateShort(oldest)}` : ""} · ${archived} archivadas`);
  const head = `<div class="toolbar">${Seg([["all", "Todo"], ["buy", "Compras"], ["sell", "Ventas"]], S.histType, "htype")}
    <span class="ctx">gastado <b class="down">${fmt(spent, 2)}</b> · ingresado <b class="up">${fmt(earned, 2)}</b> FLOWER</span><span class="grow"></span>
    <span class="ctx">La API solo da tus 50 últimas: el dashboard las archiva cada 20 min. Abrir un item busca tus compras en sus 10 últimas ventas.</span></div>`;
  if (!trades.length) return head + Empty("scroll", "Sin operaciones", "Aún no hay operaciones archivadas con este filtro.");
  return head + `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Fecha</th><th></th><th>Item</th><th class="r">Cant.</th><th class="r">Total</th><th class="r">Precio / u</th><th class="r">Floor hoy</th><th class="r">vs hoy${Legend("profit")}</th><th>Con</th></tr></thead><tbody>
    ${trades.map((t) => `<tr data-open="${t.key}"><td class="dim">${dateShort(t.fulfilledAt)}</td>
      <td>${t.side === "buy" ? `<span class="tag blue">compra</span>` : `<span class="tag sun">venta</span>`}</td>
      <td class="w"><div class="name">${Gi(t.key, 12, colIcon(t.key))}<span>${esc(t.name)}</span>${t.via === "item" ? `<span class="tag" title="Recuperada del historial del item">rescatada</span>` : ""}</div></td>
      <td class="r">${fmt(t.quantity)}</td><td class="r"><b>${fmt(t.sfl, 2)}</b></td><td class="r">${fmt(t.unit)}</td><td class="r dim">${fmt(t.nowP)}</td>
      <td class="r">${t.vsNow == null ? "—" : `<span class="${t.vsNow >= 0 ? "up" : "down"}">${t.vsNow >= 0 ? "+" : ""}${fmt(t.vsNow, Math.abs(t.vsNow) < 1 ? 3 : 1)}</span>`}</td>
      <td class="dim">${esc(t.other?.username || (t.other?.id ? "#" + t.other.id : "—"))}</td></tr>`).join("")}
  </tbody></table></div>
  <div class="mod-f"><span>vs hoy · compra: lo que ganarías vendiendo ahora${S.p2pTax ? " (−10%)" : ""} · venta: positivo = vendiste por encima del floor actual</span><span>archivo: dashboard/data/</span></div>`;
}
function sortRows(rows, { key, dir }) {
  return rows.sort((a, b) => {
    const va = a[key], vb = b[key];
    if (key === "name") return dir * String(va).localeCompare(String(vb), "es");
    if (va == null || vb == null) return va == null ? (vb == null ? 0 : 1) : -1; // sin dato, siempre al final
    return dir * (va - vb);
  });
}
const thSort = (cols, sort) => `<tr><th></th>${cols.map((c) => `<th data-sort="${c.key}" class="${c.align ?? "r"}${sort.key === c.key ? ` sorted${sort.dir > 0 ? " asc" : ""}` : ""}">${c.label}${c.legend ? Legend(c.legend) : ""}</th>`).join("")}</tr>`;

// Filtro de colección del mercado; "boost" = coleccionables que dan boost según sfl.world
const colMatch = (key) => !S.marketCol || (S.marketCol === "boost"
  ? colOf(key) === "collectibles" && Boolean(store.worldNfts?.data?.map?.[key]?.boost)
  : colOf(key) === S.marketCol);
// Precio del listado más barato en OpenSea pasado a FLOWER (con el cambio de sfl.world) y diferencia con el floor
// del juego: negativo = más barato en OpenSea. Enlace a la ficha del item para comprarlo allí.
// Recursos (madera, oro, cultivos…): en la cadena son tokens con 18 decimales y sus listados de OpenSea salen a
// fracciones ínfimas por unidad (Wood ≈ 0,0000002 FLOWER frente a 0,012 en el juego): no son comparables y la
// columna aconsejaría comprar allí por error. Solo se comparan coleccionables y NFTs. Lo mismo con herramientas,
// animales… que también son fraccionables: se reconocen porque sus listados suman millones de unidades.
const OS_FUNGIBLE = new Set(G.tradeResources || []);
function osQuote(key, floor) {
  const o = store.opensea?.data?.items?.[key];
  const usd = store.fx?.data?.sfl?.usd;
  if (!o || OS_FUNGIBLE.has(itemName(key)) || o.qty > 10_000) return null;
  // Solo NFTs con boost (lo que le interesa al jugador comprar fuera): texto del juego o de sfl.world
  if (!G.buffs?.[itemName(key)] && !store.worldNfts?.data?.map?.[key]?.boost) return null;
  const flower = o.usd != null && usd ? o.usd / usd : null;
  return {
    ...o, flower, diff: flower != null && floor ? ((flower - floor) / floor) * 100 : null,
    url: `https://opensea.io/item/polygon/${o.contract}/${key.split("-")[1]}`,
  };
}
const withOpensea = (r) => {
  const os = osQuote(r.key, r.floor);
  return { ...r, os, osDiff: os?.diff ?? null };
};
function osCell(os) {
  if (!os) return `<td class="r dim">${has("opensea") ? "—" : "…"}</td>`;
  const cls = os.diff == null ? "dim" : os.diff <= -3 ? "up" : os.diff >= 3 ? "down" : "dim";
  const tip = `OpenSea|${fmt(os.flower)} FLOWER · $${fmt(os.usd, 2)} · ${fmt(os.price, os.price < 0.01 ? 6 : 4)} ${esc(os.currency)} por unidad · ${os.listings} listado${os.listings === 1 ? "" : "s"} · ${fmt(os.qty, 0)} uds${os.diff != null ? ` · ${os.diff < 0 ? "Más barato" : "Más caro"} que el floor del juego: ${pct(os.diff, 0)}` : ""}|Abrir en OpenSea para comprarlo allí`;
  return `<td class="r"><a class="os-link" href="${os.url}" target="_blank" rel="noopener noreferrer" data-tip="${esc(tip)}"><b>${fmt(os.flower)}</b></a><div class="ctx ${cls}">${os.diff == null ? "" : `${os.diff > 0 ? "+" : ""}${fmt(os.diff, 0)}%`}</div></td>`;
}

function wMarketTable() {
  const q = S.marketQuery.trim().toLowerCase();
  if (S.marketTab === "history") return has("farm") ? wHistory() : Loading("rows");
  if (S.marketTab === "mine") {
    const h = holdings();
    if (!h) return Loading("rows");
    const buys = purchaseCosts();
    const sort = MINE_COLS.some((c) => c.key === S.marketSort.key) ? S.marketSort : { key: "value", dir: -1 };
    const net = S.p2pTax ? 0.9 : 1;
    let rows = h.rows.map((r) => {
      const manual = S.costs[r.key];
      const auto = buys[r.key];
      const cost = manual ?? auto?.unit ?? null;
      const pl = cost != null ? (r.price * net - cost) * r.qty : null;
      return {
        ...r, share: h.total ? (r.value / h.total) * 100 : 0, delta: r.prevValue ? ((r.value - r.prevValue) / r.prevValue) * 100 : null,
        cost, costSrc: manual != null ? "manual" : auto ? "auto" : null, auto, pl, plPct: cost ? ((r.price * net - cost) / cost) * 100 : null,
      };
    }).filter((r) => colMatch(r.key) && (!q || r.name.toLowerCase().includes(q)));
    rows = sortRows(rows, sort);
    const withCost = rows.filter((r) => r.pl != null);
    const plTotal = withCost.reduce((s, r) => s + r.pl, 0);
    setSub("mk-table", `${rows.length} items · ${fmt(h.total, 0)} FLOWER a floor${withCost.length ? ` · <span class="${plTotal >= 0 ? "up" : "down"}">${plTotal >= 0 ? "+" : ""}${fmt(plTotal, Math.abs(plTotal) < 1 ? 3 : 1)}</span> FLOWER si vendes lo que tiene coste (${withCost.length})` : ""}`);
    if (!rows.length) return Empty("coin", "Sin resultados", "Ningún item de tu inventario coincide con el filtro.");
    return `<div class="tbl-wrap"><table class="tbl"><thead>${thSort(MINE_COLS, sort)}</thead><tbody>${rows.map((r) => `
      <tr data-open="${r.key}"><td class="ic">${Star(r.key)}</td><td class="w"><div class="name">${Gi(r.key, 12, colIcon(r.key))}<span>${esc(r.name)}</span></div></td>
      <td class="r">${fmt(r.qty)}</td><td class="r">${fmt(r.price)}</td><td class="r dim">${fmt(r.bestOffer)}</td><td class="r"><b>${fmt(r.value, 1)}</b></td>
      <td class="r ${r.delta > 0 ? "up" : r.delta < 0 ? "down" : "dim"}">${pct(r.delta)}</td>
      <td class="r cost-cell"><input class="cost-in ${r.costSrc || ""}" data-cost="${r.key}" inputmode="decimal" value="${S.costs[r.key] ?? ""}"
        placeholder="${r.auto ? fmt(r.auto.unit) : "—"}" title="${r.auto ? `Automático: ${fmt(r.auto.qty)} uds compradas en ${r.auto.n} operaciones (media ${fmt(r.auto.unit)}). Escribe para sobrescribir; vacío = automático.` : "Escribe lo que pagaste por unidad (0 si lo produces tú)"}" />
        ${r.costSrc === "auto" ? `<span class="tag blue" title="De tus últimas 50 operaciones">auto</span>` : ""}</td>
      <td class="r">${r.pl != null ? `<span class="${r.pl >= 0 ? "up" : "down"}"><b>${r.pl >= 0 ? "+" : ""}${fmt(r.pl, Math.abs(r.pl) < 1 ? 3 : 1)}</b></span><div class="ctx">${r.plPct != null ? pct(r.plPct, 0) : "producido"}</div>` : `<span class="dim">—</span>`}</td>
      <td class="r cellbar dim">${fmt(r.share, 1)}%<i style="width:${Math.min(100, r.share * 2).toFixed(1)}%;left:auto;right:12px;max-width:60px"></i></td></tr>`).join("")}</tbody></table></div>
      <div class="mod-f"><span>Si vendes = (floor${S.p2pTax ? " − 10% comisión" : ""} − coste) × cantidad · coste auto = media de tus compras en las últimas 50 operaciones</span><span>casilla vacía = automático · 0 = lo produjiste tú</span></div>`;
  }
  const sort = MK_COLS.some((c) => c.key === S.marketSort.key) ? S.marketSort : { key: "todayVolume", dir: -1 };
  let rows = marketRows().map(withOpensea).filter((r) => colMatch(r.key) && (!q || r.name.toLowerCase().includes(q)));
  rows = sortRows([...rows], sort);
  setSub("mk-table", `${fmt(rows.length, 0)} items${q || S.marketCol ? " filtrados" : ""}`);
  if (!rows.length) return Empty("coin", "Sin resultados", "Prueba con otro nombre o colección.");
  const shown = rows.slice(0, S.marketLimit);
  return `<div class="tbl-wrap"><table class="tbl"><thead>${thSort(MK_COLS, sort)}</thead><tbody>${shown.map((r) => `
    <tr data-open="${r.key}"><td class="ic">${Star(r.key)}</td>
      <td class="w"><div class="name">${Gi(r.key, 12, colIcon(r.key))}<span>${esc(r.name)}</span>${r.bestOffer >= r.floor && r.floor ? `<span class="tag green">cruzado</span>` : ""}${r.osDiff != null && r.osDiff <= -10 ? `<span class="tag blue" title="Más barato en OpenSea">OpenSea ${fmt(r.osDiff, 0)}%</span>` : ""}</div></td>
      <td class="r"><b>${fmt(r.floor)}</b></td><td class="r">${fmt(r.bestOffer)}</td>
      <td class="r dim">${r.spread == null ? "—" : fmt(r.spread, 1) + "%"}</td><td class="r">${fmt(r.latestSale)}</td>
      <td class="r ${r.change > 0 ? "up" : r.change < 0 ? "down" : "dim"}">${pct(r.change)}</td>
      <td class="r">${r.todayVolume == null ? "…" : compact(r.todayVolume)}</td><td class="r dim">${r.todayTrades == null ? "…" : fmt(r.todayTrades, 0)}</td>
      <td class="r dim">${r.listingCount ?? 0} / ${r.offerCount ?? 0}</td>${osCell(r.os)}</tr>`).join("")}</tbody></table></div>
    ${rows.length > S.marketLimit ? `<button class="showmore" data-action="more">Mostrar ${Math.min(200, rows.length - S.marketLimit)} más · quedan ${fmt(rows.length - S.marketLimit, 0)}</button>` : ""}`;
}
