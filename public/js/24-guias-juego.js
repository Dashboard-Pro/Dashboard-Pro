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
  list.sort(sorters[f.sort] || sorters.name);
  const mine = d.rows.filter((r) => r.own > 0), worth = mine.reduce((s, r) => s + (r.price || 0) * r.own, 0);
  const wdNow = mine.filter((r) => r.rel.k === "yes").reduce((s, r) => s + (r.price || 0) * r.own, 0);
  const count = (k) => d.rows.filter((r) => r.rel.k === k).length;
  const shown = list.slice(0, 250);
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
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Objeto</th><th>Tipo</th><th>Qué hace</th><th>Retiro</th><th class="r">Floor</th><th class="r">Tienes</th></tr></thead><tbody>
    ${shown.map((r) => `<tr ${r.kind === "wearable" && G.wearableIds[r.name] != null ? `data-open="wearables-${G.wearableIds[r.name]}"` : G.itemIds?.[r.name] != null ? `data-open="collectibles-${G.itemIds[r.name]}"` : ""}>
      <td class="w">${Gi(r.name, 18)} ${esc(r.name)}</td><td class="ctx">${r.kind === "wearable" ? "Prenda" : "Coleccionable"}</td>
      <td class="ctx wrap">${esc(r.buff) || `<span class="faint">decorativo</span>`}</td>
      <td><span class="tag ${WD_ES[r.rel.k][1]}">${WD_ES[r.rel.k][0]}${r.rel.at ? ` · ${new Date(r.rel.at).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" })}` : ""}</span></td>
      <td class="r mono">${r.price == null ? "—" : fmt(r.price, r.price < 1 ? 3 : 2)}</td><td class="r mono ${r.own ? "" : "dim"}">${r.own ? fmt(r.own, 0) : "—"}</td></tr>`).join("")}
    </tbody></table></div>
    <div class="mod-f"><span>${list.length > shown.length ? `Mostrando ${shown.length} de ${fmt(list.length, 0)}: afina con los filtros o el buscador` : `${fmt(list.length, 0)} resultados`}</span><span>Fechas de retiro: withdrawables.ts del juego</span></div>`;
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
  const grid = (r) => `<div class="cb-grid">${r.grid.map((n) => `<span${n ? ` data-tip="${esc(n)}||"` : ""}>${n ? Gi(n, 16) : ""}</span>`).join("")}</div>`;
  return `<div class="toolbar" style="padding:8px 12px">${gTabs("gcg", grp, [["", `Todas ${d.rows.reduce((s, g) => s + g.recipes.length, 0)}`], ...d.rows.map((g) => [g.name, `${g.name} ${g.recipes.length}`])])}</div>
    ${list.map((g) => `<div class="grp">${esc(g.name)}</div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Objeto</th><th>Rejilla</th><th>Ingredientes</th><th class="r">Coste</th><th class="r">Floor</th><th class="r">Margen</th><th class="r">Puedes hacer</th></tr></thead><tbody>
      ${g.recipes.map((r) => `<tr><td class="w">${Gi(r.name, 20)} ${esc(r.name)}${r.have ? ` <span class="tag">tienes ${fmt(r.have, 0)}</span>` : ""}</td><td>${grid(r)}</td>
        <td class="ctx wrap">${itemsTxt(r.counts)}</td><td class="r mono">${r.cost != null ? fmt(r.cost, 3) : r.partial ? `${fmt(r.partial, 3)}<span class="faint" title="Hay ingredientes sin precio">*</span>` : "—"}</td>
        <td class="r mono">${r.market == null ? "—" : fmt(r.market, 3)}</td><td class="r mono ${r.margin == null ? "" : r.margin > 0 ? "up" : "down"}">${r.margin == null ? "—" : fmt(r.margin, 3)}</td>
        <td class="r mono ${r.can ? "up" : "dim"}">${gFarm() ? fmt(r.can, 0) : "—"}</td></tr>`).join("")}
      </tbody></table></div>`).join("")}
    <div class="mod-f"><span>La posición en la rejilla importa: la caja compara la forma · coste = ingredientes a floor (si no se venden y son otra receta, lo que cuesta hacerla)</span><span>Margen = floor −10% de comisión − coste · recetas de sfl.world</span></div>`;
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
  return `<div class="toolbar" style="padding:8px 12px">${tabs}</div>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Edificio</th><th class="r">Nivel Bumpkin</th><th class="r">Construcción</th><th>Coste</th><th class="r">FLW</th><th>Mejoras</th><th class="r">Total</th></tr></thead><tbody>
    ${rows.map((r) => `<tr><td class="w">${Gi(r.name, 18)} ${esc(r.name)}${r.built ? ` <span class="tag green">${r.ups.length ? `nivel ${r.myLv}` : r.built > 1 ? `×${r.built}` : "lo tienes"}</span>` : lvl != null && lvl < r.level ? ` <span class="tag">nivel ${r.level}</span>` : ""}</td>
      <td class="r mono">${r.level || "cualquiera"}</td><td class="r mono">${r.secs ? dur(r.secs * 1000) : "al instante"}</td><td class="ctx wrap">${itemsTxt(r.items, r.coins)}</td><td class="r mono">${costCell(r.c)}</td>
      <td class="ctx wrap">${r.ups.map((u) => `<div class="${r.myLv >= u.lv ? "faint" : ""}"><b>Nv ${u.lv}</b>${u.req ? ` (Bumpkin ${u.req})` : ""}: ${itemsTxt(u.items, u.coins)} · ${costCell(u.c)} FLW${u.secs ? ` · ${dur(u.secs * 1000)}` : ""}</div>`).join("") || "—"}</td>
      <td class="r mono">${r.ups.length ? costCell(r.total) : "—"}</td></tr>`).join("")}
    </tbody></table></div>
    <div class="mod-f"><span>Coste = coins a ${fmt(coinRate(), 0)}/FLOWER + ingredientes a floor · * = hay ingredientes sin precio</span><span>Datos: buildings.ts y upgradeBuilding.ts</span></div>`;
}
ACTIONS.gbt = (v) => { S.gbTab = v; writeLS("gbTab", v); rerun(); };

/* ════════════════════════════════════════════════════════════════════════
   Expansiones — cada parcela de cada isla (expansions.ts): nivel, tiempo, coste
   ════════════════════════════════════════════════════════════════════════ */
S.geIsland = readLS("geIsland", "");
function wGuideExpand() {
  const farm = gFarm(), myIsland = farm?.island?.type || "basic", count = farm ? toNum(farm.inventory?.["Basic Land"]) : 0;
  const islands = Object.keys(G.expansions || {});
  const isl = islands.includes(S.geIsland) ? S.geIsland : islands.includes(myIsland) ? myIsland : islands[0];
  const table = G.expansions?.[isl] || {};
  let cum = 0, cumSecs = 0;
  // Nodos que trae cada parcela (casillas de su LAYOUT) y los que llevas en total
  const NE = G.expansionNodes?.[isl], running = { ...(NE?.base || {}) };
  const rows = Object.entries(table).map(([n, r]) => {
    const c = costFlw(r.resources, r.coins);
    if (r.sfl) c.v += r.sfl;
    cum += c.v; cumSecs += r.seconds || 0;
    const add = NE?.add?.[n] || null;
    for (const [k, v] of Object.entries(add || {})) running[k] = (running[k] || 0) + v;
    const nodes = add && Object.entries(add).map(([k, v]) => ({ k, v, total: running[k] }));
    const mine = isl === myIsland && farm;
    return { n: Number(n), ...r, c, cum, cumSecs, nodes, done: mine && Number(n) <= count, next: mine && Number(n) === count + 1 };
  }).sort((a, b) => a.n - b.n);
  const up = G.islandUpgrade?.[isl];
  const lvl = farm ? bumpkinLevel(toNum(farm.bumpkin?.experience)).lvl : null;
  return `<div class="toolbar" style="padding:8px 12px">${gTabs("gei", isl, islands.map((i) => [i, `Isla ${ISLAND_ES[i] || i}${i === myIsland && farm ? " ·  la tuya" : ""}`]))}</div>
    <div class="kstrip">
      ${Kcell("Expansiones", fmt(rows.length, 0), rows.length ? `de la ${rows[0].n} a la ${rows[rows.length - 1].n}` : "")}
      ${Kcell("Todas", `${fmt(rows.at(-1)?.cum || 0, 1)}<small>FLW</small>`, `y ${dur((rows.at(-1)?.cumSecs || 0) * 1000)} de obra, sin boosts`)}
      ${Kcell("Tu granja", farm && isl === myIsland ? `${count}<small>parcelas</small>` : "—", farm && isl === myIsland ? (rows.find((r) => r.next) ? `siguiente: la ${count + 1}` : "isla completa") : "cambia a tu isla para verla", "sun")}
      ${NE ? Kcell("Con lo que empiezas", `${fmt(Object.values(NE.base).reduce((a, b) => a + b, 0), 0)}<small>nodos</small>`, Object.entries(NE.base).filter(([, v]) => v).map(([k, v]) => `${v} ${k}`).join(" · ")) : ""}
      ${up ? Kcell("Subir de isla", `→ ${esc(ISLAND_ES[up.to] || up.to)}`, `con ${up.expansions} expansiones${Object.keys(up.items || {}).length ? ` · ${Object.entries(up.items).map(([k, q]) => `${q} ${k}`).join(", ")}` : ""}`) : ""}
    </div>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Parcela</th><th class="r">Nivel Bumpkin</th><th class="r">Obra</th><th>Pide</th><th>Nodos que trae</th><th class="r">Coste FLW</th><th class="r">Acumulado</th></tr></thead><tbody>
    ${rows.map((r) => `<tr class="${r.done ? "dim" : ""}"><td class="w">Land ${r.n}${r.done ? ` <span class="tag green">hecha</span>` : r.next ? ` <span class="tag sun">la siguiente</span>` : ""}</td>
      <td class="r mono ${lvl != null && lvl < r.level ? "down" : ""}">${r.level}</td><td class="r mono">${r.seconds ? dur(r.seconds * 1000) : "—"}</td>
      <td class="ctx wrap">${itemsTxt(r.resources, r.coins)}${r.sfl ? ` ${Gi("FLOWER", 12, "sun")} ${fmt(r.sfl, 2)}` : ""}</td>
      <td class="ctx wrap">${r.nodes ? r.nodes.map((x) => `<span style="margin-right:6px" title="${esc(x.k)}: ${x.total} en total">${Gi(x.k, 12)} +${x.v} <span class="faint">(${x.total})</span></span>`).join("") || "—" : "—"}</td><td class="r mono">${costCell(r.c)}</td><td class="r mono dim">${fmt(r.cum, 1)}</td></tr>`).join("")}
    </tbody></table></div>
    <div class="mod-f"><span>Sin boosts (Grinx's Hammer, VIP, Ascension Monument): tu siguiente con tus boosts está en Estrategia → Expansión</span><a href="#strategy" class="ctx">Estrategia →</a></div>`;
}
ACTIONS.gei = (v) => { S.geIsland = v; writeLS("geIsland", v); rerun(); };

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
function wGuideLevels() {
  const d = levelGuideModel();
  const flw = d.best?.xpPerFlower ? d.need / d.best.xpPerFlower : null;
  const list = d.rows.filter((r) => !S.glOnly || r.unlocks.length);
  return `<div class="toolbar" style="padding:8px 12px;gap:10px;flex-wrap:wrap">
      <span class="ctx">Del nivel <b>${d.cur}</b> al</span><input class="inp" type="number" min="${d.cur + 1}" max="${d.max}" value="${d.target}" data-chg="glt" style="width:70px">
      <label class="toggle"><input type="checkbox" data-chg="glo" ${S.glOnly ? "checked" : ""}><i></i>Solo niveles que desbloquean algo</label>
    </div>
    <div class="kstrip">
      ${Kcell("XP que te falta", compact(d.need), `${d.target - d.cur} niveles${gFarm() ? " contando la que ya tienes" : ""}`, "sun")}
      ${Kcell("Con la comida más rentable", flw != null ? `${fmt(flw, 1)}<small>FLW</small>` : "—", d.best ? `${esc(d.best.name)} · ${compact(d.best.xpPerFlower)} XP/FLOWER` : "sin precios")}
      ${Kcell("Puntos de habilidad", fmt(d.target - d.cur, 0), "1 por nivel")}
    </div>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Nivel</th><th class="r">XP al siguiente</th><th class="r">XP total</th><th>Desbloquea</th></tr></thead><tbody>
    ${list.map((r) => `<tr class="${r.l < d.cur ? "dim" : ""}"><td class="w">${r.l}${r.l === d.cur ? ` <span class="tag sun">tú</span>` : ""}${r.l === d.target ? ` <span class="tag green">objetivo</span>` : ""}</td>
      <td class="r mono">${fmt(r.toNext, 0)}</td><td class="r mono dim">${fmt(r.total, 0)}</td>
      <td class="ctx wrap">${r.unlocks.map((u) => `${Gi(u, 14)} ${esc(u)}`).join(" · ") || ""}</td></tr>`).join("")}
    </tbody></table></div>
    <div class="mod-f"><span>XP de cada nivel: level.ts · desbloqueos: semillas y edificios del juego</span><span>Más allá del 150 se asciende (bandas de niveles extra)</span></div>`;
}
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
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>NPC</th><th>Paga en</th><th class="r">Nivel</th><th class="r">Recompensa media</th><th class="r">Coste medio</th><th class="r">Pedidos posibles</th><th class="r">Le has entregado</th></tr></thead><tbody>
    ${list.map((n) => `<tr data-act="gno:${esc(n.npc)}" style="cursor:pointer" class="${n.locked ? "dim" : ""}"><td class="w">${S.gnOpen === n.npc ? "▾" : "▸"} ${esc(NPC_ES(n.npc))}${n.locked ? ` <span class="tag">nivel ${n.level}</span>` : ""}</td>
      <td class="ctx">${NPC_KIND_ES[n.kind] || n.kind}</td><td class="r mono">${n.level ?? "—"}</td>
      <td class="r mono">${rewardTxt(n, n.avg)}${n.kind === "COINS" && n.rewardFlw != null ? `<div class="faint">${fmt(n.rewardFlw, 3)} FLW</div>` : ""}</td>
      <td class="r mono">${n.avgCost == null ? "—" : fmt(n.avgCost, 3)}</td><td class="r mono">${n.orders.length}</td><td class="r mono dim">${gFarm() ? fmt(n.done, 0) : "—"}</td></tr>
      ${S.gnOpen === n.npc ? `<tr><td colspan="7" style="padding:0"><table class="tbl"><tbody>${n.orders.map((o) => `<tr><td class="ctx wrap" style="padding-left:28px">${itemsTxt(o.items)}</td>
        <td class="r mono">${rewardTxt(n, o.reward)}</td><td class="r mono">${costCell(o.c)} FLW</td></tr>`).join("")}</tbody></table></td></tr>` : ""}`).join("")}
    </tbody></table></div>
    <div class="mod-f"><span>Pedidos recogidos por sfl.world de todas las granjas${d.updated ? ` (actualizado hace ${esc(d.updated.replace(/ ago$/, "").replace("months", "meses").replace("month", "mes").replace("days", "días").replace("weeks", "semanas"))})` : ""} · pulsa un NPC para ver sus pedidos</span><span>Coste a floor sin tus boosts · tus pedidos de hoy, en Misiones</span></div>`;
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
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Objeto</th><th>Qué hace</th><th class="r">Love Charms</th><th class="r">Valor FLW</th><th class="r">Floor</th><th class="r">Tienes</th></tr></thead><tbody>
      ${rows.map((r) => `<tr><td class="w">${Gi(r.n, 18)} ${esc(r.n)}${lc != null && lc >= r.lc ? ` <span class="tag green">te llega</span>` : ""}</td><td class="ctx wrap">${buffTxt(r.n) || `<span class="faint">${r.type === "wearable" ? "prenda" : "coleccionable"}</span>`}</td>
        <td class="r mono">${fmt(r.lc, 0)}</td><td class="r mono">${fmt(r.lc / LC_PER_FLOWER, 2)}</td><td class="r mono ${r.market != null && r.market > r.lc / LC_PER_FLOWER ? "up" : ""}">${r.market == null ? "—" : fmt(r.market, 2)}</td>
        <td class="r mono dim">${owned(r.n) ? fmt(owned(r.n), 0) : "—"}</td></tr>`).join("")}
      </tbody></table></div><div class="mod-f"><span>Lista por defecto del juego (el servidor puede cambiarla) · en verde el floor si vale más que lo que pagas en Love Charms</span></div>`;
  } else if (tab === "blacksmith") {
    const rows = Object.entries(G.blacksmith || {}).map(([n, x]) => ({ n, ...x, c: costFlw(x.items, x.coins), market: marketOnly(n), own: owned(n) || (farm && isPlaced(farm, n) ? 1 : 0) }));
    body = `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Objeto</th><th>Qué hace</th><th>Pide</th><th class="r">Coste FLW</th><th class="r">Floor</th></tr></thead><tbody>
      ${rows.map((r) => `<tr class="${r.own ? "dim" : ""}"><td class="w">${Gi(r.n, 18)} ${esc(r.n)}${r.own ? ` <span class="tag green">lo tienes</span>` : ""}</td><td class="ctx wrap">${buffTxt(r.n)}</td>
        <td class="ctx wrap">${itemsTxt(r.items, r.coins)}</td><td class="r mono">${costCell(r.c)}</td><td class="r mono">${r.market == null ? "—" : fmt(r.market, 2)}</td></tr>`).join("")}
      </tbody></table></div><div class="mod-f"><span>Cada uno se fabrica una sola vez: no puedes tener dos</span><span>coins a ${fmt(coinRate(), 0)}/FLOWER + ingredientes a floor</span></div>`;
  } else if (tab === "weather") {
    const mult = { basic: 1, spring: 1, desert: 2, volcano: 2.5 };
    const myIsl = farm?.island?.type;
    const WEATHER_ES = { "Tornado Pinwheel": "tornado", Mangrove: "tsunami", "Thermal Stone": "gran helada", "Protective Pesticide": "plaga de insectos" };
    body = `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Objeto</th><th>Protege de</th><th>Básica / primavera</th><th>Desierto ×2</th><th>Volcán ×2,5</th><th class="r">Tienes</th></tr></thead><tbody>
      ${Object.entries(G.weatherShop || {}).map(([n, x]) => `<tr><td class="w">${Gi(n, 18)} ${esc(n)}</td><td class="ctx">${WEATHER_ES[n] || ""}</td>
        ${[1, 2, 2.5].map((m) => { const items = Object.fromEntries(Object.entries(x.ingredients || {}).map(([k, q]) => [k, q * m])), c = costFlw(items, x.coins * m); const mine = myIsl && (mult[myIsl] ?? 1) === m; return `<td class="ctx${mine ? " up" : ""}">${itemsTxt(items, x.coins * m)}<div>${costCell(c)} FLW${mine ? " · tu isla" : ""}</div></td>`; }).join("")}
        <td class="r mono dim">${owned(n) ? fmt(owned(n), 0) : "—"}</td></tr>`).join("")}
      </tbody></table></div><div class="mod-f"><span>Se gastan al protegerte de su calamidad · en el desierto cuestan el doble y en el volcán ×2,5</span></div>`;
  } else {
    const act = farm?.farmActivity || {}, sun = marketOnly("Sunstone"), obs = marketOnly("Obsidian");
    body = `<div class="kstrip">${Kcell("Sunstone", sun != null ? `${fmt(sun, 2)}<small>FLW</small>` : "—", "floor de hoy", "sun")}${Kcell("Obsidian", obs != null ? `${fmt(obs, 2)}<small>FLW</small>` : "—", "3 Obsidian = 1 Sunstone en el canje")}${Kcell("Tus Sunstone", farm ? fmt(toNum(farm.inventory?.Sunstone), 0) : "—", "")}</div>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Nodo</th><th>Isla</th><th class="r">Precio base</th><th class="r">Sube por compra</th><th class="r">Ya compraste</th><th class="r">El siguiente</th><th class="r">En FLOWER</th><th class="r">En Obsidian</th></tr></thead><tbody>
      ${Object.entries(G.nodePrices || {}).map(([n, x]) => { const bought = toNum(act[`${n} Bought`]), next = x.price + bought * x.increase; return `<tr><td class="w">${Gi(n, 18)} ${esc(n)}${Object.keys(x.items || {}).length > 1 ? ` <span class="ctx">+ ${Object.keys(x.items).filter((k) => k !== n).join(", ")}</span>` : ""}</td>
        <td class="ctx">${esc(ISLAND_ES[x.requiredIsland] || x.requiredIsland)}</td><td class="r mono">${x.price}</td><td class="r mono">+${x.increase}</td><td class="r mono ${bought ? "" : "dim"}">${farm ? bought : "—"}</td>
        <td class="r mono"><b>${next}</b></td><td class="r mono">${sun != null ? fmt(next * sun, 2) : "—"}</td><td class="r mono dim">${next * 3}</td></tr>`; }).join("")}
      </tbody></table></div><div class="mod-f"><span>En Infernos (nivel 30+): cada compra sube el precio del siguiente nodo del mismo tipo · precio en Sunstone</span></div>`;
  }
  return `<div class="toolbar" style="padding:8px 12px">${tabs}</div>${body}`;
}
ACTIONS.gst = (v) => { S.gsTab = v; writeLS("gsTab", v); rerun(); };

/* ── Páginas ─────────────────────────────────────────────────────────────── */
const GAME_GUIDES = {
  gcollect: { title: "Coleccionables", icon: "gem", render: wGuideCollect, soft: ["activity", "farm"], sub: "Todos los coleccionables y prendas: qué hacen, si se pueden retirar del juego y cuánto valen",
    act: () => `<input class="inp" type="search" placeholder="Buscar nombre o boost" value="${esc(S.gcol.q)}" data-inp="gcq" style="width:220px">` },
  gcraft: { title: "Crafteo", icon: "hammer", render: wGuideCraft, soft: ["activity", "farm", "craftRecipes"], sub: "Qué lleva cada receta de la Crafting Box y en qué casilla, lo que cuesta y si te sale a cuenta" },
  gbuild: { title: "Edificios", icon: "hammer", render: wGuideBuildings, soft: ["activity", "farm"], sub: "Qué cuesta construir y mejorar cada edificio, qué piden los compostadores y el pozo de lava" },
  gexpand: { title: "Expansiones", icon: "sprout", render: wGuideExpand, soft: ["activity", "farm"], sub: "Qué cuesta cada expansión de cada isla, cuánto tarda y qué nivel pide" },
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
