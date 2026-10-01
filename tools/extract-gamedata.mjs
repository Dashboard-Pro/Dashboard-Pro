// Genera public/gamedata.js a partir del código fuente del juego.
// Uso:
//   node tools/extract-gamedata.mjs --online      → descarga lo necesario del repo oficial (recomendado)
//   node tools/extract-gamedata.mjs [ruta]        → usa una copia local de sunflower-land-main
//   … --out <archivo>                              → escribe en ese archivo en vez de public/gamedata.js
// Solo se leen ~20 archivos de texto (tipos y constantes); no se ejecuta nada del juego.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

const REPO_RAW = "https://raw.githubusercontent.com/sunflower-land/sunflower-land/main/";
const NEEDED = [
  "types/crops.ts", "types/fruits.ts", "types/flowers.ts", "lib/constants.ts", "lib/level.ts",
  "types/index.ts", "types/bumpkin.ts", "types/bumpkinSkills.ts", "types/chapters.ts", "types/choreBoard.ts",
  "types/seeds.ts", "types/tools.ts", "types/consumables.ts",
  "events/landExpansion/drillOilReserve.ts", "events/landExpansion/choseSkill.ts", "events/landExpansion/deliver.ts",
  "events/landExpansion/completeNPCChore.ts", "events/landExpansion/exchangeSFLtoCoins.ts", "actions/tradeLimits.ts",
  "types/craftables.ts", "types/decorations.ts", "types/flags.ts", "types/beds.ts",
  "types/collectibleItemBuffs.ts", "types/bumpkinItemBuffs.ts",
  "types/expansions.ts", "events/landExpansion/upgradeFarm.ts", "types/images.ts",
  "types/pets.ts", "lib/factionRanks.ts", "events/landExpansion/joinFaction.ts", "types/desert.ts", "types/treasure.ts",
  "events/landExpansion/plantGreenhouse.ts", "events/landExpansion/supplyCropMachine.ts",
  "types/animals.ts", "events/landExpansion/feedAnimal.ts", "types/buildings.ts", "types/chests.ts", "types/fishing.ts", "types/game.ts",
  "types/megastore.ts", "types/tracks.ts", "types/collections.ts", "types/chapterMutants.ts", "lib/crafting.ts", "types/factionShop.ts",
  "types/withdrawables.ts", "events/landExpansion/upgradeBuilding.ts", "types/composters.ts", "events/landExpansion/startLavaPit.ts",
  "types/floatingIsland.ts", "types/collectibles.ts", "types/calendar.ts", "events/landExpansion/buyResource.ts", "types/gifts.ts",
].map((f) => `src/features/game/${f}`).concat(["src/lib/i18n/dictionaries/es.json", "src/lib/i18n/dictionaries/en.json", "src/features/pets/data/pets-nfts.ts",
  "src/assets/sunnyside.ts", "src/features/island/plots/lib/plant.ts", "src/features/island/delivery/lib/delivery.ts"]);

async function downloadSources(dest) {
  console.log(`Descargando ${NEEDED.length} archivos de github.com/sunflower-land/sunflower-land (main)…`);
  for (const rel of NEEDED) {
    const r = await fetch(REPO_RAW + rel);
    if (!r.ok) throw new Error(`${rel}: HTTP ${r.status}`);
    const file = path.join(dest, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, await r.text());
  }
}

const online = process.argv.includes("--online");
const srcRoot = online ? path.join(root, ".gamesrc") : path.resolve(process.argv[2] || path.join(root, ".gamesrc"));
if (online) await downloadSources(srcRoot);
const gameSrc = path.join(srcRoot, "src/features/game");

const read = (rel) => fs.readFileSync(path.join(gameSrc, rel), "utf8");

// Devuelve el cuerpo de `export const NAME ... = {` hasta la `};` de cierre en columna 0.
function block(src, name) {
  const start = src.search(new RegExp(`^(?:export )?const ${name}\\b`, "m"));
  if (start < 0) throw new Error(`No encuentro ${name}`);
  const open = src.indexOf("= {", start) + 2;
  return src.slice(open + 1, src.indexOf("\n};", open));
}

// Evalúa expresiones aritméticas simples tipo `32 * 60 * 60`.
function num(expr) {
  const e = expr.trim().replace(/_/g, "");
  if (!/^[\d\s*+\-/().]+$/.test(e)) return undefined;
  return Function(`"use strict";return (${e})`)();
}

// Entradas de primer nivel `  "Key": {` / `  Key: {` con un campo concreto dentro.
function entriesWithField(body, field) {
  const out = {};
  const re = /^ {2}(?:"([^"]+)"|([A-Za-z0-9_]+)):\s*{([\s\S]*?)^ {2}},?/gm;
  let m;
  while ((m = re.exec(body))) {
    const key = m[1] ?? m[2];
    const f = m[3].match(new RegExp(`\\b${field}:\\s*([^,\\n]+)`));
    if (!f) continue;
    const raw = f[1].trim();
    out[key] = raw.startsWith('"') ? raw.slice(1, -1) : num(raw);
  }
  return out;
}

// Mapas planos `  "Name": 123,`
function flatIds(body) {
  const out = {};
  for (const m of body.matchAll(/^ {2}(?:"([^"]+)"|([A-Za-z0-9_]+)):\s*([\d_]+),?\s*$/gm)) {
    out[m[1] ?? m[2]] = Number(m[3].replace(/_/g, ""));
  }
  return out;
}

function constSeconds(src, name) {
  const m = src.match(new RegExp(`export const ${name}\\s*=\\s*([^;]+);`));
  if (!m) throw new Error(`No encuentro ${name}`);
  return num(m[1]);
}

const crops = read("types/crops.ts");
const fruits = read("types/fruits.ts");
const flowers = read("types/flowers.ts");
const constants = read("lib/constants.ts");

// Precio en coins al vender en la tienda del juego (cultivos, invernadero y frutas): para la "mejor conversión"
// FLOWER → coins (comprar barato en el mercado y vender en la tienda)
const sellPrices = {};
for (const src of [crops, fruits]) {
  for (const m of src.matchAll(/^\s*"?([A-Z][\w' ]+?)"?:\s*{[^{}]*?sellPrice:\s*([\d.]+)/gm)) sellPrices[m[1]] = Number(m[2]);
}
// Tesoros que compra la tienda de la playa (types/treasure.ts SELLABLE_TREASURES): no se venden en el mercado
const treasureSellPrices = {};
try {
  const tr = read("types/treasure.ts");
  const i = tr.indexOf("SELLABLE_TREASURES");
  const body = tr.slice(i, tr.indexOf("\n};", i) > 0 ? tr.indexOf("\n};", i) : undefined);
  for (const m of body.matchAll(/^\s*"?([A-Z][\w' ]+?)"?:\s*{[^{}]*?sellPrice:\s*([\d.]+)/gm)) treasureSellPrices[m[1]] = Number(m[2]);
} catch (e) {
  console.warn(`  ! sin precios de tesoros (${e.message})`);
}

// Flor → semilla. Por regex directa y no por bloques: prettier sangra algunos (BLOOM_FLOWERS) con 4 espacios
const flowerSeedOf = {};
for (const [, name, seed] of flowers.matchAll(/"([^"]+)":\s*{\s*seed:\s*"([^"]+ Seed)"/g)) flowerSeedOf[name] = seed;

// Cuántas unidades del ingrediente gasta cada cruce: el set 1 (Sunpetal/Bloom/Lily) y el set 2 (el resto)
const crossBreedAmounts = {};
for (const [, seed, set] of flowers.matchAll(/^ {2}"([^"]+ Seed)":\s*(SET_\d_FLOWER_CROSS_BREED_AMOUNTS),/gm)) {
  crossBreedAmounts[seed] = flatIds(block(flowers, set));
}

// ── Skills (árbol revamp) con descripciones en español ──────────────────────
const dictDir = path.join(gameSrc, "..", "..", "lib", "i18n", "dictionaries");
const dictEs = JSON.parse(fs.readFileSync(path.join(dictDir, "es.json"), "utf8"));
const dictEn = JSON.parse(fs.readFileSync(path.join(dictDir, "en.json"), "utf8"));
const tr = (k) => (k ? dictEs[k] || dictEn[k] || k : null);

const skillBody = block(read("types/bumpkinSkills.ts"), "BUMPKIN_REVAMP_SKILL_TREE");
const skills = {};
for (const m of skillBody.matchAll(/^ {2}(?:"([^"]+)"|([A-Za-z0-9_]+)):\s*{([\s\S]*?)^ {2}},?/gm)) {
  const name = m[1] ?? m[2];
  const b = m[3];
  const get = (re) => b.match(re)?.[1];
  const cooldown = get(/cooldown:\s*([^,\n]+)/);
  skills[name] = {
    tree: get(/tree:\s*"([^"]+)"/),
    points: Number(get(/points:\s*(\d+)/)),
    tier: Number(get(/tier:\s*(\d+)/)),
    island: get(/island:\s*"([^"]+)"/) || "basic",
    cooldown: cooldown ? num(cooldown) : undefined,
    power: /power:\s*true/.test(b) || undefined,
    disabled: /disabled:\s*true/.test(b) || undefined,
    // shortDescription suele ser translate("clave"), pero algunas son texto literal
    buff: tr(get(/\bbuff:\s*{[\s\S]*?shortDescription:\s*translate\("([^"]+)"\)/)) || get(/\bbuff:\s*{[\s\S]*?shortDescription:\s*"([^"]+)"/),
    buffEn: dictEn[get(/\bbuff:\s*{[\s\S]*?shortDescription:\s*translate\("([^"]+)"\)/)] || get(/\bbuff:\s*{[\s\S]*?shortDescription:\s*"([^"]+)"/) || undefined,
    // Valores por nivel de las skills mejorables (upgrade.effect.ranks), si son una lista de números
    ranks: (() => { const r = get(/upgrade:[\s\S]*?\branks:\s*\[([\d.,\s]+)\]/); return r ? r.split(",").map(Number).filter(Number.isFinite) : undefined; })(),
    debuff: tr(get(/debuff:\s*{[\s\S]*?shortDescription:\s*translate\("([^"]+)"\)/)) || get(/debuff:\s*{[\s\S]*?shortDescription:\s*"([^"]+)"/) || undefined,
  };
}
const tierBody = block(read("events/landExpansion/choseSkill.ts"), "SKILL_POINTS_PER_TIER");
const skillTiers = {};
for (const m of tierBody.matchAll(/^ {2}(?:"([^"]+)"|([A-Za-z]+)):\s*{\s*1:\s*(\d+),\s*2:\s*(\d+),\s*3:\s*(\d+),?\s*}/gm)) {
  skillTiers[m[1] ?? m[2]] = { 1: Number(m[3]), 2: Number(m[4]), 3: Number(m[5]) };
}

// ── Misiones: tickets por NPC, capítulos, boosts, tareas ────────────────────
const deliverSrc = read("events/landExpansion/deliver.ts");
const ticketRewards = flatIds(block(deliverSrc, "TICKET_REWARDS"));

const chaptersSrc = read("types/chapters.ts");
const chapters = {};
// Los capítulos recientes añaden más campos (tasksBegin…): se leen las fechas sin importar el orden
for (const m of block(chaptersSrc, "CHAPTERS").matchAll(/^ {2}(?:"([^"]+)"|([A-Za-z]+)):\s*{([\s\S]*?)^ {2}},?/gm)) {
  const start = m[3].match(/startDate:\s*new Date\("([^"]+)"\)/)?.[1];
  const end = m[3].match(/endDate:\s*new Date\("([^"]+)"\)/)?.[1];
  if (start && end) chapters[m[1] ?? m[2]] = { start: Date.parse(start), end: Date.parse(end) };
}
const chapterBoosts = {};
for (const m of block(read("events/landExpansion/completeNPCChore.ts"), "CHAPTER_TICKET_BOOST_ITEMS").matchAll(/^ {2}(?:"([^"]+)"|([A-Za-z]+)):\s*{([\s\S]*?)^ {2}},?/gm)) {
  chapterBoosts[m[1] ?? m[2]] = [...new Set([...m[3].matchAll(/(?:basic|rare|epic):\s*"([^"]+)"/g)].map((x) => x[1]))];
}

const chores = {};
for (const m of read("types/choreBoard.ts").matchAll(/"([^"]+)":\s*farmActivityTask\(\{\s*activity:\s*"([^"]+)",\s*amount:\s*([\d_]+)/g)) {
  chores[m[1]] = { activity: m[2], amount: Number(m[3].replace(/_/g, "")) };
}

const seasonalSeeds = {};
for (const m of block(read("types/seeds.ts"), "SEASONAL_SEEDS").matchAll(/^ {2}(\w+):\s*\[([\s\S]*?)\]/gm)) {
  seasonalSeeds[m[1]] = [...m[2].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
}

// Mejor tasa oficial FLOWER → coins (paquetes de intercambio del banco)
const coinPkgs = [...block(read("events/landExpansion/exchangeSFLtoCoins.ts"), "SFL_TO_COIN_PACKAGES").matchAll(/sfl:\s*([\d.]+),\s*coins:\s*([\d.]+)/g)];
const coinsPerFlower = Math.max(...coinPkgs.map((m) => Number(m[2]) / Number(m[1])));

// Recursos del mercado (cultivos, minerales, emblemas…): el juego los trata como materia prima y todo
// lo demás que se comercia (coleccionables, wearables, pets, buds) como NFT.
let tradeResources = [];
try {
  const tl = read("actions/tradeLimits.ts");
  const keys = (body) => [...body.matchAll(/^ {2}(?:"([^"]+)"|([A-Za-z][\w']*)):\s*\d/gm)].map((m) => m[1] ?? m[2]);
  tradeResources = [...new Set([...keys(block(tl, "EMBLEM_TRADE_LIMITS")), ...keys(block(tl, "TRADE_LIMITS"))])];
} catch (e) {
  console.warn(`  ! sin lista de recursos comerciables (${e.message}): la página NFT usará la heurística de cantidad`);
}

// Coleccionables que se colocan en la granja (decoraciones, boosts, banderas, camas…): son los NFT.
// Lo que se vende en el mercado y no se coloca (peces, tesoros, herramientas…) no cuenta; las flores
// aparecen como colocables pero se usan como consumible, así que también se quitan.
let nftCollectibles = [];
try {
  const topKeys = (body) => [...body.matchAll(/^ {2}(?:"([^"]+)"|([A-Za-z][\w']*)):/gm)].map((m) => m[1] ?? m[2]);
  const deco = read("types/decorations.ts");
  const placeable = new Set([
    ...topKeys(block(read("types/craftables.ts"), "COLLECTIBLES_DIMENSIONS")),
    ...["DECORATION_DIMENSIONS", "DECORATION_TEMPLATES", "LANDSCAPING_DECORATIONS", "POTION_HOUSE_DECORATIONS"].flatMap((n) => topKeys(block(deco, n))),
    ...topKeys(block(read("types/flags.ts"), "flags")),
    ...topKeys(block(read("types/beds.ts"), "BED_FARMHAND_COUNT")),
  ]);
  const flowers = new Set(Object.keys(flowerSeedOf));
  nftCollectibles = [...placeable].filter((n) => !flowers.has(n)).sort();
} catch (e) {
  console.warn(`  ! sin lista de coleccionables colocables (${e.message}): la página NFT usará solo la lista de recursos`);
}

// Rasgos de cada pet NFT por número (tipo, pelaje, aura): permiten valorar un pet por los listados de
// su mismo tipo y boost. Compacto: listas de valores + por id los índices [tipo, pelaje, aura, collar].
let petNfts = null;
try {
  const src = fs.readFileSync(path.join(srcRoot, "src/features/pets/data/pets-nfts.ts"), "utf8");
  const types = [], furs = [], auras = [], bibs = [], ids = {};
  const idx = (arr, v) => { let i = arr.indexOf(v); if (i < 0) { i = arr.length; arr.push(v); } return i; };
  for (const m of src.matchAll(/"(\d+)":\s*{([^}]*)}/g)) {
    const f = (k) => m[2].match(new RegExp(`${k}:\\s*"([^"]+)"`))?.[1];
    if (!f("type")) continue;
    ids[m[1]] = [idx(types, f("type")), idx(furs, f("fur") || "?"), idx(auras, f("aura") || "No Aura"), idx(bibs, f("bib") || "?")];
  }
  if (Object.keys(ids).length) petNfts = { types, furs, auras, bibs, ids };
} catch (e) {
  console.warn(`  ! sin rasgos de pets NFT (${e.message}): se valorarán por el floor de toda la colección`);
}

// Texto del boost de cada coleccionable y prenda, en español (las etiquetas que muestra el propio juego).
// Incluye los que no se venden en el mercado (espantapájaros, monumentos…), que sfl.world no conoce.
const buffs = {};
const buffsEn = {}; // mismos textos en inglés: de ahí salen los efectos calculables (boostFx)
for (const [file, name] of [["types/collectibleItemBuffs.ts", "COLLECTIBLE_BUFF_LABELS"], ["types/bumpkinItemBuffs.ts", "BUMPKIN_ITEM_BUFF_LABELS"]]) {
  try {
    const body = block(read(file), name);
    const heads = [...body.matchAll(/^ {2}(?:"([^"]+)"|([A-Za-z][\w']*)):/gm)];
    heads.forEach((h, i) => {
      const chunk = body.slice(h.index, heads[i + 1]?.index ?? body.length);
      const keys = [...chunk.matchAll(/shortDescription:[\s\S]{0,160}?translate\(\s*"([^"]+)"/g)].map((m) => m[1]);
      const texts = [...new Set(keys.map(tr).filter((t) => t && !t.includes("{{")))];
      if (texts.length) buffs[h[1] ?? h[2]] = texts.join(" · ");
      const en = [...new Set(keys.map((k) => dictEn[k]).filter((t) => t && !t.includes("{{")))];
      if (en.length) buffsEn[h[1] ?? h[2]] = en;
    });
  } catch (e) {
    console.warn(`  ! sin textos de boosts de ${file} (${e.message})`);
  }
}

// ── Recetas para valorar lo que no se vende directamente ───────────────────
const decimals = (s) => Object.fromEntries([...s.matchAll(/(?:"([^"]+)"|([A-Za-z][\w']*)):\s*new Decimal\(([\d.]+)\)/g)].map((m) => [m[1] ?? m[2], Number(m[3])]));
const recipes = {};
const toolsSrc = read("types/tools.ts");
for (const name of ["WORKBENCH_TOOLS", "TREASURE_TOOLS", "LOVE_ANIMAL_TOOLS"]) {
  for (const m of block(toolsSrc, name).matchAll(/^ {2}(?:"([^"]+)"|([A-Za-z]+)):\s*{([\s\S]*?)^ {2}},?/gm)) {
    const b = m[3];
    const ing = b.match(/ingredients:[\s\S]*?\(\{([\s\S]*?)\}\)/);
    recipes[m[1] ?? m[2]] = { coins: Number(b.match(/price:\s*([\d.]+)/)?.[1] || 0), items: ing ? decimals(ing[1]) : {} };
  }
}
const consSrc = read("types/consumables.ts");
// Comidas: XP que dan al comerlas, segundos de cocina (base, sin boosts) y edificio → estrategia de nivel
const foods = {};
for (const [, name] of consSrc.matchAll(/^(?:export )?const ([A-Z_]+_COOKABLES)\b/gm)) {
  for (const m of block(consSrc, name).matchAll(/^ {2}(?:"([^"]+)"|([A-Za-z' ]+)):\s*{([\s\S]*?)^ {2}},?/gm)) {
    const food = (m[1] ?? m[2]).trim();
    const ing = m[3].match(/ingredients:\s*{([\s\S]*?)}/);
    const xp = num(m[3].match(/experience:\s*([^,\n]+)/)?.[1] || "");
    const secs = num(m[3].match(/cookingSeconds:\s*([^,\n]+)/)?.[1] || "");
    const building = m[3].match(/building:\s*"([^"]+)"/)?.[1] || null;
    if (ing && xp != null) foods[food] = { xp, seconds: secs ?? 0, building, items: decimals(ing[1]) };
    if (ing && name !== "FISH_COOKABLES") recipes[food] = { coins: 0, items: decimals(ing[1]) };
  }
}

// Ticket de cada capítulo (Ascension Age → Shiny Feather…): lo que cuentan las entregas y el ranking
const chapterTickets = {};
try {
  for (const m of block(read("types/chapters.ts"), "CHAPTER_TICKET_NAME").matchAll(/(?:"([^"]+)"|([A-Za-z]+)):\s*"([^"]+)"/g)) chapterTickets[m[1] ?? m[2]] = m[3];
} catch (e) { console.warn(`  ! sin tickets de capítulo (${e.message})`); }

// Expansiones: requisitos de cada expansión por isla (recursos, coins, horas, nivel) y subida de isla
const expansions = {}, islandUpgrade = {};
try {
  const ex = read("types/expansions.ts");
  const gemRatio = Number(ex.match(/const LAND_GEM_RATIO\s*=\s*(\d+)/)?.[1] || 1);
  const reqs = {};
  for (const m of ex.matchAll(/^const ([A-Z0-9_]+_REQUIREMENTS)\s*:\s*Requirements\s*=\s*{([\s\S]*?)^};/gm)) {
    const body = m[2];
    const res = {};
    const resBlock = body.match(/resources:\s*{([\s\S]*?)}/)?.[1] || "";
    for (const r of resBlock.matchAll(/(?:"([^"]+)"|([A-Za-z]+)):\s*([^,\n]+)/g)) {
      const v = num(r[3].replace(/LAND_GEM_RATIO/g, String(gemRatio)));
      if (v != null) res[r[1] ?? r[2]] = v;
    }
    reqs[m[1]] = {
      resources: res,
      coins: num(body.match(/coins:\s*([^,\n]+)/)?.[1] || "0") || 0,
      sfl: num(body.match(/sfl:\s*([^,\n]+)/)?.[1] || "0") || 0,
      seconds: num(body.match(/seconds:\s*([^,\n]+)/)?.[1] || "0") || 0,
      level: num(body.match(/level:\s*(\d+)/)?.[1] || "0") || 0,
    };
  }
  const map = block(ex, "EXPANSION_REQUIREMENTS");
  for (const im of map.matchAll(/^ {2}(\w+):\s*{([\s\S]*?)^ {2}},?/gm)) {
    expansions[im[1]] = {};
    for (const e of im[2].matchAll(/(\d+):\s*([A-Z0-9_]+_REQUIREMENTS)/g)) if (reqs[e[2]]) expansions[im[1]][e[1]] = reqs[e[2]];
  }
  const up = read("events/landExpansion/upgradeFarm.ts");
  for (const im of block(up, "ISLAND_UPGRADE").matchAll(/^ {2}(\w+):\s*{([\s\S]*?)^ {2}},?/gm)) {
    const items = decimals(im[2].match(/items:\s*{([\s\S]*?)}/)?.[1] || "");
    islandUpgrade[im[1]] = { expansions: Number(im[2].match(/expansions:\s*(\d+)/)?.[1] || 0), items, to: im[2].match(/upgrade:\s*"(\w+)"/)?.[1] || null };
  }
} catch (e) {
  console.warn(`  ! sin requisitos de expansiones (${e.message})`);
}

// ── Mascotas (tipos, qué traen y a qué nivel, energía, peticiones de comida) ─
let pets = null;
try {
  const p = read("types/pets.ts");
  const flatStr = (body) => Object.fromEntries([...body.matchAll(/^ {2}"?([\w' ]+?)"?:\s*"([^"]+)"/gm)].map((m) => [m[1], m[2]]));
  const categories = {};
  for (const m of block(p, "PET_CATEGORIES").matchAll(/^ {2}(\w+):\s*{([\s\S]*?)^ {2}},?/gm)) {
    categories[m[1]] = ["primary", "secondary", "tertiary"].map((k) => m[2].match(new RegExp(`${k}:\\s*"(\\w+)"`))?.[1]).filter(Boolean);
  }
  const energy = {};
  for (const m of block(p, "PET_RESOURCES").matchAll(/^ {2}"?([\w ]+?)"?:\s*{\s*energy:\s*(\d+)/gm)) energy[m[1]] = Number(m[2]);
  const requests = {};
  for (const m of block(p, "PET_REQUESTS").matchAll(/^ {2}(\w+):\s*\[([\s\S]*?)\]/gm)) requests[m[1]] = [...m[2].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
  const requestXp = Object.fromEntries([...block(p, "PET_REQUEST_XP").matchAll(/^ {2}(\w+):\s*(\d+)/gm)].map((m) => [m[1], Number(m[2])]));
  pets = { types: flatStr(block(p, "PET_TYPES")), categories, fetchByCategory: flatStr(block(p, "FETCHES_BY_CATEGORY")), energy, requests, requestXp };
} catch (e) {
  console.warn(`  ! sin datos de mascotas (${e.message})`);
}

// ── Facciones: rangos por emblemas y su boost ────────────────────────────────
let factions = null;
try {
  const fr = read("lib/factionRanks.ts");
  const ranks = [];
  for (const m of block(fr, "RANK_DATA").matchAll(/^ {2}(\w+):\s*{([\s\S]*?)^ {2}},?/gm)) {
    const faction = m[2].match(/faction:\s*"(\w+)"/)?.[1], req = m[2].match(/emblemsRequired:\s*([\d_]+)/)?.[1];
    if (faction && req != null) ranks.push({ name: m[1], faction, emblems: Number(req.replace(/_/g, "")) });
  }
  // rankBoostPercentage: grupos de `case "x":` seguidos de `return n;`
  const boost = {};
  const sw = fr.slice(fr.indexOf("rankBoostPercentage"));
  let pending = [];
  for (const line of sw.split("\n").slice(1, 60)) {
    const c = line.match(/case\s+"(\w+)":/);
    if (c) { pending.push(c[1]); continue; }
    const r = line.match(/return\s+([\d.]+);/);
    if (r) { for (const n of pending) boost[n] = Number(r[1]); pending = []; }
    if (/^};/.test(line)) break;
  }
  for (const r of ranks) r.boost = boost[r.name] ?? 0;
  const jf = read("events/landExpansion/joinFaction.ts");
  factions = { ranks, emblems: Object.fromEntries([...block(jf, "FACTION_EMBLEMS").matchAll(/^ {2}(\w+):\s*"([^"]+)"/gm)].map((m) => [m[1], m[2]])) };
} catch (e) {
  console.warn(`  ! sin datos de facciones (${e.message})`);
}

// ── Iconos de los items (ITEM_DETAILS[x].image) ─────────────────────────────
// Solo la RUTA de cada icono, nunca la imagen: "g:<ruta>" cuelga de sunflower-land.com/game-assets (arte
// Sunnyside, servidor del juego) y "a:<ruta>" de src/assets del repo público (se sirve por jsDelivr).
const itemImages = {};
try {
  const src = srcRoot;
  const sunny = fs.readFileSync(path.join(src, "src/assets/sunnyside.ts"), "utf8");
  // SUNNYSIDE: objeto anidado grupo.clave → `${CONFIG.PROTECTED_IMAGE_URL}/ruta`
  const sunnyMap = {};
  const stack = [];
  const lines = sunny.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let m = line.match(/^\s*"?([\w$]+)"?:\s*{\s*$/);
    if (m) { stack.push(m[1]); continue; }
    if (/^\s*},?\s*$/.test(line)) { stack.pop(); continue; }
    m = line.match(/^\s*"?([\w$]+)"?:\s*(.*)$/);
    if (!m || !stack.length) continue;
    const val = m[2].trim() || (lines[i + 1] || "").trim(); // prettier parte las líneas largas
    const u = val.match(/`\$\{CONFIG\.PROTECTED_IMAGE_URL\}\/([^`]+)`/);
    if (u) sunnyMap[[...stack, m[1]].join(".")] = `g:${u[1]}`;
  }
  const plant = fs.readFileSync(path.join(src, "src/features/island/plots/lib/plant.ts"), "utf8");
  const cropDir = Object.fromEntries([...block(plant, "IMAGES").matchAll(/^ {2}"?([\w ]+?)"?:\s*"([^"]+)"/gm)].map((m) => [m[1], m[2]]));
  const imagesTs = read("types/images.ts");
  const imports = {};
  for (const m of imagesTs.matchAll(/^import\s+(\w+)\s+from\s+"(assets\/[^"]+)";/gm)) imports[m[1]] = `a:${m[2]}`;
  const details = block(imagesTs, "ITEM_DETAILS");
  for (const m of details.matchAll(/^ {2}(?:"([^"]+)"|([\w]+)):\s*{([\s\S]*?)^ {2}},?/gm)) {
    const name = m[1] ?? m[2];
    const v = m[3].match(/image:\s*([^,\n]+)/)?.[1]?.trim();
    if (!v) continue;
    let url = null;
    if (imports[v]) url = imports[v];
    else if (v.startsWith("SUNNYSIDE.")) url = sunnyMap[v.slice(10)] || null;
    else {
      const c = v.match(/^CROP_LIFECYCLE\["Basic Biome"\]\.(?:"?([\w ]+)"?|\["([^"]+)"\])\.(crop|seed)$/);
      const dir = c && cropDir[c[1] ?? c[2]];
      if (dir) url = `g:crops/${dir}/${c[3]}.png`;
    }
    if (url) itemImages[name] = url;
  }
} catch (e) {
  console.warn(`  ! sin iconos de items (${e.message})`);
}

// Excavación del desierto (types/desert.ts): patrones del día con sus casillas relativas y el artefacto de cada
// capítulo, que sustituye a "Seasonal Artefact". El sitio mide DESERT_GRID_WIDTH × DESERT_GRID_HEIGHT.
const desertSrc = read("types/desert.ts");
const diggingFormations = {};
{
  const start = desertSrc.indexOf("DIGGING_FORMATIONS = {");
  const body = desertSrc.slice(start, desertSrc.indexOf("} satisfies", start));
  for (const m of body.matchAll(/^ {2}([A-Z0-9_]+):\s*\[([\s\S]*?)\],?\s*$/gm)) {
    diggingFormations[m[1]] = [...m[2].matchAll(/{\s*x:\s*(-?\d+),\s*y:\s*(-?\d+),\s*name:\s*"([^"]+)"\s*}/g)].map((c) => ({ x: +c[1], y: +c[2], name: c[3] }));
  }
}
const chapterArtefact = {};
{
  const start = desertSrc.indexOf("CHAPTER_ARTEFACT:");
  const body = desertSrc.slice(start, desertSrc.indexOf("};", start));
  for (const m of body.matchAll(/(?:"([^"]+)"|([A-Za-z]+)):\s*"([^"]+)"/g)) chapterArtefact[m[1] ?? m[2]] = m[3];
}
const desertGrid = { width: constSeconds(desertSrc, "DESERT_GRID_WIDTH"), height: constSeconds(desertSrc, "DESERT_GRID_HEIGHT") };

// ── Producción: precios de semillas (coins), aceite del invernadero y semillas de la Crop Machine ─────────
const seedPrices = {};
for (const [file, name] of [["types/crops.ts", "CROP_SEEDS"], ["types/crops.ts", "GREENHOUSE_SEEDS"], ["types/fruits.ts", "PATCH_FRUIT_SEEDS"],
  ["types/fruits.ts", "GREENHOUSE_FRUIT_SEEDS"], ["types/flowers.ts", "FLOWER_SEEDS"]]) {
  Object.assign(seedPrices, entriesWithField(block(read(file), name), "price"));
}
// Semillas que trae la tienda cada día (INITIAL_STOCK): limita lo que puede plantar la Crop Machine
const seedStock = {};
{
  const c = read("lib/constants.ts");
  const i = c.indexOf("const seeds: Record<SeedName, Decimal>");
  if (i > 0) for (const m of c.slice(i, c.indexOf("};", i)).matchAll(/"([^"]+ (?:Seed|Plant))":\s*new Decimal\((\d+)\)/g)) seedStock[m[1]] = Number(m[2]);
}
const greenhouseOil = flatIds(block(read("events/landExpansion/plantGreenhouse.ts"), "OIL_USAGE"));
const machineSrc = read("events/landExpansion/supplyCropMachine.ts");
// Semillas que acepta la máquina: las básicas y las que desbloquea cada Crop Extension Module (skill)
const cropMachineSeeds = {};
for (const [, name, body] of machineSrc.matchAll(/export const (BASIC_CROP_MACHINE_SEEDS|CROP_EXTENSION_MOD_I+_SEEDS)[^=]*=\s*\[([\s\S]*?)\]/g)) {
  const key = name === "BASIC_CROP_MACHINE_SEEDS" ? "basic" : `Crop Extension Module ${name.match(/MOD_(I+)_/)[1]}`;
  cropMachineSeeds[key] = [...body.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

// ── Efectos calculables de cada boost (texto del juego en inglés) → simulador ─────────────────────────────
// { k: "add", t, v } unidades más por cosecha · { k: "pct", t, v } % sobre la base · { k: "time", t, v } multiplica el
// tiempo. t = grupo (crops, crops:basic|medium|advanced, fruits, greenhouse, machine, flowers, minerals, animals) o un item.
// aoe = casillas que cubre (zona de efecto). Lo condicional (estación, "Disabled if…", suerte rara) se ignora.
const TARGET_ALIAS = { crop: "crops", crops: "crops", "plot crop": "crops", "crop plot": "crops", "basic crops": "crops:basic", "basic crop": "crops:basic",
  "medium crops": "crops:medium", "medium crop": "crops:medium", "advanced crops": "crops:advanced", "advanced crop": "crops:advanced",
  "medium/advanced crops": "crops:medium|crops:advanced", "fruit patch": "fruits", fruit: "fruits", fruits: "fruits", "greenhouse produce": "greenhouse",
  "greenhouse pot": "greenhouse", greenhouse: "greenhouse", "crop machine": "machine", flower: "flowers", flowers: "flowers", tree: "Wood", trees: "Wood",
  minerals: "minerals", mineral: "minerals", "animal produce": "animals", animal: "animals", lemons: "Lemon", bananas: "Banana", yams: "Yam", onions: "Onion",
  artichokes: "Artichoke", grapes: "Grape", crimstones: "Crimstone", feathers: "Feather", oil: "Oil", "wood & minerals": "Wood|minerals",
  "crops & fruits": "crops|fruits", "basic and medium crop": "crops:basic|crops:medium", honey: "Honey" };
const titleCase = (t) => t.replace(/\b[a-z]/g, (c) => c.toUpperCase());
const cleanTarget = (t) => t.replace(/\s*\(.*?\)\s*/g, "").replace(/\s+(yield|plot|per hive|per full beehive)$/i, "").trim();
const targets = (raw) => {
  const whole = TARGET_ALIAS[cleanTarget(raw).toLowerCase()];
  const parts = whole ? [whole] : raw.split(/,\s*|\s+\+\s+|\s+and\s+/).map((x) => TARGET_ALIAS[cleanTarget(x).toLowerCase()] || titleCase(cleanTarget(x)));
  return parts.flatMap((x) => x.split("|")).filter(Boolean);
};
function parseFx(lines) {
  const fx = [];
  const all = lines.join(" · ");
  const aoe = all.match(/Area of Effect \((\d+)x(\d+)\)|Affects plots? around \((\d+)x(\d+)\)/);
  const cells = aoe ? Number(aoe[1] ?? aoe[3]) * Number(aoe[2] ?? aoe[4]) : /Affects plot below/.test(all) ? 1 : null;
  for (const line of lines) {
    const l = line.trim();
    if (/during|in (Spring|Summer|Autumn|Winter)|Disabled|Lasts for|Requires|chance to (double|instantly)|every \d+|per (Hen|Barn)|Base |Max |daily|Help|Sale|Marks|XP|Deliver|cost|stock|Cheers|Seeds|tax|consumption|production speed|queue|capacity|oil$/i.test(l)) continue;
    let m;
    if ((m = l.match(/^\+([\d.]+)%\s+(.+?)(?:\s+yield)?$/i))) fx.push(...targets(m[2]).map((t) => ({ k: "pct", t, v: Number(m[1]) })));
    else if ((m = l.match(/^\+([\d.]+)\s+(?:yield to\s+)?(.+?)$/i))) fx.push(...targets(m[2]).map((t) => ({ k: "add", t, v: Number(m[1]) })));
    else if ((m = l.match(/^(\d+)% chance (?:for|of) \+([\d.]+) (.+)$/i))) fx.push(...targets(m[3]).map((t) => ({ k: "add", t, v: (Number(m[1]) / 100) * Number(m[2]) })));
    else if ((m = l.match(/^(\d+)% chance for (trees|crimstone|gold) to (?:grow|recover) instantly$/i))) fx.push(...targets(m[2]).map((t) => ({ k: "time", t, v: 1 - Number(m[1]) / 100 })));
    else if ((m = l.match(/^x([\d.]+)\s+growth time (?:for|in) (.+)$/i))) fx.push(...targets(m[2]).map((t) => ({ k: "time", t, v: Number(m[1]) })));
    else if ((m = l.match(/^x([\d.]+)\s+(.+?)\s+(?:growth|recovery|regeneration|cooldown|refill|sleep)\s+time$/i))) fx.push(...targets(m[2]).map((t) => ({ k: "time", t, v: Number(m[1]) })));
    else if ((m = l.match(/^([\d.]+)x\s+(.+?)\s+(?:growth|recovery|sleep)\s+speed$/i))) fx.push(...targets(m[2]).map((t) => ({ k: "time", t, v: 1 / Number(m[1]) })));
  }
  const out = fx.filter((f) => f.t && Number.isFinite(f.v) && f.v > 0 && !/ /.test(f.t.replace(/^(Merino Wool|Wild Mushroom)$/, "x")));
  if (cells && out.length) out.forEach((f) => (f.aoe = cells));
  return out;
}
const boostFx = {};
for (const [name, lines] of Object.entries(buffsEn)) { const fx = parseFx(lines); if (fx.length) boostFx[name] = fx; }
for (const [name, sk] of Object.entries(skills)) { if (sk.buffEn && !sk.power) { const fx = parseFx([sk.buffEn]); if (fx.length) boostFx[`skill:${name}`] = fx; } }

// Literal de objeto TS → JSON (sin ejecutar nada): claves entre comillas, new Decimal(n) → n, sin comas finales
function tsLiteral(src, name, consts = {}) {
  const start = src.search(new RegExp(`^(?:export )?const ${name}\\b`, "m"));
  if (start < 0) throw new Error(`No encuentro ${name}`);
  // Objeto (= {) o lista (= [ / => [), lo que venga antes
  const mObj = /=\s*{/.exec(src.slice(start)), iObj = mObj ? start + mObj.index : -1, iArr = src.slice(start, iObj < 0 ? undefined : iObj).search(/(=|=>)\s*\[/);
  const open = iArr >= 0 ? src.indexOf("[", start + iArr) : src.indexOf("{", iObj);
  const [o, c] = src[open] === "[" ? ["[", "]"] : ["{", "}"];
  let depth = 0, end = open;
  for (; end < src.length; end++) { if (src[end] === o) depth++; else if (src[end] === c && --depth === 0) break; }
  let txt = src.slice(open, end + 1)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "")
    .replace(/^\s*(?:"[^"]+"|[A-Za-z0-9_]+):\s*undefined,?\s*$/gm, "")
    .replace(/^\s*\.\.\..*$/gm, ""); // "...otraLista" o "...getX(now, peso)": lo dinámico no entra
  for (const [k, v] of Object.entries(consts)) txt = txt.replace(new RegExp(`([\\d.]+)\\s*\\*\\s*${k}\\b`, "g"), (_, n) => String(Number(n) * v));
  txt = txt
    .replace(/^\s*description:.*$/gm, "")
    .replace(/new Decimal\(\s*([\d.]+)\s*\)/g, "$1")
    .replace(/\bInfinity\b/g, "null")
    .replace(/(\d)_(?=\d{3}\b)/g, "$1") // 3_000 → 3000
    .replace(/:\s*([\d.]+(?:\s*[*+/-]\s*[\d.]+)+)\s*(?=[,}\n])/g, (_, e) => `: ${num(e)}`) // 60 * 60 * 1000
    .replace(/([{,]\s*)([A-Za-z0-9_]+)\s*:/g, '$1"$2":')
    .replace(/,(\s*[}\]])/g, "$1");
  try { return JSON.parse(txt); } catch (e) { const p = Number(e.message.match(/position (\d+)/)?.[1]); throw new Error(`${e.message} → …${Number.isFinite(p) ? txt.slice(Math.max(0, p - 60), p + 30).replace(/\s+/g, " ") : ""}`); }
}
// ── Animales (types/animals.ts, feedAnimal.ts): XP por nivel, XP de cada comida según nivel, lo que dan al subir de
// nivel, ingredientes de las comidas, cuántas comen por toma y horas de sueño
const animalsSrc = read("types/animals.ts"), feedSrc = read("events/landExpansion/feedAnimal.ts");
const animals = {
  levels: tsLiteral(animalsSrc, "ANIMAL_LEVELS"),
  foodXp: tsLiteral(animalsSrc, "ANIMAL_FOOD_EXPERIENCE"),
  drops: tsLiteral(animalsSrc, "ANIMAL_RESOURCE_DROP"),
  foods: Object.fromEntries(Object.entries(tsLiteral(animalsSrc, "ANIMAL_FOODS")).map(([k, v]) => [k, { type: v.type, ingredients: v.ingredients }])),
  requiredQty: tsLiteral(feedSrc, "REQUIRED_FOOD_QTY"),
  coins: Object.fromEntries(Object.entries(tsLiteral(animalsSrc, "ANIMALS")).map(([k, v]) => [k, v.coins])),
  sleepHours: (num(feedSrc.match(/ANIMAL_SLEEP_DURATION\s*=\s*([^;]+);/)?.[1] || "") || 86400000) / 3600000,
};

// ── Cofres y cajas (types/chests.ts): premios con su peso. Los objetos del capítulo se añaden en el juego aparte.
const chestSrc = read("types/chests.ts");
const chestConsts = { CHEST_MULTIPLIER: num(chestSrc.match(/CHEST_MULTIPLIER\s*=\s*([\d_]+)/)?.[1] || "") || 900,
  BB_TO_GEM_RATIO: num(read("types/game.ts").match(/BB_TO_GEM_RATIO\s*=\s*([\d_]+)/)?.[1] || "") || 20 };
const chests = {};
for (const name of ["BASIC_REWARDS", "RARE_REWARDS", "LUXURY_REWARDS", "BUD_BOX_REWARDS", "PIRATE_CHEST_REWARDS", "BASIC_DESERT_STREAK",
  "ADVANCED_DESERT_STREAK", "EXPERT_DESERT_STREAK", "MANEKI_NEKO_REWARDS", "FESTIVE_TREE_REWARDS", "GIFT_GIVER_REWARDS"]) {
  try { chests[name] = tsLiteral(chestSrc, name, chestConsts); } catch (e) { console.warn(`  ! cofre ${name}: ${e.message}`); }
}
chests.dynamic = { BASIC_REWARDS: /getChapterTrackChestRewards\(now,\s*([\d.]+)/.exec(chestSrc.slice(chestSrc.indexOf("BASIC_REWARDS")))?.[1],
  LUXURY_REWARDS: /getChapterMegastoreChestRewards\(now,\s*([\d.]+)/.exec(chestSrc)?.[1] };

// ── Pesca (types/fishing.ts): cada pez con sus cebos, tipo, lo que le atrae (engodo) y estaciones
const fishSrc = read("types/fishing.ts");
const fishing = { fish: {}, chum: {}, guaranteed: {}, limit: num(fishSrc.match(/let limit\s*=\s*(\d+)/)?.[1] || "") || 20 };
try { fishing.fish = { ...tsLiteral(fishSrc, "CHAPTER_FISH"), ...tsLiteral(fishSrc, "FISH") }; } catch (e) { console.warn(`  ! peces: ${e.message}`); }
try { fishing.chum = tsLiteral(fishSrc, "CHUM_AMOUNTS"); } catch (e) { console.warn(`  ! engodo: ${e.message}`); }
try { fishing.guaranteed = tsLiteral(fishSrc, "GUARANTEED_CATCH_BY_BAIT"); } catch (e) { console.warn(`  ! cebos: ${e.message}`); }

// Tamaño en casillas de edificios, coleccionables y decoración (mapa de la isla): "Name": { width: N, height: M }
const itemDims = {};
for (const f of ["types/craftables.ts", "types/decorations.ts", "types/buildings.ts"]) {
  for (const m of read(f).matchAll(/^\s+(?:"([^"]+)"|([A-Za-z][\w']*)):\s*{\s*width:\s*(\d+),\s*height:\s*(\d+)\s*}/gm)) itemDims[m[1] ?? m[2]] = [Number(m[3]), Number(m[4])];
}

// ── Capítulo: tienda de Stella (types/megastore.ts), pase de recompensas (types/tracks.ts), colección
// (types/collections.ts + chapterMutants.ts + lib/crafting.ts) y tienda de facción de Eldric (types/factionShop.ts)
const megastore = {}, chapterTracks = {}, chapterCollections = {}, factionShop = [];
try {
  const src = read("types/megastore.ts").replace(/^\s*cooldownMs:.*$/gm, "").replace(/("[^"]*")\s+as\s+\w+/g, "$1");
  const map = block(src, "MEGASTORE");
  const flat = (store) => Object.entries(store).flatMap(([tier, t]) => (t.items || []).map((it) => ({
    name: it.wearable || it.collectible, type: it.wearable ? "wearable" : "collectible", tier, requirement: t.requirement || 0,
    cost: { items: it.cost?.items || {}, sfl: it.cost?.sfl || 0, coins: it.cost?.coins || 0 },
    limit: it.limit ?? null, inventoryLimit: it.inventoryLimit ?? null })));
  // Cada capítulo apunta a una constante ChapterStore o a un objeto con listas de items por nivel
  for (const m of map.matchAll(/^ {2}(?:"([^"]+)"|([A-Za-z]+)):\s*([A-Z_]+|{)/gm)) {
    const ch = m[1] ?? m[2];
    try {
      if (m[3] !== "{") {
        if (m[3] !== "EMPTY_SEASONAL_STORE") megastore[ch] = flat(tsLiteral(src, m[3]));
        continue;
      }
      const start = map.indexOf("{", m.index + m[0].length - 1);
      let depth = 0, end = start;
      for (; end < map.length; end++) { if (map[end] === "{") depth++; else if (map[end] === "}" && --depth === 0) break; }
      const inline = map.slice(start, end + 1).replace(/items:\s*([A-Z_]+)/g, (_, id) => `items: ${JSON.stringify(tsLiteral(src, id))}`);
      megastore[ch] = flat(tsLiteral(`const X = ${inline};`, "X"));
    } catch (e) { console.warn(`  ! tienda de ${ch}: ${e.message}`); }
  }
} catch (e) { console.warn(`  ! sin tienda del capítulo (${e.message})`); }
try {
  const src = read("types/tracks.ts");
  for (const m of block(src, "CHAPTER_TRACKS").matchAll(/(?:"([^"]+)"|([A-Za-z]+)):\s*([A-Z_]+)/g)) {
    try { chapterTracks[m[1] ?? m[2]] = tsLiteral(src, m[3]).milestones; } catch (e) { console.warn(`  ! pase de ${m[1] ?? m[2]}: ${e.message}`); }
  }
  chapterTracks._points = tsLiteral(src, "CHAPTER_TASK_POINTS");
} catch (e) { console.warn(`  ! sin pase del capítulo (${e.message})`); }
try {
  const col = read("types/collections.ts");
  let mutants = {}, crafting = {};
  try { mutants = tsLiteral(read("types/chapterMutants.ts").replace(/^\s*banner:.*$/gm, ""), "CHAPTER_MUTANTS"); } catch (e) { console.warn(`  ! mutantes: ${e.message}`); }
  try { crafting = tsLiteral(read("lib/crafting.ts"), "CHAPTER_CRAFTING_ITEMS"); } catch (e) { console.warn(`  ! crafteo del capítulo: ${e.message}`); }
  const body = block(col, "CHAPTER_COLLECTIONS");
  const heads = [...body.matchAll(/^ {2}(?:"([^"]+)"|([A-Za-z]+)):\s*buildChapterCollection/gm)];
  heads.forEach((h, i) => {
    const ch = h[1] ?? h[2], part = body.slice(h.index, heads[i + 1]?.index);
    const listOf = (src, key) => [...(src.match(new RegExp(`${key}:\\s*\\[([\\s\\S]*?)\\]`))?.[1] || "").matchAll(/"([^"]+)"/g)].map((x) => x[1]);
    const source = (key) => {
      const s = part.match(new RegExp(`\\b${key}:\\s*{([\\s\\S]*?)\\n {6}}`))?.[1];
      return s ? { collectibles: listOf(s, "collectibles"), wearables: listOf(s, "wearables") } : null;
    };
    const mu = mutants[ch] || {};
    const out = { mutants: Object.entries(mu).filter(([k]) => k !== "banner").flatMap(([, v]) => [].concat(v)) };
    for (const key of ["auctioneer", "vipGift", "other"]) { const s = source(key); if (s) out[key] = s; }
    if (out.other) out.other.collectibles.push(...Object.entries(crafting).filter(([, c]) => c === ch).map(([n]) => n));
    chapterCollections[ch] = out;
  });
} catch (e) { console.warn(`  ! sin colecciones del capítulo (${e.message})`); }
try {
  const src = read("types/factionShop.ts");
  for (const m of src.matchAll(/{\s*name:\s*"([^"]+)",\s*price:\s*new Decimal\((\d+)\),([\s\S]*?)\n\s*},/g)) {
    const rest = m[3];
    factionShop.push({ name: m[1], price: Number(m[2]), type: rest.match(/type:\s*"([^"]+)"/)?.[1] || null,
      faction: rest.match(/faction:\s*"([^"]+)"/)?.[1] || null, requires: rest.match(/requires:\s*"([^"]+)"/)?.[1] || null,
      limit: Number(rest.match(/limit:\s*(\d+)/)?.[1]) || null });
  }
} catch (e) { console.warn(`  ! sin tienda de facción (${e.message})`); }

// ── Fase 4 (guías de referencia): retiro de cada item, edificios, compostadores, pozo de lava, tiendas, forja solar,
// niveles de las semillas y de las entregas de NPCs
const releases = {}; // nombre → { trade, withdraw } (epoch ms; null = nunca)
try {
  const src = read("types/withdrawables.ts");
  const chEnd = (ch) => chapters[ch]?.end ?? null;
  const dateOf = (expr) => {
    if (!expr) return null;
    const d = expr.match(/new Date\("([^"]+)"\)/);
    if (d) return Date.parse(d[1]);
    const c = expr.match(/CHAPTERS\["([^"]+)"\]\.(endDate|startDate)/);
    if (c) return c[2] === "endDate" ? chEnd(c[1]) : chapters[c[1]]?.start ?? null;
    return null;
  };
  for (const name of ["WEARABLE_RELEASES", "INVENTORY_RELEASES"]) {
    const body = block(src, name);
    for (const m of body.matchAll(/^ {2}(?:"([^"]+)"|([A-Za-z0-9_]+)):\s*(CAN_WITHDRAW_AND_TRADE|{([\s\S]*?)^ {2}})/gm)) {
      const key = m[1] ?? m[2];
      if (m[3] === "CAN_WITHDRAW_AND_TRADE") { releases[key] = { trade: Date.UTC(2023, 0, 1), withdraw: Date.UTC(2023, 0, 1) }; continue; }
      const b = m[4] || "";
      releases[key] = { trade: dateOf(b.match(/tradeAt:\s*([^,\n]+)/)?.[1]), withdraw: dateOf(b.match(/withdrawAt:\s*([^,\n]+)/)?.[1]) };
    }
  }
} catch (e) { console.warn(`  ! sin fechas de retiro (${e.message})`); }
const guideData = {};
const tryData = (key, fn) => { try { guideData[key] = fn(); } catch (e) { console.warn(`  ! ${key}: ${e.message}`); } };
tryData("buildings", () => Object.fromEntries(Object.entries(tsLiteral(read("types/buildings.ts"), "BUILDINGS")).map(([k, v]) =>
  [k, { level: v.unlocksAtLevel?.level ?? null, coins: v.coins || 0, secs: v.constructionSeconds || 0, items: v.ingredients || {} }])));
// La Pet House pide 1/5 de cada recurso de mascota con un reduce: queda como "_petFetches": n (se expande en el navegador)
tryData("buildingUpgrades", () => tsLiteral(read("events/landExpansion/upgradeBuilding.ts")
  .replace(/\.\.\.Object\.values\(FETCHES_BY_CATEGORY\)\.reduce<[\s\S]*?new Decimal\((\d+)\)[\s\S]*?\}, \{\}\),/g, (_, n) => `_petFetches: ${n},`), "BUILDING_UPGRADES"));
tryData("composters", () => ({ details: tsLiteral(read("types/composters.ts"), "composterDetails"), seasons: tsLiteral(read("types/composters.ts"), "SEASON_COMPOST_REQUIREMENTS") }));
tryData("lavaPit", () => { const src = read("events/landExpansion/startLavaPit.ts"); return { seasons: tsLiteral(src, "LAVA_PIT_REQUIREMENTS_NEW"), hours: (num(src.match(/LAVA_PIT_TIME\s*=\s*([^;]+);/)?.[1] || "") || 259200000) / 3600000 }; });
tryData("floatingShop", () => Object.fromEntries(Object.entries(tsLiteral(read("types/floatingIsland.ts"), "FLOATING_ISLAND_SHOP_ITEMS")).map(([k, v]) => [k, { type: v.type, cost: v.cost?.items || {} }])));
tryData("blacksmith", () => Object.fromEntries(Object.entries(tsLiteral(read("types/collectibles.ts").replace(/^\s*(?:description|boost):.*$/gm, ""), "HELIOS_BLACKSMITH_ITEMS")).map(([k, v]) => [k, { coins: v.coins || 0, items: v.ingredients || {} }])));
tryData("weatherShop", () => tsLiteral(read("types/calendar.ts"), "WEATHER_SHOP_ITEM_COSTS"));
tryData("nodePrices", () => tsLiteral(read("events/landExpansion/buyResource.ts"), "RESOURCE_NODE_PRICES"));
tryData("npcDeliveryLevels", () => Object.fromEntries(Object.entries(tsLiteral(fs.readFileSync(path.join(srcRoot, "src/features/island/delivery/lib/delivery.ts"), "utf8"), "NPC_DELIVERY_LEVELS")).map(([k, v]) => [k, v.level])));
// Nodos que trae cada expansión: se cuentan las casillas de cada LAYOUT (así lo deriva el juego en expansions.ts)
tryData("expansionNodes", () => {
  const src = read("types/expansions.ts");
  const FIELD = { plots: "Crop Plot", trees: "Tree", stones: "Stone Rock", iron: "Iron Rock", gold: "Gold Rock", crimstones: "Crimstone Rock",
    sunstones: "Sunstone Rock", fruitPatches: "Fruit Patch", flowerBeds: "Flower Bed", beehives: "Beehive", oilReserves: "Oil Reserve", lavaPits: "Lava Pit" };
  const PREFIX = { "": "basic", SPRING_: "spring", DESERT_: "desert", VOLCANO_: "volcano" };
  const out = {};
  for (const [pre, isl] of Object.entries(PREFIX)) {
    out[isl] = { base: tsLiteral(src, `${isl.toUpperCase()}_BASE_NODES`), add: {} };
  }
  for (const m of src.matchAll(/^export const ((?:SPRING_|DESERT_|VOLCANO_)?)LAND_(\d+)_LAYOUT[^\n]*\n([\s\S]*?)^\}\);/gm)) {
    const isl = PREFIX[m[1]], n = Number(m[2]);
    if (isl === "basic" && (n < 4 || n > 9)) continue; // básica: solo 4-9 (las antiguas iban por paquetes aleatorios)
    const counts = {};
    for (const [field, node] of Object.entries(FIELD)) {
      const inline = m[3].match(new RegExp(`^ {2}${field}:\\s*\\[([^\\]\\n]*)\\]`, "m")); // [] o [{ x: 1, y: 2 }] en una línea
      const arr = inline ? inline[1] : m[3].match(new RegExp(`^ {2}${field}:\\s*\\[\\s*\\n([\\s\\S]*?)^ {2}\\]`, "m"))?.[1];
      const c = arr ? (arr.match(/\bx:/g) || []).length : 0;
      if (c) counts[node] = c;
    }
    out[isl].add[n] = counts;
  }
  return out;
});
// Regalos a los NPCs (types/gifts.ts): flores que les gustan más, puntos por flor y premios por amistad
tryData("npcGifts", () => {
  const src = read("types/gifts.ts").replace(/\bBB_TO_GEM_RATIO\b/g, String(chestConsts.BB_TO_GEM_RATIO));
  return { bonuses: tsLiteral(src, "BUMPKIN_FLOWER_BONUSES"), points: tsLiteral(src, "DEFAULT_FLOWER_POINTS"), gifts: tsLiteral(src, "BUMPKIN_GIFTS", chestConsts) };
});
// Piezas de mapa de las maravillas marinas (fishing.ts): qué pez suelta pieza de cuál y con qué probabilidad
tryData("mapPieces", () => {
  const src = read("types/fishing.ts");
  return { base: tsLiteral(src, "BASE_MAP_PIECE_TRIGGERS"), chapters: tsLiteral(src, "CHAPTER_MAP_PIECE_TRIGGERS"),
    marvelChapter: tsLiteral(src, "MAP_PIECE_CHAPTERS"), difficulty: tsLiteral(src, "MAP_PUZZLE_DIFFICULTY") };
});
tryData("seedLevels", () => {
  const out = {};
  for (const f of ["types/crops.ts", "types/fruits.ts", "types/flowers.ts"]) {
    for (const m of read(f).matchAll(/^\s*"?([A-Z][\w' ]+?)"?:\s*{[^{}]*?bumpkinLevel:\s*{\s*ascension:\s*0,\s*level:\s*(\d+)/gm)) out[m[1]] = Number(m[2]);
  }
  return out;
});

const data = {
  generatedAt: new Date().toISOString(),
  source: online ? "github:sunflower-land/sunflower-land@main" : "copia local",
  crops: entriesWithField(block(crops, "CROPS"), "harvestSeconds"),
  greenhouseCrops: entriesWithField(block(crops, "GREENHOUSE_CROPS"), "harvestSeconds"),
  fruitSeeds: entriesWithField(block(fruits, "PATCH_FRUIT_SEEDS"), "plantSeconds"),
  fruitSeedOf: entriesWithField(block(fruits, "PATCH_FRUIT"), "seed"),
  greenhouseFruitSeeds: entriesWithField(block(fruits, "GREENHOUSE_FRUIT_SEEDS"), "plantSeconds"),
  greenhouseFruitSeedOf: entriesWithField(block(fruits, "GREENHOUSE_FRUIT"), "seed"),
  flowerSeeds: entriesWithField(block(flowers, "FLOWER_SEEDS"), "plantSeconds"),
  flowerSeedOf,
  crossBreedAmounts,
  sellPrices,
  treasureSellPrices,
  itemImages,
  pets,
  factions,
  recovery: {
    tree: constSeconds(constants, "TREE_RECOVERY_TIME"),
    stone: constSeconds(constants, "STONE_RECOVERY_TIME"),
    iron: constSeconds(constants, "IRON_RECOVERY_TIME"),
    gold: constSeconds(constants, "GOLD_RECOVERY_TIME"),
    crimstone: constSeconds(constants, "CRIMSTONE_RECOVERY_TIME"),
    sunstone: constSeconds(constants, "SUNSTONE_RECOVERY_TIME"),
    oil: constSeconds(read("events/landExpansion/drillOilReserve.ts"), "OIL_RESERVE_RECOVERY_TIME"),
  },
  skills,
  skillTiers,
  ticketRewards,
  chapters,
  chapterBoosts,
  chores,
  seasonalSeeds,
  coinsPerFlower,
  recipes,
  tradeResources,
  nftCollectibles,
  petNfts,
  buffs,
  foods,
  chapterTickets,
  megastore,
  chapterTracks,
  chapterCollections,
  factionShop,
  releases,
  ...guideData,
  expansions,
  islandUpgrade,
  diggingFormations,
  seedPrices,
  chests,
  fishing,
  itemDims,
  animals,
  seedStock,
  greenhouseOil,
  cropMachineSeeds,
  boostFx,
  chapterArtefact,
  desertGrid,
  islandOrder: ["basic", "spring", "desert", "volcano"],
  levelExperience: flatIds(block(read("lib/level.ts"), "LEVEL_EXPERIENCE")),
  itemIds: flatIds(block(read("types/index.ts"), "KNOWN_IDS")),
  wearableIds: flatIds(block(read("types/bumpkin.ts"), "ITEM_IDS")),
};

// --out <archivo>: escribir en otro sitio (el actualizador automático genera aparte y valida antes de sustituir)
const outArg = process.argv.indexOf("--out");
const out = outArg > 0 ? path.resolve(process.argv[outArg + 1]) : path.join(root, "public", "gamedata.js");
fs.writeFileSync(
  out,
  `// Generado por tools/extract-gamedata.mjs — no editar a mano.\nwindow.GAME = ${JSON.stringify(data)};\n`,
);

const count = (o) => Object.keys(o).length;
console.log(`OK → ${path.relative(root, out)}`);
console.log(
  `  cultivos ${count(data.crops)} · invernadero ${count(data.greenhouseCrops)} · frutas ${count(data.fruitSeedOf)}` +
    ` · flores ${count(data.flowerSeedOf)} · items ${count(data.itemIds)} · wearables ${count(data.wearableIds)}` +
    ` · skills ${count(data.skills)} en ${count(data.skillTiers)} árboles` +
    `\n  NPCs con tickets ${count(data.ticketRewards)} · capítulos ${count(data.chapters)} · tareas ${count(data.chores)}` +
    ` · recetas ${count(data.recipes)} · recursos comerciables ${data.tradeResources.length} · NFT colocables ${data.nftCollectibles.length} · pets NFT ${data.petNfts ? count(data.petNfts.ids) : 0} · boosts ${count(data.buffs)} · comidas ${count(data.foods)} · expansiones ${Object.values(data.expansions).reduce((a, x) => a + count(x), 0)} · patrones de excavación ${count(data.diggingFormations)} · boosts calculables ${count(data.boostFx)} · ${data.coinsPerFlower} coins/FLOWER`,
);
