// SFL Console — Inventario valorado (como el de primerascripto): resumen por categorías, vender o guardar, cambios
// desde tu última foto y qué puedes cocinar o fabricar con lo que tienes.
// Scripts clásicos que comparten el ámbito global en el orden de index.html.
"use strict";

const INV_TABS = [["summary", "Resumen"], ["sell", "Vender o guardar"], ["sim", "Simular venta"], ["changes", "Cambios"], ["make", "Qué puedes hacer"]];
S.invTab = readLS("invTab", "summary");
S.invCat = "all";
S.invMake = readLS("invMake", "food");
const INV_TOKENS = new Set(["Gem", "Mark", "Love Charm", "Cheer", "Trade Point", "Potion Ticket", "CluckCoin", "Block Buck", "Solar Flare Ticket", "Dawn Breaker Ticket", "Crow Feather", "Mermaid Scale", "Tulip Bulb", "Scroll", "Amber Fossil", "Horseshoe", "Timeshard", "Geniseed", "Bud Ticket", "Treasure Key", "Rare Key", "Luxury Key"]);
const INV_TOOLS = new Set(["Axe", "Pickaxe", "Stone Pickaxe", "Iron Pickaxe", "Gold Pickaxe", "Rod", "Rusty Shovel", "Shovel", "Sand Shovel", "Sand Drill", "Oil Drill", "Crab Pot", "Mariner Pot", "Salt Rake", "Hammer", "Petting Hand", "Brush"]);
const INV_FEED = /Blend$|^Hay$|NutriBarley|Mixed Grain|Kernel|^Earthworm$|^Grub$|Red Wiggler|Fishing Lure|Umbrella Bait|Baitfish|Barn Delight|Omnifeed/;
const INV_CATS = [["all", "Todo"], ["token", "Fichas"], ["resource", "Recursos"], ["feed", "Comida animal y cebos"], ["seed", "Semillas"], ["crop", "Cultivos"],
  ["fruit", "Frutas"], ["greenhouse", "Invernadero"], ["flower", "Flores"], ["fish", "Pesca"], ["food", "Comida"], ["tool", "Herramientas"], ["collectible", "Coleccionables"], ["other", "Otros"]];
const INV_LABEL = Object.fromEntries(INV_CATS);
function invCat(n) {
  if (INV_TOKENS.has(n) || Object.values(G.chapterTickets || {}).includes(n)) return "token";
  if (/ Seed$| Plant$/.test(n)) return "seed";
  if (G.greenhouseCrops?.[n] != null || G.greenhouseFruitSeedOf?.[n] != null) return "greenhouse";
  if (G.crops?.[n] != null) return "crop";
  if (G.fruitSeedOf?.[n] != null) return "fruit";
  if (G.flowerSeedOf?.[n] != null) return "flower";
  if (G.fishing?.fish?.[n] != null) return "fish";
  if (G.foods?.[n] != null) return "food";
  if (INV_TOOLS.has(n)) return "tool";
  if (INV_FEED.test(n)) return "feed";
  if ((G.nftCollectibles || []).includes(n)) return "collectible";
  if ((G.tradeResources || []).includes(n)) return "resource";
  return "other";
}
function invModel() {
  const farm = store.farm.data.farm, h = has("activity") ? holdings() : null, price = has("activity") ? priceBook() : null;
  const byName = Object.fromEntries((h?.rows || []).map((r) => [r.name, r]));
  const rows = Object.entries(farm.inventory || {}).map(([name, q]) => {
    const qty = toNum(q);
    if (!(qty > 0) || name === "Basic Land") return null;
    const hr = byName[name];
    const p = hr ? hr.price : price ? price(name).v : null;
    return { name, qty, cat: invCat(name), price: p, value: p != null ? p * qty : null, key: G.itemIds?.[name] != null ? `collectibles-${G.itemIds[name]}` : null };
  }).filter(Boolean).sort((a, b) => (b.value ?? -1) - (a.value ?? -1) || b.qty - a.qty);
  return { rows, total: rows.reduce((s, r) => s + (r.value || 0), 0), coins: toNum(farm.coins) };
}
function wInvKpis() {
  const m = invModel();
  return `<div class="kstrip">
    ${Kcell("Valor total", `${fmt(m.total, 0)}<small>FLW</small>`, money(m.total), "sun")}
    ${Kcell("Objetos", fmt(m.rows.length, 0), `${m.rows.filter((r) => r.value != null).length} con precio · ${m.rows.filter((r) => r.value == null).length} sin precio`)}
    ${Kcell("Coins", compact(m.coins), `≈ ${fmt(m.coins / coinRate(), 2)} FLOWER a ${fmt(coinRate(), 0)} coins/FLOWER`)}
  </div>`;
}
function invSummary(m) {
  const top = m.rows.filter((r) => r.value).slice(0, 6);
  const byCat = {};
  for (const r of m.rows) if (r.value) byCat[r.cat] = (byCat[r.cat] || 0) + r.value;
  const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]), max = cats[0]?.[1] || 1;
  const counts = Object.fromEntries(INV_CATS.map(([k]) => [k, k === "all" ? m.rows.length : m.rows.filter((r) => r.cat === k).length]));
  const list = m.rows.filter((r) => S.invCat === "all" || r.cat === S.invCat);
  return `<div class="inv-top">${top.map((r, i) => `<div class="inv-card" ${r.key ? `data-open="${r.key}"` : ""}><span class="rankno">${i + 1}</span>${Gi(r.name, 32)}<b>${esc(r.name)}</b><span class="ctx">${compact(r.qty)} × ${fmt(r.price, r.price < 1 ? 3 : 0)}</span><b class="sun">${fmt(r.value, r.value < 10 ? 2 : 0)}</b></div>`).join("")}</div>
    <h4 class="acc-h">Valor por categoría</h4>
    ${cats.map(([k, v]) => `<div class="inv-bar"><span>${esc(INV_LABEL[k])}</span><i><b style="width:${((v / max) * 100).toFixed(1)}%"></b></i><span class="r">${fmt(v, v < 10 ? 2 : 0)}</span></div>`).join("")}
    <div class="inv-chips">${INV_CATS.filter(([k]) => counts[k]).map(([k, l]) => `<button class="${S.invCat === k ? "on" : ""}" data-act="invcat:${k}">${l} <span class="faint">${counts[k]}</span></button>`).join("")}</div>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Objeto</th><th>Categoría</th><th class="r">Cantidad</th><th class="r">Precio</th><th class="r">Valor</th></tr></thead><tbody>
      ${list.map((r) => `<tr ${r.key ? `data-open="${r.key}"` : ""}><td class="w">${Gi(r.name, 14)} ${esc(r.name)}</td><td class="dim">${esc(INV_LABEL[r.cat])}</td><td class="r">${compact(r.qty)}</td>
        <td class="r dim">${r.price != null ? fmt(r.price, r.price < 0.01 ? 5 : 3) : "—"}</td><td class="r">${r.value != null ? fmt(r.value, r.value < 10 ? 3 : 0) : "—"}</td></tr>`).join("")}
    </tbody></table></div>`;
}
// Vender o guardar: lo que paga el mercado frente a lo que te cuesta producirlo (líneas de Producción)
function invSell(m) {
  const lines = typeof prodLines === "function" ? prodLines().lines || [] : [];
  const cost = {};
  for (const l of lines) if (l.cost > 0 && l.amt > 0) { const c = l.cost / l.amt; if (cost[l.item] == null || c < cost[l.item]) cost[l.item] = c; }
  const fee = S.p2pTax ? 0.9 : 1;
  const rows = m.rows.filter((r) => r.price != null && cost[r.name] != null).map((r) => {
    const net = r.price * fee, c = cost[r.name];
    return { ...r, c, sell: net > c, gain: r.qty * (net - c) };
  }).sort((a, b) => b.gain - a.gain);
  if (!rows.length) return Empty("coin", "Sin datos", "Hace falta la página Producción para saber cuánto te cuesta cada recurso.");
  return `<p class="ctx">Para cada recurso que produces: lo que te paga el mercado${S.p2pTax ? " (menos la comisión)" : ""} frente a lo que te cuesta hacerlo en tu granja. Si el mercado paga más, véndelo: puedes rehacerlo más barato.</p>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Recurso</th><th class="r">Tienes</th><th class="r">Mercado</th><th class="r">Tu coste</th><th></th><th class="r">Si lo vendes</th></tr></thead><tbody>
      ${rows.map((r) => `<tr ${r.key ? `data-open="${r.key}"` : ""}><td class="w">${Gi(r.name, 14)} ${esc(r.name)}</td><td class="r dim">${compact(r.qty)}</td><td class="r">${fmt(r.price, 4)}</td><td class="r dim">${fmt(r.c, 4)}</td>
        <td>${r.sell ? `<span class="tag green">vender</span>` : `<span class="tag sun">guardar</span>`}</td><td class="r ${r.sell ? "up" : "faint"}">${r.sell ? `liberas ${fmt(r.gain, 2)}` : "—"}</td></tr>`).join("")}
    </tbody></table></div>`;
}
// Cambios: foto del inventario guardada en este navegador para ver qué cambia entre visitas
function invChanges(m) {
  let snap = null;
  try { snap = JSON.parse(localStorage.getItem("sfl-dash:invSnap") || "null"); } catch { /* sin almacenamiento */ }
  if (!snap) { invSaveSnap(m); return Empty("chest", "Primera foto guardada", "Vuelve más tarde para ver qué has ganado y gastado desde ahora."); }
  const cur = Object.fromEntries(m.rows.map((r) => [r.name, r.qty]));
  const names = [...new Set([...Object.keys(cur), ...Object.keys(snap.inv || {})])];
  const diff = names.map((n) => ({ name: n, a: toNum(snap.inv?.[n]), b: toNum(cur[n]) })).map((d) => ({ ...d, d: d.b - d.a })).filter((d) => Math.abs(d.d) > 1e-6);
  const gain = diff.filter((d) => d.d > 0).sort((a, b) => b.d - a.d), lost = diff.filter((d) => d.d < 0).sort((a, b) => a.d - b.d);
  const row = (d) => `<div class="bst-row"><span class="nm">${Gi(d.name, 14)} ${esc(d.name)} <span class="faint">${compact(d.a)} → ${compact(d.b)}</span></span><span class="${d.d > 0 ? "up" : "down"}">${d.d > 0 ? "+" : ""}${compact(d.d)}</span></div>`;
  return `<div class="row" style="justify-content:space-between;margin-bottom:8px"><span class="ctx">Foto del ${esc(dateShort(snap.at))} (${ago(snap.at)}), guardada en este navegador</span><button class="btn sm ghost" data-act="invsnap:">Guardar foto nueva</button></div>
    <div class="bst-grid" style="grid-template-columns:1fr 1fr"><div><h4 class="acc-h">Ganaste</h4>${gain.length ? gain.slice(0, 60).map(row).join("") : `<p class="ctx">Nada</p>`}</div>
    <div><h4 class="acc-h">Gastaste</h4>${lost.length ? lost.slice(0, 60).map(row).join("") : `<p class="ctx">Nada</p>`}</div></div>`;
}
function invSaveSnap(m) {
  try { localStorage.setItem("sfl-dash:invSnap", JSON.stringify({ at: now(), inv: Object.fromEntries(m.rows.map((r) => [r.name, r.qty])) })); } catch { /* sin almacenamiento */ }
}
// Qué puedes hacer: cocina (G.foods) y fabricación (G.recipes) con lo que tienes
function invMake() {
  const farm = store.farm.data.farm, price = has("activity") ? priceBook() : null;
  const src = S.invMake === "craft" ? G.recipes : G.foods;
  const rows = Object.entries(src || {}).map(([name, r]) => {
    const need = Object.entries(r.items || {}), coins = toNum(r.coins);
    let n = Infinity;
    const miss = [];
    for (const [it, q] of need) { const have = haveOf(it); n = Math.min(n, Math.floor(have / q)); if (have < q) miss.push([it, q - have]); }
    if (coins) { n = Math.min(n, Math.floor(toNum(farm.coins) / coins)); if (toNum(farm.coins) < coins) miss.push(["Coins", coins - toNum(farm.coins)]); }
    if (!need.length && !coins) return null;
    const cost = price ? need.reduce((s2, [it, q]) => s2 + (price(it).v ?? 0) * q, 0) + coins / coinRate() : null;
    return { name, r, n: Number.isFinite(n) ? n : 0, miss, cost, can: Number.isFinite(n) ? n : 0 };
  }).filter(Boolean);
  // Lo que puedes hacer ya primero; luego lo que se queda a un solo ingrediente
  const list = rows.filter((x) => x.n > 0 || x.miss.length === 1).sort((a2, b2) => canFirst(a2, b2) || b2.n - a2.n || (a2.miss[0]?.[1] ?? 0) - (b2.miss[0]?.[1] ?? 0)).slice(0, 60);
  return `<div class="seg" style="margin-bottom:10px">${[["food", "Cocina"], ["craft", "Fabricación"]].map(([k, l]) => `<button data-act="invmake:${k}" class="${S.invMake === k ? "on" : ""}">${l}</button>`).join("")}</div>
    ${list.length ? `<div class="cb-cards" style="padding:0">${list.map((x) => ItemCard({ name: x.name, can: x.can,
      tags: x.n ? `<span class="tag green">puedes ×${x.n}</span>` : `<span class="tag">te falta ${compact(x.miss[0][1])} ${esc(x.miss[0][0])}</span>`,
      sub: G.foods?.[x.name]?.building ? esc(G.foods[x.name].building) : "",
      body: IngList(x.r.items || {}, 1, toNum(x.r.coins)),
      stats: [["Ingredientes", x.cost != null ? fmt(x.cost, 2) : "—"], ["Puedes", x.n ? `${x.n}×` : "no", x.n ? "up" : "dim"]] })).join("")}</div>` : `<p class="ctx">Nada con lo que tienes ahora mismo.</p>`}`;
}
// Simular venta: vender un % de todo lo que tiene precio de mercado, con la comisión de verdad (recursos: la de tu isla, a la
// mitad con VIP y −2,5 con el Trading Shrine; lo demás 10%) y cómo cambia con o sin VIP / Trading Shrine
S.invPct = Number(readLS("invPct", 100)) || 100;
S.invSimSel = S.invSimSel || {};
function invSim(m) {
  const farm = store.farm.data.farm, isl = farm.island?.type || "basic";
  const isRes = (n) => (G.tradeResources || []).includes(n);
  const taxOf = (n, vip, shrine) => (isRes(n) ? Math.max(0, (ISLAND_TAX[isl] ?? 0.15) * (vip ? 0.5 : 1) - (shrine ? 0.025 : 0)) : 0.1);
  const vipNow = (farm.vip?.expiresAt || 0) > now(), shrineNow = tempWindows(farm).some((w) => w.name === "Trading Shrine" && w.from <= now() && w.to > now());
  const price = priceBook();
  const rows = m.rows.filter((r) => r.price != null && price(r.name).src === "mercado" && S.invSimSel[r.name] !== false).map((r) => {
    const q = r.qty * (S.invPct / 100), gross = q * r.price;
    return { ...r, q, gross, tax: taxOf(r.name, vipNow, shrineNow), net: gross * (1 - taxOf(r.name, vipNow, shrineNow)) };
  });
  const sum = (vip, shrine) => rows.reduce((s, r) => s + r.gross * (1 - taxOf(r.name, vip, shrine)), 0);
  const gross = rows.reduce((s, r) => s + r.gross, 0), net = sum(vipNow, shrineNow);
  const scen = [["Sin VIP ni shrine", false, false], ["Con VIP", true, false], ["Con Trading Shrine", false, true], ["Con los dos", true, true]];
  return `<div class="toolbar" style="padding:0 0 10px;gap:10px;flex-wrap:wrap"><span class="ctx">Vender</span>${SegAct([[25, "25%"], [50, "50%"], [100, "100%"]], S.invPct, "invpct")}
      <span class="ctx">de todo lo que tiene precio de mercado · isla ${esc(ISLAND_ES[isl] || isl)} (${fmt((ISLAND_TAX[isl] ?? 0.15) * 100, 0)}% en recursos)</span></div>
    <div class="kstrip">
      ${Kcell("Bruto", `${fmt(gross, 2)}<small>FLW</small>`, `${rows.length} objetos`)}
      ${Kcell("Comisión", `−${fmt(gross - net, 2)}<small>FLW</small>`, gross ? `${fmt(((gross - net) / gross) * 100, 1)}% de media` : "", "red")}
      ${Kcell("Te queda", `${fmt(net, 2)}<small>FLW</small>`, money(net), "sun")}
    </div>
    <div class="kstrip">${scen.map(([l, v, s]) => Kcell(l, `${fmt(sum(v, s), 2)}<small>FLW</small>`, v === vipNow && s === shrineNow ? "lo que tienes hoy" : `${signed(sum(v, s) - net, 2)} frente a ahora`, v === vipNow && s === shrineNow ? "sun" : "")).join("")}</div>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Objeto</th><th class="r">Vendes</th><th class="r">Precio</th><th class="r">Bruto</th><th class="r">Comisión</th><th class="r">Neto</th></tr></thead><tbody>
      ${rows.sort((a, b) => b.net - a.net).map((r) => `<tr><td class="w">${Gi(r.name, 20)} ${esc(r.name)}</td><td class="r mono">${compact(r.q)}</td><td class="r mono dim">${fmt(r.price, r.price < 0.01 ? 5 : 3)}</td>
        <td class="r mono">${fmt(r.gross, 3)}</td><td class="r mono dim">${fmt(r.tax * 100, 1)}%</td><td class="r mono"><b>${fmt(r.net, 3)}</b></td></tr>`).join("")}
    </tbody></table></div>`;
}
ACTIONS.invpct = (v) => { S.invPct = Number(v); writeLS("invPct", S.invPct); rerun(); };
function wInvBody() {
  const m = invModel();
  setSub("inv-body", `${m.rows.length} objetos`);
  if (S.invTab === "sell") return invSell(m);
  if (S.invTab === "sim") return has("activity") ? invSim(m) : Empty("coin", "Sin precios", "Cargando los precios del mercado…");
  if (S.invTab === "changes") return invChanges(m);
  if (S.invTab === "make") return invMake();
  return invSummary(m);
}

PAGES.inventory = function inventory() {
  const tabs = INV_TABS.map(([k, l]) => `<button data-act="invtab:${k}" class="${S.invTab === k ? "on" : ""}">${l}</button>`).join("");
  $("#page").innerHTML = `
    <div class="plate">${Mod({ id: "inv-k", span: 12, flush: true })}</div>
    <div class="plate">${Mod({ id: "inv-body", span: 12, title: "Tu inventario", icon: "chest", act: `<div class="seg">${tabs}</div>` })}</div>`;
  mount("inv-k", { deps: ["farm"], soft: ["activity", "activityPrev"], render: wInvKpis, loading: "block" });
  mount("inv-body", { deps: ["farm"], soft: ["activity", "activityPrev", "myBoosts"], render: wInvBody, loading: "rows" });
};
PAGE_META.inventory = { title: "Inventario", sub: () => "Lo que tienes valorado a precio de mercado: vender o guardar, qué cambió y qué puedes hacer" };
ACTIONS.invtab = (v) => { S.invTab = v; writeLS("invTab", v); go("inventory"); };
ACTIONS.invcat = (v) => { S.invCat = v; rerun(); };
ACTIONS.invmake = (v) => { S.invMake = v; writeLS("invMake", v); rerun(); };
ACTIONS.invsnap = () => { invSaveSnap(invModel()); toast("Foto nueva guardada"); rerun(); };
