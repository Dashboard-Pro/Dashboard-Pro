// SFL Console — PAGES: la estructura de cada página.
// Scripts clásicos que comparten el ámbito global en el orden de index.html (antes, un solo app.js).
"use strict";

/* ════════════════════════════════════════════════════════════════════════
   9. Páginas
   ════════════════════════════════════════════════════════════════════════ */
const RANGES = [[6, "6h"], [12, "12h"], [24, "24h"], [72, "3d"], [168, "7d"]];

const PAGES = {
  overview() {
    $("#page").innerHTML = `
      <div class="plate">
        ${Mod({ id: "ov-farm", span: 4, title: "Tu granja", icon: "sprout" })}
        ${Mod({ id: "ov-check", span: 8, title: "Checklist del día", icon: "check" })}
      </div>
      <div class="plate">
        ${Mod({ id: "ov-ready", span: 4, title: "Listo ahora", icon: "bell" })}
        ${Mod({ id: "ov-next", span: 4, title: "Lo próximo", icon: "sun" })}
        ${Mod({ id: "ov-wealth", span: 4, title: "Patrimonio", icon: "coin" })}
      </div>
      <div class="plate">
        ${Mod({ id: "ov-tl", span: 8, title: "Próximas horas", icon: "calendar", act: Seg(RANGES, S.rangeH, "range"), flush: true })}
        ${Mod({ id: "w-watch", span: 4, title: "Watchlist", icon: "star", flush: true })}
      </div>
      <div class="plate">
        ${Mod({ id: "ov-wealth-hist", span: 8, title: "Tu patrimonio día a día", icon: "coin", flush: true })}
        ${Mod({ id: "ov-wealth-mv", span: 4, title: "Lo que más ha cambiado", icon: "chest", flush: true })}
      </div>
      <div class="plate">
        ${Mod({ id: "ov-faction", span: 6, title: "Facción esta semana", icon: "flag" })}
        ${Mod({ id: "ov-pending", span: 6, title: "Pendientes y metas", icon: "scroll" })}
      </div>
      <div class="plate">
        ${Mod({ id: "ov-projects", span: 7, title: "Proyectos del pueblo", icon: "hammer", flush: true })}
        ${Mod({ id: "ov-temps", span: 5, title: "Santuarios y temporales", icon: "bolt" })}
      </div>
      <div class="plate">
        ${Mod({ id: "ov-mini", span: 6, title: "Minijuegos", icon: "star", flush: true })}
        ${Mod({ id: "ov-activity", span: 3, title: "Actividad", icon: "chest" })}
        ${Mod({ id: "ov-stock", span: 3, title: "Stock en las tiendas", icon: "coin" })}
      </div>
      <div class="plate">
        ${Mod({ id: "ov-events", span: 4, title: "Agenda", icon: "calendar", flush: true, act: `<a href="#events" class="ctx">todo →</a>` })}
        ${Mod({ id: "ov-tickets", span: 4, title: "Tickets del capítulo", icon: "ticket" })}
        ${Mod({ id: "ov-news", span: 4, title: "Discord", icon: "chat", flush: true, act: `<a href="#events" class="ctx">todo →</a>` })}
      </div>`;
    mount("ov-farm", { deps: ["farm"], render: wFarmCard, loading: "block" });
    mount("ov-check", { deps: ["farm"], render: wChecklist, loading: "rows" });
    mount("ov-faction", { deps: ["farm"], soft: ["activity"], render: wFactionWeek, loading: "rows" });
    mount("ov-pending", { deps: ["farm"], soft: ["activity", "auctions"], render: wPending, loading: "rows" });
    mount("ov-projects", { deps: ["farm"], soft: ["activity"], render: wProjects, loading: "rows" });
    mount("ov-temps", { deps: ["farm"], render: wTemps, loading: "rows" });
    mount("ov-mini", { deps: ["farm"], render: wMinigames, loading: "rows" });
    mount("ov-activity", { deps: ["farm"], render: wActivity, loading: "block" });
    mount("ov-stock", { deps: ["farm"], render: wShopStock, loading: "block" });
    mount("ov-ready", { deps: ["farm"], soft: ["activity", "myBoosts"], render: wReadyNow, loading: "hero" });
    mount("ov-next", { deps: ["farm"], render: wNextUp, loading: "hero" });
    mount("ov-wealth", { deps: ["farm", "activity"], soft: ["activityPrev", "fx"], render: wWealth, loading: "hero" });
    mount("ov-tl", { deps: ["farm"], render: (el) => wTimeline(el, true) });
    mount("ov-wealth-hist", { deps: ["farm", "activity", "wealth"], soft: ["fx"], render: wWealthHistory, loading: "block" });
    mount("ov-wealth-mv", { deps: ["farm", "activity", "wealth"], render: wWealthMovers, loading: "rows" });
    mount("w-watch", { deps: ["activity"], soft: ["activityPrev", "farm"], render: wWatch, loading: "rows" });
    mount("ov-events", { deps: ["auctions", "raffles"], render: wAgenda, loading: "rows" });
    mount("ov-tickets", { deps: ["tickets"], render: wTicketsMini, loading: "hero" });
    mount("ov-news", { deps: ["discord"], render: wNewsMini, loading: "rows" });
  },

  farm() {
    $("#page").innerHTML = `
      <div class="plate">
        ${Mod({ id: "fm-cats", span: 3, title: "Categorías", icon: "sprout", flush: true })}
        ${Mod({ id: "fm-map", span: 9, title: "Mapa de la isla", icon: "tree", act: `${mapControls()}${notifyToggle()}` })}
      </div>
      <div class="plate">${Mod({ id: "fm-res", span: 12, title: "Recursos de tu isla", icon: "tree", flush: true })}</div>
      <div class="plate">
        ${Mod({ id: "fm-tl", span: 12, title: "Línea de tiempo", icon: "calendar", act: Seg(RANGES, S.rangeH, "range"), flush: true })}
        ${Mod({ id: "fm-board", span: 12, title: "Cola de cosecha", icon: "bell", flush: true })}
      </div>`;
    mount("fm-cats", { deps: ["farm"], render: wCats, loading: "rows" });
    mount("fm-map", { deps: ["farm"], soft: ["myBoosts"], render: wIslandMap, loading: "hero" });
    mount("fm-res", { deps: ["farm"], soft: ["myBoosts"], render: wMapKpis, loading: "rows" });
    mount("fm-tl", { deps: ["farm"], render: (el) => wTimeline(el) });
    mount("fm-board", { deps: ["farm"], render: wBoard, loading: "rows" });
  },

  // Plan de acción y calendario arriba; debajo, una ventana por objetivo (FLOWER, tickets, expansión,
  // nivel y rutina diaria), cada una con sus propios módulos
  strategy() {
    const tab = STRAT_TABS[S.stratTab] ? S.stratTab : "flower";
    const tabs = `<div class="seg tabs strat-tabs" role="tablist">${Object.entries(STRAT_TABS).map(([k, t]) => `<button role="tab" aria-selected="${k === tab}" data-sttab="${k}" class="${k === tab ? "on" : ""}">${sprite(t.icon, 14)} ${t.label}</button>`).join("")}</div>`;
    $("#page").innerHTML = `
      <div class="plate">
        ${Mod({ id: "st-plan", span: 8, title: "Plan de acción", icon: "target", flush: true })}
        ${Mod({ id: "st-cal", span: 4, title: "Calendario", icon: "calendar", flush: true })}
      </div>
      <div class="strat-bar">${tabs}<span class="ctx">${STRAT_TABS[tab].hint}</span></div>
      ${STRAT_TABS[tab].html()}`;
    mount("st-plan", { deps: ["farm"], soft: ["activity", "activityPrev", "myBoosts", "worldNfts", "flowerRecipes", "friendHist"], render: wPlan, loading: "rows" });
    mount("st-cal", { deps: ["farm"], render: wCalendar, loading: "rows" });
    STRAT_TABS[tab].mount();
  },

  // Entregas, Tareas y Bounties en sub-pestañas: cada una con todo el ancho y su propio contexto
  missions() {
    const tab = MISSION_TABS[S.missionTab] ? S.missionTab : "orders";
    const t = MISSION_TABS[tab];
    $("#page").innerHTML = `
      <div class="plate">${Mod({ id: "ms-k", span: 12, flush: true })}</div>
      <div class="plate">
        <section class="mod s-12">
          <header class="mod-h">${sprite(t.icon, 16)}<h2>${t.label}</h2><span class="sub" id="${t.id}-sub"></span>
            <div class="act" id="ms-tabs" role="tablist">${missionTabs()}</div></header>
          <div id="ms-settings">${missionSettings()}</div>
          <div class="mod-b flush" id="${t.id}" role="tabpanel"></div>
        </section>
      </div>`;
    mount("ms-k", { deps: ["farm", "activity"], render: wMissionKpis, loading: "block" });
    mount("ms-tabs", { deps: ["farm", "activity"], render: missionTabs, loading: "block" });
    // Se repinta al llegar los precios: el valor automático de las coins sale de ellos
    mount("ms-settings", { deps: ["farm", "activity"], soft: ["fx"], render: missionSettings, loading: "block" });
    mount(t.id, { deps: ["farm", "activity"], soft: ["fx", "npcDeliveries"], render: t.render, loading: "rows" });
  },

  skills() {
    $("#page").innerHTML = `
      <div class="plate">${Mod({ id: "sk-k", span: 12, flush: true })}</div>
      <div class="plate">
        ${Mod({ id: "sk-trees", span: 8, title: "Árboles", icon: "bolt", flush: true })}
        ${Mod({ id: "sk-powers", span: 4, title: "Poderes", icon: "bolt", flush: true })}
      </div>
      <!-- Shards (resumen corto) arriba y las tarjetas de rango a todo el ancho: lado a lado, el corto quedaba estirado y vacío -->
      <div class="plate">${Mod({ id: "sk-shards", span: 12, title: "Shards y reinicio", icon: "gem" })}</div>
      <div class="plate">${Mod({ id: "sk-ranks", span: 12, title: "Subir de rango", icon: "bolt", flush: true })}</div>
      <div class="plate">
        <section class="mod s-12">
          <header class="mod-h">${sprite("sun", 16)}<h2 id="sk-tree-title">Árbol</h2><span class="sub" id="sk-tree-sub"></span></header>
          <div class="mod-b flush" id="sk-tree"></div>
        </section>
      </div>`;
    mount("sk-k", { deps: ["farm"], render: wSkillKpis, loading: "block" });
    mount("sk-trees", { deps: ["farm"], render: wTrees, loading: "rows" });
    mount("sk-powers", { deps: ["farm"], render: wPowers, loading: "rows" });
    mount("sk-shards", { deps: ["farm"], render: wSkillShards, loading: "rows" });
    mount("sk-ranks", { deps: ["farm"], soft: ["activity"], render: wSkillRanks, loading: "rows" });
    mount("sk-tree", { deps: ["farm"], render: wTreeDetail, loading: "rows" });
  },

  market() {
    $("#page").innerHTML = `
      <div class="plate">${Mod({ id: "mk-k", span: 12, flush: true })}</div>
      <div class="plate">
        ${Mod({ id: "mk-movers", span: 4, title: "Más movidos hoy", icon: "coin", flush: true, act: Legend("delta") })}
        ${Mod({ id: "mk-spread", span: 4, title: "Oportunidades", icon: "bell", flush: true })}
        ${Mod({ id: "w-watch", span: 4, title: "Watchlist", icon: "star", flush: true })}
      </div>
      <div class="plate">
        <section class="mod s-12">
          <header class="mod-h">${sprite("coin", 16)}<h2>${({ mine: "Mi inventario", history: "Mi historial" })[S.marketTab] || "Marketplace"}</h2><span class="sub" id="mk-table-sub"></span>
            <div class="act">${Seg([["all", "Todo el mercado"], ["mine", "Mi inventario"], ["history", "Historial"]], S.marketTab, "mtab")}</div></header>
          <div class="toolbar">
            <input type="text" id="mkSearch" placeholder="Filtrar por nombre…" value="${esc(S.marketQuery)}" autocomplete="off" />
            <select class="inp" id="mkCol">
              ${[["", "Todas las colecciones"], ["collectibles", "Collectibles"], ["boost", "Collectibles con boost"], ["wearables", "Wearables"], ["pets", "Pets"], ["buds", "Buds"], ["economies", "Economías"]].map(([v, l]) => `<option value="${v}" ${S.marketCol === v ? "selected" : ""}>${l}</option>`).join("")}
            </select>
            <span class="grow"></span><span class="ctx">Pulsa una fila para ver el libro de órdenes · ★ para seguir</span>
          </div>
          <div class="mod-b flush" id="mk-table"></div>
        </section>
      </div>`;
    mount("mk-k", { deps: ["activity"], soft: ["activityPrev", "farm", "profile", "fx"], render: wMarketKpis, loading: "block" });
    mount("mk-movers", { deps: ["activity", "activityPrev"], render: wMovers, loading: "rows" });
    mount("mk-spread", { deps: ["activity"], render: wOpportunities, loading: "rows" });
    mount("w-watch", { deps: ["activity"], soft: ["activityPrev", "farm"], render: wWatch, loading: "rows" });
    mount("mk-table", { deps: ["activity"], soft: ["activityPrev", "opensea", "fx", "worldNfts", ...(S.marketTab !== "all" ? ["farm", "profile", "history"] : [])], render: wMarketTable, loading: "rows" });
  },

  nfts() {
    $("#page").innerHTML = `
      <div class="plate">${Mod({ id: "nf-k", span: 12, flush: true })}</div>
      <div class="plate">
        ${Mod({ id: "nf-up", span: 6, title: "Los que más suben", icon: "star", flush: true, act: Legend("delta") })}
        ${Mod({ id: "nf-down", span: 6, title: "Los que más bajan", icon: "warn", flush: true, act: Legend("delta") })}
      </div>
      <div class="plate">
        <section class="mod s-12">
          <header class="mod-h">${sprite("trophy", 16)}<h2>Tus NFTs</h2><span class="sub" id="nf-table-sub"></span>
            <div class="act">${Seg([["all", "Todos"], ["collectibles", "Coleccionables"], ["wearables", "Wearables"], ["unique", "Pets y buds"], ["boost", "Con boost"]], S.nftCol, "nfcol")}</div></header>
          <div class="toolbar">
            <input type="text" id="nfSearch" placeholder="Filtrar por nombre…" value="${esc(S.marketQuery)}" autocomplete="off" />
            <button class="btn sm ghost" id="nfRescan" data-action="rescan" data-tip="Buscar mis compras antiguas|Revisa las 10 últimas ventas de cada NFT sin precio de compra y rescata las que hiciste tú (aunque sean anteriores a las 50 que da tu perfil). Va en segundo plano, una consulta cada 5 s: puedes seguir usando el dashboard.|">Buscar mis compras antiguas</button>
            <span class="grow"></span><span class="ctx">Escribe lo que pagaste en <b>Compra / u</b> · pulsa una fila para ver su gráfico</span>
          </div>
          <div class="mod-b flush" id="nf-table"></div>
        </section>
      </div>`;
    const common = { deps: ["farm", "activity"], soft: ["activityPrev", "profile", "history", "nftPrices", "worldNfts", "fx", "worldAuctions"] };
    mount("nf-k", { ...common, render: wNftKpis, loading: "block" });
    mount("nf-up", { ...common, render: () => wNftMovers(1), loading: "rows" });
    mount("nf-down", { ...common, render: () => wNftMovers(-1), loading: "rows" });
    mount("nf-table", { ...common, render: wNftTable, loading: "rows" });
    // Si hay una búsqueda de compras en marcha (p. ej. tras recargar), se sigue su progreso
    fetch("/api/rescan").then((r) => r.json()).then((st) => { if (st.running) pollRescan(); else pollRescan.seen = st.finishedAt; }).catch(() => {});
  },

  ranks() {
    $("#page").innerHTML = `
      <div class="plate">
        ${Mod({ id: "rk-stats", span: 8, title: "Top 100", icon: "trophy", flush: true })}
        ${Mod({ id: "rk-tickets", span: 4, title: "Tickets del capítulo", icon: "ticket", flush: true })}
      </div>`;
    mount("rk-stats", { deps: ["stats"], soft: ["farm"], render: wStats, loading: "rows" });
    mount("rk-tickets", { deps: ["tickets"], render: wTicketsFull, loading: "rows" });
  },

  pets() {
    $("#page").innerHTML = `
      <div class="plate">${Mod({ id: "pt-k", span: 12, flush: true })}</div>
      <div class="plate" id="pt-cards">${Mod({ id: "pt-list", span: 12, title: "Tus mascotas", icon: "paw" })}</div>`;
    mount("pt-k", { deps: ["farm"], render: wPetKpis, loading: "block" });
    mount("pt-list", { deps: ["farm"], render: wPetCards, loading: "rows" });
  },

  dig() {
    $("#page").innerHTML = `
      <div class="plate">${Mod({ id: "dg-k", span: 12, flush: true })}</div>
      <div class="plate">
        ${Mod({ id: "dg-board", span: 7, title: "Sitio de excavación", icon: "crab" })}
        ${Mod({ id: "dg-pats", span: 5, title: "Patrones de hoy", icon: "scroll" })}
      </div>`;
    mount("dg-k", { deps: ["farm"], render: wDigKpis, loading: "block" });
    mount("dg-board", { deps: ["farm"], render: wDigBoard, loading: "block" });
    mount("dg-pats", { deps: ["farm"], render: wDigPatterns, loading: "rows" });
    startDigFast(); // tu granja cada pocos segundos mientras estés aquí
  },

  faction() {
    $("#page").innerHTML = `
      <div class="plate">${Mod({ id: "fc-k", span: 12, flush: true })}</div>
      <div class="plate">
        ${Mod({ id: "fc-kitchen", span: 7, title: "Cocina de la facción", icon: "cook", flush: true })}
        ${Mod({ id: "fc-pet", span: 5, title: "Mascota de la facción", icon: "paw" })}
      </div>
      <div class="plate">
        ${Mod({ id: "fc-petreq", span: 7, title: "Comida para la mascota", icon: "cook", flush: true })}
        ${Mod({ id: "fc-hist", span: 5, title: "Tus semanas", icon: "calendar", flush: true, cls: "sticky-side" })}
      </div>
      <div class="plate">${Mod({ id: "fc-shop", span: 12, title: "Tienda de Eldric", icon: "chest", flush: true,
        act: `<div class="seg">${FC_SHOP_TYPES.map(([v, l]) => `<button data-act="fcshop:${v}" class="${S.fcShop === v ? "on" : ""}">${l}</button>`).join("")}</div>` })}</div>`;
    mount("fc-shop", { deps: ["farm"], soft: ["activity"], render: wFactionShop, loading: "rows" });
    mount("fc-k", { deps: ["farm"], render: wFactionKpis, loading: "block" });
    mount("fc-kitchen", { deps: ["farm"], soft: ["activity"], render: wFactionKitchen, loading: "rows" });
    mount("fc-pet", { deps: ["farm"], render: wFactionPet, loading: "rows" });
    mount("fc-petreq", { deps: ["farm"], soft: ["activity"], render: wFactionPetReq, loading: "rows" });
    mount("fc-hist", { deps: ["farm"], render: wFactionHist, loading: "rows" });
  },

  friends() {
    $("#page").innerHTML = `
      <div class="plate">
        <section class="mod s-12"><header class="mod-h">${sprite("friends", 16)}<h2>Tus amigos</h2><span class="sub" id="fr-list-sub"></span>
          <div class="act"><form id="friendForm" class="row" style="gap:6px;margin:0"><input type="text" id="friendInput" class="inp" placeholder="Nombre o ID de granja" autocomplete="off" style="width:190px" /><button class="btn sm" type="submit">Añadir</button></form></div></header>
          <div class="mod-b flush" id="fr-list"></div>
        </section>
      </div>
      <div class="plate">
        ${Mod({ id: "fr-cmp", span: 7, title: "Comparar", icon: "trophy", flush: true })}
        ${Mod({ id: "fr-boosts", span: 5, title: "Boosts", icon: "bolt", flush: true })}
      </div>`;
    mount("fr-list", { deps: ["friends"], soft: ["dump", "farm", "friendHist"], render: wFriendList, loading: "rows" });
    mount("fr-cmp", { deps: ["friends"], soft: ["dump"], render: wFriendCompare, loading: "rows" });
    mount("fr-boosts", { deps: ["friends"], soft: ["dump", "activity", "farm"], render: wFriendBoosts, loading: "rows" });
  },

  community() {
    $("#page").innerHTML = `
      <div class="plate">${Mod({ id: "cm-k", span: 12, flush: true })}</div>
      <div class="plate">
        ${Mod({ id: "cm-me", span: 7, title: "Tú vs los demás", icon: "trophy", flush: true })}
        ${Mod({ id: "cm-boosts", span: 5, title: "Lo que tienen los jugadores como tú", icon: "bolt", flush: true })}
      </div>
      <div class="plate">
        ${Mod({ id: "cm-supply", span: 8, title: "Suministro real", icon: "chest", flush: true, act: Seg(SUPPLY_VIEWS, S.supplyView, "supply") })}
        ${Mod({ id: "cm-world", span: 4, title: "Islas y facciones", icon: "globe", cls: "sticky-side" })}
      </div>`;
    mount("cm-k", { deps: ["dump"], soft: ["farm"], render: wDumpKpis, loading: "block" });
    mount("cm-me", { deps: ["dump"], render: wDumpMe, loading: "rows" });
    mount("cm-boosts", { deps: ["dump"], soft: ["farm", "activity"], render: wDumpBoosts, loading: "rows" });
    mount("cm-supply", { deps: ["dump"], soft: ["activity"], render: wDumpSupply, loading: "rows" });
    mount("cm-world", { deps: ["dump"], render: wDumpWorld, loading: "rows" });
  },

  events() {
    $("#page").innerHTML = `
      <div class="plate">
        ${Mod({ id: "ev-auctions", span: 4, title: "Subastas", icon: "hammer", flush: true })}
        ${Mod({ id: "ev-raffles", span: 4, title: "Sorteos", icon: "ticket", flush: true })}
        ${Mod({ id: "ev-discord", span: 4, title: "Discord oficial", icon: "chat", flush: true })}
      </div>
      <div class="plate">
        <section class="mod s-12">
          <header class="mod-h">${sprite("hammer", 16)}<h2>Historial de subastas</h2><span class="sub" id="ev-hist-sub"></span>
            <div class="act"><input type="text" id="auHistQ" class="inp" placeholder="Filtrar premio…" value="${esc(S.auHistQ)}" autocomplete="off" /></div></header>
          <div class="mod-b flush" id="ev-hist"></div>
        </section>
      </div>`;
    mount("ev-hist", { soft: ["worldAuctions", "auctions", "farm"], render: wAuctionHistory, loading: "rows" });
    mount("ev-auctions", { deps: ["auctions"], render: wAuctions, loading: "rows" });
    mount("ev-raffles", { deps: ["raffles"], render: wRaffles, loading: "rows" });
    mount("ev-discord", { deps: ["discord"], render: wDiscord, loading: "rows" });
  },

  settings() {
    const st = store.status?.data;
    if (S.mode === "cloud") {
      $("#page").innerHTML = `
        <div class="plate">
          <section class="mod s-6"><header class="mod-h">${sprite("chat", 16)}<h2>Tu cuenta</h2></header><div class="mod-b" id="acc-me"></div></section>
          <section class="mod s-6"><header class="mod-h">${sprite("sprout", 16)}<h2>Tu granja</h2></header><div class="mod-b" id="acc-farm"></div></section>
        </div>
        <div class="plate">
          <section class="mod s-6"><header class="mod-h">${sprite("machine", 16)}<h2>Tus ordenadores</h2></header><div class="mod-b" id="acc-devices"></div></section>
          <section class="mod s-6" id="acc-premium-mod"><header class="mod-h">${sprite("star", 16)}<h2>Premium</h2></header><div class="mod-b" id="acc-premium"></div></section>
        </div>`;
      return renderAccountPage();
    }
    $("#page").innerHTML = `
      <div class="plate">
        <section class="mod s-6">
          <header class="mod-h">${sprite("gear", 16)}<h2>Conexión</h2></header>
          <div class="mod-b">
            <div class="prose"><p>La key se guarda en <code>dashboard/config.json</code> en tu PC y solo la usa el servidor local: el navegador nunca la ve.
              Se consigue en <a href="https://sunflower-land.com/community-docs/" target="_blank" rel="noopener">community-docs</a> con VIP y nivel 50+.</p></div>
            <form id="settingsForm" class="form">
              <label>API key <input type="password" id="apiKeyInput" placeholder="${st?.hasKey ? "•••••••• configurada — déjalo vacío para mantenerla" : "sfl.eyJ…"}" autocomplete="off" /></label>
              <label>Farm ID <input type="text" id="farmIdInput" value="${esc(S.farmId || "")}" placeholder="NFT id, account id o wallet 0x…" /></label>
              <div class="row"><button class="btn" type="submit">Guardar y recargar</button><button class="btn ghost" type="button" data-wl="open">Asistente de configuración</button><span id="settingsMsg" class="ctx"></span></div>
            </form>
          </div>
        </section>
        ${Mod({ id: "st-proxy", span: 6, title: "Estado del proxy", icon: "machine", flush: true })}
      </div>
      <div class="plate">
        <section class="mod s-6"><header class="mod-h">${sprite("machine", 16)}<h2>Sincronizar con GitHub</h2><span class="sub">entre tus ordenadores</span></header><div class="mod-b" id="st-git"></div></section>
        <section class="mod s-6"><header class="mod-h">${sprite("chat", 16)}<h2>Cuenta en la nube</h2><span class="sub">opcional</span></header><div class="mod-b" id="st-cloud"></div></section>
      </div>
      <div class="plate">
        <section class="mod s-6"><header class="mod-h">${sprite("globe", 16)}<h2>Datos de la comunidad</h2><span class="sub">volcado nocturno de todas las granjas</span></header><div class="mod-b" id="st-dump"></div></section>
        <section class="mod s-6"><header class="mod-h">${sprite("bell", 16)}<h2>Avisos a Discord</h2><span class="sub">al móvil, estés donde estés</span></header><div class="mod-b" id="st-discord"></div></section>
      </div>
      <div class="plate">
        <section class="mod s-6"><header class="mod-h">${sprite("star", 16)}<h2>Apariencia</h2><span class="sub">diseño del dashboard</span></header><div class="mod-b" id="st-design"></div></section>
        <section class="mod s-6"><header class="mod-h">${sprite("bolt", 16)}<h2>Actualizaciones</h2><span class="sub">versión del dashboard</span></header><div class="mod-b" id="st-update"></div></section>
      </div>`;
    mount("st-proxy", { deps: ["status"], render: wProxy, loading: "rows" });
    renderLocalCloud();
    renderGitSync();
    renderDumpSettings();
    renderDiscordSettings();
    renderDesignSettings();
    renderUpdateSettings();
  },
};
