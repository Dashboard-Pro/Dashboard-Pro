// SFL Console — Cantidades por cosecha y por golpe con TUS boosts, siguiendo las fórmulas del juego (sin sfl.world):
// chop.ts getWoodDropAmount, stoneMine.ts / ironMine.ts / mineGold.ts / mineCrimstone.ts, drillOilReserve.ts
// getOilDropAmount, harvest.ts getCropYieldAmount (+ getMultiplicativeCropYield), fruitHarvested.ts getFruitYield y
// harvestGreenHouse.ts getGreenhouseCropYieldAmount. Las probabilidades (prngChance) cuentan por su valor esperado: "avg";
// "min" = sin suerte y "max" = con toda. Las zonas de efecto se miran parcela a parcela / nodo a nodo (isWithinAOE) y se
// promedia. Fuera: abonos y enjambres (son de cada siembra) y eventos del calendario (son de un día).
// Da el mismo formato que daba sfl.world (/v1/land/:id): { resources: { wood: { min, max, avg } }, crops, fruits, greenhouse }.
"use strict";

const YIELD_FACTION = { bumpkins: ["Bumpkin Shield", "Bumpkin Quiver"], goblins: ["Goblin Shield", "Goblin Quiver"],
  nightshades: ["Nightshade Shield", "Nightshade Quiver"], sunflorians: ["Sunflorian Shield", "Sunflorian Quiver"] };
const YIELD_ISLANDS = ["basic", "spring", "desert", "volcano"]; // ISLAND_EXPANSIONS: lo que va después cuenta como volcán o más
const FULL_MOON_FRUITS = ["Celestine", "Lunara", "Duskberry"];

// Lo que tiene la granja, como lo mira el juego (isCollectibleBuilt, isCollectibleOnFarm, isWearableActive…)
function yieldCtx(farm) {
  const t = now(), skills = farm.bumpkin?.skills || {};
  const ready = (it) => it && it.coordinates && toNum(it.readyAt) <= t && !it.used;
  const groups = [farm.collectibles, farm.home?.collectibles, ...Object.values(farm.interior || {}).map((l) => l?.collectibles)];
  const builtSet = new Set();
  for (const g of groups) for (const [k, list] of Object.entries(g || {})) if ((list || []).some(ready)) builtSet.add(k);
  for (const [k, list] of Object.entries(farm.petHouse?.pets || {})) if ((list || []).some(ready)) builtSet.add(k);
  const worn = new Set([...Object.values(farm.bumpkin?.equipped || {}), ...Object.values(farm.farmHands?.bumpkins || {}).flatMap((b) => Object.values(b?.equipped || {}))]);
  const lvl = (n) => Math.min(3, Math.max(0, Math.round(toNum(skills[n]))));
  const isle = farm.island?.type || "basic";
  const isleIdx = YIELD_ISLANDS.indexOf(isle);
  const buffOn = (n) => { const b = farm.buffs?.[n]; return Boolean(b) && toNum(b.startedAt) <= t && t < toNum(b.startedAt) + toNum(b.durationMS); };
  // Buds colocados: el mejor para cada recurso (getBudYieldBoosts)
  const buds = Object.values(farm.buds || {}).filter((b) => b?.coordinates);
  return {
    farm, skills,
    built: (n) => builtSet.has(n),
    onFarm: (n) => (farm.collectibles?.[n] || []).some(ready),
    at: (n) => (farm.collectibles?.[n] || []).find(ready)?.coordinates || null,
    worn: (n) => worn.has(n),
    inv: (n) => toNum(farm.inventory?.[n]) >= 1,
    lvl,
    rank: (n, kind = "ranks") => { const l = lvl(n); if (!l) return 0; const a = kind === "ranks" ? G.skills?.[n]?.ranks : G.skills?.[n]?.rankFx?.[kind]; return toNum(a?.[l - 1]); },
    temp: (n) => typeof tempActiveNow === "function" && tempActiveNow(farm, n),
    buff: buffOn,
    faction: YIELD_FACTION[farm.faction?.name] || null,
    volcano: isleIdx < 0 || isleIdx >= YIELD_ISLANDS.indexOf("volcano"),
    season: farm.season?.season || null,
    bud: (resource) => buds.reduce((best, b) => Math.max(best, budBoost(b, resource)), 0),
  };
}

// getBudYieldBoosts: (tipo + tallo) × aura, el mejor bud colocado
const cropKind = (n) => (G.crops?.[n] == null ? null : G.crops[n] <= G.crops.Pumpkin ? "basic" : G.crops[n] >= G.crops.Eggplant ? "advanced" : "medium");
const isPatchFruit = (n) => n in (G.fruitSeedOf || {});
const isGhFruit = (n) => n in (G.greenhouseFruitSeedOf || {});
const isFruitY = (n) => isPatchFruit(n) || isGhFruit(n);
function budBoost(bud, r) {
  const mineral = ["Stone", "Iron", "Gold"].includes(r), plot = G.crops?.[r] != null, kind = cropKind(r), crop = plot || r in (G.greenhouseCrops || {});
  const type = bud.type, stem = bud.stem;
  const animal = ["Egg", "Feather", "Wool", "Merino Wool", "Milk", "Leather"].includes(r);
  let tb = 0;
  if (mineral && type === "Cave") tb = 0.2;
  else if (plot && kind === "basic" && type === "Plaza") tb = 0.3;
  else if (plot && kind === "medium" && type === "Castle") tb = 0.3;
  else if (plot && kind === "advanced" && type === "Snow") tb = 0.3;
  else if (r === "Wood" && type === "Woodlands") tb = 0.2;
  else if (animal && type === "Retreat") tb = 0.2;
  else if (isFruitY(r) && type === "Beach") tb = 0.2;
  let sb = 0;
  if (crop && stem === "3 Leaf Clover") sb = 0.5;
  else if (plot && kind === "basic" && stem === "Basic Leaf") sb = 0.2;
  else if (r === "Carrot" && stem === "Carrot Head") sb = 0.3;
  else if (r === "Sunflower" && stem === "Sunflower Hat") sb = 0.5;
  else if (mineral && stem === "Diamond Gem") sb = 0.2;
  else if (r === "Stone" && stem === "Ruby Gem") sb = 0.2;
  else if (r === "Iron" && stem === "Miner Hat") sb = 0.2;
  else if (r === "Gold" && stem === "Gold Gem") sb = 0.2;
  else if (r === "Wood" && stem === "Acorn Hat") sb = 0.1;
  else if (r === "Wood" && stem === "Tree Hat") sb = 0.2;
  else if (isFruitY(r) && stem === "Banana") sb = 0.2;
  else if (isFruitY(r) && stem === "Apple Head") sb = 0.2;
  else if (r === "Egg" && stem === "Egg Head") sb = 0.2;
  const aura = { Basic: 1.05, Green: 1.2, Rare: 2, Mythical: 5 }[bud.aura] || 1;
  return Number((aura * (tb + sb)).toFixed(4));
}

// isWithinAOE (collisionDetection.ts): ¿la casilla de arriba a la izquierda del objeto afectado cae en la zona?
function aoeHits(name, pos, ex, ey, skills) {
  const [w, h] = G.itemDims?.[name] || [1, 1];
  const { x, y } = pos;
  const inRect = (x0, y0, x1, y1) => ex >= x0 && ex <= x1 && ey <= y0 && ey >= y1;
  if (name === "Basic Scarecrow" || name === "Scary Mike" || name === "Laurie the Chuckle Crow") {
    const sk = { "Basic Scarecrow": "Chonky Scarecrow", "Scary Mike": "Horror Mike", "Laurie the Chuckle Crow": "Laurie's Gains" }[name];
    const r = Math.min(3, toNum(skills?.[sk]));
    const e = r ? AOE_RANK[r - 1] : { xLeft: 1, xRight: 1, depth: 3 };
    return inRect(x - e.xLeft, y - h, x + e.xRight, y - h - (e.depth - 1));
  }
  if (name === "Emerald Turtle" || name === "Tin Turtle") { const dx = x - ex, dy = y - ey; return Math.abs(dx) <= 1 && Math.abs(dy) <= 1 && (dx || dy); }
  if (name === "Sir Goldensnout") { const dx = ex - x, dy = ey - y; return dx >= -1 && dx <= w && dy <= 1 && dy >= -h; }
  if (name === "Queen Cornelia") return inRect(x - 1, y + 1, x + w, y - h);
  if (name === "Gnome") return ex === x && ey === y - 1;
  return false;
}
// Suma por zona de efecto si el objeto está en la granja y la casilla cae dentro
const aoeAdd = (c, name, node, v) => { const p = node && c.at(name); return p && node.x != null && aoeHits(name, p, toNum(node.x), toNum(node.y), c.skills) ? v : 0; };

// Valor de una probabilidad (en %) según el modo: avg = valor esperado, min = nunca, max = siempre
const pOf = (mode, pct) => (mode === "min" ? 0 : mode === "max" ? (pct > 0 ? 1 : 0) : pct / 100);
const tierAdd = (node) => (node?.tier === 3 ? 2.5 : node?.tier === 2 ? 0.5 : 0);

// ── Madera (getWoodDropAmount) ──
function yWood(c, tree, mode) {
  let a = 1;
  if (c.built("Woody the Beaver") || c.built("Apprentice Beaver") || c.built("Foreman Beaver")) a *= 1.2;
  if (c.inv("Discord Mod")) a *= 1.35;
  if (c.inv("Lumberjack")) a *= 1.1;
  if (c.lvl("Tough Tree")) a *= 1 + 2 * pOf(mode, c.rank("Tough Tree"));
  a += c.rank("Lumberjack's Extra");
  if (c.built("Wood Nymph Wendy")) a += 0.2;
  if (c.built("Tiki Totem")) a += 0.1;
  if (c.built("Squirrel")) a += 0.1;
  if (c.faction && c.worn(c.faction[0])) a += 0.25;
  a += pOf(mode, 20); // nativo: 1 de cada 5 golpes da +1
  if (c.temp("Legendary Shrine")) a += 1;
  a += c.bud("Wood");
  a *= toNum(tree?.multiplier) || 1;
  return a + tierAdd(tree);
}
// ── Piedra (getStoneDropAmount) ──
function yStone(c, rock, mode) {
  let a = 1;
  if (c.built("Rock Golem")) a += 2 * pOf(mode, 10);
  if (c.inv("Prospector")) a += 0.2;
  if (c.built("Tunnel Mole")) a += 0.25;
  if (c.built("Stone Beetle")) a += 0.1;
  a += c.rank("Rock'N'Roll") + c.rank("Rocky Favor", "buff") - c.rank("Ferrous Favor", "debuff");
  a += pOf(mode, 20);
  a += aoeAdd(c, "Emerald Turtle", rock, 0.5) + aoeAdd(c, "Tin Turtle", rock, 0.1);
  if (c.faction && c.worn(c.faction[0])) a += 0.25;
  if (c.temp("Legendary Shrine")) a += 1;
  a += c.bud("Stone");
  if (c.volcano) a += 0.1;
  a *= toNum(rock?.multiplier) || 1;
  return a + tierAdd(rock);
}
// ── Hierro (getIronDropAmount) ──
function yIron(c, rock, mode) {
  let a = 1;
  if (c.built("Rocky the Mole")) a += 0.25;
  if (c.built("Radiant Ray")) a += 0.1;
  if (c.built("Iron Idol")) a += 1;
  if (c.built("Iron Beetle")) a += 0.1;
  a += c.rank("Iron Bumpkin") - c.rank("Rocky Favor", "debuff") + c.rank("Ferrous Favor", "buff");
  a += pOf(mode, 20);
  a += aoeAdd(c, "Emerald Turtle", rock, 0.5);
  if (c.faction && c.worn(c.faction[0])) a += 0.25;
  a += c.bud("Iron");
  if (c.volcano) a += 0.1;
  a *= toNum(rock?.multiplier) || 1;
  return a + tierAdd(rock);
}
// ── Oro (getGoldDropAmount) ──
function yGold(c, rock, mode) {
  let a = 1;
  if (c.inv("Gold Rush")) a += 0.5;
  a += c.rank("Golden Touch");
  a += pOf(mode, 20);
  if (c.built("Nugget")) a += 0.25;
  if (c.built("Gilded Swordfish")) a += 0.1;
  if (c.built("Gold Beetle")) a += 0.1;
  a += aoeAdd(c, "Emerald Turtle", rock, 0.5);
  if (c.faction && c.worn(c.faction[0])) a += 0.25;
  a += c.bud("Gold");
  if (c.volcano) a += 0.1;
  a *= toNum(rock?.multiplier) || 1;
  return a + tierAdd(rock);
}
// ── Crimstone (getCrimstoneDropAmount): la última de cada 5 picadas da el extra ──
function yCrim(c, rock, mode) {
  let a = 1;
  if (c.built("Crimson Carp")) a += 0.05;
  if (c.built("Crim Peckster")) a += 0.1;
  if (c.worn("Crimstone Armor")) a += 0.1;
  const last = (c.worn("Crimstone Hammer") ? 2 : 0) + c.rank("Fire Kissed") + 2;
  return a + (mode === "min" ? 0 : mode === "max" ? last : last / 5);
}
// ── Petróleo (getOilDropAmount): base 10 y +20 cada tercera perforación ──
function yOil(c, reserve, mode) {
  let a = 10;
  const bonus = 20 + (c.temp("Stag Shrine") ? 15 : 0);
  a += mode === "min" ? 0 : mode === "max" ? bonus : bonus / 3;
  if (c.built("Battle Fish")) a += 0.05;
  if (c.built("Knight Chicken")) a += 0.1;
  if (c.worn("Oil Can")) a += 2;
  if (c.worn("Oil Overalls")) a += 10;
  a += c.rank("Oil Extraction");
  if (c.worn("Oil Gallon")) a += 5;
  return a;
}

// ── Cultivos (getMultiplicativeCropYield + getCropYieldAmount); plot = parcela (null en invernadero / Crop Machine) ──
function yCrop(c, crop, plot, mode) {
  let a = 1;
  // Multiplicadores
  if (c.worn("Green Amulet")) a *= 1 + 9 * pOf(mode, 10);
  if (crop === "Cauliflower" && c.built("Golden Cauliflower")) a *= 2;
  if (crop === "Carrot" && c.built("Easter Bunny")) a *= 1.2;
  if (crop === "Pumpkin" && c.built("Victoria Sisters")) a *= 1.2;
  if (crop === "Parsnip" && c.worn("Parsnip")) a *= 1.2;
  if (crop === "Beetroot" && c.worn("Beetroot Amulet")) a *= 1.2;
  if (crop === "Sunflower" && c.worn("Sunflower Amulet")) a *= 1.1;
  if (c.built("Scarecrow") || c.built("Kuebiko")) a *= 1.2;
  if (c.inv("Coder")) a *= 1.2;
  // Sumas
  if (c.buff("Power hour")) a += 0.2;
  if (crop === "Potato" && c.built("Peeled Potato")) a += pOf(mode, 20);
  if (crop === "Potato" && c.built("Potent Potato")) a += 10 * pOf(mode, 10 / 3);
  if (crop === "Sunflower" && c.built("Stellar Sunflower")) a += 10 * pOf(mode, 10 / 3);
  if (crop === "Radish" && c.built("Radical Radish")) a += 10 * pOf(mode, 10 / 3);
  if (crop === "Cabbage") { if (c.built("Cabbage Boy")) a += 0.25 + (c.built("Cabbage Girl") ? 0.25 : 0); else if (c.built("Karkinos")) a += 0.1; }
  if (crop === "Carrot" && c.built("Pablo The Bunny")) a += 0.1;
  if (crop === "Kale" && c.built("Foliant")) a += 0.2;
  if (crop === "Eggplant" && c.built("Purple Trail")) a += 0.2;
  if (crop === "Eggplant" && c.built("Maximus")) a += 1;
  if (crop === "Eggplant" && c.worn("Eggplant Onesie")) a += 0.1;
  if (crop === "Artichoke" && c.built("Giant Artichoke")) a += 2;
  if (crop === "Yam" && c.built("Giant Yam")) a += 0.5;
  if (crop === "Soybean" && c.worn("Tofu Mask")) a += 0.1;
  if (crop === "Corn" && c.worn("Corn Onesie")) a += 0.1;
  if (crop === "Corn" && c.worn("Corn Silk Hair")) a += 2;
  if (crop === "Wheat" && c.worn("Sickle")) a += 2;
  if (crop === "Barley" && c.built("Sheaf of Plenty")) a += 2;
  if (crop === "Kale" && c.built("Giant Kale")) a += 2;
  const inSeason = (s) => c.season === s && (G.seasonalSeeds?.[s] || []).includes(`${crop} Seed`);
  const ghCrop = crop in (G.greenhouseCrops || {});
  if (!ghCrop && inSeason("spring") && c.worn("Blossom Ward")) a += 1;
  if (!ghCrop && inSeason("winter") && c.worn("Frozen Heart")) a += 1;
  if (c.worn("Infernal Pitchfork")) a += 3;
  if (c.temp("Legendary Shrine")) a += 1;
  if (c.faction && c.worn(c.faction[1])) a += 0.25;
  a += c.bud(crop);
  const kind = cropKind(crop), secs = G.crops?.[crop] ?? G.greenhouseCrops?.[crop];
  const overnight = G.crops?.[crop] != null ? secs >= G.crops.Radish : secs >= 86400 && secs <= 129600;
  if (overnight && c.built("Hoot")) a += 0.5;
  if (plot && kind === "medium") a += aoeAdd(c, "Scary Mike", plot, Math.round((0.2 + c.rank("Horror Mike", "aoeYield")) * 100) / 100);
  if (plot && kind === "basic" && c.rank("Chonky Scarecrow", "aoeYield") > 0) a += aoeAdd(c, "Basic Scarecrow", plot, c.rank("Chonky Scarecrow", "aoeYield"));
  if (plot && kind) a += aoeAdd(c, "Sir Goldensnout", plot, 0.5);
  if (plot && kind === "advanced") a += aoeAdd(c, "Laurie the Chuckle Crow", plot, Math.round((0.2 + c.rank("Laurie's Gains", "aoeYield")) * 100) / 100);
  if (plot && crop === "Corn") a += aoeAdd(c, "Queen Cornelia", plot, 1);
  if (plot && (kind === "medium" || kind === "advanced") && c.onFarm("Cobalt") && c.onFarm("Clementine")) {
    const g = c.at("Gnome"), co = c.at("Cobalt"), cl = c.at("Clementine");
    if (g && co && cl && co.y === g.y && co.x + 1 === g.x && cl.y === g.y && cl.x - 1 === g.x) a += aoeAdd(c, "Gnome", plot, 10);
  }
  if (crop === "Corn" && c.built("Poppy")) a += 0.1;
  if (crop === "Pumpkin" && c.built("Freya Fox")) a += 0.5;
  if (crop === "Carrot" && c.built("Lab Grown Carrot")) a += 0.2;
  if (crop === "Pumpkin" && c.built("Lab Grown Pumpkin")) a += 0.3;
  if (crop === "Radish" && c.built("Lab Grown Radish")) a += 0.4;
  if (crop === "Soybean" && c.built("Soybliss")) a += 1;
  if (kind === "basic") a += c.rank("Young Farmer");
  if (kind === "medium") a += c.rank("Experienced Farmer");
  if (kind === "advanced") a += c.rank("Old Farmer");
  if (c.lvl("Acre Farm")) { if (kind === "advanced") a += c.rank("Acre Farm", "buff"); if (kind === "medium" || kind === "basic") a -= c.rank("Acre Farm", "debuff"); }
  if (c.lvl("Hectare Farm")) { if (kind === "medium" || kind === "basic") a += c.rank("Hectare Farm", "buff"); if (kind === "advanced") a -= c.rank("Hectare Farm", "debuff"); }
  if (crop === "Onion" && c.built("Giant Onion")) a += 3;
  return a;
}
// ── Frutas (getFruitYield) ──
function yFruit(c, name, mode) {
  // Ojo: en fruitHarvested.ts "isFruit" es solo fruta de parcela (la uva del invernadero no cuenta; en los buds sí)
  let a = 1;
  if (c.lvl("Generous Orchard") && isPatchFruit(name)) a += pOf(mode, c.rank("Generous Orchard"));
  if (name === "Apple" && c.built("Lady Bug")) a += 0.25;
  if (name === "Blueberry" && c.built("Black Bearry")) a += 1;
  if (isPatchFruit(name) && FULL_MOON_FRUITS.includes(name) && c.worn("Moon Hair")) a += 0.5;
  if (isPatchFruit(name) && c.built("Macaw")) a += c.lvl("Loyal Macaw") ? c.rank("Loyal Macaw") : 0.1;
  if (isPatchFruit(name) && c.worn("Camel Onesie")) a += 0.1;
  if (["Apple", "Orange", "Blueberry", "Banana"].includes(name) && c.worn("Fruit Picker Apron")) a += 0.1;
  if (isPatchFruit(name)) a += c.rank("Fruitful Fumble");
  if (c.faction && c.worn(c.faction[1])) a += 0.25;
  if (name === "Banana" && c.worn("Banana Amulet")) a += 0.5;
  if (name === "Banana" && c.built("Banana Chicken")) a += 0.1;
  if (name === "Lemon" && c.built("Lemon Shark")) a += 0.2;
  if (name === "Lemon" && c.worn("Lemon Shield")) a += 1;
  if (name === "Lemon" && c.built("Reveling Lemon")) a += 0.25;
  if (name === "Tomato" && c.built("Tomato Bombard")) a += 1;
  a += c.bud(name);
  if (name === "Grape" && c.built("Vinny")) a += 0.25;
  if (name === "Grape" && c.built("Grape Granny")) a += 1;
  if (name === "Grape" && c.worn("Grape Pants")) a += 0.2;
  if (c.lvl("Zesty Vibes") && !isGhFruit(name)) a += name === "Tomato" || name === "Lemon" ? c.rank("Zesty Vibes", "buff") : -c.rank("Zesty Vibes", "debuff");
  if (c.temp("Legendary Shrine")) a += 1;
  return a;
}
// ── Invernadero (getGreenhouseCropYieldAmount) ──
function yGreenhouse(c, name, mode) {
  let a;
  if (name in (G.greenhouseCrops || {})) {
    a = yCrop(c, name, null, mode);
    if (name === "Olive" && c.worn("Olive Royalty Shirt")) a += 0.25;
    if (name === "Olive" && c.worn("Olive Shield")) a += 1;
    if (name === "Rice" && c.worn("Non La Hat")) a += 1;
    if (name === "Rice" && c.built("Rice Panda")) a += 0.25;
    if (name === "Rice" && c.worn("Rice Shirt")) a += 1;
  } else a = yFruit(c, name, mode);
  if (c.lvl("Greenhouse Gamble")) a += pOf(mode, c.rank("Greenhouse Gamble"));
  if (c.built("Pharaoh Gnome")) a += 2;
  a += c.rank("Glass Room") + c.rank("Seeded Bounty") + c.rank("Greasy Plants", "yield");
  return a;
}

// Media (y mín/máx) sobre todos tus nodos o parcelas: cada uno con su multiplicador, nivel y zonas de efecto
const placedNodesOf = (obj) => Object.values(obj || {}).filter((n) => n && !n.removedAt && n.x != null);
function spread(fn, nodes) {
  const list = nodes.length ? nodes : [null];
  const one = (mode) => list.reduce((s, n) => s + fn(n, mode), 0) / list.length;
  const r = (v) => Number(v.toFixed(4));
  return { min: r(Math.min(...list.map((n) => fn(n, "min")))), max: r(Math.max(...list.map((n) => fn(n, "max")))), avg: r(one("avg")) };
}
function farmYields(farm) {
  const c = yieldCtx(farm);
  const plots = placedNodesOf(farm.crops);
  const lc = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    resources: {
      wood: spread((n, m) => yWood(c, n, m), placedNodesOf(farm.trees)),
      stone: spread((n, m) => yStone(c, n, m), placedNodesOf(farm.stones)),
      iron: spread((n, m) => yIron(c, n, m), placedNodesOf(farm.iron)),
      gold: spread((n, m) => yGold(c, n, m), placedNodesOf(farm.gold)),
      crimstone: spread((n, m) => yCrim(c, n, m), placedNodesOf(farm.crimstones)),
      oil: spread((n, m) => yOil(c, n, m), placedNodesOf(farm.oilReserves)),
      sunstone: { min: 1, max: 1, avg: 1 },
    },
    crops: lc(Object.fromEntries(Object.keys(G.crops || {}).map((n) => [n, spread((p, m) => yCrop(c, n, p, m), plots)]))),
    fruits: lc(Object.fromEntries(Object.keys(G.fruitSeedOf || {}).map((n) => [n, spread((_, m) => yFruit(c, n, m), [])]))),
    greenhouse: lc(Object.fromEntries([...Object.keys(G.greenhouseCrops || {}), ...Object.keys(G.greenhouseFruitSeedOf || {})].map((n) => [n, spread((_, m) => yGreenhouse(c, n, m), [])]))),
    source: "game",
  };
}

// Para los tests en Node (tools/check.js): ahí G, toNum, now… se definen como globales antes de cargarlo
if (typeof module !== "undefined") module.exports = { farmYields, yieldCtx, aoeHits };
