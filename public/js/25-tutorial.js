// SFL Console — Mini guía para quien entra por primera vez: después de elegir idioma (y de configurar la key si hace
// falta), un recorrido de unos pasos que ilumina cada zona del dashboard y explica para qué sirve.
// Se puede saltar en cualquier momento y repetir desde Ajustes → Apariencia.
"use strict";

// Cada paso: qué iluminar (en el ordenador y en el móvil, donde el menú es la barra de abajo), título y texto.
// Sin destino, la tarjeta sale en el centro.
const TOUR_STEPS = [
  { title: "Bienvenido a SFL Console", text: "Te enseñamos en un minuto dónde está cada cosa. Puedes saltarte la guía cuando quieras y repetirla desde Ajustes." },
  { el: '#nav a[data-page="overview"]', m: '[data-tabgrp="inicio"]', title: "Resumen", text: "Tu granja de un vistazo: lo que está listo para recoger, lo que viene en las próximas horas, el checklist del día y cuánto vale todo lo que tienes." },
  { el: '#nav a[data-page="guide"]', m: '[data-tabgrp="inicio"]', title: "Plan de hoy", text: "Qué te conviene hacer ahora, pronto y más adelante, calculado con tu granja, tus boosts y los precios de hoy." },
  { el: '#nav .nav-grp[data-grp="granja"]', m: '[data-tabgrp="granja"]', title: "Granja", text: "El mapa de tu isla, tu inventario valorado, skills, animales, mascotas y la excavación del desierto." },
  { el: '#nav .nav-grp[data-grp="progreso"]', m: '[data-tabgrp="granja"]', title: "Progreso", text: "Capítulo (tickets, pase y tienda de Stella), misiones y entregas, tu facción, y qué plantar y producir para ganar más." },
  { el: '#nav .nav-grp[data-grp="mercado"]', m: '[data-tabgrp="mercado"]', title: "Mercado", text: "Precios del mercado, tus NFTs con lo que pagaste y lo que valen hoy, y el conversor de FLOWER a coins." },
  { el: '#nav .nav-grp[data-grp="social"]', m: '[data-tabgrp="mercado"]', title: "Social", text: "Compárate con tus amigos y con todas las granjas activas, y mira los rankings." },
  { el: '#nav .nav-grp[data-grp="producir"]', m: '[data-tabgrp="guias"]', title: "Guías", text: "Calculadoras y tablas del juego: cocina, pesca, flores, animales, crafteo, edificios, expansiones, tiendas… Funcionan aunque no tengas granja configurada." },
  { el: "#search", m: "#search", title: "Buscador", text: "Busca cualquier item para ver su precio e historial, o el nombre o número de un jugador para ver su granja. Atajo: tecla /." },
  { el: ".top-right .top-meta", m: "#refreshBtn", title: "Barra de arriba", text: "La mejor conversión de FLOWER a coins, el precio de FLOWER, la hora local y la del juego (UTC), y cuándo se actualizan los datos." },
  { el: '#nav a[data-page="settings"]', m: '[data-tabgrp="ajustes"]', title: "Ajustes", text: "Tu API key y tu granja, el idioma y el diseño, los avisos a Discord y el estado de la conexión. Aquí puedes repetir esta guía." },
  { title: "¡Listo!", text: "Pasa el ratón por encima de los números y los iconos con ? para ver de dónde sale cada dato. ¡A disfrutar de la granja!" },
];
const tour = { i: 0, el: null };
const isMobile = () => matchMedia("(max-width: 760px)").matches;
function tourTarget(step) {
  const sel = isMobile() ? step.m : step.el;
  const el = sel ? document.querySelector(sel) : null;
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return r.width && r.height ? el : null;
}
function renderTour() {
  const step = TOUR_STEPS[tour.i];
  if (!step) return endTour();
  let box = $("#tour");
  if (!box) {
    box = document.createElement("div");
    box.id = "tour";
    box.innerHTML = `<div class="tour-hole"></div><div class="tour-card" role="dialog" aria-live="polite"></div>`;
    document.body.appendChild(box);
  }
  // Si el destino está en un grupo plegado o en la barra lateral con scroll, se enseña primero
  const target = tourTarget(step);
  target?.closest(".nav-grp")?.classList.remove("folded");
  target?.scrollIntoView({ block: "nearest" });
  const hole = box.querySelector(".tour-hole"), card = box.querySelector(".tour-card");
  const n = TOUR_STEPS.length, last = tour.i === n - 1;
  card.innerHTML = `<div class="tour-n">${tour.i + 1} / ${n}</div><b>${esc(step.title)}</b><p>${esc(step.text)}</p>
    <div class="tour-btns">${last ? "" : `<button type="button" class="tour-skip" data-act="tour:end">Saltar guía</button>`}
      ${tour.i ? `<button type="button" class="btn ghost sm" data-act="tour:prev">Atrás</button>` : ""}
      <button type="button" class="btn sm" data-act="tour:${last ? "end" : "next"}">${last ? "Empezar" : "Siguiente"}</button></div>`;
  if (!target) {
    hole.style.cssText = "left:50%;top:50%;width:0;height:0";
    card.style.cssText = "left:50%;top:50%;transform:translate(-50%,-50%)";
    return;
  }
  const r = target.getBoundingClientRect(), pad = 6;
  hole.style.cssText = `left:${(r.left - pad).toFixed(0)}px;top:${(r.top - pad).toFixed(0)}px;width:${(r.width + pad * 2).toFixed(0)}px;height:${(r.height + pad * 2).toFixed(0)}px`;
  // La tarjeta al lado del destino, donde quepa (derecha, debajo o encima)
  const cw = Math.min(330, innerWidth - 24), ch = card.offsetHeight || 170;
  let left = r.right + 16, top = r.top;
  if (left + cw > innerWidth - 12) { left = Math.min(Math.max(12, r.left), innerWidth - cw - 12); top = r.bottom + 14; }
  if (top + ch > innerHeight - 12) top = Math.max(12, r.top - ch - 14);
  top = Math.min(Math.max(12, top), innerHeight - ch - 12);
  card.style.cssText = `left:${left.toFixed(0)}px;top:${top.toFixed(0)}px;width:${cw}px`;
}
function startTour() {
  if ($("#tour") || document.querySelector(".lang-pick") || !$("#welcome")?.hidden) return;
  tour.i = 0;
  renderTour();
}
function endTour() {
  $("#tour")?.remove();
  writeLS("tourDone", true);
  renderNavFold();
}
ACTIONS.tour = (v) => {
  if (v === "start") return startTour();
  if (v === "end") return endTour();
  tour.i = Math.max(0, Math.min(TOUR_STEPS.length - 1, tour.i + (v === "prev" ? -1 : 1)));
  renderTour();
};
addEventListener("resize", () => { if ($("#tour")) renderTour(); });
document.addEventListener("keydown", (e) => {
  if (!$("#tour")) return;
  if (e.key === "Escape") endTour();
  else if (e.key === "ArrowRight" || e.key === "Enter") { e.preventDefault(); ACTIONS.tour(tour.i === TOUR_STEPS.length - 1 ? "end" : "next"); }
  else if (e.key === "ArrowLeft") ACTIONS.tour("prev");
}, true);

// Primera vez: en cuanto haya idioma elegido y no esté abierto el asistente de configuración, empieza solo
if (!readLS("tourDone", false)) {
  const tryStart = () => {
    if (readLS("tourDone", false) || $("#tour")) return true;
    if (document.querySelector(".lang-pick") || !$("#welcome")?.hidden || !document.documentElement.dataset.drawn) return false;
    startTour();
    return true;
  };
  const timer = setInterval(() => { if (tryStart()) clearInterval(timer); }, 1200);
}
