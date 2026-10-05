// SFL Console — Herramientas: calculadoras sobre la granja que estás viendo (de momento, la excavación del desierto).
// Scripts clásicos que comparten el ámbito global en el orden de index.html (antes, un solo app.js).
"use strict";

/* ════════════════════════════════════════════════════════════════════════
   14. Excavación del desierto
   ════════════════════════════════════════════════════════════════════════
   Reglas (types/desert.ts del juego y las pistas de Digby):
   · Cada día hay un sitio de 10×10 con varios patrones (G.diggingFormations): casillas con tesoro en una forma fija,
     sin girar. "Seasonal Artefact" es el artefacto del capítulo (G.chapterArtefact).
   · Al cavar sale el tesoro, un cangrejo (hay al menos un tesoro arriba, abajo o a un lado) o arena (ninguno).
     En diagonal no cuenta: comprobado con granjas reales.
   · Cavar gasta una excavación (el taladro abre 2×2 de una vez). Base 25 al día + boosts + las compradas.
   · La tormenta reinicia el sitio a medianoche UTC.
   Las probabilidades salen de contar todas las formas de colocar los patrones de hoy que encajan con lo cavado
   (sin solaparse). Si hay demasiadas para contarlas todas, se estima con muestras al azar. */

const DIG_BOOSTS = [
  { name: "Heart of Davy Jones", kind: "collectible", digs: 20 },
  { name: "Pharaoh Chicken", kind: "collectible", digs: 1 },
  { name: "Meerkat", kind: "collectible", digs: 5 },
  { name: "Bionic Drill", kind: "wearable", digs: 5 },
];

// Casillas de un patrón normalizadas a (0,0) arriba a la izquierda, con el artefacto del capítulo ya puesto.
function digShape(cells, artefact) {
  const mx = Math.min(...cells.map((c) => c.x)), my = Math.min(...cells.map((c) => c.y));
  return cells.map((c) => ({ x: c.x - mx, y: c.y - my, name: c.name === "Seasonal Artefact" ? artefact : c.name }));
}

// Lo que salió en un hoyo: tesoro (su nombre), cangrejo o arena.
function digHoleKind(items) {
  const keys = Object.keys(items || {});
  if (keys.includes("Crab")) return "Crab";
  if (!keys.length || keys[0] === "Sand") return "Sand";
  return keys[0];
}

/* Solver. patterns: [{ name, cells:[{x,y,name}] }] ya normalizados; holes: [{ x, y, item }] (item = tesoro, "Crab" o "Sand").
   Devuelve por casilla la probabilidad de tesoro y el objeto más probable, y por patrón cuántas posiciones le quedan. */
function digSolve({ patterns, holes, width = 10, height = 10, budget = 400_000, samples = 6000, rng = Math.random }) {
  const N = width * height, idx = (x, y) => y * width + x;
  const dug = new Array(N).fill(null);
  for (const h of holes) if (h.x >= 0 && h.x < width && h.y >= 0 && h.y < height) dug[idx(h.x, h.y)] = h.item;
  const isClue = (v) => v === "Sand" || v === "Crab";
  const near = (i) => {
    const x = i % width, y = (i / width) | 0, out = [];
    if (x > 0) out.push(i - 1);
    if (x < width - 1) out.push(i + 1);
    if (y > 0) out.push(i - width);
    if (y < height - 1) out.push(i + width);
    return out;
  };
  const sandNear = new Uint8Array(N); // casillas pegadas a arena: ahí no puede haber tesoro
  dug.forEach((v, i) => { if (v === "Sand") for (const j of near(i)) sandNear[j] = 1; });

  // Posiciones posibles de cada patrón por separado
  const cands = patterns.map((p) => {
    const w = Math.max(...p.cells.map((c) => c.x)) + 1, h = Math.max(...p.cells.map((c) => c.y)) + 1;
    const out = [];
    for (let ay = 0; ay + h <= height; ay++) {
      for (let ax = 0; ax + w <= width; ax++) {
        const cells = p.cells.map((c) => idx(ax + c.x, ay + c.y));
        const ok = p.cells.every((c, k) => {
          const v = dug[cells[k]];
          return !sandNear[cells[k]] && (v == null || (!isClue(v) && v === c.name));
        });
        if (ok) out.push({ x: ax, y: ay, cells });
      }
    }
    return out;
  });

  // Requisitos que tocan a varios patrones: cada tesoro cavado lo cubre uno, y cada cangrejo tiene uno al lado
  const reqs = [];
  dug.forEach((v, i) => {
    if (v == null || v === "Sand") return;
    reqs.push({ cells: v === "Crab" ? near(i) : [i] });
  });
  const impossible = patterns.some((_, k) => !cands[k].length);
  const P = patterns.length;
  const occ = new Int16Array(N).fill(-1); // qué patrón ocupa cada casilla
  const blocked = patterns.map(() => new Uint16Array(N)); // casillas que ese patrón no puede pisar en esta rama
  const placed = new Array(P).fill(-1);
  const hit = new Float64Array(N), posCount = cands.map((c) => new Float64Array(c.length));
  const itemHit = new Map(); // "casilla|objeto" → peso
  let total = 0, nodes = 0, exact = true;
  const fits = (k, c) => c.cells.every((j) => occ[j] < 0 && !blocked[k][j]);
  const addCand = (k, n, w) => {
    posCount[k][n] += w;
    cands[k][n].cells.forEach((j, m) => {
      hit[j] += w;
      const key = `${j}|${patterns[k].cells[m].name}`;
      itemHit.set(key, (itemHit.get(key) || 0) + w);
    });
  };
  const put = (k, n, v) => { placed[k] = v < 0 ? -1 : n; for (const j of cands[k][n].cells) occ[j] = v; };

  // Con todas las pistas cubiertas, los patrones que faltan van donde quepan: se recorren sus combinaciones
  // (exacto) y, si son demasiadas, se cuentan sus posiciones libres como si no chocaran entre ellos (aproximado).
  function leaf() {
    const free = [];
    for (let k = 0; k < P; k++) if (placed[k] < 0) free.push(k);
    const fixedW = (w) => { total += w; for (let k = 0; k < P; k++) if (placed[k] >= 0) addCand(k, placed[k], w); };
    let local = 0;
    const found = [];
    const walkFree = (f) => {
      if (++local > 5000) throw digSolve.TOO_MANY;
      if (f === free.length) return found.push(free.map((k) => placed[k]));
      const k = free[f];
      cands[k].forEach((c, n) => { if (fits(k, c)) { put(k, n, k); walkFree(f + 1); put(k, n, -1); } });
    };
    try {
      walkFree(0);
      nodes += local;
      fixedW(found.length);
      for (const combo of found) free.forEach((k, f) => addCand(k, combo[f], 1));
    } catch (e) {
      if (e !== digSolve.TOO_MANY) throw e;
      for (const k of free) placed[k] = -1;
      occ.forEach((v, j) => { if (v >= 0 && placed[v] < 0) occ[j] = -1; });
      nodes += local;
      exact = false;
      let w = 1;
      const valid = free.map((k) => {
        const ok = [];
        cands[k].forEach((c, n) => { if (fits(k, c)) ok.push(n); });
        w *= ok.length;
        return ok;
      });
      if (!w) return;
      fixedW(w);
      free.forEach((k, f) => { for (const n of valid[f]) addCand(k, n, w / valid[f].length); });
    }
  }
  // Se ramifica por pistas, no por patrones: la primera sin cubrir la cubre algún patrón que falte. Para no contar
  // dos veces la misma combinación, la cubre el patrón de índice más bajo que la toque: los anteriores no pueden.
  function walk() {
    if (++nodes > budget) throw digSolve.TOO_MANY;
    const r = reqs.find((q) => !q.cells.some((j) => occ[j] >= 0));
    if (!r) return leaf();
    for (let k = 0; k < P; k++) {
      if (placed[k] >= 0) continue;
      const set = r.cells;
      cands[k].forEach((c, n) => {
        if (!c.cells.some((j) => set.includes(j)) || !fits(k, c)) return;
        put(k, n, k);
        for (let i = 0; i < k; i++) if (placed[i] < 0) for (const j of set) blocked[i][j]++;
        walk();
        for (let i = 0; i < k; i++) if (placed[i] < 0) for (const j of set) blocked[i][j]--;
        put(k, n, -1);
      });
    }
  }
  if (!impossible) {
    try { walk(); } catch (e) {
      if (e !== digSolve.TOO_MANY) throw e;
      // Demasiadas combinaciones: muestras al azar que siguen el mismo árbol que el recorrido exacto (cubrir la primera
      // pista libre con una opción al azar, luego los patrones sueltos donde quepan). Cada muestra pesa el producto de las
      // opciones que tenía en cada paso (estimador de Knuth), así las probabilidades no se sesgan hacia ramas estrechas.
      // Colocar los 8 patrones al azar y quedarse con los que encajan casi nunca acierta cuando hay muchas pistas.
      exact = false;
      total = 0; hit.fill(0); itemHit.clear(); posCount.forEach((x) => x.fill(0));
      const pick = (opts) => opts[Math.floor(rng() * opts.length)];
      for (let s = 0, good = 0; s < samples * 20 && good < samples; s++) {
        occ.fill(-1); placed.fill(-1); blocked.forEach((b) => b.fill(0));
        let w = 1;
        for (;;) {
          const r = reqs.find((q) => !q.cells.some((j) => occ[j] >= 0));
          const opts = [];
          if (r) {
            for (let k = 0; k < P; k++) if (placed[k] < 0) cands[k].forEach((c, n) => { if (c.cells.some((j) => r.cells.includes(j)) && fits(k, c)) opts.push([k, n]); });
          } else {
            const k = placed.indexOf(-1);
            if (k < 0) break;
            cands[k].forEach((c, n) => { if (fits(k, c)) opts.push([k, n]); });
          }
          if (!opts.length) { w = 0; break; }
          w *= opts.length;
          const [k, n] = pick(opts);
          put(k, n, k);
          if (r) for (let i = 0; i < k; i++) if (placed[i] < 0) for (const j of r.cells) blocked[i][j]++;
        }
        if (!w) continue;
        good++; total += w;
        for (let k = 0; k < P; k++) addCand(k, placed[k], w);
      }
      blocked.forEach((b) => b.fill(0));
    }
  }

  const cells = [];
  for (let i = 0; i < N; i++) {
    const x = i % width, y = (i / width) | 0;
    let item = null, best = 0;
    for (const p of patterns) for (const c of p.cells) {
      const v = itemHit.get(`${i}|${c.name}`) || 0;
      if (v > best) { best = v; item = c.name; }
    }
    cells.push({ x, y, dug: dug[i], chance: total ? hit[i] / total : 0, item });
  }
  const pats = patterns.map((p, k) => {
    const alive = cands[k].map((c, n) => ({ ...c, w: posCount[k][n] })).filter((c) => c.w > 0);
    const one = alive.length === 1 ? alive[0] : null;
    const left = one ? one.cells.filter((j) => dug[j] == null).length : null;
    return { name: p.name, size: p.cells.length, positions: alive.length, at: one && { x: one.x, y: one.y }, found: left === 0, left };
  });
  return { cells, patterns: pats, total, exact, impossible: impossible || total === 0 };
}
digSolve.TOO_MANY = new Error("demasiadas combinaciones");


// ── Modelo de la granja que estás viendo ──
// grid: cada excavación es un hoyo o, con el taladro, una lista de 4 (2×2). Si todos los hoyos son de antes de hoy,
// lo que guarda la granja es el sitio de ayer: el de hoy se genera cuando el jugador entra al desierto.
function digModel() {
  const farm = store.farm.data.farm, t = now();
  const dg = farm.desert?.digging || {};
  const grid = dg.grid || [];
  const holes = grid.flat().filter(Boolean).map((h) => ({ x: toNum(h.x), y: toNum(h.y), dugAt: toNum(h.dugAt), item: digHoleKind(h.items), tool: h.tool }));
  const today = new Date(t).toISOString().slice(0, 10);
  const stale = holes.length > 0 && holes.every((h) => new Date(h.dugAt).toISOString().slice(0, 10) !== today);
  const placed = placedCollectibles(farm), worn = wornWearables(farm).map((w) => w.name);
  const boosts = DIG_BOOSTS.filter((b) => (b.kind === "wearable" ? worn : placed).includes(b.name));
  const maxDigs = 25 + boosts.reduce((a, b) => a + b.digs, 0);
  const extra = stale ? 0 : toNum(dg.extraDigs);
  const used = stale ? 0 : grid.length;
  const left = Math.max(0, maxDigs - used) + extra;
  const chapter = currentChapter();
  const artefact = G.chapterArtefact?.[chapter] || "Seasonal Artefact";
  const names = (dg.patterns || []).filter((n) => G.diggingFormations?.[n]);
  const patterns = names.map((name) => ({ name, cells: digShape(G.diggingFormations[name], artefact) }));
  const { width = 10, height = 10 } = G.desertGrid || {};
  const key = JSON.stringify([names, holes.map((h) => [h.x, h.y, h.item])]);
  if (digModel.c?.key !== key) digModel.c = { key, solved: digSolve({ patterns, holes, width, height }) };
  const streak = dg.streak || {};
  return {
    holes, stale, boosts, maxDigs, extra, used, left, artefact, patterns, width, height, solved: digModel.c.solved,
    treasures: holes.filter((h) => h.item !== "Sand" && h.item !== "Crab").length,
    totalTreasures: patterns.reduce((a, p) => a + p.cells.length, 0),
    streak: toNum(streak.count), claimedToday: sameUtcDay(streak.collectedAt), totalClaimed: toNum(streak.totalClaimed),
    storm: nextUtcMidnight(t), dugToday: holes.filter((h) => sameUtcDay(h.dugAt)).length,
    shovels: haveOf("Sand Shovel"), drills: haveOf("Sand Drill"),
  };
}

// Casilla sin cavar con más probabilidad y el mejor 2×2 para el taladro (suma de probabilidades)
function digBest(m) {
  const at = (x, y) => m.solved.cells[y * m.width + x];
  const open = m.solved.cells.filter((c) => !c.dug && c.chance > 0);
  const cell = open.sort((a, b) => b.chance - a.chance)[0] || null;
  let drill = null;
  for (let y = 0; y + 1 < m.height; y++) for (let x = 0; x + 1 < m.width; x++) {
    const four = [at(x, y), at(x + 1, y), at(x, y + 1), at(x + 1, y + 1)];
    if (four.some((c) => c.dug)) continue;
    const sum = four.reduce((a, c) => a + c.chance, 0);
    if (!drill || sum > drill.sum + 1e-9) drill = { x, y, sum };
  }
  return { cell, drill: drill && drill.sum > 0 ? drill : null };
}

const DIG_PAT_ES = (name) => name.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
const digPct = (p) => (p >= 0.995 ? "100%" : p > 0 && p < 0.01 ? "<1%" : `${Math.round(p * 100)}%`);
const digCoord = (x, y) => `${String.fromCharCode(65 + x)}${y + 1}`; // columna A–J, fila 1–10

function wDigKpis() {
  const m = digModel();
  if (!m.patterns.length && !m.holes.length) return Empty("crab", "Sin sitio de excavación", "Esta granja aún no ha excavado en el desierto (se desbloquea en la isla desierto).");
  const boostTxt = m.boosts.length ? ` · ${m.boosts.map((b) => `${esc(b.name)} +${b.digs}`).join(", ")}` : "";
  return `<div class="kstrip">
    ${Kcell("Te quedan", `${fmt(m.left, 0)} <small>excavaciones</small>`, `de ${m.maxDigs} de hoy${m.extra ? ` + ${m.extra} compradas` : ""}${boostTxt}`, m.left ? "sun" : "")}
    ${Kcell("Racha", fmt(m.streak, 0), m.claimedToday ? "premio de hoy recogido" : "busca los 3 artefactos", m.claimedToday ? "up" : "")}
    ${Kcell("Tesoros", `${fmt(m.stale ? 0 : m.treasures, 0)} / ${fmt(m.totalTreasures, 0)}`, `artefacto: ${esc(m.artefact)}`)}
    ${Kcell("Herramientas", `${fmt(m.shovels, 0)} <small>palas</small>`, `${fmt(m.drills, 0)} taladros (cavan 2×2)`)}
    ${Kcell("Tormenta en", Cd(m.storm), "a medianoche UTC")}
  </div>`;
}

function wDigBoard() {
  const m = digModel(), r = m.solved;
  if (!m.patterns.length) return Empty("crab", "Sin patrones", "La granja no trae los patrones del día.");
  setSub("dg-board", m.stale ? `<span class="tag sun">sitio de ayer</span> el de hoy aparece cuando entres al desierto` : r.impossible ? "" : `${r.exact ? "exacto" : "aproximado"} · ${r.exact ? `${fmt(r.total, 0)} formas de colocar los patrones` : "demasiadas combinaciones para contarlas todas"}`);
  if (r.impossible) return Empty("warn", "Los datos no encajan", "Ninguna forma de colocar los patrones de hoy encaja con lo cavado. Puede que el juego haya cambiado sus reglas.");
  const best = digBest(m);
  const inDrill = (c) => best.drill && c.x >= best.drill.x && c.x <= best.drill.x + 1 && c.y >= best.drill.y && c.y <= best.drill.y + 1;
  const cell = (c) => {
    const pos = digCoord(c.x, c.y);
    if (c.dug) {
      const treasure = c.dug !== "Sand" && c.dug !== "Crab";
      const what = treasure ? c.dug : c.dug === "Crab" ? "Cangrejo: hay un tesoro arriba, abajo o a un lado" : "Arena: ningún tesoro a los lados";
      return `<div class="dg-c dug ${treasure ? "tr" : c.dug === "Crab" ? "crab" : "sand"}" data-tip="${esc(`${pos} · ya cavada|${what}|`)}">${Gi(c.dug, 22)}</div>`;
    }
    const tone = c.chance >= 0.995 ? "sure" : c.chance >= 0.5 ? "hi" : c.chance > 0 ? "mid" : "none";
    const cls = `dg-c ${tone}${best.cell === c ? " best" : ""}${inDrill(c) ? " drill" : ""}`;
    const tip = `${pos} · ${digPct(c.chance)} de tesoro|${c.item && c.chance > 0 ? `Lo más probable: ${c.item}` : "Aquí no puede haber tesoro"}${best.cell === c ? " · la mejor casilla para la pala" : ""}${inDrill(c) ? " · dentro del mejor 2×2 para el taladro" : ""}|`;
    return `<div class="${cls}" style="--a:${(0.1 + c.chance * 0.55).toFixed(2)}" data-tip="${esc(tip)}">${c.chance >= 0.995 && c.item ? Gi(c.item, 18) : `<span>${c.chance > 0 ? digPct(c.chance) : "·"}</span>`}</div>`;
  };
  const cols = Array.from({ length: m.width }, (_, x) => `<b>${String.fromCharCode(65 + x)}</b>`).join("");
  const rows = Array.from({ length: m.height }, (_, y) => `<b>${y + 1}</b>${r.cells.slice(y * m.width, (y + 1) * m.width).map(cell).join("")}`).join("");
  const tip = best.cell ? `<div class="dg-tip">${sprite("target", 14)} <span>Cava en <b>${digCoord(best.cell.x, best.cell.y)}</b> (${digPct(best.cell.chance)}${best.cell.item ? `, ${esc(best.cell.item)}` : ""})${best.drill ? ` · con taladro, en <b>${digCoord(best.drill.x, best.drill.y)}–${digCoord(best.drill.x + 1, best.drill.y + 1)}</b> (${fmt(best.drill.sum, 1)} tesoros de media)` : ""}</span></div>` : "";
  return `${tip}<div class="dg-wrap"><div class="dg-grid" style="--w:${m.width}"><i></i>${cols}${rows}</div></div>
    <div class="dg-leg"><span><i class="sure"></i>tesoro seguro</span><span><i class="hi"></i>probable (≥50%)</span><span><i class="mid"></i>posible</span><span><i class="none"></i>sin tesoro</span><span><i class="dug"></i>ya cavada</span><span><i class="best"></i>mejor casilla</span><span><i class="drill"></i>mejor 2×2</span></div>
    <p class="dg-note">Las probabilidades salen de todas las formas de colocar los patrones de hoy que encajan con lo que has cavado: un cangrejo siempre tiene un tesoro arriba, abajo o a un lado (no en diagonal) y la arena no tiene ninguno.</p>`;
}

function wDigPatterns() {
  const m = digModel();
  if (!m.patterns.length) return Empty("crab", "Sin patrones", "");
  const by = new Map(m.solved.patterns.map((p) => [p.name, p]));
  setSub("dg-pats", `${m.patterns.length} patrones · ${m.solved.patterns.filter((p) => p.found).length} hallados`);
  return `<div class="dg-pats">${m.patterns.map((p) => {
    const s = by.get(p.name) || {};
    const w = Math.max(...p.cells.map((c) => c.x)) + 1, h = Math.max(...p.cells.map((c) => c.y)) + 1;
    const mini = Array.from({ length: w * h }, (_, i) => {
      const c = p.cells.find((q) => q.x === i % w && q.y === Math.floor(i / w));
      return c ? `<div class="on" data-tip="${esc(c.name)}">${Gi(c.name, 16)}</div>` : "<div></div>";
    }).join("");
    const state = m.solved.impossible ? `<span class="tag">—</span>`
      : s.found ? `<span class="tag green">hallado</span>`
      : s.at ? `<span class="tag sun">ubicado · faltan ${s.left}</span>`
      : `<span class="tag">${fmt(s.positions || 0, 0)} sitios posibles</span>`;
    const items = [...new Set(p.cells.map((c) => c.name))].map((n) => `${p.cells.filter((c) => c.name === n).length}× ${esc(n)}`).join(" · ");
    return `<div class="dg-pat"><div class="dg-mini" style="--w:${w}">${mini}</div><div><b>${esc(DIG_PAT_ES(p.name))}</b><div class="ctx">${items}</div>${state}${s.at && !s.found ? ` <span class="ctx">en ${digCoord(s.at.x, s.at.y)}</span>` : ""}</div></div>`;
  }).join("")}</div>`;
}

/* ── Skills por nivel (la usan Producción, Simulador y Animales) ── */
// Valor de nivel `level` con la misma forma que `v1` (el de nivel 1): ranks [0,9; 0,875; 0,85] y v1 0,9 → tal cual;
// ranks [0,1; 0,15] y v1 0,9 (x0,9) → 1 − r; ranks [0,2…] y v1 20 (+20%) → r × 100. Si no casa, se queda v1.
const RANK_FORMS = [(x) => x, (x) => x * 100, (x) => 1 - x, (x) => 1 - x / 100, (x) => x / 100];
function rankValue(ranks, level, v1) {
  if (!ranks?.length || !(level > 1)) return v1;
  const t = RANK_FORMS.find((g) => Math.abs(g(ranks[0]) - v1) < 1e-6);
  return t ? t(ranks[Math.min(level, ranks.length) - 1]) : v1;
}
if (typeof module !== "undefined") module.exports = { digSolve, digShape, digHoleKind, rankValue };
