// SFL Console — Cuenta en la nube y asistente de bienvenida.
// Scripts clásicos que comparten el ámbito global en el orden de index.html (antes, un solo app.js).
"use strict";

/* ── Cuenta en la nube ──────────────────────────────────────────────────── */
const jpost = (url, body) => fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body || {}) })
  .then(async (r) => { const j = await r.json().catch(() => ({})); if (!r.ok) throw Object.assign(new Error(j.error || `Error ${r.status}`), { status: r.status }); return j; });

// App local: vincular este ordenador con tu cuenta (código de la web) y ver la sincronización
async function renderLocalCloud() {
  const el = $("#st-cloud");
  if (!el) return;
  let c;
  try { c = await api("/api/cloud"); } catch { c = { linked: false }; }
  if (c.linked) {
    const err = c.lastError && (!c.lastSync || c.lastError.at > c.lastSync);
    el.innerHTML = `<dl class="kv">
        <dt>Vinculado a</dt><dd>${esc(c.url)}${c.user ? ` · <b>${esc(c.user)}</b>` : ""}</dd>
        <dt>Última sincronización</dt><dd>${c.syncing ? "sincronizando…" : c.lastSync ? ago(c.lastSync) : "pendiente"}${c.lastResult ? ` <span class="faint">(${c.lastResult.up} subidos, ${c.lastResult.down} recibidos)</span>` : ""}</dd>
        ${err ? `<dt>Error</dt><dd class="down">${esc(c.lastError.message)}</dd>` : ""}
      </dl>
      <p class="ctx">Se sincronizan tus precios de compra, tu historial y el histórico de precios cada 10 min. Tu API key <b>nunca</b> se envía a la nube.</p>
      <div class="row"><button class="btn sm" data-cloud="sync">Sincronizar ahora</button><button class="btn sm ghost" data-cloud="unlink">Desvincular este ordenador</button></div>`;
  } else {
    el.innerHTML = `<div class="prose"><p>Entra en la web de SFL Console con Discord y, en <b>Ajustes → Tus ordenadores</b>, genera un código. Así este ordenador y los demás comparten tus precios de compra e historial (adiós a copiar <code>data/</code> a mano). Tu API key se queda aquí.</p></div>
      <form class="form" data-cloudform>
        <label>Dirección de la web <input type="url" id="cloudUrl" value="${esc(readLS("cloudUrl", ""))}" placeholder="https://…" autocomplete="off" /></label>
        <label>Código <input type="text" id="cloudCode" placeholder="ABCD2345" maxlength="8" autocomplete="off" spellcheck="false" style="text-transform:uppercase" /></label>
        <div class="row"><button class="btn" type="submit">Vincular</button><span class="ctx" id="cloudMsg"></span></div>
      </form>`;
  }
}
async function localCloudAction(kind) {
  try {
    if (kind === "link") {
      const url = $("#cloudUrl").value.trim(), code = $("#cloudCode").value.trim();
      writeLS("cloudUrl", url);
      $("#cloudMsg").textContent = "Vinculando y sincronizando…";
      await jpost("/api/cloud/link", { url, code });
      toast("Ordenador vinculado a tu cuenta");
    } else if (kind === "sync") {
      toast("Sincronizando…", 1500);
      await jpost("/api/cloud/sync");
      toast("Sincronizado");
    } else if (kind === "unlink") {
      if (!confirm("¿Desvincular este ordenador? Tus datos locales se quedan; solo deja de sincronizar.")) return;
      await jpost("/api/cloud/unlink");
    }
    // Lo recibido de otros ordenadores (costes, historial) se recarga
    const server = await api("/api/costs");
    S.costs = Object.fromEntries(Object.entries(server).map(([k, v]) => [k, v.value]));
    writeLS("costs", S.costs);
    if (store.history) store.history.at = 0;
  } catch (e) {
    if ($("#cloudMsg")) $("#cloudMsg").textContent = "⚠ " + e.message; else toast(e.message);
  }
  renderLocalCloud();
}

// App local: sincronización automática de data/ por el repositorio de GitHub
async function renderGitSync() {
  const el = $("#st-git");
  if (!el) return;
  let g;
  try { g = await api("/api/gitsync"); } catch { g = null; }
  if (!g || g.available === false) {
    el.innerHTML = `<p class="ctx">${esc(g?.lastError?.message || "No disponible")}. Para tener tus datos en varios ordenadores, clona el proyecto desde GitHub (ver MACBOOK.md / WINDOWS.md) o usa la cuenta en la nube.</p>`;
    return;
  }
  const err = g.lastError && (!g.lastSync || g.lastError.at > g.lastSync);
  el.innerHTML = `<label class="toggle"><input type="checkbox" id="gitSyncToggle" ${g.enabled ? "checked" : ""}/><i></i><span>Sincronizar <code>data/</code> automáticamente</span></label>
    <dl class="kv" style="margin-top:10px">
      <dt>Repositorio</dt><dd>${esc(g.available?.remote || "—")} · ${esc(g.available?.branch || "")}</dd>
      <dt>Última vez</dt><dd>${g.running ? "sincronizando…" : g.lastSync ? ago(g.lastSync) : "aún no"}${g.lastResult ? ` <span class="faint">(${g.lastResult.pulled} del otro ordenador${g.lastResult.pushed ? ", subido" : ""})</span>` : ""}</dd>
      ${err ? `<dt>Error</dt><dd class="down">${esc(g.lastError.message)}</dd>` : ""}
    </dl>
    <p class="ctx">Al arrancar y cada 15 min trae lo del otro ordenador, lo mezcla sin perder nada y sube lo tuyo. Precios de compra e historial al momento; el histórico de precios cada 6 h. Nunca sube tu key ni código a medias. Puedes tener los dos ordenadores encendidos a la vez.</p>
    <div class="row"><button class="btn sm" data-gitsync="now">Sincronizar ahora</button></div>`;
}
async function gitSyncAction(kind, value) {
  try {
    if (kind === "toggle") await jpost("/api/gitsync", { enabled: value });
    else { toast("Sincronizando con GitHub…", 2000); const r = await jpost("/api/gitsync/now"); toast(r.lastError ? `⚠ ${r.lastError.message}` : "Sincronizado con GitHub"); }
    // Lo que llegue del otro ordenador se recarga
    const server = await api("/api/costs");
    S.costs = Object.fromEntries(Object.entries(server).map(([k, v]) => [k, v.value]));
    writeLS("costs", S.costs);
    if (store.history) store.history.at = 0;
  } catch (e) { toast(e.message); }
  renderGitSync();
}

// Versión web: botón de cuenta en la barra lateral
function renderAccount() {
  const el = $("#sideAccount");
  if (!el || S.mode !== "cloud") return;
  el.hidden = false;
  const m = S.me || {};
  el.innerHTML = m.loggedIn
    ? `<a href="#settings" class="acc">${m.user.avatar ? `<img src="${esc(m.user.avatar)}" alt="" width="24" height="24">` : sprite("chat", 18)}<span>${esc(m.user.name)}</span>${m.premium?.active ? `<span class="tag sun">premium</span>` : ""}</a>`
    : m.loginUrl ? `<a href="${esc(m.loginUrl)}" class="acc login">${sprite("chat", 18)}<span>Entrar con Discord</span></a>` : "";
}
async function refreshMe() {
  try { S.me = await api("/api/me"); } catch { /* sigue la anterior */ }
  renderAccount();
  if (S.page === "settings") renderAccountPage();
}
// Versión web: Ajustes = cuenta, granja (vincular y verificar), ordenadores y premium
function renderAccountPage() {
  const m = S.me || {};
  const login = m.loginUrl ? `<a class="btn" href="${esc(m.loginUrl)}">Entrar con Discord</a>` : `<span class="ctx">El login no está configurado en este servidor.</span>`;
  $("#acc-me").innerHTML = m.loggedIn
    ? `<div class="acc-big">${m.user.avatar ? `<img src="${esc(m.user.avatar)}" alt="" width="48" height="48">` : sprite("chat", 32)}<div><b>${esc(m.user.name)}</b><span class="ctx">Cuenta de Discord</span></div></div>
       <p class="ctx">Solo usamos tu nombre y avatar de Discord. Tu API key de Sunflower Land nunca se pide ni se guarda aquí.</p>
       <div class="row"><button class="btn sm ghost" data-acc="logout">Cerrar sesión</button></div>`
    : `<p class="wl-lead">Entra para guardar tus precios de compra, sincronizar con la app de tu ordenador y vincular tu granja.</p><div class="row">${login}</div>`;

  const f = m.farm;
  const viewing = S.farmId ? `Estás viendo la granja <b>#${esc(S.farmId)}</b>` : "No estás viendo ninguna granja";
  let farmHtml = `<p>${viewing}. <button class="btn sm ghost" data-wl="open3">Cambiar</button></p>`;
  if (m.loggedIn) {
    const stTxt = !f ? `<span class="faint">sin vincular</span>` : f.status === "verified" ? `<span class="up">#${esc(f.id)} verificada ✓</span>`
      : f.status === "provisional" ? `<span class="sun">#${esc(f.id)} provisional</span>` : `<span class="faint">#${esc(f.id)} pendiente de verificar</span>`;
    farmHtml += `<dl class="kv"><dt>Granja de tu cuenta</dt><dd>${stTxt}</dd></dl>`;
    if (f?.challenge) {
      farmHtml += `<div class="acc-verify"><b>Verifica que es tuya</b><ol>
          <li>En el marketplace del juego, crea un listado de <b>cualquier cosa</b> por un precio total de exactamente <b class="sun">${fmt(f.challenge, 0)} FLOWER</b> (nadie lo comprará a ese precio).</li>
          <li>Espera un par de minutos y pulsa <b>Comprobar</b>.</li>
          <li>Cuando salga verificada, cancela el listado.</li></ol>
          <div class="row"><button class="btn sm" data-acc="verify">Comprobar</button><span class="ctx" id="accMsg"></span></div></div>`;
    } else if (f?.status !== "verified") {
      farmHtml += `<p class="ctx">${f ? "Provisional: la confirmó un ordenador vinculado con su key. Verifícala para usarla en premium." : "Vincúlala verificándola con una prueba en el juego (no hace falta tu key)."}</p>
        <div class="row"><button class="btn sm" data-acc="challenge">${f ? "Verificar" : `Vincular #${esc(S.farmId || "…")}`}</button><span class="ctx" id="accMsg"></span></div>`;
    }
  }
  $("#acc-farm").innerHTML = farmHtml;

  $("#acc-devices").innerHTML = m.loggedIn
    ? `<p class="ctx">Vincula la app de tu ordenador para compartir precios de compra e historial entre todos tus dispositivos. En la app: <b>Ajustes → Cuenta en la nube</b>, pega esta dirección y el código.</p>
       <dl class="kv"><dt>Dirección</dt><dd><code>${esc(location.origin)}</code></dd>
       ${(m.devices || []).map((d) => `<dt>${esc(d.name || "ordenador")}</dt><dd class="faint">vinculado ${dateShort(d.createdAt)}${d.seenAt ? ` · visto ${ago(d.seenAt)}` : ""}</dd>`).join("")}</dl>
       <div class="row"><button class="btn sm" data-acc="code">Generar código</button><span id="accCode" class="acc-code"></span></div>`
    : `<p class="ctx">Entra con Discord para vincular tus ordenadores.</p>`;

  const pm = m.premium;
  $("#acc-premium-mod").hidden = !pm?.enabled;
  if (pm?.enabled) {
    $("#acc-premium").innerHTML = pm.active
      ? `<p><span class="tag sun">premium</span> activo hasta <b>${dateShort(pm.until)}</b>. ¡Gracias por apoyar el proyecto!</p><div id="acc-alerts">${Loading("rows", 2)}</div>`
      : `<p class="wl-lead">Apoya el proyecto con una suscripción simbólica (${esc(pm.price)}): alertas de precio, histórico largo del mercado, valoración de pets por nivel y comparativas.</p>
         ${m.loggedIn ? `<p class="ctx">Al pagar, escribe tu código <b class="sun">${esc(pm.code)}</b> en el mensaje para que se active en tu cuenta.</p>
         ${pm.payUrl ? `<div class="row"><a class="btn" href="${esc(pm.payUrl)}" target="_blank" rel="noopener noreferrer">Hacerme premium</a></div>` : ""}` : `<div class="row">${login}</div>`}`;
    if (pm.active) renderAlerts();
  }
}
// Premium: alertas de precio (webhook de Discord del usuario + lista)
async function renderAlerts() {
  const el = $("#acc-alerts");
  if (!el) return;
  let d;
  try { d = await api("/api/alerts"); } catch (e) { el.innerHTML = `<p class="ctx">${esc(e.message)}</p>`; return; }
  el.innerHTML = `<h4 class="acc-h">Alertas de precio</h4>
    <form class="form" data-alertform="webhook"><label>Webhook de Discord ${d.webhook ? `<span class="tag green">conectado</span>` : ""}
      <input type="url" id="alertHook" placeholder="${d.webhook ? "Pega otro para cambiarlo" : "https://discord.com/api/webhooks/…"}" autocomplete="off" /></label>
      <p class="ctx">En tu servidor de Discord: Ajustes del canal → Integraciones → Webhooks → Nuevo webhook → Copiar URL.</p>
      <div class="row"><button class="btn sm" type="submit">Guardar webhook</button></div></form>
    ${d.alerts.length ? `<table class="tbl"><tbody>${d.alerts.map((a) => `<tr><td class="w">${esc(a.name)}</td><td>${a.dir === "above" ? "≥" : "≤"} <b>${fmt(a.price)}</b></td>
      <td class="dim">${a.firedAt ? `avisó ${ago(a.firedAt)} (${fmt(a.firedPrice)})` : "vigilando"}</td>
      <td class="r">${a.firedAt ? `<button class="btn sm ghost" data-alert="rearm:${a.id}">Rearmar</button>` : ""}<button class="btn sm ghost" data-alert="delete:${a.id}">×</button></td></tr>`).join("")}</tbody></table>`
      : `<p class="ctx">Aún no tienes alertas: abre cualquier item del mercado y crea una.</p>`}`;
}
async function alertAction(kind, arg) {
  try {
    if (kind === "webhook") await jpost("/api/alerts/webhook", { url: $("#alertHook").value.trim() });
    else if (kind === "create") {
      const [item, name] = arg;
      await jpost("/api/alerts", { item, name, dir: $("#alertDir").value, price: Number(String($("#alertPrice").value).replace(",", ".")) });
      toast("Alerta creada: te avisaremos por Discord");
    } else await jpost(`/api/alerts/${kind}`, { id: Number(arg) });
  } catch (e) { toast(e.message); }
  renderAlerts();
}
// Caja "crear alerta" en el detalle de un item (versión web con premium activo)
function alertBox(key, name, floor) {
  if (S.mode !== "cloud" || !S.me?.premium?.active) return "";
  return `<div class="dw-sec"><h4>Alerta de precio <span class="tag sun">premium</span></h4>
    <form class="form alert-form" data-alertform="create" data-key="${esc(key)}" data-name="${esc(name)}">
      <select class="inp" id="alertDir"><option value="below">Avísame si baja de</option><option value="above">Avísame si sube de</option></select>
      <input type="text" class="inp" id="alertPrice" inputmode="decimal" value="${floor ? fmt(floor) : ""}" placeholder="precio" />
      <button class="btn sm" type="submit">Crear alerta</button></form></div>`;
}

async function accountAction(kind) {
  const msg = (t) => { if ($("#accMsg")) $("#accMsg").textContent = t; };
  try {
    if (kind === "logout") { await jpost("/auth/logout"); location.reload(); return; }
    if (kind === "code") {
      const r = await jpost("/api/link/code");
      $("#accCode").innerHTML = `<b>${esc(r.code)}</b> <span class="faint">caduca en 10 min</span>`;
      return;
    }
    if (kind === "challenge") { await jpost("/api/farm/challenge", { farmId: S.me?.farm?.id || S.farmId }); }
    if (kind === "verify") { msg("Comprobando…"); await jpost("/api/farm/verify"); toast("Granja verificada ✓"); }
    await refreshMe();
  } catch (e) { msg("⚠ " + e.message); if (!$("#accMsg")) toast(e.message); }
}

/* ── Bienvenida: primera configuración en 3 pasos ───────────────────────── */
// Se abre sola si falta la key o la granja, y desde Ajustes. La key va directa al servidor local
// (config.json); aquí solo se escribe en un campo de contraseña y no se guarda en el navegador.
const WL = { step: 1, farm: null, error: "" };
function openWelcome(step = 1) {
  WL.step = step; WL.error = ""; WL.farm = null;
  $("#welcome").hidden = false;
  renderWelcome();
}
function closeWelcome() { $("#welcome").hidden = true; }
function renderWelcome() {
  const st = store.status?.data;
  const dots = [1, 2, 3].map((n) => `<i class="${n === WL.step ? "on" : n < WL.step ? "done" : ""}"></i>`).join("");
  const err = WL.error ? `<div class="wl-err">${sprite("warn", 14)}<span>${esc(WL.error)}</span></div>` : "";
  let body = "";
  const cloud = S.mode === "cloud";
  if (cloud && WL.step === 1) {
    const login = S.me?.loginUrl;
    body = `<h2 id="wlTitle">SFL Console</h2>
      <p class="wl-lead">Tu panel de Sunflower Land en el navegador: tu granja, tus NFTs con lo que valen, el mercado, rankings y eventos.</p>
      <ul class="wl-points">
        <li>${sprite("lock", 16)}<span><b>Aquí nunca te pedimos tu API key.</b> La web solo usa datos públicos del juego.</span></li>
        <li>${sprite("sun", 16)}<span><b>Datos de hace pocos minutos.</b> Para verlo al segundo y con tu historial completo, descarga la app gratis.</span></li>
        <li>${sprite("warn", 16)}<span><b>Herramienta no oficial</b>, hecha por jugadores. No está afiliada a Sunflower Land.</span></li>
      </ul>
      <div class="wl-actions">${login && !S.me?.loggedIn ? `<a class="btn" href="${esc(login)}">Entrar con Discord</a>` : ""}<button class="btn ${login && !S.me?.loggedIn ? "ghost" : ""}" data-wl="3">Ver una granja</button>${S.farmId ? `<button class="btn ghost" data-wl="close">Cerrar</button>` : ""}</div>
      ${login && !S.me?.loggedIn ? `<p class="ctx" style="margin-top:12px">Con cuenta guardas tus precios de compra, sincronizas con la app de tu ordenador y vinculas tu granja.</p>` : ""}`;
  } else if (WL.step === 1) {
    body = `<h2 id="wlTitle">Bienvenido a SFL Console</h2>
      <p class="wl-lead">Tu panel de Sunflower Land: qué está listo, qué plantar, cuánto vale tu granja y tus NFTs, rankings y eventos. Se configura en un minuto.</p>
      <ul class="wl-points">
        <li>${sprite("lock", 16)}<span><b>Tu key no sale de tu ordenador.</b> Se guarda en <code>config.json</code> y solo la usa el servidor local para leer tu granja. Ni el navegador ni nadie más la ve.</span></li>
        <li>${sprite("check", 16)}<span><b>Solo lectura.</b> La Community API no puede mover nada de tu granja: nada de acciones automáticas.</span></li>
        <li>${sprite("warn", 16)}<span><b>Herramienta no oficial</b>, hecha por jugadores. No está afiliada a Sunflower Land.</span></li>
      </ul>
      <div class="wl-actions"><button class="btn" data-wl="2">Empezar</button>${st?.hasKey && S.farmId ? `<button class="btn ghost" data-wl="close">Cerrar</button>` : ""}</div>`;
  } else if (WL.step === 2) {
    body = `<h2 id="wlTitle">Tu API key</h2>
      <p class="wl-lead">Cópiala de <a href="https://sunflower-land.com/community-docs/" target="_blank" rel="noopener noreferrer">sunflower-land.com/community-docs</a> con la sesión del juego iniciada en ese navegador. Hace falta <b>VIP</b> y un Bumpkin de <b>nivel 50</b> o más.</p>
      <form class="form" data-wlform="key">
        <label>API key <input type="password" id="wlKey" placeholder="${st?.hasKey ? "Ya tienes una configurada: déjalo vacío para mantenerla" : "sfl.eyJ…"}" autocomplete="off" spellcheck="false" /></label>
        ${err}
        <p class="ctx">Trátala como una contraseña: no la compartas ni la pegues en chats. Si se te escapa, pulsa <i>Rotate</i> en community-docs y pega la nueva aquí.</p>
        <div class="wl-actions"><button class="btn" type="submit">Siguiente</button><button class="btn ghost" type="button" data-wl="1">Atrás</button></div>
      </form>`;
  } else if (WL.step === 3 && !WL.farm) {
    body = `<h2 id="wlTitle">Tu granja</h2>
      <p class="wl-lead">Escribe el <b>número de tu granja</b> (sale en el juego, en Ajustes → General) o tu <b>nombre de jugador</b>.</p>
      <form class="form" data-wlform="farm">
        <label>Granja <input type="text" id="wlFarm" value="${esc(S.farmId || "")}" placeholder="153785 · o tu nombre" autocomplete="off" spellcheck="false" /></label>
        ${err}
        <div class="wl-actions"><button class="btn" type="submit" id="wlFarmBtn">Buscar ${cloud ? "granja" : "mi granja"}</button><button class="btn ghost" type="button" data-wl="${cloud ? 1 : 2}">Atrás</button></div>
      </form>`;
  } else {
    const f = WL.farm, farm = f.farm;
    const url = bumpkinImageUrl(farm.bumpkin?.equipped, Math.round(140 * Math.min(2, window.devicePixelRatio || 1)));
    const lv = bumpkinLevel(toNum(farm.bumpkin?.experience));
    body = `<h2 id="wlTitle">${cloud ? "¿Esta es la granja?" : "¿Es esta tu granja?"}</h2>
      <figure class="sf-frame wl-frame"><div class="sf-photo${url ? "" : " fallback"}">${url ? `<img src="${esc(url)}" alt="Tu Bumpkin" width="140" height="140" onerror="this.parentElement.classList.add('fallback');this.remove()"/>` : ""}${sprite("sprout", 40)}</div>
        <figcaption class="sf-plaque"><div class="sf-name">${esc(farm.username || "Granja")}</div><div class="sf-id">#${esc(f.nft_id ?? f.id)} · nivel ${lv.lvl} · ${esc(ISLAND_ES[farm.island?.type] || farm.island?.type || "isla")}</div></figcaption></figure>
      <div class="wl-actions"><button class="btn" data-wl="done">Sí, entrar</button><button class="btn ghost" data-wl="3">No, buscar otra</button></div>`;
  }
  $("#welcomeBody").innerHTML = `<div class="wl-dots" aria-label="Paso ${WL.step} de 3">${dots}</div>${body}`;
  $("#welcomeBody").querySelector("input, .btn")?.focus();
}
async function saveConfig(patch) {
  const r = await fetch("/api/config", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(patch) });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.error || `Error ${r.status}`);
  store.status = { data: body, at: now() };
  return body;
}
async function welcomeSubmit(kind) {
  WL.error = "";
  try {
    if (kind === "key") {
      const key = $("#wlKey").value.trim();
      if (!key && !store.status?.data?.hasKey) throw new Error("Pega tu API key para seguir.");
      if (key && !key.startsWith("sfl.")) throw new Error("Eso no parece una key: empiezan por «sfl.».");
      if (key) await saveConfig({ apiKey: key });
      WL.step = 3;
    } else if (kind === "farm") {
      const q = $("#wlFarm").value.trim();
      if (!q) throw new Error("Escribe el número de tu granja o tu nombre.");
      $("#wlFarmBtn").disabled = true;
      $("#wlFarmBtn").textContent = "Buscando…";
      let id = q;
      // Un nombre se traduce a número con el índice del volcado nocturno o, si no está, con sfl.world (sin key)
      if (!/^\d+$/.test(q) && !/^0x[0-9a-f]{40}$/i.test(q)) {
        try { id = String((await api(`/api/ext/user/${encodeURIComponent(q)}`)).farm_id); }
        catch (e) { throw new Error(e.status === 404 ? `No encuentro ninguna granja llamada «${q}». Prueba con el número (las granjas nuevas tardan unos días en aparecer por nombre).` : "No se pudo buscar por nombre ahora mismo: prueba con el número de la granja."); }
      }
      if (S.mode !== "cloud") await saveConfig({ farmId: id });
      WL.farmId = id;
      try { WL.farm = await api(`/api/farm/${encodeURIComponent(id)}`); }
      catch (e) {
        throw new Error(e.status === 401 ? "La API rechaza la key: revisa que la copiaste entera y que tu granja tiene VIP y nivel 50+."
          : e.status === 404 ? "No existe ninguna granja con ese número." : `No se pudo leer la granja: ${e.message}`);
      }
    }
  } catch (e) { WL.error = e.message; }
  renderWelcome();
}
function welcomeDone() {
  for (const k of Object.keys(store)) if (k !== "status") delete store[k];
  if (S.mode === "cloud") { S.farmId = WL.farmId; writeLS("viewFarm", S.farmId); }
  else S.farmId = store.status?.data?.farmId || null;
  closeWelcome();
  toast(S.mode === "cloud" ? "Cargando la granja…" : "¡Listo! Cargando tu granja…");
  go("overview");
}
