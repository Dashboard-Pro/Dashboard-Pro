// SFL Console — Resumen ampliado (como el de primerascripto): ficha de la granja, checklist del día, facción de la
// semana, pendientes y metas, minijuegos, actividad y stock de las tiendas.
// Scripts clásicos que comparten el ámbito global en el orden de index.html.
"use strict";

const LC_PER_FLOWER = 80; // tiendas de Love Charms: 80 LC ≈ 1 FLOWER (misma equivalencia que primerascripto)
const MUSHROOM_H = { wild: 16, magic: 24 }; // estimación: el juego decide la aparición en su servidor
const WEATHER_GUARD = [["Tornado Pinwheel", "tornado", "Tornado"], ["Mangrove", "tsunami", "Tsunami"], ["Thermal Stone", "greatFreeze", "Gran helada"], ["Protective Pesticide", "insectPlague", "Plaga de insectos"]];
S.maxFlowerPerMark = Number(readLS("maxFpm", 0.0115)); // hasta qué coste por mark conviene entregar a la cocina

// Límite diario de pesca (getDailyFishingLimit de fishing.ts): 20 + ropa, coleccionables y skills, + carretes extra
function fishingLimit(farm) {
  const worn = wornSet(farm), rank = (n) => Math.min(3, Math.max(0, toNum(farm.bumpkin?.skills?.[n])));
  const r = (n, def) => { const k = rank(n); return k ? (G.skills?.[n]?.ranks || def)[k - 1] : 0; };
  let limit = 20;
  if (worn.has("Angler Waders")) limit += 10;
  for (const n of ["Reelmaster's Chair", "Nautilus", "Deep Sea Slug", "Otty the Otter"]) if (isPlaced(farm, n)) limit += 5;
  if (worn.has("Saw Fish")) limit += 5;
  limit += r("Fisherman's 5 Fold", [5, 7, 10]) + r("Fisherman's 10 Fold", [10, 18, 25]) + r("More With Less", [10, 30, 50]);
  return limit + toNum(farm.fishing?.extraReels?.count);
}
const titleSlug = (s) => s.replace(/-\d{4}$/, "").split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ").replace("Chaacs", "Chaac's");

function checklistModel() {
  const farm = store.farm.data.farm, t = now(), today = todayUTC();
  const items = [];
  const add = (state, icon, label, detail, go) => items.push({ state, icon, label, detail, go });
  // Cofre diario y racha
  const chestAt = toNum(farm.dailyRewards?.chest?.collectedAt);
  add(new Date(chestAt).toISOString().slice(0, 10) === today ? "ok" : "todo", "chest", "Cofre diario", `racha de ${fmt(toNum(farm.dailyRewards?.streaks), 0)} días`);
  // Minijuegos: premio diario de cada uno (marks)
  const prizes = Object.entries(farm.minigames?.prizes || {}).filter(([, p]) => toNum(p.startAt) <= t && toNum(p.endAt) > t);
  const done = prizes.filter(([g]) => farm.minigames?.games?.[g]?.history?.[today]?.prizeClaimedAt);
  const marksOf = (list) => list.reduce((s, [, p]) => s + toNum(p.items?.Mark), 0);
  if (prizes.length) add(done.length === prizes.length ? "ok" : "todo", "star", "Minijuegos", `${done.length} / ${prizes.length} · marks ${fmt(marksOf(done), 0)} / ${fmt(marksOf(prizes), 0)}`, "overview");
  // Pesca
  const fished = toNum(farm.fishing?.dailyAttempts?.[today]), limit = fishingLimit(farm);
  add(fished >= limit ? "ok" : "todo", "fish", "Pesca", `${fished} / ${limit} lances`);
  // Tablón de tareas y entregas
  const board = Object.values(farm.choreBoard?.chores || {});
  if (board.length) add(board.every((c) => c.completedAt) ? "ok" : "info", "check", "Tareas de la semana", `${board.filter((c) => c.completedAt).length} / ${board.length}`, "missions:chores");
  const deliveredToday = (farm.delivery?.orders || []).filter((o) => o.completedAt && new Date(toNum(o.completedAt)).toISOString().slice(0, 10) === today).length;
  add("info", "scroll", "Entregas", `hoy ${deliveredToday} · total ${fmt(toNum(farm.delivery?.fulfilledCount), 0)}`, "missions");
  // Skills
  const free = skillModel().free;
  add(free > 0 ? "todo" : "ok", "bolt", "Puntos de habilidad", free > 0 ? `${free} sin gastar` : "todos gastados", "skills");
  // Hongos (estimación) e isla del amor
  const mush = farm.mushrooms || {}, onFarm = Object.keys(mush.mushrooms || {}).length;
  const wildAt = toNum(mush.spawnedAt) + MUSHROOM_H.wild * 3600_000, magicAt = toNum(mush.magicSpawnedAt) + MUSHROOM_H.magic * 3600_000;
  add(onFarm ? "todo" : "info", "mushroom", "Hongos silvestres", onFarm ? `${onFarm} para recoger` : mush.spawnedAt ? (wildAt > t ? `en ${dur(wildAt - t)} (aprox.)` : "deberían estar saliendo") : "—");
  if (mush.magicSpawnedAt) add("info", "mushroom", "Hongos mágicos", magicAt > t ? `en ${dur(magicAt - t)} (aprox.)` : "deberían estar saliendo");
  const isle = (farm.floatingIsland?.schedule || []).map((s) => ({ from: toNum(s.startAt), to: toNum(s.endAt) })).filter((s) => s.to > t).sort((a, b) => a.from - b.from)[0];
  if (isle) add(isle.from <= t ? "todo" : "info", "heart", "Isla del amor", isle.from <= t ? `abierta · cierra en ${dur(isle.to - t)}` : `abre en ${dur(isle.from - t)}`);
  // Mascota de la facción: pedidos de esta semana
  const fm = farm.faction?.name ? factionModel() : null;
  if (fm?.petReq.length) {
    const fed = fm.fac.pet.requests.filter((q) => Object.values(q.dailyFulfilled || {}).some((v) => toNum(v) > 0)).length;
    add(fed === fm.petReq.length ? "ok" : "todo", "paw", "Mascota de facción", `${fed} de ${fm.petReq.length} pedidos esta semana${fm.fac.pet.qualifiesForBoost ? " · boost conseguido" : ""}`, "faction");
  }
  // Santuarios caducados, Maneki Neko sin agitar y proyectos completos por recoger
  const tm = tempsModel(), expired = tm.shrines.filter((x) => x.expired);
  if (tm.shrines.length) add(expired.length ? "warn" : "ok", "bolt", "Santuarios", expired.length ? `caducado: ${expired.map((x) => x.name.replace(/ Shrine$/, "")).join(", ")}` : `${tm.shrines.length} activo${tm.shrines.length > 1 ? "s" : ""} · el primero acaba en ${dur(tm.shrines[0].left)}`);
  if (tm.maneki.length) add(tm.maneki.every((k) => k.shaken) ? "ok" : "todo", "chest", "Maneki Neko", tm.maneki.every((k) => k.shaken) ? "agitado hoy" : "agítalo: una comida gratis");
  const pj = projectsModel(), toClaim = pj.filter((p) => p.done && p.reward);
  if (pj.length) add(toClaim.length ? "todo" : "info", "hammer", "Proyectos del pueblo", toClaim.length ? `listo para recoger: ${toClaim.map((p) => p.name).join(", ")}` : `${pj.filter((p) => p.done).length} / ${pj.length} completados`);
  // Protecciones contra el clima
  for (const [item, , label] of WEATHER_GUARD) {
    const have = toNum(farm.inventory?.[item]) > 0;
    add(have ? "ok" : "warn", "warn", item, have ? `protege de: ${label}` : `sin protección contra ${label}`);
  }
  return items;
}
function wFarmCard() {
  const f = store.farm.data, farm = f.farm, t = now();
  const L = bumpkinLevel(toNum(farm.bumpkin?.experience));
  const vipLeft = toNum(farm.vip?.expiresAt) - t;
  const inv = farm.inventory || {}, lc = toNum(inv["Love Charm"]);
  const cells = [["Monedas", compact(toNum(farm.coins))], ["FLOWER", fmt(toNum(farm.balance), 2)], ["Gemas", compact(toNum(inv.Gem))],
    ["Marks", compact(toNum(inv.Mark))], ["Love Charms", `${compact(lc)} <span class="faint">≈ ${fmt(lc / LC_PER_FLOWER, 2)} FLW</span>`], ["Cheers", compact(toNum(inv.Cheer))]];
  return `<div class="fc-head">
      <div><b>${esc(farm.username || "#" + f.id)}</b> <span class="faint">#${esc(S.farmId || f.id)} · ${esc(ISLAND_ES[farm.island?.type] || farm.island?.type || "")}</span></div>
      <div class="fc-tags">${vipLeft > 0 ? `<span class="tag sun">VIP · quedan ${Math.ceil(vipLeft / DAY_MS)} días</span>` : `<span class="tag">sin VIP</span>`}
        <span class="tag">racha ${fmt(toNum(farm.dailyRewards?.streaks), 0)}</span>${farm.verified ? `<span class="tag green">verificada</span>` : ""}
        ${farm.faction?.name ? `<span class="tag">${esc(FACTION_ES[farm.faction.name] || farm.faction.name)}</span>` : ""}
        <span class="tag">${fmt(toNum(inv["Basic Land"]), 0)} expansiones</span><span class="tag">creada ${new Date(toNum(farm.createdAt)).toLocaleDateString(LOCALE, { day: "numeric", month: "short", year: "numeric" })}</span></div>
    </div>
    <div class="fc-lvl"><span>Nivel <b>${L.lvl}</b></span><div class="pbar"><i style="width:${fmt(L.p * 100, 0)}%"></i></div><span class="faint">${L.toNext ? `faltan ${compact(L.toNext)} XP` : "máximo"}</span></div>
    <div class="fc-grid">${cells.map(([k, v]) => `<div><span class="eyebrow">${k}</span><b>${v}</b></div>`).join("")}</div>
    <a class="btn sm ghost" href="https://sunflower-land.com/play/#/visit/${encodeURIComponent(S.farmId || f.id)}" target="_blank" rel="noopener noreferrer">Visitar en el juego ↗</a>`;
}
function wChecklist() {
  const items = checklistModel();
  const done = items.filter((i) => i.state === "ok").length;
  setSub("ov-check", `${done} de ${items.length} al día · verde hecho, amarillo te falta, rojo requiere atención`);
  const mark = { ok: sprite("check", 12), todo: "○", warn: "!", info: "i" };
  return `<div class="ck-grid">${items.map((i) => `<div class="ck ${i.state}" ${i.go ? `data-go="${i.go}"` : ""}><span class="ck-m">${mark[i.state]}</span>
      <div style="min-width:0"><div class="t">${esc(i.label)}</div><div class="s">${esc(i.detail || "")}</div></div></div>`).join("")}</div>
    <div class="mod-f"><span>Los hongos son una estimación (el juego los decide en su servidor)</span><span></span></div>`;
}
// Facción esta semana: marks, cocina con cuántas entregas convienen hoy (hasta el coste por mark elegido) y mascota
function wFactionWeek() {
  const f = store.farm.data.farm.faction?.name ? factionModel() : null;
  if (!f) return Empty("flag", "Sin facción", "");
  const maxFpm = S.maxFlowerPerMark;
  const kitchen = f.kitchen.map((k) => {
    let n = 0, marks = 0, cost = 0;
    if (k.cost) for (let d = k.done; d < k.done + 30; d++) {
      const pts = nextPoints(20, d) * (1 + f.boost);
      if (k.cost / pts > maxFpm) break;
      n++; marks += pts; cost += k.cost;
    }
    return { ...k, recN: n, recMarks: marks, recCost: cost };
  });
  const total = kitchen.reduce((s, k) => s + k.recCost, 0);
  setSub("ov-faction", `${fmt(toNum(f.cur.score), 0)} puntos esta semana · termina en ${dur(f.w.end - now())}`);
  return `<div class="bst-row"><span class="nm">Boost de rango y atuendo</span><span class="tag sun">+${fmt(f.boost * 100, 0)}% marks</span></div>
    <h4 class="acc-h">Cocina <span class="faint">(conviene hasta ${fmt(maxFpm, 3)} FLOWER por mark)</span></h4>
    ${kitchen.map((k) => `<div class="bst-row"><span class="nm">${Gi(k.item, 14)} ${fmt(k.amount, 0)} × ${esc(k.item)} <span class="faint">· hoy ${k.done}</span></span>
      <span class="tag${k.recN ? " green" : ""}">${k.recN ? `entregar ${k.recN} ${k.recN === 1 ? "vez" : "veces"}` : k.cost == null ? "sin precio" : "no compensa"}</span>
      <span class="bst" style="color:var(--muted)">${k.cost != null ? `${fmt(k.cost, 3)} FLOWER cada una · ${k.recN ? `${fmt(k.recMarks, 0)} marks por ${fmt(k.recCost, 2)} FLOWER` : ""}` : ""}</span></div>`).join("")}
    ${total ? `<p class="ctx">Entregar lo recomendado hoy: <b>${fmt(total, 2)} FLOWER</b></p>` : ""}
    <h4 class="acc-h">Mascota de la facción</h4>
    ${f.petReq.map((q) => { const fed = Object.values(q.dailyFulfilled || {}).some((v) => toNum(v) > 0); return `<div class="bst-row${fed ? " on" : ""}"><span class="nm">${Gi(q.food, 14)} ${fmt(q.quantity, 0)} × ${esc(q.food)}</span><span class="tag${fed ? " green" : ""}">${fed ? "entregado" : "sin entregar"}</span><span class="bst" style="color:var(--muted)">${compact(q.xp)} XP para la mascota · +${fmt(q.pts, 0)} marks</span></div>`; }).join("")}
    <div class="mod-f"><span>Marks por entrega: 20 − 2 por cada una del día, × tu boost</span><a href="#faction" class="ctx">Facción →</a></div>`;
}
// Pendientes y metas: estación y clima, reset de skills, mascotas, subasta, meta de expansión y valor de la granja
function wPending() {
  const farm = store.farm.data.farm, t = now(), today = todayUTC();
  const rows = [];
  const w = (farm.calendar?.dates || []).find((d) => d.date === today && d.weather && d.name !== "unknown");
  const SEASON_ES = { spring: "Primavera", summer: "Verano", autumn: "Otoño", winter: "Invierno" };
  rows.push(["calendar", `Estación: ${SEASON_ES[farm.season?.season] || farm.season?.season || "—"}${w ? ` · hoy: ${CAL_ES[w.name] || w.name}` : ""}`, "events"]);
  const freeAt = toNum(farm.bumpkin?.previousFreeSkillResetAt) + 180 * DAY_MS;
  rows.push(["bolt", freeAt > t ? `Reset de habilidades gratis en ${Math.ceil((freeAt - t) / DAY_MS)} días` : "Reset de habilidades gratis disponible", "skills"]);
  const pets = petModel(), hungry = pets.filter((p) => p.pending.length || p.neglected);
  rows.push(["paw", hungry.length ? `${hungry.length} mascota${hungry.length > 1 ? "s" : ""} con comida pendiente` : "Tus mascotas están bien", "pets"]);
  const au = (store.auctions?.data || []).filter((a) => a.startAt > t).sort((a, b) => a.startAt - b.startAt)[0];
  if (au) rows.push(["hammer", `${esc(typeof auctionPrize === "function" ? auctionPrize(au) : au.name || "Subasta")} · próxima subasta en ${dur(au.startAt - t)}`, "events"]);
  // Meta de expansión (la siguiente) y valor de la granja
  const e = expansionModel(), n = e.next;
  const h = holdings();
  const nftVal = h ? h.rows.filter((r) => isNft(r.key, r.name)).reduce((s, r) => s + r.value, 0) : 0;
  const resVal = h ? h.total - nftVal : 0, flw = toNum(farm.balance), coinsF = toNum(farm.coins) / coinRate();
  return `${rows.map(([ic, txt, go]) => `<div class="bst-row" data-go="${go}"><span class="nm">${sprite(ic, 13)} ${txt}</span><span class="rec-go">→</span></div>`).join("")}
    ${n ? `<h4 class="acc-h">Meta: expansión ${n.n}</h4>
      ${n.rows.filter((r) => r.need).map((r) => `<div class="bst-row"><span class="nm">${Gi(r.name, 14)} ${esc(r.name)} <span class="faint">${compact(Math.min(r.have, r.need))} / ${compact(r.need)}</span></span><span class="${r.miss ? "down" : "up"}">${r.miss ? `faltan ${compact(r.miss)}` : "✓"}</span></div>`).join("")}
      <p class="ctx">${n.coinsMiss ? `Faltan ${compact(n.coinsMiss)} coins · ` : ""}<a href="#strategy" data-go="strategy">plan completo en Estrategia → Expansión</a></p>` : ""}
    ${h ? `<h4 class="acc-h">Valor de tu granja: ${fmt(h.total + flw + coinsF, 0)} FLOWER</h4>
      <div class="fc-grid">${[["Recursos", resVal], ["NFTs", nftVal], ["FLOWER", flw], ["Monedas", coinsF]].map(([k, v]) => `<div><span class="eyebrow">${k}</span><b>${fmt(v, v < 10 ? 2 : 0)}</b></div>`).join("")}</div>` : ""}`;
}
function wMinigames() {
  const farm = store.farm.data.farm, t = now(), today = todayUTC();
  const games = farm.minigames?.games || {}, prizes = farm.minigames?.prizes || {};
  const names = [...new Set([...Object.keys(prizes).filter((g) => toNum(prizes[g].endAt) > t), ...Object.keys(games).filter((g) => Object.keys(games[g].history || {}).length)])];
  if (!names.length) return Empty("star", "Sin minijuegos", "");
  const rows = names.map((g) => {
    const gm = games[g] || {}, p = prizes[g], hist = Object.keys(gm.history || {}).sort();
    return { g, name: titleSlug(g), days: hist.length, record: toNum(gm.highscore), last: hist[hist.length - 1] || null, target: p && toNum(p.endAt) > t ? toNum(p.score) : null, marks: p ? toNum(p.items?.Mark) : 0, done: Boolean(gm.history?.[today]?.prizeClaimedAt) };
  }).sort((a, b) => (b.target != null) - (a.target != null) || b.marks - a.marks);
  setSub("ov-mini", `${rows.filter((r) => r.done).length} de ${rows.filter((r) => r.target != null).length} premios de hoy`);
  return `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Juego</th><th class="r">Días</th><th class="r">Récord</th><th>Último</th><th class="r">Objetivo hoy</th><th class="r">Premio</th></tr></thead><tbody>
    ${rows.map((r) => `<tr><td class="w">${esc(r.name)}${r.done ? ` <span class="tag green">hecho</span>` : ""}</td><td class="r dim">${r.days}</td><td class="r">${compact(r.record)}</td>
      <td class="dim">${r.last ? new Date(r.last + "T00:00:00Z").toLocaleDateString(LOCALE, { day: "numeric", month: "short" }) : "—"}</td>
      <td class="r">${r.target != null ? `${compact(r.target)} pts` : "—"}</td><td class="r">${r.marks ? `${Gi("Mark", 12)} ${r.marks}` : "—"}</td></tr>`).join("")}
  </tbody></table></div><div class="mod-f"><span>Un juego cuenta como hecho el día que reclamas su premio diario · el juego guarda solo las últimas semanas</span><span></span></div>`;
}
function wActivity() {
  const fa = store.farm.data.farm.farmActivity || {};
  const stats = [["Monedas ganadas", "Coins Earned"], ["Monedas gastadas", "Coins Spent"], ["Girasoles cosechados", "Sunflower Harvested"], ["Huevos recogidos", "Egg Collected"],
    ["Árboles talados", "Tree Chopped"], ["Piedra minada", "Stone Mined"], ["Hierro minado", "Iron Mined"], ["Oro minado", "Gold Mined"], ["Crimstone minado", "Crimstone Mined"]];
  return `<div class="fc-grid act">${stats.map(([l, k]) => `<div><span class="eyebrow">${l}</span><b>${compact(toNum(fa[k]))}</b></div>`).join("")}</div>`;
}
function wShopStock() {
  const farm = store.farm.data.farm, stock = farm.stock || {};
  const season = farm.season?.season, seasonal = new Set(G.seasonalSeeds?.[season] || []);
  const seeds = Object.entries(stock).filter(([n]) => /Seed|Plant$/.test(n) && (!seasonal.size || seasonal.has(n)));
  const tools = Object.entries(stock).filter(([n]) => !/Seed|Plant$/.test(n));
  const cell = ([n, q]) => { const max = G.seedStock?.[n]; return `<div class="st-cell" data-tip="${esc(`${n}|quedan ${fmt(toNum(q), 0)}${max ? ` de ${max}` : ""} hoy|el stock se repone solo`)}">${Gi(n, 18)}<b class="${toNum(q) === 0 ? "down" : ""}">${compact(toNum(q))}</b></div>`; };
  return `<h4 class="acc-h">Herramientas</h4><div class="st-grid">${tools.map(cell).join("")}</div>
    <h4 class="acc-h">Semillas de esta estación</h4><div class="st-grid">${seeds.map(cell).join("")}</div>
    <div class="mod-f"><span>Lo que te queda por comprar hoy</span><span></span></div>`;
}

// Texto del boost de un objeto (G.buffs puede traer varias líneas)
const buffLine = (n) => { const b = G.buffs?.[n]; return Array.isArray(b) ? b.join(" · ") : b || ""; };
/* ── Proyectos del pueblo (socialFarming.villageProjects): ánimos que llevan, los que piden y lo que dan ── */
// Colocados de verdad (con coordenadas) en la granja, la casa o el interior: los quitados siguen en la lista sin coordenadas
function placedWith(farm, name) {
  const groups = [farm.collectibles, farm.home?.collectibles, ...Object.values(farm.interior || {}).map((lvl) => lvl?.collectibles)];
  return groups.flatMap((g) => (g?.[name] || []).filter((it) => it?.coordinates));
}
function projectsModel() {
  const farm = store.farm.data.farm, vp = farm.socialFarming?.villageProjects || {};
  const req = G.projects?.cheers || {}, rew = G.projects?.rewards || {};
  const price = has("activity") ? priceBook() : null;
  return Object.entries(vp).filter(([n]) => req[n]).map(([name, p]) => {
    const cheers = toNum(p.cheers), need = req[name], done = cheers >= need;
    const reward = rew[name] || null, placed = placedWith(farm, name).length > 0;
    const value = reward && price ? price(reward.item).v : null;
    return { name, cheers, need, done, pct: Math.min(1, cheers / need), reward, value: value != null ? value * reward.amount : null, placed, helped: Boolean(p.helpedAt) };
  }).sort((a, b) => Number(b.done) - Number(a.done) || b.pct - a.pct);
}
function wProjects() {
  const list = projectsModel();
  setSub("ov-projects", list.length ? `${list.filter((p) => p.done).length} de ${list.length} completados` : "");
  if (!list.length) return Empty("hammer", "Sin proyectos", "Los proyectos del pueblo (monumentos, frutas gigantes, ollas) se construyen con los ánimos de tus amigos.");
  return `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Proyecto</th><th>Ánimos</th><th>Da</th><th class="r">Estado</th></tr></thead><tbody>
    ${list.map((p) => `<tr><td class="w">${Gi(p.name, 18)} ${esc(p.name)}</td>
      <td style="min-width:120px"><div class="pbar"><i style="width:${(p.pct * 100).toFixed(0)}%;--c:${p.done ? "var(--green)" : "var(--sun)"}"></i></div><div class="ctx">${fmt(p.cheers, 0)} / ${fmt(p.need, 0)}${p.done ? "" : ` · faltan ${fmt(p.need - p.cheers, 0)}`}</div></td>
      <td class="ctx">${p.reward ? `${Gi(p.reward.item, 14)} ${p.reward.amount}× ${esc(p.reward.item)}${p.value != null ? ` <span class="faint">≈ ${fmt(p.value, 2)} FLW</span>` : ""}` : esc(buffLine(p.name) || "su boost")}</td>
      <td class="r">${p.done ? (p.reward ? `<span class="st-tag avail">¡Listo! recógelo</span>` : `<span class="tag green">activo</span>`) : `<span class="ctx">${fmt(p.pct * 100, 0)}%</span>`}</td></tr>`).join("")}
  </tbody></table></div>
  <div class="mod-f"><span>Los ánimos te los dan los jugadores que visitan tu granja · al completarse, las frutas gigantes y las ollas se recogen y los monumentos activan su boost</span><span>monuments.ts</span></div>`;
}

/* ── Santuarios y temporales: cuándo caducan los que tienes colocados, relojes de arena y tótems activos, Maneki Neko ── */
// Duración de cada santuario (collectibleBuilt.ts → EXPIRY_COOLDOWNS): 7 días, salvo Legendary 1, Obsidian 14 y Trading 30
const SHRINE_DAYS = { "Legendary Shrine": 1, "Obsidian Shrine": 14, "Trading Shrine": 30 };
function tempsModel() { return tempsModelFor(store.farm.data.farm); }
function tempsModelFor(farm) {
  const t = now();
  const names = placedCollectibles(farm).filter((n) => / Shrine$/.test(n));
  const shrines = names.flatMap((n) => placedWith(farm, n).map((it) => {
    const end = toNum(it.createdAt) + (SHRINE_DAYS[n] ?? 7) * DAY_MS;
    return { name: n, end, left: end - t, expired: end <= t, buff: buffLine(n) };
  })).sort((a, b) => a.end - b.end);
  // Relojes de arena, tótems y otros temporales con su ventana activa ahora (boostHistory / buffs)
  const seen = new Set(shrines.map((s) => s.name));
  const active = tempWindows(farm).filter((w) => w.from <= t && w.to > t && !seen.has(w.name))
    .reduce((acc, w) => { const o = acc.find((x) => x.name === w.name); if (o) o.to = Math.max(o.to, w.to); else acc.push({ ...w }); return acc; }, [])
    .sort((a, b) => a.to - b.to);
  const maneki = placedWith(farm, "Maneki Neko").map((it) => ({ shaken: it.shakenAt ? new Date(toNum(it.shakenAt)).toISOString().slice(0, 10) === todayUTC() : false }));
  return { shrines, active, maneki };
}
function wTemps() {
  const m = tempsModel(), t = now();
  const exp = m.shrines.filter((s) => s.expired).length;
  setSub("ov-temps", `${m.shrines.length} santuario${m.shrines.length === 1 ? "" : "s"}${exp ? ` · <span class="down">${exp} caducado${exp > 1 ? "s" : ""}</span>` : ""}${m.active.length ? ` · ${m.active.length} ${m.active.length > 1 ? "temporales activos" : "temporal activo"}` : ""}`);
  const rows = [
    ...m.shrines.map((s) => `<div class="qrow">${Gi(s.name, 16)}<span class="nm">${esc(s.name)}<em class="faint" title="${esc(s.buff)}">${esc(s.buff)}</em></span>
      <span class="at">${s.expired ? `<span class="tag red">caducado</span>` : `quedan <b>${dur(s.left)}</b>`}</span></div>`),
    ...m.active.map((w) => `<div class="qrow">${Gi(w.name, 16, "bolt")}<span class="nm">${esc(w.name)}<em class="faint">activo</em></span><span class="at">acaba en <b data-until="${w.to}">${dur(w.to - t)}</b></span></div>`),
    ...m.maneki.map((k) => `<div class="qrow">${Gi("Maneki Neko", 16)}<span class="nm">Maneki Neko<em class="faint">una comida gratis al día</em></span><span class="at">${k.shaken ? `mañana · ${dur(nextUtcMidnight(t) - t)}` : `<span class="st-tag avail">agítalo hoy</span>`}</span></div>`),
  ];
  if (!rows.length) return Empty("bolt", "Nada temporal", "Aquí salen tus santuarios con lo que les queda, los relojes de arena y tótems activos y el Maneki Neko.");
  return `<div class="qlist">${rows.join("")}</div><div class="mod-f"><span>Santuarios: 7 días (Legendary 1, Obsidian 14, Trading 30) desde que se colocan o renuevan</span><span>collectibleBuilt.ts</span></div>`;
}
