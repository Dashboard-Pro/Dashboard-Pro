// SFL Console — Referencia: tablas del juego que no necesitan granja (cofres, cocina, pesca, semillas y herramientas),
// con los precios del mercado de hoy. Salen del código del juego (gamedata.js).
// Scripts clásicos que comparten el ámbito global en el orden de index.html (antes, un solo app.js).
"use strict";

/* ════════════════════════════════════════════════════════════════════════
   19. Referencia
   ════════════════════════════════════════════════════════════════════════ */
// Cocina y pesca pasaron a Guías (23-guias.js), con tus boosts
const REF_TABS = [["chests", "Cofres"], ["seeds", "Semillas"], ["tools", "Herramientas"]];
const CHEST_ES = {
  BASIC_REWARDS: ["Cofre básico", "se abre con Treasure Key"], RARE_REWARDS: ["Cofre raro", "se abre con Rare Key"], LUXURY_REWARDS: ["Cofre de lujo", "se abre con Luxury Key"],
  BUD_BOX_REWARDS: ["Caja de Bud", "una al día si tienes un Bud"], PIRATE_CHEST_REWARDS: ["Cofre pirata", "en la plaza, con la poción pirata"],
  BASIC_DESERT_STREAK: ["Racha del desierto 1–3 días", "premio por los 3 artefactos"], ADVANCED_DESERT_STREAK: ["Racha del desierto 4–10 días", "premio por los 3 artefactos"],
  EXPERT_DESERT_STREAK: ["Racha del desierto 11+ días", "premio por los 3 artefactos"], MANEKI_NEKO_REWARDS: ["Maneki Neko", "una comida gratis al día"],
  FESTIVE_TREE_REWARDS: ["Árbol festivo", "regalo de Navidad"], GIFT_GIVER_REWARDS: ["Regalos", "el que reparte regalos en la plaza"],
};
const SEASON_ES2 = { spring: "primavera", summer: "verano", autumn: "otoño", winter: "invierno" };
const FISH_TYPE_ES = { basic: "Básico", advanced: "Avanzado", expert: "Experto", "marine marvel": "Maravilla marina", chapter: "Del capítulo" };
const refPrice = (name) => (has("activity") ? (name === "Gem" ? flowerPerGem() : priceBook()(name).v) : null);

function wRefChests() {
  const key = S.refChest in CHEST_ES ? S.refChest : "BASIC_REWARDS";
  const list = G.chests?.[key] || [];
  const total = list.reduce((a, r) => a + toNum(r.weighting), 0);
  const rows = list.map((r) => {
    const parts = [];
    if (r.coins) parts.push({ name: "coins", q: r.coins, v: r.coins / coinRate() });
    for (const [n, q] of Object.entries(r.items || {})) { const p = refPrice(n); parts.push({ name: n, q, v: p == null ? null : p * q }); }
    for (const [n, q] of Object.entries(r.wearables || {})) { const p = refPrice(n); parts.push({ name: n, q, v: p == null ? null : p * q }); }
    const v = parts.some((p) => p.v == null) ? null : parts.reduce((a, p) => a + p.v, 0);
    return { parts, p: total ? toNum(r.weighting) / total : 0, v };
  }).sort((a, b) => b.p - a.p);
  const ev = rows.every((r) => r.v != null) ? rows.reduce((a, r) => a + r.p * r.v, 0) : rows.filter((r) => r.v != null).reduce((a, r) => a + r.p * r.v, 0);
  const known = rows.filter((r) => r.v != null).reduce((a, r) => a + r.p, 0);
  const seg = `<div class="seg ref-seg">${Object.entries(CHEST_ES).filter(([k]) => G.chests?.[k]).map(([k, [l]]) => `<button data-act="refchest:${k}" class="${k === key ? "on" : ""}">${l}</button>`).join("")}</div>`;
  const dyn = G.chests?.dynamic?.[key];
  return `${seg}<div class="kstrip">
      ${Kcell("Premios posibles", fmt(rows.length, 0), CHEST_ES[key][1])}
      ${Kcell("Valor medio", has("activity") ? `${fmt(ev, 2)} <small>FLOWER</small>` : "—", known < 0.999 ? `solo el ${fmt(known * 100, 0)}% con precio` : "por cofre, a precios de hoy", "sun")}
    </div>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Premio</th><th class="r">Probabilidad</th><th class="r">Valor</th><th class="r">Aporta a la media</th></tr></thead><tbody>
      ${rows.map((r) => `<tr><td>${r.parts.map((p) => `<span class="ref-it">${p.name === "coins" ? Gi("Coins", 16, "coin") : Gi(p.name, 16)} ${fmt(p.q, 0)} ${esc(p.name === "coins" ? "coins" : p.name)}</span>`).join(" + ")}</td>
        <td class="r mono">${fmt(r.p * 100, r.p < 0.01 ? 2 : 1)}%</td><td class="r mono">${r.v == null ? "—" : fmt(r.v, 3)}</td><td class="r mono">${r.v == null ? "—" : fmt(r.v * r.p, 3)}</td></tr>`).join("")}
    </tbody></table></div>
    <div class="mod-f"><span>Pesos sacados del código del juego${dyn ? ` · además, cada objeto ${key === "LUXURY_REWARDS" ? "de la megatienda" : "del pase"} del capítulo entra con peso ${dyn} (baja un poco el resto)` : ""}</span><span>gemas al precio de la tienda · coins a ${fmt(coinRate(), 0)}/FLOWER</span></div>`;
}

function wRefSeeds() {
  const seasonsOf = (seed) => Object.entries(G.seasonalSeeds || {}).filter(([, l]) => l.includes(seed)).map(([s]) => s);
  const outOf = (seed) => seed.replace(/ (Seed|Plant)$/, "");
  const secsOf = (seed) => G.crops?.[outOf(seed)] ?? G.fruitSeeds?.[seed] ?? G.greenhouseCrops?.[outOf(seed)] ?? G.greenhouseFruitSeeds?.[seed] ?? G.flowerSeeds?.[seed];
  const rows = Object.entries(G.seedPrices || {}).map(([seed, coins]) => {
    const out = G.fruitSeedOf ? Object.keys(G.fruitSeedOf).find((f) => G.fruitSeedOf[f] === seed) || outOf(seed) : outOf(seed);
    const sell = refPrice(out);
    return { seed, coins, flw: coins / coinRate(), secs: secsOf(seed), stock: G.seedStock?.[seed], seasons: seasonsOf(seed), out, sell };
  }).sort((a, b) => a.coins - b.coins);
  return `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Semilla</th><th class="r">Precio</th><th class="r">En FLOWER</th><th class="r">Crece en</th><th class="r">Stock al día</th><th>Estaciones</th><th class="r">Da</th><th class="r">Precio P2P de lo que da</th></tr></thead><tbody>
    ${rows.map((r) => `<tr><td>${Gi(r.seed, 16)} ${esc(r.seed)}</td><td class="r mono">${fmt(r.coins, r.coins < 1 ? 2 : 0)} coins</td><td class="r mono">${fmt(r.flw, r.flw < 0.001 ? 6 : 4)}</td>
      <td class="r mono">${r.secs ? dur(r.secs * 1000) : "—"}</td><td class="r mono">${r.stock ?? "—"}</td>
      <td>${r.seasons.length === 4 || !r.seasons.length ? `<span class="ctx">${r.seasons.length ? "todas" : "—"}</span>` : r.seasons.map((s) => `<span class="tag">${SEASON_ES2[s]}</span>`).join(" ")}</td>
      <td>${Gi(r.out, 14)} ${esc(r.out)}</td><td class="r mono">${r.sell == null ? "—" : fmt(r.sell, 4)}</td></tr>`).join("")}
  </tbody></table></div><div class="mod-f"><span>Precios de la tienda del juego (sin descuentos de skills) · coins a ${fmt(coinRate(), 0)}/FLOWER · el stock se repone cada día</span></div>`;
}

function wRefTools() {
  const foods = new Set(Object.keys(G.foods || {}));
  const rows = Object.entries(G.recipes || {}).filter(([n]) => !foods.has(n)).map(([name, r]) => {
    const parts = Object.entries(r.items || {}).map(([n, q]) => ({ n, q, v: refPrice(n) }));
    const cost = parts.some((p) => p.v == null) ? null : parts.reduce((a, p) => a + p.v * p.q, 0) + r.coins / coinRate();
    return { name, coins: r.coins, parts, cost, stock: G.seedStock?.[name] };
  }).sort((a, b) => (a.cost ?? 1e9) - (b.cost ?? 1e9));
  const animals = Object.entries(G.animals?.coins || {});
  return `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Herramienta</th><th class="r">Coins</th><th>Ingredientes</th><th class="r">Coste total</th></tr></thead><tbody>
    ${rows.map((r) => `<tr><td>${Gi(r.name, 16)} ${esc(r.name)}</td><td class="r mono">${fmt(r.coins, 0)}</td><td class="ctx wrap">${r.parts.map((p) => `${fmt(p.q, 0)} ${esc(p.n)}`).join(", ") || "—"}</td>
      <td class="r mono">${r.cost == null ? "—" : `${fmt(r.cost, 4)} FLOWER`}</td></tr>`).join("")}
  </tbody></table></div>
  ${animals.length ? `<div class="grp">Animales (tienda)</div><dl class="kv">${animals.map(([a, c]) => `<dt>${Gi(a, 14)} ${esc(ANIMAL_ES[a] || a)}</dt><dd>${fmt(c, 0)} coins · ${fmt(c / coinRate(), 3)} FLOWER</dd>`).join("")}</dl>` : ""}
  <div class="mod-f"><span>Coste total = coins a FLOWER + ingredientes a precio P2P de hoy</span></div>`;
}

ACTIONS.reftab = (k) => { S.refTab = k; writeLS("refTab", k); go("reference"); };
ACTIONS.refchest = (k) => { S.refChest = k; rerun(); };

PAGES.reference = function reference() {
  const tab = REF_TABS.some(([k]) => k === S.refTab) ? S.refTab : "chests";
  const render = { chests: wRefChests, seeds: wRefSeeds, tools: wRefTools }[tab];
  const title = REF_TABS.find(([k]) => k === tab)[1];
  $("#page").innerHTML = `<div class="plate">${Mod({ id: "rf-main", span: 12, title, icon: { chests: "chest", seeds: "sprout", tools: "hammer" }[tab],
    act: `<div class="seg">${REF_TABS.map(([k, l]) => `<button data-act="reftab:${k}" class="${k === tab ? "on" : ""}">${l}</button>`).join("")}</div>` })}</div>`;
  mount("rf-main", { deps: [], soft: ["activity", "fx", "farm"], render, loading: "rows" });
};
PAGE_META.reference = { title: "Referencia", sub: () => "Tablas del juego con los precios de hoy: cofres, semillas y herramientas (cocina y pesca, en Guías)" };
