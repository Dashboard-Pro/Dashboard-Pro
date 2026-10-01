// SFL Console — Navegación, clics delegados, teclado, tooltips y reloj.
// Scripts clásicos que comparten el ámbito global en el orden de index.html (antes, un solo app.js).
"use strict";

/* ════════════════════════════════════════════════════════════════════════
   13. Navegación e interacción (delegación de eventos)
   ════════════════════════════════════════════════════════════════════════ */
function go(page, { filter } = {}) {
  if (page === "map") page = "farm"; // el Mapa vive dentro de Granja (enlaces antiguos)
  if (!PAGES[page]) page = "overview";
  if (filter !== undefined) S.farmFilter = filter;
  const changed = S.page !== page;
  S.page = page;
  S.mounts = [];
  $$("#nav a").forEach((a) => a.classList.toggle("active", a.dataset.page === page));
  closeTabSheet();
  renderTabbar();
  renderNavFold();
  if (location.hash !== "#" + page) history.replaceState(null, "", "#" + page);
  renderHeader();
  const el = $("#page");
  if (changed) { el.classList.remove("enter"); void el.offsetWidth; el.classList.add("enter"); window.scrollTo(0, 0); }
  // Un fallo al dibujar una página nunca debe dejar la app en blanco
  try {
    PAGES[page]();
    document.documentElement.dataset.drawn = page; // señal para la prueba de interfaz: la página se dibujó
  } catch (err) {
    console.error(err);
    markJsError(err);
    el.innerHTML = `<div class="plate"><section class="mod s-12">${ErrorState(err, "page:" + page)}</section></div>`;
    RETRY["page:" + page] = () => go(page);
  }
}

document.addEventListener("click", (e) => {
  if (e.target.closest(".cost-in, .os-link")) return; // editar el coste no abre el detalle del item
  const wl = e.target.closest("[data-wl]");
  if (wl) {
    const v = wl.dataset.wl;
    if (v === "close") return closeWelcome();
    if (v === "done") return welcomeDone();
    if (v === "open") return openWelcome();
    if (v === "open3") return openWelcome(3);
    WL.step = Number(v); WL.error = ""; WL.farm = null;
    return renderWelcome();
  }
  if (e.target.closest("#welcome")) return;
  const nf = e.target.closest("[data-navfold]");
  if (nf) return toggleNavFold(nf.dataset.navfold);
  const tb = e.target.closest("[data-tabgrp]");
  if (tb) { if (tb.dataset.tabgo) { location.hash = "#" + tb.dataset.tabgo; return; } return openTabSheet(tb.dataset.tabgrp); }
  if (!e.target.closest("#tabSheet")) closeTabSheet();
  const fc = e.target.closest("[data-frcmp]");
  if (fc) { S.friendSel = fc.dataset.frcmp; writeLS("friendSel", S.friendSel); return rerun(); }
  const fl = e.target.closest("[data-frlive]");
  if (fl) return friendLive(fl.dataset.frlive);
  const fd = e.target.closest("[data-frdel]");
  if (fd) return friendRemove(fd.dataset.frdel);
  const ds = e.target.closest("[data-design]");
  if (ds) return setDesign(ds.dataset.design);
  if (e.target.closest("[data-gamedata]")) {
    jpost("/api/gamedata/update").then(() => { toast("Actualizando los datos del juego (unos 20 s)…", 4000); LOADERS.status().then(() => repaint("status")); }).catch((err) => toast(err.message));
    return;
  }
  const dc = e.target.closest("[data-discord]");
  if (dc) return discordAction(dc.dataset.discord);
  const dp = e.target.closest("[data-dump]");
  if (dp) return dumpAction("now");
  const gs = e.target.closest("[data-gitsync]");
  if (gs) return gitSyncAction("now");
  const cl = e.target.closest("[data-cloud]");
  if (cl) return localCloudAction(cl.dataset.cloud);
  const ac = e.target.closest("[data-acc]");
  if (ac) return accountAction(ac.dataset.acc);
  const al = e.target.closest("[data-alert]");
  if (al) { const [k, id] = al.dataset.alert.split(":"); return alertAction(k, id); }
  const fp = e.target.closest("[data-findplayer]");
  if (fp) return findPlayer(fp.dataset.findplayer);
  const pl = e.target.closest("[data-player]");
  if (pl) { if (pl.dataset.search !== undefined) { closeSearch(); $("#search").blur(); return openPlayerCardFor(pl.dataset.player, pl.dataset.pname, $("#search")); } return openPlayerCard(pl); }
  if (e.target.closest("[data-pclose]")) return closePlayerCard();
  // Acciones de las páginas nuevas: data-act="nombre:valor" → ACTIONS.nombre(valor, elemento)
  const act = e.target.closest("[data-act]");
  if (act) { const i = act.dataset.act.indexOf(":"); const n = i < 0 ? act.dataset.act : act.dataset.act.slice(0, i); return ACTIONS[n]?.(i < 0 ? "" : act.dataset.act.slice(i + 1), act, e); }
  if (!e.target.closest("#playerCard")) closePlayerCard();
  const a = e.target.closest("[data-star],[data-close],[data-open],[data-go],[data-filter],[data-sort],[data-mtab],[data-board],[data-range],[data-retry],[data-auction],[data-raffle],[data-action],[data-tree],[data-sfilter],[data-visit],[data-tboost],[data-htype],[data-mstab],[data-nsort],[data-nfcol],[data-wauction],[data-sttab],[data-supply]");
  if (!a) {
    if (!e.target.closest(".search")) closeSearch();
    return;
  }
  const d = a.dataset;
  if (d.star !== undefined) {
    e.stopPropagation();
    S.watch.has(d.star) ? S.watch.delete(d.star) : S.watch.add(d.star);
    writeLS("watch", [...S.watch]);
    $$(`.star[data-star="${CSS.escape(d.star)}"]`).forEach((b) => b.classList.toggle("on", S.watch.has(d.star)));
    toast(S.watch.has(d.star) ? `★ ${itemName(d.star)} añadido a tu watchlist` : `${itemName(d.star)} quitado de la watchlist`);
    repaint("activity");
    return;
  }
  if (d.close !== undefined) return closeDrawer();
  if (d.open) { if (d.search !== undefined) { closeSearch(); $("#search").blur(); } return openItem(d.open); }
  if (d.go) {
    // "missions:chores" → página Misiones abierta en la sub-pestaña Tareas
    const [page, sub] = d.go.split(":");
    if (page === "missions" && sub && MISSION_TABS[sub]) { S.missionTab = sub; writeLS("missionTab", sub); }
    if (page === "strategy" && sub && STRAT_TABS[sub]) { S.stratTab = sub; writeLS("stratTab", sub); }
    return go(page, { filter: d.filter ?? null });
  }
  if (d.filter) { S.farmFilter = d.filter === "all" || S.farmFilter === d.filter ? null : d.filter; renderHeader(); return repaint("farm"); }
  if (d.sort) {
    const cur = S.marketSort;
    S.marketSort = cur.key === d.sort ? { key: d.sort, dir: -cur.dir } : { key: d.sort, dir: d.sort === "name" || d.sort === "osDiff" ? 1 : -1 };
    writeLS("msort", S.marketSort);
    return repaint("activity");
  }
  if (d.mtab) { S.marketTab = d.mtab; S.marketLimit = 120; return go("market"); }
  if (d.board) { S.board = d.board; return repaint("stats"); }
  if (d.tree) {
    S.skillTree = d.tree;
    writeLS("tree", d.tree);
    repaint("farm");
    return document.getElementById("sk-tree")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  if (d.sfilter) { S.skillFilter = d.sfilter; return repaint("farm"); }
  if (d.htype) { S.histType = d.htype; return repaint("activity"); }
  if (d.wauction) return openWorldAuction(d.wauction);
  if (d.sttab) { S.stratTab = d.sttab; writeLS("stratTab", d.sttab); return go("strategy"); }
  if (d.supply) { S.supplyView = d.supply; writeLS("supplyView", d.supply); return go("community"); }
  if (d.nsort) {
    const cur = S.nftSort;
    S.nftSort = cur.key === d.nsort ? { key: d.nsort, dir: -cur.dir } : { key: d.nsort, dir: d.nsort === "name" ? 1 : -1 };
    writeLS("nsort", S.nftSort);
    return repaint("activity");
  }
  if (d.nfcol) {
    S.nftCol = d.nfcol;
    $$("[data-nfcol]").forEach((b) => b.classList.toggle("on", b.dataset.nfcol === S.nftCol));
    return repaint("activity");
  }
  if (d.mstab) { S.missionTab = d.mstab; writeLS("missionTab", d.mstab); return go("missions"); }
  if (d.visit) {
    S.visitH = Number(d.visit);
    writeLS("visitH", S.visitH);
    $$("[data-visit]").forEach((b) => b.classList.toggle("on", Number(b.dataset.visit) === S.visitH));
    renderHeader();
    return repaint("farm");
  }
  if (d.tboost !== undefined) {
    S.ticketBoost = d.tboost === "auto" ? null : Number(d.tboost);
    writeLS("tboost", S.ticketBoost);
    $("#ms-settings") && ($("#ms-settings").innerHTML = missionSettings());
    return repaint("farm");
  }
  if (d.range) {
    S.rangeH = Number(d.range);
    writeLS("range", S.rangeH);
    $$("[data-range]").forEach((b) => b.classList.toggle("on", Number(b.dataset.range) === S.rangeH));
    return repaint("farm");
  }
  if (d.retry) return RETRY[d.retry]?.();
  if (d.auction) return openAuction(d.auction);
  if (d.raffle) return openRaffle(d.raffle);
  if (d.action === "refresh") return forceRefresh();
  if (d.action === "rescan") return startRescan();
  if (d.action === "more") { S.marketLimit += 200; return repaint("activity"); }
  if (d.action === "boardAll") { S.boardAll = !S.boardAll; return repaint("farm"); }
});

document.addEventListener("change", async (e) => {
  if (e.target.id === "notifyToggle") {
    if (e.target.checked && Notification.permission !== "granted") {
      const p = await Notification.requestPermission();
      if (p !== "granted") { e.target.checked = false; toast("Permiso de notificaciones denegado"); return; }
    }
    S.notify = e.target.checked;
    writeLS("notify", S.notify);
    toast(S.notify ? "Te avisaremos cuando algo esté listo" : "Avisos desactivados");
  }
  if (e.target.classList?.contains("cost-in")) {
    const key = e.target.dataset.cost;
    const raw = String(e.target.value).trim().replace(",", ".");
    const v = parseFloat(raw);
    const clear = raw === "" || !Number.isFinite(v) || v < 0;
    if (clear) delete S.costs[key];
    else S.costs[key] = v;
    writeLS("costs", S.costs);
    // Se guarda en dashboard/data/costs.json para que no dependa del navegador
    fetch("/api/costs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key, value: clear ? null : v }) }).catch(() => toast("No se pudo guardar en el servidor"));
    toast(raw === "" ? `${itemName(key)}: coste automático` : `${itemName(key)}: coste ${fmt(v)} FLOWER/u guardado`);
    repaint("activity");
  }
  if (e.target.id === "gitSyncToggle") return gitSyncAction("toggle", e.target.checked);
  if (e.target.id === "dumpToggle") return dumpAction("toggle", e.target.checked);
  if (e.target.dataset?.dccat) return discordAction("cats");
  if (e.target.id === "taxToggle") { S.p2pTax = e.target.checked; writeLS("tax", S.p2pTax); repaint("farm"); }
  if (e.target.id === "doneToggle") { S.showDone = e.target.checked; repaint("farm"); }
  if (e.target.id === "coinRateInput") {
    const v = parseFloat(String(e.target.value).replace(",", "."));
    S.coinRate = Number.isFinite(v) && v > 0 ? v : null;
    writeLS("coinRate", S.coinRate);
    renderHeader();
    repaint("farm");
    if ($("#ms-settings")) $("#ms-settings").innerHTML = missionSettings();
  }
  if (e.target.id === "mkCol") { S.marketCol = e.target.value; S.marketLimit = 120; repaint("activity"); }
});

document.addEventListener("input", (e) => {
  if (e.target.id === "auHistQ") { S.auHistQ = e.target.value; repaint("worldAuctions"); }
  if (e.target.id === "nfSearch") { S.marketQuery = e.target.value; repaint("activity"); }
  if (e.target.id === "mkSearch") { S.marketQuery = e.target.value; S.marketLimit = 120; repaint("activity"); }
  if (e.target.id === "search") { searchSel = 0; renderSearch(); }
});

document.addEventListener("submit", async (e) => {
  const wf = e.target.dataset?.wlform;
  if (wf) { e.preventDefault(); return welcomeSubmit(wf); }
  if (e.target.dataset?.cloudform !== undefined) { e.preventDefault(); return localCloudAction("link"); }
  const af = e.target.dataset?.alertform;
  if (af) { e.preventDefault(); return alertAction(af, af === "create" ? [e.target.dataset.key, e.target.dataset.name] : null); }
  if (e.target.id === "friendForm") { e.preventDefault(); return friendAdd($("#friendInput").value); }
  if (e.target.id === "discordForm") { e.preventDefault(); return discordAction("save"); }
  if (e.target.id !== "settingsForm") return;
  e.preventDefault();
  const apiKey = $("#apiKeyInput").value.trim();
  const farmId = $("#farmIdInput").value.trim();
  $("#settingsMsg").textContent = "Guardando…";
  try {
    const r = await fetch("/api/config", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ apiKey, farmId }) });
    const body = await r.json();
    if (!r.ok) throw new Error(body.error);
    $("#apiKeyInput").value = "";
    for (const k of Object.keys(store)) delete store[k];
    store.status = { data: body, at: now() };
    S.farmId = body.farmId;
    toast("Configuración guardada");
    go("overview");
  } catch (err) {
    $("#settingsMsg").textContent = "⚠ " + err.message;
  }
});

// Errores de JS sin capturar: se marcan en <html data-js-errors> para la prueba de interfaz (npm test)
// Además del contador, el último mensaje (data-js-error) para que la prueba diga QUÉ falló
const markJsError = (e) => {
  const el = document.documentElement;
  el.dataset.jsErrors = String((Number(el.dataset.jsErrors) || 0) + 1);
  const err = e?.error || e?.reason || e;
  const msg = err?.message || e?.message || (typeof err === "string" ? err : "");
  if (msg) el.dataset.jsError = `${String(msg).slice(0, 160)}${err?.stack ? ` @ ${String(err.stack).split("\n")[1]?.trim().slice(0, 120) || ""}` : e?.filename ? ` @ ${e.filename}:${e.lineno}` : ""}`;
};
window.addEventListener("error", markJsError);
window.addEventListener("unhandledrejection", markJsError);
document.addEventListener("keydown", (e) => {
  const inField = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName);
  if (!$("#welcome").hidden) { if (e.key === "Escape" && store.status?.data?.hasKey && S.farmId) closeWelcome(); return; }
  if (e.key === "Escape" && !$("#tabSheet")?.hidden) return closeTabSheet();
  if (e.key === "Escape" && closePlayerCard()) return;
  if (e.key === "Escape") { closeDrawer(); closeSearch(); if (inField) document.activeElement.blur(); return; }
  if (e.key === "/" && !inField) { e.preventDefault(); $("#search").focus(); $("#search").select(); return; }
  if (document.activeElement?.id === "search" && !$("#searchRes").hidden) {
    if (e.key === "ArrowDown") { e.preventDefault(); searchSel = Math.min(searchList.length - 1, searchSel + 1); renderSearch(); }
    if (e.key === "ArrowUp") { e.preventDefault(); searchSel = Math.max(0, searchSel - 1); renderSearch(); }
    const sel = searchList[searchSel];
    if (e.key === "Enter" && sel) {
      if (sel.farm) return location.assign(viewFarmUrl(sel.farm));
      if (sel.find) return findPlayer(sel.find);
      closeSearch(); $("#search").blur();
      if (sel.player) return openPlayerCardFor(sel.player.id, sel.player.name, $("#search"));
      openItem(sel.key);
    }
    return;
  }
  if (!inField && !e.ctrlKey && !e.metaKey && !e.altKey) {
    const map = { 1: "overview", 2: "strategy", 3: "farm", 4: "skills", 5: "missions", 6: "market", 7: "nfts", 8: "ranks", 9: "events" };
    if (map[e.key]) go(map[e.key]);
    if (e.key === "r") forceRefresh();
  }
});
$("#search").addEventListener("focus", () => {
  renderSearch();
  // Los rankings dan nombres con foto al instante; se piden una vez (caché 1 h)
  if (!has("stats") && S.farmId) LOADERS.stats().then(() => { if (document.activeElement?.id === "search") renderSearch(); }).catch(() => {});
});

window.addEventListener("hashchange", () => go(location.hash.slice(1)));
let resizeT;
window.addEventListener("resize", () => { clearTimeout(resizeT); resizeT = setTimeout(() => repaint(), 150); });

// Tooltip único de la app. Dos formatos:
//   data-tip="título|texto|pie"  → texto plano
//   data-legend="clave"          → leyenda de colores de LEGENDS (ver Legend())
// Funciona con ratón, con teclado (al enfocar) y en táctil (al tocar).
const tip = $("#tooltip");
const TIP_SEL = "[data-tip],[data-legend]";
function tipHTML(t) {
  if (t.dataset.legend) return legendHTML(t.dataset.legend);
  const [title, body, foot] = t.dataset.tip.split("|");
  return `<b>${esc(title)}</b>${esc(body)}${foot ? `<div class="ctx">${esc(foot)}</div>` : ""}`;
}
function showTip(t, x, y) {
  tip.innerHTML = tipHTML(t);
  tip.hidden = false;
  tip.style.left = Math.max(8, Math.min(x, innerWidth - tip.offsetWidth - 8)) + "px";
  tip.style.top = Math.max(8, Math.min(y, innerHeight - tip.offsetHeight - 8)) + "px";
}
const showTipAt = (t) => { const r = t.getBoundingClientRect(); showTip(t, r.left, r.bottom + 8); };
let tipPinned = null;
document.addEventListener("mousemove", (e) => {
  if (tipPinned) return;
  const t = e.target.closest?.(TIP_SEL);
  if (!t) { tip.hidden = true; return; }
  showTip(t, e.clientX + 14, e.clientY + 16);
});
document.addEventListener("focusin", (e) => { const t = e.target.closest?.(TIP_SEL); if (t) showTipAt(t); });
document.addEventListener("focusout", () => { if (!tipPinned) tip.hidden = true; });
// Táctil / clic en los iconos de ayuda: fija el tooltip hasta el siguiente toque
document.addEventListener("click", (e) => {
  const h = e.target.closest?.(".help");
  if (h) { e.preventDefault(); e.stopPropagation(); tipPinned = tipPinned === h ? null : h; tipPinned ? showTipAt(h) : (tip.hidden = true); return; }
  if (tipPinned) { tipPinned = null; tip.hidden = true; }
}, true);
document.addEventListener("keydown", (e) => { if (e.key === "Escape") { tipPinned = null; tip.hidden = true; } });

// Antigüedad de los datos en pantalla. La granja se refresca cada minuto y el mercado cada pocos:
// más de 10 min = algo falla (aviso ámbar); más de 1 h = no fiarse para decidir (rojo).
const STALE_WARN = 10 * 60_000, STALE_BAD = 60 * 60_000;
function dataAges() {
  const out = [];
  if (has("farm")) out.push({ name: "Granja", age: Date.now() - store.farm.data.fetchedAt });
  if (has("activity")) out.push({ name: "Precios del mercado", age: Date.now() - store.activity.data.fetchedAt });
  return out;
}
const staleLevel = () => {
  const worst = Math.max(0, ...dataAges().map((d) => d.age));
  return worst > STALE_BAD ? "bad" : worst > STALE_WARN ? "warn" : null;
};
const agoShort = (ms) => (ms < 3600_000 ? `${Math.round(ms / 60_000)} min` : `${Math.floor(ms / 3600_000)} h ${Math.round((ms % 3600_000) / 60_000)} min`);
function renderFreshness() {
  const chip = $("#staleChip");
  const ages = dataAges();
  const level = staleLevel();
  chip.hidden = !level;
  if (!level) return;
  const worst = ages.reduce((a, b) => (b.age > a.age ? b : a));
  chip.classList.toggle("bad", level === "bad");
  chip.innerHTML = `${sprite("warn", 12)}<span>Datos de hace <b>${agoShort(worst.age)}</b></span>`;
  chip.dataset.tip = `Datos desactualizados|${ages.map((d) => `${d.name}: hace ${agoShort(d.age)}`).join(" · ")}. ${S.apiDown ? "La API de Sunflower Land no responde; se reintenta sola." : "El refresco automático no está trayendo datos nuevos."}|${level === "bad" ? "No tomes decisiones de Estrategia o Misiones con estos datos · " : ""}Pulsa para reintentar`;
  chip.setAttribute("aria-label", `Datos desactualizados: ${ages.map((d) => `${d.name} hace ${agoShort(d.age)}`).join(", ")}. Pulsa para reintentar.`);
}

function forceRefresh() {
  for (const k of ["farm", "activity", "discord"]) if (store[k]) store[k].at = 0;
  if (store.status) store.status.at = 0;
  toast("Actualizando…", 1500);
  rerun();
  LOADERS.status().catch(() => {});
}

/* ════════════════════════════════════════════════════════════════════════
   14. Reloj: contadores cada segundo, repintado cada minuto
   ════════════════════════════════════════════════════════════════════════ */
let lastMinute = 0;
function tick() {
  const t = now();
  for (const el of $$("[data-ready]")) {
    const ms = Number(el.dataset.ready) - t;
    el.textContent = dur(ms);
    el.classList.toggle("up", ms <= 0);
  }
  for (const el of $$("[data-until]")) el.textContent = dur(Number(el.dataset.until) - t);
  for (const el of $$(".pbar i[data-end]")) {
    const s = Number(el.dataset.start), e = Number(el.dataset.end);
    const p = clamp01((t - s) / Math.max(1, e - s));
    el.style.width = (p * 100).toFixed(1) + "%";
    el.parentElement.classList.toggle("done", p >= 1);
  }
  const d = new Date(t);
  $("#clockChip").innerHTML = `<span class="lbl">Local</span><b>${d.toLocaleTimeString("es-ES")}</b><span class="sep"></span><span class="lbl">UTC</span><b>${d.toISOString().slice(11, 16)}</b>`;
  const fa = store.farm?.at;
  // Acotado a 0-60 s: si el reloj del PC salta (suspensión, cambio de hora) no muestra valores absurdos
  const secs = fa ? Math.min(60, Math.max(0, Math.ceil((fa + 60_000 - t) / 1000))) : null;
  $("#refreshIn").textContent = secs != null ? `${secs}s` : "";
  $("#refreshBtn").setAttribute("aria-label", secs != null ? `Actualizar ahora (refresco automático en ${secs} segundos)` : "Actualizar ahora");
  checkNotifications();
  renderFreshness();

  const minute = Math.floor(t / 60000);
  const crossed = has("farm") && store.farm.data.timers.some((x) => x.ready <= t && x.ready > t - 1000);
  if (minute !== lastMinute || crossed) {
    lastMinute = minute;
    renderChrome();
    renderHeader();
    repaint("farm");
  }
}
