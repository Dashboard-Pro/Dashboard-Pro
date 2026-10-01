// SFL Console — Nombres del mercado, barra lateral y superior, widgets compartidos.
// Scripts clásicos que comparten el ámbito global en el orden de index.html (antes, un solo app.js).
"use strict";

/* ════════════════════════════════════════════════════════════════════════
   6. Mercado: nombres e índices
   ════════════════════════════════════════════════════════════════════════ */
const revItems = () => (revItems.c ||= Object.fromEntries(Object.entries(G.itemIds).map(([n, i]) => [i, n])));
const revWearables = () => (revWearables.c ||= Object.fromEntries(Object.entries(G.wearableIds).map(([n, i]) => [i, n])));
function itemName(key) {
  const m = key.match(/^(collectibles|wearables|pets|buds)-(\d+)$/);
  if (m) {
    if (m[1] === "collectibles") return revItems()[m[2]] || `Item #${m[2]}`;
    if (m[1] === "wearables") return revWearables()[m[2]] || `Wearable #${m[2]}`;
    return `${m[1] === "pets" ? "Pet" : "Bud"} #${m[2]}`;
  }
  const e = key.match(/^economies-(.+)-(\d+)$/);
  return e ? `${e[1]} #${e[2]}` : key;
}
const colOf = (key) => key.split("-")[0];
const colIcon = (key) => ({ collectibles: "coin", wearables: "shirt", pets: "paw", buds: "sprout", economies: "hammer" })[colOf(key)] || "coin";

function marketRows() {
  const a = store.activity.data;
  const prev = has("activityPrev") ? store.activityPrev.data.items : null;
  const hasPrev = prev && Object.keys(prev).length > 0;
  if (marketRows.c?.a === a && marketRows.c?.p === prev) return marketRows.c.rows;
  const rows = Object.entries(a.items).map(([key, it]) => {
    const p = hasPrev ? prev[key] : null;
    return {
      key, name: itemName(key), collection: colOf(key), ...it,
      spread: it.floor && it.bestOffer ? ((it.floor - it.bestOffer) / it.floor) * 100 : null,
      todayVolume: hasPrev ? Math.max(0, (it.volume || 0) - (p?.volume || 0)) : null,
      todayTrades: hasPrev ? Math.max(0, (it.trades || 0) - (p?.trades || 0)) : null,
      change: p?.latestSale && it.latestSale ? ((it.latestSale - p.latestSale) / p.latestSale) * 100 : null,
      prevFloor: p?.floor ?? null,
    };
  });
  marketRows.c = { a, p: prev, rows };
  return rows;
}
const rowByKey = (key) => marketRows().find((r) => r.key === key);

// Rasgos de un pet NFT por su número (código del juego) → { type, fur, aura, bib }
function petTraitsOf(id) {
  const P = G.petNfts, t = P?.ids?.[id];
  return t ? { type: P.types[t[0]], fur: P.furs[t[1]], aura: P.auras[t[2]], bib: P.bibs?.[t[3]] } : null;
}
// Boost de un pet NFT según el juego (getPetBuffs): el aura multiplica la energía y el collar da XP
const PET_AURA_BOOST = { "Common Aura": "1,5× energía", "Rare Aura": "2× energía", "Mythic Aura": "3× energía" };
const PET_BIB_BOOST = { Collar: "+5 XP por comida", "Gold Necklace": "+10 XP por comida" };
const petBoostText = (t) => [PET_AURA_BOOST[t.aura], PET_BIB_BOOST[t.bib]].filter(Boolean).join(" · ");

// Valor de un pet sin precio propio, comparándolo con los del mercado que tienen el mismo boost.
// Grupos del más parecido al más general; se usa el primero con datos suficientes: la mediana de
// ventas si hay 3 o más, o el listado más barato (salvo en el grupo general de solo tipo).
function petTypeRef(items, id) {
  const me = petTraitsOf(id);
  if (!me) return null;
  // sid = clave de la serie diaria que guarda el servidor para ese grupo (petGroupIds en server.js)
  const groups = [
    { key: "tab", sid: `${me.type}|${me.aura}|${me.bib}`, label: `${me.type} + ${me.aura} + ${me.bib}`, match: (t) => t.type === me.type && t.aura === me.aura && t.bib === me.bib },
    // El boost lo dan aura y collar; el tipo solo cambia qué recursos trae: mismo boost va antes que mismo tipo
    { key: "ab", sid: `*|${me.aura}|${me.bib}`, label: `${me.aura} + ${me.bib} (mismo boost, cualquier tipo)`, match: (t) => t.aura === me.aura && t.bib === me.bib },
    { key: "ta", sid: `${me.type}|${me.aura}`, label: `${me.type} + ${me.aura}`, match: (t) => t.type === me.type && t.aura === me.aura },
    { key: "t", sid: me.type, label: `${me.type}`, match: (t) => t.type === me.type },
  ].map((g) => ({ ...g, floors: [], sales: [] }));
  for (const [k, it] of Object.entries(items)) {
    const m = k.match(/^pets-(\d+)$/);
    if (!m || m[1] === String(id)) continue;
    const tr = petTraitsOf(m[1]);
    if (!tr) continue;
    for (const g of groups) if (g.match(tr)) { if (it.floor > 0) g.floors.push(it.floor); if (it.latestSale > 0) g.sales.push(it.latestSale); }
  }
  for (const g of groups) {
    g.sales.sort((a, b) => a - b);
    g.floor = g.floors.length ? Math.min(...g.floors) : null;
    g.median = g.sales.length ? g.sales[g.sales.length >> 1] : null;
  }
  let pick = null;
  for (const g of groups) {
    if (g.sales.length >= 3) { pick = { group: g, value: g.median, basis: "ventas" }; break; }
    if (g.floor != null && g.key !== "t") { pick = { group: g, value: g.floor, basis: "listado" }; break; }
  }
  const typeG = groups[3];
  if (!pick && typeG.floor != null) pick = { group: typeG, value: typeG.floor, basis: "listado" };
  return { ...me, groups, pick, typeFloor: pick?.value ?? null };
}

// Inventario + wardrobe valorados a floor (o última venta si no hay listados).
function holdings() {
  if (!has("farm") || !has("activity")) return null;
  const farm = store.farm.data.farm;
  const items = store.activity.data.items;
  const prev = has("activityPrev") ? store.activityPrev.data.items : {};
  const rows = [];
  // Tu propio listado no es precio de mercado: si todos los listados del item son tuyos, su "floor"
  // es lo que tú pides, y se ignora (se usa la última venta o, en pets/buds, la estimación)
  const mine = myListings();
  const marketFloor = (it, name) => {
    const l = mine[name];
    return l && it?.floor != null && toNum(it.listingCount) <= l.count && it.floor >= l.unit - 1e-9 ? null : it?.floor;
  };
  const push = (name, qty, key) => {
    const it = items[key];
    if (!it || !qty) return;
    const price = marketFloor(it, name) ?? it.latestSale;
    if (!price) return;
    const pp = prev[key]?.floor ?? prev[key]?.latestSale;
    rows.push({ name, qty, price, value: qty * price, prevValue: pp ? qty * pp : null, key, bestOffer: it.bestOffer, liquid: it.bestOffer ? qty * it.bestOffer : 0 });
  };
  for (const [name, qty] of Object.entries(farm.inventory || {})) {
    const id = G.itemIds[name];
    if (id != null) push(name, toNum(qty), `collectibles-${id}`);
  }
  for (const [name, qty] of Object.entries(farm.wardrobe || {})) {
    const id = G.wearableIds[name];
    if (id != null) push(name, toNum(qty), `wearables-${id}`);
  }
  // Pets NFT y buds son únicos: su precio propio si lo tiene (listado o venta); si no, el floor de la
  // colección (el más barato a la venta), marcado como estimado
  const colFloor = (src, col) => {
    const f = Object.entries(src).filter(([k, it]) => k.startsWith(col + "-") && it.floor > 0).map(([, it]) => it.floor);
    return f.length ? Math.min(...f) : null;
  };
  const uniques = [
    ...Object.values(farm.pets?.nfts || {}).map((p) => ({ col: "pets", id: p.id, traits: p.traits })),
    ...Object.entries(farm.buds || {}).map(([id, b]) => ({ col: "buds", id: b.id ?? id, traits: b })),
  ];
  for (const u of uniques) {
    const key = `${u.col}-${u.id}`, it = items[key];
    const own = marketFloor(it, itemName(key)) ?? it?.latestSale;
    // Sin precio propio: un pet se valora al floor de los de su mismo tipo (un Dragon por los Dragon
    // listados); si no hay ninguno de su tipo, o es un bud, al de toda la colección
    const ref = u.col === "pets" && own == null ? petTypeRef(items, u.id) : null;
    const byType = ref?.typeFloor != null;
    const price = own ?? (byType ? ref.typeFloor : colFloor(items, u.col));
    if (!price) continue;
    const pp = own != null ? prev[key]?.floor ?? prev[key]?.latestSale : byType ? petTypeRef(prev, u.id)?.typeFloor : colFloor(prev, u.col);
    rows.push({ name: itemName(key), qty: 1, price, value: price, prevValue: pp ?? null, key, bestOffer: it?.bestOffer, liquid: it?.bestOffer || 0,
      estimate: own == null ? (byType ? "type" : "col") : null, petRef: ref, traits: u.traits });
  }
  rows.sort((a, b) => b.value - a.value);
  const total = rows.reduce((s, r) => s + r.value, 0);
  const withPrev = rows.filter((r) => r.prevValue != null);
  const prevTotal = withPrev.length ? withPrev.reduce((s, r) => s + r.prevValue, 0) + rows.filter((r) => r.prevValue == null).reduce((s, r) => s + r.value, 0) : null;
  return { rows, total, prevTotal, liquid: rows.reduce((s, r) => s + r.liquid, 0), usd: total * (store.activity.data.flowerPrice || 0) };
}

// Coins por FLOWER comprando en el mercado y vendiendo en la tienda del juego (G.sellPrices), de mejor a peor
function bestConversion(items) {
  const out = [];
  for (const [name, coins] of Object.entries(G.sellPrices || {})) {
    const it = items?.[`collectibles-${G.itemIds?.[name]}`];
    if (!it?.floor || !coins || !(toNum(it.listingCount) > 0)) continue;
    out.push({ name, coins, floor: it.floor, rate: coins / it.floor, listings: toNum(it.listingCount) });
  }
  return out.sort((a, b) => b.rate - a.rate);
}

// Dinero real: $ del informe oficial y € de sfl.world (si no ha cargado, solo $)
const eurPerFlower = () => store.fx?.data?.sfl?.eur || null;
function money(flower, d = 0) {
  const usd = store.activity?.data?.flowerPrice || store.fx?.data?.sfl?.usd || 0;
  const eur = eurPerFlower();
  return `≈ ${eur ? `${fmt(flower * eur, d)} € · ` : ""}$${fmt(flower * usd, d)}`;
}
// Precio de una gema en FLOWER: el paquete más barato por gema de la tienda (sfl.world)
function flowerPerGem() {
  const packs = Object.values(store.fx?.data?.gems || {}).filter((p) => p.gem > 0 && p.sfl > 0);
  return packs.length ? Math.min(...packs.map((p) => p.sfl / p.gem)) : null;
}

/* ════════════════════════════════════════════════════════════════════════
   7. Chrome: sidebar, barra superior, título de la pestaña
   ════════════════════════════════════════════════════════════════════════ */
function renderChrome() {
  const f = store.farm?.data;
  if (f) {
    const farm = f.farm;
    const xp = toNum(farm.bumpkin?.experience);
    const lv = bumpkinLevel(xp);
    const vipLeft = farm.vip?.expiresAt ? farm.vip.expiresAt - now() : 0;
    // Marco de fotos: retrato grande del Bumpkin, placa con el nombre y los datos debajo
    $("#sideFarm").innerHTML = `
      <figure class="sf-frame">
        ${sidePortrait(farm)}
        <figcaption class="sf-plaque"><div class="sf-name">${esc(farm.username || "Granja")}</div><div class="sf-id">#${esc(f.nft_id ?? f.id)} · ${esc(farm.island?.type || "isla")}</div></figcaption>
      </figure>
      <div class="sf-lvl"><b>Nv ${lv.lvl}</b><div class="xp" title="${fmt(lv.toNext, 0)} XP para el nivel ${lv.lvl + 1}"><i style="width:${(lv.p * 100).toFixed(1)}%"></i></div>${Math.round(lv.p * 100)}%</div>
      <div class="sf-grid">
        <div><span>Coins</span><b>${compact(toNum(farm.coins))}</b></div>
        <div><span>FLOWER</span><b>${fmt(toNum(farm.balance), 2)}</b></div>
        <div><span>Gemas</span><b>${fmt(toNum(farm.inventory?.Gem), 0)}</b></div>
        <div><span>VIP</span><b style="color:${vipLeft > 0 ? (vipLeft < 5 * 86400_000 ? "var(--orange)" : "var(--green)") : "var(--red)"}">${vipLeft > 0 ? dur(vipLeft) : "caducado"}</b></div>
      </div>`;
    const ready = readyCount();
    setBadge("farm", ready, (n) => `${n} ${n === 1 ? "cosa lista" : "cosas listas"} para recoger`);
    const sm = skillModel();
    const powersReady = Object.values(sm.trees).flatMap((tr) => tr.skills).filter((s) => s.power && s.owned && s.readyAt <= now()).length;
    setBadge("skills", powersReady, (n) => `${n} ${n === 1 ? "poder listo" : "poderes listos"} para usar`);
    try {
      const urgent = recommendations().filter((r) => r.prio === 1).length;
      setBadge("strategy", urgent, (n) => `${n} ${n === 1 ? "acción pendiente" : "acciones pendientes"} para hacer ya`);
      if (has("activity")) {
        const deliverable = missionModel().open.filter((o) => o.ready && !o.waiting).length;
        setBadge("missions", deliverable, (n) => `${n} ${n === 1 ? "entrega lista" : "entregas listas"} para entregar`);
      }
    } catch (err) { console.error(err); }
    document.title = `${ready ? `(${ready}) ` : ""}${farm.username ? farm.username + " · " : ""}SFL Console`;
  } else if (store.farm?.error) {
    const e = store.farm.error;
    $("#sideFarm").innerHTML = `<div class="sf-head"><div class="sf-av">${sprite("warn", 20)}</div><div style="min-width:0"><div class="sf-name">${S.farmId ? `Granja #${esc(S.farmId)}` : "Sin granja"}</div>
      <div class="sf-id">${e.code === "nofarm" ? "configúrala en Ajustes" : e.status === 401 ? "revisa la API key" : "sin conexión"}</div></div></div>`;
  } else if (S.farmId && !$("#sideFarm").children.length) {
    $("#sideFarm").innerHTML = `<div class="sf-skel"><span class="sk" style="height:34px;width:60%"></span><span class="sk"></span><span class="sk" style="width:80%"></span></div>`;
  }
  if (S.page) renderHeader();
  const a = store.activity?.data;
  if (a) {
    const chip = $("#flowerChip");
    chip.hidden = false;
    const eur = eurPerFlower();
    chip.innerHTML = `${sprite("flower", 12, true)}FLOWER <b>$${fmt(a.flowerPrice, 4)}</b>${eur ? `<span class="eur">· ${fmt(eur, 4)} €</span>` : ""}`;
    // Mejor conversión FLOWER → coins: comprar en el mercado lo que la tienda del juego recompra más caro
    // Mismo cálculo que la página Conversor (tesoros incluidos y tus boosts de venta); si no ha cargado, el básico
    const conv = typeof convModel === "function" ? convModel().rows.filter((r) => r.rate != null) : bestConversion(a.items), cc = $("#convChip");
    cc.hidden = !conv.length;
    if (conv.length) {
      const b = conv[0];
      cc.innerHTML = `${Gi("Coins", 12, "coin")}<span class="eur cv-l">mejor conversión</span> <b>${fmt(b.rate, 0)}</b><span class="eur">/ FLOWER</span>`;
      cc.dataset.tip = `Mejor conversión: ${fmt(b.rate, 1)} coins por FLOWER|Compra ${b.name} en el mercado a ${fmt(b.floor, 4)} FLOWER y véndelo en la tienda del juego por ${fmt(b.coins, 1)} coins. El banco solo da ${fmt(G.coinsPerFlower, 0)}.${conv.slice(1, 4).map((x) => ` · ${x.name}: ${fmt(x.rate, 0)}`).join("")}|con tus boosts de venta · floor de ahora (${fmt(b.listings, 0)} listados) · clic: conversor`;
    }
  }
  const auctions = store.auctions?.data;
  if (auctions) {
    const t = now();
    const live = auctions.some((x) => x.startAt <= t && x.endAt > t);
    setBadge("events", live ? "LIVE" : 0, () => "Hay una subasta en directo ahora mismo");
    $("#nb-events").classList.toggle("live", live);
  }
  const st = store.status?.data;
  if (st) {
    $("#driftState").textContent = `${S.clockOffset >= 0 ? "+" : ""}${fmt(S.clockOffset / 1000, 1)} s`;
    $("#callsState").textContent = `${st.upstreamCalls} · ${st.cacheHits} caché`;
  }
  setBusy(0);
}

// En las páginas donde se decide (Estrategia, Misiones), avisa si los datos no son fiables
function staleNote() {
  if (staleLevel() !== "bad") return "";
  const worst = Math.max(...dataAges().map((d) => d.age));
  return `<span class="page-stale">⚠ Datos de hace ${agoShort(worst)}: pueden no reflejar tu granja ahora · </span>`;
}

// Globo del menú lateral: número visible + explicación en tooltip y para lectores de pantalla
function setBadge(page, value, describe) {
  const em = $(`#nb-${page}`);
  const link = em?.closest("a");
  if (!em || !link) return;
  const label = link.querySelector("span")?.textContent || page;
  if (!value) {
    em.textContent = "";
    delete em.dataset.tip;
    link.removeAttribute("aria-label");
    return;
  }
  const text = describe(value);
  em.textContent = String(value);
  em.dataset.tip = `${label}|${text}|`;
  em.setAttribute("aria-hidden", "true");
  link.setAttribute("aria-label", `${label}: ${text}`);
  renderTabbar();
}

// Móvil: barra inferior con las pestañas del menú (data-tab de cada .nav-grp: varios grupos pueden ir en la misma).
// Una pestaña de una sola página navega directo; las demás abren una hoja con sus grupos. El globo suma los de sus páginas.
const NAV_TABS = { inicio: ["Inicio", "sun"], granja: ["Granja", "sprout"], mercado: ["Mercado", "coin"], guias: ["Guías", "scroll"], ajustes: ["Ajustes", "gear"] };
const tabGroups = (tab) => $$(`#nav .nav-grp[data-tab="${tab}"]`);
function renderTabbar() {
  const bar = $("#tabbar");
  if (!bar) return;
  const tabs = [...new Set($$("#nav .nav-grp").map((g) => g.dataset.tab || g.dataset.grp))];
  bar.innerHTML = tabs.map((tab) => {
    const links = tabGroups(tab).flatMap((g) => [...g.querySelectorAll("a[data-page]")]);
    const active = links.some((a) => a.dataset.page === S.page);
    const n = links.reduce((s, a) => s + (Number(a.querySelector("em")?.textContent) || 0), 0);
    const live = links.some((a) => a.querySelector("em")?.classList.contains("live"));
    const one = links.length === 1 ? links[0].dataset.page : "";
    const [label, icon] = NAV_TABS[tab] || [tab, "scroll"];
    return `<button type="button" class="${active ? "active" : ""}" data-tabgrp="${tab}" ${one ? `data-tabgo="${one}"` : 'aria-haspopup="true"'}>
      ${sprite(icon, 18, true)}<span>${esc(label)}</span>${n || live ? `<em class="${live ? "live" : ""}">${n || "•"}</em>` : ""}</button>`;
  }).join("");
}
function openTabSheet(tab) {
  const sheet = $("#tabSheet"), groups = tabGroups(tab);
  if (!sheet || !groups.length) return;
  if (!sheet.hidden && sheet.dataset.grp === tab) return closeTabSheet();
  sheet.dataset.grp = tab;
  sheet.innerHTML = groups.map((g) => `<div class="ts-h">${esc(g.dataset.label)}</div>${[...g.querySelectorAll("a[data-page]")].map((a) => a.outerHTML).join("")}`).join("");
  sheet.hidden = false;
}
// Ordenador: grupos plegables (clic en el título). Los de Guías empiezan plegados; el de la página abierta siempre se ve.
const navFolded = () => { const v = readLS("navFold", null); return v ? new Set(v) : new Set($$("#nav .nav-grp[data-fold]").map((g) => g.dataset.grp)); };
function renderNavFold() {
  const folded = navFolded();
  for (const g of $$("#nav .nav-grp")) {
    const open = !folded.has(g.dataset.grp) || [...g.querySelectorAll("a[data-page]")].some((a) => a.dataset.page === S.page);
    g.classList.toggle("folded", !open);
    g.querySelector(".nav-h")?.setAttribute("aria-expanded", String(open));
  }
}
function toggleNavFold(grp) {
  const folded = navFolded();
  const g = $(`#nav .nav-grp[data-grp="${grp}"]`);
  if (g?.classList.contains("folded")) folded.delete(grp); else folded.add(grp);
  writeLS("navFold", [...folded]);
  renderNavFold();
}
function closeTabSheet() { const sh = $("#tabSheet"); if (sh) sh.hidden = true; }

// Retrato del marco. Se pide al servidor del juego al tamaño exacto en pantalla (×2 en pantallas
// de alta densidad) para que el pixel art salga nítido. Se reutiliza entre repintados para no parpadear.
const PORTRAIT_PX = 170; // ancho interior real del marco en la barra lateral
function sidePortrait(farm) {
  const url = bumpkinImageUrl(farm.bumpkin?.equipped, Math.round(PORTRAIT_PX * Math.min(2, window.devicePixelRatio || 1)));
  const cur = $("#sideFarm .sf-photo");
  if (url && cur?.dataset.src === url) return cur.outerHTML;
  const alt = `Bumpkin de ${farm.username || "tu granja"}`;
  return `<div class="sf-photo${url ? "" : " fallback"}" data-src="${esc(url || "")}">
    ${url ? `<img src="${esc(url)}" alt="${esc(alt)}" width="${PORTRAIT_PX}" height="${PORTRAIT_PX}" onerror="this.parentElement.classList.add('fallback');this.remove()"/>` : ""}
    ${sprite("sprout", 48)}</div>`;
}

// Imagen del Bumpkin: el juego la genera en animations.sunflower-land.com a partir de las prendas
// equipadas (tokenUriBuilder del juego: 19 huecos con el ID de cada prenda, sin ceros al final).
const BUMPKIN_SLOTS = ["background", "body", "hair", "shirt", "pants", "shoes", "tool", "hat", "necklace", "secondaryTool",
  "coat", "onesie", "suit", "wings", "dress", "beard", "aura", "eyes", "mouth"];
function bumpkinImageUrl(equipped, size = 100) {
  if (!equipped) return null;
  const ids = BUMPKIN_SLOTS.map((s) => (equipped[s] ? G.wearableIds[equipped[s]] ?? 0 : 0));
  while (ids.length && !ids[ids.length - 1]) ids.pop();
  return ids.length ? `https://animations.sunflower-land.com/bumpkin_image/0_v1_${ids.join("_")}/${size}` : null;
}
// Jugador con su retrato para tablas: los rankings traen la ropa de cada fila, sin peticiones extra.
// Se pide a 64 px (nítido hasta DPR 2 en 28 px) y en lazy, que son hasta 100 filas por tabla.
// Con farmId es un botón que abre la ficha del jugador (playerCard).
// `extra` ({ level }) completa la ficha cuando la fila viene de fuera de los rankings (p. ej. sorteos)
const PC_SEEN = new Map();
function Player(name, equipped, farmId, extra) {
  if (farmId != null && (equipped || extra)) PC_SEEN.set(String(farmId), { bumpkin: equipped, ...extra });
  const url = bumpkinImageUrl(equipped, 64);
  const tag = farmId != null ? "button" : "span";
  const attrs = farmId != null ? ` type="button" data-player="${esc(farmId)}" data-pname="${esc(name)}" aria-haspopup="dialog" title="Ver ficha de ${esc(name)}"` : "";
  return `<${tag} class="pl"${attrs}><span class="pl-av${url ? "" : " fallback"}">${url ? `<img src="${esc(url)}" alt="" width="28" height="28" loading="lazy" decoding="async" onerror="this.parentElement.classList.add('fallback');this.remove()"/>` : ""}${sprite("sprout", 16)}</span><span class="pl-n">${esc(name)}</span></${tag}>`;
}

const PAGE_META = {
  overview: { title: "Resumen", sub: () => subFarm() },
  farm: { title: "Granja", sub: () => subFarm(true) },
  strategy: { title: "Estrategia", sub: () => `${staleNote()}Recomendaciones calculadas con tu granja, tus boosts y los precios de hoy · ritmo: entras cada <b>${S.visitH} h</b>` },
  missions: { title: "Misiones", sub: () => `${staleNote()}Entregas, tareas y bounties valorados a precio de mercado · coins a <b>${fmt(coinRate(), 0)}</b>/FLOWER` },
  skills: { title: "Skills", sub: () => {
    if (!has("farm")) return "Árbol de habilidades del Bumpkin";
    const m = skillModel();
    return `Nivel <b>${m.level}</b> · <b>${m.used}</b> de ${m.level} puntos gastados · <b>${m.free}</b> libres · isla ${ISLAND_ES[m.island] || m.island}`;
  } },
  market: { title: "Mercado", sub: () => (has("activity") ? `Informe <b>${store.activity.data.date}</b> · ${fmt(Object.keys(store.activity.data.items).length, 0)} items con mercado · precios en FLOWER por unidad` : "Marketplace de Sunflower Land") },
  nfts: { title: "NFTs", sub: () => `${staleNote()}Coleccionables, wearables, pets y buds: compra, evolución y beneficio` },
  ranks: { title: "Rankings", sub: () => (has("stats") ? `Top 100 del día <b>${store.stats.data.reportDate}</b> sobre ${compact(store.stats.data.scanned)} granjas activas` : "Clasificaciones globales") },
  pets: { title: "Mascotas", sub: () => "Nivel, energía, qué pueden traer y qué comida piden hoy" },
  dig: { title: "Excavación", sub: () => `${staleNote()}El sitio del desierto de hoy: lo que ya cavaste, los patrones y, con las pistas de Digby, dónde es más probable el tesoro` },
  faction: { title: "Facción", sub: () => (has("farm") && store.farm.data.farm.faction?.name ? `${esc(FACTION_ES[store.farm.data.farm.faction.name] || store.farm.data.farm.faction.name)} · la semana se reinicia el lunes a las ${hhmm(factionWeek().end)}` : "Tu facción") },
  friends: { title: "Amigos", sub: () => `Sus granjas comparadas con la tuya${store.dump?.data ? ` · volcado del <b>${store.dump.data.date}</b>` : ""}` },
  community: { title: "Comunidad", sub: () => (store.dump?.data ? `Volcado del <b>${store.dump.data.date}</b>: ${fmt(store.dump.data.farms, 0)} granjas activas en los últimos 90 días` : "Tu granja comparada con todas las demás") },
  events: { title: "Eventos", sub: () => "Subastas, sorteos y anuncios oficiales" },
  settings: { title: "Ajustes", sub: () => "Conexión con la Community API" },
};
function subFarm(detail) {
  if (!has("farm")) return S.farmId ? `Granja #${esc(S.farmId)}` : "Sin granja configurada";
  const f = store.farm.data;
  const saved = toTs(f.updatedAt);
  const ready = readyCount();
  return `<b>${ready}</b> listos de ${f.timers.length} temporizadores · último guardado ${Number.isFinite(saved) ? ago(saved) : "—"}${detail && S.farmFilter ? ` · filtro <b>${CATS[S.farmFilter].label}</b>` : ""}`;
}
function renderHeader() {
  const m = PAGE_META[S.page];
  $("#pageTitle").textContent = m.title;
  $("#pageSub").innerHTML = m.sub();
  renderViewBanner();
}
// Ver otra granja: la dirección lleva ?farm=ID (se puede compartir) y volver es quitarlo
const viewFarmUrl = (id) => `${location.pathname}${id != null && String(id) !== String(S.homeFarm) ? `?farm=${encodeURIComponent(id)}` : ""}${location.hash}`;
function renderViewBanner() {
  const el = $("#viewBanner");
  if (!el) return;
  el.hidden = !S.viewing;
  if (!S.viewing) return;
  const name = has("farm") ? store.farm.data.farm?.username : null;
  el.innerHTML = `${sprite("globe", 14)}<span>Estás viendo la granja <b>#${esc(S.viewing)}</b>${name ? ` de <b>${esc(name)}</b>` : ""} · solo lectura, no se guarda nada suyo</span>
    <a class="btn sm" href="${esc(viewFarmUrl(S.homeFarm))}">${S.homeFarm ? "Volver a la tuya" : "Salir"}</a>`;
}

/* ════════════════════════════════════════════════════════════════════════
   8. Widgets compartidos
   ════════════════════════════════════════════════════════════════════════ */
function wReadyNow() {
  const f = store.farm.data;
  const per = perCategory(f.timers);
  const total = readyCount();
  const hot = Object.entries(per).filter(([, v]) => v.ready).sort((a, b) => b[1].ready - a[1].ready);
  const t = now();
  const within = (h) => f.timers.filter((x) => x.ready > t && x.ready <= t + h * 3600_000).length;
  setSub("ov-ready", `${f.timers.length} activos`);
  return `<div class="fill"><div class="hero-ready"><div class="big ${total ? "green" : "parch"}">${total}</div>
      <div class="lbl"><b>${total ? "para recoger ahora" : "todo está creciendo"}</b><span class="ctx">${hot.length} de ${Object.keys(per).length} categorías con algo listo</span></div></div>
    ${hot.length ? `<div class="rchips">${hot.map(([k, v]) => `<button class="rchip" data-go="farm" data-filter="${k}" title="Ver ${CATS[k].label} en Granja">${sprite(CATS[k].spr, 14)}<b>${v.ready}</b>${CATS[k].label}</button>`).join("")}</div>`
      : `<p class="ctx" style="margin:14px 0 0">Te avisamos cuando madure lo siguiente.</p>`}
    <div class="forecast push">${[[1, "1 h"], [3, "3 h"], [12, "12 h"]].map(([h, l]) => `<div><span class="eyebrow">en ${l}</span><b>+${within(h)}</b></div>`).join("")}</div></div>`;
}

function wNextUp() {
  const t = now();
  const up = groupTimers(store.farm.data.timers.filter((x) => x.ready > t)).slice(0, 5);
  if (!up.length) return Empty("sprout", "Nada creciendo", "Planta algo y aparecerá aquí.");
  const [first, ...rest] = up;
  setSub("ov-next", `a las ${hhmm(first.ready)}`);
  return `<div class="next-hero"><div class="ico">${sprite(CATS[first.cat].spr, 32)}</div>
      <div style="min-width:0"><div class="big parch" data-ready="${first.ready}">${dur(first.ready - t)}</div>
      <div class="ctx" style="margin-top:6px"><b>${esc(first.name)}</b>${first.count > 1 ? ` ×${first.count}` : ""} · ${CATS[first.cat].label}</div></div></div>
    <div class="qlist">${rest.map((u) => `<div class="qrow">${sprite(CATS[u.cat].spr, 14)}<span class="nm">${esc(u.name)}${u.count > 1 ? `<em>×${u.count}</em>` : ""}</span><span class="at">${at(u.ready)}</span>${Cd(u.ready, "cd")}</div>`).join("")}</div>`;
}

const STACK_COLORS = ["#f5c542", "#86e05c", "#6cb4ee", "#f0a24a", "#b596f0", "#f08bd0"];
function wWealth() {
  const h = holdings();
  if (!h.rows.length) return Empty("coin", "Sin items con mercado", "Nada de tu inventario tiene precio en el marketplace.");
  const farm = store.farm.data.farm;
  const bal = toNum(farm.balance);
  const fp = store.activity.data.flowerPrice || 0;
  const delta = h.prevTotal ? ((h.total - h.prevTotal) / h.prevTotal) * 100 : null;
  const top = h.rows.slice(0, 5);
  const rest = h.total - top.reduce((s, r) => s + r.value, 0);
  const parts = [...top.map((r, i) => ({ name: r.name, value: r.value, color: STACK_COLORS[i] })), ...(rest > 0 ? [{ name: "Resto", value: rest, color: "#3b4a33" }] : [])];
  setSub("ov-wealth", money(h.total + bal));
  recordWealth(h, bal);
  const gems = toNum(farm.inventory?.Gem), fpg = flowerPerGem();
  return `<div class="wealth"><div class="big sun">${fmt(h.total + bal, 0)}</div>
      <div class="ctx" style="margin-top:6px">FLOWER · inventario <b>${fmt(h.total, 0)}</b> + saldo <b>${fmt(bal, 1)}</b>${delta != null ? ` · <span class="${Math.abs(delta) < 0.05 ? "faint" : delta > 0 ? "up" : "down"}">${pct(delta)}</span> vs floor de ayer${Legend("delta")}` : ""}</div></div>
    <div class="stackbar">${parts.map((p) => `<i style="flex:${p.value};background:${p.color}" data-tip="${esc(`${p.name}|${fmt(p.value, 1)} FLOWER|${fmt((p.value / h.total) * 100, 1)}% del inventario`)}"></i>`).join("")}</div>
    <div class="legend">${parts.map((p) => `<div><i style="background:${p.color}"></i><span>${esc(p.name)}</span><span class="n">${fmt((p.value / h.total) * 100, 0)}%</span></div>`).join("")}</div>
    <div class="ctx" style="margin-top:12px">Liquidez inmediata (vendiendo a la mejor oferta): <b>${fmt(h.liquid, 0)}</b> FLOWER</div>
    ${gems && fpg ? `<div class="ctx" style="margin-top:4px" data-tip="${esc(`Gemas|No se pueden vender, así que no suman al patrimonio. Esto es lo que costaría comprarlas en la tienda con el paquete más barato por gema (${fmt(fpg, 4)} FLOWER/gema).|fuente: sfl.world`)}">Tus <b>${fmt(gems, 0)}</b> gemas costarían <b>${fmt(gems * fpg, 0)}</b> FLOWER (no suman)</div>` : ""}`;
}

// ── Patrimonio día a día ─────────────────────────────────────────────────────
// Cada vez que se calcula (Resumen) se guarda una foto del día en data/wealth-<granja>.json, como mucho cada
// 30 min. Los días anteriores a la primera foto se estiman: lo que tienes hoy a los precios de cada día.
let lastWealthPost = 0;
function recordWealth(h, balance) {
  if (!h?.rows?.length || !S.farmId || S.viewing || S.mode === "cloud" || now() - lastWealthPost < 30 * 60_000) return;
  lastWealthPost = now();
  const items = Object.fromEntries(h.rows.slice(0, 300).map((r) => [r.key, [r.qty, Number(r.value.toFixed(4))]]));
  const snapshot = { date: todayUTC(), total: Number((h.total + balance).toFixed(2)), balance: Number(balance.toFixed(2)), inv: Number(h.total.toFixed(2)), items };
  jpost(`/api/wealth?farmId=${encodeURIComponent(store.farm.data.id ?? S.farmId)}`, { snapshot })
    .then(() => { if (store.wealth) store.wealth.at = 0; })
    .catch(() => { lastWealthPost = 0; });
}
// Serie diaria: fotos reales + estimación hacia atrás con el histórico de precios × lo que tienes hoy
function wealthModel() {
  const h = holdings();
  if (!h) return null;
  const snaps = store.wealth?.data?.snaps || {};
  const series = store.wealth?.data?.series || {};
  const bal = toNum(store.farm.data.farm.balance);
  const today = todayUTC();
  // Estimación: lo que tienes hoy a los precios de cada día (pets/buds por su serie de grupo). Si a un item le
  // falta el precio de un día se usa el más cercano; sin precio guardado nunca, el de hoy. Así ningún día
  // "pierde" un item caro solo porque ese día no se guardó su precio.
  const dates = [...new Set(h.rows.flatMap((r) => (series[wKey(r)] || []).map((p) => p.date)))].filter((d) => d < today).sort();
  const priceOn = (r, date) => {
    const s = series[wKey(r)] || [];
    if (!s.length) return r.price;
    const before = s.filter((p) => p.date <= date).pop();
    return (before || s[0]).floor;
  };
  const est = (date) => h.rows.reduce((sum, r) => sum + priceOn(r, date) * r.qty, 0);
  const pts = [...new Set([...dates, ...Object.keys(snaps)])].sort().filter((d) => d < today).map((date) => {
    const s = snaps[date];
    return s ? { date, v: s.total, real: true, snap: s } : { date, v: est(date) + bal, real: false };
  });
  pts.push({ date: today, v: h.total + bal, real: true, now: true });
  return { pts, h, bal, snaps, priceOn };
}
// Lo que más ha subido y bajado desde hace N días: con fotos reales si hay, si no por precio × cantidad de hoy
function wealthMovers(m, daysBack = 7) {
  const from = m.pts.find((p) => Date.parse(p.date) >= Date.parse(todayUTC()) - daysBack * DAY_MS) || m.pts[0];
  if (!from || from.now) return { from: null, rows: [] };
  const rows = m.h.rows.map((r) => {
    const before = from.snap?.items?.[r.key]?.[1] ?? m.priceOn(r, from.date) * r.qty;
    return { r, before, delta: r.value - before };
  }).filter((x) => Math.abs(x.delta) >= 0.5).sort((a, b) => b.delta - a.delta);
  return { from, rows };
}
function wealthChart(pts) {
  const W = 620, H = 180, pl = 56, pr = 12, pt = 12, pb = 24;
  const vals = pts.map((p) => p.v);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  const pad = (hi - lo) * 0.15 || hi * 0.05 || 1;
  lo = Math.max(0, lo - pad); hi += pad;
  const t = (d) => Date.parse(d + "T00:00:00Z");
  const t0 = t(pts[0].date), t1 = t(pts[pts.length - 1].date);
  const X = (d) => pl + ((t(d) - t0) / Math.max(1, t1 - t0)) * (W - pl - pr);
  const Y = (v) => pt + (1 - (v - lo) / (hi - lo)) * (H - pt - pb);
  let s = `<svg viewBox="0 0 ${W} ${H}">`;
  for (let i = 0; i <= 3; i++) {
    const v = lo + ((hi - lo) * i) / 3, y = Y(v);
    s += `<line x1="${pl}" x2="${W - pr}" y1="${y}" y2="${y}" stroke="var(--line)"/><text class="ax" x="${pl - 6}" y="${y + 3}" text-anchor="end">${compact(v)}</text>`;
  }
  // Tramo estimado a trazos; fotos reales en línea continua
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    s += `<line x1="${X(a.date)}" y1="${Y(a.v)}" x2="${X(b.date)}" y2="${Y(b.v)}" stroke="var(--sun)" stroke-width="2" ${a.real && b.real ? "" : 'stroke-dasharray="4 3" opacity="0.8"'}/>`;
  }
  for (const p of pts) {
    const tip = `${new Date(t(p.date)).toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" })}|${fmt(p.v, 0)} FLOWER|${p.now ? "ahora" : p.real ? "foto del día" : "estimado: lo que tienes hoy a los precios de ese día"}`;
    s += `<rect x="${X(p.date) - 3}" y="${Y(p.v) - 3}" width="6" height="6" fill="${p.real ? "var(--sun)" : "var(--panel)"}" stroke="var(--sun)" data-tip="${esc(tip)}"/>`;
  }
  const lab = (d) => new Date(t(d)).toLocaleDateString("es-ES", { day: "numeric", month: "short" });
  s += `<text class="ax" x="${pl}" y="${H - 6}">${lab(pts[0].date)}</text><text class="ax" x="${W - pr}" y="${H - 6}" text-anchor="end">hoy</text>`;
  return s + `</svg>`;
}
function wWealthHistory() {
  const m = wealthModel();
  if (!m) return Empty("coin", "Sin datos", "");
  const { pts } = m;
  if (pts.length < 2) return Empty("coin", "Empieza hoy", "Cada día se guarda una foto de tu patrimonio; la gráfica aparece a partir de mañana (o en cuanto haya precios guardados de días anteriores).");
  const first = pts[0], last = pts[pts.length - 1], wk = pts.find((p) => Date.parse(p.date) >= Date.parse(todayUTC()) - 7 * DAY_MS) || first;
  const ch = (a) => (a.v ? ((last.v - a.v) / a.v) * 100 : null);
  const est = pts.filter((p) => !p.real).length;
  setSub("ov-wealth-hist", `${pts.length} días${est ? ` · ${est} estimados (a trazos)` : ""}`);
  return `<div class="kstrip">
      ${Kcell("Ahora", `${fmt(last.v, 0)}<small>FLW</small>`, money(last.v), "sun")}
      ${Kcell("En 7 días", `<span class="${ch(wk) >= 0 ? "up" : "down"}">${pct(ch(wk))}</span>`, `${last.v - wk.v >= 0 ? "+" : "−"}${fmt(Math.abs(last.v - wk.v), 0)} FLOWER desde el ${esc(new Date(Date.parse(wk.date)).toLocaleDateString("es-ES", { day: "numeric", month: "short" }))}`)}
      ${Kcell("Desde el principio", `<span class="${ch(first) >= 0 ? "up" : "down"}">${pct(ch(first))}</span>`, `desde el ${esc(new Date(Date.parse(first.date)).toLocaleDateString("es-ES", { day: "numeric", month: "short" }))}`)}
      ${Kcell("Máximo", `${fmt(Math.max(...pts.map((p) => p.v)), 0)}<small>FLW</small>`, esc(new Date(Date.parse(pts.reduce((a, b) => (b.v > a.v ? b : a)).date)).toLocaleDateString("es-ES", { day: "numeric", month: "short" })))}
    </div><div class="chart" style="padding:8px 12px 4px">${wealthChart(pts)}</div>
    <div class="mod-f"><span>Línea continua = fotos reales de cada día · a trazos = estimado con lo que tienes hoy</span><span>precios: floor (tus listados no cuentan)</span></div>`;
}
function wWealthMovers() {
  const m = wealthModel();
  if (!m) return "";
  const { from, rows } = wealthMovers(m, 7);
  if (!from) return Empty("coin", "Aún sin comparación", "Hace falta al menos un día anterior guardado.");
  setSub("ov-wealth-mv", `desde el ${esc(new Date(Date.parse(from.date)).toLocaleDateString("es-ES", { day: "numeric", month: "short" }))}`);
  const up = rows.filter((x) => x.delta > 0).slice(0, 5), down = rows.filter((x) => x.delta < 0).slice(-5).reverse();
  const row = (x) => `<div class="mv" data-open="${x.r.key}"><span>${Gi(x.r.key, 16)}</span><span class="nm">${esc(x.r.name)}</span><span class="v"><b class="${x.delta > 0 ? "up" : "down"}">${x.delta > 0 ? "+" : "−"}${fmt(Math.abs(x.delta), Math.abs(x.delta) < 10 ? 1 : 0)}</b> · ${pct((x.delta / Math.max(0.0001, x.before)) * 100)}</span></div>`;
  return `<div class="grp"><i class="dot"></i>Lo que más ha subido</div>${up.length ? up.map(row).join("") : `<p class="ctx" style="padding:4px 16px">Nada ha subido</p>`}
    <div class="grp"><i class="dot" style="background:var(--red)"></i>Lo que más ha bajado</div>${down.length ? down.map(row).join("") : `<p class="ctx" style="padding:4px 16px">Nada ha bajado</p>`}`;
}
// seriesKey (07-nfts) espera los datos de valoración del pet; si faltan, la serie del propio item
const wKey = (r) => { try { return seriesKey(r); } catch { return r.key; } };

function wWatch() {
  const keys = [...S.watch];
  const a = store.activity.data;
  setSub("w-watch", keys.length ? `${keys.length} items` : "");
  if (!keys.length) {
    const h = holdings();
    const sug = h ? h.rows.slice(0, 4) : [];
    if (!sug.length) return Empty("star", "Tu watchlist está vacía", "Marca items con la estrella en el mercado para seguir su floor aquí.");
    return `<div class="watch-empty">${sprite("star", 20)}<div><b>Watchlist vacía</b><span class="ctx">Pulsa ★ en cualquier item para seguir su floor. Sugerencias según lo que más vale en tu inventario:</span></div></div>
      ${sug.map((r) => `<div class="mv" data-open="${r.key}">${Star(r.key)}<span class="nm">${Gi(r.key, 14)}${esc(r.name)}</span><span class="v">floor <b>${fmt(r.price)}</b> · tienes ${compact(r.qty)}</span></div>`).join("")}`;
  }
  return `<table class="tbl"><thead><tr><th></th><th>Item</th><th class="r">Floor</th><th class="r">Δ ayer${Legend("delta")}</th><th class="r">Vol. hoy</th></tr></thead><tbody>${keys.map((k) => {
    const r = rowByKey(k);
    const it = a.items[k];
    const floorDelta = r?.prevFloor && it?.floor ? ((it.floor - r.prevFloor) / r.prevFloor) * 100 : r?.change;
    return `<tr data-open="${esc(k)}"><td class="ic">${Star(k)}</td><td class="w"><div class="name">${Gi(k, 12, colIcon(k))}<span>${esc(itemName(k))}</span></div></td>
      <td class="r">${fmt(it?.floor)}</td><td class="r ${floorDelta > 0 ? "up" : floorDelta < 0 ? "down" : "dim"}">${pct(floorDelta)}</td><td class="r dim">${r?.todayVolume == null ? "…" : compact(r.todayVolume)}</td></tr>`;
  }).join("")}</tbody></table>`;
}

/* Línea de tiempo: filas por categoría, marcadores cuadrados agrupados por píxel */
function wTimeline(el, compactRows = false) {
  const W = Math.max(320, (el.clientWidth || 900) - 32);
  const t0 = now();
  const span = S.rangeH * 3600_000;
  const all = store.farm.data.timers.filter((x) => !S.farmFilter || x.cat === S.farmFilter || compactRows);
  let cats = Object.keys(CATS).filter((k) => all.some((x) => x.cat === k));
  if (compactRows) cats = cats.filter((k) => all.some((x) => x.cat === k && x.ready <= t0 + span));
  if (!cats.length) return Empty("sun", "Nada en este rango", "Amplía el rango de tiempo.");
  const labelW = W < 560 ? 34 : 128, readyW = 40, rowH = compactRows ? 24 : 28, top = 22;
  const x0 = labelW + readyW, x1 = W - 26;
  const H = top + cats.length * rowH + 4;
  const X = (ts) => x0 + ((ts - t0) / span) * (x1 - x0);
  const stepH = S.rangeH <= 6 ? 1 : S.rangeH <= 12 ? 2 : S.rangeH <= 24 ? 3 : S.rangeH <= 72 ? 12 : 24;
  const ticks = [];
  const d = new Date(t0); d.setMinutes(0, 0, 0);
  for (let tk = d.getTime() + 3600_000; tk < t0 + span; tk += 3600_000) {
    // Sin marcas pegadas a la línea de "ahora" para que no pisen la etiqueta "listo"
    if (new Date(tk).getHours() % stepH === 0 && X(tk) > x0 + 26) ticks.push(tk);
  }
  const tickLabel = (ts) => (stepH >= 12 ? new Date(ts).toLocaleString("es-ES", { weekday: "short", hour: "2-digit" }) : hhmm(ts));

  let s = `<svg viewBox="0 0 ${W} ${H}" height="${H}" shape-rendering="crispEdges">`;
  s += `<text class="tick" x="${labelW + readyW / 2}" y="12" text-anchor="middle">listo</text>`;
  for (const tk of ticks) {
    const x = X(tk);
    const midnight = new Date(tk).getHours() === 0;
    s += `<line class="grid${midnight ? " day" : ""}" x1="${x}" x2="${x}" y1="${top - 4}" y2="${H}"/><text class="tick" x="${x}" y="12" text-anchor="middle">${tickLabel(tk)}</text>`;
  }
  cats.forEach((k, i) => {
    const y = top + i * rowH, cy = y + rowH / 2;
    const items = all.filter((x) => x.cat === k);
    const readyN = items.filter((x) => x.ready <= t0).length;
    if (i % 2 === 0) s += `<rect class="row" x="0" y="${y}" width="${W}" height="${rowH}"/>`;
    // Dentro de un <svg> no vale <img>: el icono del juego va como <image>, si no el sprite pixel
    const iu = S.gameIcons !== false && SPRITE_ITEM[CATS[k].spr] ? gameImgUrl(SPRITE_ITEM[CATS[k].spr]) : null;
    s += iu ? `<image href="${esc(iu)}" x="6" y="${cy - 7}" width="14" height="14" style="image-rendering:pixelated"/>`
      : `<g transform="translate(6 ${cy - 7})">${sprite(CATS[k].spr, 14, true).replace('class="spr"', 'x="0" y="0"')}</g>`;
    if (labelW > 40) s += `<text class="lbl" x="28" y="${cy + 4}">${CATS[k].label}</text>`;
    if (readyN) s += `<text class="rdy" x="${labelW + readyW / 2}" y="${cy + 4}" text-anchor="middle" data-tip="${esc(`${CATS[k].label}|${readyN} listo${readyN > 1 ? "s" : ""} para recoger ahora|`)}">${readyN}</text>`;
    // Agrupa eventos a menos de ~16 px entre sí: un marcador por grupo, con la cantidad dentro
    const upcoming = items.filter((x) => x.ready > t0 && x.ready <= t0 + span).sort((a, b) => a.ready - b.ready);
    const clusters = [];
    for (const x of upcoming) {
      const last = clusters[clusters.length - 1];
      if (last && X(x.ready) - X(last[0].ready) < 16) last.push(x);
      else clusters.push([x]);
    }
    for (const list of clusters) {
      const first = list[0].ready, lastT = list[list.length - 1].ready;
      const px = (X(first) + X(lastT)) / 2;
      const n = list.length;
      const size = n > 1 ? Math.min(rowH - 6, 13 + String(n).length * 3) : 10;
      const byName = {};
      for (const x of list) byName[x.name] = (byName[x.name] || 0) + 1;
      const names = Object.entries(byName).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([nm, c]) => `${nm}${c > 1 ? " ×" + c : ""}`).join(" · ");
      const when = Math.round(first / 60000) === Math.round(lastT / 60000) ? `a las ${at(first)}` : `de ${at(first)} a ${at(lastT)}`;
      const tip = `${CATS[k].label} · ${n} elemento${n > 1 ? "s" : ""}|${names}|${when} · en ${dur(first - t0)}`;
      s += `<g class="mk" tabindex="0" role="img" aria-label="${esc(tip.replace(/\|/g, ". "))}" data-tip="${esc(tip)}">
        <rect x="${px - size / 2}" y="${cy - size / 2}" width="${size}" height="${size}" fill="${CATS[k].color}"/>
        ${n > 1 ? `<text class="mk-n" x="${px}" y="${cy + 3.5}" text-anchor="middle">${n}</text>` : ""}</g>`;
    }
    const later = items.filter((x) => x.ready > t0 + span).length;
    if (later) s += `<text class="tick" x="${W}" y="${cy + 4}" text-anchor="end">+${later}</text>`;
  });
  s += `<line class="now" x1="${x0}" x2="${x0}" y1="${top - 4}" y2="${H}"/>`;
  return `<div class="tl">${s}</svg></div>`;
}
