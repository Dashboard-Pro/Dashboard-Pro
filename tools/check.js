// Comprobación completa antes de publicar una versión: npm test
// 1) datos del juego coherentes  2) todos los endpoints con la demo  3) seguridad  4) historial y costes
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const PORT = 4196, MOCK = 4197; // ojo: 4190 está en la lista de puertos prohibidos de fetch
let failed = 0, passed = 0;
const ok = (cond, msg) => { if (cond) { passed++; } else { failed++; console.log(`  ✗ ${msg}`); } };
const section = (t) => console.log(`\n${t}`);

// ── Interfaz: cada página en un navegador sin ventana (Edge o Chrome) ────────
// Abre la demo en cada página y falla si algo se rompe: errores de JS o de pintado (<html data-js-errors>),
// módulos con error ("state err"), páginas sin dibujar o sin terminar de cargar. Un <img> dentro de un <svg> lo marca
// el propio dashboard como error de pintado (el navegador lo recoloca y ya no se ve en el HTML). Sin navegador, se omite.
// Edge en Windows no devuelve el HTML por la consola: se prueba cada uno y se usa el primero que responda
const BROWSERS = [process.env.SFL_BROWSER,
  "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge", "/usr/bin/google-chrome", "/usr/bin/chromium"].filter(Boolean);
function dumpDom(browser, url, profile) {
  return new Promise((resolve) => {
    const p = spawn(browser, ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", `--user-data-dir=${profile}`,
      "--virtual-time-budget=12000", "--dump-dom", url], { stdio: ["ignore", "pipe", "ignore"] });
    let out = "";
    p.stdout.on("data", (c) => (out += c));
    const kill = setTimeout(() => p.kill(), 60_000);
    p.on("close", () => { clearTimeout(kill); resolve(out); });
  });
}
// Qué falla en el HTML de una página dibujada (vacío = todo bien)
function uiProblems(dom, p) {
  const jsErr = dom.match(/data-js-errors="(\d+)"/)?.[1];
  const jsMsg = dom.match(/data-js-error="([^"]*)"/)?.[1]?.replace(/&quot;/g, '"').replace(/&amp;/g, "&");
  const errMods = (dom.match(/class="state err"/g) || []).length;
  const drawn = dom.includes(`data-drawn="${p}"`); // el dashboard arrancó y dibujó esta página
  const loading = (dom.match(/class="sk-row"/g) || []).length;
  return [!dom && "no cargó", dom && !drawn && "el dashboard no arrancó", jsErr && `${jsErr} errores de JS${jsMsg ? ` (último: ${jsMsg})` : ""}`,
    errMods && `${errMods} módulos con error`, loading && `${loading} filas siguen cargando`].filter(Boolean);
}
async function uiChecks() {
  section("Interfaz (navegador sin ventana)");
  let browser = null;
  for (const b of BROWSERS.filter((x) => fs.existsSync(x))) {
    if ((await dumpDom(b, `${base}/api/status`, path.join(tmp, "ui-probe"))).length) { browser = b; break; }
  }
  if (!browser) return console.log("  (omitido: no hay Chrome ni Edge que funcione sin ventana; se puede indicar con SFL_BROWSER)");
  const html = fs.readFileSync(path.join(root, "public/index.html"), "utf8");
  const pages = [...html.matchAll(/data-page="(\w+)"/g)].map((m) => m[1]);
  ok(pages.length >= 10, `el menú tiene todas las páginas (${pages.length})`);
  // De 4 en 4: la demo tiene su propia cola hacia el simulador
  for (let i = 0; i < pages.length; i += 4) {
    const batch = pages.slice(i, i + 4);
    const doms = await Promise.all(batch.map((p) => dumpDom(browser, `${base}/#${p}`, path.join(tmp, `ui-${p}`))));
    for (const [j, p] of batch.entries()) {
      let why = uiProblems(doms[j], p);
      // Con 4 navegadores a la vez a veces un archivo no llega a cargar (sobrecarga puntual): se repite una vez
      // sola. Si falla dos veces es un fallo de verdad; si solo una, se avisa con el mensaje pero no cuenta.
      if (why.length) {
        const again = uiProblems(await dumpDom(browser, `${base}/#${p}`, path.join(tmp, `ui-${p}-2`)), p);
        if (!again.length) console.log(`  (aviso) página ${p}: falló una vez y bien al repetir — ${why.join(", ")}`);
        why = again;
      }
      ok(!why.length, `página ${p}${why.length ? `: ${why.join(", ")}` : ""}`);
    }
  }
  // Idioma: la primera vez pregunta; en inglés las páginas se traducen y siguen sin errores
  const first = await dumpDom(browser, `${base}/#overview`, path.join(tmp, "ui-lang0"));
  ok(first.includes('class="lang-pick"') && first.includes('data-lang="en"'), "primera vez: pregunta el idioma");
  for (const p of ["overview", "strategy", "gcooking", "chapter"]) {
    let d = await dumpDom(browser, `${base}/?lang=en#${p}`, path.join(tmp, `ui-en-${p}`));
    let why = uiProblems(d, p);
    // Igual que en español: un fallo suelto de carga se repite una vez
    if (why.length) { d = await dumpDom(browser, `${base}/?lang=en#${p}`, path.join(tmp, `ui-en-${p}-2`)); why = uiProblems(d, p); }
    ok(!why.length && d.includes('lang="en"') && />Settings</.test(d) && !/>Ajustes</.test(d) && !d.includes('class="lang-pick"'), `inglés: ${p}${why.length ? `: ${why.join(", ")}` : ""}`);
  }
  // Con el idioma ya elegido, la primera vez arranca la mini guía por el dashboard
  const tourDom = await dumpDom(browser, `${base}/?lang=es#overview`, path.join(tmp, "ui-tour"));
  ok(tourDom.includes('id="tour"') && tourDom.includes("Saltar guía"), "primera vez: mini guía después de elegir idioma");
  // Skills: módulo de subir de rango con los Ascension Shards del jugador
  // Comprobaciones de contenido: como las páginas, un fallo suelto de carga se repite una vez
  const domCheck = async (hash, profile, test) => {
    const d = await dumpDom(browser, `${base}/?lang=es#${hash}`, path.join(tmp, profile));
    return test(d) || test(await dumpDom(browser, `${base}/?lang=es#${hash}`, path.join(tmp, `${profile}-2`)));
  };
  ok(await domCheck("skills", "ui-skranks", (sk) => sk.includes('id="sk-ranks"') && /6 Ascension Shards · \d+ pts? libres/.test(sk) && sk.includes("puedes subirla a rango 2")), "skills: subir de rango con Ascension Shards");
  // Resumen: proyectos del pueblo (Big Orange 25/25 = listo para recoger) y lo que vale lo que está listo
  ok(await domCheck("overview", "ui-ovproj", (ov) => /id="ov-projects"[\s\S]*Big Orange[\s\S]*¡Listo! recógelo/.test(ov) && ov.includes('id="ov-temps"') && /a precio de mercado/.test(ov)), "resumen: proyectos del pueblo, temporales y valor de lo listo");
  // Expansiones: calculadora con el mapa de parcelas y la tabla de lo que falta
  ok(await domCheck("gexpand", "ui-gexpand", (gx) => /class="xmap"/.test(gx) && /data-act="get:\d+"/.test(gx) && gx.includes("Nodos que ganas") && /<b>1<\/b>/.test(gx)), "expansiones: mapa de parcelas y calculadora");
  // Otra granja en solo lectura (?farm=ID): se dibuja con el aviso y la opción de volver a la tuya
  const other = await dumpDom(browser, `${base}/?farm=555#dig`, path.join(tmp, "ui-view"));
  ok(other.includes('data-drawn="dig"') && /id="viewBanner" class="view-banner"(?! hidden)[^>]*>[\s\S]*#555/.test(other) && !/data-js-errors="\d+"/.test(other), "ver otra granja (?farm=): aviso de solo lectura");
}

// ── 0. Nombres repetidos entre scripts: comparten el ámbito global y el último pisa al otro sin avisar ──
{
  const seen = {}, dup = [];
  for (const file of fs.readdirSync(path.join(root, "public/js")).filter((x) => x.endsWith(".js"))) {
    const src = fs.readFileSync(path.join(root, "public/js", file), "utf8");
    for (const m of src.matchAll(/^(?:async )?function (\w+)|^(?:const|let|var) (\w+)\s*=/gm)) {
      const n = m[1] || m[2];
      if (seen[n] && seen[n] !== file) dup.push(`${n} (${seen[n]} y ${file})`);
      else seen[n] = file;
    }
  }
  section("Scripts");
  ok(!dup.length, `sin nombres globales repetidos entre archivos${dup.length ? `: ${dup.join(", ")}` : ""}`);
  // Lo mismo en el CSS: una clase con dos reglas que fijan su "display" (pasó con .st-grid: el stock del Resumen y las
  // Estadísticas se pisaban y el stock salía en una sola columna)
  const css = fs.readFileSync(path.join(root, "public/app.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/@media[^{]*\{((?:[^{}]*\{[^{}]*\})*)[^{}]*\}/g, ""); // las de @media ajustan, no chocan
  const disp = {};
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const sel = m[1].trim();
    if (/^\.[\w-]+$/.test(sel) && /(^|;)\s*display\s*:/.test(m[2])) disp[sel] = (disp[sel] || 0) + 1;
  }
  // ?farm=ID y el buscador aceptan los IDs largos de las granjas nuevas (16 cifras; antes se cortaba en 12)
  const longId = "2965405693782714";
  const idRes = ["99-arranque.js", "12-ajustes-detalle.js"].flatMap((f) => [...fs.readFileSync(path.join(root, "public/js", f), "utf8").matchAll(/\/\^\\d\{1,(\d+)\}\$\//g)].map((m) => Number(m[1])));
  ok(idRes.length >= 2 && idRes.every((n) => n >= longId.length), "ver granja: IDs de 16 cifras admitidos");
  const clash = Object.keys(disp).filter((k) => disp[k] > 1);
  ok(!clash.length, `sin clases CSS definidas dos veces con su propio display${clash.length ? `: ${clash.join(", ")}` : ""}`);
}

// ── 1. Datos del juego ────────────────────────────────────────────────────────
section("Datos del juego");
global.window = {};
require(path.join(root, "public", "gamedata.js"));
const G = window.GAME;
const pos = (v) => typeof v === "number" && v > 0;
ok(Object.keys(G.crops).length >= 20 && Object.values(G.crops).every(pos), "tiempos de cultivos");
ok(Object.values(G.recovery).every(pos), "tiempos de recarga de nodos");
ok(Object.values(G.fruitSeeds).every(pos) && Object.values(G.fruitSeedOf).every((s) => s in G.fruitSeeds), "frutales");
ok(Object.values(G.flowerSeedOf).every((s) => s in G.flowerSeeds), "flores");
ok(Object.values(G.skills).every((s) => s.tree && s.points && s.tier && s.buff), "skills completas");
ok(Object.keys(G.skillTiers).length === new Set(Object.values(G.skills).map((s) => s.tree)).size, "tiers por árbol");
ok(Object.values(G.ticketRewards).every(pos), "tickets por NPC");
ok(Object.values(G.recipes).every((r) => Object.values(r.items).every(pos)), "recetas");
ok(Object.keys(G.levelExperience).length >= 100, "tabla de niveles");
ok(G.tradeResources?.includes("Wood") && G.tradeResources.includes("Sunflower"), "recursos comerciables (materia prima)");
ok(Object.keys(G.petNfts?.ids || {}).length > 1000 && G.petNfts.types.includes("Dragon"), "rasgos de los pets NFT");
{
  const { problemWith } = require("../cloud/gamedata-updater");
  ok(problemWith(G, G) === null && /itemIds/.test(problemWith({ ...G, itemIds: {} }, G) || "") && /encogido/.test(problemWith({ ...G, buffs: Object.fromEntries(Object.entries(G.buffs).slice(0, 250)) }, G) || ""), "la actualización automática solo acepta datos completos");
}
ok(G.pets?.types?.Barkley === "Dog" && G.pets.categories.Dragon?.length === 3 && G.pets.energy?.Moonfur > 0 && G.pets.requests?.hard?.length > 0, "reglas de mascotas (tipos, búsquedas, energía, peticiones)");
ok(G.factions?.ranks?.filter((r) => r.faction === "bumpkins").length >= 5 && G.factions.emblems?.bumpkins === "Bumpkin Emblem", "rangos de facción por emblemas");
ok(Object.keys(G.itemImages || {}).length > 1000 && Object.keys(G.itemIds).every((n) => G.itemImages[n]), "icono del juego para cada item");
ok(Object.keys(G.treasureSellPrices || {}).length >= 25 && G.treasureSellPrices.Pearl > 0, "precios de venta de los tesoros (conversor)");
{
  const aa = G.megastore?.["Ascension Age"] || [];
  ok(aa.find((i) => i.name === "Ascension Monument")?.cost.items["Shiny Feather"] === 4000 && aa.length >= 10, "tienda de Stella (megastore) con precios en tickets");
  ok((G.chapterTracks?.["Ascension Age"] || []).length >= 30 && G.chapterTracks._points?.chore === 3, "pase de recompensas del capítulo y puntos por tarea");
  ok((G.chapterCollections?.["Ascension Age"]?.mutants || []).length >= 5 && G.chapterCollections["Ascension Age"].auctioneer?.collectibles.length > 0, "colección del capítulo (mutantes y subasta)");
  ok(Object.keys(G.releases || {}).length > 500 && G.releases["Walrus Onesie"]?.withdraw > 0, "fechas de retiro de cada item (withdrawables.ts)");
  ok(G.buildings?.Kitchen?.level === 5 && G.buildingUpgrades?.["Hen House"]?.[2]?.coins > 0 && G.buildingUpgrades["Pet House"]?.[2]?.items?._petFetches === 1, "edificios y sus mejoras");
  ok(G.composters?.seasons?.["Compost Bin"]?.summer && G.lavaPit?.seasons?.winter && G.nodePrices?.["Crop Plot"]?.increase > 0, "compostadores, pozo de lava y forja solar");
  ok(Object.keys(G.floatingShop || {}).length > 10 && G.blacksmith?.["Scary Mike"]?.coins > 0 && G.weatherShop?.Mangrove, "tiendas: isla flotante, herrero y clima");
  {
    const E = G.expansionNodes?.basic, tot = { ...(E?.base || {}) };
    for (const c of Object.values(E?.add || {})) for (const [k, v] of Object.entries(c)) tot[k] = (tot[k] || 0) + v;
    ok(tot["Crop Plot"] === G.expansionNodes?.spring?.base?.["Crop Plot"] && Object.keys(G.expansionNodes.desert.add).length > 15, "nodos de cada expansión (cuadran con la isla siguiente)");
  }
  ok(G.npcGifts?.bonuses?.betty?.["Red Pansy"] > 0 && G.npcGifts.points?.["Red Pansy"] > 0 && G.npcGifts.gifts?.betty?.planned?.length > 2, "regalos de flores a los NPCs (gifts.ts)");
  ok(G.mapPieces?.base?.["Horse Mackerel"]?.marvel === "Starlight Tuna" && G.mapPieces.marvelChapter?.Crocodile === "Ascension Age", "piezas de mapa de las maravillas marinas");
  ok(G.npcDeliveryLevels?.guria === 40 && G.seedLevels?.["Sunflower Seed"] === 1, "niveles de las entregas de NPCs y de las semillas");
  ok((G.factionShop || []).length > 50 && G.factionShop.some((i) => i.name === "Bumpkin Throne" && i.price > 0 && i.faction === "bumpkins"), "tienda de facción de Eldric");
}
ok(Object.keys(G.sellPrices || {}).length >= 30 && G.sellPrices.Orange > 0 && G.sellPrices.Sunflower > 0, "precios de venta en la tienda (mejor conversión FLOWER → coins)");
ok(Object.keys(G.flowerSeedOf).length >= 53 && G.crossBreedAmounts?.["Lily Seed"]?.["Purple Pansy"] === 1, "flores y cantidades de cruce");
ok(Object.keys(G.foods || {}).length > 50 && G.foods["Pumpkin Soup"]?.xp > 0, "comidas con su XP y tiempo");
ok(G.expansions?.desert?.["18"]?.resources?.Wood > 0 && G.islandUpgrade?.desert?.to === "volcano", "requisitos de expansiones y subida de isla");
ok(G.chapterTickets?.["Ascension Age"], "ticket de cada capítulo");
ok(Object.keys(G.buffs || {}).length > 200 && /Cultivos|cultivos/.test(G.buffs["Basic Scarecrow"] || ""), "textos de boosts del juego en español");
ok(G.nftCollectibles?.length > 300 && !G.nftCollectibles.includes("Wood") && !G.nftCollectibles.includes("Red Pansy"), "NFT colocables sin recursos ni flores");
ok(Object.keys(G.diggingFormations || {}).length >= 30 && G.diggingFormations.OLD_BOTTLE?.length === 4 && G.desertGrid?.width === 10, "patrones de excavación del desierto");
ok(Object.values(G.chapterArtefact || {}).includes("Otter Pebble"), "artefacto de cada capítulo (excavación)");
{
  // Solver de excavación con un sitio real (granja 153785, 30-09-2026): 29 hoyos, 924 combinaciones posibles
  const { digSolve, digShape } = require("../public/js/14-herramientas.js");
  const names = ["ARTEFACT_TWENTY_ONE", "ARTEFACT_TWENTY_TWO", "ARTEFACT_FOURTEEN", "HIEROGLYPH", "OLD_BOTTLE", "SEA_CUCUMBERS", "CLAM_SHELLS"];
  const patterns = names.map((name) => ({ name, cells: digShape(G.diggingFormations[name], "Otter Pebble") }));
  const holes = [[2, 2, "Crab"], [3, 2, "Camel Bone"], [2, 3, "Crab"], [3, 3, "Camel Bone"], [6, 2, "Sand"], [7, 2, "Sand"], [6, 3, "Crab"], [7, 3, "Sand"], [2, 6, "Sand"], [3, 6, "Crab"], [2, 7, "Crab"], [3, 7, "Camel Bone"], [6, 6, "Sand"], [7, 6, "Sand"], [6, 7, "Sand"], [7, 7, "Crab"], [4, 0, "Crab"], [5, 0, "Sea Cucumber"], [4, 1, "Camel Bone"], [5, 1, "Camel Bone"], [4, 4, "Otter Pebble"], [5, 4, "Crab"], [4, 5, "Crab"], [5, 5, "Sand"], [3, 0, "Crab"], [4, 3, "Camel Bone"], [4, 6, "Sand"], [3, 1, "Otter Pebble"], [3, 5, "Otter Pebble"]].map(([x, y, item]) => ({ x, y, item }));
  const r = digSolve({ patterns, holes });
  const at = (x, y) => r.cells[y * 10 + x];
  const total = patterns.reduce((a, p) => a + p.cells.length, 0);
  ok(r.exact && r.total === 924 && Math.abs(at(1, 1).chance - 0.3983) < 1e-3 && at(1, 1).item === "Old Bottle", "excavación: probabilidades exactas en un sitio real");
  ok(at(6, 0).chance === 1 && at(6, 0).item === "Sea Cucumber" && at(8, 1).chance === 0, "excavación: tesoros seguros y casillas junto a arena");
  const st = Object.fromEntries(r.patterns.map((p) => [p.name, p]));
  ok(st.ARTEFACT_FOURTEEN.found && st.ARTEFACT_TWENTY_ONE.left === 1 && st.SEA_CUCUMBERS.left === 3 && st.OLD_BOTTLE.positions > 1, "excavación: patrones hallados, ubicados y por encontrar");
  ok(Math.abs(r.cells.reduce((a, c) => a + c.chance, 0) - total) < 1e-6, "excavación: las probabilidades suman los tesoros del día");
  const t0 = Date.now(), early = digSolve({ patterns, holes: holes.slice(0, 3) });
  ok(!early.impossible && Date.now() - t0 < 3000 && Math.abs(early.cells.reduce((a, c) => a + c.chance, 0) - total) < 1e-6, "excavación: rápido con pocos hoyos (aproximado)");
  ok(digSolve({ patterns, holes: [{ x: 0, y: 0, item: "Pirate Bounty" }] }).impossible, "excavación: detecta datos que no encajan");
  // Sitio real del 03-10-2026: 8 patrones y demasiadas combinaciones; el muestreo a ciegas no encontraba ninguna ("no encajan")
  const p8 = ["ARTEFACT_SIXTEEN", "ARTEFACT_TWENTY_THREE", "ARTEFACT_TWENTY_FOUR", "HIEROGLYPH", "HIEROGLYPH", "SEA_CUCUMBERS", "COCKLE", "CLAM_SHELLS"]
    .map((name) => ({ name, cells: digShape(G.diggingFormations[name], "Otter Pebble") }));
  const h8 = [[3, 2, "Vase"], [3, 3, "Hieroglyph"], [4, 1, "Camel Bone"], [5, 1, "Crab"], [3, 0, "Otter Pebble"], [3, 5, "Crab"], [4, 5, "Crab"], [3, 6, "Crab"], [4, 6, "Camel Bone"], [4, 4, "Sea Cucumber"]].map(([x, y, item]) => ({ x, y, item }));
  const r8 = digSolve({ patterns: p8, holes: h8 });
  ok(!r8.impossible && Math.abs(r8.cells.reduce((a, c) => a + c.chance, 0) - 30) < 1e-6 && r8.cells[4].chance === 1, "excavación: muchas combinaciones (muestreo guiado por las pistas)");
  // Skills a su nivel: el valor de nivel N con la misma forma que el texto del juego (nivel 1)
  const { rankValue } = require("../public/js/14-herramientas.js");
  const near = (a, b) => Math.abs(a - b) < 1e-9;
  ok(near(rankValue([0.9, 0.875, 0.85], 3, 0.9), 0.85) && near(rankValue([0.1, 0.2, 0.3], 2, 0.9), 0.8) && near(rankValue([0.2, 0.3], 2, 20), 30) && rankValue([0.5, 0.6], 1, 0.5) === 0.5,
    "skills a su nivel (x0,9 · −10% · +20% · nivel 1)");
  ok(G.animals?.loveXp?.["Petting Hand"] > 0 && G.animals.loveXp.Brush > G.animals.loveXp["Petting Hand"], "XP de las caricias de animales");
}
ok(G.seedPrices?.["Sunflower Seed"] === 0.01 && G.seedPrices["Lily Seed"] > 0 && G.seedStock?.["Sunflower Seed"] > 0 && G.greenhouseOil?.["Rice Seed"] > 0, "precios y stock de semillas, aceite del invernadero");
ok(G.cropMachineSeeds?.basic?.includes("Sunflower Seed") && Object.keys(G.cropMachineSeeds).length >= 2, "semillas de la Crop Machine");
{
  // Efectos calculables de los boosts (simulador): cantidad, % y tiempo, con zona de efecto
  const fx = (n) => JSON.stringify(G.boostFx?.[n] || []);
  ok(Object.keys(G.boostFx || {}).length > 150, "boosts con efecto calculable (simulador)");
  ok(/"k":"pct","t":"Wood","v":20/.test(fx("Apprentice Beaver")) && /"k":"time","t":"Wood","v":0.5/.test(fx("Apprentice Beaver")), "efecto: % de cantidad y tiempo (Apprentice Beaver)");
  ok(/"t":"crops:basic","v":0.7,"aoe":49/.test(fx("Basic Scarecrow")) && /"k":"add","t":"Egg","v":0.2/.test(fx("Ayam Cemani")), "efecto: zona de efecto y unidades fijas");
  ok(/"t":"Wood","v":0.9/.test(fx("skill:Tree Charge")) && /"t":"crops:basic","v":0.1/.test(fx("skill:Young Farmer")), "efecto de las skills");
  ok(!G.boostFx["Heart of Davy Jones"] && !G.boostFx["Goblin Armor"], "sin efectos inventados (excavación, marks)");
}
ok(G.animals?.levels?.Chicken?.[1] > 0 && G.animals.foodXp?.Chicken?.[0]?.Hay > 0 && G.animals.drops?.Cow?.[5]?.Milk > 0 && G.animals.requiredQty?.Cow === 5, "reglas de animales (niveles, XP de comida, producción, raciones)");
ok(G.animals?.foods?.["Barn Delight"]?.ingredients?.Lemon > 0 && G.animals.sleepHours > 0, "comida, medicina y sueño de los animales");
ok(G.npcLooks?.betty?.body && Object.keys(G.npcLooks).length > 50, "ropa de los NPCs para su retrato (npcs.ts)");
ok(G.skillUpgradePoints?.[1] === 1 && G.skillUpgradePoints[3] === 6 && G.skills?.["Chonky Scarecrow"]?.maxLevel === 3 && Object.values(G.skills).filter((s) => s.maxLevel > 1).length > 100,
  "rangos de las skills (máximo y puntos por subir con Ascension Shards)");
ok(G.skills?.["Nom Nom"]?.ranks?.length === 3 && G.skills["Betty's Friend"].ranks[0] > 0, "valores por nivel de las skills (boosts de entrega)");
ok(Object.keys(G.itemDims || {}).length > 300 && G.itemDims["Hen House"]?.[0] > 1, "tamaño de edificios y decoración (mapa)");
ok(G.chests?.BASIC_REWARDS?.length > 10 && G.chests.LUXURY_REWARDS?.every((r) => r.weighting > 0) && G.chests.BASIC_REWARDS.some((r) => r.items?.Gem > 0), "premios y pesos de los cofres");
ok(Object.keys(G.treasureSellPrices || {}).length > 10 && Object.keys(G.treasureSellPrices).every((n) => !(G.tradeResources || []).includes(n)) && Object.keys(G.sellPrices || {}).some((n) => G.tradeResources.includes(n)), "tesoros fuera del marketplace (solo tienda) y cultivos comerciables: base del conversor");
ok(Object.keys(G.fishing?.fish || {}).length > 40 && G.fishing.fish.Anchovy?.baits?.length && G.fishing.chum?.Sunflower > 0 && G.fishing.limit > 0, "peces, cebos y engodo");
const t = Date.now();
const chapter = Object.entries(G.chapters).find(([, c]) => t >= c.start && t < c.end)?.[0];
ok(chapter, "capítulo actual reconocido (si falla: npm run gamedata)");
ok(!chapter || (G.chapterBoosts[chapter] || []).length > 0, "boosts de tickets del capítulo actual");
const ageDays = (t - Date.parse(G.generatedAt)) / 86400_000;
if (ageDays > 30) console.log(`  ! gamedata.js tiene ${Math.round(ageDays)} días: ejecuta npm run gamedata`);

// ── 2-4. Servidor con la demo ─────────────────────────────────────────────────
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sfl-check-"));
const child = spawn(process.execPath, [path.join(__dirname, "demo.js")], {
  env: { ...process.env, PORT: String(PORT), MOCK_PORT: String(MOCK), SFL_RETRY_MS: "50,50,50", SFL_GAMEDATA_AUTO: "0", NOTIFY_WEBHOOK_OVERRIDE: `http://127.0.0.1:${MOCK}/hook`, SFL_NOTIFY_GAP_MS: "1", SFL_CONFIG: path.join(tmp, "config.json"), SFL_DATA_DIR: path.join(tmp, "data") },
  stdio: process.env.CHECK_VERBOSE ? "inherit" : "ignore",
});

// 127.0.0.1 y no "localhost": Node puede resolver localhost a ::1 y el servidor solo escucha en IPv4
const base = `http://127.0.0.1:${PORT}`;
async function req(p, opts = {}) {
  const r = await fetch(base + p, opts);
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* no JSON */ }
  return { status: r.status, json, text };
}
// fetch no deja cambiar Host: para esa prueba usamos http.request
function rawGet(p, headers) {
  return new Promise((resolve) => {
    require("node:http").get({ host: "127.0.0.1", port: PORT, path: p, headers }, (r) => { r.resume(); resolve(r.statusCode); }).on("error", () => resolve(0));
  });
}

// ── Actualizaciones de las copias descargadas (cloud/updater.js): versión, descarga del .tar.gz e instalación ──
async function updaterChecks() {
  const zlib = require("node:zlib");
  const { createUpdater, untar } = require(path.join(root, "cloud", "updater.js"));
  const dir = path.join(tmp, "upd");
  fs.mkdirSync(path.join(dir, "data"), { recursive: true });
  fs.writeFileSync(path.join(dir, "version.json"), JSON.stringify({ sha: "aaa", date: "2026-01-01T00:00:00Z" }));
  fs.writeFileSync(path.join(dir, "config.json"), '{"apiKey":"mia"}');
  fs.writeFileSync(path.join(dir, "data", "costs.json"), "{}");
  // .tar de prueba con la carpeta raíz de GitHub, un intento de salirse de la carpeta y archivos protegidos
  const entry = (name, body) => {
    const h = Buffer.alloc(512), b = Buffer.from(body);
    h.write(name, 0); h.write("0000644\0", 100); h.write(b.length.toString(8).padStart(11, "0") + "\0", 124); h.write("0", 156);
    return Buffer.concat([h, b, Buffer.alloc((512 - (b.length % 512)) % 512)]);
  };
  const tar = Buffer.concat([entry("Dashboard-Pro-main/server.js", "// nuevo"), entry("Dashboard-Pro-main/public/js/x.js", "x"),
    entry("Dashboard-Pro-main/config.json", '{"apiKey":"ajena"}'), entry("Dashboard-Pro-main/../fuera.txt", "no"),
    entry("Dashboard-Pro-main/data/costs.json", "pisado"), Buffer.alloc(1024)]);
  ok(untar(tar).length === 5, "actualizador: lee el paquete .tar de GitHub");
  const fakeFetch = async (u) => (u.includes("version.json")
    ? { ok: true, json: async () => ({ sha: "bbb", date: "2026-02-01T00:00:00Z" }) }
    : { ok: true, arrayBuffer: async () => zlib.gzipSync(tar) });
  const up = createUpdater({ root: dir, fetchImpl: fakeFetch, rawBase: "http://x", tarUrl: "http://x/t.tgz" });
  const i = await up.check(true);
  ok(i.enabled && i.available && i.method === "zip", "actualizador: detecta versión nueva en una copia descargada");
  const r = await up.apply();
  ok(r.files === 2 && fs.readFileSync(path.join(dir, "server.js"), "utf8") === "// nuevo" && fs.readFileSync(path.join(dir, "config.json"), "utf8").includes("mia")
    && fs.readFileSync(path.join(dir, "data", "costs.json"), "utf8") === "{}" && !fs.existsSync(path.join(tmp, "fuera.txt")),
    "actualizador: instala sin tocar config.json, data/ ni salirse de la carpeta");
  fs.rmSync(path.join(dir, "version.json"));
  ok(!(await up.check(true)).enabled, "actualizador: sin version.json (carpeta de desarrollo) no hace nada");
}

// ── Sincronización de data/ por git entre dos "ordenadores" (dos clones de un remoto en temporal) ──
async function gitSyncChecks() {
  const { execFileSync } = require("node:child_process");
  const { createGitSync } = require(path.join(root, "cloud", "gitsync.js"));
  const g = (cwd, ...args) => execFileSync("git", args, { cwd, stdio: "pipe" }).toString();
  try { g(tmp, "--version"); } catch { console.log("  ! sin git: se omite"); return; }
  const remote = path.join(tmp, "remote.git"), A = path.join(tmp, "pcA"), B = path.join(tmp, "pcB");
  g(tmp, "init", "-q", "--bare", "-b", "main", remote);
  g(tmp, "clone", "-q", remote, A);
  for (const d of [A]) { g(d, "config", "user.name", "t"); g(d, "config", "user.email", "t@t"); g(d, "checkout", "-q", "-b", "main"); }
  fs.mkdirSync(path.join(A, "data"));
  fs.writeFileSync(path.join(A, "README.md"), "x");
  fs.writeFileSync(path.join(A, "data", "costs.json"), JSON.stringify({ base: { value: 1, at: 1 } }));
  g(A, "add", "-A"); g(A, "commit", "-q", "-m", "init"); g(A, "push", "-q", "origin", "main");
  g(tmp, "clone", "-q", remote, B);
  g(B, "config", "user.name", "t"); g(B, "config", "user.email", "t@t");
  const sa = createGitSync({ repoDir: A, dataDir: path.join(A, "data") });
  const sb = createGitSync({ repoDir: B, dataDir: path.join(B, "data") });
  // Los dos escriben a la vez cosas distintas en el mismo archivo y precios de días distintos
  fs.writeFileSync(path.join(A, "data", "costs.json"), JSON.stringify({ base: { value: 1, at: 1 }, fromA: { value: 5, at: 10 } }));
  fs.writeFileSync(path.join(A, "data", "prices-2026-09.json"), JSON.stringify({ "2026-09-01": { x: 1 } }));
  fs.writeFileSync(path.join(B, "data", "costs.json"), JSON.stringify({ base: { value: 2, at: 20 }, fromB: { value: 7, at: 11 } }));
  fs.writeFileSync(path.join(B, "data", "prices-2026-09.json"), JSON.stringify({ "2026-09-02": { x: 2 } }));
  await sa.sync({ force: true });
  const rb = await sb.sync({ force: true });
  await sa.sync({ force: true });
  const ca = JSON.parse(fs.readFileSync(path.join(A, "data", "costs.json"), "utf8"));
  const cb = JSON.parse(fs.readFileSync(path.join(B, "data", "costs.json"), "utf8"));
  const pa = JSON.parse(fs.readFileSync(path.join(A, "data", "prices-2026-09.json"), "utf8"));
  ok(!rb.lastError, `sincroniza sin error (${rb.lastError?.message || "ok"})`);
  ok(ca.fromA && ca.fromB && cb.fromA && cb.fromB && ca.base.value === 2 && cb.base.value === 2, "los dos ordenadores acaban con los costes de ambos (gana el más reciente)");
  ok(pa["2026-09-01"] && pa["2026-09-02"], "precios de los dos ordenadores mezclados por día");
  // Un cambio de código sin guardar no se sube nunca
  fs.writeFileSync(path.join(B, "README.md"), "cambio a medias");
  await sb.sync({ force: true });
  ok(g(remote, "show", "main:README.md") === "x", "no sube código a medias, solo data/");
}

// ── Nube: server.js en modo cloud contra el mismo mock, con login de pruebas y premium encendido ──
const CLOUD_PORT = 4198;
const cloudBase = `http://127.0.0.1:${CLOUD_PORT}`;
let cloudChild = null;
async function cloudChecks(localPost, localFarm) {
  cloudChild = spawn(process.execPath, [path.join(root, "server.js")], {
    env: {
      ...process.env, SFL_MODE: "cloud", PORT: String(CLOUD_PORT), CLOUD_URL: cloudBase, CLOUD_DEV_LOGIN: "1",
      SFL_API_KEY: "sfl.demo", SFL_UPSTREAM: `http://127.0.0.1:${MOCK}/community`, SFL_MIN_GAP_MS: "150",
      SFL_CONFIG: path.join(tmp, "cloud-config.json"), SFL_DATA_DIR: path.join(tmp, "cloud-public"), CLOUD_DATA_DIR: path.join(tmp, "cloud-db"),
      CLOUD_TEST_CHALLENGE: "97531", PREMIUM_ENABLED: "1", KOFI_VERIFICATION_TOKEN: "tok-test",
      ALERTS_WEBHOOK_OVERRIDE: `http://127.0.0.1:${MOCK}/hook`, ALERTS_MIN_INTERVAL_MS: "1", SFL_WORLD: `http://127.0.0.1:${MOCK}/world`, SFL_OPENSEA: `http://127.0.0.1:${MOCK}/opensea`,
    },
    stdio: process.env.CHECK_VERBOSE ? "inherit" : "ignore",
  });
  for (let i = 0; i < 50; i++) {
    try { await fetch(cloudBase + "/api/status"); break; } catch { await new Promise((r) => setTimeout(r, 200)); }
  }
  let cookie = "";
  const c = async (p, opts = {}) => {
    const r = await fetch(cloudBase + p, { redirect: "manual", ...opts, headers: { ...(opts.headers || {}), ...(cookie ? { cookie } : {}) } });
    const sc = r.headers.getSetCookie?.() || [];
    const sess = sc.map((s) => s.split(";")[0]).find((s) => s.startsWith("sflc_session=") && s.length > 14);
    if (sess) cookie = sess;
    const text = await r.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* no JSON */ }
    return { status: r.status, json };
  };
  const cpost = (p, body) => c(p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body || {}) });

  const st = (await c("/api/status")).json;
  ok(st?.mode === "cloud" && !JSON.stringify(st).includes("sfl.demo"), "modo nube sin exponer la key del administrador");
  ok((await c("/api/me")).json?.loggedIn === false, "sin sesión al entrar");
  ok((await cpost("/api/config", { apiKey: "sfl.x" })).status === 403, "la web no permite configurar la key");
  ok((await c("/api/farm/29411")).status === 200, "la web lee granjas con la key del administrador");
  await c("/auth/dev?name=tester");
  const me1 = (await c("/api/me")).json;
  ok(me1?.loggedIn && me1.user.name === "tester", "login (de pruebas) crea la cuenta y la sesión");

  // Vincular la app local con un código de un solo uso y sincronizar
  const code = (await cpost("/api/link/code")).json?.code;
  ok(/^[A-Z2-9]{8}$/.test(code || ""), "código de vinculación");
  const linked = await localPost("/api/cloud/link", { url: cloudBase, code });
  ok(linked.status === 200 && linked.json.linked && !JSON.stringify(linked.json).includes("token"), "la app local se vincula (el token no sale al navegador)");
  ok((await localPost("/api/cloud/link", { url: cloudBase, code })).status === 400, "el código no se puede reutilizar");
  const docs = (await c("/api/sync")).json?.docs?.map((d) => d.doc) || [];
  ok(docs.includes(`trades:${localFarm.id}`) && docs.some((d) => d.startsWith("prices:")), "historial y precios subidos a la nube");
  ok((await c(`/api/history?farmId=${localFarm.id}`)).json?.trades?.length > 0, "la web muestra tu historial sincronizado");

  // Coste escrito en la web → llega al ordenador; borrado en el ordenador → desaparece en la web
  await cpost("/api/costs", { key: "collectibles-415", value: 12.5 });
  await localPost("/api/cloud/sync");
  ok((await req("/api/costs")).json["collectibles-415"]?.value === 12.5, "coste de la web sincronizado al ordenador");
  await localPost("/api/costs", { key: "collectibles-415", value: null });
  await localPost("/api/cloud/sync");
  ok(!("collectibles-415" in ((await c("/api/costs")).json || {})), "borrado en el ordenador sincronizado a la web");

  // Granja: provisional al vincular, verificada con un listado al precio pedido
  const me2 = (await c("/api/me")).json;
  ok(me2.farm?.status === "provisional", "granja vinculada como provisional por el ordenador");
  const ch = (await cpost("/api/farm/challenge", { farmId: me2.farm.id })).json;
  ok(ch?.challenge === 97531, "precio de verificación");
  ok((await cpost("/api/farm/verify")).json?.farm?.status === "verified", "granja verificada con el listado");

  // Premium: pago de Ko-fi con el código de la cuenta en el mensaje
  const pcode = me2.premium?.code;
  const kofi = (data) => fetch(cloudBase + "/api/billing/kofi", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ data: JSON.stringify(data) }) });
  ok((await kofi({ verification_token: "malo", message: pcode })).status === 403, "webhook de pagos rechaza tokens falsos");
  ok((await c("/api/alerts")).status === 402, "alertas de precio solo con premium");
  await kofi({ verification_token: "tok-test", message: `gracias! ${pcode}`, kofi_transaction_id: "tx1", amount: "1.00", currency: "EUR", type: "Subscription" });
  ok((await c("/api/me")).json?.premium?.active === true, "el pago activa premium en la cuenta");
  // Alerta de precio (premium) → aviso por el webhook de Discord del usuario
  ok((await cpost("/api/alerts/webhook", { url: "https://example.com/no" })).status === 400, "solo acepta webhooks de Discord");
  await cpost("/api/alerts/webhook", { url: "https://discord.com/api/webhooks/1/abc" });
  await cpost("/api/alerts", { item: "collectibles-601", name: "Wood", dir: "above", price: 0.0000001 });
  await c("/api/data?type=marketplaceActivity");
  await new Promise((r) => setTimeout(r, 400));
  const hooks = await fetch(`http://127.0.0.1:${MOCK}/hook/log`).then((r) => r.json());
  ok((await c("/api/alerts")).json?.alerts?.[0]?.firedAt > 0 && hooks.some((h) => /Wood/.test(h.content)), "la alerta salta y avisa por Discord");
  const { createCloud } = require(path.join(root, "cloud", "server.js"));
  const off = createCloud({ dataDir: path.join(tmp, "cloud-off"), publicUrl: "http://x", send() {}, readBody: async () => ({}), fetchData: async () => ({}), env: {} });
  ok(off.info().premium === false && off.premiumOf({ id: 1 }).active === false, "premium apagado por defecto");
  off.db.close();

  await localPost("/api/cloud/unlink");
  ok((await req("/api/cloud")).json?.linked === false, "desvincular el ordenador");
  ok((await cpost("/auth/logout")).status === 200 && (await c("/api/me")).json?.loggedIn === false, "cerrar sesión");
}

(async () => {
  for (let i = 0; i < 50; i++) {
    try { await fetch(base + "/api/status"); break; } catch { await new Promise((r) => setTimeout(r, 200)); }
  }
  try {
    section("Endpoints (demo)");
    const st = await req("/api/status");
    ok(st.status === 200 && st.json.hasKey, "status");
    ok((await req("/")).text.includes("SFL Console"), "página principal");
    {
      const r1 = await fetch(base + "/js/01-base.js", { headers: { "accept-encoding": "gzip" } });
      const et = r1.headers.get("etag");
      ok(r1.status === 200 && r1.headers.get("content-encoding") === "gzip" && (await r1.text()).includes("use strict"), "archivos comprimidos con gzip");
      ok(et && (await fetch(base + "/js/01-base.js", { headers: { "if-none-match": et } })).status === 304, "caché con ETag (304 si no cambió)");
    }
    { const u = await req("/api/update"); ok(u.status === 200 && u.json.enabled === false, "actualizaciones: la carpeta de desarrollo no se actualiza sola"); }
    const farm = await req("/api/farm/29411");
    ok(farm.status === 200 && farm.json.farm && farm.json.id, "granja");
    {
      // App: manifiesto e iconos propios servidos con su tipo
      const mf = await fetch(`${base}/manifest.webmanifest`);
      const mj = await mf.json().catch(() => null);
      const ic = await Promise.all((mj?.icons || []).map((i) => fetch(`${base}/${i.src}`).then((r) => r.ok && r.headers.get("content-type") === i.type)));
      ok(/manifest\+json/.test(mf.headers.get("content-type") || "") && mj.display === "standalone" && ic.length >= 2 && ic.every(Boolean) && (await fetch(`${base}/icon.ico`)).ok, "app: manifiesto e iconos");
    }
    {
      // Excavación en directo: ?fresh=1 solo guarda 5 s (lo normal, 45 s)
      const h1 = (await fetch(`${base}/api/farm/29411?fresh=1`)).headers.get("x-cache");
      await new Promise((r) => setTimeout(r, 5200));
      const h2 = (await fetch(`${base}/api/farm/29411?fresh=1`)).headers.get("x-cache"), h3 = (await fetch(`${base}/api/farm/29411`)).headers.get("x-cache");
      ok(h1 === "hit" && h2 === "miss" && h3 === "hit", "granja en directo para la excavación (caché de 5 s con ?fresh=1)");
    }
    for (const type of ["marketplaceActivity", "statsLeaderboard", "auctions", "raffles", "discordAnnouncements"]) {
      ok((await req(`/api/data?type=${type}`)).status === 200, `data ${type}`);
    }
    ok((await req("/api/data?type=tradeable&collection=collectibles&id=601")).status === 200, "data tradeable");
    ok((await req(`/api/data?type=ticketLeaderboard&farmId=${farm.json.id}&limit=100`)).status === 200, "data ticketLeaderboard");
    ok((await req("/api/data?type=noExiste")).status === 400, "tipo desconocido → 400");

    section("Historial y costes");
    const prof = await req(`/api/data?type=marketplaceProfile&farmId=${farm.json.id}`);
    ok(prof.status === 200, "perfil de mercado");
    const hist = await req(`/api/history?farmId=${farm.json.id}`);
    ok(hist.json?.trades?.length === prof.json.data.trades.length, "operaciones archivadas al leer el perfil");
    await req("/api/data?type=marketplaceProfile&farmId=555");
    ok(!(await req("/api/history?farmId=555")).json?.trades?.length, "el perfil de otra granja no se archiva en data/");
    const post = (p, body, headers = {}) => req(p, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
    await post("/api/costs", { key: "collectibles-601", value: 0.012 });
    ok((await req("/api/costs")).json["collectibles-601"]?.value === 0.012, "guardar coste");
    await post("/api/costs", { key: "collectibles-601", value: null });
    ok(!("collectibles-601" in (await req("/api/costs")).json), "borrar coste");
    await req("/api/data?type=marketplaceActivity");
    ok((await req("/api/prices?key=collectibles-601")).json?.series?.length >= 1, "foto diaria de precios");
    const many = (await req("/api/prices?keys=collectibles-601,collectibles-999999")).json?.series;
    ok(many?.["collectibles-601"]?.length >= 1 && Array.isArray(many?.["collectibles-999999"]), "precios de varios items en una petición");
    ok((await req("/api/prices?keys=_col-pets")).json?.series?.["_col-pets"]?.[0]?.floor > 0, "floor diario de la colección de pets");
    ok((await req("/api/prices?keys=_pet-Griffin")).json?.series?.["_pet-Griffin"]?.[0]?.floor === 900, "floor diario por tipo de pet");

    section("Rescate de compras antiguas");
    const rs = await post("/api/rescan", { farmId: farm.json.id, me: farm.json.id, keys: ["collectibles-601", "collectibles-415", "nada-1"] });
    ok(rs.status === 202 && rs.json.total === 2, "arranca la búsqueda (solo claves válidas)");
    for (let i = 0; i < 100 && (await req("/api/rescan")).json.running; i++) await new Promise((r) => setTimeout(r, 100));
    const after = (await req(`/api/history?farmId=${farm.json.id}`)).json.trades;
    ok(after.some((t) => t.id === "old-601" && t.via === "item") && after.some((t) => t.id === "old-415"), "compras antiguas rescatadas al archivo");
    ok((await req("/api/rescan")).json.found === 2, "recuento de rescatadas");

    section("Sincronización de data/ por GitHub");
    await gitSyncChecks();
    await updaterChecks();

    section("Nube (modo web, cuentas y sincronización)");
    await cloudChecks(post, farm.json);

    section("sfl.world");
    ok((await req("/api/ext/nfts")).json?.collectibles?.length > 0, "NFTs con boost y supply");
    ok((await req("/api/ext/exchange")).json?.sfl?.eur > 0, "cambio FLOWER → €");
    ok((await req("/api/ext/auctions")).json?.list?.[0]?.result?.leaderboard?.length > 0, "historial de subastas");
    ok((await req("/api/ext/boosts/29411")).json?.resources?.wood?.avg > 0, "boosts de la granja");
    ok((await req("/api/ext/land/29411")).json?.land?.marks >= 0, "resumen de la granja");
    ok((await req("/api/ext/user/GORDY")).json?.farm_id === 29411, "buscar jugador por nombre (sin mayúsculas)");
    ok((await req("/api/ext/user/nadie")).status === 404, "jugador inexistente → 404");
    {
      const fl = (await req("/api/ext/flowers")).json?.recipes;
      ok(fl?.["Blue Lavender"]?.seed === "Lavender Seed" && fl["Red Pansy"].via.join() === "Radish,Banana,Red Cosmos", "recetas de flores (HTML de sfl.world → JSON)");
      const cr = (await req("/api/ext/crafting")).json?.groups;
      ok(cr?.[0]?.name === "Dolls" && cr[0].recipes.find((r) => r.name === "Buzz Doll")?.grid[4] === "Doll" && cr[0].recipes[0].grid[0] === null, "recetas de la Crafting Box (rejilla 3×3 de sfl.world)");
      const dv = (await req("/api/ext/deliveries")).json;
      ok(dv?.npcs?.find((n) => n.npc === "betty")?.orders[0].reward === 564 && dv.npcs.find((n) => n.npc === "grimbly").kind === "FLOWER" && dv.updated, "pedidos posibles de cada NPC (sfl.world)");
    }
    {
      const os = await req("/api/ext/opensea");
      const it = os.json?.items?.["collectibles-601"] || Object.values(os.json?.items || {})[0];
      ok(os.status === 200 && Object.keys(os.json.items).length > 1 && it.usd > 0 && it.price > 0 && it.listings === 1 && it.qty === 3, "OpenSea: listado más barato por item (precio por unidad, en USD y WETH)");
      ok(!/os-demo/.test(os.text || JSON.stringify(os.json)) && !/os-demo/.test(JSON.stringify((await req("/api/status")).json)), "la key de OpenSea no sale al navegador");
    }
    ok((await req("/api/ext/boosts/abc")).status === 400 && (await req("/api/ext/noexiste")).status === 404, "parámetros y fuentes inválidos rechazados");

    section("Volcado nocturno (comunidad)");
    ok((await req("/api/dump/summary")).status === 404, "sin volcado procesado → 404");
    const jp = (p, b) => req(p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) });
    ok((await jp("/api/friends", { id: "3", name: "amiga" })).json?.["3"]?.value?.name === "amiga", "añadir un amigo");
    ok((await jp("/api/friends", { id: "4" })).status === 200 && (await jp("/api/friends", { id: "4", remove: true })).json?.["4"] === undefined, "quitar un amigo");
    ok((await jp("/api/friends", { id: "../x" })).status === 400, "ID de amigo inválido rechazado");
    ok((await req("/api/dump/now", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })).status === 202, "procesar el volcado en segundo plano");
    let dst;
    for (let i = 0; i < 100; i++) { dst = (await req("/api/dump")).json; if (!dst.running) break; await new Promise((r) => setTimeout(r, 100)); }
    ok(!dst.running && !dst.lastError && dst.dates.length === 1, "volcado procesado sin errores");
    ok((await req("/api/dump/now", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })).status === 429, "procesar otra vez enseguida se frena (son ~800 MB)");
    {
      const s = (await req("/api/dump/summary")).json;
      ok(s?.farms === 4 && s.skipped === 1, "cuenta las granjas y se salta las de la lista negra");
      ok(s.metrics?.level?.length === 101 && s.items?.Wood?.[1] === 4, "percentiles por métrica y suministro por item");
      ok(s.me?.metrics?.level > 0 && s.me.pct.level >= 0 && s.groups[`${s.me.island}|${s.me.band}`]?.n >= 1, "tu granja, tu posición y tu grupo");
      ok(s.friends?.["3"]?.metrics?.level === 40 && s.friends["3"].pct.level >= 0 && s.friends["3"].boosts.includes("Fairy Circle") && !s.friends["4"], "tus amigos salen en el resumen con su posición y boosts");
      ok(Object.keys(s.groups).some((k) => s.groups[k].boosts["Fairy Circle"]) && !Object.values(s.groups).some((g) => g.boosts.Wood), "boosts por grupo (sin recursos)");
    }
    ok((await req("/api/dump", { method: "POST", headers: { "content-type": "application/json" }, body: '{"enabled":true}' })).json?.enabled === true, "activar el volcado diario");
    {
      const h = (await req("/api/dump/history?ids=3")).json;
      ok(h?.me?.length === 1 && h["3"]?.[0]?.level === 40 && h["3"][0].date, "evolución diaria de tu granja y tus amigos");
      const lv = (await req("/api/friends/live/3")).json;
      ok(lv?.metrics?.level > 0 && lv.metrics.worth >= 0 && lv.at > 0, "un amigo en directo con las mismas métricas");
      ok((await req("/api/friends/live/abc")).status === 404, "ID en directo inválido rechazado");
    }
    ok((await fetch(`http://127.0.0.1:${MOCK}/world/_leak`).then((r) => r.json())).leaked === false, "la API key nunca se envía a sfl.world ni al CDN del volcado");

    section("Pasada de fondo (dashboard cerrado)");
    {
      const { spawnSync } = require("node:child_process");
      const bgData = path.join(tmp, "bg-data");
      const env = { ...process.env, SFL_API_KEY: "sfl.demo", SFL_FARM_ID: "29411", SFL_MIN_GAP_MS: "150", SFL_UPSTREAM: `http://127.0.0.1:${MOCK}/community`,
        SFL_WORLD: `http://127.0.0.1:${MOCK}/world`, SFL_DUMP_CDN: `http://127.0.0.1:${MOCK}/cdn`, SFL_CONFIG: path.join(tmp, "bg-config.json"), SFL_DATA_DIR: bgData };
      const run = (port) => spawnSync(process.execPath, [path.join(__dirname, "background-run.js")], { env: { ...env, PORT: String(port) }, encoding: "utf8", timeout: 60_000 });
      const closed = run(4202);
      ok(closed.status === 0 && fs.existsSync(path.join(bgData, "trades-121500.json")) && fs.readdirSync(bgData).some((f) => /^prices-\d{4}-\d{2}\.json$/.test(f)),
        "con el dashboard cerrado guarda tus operaciones y la foto de precios y sale");
      const open = run(PORT); // el puerto de la demo está ocupado = dashboard abierto
      ok(open.status === 0 && /Nada que hacer/.test(open.stdout), "con el dashboard abierto no hace nada (ya lo hace él)");
    }

    section("Sin sfl.world (datos oficiales y copia guardada)");
    {
      const dv = await fetch(`${base}/api/ext/deliveries`);
      const dj = await dv.json();
      const betty = dj.npcs?.find((n) => n.npc === "betty"), grim = dj.npcs?.find((n) => n.npc === "grimbly");
      ok(dv.headers.get("x-cache") === "dump" && dj.source === "dump" && betty?.kind === "COINS" && betty.orders[0].n === 4 && grim?.kind === "FLOWER" && Math.abs(grim.avg - 0.3875) < 1e-6, "pedidos de NPCs del volcado oficial (no de sfl.world)");
      const u = await fetch(`${base}/api/ext/user/THBD_demo`);
      ok(u.headers.get("x-cache") === "dump" && (await u.json()).farm_id === 121500, "buscar por nombre con el índice del volcado");
      ok(fs.existsSync(path.join(tmp, "data", "ext-cache", "ext_nfts_.json")), "copia en disco de lo último bueno de sfl.world");
      // Otro servidor con los mismos datos y sfl.world caído (puerto cerrado): sirve la copia guardada; el cambio de
      // moneda sin copia tira de la reserva (CoinGecko simulado)
      const P2 = 4201; // 4198 es el de la nube
      const c2 = spawn(process.execPath, [path.join(__dirname, "..", "server.js")], {
        env: { ...process.env, PORT: String(P2), SFL_API_KEY: "sfl.demo", SFL_FARM_ID: "29411", SFL_MIN_GAP_MS: "150", SFL_GAMEDATA_AUTO: "0",
          SFL_UPSTREAM: `http://127.0.0.1:${MOCK}/community`, SFL_WORLD: "http://127.0.0.1:9/api", SFL_COINGECKO: `http://127.0.0.1:${MOCK}/coingecko`,
          SFL_DUMP_CDN: `http://127.0.0.1:${MOCK}/cdn`, SFL_CONFIG: path.join(tmp, "config.json"), SFL_DATA_DIR: path.join(tmp, "data") },
        stdio: "ignore",
      });
      try {
        let up = false;
        for (let i = 0; i < 50 && !up; i++) { up = await fetch(`http://127.0.0.1:${P2}/api/status`).then(() => true, () => false); if (!up) await new Promise((r) => setTimeout(r, 100)); }
        const n2 = await fetch(`http://127.0.0.1:${P2}/api/ext/nfts`);
        ok(n2.status === 200 && ["hit", "stale"].includes(n2.headers.get("x-cache")) && (await n2.json()).collectibles?.length > 0, "sfl.world caído: sirve la copia guardada aunque se reinicie");
        fs.rmSync(path.join(tmp, "data", "ext-cache", "ext_exchange_.json"), { force: true });
        const fx2 = await fetch(`http://127.0.0.1:${P2}/api/ext/exchange`);
        const fj = await fx2.json();
        ok(fx2.headers.get("x-cache") === "fallback" && fj.sfl?.usd === 0.16 && fj.gems?.["650"]?.sfl > 0, "sfl.world caído y sin copia: FLOWER en $/€ y gemas de reserva");
        ok((await fetch(`http://127.0.0.1:${P2}/api/ext/crafting`)).status === 200, "recetas de la Crafting Box desde la copia guardada");
      } finally { c2.kill(); }
    }

    section("Patrimonio día a día");
    {
      const jp = (p, b) => req(p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) });
      const snap = { date: "2026-09-20", total: 1234.5, balance: 10, inv: 1224.5, items: { "collectibles-601": [100, 1.2], "pets-1": [1, 900] } };
      ok((await jp("/api/wealth?farmId=121500", { snapshot: snap })).json?.days === 1, "guardar la foto del día");
      ok((await jp("/api/wealth?farmId=121500", { snapshot: { ...snap, date: "ayer" } })).status === 400 && (await jp("/api/wealth?farmId=../x", { snapshot: snap })).status === 400, "fotos o granjas inválidas rechazadas");
      const w = (await req("/api/wealth?farmId=121500")).json;
      ok(w?.["2026-09-20"]?.total === 1234.5 && w["2026-09-20"].items["pets-1"][1] === 900, "leer las fotos guardadas");
      const { mergeDoc } = require("../cloud/merge");
      const m = mergeDoc("wealth:1", { "2026-09-20": { total: 1, at: 5 }, "2026-09-21": { total: 2, at: 1 } }, { "2026-09-20": { total: 9, at: 9 } });
      ok(m["2026-09-20"].total === 9 && m["2026-09-21"].total === 2, "fotos de dos ordenadores: unión por día, gana la más reciente");
    }

    section("Avisos a Discord");
    {
      const jp = (p, b) => req(p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) });
      ok((await jp("/api/notify/config", { url: "https://evil.example/hook" })).status === 400, "solo se aceptan webhooks de Discord");
      ok((await jp("/api/notify", { lines: ["x"] })).status === 400, "sin webhook no se envía nada");
      const cfg = (await jp("/api/notify/config", { url: "https://discord.com/api/webhooks/123456/abcdefghijklmnopqrstuvwxyz", cats: ["bees", "../x"] })).json;
      ok(cfg?.configured === true && cfg.cats.join() === "bees", "guardar webhook y categorías (filtradas)");
      ok(!JSON.stringify((await req("/api/notify")).json).includes("webhooks") && !JSON.stringify((await req("/api/status")).json).includes("webhooks"), "el webhook no vuelve al navegador");
      ok((await jp("/api/notify", { lines: ["Colmenas: Colmena ×3"] })).status === 202, "aviso aceptado");
      await new Promise((res) => setTimeout(res, 300));
      const log = await fetch(`http://127.0.0.1:${MOCK}/hook/log`).then((x) => x.json());
      ok(log.some((m) => /Colmenas: Colmena ×3/.test(m.content || "")), "el aviso llega al webhook agrupado");
      await jp("/api/notify/config", { clear: true });
    }

    section("Errores y reintentos");
    const flaky = await req("/api/farm/77777");
    const st2 = (await req("/api/status")).json;
    ok(flaky.status === 200, "un 502 puntual de SFL se recupera con reintentos");
    ok(st2.retried >= 2, "se cuentan los reintentos");
    ok(st2.lastError?.status === 502 && typeof st2.lastError.at === "number", "el último error lleva su hora");
    ok(st2.lastOkAt >= st2.lastError.at, "tras el error hubo una respuesta correcta (resuelto)");
    ok(st2.errorsLastHour >= 2, "recuento de errores de la última hora");
    ok((await req("/api/data?type=tradeable&collection=collectibles&id=999999")).status !== 500, "un 404/400 normal no rompe nada");

    await uiChecks();

    section("Seguridad");
    ok((await rawGet("/api/status", { Host: "evil.example:4196" })) === 403, "Host ajeno bloqueado (DNS rebinding)");
    ok((await req("/api/config", { method: "POST", headers: { "content-type": "text/plain" }, body: '{"farmId":"1"}' })).status === 403, "POST sin JSON bloqueado");
    ok((await post("/api/config", { farmId: "1" }, { origin: "https://evil.example" })).status === 403, "POST desde otra web bloqueado");
    ok((await rawGet("/..%2f..%2fserver.js", {})) >= 400, "path traversal bloqueado");
    ok(!JSON.stringify((await req("/api/status")).json).includes("sfl.demo"), "la key no sale por la API");
    ok((await post("/api/config", { apiKey: "sin-prefijo" })).status === 400, "key con formato inválido rechazada");
  } catch (e) {
    failed++;
    console.log("  ✗ excepción:", e.message, e.cause?.code || e.cause?.message || "");
  } finally {
    child.kill();
    cloudChild?.kill();
    await new Promise((r) => setTimeout(r, 300)); // que los procesos hijos suelten sus archivos (Windows)
    try { fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* temporal: se limpia solo */ }
    console.log(`\n${failed ? "✗" : "✓"} ${passed} correctas, ${failed} fallidas`);
    process.exit(failed ? 1 : 0);
  }
})();
