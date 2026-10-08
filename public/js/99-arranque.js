// SFL Console — Arranque (init).
// Scripts clásicos que comparten el ámbito global en el orden de index.html (antes, un solo app.js).
"use strict";

/* ════════════════════════════════════════════════════════════════════════
   16. Arranque
   ════════════════════════════════════════════════════════════════════════ */
$$("[data-sprite]").forEach((i) => (i.outerHTML = sprite(i.dataset.sprite, Number(i.dataset.size) || 18)));

(async function init() {
  let st = null;
  try { st = await LOADERS.status(); } catch { /* servidor caído: el error aparecerá en cada módulo */ }
  S.farmId = st?.farmId || null;
  // ?farm=ID abre cualquier granja en solo lectura sin tocar la tuya (Ajustes). Se vuelve quitando el parámetro.
  const asked = new URLSearchParams(location.search).get("farm");
  const view = () => {
    S.homeFarm = S.farmId;
    // Las granjas nuevas tienen IDs de 16 cifras (antes se cortaba en 12 y no se abrían)
    if (/^\d{1,20}$/.test(asked || "") && asked !== String(S.homeFarm)) { S.viewing = asked; S.farmId = asked; }
  };
  // Versión web (nube): la granja es la de tu cuenta o la que elijas ver; no hay key que configurar
  S.mode = st?.mode || "local";
  // Avisos a Discord configurados en este ordenador (solo la app local)
  if (S.mode !== "cloud") api("/api/notify").then((d) => { S.discord = d; }).catch(() => {});
  if (S.mode === "cloud") {
    document.body.classList.add("is-cloud");
    try { S.me = await api("/api/me"); } catch { S.me = { loggedIn: false }; }
    S.farmId = S.me.farm?.id || readLS("viewFarm", null);
    renderAccount();
  }
  view();
  renderViewBanner();
  // Costes a mano: el servidor manda; lo que hubiera solo en el navegador se sube una vez.
  try {
    const server = await api("/api/costs");
    const local = S.costs || {};
    const missing = Object.fromEntries(Object.entries(local).filter(([k]) => !(k in server)));
    if (Object.keys(missing).length) {
      const r = await fetch("/api/costs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ costs: missing }) });
      Object.assign(server, await r.json());
    }
    S.costs = Object.fromEntries(Object.entries(server).map(([k, v]) => [k, v.value]));
    writeLS("costs", S.costs);
  } catch { /* sin servidor: se usan los del navegador */ }
  // El reloj arranca antes que la primera página: si algo falla al dibujar, lo demás sigue vivo
  setInterval(() => { try { tick(); } catch (err) { console.error(err); } }, 1000);
  if (S.mode === "cloud") {
    go(S.farmId ? location.hash.slice(1) || "overview" : "market");
    if (!S.farmId) openWelcome(1);
  } else {
    go(st && (!st.hasKey || !S.farmId) ? "settings" : location.hash.slice(1) || "overview");
    // Primera vez (o sin key/granja): asistente de bienvenida por encima
    if (st && (!st.hasKey || !S.farmId)) openWelcome(st.hasKey ? 3 : 1);
  }
  // Refresco de fondo: la granja cada minuto (el proxy cachea 45 s) y el estado del proxy.
  // Cada minuto se refresca todo lo que muestra la página (cada dato respeta su caché: granja 55 s,
  // mercado 60 s, perfil 2 min…). Si algo falla, el siguiente minuto lo reintenta, y el proxy ya
  // reintenta por su cuenta los errores 5xx con backoff (5 s, 15 s, 45 s).
  setInterval(() => {
    if (!S.farmId || !store.status?.data?.hasKey) return;
    rerun();
    LOADERS.farm().then(() => renderHeader()).catch(() => {});
    LOADERS.fx().catch(() => {}); // €: sfl.world, cacheado 15 min
  }, 60_000);
  LOADERS.fx().catch(() => {});
  setInterval(() => LOADERS.status().then(() => repaint("status")).catch(() => {}), 15_000);
})();
