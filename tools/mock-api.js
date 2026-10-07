// API simulada con la misma forma que la Community API, para probar el dashboard sin key.
// La usa `npm run demo` (tools/demo.js). Los datos son inventados.

const http = require("node:http");
const path = require("node:path");

global.window = {};
require(path.join(__dirname, "..", "public", "gamedata.js"));
const G = window.GAME;

const H = 3600_000;
const t0 = Date.now();
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function farm() {
  const crops = {};
  const cropNames = ["Kale", "Radish", "Wheat", "Carrot", "Cabbage", "Eggplant"];
  // Parcelas en bloques de 6×4, como en una isla real
  for (let i = 0; i < 48; i++) {
    const block = Math.floor(i / 24), r = Math.floor((i % 24) / 6), c = i % 6;
    const batch = Math.floor(i / 6);
    const name = cropNames[batch % cropNames.length];
    const secs = G.crops[name];
    const empty = i === 13 || i === 40;
    crops[`p${i}`] = { createdAt: 0, x: c + block * 7, y: -r, width: 1, height: 1, crop: empty ? undefined : { name, plantedAt: t0 - secs * 1000 * (0.15 + (batch % 6) * 0.19) } };
  }
  const trees = {}, stones = {}, iron = {}, gold = {};
  for (let i = 0; i < 9; i++) trees[`t${i}`] = { x: -9 + (i % 3) * 2, y: 3 - Math.floor(i / 3) * 2, width: 2, height: 2, wood: { choppedAt: t0 - rand(0, 2.4) * H } };
  for (let i = 0; i < 7; i++) stones[`s${i}`] = { x: 15 + (i % 4), y: 2 - Math.floor(i / 4), width: 1, height: 1, stone: { minedAt: t0 - rand(0, 4.5) * H } };
  for (let i = 0; i < 4; i++) iron[`i${i}`] = { x: 15 + i, y: -1, width: 1, height: 1, stone: { minedAt: t0 - rand(0, 9) * H } };
  for (let i = 0; i < 3; i++) gold[`g${i}`] = { x: 15 + i, y: -3, width: 1, height: 1, stone: { minedAt: t0 - rand(0, 26) * H } };
  return {
    username: "thbd_demo",
    coins: 184230,
    balance: "1234.56",
    island: { type: "volcano" },
    vip: { expiresAt: t0 + 19 * 24 * H },
    inventory: { Gem: "420", Wood: "5320", Stone: "1210", Iron: "388", Gold: "96", Kale: "4100", Radish: "2210", Wheat: "8700", Egg: "900", "Crimstone": "12", "Ascension Shard": "6" },
    wardrobe: { "Red Farmer Shirt": 1 },
    socialFarming: { villageProjects: { "Big Orange": { cheers: 25 }, "Woodcutter's Monument": { cheers: 420 } } },
    crops, trees, stones, iron, gold,
    crimstones: { c0: { x: 20, y: 2, width: 2, height: 2, minesLeft: 3, stone: { minedAt: t0 - 20 * H } } },
    oilReserves: { o0: { x: 20, y: -2, width: 2, height: 2, oil: { drilledAt: t0 - 13 * H } } },
    fruitPatches: {
      f0: { x: 0, y: 4, width: 2, height: 2, fruit: { name: "Apple", plantedAt: t0 - 30 * H, harvestedAt: t0 - 9 * H, harvestsLeft: 2 } },
      f1: { x: 3, y: 4, width: 2, height: 2, fruit: { name: "Banana", plantedAt: t0 - 3 * H, harvestedAt: 0, harvestsLeft: 4 } },
      f2: { x: 6, y: 4, width: 2, height: 2, fruit: { name: "Lemon", plantedAt: t0 - 5 * H, harvestedAt: 0, harvestsLeft: 3 } },
    },
    flowers: { flowerBeds: { b0: { x: 9, y: 4, width: 3, height: 1, flower: { name: "Red Pansy", plantedAt: t0 - 20 * H } } } },
    collectibles: { "Wicker Man": [{ id: "w1", coordinates: { x: 12, y: 8 }, createdAt: t0 - 90 * 24 * H, readyAt: t0 - 90 * 24 * H }] },
    beehives: { h0: { x: 13, y: 4, swarm: false, honey: { updatedAt: t0 - 5 * H, produced: 0.3 * 86400_000 }, flowers: [] } },
    greenhouse: { pots: { 1: { plant: { name: "Rice", plantedAt: t0 - 12 * H } }, 2: { plant: { name: "Grape", plantedAt: t0 - 13 * H } } } },
    buildings: {
      Kitchen: [{ id: "k", coordinates: { x: 2, y: 9 }, crafting: [{ name: "Fruit Salad", readyAt: t0 + 0.4 * H, startedAt: t0 - 0.6 * H }] }],
      Bakery: [{ id: "b", coordinates: { x: 7, y: 9 }, crafting: [{ name: "Kale Omelette", readyAt: t0 - 60_000, startedAt: t0 - 3 * H }] }],
      "Compost Bin": [{ id: "c", producing: { items: { "Sprout Mix": 10 }, startedAt: t0 - 2 * H, readyAt: t0 + 4 * H } }],
      "Crop Machine": [{ id: "cm", queue: [{ crop: "Carrot", seeds: 20, startTime: t0 - H, readyAt: t0 + 5 * H }] }],
    },
    henHouse: { animals: {
      a1: { id: "a1", type: "Chicken", state: "idle", experience: 250, asleepAt: t0 - 2 * H, awakeAt: t0 + 6 * H, lovedAt: t0 - 2 * H, item: "Petting Hand" },
      a2: { id: "a2", type: "Chicken", state: "idle", experience: 1300, asleepAt: t0 - 25 * H, awakeAt: t0 - H, lovedAt: 0, item: "Petting Hand" },
      a4: { id: "a4", type: "Chicken", state: "ready", experience: 2500, asleepAt: t0 - 26 * H, awakeAt: t0 - 2 * H, lovedAt: 0, item: "Petting Hand" },
    } },
    barn: { animals: {
      a3: { id: "a3", type: "Cow", state: "idle", experience: 900, asleepAt: t0 - H, awakeAt: t0 + 23 * H, lovedAt: 0, item: "Brush" },
      a5: { id: "a5", type: "Sheep", state: "sick", experience: 400, asleepAt: t0 - 30 * H, awakeAt: t0 - 6 * H, lovedAt: 0, item: "Brush" },
    } },
    lavaPits: { l0: { startedAt: t0 - 20 * H, readyAt: t0 + 52 * H } },
    season: { season: "spring", startedAt: t0 - 3 * 24 * H },
    saltFarm: { level: 2, nodes: { 0: { salt: { storedCharges: 0, nextChargeAt: t0 + 2.5 * H, claimedAt: t0 - 4.5 * H } }, 1: { salt: { storedCharges: 2, nextChargeAt: t0 + 5 * H, claimedAt: t0 - 16 * H } } } },
    crabTraps: { trapSpots: { 1: { waterTrap: { type: "Crab Pot", placedAt: t0 - 2 * H, readyAt: t0 + 2 * H, caught: {} } }, 2: {} } },
    pets: {
      requestsGeneratedAt: Date.UTC(new Date(t0).getUTCFullYear(), new Date(t0).getUTCMonth(), new Date(t0).getUTCDate()),
      common: { Barkley: { name: "Barkley", energy: 40, requests: { food: ["Roast Veggies", "Kale Stew", "Pumpkin Soup"], foodFed: ["Roast Veggies"] } } },
    },
    dailyRewards: { streaks: 23, chest: { collectedAt: t0 - 30 * H } },
    desert: demoDesert(),
    farmHands: { bumpkins: { 1: { equipped: { shirt: pick(demoChapterBoosts()) || "Red Farmer Shirt" } } } },
    bumpkin: {
      experience: 1250340,
      equipped: { shirt: "Red Farmer Shirt" },
      skills: demoSkills(),
      previousPowerUseAt: { "Instant Growth": t0 - 60 * H },
    },
    calendar: { dates: [
      { date: new Date(t0 + 2 * 24 * H).toISOString().slice(0, 10), name: "doubleDelivery", weather: false },
      { date: new Date(t0 + 1 * 24 * H).toISOString().slice(0, 10), name: "fullMoon" },
      { date: new Date(t0 + 4 * 24 * H).toISOString().slice(0, 10), name: "tornado", weather: true },
    ] },
    npcs: {},
    delivery: { orders: [
      { id: "o1", from: "tywin", createdAt: t0 - 30 * H, readyAt: t0 - 30 * H, items: { "Gold Pickaxe": 2, coins: 9500 }, reward: {} },
      { id: "o2", from: "raven", createdAt: t0 - 5 * H, readyAt: t0 - 5 * H, items: { Kale: 80, Wheat: 150 }, reward: {} },
      { id: "o3", from: "pharaoh", createdAt: t0 - 8 * H, readyAt: t0 - 8 * H, items: { Iron: 20, Egg: 10 }, reward: {} },
      { id: "o4", from: "jester", createdAt: t0 - 3 * H, readyAt: t0 - 3 * H, items: { Radish: 50, Egg: 40 }, reward: {} },
      { id: "o5", from: "betty", createdAt: t0 - 2 * H, readyAt: t0 - 2 * H, items: { Wheat: 30, Kale: 20 }, reward: { coins: 639 } },
      { id: "o6", from: "grimbly", createdAt: t0 - H, readyAt: t0 - H, items: { "Boiled Eggs": 1 }, reward: { sfl: 0.35 } },
    ] },
    choreBoard: { chores: {
      "pumpkin' pete": { name: "Harvest Kale 150 times", initialProgress: 100, startedAt: t0 - 2 * 24 * H, reward: { items: { "Shiny Feather": 2 } } },
      miranda: { name: "Grow Red Lavender 3 times", initialProgress: 0, startedAt: t0 - 2 * 24 * H, reward: { items: { "Shiny Feather": 1 } } },
    } },
    chores: { chores: { 1: { activity: "Tree Chopped", description: "Chop 550 Trees", requirement: 550, startCount: 1000 } } },
    farmActivity: { "Kale Harvested": 235, "Red Lavender Harvested": 1, "Tree Chopped": 1481 },
    bounties: { requests: [
      { id: "b1", name: "Obsidian", sfl: 12 },
      { id: "b2", name: "Kale", coins: 300 },
      { id: "b3", name: "Chicken", level: 14, items: { "Shiny Feather": 3 } },
    ], completed: [] },
  };
}

// Sitio de excavación de hoy: patrones reales colocados sin solaparse y 12 excavaciones (dos con taladro, 2×2)
// con sus pistas: tesoro, cangrejo (tesoro arriba, abajo o a un lado) o arena. Fijo, para que el test sea estable.
function demoDesert() {
  const F = G.diggingFormations || {};
  const chapter = Object.entries(G.chapters || {}).find(([, c]) => t0 >= c.start && t0 < c.end)?.[0];
  const art = (G.chapterArtefact || {})[chapter] || "Scarab";
  const names = ["ARTEFACT_ONE", "OLD_BOTTLE", "SEA_CUCUMBERS", "HIEROGLYPH", "CLAM_SHELLS", "CORAL"].filter((n) => F[n]);
  const spots = { ARTEFACT_ONE: [1, 1], OLD_BOTTLE: [6, 1], SEA_CUCUMBERS: [3, 6], HIEROGLYPH: [7, 5], CLAM_SHELLS: [0, 7], CORAL: [9, 7] };
  const at = new Map();
  for (const n of names) {
    const cells = F[n], mx = Math.min(...cells.map((c) => c.x)), my = Math.min(...cells.map((c) => c.y));
    for (const c of cells) at.set(`${spots[n][0] + c.x - mx},${spots[n][1] + c.y - my}`, c.name === "Seasonal Artefact" ? art : c.name);
  }
  const hole = (x, y, tool = "Sand Shovel") => {
    const tr = at.get(`${x},${y}`);
    const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => at.has(`${x + a},${y + b}`));
    return { x, y, dugAt: t0 - 2 * H, tool, items: { [tr || (near ? "Crab" : "Sand")]: 1 } };
  };
  const drill = (x, y) => [hole(x, y, "Sand Drill"), hole(x + 1, y, "Sand Drill"), hole(x, y + 1, "Sand Drill"), hole(x + 1, y + 1, "Sand Drill")];
  return { digging: { patterns: names, extraDigs: 0, streak: { count: 4, collectedAt: t0 - 26 * H, totalClaimed: 120 },
    grid: [drill(1, 1), drill(5, 4), hole(2, 2), hole(8, 1), hole(4, 8), hole(0, 4), hole(9, 9), hole(3, 6), hole(6, 8), hole(8, 3)] } };
}

// Algunas skills reales del árbol + boosts del capítulo en curso, sacados de gamedata.js
// Ropa variada para los retratos de los rankings (nombres reales del juego)
function demoOutfit(i) {
  const pick = (a) => a[i % a.length];
  return { background: pick(["Farm Background", "Forest Background", "Seashore Background"]), body: pick(["Beige Farmer Potion", "Pirate Potion"]),
    hair: pick(["Surfer Hair", "Parlour Hair"]), shirt: pick(["Red Farmer Shirt", "Swamp Armor"]), shoes: "Black Farmer Boots", tool: pick(["Trident", "Farmer Pitchfork"]) };
}

function demoSkills() {
  const names = Object.entries(G.skills || {}).filter(([, s]) => s.tier === 1 && !s.disabled).slice(0, 12).map(([n]) => n);
  if (G.skills?.["Instant Growth"]) names.push("Instant Growth");
  return Object.fromEntries(names.map((n) => [n, 1]));
}
function demoChapterBoosts() {
  const t = Date.now();
  const ch = Object.entries(G.chapters || {}).find(([, c]) => t >= c.start && t < c.end)?.[0];
  return (ch && G.chapterBoosts?.[ch]) || [];
}

function activity(prev) {
  const items = {};
  const names = ["Wood", "Stone", "Iron", "Gold", "Kale", "Radish", "Wheat", "Egg", "Gem", "Crimstone", "Sunflower", "Potato", "Obsidian", "Oil"];
  for (const n of names) {
    const id = G.itemIds[n];
    if (id == null) continue;
    const base = { Wood: 0.012, Stone: 0.05, Iron: 0.2, Gold: 1.1, Gem: 0.09, Crimstone: 3.2, Obsidian: 9, Oil: 0.3 }[n] ?? rand(0.004, 0.03);
    const floor = base * rand(0.95, 1.05);
    items[`collectibles-${id}`] = {
      low: base * 0.4, high: base * 3, volume: (prev ? 1e5 : 1.02e5) * base * 1000, trades: prev ? 50000 : 50600 + Math.floor(rand(0, 900)),
      quantity: 1e7, latestSale: floor * rand(0.97, 1.03), floor, listingCount: Math.floor(rand(3, 80)), offerCount: Math.floor(rand(1, 40)),
      bestOffer: n === "Iron" ? floor * 1.02 : floor * rand(0.9, 0.99),
    };
  }
  items[`wearables-${G.wearableIds["Red Farmer Shirt"]}`] = { volume: 300, trades: 12, quantity: 12, latestSale: 3.5, floor: 3.2, listingCount: 4, offerCount: 1, bestOffer: 2.9 };
  items["pets-2513"] = { volume: 0, trades: 0, quantity: 0, floor: 45, listingCount: 2, offerCount: 0 };
  items["pets-1"] = { volume: 0, trades: 0, quantity: 0, floor: 900, listingCount: 1, offerCount: 0 }; // Griffin
  return { totals: { volume: prev ? 7.5e7 : 7.52e7, trades: prev ? 1.53e7 : 1.5312e7 }, items };
}

const day = (o = 0) => new Date(Date.now() - o * 86400_000).toISOString().slice(0, 10);

// Granja "inestable" para el test de reintentos: falla con 502 las dos primeras veces
let flakyCalls = 0;

function handle(url) {
  if (url.pathname === "/community/farms/77777") {
    flakyCalls++;
    if (flakyCalls <= 2) return { __status: 502 };
  }
  if (url.pathname.startsWith("/community/farms/")) {
    return { farm: farm(), id: 121500, nft_id: 29411, nftId: 29411, isBlacklisted: false, updatedAt: new Date(t0 - 4 * 60_000).toISOString() };
  }
  const type = url.searchParams.get("type");
  switch (type) {
    case "marketplaceActivity": {
      const date = url.searchParams.get("date") || day();
      return { data: { flowerPrice: 0.13458, reports: { [date]: activity(Boolean(url.searchParams.get("date"))) } } };
    }
    case "tradeable": {
      const dates = {};
      for (let i = 6; i >= 0; i--) {
        const d = day(i), mid = rand(0.18, 0.24);
        dates[d] = { date: d, low: mid * 0.9, high: mid * 1.15, volume: rand(800, 2400), sales: Math.floor(rand(200, 700)) };
      }
      return { data: { id: Number(url.searchParams.get("id")), collection: url.searchParams.get("collection"), floor: 0.2, lastSalePrice: 0.205, supply: 172625521, isActive: true, isVip: false, offerCount: 34, listingCount: 52,
        offers: Array.from({ length: 6 }, (_, i) => ({ tradeId: "o" + i, sfl: 0.19 - i * 0.002, quantity: 1000, offeredById: 1, offeredAt: t0 - i * H, type: "instant" })),
        listings: Array.from({ length: 6 }, (_, i) => ({ tradeId: "l" + i, sfl: 0.2 + i * 0.003, quantity: 500, listedById: 2, listedAt: t0 - i * 2 * H, type: i === 3 ? "onchain" : "instant" })),
        history: { sales: [...Array.from({ length: 5 }, (_, i) => ({ id: "s" + i, sfl: 102, quantity: 500, fulfilledAt: t0 - i * 0.7 * H, fulfilledBy: { id: 9, username: pick(["gordy", "pip", "sunny"]) } })),
          // compra antigua tuya (anterior a las 50 del perfil): la rescata /api/rescan
          { id: `old-${url.searchParams.get("id")}`, source: "listing", sfl: 77, quantity: 1, fulfilledAt: t0 - 200 * 24 * H, initiatedBy: { id: 9001, username: "pip" }, fulfilledBy: { id: 121500, username: "thbd_demo" } }],
          history: { totalSales: 1078763, totalVolume: 3541962, dates } } } };
    }
    case "marketplaceProfile":
    {
      const me = { id: 121500, username: "thbd_demo" };
      const other = (i) => ({ id: 9000 + i, username: ["gordy", "pip", "sunny", "farmer_pete"][i % 4] });
      const buy = (i, itemId, qty, sfl, hoursAgo) => ({ id: `t${i}`, collection: "collectibles", itemId, quantity: qty, sfl, source: "listing", fulfilledAt: t0 - hoursAgo * H, initiatedBy: other(i), fulfilledBy: me });
      const sell = (i, itemId, qty, sfl, hoursAgo) => ({ id: `t${i}`, collection: "collectibles", itemId, quantity: qty, sfl, source: "listing", fulfilledAt: t0 - hoursAgo * H, initiatedBy: me, fulfilledBy: other(i) });
      const trades = [
        buy(1, G.itemIds.Wood, 500, 5.4, 3), buy(2, G.itemIds.Iron, 100, 17.5, 20), sell(3, G.itemIds.Kale, 300, 6.1, 26),
        buy(4, G.itemIds.Gold, 20, 24, 50), buy(5, G.itemIds.Gem, 200, 16, 70), sell(6, G.itemIds.Wheat, 1000, 17, 90),
      ].filter((x) => x.itemId != null);
      return { data: { id: 121500, username: "thbd_demo", totalTrades: 1842, weeklyFlowerSpent: 412.85, weeklyFlowerEarned: 638.2, listings: { a: {}, verify: { collection: "collectibles", items: { Sunflower: 200 }, sfl: 97531 } }, offers: {}, friends: [], trades } };
    }
    case "statsLeaderboard": {
      const boards = {};
      for (const b of ["coins", "experience", "sunflowers", "kale", "chores", "deliveries", "dailyLoginStreak", "diggingStreak", "newPlayerExperience"]) {
        boards[b] = { name: b, title: b, players: Array.from({ length: 100 }, (_, i) => ({ rank: i + 1, farmId: i === 41 ? 121500 : 1000 + i, username: i === 41 ? "thbd_demo" : `farmer_${i}`, level: 120 - i, ascension: i % 3, count: Math.round(5e7 / (i + 1)), bumpkin: demoOutfit(i) })) };
      }
      return { data: { reportDate: day(1), lastUpdated: t0 - 5 * H, activeSince: t0 - 30 * 24 * H, scanned: 48210, boards } };
    }
    case "ticketLeaderboard":
      return { data: { topTen: Array.from({ length: 50 }, (_, i) => ({ rank: i + 1, id: `farmer_${i}`, count: 9000 - i * 90, accountId: 2000 + i, farmId: 2000 + i, bumpkin: demoOutfit(i) })),
        farmRankingDetails: [{ rank: 61, id: "#98210", count: 1204, accountId: 98210 }, { rank: 62, id: "thbd_demo", count: 1198, accountId: 121500 }, { rank: 63, id: "pip", count: 1180, accountId: 98212 }],
        lastUpdated: t0 - 25 * 60_000, total: 41288390 } };
    case "auctions":
      return { data: { auctions: [
        { auctionId: "old-1", type: "wearable", wearable: "Coin Aura", startAt: t0 - 50 * H, endAt: t0 - 49 * H, supply: 5, sfl: 1, ingredients: { Gold: 3 } },
        { auctionId: "live-1", type: "collectible", collectible: "Golden Cauliflower", startAt: t0 - 0.5 * H, endAt: t0 + 0.5 * H, supply: 25, sfl: 2, ingredients: {} },
        { auctionId: "next-1", type: "nft", nft: "Pet", startAt: t0 + 5 * H, endAt: t0 + 6 * H, supply: 10, sfl: 1, ingredients: { Gold: 5 } },
        { auctionId: "next-2", type: "wearable", wearable: "Rocket Onesie", startAt: t0 + 30 * H, endAt: t0 + 31 * H, supply: 1e11, sfl: 0, ingredients: { Gem: 50 } },
      ], totalSupply: {} } };
    case "auctionResults":
      return { data: { status: "complete", participantCount: 214, supply: 5, endAt: t0 - 49 * H, leaderboard: Array.from({ length: 20 }, (_, i) => ({ rank: i + 1, farmId: 100 + i, username: `bidder_${i}`, tickets: 900 - i * 10, experience: 1e6 - i * 1e4 })) } };
    case "raffles":
      return { data: [
        { id: "crabs-raffle-demo", startAt: t0 - 24 * H, endAt: t0 + 48 * H, prizes: { 1: { type: "Pet", nft: "Pet #2501", onChain: true }, 2: { type: "collectible", items: { Gem: 2000 } } }, entryRequirements: { Floater: 10 } },
        { id: "old-raffle-demo", startAt: t0 - 240 * H, endAt: t0 - 100 * H, prizes: { 1: { type: "wearable", wearables: { "Crimstone Spikes Hair": 1 } } }, entryRequirements: { Gem: 1 } },
      ] };
    case "raffleResults":
      return { data: { status: "complete", participants: 3184, entries: 91240, winners: [{ farmId: 121500, position: 1, entries: 320, wearables: { "Crimstone Spikes Hair": 1 }, profile: { username: "thbd_demo" } }] } };
    case "nightlyDump": // índice del volcado nocturno (los archivos van por el CDN simulado, sin key)
      return { data: [{ filename: `${day(1)}/active.jsonl.gz`, size: dumpGz().length, modifiedAt: new Date(t0 - 2 * H).toISOString() }, { filename: "index.json", size: 100, modifiedAt: new Date(t0).toISOString() }] };
    case "discordAnnouncements":
      return { data: [
        { id: "1", channelName: "announcements", url: "https://discord.com", content: "**Chapter Update** is live! Head to the Plaza <:sunflower:123> to pick up your first delivery.\nMore info: https://sunflower-land.com", sender: { displayName: "Sunflower Land" }, createdAt: new Date(t0 - 3 * H).toISOString(), images: [], likes: 148 },
        { id: "2", channelName: "news", url: "https://discord.com", content: "Maintenance tonight at 22:00 UTC <@&12345>", sender: { displayName: "Sunflower Land" }, createdAt: new Date(t0 - 27 * H).toISOString(), images: [], likes: 61 },
      ] };
    default:
      return null;
  }
}

// sfl.world simulado (API pública sin key). Si alguna petición llega con x-api-key se anota: el test
// comprueba que la key nunca sale hacia terceros.
let worldLeakedKey = false;
// Volcado nocturno de ejemplo: tu granja + 4 más (una en lista negra, que no cuenta)
let dumpCache = null;
function dumpGz() {
  if (dumpCache) return dumpCache;
  const lvlXp = (l) => G.levelExperience[l] || 0;
  const other = (id, lvl, island, extra = {}) => ({ id, nftId: id, lastActivity: t0 - 3 * H, farm: {
    balance: String(lvl / 2), coins: lvl * 100, bumpkin: { experience: lvlXp(lvl), skills: {} }, island: { type: island },
    inventory: { "Basic Land": String(Math.round(lvl / 5)), Wood: String(lvl * 10), Gem: "5", ...extra.inventory },
    wardrobe: extra.wardrobe || {}, trees: Object.fromEntries(Array.from({ length: Math.round(lvl / 5) }, (_, i) => [i, { x: i }])),
    faction: { name: island === "desert" ? "goblins" : "bumpkins" },
    // Pedidos de entrega: el volcado los junta en "qué pide cada NPC" (Guías → Entregas de NPCs sin sfl.world)
    delivery: { orders: [{ id: `d${id}`, from: "betty", createdAt: t0 - H, items: { Wheat: 30, Kale: 20 }, reward: { coins: 600 + id } },
      { id: `e${id}`, from: "grimbly", createdAt: t0 - H, items: { "Boiled Eggs": 1 }, reward: { sfl: 0.4 } }] },
  } });
  const lines = [
    { id: 121500, nftId: 29411, lastActivity: t0 - H, farm: farm() },
    other(2, 10, "basic"), other(3, 40, "spring", { inventory: { "Fairy Circle": "1" } }), other(4, 60, "desert", { inventory: { "Fairy Circle": "1", Wood: "999" } }),
    { ...other(5, 90, "volcano"), isBlacklisted: true },
  ];
  return (dumpCache = require("node:zlib").gzipSync(lines.map((l) => JSON.stringify(l)).join("\n") + "\n"));
}
const hookLog = [];
function world(url) {
  const p = url.pathname.replace(/^\/world/, "");
  if (p === "/_leak") return { leaked: worldLeakedKey };
  if (p === "/v1/nfts") {
    const list = Object.entries(activity(false).items).filter(([k]) => /^(collectibles|wearables)-/.test(k)).map(([k, it], i) => {
      const [collection, id] = k.split("-");
      return { id: Number(id), collection, floor: it.floor ?? 0, lastSalePrice: it.latestSale ?? 0, supply: 1000 + i * 37, have_boost: i % 2, boost_text: i % 2 ? "+0.2 Wood" : "" };
    });
    return { collectibles: list.filter((x) => x.collection === "collectibles"), wearables: list.filter((x) => x.collection === "wearables"), updatedAt: t0 };
  }
  if (p === "/v1.1/exchange") return { sfl: { usd: 0.13458, eur: 0.1182, pol: 1.2 }, gems: { 100: { gem: 100, usd: 1.29, sfl: 9.2 }, 650: { gem: 650, usd: 6.49, sfl: 46 } } };
  if (p === "/v1/auctions") return { totalSupply: { Pet: 1750 }, list: [{ auctionId: "pet-demo-1", sfl: 1, supply: 2, ingredients: {}, startAt: t0 - 30 * 86400_000, endAt: t0 - 30 * 86400_000 + 600_000, type: "nft", nft: "Pet", result: { participantCount: 9, supply: 2, leaderboard: [{ farmId: 1, username: "pip", sfl: 2100, tickets: 2100, rank: 1 }, { farmId: 121500, username: "thbd_demo", sfl: 1890, tickets: 1890, rank: 2 }, { farmId: 3, username: "gordy", sfl: 1500, tickets: 1500, rank: 3 }] } }] };
  let m = p.match(/^\/v1\/land\/(\d+)$/);
  if (m) return { resources: { wood: { min: 1.2, max: 2.2, avg: 1.5 }, stone: { min: 1.1, max: 1.1, avg: 1.1 } }, crops: { sunflower: { min: 1.1, max: 1.1, avg: 1.1 } }, fruits: {}, greenhouse: {}, animals: {} };
  m = p.match(/^\/v1\.1\/land\/(\d+)$/);
  if (m) return { land: { type: "volcano", level: "23", gem: 320, marks: 140, charm: 3, cheer: 12, taxFreeSFL: 250.5, created: "2023-02-01", ascensionLevel: 0, vip: true }, bumpkin: { level: 88 } };
  m = p.match(/^\/v1\/land\/info\/username\/(.+)$/);
  if (m) {
    const name = decodeURIComponent(m[1]).toLowerCase();
    return name === "gordy" ? { username: "gordy", farm_id: 29411, nft_id: 29411 } : { __status: 404, error: "Not found" };
  }
  return null;
}

// OpenSea simulado: key gratuita al momento y listados en WETH de los coleccionables del mercado (los pares
// más baratos que en el juego, los impares más caros), en dos páginas. La key de SFL no debe llegar aquí.
const OS_WETH = "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619";
function opensea(req, url) {
  const p = url.pathname.replace(/^\/opensea/, "");
  if (p === "/api/v2/auth/keys" && req.method === "POST") return { api_key: "os-demo", name: "demo", expires_at: new Date(Date.now() + 7 * 86400_000).toISOString() };
  if (req.headers["x-api-key"] !== "os-demo") return { __status: 401, error: "Missing an API Key" };
  if (p === `/api/v2/chain/polygon/payment_token/${OS_WETH}`) return { symbol: "WETH", decimals: 18, usdPrice: "2700" };
  if (p === "/api/v2/listings/collection/sunflower-land-collectibles/best") {
    const all = Object.entries(activity(false).items).filter(([k, it]) => k.startsWith("collectibles-") && it.floor > 0).map(([k, it], i) => {
      const usd = it.floor * 0.13458 * (i % 2 ? 1.3 : 0.8) * 3; // lote de 3 unidades
      return { chain: "polygon", status: "ACTIVE", remaining_quantity: 3,
        protocol_data: { parameters: { offer: [{ identifierOrCriteria: k.split("-")[1], startAmount: "3" }], consideration: [{ token: OS_WETH }] } },
        price: { current: { currency: "WETH", decimals: 18, value: String(BigInt(Math.round((usd / 2700) * 1e18))) } } };
    });
    const page = url.searchParams.get("next") ? 1 : 0;
    const half = Math.ceil(all.length / 2);
    return { listings: page ? all.slice(half) : all.slice(0, half), next: page ? null : "p2" };
  }
  return null;
}

const port = Number(process.env.MOCK_PORT) || 4180;
http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  // Webhook de Discord simulado (alertas premium): guarda los mensajes y los devuelve en /hook/log
  if (url.pathname === "/hook" && req.method === "POST") {
    let b = "";
    req.on("data", (c) => (b += c));
    req.on("end", () => { try { hookLog.push(JSON.parse(b)); } catch { /* ignorar */ } res.writeHead(204); res.end(); });
    return;
  }
  if (url.pathname === "/hook/log") { res.writeHead(200, { "content-type": "application/json" }); return res.end(JSON.stringify(hookLog)); }
  if (url.pathname.startsWith("/cdn/")) {
    if (req.headers["x-api-key"]) worldLeakedKey = true; // el CDN del volcado tampoco debe recibir la key
    if (!/\/active\.jsonl\.gz$/.test(url.pathname)) { res.writeHead(404); return res.end(); }
    const gz = dumpGz();
    res.writeHead(200, { "content-type": "application/gzip", "content-length": gz.length });
    return res.end(gz);
  }
  // CoinGecko simulado: reserva del precio de FLOWER cuando sfl.world no responde
  if (url.pathname === "/coingecko/simple/price") {
    if (req.headers["x-api-key"]) worldLeakedKey = true;
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(JSON.stringify({ "flower-2": { usd: 0.16, eur: 0.14 } }));
  }
  if (url.pathname.startsWith("/opensea/")) {
    if (String(req.headers["x-api-key"] || "").startsWith("sfl.")) worldLeakedKey = true;
    const body = opensea(req, url);
    res.writeHead(body?.__status || (body ? 200 : 404), { "content-type": "application/json" });
    return res.end(JSON.stringify(body?.__status ? { errors: [body.error] } : body || { errors: ["Not found"] }));
  }
  if (url.pathname.startsWith("/world/")) {
    if (req.headers["x-api-key"]) worldLeakedKey = true;
    // Página de recetas de flores (HTML, como la de sfl.world)
    if (url.pathname === "/world/info/flowers") {
      const card = (flower, seed, via) => `<table class="w175"><thead><tr><th class="ta-left small"><img src="/img/flowers/${flower}.png" class="img-15 m-right-5"/>${flower}</th></tr></thead><tbody>
        <tr><td class="p-2 ta-left text-secondary"><div class="small m-left-20">can be grown from<br><b>${seed}</b> +</div></td></tr>
        ${via.map((v) => `<tr><td class="p-2 ta-left small"><img src="/img/delivery/${v}.png" class="img-15 m-right-5"/><span class="m-right-3">(1d)</span>${v}</td></tr>`).join("")}</tbody></table>`;
      res.writeHead(200, { "content-type": "text/html" });
      return res.end(`<html><body>${card("Red Pansy", "Sunpetal Seed", ["Radish", "Banana", "Red Cosmos"])}${card("Blue Lavender", "Lavender Seed", ["White Edelweiss", "Purple Clover"])}${card("Blue Balloon Flower", "Bloom Seed", ["Blueberry", "Blue Pansy"])}</body></html>`);
    }
    // Crafting Box y entregas de NPCs (HTML con el mismo marcado que sfl.world)
    if (url.pathname === "/world/info/crafting") {
      const cell = (n) => `<td class="wh30 border">${n ? `<img src="/img/delivery/${n}.png" title="${n}" class="img-25"/>` : ""}</td>`;
      const recipe = (name, grid) => `<div style="width: 11rem;" class="float-start"><div class="ta-center"><div class="b">${name}</div><div class="small">collectible</div></div>
        <table class="p-1 m-auto">${[0, 1, 2].map((r) => `<tr>${grid.slice(r * 3, r * 3 + 3).map(cell).join("")}</tr>`).join("")}</table></div>`;
      res.writeHead(200, { "content-type": "text/html" });
      return res.end(`<html><body><div class="ta-center bg-gray m-top-10 h5">Dolls</div><div class="row">${recipe("Doll", [null, "Wool", null, "Leather", "Leather", "Leather", null, "Wool", null])}${recipe("Buzz Doll", ["Honey", "Honey", "Honey", "Honey", "Doll", "Honey", "Honey", "Honey", "Honey"])}</div></body></html>`);
    }
    if (url.pathname === "/world/info/deliveries") {
      const npc = (name, avg, rows) => `<table class="p-3 small"><tr><td colspan="2" class="ta-left b">${name}</td></tr><tr><td class="ta-left">AVG Reward</td><td class="ta-left b"><img src="/img/coin.png"/>${avg}</td></tr></table>
        <table class="table"><tbody>${rows.map(([items, reward]) => `<tr><td class="ta-left"><table class="p-1">${Object.entries(items).map(([n, q]) => `<div><img src="/img/delivery/${n}.png"/>${n}: ${q}</div>`).join("")}</table></td><td class="ta-left">${reward ? `<img src="/img/coin.png"/>${reward}` : ""}</td><td class="ta-left">0.1</td></tr>`).join("")}</tbody></table>`;
      res.writeHead(200, { "content-type": "text/html" });
      return res.end(`<html><body><div>Updated <b>7 months ago</b></div><div class="card-header h5">FLOWER</div>${npc("GRIMBLY", "0.40", [[{ "Boiled Eggs": 2 }, null], [{ "Mashed Potato": 12 }, null]])}
        <div class="card-header h5">COINS</div>${npc("BETTY", "458", [[{ Barley: 15 }, 564], [{ Beetroot: 100 }, 632]])}</body></html>`);
    }
    const body = world(url);
    res.writeHead(body?.__status || (body ? 200 : 404), { "content-type": "application/json" });
    return res.end(JSON.stringify(body?.__status ? { error: body.error } : body || { error: "Not found" }));
  }
  if (!req.headers["x-api-key"]) { res.writeHead(401); return res.end('{"error":"API key is required"}'); }
  const body = handle(url);
  if (body?.__status) { res.writeHead(body.__status); return res.end(""); }
  res.writeHead(body ? 200 : 400, { "content-type": "application/json" });
  res.end(body ? JSON.stringify(body) : "");
}).listen(port, "127.0.0.1", () => console.log(`  mock API → http://127.0.0.1:${port}/community`));
