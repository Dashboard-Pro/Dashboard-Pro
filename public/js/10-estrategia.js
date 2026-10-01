// SFL Console — Estrategia: plan de acción y ventanas (FLOWER, tickets, expansión, nivel, flores, rutina).
// Scripts clásicos que comparten el ámbito global en el orden de index.html (antes, un solo app.js).
"use strict";

/* ── Estrategia ─────────────────────────────────────────────────────────── */
// Ciclo real si entras cada V horas: lo que tarda en crecer, redondeado a tu próxima visita.
const cycleH = (h, V) => (V <= 0 ? h : Math.ceil(h / V - 1e-9) * V);

// Ventanas de boosts temporales (tótems, shrines, clima, buffs como Power hour): [{ name, from, to }]
function tempWindows(farm) {
  const out = [];
  for (const [name, list] of Object.entries(farm.boostHistory || {})) for (const w of list || []) if (w?.from && w?.to) out.push({ name, from: toNum(w.from), to: toNum(w.to), kind: "boost" });
  for (const [name, b] of Object.entries(farm.buffs || {})) if (b?.startedAt && b?.durationMS) out.push({ name, from: toNum(b.startedAt), to: toNum(b.startedAt) + toNum(b.durationMS), kind: "buff" });
  return out;
}

// Velocidad medida en tu granja. El juego guarda en cada parcela/nodo cuánto tiempo le quitaron tus
// boosts (boostedTime). Lo plantado mientras había un boost TEMPORAL activo no cuenta: si no, la
// estrategia creería permanente un Time Warp Totem o un shrine que ya se acabó.
function boostRatios() {
  const farm = store.farm.data.farm;
  if (boostRatios.c?.farm === farm) return boostRatios.c.out;
  const wins = tempWindows(farm);
  const underTemp = (plantedAt, boosted) => { const real = toNum(plantedAt) + toNum(boosted); return wins.some((w) => real >= w.from && real < w.to); };
  const crops = {}, cropsTemp = {};
  const all = [], allTemp = [];
  let excluded = 0;
  for (const p of Object.values(farm.crops || {})) {
    const c = p?.crop;
    const base = c && G.crops[c.name];
    if (!base) continue;
    // Modelo nuevo del juego (SPEED_BOOSTS): baseDurationMs ya es la duración con solo los boosts permanentes
    if (c.baseDurationMs != null) { const r2 = Math.max(0.05, toNum(c.baseDurationMs) / (base * 1000)); (crops[c.name] ||= []).push(r2); all.push(r2); continue; }
    const r = Math.max(0.05, (base * 1000 - toNum(c.boostedTime)) / (base * 1000));
    if (c.boostedTime && underTemp(c.plantedAt, c.boostedTime)) { excluded++; (cropsTemp[c.name] ||= []).push(r); allTemp.push(r); continue; }
    (crops[c.name] ||= []).push(r);
    all.push(r);
  }
  const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 1);
  // Sin ninguna medida limpia se usan también las de boosts temporales (mejor que nada)
  const pool = all.length ? all : allTemp;
  // Duración con boosts permanentes guardada por el modelo nuevo del juego (SPEED_BOOSTS), si ya lo usa
  const measured = (obj, part, base) => Object.values(obj || {}).map((n) => n?.[part]?.baseDurationMs).filter((v) => v != null)
    .map((v) => Math.max(0, toNum(v) / (base * 1000)));
  const nodeRatio = (obj, base) => {
    const m = measured(obj, "stone", base);
    if (m.length) return Math.max(0.05, avg(m));
    const rs = Object.values(obj || {}).filter((n) => n?.stone?.boostedTime && !underTemp(n.stone.minedAt, n.stone.boostedTime))
      .map((n) => Math.max(0.05, (base * 1000 - toNum(n.stone.boostedTime)) / (base * 1000)));
    return rs.length ? avg(rs) : 1;
  };
  // Árboles y Oil no guardan cuánto les quitaron los boosts: se calcula con las reglas del juego
  // (chop.ts getTreeRecoveryTimeForDisplay y drillOilReserve.ts), solo boosts permanentes.
  const skills = farm.bumpkin?.skills || {}, placed = new Set(placedCollectibles(farm)), worn = wornSet(farm);
  const rank = (n) => Math.min(3, Math.max(0, toNum(skills[n])));
  const treeBoosts = [], oilBoosts = [];
  let tree = 1, oil = 1;
  if (placed.has("Apprentice Beaver") || placed.has("Foreman Beaver")) { tree *= 0.5; treeBoosts.push(`${placed.has("Foreman Beaver") ? "Foreman" : "Apprentice"} Beaver ×0,5`); }
  if (rank("Tree Charge")) { const m = [0.9, 0.875, 0.85][rank("Tree Charge") - 1]; tree *= m; treeBoosts.push(`Tree Charge ×${fmt(m, 3)}`); }
  // Tree Turnaround: probabilidad de rebrote instantáneo → en media el ciclo se acorta en esa proporción
  if (rank("Tree Turnaround")) { const p = [15, 25, 35][rank("Tree Turnaround") - 1] / 100; tree *= 1 - p; treeBoosts.push(`Tree Turnaround ${p * 100}% instantáneo`); }
  if (worn.has("Dev Wrench")) { oil *= 0.5; oilBoosts.push("Dev Wrench ×0,5"); }
  if (rank("Oil Be Back")) { const m = [0.8, 0.7, 0.6][rank("Oil Be Back") - 1]; oil *= m; oilBoosts.push(`Oil Be Back ×${fmt(m, 1)}`); }
  // Con el modelo nuevo del juego la granja ya trae la duración real de cada árbol/pozo: manda sobre las reglas
  // (incluye cualquier boost permanente que no conozcamos; un Tree Turnaround instantáneo cuenta como 0)
  const mTree = measured(farm.trees, "wood", G.recovery.tree), mOil = measured(farm.oilReserves, "oil", G.recovery.oil);
  if (mTree.length) { tree = Math.max(0.05, avg(mTree)); treeBoosts.push(`medido en tus ${mTree.length} árboles`); }
  if (mOil.length) { oil = Math.max(0.05, avg(mOil)); oilBoosts.push(`medido en tus ${mOil.length} pozos`); }
  const out = {
    crop: (name) => (crops[name] ? avg(crops[name]) : avg(pool)),
    observed: (name) => Boolean(crops[name]),
    avgCrop: avg(pool),
    excluded,
    node: { stones: nodeRatio(farm.stones, G.recovery.stone), iron: nodeRatio(farm.iron, G.recovery.iron), gold: nodeRatio(farm.gold, G.recovery.gold), crimstones: nodeRatio(farm.crimstones, G.recovery.crimstone), sunstones: nodeRatio(farm.sunstones, G.recovery.sunstone), trees: tree, oil },
    treeBoosts, oilBoosts,
  };
  boostRatios.c = { farm, out };
  return out;
}

// Todos tus boosts, para el apartado "Tus boosts" de Estrategia:
//  temporales activos (con su fin), NFTs colocados y ropa puesta con boost, skills y lo que el juego ha
//  aplicado de verdad hace poco (boostsUsedAt).
const CAL_ES = { doubleDelivery: "Entrega doble", fullMoon: "Luna llena", tsunami: "Tsunami", bountifulHarvest: "Cosecha abundante", unknown: "Clima por revelar", tornado: "Tornado", greatFreeze: "Gran helada", insectPlague: "Plaga", sunshower: "Lluvia de sol", fishFrenzy: "Frenesí de pesca", Sunshower: "Lluvia de sol" };
function boostInventory() {
  const f = store.farm.data, farm = f.farm, t = now();
  const world = store.worldNfts?.data?.map || {};
  const used = farm.boostsUsedAt || {};
  // Texto del juego en español (G.buffs, incluye lo que no se vende) y si no, el de sfl.world
  const boostOf = (name, col) => G.buffs?.[name] || world[`${col}-${(col === "wearables" ? G.wearableIds : G.itemIds)[name]}`]?.boost || "";
  const temps = tempWindows(farm).filter((w) => w.from <= t && w.to > t)
    .map((w) => ({ ...w, label: CAL_ES[w.name] || w.name, boost: boostOf(w.name, "collectibles") }));
  const today = (farm.calendar?.dates || []).filter((d) => d.date === todayUTC() && d.name && d.name !== "unknown")
    .map((d) => ({ name: d.name, label: CAL_ES[d.name] || d.name, to: nextUtcMidnight(t), kind: d.weather ? "clima" : "evento" }));
  for (const d of today) if (!temps.some((x) => x.name.toLowerCase() === d.name.toLowerCase())) temps.push(d);
  const placedNames = placedCollectibles(farm);
  const placed = placedNames.map((name) => ({ name, boost: boostOf(name, "collectibles"), usedAt: toNum(used[name]) || null }))
    .filter((x) => x.boost && !temps.some((w) => w.name === x.name)).sort((a, b) => (b.usedAt || 0) - (a.usedAt || 0) || a.name.localeCompare(b.name));
  // Ropa con boost de tu Bumpkin y de tus ayudantes; si dos llevan la misma prenda, una sola fila con los dos
  const byName = new Map();
  for (const w of wornWearables(farm)) {
    const boost = boostOf(w.name, "wearables");
    if (!boost) continue;
    const e = byName.get(w.name) || { name: w.name, boost, usedAt: toNum(used[w.name]) || null, who: [] };
    e.who.push(w.who);
    byName.set(w.name, e);
  }
  const worn = [...byName.values()].sort((a, b) => (b.usedAt || 0) - (a.usedAt || 0) || a.who[0].localeCompare(b.who[0]) || a.name.localeCompare(b.name));
  const skills = Object.values(skillModel().trees).flatMap((tr) => tr.skills).filter((s) => s.owned && !s.power)
    .map((s) => ({ name: s.name, boost: s.buff, tree: s.tree, usedAt: toNum(used[s.name]) || null })).sort((a, b) => (b.usedAt || 0) - (a.usedAt || 0));
  return { temps, placed, worn, skills, activeRecently: Object.values(used).filter((u) => t - toNum(u) < 86400_000).length };
}

// Unidades medias por cosecha/golpe con TODOS tus boosts de cantidad (NFTs, skills, zonas de efecto),
// calculadas por sfl.world. Sin ese dato se asume 1 (lo base).
function yieldOf(group, name) {
  const v = store.myBoosts?.data?.[group]?.[String(name).toLowerCase()]?.avg;
  return v > 0 ? v : null;
}

function cropPlan() {
  const farm = store.farm.data.farm;
  const price = priceBook();
  const season = farm.season?.season;
  const allowed = new Set((G.seasonalSeeds[season] || []).map((s) => s.replace(/ Seed$/, "")));
  const plots = Object.values(farm.crops || {}).filter((p) => p && !p.removedAt).length;
  const br = boostRatios();
  const V = S.visitH;
  const rows = Object.entries(G.crops).filter(([n]) => !allowed.size || allowed.has(n)).map(([name, secs]) => {
    const hours = (secs / 3600) * br.crop(name);
    const p = price(name).v;
    const cyc = cycleH(hours, V);
    const amt = yieldOf("crops", name) ?? 1;
    return { name, hours, cyc, p, amt, perDay: p != null ? (p * amt * 24 * plots) / cyc : null, perH: p != null ? (p * amt) / hours : null, observed: br.observed(name) };
  }).sort((a, b) => (b.perDay ?? -1) - (a.perDay ?? -1));
  return { rows, plots, season, avgRatio: br.avgCrop };
}

function nodePlan() {
  const farm = store.farm.data.farm;
  const price = priceBook();
  const br = boostRatios();
  const V = S.visitH;
  const defs = [
    ["trees", "Wood", G.recovery.tree, br.node.trees, placedNodes(farm.trees).length],
    ["stones", "Stone", G.recovery.stone, br.node.stones, placedNodes(farm.stones).length],
    ["iron", "Iron", G.recovery.iron, br.node.iron, placedNodes(farm.iron).length],
    ["gold", "Gold", G.recovery.gold, br.node.gold, placedNodes(farm.gold).length],
    ["crimstones", "Crimstone", G.recovery.crimstone, br.node.crimstones, placedNodes(farm.crimstones).length],
    ["sunstones", "Sunstone", G.recovery.sunstone, br.node.sunstones, placedNodes(farm.sunstones).length],
    ["oil", "Oil", G.recovery.oil, br.node.oil, placedNodes(farm.oilReserves).length],
  ];
  return defs.filter((d) => d[4]).map(([cat, item, secs, ratio, n]) => {
    const hours = (secs / 3600) * ratio;
    const p = price(item).v;
    const cyc = cycleH(hours, V);
    const amt = yieldOf("resources", item) ?? 1;
    return { cat, item, n, hours, cyc, p, amt, perDay: p != null ? (p * amt * 24 * n) / cyc : null };
  }).sort((a, b) => (b.perDay ?? -1) - (a.perDay ?? -1));
}

// Plan de acción: recomendaciones concretas, ordenadas por prioridad.
function recommendations() {
  const recs = [];
  const f = store.farm.data;
  const farm = f.farm;
  const t = now();
  const add = (prio, icon, title, detail, go, value, key) => recs.push({ prio, icon, title, detail, go, value, key });

  const ready = f.timers.filter((x) => x.ready <= t);
  if (ready.length) {
    const per = perCategory(f.timers);
    const top = Object.entries(per).filter(([, v]) => v.ready).sort((a, b) => b[1].ready - a[1].ready).slice(0, 3).map(([k, v]) => `${v.ready} ${CATS[k].label.toLowerCase()}`).join(", ");
    add(1, "bell", `Recoge ${ready.length} cosas listas`, top, "farm");
  }
  const emptyPlots = Object.values(farm.crops || {}).filter((p) => p && !p.removedAt && !p.crop).length;
  if (emptyPlots && has("activity")) {
    const best = cropPlan().rows.find((r) => r.perDay != null);
    add(1, "carrot", `${emptyPlots} parcela${emptyPlots > 1 ? "s" : ""} vacía${emptyPlots > 1 ? "s" : ""}`, best ? `Para tu ritmo (cada ${S.visitH} h), lo que más rinde es ${best.name}: listo en ${dur(best.hours * 3600_000)}` : "Planta algo", "strategy");
  }
  const sm = skillModel();
  const powers = Object.values(sm.trees).flatMap((tr) => tr.skills).filter((s) => s.power && s.owned && s.readyAt <= t);
  if (powers.length) add(1, "bolt", `${powers.length} poder${powers.length > 1 ? "es" : ""} listo${powers.length > 1 ? "s" : ""}`, powers.map((s) => s.name).join(", "), "skills");
  if (sm.free > 0) add(2, "bolt", `${sm.free} punto${sm.free > 1 ? "s" : ""} de skill sin gastar`, "Hay skills disponibles para aprender", "skills");

  if (has("activity")) {
    const m = missionModel();
    const deliverable = m.ticketOrders.filter((o) => o.ready && !o.waiting && o.perTicket != null).sort((a, b) => a.perTicket - b.perTicket);
    const nextDouble = calendarEvents().find((d) => d.name === "doubleDelivery");
    if (deliverable.length && !(nextDouble && nextDouble.date !== todayUTC() && Date.parse(nextDouble.date) - t < 36 * 3600_000)) {
      add(1, "ticket", `Entrega ya: ${deliverable.slice(0, 3).map((o) => NPC_ES(o.from)).join(", ")}`, `${deliverable.slice(0, 3).reduce((s, o) => s + o.tickets, 0)} tickets a ${fmt(deliverable[0].perTicket, 3)} FLOWER/ticket el más barato`, "missions");
    }
    if (nextDouble && nextDouble.date !== todayUTC()) {
      add(2, "calendar", `Entrega doble el ${new Date(nextDouble.date + "T00:00:00Z").toLocaleDateString(LOCALE, { weekday: "long", day: "numeric" })}`, `Guarda los pedidos de más tickets (${m.ticketOrders.slice().sort((a, b) => b.tickets - a.tickets).slice(0, 2).map((o) => `${NPC_ES(o.from)} ${o.tickets}→${o.tickets * 2}`).join(", ")})`, "missions");
    }
    if (m.double) add(1, "calendar", "Hoy hay entrega doble", "Cada NPC de tickets paga ×2 en su primera entrega del día", "missions");
    const bounty = m.bounties.filter((b) => b.profit > 0 && b.have >= 1).sort((a, b) => b.profit - a.profit)[0];
    if (has("friendHist")) {
      const passed = friendNews().filter((x) => x.passedYou);
      if (passed.length) add(3, "friends", `${passed[0].name} te ha pasado en ${passed[0].label}`, passed.length > 1 ? `y ${passed.length - 1} adelantamiento${passed.length > 2 ? "s" : ""} más entre tus amigos` : "según el volcado de anoche", "friends");
    }
    if (has("flowerRecipes")) {
      const fp = flowerPlan(), next = fp.demand.find((d) => d.state === "plant");
      if (fp.free && next) add(1, "flower", `Macizo libre: planta ${next.flower}`, `${recipeText(next.recipe)} · para ${FLOWER_KIND[next.kind]}${next.kind === "chore" ? ` de ${next.who}` : ""}${next.tickets ? ` (${next.tickets} ${fp.ticket})` : ""}`, "strategy:flowers");
    }
    if (bounty) add(2, "coin", `Bounty rentable: ${bounty.name}`, `Pagan ${fmt(bounty.rewardValue, 2)} FLOWER; venderlo te daría ${fmt(bounty.itemVal * 0.9, 2)} (+${fmt(bounty.profit, 2)})`, "missions:bounties", bounty.profit);
    const nearChore = m.board.filter((c) => !c.done && c.p >= 0.75 && c.p < 1).sort((a, b) => b.p - a.p)[0];
    if (nearChore) add(3, "scroll", `Casi terminas: ${nearChore.name}`, `${fmt(nearChore.progress, 0)}/${nearChore.def.amount} · ${NPC_ES(nearChore.npc)}`, "missions:chores");
    const doneChores = m.board.filter((c) => !c.done && c.p >= 1);
    if (doneChores.length) add(1, "check", `${doneChores.length} tarea${doneChores.length > 1 ? "s" : ""} completada${doneChores.length > 1 ? "s" : ""} por reclamar`, doneChores.map((c) => NPC_ES(c.npc)).join(", "), "missions:chores");

    const h = holdings();
    const prev = has("activityPrev") ? store.activityPrev.data.items : {};
    const sells = (h?.rows || []).filter((r) => r.bestOffer && prev[r.key]?.floor && r.bestOffer >= prev[r.key].floor * 1.1 && r.bestOffer * r.qty > 1)
      .sort((a, b) => b.bestOffer * b.qty - a.bestOffer * a.qty).slice(0, 2);
    for (const r of sells) add(2, "coin", `Buen momento para vender ${r.name}`, `Mejor oferta ${fmt(r.bestOffer)} = +${fmt(((r.bestOffer - prev[r.key].floor) / prev[r.key].floor) * 100, 0)}% sobre el floor de ayer · tienes ${compact(r.qty)}`, null, r.bestOffer * r.qty, r.key);
  }
  const chestAt = toNum(farm.dailyRewards?.chest?.collectedAt);
  if (chestAt && nextUtcMidnight(chestAt) <= t) {
    const streak = toNum(farm.dailyRewards.streaks);
    const lose = nextUtcMidnight(nextUtcMidnight(chestAt));
    add(1, "chest", "Abre el cofre diario", streak > 6 ? `Racha de ${streak} días · la pierdes en ${dur(lose - t)} si no lo abres` : "Disponible desde medianoche UTC", "farm");
  }
  const vipLeft = (farm.vip?.expiresAt || 0) - t;
  if (vipLeft > 0 && vipLeft < 7 * 86400_000) add(1, "warn", `VIP caduca en ${dur(vipLeft)}`, "Sin VIP pierdes +2 tickets por entrega y la API key deja de funcionar", null);
  // Objetivos: comida guardada que da nivel y expansión lista para construir
  try {
    const l = levelPlan();
    if (l.storedXp >= Math.min(l.need, 5000)) add(2, "cook", l.storedXp >= l.need ? "Cómete la comida guardada: subes de nivel" : `Tienes ${compact(l.storedXp)} XP en comida sin comer`, `${fmt((l.storedXp / Math.max(1, l.need)) * 100, 0)}% de lo que te falta para el nivel ${l.lv.lvl + 1}`, null);
    const e = expansionModel();
    if (e.next && e.next.levelOk && !e.next.coinsMiss && e.next.rows.every((r) => !r.miss)) add(1, "sprout", `Puedes construir la expansión ${e.next.n}`, "Tienes todos los recursos y coins", null);
  } catch { /* sin datos suficientes */ }
  // Boosts temporales activos: se aprovechan mientras duran (no entran en los cálculos de siempre)
  try {
    for (const b of boostInventory().temps) {
      const left = dur(b.to - t), txt = `${b.boost || ""} ${b.name}`.toLowerCase();
      let tip = b.boost ? `${b.boost} · ` : "";
      if (b.name === "doubleDelivery") continue; // ya lo avisa "Hoy hay entrega doble"
      if (/crop|cultivo|plant|seed|semilla/.test(txt) && has("activity")) {
        const slow = cropPlan().rows.filter((r) => r.perDay != null).slice(0, 5).sort((a, b) => b.hours - a.hours)[0];
        if (slow) tip += `aprovecha para plantar ${slow.name}: es de lo que más rinde y lo que más tarda`;
      } else if (/tree|wood|madera|árbol/.test(txt)) tip += "buen momento para cortar árboles";
      else if (/stone|iron|gold|mine|piedra|hierro|oro/.test(txt)) tip += "buen momento para minar";
      add(1, "bolt", `${b.label} activo · quedan ${left}`, tip || "Boost temporal en marcha", null);
    }
  } catch { /* sin datos de boosts: el resto del plan sigue */ }
  const cal = calendarEvents().filter((d) => d.weather && d.name !== "unknown" && d.date >= todayUTC()).slice(0, 1);
  for (const d of cal) add(3, "calendar", `Evento de clima: ${d.name}`, `el ${d.date}`, null);
  return recs.sort((a, b) => a.prio - b.prio);
}

function wPlan() {
  const recs = recommendations();
  setSub("st-plan", `${recs.length} acciones`);
  if (!recs.length) return Empty("check", "Todo en orden", "No hay nada urgente ahora mismo.");
  return recs.map((r) => `<div class="rec p${r.prio}" ${r.go ? `data-go="${r.go}"` : r.key ? `data-open="${r.key}"` : ""}>
    <span class="rec-prio">${["", "YA", "HOY", "OJO"][r.prio]}</span>${sprite(r.icon, 16)}
    <div style="min-width:0"><div class="rec-t">${esc(r.title)}</div><div class="rec-d">${esc(r.detail)}</div></div>
    ${r.go || r.key ? `<span class="rec-go">→</span>` : ""}</div>`).join("");
}

const VISITS = [[1, "1 h"], [2, "2 h"], [4, "4 h"], [8, "8 h"], [12, "12 h"], [24, "24 h"]];
function wCropPlan() {
  const { rows, plots, season, avgRatio } = cropPlan();
  setSub("st-crops", `${plots} parcelas · estación ${({ spring: "primavera", summer: "verano", autumn: "otoño", winter: "invierno" })[season] || season || "—"} · tus boosts ≈ −${fmt((1 - avgRatio) * 100, 0)}% tiempo`);
  const max = Math.max(...rows.map((r) => r.perDay || 0), 1e-9);
  return `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th>Cultivo</th><th class="r" data-tip="Tiempo de crecimiento|Lo que tarda el cultivo en madurar, ya con tus boosts de velocidad|No depende de cuándo entres al juego" tabindex="0">Madura en</th>
    <th class="r" data-tip="Lo recoges cada|El crecimiento redondeado a tu próxima visita: si entras cada ${S.visitH} h, un cultivo que madura en 3 h lo recoges cada ${S.visitH} h|Es el que cuenta para el FLOWER/día" tabindex="0">Lo recoges cada${Legend("cycle")}</th>
    <th class="r" data-tip="Por cosecha|Unidades medias que sacas de cada parcela con todos tus boosts de cantidad (NFTs, skills, zonas de efecto)|fuente: sfl.world" tabindex="0">Por cosecha</th>
    <th class="r">Precio</th><th class="r" data-tip="FLOWER/día|Todas tus parcelas con este cultivo, cosechando al ritmo de «Lo recoges cada» y vendiendo a floor|" tabindex="0">FLOWER/día</th></tr></thead><tbody>
    ${rows.map((r, i) => `<tr data-open="collectibles-${G.itemIds[r.name]}"><td class="ic"><span class="rankno">${i + 1}</span></td>
      <td class="w"><div class="name">${Gi(r.name, 14, "carrot")}<span>${esc(r.name)}</span>${r.observed ? "" : `<span class="tag" title="Sin plantaciones actuales: se aplica tu boost medio">est.</span>`}</div></td>
      <td class="r dim">${dur(r.hours * 3600_000)}</td><td class="r ${r.cyc > r.hours * 1.05 ? "down" : ""}">${dur(r.cyc * 3600_000)}</td>
      <td class="r ${r.amt > 1 ? "up" : "dim"}">×${fmt(r.amt, 2)}</td><td class="r dim">${fmt(r.p)}</td><td class="r cellbar"><b>${r.perDay != null ? fmt(r.perDay, 2) : "—"}</b><i style="width:${(((r.perDay || 0) / max) * 70).toFixed(0)}%;left:auto;right:12px"></i></td></tr>`).join("")}
  </tbody></table></div>
  <div class="mod-f"><span>Todas tus parcelas con ese cultivo · ${has("myBoosts") ? "cantidad por cosecha con tus boosts (sfl.world)" : "1 por parcela: sin datos de tus boosts de cantidad"} · vendiendo a floor</span><span>ciclo rojo = esperas a tu próxima visita</span></div>`;
}

function wNodePlan() {
  const rows = nodePlan();
  const total = rows.reduce((s, r) => s + (r.perDay || 0), 0);
  setSub("st-nodes", `≈ ${fmt(total, 2)} FLOWER/día`);
  if (!rows.length) return Empty("tree", "Sin nodos", "");
  return `<div class="tbl-wrap"><table class="tbl"><thead><tr><th></th><th>Recurso</th><th class="r">Nodos</th><th class="r" data-tip="Recarga → lo recoges cada|Primero lo que tarda el nodo en recargarse con tus boosts; en rojo, cada cuánto lo recoges de verdad si entras cada ${S.visitH} h|" tabindex="0">Recarga → lo recoges cada${Legend("cycle")}</th><th class="r" data-tip="Por golpe|Unidades medias por nodo con todos tus boosts de cantidad (NFTs, skills, zonas de efecto)|fuente: sfl.world" tabindex="0">Por golpe</th><th class="r">FLOWER/día</th></tr></thead><tbody>
    ${rows.map((r) => `<tr data-open="collectibles-${G.itemIds[r.item]}"><td class="ic">${Gi(r.item, 16, CATS[r.cat].spr)}</td><td class="w">${esc(r.item)}</td>
      <td class="r">${r.n}</td><td class="r dim">${dur(r.hours * 3600_000)}${r.cyc > r.hours * 1.05 ? ` <span class="down">→ ${dur(r.cyc * 3600_000)}</span>` : ""}</td>
      <td class="r ${r.amt > 1 ? "up" : "dim"}">×${fmt(r.amt, 2)}</td><td class="r"><b>${r.perDay != null ? fmt(r.perDay, 2) : "—"}</b></td></tr>`).join("")}
  </tbody></table></div><div class="mod-f"><span>${has("myBoosts") ? "Cantidad por golpe con tus boosts (sfl.world)" : "1 unidad por golpe: sin datos de tus boosts"} · con tu ritmo de visitas</span><span>total ${fmt(total, 2)} FLOWER/día</span></div>`;
}

// Apartado "Tus boosts": qué tienes activo y qué usa la estrategia en sus cálculos
function wBoosts() {
  const b = boostInventory(), br = boostRatios(), t = now();
  setSub("st-boosts", `${b.temps.length} temporal${b.temps.length === 1 ? "" : "es"} · ${b.placed.length + b.worn.length} NFTs · ${b.skills.length} skills${b.activeRecently ? ` · ${b.activeRecently} aplicados en 24 h` : ""}`);
  const fresh = (u) => u && t - u < 86400_000;
  const row = (x) => `<div class="bst-row${fresh(x.usedAt) ? " on" : ""}"><span class="nm">${Gi(x.name, 14)} ${esc(x.name)}${x.who ? ` <span class="faint">· ${esc(x.who.join(", "))}</span>` : ""}</span><span class="bst">${esc(x.boost)}</span>${fresh(x.usedAt) ? `<span class="tag green" data-tip="${esc(`Aplicado hace ${dur(t - x.usedAt)}|El juego lo usó en una acción tuya: está funcionando|boostsUsedAt de tu granja`)}">en uso</span>` : ""}</div>`;
  const list = (xs, n = 6) => xs.slice(0, n).map(row).join("") + (xs.length > n ? `<details class="bst-more"><summary>ver ${xs.length - n} más</summary>${xs.slice(n).map(row).join("")}</details>` : "");
  const pctTime = (r) => (r < 0.995 ? `−${fmt((1 - r) * 100, 0)}% tiempo` : "sin boost");
  const nodes = [["Árboles", br.node.trees], ["Piedra", br.node.stones], ["Hierro", br.node.iron], ["Oro", br.node.gold], ["Crimstone", br.node.crimstones], ["Oil", br.node.oil]].filter(([, r]) => r < 0.995);
  const my = store.myBoosts?.data;
  const ylds = my ? [["Madera", my.resources?.wood], ["Piedra", my.resources?.stone], ["Hierro", my.resources?.iron], ["Oro", my.resources?.gold]].filter(([, v]) => v?.avg > 1) : [];
  return `<div class="bst-grid">
    <div><h4 class="acc-h">Activos ahora</h4>${b.temps.length ? b.temps.map((x) => `<div class="bst-row temp"><span class="nm">${sprite(x.kind === "clima" || x.kind === "evento" ? "calendar" : "bolt", 12)} ${esc(x.label)}</span>
        ${x.boost ? `<span class="bst">${esc(x.boost)}</span>` : ""}<span class="cd" data-until="${x.to}">${dur(x.to - t)}</span></div>`).join("")
      : `<p class="ctx">Ningún boost temporal activo (tótems, shrines, clima o eventos).</p>`}
      <h4 class="acc-h">Ropa puesta <span class="faint">(tú y tus ayudantes)</span></h4>${b.worn.length ? list(b.worn, 6) : `<p class="ctx">Nada de lo que lleváis da boost.</p>`}</div>
    <div><h4 class="acc-h">NFTs colocados</h4>${b.placed.length ? list(b.placed, 7) : `<p class="ctx">${has("worldNfts") ? "Ninguno de tus NFTs colocados da boost." : "Cargando boosts de sfl.world…"}</p>`}
      <h4 class="acc-h">Skills</h4>${b.skills.length ? list(b.skills, 4) : `<p class="ctx">Sin skills.</p>`}</div>
    <div><h4 class="acc-h">Lo que usa la estrategia</h4>
      <dl class="kv">
        <dt>Cultivos</dt><dd>${pctTime(br.avgCrop)}${br.excluded ? ` <span class="faint" data-tip="${esc(`Medida sin boosts temporales|${br.excluded} parcela${br.excluded === 1 ? "" : "s"} se plantaron con un boost temporal activo y no cuentan: así «Qué plantar» usa tu velocidad de siempre|`)}">(${br.excluded} sin contar)</span>` : ""}</dd>
        ${nodes.map(([n, r]) => { const why = n === "Árboles" ? br.treeBoosts : n === "Oil" ? br.oilBoosts : null; return `<dt>${n}</dt><dd${why?.length ? ` data-tip="${esc(`${n}|${why.join(" · ")}|calculado con las reglas del juego (no queda registrado en la granja)`)}"` : ""}>${pctTime(r)}</dd>`; }).join("")}
        ${ylds.map(([n, v]) => `<dt>${n} por golpe</dt><dd class="up">×${fmt(v.avg, 2)}</dd>`).join("")}
      </dl>
      <p class="ctx">Velocidad medida en tus parcelas y nodos; cantidades de sfl.world. Los temporales no se suman a los cálculos de siempre: se avisan en el plan de acción mientras duran.</p></div>
  </div>`;
}

/* ── Estrategias por objetivo (ventanas de Estrategia) ─────────────────── */
const ST = ["farm", "activity"];
const STRAT_TABS = {
  flower: {
    label: "Ganar FLOWER", icon: "coin", hint: "Producción, recetas con beneficio y lo que te sobra para vender",
    html: () => `<div class="plate">${Mod({ id: "st-flow-k", span: 12, flush: true })}</div>
      <div class="plate">
        ${Mod({ id: "st-crops", span: 7, title: "Qué plantar", icon: "carrot", flush: true, act: `<span class="ctx">Entro cada</span>${Seg(VISITS, S.visitH, "visit")}` })}
        ${Mod({ id: "st-nodes", span: 5, title: "Rendimiento de tus nodos", icon: "tree", flush: true })}
      </div>
      <div class="plate">
        ${Mod({ id: "st-craft", span: 6, title: "Transformar con beneficio", icon: "hammer", flush: true })}
        ${Mod({ id: "st-surplus", span: 6, title: "Lo que te sobra para vender", icon: "coin", flush: true })}
      </div>
      <div class="plate">${Mod({ id: "st-season", span: 12, title: "Temporada de precios", icon: "coin" })}</div>
      <div class="plate">${Mod({ id: "st-boosts", span: 12, title: "Tus boosts", icon: "bolt" })}</div>`,
    mount() {
      mount("st-flow-k", { deps: ST, soft: ["myBoosts", "fx"], render: wFlowKpis, loading: "block" });
      mount("st-crops", { deps: ST, soft: ["myBoosts"], render: wCropPlan, loading: "rows" });
      mount("st-nodes", { deps: ST, soft: ["myBoosts"], render: wNodePlan, loading: "rows" });
      mount("st-craft", { deps: ST, render: wCraft, loading: "rows" });
      mount("st-surplus", { deps: ST, soft: ["myBoosts"], render: wSurplus, loading: "rows" });
      mount("st-season", { deps: ST, soft: ["resourceHist"], render: wSeason, loading: "rows" });
      mount("st-boosts", { deps: ["farm"], soft: ["worldNfts", "myBoosts"], render: wBoosts, loading: "rows" });
    },
  },
  tickets: {
    label: "Tickets del capítulo", icon: "ticket", hint: "Ritmo, proyección al final del capítulo y qué entregar primero",
    html: () => `<div class="plate">${Mod({ id: "st-tk-k", span: 12, flush: true })}</div>
      <div class="plate">
        ${Mod({ id: "st-tk-today", span: 7, title: "Entregas de hoy, de más barata a más cara", icon: "scroll", flush: true })}
        ${Mod({ id: "st-tk-boost", span: 5, title: "Multiplica tus tickets", icon: "bolt" })}
      </div>`,
    mount() {
      mount("st-tk-k", { deps: ST, soft: ["tickets"], render: wTicketKpis, loading: "block" });
      mount("st-tk-today", { deps: ST, render: wTicketToday, loading: "rows" });
      mount("st-tk-boost", { deps: ST, soft: ["tickets"], render: wTicketBoosts, loading: "rows" });
    },
  },
  expansion: {
    label: "Expansión", icon: "sprout", hint: "Qué te falta para la siguiente parcela y para cambiar de isla",
    html: () => `<div class="plate">
        ${Mod({ id: "st-exp-next", span: 7, title: "Siguiente expansión", icon: "sprout", flush: true })}
        ${Mod({ id: "st-exp-island", span: 5, title: "Hacia la siguiente isla", icon: "tree" })}
      </div>`,
    mount() {
      mount("st-exp-next", { deps: ST, soft: ["myBoosts", "fx"], render: wExpNext, loading: "rows" });
      mount("st-exp-island", { deps: ST, soft: ["myBoosts", "fx"], render: wExpIsland, loading: "rows" });
    },
  },
  level: {
    label: "Nivel", icon: "star", hint: "Las comidas que más XP dan por FLOWER y la que ya tienes guardada",
    html: () => `<div class="plate">${Mod({ id: "st-lv-k", span: 12, flush: true })}</div>
      <div class="plate">
        ${Mod({ id: "st-lv-foods", span: 8, title: "Mejores comidas para subir", icon: "cook", flush: true })}
        ${Mod({ id: "st-lv-stored", span: 4, title: "XP guardada en comida", icon: "chest" })}
      </div>`,
    mount() {
      mount("st-lv-k", { deps: ST, render: wLevelKpis, loading: "block" });
      mount("st-lv-foods", { deps: ST, render: wLevelFoods, loading: "rows" });
      mount("st-lv-stored", { deps: ["farm"], render: wLevelStored, loading: "rows" });
    },
  },
  flowers: {
    label: "Flores", icon: "flower", hint: "Qué flor plantar según tus tareas, bounties y pedidos, y con qué cruce",
    html: () => `<div class="plate">${Mod({ id: "st-fl-k", span: 12, flush: true })}</div>
      <div class="plate">
        ${Mod({ id: "st-fl-demand", span: 8, title: "Flores que te piden", icon: "scroll", flush: true })}
        ${Mod({ id: "st-fl-beds", span: 4, title: "Tus macizos", icon: "flower" })}
      </div>`,
    mount() {
      mount("st-fl-k", { deps: ST, soft: ["flowerRecipes"], render: wFlowerKpis, loading: "block" });
      mount("st-fl-demand", { deps: ST, soft: ["flowerRecipes"], render: wFlowerDemand, loading: "rows" });
      mount("st-fl-beds", { deps: ST, soft: ["flowerRecipes"], render: wFlowerBeds, loading: "rows" });
    },
  },
  daily: {
    label: "Rutina diaria", icon: "check", hint: "Lo que se reinicia cada día y si ya lo has hecho",
    html: () => `<div class="plate">${Mod({ id: "st-daily", span: 12, title: "Rutina de hoy", icon: "check", flush: true })}</div>`,
    mount() { mount("st-daily", { deps: ST, render: wDaily, loading: "rows" }); },
  },
};
const DAY_MS = 86400_000;
const sameUtcDay = (ts) => ts && new Date(toNum(ts)).toISOString().slice(0, 10) === todayUTC();
// Unidades al día que produces de cada recurso con tus nodos y tu ritmo de visitas
function productionPerDay() {
  const out = {};
  for (const r of nodePlan()) out[r.item] = (r.n * r.amt * 24) / r.cyc;
  return out;
}
const unitPrice = (name) => (name === "Gem" ? flowerPerGem() : priceBook()(name).v);

// FLOWER: transformar (recetas cuyo producto vale más en el mercado que sus ingredientes)
function craftModel() {
  const price = priceBook(), net = S.p2pTax ? 0.9 : 1;
  const rows = [];
  for (const [name, r] of Object.entries(G.recipes)) {
    const out = price(name);
    if (out.src !== "mercado") continue;
    let cost = r.coins / coinRate(), ok = true, canMake = Infinity;
    for (const [k, q] of Object.entries(r.items)) {
      const p = price(k);
      if (p.v == null) { ok = false; break; }
      cost += p.v * q;
      canMake = Math.min(canMake, Math.floor(haveOf(k) / q));
    }
    if (!ok || !(cost > 0)) continue;
    const secs = G.foods[name]?.seconds || 0;
    const profit = out.v * net - cost;
    rows.push({ name, sell: out.v, cost, profit, margin: (profit / cost) * 100, perH: secs ? profit / (secs / 3600) : null, secs, canMake: Number.isFinite(canMake) ? canMake : 0, building: G.foods[name]?.building });
  }
  return rows.filter((r) => r.profit > 0).sort((a, b) => b.profit - a.profit);
}
// Claves de mercado de los recursos vendibles (crops, madera, minerales…) para su historial de precio
const resourceKeys = () => [...(G.tradeResources || [])].filter((n) => !/Emblem$/.test(n) && G.itemIds[n] != null).map((n) => `collectibles-${G.itemIds[n]}`);

// Temporada: ¿el precio de hoy es alto o bajo frente a su propio historial? Para decidir cuándo vender lo
// que sobra (arriba) y cuándo esperar/comprar barato, no solo mirar el floor de hoy como hace surplusModel.
function seasonModel() {
  if (!has("resourceHist") || !has("farm")) return [];
  const series = store.resourceHist.data.series || {};
  const price = priceBook(), byId = {};
  for (const [name, id] of Object.entries(G.itemIds || {})) byId[`collectibles-${id}`] = name;
  const spareByName = Object.fromEntries(surplusModel().map((r) => [r.name, r]));
  const rows = [];
  for (const key of resourceKeys()) {
    const name = byId[key];
    const pts = (series[key] || []).map((p) => p.floor).filter((v) => v > 0);
    if (!name || pts.length < 10) continue;
    const cur = price(name).v;
    if (cur == null) continue;
    const sorted = [...pts].sort((a, b) => a - b);
    const below = sorted.filter((v) => v <= cur).length;
    const percentile = (below / sorted.length) * 100;
    const avg = pts.reduce((a, b) => a + b, 0) / pts.length;
    const vsAvg = avg ? (cur / avg - 1) * 100 : 0;
    const recent = pts.slice(-7);
    const recentAvg = recent.length ? recent.reduce((a, b) => a + b, 0) / recent.length : avg;
    const olderAvg = pts.length > 7 ? pts.slice(0, -7).reduce((a, b) => a + b, 0) / pts.slice(0, -7).length : avg;
    const trend = olderAvg ? (recentAvg / olderAvg - 1) * 100 : 0;
    const spare = spareByName[name]?.spare || 0;
    const signal = percentile >= 80 ? "sell" : percentile <= 20 ? "buy" : "normal";
    rows.push({ name, cur, avg, percentile, vsAvg, trend, spare, signal, days: pts.length });
  }
  return rows;
}
// FLOWER: lo que te sobra (recursos que no necesitas para la siguiente expansión ni para tus pedidos)
function surplusModel() {
  const farm = store.farm.data.farm, items = store.activity.data.items;
  const reserve = {};
  const add = (o) => { for (const [k, v] of Object.entries(o || {})) reserve[k] = (reserve[k] || 0) + toNum(v); };
  add(expansionModel().next?.req?.resources);
  for (const o of missionModel().open) add(o.items);
  // Los emblemas cuentan para tu facción: no se proponen para vender
  const res = new Set((G.tradeResources || []).filter((n) => !/Emblem$/.test(n)));
  return Object.entries(farm.inventory || {}).filter(([n]) => res.has(n)).map(([name, q]) => {
    const it = items[`collectibles-${G.itemIds[name]}`];
    const qty = toNum(q), keep = reserve[name] || 0, spare = Math.max(0, Math.floor(qty - keep));
    const floor = it?.floor ?? it?.latestSale, offer = it?.bestOffer;
    return { name, qty, keep, spare, floor, offer, value: spare * (floor || 0) * (S.p2pTax ? 0.9 : 1), instant: spare * (offer || 0) };
  }).filter((r) => r.spare > 0 && r.value > 0.01).sort((a, b) => b.value - a.value);
}

// Tickets del capítulo: ritmo, proyección al final y boosts del capítulo
function ticketPlan() {
  const ch = currentChapter(), c = ch && G.chapters[ch];
  if (!c) return null;
  const t = now(), farm = store.farm.data.farm;
  const m = missionModel();
  const info = has("tickets") ? ticketInfo() : null;
  const current = info?.mine?.count ?? null;
  const daysLeft = Math.max(0, (c.end - t) / DAY_MS), daysGone = Math.max(1, (t - c.start) / DAY_MS);
  const pace = current != null ? current / daysGone : null;
  const perDelivery = (G.ticketRewards ? Object.values(G.ticketRewards) : []);
  const avgBase = perDelivery.length ? perDelivery.reduce((a, b) => a + b, 0) / perDelivery.length : 0;
  const extra = (m.vip ? 2 : 0) + m.boost;
  const todayPotential = m.ticketOrders.reduce((s, o) => s + o.tickets, 0);
  const doubles = calendarEvents().filter((d) => d.name === "doubleDelivery" && Date.parse(d.date + "T00:00:00Z") < c.end);
  // Boosts del capítulo: +1 ticket por entrega cada uno, si lo llevas puesto (tú o tus ayudantes) o colocado
  const equipped = [...wornSet(farm)];
  const deliveriesPerDay = Math.max(1, m.ticketOrders.length || Object.keys(G.ticketRewards || {}).length / 2);
  const boosts = (G.chapterBoosts[ch] || []).map((item) => {
    const active = equipped.includes(item) || isPlaced(farm, item);
    const owned = active || toNum(farm.wardrobe?.[item]) > 0 || toNum(farm.inventory?.[item]) > 0;
    const price = priceBook()(item).v;
    const gain = deliveriesPerDay * daysLeft; // tickets extra hasta el final del capítulo
    return { item, active, owned, price, gain, perTicket: price && gain ? price / gain : null };
  });
  return { ch, ticket: G.chapterTickets?.[ch] || "tickets", c, current, info, daysLeft, daysGone, pace, avgBase, extra, todayPotential, doubles, boosts, m,
    projPace: current != null ? current + pace * daysLeft : null,
    projMax: current != null ? current + (todayPotential || (avgBase + extra) * deliveriesPerDay) * daysLeft + doubles.length * (avgBase + extra) * deliveriesPerDay : null };
}

// Expansión: siguiente parcela y camino a la siguiente isla
function expansionModel() {
  const farm = store.farm.data.farm;
  const island = farm.island?.type || "basic";
  const count = toNum(farm.inventory?.["Basic Land"]);
  const table = G.expansions?.[island] || {};
  const perDay = has("activity") ? productionPerDay() : {};
  const rowsFor = (resources) => Object.entries(resources || {}).map(([name, need]) => {
    const have = haveOf(name), miss = Math.max(0, need - have), unit = unitPrice(name), day = perDay[name] || null;
    return { name, need, have, miss, unit, buy: unit != null ? miss * unit : null, perDay: day, days: miss ? (day ? miss / day : null) : 0 };
  });
  const first = Math.min(...Object.keys(table).map(Number).filter(Number.isFinite), Infinity);
  const nextN = Math.max(count + 1, Number.isFinite(first) ? first : 0);
  // Boosts de expansión (expandLand.ts / vipAccess.ts): Grinx's Hammer = mitad de recursos (menos gemas);
  // VIP = 500 coins o 20% menos (lo mayor) y, en Ascension Age, 10% menos de tiempo; Ascension Monument −20%
  const placed = new Set(placedCollectibles(farm)), vip = isVip();
  const grinx = placed.has("Grinx's Hammer"), monument = placed.has("Ascension Monument"), vipTime = vip && currentChapter() === "Ascension Age";
  const expBoosts = [grinx && "Grinx's Hammer: mitad de recursos", vip && "VIP: −500 coins o −20%", vipTime && "VIP en Ascension Age: −10% de tiempo", monument && "Ascension Monument: −20% de tiempo (con sus cheers completos)"].filter(Boolean);
  const boosted = (r) => r && {
    ...r,
    resources: Object.fromEntries(Object.entries(r.resources).map(([k, v]) => [k, grinx && k !== "Gem" ? v / 2 : v])),
    coins: vip ? Math.max(0, r.coins - Math.max(500, Math.floor(r.coins * 0.2))) : r.coins,
    seconds: r.seconds * (monument ? 0.8 : 1) * (vipTime ? 0.9 : 1),
  };
  const req = boosted(table[nextN]);
  const next = req ? { n: nextN, req, rows: rowsFor(req.resources), coinsMiss: Math.max(0, req.coins - toNum(farm.coins)), levelOk: bumpkinLevel(toNum(farm.bumpkin?.experience)).lvl >= req.level } : null;
  const up = G.islandUpgrade?.[island];
  let toIsland = null;
  if (up) {
    const total = {};
    let coins = 0, secs = 0;
    for (let n = nextN; n <= up.expansions; n++) {
      const r = boosted(table[n]);
      if (!r) continue;
      for (const [k, v] of Object.entries(r.resources)) total[k] = (total[k] || 0) + v;
      coins += r.coins; secs += r.seconds;
    }
    for (const [k, v] of Object.entries(up.items || {})) total[k] = (total[k] || 0) + v;
    toIsland = { to: up.to, need: up.expansions, left: Math.max(0, up.expansions - count), rows: rowsFor(total), coins, secs };
  }
  return { island, count, next, toIsland, maxed: !req, expBoosts };
}

// XP real de una comida con tus boosts, replicando getFoodExpBoost del juego (expansion/lib/boosts.ts):
// ropa puesta, coleccionables colocados (también dentro de casa), VIP y skills con su rango.
// Rangos de las skills sacados de SKILL_RANKS (bumpkinSkills.ts).
const XP_SKILL_RANKS = { "Munching Mastery": [0.05, 0.075, 0.1], "Juicy Boost": [0.1, 0.2, 0.3], "Drive-Through Deli": [0.15, 0.2, 0.25], "Buzzworthy Treats": [0.1, 0.2, 0.3] };
function xpBoostContext() {
  const farm = store.farm.data.farm;
  const placed = new Set(placedCollectibles(farm));
  const worn = wornSet(farm);
  const skills = farm.bumpkin?.skills || {};
  const rank = (n) => Math.min(3, Math.max(0, toNum(skills[n])));
  return { placed, worn, rank, vip: isVip() };
}
function foodXp(name, f, ctx) {
  let xp = f.xp;
  const used = [];
  const mul = (cond, m, label) => { if (cond) { xp *= m; used.push(`${label} ×${fmt(m, 3)}`); } };
  mul(ctx.worn.has("Golden Spatula"), 1.1, "Golden Spatula");
  mul(ctx.placed.has("Blossombeard"), 1.1, "Blossombeard");
  mul(ctx.worn.has("Pan"), 1.25, "Pan");
  mul(ctx.placed.has("Observatory"), 1.05, "Observatory");
  mul(/Cake$/.test(name) && f.building === "Bakery" && ctx.placed.has("Grain Grinder"), 1.2, "Grain Grinder");
  mul(ctx.vip, 1.1, "VIP");
  mul(name === "Fermented Carrots" && ctx.placed.has("Hungry Hare"), 2, "Hungry Hare");
  const sk = (skill, cond = true) => { const r = ctx.rank(skill); mul(cond && r > 0, 1 + XP_SKILL_RANKS[skill][r - 1], `${skill} ${"I".repeat(r)}`); };
  sk("Munching Mastery");
  sk("Juicy Boost", f.building === "Smoothie Shack");
  sk("Drive-Through Deli", f.building === "Deli");
  sk("Buzzworthy Treats", "Honey" in (f.items || {}));
  if ("Cheese" in (f.items || {}) && ctx.placed.has("Swiss Whiskers")) { xp += 500; used.push("Swiss Whiskers +500"); }
  return { xp, mult: xp / f.xp, used };
}

// Nivel: comidas por XP/FLOWER y XP/hora, lo que puedes cocinar ya y la XP guardada (todo con tus boosts de XP)
function levelPlan() {
  const farm = store.farm.data.farm, price = priceBook();
  const xp = toNum(farm.bumpkin?.experience), lv = bumpkinLevel(xp);
  const ctx = xpBoostContext();
  const foods = Object.entries(G.foods || {}).map(([name, base]) => {
    const bx = foodXp(name, base, ctx);
    const f = { ...base, baseXp: base.xp, xp: bx.xp, mult: bx.mult, boosts: bx.used };
    let cost = 0, ok = true, canCook = Infinity;
    for (const [k, q] of Object.entries(f.items)) {
      const p = price(k);
      if (p.v == null) ok = false; else cost += p.v * q;
      canCook = Math.min(canCook, Math.floor(haveOf(k) / q));
    }
    const hasBuilding = !f.building || (farm.buildings?.[f.building] || []).length > 0;
    return { name, ...f, cost: ok ? cost : null, xpPerFlower: ok && cost > 0 ? f.xp / cost : null, xpPerH: f.seconds ? f.xp / (f.seconds / 3600) : null, canCook: Number.isFinite(canCook) ? canCook : 0, hasBuilding, stored: toNum(farm.inventory?.[name]) };
  });
  const stored = foods.filter((f) => f.stored > 0).map((f) => ({ ...f, total: f.stored * f.xp })).sort((a, b) => b.total - a.total);
  const storedXp = stored.reduce((s, f) => s + f.total, 0);
  const cookNowXp = foods.filter((f) => f.hasBuilding).reduce((s, f) => s + f.canCook * f.xp, 0);
  const best = foods.filter((f) => f.xpPerFlower && f.hasBuilding).sort((a, b) => b.xpPerFlower - a.xpPerFlower);
  // Boosts que valen para cualquier comida (los específicos de Deli, zumos, miel… van por comida)
  const general = foodXp("", { xp: 1, items: {}, building: null }, ctx);
  return { xp, lv, need: lv.toNext, foods, stored, storedXp, cookNowXp, best, general, flowerToNext: best[0] ? Math.max(0, lv.toNext - storedXp) / best[0].xpPerFlower : null };
}

// Rutina diaria: lo que el juego deja hacer una vez al día (o cada poco) y si ya lo hiciste
function dailyPlan() {
  const farm = store.farm.data.farm, t = now(), m = missionModel();
  const rows = [];
  const add = (icon, label, done, detail, go) => rows.push({ icon, label, done, detail, go });
  add("chest", "Cofre diario", sameUtcDay(farm.dailyRewards?.chest?.collectedAt), `racha de ${toNum(farm.dailyRewards?.streaks)} días`);
  const ticketNpcs = Object.keys(G.ticketRewards || {});
  const doneNpcs = ticketNpcs.filter((n) => sameUtcDay(farm.npcs?.[n]?.deliveryCompletedAt));
  add("ticket", "Entregas de tickets", m.ticketOrders.length === 0, `${doneNpcs.length} hechas hoy · ${m.ticketOrders.length} pendientes${m.double ? " · ¡hoy cuentan doble!" : ""}`, "missions:orders");
  const board = m.board;
  add("check", "Tareas del tablón", board.length > 0 && board.every((c) => c.done), `${board.filter((c) => c.done).length}/${board.length} completadas`, "missions:chores");
  add("coin", "Bounties", m.bounties.length === 0, m.bounties.length ? `${m.bounties.length} disponibles` : "ninguno pendiente", "missions:bounties");
  if (farm.desert?.digging) {
    const dg = digModel();
    add("crab", "Excavación del desierto", dg.left === 0, dg.dugToday ? `${dg.dugToday} hoyos hoy · te quedan ${dg.left}` : "aún no has excavado hoy", "dig");
  }
  const fish = toNum(farm.fishing?.dailyAttempts?.[todayUTC()]);
  add("fish", "Pesca", fish > 0, fish ? `${fish} lanzamientos hoy` : "aún no has pescado hoy");
  const pets = [...Object.values(farm.pets?.common || {}), ...Object.values(farm.pets?.nfts || {})];
  const hungry = pets.filter((p) => (p.requests?.food || []).length > (p.requests?.foodFed || []).length);
  if (pets.length) add("paw", "Comida de las mascotas", hungry.length === 0, hungry.length ? `${hungry.length} de ${pets.length} con pedidos sin dar: ${hungry.map((p) => p.name).join(", ")}` : "todas alimentadas");
  const ready = readyCount();
  add("bell", "Recoger lo que está listo", ready === 0, ready ? `${ready} cosas listas` : "nada pendiente", "farm");
  if (farm.pumpkinPlaza?.pirateChest) add("chest", "Cofre pirata", sameUtcDay(farm.pumpkinPlaza.pirateChest.openedAt), "en la plaza (con el disfraz pirata)");
  const fl = (farm.floatingIsland?.schedule || []).find((s) => s.endAt > t);
  if (fl) add("sun", "Isla flotante", false, fl.startAt <= t ? `abierta ahora · cierra ${at(fl.endAt)}` : `abre ${at(fl.startAt)}`);
  return rows;
}

// ── Widgets de las ventanas ──
function wFlowKpis() {
  const crops = cropPlan(), nodes = nodePlan(), craft = craftModel(), spare = surplusModel();
  const bestCrop = crops.rows.find((r) => r.perDay != null);
  const nodesDay = nodes.reduce((s, r) => s + (r.perDay || 0), 0);
  return `<div class="kstrip">
    ${Kcell("Producción al día", `${fmt((bestCrop?.perDay || 0) + nodesDay, 1)}<small>FLW</small>`, `${bestCrop ? `${bestCrop.name} en tus ${crops.plots} parcelas` : "cultivos"} + nodos ${fmt(nodesDay, 1)}`, "sun")}
    ${Kcell("Transformar", craft[0] ? `+${fmt(craft[0].profit, 2)}` : "—", craft[0] ? `${craft[0].name} · mejor receta por unidad` : "ninguna receta da beneficio hoy")}
    ${Kcell("Te sobra para vender", `${fmt(spare.reduce((s, r) => s + r.value, 0), 1)}<small>FLW</small>`, `al floor · ${fmt(spare.reduce((s, r) => s + r.instant, 0), 1)} vendiendo ya a la mejor oferta`)}
    ${Kcell("Saldo", `${fmt(toNum(store.farm.data.farm.balance), 2)}<small>FLW</small>`, money(toNum(store.farm.data.farm.balance), 2))}
  </div>`;
}
function wCraft() {
  const rows = craftModel().slice(0, 12);
  setSub("st-craft", `${rows.length} recetas con beneficio`);
  if (!rows.length) return Empty("hammer", "Nada rentable hoy", "Ninguna receta vale más en el mercado que sus ingredientes.");
  return `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Receta</th><th class="r">Coste</th><th class="r">Vende a</th><th class="r">Beneficio${Legend("profit")}</th><th class="r">/hora</th><th class="r">Puedes ya</th></tr></thead><tbody>
    ${rows.map((r) => `<tr data-open="collectibles-${G.itemIds[r.name]}"><td class="w">${Gi(r.name, 14)} ${esc(r.name)}${r.building ? `<div class="ctx">${esc(r.building)}</div>` : ""}</td><td class="r dim">${fmt(r.cost, 3)}</td><td class="r">${fmt(r.sell, 3)}</td>
      <td class="r up"><b>+${fmt(r.profit, 3)}</b><div class="ctx">${pct(r.margin, 0)}</div></td><td class="r dim">${r.perH != null ? fmt(r.perH, 2) : "al momento"}</td><td class="r ${r.canMake ? "up" : "dim"}">${r.canMake ? `×${fmt(r.canMake, 0)}` : "—"}</td></tr>`).join("")}
  </tbody></table></div><div class="mod-f"><span>Ingredientes a precio de mercado (o de su receta) · vendiendo a floor${S.p2pTax ? " −10%" : ""}</span><span>«Puedes ya» = con tu inventario</span></div>`;
}
function wSurplus() {
  const rows = surplusModel().slice(0, 12);
  setSub("st-surplus", "lo que no necesitas para tu siguiente expansión ni tus pedidos");
  if (!rows.length) return Empty("coin", "Nada que te sobre", "Todo lo que tienes lo necesitas para la expansión o tus pedidos.");
  return `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Recurso</th><th class="r">Tienes</th><th class="r">Guardas</th><th class="r">Te sobra</th><th class="r">Vale</th><th class="r">Ya (oferta)</th></tr></thead><tbody>
    ${rows.map((r) => `<tr data-open="collectibles-${G.itemIds[r.name]}"><td class="w">${Gi(r.name, 14)} ${esc(r.name)}</td><td class="r dim">${compact(r.qty)}</td><td class="r dim">${r.keep ? compact(r.keep) : "—"}</td><td class="r"><b>${compact(r.spare)}</b></td>
      <td class="r up">${fmt(r.value, 2)}</td><td class="r dim">${r.instant ? fmt(r.instant, 2) : "—"}</td></tr>`).join("")}
  </tbody></table></div><div class="mod-f"><span>Guardas = lo que pide tu siguiente expansión + tus pedidos abiertos · los emblemas de facción no se cuentan</span><span>Vale = floor${S.p2pTax ? " −10%" : ""}</span></div>`;
}
// Temporada: precio de hoy frente a su historial, para vender lo que sobra caro y no malvender lo barato
function wSeason() {
  const all = seasonModel();
  setSub("st-season", `${all.length} recursos con historial suficiente`);
  if (!all.length) return Empty("coin", "Historial insuficiente", "Hacen falta al menos 10 días de precio guardado por recurso; se guarda solo con el dashboard abierto.");
  const sell = all.filter((r) => r.signal === "sell").sort((a, b) => (b.spare > 0) - (a.spare > 0) || b.percentile - a.percentile);
  const buy = all.filter((r) => r.signal === "buy").sort((a, b) => a.percentile - b.percentile);
  const row = (r, tag) => `<tr data-open="collectibles-${G.itemIds[r.name]}"><td class="w">${Gi(r.name, 14)} ${esc(r.name)}</td>
    <td class="r">${fmt(r.cur, 3)}</td><td class="r dim">${fmt(r.avg, 3)}</td><td class="r ${r.vsAvg >= 0 ? "up" : "down"}">${r.vsAvg >= 0 ? "+" : ""}${fmt(r.vsAvg, 0)}%</td>
    <td class="r dim">p${fmt(r.percentile, 0)}</td><td class="r">${r.spare > 0 ? `<b>${compact(r.spare)}</b>` : "—"}</td><td>${tag}</td></tr>`;
  const table = (rows, tag) => rows.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Recurso</th><th class="r">Hoy</th><th class="r">Media</th><th class="r">vs media</th><th class="r">Percentil</th><th class="r">Te sobra</th><th></th></tr></thead><tbody>
    ${rows.slice(0, 8).map((r) => row(r, tag)).join("")}</tbody></table></div>` : `<p class="ctx">Ninguno ahora mismo.</p>`;
  return `<h4 class="acc-h">Vende ya <span class="faint">(precio inflado frente a su historial)</span></h4>${table(sell, `<span class="tag green">vender</span>`)}
    <h4 class="acc-h">Espera o compra <span class="faint">(precio bajo: no es buen momento para vender)</span></h4>${table(buy, `<span class="tag sun">esperar</span>`)}
    <div class="mod-f"><span>Percentil = qué parte de los días guardados tuvo un precio igual o menor que hoy · p80+ = caro, p20− = barato</span><span>Solo recursos con ≥10 días de historial guardado por este dashboard</span></div>`;
}

function wTicketKpis() {
  const p = ticketPlan();
  if (!p) return Empty("ticket", "Sin capítulo activo", "");
  return `<div class="kstrip">
    ${Kcell(`${esc(p.ticket)} conseguidos`, p.current != null ? fmt(p.current, 0) : "…", p.info?.mine ? `puesto #${fmt(p.info.mine.rank, 0)} en el ranking` : "cargando ranking…", "sun")}
    ${Kcell("Tu ritmo", p.pace != null ? `${fmt(p.pace, 1)}<small>/día</small>` : "—", `${fmt(p.daysGone, 0)} días de capítulo`)}
    ${Kcell("Quedan", `${fmt(p.daysLeft, 1)}<small>días</small>`, `${esc(p.ch)} termina ${dateShort(p.c.end)}`)}
    ${Kcell("Si sigues así", p.projPace != null ? fmt(p.projPace, 0) : "—", "al final del capítulo")}
    ${Kcell("Máximo posible", p.projMax != null ? fmt(p.projMax, 0) : "—", `haciendo todas las entregas cada día${p.doubles.length ? ` y ${p.doubles.length} días dobles` : ""}`, "up")}
  </div>`;
}
function wTicketToday() {
  const p = ticketPlan();
  if (!p) return "";
  const cost = (o) => (o.unknown.length ? 1e8 : o.perTicket ?? 1e9); // sin precio al final
  const orders = [...p.m.ticketOrders].sort((a, b) => cost(a) - cost(b));
  setSub("st-tk-today", `${fmt(p.todayPotential, 0)} tickets disponibles hoy${p.m.double ? " (×2 hoy)" : ""}`);
  if (!orders.length) return Empty("check", "Entregas hechas", "No te quedan entregas de tickets hoy.");
  return `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>NPC</th><th>Pide</th><th class="r">Tickets</th><th class="r">Coste/ticket${Legend("perTicket")}</th><th>Estado</th></tr></thead><tbody>
    ${orders.map((o) => `<tr data-go="missions:orders"><td class="w">${esc(NPC_ES(o.from))}</td><td class="dim">${esc(Object.entries(o.items || {}).map(([k, v]) => `${fmt(v)} ${k}`).join(", "))}</td>
      <td class="r"><b>${o.tickets}</b></td><td class="r">${o.unknown.length ? `<span class="faint" data-tip="${esc(`Sin precio|${o.unknown.join(", ")} no se vende en el mercado: no se puede calcular el coste|`)}">?</span>` : o.perTicket != null ? fmt(o.perTicket, 3) : "—"}</td>
      <td>${o.ready ? `<span class="tag green">listo</span>` : o.unknown.some((n) => haveOf(n) < (o.items[n] || 0)) ? `<span class="tag">te falta ${esc(o.unknown.filter((n) => haveOf(n) < (o.items[n] || 0)).join(", "))}</span>` : `<span class="tag">falta ${fmt(o.missingCost, 2)} FLW</span>`}</td></tr>`).join("")}
  </tbody></table></div><div class="mod-f"><span>Ordenado de más barato a más caro por ticket: empieza por arriba</span><span>${p.extra ? `+${p.extra} por entrega (VIP y boosts)` : ""}</span></div>`;
}
function wTicketBoosts() {
  const p = ticketPlan();
  if (!p) return "";
  const next = p.doubles.slice(0, 4).map((d) => new Date(d.date + "T00:00:00Z").toLocaleDateString(LOCALE, { weekday: "short", day: "numeric", month: "short" }));
  return `<h4 class="acc-h">Boosts del capítulo <span class="faint">(+1 ticket por entrega cada uno)</span></h4>
    ${p.boosts.map((b) => `<div class="bst-row${b.active ? " on" : ""}"><span class="nm">${esc(b.item)}</span>
      ${b.active ? `<span class="tag green">activo</span>` : b.owned ? `<span class="tag sun">lo tienes: póntelo</span>` : `<span class="tag">te falta</span>`}
      <span class="bst" style="color:var(--muted)">${b.active ? "sumando en cada entrega" : `≈ +${fmt(b.gain, 0)} tickets hasta el final${b.price ? ` · cuesta ${fmt(b.price, 1)} FLW (${fmt(b.perTicket, 3)}/ticket)` : ""}`}</span></div>`).join("")}
    <h4 class="acc-h">Próximas entregas dobles</h4>
    <p class="ctx">${next.length ? next.join(" · ") : "Ninguna anunciada en el calendario"}${p.m.double ? " · <b class=\"up\">¡hoy es doble!</b>" : ""}</p>
    <p class="ctx">Cada entrega da la base del NPC ${p.m.vip ? "+2 por VIP " : ""}${p.m.boost ? `+${p.m.boost} por tus boosts ` : ""}y cuenta doble la primera del día en días dobles.</p>`;
}

function expRows(rows) {
  return `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Recurso</th><th class="r">Necesitas</th><th class="r">Tienes</th><th class="r">Falta</th><th class="r">Comprarlo</th><th class="r">Producirlo</th></tr></thead><tbody>
    ${rows.map((r) => `<tr><td class="w">${Gi(r.name, 14)} ${esc(r.name)}</td><td class="r">${compact(r.need)}</td><td class="r dim">${compact(r.have)}</td>
      <td class="r ${r.miss ? "down" : "up"}"><b>${r.miss ? compact(r.miss) : "✓"}</b></td>
      <td class="r dim">${r.miss && r.buy != null ? `${fmt(r.buy, 1)} FLW` : "—"}</td>
      <td class="r dim">${!r.miss ? "—" : r.days != null ? dur(r.days * DAY_MS) : r.name === "Gem" ? "se compran" : "sin nodos"}</td></tr>`).join("")}
  </tbody></table></div>`;
}
function wExpNext() {
  const e = expansionModel();
  if (!e.next) return Empty("sprout", "Isla completa", `Ya tienes todas las expansiones de ${esc(ISLAND_ES[e.island] || e.island)}: toca subir de isla.`);
  const n = e.next, buyAll = n.rows.reduce((s, r) => s + (r.buy || 0), 0) + n.coinsMiss / coinRate();
  const slow = n.rows.filter((r) => r.miss).sort((a, b) => (b.days ?? 1e9) - (a.days ?? 1e9))[0];
  setSub("st-exp-next", `expansión ${n.n} · ${esc(ISLAND_ES[e.island] || e.island)}`);
  return `<div class="kstrip">
      ${Kcell("Comprar lo que falta", `${fmt(buyAll, 1)}<small>FLW</small>`, money(buyAll))}
      ${Kcell("Producirlo tú", slow ? (slow.days != null ? dur(slow.days * DAY_MS) : "—") : "¡ya lo tienes!", slow ? `lo más lento: ${esc(slow.name)}` : "todos los recursos listos")}
      ${Kcell("Coins", n.coinsMiss ? `falta ${compact(n.coinsMiss)}` : "✓", `pide ${compact(n.req.coins)}`, n.coinsMiss ? "" : "up")}
      ${Kcell("Nivel", n.levelOk ? "✓" : `nv ${n.req.level}`, `construcción ${dur(n.req.seconds * 1000)}`, n.levelOk ? "up" : "")}
    </div>${e.expBoosts.length ? `<div class="ctx exp-boosts">${sprite("bolt", 12)} Ya aplicado: ${esc(e.expBoosts.join(" · "))}</div>` : ""}${expRows(n.rows)}
    <div class="mod-f"><span>Producirlo = días con tus nodos, sus boosts y tu ritmo de visitas · comprarlo = floor de hoy (gemas al precio de la tienda)</span></div>`;
}
function wExpIsland() {
  const e = expansionModel(), up = e.toIsland;
  if (!up) return Empty("sprout", "Sin siguiente isla", "");
  setSub("st-exp-island", `${e.count} de ${up.need} expansiones`);
  const buy = up.rows.reduce((s, r) => s + (r.buy || 0), 0);
  const slow = up.rows.filter((r) => r.miss).sort((a, b) => (b.days ?? 1e9) - (a.days ?? 1e9))[0];
  return `<p class="wl-lead" style="margin:0 0 10px">Para subir a <b>${esc(ISLAND_ES[up.to] || up.to)}</b> te faltan <b>${up.left}</b> expansiones y lo que pide la subida.</p>
    <div class="pbar" style="margin-bottom:12px"><i style="width:${Math.min(100, (e.count / up.need) * 100).toFixed(1)}%"></i></div>
    <dl class="kv"><dt>Comprando lo que falta</dt><dd>${fmt(buy, 0)} FLW · ${money(buy)}</dd><dt>Coins de las expansiones</dt><dd>${compact(up.coins)}</dd>
      <dt>Solo construir</dt><dd>${dur(up.secs * 1000)}</dd><dt>Produciéndolo tú</dt><dd>${slow?.days != null ? `${dur(slow.days * DAY_MS)} (lo más lento: ${esc(slow.name)})` : slow ? `falta ${esc(slow.name)} y no tienes nodos` : "¡todo listo!"}</dd></dl>
    <details class="bst-more"><summary>ver todos los recursos</summary>${expRows(up.rows)}</details>`;
}

function wLevelKpis() {
  const l = levelPlan();
  return `<div class="kstrip">
    ${Kcell("Nivel", `${l.lv.lvl}`, `${fmt(l.lv.p * 100, 0)}% del siguiente`, "sun")}
    ${Kcell(`Tus boosts de XP`, `×${fmt(l.general.mult, 3)}`, l.general.used.length ? esc(l.general.used.join(" · ")) : "ninguno activo", l.general.mult > 1 ? "up" : "")}
    ${Kcell("XP que falta", compact(l.need), `para el nivel ${l.lv.lvl + 1}`)}
    ${Kcell("XP guardada en comida", compact(l.storedXp), l.storedXp >= l.need ? "¡te llega para subir: cómetela!" : `${fmt((l.storedXp / Math.max(1, l.need)) * 100, 0)}% de lo que falta`, l.storedXp ? "up" : "")}
    ${Kcell("Cocinando lo que tienes", compact(l.cookNowXp), "XP con tu inventario de hoy")}
    ${Kcell("Subir comprando", l.flowerToNext != null ? `${fmt(l.flowerToNext, 1)}<small>FLW</small>` : "—", l.best[0] ? `con ${esc(l.best[0].name)}` : "")}
  </div>`;
}
function wLevelFoods() {
  const l = levelPlan();
  const rows = l.foods.filter((f) => f.xpPerFlower).sort((a, b) => b.xpPerFlower - a.xpPerFlower).slice(0, 15);
  setSub("st-lv-foods", "ordenado por XP por FLOWER de ingredientes");
  return `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Comida</th><th class="r">XP</th><th class="r">Coste</th><th class="r">XP/FLW</th><th class="r">XP/hora</th><th class="r">Puedes ya</th></tr></thead><tbody>
    ${rows.map((f) => `<tr><td class="w">${esc(f.name)}<div class="ctx">${esc(f.building || "")}${f.hasBuilding ? "" : " · <span class=\"down\">no tienes el edificio</span>"}</div></td>
      <td class="r" data-tip="${esc(`XP con tus boosts|${compact(f.baseXp)} base${f.boosts.length ? ` × ${f.boosts.join(" × ")}` : ""} = ${compact(f.xp)}|como en el juego (getFoodExpBoost)`)}"><b>${compact(f.xp)}</b>${f.mult > 1.001 ? `<div class="ctx up">×${fmt(f.mult, 2)}</div>` : ""}</td><td class="r dim">${fmt(f.cost, 2)}</td>
      <td class="r"><b>${fmt(f.xpPerFlower, 0)}</b></td><td class="r dim">${f.xpPerH != null ? compact(f.xpPerH) : "al momento"}</td><td class="r ${f.canCook && f.hasBuilding ? "up" : "dim"}">${f.canCook ? `×${fmt(f.canCook, 0)}` : "—"}</td></tr>`).join("")}
  </tbody></table></div><div class="mod-f"><span>XP con tus boosts (ropa, coleccionables también dentro de casa, VIP y skills) · ingredientes a precio de mercado · tiempos sin boosts de cocina</span><span>Cada nivel = 1 punto de skill</span></div>`;
}
function wLevelStored() {
  const l = levelPlan();
  if (!l.stored.length) return Empty("cook", "Sin comida guardada", "Lo que cocines y no comas aparecerá aquí.");
  return `${l.stored.slice(0, 10).map((f) => `<div class="bst-row"><span class="nm">${esc(f.name)} ×${fmt(f.stored, 0)}</span><span class="cd">${compact(f.total)} XP</span></div>`).join("")}
    <p class="ctx" style="margin-top:10px">Comértela da <b>${compact(l.storedXp)} XP</b>${l.storedXp >= l.need ? ": suficiente para subir de nivel ya." : "."}</p>`;
}

function wDaily() {
  const rows = dailyPlan();
  const done = rows.filter((r) => r.done).length;
  setSub("st-daily", `${done}/${rows.length} hechas hoy · se reinicia a las ${at(nextUtcMidnight(now()))}`);
  return `<div class="daily">${rows.map((r) => `<div class="dly${r.done ? " done" : ""}" ${r.go ? `data-go="${r.go}"` : ""}>
    <span class="chk">${r.done ? sprite("check", 14) : ""}</span>${sprite(r.icon, 16)}
    <div style="min-width:0"><div class="t">${esc(r.label)}</div><div class="s">${esc(r.detail || "")}</div></div>${r.go ? `<span class="rec-go">→</span>` : ""}</div>`).join("")}</div>`;
}

// Flores: lo que te piden (tareas "Grow X", bounties, pedidos y la flor de la semana) y con qué cruce plantarlo.
// Las recetas (semilla + ingrediente → flor) vienen de sfl.world; el juego no las publica.
function flowerPlan() {
  const farm = store.farm.data.farm, t = now(), m = missionModel();
  const recipes = has("flowerRecipes") ? store.flowerRecipes.data : null;
  const price = priceBook();
  const ticket = G.chapterTickets?.[currentChapter()] || null;
  const isFlower = (n) => Boolean(G.flowerSeedOf[n]);
  const growSecs = (n) => G.flowerSeeds[G.flowerSeedOf[n]] || 0;
  const beds = Object.entries(farm.flowers?.flowerBeds || {}).map(([id, b]) => {
    const f = b.flower, readyAt = f ? toNum(f.plantedAt) + growSecs(f.name) * 1000 : null;
    return { id, flower: f?.name || null, readyAt, ready: Boolean(f) && readyAt <= t };
  });
  const growing = (n) => beds.filter((b) => b.flower === n);

  const demand = [];
  const harvestNeed = (kind, who, fl, left, reward) => { if (isFlower(fl) && left > 0) demand.push({ kind, who, flower: fl, harvests: true, need: left, reward }); };
  for (const c of m.board) if (!c.done && c.def) harvestNeed("chore", NPC_ES(c.npc), c.def.activity.replace(/ Harvested$/, ""), c.def.amount - c.progress, c.reward);
  for (const c of m.weekly) if (!c.done && /Harvested$/.test(c.activity || "")) harvestNeed("weekly", "tarea semanal", c.activity.replace(/ Harvested$/, ""), c.requirement - c.progress, c.reward);
  for (const b of m.bounties) if (isFlower(b.name)) demand.push({ kind: "bounty", who: "bounty", flower: b.name, need: 1, reward: { items: b.items, coins: b.coins, sfl: b.sfl } });
  for (const o of m.open) for (const [n, q] of Object.entries(o.items || {})) if (isFlower(n)) demand.push({ kind: "order", who: NPC_ES(o.from), flower: n, need: toNum(q), reward: o.reward });
  const weeklyFlower = farm.flowerShop?.weeklyFlower || null;
  if (weeklyFlower) demand.push({ kind: "shop", who: "floristería", flower: weeklyFlower, need: 1, reward: null });
  const wanted = new Set(demand.map((d) => d.flower));

  // Mejor cruce para una flor: primero lo que puedes hacer ya, sin gastar flores que también te piden, y lo más barato
  const recipeFor = (fl) => {
    const r = recipes?.[fl];
    if (!r) return null;
    const amounts = G.crossBreedAmounts?.[r.seed] || {};
    const opts = r.via.map((ing) => {
      const amt = amounts[ing] ?? 1, have = haveOf(ing), p = price(ing).v;
      const g = growing(ing); // la tienes plantada: sirve cuando la recojas
      return { ing, amt, have, ok: have >= amt, wanted: wanted.has(ing), cost: p != null ? p * amt : null, growingAt: have + g.length >= amt && g.length ? Math.min(...g.map((x) => x.readyAt)) : null };
    });
    const rank = (o) => (o.ok ? 0 : o.growingAt ? 2 : 4) + (o.wanted ? 1 : 0);
    opts.sort((a, b) => rank(a) - rank(b) || (a.cost ?? 1e6) - (b.cost ?? 1e6) || b.have - a.have);
    return { seed: r.seed, seedHave: haveOf(r.seed), best: opts[0] || null, opts };
  };

  for (const d of demand) {
    const g = growing(d.flower);
    d.have = haveOf(d.flower);
    d.growing = g.length;
    d.growReady = g.length ? Math.max(...g.map((b) => b.readyAt)) : null;
    d.recipe = recipeFor(d.flower);
    d.days = growSecs(d.flower) / 86400;
    d.tickets = ticket ? toNum(d.reward?.items?.[ticket]) : 0;
    // Para tareas cuenta cosechar (lo que tienes en el inventario no vale); para el resto, tenerla
    const covered = d.harvests ? d.growing : d.have + d.growing;
    d.toPlant = Math.max(0, d.need - covered);
    d.state = !d.harvests && d.have >= d.need ? "ready"
      : d.toPlant === 0 ? "growing"
      : !recipes ? "norecipe"
      : !d.recipe || !d.recipe.opts.length ? "unknown"
      : d.recipe.seedHave < 1 ? "noseed"
      : d.recipe.best?.ok ? "plant" : "noing";
  }
  const ORDER = { ready: 0, plant: 1, noseed: 2, noing: 3, growing: 4, norecipe: 5, unknown: 6 };
  demand.sort((a, b) => ORDER[a.state] - ORDER[b.state] || b.tickets - a.tickets || a.days - b.days);
  return { beds, demand, ticket, weeklyFlower, recipes, free: beds.filter((b) => !b.flower).length, ready: beds.filter((b) => b.ready).length };
}
const FLOWER_KIND = { chore: "tarea", weekly: "tarea semanal", bounty: "bounty", order: "pedido", shop: "flor de la semana" };
const rewardText = (r) => [r?.coins ? `${fmt(r.coins, 0)} coins` : "", r?.sfl ? `${fmt(r.sfl, 2)} FLOWER` : "", ...Object.entries(r?.items || {}).map(([k, v]) => `${fmt(v)} ${k}`)].filter(Boolean).join(" + ");
const recipeText = (rc) => (rc?.best ? `${rc.seed} + ${rc.best.amt} ${rc.best.ing}` : "");
function flowerStateCell(d) {
  const rc = d.recipe, b = rc?.best;
  const alts = rc?.opts?.length ? `${rc.seed} (tienes ${fmt(rc.seedHave, 0)}) +|${rc.opts.map((o) => `${o.amt} ${o.ing}: tienes ${fmt(o.have, 1)}${o.wanted ? " · también te la piden" : ""}${o.cost != null ? ` · ${fmt(o.cost, 2)} FLW` : ""}`).join("|")}` : "";
  const tip = alts ? ` data-tip="${esc(`Cruces para ${d.flower}|${alts}|recetas: sfl.world`)}"` : "";
  switch (d.state) {
    case "ready": return `<span class="tag green">la tienes: entrégala</span>`;
    case "growing": return `<span class="tag sun">creciendo · lista ${d.growReady <= now() ? "ya" : `en ${dur(d.growReady - now())}`}</span>`;
    case "plant": return `<span${tip}><b>${esc(recipeText(rc))}</b>${d.toPlant > 1 ? ` <span class="faint">×${d.toPlant}</span>` : ""}</span>`;
    case "noseed": return `<span class="tag"${tip}>compra ${esc(rc.seed)}</span>`;
    case "noing": if (b.growingAt) return `<span class="tag sun"${tip}>${esc(`${rc.seed} + ${b.amt} ${b.ing}`)} cuando recojas tu ${esc(b.ing)} (${b.growingAt <= now() ? "ya" : dur(b.growingAt - now())})</span>`;
    return `<span class="tag"${tip}>te falta ${esc(`${b.amt} ${b.ing}`)} (tienes ${fmt(b.have, 0)})</span>`;
    case "norecipe": return `<span class="faint">cargando recetas…</span>`;
    default: return `<span class="faint">receta desconocida</span>`;
  }
}
function wFlowerKpis() {
  const p = flowerPlan();
  const open = p.demand.filter((d) => d.state !== "growing");
  const tickets = p.demand.reduce((s, d) => s + d.tickets, 0);
  const nextBed = p.beds.filter((b) => b.flower && !b.ready).sort((a, b) => a.readyAt - b.readyAt)[0];
  return `<div class="kstrip">
    ${Kcell("Macizos libres", `${p.free}<small>/${p.beds.length}</small>`, p.free ? "planta ya lo de la lista" : nextBed ? `el próximo queda libre en ${dur(nextBed.readyAt - now())}` : "", p.free ? "up" : "")}
    ${Kcell("Listas para recoger", fmt(p.ready, 0), p.ready ? "recógelas para liberar macizos" : "ninguna todavía")}
    ${Kcell("Flores que te piden", fmt(p.demand.length, 0), `${open.length} sin plantar todavía`)}
    ${Kcell(p.ticket ? `${esc(p.ticket)} en juego` : "Tickets en juego", fmt(tickets, 0), "sumando tareas y bounties de flores", "sun")}
    ${Kcell("Flor de la semana", p.weeklyFlower ? `<span class="v-txt">${esc(p.weeklyFlower)}</span>` : "—", "la pide la floristería")}
  </div>`;
}
function wFlowerDemand() {
  const p = flowerPlan();
  setSub("st-fl-demand", `${p.demand.length} pedidas · ordenadas por lo que puedes hacer ya y los tickets que dan`);
  if (!p.demand.length) return Empty("flower", "Nadie te pide flores", "Ninguna tarea, bounty ni pedido abierto necesita flores ahora.");
  return `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Flor</th><th>Para</th><th class="r">Necesitas</th><th>Recompensa</th><th>Qué hacer</th></tr></thead><tbody>
    ${p.demand.map((d) => `<tr><td class="w">${Gi(d.flower, 14)} ${esc(d.flower)}<div class="ctx">${fmt(d.days, 0)} d en crecer</div></td>
      <td class="dim">${esc(FLOWER_KIND[d.kind])}${d.kind === "chore" || d.kind === "order" ? ` · ${esc(d.who)}` : ""}</td>
      <td class="r">${d.harvests ? `${fmt(d.need, 0)} cosecha${d.need === 1 ? "" : "s"}` : `${fmt(d.need, 0)} <span class="faint">(tienes ${fmt(d.have, 0)})</span>`}</td>
      <td class="dim">${d.reward ? esc(rewardText(d.reward)) || "—" : `<span class="faint">según la floristería</span>`}</td>
      <td>${flowerStateCell(d)}</td></tr>`).join("")}
  </tbody></table></div><div class="mod-f"><span>Pasa el ratón por el cruce para ver las alternativas · en las tareas cuenta cosechar, no tenerla</span><span>recetas: sfl.world · tiempos sin boosts</span></div>`;
}
function wFlowerBeds() {
  const p = flowerPlan();
  setSub("st-fl-beds", `${p.beds.length} macizo${p.beds.length === 1 ? "" : "s"}`);
  const queue = p.demand.filter((d) => d.state === "plant");
  const beds = p.beds.map((b) => `<div class="bst-row${b.ready ? " on" : ""}"><span class="nm">${esc(b.flower || "Libre")}</span>
    ${!b.flower ? `<span class="tag green">libre</span>` : b.ready ? `<span class="tag green">lista</span>` : `<span class="tag">${dur(b.readyAt - now())}</span>`}
    <span class="bst" style="color:var(--muted)">${b.flower && p.demand.some((d) => d.flower === b.flower) ? "te la piden" : ""}</span></div>`).join("");
  return `${beds || `<p class="ctx">No tienes macizos de flores.</p>`}
    <h4 class="acc-h">Lo siguiente que plantar</h4>
    ${queue.length ? queue.slice(0, 4).map((d, i) => `<div class="bst-row"><span class="nm">${i + 1}. ${esc(d.flower)}</span><span class="bst" style="color:var(--muted)">${esc(recipeText(d.recipe))}${d.tickets ? ` · ${fmt(d.tickets, 0)} ${esc(p.ticket)}` : ""}</span></div>`).join("")
      : `<p class="ctx">${p.recipes ? "Nada que puedas plantar ya para lo que te piden." : "Cargando recetas de sfl.world…"}</p>`}`;
}
