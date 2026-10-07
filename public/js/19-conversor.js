// SFL Console — Conversor de monedas: cuántas coins saca cada FLOWER comprando en el mercado y vendiendo a la tienda.
// Scripts clásicos que comparten el ámbito global en el orden de index.html.
"use strict";

/* Reglas de venta del juego (expansion/lib/boosts.ts getSellPrice y treasureSold.ts):
   cultivos de parcela: Green Thumb (objeto antiguo) +5% y la skill Coin Swindler +10/20/30% por rango;
   tesoros de la playa: Treasure Map colocado +20% y Camel +30%. Frutas e invernadero no tienen boost de venta. */
const CONV_CATS = [["all", "Todos"], ["crop", "Cultivo"], ["fruit", "Fruta"], ["greenhouse", "Invernadero"], ["treasure", "Tesoro"]];
const CONV_LABEL = Object.fromEntries(CONV_CATS);
S.convCat = readLS("convCat", "all");
S.convSw = readLS("convSw", "auto"); // rango de Coin Swindler: "auto" = el tuyo, o 0-3 para probar

function convCat(name) {
  if (G.treasureSellPrices?.[name] != null) return "treasure";
  if (G.greenhouseCrops?.[name] != null || G.greenhouseFruitSeedOf?.[name] != null) return "greenhouse";
  if (G.crops?.[name] != null) return "crop";
  return "fruit";
}
function convBoosts(sw = S.convSw) {
  const farm = has("farm") ? store.farm.data.farm : null;
  const myRank = farm ? Math.min(3, Math.max(0, toNum(farm.bumpkin?.skills?.["Coin Swindler"]))) : 0;
  const rank = sw === "auto" ? myRank : Number(sw);
  const ranks = G.skills?.["Coin Swindler"]?.ranks || [0.1, 0.2, 0.3];
  const greenThumb = farm ? toNum(farm.inventory?.["Green Thumb"]) >= 1 : false;
  const map = farm ? isPlaced(farm, "Treasure Map") : false, camel = farm ? isPlaced(farm, "Camel") : false;
  return {
    myRank, rank, greenThumb, map, camel,
    crop: 1 + (greenThumb ? 0.05 : 0) + (rank ? ranks[rank - 1] : 0),
    treasure: 1 + (map ? 0.2 : 0) + (camel ? 0.3 : 0),
  };
}
// sw: rango de Coin Swindler ("auto" = el tuyo; el valor de las coins siempre usa el tuyo, no el que pruebes aquí)
function convModel(sw = S.convSw) {
  const items = store.activity.data.items, b = convBoosts(sw);
  const all = { ...(G.sellPrices || {}), ...(G.treasureSellPrices || {}) };
  const rows = Object.entries(all).map(([name, base]) => {
    const cat = convCat(name);
    const mult = cat === "crop" ? b.crop : cat === "treasure" ? b.treasure : 1;
    const coins = base * mult;
    const it = items[`collectibles-${G.itemIds?.[name]}`];
    // Los tesoros no se pueden comprar: sus anuncios son de antes de que los quitaran del marketplace
    const dead = deadMarket(name), floor = !dead && it?.floor && toNum(it.listingCount) > 0 ? it.floor : null;
    const have = has("farm") ? haveOf(name) : 0;
    return { name, cat, base, coins, mult, floor, rate: floor ? coins / floor : null, have, haveCoins: have * coins, listings: toNum(it?.listingCount), dead };
  });
  rows.sort((x, y) => (y.rate ?? -1) - (x.rate ?? -1) || y.coins - x.coins);
  return { rows, b, best: rows.find((r) => r.rate != null) || null };
}
function wConvKpis() {
  const { rows, b, best } = convModel();
  const bank = G.coinsPerFlower || 320;
  const sellable = rows.filter((r) => r.have > 0);
  const boostTxt = [b.greenThumb && "Green Thumb", b.rank && `Coin Swindler ${b.rank}`, b.map && "Treasure Map", b.camel && "Camel"].filter(Boolean);
  return `<div class="kstrip">
    ${Kcell("Mejor ruta ahora", best ? `${Gi(best.name, 20)} <span class="v-txt" style="display:inline">${esc(best.name)}</span>` : "—", best ? `${fmt(best.rate, 1)} coins por FLOWER` : "sin precios", "sun")}
    ${Kcell("Banco del juego", `${fmt(bank, 0)}<small>/ FLOWER</small>`, best ? `la mejor ruta da ×${fmt(best.rate / bank, 1)}` : "")}
    ${Kcell("Tus boosts de venta", boostTxt.length ? `<span class="v-txt">${esc(boostTxt.join(" · "))}</span>` : "—", `cultivos ×${fmt(b.crop, 2)} · tesoros ×${fmt(b.treasure, 2)}`)}
    ${Kcell("Lo tuyo en la tienda", `${compact(sellable.reduce((s, r) => s + r.haveCoins, 0))}<small>coins</small>`, `si vendieras los ${sellable.length} objetos vendibles que tienes`)}
  </div>`;
}
function wConvTable() {
  const { rows, b } = convModel();
  const list = rows.filter((r) => S.convCat === "all" || r.cat === S.convCat);
  setSub("cv-list", `${list.length} objetos · compra en el mercado, vende a la tienda`);
  const tip = (r) => `${r.name}|Tienda: ${fmt(r.base)} coins${r.mult !== 1 ? ` × ${fmt(r.mult, 2)} por tus boosts = ${fmt(r.coins, 2)}` : ""}${r.floor ? ` · mercado ${fmt(r.floor, 4)} FLOWER (${fmt(r.listings, 0)} listados)` : r.dead ? " · desactivado en el marketplace: no se puede comprar (los anuncios que quedan son antiguos), solo vender los tuyos a la tienda" : " · no se vende en el mercado"}|`;
  return `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Objeto</th><th>Tipo</th><th class="r">Precio P2P</th><th class="r">Monedas tienda</th><th class="r">Monedas por FLOWER</th><th class="r">Tienes</th><th class="r">Valen en tienda</th></tr></thead><tbody>
    ${list.map((r, i) => `<tr ${G.itemIds?.[r.name] != null ? `data-open="collectibles-${G.itemIds[r.name]}"` : ""} data-tip="${esc(tip(r))}">
      <td class="w">${Gi(r.name, 16)} ${esc(r.name)}${i === 0 && r.rate ? ` <span class="tag green">mejor</span>` : ""}</td><td class="dim">${esc(CONV_LABEL[r.cat])}</td>
      <td class="r">${r.floor ? fmt(r.floor, r.floor < 0.01 ? 6 : 4) : `<span class="faint">—</span>`}</td>
      <td class="r">${fmt(r.coins, r.coins < 1 ? 2 : 1)}${r.mult !== 1 ? ` <span class="faint">×${fmt(r.mult, 2)}</span>` : ""}</td>
      <td class="r">${r.rate ? `<b>${fmt(r.rate, 1)}</b>` : `<span class="faint">—</span>`}</td>
      <td class="r dim">${r.have ? compact(r.have) : "—"}</td><td class="r">${r.have ? compact(r.haveCoins) : "—"}</td></tr>`).join("")}
  </tbody></table></div>
  <div class="mod-f"><span>Banco oficial: ${fmt(G.coinsPerFlower || 320, 0)} coins por FLOWER · los tesoros no se venden en el mercado: solo cuentan lo tuyo</span><span>Coin Swindler ${S.convSw === "auto" ? `(tuyo: rango ${b.myRank})` : `probando rango ${S.convSw}`}</span></div>`;
}

PAGES.converter = function converter() {
  const swBtns = [["auto", "El mío"], ["0", "Ninguno"], ["1", "Rango 1"], ["2", "Rango 2"], ["3", "Rango 3"]]
    .map(([v, l]) => `<button data-act="convsw:${v}" class="${String(S.convSw) === v ? "on" : ""}">${l}</button>`).join("");
  const catBtns = CONV_CATS.map(([v, l]) => `<button data-act="convcat:${v}" class="${S.convCat === v ? "on" : ""}">${l}</button>`).join("");
  $("#page").innerHTML = `
    <div class="plate">${Mod({ id: "cv-k", span: 12, flush: true })}</div>
    <div class="plate">${Mod({ id: "cv-list", span: 12, title: "Monedas por FLOWER", icon: "coin", flush: true,
      act: `<span class="ctx">Coin Swindler</span><div class="seg">${swBtns}</div><div class="seg">${catBtns}</div>` })}</div>`;
  mount("cv-k", { deps: ["activity"], soft: ["farm"], render: wConvKpis, loading: "block" });
  mount("cv-list", { deps: ["activity"], soft: ["farm"], render: wConvTable, loading: "rows" });
};
PAGE_META.converter = { title: "Conversor de monedas", sub: () => "Compra en el mercado, vende a la tienda: las monedas que saca cada FLOWER según el objeto" };
ACTIONS.convcat = (v) => { S.convCat = v; writeLS("convCat", v); go("converter"); };
ACTIONS.convsw = (v) => { S.convSw = v === "auto" ? "auto" : v; writeLS("convSw", S.convSw); go("converter"); };
