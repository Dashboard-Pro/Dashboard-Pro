// SFL Console — Ajustes, fichas de detalle (drawers), búsqueda y notificaciones.
// Scripts clásicos que comparten el ámbito global en el orden de index.html (antes, un solo app.js).
"use strict";

/* ── Ajustes ────────────────────────────────────────────────────────────── */
const ERR_KIND = { 401: "key rechazada", 403: "acceso denegado", 429: "límite de peticiones", 500: "error interno de SFL", 502: "SFL/Cloudflare no respondió", 503: "SFL no disponible", 504: "SFL tardó demasiado", red: "sin conexión" };
// Último error con su hora: rojo si sigue pasando (hubo errores en la última hora), gris si ya se resolvió
function lastErrorText(s) {
  const e = s.lastError;
  if (!e) return `<span class="faint">ninguno</span>`;
  if (typeof e === "string") return esc(e); // servidor antiguo sin fecha
  const active = s.errorsLastHour > 0 && !(s.lastOkAt && s.lastOkAt > e.at);
  const label = `${e.status} ${e.path} · ${ago(e.at)}`;
  return `<span class="${active ? "down" : "faint"}" data-tip="${esc(`${e.status} · ${ERR_KIND[e.status] || "error"}|${e.path} a las ${dateShort(e.at)}|${active ? "Sigue fallando: se reintenta solo" : "Resuelto: después hubo respuestas correctas"}`)}">${esc(label)}</span>${active ? "" : ` <span class="tag green">resuelto</span>`}`;
}
// gamedata.js no viene de la API: es un archivo que genera `npm run gamedata`. No se refresca solo.
function gameDataText() {
  const at = Date.parse(G.generatedAt);
  const days = (Date.now() - at) / 86400_000;
  const txt = `${fmt(Object.keys(G.crops).length, 0)} cultivos · ${fmt(Object.keys(G.itemIds).length, 0)} items · generado ${ago(at)}`;
  // El servidor los regenera solo si tienen más de 7 días (cloud/gamedata-updater.js); aquí, estado y botón
  const u = store.status?.data?.gameData;
  const newer = u?.generatedAt && u.generatedAt > at + 60_000;
  return `<span data-tip="${esc(`Datos del juego|Tiempos, recetas, skills, iconos y tickets extraídos del código del juego (${G.source || "copia local"}). Se actualizan solos cada semana; puedes forzarlo aquí.|${u?.lastCheck ? `última comprobación ${ago(u.lastCheck)}` : ""}`)}">${txt}</span>${days > 14 ? ` <span class="tag red">desactualizado</span>` : ""}
    ${u?.running ? ` <span class="tag sun">actualizando…</span>` : newer ? ` <a class="tag green" href="" onclick="location.reload();return false">hay datos nuevos: recarga</a>` : ` <button class="btn sm ghost" data-gamedata="update">Actualizar</button>`}
    ${u?.lastError ? `<div class="ctx down">${esc(u.lastError.message)}</div>` : ""}`;
}

function worldText(w) {
  if (!w || (!w.calls && !w.cacheHits)) return `<span class="faint">sin usar aún</span>`;
  const err = w.lastError && (!w.lastOkAt || w.lastError.at > w.lastOkAt);
  return `${err ? `<span class="down">falla desde ${ago(w.lastError.at)}</span> · ` : `<span class="up">ok</span> · `}${fmt(w.calls, 0)} consultas, ${fmt(w.cacheHits, 0)} desde caché${w.lastOkAt ? ` · última ${ago(w.lastOkAt)}` : ""}`;
}
function wProxy() {
  const s = store.status.data;
  const row = (k, v) => `<dt>${k}</dt><dd>${v}</dd>`;
  return `<dl class="kv">
    ${row("API key", s.hasKey ? `<span class="up">configurada</span>` : `<span class="down">falta</span>`)}
    ${row("Farm ID", esc(s.farmId ?? "—"))}
    ${row("Llamadas a la API", fmt(s.upstreamCalls, 0))}
    ${row("Servidas desde caché", `${fmt(s.cacheHits, 0)} <span class="faint">(${fmt((s.cacheHits / Math.max(1, s.cacheHits + s.upstreamCalls)) * 100, 0)}%)</span>`)}
    ${row("Frenadas (429)", fmt(s.throttled, 0))}
    ${row("En cola ahora", fmt(s.queue, 0))}
    ${row("Desfase de reloj", `${fmt(s.serverOffsetMs, 0)} ms`)}
    ${row("Reintentos automáticos", `${fmt(s.retried || 0, 0)} <span class="faint">(errores 5xx y de red, a los 5 s · 15 s · 45 s)</span>`)}
    ${row("Errores en la última hora", s.errorsLastHour ? `<span class="down">${s.errorsLastHour}</span>` : `<span class="up">0</span>`)}
    ${row("Último error", lastErrorText(s))}
    ${row("Última respuesta correcta", s.lastOkAt ? ago(s.lastOkAt) : "—")}
    ${row("Datos del juego <span class=\"faint\">(archivo local)</span>", gameDataText())}
    ${row("sfl.world <span class=\"faint\">(boosts, €, subastas)</span>", worldText(s.world))}
  </dl><div class="mod-f"><span>Límite: 1 petición / 5 s por IP</span><span>npm run gamedata para actualizar tiempos</span></div>`;
}

/* ════════════════════════════════════════════════════════════════════════
   10. Drawers de detalle
   ════════════════════════════════════════════════════════════════════════ */
function openDrawer(html) {
  $("#drawerBody").innerHTML = html;
  $("#drawer").hidden = false;
  $(".drawer-panel").scrollTop = 0;
}
const closeDrawer = () => ($("#drawer").hidden = true);

async function openItem(key) {
  const m = key.match(/^(collectibles|wearables|pets|buds)-(\d+)$/);
  const name = itemName(key);
  const big = Gi(key, 56);
  const head = (extra = "") => `<div class="dw-h${big ? " with-img" : ""}">${big}<div><h3>${esc(name)}</h3><div class="ctx">${esc(key)} ${Star(key)} ${extra}</div></div></div>`;
  openDrawer(head() + (m ? Loading("hero") + Loading("rows", 6) : Empty("coin", "Sin detalle", "La API no ofrece libro de órdenes para este tipo de item.")));
  if (!m) return;
  try {
    // El resumen del volcado (local, ~100 KB) dice en cuántas granjas activas está el item
    if (!has("dump")) await LOADERS.dump().catch(() => null);
    const { data: d } = await data("tradeable", { collection: m[1], id: m[2] });
    const hist = d.history?.history || {};
    const days = Object.values(hist.dates || {}).sort((a, b) => a.date.localeCompare(b.date));
    const fp = store.activity?.data?.flowerPrice || 0;
    const qty = has("farm") ? toNum((m[1] === "wearables" ? store.farm.data.farm.wardrobe : store.farm.data.farm.inventory)?.[name]) : 0;
    const week = days.reduce((s, x) => s + (x.volume || 0), 0);

    // ¿Estás tú entre las últimas ventas de este item? Entonces es una compra/venta tuya que quizá no teníamos.
    const me = has("farm") && !S.viewing ? store.farm.data.id : null;
    const found = me ? (d.history?.sales || []).filter((s) => tradeSide(s, me)).map((s) => ({ ...s, itemId: s.itemId ?? Number(m[2]), collection: s.collection ?? m[1] })) : [];
    if (found.length) {
      fetch("/api/history", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ farmId: me, trades: found, via: "item" }) })
        .then((r) => r.json())
        .then((r) => {
          if (!r.added) return;
          toast(`Recuperada${r.added > 1 ? "s" : ""} ${r.added} operación${r.added > 1 ? "es" : ""} tuya${r.added > 1 ? "s" : ""} con ${name}`);
          if (store.history) store.history.at = 0;
          LOADERS.history().then(() => repaint("activity")).catch(() => {});
        })
        .catch(() => {});
    }
    const myTrades = me ? [...new Map([...allTrades(), ...found].filter((t) => `${t.collection}-${t.itemId}` === key).map((t) => [t.id, t])).values()]
      .map((t) => ({ ...t, side: tradeSide(t, me), unit: toNum(t.sfl) / Math.max(1, toNum(t.quantity)) })).filter((t) => t.side)
      .sort((x, y) => toNum(y.fulfilledAt) - toNum(x.fulfilledAt)) : [];
    const myBuys = myTrades.filter((t) => t.side === "buy");
    const avgBuy = myBuys.length ? myBuys.reduce((s, t) => s + toNum(t.sfl), 0) / myBuys.reduce((s, t) => s + toNum(t.quantity), 0) : null;
    const mySection = `<div class="dw-sec"><h4>Tus operaciones con este item${Legend("profit")}${avgBuy != null ? ` · compra media ${fmt(avgBuy)} FLOWER/u` : ""}</h4>${myTrades.length
      ? `<table class="tbl"><tbody>${myTrades.map((t) => `<tr><td class="dim">${dateShort(t.fulfilledAt)}</td><td>${t.side === "buy" ? `<span class="tag blue">compra</span>` : `<span class="tag sun">venta</span>`}</td>
          <td class="r">${fmt(t.quantity)}</td><td class="r"><b>${fmt(t.unit)}</b>/u</td>
          <td class="r ${t.side === "buy" ? (d.floor * (S.p2pTax ? 0.9 : 1) >= t.unit ? "up" : "down") : ""}">${t.side === "buy" && d.floor ? pct(((d.floor * (S.p2pTax ? 0.9 : 1) - t.unit) / t.unit) * 100, 0) + " hoy" : ""}</td></tr>`).join("")}</tbody></table>`
      : `<div class="ctx" style="padding:0 24px 14px">No hay operaciones tuyas archivadas ni entre las 10 últimas ventas. Puedes poner tu coste a mano en Mercado → Mi inventario.</div>`}</div>`;
    $("#drawerBody").innerHTML = head(`${d.isVip ? '<span class="tag sun">VIP</span>' : ""}${d.isActive === false ? '<span class="tag red">no tradeable</span>' : ""}`) + `
      <div class="kstrip">
        ${Kcell("Floor", fmt(d.floor), `≈ $${fmt((d.floor || 0) * fp, 4)}`, "sun")}
        ${Kcell("Última venta", fmt(d.lastSalePrice), d.floor && d.lastSalePrice ? `${pct(((d.lastSalePrice - d.floor) / d.floor) * 100)} vs floor` : "")}
        ${Kcell("Volumen 7 d", compact(week), `${fmt(days.reduce((s, x) => s + (x.sales || 0), 0), 0)} ventas`)}
        ${Kcell("Supply", d.supply != null ? compact(d.supply) : "∞", `${compact(hist.totalSales)} ventas totales`)}
        ${qty ? Kcell("Tienes", fmt(qty), `≈ ${fmt(qty * (d.floor || 0), 1)} FLOWER`) : ""}
        ${(() => { const c = (m[1] === "wearables" ? store.dump?.data?.wearables : store.dump?.data?.items)?.[name]; return c ? Kcell("En granjas activas", fmt(c[1], 0), `${compact(c[0])} unidades · volcado del ${esc(store.dump.data.date)}`) : ""; })()}
      </div>
      ${me ? mySection : ""}
      ${alertBox(key, name, d.floor)}
      <div class="dw-sec" id="evoSec"><h4>Evolución desde tu compra</h4>${Loading("block")}</div>
      <div class="dw-sec"><h4>Rango diario y volumen · 7 días</h4><div class="chart">${priceChart(days)}</div></div>
      <div class="dw-sec"><div class="dw-cols">
        <div><h4 style="margin:0;padding:12px 16px 8px" class="eyebrow">Listados · ${d.listingCount}</h4>${bookTable(d.listings, "listedAt", "down")}</div>
        <div><h4 style="margin:0;padding:12px 16px 8px" class="eyebrow">Ofertas · ${d.offerCount}</h4>${bookTable(d.offers, "offeredAt", "up")}</div>
      </div></div>
      <div class="dw-sec"><h4>Ventas recientes</h4>
        <table class="tbl"><thead><tr><th>Cuándo</th><th class="r">Cant.</th><th class="r">Precio/u</th><th>Comprador</th></tr></thead>
        <tbody>${(d.history?.sales || []).map((s) => `<tr><td class="dim">${dateShort(s.fulfilledAt)}</td><td class="r">${fmt(s.quantity)}</td>
          <td class="r"><b>${fmt(s.sfl / (s.quantity || 1))}</b></td><td>${esc(s.fulfilledBy?.username || "#" + (s.fulfilledBy?.id ?? "?"))}</td></tr>`).join("") || `<tr><td colspan="4" class="dim">Sin ventas</td></tr>`}</tbody></table></div>`;
    loadEvolution(key, S.costs[key] ?? avgBuy, d.floor, myBuys);
  } catch (e) {
    $("#drawerBody").innerHTML = head() + ErrorState(e);
  }
}

// Floor guardado cada día por el servidor (data/prices-*.json) frente a lo que pagaste.
async function loadEvolution(key, ref, floorNow, buys) {
  const sec = $("#evoSec");
  if (!sec) return;
  const title = `<h4>Evolución desde tu compra${Legend("profit")}</h4>`;
  try {
    const { series } = await api(`/api/prices?key=${encodeURIComponent(key)}`);
    // La foto de hoy se sustituye por el floor en vivo (no se duplica el día)
    const pts = series.filter((s) => s.date !== todayUTC()).map((s) => ({ t: Date.parse(s.date + "T12:00:00Z"), v: s.floor }));
    if (floorNow) pts.push({ t: now(), v: floorNow });
    const net = S.p2pTax ? 0.9 : 1;
    const since = buys.length ? Math.min(...buys.map((b) => toNum(b.fulfilledAt))) : pts[0]?.t;
    const summary = ref != null && floorNow
      ? `<div class="evo-sum"><span>Pagaste <b>${fmt(ref)}</b>/u</span><span>floor hoy <b>${fmt(floorNow)}</b></span>
          <span class="${floorNow >= ref ? "up" : "down"}"><b>${pct(((floorNow - ref) / ref) * 100, 1)}</b> precio</span>
          <span class="${floorNow * net >= ref ? "up" : "down"}">${pct(((floorNow * net - ref) / ref) * 100, 1)} si vendes${S.p2pTax ? " (−10%)" : ""}</span>
          ${since ? `<span class="faint">desde ${dateShort(since)}</span>` : ""}</div>`
      : `<div class="ctx" style="padding:0 24px 10px">${ref == null ? "No hay precio de compra: ponlo en Mercado → Mi inventario para compararlo." : ""}</div>`;
    if (pts.length < 2) {
      sec.innerHTML = title + summary + `<div class="ctx" style="padding:0 24px 14px">El gráfico se irá llenando: el dashboard guarda el floor de este item cada día mientras el servidor esté encendido.</div>`;
      return;
    }
    sec.innerHTML = title + summary + `<div class="chart">${evoChart(pts, ref, buys)}</div>`;
  } catch (e) {
    sec.innerHTML = title + ErrorState(e);
  }
}

function evoChart(pts, ref, buys) {
  const W = 620, H = 170, pl = 52, pr = 10, pt = 12, pb = 22;
  const vals = [...pts.map((p) => p.v), ...(ref != null ? [ref] : []), ...buys.map((b) => toNum(b.sfl) / Math.max(1, toNum(b.quantity)))];
  const t0 = Math.min(pts[0].t, ...buys.map((b) => toNum(b.fulfilledAt)).filter(Boolean)), t1 = pts[pts.length - 1].t;
  let lo = Math.min(...vals), hi = Math.max(...vals);
  const pad = (hi - lo) * 0.15 || hi * 0.1 || 1;
  lo = Math.max(0, lo - pad); hi += pad;
  const X = (t) => pl + ((t - t0) / Math.max(1, t1 - t0)) * (W - pl - pr);
  const Y = (v) => pt + (1 - (v - lo) / (hi - lo)) * (H - pt - pb);
  let s = `<svg viewBox="0 0 ${W} ${H}">`;
  for (let i = 0; i <= 3; i++) {
    const v = lo + ((hi - lo) * i) / 3, y = Y(v);
    s += `<line x1="${pl}" x2="${W - pr}" y1="${y}" y2="${y}" stroke="var(--line)"/><text class="ax" x="${pl - 6}" y="${y + 3}" text-anchor="end">${fmt(v)}</text>`;
  }
  // Línea escalonada del floor (estilo pixel)
  let d = `M${X(pts[0].t)},${Y(pts[0].v)}`;
  for (let i = 1; i < pts.length; i++) d += ` H${X(pts[i].t)} V${Y(pts[i].v)}`;
  const up = ref == null || pts[pts.length - 1].v >= ref;
  s += `<path d="${d}" fill="none" stroke="${up ? "var(--green)" : "var(--red)"}" stroke-width="2"/>`;
  for (const p of pts) s += `<rect x="${X(p.t) - 2}" y="${Y(p.v) - 2}" width="4" height="4" fill="${up ? "var(--green)" : "var(--red)"}" data-tip="${esc(`${new Date(p.t).toLocaleDateString(LOCALE)}|floor ${fmt(p.v)} FLOWER|${ref != null ? pct(((p.v - ref) / ref) * 100) + " vs tu compra" : ""}`)}"/>`;
  if (ref != null) {
    s += `<line x1="${pl}" x2="${W - pr}" y1="${Y(ref)}" y2="${Y(ref)}" stroke="var(--sun)" stroke-dasharray="4 3"/>`;
    s += `<text class="ax" x="${W - pr}" y="${Y(ref) - 4}" text-anchor="end" fill="var(--sun)">tu compra ${fmt(ref)}</text>`;
  }
  for (const b of buys) {
    const u = toNum(b.sfl) / Math.max(1, toNum(b.quantity));
    s += `<rect x="${X(toNum(b.fulfilledAt)) - 4}" y="${Y(u) - 4}" width="8" height="8" fill="var(--blue)" stroke="#0b0f0a" data-tip="${esc(`Compra ${dateShort(toNum(b.fulfilledAt))}|${fmt(b.quantity)} × ${fmt(u)} FLOWER|`)}"/>`;
  }
  s += `<text class="ax" x="${pl}" y="${H - 6}">${new Date(t0).toLocaleDateString(LOCALE, { day: "numeric", month: "short" })}</text>`;
  s += `<text class="ax" x="${W - pr}" y="${H - 6}" text-anchor="end">hoy</text>`;
  return s + `</svg>`;
}

function bookTable(rows = [], atKey, tone) {
  if (!rows.length) return `<div class="ctx" style="padding:4px 16px 14px">Vacío</div>`;
  const maxQ = Math.max(...rows.slice(0, 10).map((r) => r.quantity || 0), 1);
  return `<table class="tbl"><thead><tr><th class="r">Precio</th><th class="r">Cant.</th><th>Hace</th></tr></thead><tbody>${rows.slice(0, 10).map((r) =>
    `<tr><td class="r ${tone}"><b>${fmt(r.sfl)}</b></td><td class="r cellbar">${compact(r.quantity)}<i style="width:${((r.quantity / maxQ) * 60).toFixed(0)}%;left:auto;right:12px;background:var(--${tone === "up" ? "green" : "red"})"></i></td>
      <td class="dim">${ago(r[atKey])}${r.type === "onchain" ? ' <span class="tag blue">chain</span>' : ""}</td></tr>`).join("")}</tbody></table>`;
}

function priceChart(days) {
  if (!days.length) return Empty("coin", "Sin historial", "No hay ventas en los últimos 7 días.");
  const W = 620, H = 200, pl = 52, pr = 8, pt = 10, pb = 24, volH = 42;
  const lo0 = Math.min(...days.map((d) => d.low)), hi0 = Math.max(...days.map((d) => d.high));
  const pad = (hi0 - lo0) * 0.12 || hi0 * 0.1 || 1;
  const lo = Math.max(0, lo0 - pad), hi = hi0 + pad;
  const vmax = Math.max(...days.map((d) => d.volume || 0), 1);
  const step = (W - pl - pr) / days.length;
  const X = (i) => pl + step * i + step / 2;
  const Y = (v) => pt + (1 - (v - lo) / (hi - lo)) * (H - pt - pb - volH - 6);
  let s = `<svg viewBox="0 0 ${W} ${H}" shape-rendering="crispEdges">`;
  for (let i = 0; i <= 3; i++) {
    const v = lo + ((hi - lo) * i) / 3, y = Math.round(Y(v)) + 0.5;
    s += `<line x1="${pl}" x2="${W - pr}" y1="${y}" y2="${y}" stroke="var(--line)"/><text class="ax" x="${pl - 6}" y="${y + 3}" text-anchor="end">${fmt(v)}</text>`;
  }
  const bw = Math.max(4, Math.round(step * 0.34));
  days.forEach((d, i) => {
    const x = Math.round(X(i));
    const vh = Math.max(1, Math.round(((d.volume || 0) / vmax) * volH));
    s += `<rect x="${x - bw}" y="${H - pb - vh}" width="${bw * 2}" height="${vh}" fill="var(--blue)" fill-opacity="0.4" data-tip="${esc(`${d.date}|Volumen ${fmt(d.volume, 1)} FLOWER|${d.sales} ventas`)}"/>`;
    const y1 = Math.round(Y(d.high)), y2 = Math.round(Y(d.low));
    s += `<rect x="${x - bw / 2}" y="${y1}" width="${bw}" height="${Math.max(2, y2 - y1)}" fill="var(--sun)" data-tip="${esc(`${d.date}|${fmt(d.low)} – ${fmt(d.high)} FLOWER|${d.sales} ventas`)}"/>`;
    s += `<text class="ax" x="${x}" y="${H - 8}" text-anchor="middle">${d.date.slice(5)}</text>`;
  });
  return s + `</svg>`;
}

// Historial completo de subastas (sfl.world): cada una trae ya su clasificación, sin más peticiones.
// Corte = puja del último ganador: lo mínimo que hacía falta para llevarse el premio.
const auPrize = (a) => a.collectible || a.wearable || (a.nft === "Pet" ? "Pet NFT" : a.nft) || "?";
function auctionCut(a) {
  const lb = a.result?.leaderboard || [];
  return lb[Math.min(a.result?.supply ?? a.supply, lb.length) - 1] || null;
}
// Lo que pagó de verdad: FLOWER y/o ingredientes (gemas, Salt Rock…); si no consta, número de pujas
function bidText(a, e) {
  if (!e) return "—";
  const parts = [e.sfl > 0 ? `${fmt(e.sfl, 0)} FLOWER` : "", ...Object.entries(e.items || {}).filter(([, v]) => v > 0).map(([k, v]) => `${fmt(v, 0)} ${k === "Gem" ? "gemas" : k}`)].filter(Boolean);
  return parts.join(" + ") || `${fmt(e.tickets, 0)} pujas`;
}
// Sin sfl.world: las subastas terminadas de la API oficial; la clasificación de cada una se pide al pulsarla
function wAuctionHistoryOfficial() {
  if (!loadFailed("worldAuctions")) return Loading("rows");
  if (!has("auctions")) return loadFailed("auctions") ? Empty("hammer", "Sin datos", "Ni sfl.world ni la API oficial responden ahora mismo.") : Loading("rows");
  const t = now(), q = S.auHistQ.trim().toLowerCase();
  const all = store.auctions.data.filter((a) => a.endAt < t).sort((x, y) => y.endAt - x.endAt);
  const list = all.filter((a) => !q || auctionPrize(a).toLowerCase().includes(q));
  setSub("ev-hist", `${all.length} subastas terminadas · sfl.world no responde: pulsa una para ver su clasificación (API oficial)`);
  if (!list.length) return Empty("hammer", "Sin resultados", q ? "Ninguna subasta con ese premio." : "No hay subastas terminadas.");
  return `<div class="tbl-wrap" style="max-height:520px"><table class="tbl"><thead><tr><th>Fecha</th><th>Premio</th><th class="r">Supply</th><th class="r">Cada puja</th></tr></thead><tbody>
    ${list.slice(0, 150).map((a) => `<tr data-auction="${esc(a.auctionId)}" style="cursor:pointer"><td class="dim">${dateShort(a.endAt)}</td>
      <td class="w"><div class="name">${sprite(auctionIcon(a), 12)}<span>${esc(auctionPrize(a))}</span></div></td><td class="r">${fmt(a.supply, 0)}</td>
      <td class="r dim">${[a.sfl ? `${fmt(a.sfl)} FLOWER` : "", ...Object.entries(a.ingredients || {}).map(([k, v]) => `${fmt(v)} ${esc(k)}`)].filter(Boolean).join(" + ") || "gratis"}</td></tr>`).join("")}</tbody></table></div>
    ${list.length > 150 ? `<div class="mod-f"><span>Mostrando 150 de ${list.length}: filtra por premio para ver más</span></div>` : ""}`;
}
function wAuctionHistory() {
  if (!has("worldAuctions")) return wAuctionHistoryOfficial();
  const t = now();
  const q = S.auHistQ.trim().toLowerCase();
  const all = store.worldAuctions.data.filter((a) => a.endAt < t && a.result?.leaderboard).sort((x, y) => y.endAt - x.endAt);
  const list = all.filter((a) => !q || auPrize(a).toLowerCase().includes(q));
  const mine = all.filter((a) => a.result.leaderboard.some((e) => isMe(e.farmId)));
  const won = mine.filter((a) => { const e = a.result.leaderboard.find((x) => isMe(x.farmId)); return e.rank <= (a.result.supply ?? a.supply); });
  const range = all.length ? `${dateShort(all[all.length - 1].endAt)} → ${dateShort(all[0].endAt)}` : "";
  setSub("ev-hist", `${all.length} subastas con resultados (${range})${mine.length ? ` · participaste en <b>${mine.length}</b>, ganaste <b>${won.length}</b>` : ""} · fuente sfl.world, las recientes están en Subastas`);
  if (!list.length) return Empty("hammer", "Sin resultados", q ? "Ninguna subasta con ese premio." : "No hay subastas terminadas.");
  return `<div class="tbl-wrap" style="max-height:520px"><table class="tbl"><thead><tr><th>Fecha</th><th>Premio</th><th class="r">Supply</th><th class="r">Pujadores</th><th class="r" data-tip="Corte|Puja del último ganador: lo mínimo que hizo falta para llevarse una unidad|" tabindex="0">Corte</th><th class="r">Puja #1</th><th>Tú</th></tr></thead><tbody>
    ${list.slice(0, 150).map((a) => {
      const lb = a.result.leaderboard, sup = a.result.supply ?? a.supply;
      const me = lb.find((e) => isMe(e.farmId));
      return `<tr class="${me ? "me" : ""}" data-wauction="${esc(a.auctionId)}"><td class="dim">${dateShort(a.endAt)}</td>
        <td class="w"><div class="name">${sprite(auctionIcon(a), 12)}<span>${esc(auPrize(a))}</span></div></td>
        <td class="r">${fmt(sup, 0)}</td><td class="r dim">${fmt(a.result.participantCount ?? lb.length, 0)}</td>
        <td class="r"><b>${bidText(a, auctionCut(a))}</b></td><td class="r dim">${bidText(a, lb[0])}</td>
        <td>${me ? `<span class="tag ${me.rank <= sup ? "green" : "red"}">#${me.rank} ${me.rank <= sup ? "ganada" : "fuera"}</span>` : ""}</td></tr>`;
    }).join("")}</tbody></table></div>
    ${list.length > 150 ? `<div class="mod-f"><span>Mostrando 150 de ${list.length}: filtra por premio para ver más</span></div>` : ""}`;
}
function openWorldAuction(id) {
  const a = store.worldAuctions?.data?.find((x) => x.auctionId === id);
  if (!a) return;
  const lb = a.result.leaderboard, sup = a.result.supply ?? a.supply;
  const cost = [a.sfl ? `${fmt(a.sfl)} FLOWER` : "", ...Object.entries(a.ingredients || {}).map(([k, v]) => `${fmt(v)} ${k}`)].filter(Boolean).join(" + ") || "gratis";
  openDrawer(`<div class="dw-h"><h3>${esc(auPrize(a))}</h3><div class="ctx">${dateShort(a.endAt)} · cada puja cuesta ${esc(cost)} · fuente sfl.world</div></div>
    <div class="kstrip">${Kcell("Supply", fmt(sup, 0))}${Kcell("Pujadores", fmt(a.result.participantCount ?? lb.length, 0))}${Kcell("Corte", bidText(a, auctionCut(a)), "puja del último ganador", "sun")}</div>
    <div class="dw-sec"><h4>Clasificación · ganadores resaltados</h4><table class="tbl"><thead><tr><th>#</th><th>Jugador</th><th class="r">Pagó</th></tr></thead><tbody>
      ${lb.slice(0, 200).map((e) => `<tr class="${e.rank <= sup || isMe(e.farmId) ? "me" : ""}"><td class="ic">${Rank(e.rank)}</td><td class="w">${Player(e.username || "#" + e.farmId, null, e.farmId)}</td>
        <td class="r">${bidText(a, e)}</td></tr>`).join("")}</tbody></table></div>`);
}

async function openAuction(id) {
  const a = store.auctions?.data?.find((x) => x.auctionId === id);
  const head = `<div class="dw-h"><h3>${esc(a ? auctionPrize(a) : "Subasta")}</h3><div class="ctx">${esc(id)}</div></div>`;
  openDrawer(head + Loading("rows", 8));
  try {
    const d = (await data("auctionResults", { auctionId: id })).data;
    const cutoff = d.leaderboard?.[Math.min(d.supply, d.leaderboard.length) - 1];
    $("#drawerBody").innerHTML = head + `<div class="kstrip">
        ${Kcell("Estado", d.status === "complete" ? "Cerrada" : "Pendiente", "", d.status === "complete" ? "" : "sun")}
        ${Kcell("Pujadores", fmt(d.participantCount ?? 0, 0), `${fmt(d.supply, 0)} premios`)}
        ${Kcell("Corte", cutoff ? `${fmt(cutoff.tickets, 0)}` : "—", "tickets del último ganador")}
      </div>
      <div class="dw-sec"><h4>Clasificación · ganadores resaltados</h4><table class="tbl"><thead><tr><th>#</th><th>Jugador</th><th class="r">Tickets</th><th class="r">XP</th></tr></thead>
      <tbody>${(d.leaderboard || []).slice(0, 100).map((r) => `<tr class="${r.rank <= d.supply || isMe(r.farmId) ? "me" : ""}">
        <td class="ic">${Rank(r.rank)}</td><td class="w">${esc(r.username || "#" + r.farmId)}</td><td class="r">${fmt(r.tickets, 0)}</td><td class="r dim">${compact(r.experience)}</td></tr>`).join("")}</tbody></table></div>`;
  } catch (e) {
    $("#drawerBody").innerHTML = head + ErrorState(e);
  }
}

async function openRaffle(id) {
  const raffle = store.raffles?.data?.find((r) => r.id === id);
  const prizes = Object.entries(raffle?.prizes || {});
  const ended = raffle && raffle.endAt < now();
  const head = `<div class="dw-h"><h3>${esc(id)}</h3><div class="ctx">${raffle ? `${dateShort(raffle.startAt)} → ${dateShort(raffle.endAt)}` : ""}</div></div>`;
  const prizeTbl = `<div class="dw-sec"><h4>Premios · ${prizes.length} posiciones</h4><table class="tbl"><tbody>${prizes.slice(0, 12).map(([pos, p]) =>
    `<tr><td class="ic">${Rank(Number(pos))}</td><td class="w">${esc(prizeText(p))}</td><td class="r">${p.onChain ? '<span class="tag blue">on-chain</span>' : ""}</td></tr>`).join("")}</tbody></table></div>
    <div class="dw-sec"><h4>Entradas</h4><div class="ctx" style="padding:0 24px 14px">${esc(Object.entries(raffle?.entryRequirements || {}).map(([k, v]) => `1 ${k} = ${v} entradas`).join(" · "))}</div></div>`;
  openDrawer(head + prizeTbl + (ended ? `<div id="raffleRes">${Loading("rows", 5)}</div>` : ""));
  if (!ended) return;
  try {
    const d = (await data("raffleResults", { id })).data;
    $("#raffleRes").innerHTML = `<div class="kstrip">${Kcell("Participantes", fmt(d.participants, 0))}${Kcell("Entradas", compact(d.entries), `${fmt(d.entries / Math.max(1, d.participants), 1)} por jugador`)}</div>
      <div class="dw-sec"><h4>Ganadores</h4><table class="tbl"><thead><tr><th>#</th><th>Jugador</th><th class="r">Entradas</th><th>Premio</th></tr></thead><tbody>${(d.winners || []).map((w) => `
        <tr class="${isMe(w.farmId) ? "me" : ""}"><td class="ic">${Rank(w.position)}</td><td>${Player(w.profile?.username || "#" + w.farmId, w.profile?.equipped, w.farmId, { level: w.profile?.level })}</td><td class="r">${fmt(w.entries, 0)}</td><td class="dim">${esc(prizeText(w))}</td></tr>`).join("")}</tbody></table></div>`;
  } catch (e) {
    $("#raffleRes").innerHTML = ErrorState(e);
  }
}

/* ════════════════════════════════════════════════════════════════════════
   11. Búsqueda global
   ════════════════════════════════════════════════════════════════════════ */
let searchSel = 0, searchList = [];
function searchIndex() {
  if (has("activity")) {
    const a = store.activity.data;
    if (searchIndex.a !== a) { searchIndex.a = a; searchIndex.c = Object.keys(a.items).map((k) => ({ key: k, name: itemName(k), floor: a.items[k].floor })); }
    return searchIndex.c;
  }
  return (searchIndex.fb ||= Object.entries(G.itemIds).map(([n, id]) => ({ key: `collectibles-${id}`, name: n })));
}
function renderSearch() {
  const q = $("#search").value.trim().toLowerCase();
  const box = $("#searchRes");
  if (!q) { box.hidden = true; return; }
  const idx = searchIndex();
  const starts = [], contains = [];
  for (const it of idx) {
    const n = it.name.toLowerCase();
    if (n.startsWith(q)) starts.push(it); else if (n.includes(q)) contains.push(it);
    if (starts.length > 10) break;
  }
  const raw = $("#search").value.trim();
  const players = q.length >= 2 ? knownPlayers().filter((pl) => pl.name.toLowerCase().includes(q))
    .sort((a, b) => Number(!a.name.toLowerCase().startsWith(q)) - Number(!b.name.toLowerCase().startsWith(q))).slice(0, 3) : [];
  const exact = players.some((pl) => pl.name.toLowerCase() === q);
  searchList = [
    ...players.map((pl) => ({ player: pl })),
    ...[...starts, ...contains].slice(0, 8),
    ...(/^\d{1,12}$/.test(raw) ? [{ farm: raw }] : []),
    ...(q.length >= 3 && !exact && /^[^/\\?#%]{1,40}$/.test(raw) ? [{ find: raw }] : []),
  ];
  searchSel = Math.min(searchSel, Math.max(0, searchList.length - 1));
  box.hidden = false;
  box.innerHTML = searchList.length
    ? searchList.map((it, i) => {
      const on = i === searchSel ? "on" : "";
      if (it.player) return `<div class="sr ${on}" data-player="${esc(it.player.id)}" data-pname="${esc(it.player.name)}" data-search>${Player(it.player.name, it.player.bumpkin).replace(/^<span class="pl">/, '<span class="pl sr-pl">')}<span class="n">jugador</span></div>`;
      if (it.farm) return `<a class="sr sr-find ${on}" href="${esc(viewFarmUrl(it.farm))}" data-search>${sprite("globe", 14)}<span>Ver la granja #${esc(it.farm)}</span><span class="n">granja</span></a>`;
      if (it.find) return `<div class="sr sr-find ${on}" data-findplayer="${esc(it.find)}" data-search>${sprite("trophy", 14)}<span>Buscar jugador «${esc(it.find)}»</span><span class="n">sfl.world</span></div>`;
      return `<div class="sr ${on}" data-open="${it.key}" data-search>${Gi(it.key, 14, colIcon(it.key))}<span>${esc(it.name)}</span>${it.floor != null ? `<span class="n">${fmt(it.floor)}</span>` : ""}</div>`;
    }).join("")
    : `<div class="sr-empty">Sin coincidencias para “${esc(q)}”</div>`;
}
// Jugadores ya conocidos (rankings cargados): aparecen al instante y con foto
function knownPlayers() {
  const out = new Map();
  for (const b of Object.values(store.stats?.data?.boards || {})) for (const p of b.players) if (!out.has(String(p.farmId))) out.set(String(p.farmId), { id: p.farmId, name: p.username, bumpkin: p.bumpkin });
  if (has("tickets")) { const { top, around } = ticketRows(store.tickets.data); for (const r of [...top, ...(around || [])]) { const id = r.farmId ?? r.accountId; if (id != null && !out.has(String(id))) out.set(String(id), { id, name: r.id, bumpkin: r.bumpkin }); } }
  return [...out.values()].filter((p) => p.name);
}
// Nombre → granja con sfl.world (no distingue mayúsculas) y abre su ficha
async function findPlayer(name) {
  closeSearch();
  $("#search").blur();
  toast(`Buscando a ${name}…`, 2500);
  try {
    const r = await api(`/api/ext/user/${encodeURIComponent(name)}`);
    openPlayerCardFor(r.farm_id ?? r.nft_id, r.username || name, $("#search"));
  } catch (e) {
    toast(e.status === 404 ? `No hay ninguna granja llamada «${name}» (las granjas de hoy aparecen al día siguiente)` : "No se pudo buscar por nombre ahora mismo: prueba con el número de la granja", 4500);
  }
}
function closeSearch() { $("#searchRes").hidden = true; }

/* ════════════════════════════════════════════════════════════════════════
   12. Notificaciones
   ════════════════════════════════════════════════════════════════════════ */
const timerKey = (x) => `${x.cat}|${x.id ?? x.name}|${x.ready}`;
// Avisar unos minutos antes (Ajustes de Granja: al momento, 5, 15 o 30 min antes); vale para el navegador y Discord
S.notifyEarly = Number(readLS("notifyEarly", 0)) || 0;
const notifyLead = () => S.notifyEarly * 60_000;
function primeNotified(timers) {
  const t = now();
  S.notified = new Set(timers.filter((x) => x.ready - notifyLead() <= t).map(timerKey));
}
ACTIONS.notifyearly = (v) => { S.notifyEarly = Number(v) || 0; writeLS("notifyEarly", S.notifyEarly); if (has("farm")) primeNotified(store.farm.data.timers); rerun(); toast(S.notifyEarly ? `Te avisaremos ${S.notifyEarly} min antes` : "Te avisaremos al momento"); };
function checkNotifications() {
  if (!has("farm") || S.viewing) return;
  const t = now();
  const fresh = store.farm.data.timers.filter((x) => x.ready - notifyLead() <= t && !S.notified.has(timerKey(x)));
  if (!fresh.length) return;
  fresh.forEach((x) => S.notified.add(timerKey(x)));
  const byCat = {};
  for (const x of fresh) (byCat[x.cat] ||= []).push(x);
  // Discord (webhook propio, lo envía el servidor local): solo las categorías elegidas en Ajustes
  if (S.discord?.configured) {
    const lines = Object.entries(byCat).filter(([k]) => S.discord.cats.includes(k))
      .map(([k, list]) => `${CATS[k].label}: ${groupTimers(list).map((g) => `${g.name}${g.count > 1 ? " ×" + g.count : ""}`).join(", ")}`);
    if (lines.length) jpost("/api/notify", { lines }).catch(() => {});
  }
  if (!S.notify || !("Notification" in window) || Notification.permission !== "granted") return;
  for (const [k, list] of Object.entries(byCat)) {
    const body = groupTimers(list).map((g) => `${g.name}${g.count > 1 ? " ×" + g.count : ""}`).join(", ");
    const soon = list.filter((x) => x.ready > t);
    const title = soon.length ? `${CATS[k].label}: listo en ${dur(Math.max(...soon.map((x) => x.ready)) - t)}` : `${CATS[k].label}: listo para recoger`;
    try { new Notification(title, { body, tag: `sfl-${k}` }); } catch { /* ignorar */ }
  }
}

/* ── Actualizaciones del dashboard (copias descargadas del repo público): Ajustes y chip arriba si hay versión nueva ── */
S.update = null;
async function checkUpdate(force = false) {
  try { S.update = await api(`/api/update${force ? "?force=1" : ""}`); } catch { S.update = null; }
  const chip = $("#updChip");
  if (chip) chip.hidden = !S.update?.available;
  return S.update;
}
const verDate = (v) => (v?.date ? new Date(v.date).toLocaleDateString(LOCALE, { day: "numeric", month: "short", year: "numeric" }) : "—");
async function renderUpdateSettings(force = false) {
  const el = $("#st-update");
  if (!el) return;
  const u = await checkUpdate(force);
  if (!u?.enabled) {
    el.innerHTML = `<p class="ctx">Esta copia es la de desarrollo (o un clon de otro repositorio): se actualiza con git, no desde aquí.</p>`;
    return;
  }
  el.innerHTML = `<dl class="kv">
      <dt>Tu versión</dt><dd>${esc(verDate(u.local))} <span class="faint">${esc((u.local?.sha || "").slice(0, 7))}</span></dd>
      <dt>La última</dt><dd>${u.remote ? `${esc(verDate(u.remote))} <span class="faint">${esc((u.remote.sha || "").slice(0, 7))}</span>` : "—"}${u.error ? ` <span class="down">(${esc(u.error)})</span>` : ""}</dd>
      <dt>Cómo</dt><dd>${u.method === "git" ? "git pull (es un clon de git)" : "descarga desde GitHub"}</dd>
    </dl>
    <div class="row" style="margin-top:10px">
      ${u.available ? `<button type="button" class="btn sm" data-act="update:apply">Instalar la versión nueva</button>` : `<span class="tag green">Tienes la última versión</span>`}
      <button type="button" class="btn ghost sm" data-act="update:check">Buscar actualizaciones</button>
    </div>
    <p class="ctx" style="margin-top:8px">Tu key (config.json) y tu historial (data/) no se tocan. El dashboard se reinicia solo al terminar.</p>`;
}
ACTIONS.update = async (v) => {
  if (v === "check") return renderUpdateSettings(true);
  if (v !== "apply") return;
  const el = $("#st-update");
  if (el) el.innerHTML = `<p class="ctx">Descargando e instalando la versión nueva…</p>`;
  try {
    await jpost("/api/update");
    toast("Versión nueva instalada: reiniciando…", 6000);
    // Espera a que el servidor vuelva y recarga la página con el código nuevo
    const t0 = Date.now();
    await new Promise((res) => setTimeout(res, 2500));
    while (Date.now() - t0 < 60_000) {
      try { if ((await fetch("/api/status")).ok) return location.reload(); } catch { /* aún arrancando */ }
      await new Promise((res) => setTimeout(res, 1500));
    }
    if (el) el.innerHTML = `<p class="down">El servidor no ha vuelto solo: ciérralo y ábrelo otra vez (start.bat / start.command).</p>`;
  } catch (e) {
    toast(e.message);
    renderUpdateSettings();
  }
};
setTimeout(() => { if (S.mode !== "cloud") checkUpdate(); }, 8000);
