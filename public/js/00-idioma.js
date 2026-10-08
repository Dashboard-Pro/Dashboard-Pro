// SFL Console — Idioma de la interfaz (español / inglés). El código pinta en español; en inglés, esta capa traduce el texto
// que aparece en la página con el diccionario de js/i18n/en-*.js (window.I18N_EN): textos exactos y plantillas con {0}, {1}…
// donde va un valor (número, nombre…). Lo que no está en el diccionario se queda como está.
// El diccionario se completa con: node tools/i18n-extract.js (lista lo que falta por traducir).
"use strict";

// ?lang=en / ?lang=es en la dirección lo fija (enlaces para compartir y pruebas)
const LANG = (() => {
  const q = new URLSearchParams(location.search).get("lang");
  if (q === "en" || q === "es") { try { localStorage.setItem("sfl-dash:lang", JSON.stringify(q)); } catch { /* sin almacenamiento */ } return q; }
  try { return JSON.parse(localStorage.getItem("sfl-dash:lang")) || null; } catch { return null; }
})();
const LOCALE = LANG === "en" ? "en-GB" : "es-ES"; // números y fechas
document.documentElement.lang = LANG === "en" ? "en" : "es";

function setLang(l) {
  try { localStorage.setItem("sfl-dash:lang", JSON.stringify(l)); } catch { /* sin almacenamiento */ }
  location.reload();
}

// En inglés, los textos que vienen del propio juego (boosts, skills) se usan en su versión inglesa
if (LANG === "en" && window.GAME) {
  if (window.GAME.buffsEn) window.GAME.buffs = { ...window.GAME.buffs, ...window.GAME.buffsEn };
  for (const sk of Object.values(window.GAME.skills || {})) { if (sk.buffEn) sk.buff = sk.buffEn; if (sk.debuffEn) sk.debuff = sk.debuffEn; }
}

const I18N = (() => {
  if (LANG !== "en") return { tr: (s) => s, on: false };
  const dict = window.I18N_EN || {};
  const exact = new Map(), buckets = new Map(), loose = [];
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  for (const [k, v] of Object.entries(dict)) {
    if (!v || v === k) continue;
    if (!/\{\d+\}/.test(k)) { exact.set(k, v); continue; }
    const parts = k.split(/(\{\d+\})/), idx = [];
    let re = "^\\s*", lit = "";
    const whole = []; // palabras completas (no pegadas a un hueco: "animal{1}" puede ser "animales")
    parts.forEach((p, i) => {
      const m = p.match(/^\{(\d+)\}$/);
      if (m) { idx.push(Number(m[1])); re += "(.*?)"; return; }
      lit += p;
      // Los espacios del texto son espacios de verdad (si no, "de" encajaría dentro de "madera")
      re += p.split(/(\s+)/).map((x) => (/^\s+$/.test(x) ? "\\s+" : esc(x))).join("");
      const toks = p.split(/\s+/);
      if (i > 0 && !/^\s/.test(p)) toks.shift();
      if (i < parts.length - 1 && !/\s$/.test(p)) toks.pop();
      whole.push(...toks);
    });
    const t = { re: new RegExp(re + "\\s*$", "s"), idx, out: v, score: lit.replace(/\s+/g, "").length, letters: (lit.match(/[a-záéíóúñü]/gi) || []).length, dot: lit.includes("·") };
    const words = whole.join(" ").toLowerCase().match(/(?<![a-záéíóúñü])[a-záéíóúñü]{3,}(?![a-záéíóúñü])/g);
    if (!words) { loose.push(t); continue; }
    const key = words.sort((a, b) => b.length - a.length)[0];
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(t);
  }
  const cache = new Map();
  // Texto exacto; si va en minúscula ("piedra", "otoño") y solo está con mayúscula, se usa ese y se pasa a minúscula
  const exactOf = (key) => {
    const v = exact.get(key);
    if (v != null || !/^[a-záéíóúñ]/.test(key)) return v;
    const cap = exact.get(key[0].toUpperCase() + key.slice(1));
    return cap == null ? undefined : cap[0].toLowerCase() + cap.slice(1);
  };
  function tpl(key) {
    const words = new Set(key.toLowerCase().match(/[a-záéíóúñü]{3,}/g) || []);
    // La parte fija tiene que pesar en el texto ("{0} de {1}" no vale para "Pepe de Granja"), salvo que lo que va en los
    // huecos también se sepa traducir ("{0} Se guarda en este navegador." con una frase conocida delante)
    const letters = (key.match(/[a-záéíóúñü]/gi) || []).length;
    const hasLetters = (c) => /[a-záéíóúñü]/i.test(c || "");
    let best = null, bestM = null;
    const test = (t) => {
      if (best && t.score <= best.score) return;
      const m = t.re.exec(key);
      if (!m) return;
      // Nombres propios (items, jugadores, NPCs: "Bumpkin Emblem", "RomanRandom") también valen como hueco
      const NAME = /^\s*[A-Z0-9#][\w'’.#-]*(\s+[A-Z0-9#][\w'’.#-]*)*\s*$/;
      if (t.letters * 3 < letters && !m.slice(1).every((c) => !hasLetters(c) || NAME.test(c) || tr(c) !== c)) return;
      best = t; bestM = m;
    };
    for (const w of words) for (const t of buckets.get(w) || []) test(t);
    for (const t of loose) test(t);
    if (!best) return null;
    // Una plantilla de casi nada ("{0} de {1}") sobre una frase con " · " la corta por donde no es: mejor trozo a trozo
    if (key.includes(" · ") && !best.dot && best.letters <= 3) return null;
    const vals = {};
    best.idx.forEach((n, i) => { vals[n] = bestM[i + 1]; });
    return best.out.replace(/\{(\d+)\}/g, (_, n) => tr(vals[n] ?? ""));
  }
  function tr(text) {
    if (!text || !/[a-záéíóúñü]/i.test(text)) return text;
    const spaced = text.replace(/\s+/g, " "), key = spaced.trim();
    if (!key) return text;
    let out = cache.get(spaced);
    if (out === undefined) {
      // Plantillas sobre el texto con sus espacios de los bordes: si delante iba un icono, el texto empieza por espacio
      out = exactOf(key) ?? tpl(spaced)?.trim() ?? null;
      // Frases unidas con " · " o ": ": cada trozo por separado
      // Un número delante o detrás de una palabra conocida: "Básico 11", "1 fácil"
      if (out == null) {
        const NUM = /^[\d.,%×+−-]+$/;
        const m = key.match(/^([\d.,%×+−-]+) (.+)$/) || key.match(/^(.+) ([\d.,%×+−-]+)$/);
        if (m) { const a = NUM.test(m[1]) ? 2 : 1, w = exactOf(m[a]); if (w) out = a === 2 ? `${m[1]} ${w}` : `${w} ${m[2]}`; }
      }
      // Trozo que empieza por el separador (" · Árboles" tras un icono)
      if (out == null && /^· ./.test(key)) { const t = tr(key.slice(2)); if (t !== key.slice(2)) out = `· ${t}`; }
      if (out == null && key.includes(" · ")) { const segs = key.split(" · "), t = segs.map((s) => tr(s)); if (t.some((x, i) => x !== segs[i])) out = t.join(" · "); }
      // Listas cortas con comas: "16 piedra, 14 árboles, 10 cultivos"
      if (out == null && key.includes(", ")) { const segs = key.split(", "); if (segs.every((s) => s.split(" ").length <= 4)) { const t = segs.map((s) => tr(s)); if (t.some((x, i) => x !== segs[i])) out = t.join(", "); } }
      if (cache.size > 20000) cache.clear();
      cache.set(spaced, out);
    }
    if (out == null) return text;
    const lead = text.match(/^\s*/)[0], trail = text.match(/\s*$/)[0];
    return lead + out + trail;
  }
  return { tr, on: true };
})();

// Traduce la página según se pinta: texto y atributos visibles (title, placeholder, aria-label)
if (I18N.on) {
  const SKIP = new Set(["SCRIPT", "STYLE", "TEXTAREA", "CODE", "PRE"]);
  const ATTRS = ["title", "placeholder", "aria-label"];
  const done = new WeakMap();
  const textNode = (n) => {
    const p = n.parentNode;
    if (!p || SKIP.has(p.nodeName) || p.closest?.("[data-noi18n]")) return;
    if (done.get(n) === n.nodeValue) return;
    const v = I18N.tr(n.nodeValue);
    if (v !== n.nodeValue) n.nodeValue = v;
    done.set(n, n.nodeValue);
  };
  const element = (el) => {
    if (SKIP.has(el.nodeName) || el.closest?.("[data-noi18n]")) return;
    for (const a of ATTRS) { const v = el.getAttribute?.(a); if (v) { const x = I18N.tr(v); if (x !== v) el.setAttribute(a, x); } }
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      if (n.nodeType === 3) textNode(n);
      else if (!SKIP.has(n.nodeName)) for (const a of ATTRS) { const v = n.getAttribute(a); if (v) { const x = I18N.tr(v); if (x !== v) n.setAttribute(a, x); } }
    }
  };
  const run = (root) => element(root);
  new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === "characterData") textNode(m.target);
      else if (m.type === "attributes") { const el = m.target, v = el.getAttribute(m.attributeName); if (v) { const x = I18N.tr(v); if (x !== v) el.setAttribute(m.attributeName, x); } }
      else for (const n of m.addedNodes) { if (n.nodeType === 3) textNode(n); else if (n.nodeType === 1) run(n); }
    }
  }).observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  run(document.body);
  const ti = document.querySelector("title");
  if (ti) ti.textContent = I18N.tr(ti.textContent);
}

// Primera vez: elegir idioma antes de nada (después se cambia en Ajustes → Apariencia)
if (!LANG) {
  const box = document.createElement("div");
  box.className = "lang-pick";
  box.setAttribute("role", "dialog");
  box.innerHTML = `<div class="lang-panel">
    <b>SFL Console</b>
    <p>Elige el idioma · Choose your language</p>
    <div class="lang-btns"><button type="button" data-lang="es">Español</button><button type="button" data-lang="en">English</button></div>
    <small>Puedes cambiarlo en Ajustes · You can change it in Settings</small>
  </div>`;
  box.addEventListener("click", (e) => {
    const b = e.target.closest("[data-lang]");
    if (!b) return;
    if (b.dataset.lang === "es") { try { localStorage.setItem("sfl-dash:lang", JSON.stringify("es")); } catch { /* */ } box.remove(); }
    else setLang("en");
  });
  document.body.appendChild(box);
}
