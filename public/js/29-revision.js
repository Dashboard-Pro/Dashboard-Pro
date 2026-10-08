// SFL Console — Revisión de diseño para npm test (solo con ?audit=1 en la dirección): cuando la página termina de pintarse,
// apunta en <html data-layout="…"> lo que se ve mal. Nació de fallos reales: el stock del Resumen en una sola columna
// (dos estilos con el mismo nombre), módulos cortos estirados junto a uno larguísimo, cabeceras que se salían y páginas
// más anchas que la pantalla del móvil.
"use strict";

function layoutAudit() {
  const main = document.querySelector("main");
  if (!main) return [];
  const W = document.documentElement.clientWidth, mobile = W <= 760, out = [];
  const modName = (m) => (m.querySelector(".mod-h h2")?.textContent || m.querySelector(".mod-b")?.id || "módulo").trim().slice(0, 40);
  // ¿Lo contiene algo que se desplaza o recorta (tabla con scroll, mapa…)? Entonces no cuenta como que se sale
  const clipped = (e, stop) => { for (let p = e.parentElement; p && p !== stop; p = p.parentElement) if (getComputedStyle(p).overflowX !== "visible") return true; return false; };
  // 1. La página entera más ancha que la pantalla (en el móvil se arrastra de lado)
  if (document.documentElement.scrollWidth > W + 2) out.push(`página más ancha que la pantalla (${document.documentElement.scrollWidth} px en ${W})`);
  const mods = [...main.querySelectorAll("section.mod")].filter((m) => m.offsetParent);
  for (const m of mods) {
    // 2. Algo se sale por la derecha de su módulo
    const mr = m.getBoundingClientRect();
    for (const e of m.querySelectorAll("*")) {
      const r = e.getBoundingClientRect();
      if (r.width && r.right > mr.right + 3 && getComputedStyle(e).position !== "fixed" && !clipped(e, m)) { out.push(`se sale de «${modName(m)}» (+${Math.round(r.right - mr.right)} px)`); break; }
    }
    // 3. Rejilla o lista que se ha quedado en una sola columna con cosas pequeñas (como el stock de las tiendas)
    if (mobile) continue;
    for (const c of m.querySelectorAll("*")) {
      const cs = getComputedStyle(c);
      if (!(cs.display === "grid" || (cs.display === "flex" && cs.flexWrap === "wrap"))) continue;
      if (cs.display === "grid" && cs.gridTemplateColumns.split(" ").length > 1) continue;
      const kids = [...c.children].filter((k) => k.offsetParent && k.getBoundingClientRect().height > 0 && !/^(TR|TBODY|THEAD)$/.test(k.tagName));
      const cw = c.getBoundingClientRect().width;
      if (kids.length < 4 || cw < 200 || new Set(kids.map((k) => Math.round(k.getBoundingClientRect().top))).size !== kids.length) continue;
      // Ancho de lo que hay dentro de cada hijo (de su contenido, no de la caja)
      const inner = kids.map((k) => { let L = Infinity, R = -Infinity; for (const d of k.querySelectorAll("*")) { if (d.children.length && d.tagName !== "svg") continue; const r = d.getBoundingClientRect(); if (!r.width) continue; L = Math.min(L, r.left); R = Math.max(R, r.right); } return R > L ? R - L : cw; }).sort((a, b) => a - b);
      if (inner[Math.floor(inner.length / 2)] < cw * 0.3) { out.push(`una sola columna en «${modName(m)}» (${kids.length} elementos de ~${Math.round(inner[Math.floor(inner.length / 2)])} px en ${Math.round(cw)} px)`); break; }
    }
  }
  // 4. Módulo estirado con un hueco enorme junto a uno muy largo (los "sticky-side" acompañan al bajar: no cuentan)
  if (!mobile) {
    for (const pl of main.querySelectorAll(".plate")) {
      const rows = {};
      for (const m of pl.querySelectorAll(":scope > section.mod")) if (m.offsetParent) (rows[Math.round(m.getBoundingClientRect().top)] ||= []).push(m);
      for (const ms of Object.values(rows)) {
        if (ms.length < 2) continue;
        const info = ms.map((m) => { const b = m.querySelector(".mod-b"); return { m, h: m.getBoundingClientRect().height, c: b ? [...b.children].reduce((s, x) => s + x.getBoundingClientRect().height, 0) : 0 }; });
        const maxH = Math.max(...info.map((i) => i.h));
        for (const i of info) if (maxH - i.c > 900 && !i.m.classList.contains("sticky-side")) out.push(`hueco de ${Math.round(maxH - i.c)} px en «${modName(i.m)}»`);
      }
    }
  }
  return [...new Set(out)];
}
if (new URLSearchParams(location.search).get("audit") === "1") {
  // Solo para el test de la propia revisión: vuelve a meter el fallo del stock (.st-grid con columnas de 300 px)
  if (new URLSearchParams(location.search).get("auditbreak") === "stgrid") document.head.insertAdjacentHTML("beforeend", "<style>.st-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr))}</style>");
  // Dos pasadas (los módulos cargan sus datos poco a poco): se queda la última
  const run = () => { try { document.documentElement.dataset.layout = JSON.stringify(layoutAudit()); } catch (e) { document.documentElement.dataset.layout = JSON.stringify([`la revisión falló: ${e.message}`]); } };
  setTimeout(run, 7000);
  setTimeout(run, 10500);
}
