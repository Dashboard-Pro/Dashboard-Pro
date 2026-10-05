// SFL Console — Guías: Cocina, Pesca, Flores, Mascotas y Animales. Calculadoras con las reglas del juego, los precios de
// hoy y tus boosts (o los que quieras probar). Funcionan sin granja: entonces van sin boosts.
// Scripts clásicos que comparten el ámbito global en el orden de index.html.
"use strict";

/* ── Panel de boosts común ────────────────────────────────────────────────
   Cada guía declara sus boosts: { name, kind: "bool" | "rank", auto (lo que tiene tu granja), group, tip }.
   Modo "mine" = lo de tu granja, "none" = sin boosts; encima, lo que pulses para probar (S.gOv[guía][nombre]). */
S.gMode = readLS("gMode", {});
S.gOv = readLS("gOv", {});
const gFarm = () => (has("farm") ? store.farm.data.farm : null);
function gBoosts(guide, defs) {
  const mode = gFarm() ? S.gMode[guide] || "mine" : "none";
  const ov = S.gOv[guide] || {};
  const val = {};
  for (const d of defs) {
    const base = mode === "mine" ? d.auto : d.kind === "rank" ? 0 : false;
    val[d.name] = ov[d.name] !== undefined ? ov[d.name] : base;
  }
  const on = defs.filter((d) => val[d.name]).length;
  const groups = [...new Set(defs.map((d) => d.group || ""))];
  const chip = (d) => {
    const v = val[d.name], tried = ov[d.name] !== undefined;
    const tip = `data-tip="${esc(`${d.label || d.name}|${d.tip || ""}|${tried ? "lo estás probando (no es tu estado real)" : mode === "mine" ? (d.auto ? "lo tienes" : "no lo tienes") : ""}`)}"`;
    if (d.kind === "rank") {
      return `<span class="gb-rank${v ? " on" : ""}${tried ? " tried" : ""}" ${tip}>${esc(d.label || d.name)} ${[0, 1, 2, 3].map((r) => `<button data-act="gb:${guide}|${esc(d.name)}|${r}" class="${v === r ? "on" : ""}">${r || "no"}</button>`).join("")}</span>`;
    }
    return `<button class="gb${v ? " on" : ""}${tried ? " tried" : ""}" data-act="gb:${guide}|${esc(d.name)}|${v ? 0 : 1}" ${tip}>${d.icon === false ? "" : Gi(d.icon || d.name, 14, "bolt")} ${esc(d.label || d.name)}</button>`;
  };
  const panel = `<div class="gb-panel">
    <div class="gb-top">${Seg([["mine", "Mis boosts"], ["none", "Sin boosts"]], mode, "act").replace(/data-act="(\w+)"/g, `data-act="gmode:${guide}|$1"`)}
      <span class="ctx">${on} activos${Object.keys(ov).length ? ` · probando ${Object.keys(ov).length}` : ""}</span></div>
    ${groups.map((g) => `<div class="gb-grp">${g ? `<span class="eyebrow">${esc(g)}</span>` : ""}${defs.filter((d) => (d.group || "") === g).map(chip).join("")}</div>`).join("")}
  </div>`;
  return { val, panel, mode };
}
ACTIONS.gmode = (v) => { const [g, m] = v.split("|"); S.gMode[g] = m; delete S.gOv[g]; writeLS("gMode", S.gMode); writeLS("gOv", S.gOv); rerun(); };
ACTIONS.gb = (v) => {
  const [g, name, x] = v.split("|");
  const n = Number(x), ov = (S.gOv[g] ||= {});
  ov[name] = /^[0-3]$/.test(x) && name.startsWith("skill:") ? n : Boolean(n);
  writeLS("gOv", S.gOv); rerun();
};
// Campos de número (nivel de la mascota…): data-chg="acción" → ACTIONS.acción(valor) al cambiar
document.addEventListener("change", (e) => {
  const el = e.target.closest?.("[data-chg]");
  if (el) ACTIONS[el.dataset.chg]?.(el.value, el, e);
});
const skillRank = (farm, n) => (farm ? Math.min(3, Math.max(0, toNum(farm.bumpkin?.skills?.[n]))) : 0);
const rankVal = (n, r, def) => (r ? (G.skills?.[n]?.ranks || def)[r - 1] ?? 0 : 0);
const gPrice = (name) => (has("activity") ? priceBook()(name).v : null);
function tempActiveNow(farm, name) {
  if (!farm) return false;
  const t = now();
  return tempWindows(farm).some((w) => w.name === name && w.from <= t && w.to > t);
}

/* ════════════════════════════════════════════════════════════════════════
   Cocina — getCookingTime y getFoodExpBoost del juego (expansion/lib/boosts.ts)
   ════════════════════════════════════════════════════════════════════════ */
const FACTION_NECKLACE = { bumpkins: "Bumpkin Medallion", goblins: "Goblin Medallion", sunflorians: "Sunflorian Medallion", nightshades: "Nightshade Medallion" };
S.gcBuilding = readLS("gcBuilding", "");
function cookDefs() {
  const farm = gFarm(), worn = farm ? wornSet(farm) : new Set(), placed = farm ? new Set(placedCollectibles(farm)) : new Set();
  const necklace = FACTION_NECKLACE[farm?.faction?.name] || "Bumpkin Medallion";
  const sk = (n, group, tip) => ({ name: `skill:${n}`, label: n, kind: "rank", auto: skillRank(farm, n), group, tip });
  return [
    sk("Double Nom", "Raciones", "+1/2/3 platos por cocción, pero gasta ×2/3/4 ingredientes"),
    sk("Fiery Jackpot", "Raciones", "20/35/50% de probabilidad de +1 plato en el Fire Pit (aquí, la media)"),
    { name: "Master Chef's Cleaver", kind: "bool", auto: worn.has("Master Chef's Cleaver"), group: "Tiempo", tip: "×0,85 de tiempo y 10% de probabilidad de +1 plato" },
    { name: "Luna's Hat", kind: "bool", auto: worn.has("Luna's Hat"), group: "Tiempo", tip: "×0,5 de tiempo" },
    { name: necklace, label: "Medallón de facción", kind: "bool", auto: worn.has(necklace), group: "Tiempo", tip: "×0,75 de tiempo" },
    { name: "Desert Gnome", kind: "bool", auto: placed.has("Desert Gnome"), group: "Tiempo", tip: "×0,9 de tiempo" },
    { name: "Legendary Shrine", kind: "bool", auto: tempActiveNow(farm, "Legendary Shrine"), group: "Tiempo", tip: "×0,5 · dura 24 h" },
    { name: "Boar Shrine", kind: "bool", auto: tempActiveNow(farm, "Boar Shrine"), group: "Tiempo", tip: "×0,8 · dura 7 días" },
    { name: "Super Totem", kind: "bool", auto: tempActiveNow(farm, "Super Totem") || tempActiveNow(farm, "Time Warp Totem"), group: "Tiempo", tip: "×0,5 (o Time Warp Totem; no se suman)" },
    { name: "Gourmet Hourglass", kind: "bool", auto: tempActiveNow(farm, "Gourmet Hourglass"), group: "Tiempo", tip: "×0,5 · dura 4 h" },
    sk("Fast Feasts", "Tiempo", "−10/15/20% en Fire Pit y Kitchen"),
    sk("Frosted Cakes", "Tiempo", "−10/20/30% en tartas"),
    { name: "Golden Spatula", kind: "bool", auto: worn.has("Golden Spatula"), group: "Experiencia", tip: "+10% XP" },
    { name: "Pan", kind: "bool", auto: worn.has("Pan"), group: "Experiencia", tip: "+25% XP" },
    { name: "Blossombeard", kind: "bool", auto: placed.has("Blossombeard"), group: "Experiencia", tip: "+10% XP" },
    { name: "Observatory", kind: "bool", auto: placed.has("Observatory"), group: "Experiencia", tip: "+5% XP" },
    { name: "VIP", icon: "star", kind: "bool", auto: farm ? (farm.vip?.expiresAt || 0) > now() : false, group: "Experiencia", tip: "+10% XP" },
    { name: "Grain Grinder", kind: "bool", auto: placed.has("Grain Grinder"), group: "Experiencia", tip: "+20% XP en tartas" },
    { name: "Swiss Whiskers", kind: "bool", auto: placed.has("Swiss Whiskers"), group: "Experiencia", tip: "+500 XP en recetas con queso" },
    { name: "Hungry Hare", kind: "bool", auto: placed.has("Hungry Hare"), group: "Experiencia", tip: "×2 XP en Fermented Carrots" },
    { name: "Luminous Anglerfish Topper", kind: "bool", auto: worn.has("Luminous Anglerfish Topper"), group: "Experiencia", tip: "+50% XP en platos de pescado" },
    { name: "Skill Shrimpy", kind: "bool", auto: placed.has("Skill Shrimpy"), group: "Experiencia", tip: "+20% XP en platos de pescado" },
    sk("Munching Mastery", "Experiencia", "+5/7,5/10% XP"),
    sk("Juicy Boost", "Experiencia", "+10/20/30% XP en el Smoothie Shack"),
    sk("Drive-Through Deli", "Experiencia", "+15/20/25% XP en el Deli"),
    sk("Buzzworthy Treats", "Experiencia", "+10/20/30% XP en comidas con miel"),
    sk("Fishy Feast", "Experiencia", "+20/25/30% XP en platos de pescado"),
  ];
}
function cookRow(name, f, v) {
  const b = f.building, cake = / Cake$/.test(name), fish = b === "Fish Market";
  let s = f.seconds;
  if (v["Luna's Hat"]) s *= 0.5;
  if (v["Master Chef's Cleaver"]) s *= 0.85;
  if (v["Legendary Shrine"]) s *= 0.5;
  if (v["Boar Shrine"]) s *= 0.8;
  if (Object.values(FACTION_NECKLACE).some((n) => v[n])) s *= 0.75;
  if (v["Super Totem"]) s *= 0.5;
  if (v["Gourmet Hourglass"]) s *= 0.5;
  if (v["Desert Gnome"]) s *= 0.9;
  if (b === "Fire Pit" || b === "Kitchen") s *= 1 - rankVal("Fast Feasts", v["skill:Fast Feasts"], [0.1, 0.15, 0.2]);
  if (cake) s *= 1 - rankVal("Frosted Cakes", v["skill:Frosted Cakes"], [0.1, 0.2, 0.3]);
  let xp = f.xp;
  const m = (c, k) => { if (c) xp *= k; };
  m(v["Golden Spatula"], 1.1); m(v.Blossombeard, 1.1); m(fish && v["Luminous Anglerfish Topper"], 1.5); m(v.Pan, 1.25); m(v.Observatory, 1.05);
  m(cake && v["Grain Grinder"], 1.2); m(fish && v["Skill Shrimpy"], 1.2); m(fish, 1 + rankVal("Fishy Feast", v["skill:Fishy Feast"], [0.2, 0.25, 0.3]));
  m(v.VIP, 1.1); m(name === "Fermented Carrots" && v["Hungry Hare"], 2);
  m(true, 1 + rankVal("Munching Mastery", v["skill:Munching Mastery"], [0.05, 0.075, 0.1]));
  m(b === "Smoothie Shack", 1 + rankVal("Juicy Boost", v["skill:Juicy Boost"], [0.1, 0.2, 0.3]));
  m(b === "Deli", 1 + rankVal("Drive-Through Deli", v["skill:Drive-Through Deli"], [0.15, 0.2, 0.25]));
  m("Honey" in (f.items || {}), 1 + rankVal("Buzzworthy Treats", v["skill:Buzzworthy Treats"], [0.1, 0.2, 0.3]));
  if ("Cheese" in (f.items || {}) && v["Swiss Whiskers"]) xp += 500;
  // Raciones: Double Nom (+n platos, ×(n+1) ingredientes), Fiery Jackpot y el cuchillo (probabilidades → media)
  const dn = v["skill:Double Nom"] || 0;
  let portions = 1 + dn;
  if (b === "Fire Pit") portions += rankVal("Fiery Jackpot", v["skill:Fiery Jackpot"], [0.2, 0.35, 0.5]);
  if (v["Master Chef's Cleaver"]) portions += 0.1;
  const ingMul = dn ? dn + 1 : 1;
  let cost = 0, ok = true;
  const parts = Object.entries(f.items || {}).map(([n, q]) => {
    const p = /Mushroom$/.test(n) ? 0 : gPrice(n);
    if (p == null) ok = false; else cost += p * q * ingMul;
    return { n, q: q * ingMul };
  });
  const perPlate = ok ? cost / portions : null;
  return { name, building: b, parts, secs: s, baseSecs: f.seconds, xp, baseXp: f.xp, portions, cost: ok ? cost : null, perPlate,
    xpPerFlower: perPlate ? xp / perPlate : null, xpDay: s > 0 ? (86400 / s) * portions * xp : null, have: gFarm() ? haveOf(name) : 0 };
}
S.gcView = readLS("gcView", "cards");
function wGuideCooking() {
  const bx = gBoosts("cooking", cookDefs());
  const all = Object.entries(G.foods || {}).map(([n, f]) => { const r = cookRow(n, f, bx.val); return { ...r, can: canMake(Object.fromEntries(r.parts.map((p) => [p.n, p.q]))) }; });
  const buildings = [...new Set(all.map((r) => r.building).filter(Boolean))];
  const list = all.filter((r) => !S.gcBuilding || r.building === S.gcBuilding).sort((a, b) => canFirst(a, b) || (b.xpPerFlower ?? -1) - (a.xpPerFlower ?? -1) || b.xp - a.xp);
  const counts = Object.fromEntries(buildings.map((b) => [b, all.filter((r) => r.building === b).length]));
  const seg = `<div class="toolbar" style="padding:8px 12px;gap:8px;flex-wrap:wrap"><div class="seg ref-seg"><button data-act="gcb:" class="${!S.gcBuilding ? "on" : ""}">Todos ${all.length}</button>${buildings.map((b) => `<button data-act="gcb:${esc(b)}" class="${S.gcBuilding === b ? "on" : ""}">${esc(b)} ${counts[b]}</button>`).join("")}</div>
    <span class="grow"></span>${gTabs("gcv", S.gcView, [["cards", "Tarjetas"], ["table", "Tabla"]])}</div>`;
  const foot = `<div class="mod-f"><span>Primero lo que puedes cocinar ya · ingredientes a precio P2P (un plato usado como ingrediente, por su receta) · Wild/Magic Mushroom a 0 · XP al día = un edificio cocinando sin parar</span><span>Tótems, shrines y relojes cuentan como activos toda la cocción</span></div>`;
  if (S.gcView === "cards") return `${bx.panel}${seg}<div class="cb-cards">${list.map((r) => ItemCard({ name: r.name, can: r.can,
      tags: r.have ? `<span class="tag">tienes ${fmt(r.have, 0)}</span>` : "",
      sub: `${esc(r.building || "")} · ${r.secs ? dur(r.secs * 1000) : "al instante"}${r.portions !== 1 ? ` · ${fmt(r.portions, r.portions % 1 ? 2 : 0)} raciones` : ""}`,
      body: IngList(Object.fromEntries(r.parts.map((p) => [p.n, p.q]))),
      stats: [["XP", fmt(r.xp, 0), r.xp > r.baseXp ? "up" : ""], ["Por plato", r.perPlate == null ? "—" : fmt(r.perPlate, 3)], ["XP/FLOWER", r.xpPerFlower == null ? "—" : compact(r.xpPerFlower)], ["Puedes", r.can == null ? "—" : `${r.can}×`, r.can ? "up" : "dim"]],
    })).join("")}</div>${foot}`;
  return `${bx.panel}${seg}<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Receta</th><th>Ingredientes</th><th class="r">Tiempo</th><th class="r">Raciones</th><th class="r">XP</th><th class="r">Coste</th><th class="r">Por plato</th><th class="r">XP/FLOWER</th><th class="r">XP al día</th><th class="r">Puedes</th></tr></thead><tbody>
    ${list.map((r) => `<tr class="${r.can ? "" : "dim"}" data-tip="${esc(`${r.name}|${r.building || ""} · base ${r.baseSecs ? dur(r.baseSecs * 1000) : "al instante"} y ${fmt(r.baseXp, 0)} XP${r.have ? ` · tienes ${fmt(r.have, 0)}` : ""}|`)}">
      <td class="w">${Gi(r.name, 22)} ${esc(r.name)}</td><td class="ctx wrap">${r.parts.map((p) => `${Gi(p.n, 16)} ${fmt(p.q, 0)}`).join(" ")}</td>
      <td class="r mono${r.secs < r.baseSecs ? " up" : ""}">${r.secs ? dur(r.secs * 1000) : "—"}</td><td class="r mono">${fmt(r.portions, r.portions % 1 ? 2 : 0)}</td>
      <td class="r mono${r.xp > r.baseXp ? " up" : ""}">${fmt(r.xp, 0)}</td><td class="r mono dim">${r.cost == null ? "—" : fmt(r.cost, 3)}</td>
      <td class="r mono">${r.perPlate == null ? "—" : fmt(r.perPlate, 3)}</td><td class="r mono"><b>${r.xpPerFlower == null ? "—" : compact(r.xpPerFlower)}</b></td>
      <td class="r mono dim">${r.xpDay == null ? "—" : compact(r.xpDay)}</td><td class="r mono ${r.can ? "up" : ""}">${r.can == null ? "—" : `${r.can}×`}</td></tr>`).join("")}
  </tbody></table></div>${foot}`;
}
ACTIONS.gcv = (v) => { S.gcView = v; writeLS("gcView", v); rerun(); };
ACTIONS.gcb = (b) => { S.gcBuilding = b; writeLS("gcBuilding", b); rerun(); };

/* ════════════════════════════════════════════════════════════════════════
   Pesca — types/fishing.ts: cebos, estaciones, engodo y cebos que aseguran captura
   ════════════════════════════════════════════════════════════════════════ */
S.gfType = readLS("gfType", "all");
S.gfSeason = readLS("gfSeason", "all");
S.gfBait = readLS("gfBait", "all");
function fishModel() {
  const F = G.fishing || {}, farm = gFarm(), act = farm?.farmActivity || {};
  const guaranteedBy = {};
  for (const [bait, list] of Object.entries(F.guaranteed || {})) for (const f of list) (guaranteedBy[f] ||= []).push(bait);
  const triggers = mapTriggers();
  const rows = Object.entries(F.fish || {}).map(([name, f]) => {
    const chum = (f.likes || []).map((l) => { const amt = F.chum?.[l] || 1, p = gPrice(l); return { item: l, amt, cost: p == null ? null : p * amt }; });
    return { name, ...f, chum, bestChum: chum.filter((c) => c.cost != null).sort((a, b) => a.cost - b.cost)[0] || null,
      guaranteed: guaranteedBy[name] || [], caught: toNum(act[`${name} Caught`]), price: gPrice(name), piece: triggers[name] || null };
  });
  const baits = [...new Set(rows.flatMap((r) => r.baits || []))];
  return { rows, baits, season: farm?.season?.season || null, limit: farm ? fishingLimit(farm) : F.limit || 20 };
}
// Peces que sueltan piezas de mapa ahora: los de siempre + los del capítulo en curso (getMapPieceFishTriggers)
const mapTriggers = () => ({ ...(G.mapPieces?.base || {}), ...(G.mapPieces?.chapters?.[currentChapter()] || {}) });
S.gfView = readLS("gfView", "fish");
const MAP_PIECES_NEEDED = 9;
function marvelMapModel() {
  const M = G.mapPieces || {}, act = gFarm()?.farmActivity || {}, now = currentChapter();
  const sourcesOf = (marvel) => {
    const out = [];
    for (const [fish, t] of Object.entries(M.base || {})) if (t.marvel === marvel) out.push({ fish, odds: t.odds, active: true });
    for (const [ch, list] of Object.entries(M.chapters || {})) for (const [fish, t] of Object.entries(list || {})) if (t.marvel === marvel) out.push({ fish, odds: t.odds, active: ch === now, ch });
    return out;
  };
  const marvels = [...new Set([...Object.values(M.base || {}), ...Object.values(M.chapters || {}).flatMap((t) => Object.values(t || {}))].map((t) => t.marvel))];
  return marvels.map((m) => {
    const sources = sourcesOf(m), buff = G.buffs?.[m];
    return { name: m, chapter: M.marvelChapter?.[m] || null, sources, active: sources.some((x) => x.active), difficulty: M.difficulty?.[m] ?? null,
      found: toNum(act[`${m} Map Piece Found`]), caught: toNum(act[`${m} Caught`]), buff: Array.isArray(buff) ? buff.join(" · ") : buff || "" };
  }).sort((a, b) => b.active - a.active || b.found - a.found || a.name.localeCompare(b.name));
}
function wGuideMaps() {
  const list = marvelMapModel(), farm = gFarm();
  const src = (x) => `<span class="${x.active ? "" : "faint"}" style="margin-right:8px">${Gi(x.fish, 12)} ${esc(x.fish)} ${fmt(x.odds * 100, x.odds < 0.01 ? 2 : 1)}%</span>`;
  // Capturas que hacen falta de media para las piezas que faltan, pescando el pez que más suelta (1 / probabilidad cada una)
  const expect = (m) => {
    const best = m.sources.filter((x) => x.active && x.odds > 0).sort((a, b) => b.odds - a.odds)[0];
    const left = Math.max(0, MAP_PIECES_NEEDED - (farm ? m.found : 0));
    return best && left ? { fish: best.fish, n: left / best.odds, one: 1 / best.odds } : null;
  };
  return `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Maravilla marina</th><th>Capítulo</th><th>Suelta pieza</th><th class="r">Puzle</th><th class="r">Piezas</th>
      <th class="r" data-tip="Capturas de media|Las que necesitas del pez que más piezas suelta para juntar las que te faltan (cada pieza cae 1 de cada 1/probabilidad capturas de ese pez)|" tabindex="0">Te faltan de media</th><th class="r">Pescada</th><th>Trofeo</th></tr></thead><tbody>
    ${list.map((m) => { const e = expect(m); return `<tr class="${m.active ? "" : "dim"}"><td class="w">${Gi(m.name, 18)} ${esc(m.name)}${m.active ? ` <span class="tag green">se puede conseguir</span>` : ""}</td>
      <td class="ctx">${m.chapter ? esc(m.chapter) + (m.chapter === currentChapter() ? " · en curso" : "") : "permanente"}</td>
      <td class="ctx wrap">${m.sources.map(src).join("")}</td><td class="r mono">${m.difficulty ?? "—"}</td>
      <td class="r mono ${m.found ? "" : "dim"}">${farm ? `${m.found}/${MAP_PIECES_NEEDED}` : "—"}</td>
      <td class="r mono">${e ? `~${fmt(e.n, 0)}<div class="ctx">capturas de ${esc(e.fish)} · 1 pieza cada ~${fmt(e.one, 0)}</div>` : "—"}</td>
      <td class="r mono ${m.caught ? "up" : "dim"}">${farm ? (m.caught ? `✓ ${m.caught}` : "no") : "—"}</td>
      <td class="ctx wrap">${esc(m.buff) || `<span class="faint">decorativo</span>`}</td></tr>`; }).join("")}
  </tbody></table></div>
  <div class="mod-f"><span>Hay que juntar ${MAP_PIECES_NEEDED} piezas de su mapa y resolver el puzle (dificultad 1-5) para poder pescarlo · las del capítulo solo caen mientras dura</span><span>Piezas = las que has encontrado en total</span></div>`;
}
function wGuideFishing() {
  const view = Seg([["fish", "Peces"], ["maps", "Mapas"]], S.gfView, "act").replace(/data-act="([^"]+)"/g, 'data-act="gfv:$1"');
  if (S.gfView === "maps") return `<div class="toolbar" style="padding:8px 12px">${view}</div>${wGuideMaps()}`;
  const d = fishModel();
  const list = d.rows.filter((r) => (S.gfType === "all" || r.type === S.gfType) && (S.gfSeason === "all" || (r.seasons || []).includes(S.gfSeason)) && (S.gfBait === "all" || (r.baits || []).includes(S.gfBait)))
    .sort((a, b) => Object.keys(FISH_TYPE_ES).indexOf(a.type) - Object.keys(FISH_TYPE_ES).indexOf(b.type) || a.name.localeCompare(b.name));
  const caught = d.rows.filter((r) => r.caught > 0).length;
  const types = [...new Set(d.rows.map((r) => r.type))];
  const segOf = (key, cur, opts) => Seg(opts, cur, "act").replace(/data-act="([^"]+)"/g, `data-act="${key}:$1"`);
  return `<div class="kstrip">
      ${Kcell("Peces", fmt(d.rows.length, 0), types.map((t) => `${FISH_TYPE_ES[t] || t} ${d.rows.filter((r) => r.type === t).length}`).join(" · "))}
      ${Kcell("Has pescado", gFarm() ? `${caught}<small>/ ${d.rows.length}</small>` : "—", gFarm() ? `${fmt(d.rows.reduce((s, r) => s + r.caught, 0), 0)} capturas en total` : "", "sun")}
      ${Kcell("Lanzamientos al día", fmt(d.limit, 0), gFarm() ? "con tus boosts y carretes extra" : "base")}
      ${Kcell("Estación", d.season ? SEASON_ES2[d.season] || d.season : "—", d.season ? "sus peces salen en verde" : "")}
    </div>
    <div class="toolbar" style="padding:8px 12px;flex-wrap:wrap;gap:8px">
      ${view}
      ${segOf("gft", S.gfType, [["all", "Todos"], ...types.map((t) => [t, FISH_TYPE_ES[t] || t])])}
      ${segOf("gfs", S.gfSeason, [["all", "Todo el año"], ...Object.entries(SEASON_ES2).map(([k, l]) => [k, l])])}
      ${segOf("gfb", S.gfBait, [["all", "Cualquier cebo"], ...d.baits.map((b) => [b, b])])}
    </div>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Pez</th><th>Tipo</th><th>Cebo</th><th>Estaciones</th><th>Engodo más barato</th><th>Asegurado con</th><th>Suelta pieza de</th><th class="r">Pescados</th><th class="r">Precio P2P</th></tr></thead><tbody>
    ${list.map((r) => `<tr><td class="w">${Gi(r.name, 16)} ${esc(r.name)}</td><td class="ctx">${esc(FISH_TYPE_ES[r.type] || r.type)}${r.type === "marine marvel" ? ` <span class="tag" title="Hay que juntar las piezas de su mapa">mapa</span>` : ""}</td>
      <td class="ctx wrap">${(r.baits || []).map((b) => `${Gi(b, 12)} ${esc(b)}`).join(" ")}</td>
      <td>${(r.seasons || []).length === 4 ? `<span class="ctx">todo el año</span>` : (r.seasons || []).map((s) => `<span class="tag${s === d.season ? " green" : ""}">${SEASON_ES2[s] || s}</span>`).join(" ") || "—"}</td>
      <td class="ctx wrap" data-tip="${esc(`Engodo|${r.chum.map((c) => `${c.amt} ${c.item}${c.cost != null ? ` = ${fmt(c.cost, 3)} FLW` : ""}`).join(" · ") || "no le atrae nada"}|`)}">${r.bestChum ? `${Gi(r.bestChum.item, 12)} ×${r.bestChum.amt} <span class="dim">${fmt(r.bestChum.cost, 3)}</span>` : r.chum.length ? r.chum.map((c) => `${esc(c.item)} ×${c.amt}`).join(", ") : "—"}</td>
      <td class="ctx">${r.guaranteed.map(esc).join(", ") || "—"}</td>
      <td class="ctx">${r.piece ? `${Gi(r.piece.marvel, 12)} ${esc(r.piece.marvel)} <span class="dim">${fmt(r.piece.odds * 100, r.piece.odds < 0.01 ? 2 : 1)}%</span>` : "—"}</td>
      <td class="r mono ${r.caught ? "" : "dim"}">${gFarm() ? compact(r.caught) : "—"}</td><td class="r mono">${r.price == null ? "—" : fmt(r.price, 3)}</td></tr>`).join("")}
    </tbody></table></div>
    <div class="mod-f"><span>Engodo = cuánto hay que echar de ese item para atraerlo (CHUM_AMOUNTS), valorado a floor</span><span>${list.length} peces</span></div>`;
}
ACTIONS.gfv = (v) => { S.gfView = v; writeLS("gfView", v); rerun(); };
ACTIONS.gft = (v) => { S.gfType = v; writeLS("gfType", v); rerun(); };
ACTIONS.gfs = (v) => { S.gfSeason = v; writeLS("gfSeason", v); rerun(); };
ACTIONS.gfb = (v) => { S.gfBait = v; writeLS("gfBait", v); rerun(); };

/* ════════════════════════════════════════════════════════════════════════
   Flores — semillas, cruces (recetas de sfl.world) y lo que cuesta cultivar cada flor
   ════════════════════════════════════════════════════════════════════════ */
S.gflSeason = readLS("gflSeason", "all");
function flowerGuideModel() {
  const recipes = has("flowerRecipes") ? store.flowerRecipes.data : {};
  const seedOf = G.flowerSeedOf || {}, secs = G.flowerSeeds || {};
  const seedCost = (s) => (G.seedPrices?.[s] ?? 0) / coinRate();
  const flowers = Object.keys(seedOf);
  const isFlower = (n) => Boolean(seedOf[n]);
  // Las flores no se venden: coste = semilla + el cruce más barato (si el cruce es otra flor, lo que cuesta cultivarla).
  // Se relaja varias veces hasta que no cambia (como un camino más corto).
  const cost = {}, days = {}, via = {};
  for (let pass = 0; pass < 12; pass++) {
    let changed = false;
    for (const fl of flowers) {
      const r = recipes[fl], seed = seedOf[fl];
      const base = seedCost(seed), bd = (secs[seed] || 0) / 86400;
      const amounts = G.crossBreedAmounts?.[seed] || {};
      for (const ing of r?.via || []) {
        const amt = amounts[ing] ?? 1;
        const unit = isFlower(ing) ? cost[ing] : gPrice(ing);
        if (unit == null) continue;
        const c = base + unit * amt, dd = bd + (isFlower(ing) ? days[ing] ?? 0 : 0);
        if (cost[fl] == null || c < cost[fl] - 1e-9) { cost[fl] = c; days[fl] = dd; via[fl] = { ing, amt }; changed = true; }
      }
    }
    if (!changed) break;
  }
  const farm = gFarm();
  const seedSeasons = (s) => Object.entries(G.seasonalSeeds || {}).filter(([, l]) => l.includes(s)).map(([k]) => k);
  const seeds = Object.keys(secs).map((seed) => ({
    seed, price: G.seedPrices?.[seed] ?? null, days: secs[seed] / 86400, seasons: seedSeasons(seed), have: farm ? haveOf(seed) : 0,
    flowers: flowers.filter((f) => seedOf[f] === seed).map((f) => ({
      name: f, cost: cost[f] ?? null, days: days[f] ?? null, best: via[f] || null, have: farm ? haveOf(f) : 0,
      opts: (recipes[f]?.via || []).map((ing) => ({ ing, amt: G.crossBreedAmounts?.[seed]?.[ing] ?? 1, flower: isFlower(ing) })),
    })).sort((a, b) => (a.cost ?? 1e9) - (b.cost ?? 1e9)),
  }));
  return { seeds, hasRecipes: Object.keys(recipes).length > 0, total: flowers.length };
}
// Regalos (gifts.ts / giftFlowers.ts): cada flor da sus puntos de amistad + el extra si es de las favoritas del NPC
// + Blossom Bonding; el premio siguiente es el primero de la lista por encima de lo cobrado, y luego se repite
S.gflView = readLS("gflView", "flowers");
function npcGiftModel() {
  const N = G.npcGifts || {}, farm = gFarm();
  const bb = farm ? rankVal("Blossom Bonding", skillRank(farm, "Blossom Bonding"), [2, 3, 4]) : 0;
  const npcs = [...new Set([...Object.keys(N.bonuses || {}), ...Object.keys(N.gifts || {})])];
  return npcs.map((npc) => {
    const fr = farm?.npcs?.[npc]?.friendship || {}, points = toNum(fr.points), claimed = toNum(fr.giftClaimedAtPoints);
    const g = N.gifts?.[npc];
    let next = null;
    if (g) {
      next = (g.planned || []).slice().sort((a, b) => a.friendshipPoints - b.friendshipPoints).find((x) => x.friendshipPoints > claimed) || null;
      if (!next && g.repeats) next = { ...g.repeats, friendshipPoints: claimed + g.repeats.friendshipPoints };
    }
    const ptsFor = (f) => toNum(N.points?.[f]) + toNum(N.bonuses?.[npc]?.[f]) + bb;
    const fav = Object.keys(N.bonuses?.[npc] || {}).map((f) => ({ f, pts: ptsFor(f), have: farm ? haveOf(f) : 0 })).sort((a, b) => b.pts - a.pts);
    // Lo mejor que tienes para darle: la flor del inventario que más puntos le da
    const mine = farm ? Object.keys(N.points || {}).filter((f) => haveOf(f) > 0).map((f) => ({ f, pts: ptsFor(f), have: haveOf(f) })).sort((a, b) => b.pts - a.pts)[0] || null : null;
    const toGo = next ? Math.max(0, next.friendshipPoints - points) : null;
    const per = fav[0]?.pts || mine?.pts || 3 + bb; // al ritmo de su flor favorita (la que plantarías para él)
    return { npc, points, next, toGo, ready: Boolean(next) && toGo === 0, fav, mine,
      giftedToday: fr.giftedAt ? new Date(fr.giftedAt).toISOString().slice(0, 10) === todayUTC() : false, flowersNeeded: toGo ? Math.ceil(toGo / per) : 0 };
  }).sort((a, b) => b.ready - a.ready || (a.toGo ?? 1e9) - (b.toGo ?? 1e9));
}
function wGuideGifts() {
  const list = npcGiftModel(), farm = gFarm();
  const giftTxt = (x) => [x.coins ? `${Gi("Coins", 12, "coin")} ${compact(x.coins)}` : "", ...Object.entries(x.items || {}).map(([k, q]) => `${Gi(k, 12)} ${q > 1 ? fmt(q, 0) + " " : ""}${esc(k)}`),
    ...Object.keys(x.wearables || {}).map((k) => `${Gi(k, 12)} ${esc(k)}`), x.recipe ? `receta: ${esc(x.recipe)}` : ""].filter(Boolean).join(" · ") || "—";
  const favTxt = (f) => `<span style="margin-right:6px" class="${f.have ? "up" : ""}">${Gi(f.f, 12)} ${esc(f.f)} +${f.pts}</span>`;
  return `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>NPC</th><th class="r">Amistad</th><th>Siguiente regalo</th><th class="r">Faltan</th><th>Flores que más le gustan</th><th>Lo mejor que tienes</th></tr></thead><tbody>
    ${list.map((n) => `<tr><td class="w">${esc(NPC_ES(n.npc))}${n.ready ? ` <span class="tag green">regalo listo</span>` : ""}${n.giftedToday ? ` <span class="tag">flor hoy</span>` : ""}</td>
      <td class="r mono">${farm ? fmt(n.points, 0) : "—"}</td>
      <td class="ctx wrap">${n.next ? `<b>${fmt(n.next.friendshipPoints, 0)}</b> · ${giftTxt(n.next)}` : "no da regalos"}</td>
      <td class="r mono">${n.toGo == null || !farm ? "—" : n.toGo ? `${fmt(n.toGo, 0)}<div class="faint">≈ ${n.flowersNeeded} flores</div>` : "✓"}</td>
      <td class="ctx wrap">${n.fav.slice(0, 5).map(favTxt).join("") || `<span class="faint">cualquier flor</span>`}${n.fav.length > 5 ? ` <span class="faint">+${n.fav.length - 5} más</span>` : ""}</td>
      <td class="ctx">${n.mine ? `${Gi(n.mine.f, 12)} ${esc(n.mine.f)} +${n.mine.pts} <span class="faint">(tienes ${fmt(n.mine.have, 0)})</span>` : "—"}</td></tr>`).join("")}
  </tbody></table></div>
  <div class="mod-f"><span>Puntos por flor = los de la flor + el extra de sus favoritas${farm && skillRank(farm, "Blossom Bonding") ? " + Blossom Bonding" : ""} · en verde, las favoritas que tienes</span><span>Regalos: gifts.ts del juego</span></div>`;
}
function wGuideFlowers() {
  const view = Seg([["flowers", "Flores"], ["gifts", "Regalos a NPCs"]], S.gflView, "act").replace(/data-act="([^"]+)"/g, 'data-act="gflv:$1"');
  if (S.gflView === "gifts") return `<div class="toolbar" style="padding:8px 12px">${view}</div>${wGuideGifts()}`;
  const d = flowerGuideModel();
  const list = d.seeds.filter((s) => S.gflSeason === "all" || !s.seasons.length || s.seasons.length === 4 || s.seasons.includes(S.gflSeason));
  const seg = Seg([["all", "Todas"], ...Object.entries(SEASON_ES2)], S.gflSeason, "act").replace(/data-act="([^"]+)"/g, 'data-act="gfls:$1"');
  const demand = gFarm() && has("activity") ? flowerPlan().demand : [];
  return `<div class="toolbar" style="padding:8px 12px;gap:8px;flex-wrap:wrap">${view}${seg}<span class="ctx">${d.seeds.length} semillas · ${d.total} flores${d.hasRecipes ? "" : " · sin recetas de sfl.world: solo semillas"}</span></div>
    ${demand.length ? `<div class="grp">Te las piden ahora</div><div class="tbl-wrap"><table class="tbl"><tbody>${demand.slice(0, 8).map((x) => `<tr><td class="w">${Gi(x.flower, 14)} ${esc(x.flower)}</td><td class="ctx">${esc(FLOWER_KIND[x.kind] || x.kind)} · ${esc(x.who)}</td><td class="r">${fmt(x.need, 0)}</td><td class="r ${x.have >= x.need ? "up" : "dim"}">tienes ${fmt(x.have, 0)}</td></tr>`).join("")}</tbody></table></div><div class="mod-f"><span>Plan completo en Estrategia → Flores</span><a href="#strategy" class="ctx">Estrategia →</a></div>` : ""}
    ${list.map((s) => `<div class="grp">${Gi(s.seed, 16)} ${esc(s.seed)} <span class="ctx">· ${s.price != null ? `${fmt(s.price, 0)} coins` : "—"} · ${fmt(s.days, s.days % 1 ? 1 : 0)} ${s.days === 1 ? "día" : "días"} · ${s.seasons.length && s.seasons.length < 4 ? s.seasons.map((x) => SEASON_ES2[x]).join(", ") : "todo el año"}${s.have ? ` · tienes ${fmt(s.have, 0)}` : ""}</span></div>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Flor</th><th>Cruces posibles</th><th class="r">Coste</th><th class="r">Días</th><th class="r">Tienes</th></tr></thead><tbody>
      ${s.flowers.map((f) => `<tr><td class="w">${Gi(f.name, 16)} ${esc(f.name)}</td>
        <td class="ctx wrap">${f.opts.map((o) => `<span class="${f.best?.ing === o.ing ? "tag green" : ""}" style="margin-right:6px">${Gi(o.ing, 12)} ${esc(o.ing)} ×${o.amt}</span>`).join("") || "—"}</td>
        <td class="r mono">${f.cost == null ? "—" : fmt(f.cost, 3)}</td><td class="r mono dim">${f.days == null ? "—" : fmt(f.days, f.days % 1 ? 1 : 0)}</td>
        <td class="r mono ${f.have ? "" : "dim"}">${gFarm() ? fmt(f.have, 0) : "—"}</td></tr>`).join("")}
      </tbody></table></div>`).join("")}
    <div class="mod-f"><span>Coste = semilla + el cruce más barato a precio de mercado; si el cruce es otra flor, lo que cuesta cultivarla (en verde)</span><span>Días = cultivarla y, si hace falta, la flor del cruce · sin boosts</span></div>`;
}
ACTIONS.gflv = (v) => { S.gflView = v; writeLS("gflView", v); rerun(); };
ACTIONS.gfls = (v) => { S.gflSeason = v; writeLS("gflSeason", v); rerun(); };

/* ════════════════════════════════════════════════════════════════════════
   Mascotas — feedPet.ts: energía y XP por comida según nivel, aura y collar; búsquedas y su coste
   ════════════════════════════════════════════════════════════════════════ */
const PET_AURA = { "No Aura": 1, "Common Aura": 1.5, "Rare Aura": 2, "Mythic Aura": 3 };
const PET_BIB = { "Baby Bib": 0, Collar: 5, "Gold Necklace": 10 };
S.gpPet = readLS("gpPet", "");
S.gpCalc = readLS("gpCalc", { type: "Dog", level: 1, nft: false, aura: "No Aura", bib: "Baby Bib" });
function petDefs() {
  const farm = gFarm(), worn = farm ? wornSet(farm) : new Set(), placed = farm ? new Set(placedCollectibles(farm)) : new Set();
  return [
    { name: "Walrus Onesie", kind: "bool", auto: worn.has("Walrus Onesie"), group: "Energía", tip: "+5 de energía por comida" },
    { name: "Beast Shoes", kind: "bool", auto: worn.has("Beast Shoes"), group: "Experiencia", tip: "+100 XP en comidas medias, +250 en difíciles" },
    { name: "Hound Shrine", kind: "bool", auto: tempActiveNow(farm, "Hound Shrine"), group: "Experiencia", tip: "+100 XP por comida · dura 7 días" },
    { name: "Pet Bowls", kind: "bool", auto: placed.has("Pet Bowls"), group: "Experiencia", tip: "+10 XP por comida" },
    { name: "Squirrel Onesie", kind: "bool", auto: worn.has("Squirrel Onesie"), group: "Búsquedas", tip: "+1 Acorn por búsqueda" },
    { name: "Oaken", kind: "bool", auto: placed.has("Oaken"), group: "Búsquedas", tip: "+0,25 Acorn por búsqueda" },
    { name: "Paw Aura", kind: "bool", auto: worn.has("Paw Aura"), group: "Utilidad", tip: "alimentar no gasta la comida" },
  ];
}
function petCalcModel(v) {
  const P = G.pets || {}, farm = gFarm();
  const mine = farm ? petModel() : [];
  // Por defecto tu primera mascota; "calc" = la calculadora libre
  const sel = S.gpPet === "calc" ? null : mine.find((p) => String(p.id ?? p.name) === S.gpPet) || mine[0] || null;
  const c = S.gpCalc;
  const pet = sel ? { name: sel.name, type: sel.type, level: sel.L.lvl, nft: sel.nft, aura: sel.traits?.aura || "No Aura", bib: sel.traits?.bib || "Baby Bib", xp: toNum(sel.experience) }
    : { name: null, type: c.type, level: Math.max(1, Math.floor(toNum(c.level)) || 1), nft: Boolean(c.nft), aura: c.nft ? c.aura : "No Aura", bib: c.nft ? c.bib : "Baby Bib", xp: 50 * (Math.max(1, toNum(c.level)) - 1) * Math.max(1, toNum(c.level)) };
  const L = pet.level;
  // Peticiones al día por dificultad (getPetFoodRequests)
  const per = pet.nft ? (L < 30 ? { easy: 1, medium: 1, hard: 1 } : L < 200 ? { easy: 1, medium: 2, hard: 1 } : Object.fromEntries(Object.entries(P.requests || {}).map(([k, l]) => [k, l.length])))
    : (L < 10 ? { easy: 1, medium: 1, hard: 0 } : { easy: 1, medium: 1, hard: 1 });
  const energyOf = (base) => (base + (L >= 5 ? 5 : 0) + (L >= 35 ? 5 : 0) + (L >= 75 ? 5 : 0)) * (pet.nft ? PET_AURA[pet.aura] || 1 : 1) + (v["Walrus Onesie"] ? 5 : 0);
  const xpOf = (base, diff) => base * (1 + (L >= 27 ? 0.1 : 0) + (pet.nft && L >= 40 ? 0.15 : 0) + (pet.nft && L >= 85 ? 0.25 : 0))
    + (v["Hound Shrine"] ? 100 : 0) + (v["Pet Bowls"] ? 10 : 0) + (v["Beast Shoes"] ? (diff === "medium" ? 100 : diff === "hard" ? 250 : 0) : 0) + (pet.nft ? PET_BIB[pet.bib] || 0 : 0);
  const diffs = Object.entries(P.requestXp || {}).map(([diff, base]) => {
    const foods = (P.requests?.[diff] || []).map((f) => ({ f, v: gPrice(f) })).filter((x) => x.v != null);
    const avg = foods.length ? foods.reduce((s, x) => s + x.v, 0) / foods.length : null;
    return { diff, n: per[diff] || 0, energy: energyOf(base), xp: xpOf(base, diff), cost: v["Paw Aura"] ? 0 : avg, priced: foods.length, total: (P.requests?.[diff] || []).length };
  });
  const eDay = diffs.reduce((s, d) => s + d.n * d.energy, 0), xDay = diffs.reduce((s, d) => s + d.n * d.xp, 0);
  const cDay = diffs.every((d) => !d.n || d.cost != null) ? diffs.reduce((s, d) => s + d.n * (d.cost || 0), 0) : null;
  const perEnergy = cDay != null && eDay ? cDay / eDay : null;
  const toNext = 50 * L * (L + 1) - pet.xp;
  const cats = P.categories?.[pet.type] || [];
  const fetches = [{ name: "Acorn", level: 1 }, { name: P.fetchByCategory?.[cats[0]], level: 3 }, cats[1] && { name: P.fetchByCategory?.[cats[1]], level: 7 },
    cats[2] && { name: "Moonfur", level: 12 }, { name: "Fossil Shell", level: 20 }, cats[2] && { name: P.fetchByCategory?.[cats[2]], level: 25 }]
    .filter((f) => f && f.name).map((f) => {
      const energy = P.energy?.[f.name] || 0;
      const qty = 1 + (f.name === "Acorn" ? (v["Squirrel Onesie"] ? 1 : 0) + (v.Oaken ? 0.25 : 0) : 0);
      const unit = perEnergy != null ? (energy * perEnergy) / qty : null, market = f.name === "Fossil Shell" ? null : gPrice(f.name);
      return { ...f, energy, qty, unit, market, profit: unit != null && market != null ? market - unit : null, open: L >= f.level };
    });
  const nextPerk = fetches.find((f) => !f.open) || null;
  return { mine, sel, pet, per, diffs, eDay, xDay, cDay, perEnergy, toNext, days: xDay ? toNext / xDay : null, fetches, nextPerk };
}
function wGuidePets() {
  const bx = gBoosts("pets", petDefs());
  const d = petCalcModel(bx.val);
  const c = S.gpCalc, types = Object.keys(G.pets?.categories || {});
  const pick = `<div class="toolbar" style="padding:8px 12px;flex-wrap:wrap;gap:6px">
    ${d.mine.length ? `<div class="seg">${d.mine.map((p) => `<button data-act="gpp:${esc(String(p.id ?? p.name))}" class="${d.sel === p ? "on" : ""}">${esc(p.name)} · ${p.L.lvl}</button>`).join("")}<button data-act="gpp:calc" class="${!d.sel ? "on" : ""}">Calculadora</button></div>` : ""}
    ${!d.sel ? `<div class="seg">${types.map((t) => `<button data-act="gpt:${t}" class="${c.type === t ? "on" : ""}">${t}</button>`).join("")}</div>
      <label class="ctx">Nivel <input class="inp" type="number" min="1" max="300" value="${esc(String(c.level))}" data-chg="gpl" style="width:70px"></label>
      <label class="toggle"><input type="checkbox" data-chg="gpn" ${c.nft ? "checked" : ""}><i></i>NFT</label>
      ${c.nft ? `${Seg(Object.keys(PET_AURA).map((a) => [a, a.replace(" Aura", "").replace("No", "Sin aura")]), c.aura, "act").replace(/data-act="([^"]+)"/g, 'data-act="gpa:$1"')}
        ${Seg(Object.keys(PET_BIB).map((b) => [b, b]), c.bib, "act").replace(/data-act="([^"]+)"/g, 'data-act="gpb:$1"')}` : ""}` : ""}
  </div>`;
  const DIFF_ES = { easy: "Fácil", medium: "Media", hard: "Difícil" };
  return `${bx.panel}${pick}<div class="kstrip">
      ${Kcell(d.pet.name ? esc(d.pet.name) : "Tu mascota", `${esc(d.pet.type || "?")} <small>nivel ${d.pet.level}</small>`, d.pet.nft ? `NFT · ${esc(d.pet.aura)} · ${esc(d.pet.bib)}` : "mascota normal")}
      ${Kcell("Energía al día", `${sprite("bolt", 14)} ${fmt(d.eDay, 0)}`, `${Object.entries(d.per).filter(([, n]) => n).map(([k, n]) => `${n} ${DIFF_ES[k].toLowerCase()}`).join(" · ")}`)}
      ${Kcell("XP al día", fmt(d.xDay, 0), d.days != null ? `nivel ${d.pet.level + 1} en ${fmt(Math.ceil(d.days), 0)} días` : "", "sun")}
      ${Kcell("Comida al día", d.cDay == null ? "—" : `${fmt(d.cDay, 3)}<small>FLW</small>`, d.perEnergy != null ? `${fmt(d.perEnergy * 1000, 3)} FLW por 1000 de energía` : "sin precios")}
      ${Kcell("Siguiente búsqueda", d.nextPerk ? esc(d.nextPerk.name) : "todas", d.nextPerk ? `en el nivel ${d.nextPerk.level}` : "ya las tiene todas")}
    </div>
    <div class="grp">Qué te cuesta cada búsqueda</div>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Recurso</th><th class="r">Desde nivel</th><th class="r">Energía</th><th class="r">Trae</th><th class="r">Coste/unidad</th><th class="r">Mercado</th><th class="r">Beneficio/unidad</th><th class="r">Por 1000 de energía</th></tr></thead><tbody>
    ${d.fetches.map((f) => `<tr class="${f.open ? "" : "dim"}"><td class="w">${Gi(f.name, 16)} ${esc(f.name)}</td><td class="r">${f.level}</td><td class="r mono">${f.energy}</td><td class="r mono">${fmt(f.qty, f.qty % 1 ? 2 : 0)}</td>
      <td class="r mono">${f.unit == null ? "—" : fmt(f.unit, 4)}</td><td class="r mono">${f.market == null ? "—" : fmt(f.market, 4)}</td>
      <td class="r mono ${f.profit == null ? "" : f.profit > 0 ? "up" : "down"}">${f.profit == null ? "—" : fmt(f.profit, 4)}</td>
      <td class="r mono ${f.profit == null ? "" : f.profit > 0 ? "up" : "down"}">${f.profit == null ? "—" : fmt((f.profit * f.qty * 1000) / f.energy, 3)}</td></tr>`).join("")}
    </tbody></table></div>
    <div class="grp">Comida que pide</div>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Dificultad</th><th class="r">Al día</th><th class="r">Energía</th><th class="r">XP</th><th class="r">Coste medio</th></tr></thead><tbody>
    ${d.diffs.map((x) => `<tr class="${x.n ? "" : "dim"}"><td class="w">${DIFF_ES[x.diff] || x.diff} <span class="ctx">${x.total} comidas posibles</span></td><td class="r">${x.n || "aún no la pide"}</td>
      <td class="r mono">${fmt(x.energy, 1)}</td><td class="r mono">${fmt(x.xp, 0)}</td><td class="r mono">${x.cost == null ? "—" : fmt(x.cost, 3)}</td></tr>`).join("")}
    </tbody></table></div>
    <div class="mod-f"><span>Coste de un recurso = su energía al coste por energía de tu comida (media de lo que puede pedir) ÷ lo que trae · Fossil Shell da algo al azar</span><span>Energía: +5 en los niveles 5, 35 y 75 · aura ×1,5/2/3 · XP +10% nivel 27 (NFT +15% nivel 40, +25% nivel 85)</span></div>`;
}
const gpSet = (patch) => { S.gpCalc = { ...S.gpCalc, ...patch }; writeLS("gpCalc", S.gpCalc); rerun(); };
ACTIONS.gpp = (v) => { S.gpPet = v; writeLS("gpPet", v); rerun(); };
ACTIONS.gpt = (v) => gpSet({ type: v });
ACTIONS.gpl = (v) => gpSet({ level: Math.max(1, Math.min(300, Math.floor(toNum(v)) || 1)) });
ACTIONS.gpn = (v, el) => gpSet({ nft: el.checked });
ACTIONS.gpa = (v) => gpSet({ aura: v });
ACTIONS.gpb = (v) => gpSet({ bib: v });

/* ════════════════════════════════════════════════════════════════════════
   Animales — types/animals.ts: XP de cada nivel, lo que suelta, comida favorita y la más barata por XP
   ════════════════════════════════════════════════════════════════════════ */
S.gaType = readLS("gaType", "Chicken");
const ANIMAL_HOUSE_OF = { Chicken: "Hen House", Cow: "Barn", Sheep: "Barn", Pig: "Pigpen" };
function animalDefs() {
  const farm = gFarm(), own = farm ? ownedBoosts(farm) : new Set();
  const t = S.gaType;
  const list = [...FEED_MULT.all, ...(FEED_MULT[t] || [])].map(([n, m]) => ({ name: n, label: n.replace(/^skill:/, ""), icon: n.startsWith("skill:") ? false : undefined, kind: "bool", auto: own.has(n), group: "Comida por toma", tip: `×${fmt(m, 2)} de comida` }));
  list.push({ name: "skill:Chonky Feed", label: "Chonky Feed", icon: false, kind: "bool", auto: own.has("skill:Chonky Feed"), group: "Comida por toma", tip: "×2 de XP por comida, ×1,5 de comida" });
  list.push({ name: FREE_FEED[t], kind: "bool", auto: own.has(FREE_FEED[t]), group: "Comida por toma", tip: "comer gratis" });
  return list;
}
function animalGuideModel(v) {
  const A = G.animals || {}, t = S.gaType, farm = gFarm();
  const lv = A.levels?.[t] || {}, max = Math.max(...Object.keys(lv).map(Number));
  const foodCost = (food) => {
    const direct = gPrice(food);
    if (direct != null) return direct;
    let s = 0;
    for (const [k, q] of Object.entries(A.foods?.[food]?.ingredients || {})) { const p = k === "Gem" ? flowerPerGem() : gPrice(k); if (p == null) return null; s += p * q; }
    return s;
  };
  const qty = A.requiredQty?.[t] ?? 1;
  const mult = [...FEED_MULT.all, ...(FEED_MULT[t] || [])].reduce((m, [n, k]) => (v[n] ? m * k : m), 1) * (v["skill:Chonky Feed"] ? 1.5 : 1);
  const xpMul = v["skill:Chonky Feed"] ? 2 : 1, free = v[FREE_FEED[t]];
  const own = farm && S.gMode.animals !== "none" ? ownedBoosts(farm) : new Set();
  const dropValue = (L) => {
    const drop = A.drops?.[t]?.[L] || {};
    let val = 0, ok = true;
    const items = Object.entries(drop).map(([item, q]) => {
      const add = fxOn({ tags: ["animals", t, item], timeTags: ["animals", t], n: 1 }, own).add;
      const p = gPrice(item), amt = q + add;
      if (p == null) ok = false; else val += p * amt;
      return { item, amt };
    });
    return { items, value: ok ? val : null };
  };
  const levelRow = (L, step) => {
    const foods = Object.entries(A.foodXp?.[t]?.[L] || {}).filter(([f]) => f !== "Omnifeed");
    const fav = foods.slice().sort((a, b) => b[1] - a[1])[0] || null;
    const opts = foods.map(([f, xp]) => { const c = free ? 0 : foodCost(f); return { f, xp: xp * xpMul, per: c == null ? null : (c * qty * mult) / (xp * xpMul) }; });
    const cheap = opts.filter((o) => o.per != null).sort((a, b) => a.per - b.per)[0] || null;
    return { fav: fav && { f: fav[0], xp: fav[1] * xpMul }, cheap, rations: cheap ? step / cheap.xp : null, cost: cheap ? step * cheap.per : null };
  };
  const rows = [];
  let cum = 0, cumCost = 0, cumValue = 0;
  for (let L = 0; L < max; L++) {
    const step = lv[L + 1] - lv[L];
    cum += step;
    const r = levelRow(L, step), d = dropValue(L + 1);
    cumCost += r.cost ?? 0; cumValue += d.value ?? 0;
    rows.push({ from: L, to: L + 1, step, cum, ...r, drop: d, cumCost });
  }
  const loopStep = lv[max] - lv[max - 1], loop = levelRow(max, loopStep), loopDrop = dropValue(max);
  return { t, qty, mult, free, rows, max, total: { cost: cumCost, value: cumValue }, loop: { step: loopStep, ...loop, drop: loopDrop },
    coins: A.coins?.[t], sleep: A.sleepHours || 24, house: ANIMAL_HOUSE_OF[t] };
}
function wGuideAnimals() {
  const bx = gBoosts("animals", animalDefs());
  const d = animalGuideModel(bx.val);
  const types = Object.keys(G.animals?.levels || {});
  const seg = Seg(types.map((x) => [x, ANIMAL_ES[x] || x]), d.t, "act").replace(/data-act="([^"]+)"/g, 'data-act="gat:$1"');
  const dropTxt = (dr) => dr.items.map((i) => `${Gi(i.item, 12)} ${fmt(i.amt, i.amt % 1 ? 2 : 0)}`).join(" ") || "—";
  const diff = d.total.value - d.total.cost;
  return `<div class="toolbar" style="padding:8px 12px">${seg}</div>${bx.panel}
    <div class="kstrip">
      ${Kcell(esc(ANIMAL_ES[d.t] || d.t), `${fmt(d.coins || 0, 0)}<small>coins</small>`, `${esc(d.house || "")} · ${d.qty} comida${d.qty === 1 ? "" : "s"} por toma${d.mult !== 1 ? ` ×${fmt(d.mult, 2)}` : ""} · duerme ${d.sleep} h`)}
      ${Kcell(`De 0 a ${d.max}: comida`, `${fmt(d.total.cost, 3)}<small>FLW</small>`, "comprando la comida más barata por XP")}
      ${Kcell("Lo que suelta", `${fmt(d.total.value, 3)}<small>FLW</small>`, `diferencia <b class="${diff >= 0 ? "up" : "down"}">${fmt(diff, 3)}</b>`, diff >= 0 ? "up" : "")}
      ${Kcell(`En nivel ${d.max} (bucle)`, d.loop.cost != null && d.loop.drop.value != null ? `${fmt(d.loop.drop.value - d.loop.cost, 3)}<small>FLW/vuelta</small>` : "—", `${fmt(d.loop.step, 0)} XP · comida ${d.loop.cost == null ? "—" : fmt(d.loop.cost, 3)} · suelta ${dropTxt(d.loop.drop)}`, "sun")}
    </div>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Nivel</th><th class="r">XP</th><th>Produce</th><th class="r">Vale</th><th>Su favorita</th><th>La más barata por XP</th><th class="r">Raciones</th><th class="r">Coste del nivel</th></tr></thead><tbody>
    ${d.rows.map((r) => `<tr><td class="w">${r.from} → ${r.to}</td><td class="r mono">${fmt(r.step, 0)} <span class="faint">Σ ${fmt(r.cum, 0)}</span></td>
      <td>${dropTxt(r.drop)}</td><td class="r mono">${r.drop.value == null ? "—" : fmt(r.drop.value, 3)}</td>
      <td class="ctx">${r.fav ? `${Gi(r.fav.f, 12)} ${esc(r.fav.f)} ${fmt(r.fav.xp, 0)} XP` : "—"}</td>
      <td class="ctx">${r.cheap ? `${Gi(r.cheap.f, 12)} ${esc(r.cheap.f)} ${fmt(r.cheap.xp, 0)} XP` : "—"}</td>
      <td class="r mono">${r.rations == null ? "—" : fmt(r.rations * d.qty * d.mult, 1)}</td>
      <td class="r mono">${r.cost == null ? "—" : fmt(r.cost, 3)} <span class="faint">Σ ${fmt(r.cumCost, 3)}</span></td></tr>`).join("")}
    </tbody></table></div>
    <div class="mod-f"><span>La XP de cada comida depende del nivel que tiene el animal (la fila 5 → 6 usa la tabla del 5) · raciones = comidas que gastas, con tus multiplicadores</span><span>Produce con tus boosts de producción (modo «Mis boosts»)</span></div>`;
}
ACTIONS.gat = (v) => { S.gaType = v; writeLS("gaType", v); rerun(); };

/* ── Páginas ─────────────────────────────────────────────────────────────── */
const GUIDES = {
  gcooking: { title: "Cocina", icon: "cook", render: wGuideCooking, soft: ["activity", "farm"], sub: "Tiempo, XP, raciones y coste de cada receta con tus boosts de cocina y de XP (o los que quieras probar)" },
  gfishing: { title: "Pesca", icon: "fish", render: wGuideFishing, soft: ["activity", "farm"], sub: "Qué cebo usar, en qué estación, qué engodo le atrae y cuánto cuesta" },
  gflowers: { title: "Flores", icon: "flower", render: wGuideFlowers, soft: ["activity", "farm", "flowerRecipes"], sub: "Cada semilla, sus flores, con qué se cruzan y lo que cuesta cultivarlas" },
  gpets: { title: "Mascotas", icon: "paw", render: wGuidePets, soft: ["activity", "farm"], sub: "Energía, XP y coste de alimentar a tu mascota, lo que te cuesta cada búsqueda y los días al siguiente nivel" },
  ganimals: { title: "Animales", icon: "chicken", render: wGuideAnimals, soft: ["activity", "farm"], sub: "Cuánto cuesta subir cada animal, qué comida le conviene y qué te devuelve" },
};
for (const [key, g] of Object.entries(GUIDES)) {
  PAGES[key] = () => {
    $("#page").innerHTML = `<div class="plate">${Mod({ id: `${key}-main`, span: 12, title: g.title, icon: g.icon, flush: true })}</div>`;
    mount(`${key}-main`, { deps: [], soft: g.soft, render: g.render, loading: "rows" });
  };
  PAGE_META[key] = { title: `Guía: ${g.title}`, sub: () => g.sub };
}
