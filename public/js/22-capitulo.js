// SFL Console — Capítulo: tickets, pase de recompensas, colección, tienda de Stella con metas, tareas, entregas y bounties.
// Scripts clásicos que comparten el ámbito global en el orden de index.html.
"use strict";

/* Datos del juego (tools/extract-gamedata.mjs): G.megastore (tienda de Stella por capítulo), G.chapterTracks (pase: puntos
   de cada nivel, premios gratis y VIP; _points = puntos por ticket de cada tarea), G.chapterCollections (mutantes, subasta,
   otros). La granja guarda "<Ticket> Collected" y "<Capítulo> Points Earned" en farmActivity y lo comprado en megastore. */
S.chGoals = new Set(readLS("chGoals", []));
S.chBounty = readLS("chBounty", "animal");
const CH_NOT_COLLECTION = /(Key|Box|Hourglass|Ticket|Pet Egg)$/;

function weekStartUTC(ts = now()) {
  const d = new Date(ts), day = (d.getUTCDay() + 6) % 7; // lunes = 0
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - day * DAY_MS;
}
function chShopCost(it) {
  const parts = Object.entries(it.cost.items || {}).map(([k, v]) => ({ name: k, qty: v }));
  if (it.cost.sfl) parts.push({ name: "sfl", qty: it.cost.sfl });
  if (it.cost.coins) parts.push({ name: "coins", qty: it.cost.coins });
  return parts;
}
const costTxt = (parts) => parts.map((p) => p.name === "sfl" ? `${fmt(p.qty, 2)} FLOWER` : p.name === "coins" ? `${compact(p.qty)} coins` : `${compact(p.qty)} ${p.name}`).join(" + ") || "gratis";
const ownedQty = (farm, name) => toNum(farm.inventory?.[name]) + toNum(farm.wardrobe?.[name]);

function chapterModel() {
  const ch = currentChapter(), c = ch && G.chapters?.[ch];
  if (!c) return null;
  const farm = store.farm.data.farm, act = farm.farmActivity || {}, t = now();
  const ticket = G.chapterTickets?.[ch] || "Ticket";
  const m = missionModel();
  const daysLeft = Math.max(0, (c.end - t) / DAY_MS), daysGone = Math.max(1, (t - c.start) / DAY_MS);
  const rankInfo = has("tickets") ? ticketInfo() : null;
  const collected = act[`${ticket} Collected`] != null ? toNum(act[`${ticket} Collected`]) : rankInfo?.mine?.count ?? null;

  // Tienda de Stella: lo comprado este capítulo (megastore.purchases) y lo gastado en tickets
  const purchases = farm.megastore?.purchases || {};
  const shop = (G.megastore?.[ch] || []).map((it) => {
    const bought = purchases[it.name]?.chapter === ch ? toNum(purchases[it.name].count) : 0;
    const parts = chShopCost(it), tk = toNum(it.cost.items?.[ticket]);
    const owned = ownedQty(farm, it.name);
    const soldOut = (it.limit != null && bought >= it.limit) || (it.inventoryLimit != null && owned >= it.inventoryLimit);
    return { ...it, bought, parts, tk, owned, soldOut, market: priceBook()(it.name) };
  });
  const spent = shop.reduce((s, it) => s + it.bought * it.tk, 0);
  const have = collected != null ? Math.max(0, collected - spent) : null;
  const pace = collected != null ? collected / daysGone : null;
  for (const it of shop) {
    const other = it.parts.filter((p) => p.name !== ticket);
    it.missTk = Math.max(0, it.tk - (have ?? 0));
    it.days = it.missTk && pace ? it.missTk / pace : 0;
    it.otherOk = other.every((p) => haveOf(p.name) >= p.qty);
    it.canBuy = !it.soldOut && it.missTk === 0 && it.otherOk;
    it.goal = S.chGoals.has(it.name);
  }
  // Valor de un ticket: lo que vale en el mercado lo mejor que se compra con tickets
  const valued = shop.filter((it) => it.tk && it.market.v && it.market.src === "mercado").map((it) => ({ name: it.name, v: it.market.v / it.tk }));
  const tkValue = valued.sort((a, b) => b.v - a.v)[0] || null;

  // Pase de recompensas
  const track = G.chapterTracks?.[ch] || [];
  const points = toNum(act[`${ch} Points Earned`]);
  const level = track.filter((l) => l.points <= points).length;
  const claimed = { free: toNum(act[`${ch} free Milestone Claimed`]), premium: toNum(act[`${ch} premium Milestone Claimed`]) };

  // Esta semana (desde el lunes UTC): tickets de tareas, bounties y entregas
  const ws = weekStartUTC(t);
  // Tareas: +2 VIP y +1 por objeto de boost del capítulo; bounties: solo los objetos (completeNPCChore.ts / sellBounty.ts)
  const tkOf = (items, plus) => (toNum(items?.[ticket]) ? toNum(items[ticket]) + plus : 0);
  const chores = m.board.map((b) => ({ ...b, tickets: tkOf(b.reward?.items, (m.vip ? 2 : 0) + m.boost) }));
  const choresWeek = chores.filter((b) => b.completedAt >= ws).reduce((s, b) => s + b.tickets, 0);
  const done = new Map((farm.bounties?.completed || []).map((b) => [b.id, b.soldAt]));
  const bountiesAll = (farm.bounties?.requests || []).map((b) => ({ ...b, tickets: tkOf(b.items, m.boost), soldAt: done.get(b.id) || null }));
  const bountiesWeek = bountiesAll.filter((b) => b.soldAt >= ws).reduce((s, b) => s + b.tickets, 0);
  const extra = (m.vip ? 2 : 0) + m.boost;
  const delivered = m.orders.filter((o) => G.ticketRewards?.[o.from] && o.completedAt >= ws);
  const deliveriesWeek = delivered.reduce((s, o) => s + G.ticketRewards[o.from] + extra, 0);
  const tp = G.chapterTracks?._points || {};
  const weekPts = choresWeek * (tp.chore || 3) + bountiesWeek * (tp.bounty || 5) + deliveriesWeek * (tp.delivery || 5);

  // Colección del capítulo: tienda, mutantes, pase, subasta y otros
  const cc = G.chapterCollections?.[ch] || {};
  const trackItems = (kind) => [...new Set(track.flatMap((l) => [...Object.keys(l.free?.[kind] || {}), ...Object.keys(l.premium?.[kind] || {})]))];
  const groups = [
    ["Tienda de Stella", shop.filter((it) => !CH_NOT_COLLECTION.test(it.name)).map((it) => it.name)],
    ["Mutantes", cc.mutants || []],
    ["Pase", [...trackItems("items").filter((n) => !CH_NOT_COLLECTION.test(n) && n !== ticket && (G.nftCollectibles || []).includes(n)), ...trackItems("wearables")]],
    ["Subastas", [...(cc.auctioneer?.collectibles || []), ...(cc.auctioneer?.wearables || [])]],
    ["Regalo VIP", [...(cc.vipGift?.collectibles || []), ...(cc.vipGift?.wearables || [])]],
    ["Otros", [...(cc.other?.collectibles || []), ...(cc.other?.wearables || [])]],
  ].filter(([, list]) => list.length).map(([label, list]) => ({ label, items: list.map((name) => ({ name, owned: ownedQty(farm, name) > 0 })) }));

  return { ch, c, ticket, m, daysLeft, daysGone, collected, spent, have, pace, shop, tkValue, track, points, level, claimed,
    chores, choresWeek, bountiesAll, bountiesWeek, delivered, deliveriesWeek, weekPts, groups, rankInfo, extra };
}

function wChKpis() {
  const d = chapterModel();
  if (!d) return Empty("ticket", "Capítulo no reconocido", "Actualiza los datos del juego en Ajustes.");
  const next = d.track[d.level];
  const week = d.choresWeek + d.bountiesWeek + d.deliveriesWeek;
  return `<div class="kstrip">
    ${Kcell(`${esc(d.ticket)} disponibles`, d.have != null ? `${Gi(d.ticket, 20)} ${fmt(d.have, 0)}` : "—", d.collected != null ? `${fmt(d.collected, 0)} ganados${d.spent ? ` − ${fmt(d.spent, 0)} gastados en la tienda` : ""}` : "sin datos del capítulo", "sun")}
    ${Kcell("Esta semana", `${fmt(week, 0)}<small>tickets</small>`, `tareas ${fmt(d.choresWeek, 0)} · bounties ${fmt(d.bountiesWeek, 0)} · entregas ${fmt(d.deliveriesWeek, 0)}`)}
    ${Kcell("Tu ritmo", d.pace != null ? `${fmt(d.pace, 1)}<small>/día</small>` : "—", d.pace != null ? `al final ≈ ${fmt(d.collected + d.pace * d.daysLeft, 0)} ganados` : "")}
    ${Kcell("Pase de recompensas", `Nivel ${d.level}<small>/ ${d.track.length}</small>`, next ? `${fmt(d.points, 0)} / ${fmt(next.points, 0)} puntos para el ${d.level + 1}` : `${fmt(d.points, 0)} puntos · pase completo`)}
    ${Kcell(esc(d.ch), `${fmt(d.daysLeft, 0)}<small>días</small>`, `acaba el ${new Date(d.c.end).toLocaleDateString(LOCALE, { day: "numeric", month: "short" })}`)}
  </div>`;
}

function wChShop() {
  const d = chapterModel();
  if (!d) return "";
  if (!d.shop.length) return Empty("chest", "Sin tienda", "El juego no trae tienda para este capítulo.");
  const rows = d.shop.slice().sort((a, b) => (a.soldOut - b.soldOut) || (b.goal - a.goal) || (a.tk || 1e9) - (b.tk || 1e9));
  setSub("ch-shop", `${d.shop.filter((s) => s.bought).length} comprados · marca ★ lo que quieres y te dice cuánto falta`);
  return `<div class="tbl-wrap"><table class="tbl"><thead><tr><th></th><th>Objeto</th><th class="r">Precio</th><th class="r">Comprado</th><th class="r">Te faltan</th><th class="r">Días</th><th class="r">Mercado</th></tr></thead><tbody>
    ${rows.map((it) => `<tr class="${it.soldOut ? "dim" : ""}">
      <td><button class="star${it.goal ? " on" : ""}" data-act="chgoal:${esc(it.name)}" title="Meta">${sprite("star", 12)}</button></td>
      <td class="w">${Gi(it.name, 16)} ${esc(it.name)}${it.canBuy ? ` <span class="tag green">puedes comprarlo</span>` : ""}${it.soldOut ? ` <span class="tag">agotado</span>` : ""}</td>
      <td class="r">${esc(costTxt(it.parts))}</td>
      <td class="r dim">${it.bought}${it.limit != null ? ` / ${it.limit}` : ""}</td>
      <td class="r ${it.missTk ? "down" : "up"}">${it.tk ? (it.missTk ? fmt(it.missTk, 0) : "✓") : "—"}</td>
      <td class="r dim">${it.days ? fmt(it.days, 0) : "—"}</td>
      <td class="r dim">${it.market.v && it.market.src === "mercado" ? `${fmt(it.market.v, 2)} FLW` : "—"}</td></tr>`).join("")}
  </tbody></table></div>
  <div class="mod-f"><span>Días = tickets que faltan ÷ tu ritmo (${d.pace != null ? fmt(d.pace, 1) : "—"}/día)</span><span>${d.tkValue ? `1 ${esc(d.ticket)} ≈ ${fmt(d.tkValue.v, 4)} FLOWER (${esc(d.tkValue.name)})` : ""}</span></div>`;
}

function wChGoals() {
  const d = chapterModel();
  if (!d) return "";
  const goals = d.shop.filter((it) => it.goal && !it.soldOut);
  if (!goals.length) return Empty("star", "Sin metas", "Marca con ★ en la tienda lo que quieres comprar.");
  const total = goals.reduce((s, it) => s + it.tk, 0), miss = Math.max(0, total - (d.have ?? 0));
  const days = miss && d.pace ? miss / d.pace : 0, p = total ? Math.min(1, (d.have ?? 0) / total) : 1;
  return `<div class="kv-big"><b>${fmt(p * 100, 0)}%</b> <span class="ctx">de tus metas</span></div>
    <div class="pbar"><i style="width:${(p * 100).toFixed(1)}%"></i></div>
    <dl class="kv" style="margin-top:10px">
      <dt>Metas</dt><dd>${goals.map((g) => `${Gi(g.name, 14)} ${esc(g.name)}`).join("<br>")}</dd>
      <dt>Cuestan</dt><dd>${fmt(total, 0)} ${esc(d.ticket)}</dd>
      <dt>Te faltan</dt><dd class="${miss ? "down" : "up"}">${miss ? fmt(miss, 0) : "nada: ya puedes"}</dd>
      <dt>A tu ritmo</dt><dd>${miss ? (days ? `${fmt(days, 0)} días${days > d.daysLeft ? ` <span class="down">(el capítulo acaba en ${fmt(d.daysLeft, 0)})</span>` : ""}` : "—") : "—"}</dd>
    </dl>`;
}

function chReward(r) {
  const out = [];
  if (r?.coins) out.push(`${Gi("Coins", 14, "coin")} ${compact(r.coins)}`);
  if (r?.flower) out.push(`${Gi("FLOWER", 14, "sun")} ${fmt(r.flower, 0)} FLOWER`);
  for (const [k, v] of Object.entries(r?.items || {})) out.push(`${Gi(k, 14)} ${v > 1 ? `${fmt(v, 0)} ` : ""}${esc(k)}`);
  for (const k of Object.keys(r?.wearables || {})) out.push(`${Gi(k, 14)} ${esc(k)}`);
  return out.join(" · ") || "—";
}
function wChTrack() {
  const d = chapterModel();
  if (!d) return "";
  if (!d.track.length) return Empty("trophy", "Sin pase", "Este capítulo no tiene pase de recompensas.");
  const vip = isVip();
  const from = Math.max(0, d.level - 3), list = d.track.slice(from, from + 10);
  const prev = d.track[d.level - 1]?.points || 0, next = d.track[d.level];
  const p = next ? clamp01((d.points - prev) / Math.max(1, next.points - prev)) : 1;
  setSub("ch-track", `puntos: ${Object.entries(G.chapterTracks?._points || {}).map(([k, v]) => `${v} por ticket de ${{ delivery: "entrega", bounty: "bounty", chore: "tarea", coinDelivery: "entrega de coins", flowerDelivery: "entrega de FLOWER" }[k] || k}`).join(" · ")}`);
  return `<div style="padding:10px 14px"><div class="pbar"><i style="width:${(p * 100).toFixed(1)}%"></i></div>
    <div class="ctx" style="margin-top:4px">${next ? `${fmt(next.points - d.points, 0)} puntos para el nivel ${d.level + 1} · esta semana ≈ ${fmt(d.weekPts, 0)} puntos` : "Has completado el pase"}</div></div>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Nivel</th><th class="r">Puntos</th><th>Gratis</th><th>VIP${vip ? "" : ` <span class="faint">(no eres VIP)</span>`}</th></tr></thead><tbody>
    ${list.map((l, i) => {
      const n = from + i + 1, reached = n <= d.level;
      const st = (tr) => reached ? (n <= d.claimed[tr] ? `<span class="tag green">cobrado</span>` : `<span class="tag sun">cóbralo</span>`) : "";
      return `<tr class="${reached ? "" : "dim"}"><td class="w">${n}${n === d.level + 1 ? ` <span class="tag sun">siguiente</span>` : ""}</td><td class="r">${fmt(l.points, 0)}</td>
        <td>${chReward(l.free)} ${st("free")}</td><td>${chReward(l.premium)} ${vip ? st("premium") : ""}</td></tr>`;
    }).join("")}
    </tbody></table></div>`;
}

function wChCollection() {
  const d = chapterModel();
  if (!d) return "";
  const all = d.groups.flatMap((g) => g.items), got = all.filter((x) => x.owned).length;
  setSub("ch-col", `${got} / ${all.length}`);
  return d.groups.map((g) => `<div style="margin-bottom:10px"><div class="eyebrow">${esc(g.label)} · ${g.items.filter((x) => x.owned).length}/${g.items.length}</div>
    <div class="icon-grid">${g.items.map((x) => `<span class="${x.owned ? "" : "faint"}" data-tip="${esc(`${x.name}|${x.owned ? "Lo tienes" : "No lo tienes"}|`)}" style="display:inline-block;margin:2px;${x.owned ? "" : "opacity:.35;filter:grayscale(1)"}">${Gi(x.name, 28)}</span>`).join("")}</div></div>`).join("");
}

function wChChores() {
  const d = chapterModel();
  if (!d) return "";
  const done = d.chores.filter((c) => c.done), left = d.chores.filter((c) => !c.done);
  setSub("ch-chores", `${done.length}/${d.chores.length} · quedan ${fmt(left.reduce((s, c) => s + c.tickets, 0), 0)} ${d.ticket}`);
  if (!d.chores.length) return Empty("check", "Sin tareas", "El tablón de tareas está vacío.");
  const rows = [...left.sort((a, b) => (b.p ?? 0) - (a.p ?? 0)), ...done];
  return `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>NPC</th><th>Tarea</th><th class="r">Progreso</th><th class="r">Tickets</th></tr></thead><tbody>
    ${rows.map((c) => `<tr class="${c.done ? "dim" : ""}"><td class="w">${esc(c.npc)}</td><td>${esc(c.name)}</td>
      <td class="r">${c.done ? `<span class="tag green">hecha</span>` : c.def ? `${fmt(c.progress, 0)} / ${fmt(c.def.amount, 0)}` : "—"}</td>
      <td class="r"><b>${fmt(c.tickets, 0)}</b></td></tr>`).join("")}
  </tbody></table></div>`;
}

function wChDeliveries() {
  const d = chapterModel();
  if (!d) return "";
  const tk = d.m.orders.filter((o) => o.kind === "tickets");
  const done = tk.filter((o) => o.done).length;
  setSub("ch-orders", `${done}/${tk.length} hechas · +${d.extra} por VIP y boosts del capítulo`);
  if (!tk.length) return Empty("scroll", "Sin entregas de tickets", "");
  const v = d.tkValue?.v || null;
  const rows = tk.slice().sort((a, b) => (a.done - b.done) || (a.perTicket ?? 1e9) - (b.perTicket ?? 1e9));
  return `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>NPC</th><th>Pide</th><th class="r">Tickets</th><th class="r">Valen los ingredientes</th><th class="r">FLW / ticket</th><th>¿Entregar?</th></tr></thead><tbody>
    ${rows.map((o) => {
      const verdict = o.done ? `<span class="tag green">hecha</span>` : v && o.net ? (o.perTicket <= v ? `<span class="tag green">entrega</span>` : `<span class="tag red">vende los ingredientes</span>`) : "";
      return `<tr class="${o.done ? "dim" : ""}"><td class="w">${esc(o.from)}</td><td>${Object.entries(o.items || {}).map(([k, q]) => `${Gi(k, 14)} ${fmt(q, 0)}`).join(" ")}</td>
        <td class="r"><b>${fmt(o.tickets, 0)}</b></td><td class="r dim">${o.net ? `${fmt(o.net, 3)} FLW` : "—"}</td>
        <td class="r">${o.net ? fmt(o.perTicket, 4) : "—"}</td><td>${verdict}</td></tr>`;
    }).join("")}
  </tbody></table></div>
  <div class="mod-f"><span>${v ? `Entrega si el ticket te cuesta menos de lo que vale (${fmt(v, 4)} FLOWER, por ${esc(d.tkValue.name)})` : "Sin precio de mercado para valorar el ticket"}</span><a href="#missions" class="ctx">Misiones →</a></div>`;
}

function bestAnimalLevel(farm, type) {
  const home = type === "Chicken" ? farm.henHouse : farm.barn;
  return Math.max(0, ...Object.values(home?.animals || {}).filter((a) => a.type === type).map((a) => animalLevel(type, toNum(a.experience))));
}
function wChBounties() {
  const d = chapterModel();
  if (!d) return "";
  const farm = store.farm.data.farm, price = priceBook();
  const all = d.bountiesAll, sold = all.filter((b) => b.soldAt).length;
  setSub("ch-bounty", `${sold}/${all.length} hechos`);
  const animal = S.chBounty === "animal";
  const list = all.filter((b) => (b.level != null) === animal);
  const rows = list.map((b) => {
    if (animal) { const best = bestAnimalLevel(farm, b.name); return { ...b, best, ok: best >= b.level }; }
    const v = price(b.name).v, have = haveOf(b.name);
    return { ...b, have, v, per: v != null && b.tickets ? v / b.tickets : null, ok: have >= 1 };
  }).sort((a, b) => (Boolean(a.soldAt) - Boolean(b.soldAt)) || (b.ok - a.ok) || (animal ? b.level - a.level : (a.per ?? 1e9) - (b.per ?? 1e9)));
  const rew = (b) => b.tickets ? `${fmt(b.tickets, 0)} ${esc(d.ticket)}` : b.coins ? `${compact(b.coins)} coins` : b.sfl ? `${fmt(b.sfl, 2)} FLW` : "—";
  const tabs = Seg([["animal", "Animales"], ["item", "Objetos"]], S.chBounty, "act").replace(/data-act="(\w+)"/g, 'data-act="chbounty:$1"');
  return `<div style="padding:8px 12px">${tabs}</div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Pide</th>${animal ? `<th class="r">Nivel</th><th class="r">Tu mejor</th>` : `<th class="r">Tienes</th><th class="r">FLW / ticket</th>`}<th class="r">Premio</th></tr></thead><tbody>
    ${rows.map((b) => `<tr class="${b.soldAt ? "dim" : ""}"><td class="w">${Gi(b.name, 14)} ${esc(b.name)}${b.soldAt ? ` <span class="tag green">hecho</span>` : ""}</td>
      ${animal ? `<td class="r">${b.level}</td><td class="r ${b.ok ? "up" : "down"}">${b.best}</td>` : `<td class="r ${b.ok ? "up" : "down"}">${compact(b.have)}</td><td class="r dim">${b.per != null ? fmt(b.per, 4) : "—"}</td>`}
      <td class="r"><b>${rew(b)}</b></td></tr>`).join("")}
  </tbody></table></div>`;
}

PAGES.chapter = function chapter() {
  $("#page").innerHTML = `
    <div class="plate">${Mod({ id: "ch-k", span: 12, flush: true })}</div>
    <div class="plate">
      ${Mod({ id: "ch-shop", span: 8, title: "Tienda de Stella", icon: "chest", flush: true })}
      ${Mod({ id: "ch-goals", span: 4, title: "Tus metas", icon: "star" })}
    </div>
    <div class="plate">
      ${Mod({ id: "ch-track", span: 8, title: "Pase de recompensas", icon: "trophy", flush: true })}
      ${Mod({ id: "ch-col", span: 4, title: "Colección del capítulo", icon: "gem" })}
    </div>
    <div class="plate">
      ${Mod({ id: "ch-orders", span: 7, title: "Entregas de tickets", icon: "scroll", flush: true })}
      ${Mod({ id: "ch-bounty", span: 5, title: "Bounties", icon: "coin", flush: true })}
    </div>
    <div class="plate">${Mod({ id: "ch-chores", span: 12, title: "Tareas semanales", icon: "check", flush: true })}</div>`;
  const o = { deps: ["farm"], soft: ["activity", "tickets"] };
  mount("ch-k", { ...o, render: wChKpis, loading: "block" });
  mount("ch-shop", { ...o, render: wChShop, loading: "rows" });
  mount("ch-goals", { ...o, render: wChGoals, loading: "block" });
  mount("ch-track", { ...o, render: wChTrack, loading: "rows" });
  mount("ch-col", { ...o, render: wChCollection, loading: "block" });
  mount("ch-orders", { ...o, render: wChDeliveries, loading: "rows" });
  mount("ch-bounty", { ...o, render: wChBounties, loading: "rows" });
  mount("ch-chores", { ...o, render: wChChores, loading: "rows" });
};
PAGE_META.chapter = { title: "Capítulo", sub: () => `${currentChapter() || "Capítulo"}: tickets, pase, colección y la tienda de Stella con tus metas` };
ACTIONS.chgoal = (name) => { S.chGoals.has(name) ? S.chGoals.delete(name) : S.chGoals.add(name); writeLS("chGoals", [...S.chGoals]); rerun(); };
ACTIONS.chbounty = (v) => { S.chBounty = v; writeLS("chBounty", v); rerun(); };
