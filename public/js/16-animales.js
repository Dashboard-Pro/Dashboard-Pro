// SFL Console — Animales: tu gallinero y tu granero, qué necesita cada animal, cuánto da y si te sale rentable.
// Scripts clásicos que comparten el ámbito global en el orden de index.html (antes, un solo app.js).
"use strict";

/* ════════════════════════════════════════════════════════════════════════
   16. Animales
   ════════════════════════════════════════════════════════════════════════
   Reglas del juego (types/animals.ts, feedAnimal.ts → G.animals):
   · Cada toma gasta REQUIRED_FOOD_QTY comidas (gallina 1, oveja 3, vaca 5) y da la XP de esa comida según el nivel.
   · Al subir de nivel el animal produce (lo que da el nivel nuevo) y duerme 24 h; en el nivel máximo, cada ciclo de XP.
   · Enfermo: no come hasta curarlo con Barn Delight (5 Lemon + 3 Honey). Se puede vender en una bounty de su nivel. */

const ANIMAL_HOUSES = [["henHouse", "Gallinero"], ["barn", "Granero"], ["pigpen", "Pocilga"]];
const ANIMAL_ES = { Chicken: "Gallina", Cow: "Vaca", Sheep: "Oveja", Pig: "Cerdo" };
// Comida que gasta cada toma (feedAnimal: multiplicadores de coleccionables, ropa y skills); gratis con el animal dorado
const FEED_MULT = {
  all: [["skill:Efficient Feeding", 0.95]],
  Chicken: [["Fat Chicken", 0.9], ["Cluckulator", 0.75], ["skill:Clucky Grazing", 0.75]],
  Cow: [["Dr Cow", 0.95], ["skill:Cow-Smart Nutrition", 0.75], ["Infernal Bullwhip", 0.5]],
  Sheep: [["Mermaid Sheep", 0.95], ["skill:Sheepwise Diet", 0.75], ["Infernal Bullwhip", 0.5]],
};
const FREE_FEED = { Chicken: "Gold Egg", Cow: "Golden Cow", Sheep: "Golden Sheep" };

function animalLevel(type, xp) {
  const lv = G.animals?.levels?.[type] || {};
  let L = 0;
  for (const [k, v] of Object.entries(lv)) if (xp >= v) L = Math.max(L, Number(k));
  return L;
}
// XP que le falta para producir: hasta el nivel siguiente o, en el máximo, hasta completar el ciclo
function animalXpToGo(type, xp) {
  const lv = G.animals.levels[type], max = Math.max(...Object.keys(lv).map(Number));
  const L = animalLevel(type, xp);
  if (L < max) return { L, next: L + 1, toGo: lv[L + 1] - xp, step: lv[L + 1] - lv[L] };
  const cycle = lv[max] - lv[max - 1];
  const done = (xp - lv[max]) % cycle;
  return { L, next: max, toGo: cycle - done, step: cycle };
}

function animalModel() {
  const farm = store.farm.data.farm, t = now(), price = priceBook();
  const key = `${store.farm.at}|${store.activity?.at}|${S.visitH}|${Math.floor(now() / 60_000)}`;
  if (animalModel.c?.key === key) return animalModel.c.out;
  const own = ownedBoosts(farm), A = G.animals || {};
  const foodCost = (food) => {
    const direct = price(food).v;
    if (direct != null) return direct;
    const ing = A.foods?.[food]?.ingredients || {};
    let s = 0;
    for (const [k, q] of Object.entries(ing)) { const v = k === "Gem" ? flowerPerGem() : price(k).v; if (v == null) return null; s += v * q; }
    return s;
  };
  const cureCost = (() => {
    if (own.has("Oracle Syringe")) return 0;
    const alt = own.has("skill:Alternate Medicine") ? 1 : 0;
    if (price("Lemon").v == null || price("Honey").v == null) return null;
    const v = price("Lemon").v * (5 - alt) + price("Honey").v * (3 - alt);
    return v * (own.has("Medic Apron") ? 0.5 : 1);
  })();
  const bounties = (farm.bounties?.requests || []).filter((b) => b.level != null && !(farm.bounties.completed || []).some((c) => c.id === b.id));
  const houses = [];
  for (const [key2, label] of ANIMAL_HOUSES) {
    const h = farm[key2];
    if (!h?.animals || !Object.keys(h.animals).length) continue;
    const rows = Object.values(h.animals).map((a) => {
      const type = a.type, xp = toNum(a.experience);
      const g = animalXpToGo(type, xp);
      const foods = A.foodXp?.[type]?.[g.L] || {};
      const fav = Object.entries(foods).filter(([f]) => f !== "Omnifeed").sort((x, y) => y[1] - x[1])[0] || ["Hay", 10];
      const chonky = own.has("skill:Chonky Feed");
      const favXp = fav[1] * (chonky ? 2 : 1);
      // Las skills de comida cuentan a tu nivel (Efficient Feeding x0,95 → x0,925 en nivel 3)
      const mult = [...FEED_MULT.all, ...(FEED_MULT[type] || [])].reduce((m, [n, v]) => (own.has(n) ? m * (n.startsWith("skill:") ? skillValue(own, n.slice(6), v) : v) : m), 1) * (chonky ? 1.5 : 1);
      const free = own.has(FREE_FEED[type]);
      const qty = A.requiredQty?.[type] ?? 1;
      // Caricias (loveAnimal): mientras duerme, una a 1/3 y otra a 2/3 del sueño, con la herramienta que pide (a.item).
      // La XP que dan es comida que no hace falta. Por ciclo cuentan las que te deja tu ritmo de visitas (hasta 2).
      const awakeAt = toNum(a.awakeAt), asleepAt = toNum(a.asleepAt), lovedAt = toNum(a.lovedAt);
      const loveXp = (A.loveXp?.[a.item] ?? A.loveXp?.["Petting Hand"] ?? 25) + (type === "Cow" && own.has("Baby Cow") ? 10 : 0) + (type === "Sheep" && own.has("Spa Sheep") ? 5 : 0);
      const love = loveXp * (1 + (own.has("skill:Heartwarming Instruments") ? skillValue(own, "Heartwarming Instruments", 0.5) : 0));
      const sleepNow = awakeAt > asleepAt ? awakeAt - asleepAt : (A.sleepHours || 24) * 3600_000;
      const third = sleepNow / 3, nextLoveAt = Math.max(asleepAt + third, lovedAt + third);
      const asleepNow = a.state !== "sick" && awakeAt > t;
      const lovesLeft = asleepNow ? (nextLoveAt < awakeAt ? (nextLoveAt + third < awakeAt ? 2 : 1) : 0) : 0;
      const canLove = asleepNow && nextLoveAt <= t && nextLoveAt < awakeAt;
      const hasTool = !a.item || a.item === "Petting Hand" || haveOf(a.item) >= 1;
      const lovesCycle = Math.min(2, Math.floor(((A.sleepHours || 24) * 2) / 3 / Math.max(0.5, S.visitH)));
      const toGoAfter = Math.max(0, g.toGo - (hasTool ? lovesLeft * love : 0));
      const feedsNow = toGoAfter > 0 ? Math.max(1, Math.ceil(toGoAfter / favXp)) : 0;
      const feedsCycle = Math.max(0, Math.ceil(Math.max(0, g.step - lovesCycle * love) / favXp));
      const unit = free ? 0 : foodCost(fav[0]);
      // Lo que da al producir: lo del nivel al que llega + tus boosts (cantidad fija y %) de ese producto
      const drop = A.drops?.[type]?.[g.next] || {};
      const fxLine = { tags: ["animals", type], timeTags: ["animals", type], n: 1 };
      const produce = Object.entries(drop).map(([item, q]) => {
        const f = fxOn({ ...fxLine, tags: [...fxLine.tags, item] }, own);
        const amt = q + f.add;
        return { item, amt, v: price(item).v };
      });
      const value = produce.some((p) => p.v == null) ? null : produce.reduce((s, p) => s + p.v * p.amt, 0);
      const sleepH = (A.sleepHours || 24) / fxOn(fxLine, own).rate;
      const cycleCost = unit == null ? null : feedsCycle * qty * mult * unit;
      const perDay = cycleCost == null || value == null ? null : (24 / cycleH(sleepH, S.visitH)) * (value - cycleCost);
      const sick = a.state === "sick";
      const asleep = !sick && awakeAt > t, ready = a.state === "ready";
      const hungry = !sick && !asleep && !ready;
      const bounty = bounties.find((b) => b.name === type && Number(b.level) === g.L);
      const bountyValue = bounty ? toNum(bounty.coins) / coinRate() + toNum(bounty.sfl) + valueItems(bounty.items || {}).net : null;
      return { id: a.id, type, xp, ...g, fav: fav[0], favXp, feedsNow, feedsCycle, qty, mult, free, unit, produce, value, cycleCost, perDay, sleepH,
        awakeAt, sick, asleep, ready, hungry, lovedAt, item: a.item, bounty, bountyValue, love, lovesLeft, lovesCycle, nextLoveAt, canLove, hasTool, toGoAfter,
        foodNow: feedsNow * qty * mult };
    }).sort((x, y) => Number(y.sick) - Number(x.sick) || Number(y.hungry) - Number(x.hungry) || x.awakeAt - y.awakeAt);
    const perDay = rows.reduce((s, r) => s + (r.perDay ?? 0), 0);
    houses.push({ key: key2, label, level: toNum(farm.buildings?.[key2 === "henHouse" ? "Hen House" : key2 === "barn" ? "Barn" : "Pigpen"]?.[0]?.level) || null, rows, perDay });
  }
  const all = houses.flatMap((h) => h.rows);
  // Comida que falta para los que tienen hambre, agrupada por tipo
  const need = {};
  for (const r of all.filter((x) => x.hungry && !x.free)) need[r.fav] = (need[r.fav] || 0) + r.foodNow;
  const needs = Object.entries(need).map(([food, q]) => ({ food, q, have: haveOf(food), cost: foodCost(food) }));
  const out = { houses, all, needs, cureCost, perDay: houses.reduce((s, h) => s + h.perDay, 0) };
  animalModel.c = { key, out };
  return out;
}

function wAnimalKpis() {
  const m = animalModel();
  if (!m.all.length) return Empty("chicken", "Sin animales", "Esta granja no tiene gallinas, vacas ni ovejas.");
  const c = (f) => m.all.filter(f).length;
  return `<div class="kstrip">
    ${Kcell("Animales", fmt(m.all.length, 0), m.houses.map((h) => `${h.label} ${h.rows.length}`).join(" · "))}
    ${Kcell("Listos para recoger", fmt(c((a) => a.ready), 0), "producción esperando", c((a) => a.ready) ? "up" : "")}
    ${Kcell("Con hambre", fmt(c((a) => a.hungry), 0), "despiertos sin comer", c((a) => a.hungry) ? "sun" : "")}
    ${Kcell("Durmiendo", fmt(c((a) => a.asleep), 0), "producen al despertar y comer")}
    ${Kcell("Para acariciar", fmt(c((a) => a.canLove), 0), "ya puedes darles su caricia", c((a) => a.canLove) ? "sun" : "")}
    ${Kcell("Enfermos", fmt(c((a) => a.sick), 0), m.cureCost == null ? "Barn Delight sin precio" : `curar: ${fmt(m.cureCost, 3)} FLOWER cada uno`, c((a) => a.sick) ? "down" : "")}
    ${Kcell("Ganancia al día", `<span class="${tone(m.perDay)}">${signed(m.perDay, 2)}</span>`, "producción − comida")}
  </div>`;
}
function wAnimalNeeds() {
  const m = animalModel();
  if (!m.needs.length) return Empty("check", "Nadie tiene hambre", "Todos tus animales han comido, duermen o están enfermos.");
  return `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Comida</th><th class="r">Necesitas</th><th class="r">Tienes</th><th class="r">Faltan</th><th class="r">Coste de lo que falta</th></tr></thead><tbody>
    ${m.needs.map((n) => { const miss = Math.max(0, n.q - n.have); return `<tr><td>${Gi(n.food, 16)} ${esc(n.food)}</td><td class="r mono">${fmt(n.q, 2)}</td><td class="r mono">${fmt(n.have, 2)}</td>
      <td class="r mono ${miss ? "down" : "up"}">${miss ? fmt(miss, 2) : "—"}</td><td class="r mono">${miss && n.cost != null ? fmt(miss * n.cost, 3) : "—"}</td></tr>`; }).join("")}
  </tbody></table></div><div class="mod-f"><span>La comida favorita de cada animal para su nivel (la que más XP da), con tus boosts de comida</span><span>coste = ingredientes a precio P2P</span></div>`;
}
function animalAdvice(a, cure) {
  if (a.sick && (a.perDay == null || cure == null)) return `<span class="tag">enfermo</span><div class="ctx">sin precios para decidir</div>`;
  if (a.sick) {
    if (a.perDay != null && a.perDay <= 0) return `<span class="tag red">no la cures</span><div class="ctx">pierde ${fmt(-a.perDay, 3)}/día · ${a.bounty ? `véndela: bounty ${fmt(a.bountyValue, 2)} FLOWER` : "véndela en una bounty de nivel " + a.L}</div>`;
    return `<span class="tag sun">cúrala</span><div class="ctx">${fmt(cure, 3)} FLOWER · se paga en ${a.perDay > 0 ? fmt(cure / a.perDay, 1) + " d" : "—"}</div>`;
  }
  if (a.bounty && a.bountyValue != null && a.perDay != null && a.bountyValue > a.perDay * 30) return `<span class="tag blue">bounty ${fmt(a.bountyValue, 2)}</span><div class="ctx">vale más que 30 días produciendo</div>`;
  if (a.perDay != null && a.perDay < 0) return `<span class="tag red">pierde</span><div class="ctx">la comida cuesta más que lo que da</div>`;
  return "";
}
function wAnimalHouses() {
  const m = animalModel();
  if (!m.houses.length) return Empty("chicken", "Sin animales", "");
  return m.houses.map((h) => `<div class="grp">${esc(h.label)} · ${h.rows.length} animales · <span class="${tone(h.perDay)}">${signed(h.perDay, 3)}</span> FLOWER al día</div>${animalHouseTable(h, m)}`).join("");
}
function animalHouseTable(h, m) {
  const t = now();
  return `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Animal</th><th>Estado</th><th class="r" data-tip="Para producir|XP que le falta para subir de nivel (o completar el ciclo en el máximo) y cuánta comida es|" tabindex="0">Para producir</th>
    <th class="r">Da al producir</th><th class="r">Comida del ciclo</th><th class="r">Al día${Legend("profit")}</th><th>Consejo</th></tr></thead><tbody>
    ${h.rows.map((a) => {
      const state = a.sick ? `<span class="tag red">enfermo</span>` : a.ready ? `<span class="tag green">listo</span>` : a.asleep ? `<span class="tag">duerme</span> <span class="ctx">${dur(a.awakeAt - t)}</span>` : `<span class="tag sun">con hambre</span>`;
      const prod = a.produce.map((p) => `${Gi(p.item, 14)} ${fmt(p.amt, 2)}`).join(" ") || "—";
      return `<tr><td>${Gi(a.type, 18)} ${ANIMAL_ES[a.type] || a.type} <span class="dim">nv ${a.L}</span></td><td>${state}</td>
        <td class="r mono">${fmt(a.toGo, 0)} XP${a.lovesLeft ? `<div class="ctx${a.canLove ? " sun-t" : ""}">${a.canLove ? "caricia ya" : `caricia en ${dur(a.nextLoveAt - t)}`}: +${fmt(a.love, 0)} XP · ${esc(a.item || "Petting Hand")}${a.hasTool ? "" : " (no la tienes)"}</div>` : ""}
          <div class="ctx">${a.free ? "come gratis" : a.feedsNow ? `${a.lovesLeft && a.hasTool ? "luego " : ""}${fmt(a.foodNow, 2)} ${esc(a.fav)}` : "le bastan las caricias"}</div></td>
        <td class="r mono">${prod}<div class="ctx">${a.value == null ? "sin precio" : `${fmt(a.value, 3)} FLOWER`}</div></td>
        <td class="r mono">${a.cycleCost == null ? "—" : fmt(a.cycleCost, 3)}<div class="ctx">${a.feedsCycle} toma${a.feedsCycle > 1 ? "s" : ""} × ${a.qty}${a.mult !== 1 ? ` × ${fmt(a.mult, 2)}` : ""}</div></td>
        <td class="r mono ${tone(a.perDay)}"><b>${a.perDay == null ? "—" : signed(a.perDay, 3)}</b></td><td>${animalAdvice(a, m.cureCost)}</td></tr>`;
    }).join("")}</tbody></table></div>
    <div class="mod-f"><span>Un ciclo = de un nivel al siguiente con su comida favorita; duerme ${fmt(h.rows[0]?.sleepH ?? 24, 1)} h y lo recoges según tu ritmo (cada ${S.visitH} h)</span><span>con ${h.rows[0]?.lovesCycle ?? 0} caricia${h.rows[0]?.lovesCycle === 1 ? "" : "s"} por noche (lo que te deja tu ritmo) · sin animales mutantes</span></div>`;
}

PAGES.animals = function animals() {
  $("#page").innerHTML = `
    <div class="plate">${Mod({ id: "an-k", span: 12, flush: true })}</div>
    <div class="plate">${Mod({ id: "an-needs", span: 12, title: "Comida para los que tienen hambre", icon: "cook", flush: true })}</div>
    <div class="plate">${Mod({ id: "an-houses", span: 12, title: "Tus animales", icon: "chicken", flush: true })}</div>`;
  const deps = { deps: ["farm", "activity"], loading: "rows" };
  mount("an-k", { ...deps, render: wAnimalKpis, loading: "block" });
  mount("an-needs", { ...deps, render: wAnimalNeeds });
  mount("an-houses", { ...deps, render: wAnimalHouses });
};
PAGE_META.animals = { title: "Animales", sub: () => `${staleNote()}Tu gallinero y tu granero: qué necesita cada animal, cuánto da con tus boosts y si te sale rentable` };
