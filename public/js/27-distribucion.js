// SFL Console — Simulador de distribución: tu isla con el fondo del juego, arrastra edificios, nodos y decoración para
// probar otra colocación (no toca el juego: es solo un borrador que se guarda en este navegador), con choques, casillas
// fuera de la isla y las zonas de efecto (collisionDetection.ts → isWithinAOE).
"use strict";

const LAY_LAYERS = [["res", "Recursos"], ["crops", "Cultivos"], ["build", "Edificios"], ["deco", "Decoración"]];
// Objetos que se pueden pisar (alfombras, baldosas, mesas): no chocan con nada (NON_COLLIDING_OBJECTS)
const LAY_NO_COLLIDE = /Rug$|Tile$|^Crop Circle$|^(Big|High|Long|Square) Table$|^Crate$|^Empty Pot$|Podium$|^Stool$/;
// Zonas de efecto en casillas (x hacia la derecha, y hacia arriba; la del objeto es su esquina de arriba a la izquierda)
const AOE_RANK = [{ xLeft: 3, xRight: 3, depth: 7 }, { xLeft: 4, xRight: 3, depth: 8 }, { xLeft: 4, xRight: 4, depth: 9 }];
function layAoe(it, skills) {
  const { x, y, w, h } = it, rank = (s) => Math.min(3, Math.max(0, toNum(skills?.[s])));
  const box = (x0, x1, y0, y1) => ({ x0, x1, y0, y1 }); // casillas incluidas: x0..x1 y y1..y0 (y0 arriba)
  const scare = { "Basic Scarecrow": "Chonky Scarecrow", "Scary Mike": "Horror Mike", "Laurie the Chuckle Crow": "Laurie's Gains" }[it.name];
  if (scare) { const e = rank(scare) ? AOE_RANK[rank(scare) - 1] : { xLeft: 1, xRight: 1, depth: 3 }; return box(x - e.xLeft, x + e.xRight, y - h, y - h - (e.depth - 1)); }
  if (it.name === "Emerald Turtle" || it.name === "Tin Turtle") return box(x - 1, x + 1, y + 1, y - 1);
  if (it.name === "Sir Goldensnout") return box(x - 1, x + w, y + 1, y - h);
  if (it.name === "Queen Cornelia") return box(x - 1, x + w, y + 1, y - h);
  if (it.name === "Gnome") return box(x, x, y - 1, y - 1);
  return null;
}

S.lay = null;
S.layLayers = new Set(LAY_LAYERS.map(([k]) => k));
S.layT = Number(readLS("layT", 24)) || 24;
S.layAoe = readLS("layAoe", true);
const layKey = () => `layout-${S.farmId || store.farm?.data?.id || "x"}`;
function layFromFarm() {
  const items = mapModel().map((n, i) => ({ uid: `f${i}`, name: n.name, layer: n.layer, kind: n.kind, x: n.x, y: n.y, w: n.w, h: n.h, icon: n.icon || n.name }));
  return { items, removed: [], hist: [], sel: null, from: "farm" };
}
function layState() {
  if (S.lay) return S.lay;
  const saved = readLS(layKey(), null);
  S.lay = saved?.items ? { ...saved, hist: [], sel: null } : layFromFarm();
  return S.lay;
}
const laySave = () => writeLS(layKey(), { items: S.lay.items, removed: S.lay.removed, from: "draft" });
const layPush = () => { S.lay.hist.push(JSON.stringify({ items: S.lay.items, removed: S.lay.removed })); if (S.lay.hist.length > 50) S.lay.hist.shift(); };

// Casillas de la isla: cada parcela es un cuadrado de 6×6 alrededor de su origen (spiral del juego)
function layLand() {
  const farm = store.farm.data.farm, count = Math.max(1, toNum(farm.inventory?.["Basic Land"]));
  const lands = landOrigins(count).map((o) => ({ x0: o.x * 6 - 3, x1: o.x * 6 + 3, y0: o.y * 6 + 3, y1: o.y * 6 - 3 }));
  const inside = (tx, ty) => lands.some((l) => tx >= l.x0 && tx < l.x1 && ty <= l.y0 && ty > l.y1);
  return { count, lands, inside, island: farm.island?.type || "basic", biome: farm.island?.biome || null, season: farm.season?.season || "summer" };
}
// Choques y casillas fuera de la isla de cada objeto
function layCheck(items, land) {
  const occ = new Map(), bad = new Set(), out = new Set();
  for (const it of items) {
    for (let dx = 0; dx < it.w; dx++) for (let dy = 0; dy < it.h; dy++) {
      const tx = it.x + dx, ty = it.y - dy;
      if (!land.inside(tx, ty)) out.add(it.uid);
      if (LAY_NO_COLLIDE.test(it.name)) continue;
      const k = `${tx},${ty}`;
      if (occ.has(k)) { bad.add(it.uid); bad.add(occ.get(k)); } else occ.set(k, it.uid);
    }
  }
  return { bad, out };
}
// Lo que tienes sin colocar: coleccionables del inventario con tamaño conocido que no están todos en el mapa
function layPalette(st) {
  const farm = store.farm.data.farm, placed = {};
  for (const it of st.items) placed[it.name] = (placed[it.name] || 0) + 1;
  return Object.entries(farm.inventory || {}).filter(([n, q]) => G.itemDims?.[n] && toNum(q) > (placed[n] || 0) && (G.nftCollectibles || []).includes(n) || (G.itemDims?.[n] && st.removed.includes(n)))
    .map(([n, q]) => ({ name: n, left: Math.max(0, toNum(q) - (placed[n] || 0)), dims: G.itemDims[n] })).filter((p) => p.left > 0).sort((a, b) => a.name.localeCompare(b.name));
}

function wLayout(el) {
  if (!has("farm")) return Empty("tree", "Sin granja", "Configura tu granja para poder mover sus cosas.");
  const st = layState(), land = layLand(), T = S.layT, skills = store.farm.data.farm.bumpkin?.skills || {};
  const items = st.items.filter((it) => S.layLayers.has(it.layer));
  const chk = layCheck(st.items, land);
  // Límites del dibujo: las parcelas con media parcela de margen
  const xs = land.lands.flatMap((l) => [l.x0, l.x1]), ys = land.lands.flatMap((l) => [l.y0, l.y1]);
  const minX = Math.min(...xs) - 3, maxX = Math.max(...xs) + 3, minY = Math.min(...ys) - 3, maxY = Math.max(...ys) + 3;
  const W = (maxX - minX) * T, H = (maxY - minY) * T, px = (x) => (x - minX) * T, py = (y) => (maxY - y) * T;
  const img = landImageUrl(land.island, land.count, land.season, land.biome);
  const sel = st.items.find((it) => it.uid === st.sel) || null;
  const aoeOf = (it) => { const a = layAoe(it, skills); return a ? `<div class="ly-aoe" style="left:${px(a.x0)}px;top:${py(a.y0)}px;width:${(a.x1 - a.x0 + 1) * T}px;height:${(a.y0 - a.y1 + 1) * T}px"></div>` : ""; };
  const aoes = S.layAoe ? st.items.filter((it) => layAoe(it, skills)).map(aoeOf).join("") : sel ? aoeOf(sel) : "";
  const pal = layPalette(st);
  setSub("ly-main", `${st.items.length} objetos · ${chk.bad.size ? `<span class="down">${chk.bad.size} chocan</span>` : "sin choques"}${chk.out.size ? ` · <span class="down">${chk.out.size} fuera de la isla</span>` : ""}${st.from === "draft" ? ` · <span class="tag sun">borrador</span>` : ""}`);
  return `<div class="toolbar" style="padding:8px 12px;gap:8px;flex-wrap:wrap">
      <div class="seg">${LAY_LAYERS.map(([k, l]) => `<button data-act="laylayer:${k}" class="${S.layLayers.has(k) ? "on" : ""}">${l}</button>`).join("")}</div>
      <div class="seg"><button data-act="layzoom:-" aria-label="Alejar">−</button><button data-act="layzoom:+" aria-label="Acercar">+</button></div>
      <label class="toggle"><input type="checkbox" data-act="layaoe" ${S.layAoe ? "checked" : ""}><i></i>Zonas de efecto</label>
      <span class="grow"></span>
      <button class="btn ghost sm" data-act="layundo:1" ${st.hist.length ? "" : "disabled"}>Deshacer</button>
      <button class="btn ghost sm" data-act="layreset:1">Volver a mi granja</button>
      <button class="btn ghost sm" data-act="laycode:1">Copiar código</button>
    </div>
    <div class="ly-wrap">
      <div class="ly-scroll"><div class="ly-map" id="lyMap" style="width:${W}px;height:${H}px;--t:${T}px" data-minx="${minX}" data-maxy="${maxY}">
        <img class="ly-bg" src="${esc(img)}" alt="" style="left:${px(0)}px;top:${py(0)}px;transform:translate(-50%,-50%) scale(${T / 16})" onerror="this.remove()">
        ${aoes}
        ${items.sort((a, b) => (a.layer === "deco") - (b.layer === "deco")).map((it) => `<div class="ly-i ${it.layer}${chk.bad.has(it.uid) ? " bad" : ""}${chk.out.has(it.uid) ? " out" : ""}${it.uid === st.sel ? " sel" : ""}" data-uid="${it.uid}"
          style="left:${px(it.x)}px;top:${py(it.y)}px;width:${it.w * T}px;height:${it.h * T}px" title="${esc(it.name)}">${T >= 14 ? Gi(it.icon, Math.max(10, Math.min(64, Math.round(Math.min(it.w, it.h) * T * 0.8))), "") : ""}</div>`).join("")}
      </div></div>
      <div class="ly-side">
        <div class="grp">Seleccionado</div>
        ${sel ? `<div class="ly-sel">${Gi(sel.icon, 32)}<div><b>${esc(sel.name)}</b><div class="ctx">${sel.w}×${sel.h} · x ${sel.x}, y ${sel.y}${chk.bad.has(sel.uid) ? ` · <span class="down">choca</span>` : ""}${chk.out.has(sel.uid) ? ` · <span class="down">fuera de la isla</span>` : ""}</div>
          ${G.buffs?.[sel.name] ? `<div class="ctx">${esc([].concat(G.buffs[sel.name]).join(" · "))}</div>` : ""}</div></div>
          <div class="ly-btns"><button class="btn ghost sm" data-act="laymove:l">←</button><button class="btn ghost sm" data-act="laymove:u">↑</button><button class="btn ghost sm" data-act="laymove:d">↓</button><button class="btn ghost sm" data-act="laymove:r">→</button>
          <button class="btn ghost sm" data-act="layremove:1">Guardar en el inventario</button></div>`
        : `<p class="ctx">Arrastra cualquier cosa del mapa para moverla; haz clic para seleccionarla (flechas del teclado para moverla casilla a casilla, Supr para quitarla).</p>`}
        <div class="grp" style="margin-top:12px">Sin colocar · ${pal.length}</div>
        <div class="ly-pal">${pal.length ? pal.map((p) => `<button data-act="layadd:${esc(p.name)}" title="${esc(p.name)} (${p.dims[0]}×${p.dims[1]}) · clic para ponerlo en el centro">${Gi(p.name, 28)}<span>${esc(p.name)}</span><em>${p.left}</em></button>`).join("") : `<p class="ctx">Todo lo que tienes está colocado.</p>`}</div>
      </div>
    </div>
    <div class="mod-f"><span>Es un borrador: no cambia nada en el juego y se guarda solo en este navegador · rojo = choca con otra cosa, naranja = se sale de la isla · zonas de efecto con el tamaño de tus skills (Chonky Scarecrow, Horror Mike, Laurie's Gains)</span><span>collisionDetection.ts · fondo: arte del juego</span></div>`;
}

// Mover: arrastrar con el ratón o el dedo (pointer events), soltar en la casilla más cercana
let layDrag = null;
document.addEventListener("pointerdown", (e) => {
  const el = e.target.closest?.(".ly-i");
  if (!el || !S.lay) return;
  e.preventDefault();
  const it = S.lay.items.find((x) => x.uid === el.dataset.uid);
  if (!it) return;
  layDrag = { it, el, sx: e.clientX, sy: e.clientY, l: parseFloat(el.style.left), t: parseFloat(el.style.top), moved: false };
  el.setPointerCapture?.(e.pointerId);
});
document.addEventListener("pointermove", (e) => {
  if (!layDrag) return;
  const dx = e.clientX - layDrag.sx, dy = e.clientY - layDrag.sy;
  if (Math.abs(dx) + Math.abs(dy) > 3) layDrag.moved = true;
  layDrag.el.style.left = `${layDrag.l + dx}px`;
  layDrag.el.style.top = `${layDrag.t + dy}px`;
  layDrag.el.classList.add("drag");
});
document.addEventListener("pointerup", (e) => {
  if (!layDrag) return;
  const d = layDrag; layDrag = null;
  if (d.moved) {
    const T = S.layT, nx = d.it.x + Math.round((e.clientX - d.sx) / T), ny = d.it.y - Math.round((e.clientY - d.sy) / T);
    if (nx !== d.it.x || ny !== d.it.y) { layPush(); d.it.x = nx; d.it.y = ny; S.lay.from = "draft"; laySave(); }
  }
  S.lay.sel = d.it.uid;
  rerun();
});
document.addEventListener("keydown", (e) => {
  if (!S.lay?.sel || location.hash !== "#glayout" || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || "")) return;
  const k = { ArrowLeft: "l", ArrowRight: "r", ArrowUp: "u", ArrowDown: "d" }[e.key];
  if (k) { e.preventDefault(); ACTIONS.laymove(k); }
  else if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); ACTIONS.layremove(); }
});
ACTIONS.laylayer = (k) => { if (S.layLayers.has(k)) S.layLayers.delete(k); else S.layLayers.add(k); rerun(); };
ACTIONS.layzoom = (d) => { S.layT = Math.max(10, Math.min(48, S.layT + (d === "+" ? 4 : -4))); writeLS("layT", S.layT); rerun(); };
ACTIONS.layaoe = () => { S.layAoe = !S.layAoe; writeLS("layAoe", S.layAoe); rerun(); };
ACTIONS.laymove = (k) => {
  const it = S.lay?.items.find((x) => x.uid === S.lay.sel);
  if (!it) return;
  layPush();
  if (k === "l") it.x--; else if (k === "r") it.x++; else if (k === "u") it.y++; else it.y--;
  S.lay.from = "draft"; laySave(); rerun();
};
ACTIONS.layremove = () => {
  const i = S.lay?.items.findIndex((x) => x.uid === S.lay.sel);
  if (i == null || i < 0) return;
  layPush();
  S.lay.removed.push(S.lay.items[i].name);
  S.lay.items.splice(i, 1);
  S.lay.sel = null; S.lay.from = "draft"; laySave(); rerun();
};
ACTIONS.layadd = (name) => {
  const st = layState(), [w, h] = G.itemDims?.[name] || [1, 1];
  layPush();
  const uid = `n${Date.now()}`;
  st.items.push({ uid, name, layer: (store.farm.data.farm.buildings || {})[name] ? "build" : "deco", kind: "deco", x: 0, y: 0, w, h, icon: name });
  const r = st.removed.indexOf(name);
  if (r >= 0) st.removed.splice(r, 1);
  st.sel = uid; st.from = "draft"; laySave(); rerun();
  toast(`${name} puesto en el centro: arrástralo a su sitio`);
};
ACTIONS.layundo = () => {
  const prev = S.lay?.hist.pop();
  if (!prev) return;
  const p = JSON.parse(prev);
  S.lay.items = p.items; S.lay.removed = p.removed; laySave(); rerun();
};
ACTIONS.layreset = () => { S.lay = layFromFarm(); writeLS(layKey(), null); rerun(); toast("Vuelta a la distribución de tu granja"); };
// Código del borrador para guardarlo o pasárselo a alguien (posiciones de cada objeto)
ACTIONS.laycode = () => {
  const code = JSON.stringify(S.lay.items.map((it) => [it.name, it.x, it.y]));
  navigator.clipboard?.writeText(code).then(() => toast("Código de la distribución copiado"), () => toast("No se pudo copiar"));
};

PAGES.glayout = () => {
  $("#page").innerHTML = `<div class="plate">${Mod({ id: "ly-main", span: 12, title: "Simulador de distribución", icon: "sprout", flush: true })}</div>`;
  mount("ly-main", { deps: ["farm"], render: wLayout, loading: "block" });
};
PAGE_META.glayout = { title: "Distribución", sub: () => "Prueba otra colocación de tu granja: arrastra, mira choques y zonas de efecto (no cambia nada en el juego)" };
