// SFL Console — Carrera de expansiones y Estadísticas del juego, sacadas del volcado nocturno (cloud/nightly.js).
"use strict";

const ISLE_ES_ALL = { basic: "básica", spring: "primavera", desert: "desierto", volcano: "volcán", swamp: "pantano", spooky: "spooky", crystal: "cristal", galaxy: "galaxia", marble: "mármol" };
const isleCap = (isl) => G.islandUpgrade?.[isl]?.expansions || 42;
const noDump = () => Empty("globe", "Sin volcado nocturno", "Actívalo en Ajustes → Volcado nocturno: con él se calculan la carrera y las estadísticas de todas las granjas.");

/* ── Carrera de expansiones: las granjas que más lejos han llegado (isla y parcelas) ── */
S.raceTop = Number(readLS("raceTop", 25)) || 25;
function wRace() {
  const d = store.dump.data;
  if (!d) return noDump();
  if (!d.race?.length) return Empty("globe", "Sin datos de la carrera", "El volcado de esta noche aún no la trae: estará en el siguiente.");
  const t = now(), lead = d.race[0], top10 = d.race[Math.min(9, d.race.length - 1)];
  const me = d.me, mine = d.raceMine;
  setSub("rc-main", `volcado del ${esc(d.date)} · ${fmt(d.farms, 0)} granjas`);
  const gap = (r) => (r.island === lead.island ? lead.lands - r.lands : null);
  const rows = d.race.slice(0, S.raceTop);
  const meRow = me && mine ? `<div class="kstrip">
      ${Kcell("Tu puesto", `#${fmt(mine.rank, 0)}`, `de ${fmt(d.farms, 0)} granjas activas`, "sun")}
      ${Kcell("Tú", `${me.metrics.expansions}<small>/ ${isleCap(me.island)}</small>`, `<span class="v-txt">isla ${ISLE_ES_ALL[me.island] || me.island}</span>`)}
      ${Kcell("Al líder", lead.island === me.island ? `${lead.lands - me.metrics.expansions}<small>parcelas</small>` : `<span class="v-txt">isla ${ISLE_ES_ALL[lead.island] || lead.island}</span>`, lead.island === me.island ? "" : `él va por la ${lead.lands} de esa isla`)}
      ${Kcell("Al top 10", top10.island === me.island ? `${Math.max(0, top10.lands - me.metrics.expansions)}<small>parcelas</small>` : `<span class="v-txt">isla ${ISLE_ES_ALL[top10.island] || top10.island}</span>`, top10.island === me.island ? "" : `el 10.º está en la ${top10.lands}`)}
    </div>` : "";
  return `${meRow}<div class="toolbar" style="padding:8px 12px">${SegAct([[10, "Top 10"], [25, "Top 25"], [50, "Top 50"], [100, "Top 100"]], S.raceTop, "racetop")}<span class="grow"></span><span class="ctx">obras según el volcado de anoche</span></div>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th class="r">#</th><th>Granja</th><th>Isla</th><th class="r">Parcelas</th><th>Obra</th><th class="r">Detrás del líder</th></tr></thead><tbody>
    ${rows.map((r, i) => {
      const isMe = me && (String(r.id) === String(me.id));
      const b = r.build, building = b && b.to > t;
      return `<tr class="${isMe ? "sel" : ""}"><td class="r mono">${i + 1}</td><td class="w">${Player(r.username || `#${r.nftId ?? r.id}`, r.equipped, r.nftId ?? r.id)}</td>
        <td>${esc(ISLE_ES_ALL[r.island] || r.island)}${r.asc ? ` <span class="tag sun">A${r.asc}</span>` : ""}</td>
        <td class="r mono"><b>${r.lands}</b><span class="faint">/${isleCap(r.island)}</span></td>
        <td class="ctx">${building ? `parcela ${r.lands + 1} · lista en <b>${dur(b.to - t)}</b>` : b ? `parcela ${r.lands + 1} lista: por reclamar` : r.lands >= isleCap(r.island) ? "isla completa" : "sin obra"}</td>
        <td class="r mono">${i === 0 ? `<span class="tag green">líder</span>` : gap(r) == null ? `<span class="dim">otra isla</span>` : gap(r) ? `${gap(r)} parcela${gap(r) > 1 ? "s" : ""}` : building && lead.build ? `mismo nivel · ${dur(Math.max(0, b.to - lead.build.to))}` : "mismo nivel"}</td></tr>`;
    }).join("")}
    </tbody></table></div>
    <div class="mod-f"><span>Orden: isla (las de ascensión después de volcán) y parcelas; con las mismas, la que antes acaba su obra</span><span>volcado nocturno de Sunflower Land</span></div>`;
}
ACTIONS.racetop = (v) => { S.raceTop = Number(v); writeLS("raceTop", S.raceTop); rerun(); };
PAGES.exprace = () => {
  $("#page").innerHTML = `<div class="plate">${Mod({ id: "rc-main", span: 12, title: "Carrera de expansiones", icon: "trophy", flush: true })}</div>`;
  mount("rc-main", { deps: ["dump"], soft: ["farm"], render: wRace, loading: "rows" });
};
PAGE_META.exprace = { title: "Carrera de expansiones", sub: () => "Las granjas que más lejos han llegado y a cuánto estás tú" };

/* ── Estadísticas del juego: granjas activas, VIP, islas, facciones, ascensiones, rachas y lo más raro ── */
function wGameStats() {
  const d = store.dump.data;
  if (!d) return noDump();
  setSub("st-main", `volcado del ${esc(d.date)}`);
  const N = d.farms || 1, pct = (n) => `${fmt((n / N) * 100, 1)}%`;
  const bar = (rows, total = N) => `<div class="stat-bars">${rows.map(([label, n, extra = ""]) => `<div class="sb-row"><span class="sb-l">${label}</span><div class="pbar"><i style="width:${Math.min(100, (n / Math.max(1, total)) * 100).toFixed(1)}%"></i></div><span class="sb-v mono">${fmt(n, 0)} <span class="faint">${pct(n)}</span>${extra}</span></div>`).join("")}</div>`;
  const items = d.items || {};
  const holders = (n) => items[n]?.[1] ?? (d.wearables?.[n]?.[1] ?? 0), units = (n) => items[n]?.[0] ?? (d.wearables?.[n]?.[0] ?? 0);
  const listOf = (names, title) => {
    const rows = [...new Set(names)].filter((n) => holders(n) > 0).map((n) => [n, holders(n), units(n)]).sort((a, b) => a[1] - b[1]);
    return rows.length ? `<div class="st-card"><div class="grp">${title}</div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Objeto</th><th class="r">Granjas</th><th class="r">Unidades</th></tr></thead><tbody>
      ${rows.slice(0, 15).map(([n, h, u]) => `<tr><td class="w">${Gi(n, 16)} ${esc(n)}</td><td class="r mono">${fmt(h, 0)}</td><td class="r mono dim">${fmt(u, 0)}</td></tr>`).join("")}
      </tbody></table></div></div>` : "";
  };
  const mutants = Object.values(G.chapterCollections || {}).flatMap((c) => c?.mutants || []).map((m) => (typeof m === "string" ? m : m?.name)).filter(Boolean);
  const marvels = Object.values(G.mapPieces?.base || {}).map((x) => x.marvel).filter(Boolean);
  const banners = Object.keys(items).filter((n) => / Banner$/.test(n));
  const flowers = Object.keys(G.flowerSeedOf || {});
  const st = d.streaks || {};
  return `<div class="kstrip">
      ${Kcell("Granjas activas", fmt(d.farms, 0), "las que trae el volcado (activas en los últimos 90 días)")}
      ${Kcell("Hoy", fmt(d.active1, 0), `${pct(d.active1)} jugaron en las últimas 24 h`)}
      ${Kcell("Esta semana", fmt(d.active7, 0), `${pct(d.active7)} en los últimos 7 días`)}
      ${Kcell("VIP", fmt(d.vip, 0), `${pct(d.vip)} de las activas`, "sun")}
      ${st.active != null ? Kcell("Rachas de excavación", fmt(st.active, 0), `${fmt(st[7] || 0, 0)} de 7+ días · ${fmt(st[30] || 0, 0)} de 30+`) : ""}
    </div>
    <div class="gst-grid">
      <div class="st-card"><div class="grp">Islas</div>${bar(Object.entries(d.islands || {}).sort((a, b) => b[1] - a[1]).map(([k, n]) => [`isla ${ISLE_ES_ALL[k] || k}`, n]))}</div>
      <div class="st-card"><div class="grp">Facciones</div>${bar(Object.entries(d.factions || {}).sort((a, b) => b[1] - a[1]).map(([k, n]) => [esc(FACTION_ES?.[k] || k), n]))}</div>
      ${Object.keys(d.ascension || {}).length ? `<div class="st-card"><div class="grp">Ascensiones</div>${bar(Object.entries(d.ascension).sort((a, b) => Number(a[0]) - Number(b[0])).map(([k, n]) => [`Ascensión ${k}`, n]))}</div>` : ""}
      ${st.active != null ? `<div class="st-card"><div class="grp">Rachas de excavación</div>${bar([["con racha", st.active], ["7+ días", st[7] || 0], ["14+ días", st[14] || 0], ["30+ días", st[30] || 0], ["60+ días", st[60] || 0], ["100+ días", st[100] || 0]])}</div>` : ""}
    </div>
    <div class="gst-grid">
      ${listOf(mutants, "Mutantes del capítulo (los más raros primero)")}
      ${listOf(marvels, "Peces maravilla")}
      ${listOf(banners, "Banners")}
      ${listOf(flowers, "Flores más raras")}
    </div>
    <div class="mod-f"><span>Cuenta granjas que tienen al menos uno en el inventario · sin baneadas</span><span>volcado nocturno de Sunflower Land</span></div>`;
}
PAGES.stats = () => {
  $("#page").innerHTML = `<div class="plate">${Mod({ id: "st-main", span: 12, title: "Estadísticas del juego", icon: "globe", flush: true })}</div>`;
  mount("st-main", { deps: ["dump"], render: wGameStats, loading: "rows" });
};
PAGE_META.stats = { title: "Estadísticas", sub: () => "Cuántos juegan, en qué isla, VIP, rachas y lo más raro del juego, según el volcado de anoche" };
