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
  for (const [name, sk] of Object.entries(G.skills)) {
    const t = (trees[sk.tree] ||= { name: sk.tree, used: 0, tierPts: 0, owned: 0, total: 0, skills: [] });
    t.total++;
    t.skills.push({ name, ...sk });
    if (owned[name]) {
      t.owned++;
      t.used += sk.points;
      used += sk.points;
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
      if (s.power) {
        const cd = (s.cooldown || 0) * (luna ? 0.5 : 1);
        s.readyAt = (lastUse[s.name] || 0) + cd;
      }
    }
    t.skills.sort((a, b) => a.tier - b.tier || a.points - b.points || a.name.localeCompare(b.name));
  }
  const m = { level, used, free, island, trees, owned, luna, ownedCount: Object.keys(owned).filter((n) => G.skills[n]).length };
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
            <b>${esc(s.name)}</b>${s.power ? `<span class="tag">poder</span>` : ""}<span class="st-tag ${st}">${tag}</span><span class="sk-pts">${s.points} pt${s.points > 1 ? "s" : ""}</span></div>
          <div class="sk-buff">${esc(s.buff)}</div>
          ${s.debuff ? `<div class="sk-debuff">${esc(s.debuff)}</div>` : ""}
          ${s.reason ? `<div class="sk-why">${sprite("lock", 8)}${esc(s.reason)}</div>` : s.available ? `<div class="sk-why ok">puedes aprenderla ya</div>` : ""}
        </div>`;
        }).join("") || `<div class="ctx" style="padding:12px 16px">Nada con este filtro.</div>`}
      </div>`;
    }).join("")}</div>`;
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
  const key = `${a?.date}|${coinRate()}|${a ? Object.keys(a.items).length : 0}`;
  if (priceBook.c?.key === key && priceBook.c.a === a) return priceBook.c.fn;
  const cache = {};
  const fn = (name, depth = 0) => {
    if (cache[name]) return cache[name];
    cache[name] = { v: null, src: null };
    let v = null, src = null;
    if (name === "coins") { v = 1 / coinRate(); src = "coins"; }
    else if (name === "sfl") { v = 1; src = "flower"; }
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
  return [...new Set(groups.flatMap((g) => Object.entries(g || {}).filter(([, v]) => (v || []).length).map(([k]) => k)))];
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
function missionSettings() {
  const auto = autoTicketBoost();
  return `<div class="toolbar">
    <span class="ctx">Coins por FLOWER</span><input class="inp" id="coinRateInput" type="text" inputmode="decimal" style="width:80px" value="${esc(S.coinRate ?? "")}" placeholder="auto ${fmt(marketCoinRate() || G.coinsPerFlower, 0)}" title="Vacío = automático: la mejor conversión del Conversor de monedas (${fmt(marketCoinRate() || G.coinsPerFlower, 0)} coins/FLOWER con tus boosts de venta). Escribe un número para fijarlo a mano. El banco da ${G.coinsPerFlower}." />${S.coinRate != null ? `<button class="btn ghost sm" data-act="coinauto" title="Volver al valor automático (${fmt(marketCoinRate() || G.coinsPerFlower, 0)})">auto</button>` : `<span class="tag green" title="Se actualiza solo con los precios del mercado">auto</span>`}
    <span class="ctx" title="${esc(currentChapter() ? `${currentChapter()}: ${(G.chapterBoosts[currentChapter()] || []).join(", ")} (+1 cada uno equipado por ti o un ayudante)` : "Capítulo no reconocido: actualiza con npm run gamedata")}">Boost capítulo</span>${Seg([["auto", auto != null ? `auto (${auto})` : "auto"], [0, "0"], [1, "+1"], [2, "+2"], [3, "+3"]], S.ticketBoost == null ? "auto" : S.ticketBoost, "tboost")}
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

function wDeliveries() {
  const m = missionModel();
  const list = (S.showDone ? m.orders : m.open).slice().sort((a, b) =>
    (a.done - b.done) || (a.kind === "tickets" ? 0 : 1) - (b.kind === "tickets" ? 0 : 1) || (a.perTicket ?? -a.profit ?? 0) - (b.perTicket ?? -b.profit ?? 0));
  setSub("ms-orders", `${m.open.length} abiertos · ordenados por coste por ticket`);
  if (!list.length) return Empty("scroll", "Sin pedidos", "No tienes entregas pendientes.");
  const perTickets = m.ticketOrders.map((o) => o.perTicket).filter((x) => x != null).sort((a, b) => a - b);
  const median = perTickets[Math.floor(perTickets.length / 2)] ?? 0;
  return `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>NPC</th><th>Pide${Legend("needs")}</th><th class="r">Recompensa</th><th class="r">Valor pedido</th><th class="r">Coste / ticket${Legend("perTicket")}</th><th class="r">Falta comprar</th><th>Estado</th></tr></thead><tbody>
    ${list.map((o) => {
      const boostTip = o.boosts?.length ? ` data-tip="${esc(`Recompensa con tus boosts|${o.boosts.map((b) => (b.v == null ? `${b.name} ×2` : `${b.name} +${fmt(b.v * 100, 0)}%`)).join(" · ")}|×${fmt(o.boostMul, 2)} sobre la base`)}"` : "";
      const reward = o.kind === "tickets" ? `<b class="sun-t">${o.tickets}</b> tickets` : o.kind === "flower" ? `<b${boostTip}>${fmt(o.rewardSfl, 2)}</b> FLOWER` : o.kind === "coins" ? `<b${boostTip}>${fmt(o.rewardCoins, 0)}</b> coins` : "—";
      const verdict = o.kind === "tickets"
        ? `<span class="${o.perTicket <= median ? "up" : "down"}">${fmt(o.perTicket, 3)}</span>`
        : o.profit != null ? `<span class="${o.profit >= 0 ? "up" : "down"}">${o.profit >= 0 ? "+" : ""}${fmt(o.profit, 2)}</span><div class="ctx">${o.profit >= 0 ? "conviene entregar" : "conviene vender"}</div>` : "—";
      const state = o.done ? `<span class="tag">hecho</span>` : o.waiting ? `<span class="tag">en ${dur(o.readyAt - now())}</span>`
        : o.ready ? `<span class="ok-tag">ENTREGABLE</span>` : `<span class="tag red">faltan ${o.lines.filter((l) => l.miss).length}</span>`;
      return `<tr class="${o.done ? "dim" : ""}"><td><b>${esc(NPC_ES(o.from))}</b>${o.canSkip && !o.done ? `<div class="ctx">se puede saltar</div>` : ""}</td>
        <td class="needs">${o.lines.map(itemChip).join("")}${o.unknown.length ? `<span class="tag" title="Sin precio de mercado ni receta">?${o.unknown.length}</span>` : ""}</td>
        <td class="r">${reward}</td><td class="r">${fmt(o.net, 2)}</td><td class="r">${verdict}</td>
        <td class="r ${o.missingCost ? "" : "dim"}">${o.missingCost ? fmt(o.missingCost, 2) : "—"}</td><td>${state}</td></tr>`;
    }).join("")}</tbody></table></div>
    <div class="mod-f"><span>Valor = lo que ganarías vendiendo esos items en el mercado${S.p2pTax ? ` (${taxNote()})` : ""}; herramientas y comidas por receta; coins a ${fmt(coinRate(), 0)}/FLOWER. La recompensa ya lleva tus boosts de entrega y la entrega doble.</span>
      <span>verde = por debajo de la mediana (${fmt(median, 3)})</span></div>`;
}

function wChores() {
  const m = missionModel();
  const board = m.board.filter((c) => S.showDone || !c.done).sort((a, b) => (a.done - b.done) || (b.p ?? 0) - (a.p ?? 0));
  const weekly = m.weekly.filter((c) => S.showDone || !c.done);
  setSub("ms-chores", `${m.board.filter((c) => !c.done).length} del tablero · ${weekly.length} semanales`);
  const row = (name, who, p, prog, req, reward, done) => `<div class="chore ${done ? "done" : ""}">
    <div class="ch-h"><span class="nm">${esc(name)}</span>${who ? `<span class="ctx">${esc(who)}</span>` : ""}<span class="n ch-r">${reward}</span></div>
    <div class="ch-p">${p != null ? `<div class="pbar${p >= 1 ? " done" : ""}"><i style="width:${(p * 100).toFixed(0)}%"></i></div><span class="n">${fmt(Math.min(prog, req), 0)}/${fmt(req, 0)}</span>` : `<span class="ctx">progreso no disponible</span>`}</div></div>`;
  const rewardTxt = (c) => Object.entries(c.reward?.items || {}).map(([k, v]) => `${v} ${k}`).join(", ") || (c.reward?.coins ? `${fmt(c.reward.coins, 0)} coins` : "");
  return (board.length ? `<div class="grp">Tablero de tareas</div>${board.map((c) => row(c.name, NPC_ES(c.npc), c.p, c.progress, c.def?.amount, rewardTxt(c), c.done)).join("")}` : "") +
    (weekly.length ? `<div class="grp">Semanales</div>${weekly.map((c) => row(c.description, "", c.p, c.progress, c.requirement, "", c.done)).join("")}` : "") ||
    Empty("check", "Todo hecho", "No quedan tareas pendientes.");
}

function wBounties() {
  const m = missionModel();
  const list = m.bounties.slice().sort((a, b) => (b.profit ?? -Infinity) - (a.profit ?? -Infinity));
  const good = list.filter((b) => b.profit != null && b.profit > 0);
  setSub("ms-bounties", `${list.length} abiertos · ${good.length} rentables`);
  if (!list.length) return Empty("coin", "Sin bounties", "");
  const rewardTxt = (b) => [b.coins ? `${fmt(b.coins, 0)} coins` : "", b.sfl ? `${fmt(b.sfl, 2)} FLOWER` : "", ...Object.entries(b.items || {}).map(([k, v]) => `${v} ${k}`)].filter(Boolean).join(" + ");
  return `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Piden</th><th class="r">Tienes</th><th>Pagan</th><th class="r">Valor item</th><th class="r">Balance${Legend("profit")}</th></tr></thead><tbody>
    ${list.map((b) => `<tr><td><b>${esc(b.name)}</b>${b.isAnimal ? ` <span class="tag">animal nv ${b.level}</span>` : ""}</td>
      <td class="r ${b.have ? "" : "dim"}">${b.isAnimal ? "—" : fmt(b.have)}</td><td>${esc(rewardTxt(b))}</td>
      <td class="r dim">${b.itemVal != null ? fmt(b.itemVal) : "—"}</td>
      <td class="r">${b.profit != null ? `<span class="${b.profit >= 0 ? "up" : "down"}">${b.profit >= 0 ? "+" : ""}${fmt(b.profit, 2)}</span>` : `<span class="dim">${fmt(b.rewardValue, 2)}</span>`}</td></tr>`).join("")}
    </tbody></table></div><div class="mod-f"><span>Balance = recompensa − lo que sacarías vendiendo el item</span><span>animales: solo valor de la recompensa</span></div>`;
}

// Una vez: el valor de las coins pasa a ser automático (antes se escribía a mano en Misiones)
if (!readLS("coinRateAuto", false)) { S.coinRate = null; writeLS("coinRate", null); writeLS("coinRateAuto", true); }
