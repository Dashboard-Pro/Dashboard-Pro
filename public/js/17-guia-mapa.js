// SFL Console — Guía (qué hacer ahora, pronto y más adelante, con tu próximo paso) y Mapa de la isla (en Granja).
// Scripts clásicos que comparten el ámbito global en el orden de index.html (antes, un solo app.js).
"use strict";

/* ════════════════════════════════════════════════════════════════════════
   17. Guía
   ════════════════════════════════════════════════════════════════════════
   Junta el plan de acción de Estrategia con lo que dicen las páginas nuevas (animales, excavación, producción,
   simulador) y lo ordena en tres cajones: ahora, pronto y más adelante. Abajo, la próxima expansión y la próxima isla. */

function guideModel() {
  const farm = store.farm.data.farm, t = now();
  const out = { now: [], soon: [], later: [] };
  const add = (when, icon, title, detail, go) => out[when].push({ icon, title, detail, go });
  let recs = [];
  try { recs = recommendations(); } catch (e) { console.error(e); }
  for (const r of recs) add(r.prio === 1 ? "now" : r.prio === 2 ? "soon" : "later", r.icon, r.title, r.detail, r.go);
  // Animales: enfermos (curar o vender), con hambre y los que pierden dinero
  try {
    const a = animalModel();
    const sick = a.all.filter((x) => x.sick);
    const byType = (list) => Object.entries(list.reduce((m, x) => ((m[x.type] = (m[x.type] || 0) + 1), m), {})).map(([k, n]) => `${n} ${(ANIMAL_ES[k] || k).toLowerCase()}${n > 1 ? "s" : ""}`).join(", ");
    const noCure = sick.filter((x) => x.perDay != null && x.perDay <= 0), cure = sick.filter((x) => x.perDay != null && x.perDay > 0);
    if (noCure.length) add("now", "warn", `No cures: ${byType(noCure)}`, `Curar cuesta ${fmt(a.cureCost, 3)} FLOWER y pierden dinero cada día (la comida cuesta más de lo que dan). Véndelas en una bounty de su nivel.`, "animals");
    if (cure.length) add("now", "chicken", `Cura: ${byType(cure)}`, `${fmt(a.cureCost, 3)} FLOWER cada una; se paga en ${fmt(a.cureCost / Math.max(1e-9, Math.min(...cure.map((x) => x.perDay))), 1)} días`, "animals");
    const pet = a.all.filter((x) => x.canLove);
    if (pet.length) add("now", "chicken", `Acaricia ${pet.length} animal${pet.length > 1 ? "es" : ""}`, `+${fmt(pet[0].love, 0)} XP cada caricia: es comida que te ahorras${pet.some((x) => !x.hasTool) ? " · a alguno le falta su herramienta" : ""}`, "animals");
    const hungry = a.all.filter((x) => x.hungry);
    if (hungry.length) add("now", "chicken", `${hungry.length} animal${hungry.length > 1 ? "es" : ""} con hambre`, a.needs.map((n) => `${fmt(n.q, 1)} ${n.food}`).join(" · "), "animals");
    const losing = a.all.filter((x) => !x.sick && x.perDay != null && x.perDay < 0);
    if (losing.length) add("later", "coin", `${losing.length} animal${losing.length > 1 ? "es" : ""} te cuesta${losing.length > 1 ? "n" : ""} dinero`, "Su comida vale más que lo que producen a precios de hoy", "animals");
  } catch { /* sin animales o sin precios */ }
  // Excavación: excavaciones que te quedan hoy
  try {
    if (farm.desert?.digging) {
      const d = digModel();
      if (d.left > 0 && !d.stale) add("now", "crab", `Te quedan ${d.left} excavaciones hoy`, `${d.treasures} de ${d.totalTreasures} tesoros encontrados · la tormenta llega en ${dur(d.storm - t)}`, "dig");
    }
  } catch { /* sin desierto */ }
  // Pesca: sin lanzar hoy
  if (farm.fishing && !toNum(farm.fishing.dailyAttempts?.[todayUTC()])) add("soon", "fish", "Aún no has pescado hoy", "Los lanzamientos del día se pierden a medianoche UTC", null);
  // Simulador: la compra que antes se paga
  try {
    const best = simModel().cands.filter((c) => !c.own && c.days != null && c.days > 0).sort((a, b) => a.days - b.days)[0];
    if (best) add("later", "bolt", `La compra que antes se paga: ${best.label}`, `+${fmt(best.delta, 3)} FLOWER al día · cuesta ${fmt(best.cost, 2)} · se paga en ${fmt(best.days, 0)} días`, "simulator");
  } catch { /* sin precios */ }
  // Expansión: lo que falta
  try {
    const e = expansionModel();
    if (e.next) {
      const miss = e.next.rows.filter((r) => r.miss);
      if (miss.length || e.next.coinsMiss) add("later", "sprout", `Reúne lo que falta para la expansión ${e.next.n}`, [e.next.coinsMiss ? `${compact(e.next.coinsMiss)} coins` : "", ...miss.map((r) => `${fmt(r.miss, 1)} ${r.name}`)].filter(Boolean).join(" · "), "guide");
    }
    if (e.toIsland) add("later", "globe", `Mudarte a ${ISLAND_ES[e.toIsland.to] || e.toIsland.to}`, `Te faltan ${e.toIsland.left} expansiones (pide ${e.toIsland.need})`, "guide");
  } catch { /* sin tabla de expansiones */ }
  return out;
}

function wGuideStage() {
  const farm = store.farm.data.farm;
  const lv = bumpkinLevel(toNum(farm.bumpkin?.experience));
  let prod = null;
  try { prod = prodTotals(prodLines()).total; } catch { /* sin precios */ }
  return `<div class="kstrip">
    ${Kcell("Etapa", esc(ISLAS[farm.island?.type] || farm.island?.type || "—"), "tu isla")}
    ${Kcell("Nivel", fmt(lv.lvl, 0), `${fmt(lv.p * 100, 0)}% hacia el ${lv.lvl + 1}`)}
    ${Kcell("Expansiones", fmt(toNum(farm.inventory?.["Basic Land"]), 0), "terrenos construidos")}
    ${Kcell("Facción", esc(FACTION_ES?.[farm.faction?.name] || farm.faction?.name || "sin facción"), "")}
    ${Kcell("Ganancia al día", prod != null ? `${fmt(prod, 2)} <small>FLOWER</small>` : "—", "lo mejor de cada cosa (Producción)", "sun")}
  </div>`;
}
function wGuideList(when) {
  const list = guideModel()[when];
  const empty = { now: ["check", "Nada urgente", "No hay nada que hacer ya mismo."], soon: ["check", "Todo al día", ""], later: ["check", "Sin objetivos pendientes", ""] }[when];
  setSub(`gd-${when}`, `${list.length} consejo${list.length === 1 ? "" : "s"}`);
  if (!list.length) return Empty(...empty);
  const prio = { now: [1, "YA"], soon: [2, "HOY"], later: [3, "LUEGO"] }[when];
  return list.map((r) => `<div class="rec p${prio[0]}" ${r.go && r.go !== "guide" ? `data-go="${r.go}"` : ""}><span class="rec-prio">${prio[1]}</span>${sprite(r.icon, 16)}
    <div style="min-width:0"><div class="rec-t">${esc(r.title)}</div><div class="rec-d">${esc(r.detail || "")}</div></div>${r.go && r.go !== "guide" ? `<span class="rec-go">→</span>` : ""}</div>`).join("");
}

PAGES.guide = function guide() {
  $("#page").innerHTML = `
    <div class="plate">${Mod({ id: "gd-k", span: 12, flush: true })}</div>
    <div class="plate">
      ${Mod({ id: "gd-now", span: 4, title: "Ahora", icon: "bell", flush: true })}
      ${Mod({ id: "gd-soon", span: 4, title: "Pronto", icon: "sun", flush: true })}
      ${Mod({ id: "gd-later", span: 4, title: "Más adelante", icon: "target", flush: true })}
    </div>
    <div class="plate">
      ${Mod({ id: "gd-exp", span: 7, title: "Próxima expansión", icon: "sprout" })}
      ${Mod({ id: "gd-isl", span: 5, title: "Próxima isla", icon: "globe" })}
    </div>`;
  const soft = ["activity", "myBoosts", "flowerRecipes", "friendHist"];
  mount("gd-k", { deps: ["farm"], soft, render: wGuideStage, loading: "block" });
  for (const w of ["now", "soon", "later"]) mount(`gd-${w}`, { deps: ["farm"], soft, render: () => wGuideList(w), loading: "rows" });
  mount("gd-exp", { deps: ["farm"], soft: ["activity"], render: wExpNext, loading: "rows" });
  mount("gd-isl", { deps: ["farm"], soft: ["activity"], render: wExpIsland, loading: "rows" });
};
PAGE_META.guide = { title: "Plan de hoy", sub: () => `${staleNote()}Tu granja de un vistazo: qué hacer ahora, pronto y más adelante, y lo que te falta para crecer` };

/* ════════════════════════════════════════════════════════════════════════
   18. Mapa de la isla (dentro de la página Granja)
   ════════════════════════════════════════════════════════════════════════
   Cada parcela, nodo, edificio y decoración en su sitio (coordenadas de la granja; el juego cuenta y hacia arriba).
   Lo que tiene temporizador sale con su progreso y lo que está listo, marcado. */
const MAP_LAYERS = [["res", "Recursos"], ["crops", "Cultivos"], ["build", "Edificios"], ["deco", "Decoración"]];
const MAP_KIND_LAYER = { crops: "crops", fruits: "crops", flowers: "crops", greenhouse: "crops" };
const NODE_PART = { crops: ["crops", "crop"], fruits: ["fruitPatches", "fruit"], trees: ["trees", "wood"], stones: ["stones", "stone"], iron: ["iron", "stone"],
  gold: ["gold", "stone"], crimstones: ["crimstones", "stone"], sunstones: ["sunstones", "stone"], oil: ["oilReserves", "oil"] };
const NODE_ITEM = { trees: "Wood", stones: "Stone", iron: "Iron", gold: "Gold", crimstones: "Crimstone", sunstones: "Sunstone", oil: "Oil", bees: "Honey" };

function mapModel() {
  const f = store.farm.data, farm = f.farm;
  const items = [];
  // Lo que da cada nodo al cosecharlo: la granja guarda la cantidad ya decidida (amount); si no, la media con tus boosts
  const amountOf = (n) => {
    const [obj, part] = NODE_PART[n.kind] || [];
    const node = obj && n.timer?.id != null ? farm[obj]?.[n.timer.id] : null;
    // Nodo a nodo con las fórmulas del juego (exacto en petróleo y crimstone). El "amount" que guardan algunos nodos es de
    // versiones antiguas del juego (ya no se actualiza: la cantidad se calcula al recoger), así que no se usa.
    const ex = n.timer ? nextNodeYield(n.kind, node, farm) : null;
    if (ex != null) return Math.round(ex * 100) / 100;
    if (n.kind === "crops") return n.timer ? yieldOf("crops", n.name) ?? 1 : null;
    if (n.kind === "fruits") return n.timer ? yieldOf("fruits", n.name) ?? 1 : null;
    const item = NODE_ITEM[n.kind];
    return item && n.timer ? yieldOf("resources", item) ?? 1 : null;
  };
  for (const n of f.nodes) {
    items.push({ layer: MAP_KIND_LAYER[n.kind] || "res", kind: n.kind, name: n.name, x: n.x, y: n.y, w: n.w, h: n.h, timer: n.timer,
      icon: n.kind === "crops" || n.kind === "fruits" || n.kind === "flowers" ? (n.timer ? n.name : null) : NODE_ITEM[n.kind] || n.name, amount: amountOf(n) });
  }
  for (const [name, list] of Object.entries(farm.buildings || {})) {
    for (const b of list || []) {
      const c = b?.coordinates;
      if (!c || b.removedAt) continue;
      const [w, h] = G.itemDims?.[name] || [2, 2];
      items.push({ layer: "build", kind: "build", name, x: toNum(c.x), y: toNum(c.y), w, h, icon: name });
    }
  }
  for (const [name, list] of Object.entries(farm.collectibles || {})) {
    for (const b of list || []) {
      const c = b?.coordinates;
      if (!c) continue;
      const [w, h] = G.itemDims?.[name] || [1, 1];
      items.push({ layer: "deco", kind: "deco", name, x: toNum(c.x), y: toNum(c.y), w, h, icon: name, boost: G.buffs?.[name] });
    }
  }
  return items;
}

function wMapKpis() {
  const items = mapModel(), t = now();
  const rows = {};
  for (const it of items.filter((x) => x.layer === "res" || x.layer === "crops")) {
    const key = it.kind === "crops" || it.kind === "fruits" || it.kind === "flowers" ? `${it.kind}|${it.timer ? it.name : "—"}` : it.kind;
    const r = (rows[key] ||= { kind: it.kind, name: it.kind in NODE_ITEM ? CATS[it.kind]?.label || it.kind : it.timer ? it.name : `${CATS[it.kind]?.label || it.kind} libres`, n: 0, ready: 0, next: null, amount: 0, hasAmt: false });
    r.n++;
    if (it.timer) { if (it.timer.ready <= t) r.ready++; else if (!r.next || it.timer.ready < r.next) r.next = it.timer.ready; }
    if (it.amount != null) { r.amount += it.amount; r.hasAmt = true; }
  }
  const list = Object.values(rows).sort((a, b) => (CATS[a.kind]?.label || "").localeCompare(CATS[b.kind]?.label || "") || b.n - a.n);
  if (!list.length) return Empty("tree", "Sin coordenadas", "La API no devolvió posiciones para esta isla.");
  return `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Recurso</th><th class="r">Cuántos</th><th class="r">Listos</th><th class="r">El próximo</th><th class="r" data-tip="Te dará|Lo que darán al cosecharlos: la cantidad que ya guarda la granja o la media con tus boosts|" tabindex="0">Te dará</th></tr></thead><tbody>
    ${list.map((r) => `<tr><td>${/ libres$/.test(r.name) ? sprite(CATS[r.kind]?.spr || "sprout", 16) : Gi(NODE_ITEM[r.kind] || r.name, 16, CATS[r.kind]?.spr)} ${esc(r.name)}</td><td class="r mono">${r.n}</td>
      <td class="r mono ${r.ready ? "up" : "dim"}">${r.ready}</td><td class="r mono">${r.next ? dur(r.next - t) : r.ready ? "todo listo" : "—"}</td>
      <td class="r mono">${r.hasAmt ? fmt(r.amount, 2) : "—"}</td></tr>`).join("")}</tbody></table></div>`;
}

function wIslandMap(el) {
  const items = mapModel().filter((it) => S.mapLayers.has(it.layer));
  if (!items.length) return Empty("tree", "Nada que dibujar", "Activa alguna capa o esta granja no trae coordenadas.");
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const n of items) { minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x + n.w - 1); maxY = Math.max(maxY, n.y); minY = Math.min(minY, n.y - n.h + 1); }
  const pad = 1, cols = maxX - minX + 1 + pad * 2, rows = maxY - minY + 1 + pad * 2;
  const avail = Math.max(300, (el.clientWidth || 900) - 24);
  const T = Math.max(8, Math.floor((avail / cols) * S.mapZoom));
  const t = now();
  const html = items.sort((a, b) => (a.layer === "deco") - (b.layer === "deco")).map((n) => {
    const x = (n.x - minX + pad) * T, y = (maxY - n.y + pad) * T, w = n.w * T, h = n.h * T;
    const tm = n.timer, ready = tm && tm.ready <= t;
    const p = tm ? clamp01((t - tm.start) / Math.max(1, tm.ready - tm.start)) : 1;
    const color = n.layer === "build" ? "#6b4a2b" : n.layer === "deco" ? "#3a4a33" : CATS[n.kind]?.color || "#555";
    const dim = (S.mapReady && !ready) || (S.farmFilter && n.kind !== S.farmFilter) ? " dim" : "";
    const tip = `${esc(n.layer === "build" ? "Edificio" : n.layer === "deco" ? "Decoración" : CATS[n.kind]?.label || "")}|${esc(n.name)}${tm?.note ? " · " + esc(tm.note) : ""}${n.amount != null ? ` · dará ${fmt(n.amount, 2)}` : ""}${n.boost ? " · " + esc(n.boost) : ""}|${tm ? (ready ? "¡Listo para recoger!" : `listo ${at(tm.ready)} · en ${dur(tm.ready - t)}`) : n.layer === "crops" || n.layer === "res" ? "libre" : ""}`;
    const ic = n.icon && T >= 12 ? Gi(n.icon, Math.max(10, Math.min(48, Math.round(Math.min(w, h) * 0.72))), "") : "";
    const label = !ic && T >= 18 && tm && !ready ? `<span>${dur(tm.ready - t).replace(/ .*/, "")}</span>` : "";
    return `<div class="mp-i ${n.layer}${ready ? " rdy" : ""}${dim}" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px;--c:${color};--p:${(p * 100).toFixed(0)}%" data-tip="${tip}">${ic}${label}</div>`;
  }).join("");
  return `<div class="mp-wrap"><div class="mp" style="width:${cols * T}px;height:${rows * T}px;--t:${T}px">${html}</div></div>
    <div class="maplegend"><span><i style="background:#6fbf4a"></i>creciendo (barra = progreso)</span><span><i style="background:none;box-shadow:inset 0 0 0 2px var(--sun)"></i>listo</span>
      <span><i style="background:#6b4a2b"></i>edificio</span><span><i style="background:#3a4a33"></i>decoración</span><span class="faint">pasa el ratón por encima para ver qué es</span></div>`;
}
ACTIONS.maplayer = (k) => { S.mapLayers.has(k) ? S.mapLayers.delete(k) : S.mapLayers.add(k); writeLS("mapLayers", [...S.mapLayers]); go("farm"); };
// Botones del mapa (en la cabecera del módulo de Granja): capas, zoom y resaltar lo listo
const mapControls = () => `<div class="seg">${MAP_LAYERS.map(([k, l]) => `<button data-act="maplayer:${k}" class="${S.mapLayers.has(k) ? "on" : ""}">${l}</button>`).join("")}</div>
  <div class="seg"><button data-act="mapzoom:-" aria-label="Alejar">−</button><button data-act="mapzoom:+" aria-label="Acercar">+</button></div>
  <label class="toggle"><input type="checkbox" data-act="mapready" ${S.mapReady ? "checked" : ""}/><i></i>Lo listo</label>`;
ACTIONS.mapzoom = (d) => { S.mapZoom = Math.max(0.5, Math.min(4, S.mapZoom * (d === "+" ? 1.5 : 1 / 1.5))); rerun(); };
ACTIONS.mapready = (v, el) => { S.mapReady = el.checked; rerun(); };
