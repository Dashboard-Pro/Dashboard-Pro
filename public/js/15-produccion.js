// SFL Console — Producción y Simulador: lo que rinde cada cultivo, fruta, maceta, máquina, flor y recurso en FLOWER al día,
// y cuánto cambiaría con un NFT, una prenda o una skill más (o menos).
// Scripts clásicos que comparten el ámbito global en el orden de index.html (antes, un solo app.js).
"use strict";

/* ════════════════════════════════════════════════════════════════════════
   15. Producción
   ════════════════════════════════════════════════════════════════════════
   Cada "línea" es algo que produces: un cultivo en tus parcelas, una fruta en tus frutales, una planta del invernadero,
   una semilla en la Crop Machine, una flor (vale por la miel que hace) o un tipo de nodo. Para cada una:
     tiempo  = base del juego × velocidad (medida en tu granja si se puede; si no, con los boosts que tienes)
     rinde   = unidades por cosecha (sfl.world con todos tus boosts; si no, 1 + los boosts que tienes)
     al día  = cosechas al día (el tiempo redondeado a tu ritmo de visitas) × unidades × (rinde × precio − coste)
   Los boosts salen de G.boostFx (textos del juego en inglés: "+0.2 Egg", "x0.5 Tree Recovery Time"…). */

// Comisión del mercado al vender recursos (getResourceTax del juego): según la isla, VIP la reduce a la mitad
const ISLAND_TAX = { basic: 1, spring: 0.55, desert: 0.25, volcano: 0.15, swamp: 0.15 };
function resourceTax(farm) {
  let t = ISLAND_TAX[farm.island?.type] ?? 0.15;
  if ((farm.vip?.expiresAt || 0) > now()) t *= 0.5;
  if (tempWindows(farm).some((w) => w.name === "Trading Shrine" && w.from <= now() && w.to > now())) t -= 0.025;
  return Math.max(0, t);
}
const SIM_TEMP = /Shrine|Hourglass|Totem/; // temporales: no se simulan como compra permanente
// Velocidad de la colmena (updateBeehives del juego): miel por día y colmena con una flor creciendo
const HONEY_RATE = { "Queen Bee": 1, "Beekeeper Hat": 0.2, "skill:Hyper Bees": 0.1, "skill:Flowery Abode": 0.5 };
const NODE_TOOL = { Wood: "Axe", Stone: "Pickaxe", Iron: "Stone Pickaxe", Gold: "Iron Pickaxe", Crimstone: "Gold Pickaxe", Sunstone: "Gold Pickaxe", Oil: "Oil Drill" };

// Nombres de boosts que tiene la granja: coleccionables colocados, ropa puesta (tuya y de ayudantes) y skills ("skill:…").
// set.levels guarda el nivel de cada skill ("skill:Tree Charge" → 2) para calcular su efecto real.
function ownedBoosts(farm) {
  const skills = farm.bumpkin?.skills || {};
  const owned = Object.keys(skills).filter((k) => toNum(skills[k]) > 0);
  const set = new Set([...placedCollectibles(farm), ...wornWearables(farm).map((w) => w.name), ...owned.map((k) => `skill:${k}`)]);
  set.levels = Object.fromEntries(owned.map((k) => [`skill:${k}`, Math.max(1, Math.round(toNum(skills[k])))]));
  return set;
}
const skillMaxLevel = (name) => G.skills?.[name.replace(/^skill:/, "").replace(/@\d+$/, "")]?.ranks?.length || 1;

// Efectos de un boost; para una skill, a su nivel ("skill:X@2" o el nivel indicado). El texto del juego da el valor del
// nivel 1; los demás niveles salen de skills[n].ranks con la misma forma (x0,9 · +0,1 · +20% · 15% de suerte…).
function fxOf(name, level) {
  const at = name.lastIndexOf("@");
  if (at > 0) { level = Number(name.slice(at + 1)); name = name.slice(0, at); }
  const base = G.boostFx?.[name] || [];
  if (!name.startsWith("skill:") || !(level > 1)) return base;
  const ranks = G.skills?.[name.slice(6)]?.ranks;
  if (!ranks?.length) return base;
  return base.map((f) => ({ ...f, v: rankValue(ranks, level, f.v) }));
}
// Valor de una skill a tu nivel (`own` = ownedBoosts) dado su valor de nivel 1 en la forma que use el cálculo
const skillValue = (own, skill, v1) => rankValue(G.skills?.[skill]?.ranks, own.levels?.[`skill:${skill}`], v1);
const cropTier = (name) => {
  const s = G.crops[name];
  return s <= G.crops.Pumpkin ? "basic" : s >= G.crops.Eggplant ? "advanced" : "medium";
};
const seedFlower = (seed) => (G.seedPrices?.[seed] ?? 0) / coinRate();

// Efecto de un conjunto de boosts sobre una línea: unidades de más por cosecha y multiplicador de ritmo (1 = igual).
// frac: la parte de la línea que cubre un boost con zona de efecto (un espantapájaros 7×7 no llega a 100 parcelas).
function fxOn(line, names, sign = 1) {
  let add = 0, rate = 1;
  for (const name of names) {
    for (const f of fxOf(name, names.levels?.[name])) {
      const hitY = line.tags.includes(f.t), hitT = (line.timeTags || line.tags).includes(f.t);
      if (!hitY && !(f.k === "time" && hitT)) continue;
      const frac = f.aoe ? Math.min(1, f.aoe / Math.max(1, line.n)) : 1;
      if (f.k === "add" && hitY) add += sign * f.v * frac;
      else if (f.k === "pct" && hitY) add += sign * (f.v / 100) * frac;
      else if (f.k === "time" && hitT) { const r = frac / f.v + 1 - frac; rate *= sign > 0 ? r : 1 / r; }
    }
  }
  return { add, rate };
}

// Líneas de producción de la granja con los boosts que tiene ahora (medido cuando se puede)
function prodLines() {
  const farm = store.farm.data.farm;
  const key = `${store.farm.at}|${store.activity?.at}|${store.myBoosts?.at}|${coinRate()}`;
  if (prodLines.c?.key === key) return prodLines.c.out;
  const price = priceBook(), own = ownedBoosts(farm), br = boostRatios();
  const p = (n) => price(n).v;
  const lines = [];
  const add = (l) => {
    const cur = fxOn(l, own);
    l.hours = l.measuredH ?? l.baseH / cur.rate;
    l.amt = l.measuredY ?? Math.max(0, (l.baseY ?? 1) + cur.add);
    l.p = l.item === "flowerHoney" ? p("Honey") : p(l.item);
    lines.push(l);
  };
  // Cultivos: semillas de la estación, en todas tus parcelas
  const season = farm.season?.season;
  const allowed = new Set((G.seasonalSeeds?.[season] || []).map((s) => s.replace(/ Seed$/, "")));
  const plots = Object.values(farm.crops || {}).filter((x) => x && !x.removedAt).length;
  if (plots) for (const [name, secs] of Object.entries(G.crops)) {
    if (allowed.size && !allowed.has(name)) continue;
    add({ cat: "crops", name, item: name, n: plots, baseH: secs / 3600, measuredH: (secs / 3600) * br.crop(name), measuredY: yieldOf("crops", name),
      tags: ["crops", `crops:${cropTier(name)}`, name], cost: seedFlower(`${name} Seed`), costNote: "semilla" });
  }
  // Frutales: la semilla da de 3 a 5 cosechas (4 de media; +2 con Immortal Pear, el doble con Pear Turbocharge)
  const patches = Object.values(farm.fruitPatches || {}).filter((x) => x && !x.removedAt).length;
  const harvests = 4 + (own.has("Immortal Pear") ? (own.has("skill:Pear Turbocharge") ? 4 : 2) : 0);
  if (patches) for (const [name, seed] of Object.entries(G.fruitSeedOf || {})) {
    const secs = G.fruitSeeds[seed];
    if (!secs || (allowed.size && G.seasonalSeeds && !allowed.has(name) && !/Celestine|Lunara|Duskberry/.test(name))) continue;
    add({ cat: "fruits", name, item: name, n: patches, baseH: secs / 3600, measuredY: yieldOf("fruits", name), tags: ["fruits", name],
      cost: seedFlower(seed) / harvests, costNote: `semilla ÷ ${harvests} cosechas`, moon: /Celestine|Lunara|Duskberry/.test(name) });
  }
  // Invernadero: semilla + aceite por planta
  const pots = farm.greenhouse ? Math.max(Object.keys(farm.greenhouse.pots || {}).length, 4) : 0;
  const gh = [...Object.entries(G.greenhouseCrops || {}).map(([n, s]) => [n, s, `${n} Seed`]), ...Object.entries(G.greenhouseFruitSeedOf || {}).map(([n, seed]) => [n, G.greenhouseFruitSeeds[seed], seed])];
  if (pots) for (const [name, secs, seed] of gh) {
    const oil = G.greenhouseOil?.[seed] ?? 0;
    add({ cat: "greenhouse", name, item: name, n: pots, baseH: secs / 3600, measuredY: yieldOf("greenhouse", name), tags: ["greenhouse", name],
      cost: seedFlower(seed) + oil * (p("Oil") ?? 0), costNote: `semilla + ${oil} Oil` });
  }
  // Crop Machine: cada semilla tarda el tiempo del cultivo repartido entre sus parcelas y quema aceite por hora; trabaja día y noche
  const machine = (farm.buildings?.["Crop Machine"] || []).length;
  if (machine) {
    const sk = farm.bumpkin?.skills || {}, lv = (n) => Math.min(3, toNum(sk[n]));
    const slots = 10 + (lv("Field Extension Module") ? [5, 7, 10][lv("Field Extension Module") - 1] : 0);
    const seeds = Object.entries(G.cropMachineSeeds || {}).filter(([k]) => k === "basic" || lv(k)).flatMap(([, v]) => v);
    const oilPh = Math.max(0.1, 1 - (lv("Oil Gadget") ? [0.1, 0.15, 0.2][lv("Oil Gadget") - 1] : 0) - (lv("Efficiency Extension Module") ? [0.3, 0.4, 0.5][lv("Efficiency Extension Module") - 1] : 0));
    for (const seed of seeds) {
      const name = seed.replace(/ Seed$/, "");
      if (!G.crops[name] || (allowed.size && !allowed.has(name))) continue;
      // Sin más semillas de las que trae la tienda al día (Warehouse +20%)
      const stock = Math.round((G.seedStock?.[seed] ?? 0) * (own.has("Warehouse") ? 1.2 : 1)) || null;
      add({ cat: "machine", name, item: name, n: 1, slots, stock, baseH: G.crops[name] / 3600 / slots, measuredY: yieldOf("crops", name), noCap: true,
        tags: ["crops", `crops:${cropTier(name)}`, name], timeTags: ["machine"], cost: seedFlower(seed) + (p("Oil") ?? 0) * oilPh * (G.crops[name] / 3600 / slots),
        costNote: `semilla + ${fmt(oilPh, 2)} Oil/h` });
    }
  }
  // Flores: no se venden en el mercado; valen por la miel que hace su colmena mientras crecen
  const beds = placedNodes(farm.flowers?.flowerBeds).length, hives = placedNodes(farm.beehives).length;
  if (beds && hives) {
    const rate = 1 + Object.entries(HONEY_RATE).reduce((a, [k, v]) => a + (own.has(k) ? v : 0), 0);
    for (const [seed, secs] of Object.entries(G.flowerSeeds || {})) {
      const cross = Object.entries(G.crossBreedAmounts?.[seed] || {}).map(([ing, q]) => ({ ing, q, v: (p(ing) ?? Infinity) * q })).sort((a, b) => a.v - b.v)[0];
      const plant = seedFlower(seed) + (cross && Number.isFinite(cross.v) ? cross.v : 0);
      const h = secs / 3600;
      add({ cat: "flowers", name: seed, item: "flowerHoney", n: Math.min(beds, hives), baseH: h, noCap: true, honeyRate: rate, tags: ["Honey"], timeTags: ["flowers"],
        baseY: 1, cost: plant, costNote: cross && Number.isFinite(cross.v) ? `semilla + ${cross.q} ${cross.ing}` : "semilla", cross });
    }
  }
  // Nodos: todos los de cada tipo; la herramienta que gasta cada golpe (sin hacha con Foreman Beaver)
  for (const r of nodePlan()) {
    const tool = r.item === "Wood" && own.has("Foreman Beaver") ? null : NODE_TOOL[r.item];
    add({ cat: "nodes", name: r.item, item: r.item, n: r.n, baseH: r.hours / Math.max(0.05, br.node[r.cat] ?? 1), measuredH: r.hours, measuredY: yieldOf("resources", r.item),
      tags: [r.item, ...(["Stone", "Iron", "Gold"].includes(r.item) ? ["minerals"] : [])], cost: tool ? p(tool) ?? 0 : 0, costNote: tool || "sin herramienta" });
  }
  const out = { lines, plots, patches, pots, machine, beds, hives, season, own, tax: resourceTax(farm) };
  prodLines.c = { key, out };
  return out;
}

// FLOWER al día de una línea, con un ajuste opcional de boosts (simulador): { add, rate }
function lineDaily(l, adj = { add: 0, rate: 1 }) {
  if (l.p == null) return null;
  const hours = l.hours / adj.rate;
  const amt = Math.max(0, l.amt + adj.add);
  if (l.cat === "flowers") {
    // Miel: la colmena produce `honeyRate` al día mientras la flor crece; la flor se replanta al acabar
    const days = hours / 24;
    const honey = l.honeyRate * days * amt;
    return { hours, amt, perHarvest: honey * l.p - l.cost, perDay: (l.n * (honey * l.p - l.cost)) / days, perDayH: 1 / days, honey };
  }
  const perDayH = l.noCap ? Math.min(24 / hours, l.stock || Infinity) : 24 / cycleH(hours, S.visitH);
  const perHarvest = amt * l.p - l.cost;
  return { hours, amt, perHarvest, perDay: perDayH * l.n * perHarvest, perDayH };
}

// Total al día: lo mejor de cada categoría (todas tus parcelas con el mismo cultivo, etc.) + todos los nodos
const PROD_CATS = [["crops", "Cultivos"], ["fruits", "Frutas"], ["greenhouse", "Invernadero"], ["machine", "Crop Machine"], ["flowers", "Flores y miel"], ["nodes", "Recursos"]];
function prodTotals(m, adjFor = () => undefined) {
  const by = {};
  for (const [cat] of PROD_CATS) {
    const rows = m.lines.filter((l) => l.cat === cat).map((l) => ({ l, d: lineDaily(l, adjFor(l)) })).filter((x) => x.d);
    if (!rows.length) continue;
    if (cat === "nodes") by[cat] = { perDay: rows.reduce((a, x) => a + Math.max(0, x.d.perDay), 0), best: null };
    else { const best = rows.sort((a, b) => b.d.perDay - a.d.perDay)[0]; by[cat] = { perDay: Math.max(0, best.d.perDay), best: best.l.name }; }
  }
  return { by, total: Object.values(by).reduce((a, x) => a + x.perDay, 0) };
}

/* ── Página Producción ── */
function wProdKpis() {
  const m = prodLines(), t = prodTotals(m);
  const SEASON_ES = { spring: "Primavera", summer: "Verano", autumn: "Otoño", winter: "Invierno" };
  return `<div class="kstrip">
    ${Kcell("Ganancia al día", `${fmt(t.total, 2)} <small>FLOWER</small>`, PROD_CATS.filter(([c]) => t.by[c]).map(([c, l]) => `${l} ${fmt(t.by[c].perDay, 2)}`).join(" · "), "sun")}
    ${Kcell("Parcelas", fmt(m.plots, 0), `${fmt(m.patches, 0)} frutales · ${fmt(m.pots, 0)} macetas`)}
    ${Kcell("Temporada", SEASON_ES[m.season] || m.season || "—", "solo semillas de temporada")}
    ${Kcell("Coins por FLOWER", fmt(coinRate(), 0), "para el coste de semillas")}
    ${Kcell("Comisión del mercado", `${fmt(m.tax * 100, 1)}%`, "al vender recursos en tu isla")}
  </div>`;
}
function prodTable(cat) {
  const m = prodLines();
  const rows = m.lines.filter((l) => l.cat === cat).map((l) => ({ l, d: lineDaily(l) })).sort((a, b) => (b.d?.perDay ?? -1e9) - (a.d?.perDay ?? -1e9));
  if (!rows.length) return Empty("sprout", "Nada que mostrar", cat === "machine" ? "No tienes Crop Machine." : cat === "flowers" ? "Necesitas parcelas de flores y colmenas." : cat === "greenhouse" ? "No tienes invernadero." : "");
  const best = rows.find((r) => r.d && r.d.perDay > 0);
  const unit = cat === "flowers" ? "miel" : cat === "machine" ? "semilla" : "cosecha";
  const head = `<tr><th>${cat === "flowers" ? "Semilla" : cat === "nodes" ? "Recurso" : "Producto"}</th><th class="r">Tiempo</th><th class="r" data-tip="Rinde|${cat === "flowers" ? "Miel que hace la colmena mientras crece la flor" : "Unidades por " + unit + " con tus boosts"}|" tabindex="0">Rinde</th>
    <th class="r" data-tip="Coste|Lo que gastas por ${unit}: ${cat === "nodes" ? "la herramienta" : "semilla (coins a FLOWER), cruce, aceite"}|" tabindex="0">Coste</th><th class="r">Precio P2P</th>
    <th class="r">Por ${unit}${Legend("profit")}</th><th class="r">Al día${Legend("profit")}</th></tr>`;
  const body = rows.map(({ l, d }) => {
    const tone2 = d == null ? "dim" : tone(d.perDay);
    const tag = best && l === best.l ? ` <span class="tag green">mejor</span>` : l.moon ? ` <span class="tag blue">luna llena</span>` : "";
    const nm = cat === "flowers" ? `${Gi(l.name, 16)} ${esc(l.name)}` : `${Gi(l.item, 16)} ${esc(l.name)}`;
    const times = d ? (cat === "machine" ? `${dur(d.hours * 3600_000)} <span class="dim">· ${fmt(d.perDayH, 0)}/día</span>` : `${dur(d.hours * 3600_000)} <span class="dim">· ${fmt(d.perDayH, 1)}/día</span>`) : "—";
    return `<tr><td>${nm}${tag}${cat === "nodes" ? ` <span class="dim">×${l.n}</span>` : ""}</td><td class="r mono">${times}</td>
      <td class="r mono">${d ? fmt(cat === "flowers" ? d.honey : d.amt, 2) : "—"}</td>
      <td class="r mono" data-tip="${esc(`Coste|${l.costNote}|`)}">${fmt(l.cost, 4)}</td><td class="r mono">${l.p != null ? fmt(l.p, 4) : "—"}</td>
      <td class="r mono ${tone2}">${d ? signed(d.perHarvest, 4) : "—"}</td><td class="r mono ${tone2}"><b>${d ? signed(d.perDay, 3) : "—"}</b></td></tr>`;
  }).join("");
  const notes = {
    crops: `En tus ${m.plots} parcelas, con la velocidad medida en ellas y las cosechas redondeadas a tu ritmo (entras cada ${S.visitH} h)`,
    fruits: `En tus ${m.patches} frutales · la semilla se reparte entre las cosechas que da (3–5, 4 de media)`,
    greenhouse: `En tus ${m.pots} macetas · aceite a precio de mercado`,
    machine: `Parcelas de la máquina: ${m.lines.find((l) => l.cat === "machine")?.slots ?? 10} · trabaja día y noche con semillas y aceite, como mucho las semillas que trae la tienda al día`,
    flowers: `${m.beds} parcelas de flores y ${m.hives} colmenas: cada flor que crece da miel a su colmena · las flores no se venden`,
    nodes: `Todos tus nodos de cada tipo · herramienta al coste de su receta`,
  };
  return `<div class="tbl-wrap"><table class="tbl"><thead>${head}</thead><tbody>${body}</tbody></table></div><div class="mod-f"><span>${notes[cat]}</span><span>precios P2P sin comisión</span></div>`;
}

PAGES.production = function production() {
  $("#page").innerHTML = `
    <div class="plate">${Mod({ id: "pr-k", span: 12, flush: true })}</div>
    <div class="plate">
      ${Mod({ id: "pr-crops", span: 12, title: "Cultivos", icon: "carrot", flush: true, act: `<span class="ctx">Entro cada</span>${Seg(VISITS, S.visitH, "visit")}` })}
    </div>
    <div class="plate">${Mod({ id: "pr-nodes", span: 12, title: "Recursos", icon: "tree", flush: true })}</div>
    <div class="plate">${Mod({ id: "pr-fruits", span: 12, title: "Frutas", icon: "apple", flush: true })}</div>
    <div class="plate">${Mod({ id: "pr-greenhouse", span: 12, title: "Invernadero", icon: "pot", flush: true })}</div>
    <div class="plate">${Mod({ id: "pr-machine", span: 12, title: "Crop Machine", icon: "machine", flush: true })}</div>
    <div class="plate">${Mod({ id: "pr-flowers", span: 12, title: "Flores y miel", icon: "flower", flush: true })}</div>`;
  const deps = { deps: ["farm", "activity"], soft: ["myBoosts"], loading: "rows" };
  mount("pr-k", { ...deps, render: wProdKpis, loading: "block" });
  for (const cat of ["crops", "fruits", "nodes", "greenhouse", "machine", "flowers"]) mount(`pr-${cat}`, { ...deps, render: () => prodTable(cat) });
};
PAGE_META.production = { title: "Producción", sub: () => `${staleNote()}Lo que te deja cada cultivo, fruta, maceta, máquina, flor y recurso en FLOWER al día, con tus boosts y los precios de hoy` };

/* ── Simulador ──
   Prueba cualquier coleccionable, prenda o skill con efecto en la producción: lo que ya tienes se puede quitar y lo demás
   añadir. La diferencia se calcula sobre lo que produces hoy, así que vale aunque tus boosts reales no se conozcan todos. */
const SIM_KINDS = [["all", "Todo"], ["collectibles", "Coleccionables"], ["wearables", "Ropa"], ["skills", "Skills"]];
const simKind = (n) => (n.startsWith("skill:") ? "skills" : G.wearableIds?.[n] != null ? "wearables" : "collectibles");
// on = lo que se añade; off = lo que se quita (las skills, a su nivel). "skill:X@N" = subir una skill tuya al nivel N:
// se quita la de ahora y se pone la nueva.
function simAdj(names, own) {
  const lv = (n) => (own.levels?.[n] ? `${n}@${own.levels[n]}` : n);
  const base = (n) => n.replace(/@\d+$/, "");
  const on = names.filter((n) => !own.has(n)), off = names.filter((n) => own.has(n)).map(lv);
  for (const n of names) if (n !== base(n) && own.has(base(n))) off.push(lv(base(n)));
  return (l) => {
    const a = fxOn(l, on, 1), b = fxOn(l, off, -1);
    return { add: a.add + b.add, rate: a.rate * b.rate };
  };
}
function simModel() {
  const m = prodLines();
  const base = prodTotals(m);
  const price = priceBook();
  const cands = Object.keys(G.boostFx || {}).filter((n) => !SIM_TEMP.test(n) && (!n.startsWith("skill:") || !G.skills?.[n.slice(6)]?.disabled)).map((name) => {
    const own = m.own.has(name);
    const t = prodTotals(m, simAdj([name], m.own));
    const kind = simKind(name);
    const cost = kind === "skills" ? null : price(name).v;
    const delta = t.total - base.total;
    const level = m.own.levels?.[name];
    return { name, label: name.replace(/^skill:/, ""), kind, own, delta, cost, days: !own && cost && delta > 1e-6 ? cost / delta : null, level,
      text: kind === "skills" ? G.skills?.[name.slice(6)]?.buff : G.buffs?.[name], points: kind === "skills" ? G.skills?.[name.slice(6)]?.points : null };
  });
  // Subir de nivel las skills que ya tienes: lo que suma pasar de su nivel actual al siguiente
  for (const c of cands.filter((x) => x.kind === "skills" && x.own && x.level < skillMaxLevel(x.name))) {
    const name = `${c.name}@${c.level + 1}`;
    const t = prodTotals(m, simAdj([name], m.own));
    cands.push({ ...c, name, own: false, upgrade: c.level + 1, delta: t.total - base.total, days: null, label: `${c.label} → nivel ${c.level + 1}` });
  }
  const sel = [...S.simSet].filter((n) => G.boostFx?.[n.replace(/@\d+$/, "")]);
  const withSel = sel.length ? prodTotals(m, simAdj(sel, m.own)) : base;
  const selCost = sel.filter((n) => !m.own.has(n)).reduce((a, n) => a + (price(n).v || 0), 0);
  return { base, withSel, sel, selCost, cands, own: m.own };
}
function wSimKpis() {
  const s = simModel(), d = s.withSel.total - s.base.total;
  return `<div class="kstrip">
    ${Kcell("Ganancia al día hoy", `${fmt(s.base.total, 2)} <small>FLOWER</small>`, "con lo que tienes")}
    ${Kcell("Con tus cambios", `${fmt(s.withSel.total, 2)} <small>FLOWER</small>`, s.sel.length ? `${s.sel.length} cambio${s.sel.length > 1 ? "s" : ""}` : "elige abajo qué probar", s.sel.length ? "sun" : "")}
    ${Kcell("Diferencia", `<span class="${tone(d)}">${signed(d, 3)}</span>`, "FLOWER al día")}
    ${Kcell("Coste", s.selCost ? `${fmt(s.selCost, 2)} <small>FLOWER</small>` : "—", "floor de lo que no tienes")}
    ${Kcell("Se paga en", s.selCost && d > 1e-6 ? `${fmt(s.selCost / d, 0)} <small>días</small>` : "—", s.sel.length ? `<button class="btn ghost sm" data-act="simclear">quitar cambios</button>` : "")}
  </div>`;
}
function wSimList() {
  const s = simModel();
  const list = s.cands.filter((c) => (S.simKind === "all" || c.kind === S.simKind) && (S.simAll || Math.abs(c.delta) > 1e-6 || c.own || S.simSet.has(c.name)))
    .sort((a, b) => Number(S.simSet.has(b.name)) - Number(S.simSet.has(a.name)) || (b.own ? -b.delta : b.delta) - (a.own ? -a.delta : a.delta));
  setSub("sm-list", `${list.length} boosts · ${s.cands.filter((c) => c.own).length} tuyos · la diferencia es sobre tu producción de hoy`);
  if (!list.length) return Empty("bolt", "Nada que probar", "Ningún boost cambia tu producción con los datos de hoy.");
  const row = (c) => {
    const on = S.simSet.has(c.name);
    const verb = c.own ? (on ? "quitado" : "quitar") : c.upgrade ? (on ? "subiendo" : "subir") : on ? "probando" : "probar";
    const ref = c.kind === "wearables" ? `wearables-${G.wearableIds[c.name]}` : c.kind === "collectibles" && G.itemIds[c.name] != null ? `collectibles-${G.itemIds[c.name]}` : null;
    return `<tr class="${on ? "sel" : ""}"><td class="sm-b"><span class="sm-n">${c.kind === "skills" ? sprite("bolt", 14) : Gi(c.name, 16)} <b>${esc(c.label)}</b>${c.own ? ` <span class="tag green">tuyo${c.level ? ` · nivel ${c.level}` : ""}</span>` : c.upgrade ? ` <span class="tag sun">mejora</span>` : c.kind === "skills" ? ` <span class="tag">skill</span>` : ""}</span>
        <div class="sm-d">${esc(c.text || "")}</div></td>
      <td class="r mono ${tone(c.delta)}">${Math.abs(c.delta) < 5e-4 ? "0" : signed(c.delta, 3)}<div class="ctx">${c.own ? "si lo quitas" : c.upgrade ? "si la subes" : "si lo añades"}</div></td>
      <td class="r mono">${c.kind === "skills" ? `${c.points ?? "?"} pt` : c.cost != null ? (ref ? `<a href="#" data-open="${ref}">${fmt(c.cost, 2)}</a>` : fmt(c.cost, 2)) : "—"}</td>
      <td class="r mono">${c.days != null ? `${fmt(c.days, 0)} d` : "—"}</td>
      <td class="r"><button class="btn sm ${on ? "" : "ghost"}" data-act="sim:${esc(c.name)}">${verb}</button></td></tr>`;
  };
  return `<div class="tbl-wrap"><table class="tbl sm-tbl"><thead><tr><th>Boost</th><th class="r">FLOWER/día${Legend("profit")}</th><th class="r">Precio</th><th class="r" data-tip="Se paga en|Precio ÷ lo que suma al día|" tabindex="0">Se paga en</th><th></th></tr></thead>
    <tbody>${list.slice(0, S.simAll ? 400 : 150).map(row).join("")}</tbody></table></div>
    <div class="mod-f"><span>Solo cuenta lo que se puede calcular (cantidad, % y tiempo en cultivos, frutas, invernadero, máquina, flores y recursos); las zonas de efecto se reparten entre tus parcelas o nodos. Las skills tuyas cuentan a su nivel; las que no tienes, a nivel 1, y las tuyas se pueden subir de nivel.</span>
    <span><label class="toggle"><input type="checkbox" data-act="simall" ${S.simAll ? "checked" : ""}/><i></i>ver también los que no cambian nada</label></span></div>`;
}
function wSimBreak() {
  const s = simModel();
  return `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Categoría</th><th class="r">Hoy</th><th class="r">Con cambios</th><th>Lo mejor</th></tr></thead><tbody>
    ${PROD_CATS.filter(([c]) => s.base.by[c] || s.withSel.by[c]).map(([c, l]) => {
      const a = s.base.by[c]?.perDay ?? 0, b = s.withSel.by[c]?.perDay ?? 0;
      return `<tr><td>${l}</td><td class="r mono">${fmt(a, 3)}</td><td class="r mono ${tone(b - a)}">${fmt(b, 3)}</td><td class="ctx">${esc(s.withSel.by[c]?.best || "todos")}</td></tr>`;
    }).join("")}</tbody></table></div>`;
}
ACTIONS.sim = (name) => { S.simSet.has(name) ? S.simSet.delete(name) : S.simSet.add(name); writeLS("simSet", [...S.simSet]); rerun(); };
ACTIONS.simclear = () => { S.simSet.clear(); writeLS("simSet", []); rerun(); };
ACTIONS.simall = (v, el) => { S.simAll = el.checked; rerun(); };
ACTIONS.simkind = (k) => { S.simKind = k; go("simulator"); };

PAGES.simulator = function simulator() {
  $("#page").innerHTML = `
    <div class="plate">${Mod({ id: "sm-k", span: 12, flush: true })}</div>
    <div class="plate">
      ${Mod({ id: "sm-list", span: 8, title: "Prueba boosts", icon: "bolt", flush: true, act: `<div class="seg">${SIM_KINDS.map(([k, l]) => `<button data-act="simkind:${k}" class="${S.simKind === k ? "on" : ""}">${l}</button>`).join("")}</div>` })}
      ${Mod({ id: "sm-break", span: 4, title: "Por categoría", icon: "chest", flush: true })}
    </div>`;
  const deps = { deps: ["farm", "activity"], soft: ["myBoosts"] };
  mount("sm-k", { ...deps, render: wSimKpis, loading: "block" });
  mount("sm-list", { ...deps, render: wSimList, loading: "rows" });
  mount("sm-break", { ...deps, render: wSimBreak, loading: "rows" });
};
PAGE_META.simulator = { title: "Simulador", sub: () => `${staleNote()}Prueba NFTs, ropa y skills antes de comprar: cuánto sumarían al día y en cuántos días se pagan` };
