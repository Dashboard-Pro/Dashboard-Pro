// SFL Console — Comunidad (volcado), Mascotas, Facción y Amigos.
// Scripts clásicos que comparten el ámbito global en el orden de index.html (antes, un solo app.js).
"use strict";

/* ── Comunidad: volcado nocturno de todas las granjas ───────────────────── */
const DUMP_BANDS = [0, 20, 40, 60, 80, 100, 125, 150];
const bandLabel = (b) => { const i = DUMP_BANDS.indexOf(b); return DUMP_BANDS[i + 1] ? `nivel ${b}–${DUMP_BANDS[i + 1] - 1}` : `nivel ${b}+`; };
const islandLabel = (i) => ISLAND_ES[i] || i;
const topText = (pct) => (pct == null ? "—" : pct >= 50 ? `top ${fmt(Math.max(0.1, 100 - pct), 100 - pct < 1 ? 1 : 0)}%` : `supera al ${fmt(pct, 0)}%`);
// Boosts que se gastan (relojes de arena, tótems de días): no son algo que "te falte" de forma permanente
const TEMP_BOOST = /Hourglass$|^Super Totem$|^Time Warp Totem$/;
const SUPPLY_VIEWS = [["resources", "Recursos"], ["nfts", "NFTs"], ["wearables", "Wearables"]];
// Sin volcado procesado todavía: explica qué es y deja lanzarlo
function dumpEmpty() {
  return Empty("globe", "Todavía no hay datos de la comunidad", `Cada noche (hacia las 22:00 UTC) Sunflower Land publica el estado de todas las granjas activas. Tu servidor lo
    descarga (~800 MB, sin tu key), lo resume en un archivo pequeño en <code>data/dump/</code> y no guarda nada más. Tarda 1-2 minutos.`,
    `<div class="row" style="justify-content:center"><button class="btn sm" data-dump="now">Procesar el último ahora</button><a class="btn sm ghost" href="#settings">Activarlo cada día</a></div>`);
}
function wDumpKpis() {
  const d = store.dump.data;
  if (!d) return dumpEmpty();
  const me = d.me, g = me && d.groups[`${me.island}|${me.band}`];
  return `<div class="kstrip">
    ${Kcell("Granjas activas", compact(d.farms), `jugaron ayer ${compact(d.active1)} · esta semana ${compact(d.active7)}`)}
    ${Kcell("Con VIP", `${fmt((d.vip / d.farms) * 100, 0)}<small>%</small>`, `${compact(d.vip)} granjas`)}
    ${Kcell("Tu nivel", me ? topText(me.pct.level) : "—", me ? `nivel ${me.metrics.level} · de ${compact(d.farms)}` : "tu granja no sale en el volcado", "sun")}
    ${Kcell("Tu patrimonio", me ? topText(me.pct.worth) : "—", me ? `${fmt(me.metrics.worth, 0)} FLOWER a floor` : "")}
    ${Kcell("Tu grupo", g ? compact(g.n) : "—", me ? `${esc(islandLabel(me.island))} · ${bandLabel(me.band)}` : "")}
  </div>`;
}
function wDumpMe() {
  const d = store.dump.data;
  if (!d) return Empty("globe", "Sin volcado", "Procésalo desde el panel de arriba.");
  const me = d.me;
  if (!me) return Empty("globe", "Tu granja no aparece", `No está en el volcado del ${esc(d.date)} (solo trae granjas que han jugado en los últimos 90 días).`);
  const g = d.groups[`${me.island}|${me.band}`];
  setSub("cm-me", `todas las granjas y tu grupo: ${esc(islandLabel(me.island))} · ${bandLabel(me.band)} (${compact(g.n)})`);
  const f = (k, v) => (["flower", "worth"].includes(k) ? fmt(v, v < 10 ? 1 : 0) : compact(v));
  return `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Métrica</th><th class="r">Tú</th><th class="r">Mediana</th><th class="r">Tu grupo</th><th class="r">Top 10% grupo</th><th>Tu posición en tu grupo</th></tr></thead><tbody>
    ${Object.entries(d.metricNames).map(([k, label]) => {
      const gp = me.groupPct[k], v = me.metrics[k];
      const tone = gp >= 75 ? "up" : gp < 25 ? "down" : "";
      return `<tr><td class="w">${esc(label)}</td><td class="r"><b>${f(k, v)}</b></td><td class="r dim">${f(k, d.metrics[k][50])}</td>
        <td class="r dim">${f(k, g.median[k])}</td><td class="r dim">${f(k, g.p90[k])}</td>
        <td><div class="cm-pos" data-tip="${esc(`${label}|Mejor que el ${fmt(gp, 0)}% de tu grupo y que el ${fmt(me.pct[k], 0)}% de todas las granjas|volcado del ${d.date}`)}"><i style="width:${Math.max(2, gp)}%"></i></div><span class="ctx ${tone}">${topText(gp)}</span></td></tr>`;
    }).join("")}
  </tbody></table></div><div class="mod-f"><span>Tu grupo = misma isla y mismo tramo de nivel · datos de anoche (tu fila también)</span><span>patrimonio = saldo + inventario y wearables a floor</span></div>`;
}
function wDumpBoosts() {
  const d = store.dump.data;
  if (!d?.me) return Empty("bolt", "Sin datos", "");
  const me = d.me, g = d.groups[`${me.island}|${me.band}`];
  // Lo que ya tienes: del volcado y, si ya cargó, de tu granja de ahora (por si lo compraste hoy)
  const farm = has("farm") ? store.farm.data.farm : null;
  const mine = new Set(me.boosts);
  const own = (n) => mine.has(n) || (farm && (toNum(farm.inventory?.[n]) > 0 || toNum(farm.wardrobe?.[n]) > 0));
  const price = has("activity") ? priceBook() : null;
  const rows = Object.entries(g.boosts).map(([n, c]) => ({ n, share: c / g.n, own: own(n), p: price ? price(n) : null }))
    .filter((r) => !r.own && r.share < 0.999 && !TEMP_BOOST.test(r.n)).slice(0, 18);
  const owned = Object.keys(g.boosts).filter(own).length;
  setSub("cm-boosts", `boosts que no tienes, por % de tu grupo que los tiene · tú tienes ${owned} de los ${Object.keys(g.boosts).length} más comunes`);
  if (!rows.length) return Empty("check", "Tienes todos", "Ya tienes todos los boosts habituales de tu grupo.");
  return `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Boost</th><th class="r">Lo tienen</th><th class="r">Precio</th></tr></thead><tbody>
    ${rows.map((r) => {
      const id = G.itemIds[r.n] != null ? `collectibles-${G.itemIds[r.n]}` : G.wearableIds[r.n] != null ? `wearables-${G.wearableIds[r.n]}` : null;
      const txt = G.buffs[r.n] ? (Array.isArray(G.buffs[r.n]) ? G.buffs[r.n].join(" · ") : String(G.buffs[r.n])) : "";
      return `<tr ${id ? `data-open="${id}"` : ""}><td class="w" data-tip="${esc(`${r.n}|${txt || "boost"}|`)}">${Gi(id || r.n, 14)} ${esc(r.n)}<div class="ctx cm-desc">${esc(txt)}</div></td>
        <td class="r"><b>${fmt(r.share * 100, 0)}%</b></td><td class="r dim">${r.p?.v != null ? `${fmt(r.p.v, r.p.v < 10 ? 2 : 0)} FLW` : "—"}</td></tr>`;
    }).join("")}
  </tbody></table></div><div class="mod-f"><span>Tenerlo = en el inventario o el armario (no siempre colocado/puesto)</span><span>clic para ver su mercado</span></div>`;
}
function wDumpSupply() {
  const d = store.dump.data;
  if (!d) return Empty("chest", "Sin datos", "");
  const view = SUPPLY_VIEWS.some(([v]) => v === S.supplyView) ? S.supplyView : "resources";
  const src = view === "wearables" ? d.wearables : d.items, prev = d.prev ? (view === "wearables" ? d.prev.wearables : d.prev.items) : null;
  const names = view === "resources" ? (G.tradeResources || []) : view === "nfts" ? (G.nftCollectibles || []) : Object.keys(src);
  const price = has("activity") ? priceBook() : null;
  const rows = names.filter((n) => src[n]).map((n) => {
    const [units, holders] = src[n], p = price ? price(n).v : null, pu = prev?.[n]?.[0];
    return { n, units, holders, p, value: p != null ? p * units : null, delta: pu ? (units - pu) / pu : null };
  }).sort((a, b) => (view === "resources" ? (b.value ?? -1) - (a.value ?? -1) : b.holders - a.holders)).slice(0, 80);
  setSub("cm-supply", `lo que hay en todas las granjas activas${d.prev ? ` · cambio desde el ${esc(d.prev.date)}` : " · el cambio diario aparece a partir del segundo volcado"}`);
  const id = (n) => (view === "wearables" ? G.wearableIds[n] != null && `wearables-${G.wearableIds[n]}` : G.itemIds[n] != null && `collectibles-${G.itemIds[n]}`);
  return `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Item</th><th class="r">Unidades</th><th class="r">Granjas</th><th class="r">Δ día</th><th class="r">Floor</th><th class="r">Valor total</th></tr></thead><tbody>
    ${rows.map((r) => `<tr ${id(r.n) ? `data-open="${id(r.n)}"` : ""}><td class="w">${Gi(id(r.n) || r.n, 14)} ${esc(r.n)}</td><td class="r"><b>${compact(r.units)}</b></td>
      <td class="r dim">${compact(r.holders)} <span class="faint">(${fmt((r.holders / d.farms) * 100, r.holders / d.farms < 0.01 ? 2 : 0)}%)</span></td>
      <td class="r ${r.delta == null ? "faint" : r.delta > 0.001 ? "down" : r.delta < -0.001 ? "up" : "faint"}" ${r.delta != null ? `data-tip="${esc(`Suministro|${r.delta > 0 ? "Hay más unidades que ayer: más oferta, presión a la baja" : "Hay menos unidades que ayer: se gastan más de las que se producen"}|`)}"` : ""}>${r.delta == null ? "—" : pct(r.delta * 100)}</td>
      <td class="r dim">${r.p != null ? fmt(r.p, r.p < 1 ? 4 : 2) : "—"}</td><td class="r">${r.value != null ? compact(r.value) : "—"}</td></tr>`).join("")}
  </tbody></table></div><div class="mod-f"><span>Granjas = cuántas lo tienen · verde = el suministro baja (se consume)</span><span>valor total a floor en FLOWER</span></div>`;
}
function wDumpWorld() {
  const d = store.dump.data;
  if (!d) return Empty("globe", "Sin datos", "");
  const bar = (obj, colors) => {
    const tot = Object.values(obj).reduce((a, b) => a + b, 0);
    const list = Object.entries(obj).sort((a, b) => b[1] - a[1]);
    return `<div class="stackbar">${list.map(([k, v], i) => `<i style="flex:${v};background:${colors[i % colors.length]}" data-tip="${esc(`${k}|${fmt(v, 0)} granjas|${fmt((v / tot) * 100, 1)}%`)}"></i>`).join("")}</div>
      <div class="legend">${list.map(([k, v], i) => `<div><i style="background:${colors[i % colors.length]}"></i><span>${esc(k)}</span><span class="n">${fmt((v / tot) * 100, v / tot < 0.01 ? 1 : 0)}%</span></div>`).join("")}</div>`;
  };
  const isl = Object.fromEntries(Object.entries(d.islands).map(([k, v]) => [islandLabel(k), v]));
  const fac = d.factions;
  const mine = d.me && has("farm") ? store.farm.data.farm.faction?.name : null;
  return `<h4 class="acc-h">Islas</h4>${bar(isl, ["#6fbf4a", "#f08bd0", "#f0a24a", "#e0526b", "#8c8cff", "#3d7fb8", "#aeb8b1"])}
    <h4 class="acc-h">Facciones</h4>${bar(fac, ["#6f7a74", "#f5c542", "#6fbf4a", "#c46a3c", "#8c8cff"])}
    ${mine ? `<p class="ctx">Tu facción (${esc(mine)}) es el ${fmt((fac[mine] / d.farms) * 100, 1)}% de las granjas activas.</p>` : ""}`;
}
/* ── Mascotas: nivel, energía, qué traen y comida del día (reglas de pets.ts) ── */
// Nivel: XP para llegar al nivel n = 100·(n−1)·n/2
function petLevel(xp) {
  const lvl = Math.max(1, Math.floor((1 + Math.sqrt(1 + 0.08 * Math.max(0, xp))) / 2));
  const cur = 50 * (lvl - 1) * lvl, next = 50 * lvl * (lvl + 1);
  return { lvl, p: (xp - cur) / (next - cur), toNext: next - xp };
}
function petModel() {
  const farm = store.farm.data.farm, P = G.pets || {}, t = now(), today = todayUTC();
  const list = [
    ...Object.values(farm.pets?.common || {}).map((p) => ({ ...p, nft: false, type: P.types?.[p.name] })),
    ...Object.values(farm.pets?.nfts || {}).map((p) => ({ ...p, nft: true, type: p.traits?.type })),
  ];
  const diffOf = (food) => Object.entries(P.requests || {}).find(([, l]) => l.includes(food))?.[0] || null;
  return list.map((p) => {
    const L = petLevel(toNum(p.experience));
    const cats = P.categories?.[p.type] || [];
    const fetchByCat = (c) => P.fetchByCategory?.[c];
    const fetches = [{ name: "Acorn", level: 1 }, { name: fetchByCat(cats[0]), level: 3 }, { name: "Fossil Shell", level: 20 }];
    if (cats[1]) fetches.push({ name: fetchByCat(cats[1]), level: 7 });
    if (cats[2]) fetches.push({ name: "Moonfur", level: 12 }, { name: fetchByCat(cats[2]), level: 25 });
    const energy = toNum(p.energy);
    const fx = fetches.filter((f) => f.name).map((f) => ({ ...f, cost: P.energy?.[f.name] || 0, open: L.lvl >= f.level, got: toNum(p.fetches?.[f.name]) }))
      .map((f) => ({ ...f, can: f.open && f.cost ? Math.floor(energy / f.cost) : 0 })).sort((a, b) => a.level - b.level);
    const fed = new Set(p.requests?.foodFed || []);
    const foods = (p.requests?.food || []).map((food) => { const d = diffOf(food); return { food, fed: fed.has(food), diff: d, xp: P.requestXp?.[d] || 0, have: haveOf(food) }; });
    const lastCare = Math.max(toNum(p.requests?.fedAt), toNum(p.cheeredAt));
    const neglectDays = p.nft ? 7 : 3;
    const daysSince = lastCare ? Math.floor((Date.parse(today) - Date.parse(new Date(lastCare).toISOString().slice(0, 10))) / DAY_MS) : null;
    return {
      ...p, L, energy, fetches: fx, foods, pending: foods.filter((f) => !f.fed),
      napping: t - toNum(p.pettedAt) >= 2 * 3600_000, social: toNum(p.dailySocialXP?.[today]),
      neglected: daysSince != null && daysSince > neglectDays, daysSince, neglectDays,
    };
  }).sort((a, b) => b.L.lvl - a.L.lvl);
}
function wPetKpis() {
  const pets = petModel();
  if (!pets.length) return Empty("paw", "Sin mascotas", "Todavía no tienes mascotas.");
  const pend = pets.reduce((s, p) => s + p.pending.length, 0);
  const fetchable = pets.reduce((s, p) => s + p.fetches.filter((f) => f.can > 0).reduce((a, f) => Math.max(a, f.can), 0), 0);
  return `<div class="kstrip">
    ${Kcell("Mascotas", fmt(pets.length, 0), `${pets.filter((p) => p.nft).length} NFT`)}
    ${Kcell("Comida pendiente", fmt(pend, 0), pend ? pets.filter((p) => p.pending.length).map((p) => esc(p.name)).join(", ") : "todas comidas hoy", pend ? "" : "up")}
    ${Kcell("Para acariciar", fmt(pets.filter((p) => p.napping).length, 0), "llevan 2 h o más sin mimos")}
    ${Kcell("Búsquedas posibles", fmt(fetchable, 0), "con la energía que tienen ahora", "sun")}
    ${Kcell("Descuidadas", fmt(pets.filter((p) => p.neglected).length, 0), "sin comer demasiados días", pets.some((p) => p.neglected) ? "down" : "")}
  </div>`;
}
function wPetCards() {
  const pets = petModel();
  setSub("pt-list", `${pets.length} mascota${pets.length === 1 ? "" : "s"} · niveles y búsquedas según las reglas del juego`);
  if (!pets.length) return Empty("paw", "Sin mascotas", "");
  const img = (p) => (p.nft ? Gi(`pets-${p.id}`, 48) : Gi(p.name, 48));
  return `<div class="pet-grid">${pets.map((p) => `<div class="pet-card">
    <div class="pet-h">${img(p)}<div><b>${esc(p.name)}</b><div class="ctx">${esc(p.type || "?")}${p.nft && p.traits ? ` · ${esc([p.traits.aura, p.traits.bib].filter(Boolean).join(" · "))}` : ""}</div></div>
      <div class="pet-lv"><span class="eyebrow">nivel</span><b>${p.L.lvl}</b></div></div>
    <div class="pbar" data-tip="${esc(`Nivel ${p.L.lvl}|${fmt(toNum(p.experience), 0)} XP · faltan ${fmt(p.L.toNext, 0)} para el ${p.L.lvl + 1}|`)}"><i style="width:${fmt(p.L.p * 100, 0)}%"></i></div>
    <div class="pet-tags">
      <span class="tag">${sprite("bolt", 11)} ${fmt(p.energy, 0)} energía</span>
      ${p.napping ? `<span class="tag sun">acaríciala</span>` : ""}
      ${p.neglected ? `<span class="tag red">descuidada (${p.daysSince} d sin comer)</span>` : ""}
      <span class="tag" data-tip="Social|XP de hoy por ayuda de otros jugadores (máx. 50)|">social ${fmt(p.social, 0)}/50</span>
    </div>
    <h4 class="acc-h">Pide hoy</h4>
    ${p.foods.length ? p.foods.map((f) => `<div class="bst-row${f.fed ? " on" : ""}"><span class="nm">${Gi(f.food, 14)} ${esc(f.food)}</span>
      ${f.fed ? `<span class="tag green">dada</span>` : f.have >= 1 ? `<span class="tag sun">tienes ${fmt(f.have, 0)}</span>` : `<span class="tag">no tienes</span>`}
      <span class="bst" style="color:var(--muted)">${f.xp ? `+${f.xp} XP` : ""}</span></div>`).join("") : `<p class="ctx">Sin peticiones</p>`}
    <h4 class="acc-h">Puede traer</h4>
    ${p.fetches.map((f) => `<div class="bst-row${f.open ? "" : " off"}"><span class="nm">${Gi(f.name, 14)} ${esc(f.name)}</span>
      ${f.open ? `<span class="tag${f.can ? " green" : ""}">${f.can ? `${f.can}× ahora` : "sin energía"}</span>` : `<span class="tag">nivel ${f.level}</span>`}
      <span class="bst" style="color:var(--muted)">${f.cost} energía${f.got ? ` · ${fmt(f.got, 0)} traídos` : ""}</span></div>`).join("")}
  </div>`).join("")}</div>`;
}

/* ── Facción: rango, marks, cocina, mascota colectiva e historial ─────────── */
const FACTION_ES = { bumpkins: "Bumpkins", goblins: "Goblins", sunflorians: "Sunflorians", nightshades: "Nightshades" };
const FACTION_START = Date.UTC(2024, 5, 24); // la semana de facción empieza en lunes (factions.ts)
function factionWeek(ts = now()) {
  const day0 = Date.UTC(new Date(ts).getUTCFullYear(), new Date(ts).getUTCMonth(), new Date(ts).getUTCDate());
  const start = FACTION_START + Math.floor((day0 - FACTION_START) / DAY_MS / 7) * 7 * DAY_MS;
  return { key: new Date(start).toISOString().slice(0, 10), start, end: start + 7 * DAY_MS, day: new Date(ts).getUTCDay() || 7 };
}
const nextPoints = (base, done) => Math.max(base - done * 2, 1); // calculatePoints: cada entrega del día vale 2 menos
function factionModel() {
  const farm = store.farm.data.farm, fac = farm.faction;
  if (!fac?.name) return null;
  const w = factionWeek();
  const emblemName = G.factions?.emblems?.[fac.name];
  const emblems = toNum(farm.inventory?.[emblemName]);
  const ranks = (G.factions?.ranks || []).filter((r) => r.faction === fac.name).sort((a, b) => a.emblems - b.emblems);
  const rank = ranks.filter((r) => emblems >= r.emblems).pop() || null, next = ranks.find((r) => r.emblems > emblems) || null;
  const cur = fac.history?.[w.key] || {};
  const hist = Object.entries(fac.history || {}).sort((a, b) => b[0].localeCompare(a[0])).map(([week, h]) => ({ week, ...h }));
  const last = hist.find((h) => h.week < w.key) || null;
  const boost = rank?.boost || 0;
  const price = has("activity") ? priceBook() : null;
  const kitchen = (fac.kitchen?.week === w.key ? fac.kitchen.requests : []).map((q) => {
    const done = toNum(q.dailyFulfilled?.[w.day]), pts = nextPoints(20, done), total = pts * (1 + boost);
    const p = price ? price(q.item).v : null, cost = p != null ? p * q.amount : null;
    return { ...q, done, pts, total, have: haveOf(q.item), cost, perFlower: cost ? total / cost : null };
  });
  const PET_BASE = [4, 8, 12, 20]; // fácil, media, difícil, muñeco
  const petReq = (fac.pet?.week === w.key ? fac.pet.requests : []).map((q, i) => {
    const done = toNum(q.dailyFulfilled?.[w.day]), pts = nextPoints(PET_BASE[i] ?? 4, done);
    return { ...q, done, pts, total: pts * (1 + boost), xp: (G.foods[q.food]?.xp ?? 5000) * toNum(q.quantity), have: haveOf(q.food) };
  });
  return { fac, w, emblemName, emblems, rank, next, marks: toNum(farm.inventory?.Mark), cur, hist, last, boost, kitchen, petReq };
}
const rankEs = (r) => (r ? r.name.charAt(0).toUpperCase() + r.name.slice(1) : "—");
function wFactionKpis() {
  const f = factionModel();
  if (!f) return Empty("flag", "Sin facción", "No te has unido a ninguna facción.");
  return `<div class="kstrip">
    ${Kcell("Facción", `<span class="v-txt">${Gi(`${FACTION_ES[f.fac.name]?.replace(/s$/, "")} Faction Banner`, 18)} ${esc(FACTION_ES[f.fac.name] || f.fac.name)}</span>`, f.fac.pledgedAt ? `desde ${new Date(f.fac.pledgedAt).toLocaleDateString(LOCALE, { month: "short", year: "numeric" })}` : "")}
    ${Kcell("Tu rango", `<span class="v-txt">${esc(rankEs(f.rank))}</span>`, f.next ? `${fmt(f.emblems, 0)} / ${fmt(f.next.emblems, 0)} ${esc(f.emblemName)} para ${esc(rankEs(f.next))}` : `${fmt(f.emblems, 0)} ${esc(f.emblemName)} · rango máximo`, "sun")}
    ${Kcell("Marks", fmt(f.marks, 0), f.boost ? `boost de rango +${fmt(f.boost * 100, 0)}% en entregas` : "sin boost de rango")}
    ${Kcell("Esta semana", `${fmt(toNum(f.cur.score), 0)}<small>pts</small>`, `${fmt(toNum(f.cur.petXP), 0)} XP a la mascota · acaba en ${dur(f.w.end - now())}`)}
    ${Kcell("Semana pasada", f.last?.results?.rank ? `#${fmt(f.last.results.rank, 0)}` : "—", f.last ? `${fmt(toNum(f.last.score), 0)} pts${f.last.results?.reward ? ` · premio ${esc(rewardText(f.last.results.reward))}` : ""}` : "")}
  </div>`;
}
function wFactionKitchen() {
  const f = factionModel();
  if (!f) return "";
  setSub("fc-kitchen", `entregas de hoy: cada una vale 2 puntos menos que la anterior (mínimo 1)`);
  if (!f.kitchen.length) return Empty("cook", "Sin pedidos", "La cocina no tiene pedidos esta semana.");
  const best = f.kitchen.filter((k) => k.perFlower).sort((a, b) => b.perFlower - a.perFlower)[0];
  return `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Pide</th><th class="r">Cantidad</th><th class="r">Tienes</th><th class="r">Hoy</th><th class="r">Marks siguiente</th><th class="r">Coste</th><th class="r">Marks/FLW</th></tr></thead><tbody>
    ${f.kitchen.map((k) => `<tr><td class="w">${Gi(k.item, 14)} ${esc(k.item)}${k === best ? ` <span class="tag green">el más rentable</span>` : ""}</td><td class="r">${fmt(k.amount, 0)}</td>
      <td class="r ${k.have >= k.amount ? "up" : "down"}">${compact(k.have)}</td><td class="r dim">${k.done}×</td>
      <td class="r"><b>${fmt(k.total, 1)}</b>${f.boost ? `<div class="ctx">${k.pts} + rango</div>` : ""}</td>
      <td class="r dim">${k.cost != null ? `${fmt(k.cost, 3)} FLW` : "—"}</td><td class="r">${k.perFlower != null ? fmt(k.perFlower, 0) : "—"}</td></tr>`).join("")}
  </tbody></table></div><div class="mod-f"><span>Marks siguiente = lo que da tu próxima entrega de hoy (base 20)</span><span>coste = floor del mercado</span></div>`;
}
function wFactionPetReq() {
  const f = factionModel();
  if (!f) return "";
  setSub("fc-petreq", "suma XP a la mascota colectiva y te da marks");
  if (!f.petReq.length) return Empty("cook", "Sin peticiones", "La mascota de la facción no pide nada esta semana.");
  return `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Comida</th><th class="r">Cantidad</th><th class="r">Tienes</th><th class="r">Hoy</th><th class="r">Marks siguiente</th><th class="r">XP mascota</th></tr></thead><tbody>
    ${f.petReq.map((q) => `<tr><td class="w">${Gi(q.food, 14)} ${esc(q.food)}</td><td class="r">${fmt(q.quantity, 0)}</td>
      <td class="r ${q.have >= q.quantity ? "up" : "down"}">${compact(q.have)}</td><td class="r dim">${q.done}×</td>
      <td class="r"><b>${fmt(q.total, 1)}</b></td><td class="r dim">${compact(q.xp)}</td></tr>`).join("")}
  </tbody></table></div><div class="mod-f"><span>Base 4 / 8 / 12 / 20 marks según dificultad, 2 menos por cada entrega del día</span><span></span></div>`;
}
function wFactionPet() {
  const f = factionModel();
  if (!f) return "";
  const cp = f.cur.collectivePet;
  if (!cp) return Empty("paw", "Sin datos esta semana", "Aparecen en cuanto alguien de tu facción la alimente.");
  const p = Math.min(1, toNum(cp.totalXP) / Math.max(1, toNum(cp.goalXP)));
  const mine = toNum(f.cur.petXP);
  return `<div class="kv-big"><b>${fmt(p * 100, 0)}%</b> <span class="ctx">de la meta semanal</span></div>
    <div class="pbar"><i style="width:${(p * 100).toFixed(1)}%"></i></div>
    <dl class="kv" style="margin-top:10px">
      <dt>XP de la facción</dt><dd>${fmt(toNum(cp.totalXP), 0)} / ${fmt(toNum(cp.goalXP), 0)}</dd>
      <dt>Tu aportación</dt><dd>${fmt(mine, 0)} XP${cp.totalXP ? ` (${fmt((mine / toNum(cp.totalXP)) * 100, 2)}%)` : ""}</dd>
      <dt>Racha</dt><dd>${fmt(toNum(cp.streak), 0)} semana${toNum(cp.streak) === 1 ? "" : "s"} cumpliendo la meta</dd>
      <dt>Estado</dt><dd>${cp.sleeping ? `<span class="down">dormida (no dio boost)</span>` : cp.goalReached ? `<span class="up">meta cumplida</span>` : "despierta, aún sin meta"}</dd>
      <dt>Tu boost</dt><dd>${f.fac.pet?.qualifiesForBoost ? `<span class="up">te llevas el boost</span>` : "aún no: aliméntala esta semana para optar"}</dd>
    </dl>`;
}
function wFactionHist() {
  const f = factionModel();
  if (!f) return "";
  setSub("fc-hist", `${f.hist.length} semanas guardadas por el juego`);
  return `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Semana</th><th class="r">Puntos</th><th class="r">Puesto</th><th class="r">XP mascota</th><th>Meta</th><th>Premio</th></tr></thead><tbody>
    ${f.hist.map((h) => `<tr><td class="w">${new Date(h.week + "T00:00:00Z").toLocaleDateString(LOCALE, { day: "numeric", month: "short" })}${h.week === f.w.key ? ` <span class="tag sun">ahora</span>` : ""}</td>
      <td class="r"><b>${fmt(toNum(h.score), 0)}</b></td><td class="r dim">${h.results?.rank ? `#${fmt(h.results.rank, 0)}` : "—"}</td><td class="r dim">${compact(toNum(h.petXP))}</td>
      <td>${h.collectivePet?.goalReached ? `<span class="tag green">cumplida</span>` : h.collectivePet?.sleeping ? `<span class="tag red">dormida</span>` : `<span class="tag">no</span>`}</td>
      <td class="dim">${h.results?.reward ? esc(rewardText(h.results.reward)) || "—" : "—"}</td></tr>`).join("")}
  </tbody></table></div>`;
}

// Tienda de Eldric (factionShop.ts): lo de tu facción y lo común, en marks; días para pagarlo a tu ritmo
// (puntos de las últimas semanas cerradas + premio en marks, ÷ 7)
S.fcShop = readLS("fcShop", "all");
function factionShopModel() {
  const f = factionModel();
  if (!f) return null;
  const farm = store.farm.data.farm;
  const weeks = f.hist.filter((h) => h.week < f.w.key).slice(0, 4);
  const perDay = weeks.length ? weeks.reduce((s, h) => s + toNum(h.score) + toNum(h.results?.reward?.items?.Mark), 0) / weeks.length / 7 : null;
  const price = has("activity") ? priceBook() : null;
  const rows = (G.factionShop || []).filter((it) => !it.faction || it.faction === f.fac.name).map((it) => {
    const owned = toNum(farm.inventory?.[it.name]) + toNum(farm.wardrobe?.[it.name]);
    const miss = Math.max(0, it.price - f.marks);
    const locked = it.requires && !(toNum(farm.wardrobe?.[it.requires]) > 0);
    const mv = price ? price(it.name) : null;
    const repeat = it.type === "food" || it.type === "keys" || / Hourglass$/.test(it.name); // se gastan: se compran otra vez
    return { ...it, owned, repeat, done: owned > 0 && !repeat, miss, locked, days: miss && perDay ? miss / perDay : 0, market: mv?.src === "mercado" ? mv.v : null };
  });
  return { f, perDay, weeks: weeks.length, rows };
}
ACTIONS.fcshop = (v) => { S.fcShop = v; writeLS("fcShop", v); go("faction"); };
const FC_SHOP_TYPES = [["all", "Todo"], ["wearable", "Ropa"], ["collectible", "Coleccionables"], ["food", "Comida"], ["keys", "Llaves"]];
function wFactionShop() {
  const d = factionShopModel();
  if (!d) return "";
  const list = d.rows.filter((r) => S.fcShop === "all" || r.type === S.fcShop).sort((a, b) => a.done - b.done || a.price - b.price);
  setSub("fc-shop", `${fmt(d.f.marks, 0)} marks · ${d.perDay ? `ganas ≈ ${fmt(d.perDay * 7, 0)} por semana` : "sin semanas cerradas para medir tu ritmo"}`);
  return `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Objeto</th><th class="r">Marks</th><th class="r">Te faltan</th><th class="r">Días</th><th class="r">Mercado</th><th class="r">Marks/FLW</th></tr></thead><tbody>
    ${list.map((r) => `<tr class="${r.done ? "dim" : ""}"><td class="w">${Gi(r.name, 16)} ${esc(r.name)}${r.done ? ` <span class="tag green">lo tienes</span>` : r.repeat && r.owned ? ` <span class="tag">tienes ${compact(r.owned)}</span>` : ""}${r.done ? "" : r.miss === 0 && !r.locked ? ` <span class="tag sun">puedes comprarlo</span>` : ""}${r.locked ? ` <span class="tag" title="Necesitas ${esc(r.requires)}">🔒 ${esc(r.requires)}</span>` : ""}</td>
      <td class="r">${fmt(r.price, 0)}</td><td class="r ${r.miss ? "down" : "up"}">${r.done ? "—" : r.miss ? fmt(r.miss, 0) : "✓"}</td>
      <td class="r dim">${r.days && !r.done ? fmt(r.days, 0) : "—"}</td><td class="r dim">${r.market ? `${fmt(r.market, 2)} FLW` : "—"}</td>
      <td class="r">${r.market ? fmt(r.price / r.market, 0) : "—"}</td></tr>`).join("")}
  </tbody></table></div>
  <div class="mod-f"><span>Días = marks que faltan ÷ tu media de las ${d.weeks} últimas semanas (puntos + premio)</span><span>Marks/FLW: cuántos marks cuesta cada FLOWER de valor en el mercado (menos = mejor compra)</span></div>`;
}

/* ── Amigos: sus granjas (del volcado nocturno) comparadas con la tuya ──── */
const nodeCount = (m) => m.trees + m.stones + m.iron + m.gold + m.crimstones + m.oil;
// Filas: tú primero y luego cada amigo (con sus datos del volcado si ya salió en uno)
// Posición aproximada de un valor con los percentiles guardados del volcado (para los datos en directo)
function pctFromQuantiles(q, v) {
  if (!q?.length) return null;
  let i = 0;
  while (i < q.length - 1 && q[i + 1] <= v) i++;
  if (i >= q.length - 1) return 100;
  const lo = q[i], hi = q[i + 1];
  return Math.min(100, i + (hi > lo ? Math.max(0, (v - lo) / (hi - lo)) : 0)) * (100 / (q.length - 1));
}
// Fila con datos en directo (botón ↻): métricas de ahora y posición aproximada con los percentiles de anoche
function withLive(id, row, d) {
  const l = S.friendLive[id];
  if (!l) return row;
  const pct = d ? Object.fromEntries(Object.keys(l.metrics).map((k) => [k, pctFromQuantiles(d.metrics[k], l.metrics[k])])) : {};
  return { ...(row || {}), island: l.island, equipped: l.equipped || row?.equipped, metrics: l.metrics, pct, live: l.at, username: l.username || row?.username };
}
function friendRows() {
  const list = store.friends.data || {}, d = store.dump?.data || null;
  const rows = Object.entries(list).map(([id, v]) => {
    const row = withLive(id, d?.friends?.[id] || null, d);
    return { id, name: row?.username || v.value?.name || `#${id}`, row, me: false };
  }).sort((a, b) => (b.row?.metrics.level ?? -1) - (a.row?.metrics.level ?? -1));
  const meId = String(S.farmId);
  const meRow = withLive(meId, d?.me || null, d);
  const me = meRow ? { id: meId, name: "Tú", row: { ...meRow, equipped: meRow.equipped || (has("farm") ? store.farm.data.farm.bumpkin?.equipped : null) }, me: true } : null;
  return { rows, me, d };
}
// Serie diaria de una métrica (de los resúmenes guardados) en el formato de Spark()
const friendSeries = (id, key) => (store.friendHist?.data?.[id] || []).map((x) => ({ date: x.date, floor: x[key] }));
// Adelantamientos entre los dos últimos volcados: quién te ha pasado y a quién has pasado tú
function friendNews() {
  const h = store.friendHist?.data, list = store.friends?.data || {};
  if (!h?.me || h.me.length < 2) return [];
  const [mePrev, meNow] = h.me.slice(-2), out = [];
  for (const id of Object.keys(list)) {
    const s = h[id];
    if (!s || s.length < 2) continue;
    const [prev, now] = s.slice(-2);
    if (prev.date !== mePrev.date || now.date !== meNow.date) continue;
    const name = now.username || list[id]?.value?.name || `#${id}`;
    for (const [k, label] of [["level", "nivel"], ["worth", "patrimonio"], ["expansions", "expansiones"]]) {
      if (prev[k] <= mePrev[k] && now[k] > meNow[k]) out.push({ id, name, k, label, passedYou: true });
      if (prev[k] >= mePrev[k] && now[k] < meNow[k]) out.push({ id, name, k, label, passedYou: false });
    }
  }
  return out;
}
async function friendLive(id) {
  toast("Leyendo su granja en directo…", 2000);
  try {
    S.friendLive[id] = await api(`/api/friends/live/${encodeURIComponent(id)}`);
    rerun();
  } catch (e) { toast(e.message, 4000); }
}
function wFriendList() {
  const { rows, me, d } = friendRows();
  setSub("fr-list", `${rows.length} amigo${rows.length === 1 ? "" : "s"}${d ? ` · datos de anoche (${esc(d.date)})` : ""}`);
  if (!rows.length) return Empty("friends", "Aún no sigues a nadie", "Escribe arriba el nombre o el ID de la granja de un amigo. Sus datos salen del volcado de cada noche y su ficha, al hacer clic, es en directo.");
  const sel = S.friendSel && rows.some((r) => r.id === S.friendSel) ? S.friendSel : rows[0].id;
  const tr = (r) => {
    const m = r.row?.metrics;
    const cells = m
      ? `<td class="r"><b>${m.level}</b></td><td class="dim">${esc(islandLabel(r.row.island))}</td><td class="r">${fmt(m.worth, 0)}</td><td class="r dim">${m.expansions}</td>
         <td class="r dim">${nodeCount(m)}</td><td class="r dim">${m.nfts}</td><td class="r"><span class="ctx">${topText(r.row.pct.worth)}</span></td>
         <td class="dim">${r.row.live ? `<span class="tag green" data-tip="${esc(`En directo|Datos de ahora mismo (${ago(r.row.live)}); la posición es aproximada, con los percentiles de anoche|`)}">en directo</span>` : r.row.lastActivity ? ago(r.row.lastActivity) : "—"}</td>
         <td>${Spark(friendSeries(r.me ? "me" : r.id, "worth"))}</td>`
      : `<td colspan="9" class="faint">${d ? "No sale en el volcado de anoche: saldrá en el siguiente (o no ha jugado en 90 días)" : "Sin volcado todavía: actívalo en Ajustes → Datos de la comunidad"}</td>`;
    const liveBtn = `<button class="btn sm ghost" data-frlive="${esc(r.id)}" title="Leer su granja ahora (datos en directo)" aria-label="Datos en directo de ${esc(r.name)}">↻</button>`;
    const act = r.me ? liveBtn : `${liveBtn} <button class="btn sm ghost${r.id === sel ? " on" : ""}" data-frcmp="${esc(r.id)}">Comparar</button> <button class="btn sm ghost" data-frdel="${esc(r.id)}" title="Dejar de seguir" aria-label="Quitar a ${esc(r.name)}">✕</button>`;
    return `<tr class="${r.me ? "me" : ""}"><td class="w">${Player(r.name, r.row?.equipped, r.me ? null : r.id)}${r.row?.vip ? ` <span class="tag sun">VIP</span>` : ""}</td>${cells}<td class="r">${act}</td></tr>`;
  };
  return `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Jugador</th><th class="r">Nivel</th><th>Isla</th><th class="r">Patrimonio</th><th class="r">Expansiones</th><th class="r">Nodos</th><th class="r">NFTs</th><th class="r">Patrimonio vs todos</th><th>Jugó</th><th>Patrimonio (días)</th><th></th></tr></thead><tbody>
    ${me ? tr(me) : ""}${rows.map(tr).join("")}
  </tbody></table></div>${newsHtml()}<div class="mod-f"><span>Nodos = árboles, piedras, hierro, oro, crimstone y oil · patrimonio en FLOWER a floor · ↻ = en directo</span><span>la evolución crece con cada volcado</span></div>`;
}
function newsHtml() {
  const n = friendNews();
  if (!n.length) return "";
  return `<div class="fr-news">${n.map((x) => `<span class="tag ${x.passedYou ? "red" : "green"}">${x.passedYou ? `${esc(x.name)} te ha pasado en ${x.label}` : `has pasado a ${esc(x.name)} en ${x.label}`}</span>`).join(" ")}</div>`;
}
function selectedFriend() {
  const { rows, me, d } = friendRows();
  const withData = rows.filter((r) => r.row);
  const f = withData.find((r) => r.id === S.friendSel) || withData[0] || null;
  return { f, me, d };
}
function wFriendCompare() {
  const { f, me, d } = selectedFriend();
  if (!d) return Empty("globe", "Sin volcado", "La comparación usa el volcado de cada noche: actívalo en Ajustes → Datos de la comunidad.");
  if (!f || !me) return Empty("friends", "Nada que comparar", "Añade un amigo que haya salido en el volcado.");
  setSub("fr-cmp", `tú vs ${esc(f.name)}`);
  const val = (k, v) => (["flower", "worth"].includes(k) ? fmt(v, v < 10 ? 1 : 0) : compact(v));
  return `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Métrica</th><th class="r">Tú</th><th class="r">${esc(f.name)}</th><th class="r">Diferencia</th><th class="r">Tú vs todos</th><th class="r">${esc(f.name)} vs todos</th></tr></thead><tbody>
    ${Object.entries(d.metricNames).map(([k, label]) => {
      const a = me.row.metrics[k], b = f.row.metrics[k], diff = a - b;
      return `<tr><td class="w">${esc(label)}</td><td class="r"><b>${val(k, a)}</b></td><td class="r">${val(k, b)}</td>
        <td class="r ${diff > 0 ? "up" : diff < 0 ? "down" : "faint"}">${diff === 0 ? "=" : `${diff > 0 ? "+" : "−"}${val(k, Math.abs(diff))}`}</td>
        <td class="r dim">${topText(me.row.pct[k])}</td><td class="r dim">${topText(f.row.pct[k])}</td></tr>`;
    }).join("")}
  </tbody></table></div><div class="mod-f"><span>Diferencia: verde = vas por delante</span><span>${esc(f.name)}: ${esc(islandLabel(f.row.island))} · ${bandLabel(f.row.band)}${f.row.faction ? ` · ${esc(f.row.faction)}` : ""}</span></div>`;
}
function wFriendBoosts() {
  const { f, me } = selectedFriend();
  if (!f || !me) return Empty("bolt", "Sin datos", "");
  const farm = has("farm") ? store.farm.data.farm : null;
  const mine = new Set(me.row.boosts);
  const own = (n) => mine.has(n) || (farm && (toNum(farm.inventory?.[n]) > 0 || toNum(farm.wardrobe?.[n]) > 0));
  const price = has("activity") ? priceBook() : null;
  const theirs = f.row.boosts.filter((n) => !own(n) && !TEMP_BOOST.test(n)).map((n) => ({ n, p: price ? price(n).v : null })).sort((a, b) => (b.p ?? -1) - (a.p ?? -1));
  const onlyMine = me.row.boosts.filter((n) => !f.row.boosts.includes(n) && !TEMP_BOOST.test(n));
  setSub("fr-boosts", `${esc(f.name)} tiene ${theirs.length} que tú no · tú ${onlyMine.length} que no tiene`);
  const txt = (n) => (G.buffs[n] ? (Array.isArray(G.buffs[n]) ? G.buffs[n].join(" · ") : String(G.buffs[n])) : "");
  const link = (n) => (G.itemIds[n] != null ? `collectibles-${G.itemIds[n]}` : G.wearableIds[n] != null ? `wearables-${G.wearableIds[n]}` : null);
  return `${theirs.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Lo tiene y tú no</th><th class="r">Precio</th></tr></thead><tbody>
    ${theirs.slice(0, 25).map((r) => `<tr ${link(r.n) ? `data-open="${link(r.n)}"` : ""}><td class="w">${Gi(r.n, 14)} ${esc(r.n)}<div class="ctx cm-desc">${esc(txt(r.n))}</div></td><td class="r dim">${r.p != null ? `${fmt(r.p, r.p < 10 ? 2 : 0)} FLW` : "—"}</td></tr>`).join("")}
  </tbody></table></div>` : Empty("check", "Nada que envidiar", `Tienes todos los boosts de ${esc(f.name)}.`)}
    ${onlyMine.length ? `<div class="mod-f" style="display:block"><span>Tú tienes y ${esc(f.name)} no: ${esc(onlyMine.slice(0, 12).join(", "))}${onlyMine.length > 12 ? ` y ${onlyMine.length - 12} más` : ""}</span></div>` : ""}`;
}
async function friendAdd(q) {
  q = String(q || "").trim();
  if (!q) return;
  try {
    let id = q, name = null;
    if (!/^\d+$/.test(q)) {
      const r = await api(`/api/ext/user/${encodeURIComponent(q)}`).catch((e) => { throw new Error(e.status === 404 ? `No hay ninguna granja llamada «${q}» (sfl.world tarda de 2 a 7 días en ver granjas nuevas): prueba con su ID` : "No se pudo buscar: sfl.world no responde"); });
      id = String(r.farm_id ?? r.nft_id); name = r.username || q;
    }
    if (String(id) === String(S.farmId)) throw new Error("Esa es tu granja");
    store.friends.data = await jpost("/api/friends", { id, name });
    if (store.friendHist) store.friendHist.at = 0;
    S.friendSel = id; writeLS("friendSel", id);
    const inDump = store.dump?.data?.friends?.[id];
    toast(inDump ? `${name || id} añadido` : `${name || id} añadido: sus datos saldrán al procesar el próximo volcado (Ajustes → Datos de la comunidad → Procesar ahora)`, 5000);
    go("friends");
  } catch (e) { toast(e.message, 5000); }
}
async function friendRemove(id) {
  try { store.friends.data = await jpost("/api/friends", { id, remove: true }); } catch (e) { return toast(e.message); }
  delete S.friendLive[id];
  if (store.friendHist) store.friendHist.at = 0;
  if (S.friendSel === id) { S.friendSel = null; writeLS("friendSel", null); }
  rerun();
}

// Apariencia: "Clásico" (pixel, el de siempre) o "Moderno" (design2.css encima de app.css: letra normal, esquinas
// suaves, bordes finos). Se guarda en este navegador; index.html lo aplica antes de pintar.
const currentDesign = () => (readLS("design", "clasico") === "moderno" ? "moderno" : "clasico");
function setDesign(v) {
  writeLS("design", v);
  let link = document.getElementById("d2css");
  if (v === "moderno" && !link) {
    link = Object.assign(document.createElement("link"), { rel: "stylesheet", href: "design2.css", id: "d2css" });
    document.head.appendChild(link);
  } else if (v !== "moderno" && link) link.remove();
  renderDesignSettings();
}
ACTIONS.lang = (v) => { if (v !== (LANG || "es")) setLang(v); };
function renderDesignSettings() {
  const el = $("#st-design");
  if (!el) return;
  const d = currentDesign();
  el.innerHTML = `<div class="row" style="margin-bottom:10px">${Seg([["clasico", "Clásico (pixel)"], ["moderno", "Moderno"]], d, "design")}</div>
    <div class="row" style="margin:4px 0 10px"><span class="ctx" style="margin-right:8px">Idioma · Language</span><div class="seg" data-noi18n><button data-act="lang:es" class="${LANG !== "en" ? "on" : ""}">Español</button><button data-act="lang:en" class="${LANG === "en" ? "on" : ""}">English</button></div></div>
    <p class="ctx">${d === "moderno" ? "Letra normal, esquinas suaves y bordes finos. Los iconos del juego siguen en pixel." : "El diseño de siempre: letra pixel y marco estilo Sunflower Land."} Se guarda en este navegador.</p>`;
}

// Avisos a Discord: pegas el webhook de tu canal (Editar canal → Integraciones → Webhooks) y eliges qué avisar
async function renderDiscordSettings() {
  const el = $("#st-discord");
  if (!el) return;
  try { S.discord = await api("/api/notify"); } catch { el.innerHTML = `<p class="ctx">No disponible</p>`; return; }
  const d = S.discord;
  const cats = Object.entries(CATS).filter(([k]) => !["daily", "lava"].includes(k));
  el.innerHTML = `<form id="discordForm" class="form">
      <label>Webhook de tu canal <input type="password" id="discordHook" autocomplete="off" placeholder="${d.configured ? "•••••••• configurado — déjalo vacío para mantenerlo" : "https://discord.com/api/webhooks/…"}" /></label>
      <div class="row"><button class="btn sm" type="submit">Guardar</button>${d.configured ? `<button class="btn sm ghost" type="button" data-discord="test">Enviar prueba</button><button class="btn sm ghost" type="button" data-discord="clear">Quitar</button>` : ""}</div>
    </form>
    <h4 class="acc-h">Avisar cuando esté listo</h4>
    <div class="dc-cats">${cats.map(([k, c]) => `<label class="chk-l"><input type="checkbox" data-dccat="${k}" ${d.cats.includes(k) ? "checked" : ""}/> ${sprite(c.spr, 14)} ${esc(c.label)}</label>`).join("")}</div>
    <p class="ctx">Los manda este ordenador mientras el dashboard esté abierto (el de casa), agrupados como mucho uno por minuto. El webhook se guarda en <code>config.json</code> y nunca vuelve al navegador.${d.lastError ? ` <span class="down">Último error: ${esc(d.lastError.message)}</span>` : d.lastSentAt ? ` Último aviso ${ago(d.lastSentAt)}.` : ""}</p>`;
}
async function discordAction(kind) {
  try {
    if (kind === "save") {
      const url = $("#discordHook").value.trim();
      if (!url) return toast("Pega primero la dirección del webhook");
      await jpost("/api/notify/config", { url });
      toast("Webhook guardado");
    } else if (kind === "clear") { await jpost("/api/notify/config", { clear: true }); toast("Avisos a Discord quitados"); }
    else if (kind === "test") { await jpost("/api/notify/test"); toast("Prueba enviada: mira tu canal de Discord"); }
    else if (kind === "cats") {
      const cats = $$("[data-dccat]").filter((i) => i.checked).map((i) => i.dataset.dccat);
      await jpost("/api/notify/config", { cats });
    }
  } catch (e) { toast(e.message, 4000); }
  renderDiscordSettings();
}

async function dumpAction(kind, value) {
  try {
    if (kind === "toggle") await jpost("/api/dump", { enabled: value });
    else { await jpost("/api/dump/now"); toast("Procesando el volcado de anoche: 1-2 minutos…", 4000); pollDump(); }
  } catch (e) { toast(e.message); }
  renderDumpSettings();
}
async function pollDump() {
  let st;
  try { st = await api("/api/dump"); } catch { return; }
  renderDumpSettings(st);
  if (st.running) return setTimeout(pollDump, 4000);
  if (st.lastError) return toast(`⚠ ${st.lastError.message}`);
  if (store.dump) store.dump.at = 0;
  toast("Datos de la comunidad listos");
  if (S.page === "community") rerun();
}
async function renderDumpSettings(st) {
  const el = $("#st-dump");
  if (!el) return;
  if (!st) { try { st = await api("/api/dump"); } catch { st = null; } }
  if (!st) { el.innerHTML = `<p class="ctx">No disponible</p>`; return; }
  const err = st.lastError && (!st.lastRunAt || st.lastError.at > st.lastRunAt);
  el.innerHTML = `<label class="toggle"><input type="checkbox" id="dumpToggle" ${st.enabled ? "checked" : ""}/><i></i><span>Procesar el volcado cada noche</span></label>
    <dl class="kv" style="margin-top:10px">
      <dt>Estado</dt><dd>${st.running ? `${esc(st.phase || "procesando")}${st.progress != null ? ` · ${fmt(st.progress * 100, 0)}%` : ""}…` : st.lastRunAt ? `último ${ago(st.lastRunAt)}` : "aún no"}</dd>
      <dt>Días guardados</dt><dd>${st.dates.length ? `${st.dates.length} (${esc(st.dates[0])} → ${esc(st.dates[st.dates.length - 1])})` : "ninguno"}</dd>
      ${err ? `<dt>Error</dt><dd class="down">${esc(st.lastError.message)}</dd>` : ""}
    </dl>
    <p class="ctx">Descarga ~800 MB al día (el volcado de las granjas activas) del servidor de descargas de Sunflower Land, sin tu key, y guarda
      un resumen de ~100 KB en <code>data/dump/</code> que llega a tus otros ordenadores por GitHub. Actívalo solo en uno (el de casa).</p>
    <div class="row"><button class="btn sm" data-dump="now" ${st.running ? "disabled" : ""}>Procesar ahora</button><a class="btn sm ghost" href="#community">Ver Comunidad</a></div>`;
}

function wCalendar() {
  const ev = calendarEvents().slice(0, 6);
  const ES = { doubleDelivery: "Entrega doble", fullMoon: "Luna llena", tsunami: "Tsunami", bountifulHarvest: "Cosecha abundante", unknown: "Clima por revelar", tornado: "Tornado", greatFreeze: "Gran helada", insectPlague: "Plaga", sunshower: "Lluvia de sol", fishFrenzy: "Frenesí de pesca" };
  if (!ev.length) return Empty("calendar", "Calendario vacío", "");
  return ev.map((d) => `<div class="ev"><div class="ico">${sprite(d.name === "doubleDelivery" ? "ticket" : d.name === "fullMoon" ? "sun" : d.weather ? "warn" : "calendar", 16)}</div>
    <div style="min-width:0"><div class="t">${esc(ES[d.name] || d.name)}</div><div class="s">${d.weather ? "clima" : "evento"}</div></div>
    <div class="tm">${d.date === todayUTC() ? `<span class="up">HOY</span>` : new Date(d.date + "T00:00:00Z").toLocaleDateString(LOCALE, { weekday: "short", day: "numeric", month: "short" })}</div></div>`).join("");
}
