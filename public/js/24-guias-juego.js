// SFL Console — Guías del juego: Coleccionables, Crafteo, Edificios, Expansiones, Nivel Bumpkin, Entregas de NPCs y
// Tiendas. Tablas del código del juego (gamedata.js) y de sfl.world (crafteo y pedidos de NPCs) con los precios de hoy.
// Scripts clásicos que comparten el ámbito global en el orden de index.html.
"use strict";

// Coste en FLOWER de una lista de items + coins; unknown = los que no tienen precio
function costFlw(items = {}, coins = 0) {
  let v = coins ? coins / coinRate() : 0;
  const unknown = [];
  for (const [n, q] of Object.entries(items)) {
    const p = n === "Gem" ? flowerPerGem() : gPrice(n);
    if (p == null) unknown.push(n); else v += p * q;
  }
  return { v, unknown, ok: !unknown.length };
}
const itemsTxt = (items = {}, coins = 0, size = 12) =>
  [coins ? `${Gi("Coins", size, "coin")} ${compact(coins)}` : "", ...Object.entries(items).map(([n, q]) => `${Gi(n, size)} ${fmt(q, q % 1 ? 1 : 0)}`)].filter(Boolean).join(" ") || "—";
const costCell = (c) => (c.v || c.ok ? `${fmt(c.v, c.v < 1 ? 3 : 2)}${c.ok ? "" : `<span class="faint" title="Sin precio: ${esc(c.unknown.join(", "))}">*</span>`}` : "—");
// Tarjetas de las guías (Crafteo, Comida procesada, Crustáceos, Utilidades, Santuarios): icono grande, lo que pide con
// lo que tienes y unas cifras abajo. Lo que puedes hacer ya va siempre primero (canFirst) y con el borde verde.
const canFirst = (a, b) => Number((b.can || 0) > 0) - Number((a.can || 0) > 0);
const IngList = (items, mult = 1, coins = 0) => `<div class="cb-ing">${coins ? (() => { const have = gFarm() ? toNum(gFarm().coins) : null; return `<div>${Gi("Coins", 22, "coin")}<span>Coins</span><b class="${have == null ? "" : have >= coins * mult ? "up" : "down"}">${compact(coins * mult)}</b></div>`; })() : ""}${Object.entries(items || {}).map(([n, q]) => {
  const need = q * mult, have = gFarm() ? haveOf(n) : null;
  return `<div title="${have == null ? "" : `tienes ${fmt(have, have % 1 ? 1 : 0)}`}">${Gi(n, 22)}<span>${esc(n)}</span><b class="${have == null ? "" : have >= need ? "up" : "down"}">×${fmt(need, need % 1 ? 1 : 0)}</b></div>`;
}).join("") || (coins ? "" : `<div class="faint">nada</div>`)}</div>`;
const CardStats = (cells) => `<div class="cb-stats" style="grid-template-columns:repeat(${cells.length},1fr)">${cells.map(([l, v, cls = ""]) => `<div><span>${l}</span><b class="${cls}">${v}</b></div>`).join("")}</div>`;
const ItemCard = ({ icon, iconHtml, name, tags = "", sub = "", body, stats, can }) => `<div class="cb-card${can > 0 ? " can" : ""}">
  <div class="cb-head">${iconHtml || Gi(icon || name, 40)}<div style="min-width:0"><b>${esc(name)}</b>${tags}${sub ? `<div class="ctx">${sub}</div>` : ""}</div></div>
  <div class="cb-body">${body}</div>${stats ? CardStats(stats) : ""}</div>`;
// Retrato de un NPC con su ropa del juego (npcs.ts) para las tarjetas, o null si no lo conocemos
const npcFace = (npc) => { const look = G.npcLooks?.[String(npc || "").toLowerCase()]; return look ? `<img class="npc-face" src="${esc(bumpkinImageUrl(look, 100))}" alt="" width="52" height="52" loading="lazy" onerror="this.remove()">` : null; };
const canMake = (items, mult = 1, coins = 0) => (gFarm() ? Math.min(...Object.entries(items || {}).map(([k, q]) => Math.floor(haveOf(k) / (q * mult))), coins ? Math.floor(toNum(gFarm().coins) / (coins * mult)) : Infinity, Infinity) : null);
const gTabs = (key, cur, opts) => `<div class="seg">${opts.map(([v, l]) => `<button data-act="${key}:${esc(String(v))}" class="${String(cur) === String(v) ? "on" : ""}">${l}</button>`).join("")}</div>`;
// Buscadores de las guías: fuera del cuerpo del módulo (en la cabecera), data-inp="acción"
document.addEventListener("input", (e) => {
  const el = e.target.closest?.("[data-inp]");
  if (el) ACTIONS[el.dataset.inp]?.(el.value, el, e);
});
const marketOnly = (name) => { if (!has("activity")) return null; const p = priceBook()(name); return p.src === "mercado" ? p.v : null; };

/* ════════════════════════════════════════════════════════════════════════
   Coleccionables — todos los NFT (coleccionables colocables y prendas): boost, retiro (withdrawables.ts) y precio
   ════════════════════════════════════════════════════════════════════════ */
S.gcol = { kind: "all", boost: "all", wd: "all", own: "all", sort: "name", q: "", ...readLS("gcol", {}) };
const WD_ES = { yes: ["Se puede retirar", "green"], soon: ["Más adelante", "sun"], trade: ["Solo intercambio", ""], no: ["No se puede retirar", "red"] };
function releaseOf(name) {
  const r = G.releases?.[name], t = now();
  if (!r) return { k: "no" };
  if (r.withdraw && r.withdraw <= t) return { k: "yes" };
  if (r.withdraw) return { k: "soon", at: r.withdraw };
  return r.trade ? { k: "trade" } : { k: "no" };
}
function collectionModel() {
  const farm = gFarm();
  const rows = [
    ...(G.nftCollectibles || []).map((name) => ({ name, kind: "collectible" })),
    ...Object.keys(G.wearableIds || {}).map((name) => ({ name, kind: "wearable" })),
  ].map((r) => {
    const buff = G.buffs?.[r.name];
    const own = farm ? toNum(r.kind === "wearable" ? farm.wardrobe?.[r.name] : farm.inventory?.[r.name]) : 0;
    return { ...r, buff: Array.isArray(buff) ? buff.join(" · ") : buff || "", rel: releaseOf(r.name), price: marketOnly(r.name), own };
  });
  return { rows };
}
function wGuideCollect() {
  const d = collectionModel(), f = S.gcol, q = f.q.trim().toLowerCase();
  const list = d.rows.filter((r) => (f.kind === "all" || r.kind === f.kind) && (f.boost === "all" || (f.boost === "boost") === Boolean(r.buff))
    && (f.wd === "all" || r.rel.k === f.wd) && (f.own === "all" || r.own > 0) && (!q || r.name.toLowerCase().includes(q) || r.buff.toLowerCase().includes(q)));
  const sorters = { name: (a, b) => a.name.localeCompare(b.name), cheap: (a, b) => (a.price ?? 1e12) - (b.price ?? 1e12), dear: (a, b) => (b.price ?? -1) - (a.price ?? -1) };
  const bal = gFarm() ? toNum(gFarm().balance) : null;
  for (const r of list) { r.afford = bal != null && r.price != null && !r.own && r.price <= bal; r.can = r.own > 0 ? 2 : r.afford ? 1 : 0; }
  list.sort((x, y) => (y.can - x.can) || (sorters[f.sort] || sorters.name)(x, y));
  const mine = d.rows.filter((r) => r.own > 0), worth = mine.reduce((s, r) => s + (r.price || 0) * r.own, 0);
  const wdNow = mine.filter((r) => r.rel.k === "yes").reduce((s, r) => s + (r.price || 0) * r.own, 0);
  const count = (k) => d.rows.filter((r) => r.rel.k === k).length;
  const shown = list.slice(0, 150);
  return `<div class="kstrip">
      ${Kcell("En el juego", fmt(d.rows.length, 0), `${fmt(d.rows.filter((r) => r.kind === "collectible").length, 0)} coleccionables · ${fmt(d.rows.filter((r) => r.kind === "wearable").length, 0)} prendas`)}
      ${Kcell("Con boost", fmt(d.rows.filter((r) => r.buff).length, 0), "el resto es decoración")}
      ${Kcell("Tuyos", gFarm() ? fmt(mine.length, 0) : "—", gFarm() ? `valen ${fmt(worth, 1)} FLOWER a floor` : "", "sun")}
      ${Kcell("Retirables ya", gFarm() ? `${fmt(wdNow, 1)}<small>FLW</small>` : fmt(count("yes"), 0), gFarm() ? "de lo tuyo, a floor" : "objetos que se pueden sacar del juego")}
    </div>
    <div class="toolbar" style="padding:8px 12px;flex-wrap:wrap;gap:8px">
      ${gTabs("gcf", `kind|${f.kind}`, [["kind|all", "Todo"], ["kind|collectible", "Coleccionables"], ["kind|wearable", "Prendas"]])}
      ${gTabs("gcf", `boost|${f.boost}`, [["boost|all", "Con y sin boost"], ["boost|boost", "Con boost"], ["boost|deco", "Decorativos"]])}
      ${gTabs("gcf", `wd|${f.wd}`, [["wd|all", "Cualquier retiro"], ...Object.entries(WD_ES).map(([k, [l]]) => [`wd|${k}`, `${l} ${count(k)}`])])}
      ${gFarm() ? gTabs("gcf", `own|${f.own}`, [["own|all", "Todos"], ["own|mine", "Los míos"]]) : ""}
      ${gTabs("gcf", `sort|${f.sort}`, [["sort|name", "Nombre"], ["sort|cheap", "Más baratos"], ["sort|dear", "Más caros"]])}
    </div>
    <div class="cb-cards">${shown.map((r) => `<div ${r.kind === "wearable" && G.wearableIds[r.name] != null ? `data-open="wearables-${G.wearableIds[r.name]}"` : G.itemIds?.[r.name] != null ? `data-open="collectibles-${G.itemIds[r.name]}"` : ""} style="cursor:pointer;display:contents">${ItemCard({ name: r.name, can: r.can,
      tags: `<span class="tag">${r.kind === "wearable" ? "prenda" : "coleccionable"}</span>${r.own ? `<span class="tag green">tienes ${fmt(r.own, 0)}</span>` : r.afford ? `<span class="tag sun">te llega</span>` : ""}`,
      sub: esc(r.buff) || `<span class="faint">decorativo</span>`,
      body: `<div class="ctx"><span class="tag ${WD_ES[r.rel.k][1]}">${WD_ES[r.rel.k][0]}${r.rel.at ? ` · ${new Date(r.rel.at).toLocaleDateString(LOCALE, { day: "numeric", month: "short", year: "numeric" })}` : ""}</span></div>`,
      stats: [["Floor", r.price == null ? "—" : fmt(r.price, r.price < 1 ? 3 : 2)], ["Tienes", r.own ? fmt(r.own, 0) : "—", r.own ? "up" : "dim"], ["Valen los tuyos", r.own && r.price ? fmt(r.price * r.own, 2) : "—"]] })}</div>`).join("")}</div>
    <div class="mod-f"><span>Primero lo tuyo y lo que te llega con tu FLOWER · ${list.length > shown.length ? `mostrando ${shown.length} de ${fmt(list.length, 0)}: afina con los filtros o el buscador` : `${fmt(list.length, 0)} resultados`}</span><span>Fechas de retiro: withdrawables.ts del juego</span></div>`;
}
ACTIONS.gcf = (v) => { const [k, x] = v.split("|"); S.gcol[k] = x; writeLS("gcol", { ...S.gcol, q: "" }); rerun(); };
ACTIONS.gcq = (v) => { S.gcol.q = v; rerun(); };

/* ════════════════════════════════════════════════════════════════════════
   Crafteo — recetas de la Crafting Box (rejilla 3×3, de sfl.world)
   ════════════════════════════════════════════════════════════════════════ */
S.gcraftGrp = readLS("gcraftGrp", "");
function craftBoxModel() {
  const groups = has("craftRecipes") ? store.craftRecipes.data : [];
  const recipes = Object.fromEntries(groups.flatMap((g) => g.recipes.map((r) => [r.name, r])));
  const memo = {};
  // Coste de un ingrediente: su floor; si no se vende y es otra receta de la caja, lo que cuesta fabricarla
  const unit = (name, depth = 0) => {
    if (memo[name] !== undefined) return memo[name];
    let v = gPrice(name);
    if (v == null && recipes[name] && depth < 5) {
      const parts = recipes[name].grid.filter(Boolean).map((n) => unit(n, depth + 1));
      v = parts.some((x) => x == null) ? null : parts.reduce((a, b) => a + b, 0);
    }
    return (memo[name] = v);
  };
  const farm = gFarm();
  const rows = groups.map((g) => ({ name: g.name, recipes: g.recipes.map((r) => {
    const counts = {};
    for (const n of r.grid) if (n) counts[n] = (counts[n] || 0) + 1;
    let cost = 0, ok = true;
    for (const [n, q] of Object.entries(counts)) { const u = unit(n); if (u == null) ok = false; else cost += u * q; }
    const market = marketOnly(r.name);
    const can = farm ? Math.min(...Object.entries(counts).map(([n, q]) => Math.floor(haveOf(n) / q))) : 0;
    return { ...r, counts, cost: ok ? cost : null, partial: !ok ? cost : null, market, margin: ok && market != null ? market * 0.9 - cost : null, can, have: farm ? haveOf(r.name) : 0 };
  }) }));
  return { rows, loaded: has("craftRecipes") };
}
function wGuideCraft() {
  const d = craftBoxModel();
  if (!d.loaded || !d.rows.length) return Empty("hammer", "Sin recetas", "Las recetas de la Crafting Box salen de sfl.world y no han cargado. Vuelve a probar en un rato.");
  const grp = d.rows.some((g) => g.name === S.gcraftGrp) ? S.gcraftGrp : "";
  const list = d.rows.filter((g) => !grp || g.name === grp);
  const grid = (r) => `<div class="cb-grid">${r.grid.map((n) => `<span${n ? ` data-tip="${esc(n)}||"` : ""}>${n ? Gi(n, 28) : ""}</span>`).join("")}</div>`;
  const costTxt = (r) => (r.cost != null ? fmt(r.cost, 3) : r.partial ? `${fmt(r.partial, 3)}<span class="faint" title="Hay ingredientes sin precio">*</span>` : "—");
  return `<div class="toolbar" style="padding:8px 12px">${gTabs("gcg", grp, [["", `Todas ${d.rows.reduce((s, g) => s + g.recipes.length, 0)}`], ...d.rows.map((g) => [g.name, `${g.name} ${g.recipes.length}`])])}</div>
    ${list.map((g) => `<div class="grp">${esc(g.name)} <span class="faint">${g.recipes.length}</span></div><div class="cb-cards">
      ${[...g.recipes].sort((a, b) => canFirst(a, b) || (b.margin ?? -Infinity) - (a.margin ?? -Infinity)).map((r) => `<div class="cb-card${r.can ? " can" : ""}">
        <div class="cb-head">${Gi(r.name, 40)}<div><b>${esc(r.name)}</b>${r.have ? `<span class="tag">tienes ${fmt(r.have, 0)}</span>` : ""}</div></div>
        <div class="cb-body">${grid(r)}
          <div class="cb-ing">${Object.entries(r.counts || {}).map(([n, q]) => `<div>${Gi(n, 22)}<span>${esc(n)}</span><b>×${fmt(q, 0)}</b></div>`).join("")}</div></div>
        <div class="cb-stats"><div><span>Coste</span><b>${costTxt(r)}</b></div><div><span>Floor</span><b>${r.market == null ? "—" : fmt(r.market, 3)}</b></div>
          <div><span>Margen</span><b class="${r.margin == null ? "" : r.margin > 0 ? "up" : "down"}">${r.margin == null ? "—" : fmt(r.margin, 3)}</b></div>
          <div><span>Puedes hacer</span><b class="${r.can ? "up" : "dim"}">${gFarm() ? fmt(r.can, 0) : "—"}</b></div></div>
      </div>`).join("")}</div>`).join("")}
    <div class="mod-f"><span>Primero lo que puedes hacer ya · la posición en la rejilla importa: la caja compara la forma · coste = ingredientes a floor (si no se venden y son otra receta, lo que cuesta hacerla)</span><span>Margen = floor −10% de comisión − coste · recetas de sfl.world</span></div>`;
}
ACTIONS.gcg = (v) => { S.gcraftGrp = v; writeLS("gcraftGrp", v); rerun(); };

/* ════════════════════════════════════════════════════════════════════════
   Edificios — construir y mejorar (buildings.ts, upgradeBuilding.ts), compostadores y pozo de lava
   ════════════════════════════════════════════════════════════════════════ */
S.gbTab = readLS("gbTab", "buildings");
const expandPet = (items) => {
  const out = { ...items }, n = out._petFetches;
  if (n) { delete out._petFetches; for (const r of Object.values(G.pets?.fetchByCategory || {})) out[r] = (out[r] || 0) + n; }
  return out;
};
function wGuideBuildings() {
  const farm = gFarm(), tab = S.gbTab;
  const tabs = gTabs("gbt", tab, [["buildings", "Edificios"], ["compost", "Compostadores"], ["lava", "Pozo de lava"]]);
  if (tab === "compost") {
    const C = G.composters || {}, season = farm?.season?.season;
    return `<div class="toolbar" style="padding:8px 12px">${tabs}</div>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Compostador</th><th>Da</th><th class="r">Tarda</th><th>Gusano</th>${Object.keys(SEASON_ES2).map((s) => `<th class="${s === season ? "up" : ""}">${SEASON_ES2[s]}</th>`).join("")}</tr></thead><tbody>
      ${Object.entries(C.details || {}).map(([name, x]) => `<tr><td class="w">${Gi(name, 18)} ${esc(name)}</td><td>${Gi(x.produce, 14)} ${x.produceAmount} ${esc(x.produce)}</td>
        <td class="r mono">${dur(x.timeToFinishMilliseconds)}</td><td>${Gi(x.worm, 14)} ${esc(x.worm)}</td>
        ${Object.keys(SEASON_ES2).map((s) => { const req = C.seasons?.[name]?.[s] || {}, c = costFlw(req); return `<td class="ctx${s === season ? " up" : ""}">${itemsTxt(req)}<div class="faint">${costCell(c)} FLW</div></td>`; }).join("")}</tr>`).join("")}
      </tbody></table></div>
      <div class="mod-f"><span>Cada tanda pide lo de la estación (en verde, la de ahora) · con ${Object.values(C.details || {})[0]?.resourceBoostRequirements || 10}+ de un recurso de boost acelera la tanda</span><span>coste a floor</span></div>`;
  }
  if (tab === "lava") {
    const L = G.lavaPit || {}, season = farm?.season?.season;
    const pits = farm ? Object.keys(farm.lavaPits || {}).length : 0;
    return `<div class="toolbar" style="padding:8px 12px">${tabs}</div>
      <div class="kstrip">${Kcell("Tarda", `${fmt(L.hours || 72, 0)}<small>h</small>`, "por tanda")}${Kcell("Da", `${Gi("Obsidian", 18)} 1 Obsidian`, `floor ${marketOnly("Obsidian") != null ? fmt(marketOnly("Obsidian"), 2) : "—"} FLW`, "sun")}${Kcell("Tus pozos", farm ? fmt(pits, 0) : "—", "en la isla del volcán")}</div>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Estación</th><th>Pide</th><th class="r">Coste</th><th class="r">Obsidian (floor)</th><th class="r">Margen</th></tr></thead><tbody>
      ${Object.entries(L.seasons || {}).map(([s, req]) => { const c = costFlw(req), o = marketOnly("Obsidian"); return `<tr class="${s === season ? "" : "dim"}"><td class="w">${SEASON_ES2[s] || s}${s === season ? ` <span class="tag green">ahora</span>` : ""}</td>
        <td class="ctx wrap">${itemsTxt(req)}</td><td class="r mono">${costCell(c)}</td><td class="r mono">${o == null ? "—" : fmt(o, 3)}</td><td class="r mono ${o != null && c.ok ? (o * 0.9 - c.v > 0 ? "up" : "down") : ""}">${o != null && c.ok ? fmt(o * 0.9 - c.v, 3) : "—"}</td></tr>`; }).join("")}
      </tbody></table></div><div class="mod-f"><span>Margen = Obsidian a floor −10% − lo que pide</span></div>`;
  }
  const rows = Object.entries(G.buildings || {}).filter(([, b]) => b.level != null).map(([name, b]) => {
    const ups = Object.entries(G.buildingUpgrades?.[name] || {}).filter(([lv]) => Number(lv) > 1).map(([lv, u]) => {
      const items = expandPet(u.items || {});
      return { lv: Number(lv), coins: u.coins || 0, items, secs: (u.upgradeTime || 0) / 1000, req: u.requiredLevel?.level, c: costFlw(items, u.coins) };
    });
    // Water Well / Pet House: el nivel 1 del juego es la construcción; si trae coste propio se usa en vez de BUILDINGS
    const base = G.buildingUpgrades?.[name]?.[1];
    const coins = base?.coins || b.coins, items = base && Object.keys(base.items || {}).length ? expandPet(base.items) : b.items;
    const c = costFlw(items, coins);
    const total = [c, ...ups.map((u) => u.c)].reduce((a, x) => ({ v: a.v + x.v, ok: a.ok && x.ok, unknown: [...a.unknown, ...x.unknown] }), { v: 0, ok: true, unknown: [] });
    const built = farm ? (farm.buildings?.[name] || []).length : 0, myLv = farm ? toNum(farm.buildings?.[name]?.[0]?.level) || (built ? 1 : 0) : 0;
    return { name, level: b.level, secs: b.secs, coins, items, c, ups, total, built, myLv };
  }).sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
  const lvl = farm ? bumpkinLevel(toNum(farm.bumpkin?.experience)).lvl : null;
  // Lo siguiente que puedes hacer: construirlo si no lo tienes, o su próxima mejora
  const next = (r) => (!r.built ? { what: "construir", items: r.items, coins: r.coins, c: r.c, secs: r.secs, req: r.level } : r.ups.find((u) => u.lv > r.myLv) ? { what: `mejorar a nivel ${r.ups.find((u) => u.lv > r.myLv).lv}`, ...r.ups.find((u) => u.lv > r.myLv) } : null);
  const cards = rows.map((r) => { const n = next(r); return { ...r, next: n, can: n && (lvl == null || lvl >= (n.req || 0)) ? canMake(n.items, 1, n.coins) : 0 }; })
    .sort((x, y) => canFirst(x, y) || Number(!!y.next) - Number(!!x.next) || x.level - y.level);
  return `<div class="toolbar" style="padding:8px 12px">${tabs}</div>
    <div class="cb-cards">${cards.map((r) => ItemCard({ name: r.name, can: r.can,
      tags: r.built ? `<span class="tag green">${r.ups.length ? `nivel ${r.myLv}` : r.built > 1 ? `×${r.built}` : "lo tienes"}</span>` : lvl != null && lvl < r.level ? `<span class="tag">pide nivel ${r.level}</span>` : "",
      sub: r.next ? `Siguiente: ${r.next.what}${r.next.req ? ` · nivel Bumpkin ${r.next.req}` : ""}${r.next.secs ? ` · ${dur(r.next.secs * 1000)}` : ""}` : "completo",
      body: r.next ? IngList(r.next.items, 1, r.next.coins) : `<div class="ctx">Lo tienes al máximo.</div>`,
      stats: [["Siguiente", r.next ? costCell(r.next.c) : "—"], ["Todo", r.ups.length ? costCell(r.total) : costCell(r.c)], ["Mejoras", r.ups.length ? `${Math.max(0, r.myLv - 1)}/${r.ups.length}` : "—"], ["Puedes", r.next ? (r.can ? "sí" : "no") : "—", r.can ? "up" : "dim"]],
    })).join("")}</div>
    <div class="mod-f"><span>Primero lo que puedes construir o mejorar ya · coste = coins a ${fmt(coinRate(), 0)}/FLOWER + ingredientes a floor · * = hay ingredientes sin precio</span><span>Datos: buildings.ts y upgradeBuilding.ts</span></div>`;
}
ACTIONS.gbt = (v) => { S.gbTab = v; writeLS("gbTab", v); rerun(); };

/* ════════════════════════════════════════════════════════════════════════
   Expansiones — calculadora: mapa de la isla con cada parcela (posiciones de EXPANSION_ORIGINS del juego), de dónde
   partes y hasta dónde quieres llegar, boosts que se pueden probar, nodos que ganas y lo que te falta con su precio y
   cuánto tardas en sacarlo con tus nodos. Idea de mapa como sfl-calculator.com/en/expansion.
   ════════════════════════════════════════════════════════════════════════ */
S.geIsland = readLS("geIsland", "");
S.ge = { start: null, target: null, island: null, ov: {}, hl: "" };
// Espiral de parcelas del juego (expansion/lib/constants.ts → spiralOrigins): la 1 en el centro, la 2 a la derecha y
// luego subiendo por la derecha, a la izquierda por arriba, bajando por la izquierda y a la derecha por abajo
function landOrigins(count) {
  const out = [{ x: 0, y: 0 }];
  for (let r = 1; out.length < count; r++) {
    for (let y = -(r - 1); y <= r; y++) out.push({ x: r, y });
    for (let x = r - 1; x >= -r; x--) out.push({ x, y: r });
    for (let y = r - 1; y >= -r; y--) out.push({ x: -r, y });
    for (let x = -r + 1; x <= r; x++) out.push({ x, y: -r });
  }
  return out.slice(0, count);
}
// Recurso de una expansión → nodo que lo da (para el rendimiento por ronda)
const EXP_NODE = { Wood: "Tree", Stone: "Stone Rock", Iron: "Iron Rock", Gold: "Gold Rock", Crimstone: "Crimstone Rock", Oil: "Oil Reserve", Sunstone: "Sunstone Rock" };
const EXP_REC = { Wood: "tree", Stone: "stone", Iron: "iron", Gold: "gold", Crimstone: "crimstone", Oil: "oil", Sunstone: "sunstone" };
const EXP_BOOSTS = [
  ["grinx", "Grinx's Hammer", "−50% recursos (menos gemas)"],
  ["vip", "VIP", "−20% coins (mín. 500)"],
  ["vipTime", "VIP en Ascension Age", "−10% de obra"],
  ["monument", "Ascension Monument", "−20% de obra"],
];

function geModel() {
  const farm = gFarm(), myIsland = farm?.island?.type || "basic", count = farm ? toNum(farm.inventory?.["Basic Land"]) : 0;
  const islands = Object.keys(G.expansions || {});
  const isl = islands.includes(S.geIsland) ? S.geIsland : islands.includes(myIsland) ? myIsland : islands[0];
  const table = G.expansions?.[isl] || {};
  const nums = Object.keys(table).map(Number).sort((a, b) => a - b);
  const mine = Boolean(farm) && isl === myIsland;
  // Tope de cada isla (ISLAND_MAX_EXPANSION = las que pide subir de isla): las filas de más son antiguas y ya no se pueden
  // hacer; si tu granja se quedó por encima (legado), se enseña hasta donde llegas
  const cap = G.islandUpgrade?.[isl]?.expansions;
  const first = nums[0] ?? 1, base = first - 1;
  const last = Math.max(Math.min(nums.at(-1) ?? 1, cap || Infinity), mine ? count : 0);
  // Inicio y objetivo: al cambiar de isla vuelven a tu granja (o al principio de la isla)
  if (S.ge.island !== isl) S.ge = { ...S.ge, island: isl, start: null, target: null };
  const start = Math.min(last, Math.max(base, S.ge.start ?? (mine ? count : base)));
  const target = Math.min(last, Math.max(start, S.ge.target ?? Math.min(last, start + 1)));
  // Boosts: los de tu granja salvo que los cambies aquí
  const placed = farm ? new Set(placedCollectibles(farm)) : new Set();
  const auto = { grinx: placed.has("Grinx's Hammer"), vip: isVip(), vipTime: isVip() && currentChapter() === "Ascension Age", monument: placed.has("Ascension Monument") };
  const b = Object.fromEntries(EXP_BOOSTS.map(([k]) => [k, S.ge.ov[k] ?? auto[k]]));
  // Nodos: los de partida de la isla + los que trae cada parcela hasta la que miras
  const NE = G.expansionNodes?.[isl];
  const nodesAt = (n) => {
    const out = { ...(NE?.base || {}) };
    for (const [k, add] of Object.entries(NE?.add || {})) if (Number(k) <= n) for (const [node, v] of Object.entries(add)) out[node] = (out[node] || 0) + v;
    return out;
  };
  const atStart = nodesAt(start), atTarget = nodesAt(target);
  const added = Object.keys(atTarget).map((k) => ({ k, add: atTarget[k] - (atStart[k] || 0), total: atTarget[k] })).filter((x) => x.add > 0);
  // Lo que piden las parcelas del tramo, con boosts
  const need = {};
  let coins = 0, secs = 0, level = 0;
  for (let n = start + 1; n <= target; n++) {
    const r = expBoosted(table[n], b);
    if (!r) continue;
    for (const [k, v] of Object.entries(r.resources)) need[k] = (need[k] || 0) + v;
    coins += r.coins; secs += r.seconds; level = Math.max(level, r.level || 0);
  }
  // Rendimiento por ronda: tus nodos de verdad (y tus boosts de cantidad y recarga) si miras tu isla desde donde estás;
  // si no, los nodos del mapa en la parcela de inicio, con tu rendimiento si lo hay o 1 por nodo
  let plan = [];
  try { if (farm) plan = nodePlan(); } catch { plan = []; }
  const real = mine && start === count;
  const rows = Object.entries(need).map(([name, q]) => {
    const have = farm ? (name === "Gem" ? toNum(farm.inventory?.Gem) : haveOf(name)) : 0;
    const miss = Math.max(0, q - have), unit = name === "Gem" ? flowerPerGem() : gPrice(name);
    const p = plan.find((x) => x.item === name);
    const nodeName = EXP_NODE[name], nodes = real && p ? p.n : nodeName ? atStart[nodeName] || 0 : 0;
    const amt = p?.amt ?? 1, hours = p?.hours ?? (EXP_REC[name] ? G.recovery[EXP_REC[name]] / 3600 : null);
    const perRound = nodeName && nodes ? nodes * amt : 0;
    const rounds = miss ? (perRound ? Math.ceil(miss / perRound) : Infinity) : 0;
    return { name, q, have, miss, unit, buy: unit != null ? miss * unit : null, nodes, amt, perRound, rounds, hours, secs: rounds === Infinity ? Infinity : rounds * (hours || 0) * 3600 };
  });
  const coinsHave = farm ? toNum(farm.coins) : 0, coinsMiss = Math.max(0, coins - coinsHave);
  const buyAll = rows.reduce((a, r) => a + (r.buy || 0), 0) + coinsMiss / coinRate();
  const slow = rows.filter((r) => r.miss).sort((a, x) => x.secs - a.secs)[0] || null;
  const xp = farm ? toNum(farm.bumpkin?.experience) : null, myLvl = xp != null ? bumpkinLevel(xp).lvl : null;
  const xpMiss = level && xp != null ? Math.max(0, (G.levelExperience?.[level] ?? 0) - xp) : 0;
  const up = G.islandUpgrade?.[isl];
  const season = farm?.season?.season || "summer";
  const biome = (mine && farm.island?.biome) || null;
  return { season, biome, farm, isl, islands, myIsland, mine, count, table, first, last, base, start, target, auto, b, NE, nodesAt, added, rows, coins, coinsHave, coinsMiss, secs, level, myLvl, xpMiss, buyAll, slow, real, up };
}

// Fondo: la isla del juego con esas parcelas (LandBase.tsx → getLandImage): 16 px por casilla, 6 casillas por parcela y
// la parcela 1 en el centro exacto de la imagen; verano sin carpeta de estación. Se carga de sus servidores, no se copia.
const LAND_PX = 96;
function landImageUrl(isl, n, season, biome) {
  const raw = biome ? biome.replace(/ Biome$/, "").replace(/ Age$/, "").toLowerCase() : isl;
  const folder = raw === "spring" ? "basic" : raw; // primavera usa el arte de la básica
  return `https://sunflower-land.com/game-assets/land/levels/${folder}/${season && season !== "summer" ? `${season}/` : ""}level_${Math.max(1, Math.min(42, n))}.webp`;
}
function geMap(m) {
  const lands = landOrigins(m.last);
  const xs = lands.map((o) => o.x), ys = lands.map((o) => o.y);
  const minX = Math.min(...xs), maxY = Math.max(...ys), cols = Math.max(...xs) - minX + 1, rows = maxY - Math.min(...ys) + 1;
  const pad = LAND_PX / 2, W = cols * LAND_PX + 2 * pad, H = rows * LAND_PX + 2 * pad;
  // Centro de la parcela 1 dentro del mapa: ahí va el centro de la imagen
  const cx = (0 - minX) * LAND_PX + pad + LAND_PX / 2, cy = maxY * LAND_PX + pad + LAND_PX / 2;
  const img = landImageUrl(m.isl, Math.max(m.target, m.start, m.base), m.season, m.biome);
  return `<div class="xmapscroll"><div class="xmap" style="width:${W}px;height:${H}px">
    <img class="xbg" src="${esc(img)}" alt="" style="left:${cx}px;top:${cy}px" onerror="this.remove()">
    ${lands.map((o, i) => {
    const n = i + 1, add = m.NE?.add?.[n] || null;
    const st = n <= m.start || n <= m.base ? "own" : n <= m.target ? "sel" : "next";
    const hl = S.ge.hl && add?.[S.ge.hl] ? " hl" : "";
    const clickable = n > m.base;
    const chips = add ? Object.entries(add).filter(([, v]) => v).map(([k, v]) => `<span title="${esc(k)}">${Gi(k, 12)}+${v}</span>`).join("") : "";
    const tag = clickable ? "button" : "div";
    return `<${tag} class="xland ${st}${hl}${n === m.target && m.target > m.start ? " tgt" : ""}${n === m.start ? " st" : ""}" style="left:${(o.x - minX) * LAND_PX + pad}px;top:${(maxY - o.y) * LAND_PX + pad}px"
      ${clickable ? `data-act="get:${n}" title="Objetivo: parcela ${n}${m.table[n] ? ` · nivel ${m.table[n].level}` : ""}"` : `title="Parcela ${n}: viene con la isla"`}>
      <b>${n}</b>${n === m.start ? `<i class="xflag s">S</i>` : ""}${n === m.target && m.target > m.start ? `<i class="xflag t">T</i>` : ""}<span class="xchips">${chips}</span></${tag}>`;
  }).join("")}</div></div>`;
}

function wGuideExpand() {
  const m = geModel();
  const step = (act, v, lab) => `<span class="xstep"><button class="btn ghost sm" data-act="${act}:-">−</button><b>${lab}</b><button class="btn ghost sm" data-act="${act}:+">+</button></span>`;
  const anyOv = Object.keys(S.ge.ov).length > 0;
  const lands = m.target - m.start;
  const tipos = [...new Set(Object.values(m.NE?.add || {}).flatMap((a) => Object.keys(a)))];
  const head = `<div class="toolbar" style="padding:8px 12px">${gTabs("gei", m.isl, m.islands.map((i) => [i, `Isla ${ISLAND_ES[i] || i}${i === m.myIsland && m.farm ? " · la tuya" : ""}`]))}
      <span class="grow"></span>${m.farm ? `<button class="btn ghost sm" data-act="gereset:1">Volver a mi granja</button>` : ""}</div>
    <div class="kstrip">
      ${Kcell("Desde", step("ges", m.start, `parcela ${m.start}`), m.mine && m.start === m.count ? "lo que tienes hoy" : m.start === m.base ? "con lo que empieza la isla" : "")}
      ${Kcell("Hasta", step("get", m.target, `parcela ${m.target}`), lands ? `${lands} ${lands === 1 ? "expansión" : "expansiones"} · clic en el mapa para elegir` : "elige una parcela en el mapa", lands ? "sun" : "")}
      ${Kcell("Nivel Bumpkin", m.level ? `${m.level}${m.myLvl != null ? `<small>/ tienes ${m.myLvl}</small>` : ""}` : "—", m.level ? (m.xpMiss ? `te faltan ${fmt(m.xpMiss, 0)} XP` : m.myLvl != null ? "ya lo tienes" : "el que pide la última") : "", m.level && m.xpMiss ? "red" : m.level ? "green" : "")}
      ${Kcell("Obra", lands ? dur(m.secs * 1000) : "—", lands ? "suma de las obras, una detrás de otra" : "")}
      ${Kcell("Lo que te falta", lands ? `${fmt(m.buyAll, 2)}<small>FLW</small>` : "—", lands ? (m.farm ? "comprando en el mercado lo que no tienes" : "todo a precio de mercado") : "", lands ? "sun" : "")}
      ${Kcell("Listo para empezar", !lands ? "—" : !m.slow ? "ya" : m.slow.secs === Infinity ? "∞" : `~${dur(m.slow.secs * 1000)}`, !lands ? "" : !m.slow ? "tienes todo lo que piden" : m.slow.secs === Infinity ? `no tienes nodos de ${m.slow.name}: hay que comprarlo` : `lo que más tarda: ${m.slow.name}`)}
    </div>
    <div class="xboosts">${EXP_BOOSTS.map(([k, name, txt]) => `<button class="xboost ${m.b[k] ? "on" : ""}" data-act="geb:${k}" title="${m.b[k] === m.auto[k] ? (m.farm ? "como en tu granja" : "") : "cambiado aquí"}">${Gi(k.startsWith("vip") ? "VIP" : name, 16)}<span><b>${esc(name)}</b><small>${txt}</small></span>${m.b[k] !== m.auto[k] && m.farm ? `<i class="dot"></i>` : ""}</button>`).join("")}
      ${anyOv ? `<button class="btn ghost sm" data-act="geb:auto">los de mi granja</button>` : ""}</div>`;
  const added = `<div class="xside"><div class="grp">Nodos que ganas</div>
      ${m.added.length ? `<div class="xadded">${m.added.map((x) => `<div>${Gi(x.k, 20)}<b>+${x.add}</b><span>${esc(x.k)}</span><small>${x.total} en total</small></div>`).join("")}</div>` : `<p class="ctx">Elige hasta qué parcela llegar.</p>`}
      ${tipos.length ? `<div class="grp" style="margin-top:12px">Resaltar en el mapa</div><div class="xfilt">${tipos.map((k) => `<button class="${S.ge.hl === k ? "on" : ""}" data-act="gehl:${esc(k)}">${Gi(k, 14)} ${esc(k)}</button>`).join("")}</div>` : ""}
      ${m.up ? `<p class="ctx" style="margin-top:12px">Para subir a la isla ${esc(ISLAND_ES[m.up.to] || m.up.to)} hacen falta ${m.up.expansions} parcelas${Object.keys(m.up.items || {}).length ? ` y ${Object.entries(m.up.items).map(([k, q]) => `${q} ${k}`).join(", ")}` : ""}.</p>` : ""}</div>`;
  const tbl = !m.rows.length && !m.coins ? "" : `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Recurso</th><th class="r">Piden</th><th class="r">Tienes</th><th class="r">Faltan</th><th class="r">Precio</th><th class="r">Comprarlo</th>
      <th class="r" data-tip="Por ronda|Nodos × lo que da cada uno con tus boosts. ${m.real ? "Tus nodos de hoy." : "Nodos del mapa en la parcela de inicio."}|" tabindex="0">Por ronda</th><th class="r" data-tip="Rondas|Veces que tienes que recoger todos los nodos para sacar lo que falta, y el tiempo con su recarga|" tabindex="0">Rondas</th></tr></thead><tbody>
    ${m.rows.map((r) => `<tr class="${r === m.slow ? "sel" : ""}"><td class="w">${Gi(r.name, 18)} ${esc(r.name)}${r === m.slow && r.secs ? ` <span class="tag sun">lo que más tarda</span>` : ""}</td>
      <td class="r mono">${fmt(r.q, r.q % 1 ? 1 : 0)}</td><td class="r mono dim">${m.farm ? fmt(r.have, r.have % 1 ? 1 : 0) : "—"}</td>
      <td class="r mono ${r.miss ? "down" : "up"}">${r.miss ? fmt(r.miss, r.miss % 1 ? 1 : 0) : "✓"}</td><td class="r mono">${r.unit != null ? fmt(r.unit, r.unit < 1 ? 4 : 2) : "—"}</td>
      <td class="r mono">${r.buy == null ? "—" : r.miss ? fmt(r.buy, 2) : "—"}</td>
      <td class="r mono">${r.perRound ? `${fmt(r.perRound, 1)}<div class="ctx">${r.nodes} × ${fmt(r.amt, 2)}</div>` : `<span class="dim">${EXP_NODE[r.name] ? "sin nodos" : "no sale de nodos"}</span>`}</td>
      <td class="r mono">${!r.miss ? "—" : r.rounds === Infinity ? "∞" : `${r.rounds}<div class="ctx">~${dur(r.secs * 1000)}</div>`}</td></tr>`).join("")}
    ${m.coins ? `<tr><td class="w">${Gi("Coins", 18, "coin")} Coins</td><td class="r mono">${fmt(m.coins, 0)}</td><td class="r mono dim">${m.farm ? compact(m.coinsHave) : "—"}</td>
      <td class="r mono ${m.coinsMiss ? "down" : "up"}">${m.coinsMiss ? fmt(m.coinsMiss, 0) : "✓"}</td><td class="r mono">${fmt(1 / coinRate(), 5)}</td><td class="r mono">${m.coinsMiss ? fmt(m.coinsMiss / coinRate(), 2) : "—"}</td><td></td><td></td></tr>` : ""}
    </tbody></table></div>`;
  // Parcela a parcela del tramo elegido (con boosts)
  const per = [];
  for (let n = m.start + 1; n <= m.target; n++) {
    const r = expBoosted(m.table[n], m.b);
    if (!r) continue;
    const c = costFlw(r.resources, r.coins);
    if (r.sfl) c.v += r.sfl;
    per.push({ n, r, c, add: m.NE?.add?.[n] || {} });
  }
  const landsTbl = per.length < 2 ? "" : `<div class="grp">Parcela a parcela</div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Parcela</th><th class="r">Nivel</th><th class="r">Obra</th><th>Pide</th><th>Nodos que trae</th><th class="r">Coste FLW</th></tr></thead><tbody>
    ${per.map((p) => `<tr><td class="w">Land ${p.n}</td><td class="r mono ${m.myLvl != null && m.myLvl < p.r.level ? "down" : ""}">${p.r.level}</td><td class="r mono">${dur(p.r.seconds * 1000)}</td>
      <td class="ctx wrap">${itemsTxt(p.r.resources, p.r.coins)}</td><td class="ctx wrap">${Object.entries(p.add).filter(([, v]) => v).map(([k, v]) => `<span style="margin-right:6px">${Gi(k, 12)} +${v}</span>`).join("") || "—"}</td><td class="r mono">${costCell(p.c)}</td></tr>`).join("")}
    </tbody></table></div>`;
  return `${head}<div class="xwrap"><div class="xmapbox">${geMap(m)}<div class="xleg"><span class="xland own"></span>tuyas / inicio <span class="xland sel"></span>las que haces <span class="xland next"></span>después</div></div>${added}</div>${tbl}${landsTbl}
    <div class="mod-f"><span>Precios: floor de hoy, gemas al paquete más barato y coins a ${fmt(coinRate(), 0)}/FLOWER · tiempos con la recarga de tus nodos</span><span>expansions.ts, expansionNodes y EXPANSION_ORIGINS del juego</span></div>`;
}
ACTIONS.gei = (v) => { S.geIsland = v; writeLS("geIsland", v); rerun(); };
// Inicio y objetivo: ±1 o el número de la parcela del mapa
ACTIONS.ges = (v) => { const m = geModel(); S.ge.start = Math.min(m.last, Math.max(m.base, m.start + (v === "+" ? 1 : -1))); if (S.ge.target != null && S.ge.target < S.ge.start) S.ge.target = S.ge.start; rerun(); };
ACTIONS.get = (v) => {
  const m = geModel();
  const n = v === "+" ? m.target + 1 : v === "-" ? m.target - 1 : Number(v);
  if (n <= m.start && v !== "-" && v !== "+") S.ge.start = Math.max(m.base, n - 1);
  S.ge.target = Math.min(m.last, Math.max(S.ge.start ?? m.start, n));
  rerun();
};
ACTIONS.geb = (k) => { if (k === "auto") S.ge.ov = {}; else { const m = geModel(); S.ge.ov[k] = !m.b[k]; } rerun(); };
ACTIONS.gehl = (k) => { S.ge.hl = S.ge.hl === k ? "" : k; rerun(); };
ACTIONS.gereset = () => { S.ge = { start: null, target: null, island: null, ov: {}, hl: "" }; S.geIsland = ""; writeLS("geIsland", ""); rerun(); };

/* ════════════════════════════════════════════════════════════════════════
   Nivel Bumpkin — XP de cada nivel (level.ts), qué desbloquea (semillas y edificios) y cuánto te falta
   ════════════════════════════════════════════════════════════════════════ */
S.glTarget = readLS("glTarget", 0);
S.glOnly = readLS("glOnly", false);
function levelGuideModel() {
  const LX = G.levelExperience || {}, levels = Object.keys(LX).map(Number).sort((a, b) => a - b);
  const unlocks = {};
  for (const [seed, l] of Object.entries(G.seedLevels || {})) (unlocks[l] ||= []).push(seed.replace(/ Seed$/, ""));
  for (const [b, x] of Object.entries(G.buildings || {})) if (x.level != null) (unlocks[x.level] ||= []).push(b);
  const farm = gFarm(), xp = farm ? toNum(farm.bumpkin?.experience) : 0, cur = farm ? bumpkinLevel(xp).lvl : 1;
  const max = levels.at(-1) || 150;
  const target = Math.min(max, Math.max(cur + 1, toNum(S.glTarget) || Math.min(max, cur + 10)));
  const need = Math.max(0, (LX[target] ?? 0) - (farm ? xp : LX[cur] ?? 0));
  // Lo más barato para subir: la mejor comida en XP por FLOWER con tus boosts (Estrategia → Nivel)
  let best = null;
  if (farm && has("activity")) best = levelPlan().best[0] || null;
  else if (has("activity")) best = Object.entries(G.foods || {}).map(([n, f]) => cookRow(n, f, {})).filter((r) => r.xpPerFlower).sort((a, b) => b.xpPerFlower - a.xpPerFlower)[0] || null;
  const rows = levels.filter((l) => l < max).map((l) => ({ l, toNext: LX[l + 1] - LX[l], total: LX[l], unlocks: unlocks[l] || [] }));
  return { rows, cur, xp, target, need, best, max, levels };
}
// Ascensiones (level.ts): pasado el nivel 150 cada ascensión a es una banda de 50 niveles que pide
// bandXp(a) = 50M × 1,45^(a−1) redondeado a 5M; empieza con la XP del 150 más las bandas anteriores
const ascBand = (a) => Math.round((50_000_000 * Math.pow(1.45, a - 1)) / 5_000_000) * 5_000_000;
function ascensionRows(xp, xpPerFlower) {
  let start = G.levelExperience?.[150] ?? 0;
  const out = [];
  for (let a = 1; a <= 15; a++) {
    const band = ascBand(a), end = start + band;
    out.push({ a, start, band, end, missStart: xp != null ? Math.max(0, start - xp) : null, missEnd: xp != null ? Math.max(0, end - xp) : null, flw: xp != null && xpPerFlower ? Math.max(0, start - xp) / xpPerFlower : null });
    start = end;
  }
  return out;
}
function wGuideLevels() {
  const d = levelGuideModel(), farm = gFarm(), LX = G.levelExperience || {};
  const flw = d.best?.xpPerFlower ? d.need / d.best.xpPerFlower : null;
  // XP que tienes guardada en comida (con tus boosts): los niveles a los que llegas comiéndotela van primero
  let stored = 0;
  try { if (farm && has("activity")) stored = levelPlan().storedXp || 0; } catch { stored = 0; }
  const reach = farm ? d.xp + stored : 0;
  const list = d.rows.filter((r) => (S.glAll || !farm || r.l >= d.cur) && (!S.glOnly || r.unlocks.length)).map((r) => {
    const toReach = farm ? Math.max(0, (LX[r.l + 1] ?? 0) - d.xp) : null;
    return { ...r, toReach, can: farm && r.l >= d.cur && (LX[r.l + 1] ?? Infinity) <= reach ? 1 : 0 };
  }).sort((a, b) => canFirst(a, b) || a.l - b.l).slice(0, S.glAll ? Infinity : 60);
  const reachLvl = farm ? bumpkinLevel(reach).lvl : null;
  return `<div class="toolbar" style="padding:8px 12px;gap:10px;flex-wrap:wrap">
      <span class="ctx">Del nivel <b>${d.cur}</b> al</span><input class="inp" type="number" min="${d.cur + 1}" max="${d.max}" value="${d.target}" data-chg="glt" style="width:70px">
      <label class="toggle"><input type="checkbox" data-chg="glo" ${S.glOnly ? "checked" : ""}><i></i>Solo niveles que desbloquean algo</label>
      ${farm ? `<label class="toggle"><input type="checkbox" data-act="glall" ${S.glAll ? "checked" : ""}><i></i>Ver también los pasados</label>` : ""}
    </div>
    <div class="kstrip">
      ${Kcell("XP que te falta", compact(d.need), `${d.target - d.cur} niveles${farm ? " contando la que ya tienes" : ""}`, "sun")}
      ${farm ? Kcell("Con tu comida guardada", `nivel ${reachLvl}`, `${compact(stored)} XP en comida · ${reachLvl > d.cur ? `subes ${reachLvl - d.cur} nivel${reachLvl - d.cur > 1 ? "es" : ""}` : "no llega al siguiente"}`, reachLvl > d.cur ? "green" : "") : ""}
      ${Kcell("Con la comida más rentable", flw != null ? `${fmt(flw, 1)}<small>FLW</small>` : "—", d.best ? `${esc(d.best.name)} · ${compact(d.best.xpPerFlower)} XP/FLOWER` : "sin precios")}
      ${Kcell("Puntos de habilidad", fmt(d.target - d.cur, 0), "1 por nivel")}
    </div>
    <div class="cb-cards">${list.map((r) => ItemCard({ name: `Nivel ${r.l} → ${r.l + 1}`, icon: r.unlocks[0] || "Bumpkin Salad", can: r.can,
      iconHtml: r.unlocks[0] ? null : `<span class="lv-badge">${r.l + 1}</span>`,
      tags: `${r.l === d.cur ? `<span class="tag sun">estás aquí</span>` : ""}${r.l + 1 === d.target ? `<span class="tag green">objetivo</span>` : ""}${r.can && r.l > d.cur ? `<span class="tag green">con tu comida</span>` : ""}`,
      sub: `${fmt(r.toNext, 0)} XP · total ${compact(LX[r.l + 1] ?? r.total)}`,
      body: r.unlocks.length ? `<div class="cb-ing">${r.unlocks.map((u) => `<div>${Gi(u, 22)}<span>Desbloquea ${esc(u)}</span><b></b></div>`).join("")}</div>` : `<div class="ctx">No desbloquea nada nuevo · +1 punto de habilidad</div>`,
      stats: [["Te falta", r.toReach == null ? "—" : r.toReach ? compact(r.toReach) : "✓", r.toReach === 0 ? "up" : ""], ["Con comida rentable", r.toReach && d.best?.xpPerFlower ? `${fmt(r.toReach / d.best.xpPerFlower, 1)} FLW` : "—"]],
    })).join("")}</div>
    <div class="grp">Ascensiones (más allá del nivel 150)</div>
    <div class="cb-cards">${ascensionRows(farm ? d.xp : null, d.best?.xpPerFlower).map((r) => ItemCard({ name: `Ascensión ${r.a}`, iconHtml: `<span class="lv-badge">A${r.a}</span>`, can: r.missStart === 0 ? 1 : 0,
      sub: `niveles ${150 + (r.a - 1) * 50 + 1}–${150 + r.a * 50} · banda de ${compact(r.band)} XP`,
      body: `<div class="ctx">Empieza con ${compact(r.start)} XP en total y se completa con ${compact(r.end)}.</div>`,
      stats: [["Te falta para empezarla", r.missStart == null ? "—" : r.missStart ? compact(r.missStart) : "ya", r.missStart === 0 ? "up" : ""], ["Con comida rentable", r.flw ? `${compact(r.flw)} FLW` : "—"]],
    })).join("")}</div>
    <div class="mod-f"><span>Primero los niveles a los que llegas con la comida que tienes guardada · XP de cada nivel: level.ts · desbloqueos: semillas y edificios · cada ascensión: 50 niveles, banda de 50M × 1,45 por ascensión (redondeada a 5M)</span><span>Ascender: llegar al 150 (y a cada banda completa) y subir de isla</span></div>`;
}
ACTIONS.glall = () => { S.glAll = !S.glAll; rerun(); };
ACTIONS.glt = (v) => { S.glTarget = Math.floor(toNum(v)) || 0; writeLS("glTarget", S.glTarget); rerun(); };
ACTIONS.glo = (v, el) => { S.glOnly = el.checked; writeLS("glOnly", S.glOnly); rerun(); };

/* ════════════════════════════════════════════════════════════════════════
   Entregas de NPCs — lo que puede pedir cada NPC y lo que da (pedidos recogidos por sfl.world)
   ════════════════════════════════════════════════════════════════════════ */
S.gnKind = readLS("gnKind", "all");
S.gnOpen = null;
const NPC_KIND_ES = { FLOWER: "FLOWER", COINS: "Monedas", TICKETS: "Tickets" };
function npcGuideModel() {
  const d = has("npcDeliveries") ? store.npcDeliveries.data : null, farm = gFarm();
  const lvl = farm ? bumpkinLevel(toNum(farm.bumpkin?.experience)).lvl : null;
  const npcs = (d?.npcs || []).map((n) => {
    const orders = n.orders.map((o) => ({ ...o, c: costFlw(o.items) }));
    const priced = orders.filter((o) => o.c.ok);
    const avgCost = priced.length ? priced.reduce((s, o) => s + o.c.v, 0) / priced.length : null;
    const rewardFlw = n.kind === "COINS" ? (n.avg || 0) / coinRate() : n.kind === "FLOWER" ? n.avg : null;
    const level = G.npcDeliveryLevels?.[n.npc] ?? null;
    return { ...n, orders, avgCost, rewardFlw, level, locked: lvl != null && level != null && lvl < level, done: farm ? toNum(farm.npcs?.[n.npc]?.deliveryCount) : 0 };
  });
  return { npcs, updated: d?.updated || null, loaded: Boolean(d) };
}
function wGuideNpc() {
  const d = npcGuideModel();
  if (!d.loaded) return Empty("scroll", "Sin datos", "Los pedidos de cada NPC salen de sfl.world y no han cargado. Vuelve a probar en un rato.");
  const kinds = [...new Set(d.npcs.map((n) => n.kind))];
  const list = d.npcs.filter((n) => S.gnKind === "all" || n.kind === S.gnKind).sort((a, b) => (a.level ?? 0) - (b.level ?? 0));
  const tk = G.chapterTickets?.[currentChapter()] || "tickets";
  const rewardTxt = (n, v) => (v == null ? "—" : n.kind === "COINS" ? `${Gi("Coins", 12, "coin")} ${compact(v)}` : n.kind === "FLOWER" ? `${fmt(v, 2)} FLW` : `${fmt(v, 0)} ${esc(tk)}`);
  return `<div class="toolbar" style="padding:8px 12px">${gTabs("gnk", S.gnKind, [["all", `Todos ${d.npcs.length}`], ...kinds.map((k) => [k, `${NPC_KIND_ES[k] || k} ${d.npcs.filter((n) => n.kind === k).length}`])])}</div>
    <div class="cb-cards">${list.map((n) => { const doable = gFarm() ? n.orders.filter((o) => Object.entries(o.items || {}).every(([k, q]) => haveOf(k) >= q)).length : null; return { ...n, doable, can: !n.locked && doable ? doable : 0 }; })
      .sort((a, b) => canFirst(a, b) || Number(a.locked) - Number(b.locked) || (a.level ?? 0) - (b.level ?? 0)).map((n) => ItemCard({ name: NPC_ES(n.npc), iconHtml: npcFace(n.npc), icon: Object.keys(n.orders[0]?.items || {})[0], can: n.can,
        tags: `<span class="tag">${esc(NPC_KIND_ES[n.kind] || n.kind)}</span>${n.locked ? `<span class="tag">nivel ${n.level}</span>` : ""}${n.can ? `<span class="tag green">${n.can} pedido${n.can > 1 ? "s" : ""} que ya puedes</span>` : ""}`,
        sub: `da de media ${rewardTxt(n, n.avg)}${n.kind === "COINS" && n.rewardFlw != null ? ` (${fmt(n.rewardFlw, 3)} FLW)` : ""} · ${n.orders.length} pedidos posibles`,
        body: `<div class="cb-ing">${n.orders.slice().sort((a, b) => Number(Object.entries(b.items || {}).every(([k, q]) => haveOf(k) >= q)) - Number(Object.entries(a.items || {}).every(([k, q]) => haveOf(k) >= q)) || (a.c.v || 0) - (b.c.v || 0)).slice(0, 5).map((o) => { const ok = gFarm() && Object.entries(o.items || {}).every(([k, q]) => haveOf(k) >= q); return `<div>${Gi(Object.keys(o.items || {})[0], 22)}<span>${itemsTxt(o.items, 0, 12)}</span><b class="${ok ? "up" : ""}">${costCell(o.c)}</b></div>`; }).join("")}${n.orders.length > 5 ? `<div class="faint">+${n.orders.length - 5} pedidos más</div>` : ""}</div>`,
        stats: [["Coste medio", n.avgCost == null ? "—" : fmt(n.avgCost, 3)], ["Nivel", n.level ?? "—"], ["Le has entregado", gFarm() ? fmt(n.done, 0) : "—"]] })).join("")}</div>
    <div class="mod-f"><span>Primero los NPCs con algún pedido que ya puedes hacer · pedidos recogidos por sfl.world de todas las granjas${d.updated ? ` (actualizado hace ${esc(d.updated.replace(/ ago$/, "").replace("months", "meses").replace("month", "mes").replace("days", "días").replace("weeks", "semanas"))})` : ""} · pulsa un NPC para ver sus pedidos</span><span>Coste a floor sin tus boosts · tus pedidos de hoy, en Misiones</span></div>`;
}
ACTIONS.gnk = (v) => { S.gnKind = v; writeLS("gnKind", v); rerun(); };
ACTIONS.gno = (v) => { S.gnOpen = S.gnOpen === v ? null : v; rerun(); };

/* ════════════════════════════════════════════════════════════════════════
   Tiendas — isla flotante (Love Charms), herrero, tienda del clima y forja solar
   ════════════════════════════════════════════════════════════════════════ */
S.gsTab = readLS("gsTab", "floating");
function wGuideShops() {
  const farm = gFarm(), tab = S.gsTab;
  const tabs = gTabs("gst", tab, [["floating", "Isla flotante"], ["blacksmith", "Herrero"], ["weather", "Tienda del clima"], ["forge", "Forja solar"]]);
  const buffTxt = (n) => { const b = G.buffs?.[n]; return esc(Array.isArray(b) ? b.join(" · ") : b || ""); };
  const owned = (n) => (farm ? toNum(farm.inventory?.[n]) + toNum(farm.wardrobe?.[n]) : 0);
  let body = "";
  if (tab === "floating") {
    const lc = farm ? toNum(farm.inventory?.["Love Charm"]) : null;
    const rows = Object.entries(G.floatingShop || {}).map(([n, x]) => ({ n, ...x, lc: toNum(x.cost?.["Love Charm"]), market: marketOnly(n) })).sort((a, b) => a.lc - b.lc);
    body = `<div class="kstrip">${Kcell("Tus Love Charms", lc != null ? `${Gi("Love Charm", 18)} ${fmt(lc, 0)}` : "—", `valen ≈ ${lc != null ? fmt(lc / LC_PER_FLOWER, 2) : "—"} FLOWER (${LC_PER_FLOWER} por FLOWER)`, "sun")}</div>
      <div class="cb-cards">${rows.map((r) => ({ ...r, can: lc != null ? Math.floor(lc / Math.max(1, r.lc)) : null })).sort(canFirst).map((r) => ItemCard({ name: r.n, can: r.can,
        tags: owned(r.n) ? `<span class="tag">tienes ${fmt(owned(r.n), 0)}</span>` : "", sub: buffTxt(r.n) || (r.type === "wearable" ? "prenda" : "coleccionable"),
        body: IngList({ "Love Charm": r.lc }),
        stats: [["Valor FLW", fmt(r.lc / LC_PER_FLOWER, 2)], ["Floor", r.market == null ? "—" : fmt(r.market, 2), r.market != null && r.market > r.lc / LC_PER_FLOWER ? "up" : ""], ["Te llega", r.can == null ? "—" : r.can ? "sí" : "no", r.can ? "up" : "dim"]],
      })).join("")}</div><div class="mod-f"><span>Lista por defecto del juego (el servidor puede cambiarla) · en verde el floor si vale más que lo que pagas en Love Charms</span></div>`;
  } else if (tab === "blacksmith") {
    const rows = Object.entries(G.blacksmith || {}).map(([n, x]) => ({ n, ...x, c: costFlw(x.items, x.coins), market: marketOnly(n), own: owned(n) || (farm && isPlaced(farm, n) ? 1 : 0) }));
    body = `<div class="cb-cards">${rows.map((r) => ({ ...r, can: r.own ? 0 : canMake(r.items, 1, r.coins) })).sort((x, y) => canFirst(x, y) || Number(!!x.own) - Number(!!y.own)).map((r) => ItemCard({ name: r.n, can: r.can,
        tags: r.own ? `<span class="tag green">lo tienes</span>` : "", sub: buffTxt(r.n), body: IngList(r.items, 1, r.coins),
        stats: [["Coste FLW", costCell(r.c)], ["Floor", r.market == null ? "—" : fmt(r.market, 2)], ["Puedes", r.own ? "ya lo tienes" : r.can ? "sí" : "no", r.can ? "up" : "dim"]],
      })).join("")}</div><div class="mod-f"><span>Cada uno se fabrica una sola vez: no puedes tener dos</span><span>coins a ${fmt(coinRate(), 0)}/FLOWER + ingredientes a floor</span></div>`;
  } else if (tab === "weather") {
    const mult = { basic: 1, spring: 1, desert: 2, volcano: 2.5 };
    const myIsl = farm?.island?.type;
    const WEATHER_ES = { "Tornado Pinwheel": "tornado", Mangrove: "tsunami", "Thermal Stone": "gran helada", "Protective Pesticide": "plaga de insectos" };
    const myM = mult[myIsl] ?? 1;
    body = `<div class="cb-cards">${Object.entries(G.weatherShop || {}).map(([n, x]) => ({ n, x, can: canMake(x.ingredients, myM, x.coins) })).sort(canFirst).map(({ n, x, can }) => ItemCard({ name: n, can,
        tags: owned(n) ? `<span class="tag">tienes ${fmt(owned(n), 0)}</span>` : "", sub: `protege de: ${WEATHER_ES[n] || ""} · precio de tu isla (×${myM})`,
        body: IngList(x.ingredients, myM, x.coins),
        stats: [1, 2, 2.5].map((m) => [m === 1 ? "Básica/prim." : m === 2 ? "Desierto" : "Volcán", `${costCell(costFlw(Object.fromEntries(Object.entries(x.ingredients || {}).map(([k, q]) => [k, q * m])), x.coins * m))}`, m === myM ? "sun" : ""]),
      })).join("")}</div>
      <div class="mod-f"><span>Primero lo que puedes hacer ya · se gastan al protegerte de su calamidad · en el desierto cuestan el doble y en el volcán ×2,5</span></div>`;
  } else {
    const act = farm?.farmActivity || {}, sun = marketOnly("Sunstone"), obs = marketOnly("Obsidian");
    body = `<div class="kstrip">${Kcell("Sunstone", sun != null ? `${fmt(sun, 2)}<small>FLW</small>` : "—", "floor de hoy", "sun")}${Kcell("Obsidian", obs != null ? `${fmt(obs, 2)}<small>FLW</small>` : "—", "3 Obsidian = 1 Sunstone en el canje")}${Kcell("Tus Sunstone", farm ? fmt(toNum(farm.inventory?.Sunstone), 0) : "—", "")}</div>
      <div class="cb-cards">${Object.entries(G.nodePrices || {}).map(([n, x]) => { const bought = toNum(act[`${n} Bought`]), next = x.price + bought * x.increase, have = farm ? toNum(farm.inventory?.Sunstone) : null; return { n, x, bought, next, have, can: have != null ? Math.floor(have / next) : null }; })
        .sort((a, b) => canFirst(a, b) || a.next - b.next).map((r) => ItemCard({ name: r.n, can: r.can,
          tags: `<span class="tag">isla ${esc(ISLAND_ES[r.x.requiredIsland] || r.x.requiredIsland)}</span>${r.bought ? `<span class="tag">compraste ${r.bought}</span>` : ""}`,
          sub: `base ${r.x.price} · +${r.x.increase} por cada compra${Object.keys(r.x.items || {}).length > 1 ? ` · trae también ${Object.keys(r.x.items).filter((k) => k !== r.n).join(", ")}` : ""}`,
          body: `<div class="cb-ing"><div>${Gi("Sunstone", 22)}<span>Sunstone (el siguiente)</span><b class="${r.have == null ? "" : r.have >= r.next ? "up" : "down"}">${r.next}</b></div></div>`,
          stats: [["En FLOWER", sun != null ? fmt(r.next * sun, 2) : "—"], ["En Obsidian", r.next * 3], ["Puedes comprar", r.can == null ? "—" : r.can ? `${r.can}×` : "no", r.can ? "up" : "dim"]] })).join("")}</div><div class="mod-f"><span>En Infernos (nivel 30+): cada compra sube el precio del siguiente nodo del mismo tipo · precio en Sunstone</span></div>`;
  }
  return `<div class="toolbar" style="padding:8px 12px">${tabs}</div>${body}`;
}
ACTIONS.gst = (v) => { S.gsTab = v; writeLS("gsTab", v); rerun(); };

/* ════════════════════════════════════════════════════════════════════════
   Forja de nodos (resources.ts): 4 nodos → 1 de tier 2 (4× y +0,5 por golpe), 4 de tier 2 → 1 de tier 3 (16× y +2,5).
   Lo que cuesta (coins + obsidian), lo que ganas al día (la unidad de más por golpe y las herramientas que te ahorras:
   un golpe en vez de cuatro) y el sitio que liberas.
   ════════════════════════════════════════════════════════════════════════ */
const FORGE_FAMILIES = [
  { base: "Tree", item: "Wood", key: "trees", t2: "Ancient Tree", t3: "Sacred Tree", size: 4 },
  { base: "Stone Rock", item: "Stone", key: "stones", t2: "Fused Stone Rock", t3: "Reinforced Stone Rock", size: 1 },
  { base: "Iron Rock", item: "Iron", key: "iron", t2: "Refined Iron Rock", t3: "Tempered Iron Rock", size: 1 },
  { base: "Gold Rock", item: "Gold", key: "gold", t2: "Pure Gold Rock", t3: "Prime Gold Rock", size: 1 },
];
S.gf = {};
function forgeModel() {
  const farm = gFarm(), F = G.forge || { nodes: {}, bonus: { 2: 0.5, 3: 2.5 } };
  let plan = [];
  try { if (farm) plan = nodePlan(); } catch { plan = []; }
  const own = farm ? ownedBoosts(farm) : new Set();
  const obsP = gPrice("Obsidian");
  const fams = FORGE_FAMILIES.map((fm) => {
    const nodes = farm ? Object.values(farm[fm.key] || {}).filter((n) => n && n.x != null && !n.removedAt) : [];
    const tierOf = (n) => toNum(n.tier) || (n.name === fm.t3 ? 3 : n.name === fm.t2 ? 2 : 1);
    const have = { 1: nodes.filter((n) => tierOf(n) === 1).length, 2: nodes.filter((n) => tierOf(n) === 2).length, 3: nodes.filter((n) => tierOf(n) === 3).length };
    const sel = S.gf[fm.base] || { t2: 0, t3: 0 };
    const n2 = Math.max(0, Math.min(sel.t2, Math.floor(have[1] / 4)));
    const n3 = Math.max(0, Math.min(sel.t3, Math.floor((have[2] + n2) / 4)));
    const c2 = F.nodes[fm.t2] || {}, c3 = F.nodes[fm.t3] || {};
    const coins = n2 * (c2.coins || 0) + n3 * (c3.coins || 0), obs = n2 * (c2.obsidian || 0) + n3 * (c3.obsidian || 0);
    const p = plan.find((x) => x.item === fm.item);
    const a = p?.amt ?? 1, cyc = p?.cyc ?? (G.recovery[{ trees: "tree", stones: "stone", iron: "iron", gold: "gold" }[fm.key]] / 3600);
    const price = gPrice(fm.item), tc = toolCostFor(fm.item, own)?.v ?? 0;
    // Cada forja (a tier 2 o de 2 a 3) suma +0,5 por ronda y ahorra 3 golpes de herramienta
    const forges = n2 + n3, perRound = forges * ((price ?? 0) * 0.5 + 3 * tc);
    const perDay = perRound * (24 / cyc);
    const cost = coins / coinRate() + (obsP != null ? obs * obsP : 0);
    const after = { 1: have[1] - 4 * n2, 2: have[2] + n2 - 4 * n3, 3: have[3] + n3 };
    const yieldNow = have[1] * a + have[2] * (4 * a + 0.5) + have[3] * (16 * a + 2.5);
    const yieldAfter = after[1] * a + after[2] * (4 * a + 0.5) + after[3] * (16 * a + 2.5);
    return { ...fm, have, after, n2, n3, c2, c3, coins, obs, cost, perDay, days: perDay > 0 ? cost / perDay : null, a, cyc, price, tc,
      freed: 3 * forges * fm.size, yieldNow, yieldAfter, max2: Math.floor(have[1] / 4), max3: Math.floor((have[2] + n2) / 4) };
  });
  const tot = fams.reduce((s, f) => ({ coins: s.coins + f.coins, obs: s.obs + f.obs, cost: s.cost + f.cost, perDay: s.perDay + f.perDay, freed: s.freed + f.freed }), { coins: 0, obs: 0, cost: 0, perDay: 0, freed: 0 });
  return { farm, fams, tot, obsP, haveCoins: farm ? toNum(farm.coins) : null, haveObs: farm ? toNum(farm.inventory?.Obsidian) : null };
}
function wGuideForge() {
  const m = forgeModel(), t = m.tot;
  const step = (fam, k, v, max) => `<span class="xstep"><button class="btn ghost sm" data-act="gfs:${esc(fam)}|${k}|-" ${v <= 0 ? "disabled" : ""}>−</button><b>${v}</b><button class="btn ghost sm" data-act="gfs:${esc(fam)}|${k}|+" ${v >= max ? "disabled" : ""}>+</button></span>`;
  const okC = m.haveCoins == null || m.haveCoins >= t.coins, okO = m.haveObs == null || m.haveObs >= t.obs;
  return `<div class="kstrip">
      ${Kcell("Coins", t.coins ? compact(t.coins) : "—", m.haveCoins != null ? `tienes ${compact(m.haveCoins)}${t.coins && !okC ? ` · <span class="down">faltan ${compact(t.coins - m.haveCoins)}</span>` : ""}` : "", t.coins && !okC ? "red" : "")}
      ${Kcell("Obsidian", t.obs ? fmt(t.obs, 0) : "—", m.haveObs != null ? `tienes ${fmt(m.haveObs, 2)}${t.obs && !okO ? ` · <span class="down">faltan ${fmt(t.obs - m.haveObs, 1)}</span>` : ""}` : "", t.obs && !okO ? "red" : "")}
      ${Kcell("Coste", t.cost ? `${fmt(t.cost, 2)}<small>FLW</small>` : "—", `obsidian a ${m.obsP != null ? fmt(m.obsP, 2) : "—"} FLW · coins a ${fmt(coinRate(), 0)}/FLOWER`)}
      ${Kcell("Ganas al día", t.perDay ? `+${fmt(t.perDay, 3)}<small>FLW</small>` : "—", "la unidad de más y las herramientas que no gastas", t.perDay ? "green" : "")}
      ${Kcell("Se paga en", t.perDay > 0 ? `${fmt(t.cost / t.perDay, 0)}<small>días</small>` : "—", t.freed ? `y liberas ${t.freed} casillas` : "elige qué forjar abajo", t.perDay > 0 ? "sun" : "")}
    </div>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Nodo</th><th class="r">Tienes</th><th class="r">Forjar a tier 2</th><th class="r">Forjar a tier 3</th><th class="r">Coste</th>
      <th class="r" data-tip="Por ronda|Lo que dan todos tus nodos de ese tipo en una ronda, ahora → después de forjar|" tabindex="0">Por ronda</th><th class="r">FLOWER/día</th><th class="r">Se paga en</th></tr></thead><tbody>
    ${m.fams.map((f) => `<tr><td class="w">${Gi(f.base, 18)} ${esc(f.base)}<div class="ctx">${Gi(f.t2, 12)} ${esc(f.t2)}: ${compact(f.c2.coins || 0)} coins + ${f.c2.obsidian || 0} obsidian · ${Gi(f.t3, 12)} ${esc(f.t3)}: ${compact(f.c3.coins || 0)} + ${f.c3.obsidian || 0}</div></td>
      <td class="r mono">${f.have[1]}<span class="faint"> · ${f.have[2]} · ${f.have[3]}</span>${f.n2 || f.n3 ? `<div class="ctx">→ ${f.after[1]} · ${f.after[2]} · ${f.after[3]}</div>` : ""}</td>
      <td class="r">${step(f.base, "t2", f.n2, f.max2)}<div class="ctx">máx. ${f.max2}</div></td><td class="r">${step(f.base, "t3", f.n3, f.max3)}<div class="ctx">máx. ${f.max3}</div></td>
      <td class="r mono">${f.cost ? fmt(f.cost, 2) : "—"}${f.obs ? `<div class="ctx">${compact(f.coins)} coins · ${f.obs} obs.</div>` : ""}</td>
      <td class="r mono">${fmt(f.yieldNow, 1)}${f.n2 || f.n3 ? ` → <b class="up">${fmt(f.yieldAfter, 1)}</b>` : ""}<div class="ctx">${fmt(f.a, 2)} por golpe · cada ${dur(f.cyc * 3600_000)}</div></td>
      <td class="r mono ${f.perDay ? "up" : ""}">${f.perDay ? `+${fmt(f.perDay, 3)}` : "—"}</td><td class="r mono">${f.days != null ? `${fmt(f.days, 0)} días` : "—"}</td></tr>`).join("")}
    </tbody></table></div>
    <div class="mod-f"><span>Tienes = tier 1 · tier 2 · tier 3. Cada forja da +0,5 por ronda y ahorra 3 golpes de herramienta; el nodo forjado ocupa lo mismo que uno normal (liberas el sitio de 3)</span><span>resources.ts · chop.ts · stoneMine.ts</span></div>`;
}
ACTIONS.gfs = (v) => {
  const [fam, k, d] = v.split("|");
  const cur = S.gf[fam] || { t2: 0, t3: 0 };
  cur[k] = Math.max(0, cur[k] + (d === "+" ? 1 : -1));
  S.gf[fam] = cur;
  rerun();
};

/* ════════════════════════════════════════════════════════════════════════
   Santuarios (pets.ts): lo que piden para construirlos o renovarlos, cuánto duran, lo que cuestan al día y lo que te
   devuelven en tu producción (mismo cálculo que el Simulador). Los de animales, cocina, mascotas o crafteo no salen en
   Producción: se enseña su efecto pero no se valora.
   ════════════════════════════════════════════════════════════════════════ */
function shrinesModel() {
  const farm = gFarm(), t = now();
  let m = null, base = 0;
  try { if (farm && has("activity")) { m = prodLines(); base = prodTotals(m).total; } } catch { m = null; }
  const mine = farm ? Object.fromEntries(tempsModel().shrines.map((s) => [s.name, s])) : {};
  return Object.entries(G.shrines || {}).map(([name, x]) => {
    const c = costFlw(x.items, x.coins), days = SHRINE_DAYS[name] ?? 7;
    let gain = null;
    if (m && G.boostFx?.[name]) {
      const on = m.own.has(name);
      const d = prodTotals(m, simAdj([name], m.own)).total - base;
      gain = on ? -d : d;
    }
    const perDay = c.v / days, net = gain != null ? gain - perDay : null;
    return { name, ...x, c, days, perDay, gain, net, mine: mine[name] || null, buff: buffLine(name), have: farm ? haveOf(name) : 0 };
  }).sort((a, b) => (b.net ?? -Infinity) - (a.net ?? -Infinity) || a.perDay - b.perDay);
}
function wGuideShrines() {
  const farm = gFarm();
  const list = shrinesModel().map((s) => ({ ...s, can: canMake(s.items) })).sort((a, b) => canFirst(a, b) || (b.net ?? -Infinity) - (a.net ?? -Infinity) || a.perDay - b.perDay);
  const best = [...list].sort((a, b) => (b.net ?? -Infinity) - (a.net ?? -Infinity)).find((s) => s.net > 0);
  return `<div class="kstrip">
      ${Kcell("Santuarios", fmt(list.length, 0), "7 días; Legendary 1, Obsidian 14 y Trading 30")}
      ${Kcell("Puedes construir", farm ? fmt(list.filter((s) => s.can > 0).length, 0) : "—", "con lo que tienes ahora", list.some((s) => s.can > 0) ? "green" : "")}
      ${Kcell("Los tuyos", farm ? fmt(list.filter((s) => s.mine).length, 0) : "—", farm ? list.filter((s) => s.mine).map((s) => `${s.name.replace(/ Shrine$/, "")}${s.mine.expired ? " (caducado)" : ""}`).join(", ") || "ninguno colocado" : "")}
      ${Kcell("El que más compensa", best ? esc(best.name.replace(/ Shrine$/, "")) : "—", best ? `+${fmt(best.net, 3)} FLW al día neto` : farm ? "ninguno se paga con tu producción de hoy" : "conecta tu granja", best ? "sun" : "")}
    </div>
    <div class="cb-cards">${list.map((s) => ItemCard({ name: s.name, can: s.can,
      tags: !s.mine ? (s.have ? `<span class="tag">en el inventario</span>` : "") : s.mine.expired ? `<span class="tag red">caducado</span>` : `<span class="tag green">quedan ${dur(s.mine.left)}</span>`,
      sub: `${esc(s.buff)} · dura ${s.days} día${s.days > 1 ? "s" : ""}`,
      body: IngList(s.items),
      stats: [["Coste", costCell(s.c)], ["Al día", fmt(s.perDay, 3)], ["Te devuelve", s.gain == null ? "—" : fmt(s.gain, 3), s.gain > 0 ? "up" : ""], ["Neto/día", s.net == null ? "—" : signed(s.net, 3), s.net == null ? "" : tone(s.net)]],
    })).join("")}</div>
    <div class="mod-f"><span>Primero los que puedes construir ya · "Te devuelve" = lo que suma a tu producción de hoy (Simulador); — si su efecto no sale en Producción (animales, cocina, mascotas, crafteo)</span><span>pets.ts · petShop.ts · collectibleBuilt.ts</span></div>`;
}

/* ════════════════════════════════════════════════════════════════════════
   Comida procesada (fishProcessing.ts): lo que pide cada una en cada estación, lo que cuesta y lo que vale
   ════════════════════════════════════════════════════════════════════════ */
const SEASON_ES = { spring: "Primavera", summer: "Verano", autumn: "Otoño", winter: "Invierno" };
const curSeason = () => gFarm()?.season?.season || "summer";
// Precio de mercado de verdad (sin caer en lo que cuesta hacerlo): para la cifra "Vale"
const mktPrice = (n) => (has("activity") && priceBook()(n).src === "mercado" ? priceBook()(n).v : null);
function wGuideProcess() {
  const P = G.utilities?.processing;
  if (!P) return Empty("fish", "Sin datos", "Regenera los datos del juego.");
  const season = curSeason();
  const rows = Object.keys(P.secs).map((item) => {
    const per = Object.fromEntries(Object.keys(SEASON_ES).map((s) => {
      const items = { ...(P.base[item] || {}), ...(P.seasonal[item]?.[s] || {}) };
      return [s, { items, c: costFlw(items) }];
    }));
    const now_ = per[season];
    return { item, secs: P.secs[item], per, now: now_, price: mktPrice(item), can: canMake(now_.items) };
  }).sort(canFirst);
  return `<div class="cb-cards">${rows.map((r) => ItemCard({ name: r.item, can: r.can, sub: `tarda ${dur(r.secs * 1000)} · receta de ${SEASON_ES[season].toLowerCase()}`,
      body: `${IngList(r.now.items)}<div class="cb-side">${Object.keys(SEASON_ES).map((s) => `<div class="${s === season ? "on" : ""}"><span>${SEASON_ES[s]}</span><b>${costCell(r.per[s].c)}</b></div>`).join("")}</div>`,
      stats: [["Coste ahora", costCell(r.now.c)], ["Vale", r.price == null ? "no se vende" : fmt(r.price, 3)], ["Puedes hacer", r.can == null ? "—" : `${r.can}×`, r.can ? "up" : "dim"]],
    })).join("")}</div>
    <div class="mod-f"><span>Primero las que puedes hacer ya · se hacen en el Fish Market con los peces de la estación y sirven de engodo para los crustáceos</span><span>fishProcessing.ts</span></div>`;
}

/* ════════════════════════════════════════════════════════════════════════
   Crustáceos (crustaceans.ts): trampa + engodo → crustáceo, lo que cuesta cada captura
   ════════════════════════════════════════════════════════════════════════ */
function wGuideCrust() {
  const C = G.utilities?.crustaceans;
  if (!C) return Empty("crab", "Sin datos", "Regenera los datos del juego.");
  const pb = priceBook(), farm = gFarm();
  const rows = Object.entries(C.lookup).flatMap(([trap, map]) => {
    const trapCost = pb(trap).v;
    return Object.entries(map).map(([chum, what]) => {
      const q = chum === "none" ? 0 : C.chums[trap]?.[chum] || 0;
      const chumCost = q ? gPrice(chum) : 0;
      const cost = trapCost != null && chumCost != null ? trapCost + (q ? chumCost * q : 0) : null;
      const items = { [trap]: 1, ...(q ? { [chum]: q } : {}) };
      return { trap, chum, q, what, items, cost, value: mktPrice(what), hours: C.hours[trap], have: farm ? haveOf(what) : null, can: canMake(items) };
    });
  }).sort((a, b) => canFirst(a, b) || (a.cost ?? Infinity) - (b.cost ?? Infinity));
  return `<div class="cb-cards">${rows.map((r) => ItemCard({ name: r.what, can: r.can, tags: r.have ? `<span class="tag">tienes ${fmt(r.have, 0)}</span>` : "",
      sub: `${esc(r.trap)} · ${r.chum === "none" ? "sin engodo" : `engodo ${esc(r.chum)}`} · ${r.hours} h`,
      body: IngList(r.items),
      stats: [["Coste", r.cost == null ? "—" : fmt(r.cost, 3)], ["Vale", r.value == null ? "no se vende" : fmt(r.value, 3)], ["Puedes poner", r.can == null ? "—" : `${r.can}×`, r.can ? "up" : "dim"]],
    })).join("")}</div>
    <div class="mod-f"><span>Primero las que puedes poner ya (trampa en el inventario + engodo) · la trampa se gasta en cada captura · trampa = coins a ${fmt(coinRate(), 0)}/FLOWER + plumas y lana a floor</span><span>crustaceans.ts · tools.ts</span></div>`;
}

/* ════════════════════════════════════════════════════════════════════════
   Utilidades: compostadores, fermentación, especiero y envejecer pescado (aging shed)
   ════════════════════════════════════════════════════════════════════════ */
S.guTab = readLS("guTab", "compost");
function wGuideUtil() {
  const U = G.utilities || {}, season = curSeason(), farm = gFarm();
  const tabs = gTabs("gut", S.guTab, [["compost", "Compostadores"], ["ferment", "Fermentación"], ["spice", "Especiero"], ["aging", "Envejecer pescado"]]);
  let body = "";
  const recipeCards = (recipes) => `<div class="cb-cards">${Object.entries(recipes || {}).filter(([, r]) => r.secs > 0).map(([name, r]) => {
    const c = costFlw(r.items), [[outName, outQ] = [name, 1]] = Object.entries(r.out);
    return { name, r, c, outName, outQ, price: mktPrice(outName), unit: c.v / outQ, can: canMake(r.items) };
  }).sort(canFirst).map((x) => ItemCard({ name: x.name, icon: x.outName, can: x.can, sub: `da ${x.outQ}× ${esc(x.outName)} · tarda ${dur(x.r.secs * 1000)}`,
    body: IngList(x.r.items),
    stats: [["Coste por unidad", x.c.ok ? fmt(x.unit, 3) : costCell(x.c)], ["Vale", x.price == null ? "no se vende" : fmt(x.price, 3)], ["Puedes hacer", x.can == null ? "—" : `${x.can}×`, x.can ? "up" : "dim"]],
  })).join("")}</div>`;
  if (S.guTab === "ferment") {
    body = recipeCards(U.fermentation) + `<div class="mod-f"><span>Primero lo que puedes hacer ya · encurtidos y abonos del invernadero en el aging shed (los cebos de pescado envejecido no salen aquí)</span><span>fermentation.ts</span></div>`;
  } else if (S.guTab === "spice") {
    body = recipeCards(U.spice) + `<div class="mod-f"><span>Primero lo que puedes hacer ya · un hueco por nivel del aging shed (máx. 6) · Salt Lick y Honey Treat son comida de animales</span><span>spiceRack.ts</span></div>`;
  } else if (S.guTab === "aging") {
    // agingBase.ts: XP máxima = XP del pez × 3 (≤200), × 4 (≤330) o × 5; sal = máx/50; tiempo = (máx − base) / 300|500|1000 horas
    const maxXp = (x) => x * (x <= 200 ? 3 : x <= 330 ? 4 : 5);
    const salt = gPrice("Salt");
    const rows = Object.entries(U.fishXp || {}).map(([fish, xp]) => {
      const mx = maxXp(xp), s = Math.round(mx / 50), h = (mx - xp) / (xp <= 200 ? 300 : xp <= 330 ? 500 : 1000);
      const have = farm ? haveOf(fish) : null;
      return { fish, xp, mx, prime: mx * 1.3, s, h, cost: salt != null ? s * salt : null, have, can: have && farm ? Math.min(have, Math.floor(haveOf("Salt") / s)) : 0 };
    }).sort((a, b) => canFirst(a, b) || (b.have || 0) - (a.have || 0) || b.mx - a.mx);
    body = `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Pez</th><th class="r">XP</th><th class="r">Envejecido</th><th class="r">Prime (10%)</th><th class="r">Sal</th><th class="r">Tarda</th><th class="r">Tienes</th><th class="r">Puedes envejecer</th></tr></thead><tbody>
      ${rows.map((r) => `<tr class="${r.can ? "" : "dim"}"><td class="w">${Gi(r.fish, 24)} ${esc(r.fish)}</td><td class="r mono">${fmt(r.xp, 0)}</td><td class="r mono"><b>${fmt(r.mx, 0)}</b></td><td class="r mono dim">${fmt(r.prime, 0)}</td>
        <td class="r mono">${r.s}${r.cost != null ? `<div class="ctx">${fmt(r.cost, 3)} FLW</div>` : ""}</td><td class="r mono">${dur(r.h * 3600_000)}</td>
        <td class="r mono">${r.have == null ? "—" : fmt(r.have, 0)}</td><td class="r mono ${r.can ? "up" : ""}">${farm ? `${r.can}×` : "—"}</td></tr>`).join("")}
      </tbody></table></div>
      <div class="mod-f"><span>Primero los que puedes envejecer ya (pez + sal) · sin boosts: Speedy Aging acorta, Ager cambia lo que entra y sale, Fish Smoking / Salt Sculpture / Winged Vase suben la Prime (×1,3 de XP)</span><span>agingBase.ts · agingFormulas.ts</span></div>`;
  } else {
    const D = G.composters?.details || {}, SZ = G.composters?.seasons || {};
    const rows = Object.entries(D).map(([name, d]) => {
      const items = SZ[name]?.[season] || {}, c = costFlw(items);
      return { name, d, items, c, unit: c.v / (d.produceAmount || 1), all: Object.fromEntries(Object.keys(SEASON_ES).map((s) => [s, costFlw(SZ[name]?.[s] || {}).v / (d.produceAmount || 1)])),
        owned: farm ? (farm.buildings?.[name] || []).length : null, can: farm && (farm.buildings?.[name] || []).length ? canMake(items) : 0 };
    }).sort(canFirst);
    body = `<div class="cb-cards">${rows.map((r) => ItemCard({ name: r.name, can: r.can, tags: r.owned === 0 ? `<span class="tag">no lo tienes</span>` : "",
      sub: `da ${r.d.produceAmount}× ${esc(r.d.produce)} + ${esc(r.d.worm)} · tarda ${dur(r.d.timeToFinishMilliseconds)}${r.d.resourceBoostRequirements ? ` · −${dur(r.d.resourceBoostMilliseconds)} con ${r.d.resourceBoostRequirements} huevos` : ""}`,
      body: `${IngList(r.items)}<div class="cb-side">${Object.keys(SEASON_ES).map((s) => `<div class="${s === season ? "on" : ""}"><span>${SEASON_ES[s]}</span><b>${fmt(r.all[s], 4)}</b></div>`).join("")}</div>`,
      stats: [["Coste por unidad", r.c.ok ? fmt(r.unit, 4) : costCell(r.c)], ["Vale", mktPrice(r.d.produce) == null ? "no se vende" : fmt(mktPrice(r.d.produce), 4)], ["Puedes llenar", r.can == null ? "—" : `${r.can}×`, r.can ? "up" : "dim"]],
    })).join("")}</div>
      <div class="mod-f"><span>Primero los que puedes llenar ya · coste por unidad = lo que pide en la estación a floor ÷ lo que da (a la derecha, cada estación)</span><span>composters.ts</span></div>`;
  }
  return `<div class="toolbar" style="padding:8px 12px">${tabs}<span class="grow"></span><span class="ctx">Estación: ${SEASON_ES[season]}</span></div>${body}`;
}
ACTIONS.gut = (v) => { S.guTab = v; writeLS("guTab", v); rerun(); };

/* ── Páginas ─────────────────────────────────────────────────────────────── */
const GAME_GUIDES = {
  gcollect: { title: "Coleccionables", icon: "gem", render: wGuideCollect, soft: ["activity", "farm"], sub: "Todos los coleccionables y prendas: qué hacen, si se pueden retirar del juego y cuánto valen",
    act: () => `<input class="inp" type="search" placeholder="Buscar nombre o boost" value="${esc(S.gcol.q)}" data-inp="gcq" style="width:220px">` },
  gcraft: { title: "Crafteo", icon: "hammer", render: wGuideCraft, soft: ["activity", "farm", "craftRecipes"], sub: "Qué lleva cada receta de la Crafting Box y en qué casilla, lo que cuesta y si te sale a cuenta" },
  gbuild: { title: "Edificios", icon: "hammer", render: wGuideBuildings, soft: ["activity", "farm"], sub: "Qué cuesta construir y mejorar cada edificio, qué piden los compostadores y el pozo de lava" },
  gforge: { title: "Forja de nodos", icon: "hammer", render: wGuideForge, soft: ["activity", "farm", "myBoosts"], sub: "Forjar 4 nodos en uno de tier 2 o 3: lo que cuesta, lo que ganas al día y cuándo se paga" },
  gshrines: { title: "Santuarios", icon: "star", render: wGuideShrines, soft: ["activity", "farm", "myBoosts"], sub: "Lo que cuesta cada santuario, cuánto dura y si te compensa con tu producción" },
  gprocess: { title: "Comida procesada", icon: "fish", render: wGuideProcess, soft: ["activity", "farm"], sub: "Fish Flake, Fish Stick, Crab Stick y Fish Oil: qué piden en cada estación y lo que cuestan" },
  gcrust: { title: "Crustáceos", icon: "crab", render: wGuideCrust, soft: ["activity", "farm"], sub: "Qué sale con cada trampa y engodo, lo que cuesta cada captura y lo que vale" },
  gutil: { title: "Utilidades", icon: "barrel", render: wGuideUtil, soft: ["activity", "farm"], sub: "Compostadores, fermentación, especiero y envejecer pescado: coste por unidad y lo que vale" },
  gexpand: { title: "Expansiones", icon: "sprout", render: wGuideExpand, soft: ["activity", "farm", "myBoosts"], sub: "Elige hasta qué parcela llegar: lo que te falta, lo que cuesta, cuánto tardas en juntarlo y los nodos que ganas" },
  glevels: { title: "Nivel Bumpkin", icon: "star", render: wGuideLevels, soft: ["activity", "farm"], sub: "La XP de cada nivel, qué desbloquea y cuánto te cuesta llegar al que quieras" },
  gnpc: { title: "Entregas de NPCs", icon: "scroll", render: wGuideNpc, soft: ["activity", "farm", "npcDeliveries"], sub: "Qué puede pedir cada NPC, qué da a cambio y cuánto cuesta" },
  gshops: { title: "Tiendas", icon: "coin", render: wGuideShops, soft: ["activity", "farm"], sub: "Qué vende cada tienda del juego, qué pide a cambio y cuánto vale en FLOWER" },
};
for (const [key, g] of Object.entries(GAME_GUIDES)) {
  PAGES[key] = () => {
    $("#page").innerHTML = `<div class="plate">${Mod({ id: `${key}-main`, span: 12, title: g.title, icon: g.icon, flush: true, act: g.act ? g.act() : "" })}</div>`;
    mount(`${key}-main`, { deps: [], soft: g.soft, render: g.render, loading: "rows" });
  };
  PAGE_META[key] = { title: g.title, sub: () => g.sub };
}
