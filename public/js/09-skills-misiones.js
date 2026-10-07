// SFL Console — Skills, valoración de items y misiones.
// Scripts clásicos que comparten el ámbito global en el orden de index.html (antes, un solo app.js).
"use strict";

/* ── Skills ─────────────────────────────────────────────────────────────── */
const TREES = {
  Crops: { label: "Cultivos", spr: "carrot" },
  "Fruit Patch": { label: "Frutales", spr: "apple" },
  Trees: { label: "Árboles", spr: "tree" },
  Fishing: { label: "Pesca", spr: "fish" },
  Animals: { label: "Animales", spr: "chicken" },
  Greenhouse: { label: "Invernadero", spr: "pot" },
  Mining: { label: "Minería", spr: "iron" },
  Cooking: { label: "Cocina", spr: "cook" },
  "Bees & Flowers": { label: "Abejas y flores", spr: "flower" },
  Machinery: { label: "Maquinaria", spr: "machine" },
  Compost: { label: "Compost", spr: "compost" },
  Aging: { label: "Envejecido", spr: "barrel" },
};
const ISLAND_ES = { basic: "básica", spring: "primavera", desert: "desierto", volcano: "volcán", swamp: "pantano" };

// Reglas del juego (choseSkill.ts): 1 punto por nivel; el tier 2/3 de un árbol se
// desbloquea al gastar N puntos en él (sin contar los de tier 3).
// Rangos (bumpkinSkills.ts): subir una skill tuya de rango cuesta tantos Ascension Shards como su tier y 1/3/6 puntos
// (tier 1/2/3; esos puntos no cuentan para desbloquear tiers) y pide el tier min(3, tier + rango actual) en su árbol.
const skillUpCost = (tier) => ({ shards: tier, points: G.skillUpgradePoints?.[tier] ?? [1, 3, 6][tier - 1] });
function skillModel() {
  const f = store.farm.data;
  if (skillModel.c?.f === f) return skillModel.c.m;
  const bumpkin = f.farm.bumpkin || {};
  const owned = bumpkin.skills || {};
  const level = bumpkinLevel(toNum(bumpkin.experience)).lvl;
  const island = f.farm.island?.type || "basic";
  const islandIdx = G.islandOrder.indexOf(island);
  let used = 0;
  const trees = {};
  const shards = toNum(f.farm.inventory?.["Ascension Shard"]);
  for (const [name, sk] of Object.entries(G.skills)) {
    const t = (trees[sk.tree] ||= { name: sk.tree, used: 0, tierPts: 0, owned: 0, total: 0, skills: [] });
    t.total++;
    t.skills.push({ name, ...sk });
    if (owned[name]) {
      const rank = Math.min(sk.maxLevel || 1, Math.max(1, Math.round(toNum(owned[name]))));
      const upPts = (rank - 1) * skillUpCost(sk.tier).points;
      t.owned++;
      t.used += sk.points + upPts;
      used += sk.points + upPts;
      if (sk.tier !== 3) t.tierPts += sk.points;
    }
  }
  const free = level - used;
  const luna = wornSet(f.farm).has("Luna's Crescent"); // también si lo lleva un ayudante
  const lastUse = bumpkin.previousPowerUseAt || {};
  for (const t of Object.values(trees)) {
    const req = G.skillTiers[t.name] || { 1: 0, 2: 99, 3: 99 };
    t.req = req;
    t.tier = t.tierPts >= req[3] ? 3 : t.tierPts >= req[2] ? 2 : 1;
    t.toNext = t.tier < 3 ? req[t.tier + 1] - t.tierPts : 0;
    for (const s of t.skills) {
      s.owned = Boolean(owned[s.name]);
      const islandOk = G.islandOrder.indexOf(s.island) <= islandIdx;
      s.reason = s.owned ? null
        : s.disabled ? "no disponible en el juego"
        : !islandOk ? `requiere isla ${ISLAND_ES[s.island] || s.island}`
        : s.tier > t.tier ? `tier ${s.tier}: faltan ${req[s.tier] - t.tierPts} pts en el árbol`
        : s.points > free ? `cuesta ${s.points} pts (tienes ${free})`
        : null;
      s.available = !s.owned && !s.reason;
      s.maxRank = s.maxLevel || 1;
      s.rank = s.owned ? Math.min(s.maxRank, Math.max(1, Math.round(toNum(owned[s.name])))) : 0;
      if (s.owned && s.rank < s.maxRank && !s.disabled) {
        const c = skillUpCost(s.tier), need = Math.min(3, s.tier + s.rank);
        s.up = { rank: s.rank + 1, ...c, needTier: need };
        s.upReason = t.tier < need ? `rango ${s.rank + 1}: pide tier ${need} en el árbol (faltan ${req[need] - t.tierPts} pts)`
          : c.points > free ? `rango ${s.rank + 1}: cuesta ${c.points} pt${c.points > 1 ? "s" : ""} de skill (tienes ${free})`
          : c.shards > shards ? `rango ${s.rank + 1}: cuesta ${c.shards} Ascension Shard${c.shards > 1 ? "s" : ""} (tienes ${shards})`
          : null;
        s.canUp = !s.upReason;
      }
      if (s.power) {
        const cd = (s.cooldown || 0) * (luna ? 0.5 : 1);
        s.readyAt = (lastUse[s.name] || 0) + cd;
      }
    }
    t.skills.sort((a, b) => a.tier - b.tier || a.points - b.points || a.name.localeCompare(b.name));
  }
  const m = { level, used, free, island, trees, owned, luna, shards, ownedCount: Object.keys(owned).filter((n) => G.skills[n]).length };
  skillModel.c = { f, m };
  return m;
}

function wSkillKpis() {
  const m = skillModel();
  const all = Object.values(m.trees).flatMap((t) => t.skills);
  const powers = all.filter((s) => s.power && s.owned);
  const ready = powers.filter((s) => s.readyAt <= now()).length;
  const avail = all.filter((s) => s.available).length;
  const top = Object.values(m.trees).sort((a, b) => b.used - a.used)[0];
  return `<div class="kstrip">
    ${Kcell("Puntos libres", `${m.free}`, `${m.used} de ${m.level} gastados · 1 por nivel`, m.free > 0 ? "green" : "")}
    ${Kcell("Skills aprendidas", `${m.ownedCount}<small>/ ${all.length}</small>`, `${avail} disponibles para aprender ahora`)}
    ${Kcell("Poderes listos", `${ready}<small>/ ${powers.length}</small>`, m.luna ? "cooldowns a la mitad (Luna's Crescent)" : "habilidades activas con cooldown", ready ? "green" : "")}
    ${Kcell("Ascension Shards", `${m.shards}`, (() => { const n = all.filter((s) => s.canUp).length; return n ? `${n} skill${n > 1 ? "s" : ""} para subir de rango ya` : all.some((s) => s.up) ? "suben skills de rango (también gastan puntos)" : "suben skills de rango"; })(), all.some((s) => s.canUp) ? "green" : "")}
    ${Kcell("Isla", ISLAND_ES[m.island] || m.island, "limita las skills disponibles")}
    ${top ? Kcell("Árbol principal", TREES[top.name]?.label || top.name, `${top.used} pts · tier ${top.tier}`) : ""}
  </div>`;
}

function wPowers() {
  const m = skillModel();
  const t = now();
  const all = Object.values(m.trees).flatMap((tr) => tr.skills.map((s) => ({ ...s, treeName: tr.name }))).filter((s) => s.power);
  const mine = all.filter((s) => s.owned).sort((a, b) => a.readyAt - b.readyAt);
  setSub("sk-powers", `${mine.length} de ${all.length}`);
  if (!mine.length) return Empty("bolt", "Sin poderes", "Los poderes son skills de tier alto que se activan a mano.");
  return mine.map((s) => {
    const ready = s.readyAt <= t;
    return `<div class="ev">
      <div class="ico">${sprite(TREES[s.treeName]?.spr || "bolt", 18)}</div>
      <div style="min-width:0"><div class="t">${esc(s.name)}</div><div class="s" title="${esc(s.buff)}">${esc(s.buff)}</div></div>
      <div class="tm">${ready ? `<span class="ok-tag">LISTO</span><small>${s.cooldown ? `cd ${dur(s.cooldown * (m.luna ? 0.5 : 1))}` : "sin cooldown"}</small>`
        : `<span data-until="${s.readyAt}">${dur(s.readyAt - t)}</span><small>${at(s.readyAt)}</small>`}</div></div>`;
  }).join("");
}

function wTrees() {
  const m = skillModel();
  return `<div class="trees">${Object.keys(TREES).filter((k) => m.trees[k]).map((k) => {
    const t = m.trees[k];
    const avail = t.skills.filter((s) => s.available).length;
    const nextReq = t.tier < 3 ? t.req[t.tier + 1] : t.req[3];
    const p = t.tier >= 3 ? 1 : clamp01(t.tierPts / Math.max(1, nextReq));
    return `<button class="treecell ${S.skillTree === k ? "on" : ""}" data-tree="${esc(k)}">
      <div class="tc-h">${sprite(TREES[k].spr, 18)}<b>${TREES[k].label}</b>${avail ? `<span class="st-tag avail" data-tip="${esc(`${TREES[k].label}|${avail} skill${avail > 1 ? "s" : ""} disponible${avail > 1 ? "s" : ""} para aprender ya|`)}" aria-label="${avail} disponibles">+${avail}</span>` : ""}</div>
      <div class="tc-tiers">${[1, 2, 3].map((n) => t.tier >= n
        ? `<i class="on" title="Tier ${n} desbloqueado">✓ T${n}</i>`
        : `<i class="off" title="Tier ${n} bloqueado: faltan ${t.req[n] - t.tierPts} pts en este árbol">${sprite("lock", 8)}T${n}</i>`).join("")}<span class="n" title="Skills aprendidas de este árbol">${t.owned}/${t.total}</span></div>
      <div class="pbar"><i style="width:${(p * 100).toFixed(0)}%;--c:var(--sun)"></i></div>
      <div class="ctx">${t.used} pts${t.tier < 3 ? ` · tier ${t.tier + 1} a ${t.toNext} pts` : " · todo desbloqueado"}</div>
    </button>`;
  }).join("")}</div>`;
}

function wTreeDetail() {
  const m = skillModel();
  const t = m.trees[S.skillTree] || Object.values(m.trees)[0];
  const label = TREES[t.name]?.label || t.name;
  const filt = (s) => S.skillFilter === "all" || (S.skillFilter === "owned" ? s.owned : S.skillFilter === "avail" ? s.available : !s.owned);
  setSub("sk-tree", `${label} · ${t.owned}/${t.total} aprendidas · tier ${t.tier} desbloqueado`);
  const title = $("#sk-tree-title");
  if (title) title.textContent = label;
  return `<div class="toolbar">${Seg([["all", "Todas"], ["owned", "Aprendidas"], ["avail", "Disponibles"], ["missing", "Pendientes"]], S.skillFilter, "sfilter")}
      <span class="sk-legend"><span class="st-tag owned">✓ Aprendida</span><span class="st-tag avail">Disponible</span><span class="st-tag blocked">${sprite("lock", 8)} Bloqueada</span>${Legend("skills")}</span>
      <span class="grow"></span><span class="ctx">Tier 2 con ${t.req[2]} pts · tier 3 con ${t.req[3]} pts (sin contar los de tier 3)</span></div>
    <div class="tiers">${[1, 2, 3].map((n) => {
      const list = t.skills.filter((s) => s.tier === n && filt(s));
      const locked = t.tier < n;
      return `<div class="tiercol ${locked ? "locked" : ""}">
        <div class="grp">${locked ? sprite("lock", 10) : ""}Tier ${n}${locked ? ` · faltan ${t.req[n] - t.tierPts} pts` : ""}</div>
        ${list.map((s) => {
          const st = s.owned ? "owned" : s.available ? "avail" : "blocked";
          const tag = { owned: "✓ Aprendida", avail: "Disponible", blocked: "Bloqueada" }[st];
          return `<div class="skill ${st}" aria-label="${esc(`${s.name}: ${tag}`)}">
          <div class="sk-h"><span class="sk-st">${s.owned ? sprite("check", 12) : s.available ? `<i class="dot"></i>` : sprite("lock", 11)}</span>
            <b>${esc(s.name)}</b>${s.power ? `<span class="tag">poder</span>` : ""}${s.owned && s.maxRank > 1 ? `<span class="tag sun" title="Rango ${s.rank} de ${s.maxRank}">R${s.rank}/${s.maxRank}</span>` : ""}<span class="st-tag ${st}">${tag}</span><span class="sk-pts">${s.points} pt${s.points > 1 ? "s" : ""}</span></div>
          <div class="sk-buff">${esc(s.buff)}</div>
          ${s.debuff ? `<div class="sk-debuff">${esc(s.debuff)}</div>` : ""}
          ${s.reason ? `<div class="sk-why">${sprite("lock", 8)}${esc(s.reason)}</div>` : s.available ? `<div class="sk-why ok">puedes aprenderla ya</div>` : ""}
          ${s.up ? (s.canUp ? `<div class="sk-why ok">puedes subirla a rango ${s.up.rank}: ${s.up.shards} shard${s.up.shards > 1 ? "s" : ""} + ${s.up.points} pt${s.up.points > 1 ? "s" : ""}</div>` : `<div class="sk-why">${sprite("lock", 8)}${esc(s.upReason)}</div>`) : ""}
        </div>`;
        }).join("") || `<div class="ctx" style="padding:12px 16px">Nada con este filtro.</div>`}
      </div>`;
    }).join("")}</div>`;
}

// Subir de rango con Ascension Shards: todas tus skills mejorables, lo que cuesta, si puedes ya y lo que suma
function skillUpgradeList() {
  const m = skillModel(), gains = has("activity") ? skillUpGains() : {};
  return Object.values(m.trees).flatMap((t) => t.skills.filter((s) => s.up).map((s) => ({ ...s, treeName: t.name, gain: gains[s.name] ?? null })))
    .sort((a, b) => Number(b.canUp) - Number(a.canUp) || (b.gain ?? -1) - (a.gain ?? -1) || a.up.points - b.up.points || a.name.localeCompare(b.name));
}
function wSkillRanks() {
  const m = skillModel(), list = skillUpgradeList(), now_ = list.filter((s) => s.canUp).length;
  setSub("sk-ranks", `${m.shards} Ascension Shard${m.shards === 1 ? "" : "s"} · ${m.free} pt${m.free === 1 ? "" : "s"} libres · ${now_} para subir ya`);
  if (!list.length) return Empty("bolt", "Nada que subir", "Cuando aprendas skills mejorables, aquí verás cuánto cuesta subirlas de rango.");
  const head = !now_ ? `<div class="ctx" style="padding:10px 16px">${m.free <= 0 && m.shards > 0
    ? `Tienes ${m.shards} Ascension Shard${m.shards === 1 ? "" : "s"}, pero subir de rango también gasta puntos de skill y no te queda ninguno libre: con cada nivel del Bumpkin ganas 1 (las de tier 1 piden 1 punto y 1 shard). Abajo, en qué gastarlos primero.`
    : !m.shards ? "Te faltan Ascension Shards: se sacan picando el Ascension Crystal." : "Te faltan puntos de skill o el tier del árbol para las que quedan."}</div>` : "";
  return `${head}<div class="cb-cards">${list.map((x) => ({ ...x, can: x.canUp ? 1 : 0 })).map((x) => ItemCard({ name: x.name, iconHtml: `<span class="lv-badge">R${x.rank}</span>`, can: x.can,
      tags: `<span class="tag">${esc(TREES[x.treeName]?.label || x.treeName)} · T${x.tier}</span>${x.canUp ? `<span class="tag green">puedes subirla ya</span>` : ""}`,
      sub: esc(x.buff),
      body: `<div class="cb-ing">
        <div>${Gi("Ascension Shard", 22)}<span>Ascension Shards</span><b class="${m.shards >= x.up.shards ? "up" : "down"}">×${x.up.shards}</b></div>
        <div><span class="lv-badge" style="width:22px;height:22px;font-size:10px">pt</span><span>Puntos de skill</span><b class="${m.free >= x.up.points ? "up" : "down"}">×${x.up.points}</b></div>
        ${x.upReason ? `<div class="ctx">${esc(x.upReason)}</div>` : ""}</div>`,
      stats: [["Rango", `${x.rank} → ${x.up.rank} de ${x.maxRank}`], ["FLOWER/día", x.gain == null ? "—" : signed(x.gain, 3), x.gain == null ? "" : tone(x.gain)]],
    })).join("")}</div>
  <div class="mod-f"><span>Primero las que puedes subir ya, luego las que más suman · coste por rango: tantos shards como su tier y 1/3/6 puntos de skill (tier 1/2/3) · el rango 2 de una de tier 1 pide tier 2 en el árbol y el 3, tier 3</span><span>bumpkinSkills.ts del juego</span></div>`;
}

// Shards y reinicio: cristales por picar (3 shards cada uno con un Gold Pickaxe, mineAscensionCrystal.ts) y cuándo puedes
// reiniciar las skills (gratis cada 180 días; con gemas 200 · 2^reinicios pagados, resetSkills.ts). Reiniciar devuelve
// todos los puntos y los shards gastados.
function wSkillShards() {
  const farm = store.farm.data.farm, m = skillModel(), t = now();
  const crystals = Object.values(farm.ascensionCrystals || {}).filter((c) => c && c.x != null).length;
  const pickaxes = haveOf("Gold Pickaxe");
  const spent = Object.values(m.trees).flatMap((tr) => tr.skills).filter((s) => s.owned && s.rank > 1).reduce((a, s) => a + (s.rank - 1) * s.tier, 0);
  const freeAt = toNum(farm.bumpkin?.previousFreeSkillResetAt) + 180 * DAY_MS;
  const gems = 200 * Math.pow(2, toNum(farm.bumpkin?.paidSkillResets));
  return `<div class="kv-list">
      <div><span>Ascension Shards</span><b>${fmt(m.shards, 0)}</b></div>
      <div><span>Gastados en rangos</span><b>${fmt(spent, 0)}</b></div>
      <div><span>Cristales por picar</span><b>${crystals}</b>${crystals ? `<em>= ${crystals * 3} shards · gastan ${crystals} Gold Pickaxe (tienes ${fmt(pickaxes, 0)})</em>` : ""}</div>
      <div><span>Reinicio gratis</span><b>${freeAt <= t ? `<span class="up">disponible</span>` : `en ${dur(freeAt - t)}`}</b><em>cada 180 días</em></div>
      <div><span>Reinicio con gemas</span><b>${fmt(gems, 0)} gemas</b><em>se dobla con cada reinicio pagado</em></div>
    </div>
    <div class="mod-f"><span>Cada Ascension Crystal da 3 shards (se gasta al picarlo): sale uno al subir a primavera, desierto y volcán (9 shards antes de ascender) y más al ascender · reiniciar devuelve todos los puntos y shards</span><span>mineAscensionCrystal.ts · resetSkills.ts</span></div>`;
}

/* ── Valoración de items (mercado → receta → coins) ─────────────────────── */
const NPC_ES = (n) => String(n || "").replace(/\b\w/g, (c) => c.toUpperCase());
// Valor de las coins en FLOWER: lo que pongas en Misiones; si no, la forma más barata de conseguirlas, que es
// comprar en el mercado un cultivo/fruta que la tienda recompra caro (mejor conversión, ~5× el banco). Sin datos
// de mercado, la tasa del banco. Los tesoros no cuentan aquí: tienen poco volumen para comprar coins a lo grande.
let marketCoinRateC = null;
function marketCoinRate() {
  if (!has("activity")) return null;
  // La misma que el Conversor y el chip "mejor conversión": con tus boosts de venta y contando los tesoros con listados
  const key = `${store.activity.at}|${store.farm?.at || 0}`;
  if (marketCoinRateC?.key !== key) marketCoinRateC = { key, v: convModel("auto").best?.rate || bestConversion(store.activity.data.items)[0]?.rate || null };
  return marketCoinRateC.v;
}
const coinRate = () => Number(S.coinRate) || marketCoinRate() || G.coinsPerFlower;
ACTIONS.coinauto = () => { S.coinRate = null; writeLS("coinRate", null); renderHeader(); if ($("#ms-settings")) $("#ms-settings").innerHTML = missionSettings(); repaint("farm"); };
const isVip = () => has("farm") && (store.farm.data.farm.vip?.expiresAt || 0) > now();

// Precio en FLOWER por unidad: floor del mercado; si no se vende, su receta; coins a la tasa elegida.
function priceBook() {
  const a = store.activity?.data;
  const key = `${a?.date}|${coinRate()}|${a ? Object.keys(a.items).length : 0}|${store.fx?.at || 0}|${S.gemPack || ""}`;
  if (priceBook.c?.key === key && priceBook.c.a === a) return priceBook.c.fn;
  const cache = {};
  const fn = (name, depth = 0) => {
    if (cache[name]) return cache[name];
    cache[name] = { v: null, src: null };
    let v = null, src = null;
    if (name === "coins") { v = 1 / coinRate(); src = "coins"; }
    else if (name === "sfl") { v = 1; src = "flower"; }
    // Gemas: no se venden; valen lo que cuestan en la tienda (el paquete elegido en Misiones o el más barato)
    else if (name === "Gem") { v = flowerPerGem(); src = v != null ? "gemas" : null; }
    else {
      const id = G.itemIds[name], wid = G.wearableIds[name];
      const it = a && (id != null ? a.items[`collectibles-${id}`] : wid != null ? a.items[`wearables-${wid}`] : null);
      const mp = it ? it.floor ?? it.latestSale : null;
      if (mp) { v = mp; src = "mercado"; }
      else if (G.recipes[name] && depth < 4) {
        const r = G.recipes[name];
        let sum = r.coins / coinRate(), ok = true;
        for (const [k, q] of Object.entries(r.items)) {
          const p = fn(k, depth + 1);
          if (p.v == null) { ok = false; break; }
          sum += p.v * q;
        }
        if (ok) { v = sum; src = "receta"; }
      }
      if (v == null && depth < 4) {
        // Lo que no se vende ni tiene receta de taller: lo que cuesta hacerlo en el aging shed (especiero, fermentación),
        // procesarlo en el Fish Market (receta de la estación) o atraparlo (la trampa + engodo más barata)
        const U = G.utilities || {};
        const sum = (items) => { let s = 0; for (const [k, q] of Object.entries(items || {})) { const p = fn(k, depth + 1); if (p.v == null) return null; s += p.v * q; } return s; };
        const made = Object.values({ ...(U.spice || {}), ...(U.fermentation || {}) }).find((r) => r.secs > 0 && r.out?.[name]);
        if (made) { const s = sum(made.items); if (s != null) { v = s / made.out[name]; src = "receta"; } }
        else if (U.processing?.secs?.[name]) {
          const season = store.farm?.data?.farm?.season?.season || "summer";
          const s = sum({ ...(U.processing.base[name] || {}), ...(U.processing.seasonal[name]?.[season] || {}) });
          if (s != null) { v = s; src = "receta"; }
        } else if (U.crustaceans) {
          let best = null;
          for (const [trap, map] of Object.entries(U.crustaceans.lookup)) for (const [chum, what] of Object.entries(map)) {
            if (what !== name) continue;
            const t = fn(trap, depth + 1).v, c = chum === "none" ? 0 : fn(chum, depth + 1).v;
            if (t == null || c == null) continue;
            const cost = t + c * (chum === "none" ? 0 : U.crustaceans.chums[trap]?.[chum] || 0);
            if (best == null || cost < best) best = cost;
          }
          if (best != null) { v = best; src = "receta"; }
        }
      }
    }
    return (cache[name] = { v, src });
  };
  priceBook.c = { key, a, fn };
  return fn;
}

function haveOf(name) {
  const farm = store.farm.data.farm;
  if (name === "coins") return toNum(farm.coins);
  if (name === "sfl") return toNum(farm.balance);
  return toNum(farm.inventory?.[name] ?? farm.wardrobe?.[name]);
}

// Valora una lista de items pedidos: lo que valen (neto de comisión si se venderían) y lo que falta comprar.
function valueItems(items) {
  const price = priceBook();
  let net = 0, missingCost = 0;
  const unknown = [], lines = [];
  for (const [name, qty] of Object.entries(items || {})) {
    const p = price(name);
    const have = haveOf(name);
    const miss = Math.max(0, qty - have);
    const taxable = p.src === "mercado" || p.src === "receta";
    if (p.v == null) unknown.push(name);
    else {
      net += p.v * qty * (taxable && S.p2pTax ? 1 - sellTax(name) : 1);
      missingCost += p.v * miss;
    }
    lines.push({ name, qty, have, miss, unit: p.v, src: p.src });
  }
  return { net, missingCost, unknown, lines, ready: lines.every((l) => l.miss === 0) };
}

// Comisión al venderlo en el mercado: los recursos pagan la de tu isla (resourceTax, VIP a la mitad); lo demás, el 10%
const sellTax = (name) => (has("farm") && (G.tradeResources || []).includes(name) ? resourceTax(store.farm.data.farm) : 0.1);
const taxNote = () => (has("farm") ? `−${fmt(resourceTax(store.farm.data.farm) * 100, 1)}% los recursos en tu isla, −10% lo demás` : "−10%");

// Boosts de la recompensa de un pedido (getOrderSellPrice del juego): skills por NPC y por tipo de pedido, pinta de chef,
// corona de tu facción y, al final, ×2 en día de entrega doble (solo la primera entrega del día a ese NPC)
const FACTION_CROWN = { bumpkins: "Bumpkin Crown", goblins: "Goblin Crown", nightshades: "Nightshade Crown", sunflorians: "Sunflorian Crown" };
function orderBoosts(o, farm, doneToday, double) {
  const sk = farm.bumpkin?.skills || {};
  const rank = (n) => { const l = Math.min(3, toNum(sk[n])); return l ? G.skills?.[n]?.ranks?.[l - 1] ?? 0 : 0; };
  const items = Object.keys(o.items || {}), coins = toNum(o.reward?.coins) > 0;
  const out = [];
  const add = (name, v) => { if (v) out.push({ name, v }); };
  if (coins && o.from === "betty") add("Betty's Friend", rank("Betty's Friend"));
  if (coins && o.from === "victoria") add("Victoria's Secretary", rank("Victoria's Secretary"));
  if (coins && o.from === "blacksmith") add("Forge-Ward Profits", rank("Forge-Ward Profits"));
  if (coins && o.from === "tango" && items.some((n) => G.fruitSeedOf?.[n])) add("Fruity Profit", rank("Fruity Profit"));
  if (coins && o.from === "corale") add("Fishy Fortune", rank("Fishy Fortune"));
  if (items.some((n) => G.foods?.[n])) add("Nom Nom", rank("Nom Nom"));
  const worn = wornSet(farm);
  if (items.some((n) => / Cake$/.test(n)) && worn.has("Chef Apron")) add("Chef Apron", 0.2);
  const crown = FACTION_CROWN[farm.faction?.name];
  if (crown && worn.has(crown)) add(crown, 0.25);
  let mul = 1 + out.reduce((a, b) => a + b.v, 0);
  if (double && !doneToday) { mul *= 2; out.push({ name: "Entrega doble", v: null }); }
  return { mul, list: out };
}

const todayUTC = () => new Date(now()).toISOString().slice(0, 10);
function calendarEvents() {
  const dates = store.farm.data.farm.calendar?.dates || [];
  return dates.filter((d) => d.date >= todayUTC()).sort((a, b) => a.date.localeCompare(b.date));
}
const isDoubleToday = () => calendarEvents().some((d) => d.date === todayUTC() && d.name === "doubleDelivery");

// Coleccionables colocados en cualquier sitio: la granja, la casa antigua (home) y el interior de la casa
// (interior.ground y demás plantas). El juego los cuenta todos como "construidos" para sus boosts.
function placedCollectibles(farm) {
  const groups = [farm.collectibles, farm.home?.collectibles, ...Object.values(farm.interior || {}).map((lvl) => lvl?.collectibles)];
  // Solo lo que está en el mapa: lo quitado sigue en la lista pero sin coordenadas (y con removedAt)
  return [...new Set(groups.flatMap((g) => Object.entries(g || {}).filter(([, v]) => (v || []).some((it) => it && (it.coordinates || !("removedAt" in it)))).map(([k]) => k)))];
}
const isPlaced = (farm, name) => placedCollectibles(farm).includes(name);

function currentChapter() {
  const t = now();
  return Object.entries(G.chapters).find(([, c]) => t >= c.start && t < c.end)?.[0] || null;
}
// Ropa que da boost: la de tu Bumpkin Y la de tus ayudantes (farm hands). El juego las cuenta igual
// (isWearableActive en lib/wearables.ts) → [{ name, who }] con quién la lleva.
function wornWearables(farm) {
  const out = Object.values(farm.bumpkin?.equipped || {}).map((name) => ({ name, who: "Tu Bumpkin" }));
  for (const [id, b] of Object.entries(farm.farmHands?.bumpkins || {})) {
    for (const name of Object.values(b?.equipped || {})) out.push({ name, who: `Ayudante ${id}` });
  }
  return out;
}
const wornSet = (farm) => new Set(wornWearables(farm).map((w) => w.name));

// Tickets extra por los objetos de boost del capítulo: +1 por cada uno colocado o equipado,
// ya sea por tu Bumpkin o por tus ayudantes de granja (isWearableActive en el juego).
function autoTicketBoost() {
  const ch = currentChapter();
  if (!ch || !G.chapterBoosts[ch] || !has("farm")) return null;
  const farm = store.farm.data.farm;
  const worn = wornSet(farm);
  return G.chapterBoosts[ch].filter((item) => worn.has(item) || isPlaced(farm, item)).length;
}
const ticketBoost = () => (S.ticketBoost != null ? Number(S.ticketBoost) : autoTicketBoost() ?? 0);

function missionModel() {
  const farm = store.farm.data.farm;
  const t = now();
  const today = todayUTC();
  const double = isDoubleToday();
  const vip = isVip();
  const boost = ticketBoost();
  const orders = (farm.delivery?.orders || []).map((o) => {
    const v = valueItems(o.items);
    const base = G.ticketRewards[o.from];
    const doneToday = new Date(farm.npcs?.[o.from]?.deliveryCompletedAt || 0).toISOString().slice(0, 10) === today;
    let tickets = 0;
    if (base) {
      tickets = base + (vip ? 2 : 0) + boost;
      if (double && !doneToday) tickets *= 2;
    }
    const ob = base ? { mul: 1, list: [] } : orderBoosts(o, farm, doneToday, double);
    const rewardCoins = toNum(o.reward?.coins) * ob.mul, rewardSfl = toNum(o.reward?.sfl) * ob.mul;
    const rewardValue = rewardCoins / coinRate() + rewardSfl;
    return {
      ...o, ...v, tickets, kind: base ? "tickets" : rewardSfl ? "flower" : rewardCoins ? "coins" : "otro",
      rewardCoins, rewardSfl, rewardValue, boosts: ob.list, boostMul: ob.mul,
      perTicket: tickets ? v.net / tickets : null,
      profit: base ? null : rewardValue - v.net,
      done: Boolean(o.completedAt),
      waiting: (o.readyAt || 0) > t,
      canSkip: new Date(o.createdAt).toISOString().slice(0, 10) !== today,
    };
  });
  const open = orders.filter((o) => !o.done);
  const ticketOrders = open.filter((o) => o.kind === "tickets");
  const act = farm.farmActivity || {};
  const board = Object.entries(farm.choreBoard?.chores || {}).map(([npc, c]) => {
    const def = G.chores[c.name];
    const progress = def ? Math.max(0, toNum(act[def.activity]) - toNum(c.initialProgress)) : null;
    return { npc, ...c, def, progress, p: def ? clamp01(progress / def.amount) : null, done: Boolean(c.completedAt), rewardValue: valueItems(c.reward?.items || {}).net + toNum(c.reward?.coins) / coinRate() };
  });
  const weekly = Object.values(farm.chores?.chores || {}).map((c) => {
    const progress = Math.max(0, toNum(act[c.activity]) - toNum(c.startCount));
    return { ...c, progress, p: clamp01(progress / Math.max(1, c.requirement)), done: Boolean(c.completedAt) };
  });
  const bounties = (farm.bounties?.requests || []).filter((b) => !(farm.bounties.completed || []).some((c) => c.id === b.id)).map((b) => {
    const isAnimal = b.level != null;
    const price = priceBook();
    const itemVal = isAnimal ? null : price(b.name).v;
    const rewardValue = toNum(b.coins) / coinRate() + toNum(b.sfl) + valueItems(b.items || {}).net;
    const have = isAnimal ? null : haveOf(b.name);
    return { ...b, isAnimal, itemVal, have, rewardValue, profit: itemVal != null ? rewardValue - itemVal * (S.p2pTax ? 1 - sellTax(b.name) : 1) : null };
  });
  return { orders, open, ticketOrders, board, weekly, bounties, double, vip, boost };
}

/* ── Widgets de Misiones ─────────────────────────────────────────────────── */
const MISSION_TABS = {
  orders: { id: "ms-orders", label: "Entregas", icon: "scroll", render: () => wDeliveries() },
  chores: { id: "ms-chores", label: "Tareas", icon: "check", render: () => wChores() },
  bounties: { id: "ms-bounties", label: "Bounties", icon: "coin", render: () => wBounties() },
};
// Pestañas con el número de pendientes de cada una (sin datos aún, solo el nombre)
function missionTabs() {
  let counts = {};
  if (has("farm") && has("activity")) {
    const m = missionModel();
    counts = {
      orders: m.open.length,
      chores: m.board.filter((c) => !c.done).length + m.weekly.filter((c) => !c.done).length,
      bounties: m.bounties.length,
    };
  }
  const tab = MISSION_TABS[S.missionTab] ? S.missionTab : "orders";
  return `<div class="seg tabs">${Object.entries(MISSION_TABS).map(([k, t]) => `<button role="tab" aria-selected="${k === tab}" data-mstab="${k}" class="${k === tab ? "on" : ""}">
    ${t.label}${counts[k] != null ? ` <span class="cnt">${counts[k]}</span>` : ""}</button>`).join("")}</div>`;
}
ACTIONS.gempack = (v) => { S.gemPack = v; writeLS("gemPack", v); renderHeader?.(); repaint("farm"); toast(v ? `Gemas valoradas con el paquete de ${v}` : "Gemas valoradas con el paquete más barato"); };
function missionSettings() {
  const auto = autoTicketBoost();
  return `<div class="toolbar">
    <span class="ctx">Coins por FLOWER</span><input class="inp" id="coinRateInput" type="text" inputmode="decimal" style="width:80px" value="${esc(S.coinRate ?? "")}" placeholder="auto ${fmt(marketCoinRate() || G.coinsPerFlower, 0)}" title="Vacío = automático: la mejor conversión del Conversor de monedas (${fmt(marketCoinRate() || G.coinsPerFlower, 0)} coins/FLOWER con tus boosts de venta). Escribe un número para fijarlo a mano. El banco da ${G.coinsPerFlower}." />${S.coinRate != null ? `<button class="btn ghost sm" data-act="coinauto" title="Volver al valor automático (${fmt(marketCoinRate() || G.coinsPerFlower, 0)})">auto</button>` : `<span class="tag green" title="Se actualiza solo con los precios del mercado">auto</span>`}
    <span class="ctx" title="${esc(currentChapter() ? `${currentChapter()}: ${(G.chapterBoosts[currentChapter()] || []).join(", ")} (+1 cada uno equipado por ti o un ayudante)` : "Capítulo no reconocido: actualiza con npm run gamedata")}">Boost capítulo</span>${Seg([["auto", auto != null ? `auto (${auto})` : "auto"], [0, "0"], [1, "+1"], [2, "+2"], [3, "+3"]], S.ticketBoost == null ? "auto" : S.ticketBoost, "tboost")}
    ${(() => { const packs = Object.values(store.fx?.data?.gems || {}).filter((p) => p.gem > 0 && p.sfl > 0).sort((x, y) => x.gem - y.gem); return packs.length ? `<span class="ctx" title="Con qué paquete de la tienda se valoran las gemas (expansiones, subastas, coste de lo que piden gemas)">Gemas</span><select class="inp" data-chg="gempack" style="width:auto"><option value="" ${!S.gemPack ? "selected" : ""}>el paquete más barato</option>${packs.map((p) => `<option value="${p.gem}" ${String(S.gemPack) === String(p.gem) ? "selected" : ""}>${fmt(p.gem, 0)} gemas · ${fmt(p.sfl / p.gem, 4)} FLW/gema · ${fmt(p.usd, 2)} USD</option>`).join("")}</select>` : ""; })()}
    <label class="toggle"><input type="checkbox" id="taxToggle" ${S.p2pTax ? "checked" : ""} /><i></i>Descontar la comisión</label>
    <span class="grow"></span>
    <label class="toggle"><input type="checkbox" id="doneToggle" ${S.showDone ? "checked" : ""} /><i></i>Ver completadas</label>
  </div>`;
}

function wMissionKpis() {
  const m = missionModel();
  const tickets = m.ticketOrders.reduce((s, o) => s + o.tickets, 0);
  const cost = m.ticketOrders.reduce((s, o) => s + o.net, 0);
  const ready = m.open.filter((o) => o.ready && !o.waiting).length;
  const cheapest = [...m.ticketOrders].filter((o) => o.perTicket != null).sort((a, b) => a.perTicket - b.perTicket)[0];
  const nextDouble = calendarEvents().find((d) => d.name === "doubleDelivery");
  const fp = store.activity?.data?.flowerPrice || 0;
  return `<div class="kstrip">
    ${Kcell("Tickets en pedidos", `${tickets}`, `${m.ticketOrders.length} pedidos · ${m.vip ? "+2 VIP" : "sin VIP"} · boost +${m.boost}${m.double ? " · ×2 hoy" : ""}`, "sun")}
    ${Kcell("Valor de lo pedido", `${fmt(cost, 1)}<small>FLW</small>`, `≈ $${fmt(cost * fp, 2)} · ${fmt(tickets ? cost / tickets : 0, 3)} por ticket`)}
    ${Kcell("Entregables ya", `${ready}`, `de ${m.open.length} pedidos abiertos`, ready ? "green" : "")}
    ${Kcell("Ticket más barato", cheapest ? fmt(cheapest.perTicket, 3) : "—", cheapest ? `${NPC_ES(cheapest.from)} · ${cheapest.tickets} tickets` : "")}
    ${Kcell("Entrega doble", nextDouble ? (nextDouble.date === todayUTC() ? "HOY" : new Date(nextDouble.date + "T00:00:00Z").toLocaleDateString(LOCALE, { weekday: "short", day: "numeric" })) : "—", nextDouble ? "tickets ×2 por NPC ese día" : "no hay en el calendario", m.double ? "green" : "")}
  </div>`;
}

const itemChip = (l) => `<span class="need ${l.miss ? "miss" : "ok"}" title="${esc(l.name)} · tienes ${fmt(l.have)} · ${l.unit != null ? `${fmt(l.unit)} FLOWER/u (${l.src})` : "sin precio"}">
  ${esc(l.name === "coins" ? "Coins" : l.name === "sfl" ? "FLOWER" : l.name)} <b>${compact(Math.min(l.have, l.qty))}/${compact(l.qty)}</b></span>`;

// Fila de lo que piden con lo que tienes (verde si te llega)
const needRow = (l) => `<div title="${esc(l.name)} · tienes ${fmt(l.have)}${l.unit != null ? ` · ${fmt(l.unit)} FLOWER/u (${l.src})` : " · sin precio"}">${Gi(l.name === "coins" ? "Coins" : l.name, 22, l.name === "coins" ? "coin" : "")}<span>${esc(l.name === "coins" ? "Coins" : l.name === "sfl" ? "FLOWER" : l.name)}</span><b class="${l.miss ? "down" : "up"}">${compact(Math.min(l.have, l.qty))}/${compact(l.qty)}</b></div>`;

// Entregar, saltar o vender: entregar deja la recompensa (tickets al valor del ticket en la tienda de Stella) menos lo que
// valen los items (lo que sacarías vendiéndolos o lo que cuesta comprar lo que falta); no entregar = quedarte los items
// (0); saltar es gratis desde el día siguiente a que llegó el pedido (skipOrder.ts) y trae otro del mismo NPC, que de
// media deja lo que sus pedidos posibles (volcado oficial de todas las granjas) en recompensa menos coste.
function deliveryAdvice(o) {
  if (o.done) return null;
  let tkv = null;
  try { tkv = typeof chapterModel === "function" ? chapterModel()?.tkValue?.v ?? null : null; } catch { tkv = null; }
  const reward = o.kind === "tickets" ? (tkv != null ? o.tickets * tkv : null) : o.rewardValue;
  // Lo que no tiene precio pero ya tienes (gusanos, pescado envejecido, tesoros…) se cuenta como 0: no hay que comprarlo
  const missUnknown = o.lines.filter((l) => l.unit == null && l.miss > 0), freeUnknown = o.lines.filter((l) => l.unit == null && !l.miss).map((l) => l.name);
  const known = !missUnknown.length && reward != null;
  const profit = known ? reward - o.net : null;
  const note = freeUnknown.length ? ` · sin contar ${freeUnknown.join(", ")} (lo tienes, sin precio)` : "";
  // Lo que deja de media un pedido nuevo de ese NPC (con tus mismos boosts de recompensa)
  let next = null;
  try {
    const n = typeof npcGuideModel === "function" ? npcGuideModel().npcs.find((x) => x.npc === o.from) : null;
    const opts = (n?.orders || []).filter((x) => x.c.ok);
    if (opts.length) {
      const rv = (x) => (o.kind === "tickets" ? (tkv != null ? o.tickets * tkv : null) : n.kind === "COINS" ? (toNum(x.reward) * (o.boostMul || 1)) / coinRate() : n.kind === "FLOWER" ? toNum(x.reward) * (o.boostMul || 1) : null);
      const vals = opts.map((x) => (rv(x) == null ? null : rv(x) - x.c.v)).filter((v) => v != null);
      if (vals.length) next = vals.reduce((s, v) => s + v, 0) / vals.length;
    }
  } catch { next = null; }
  if (profit == null) return { act: "?", label: "sin precio", cls: "", why: o.kind === "tickets" && tkv == null ? "sin valor del ticket en la tienda de Stella" : `te falta${missUnknown.length > 1 ? "n" : ""} ${missUnknown.map((l) => l.name).join(", ")}, sin precio para valorar${missUnknown.length > 1 ? "los" : "lo"}`, profit, next };
  const skipBetter = next != null && next > Math.max(profit, 0) + 1e-6;
  if (profit >= 0 && !(skipBetter && o.canSkip)) return { act: "deliver", label: "entregar", cls: "green", why: `deja ${signed(profit, 3)} FLOWER${o.kind === "tickets" ? ` (${o.tickets} tickets a ${fmt(tkv, 4)})` : ""}${note}`, profit, next };
  if (skipBetter && o.canSkip && !o.waiting) return { act: "skip", label: "saltar", cls: "sun", why: `un pedido nuevo de ${NPC_ES(o.from)} deja de media ${signed(next, 3)} FLOWER frente a ${signed(profit, 3)} de este (saltar es gratis)${note}`, profit, next };
  if (skipBetter && !o.canSkip) return { act: "wait", label: "saltar mañana", cls: "", why: `hoy no se puede saltar (llegó hoy); uno nuevo deja de media ${signed(next, 3)}`, profit, next };
  return { act: "sell", label: "no entregar", cls: "red", why: `perderías ${fmt(-profit, 3)} FLOWER: quédate los items o véndelos${note}`, profit, next };
}
function wDeliveries() {
  const m = missionModel();
  const ACT_ORDER = { deliver: 0, skip: 1, wait: 2, sell: 3, "?": 4 };
  const list = (S.showDone ? m.orders : m.open).map((o) => { const adv = deliveryAdvice(o); return { ...o, adv, can: !o.done && !o.waiting && o.ready && adv?.act !== "sell" ? 1 : 0 }; }).sort((a, b) =>
    canFirst(a, b) || (ACT_ORDER[a.adv?.act] ?? 5) - (ACT_ORDER[b.adv?.act] ?? 5) || (a.done - b.done) || (a.kind === "tickets" ? 0 : 1) - (b.kind === "tickets" ? 0 : 1) || (a.perTicket ?? -a.profit ?? 0) - (b.perTicket ?? -b.profit ?? 0));
  setSub("ms-orders", `${m.open.length} abiertos · ${list.filter((o) => o.can).length} entregables ya`);
  if (!list.length) return Empty("scroll", "Sin pedidos", "No tienes entregas pendientes.");
  const perTickets = m.ticketOrders.map((o) => o.perTicket).filter((x) => x != null).sort((a, b) => a - b);
  const median = perTickets[Math.floor(perTickets.length / 2)] ?? 0;
  return `<div class="cb-cards">${list.map((o) => {
    const reward = o.kind === "tickets" ? `${o.tickets} tickets` : o.kind === "flower" ? `${fmt(o.rewardSfl, 2)} FLOWER` : o.kind === "coins" ? `${fmt(o.rewardCoins, 0)} coins` : "—";
    const state = o.done ? `<span class="tag">hecho</span>` : o.waiting ? `<span class="tag">en ${dur(o.readyAt - now())}</span>`
      : o.ready ? `<span class="tag green">entregable</span>` : `<span class="tag red">faltan ${o.lines.filter((l) => l.miss).length}</span>`;
    const verdict = o.kind === "tickets" ? ["Coste/ticket", o.perTicket == null ? "—" : fmt(o.perTicket, 3), o.perTicket != null && o.perTicket <= median ? "up" : "down"]
      : ["Balance", o.profit == null ? "—" : `${o.profit >= 0 ? "+" : ""}${fmt(o.profit, 2)}`, o.profit == null ? "" : o.profit >= 0 ? "up" : "down"];
    return ItemCard({ name: NPC_ES(o.from), icon: o.lines[0]?.name, can: o.can, iconHtml: npcFace(o.from),
      tags: `${o.adv ? `<span class="tag ${o.adv.cls}">${esc(o.adv.label)}</span>` : ""}${state}`,
      sub: `Da <b>${reward}</b>${o.boosts?.length ? ` · con ${o.boosts.map((b) => b.name).join(", ")}` : ""}${o.adv ? `<div class="ctx">${esc(o.adv.label[0].toUpperCase() + o.adv.label.slice(1))}: ${o.adv.why}</div>` : ""}`,
      body: `<div class="cb-ing">${o.lines.map(needRow).join("")}${o.unknown.length ? `<div class="faint">${o.unknown.length} sin precio</div>` : ""}</div>`,
      stats: [["Valor pedido", fmt(o.net, 2)], verdict, ["Si entregas", o.adv?.profit == null ? "—" : signed(o.adv.profit, 3), o.adv?.profit == null ? "" : tone(o.adv.profit)], ["Uno nuevo", o.adv?.next == null ? "—" : signed(o.adv.next, 3), o.adv?.next == null ? "" : tone(o.adv.next)]],
    });
  }).join("")}</div>
    <div class="mod-f"><span>Primero lo que conviene hacer ya · entregar = recompensa (tickets al valor del ticket en la tienda de Stella) − lo que valen los items; saltar es gratis desde el día siguiente y trae otro pedido del mismo NPC ("Uno nuevo" = lo que deja de media, con los pedidos de todas las granjas del volcado oficial) · valor = lo que ganarías vendiendo esos items${S.p2pTax ? ` (${taxNote()})` : ""}; herramientas y comidas por receta; coins a ${fmt(coinRate(), 0)}/FLOWER · la recompensa lleva tus boosts y la entrega doble</span>
      <span>coste/ticket en verde = por debajo de la mediana (${fmt(median, 3)})</span></div>`;
}

function wChores() {
  const m = missionModel();
  const rewardTxt = (c) => Object.entries(c.reward?.items || {}).map(([k, v]) => `${v} ${k}`).join(", ") || (c.reward?.coins ? `${fmt(c.reward.coins, 0)} coins` : "");
  // Primero las que ya puedes reclamar (progreso completo), luego las más avanzadas
  const board = m.board.filter((c) => S.showDone || !c.done).map((c) => ({ ...c, can: !c.done && c.p >= 1 ? 1 : 0 })).sort((a, b) => canFirst(a, b) || (a.done - b.done) || (b.p ?? 0) - (a.p ?? 0));
  const weekly = m.weekly.filter((c) => S.showDone || !c.done).map((c) => ({ ...c, can: !c.done && c.p >= 1 ? 1 : 0 })).sort((a, b) => canFirst(a, b) || (b.p ?? 0) - (a.p ?? 0));
  setSub("ms-chores", `${m.board.filter((c) => !c.done).length} del tablero · ${weekly.length} semanales`);
  const card = (name, npc, icon, p, prog, req, reward, done, can) => ItemCard({ name, icon, can, iconHtml: npc ? npcFace(npc) : null,
    tags: done ? `<span class="tag">hecha</span>` : can ? `<span class="tag green">lista para reclamar</span>` : "",
    sub: `${npc ? `${esc(NPC_ES(npc))} · ` : ""}${reward ? `da ${esc(reward)}` : ""}`,
    body: p != null ? `<div class="pbar${p >= 1 ? " done" : ""}"><i style="width:${(Math.min(1, p) * 100).toFixed(0)}%"></i></div><div class="ctx" style="margin-top:6px">${fmt(Math.min(prog, req), 0)} / ${fmt(req, 0)}</div>` : `<div class="ctx">progreso no disponible</div>`,
  });
  return (board.length ? `<div class="grp">Tablero de tareas</div><div class="cb-cards">${board.map((c) => card(c.name, c.npc, Object.keys(c.reward?.items || {})[0], c.p, c.progress, c.def?.amount, rewardTxt(c), c.done, c.can)).join("")}</div>` : "") +
    (weekly.length ? `<div class="grp">Semanales</div><div class="cb-cards">${weekly.map((c) => card(c.description, null, "Scroll", c.p, c.progress, c.requirement, "", c.done, c.can)).join("")}</div>` : "") ||
    Empty("check", "Todo hecho", "No quedan tareas pendientes.");
}

function wBounties() {
  const m = missionModel();
  // Primero los que puedes vender ya (tienes el item), y entre ellos los que más dejan
  const list = m.bounties.map((b) => ({ ...b, can: !b.isAnimal && b.have >= 1 ? 1 : 0 })).sort((a, b) => canFirst(a, b) || (b.profit ?? -Infinity) - (a.profit ?? -Infinity));
  setSub("ms-bounties", `${list.length} abiertos · ${list.filter((b) => b.can).length} puedes vender ya · ${list.filter((b) => b.profit > 0).length} rentables`);
  if (!list.length) return Empty("coin", "Sin bounties", "");
  const rewardRows = (b) => [b.coins ? `<div>${Gi("Coins", 22, "coin")}<span>Coins</span><b>${fmt(b.coins, 0)}</b></div>` : "", b.sfl ? `<div>${Gi("FLOWER", 22, "sun")}<span>FLOWER</span><b>${fmt(b.sfl, 2)}</b></div>` : "",
    ...Object.entries(b.items || {}).map(([k, v]) => `<div>${Gi(k, 22)}<span>${esc(k)}</span><b>×${fmt(v, 0)}</b></div>`)].join("");
  return `<div class="cb-cards">${list.map((b) => ItemCard({ name: b.name, can: b.can,
    tags: `${b.isAnimal ? `<span class="tag">animal nivel ${b.level}</span>` : ""}${b.can ? `<span class="tag green">lo tienes</span>` : ""}`,
    sub: b.isAnimal ? "se entrega un animal de ese nivel" : `piden 1 · tienes ${fmt(b.have)}`,
    body: `<div class="cb-ing">${rewardRows(b)}</div>`,
    stats: [["Valor del item", b.itemVal != null ? fmt(b.itemVal) : "—"], ["Pagan", fmt(b.rewardValue, 2)], ["Balance", b.profit != null ? `${b.profit >= 0 ? "+" : ""}${fmt(b.profit, 2)}` : "—", b.profit == null ? "" : b.profit >= 0 ? "up" : "down"]],
  })).join("")}</div><div class="mod-f"><span>Primero lo que puedes vender ya · balance = lo que pagan − lo que sacarías vendiendo el item</span><span>animales: solo valor de la recompensa</span></div>`;
}

// Una vez: el valor de las coins pasa a ser automático (antes se escribía a mano en Misiones)
if (!readLS("coinRateAuto", false)) { S.coinRate = null; writeLS("coinRate", null); writeLS("coinRateAuto", true); }
