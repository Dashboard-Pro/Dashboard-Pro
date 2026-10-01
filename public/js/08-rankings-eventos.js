// SFL Console — Rankings, ficha de jugador y eventos.
// Scripts clásicos que comparten el ámbito global en el orden de index.html (antes, un solo app.js).
"use strict";

/* ── Rankings ───────────────────────────────────────────────────────────── */
const BOARDS = { coins: "Coins", experience: "XP", sunflowers: "Sunflowers", kale: "Kale", chores: "Chores", deliveries: "Entregas", dailyLoginStreak: "Racha login", diggingStreak: "Racha excavar", newPlayerExperience: "Novatos" };
const isMe = (id) => has("farm") && (id === store.farm.data.id || id === store.farm.data.nft_id);
const Rank = (n) => `<span class="rk${n <= 3 ? " r" + n : ""}">${n}</span>`;

function wStats() {
  const st = store.stats.data;
  const board = st.boards?.[S.board];
  const mine = board?.players.find((p) => isMe(p.farmId));
  setSub("rk-stats", mine ? `estás en el puesto <b style="color:var(--sun)">#${mine.rank}</b>` : `día ${st.reportDate}`);
  const top = board?.players[0]?.count || 1;
  return `<div class="toolbar">${Seg(Object.entries(BOARDS), S.board, "board")}</div>` + (!board ? Empty("trophy", "Sin datos", "No hay ranking para esta categoría.") :
    `<div class="tbl-wrap" style="max-height:calc(100vh - 260px)"><table class="tbl"><thead><tr><th>#</th><th>Jugador</th><th class="r">Nivel</th><th class="r">${esc(board.title || BOARDS[S.board])}</th><th class="r">vs #1</th></tr></thead>
    <tbody>${board.players.map((p) => `<tr class="${isMe(p.farmId) ? "me" : ""}"><td class="ic">${Rank(p.rank)}</td>
      <td class="w">${Player(p.username, p.bumpkin, p.farmId)}</td><td class="r dim">${p.level ?? "—"}${p.ascension ? ` <span class="tag sun">A${p.ascension}</span>` : ""}</td>
      <td class="r"><b>${fmt(p.count, 0)}</b></td><td class="r dim">${p.rank === 1 ? "—" : fmt((p.count / top) * 100, 0) + "%"}</td></tr>`).join("")}</tbody></table></div>`);
}

// En la API real las filas no siempre traen accountId ni rank (el top viene ordenado): se identifica
// por farmId/accountId y el puesto se deduce por posición cuando falta.
const isMeRow = (r) => Boolean(r) && (isMe(r.farmId) || isMe(r.accountId));
function ticketRows(d) {
  const top = d.topTen.map((r, i) => ({ ...r, rank: r.rank ?? i + 1 }));
  return { top, around: d.farmRankingDetails || null };
}
function ticketInfo() {
  const d = store.tickets.data;
  const { top, around } = ticketRows(d);
  const mine = top.find(isMeRow) || around?.find(isMeRow);
  const above = mine && (around?.find((r) => r.rank === mine.rank - 1) || top.find((r) => r.rank === mine.rank - 1));
  return { d, mine, above, top, around };
}
function wTicketsMini() {
  const { d, mine, above } = ticketInfo();
  setSub("ov-tickets", `${compact(d.total)} en juego`);
  if (d.farmRankingDetails === null && !mine) return Empty("ticket", "Sin tickets aún", "Todavía no has conseguido tickets este capítulo.");
  if (!mine) return Empty("ticket", "Fuera del ranking", "");
  const share = d.total ? (mine.count / d.total) * 100 : 0;
  return `<div style="display:flex;align-items:flex-end;gap:18px"><div class="big sun">#${fmt(mine.rank, 0)}</div>
      <div class="ctx" style="padding-bottom:4px"><b>${fmt(mine.count, 0)}</b> tickets<br>${fmt(share, 3)}% del total</div></div>
    <div class="ctx" style="margin-top:14px">${above ? `A <b>${fmt(above.count - mine.count + 1, 0)}</b> ticket${above.count - mine.count + 1 === 1 ? "" : "s"} de pasar a <b>${esc(above.id)}</b> (#${above.rank})` : mine.rank <= 3 ? "En el podio" : ""}</div>
    <div class="ctx" style="margin-top:4px">Tabla actualizada ${ago(d.lastUpdated)}</div>`;
}
function wTicketsFull() {
  const { d, mine, above, top, around } = ticketInfo();
  setSub("rk-tickets", `${compact(d.total)} tickets · ${ago(d.lastUpdated)}`);
  const rows = [...top];
  if (around?.length) rows.push(null, ...around);
  const head = mine ? `<div class="kstrip">${Kcell("Tu puesto", `#${fmt(mine.rank, 0)}`, "", "sun")}${Kcell("Tickets", fmt(mine.count, 0))}${above ? Kcell("Para subir", fmt(above.count - mine.count + 1, 0), `a ${esc(above.id)}`) : ""}</div>`
    : d.farmRankingDetails === null ? `<div class="ctx" style="padding:12px 16px">Aún no has conseguido tickets este capítulo.</div>` : "";
  return head + `<div class="tbl-wrap" style="max-height:calc(100vh - 330px)"><table class="tbl"><thead><tr><th>#</th><th>Jugador</th><th class="r">Tickets</th></tr></thead><tbody>${rows.map((r) => r === null
    ? `<tr class="gap"><td colspan="3">···</td></tr>`
    : `<tr class="${isMeRow(r) ? "me" : ""}"><td class="ic">${Rank(r.rank)}</td><td class="w">${Player(r.id, r.bumpkin, r.farmId ?? r.accountId)}</td><td class="r">${fmt(r.count, 0)}</td></tr>`).join("")}</tbody></table></div>`;
}

/* ── Ficha de jugador (clic en un nombre de los rankings) ───────────────── */
// Todo sale de los rankings ya cargados: ninguna petición extra a la API. El top de tickets mezcla
// IDs de granja y de NFT, así que se cruza por farmId o por nombre.
// De la cabeza a los pies; fondo y piel al final
const OUTFIT_ES = { hat: "Sombrero", hair: "Pelo", beard: "Barba", eyes: "Ojos", mouth: "Boca", necklace: "Collar", shirt: "Camisa", coat: "Abrigo",
  dress: "Vestido", suit: "Traje", onesie: "Mono", pants: "Pantalón", shoes: "Calzado", tool: "Herramienta", secondaryTool: "Mano izq.",
  wings: "Espalda", aura: "Aura", body: "Piel", background: "Fondo" };
function playerInfo(id, name) {
  const same = (fid, n) => (fid != null && String(fid) === String(id)) || (n != null && n === name);
  const info = { id, name, boards: [], tickets: null, level: null, ascension: 0, xp: null, bumpkin: null };
  for (const [key, b] of Object.entries(store.stats?.data?.boards || {})) {
    const p = b.players.find((q) => same(q.farmId, q.username));
    if (!p) continue;
    info.boards.push({ key, title: BOARDS[key] || b.title || key, rank: p.rank, count: p.count });
    info.level ??= p.level; info.ascension ||= p.ascension || 0; info.bumpkin ??= p.bumpkin;
  }
  if (has("tickets")) {
    const { top, around } = ticketRows(store.tickets.data);
    const r = [...top, ...(around || [])].find((q) => same(q.farmId ?? q.accountId, q.id));
    if (r) { info.tickets = r; info.xp = r.experience ?? null; info.ascension ||= r.ascensionLevel || 0; info.bumpkin ??= r.bumpkin; }
  }
  const seen = PC_SEEN.get(String(id));
  if (seen) { info.bumpkin ??= seen.bumpkin; info.level ??= seen.level ?? null; }
  return info;
}
function playerCardHtml(p) {
  const url = bumpkinImageUrl(p.bumpkin, Math.round(160 * Math.min(2, window.devicePixelRatio || 1)));
  const me = isMe(Number(p.id)) || (has("farm") && store.farm.data.farm?.username === p.name);
  const outfit = Object.keys(OUTFIT_ES).filter((s) => p.bumpkin?.[s]).map((s) => [s, p.bumpkin[s]]);
  const boards = [...p.boards].sort((a, b) => a.rank - b.rank);
  return `<button class="pc-x" type="button" data-pclose aria-label="Cerrar">×</button>
    <figure class="sf-frame pc-frame"><div class="sf-photo${url ? "" : " fallback"}">${url ? `<img src="${esc(url)}" alt="Bumpkin de ${esc(p.name)}" width="160" height="160" onerror="this.parentElement.classList.add('fallback');this.remove()"/>` : ""}${sprite("sprout", 48)}</div>
      <figcaption class="sf-plaque"><div class="sf-name" id="pcName">${esc(p.name)}${me ? ` <span class="tag sun">tú</span>` : ""}</div><div class="sf-id">#${esc(p.id)}</div></figcaption></figure>
    <div class="pc-body">
      <div class="pc-farm" id="pcFarm">${pcFarmCells(p, null)}</div>
      ${boards.length || p.tickets ? `<div class="pc-h">En los rankings</div><div class="pc-ranks">
        ${p.tickets ? `<div><span>${sprite("ticket", 14)} Tickets</span>${Rank(p.tickets.rank)}<b>${fmt(p.tickets.count, 0)}</b></div>` : ""}
        ${boards.map((b) => `<div><span>${esc(b.title)}</span>${Rank(b.rank)}<b>${compact(b.count)}</b></div>`).join("")}</div>` : ""}
      ${outfit.length ? `<details class="pc-wear"><summary>Lleva puesto <span class="dim">(${outfit.length})</span></summary><div class="pc-outfit">${outfit.map(([s, n]) => `<div><span>${OUTFIT_ES[s]}</span>${esc(n)}</div>`).join("")}</div></details>` : ""}
      ${me || String(p.id) === String(S.farmId) ? "" : `<a class="pc-link" href="${esc(viewFarmUrl(p.id))}">${String(p.id) === String(S.homeFarm) ? "Volver a tu granja" : "Ver su granja en el dashboard"} →</a>`}
      <a class="pc-link" href="https://sunflower-land.com/play/#/visit/${encodeURIComponent(p.id)}" target="_blank" rel="noopener noreferrer">Visitar su granja ↗</a>
    </div>`;
}
// Coins, gemas, expansiones e isla no vienen en los rankings: una petición a su granja al abrir la
// ficha (pasa por la cola del proxy, ~5 s) y se recuerda 10 min para no repetirla.
const ISLAS = { basic: "Básica", spring: "Primavera", desert: "Desierto", volcano: "Volcán", crystal: "Cristal" };
const PC_FARMS = new Map();
function pcFarmCells(p, farm, error) {
  const cell = (label, v) => `<div><span>${label}</span><b>${v}</b></div>`;
  // Al ascender el nivel vuelve a empezar pero la XP sigue acumulándose, y la granja no dice cuántas
  // veces ha ascendido: manda el nivel del ranking/sorteo; la XP solo vale si no pasa del nivel máximo
  const fromXp = (xp) => { const l = bumpkinLevel(xp); return l.toNext > 0 ? l.lvl : null; };
  const xp = farm ? toNum(farm.bumpkin?.experience) : p.xp;
  const ascended = p.ascension || (xp != null && fromXp(xp) == null);
  const lvl = p.level ?? (xp != null && !p.ascension ? fromXp(xp) : null);
  const level = cell("Nivel", `${lvl ?? "—"}${p.ascension ? ` <span class="tag sun">Ascensión ${p.ascension}</span>` : ascended ? ` <span class="tag sun">Ascendido</span>` : ""}`);
  if (error) return level + `<div class="pc-err">${sprite("warn", 14)} ${esc(error)}</div>`;
  if (!farm) return level + ["Coins", "Gemas", "Expansiones", "Isla"].map((l) => cell(l, `<i class="sk" style="width:48px"></i>`)).join("");
  const t = farm.island?.type;
  return level
    + cell("Coins", compact(toNum(farm.coins)))
    + cell("Gemas", fmt(toNum(farm.inventory?.Gem), 0))
    + cell("Expansiones", fmt(toNum(farm.inventory?.["Basic Land"]), 0))
    + cell("Isla", esc(ISLAS[t] || t || "—"));
}
// Tras cargar su granja: foto si el jugador no venía de un ranking (búsqueda por nombre) y, de
// sfl.world, desde cuándo juega y sus marks/cheer. Todo opcional: si falla, la ficha queda igual.
async function pcFillExtra(p, farm, nftId) {
  const id = String(p.id);
  const card = $("#playerCard");
  const current = () => card.dataset.id === id && !card.hidden;
  if (!p.bumpkin && farm?.bumpkin?.equipped && current()) {
    const url = bumpkinImageUrl(farm.bumpkin.equipped, Math.round(160 * Math.min(2, window.devicePixelRatio || 1)));
    const ph = card.querySelector(".sf-photo");
    if (url && ph) { ph.classList.remove("fallback"); ph.insertAdjacentHTML("afterbegin", `<img src="${esc(url)}" alt="Bumpkin de ${esc(p.name)}" width="160" height="160" onerror="this.parentElement.classList.add('fallback');this.remove()"/>`); }
  }
  if (!p.name && farm?.username && current()) { const n = card.querySelector("#pcName"); if (n) n.textContent = farm.username; }
  try {
    const w = await api(`/api/ext/land/${encodeURIComponent(nftId ?? id)}`);
    const l = w.land || {};
    const cells = [
      l.created ? `<div class="wide"><span>Juega desde</span><b>${esc(new Date(l.created + "T00:00:00Z").toLocaleDateString(LOCALE, { month: "short", year: "numeric" }))}</b></div>` : "",
      l.marks != null ? `<div><span>Marks</span><b>${fmt(toNum(l.marks), 0)}</b></div>` : "",
      l.cheer != null ? `<div><span>Cheer</span><b>${fmt(toNum(l.cheer), 0)}</b></div>` : "",
    ].join("");
    const el = $("#pcFarm");
    if (cells && el && current() && !el.querySelector(".wide")) el.insertAdjacentHTML("beforeend", cells);
  } catch { /* sfl.world no disponible o granja aún no indexada */ }
}
async function loadPlayerFarm(p) {
  const id = String(p.id);
  const fill = (html) => { const el = $("#pcFarm"); if (el && $("#playerCard").dataset.id === id) el.innerHTML = html; };
  if (isMe(Number(id))) { fill(pcFarmCells(p, store.farm.data.farm)); return pcFillExtra(p, store.farm.data.farm, store.farm.data.nft_id); }
  const hit = PC_FARMS.get(id);
  if (hit && Date.now() - hit.at < 600_000) { fill(pcFarmCells(p, hit.farm)); return pcFillExtra(p, hit.farm, hit.nftId); }
  try {
    const d = await api(`/api/farm/${encodeURIComponent(id)}`);
    PC_FARMS.set(id, { at: Date.now(), farm: d.farm, nftId: d.nft_id });
    fill(pcFarmCells(p, d.farm));
    pcFillExtra(p, d.farm, d.nft_id);
  } catch (e) {
    fill(pcFarmCells(p, null, e.status === 404 ? "No se encontró su granja" : "No se pudo cargar su granja"));
  }
}
let pcOpener = null;
const openPlayerCard = (btn) => openPlayerCardFor(btn.dataset.player, btn.dataset.pname, btn);
function openPlayerCardFor(id, name, btn) {
  const card = $("#playerCard");
  const p = playerInfo(String(id), name);
  card.innerHTML = playerCardHtml(p);
  card.dataset.id = String(id);
  card.hidden = false;
  pcOpener = btn;
  loadPlayerFarm(p);
  // Junto a la fila pulsada, sin salirse de la ventana (en móvil va centrada por CSS)
  if (window.innerWidth > 760) {
    const r = btn.getBoundingClientRect(), w = card.offsetWidth, h = card.offsetHeight, m = 12;
    let left = r.right + m;
    if (left + w > window.innerWidth - m) left = Math.max(m, r.left - w - m);
    card.style.left = `${left}px`;
    card.style.top = `${Math.min(Math.max(m, r.top + r.height / 2 - h / 2), window.innerHeight - h - m)}px`;
  } else { card.style.left = card.style.top = ""; }
  card.querySelector(".pc-x").focus();
}
function closePlayerCard() {
  const card = $("#playerCard");
  if (!card || card.hidden) return false;
  card.hidden = true;
  pcOpener?.isConnected && pcOpener.focus();
  pcOpener = null;
  return true;
}

/* ── Eventos ────────────────────────────────────────────────────────────── */
const costText = (sfl, ing) => [sfl ? `${fmt(sfl)} FLOWER` : "", ...Object.entries(ing || {}).map(([k, v]) => `${fmt(v)} ${k}`)].filter(Boolean).join(" + ") || "gratis";
const auctionPrize = (a) => a.collectible || a.wearable || a.nft || "?";
const auctionIcon = (a) => ({ collectible: "trophy", wearable: "shirt", nft: "paw" })[a.type] || "coin";
const prizeText = (p) => p.nft || Object.entries(p.items || p.wearables || {}).map(([k, v]) => `${fmt(v)} ${k}`).join(", ") || p.type;

function auctionRow(a, mode) {
  const t = now();
  return `<div class="ev ${mode === "past" ? "click" : ""} ${mode === "live" ? "live" : ""}" ${mode === "past" ? `data-auction="${esc(a.auctionId)}"` : ""}>
    <div class="ico">${sprite(auctionIcon(a), 18)}</div>
    <div style="min-width:0"><div class="t">${esc(auctionPrize(a))}</div><div class="s">${a.supply >= 1e10 ? "sin límite" : `${fmt(a.supply, 0)} uds`} · ${esc(costText(a.sfl, a.ingredients))}</div></div>
    <div class="tm">${mode === "live" ? `<span class="down" data-until="${a.endAt}">${dur(a.endAt - t)}</span><small>termina</small>`
      : mode === "next" ? `<span data-until="${a.startAt}">${dur(a.startAt - t)}</span><small>${at(a.startAt)}</small>`
      : `<small>${dateShort(a.endAt)}</small><small>resultados →</small>`}</div></div>`;
}
function raffleRow(r, mode) {
  const t = now();
  const top = r.prizes?.[1] || r.prizes?.["1"];
  return `<div class="ev click ${mode === "live" ? "live" : ""}" data-raffle="${esc(r.id)}">
    <div class="ico">${sprite("ticket", 18)}</div>
    <div style="min-width:0"><div class="t">${esc(top ? prizeText(top) : r.id)}</div><div class="s">${Object.keys(r.prizes || {}).length} premios · ${esc(Object.entries(r.entryRequirements || {}).map(([k, v]) => `${k} ×${v}`).join(", "))}</div></div>
    <div class="tm">${mode === "live" ? `<span data-until="${r.endAt}">${dur(r.endAt - t)}</span><small>cierra</small>`
      : mode === "next" ? `<span data-until="${r.startAt}">${dur(r.startAt - t)}</span><small>abre</small>` : `<small>${dateShort(r.endAt)}</small><small>ganadores →</small>`}</div></div>`;
}
function splitEvents(list, startKey = "startAt") {
  const t = now();
  return {
    live: list.filter((x) => x[startKey] <= t && x.endAt > t),
    next: list.filter((x) => x[startKey] > t).sort((a, b) => a[startKey] - b[startKey]),
    past: list.filter((x) => x.endAt <= t).sort((a, b) => b.endAt - a.endAt),
  };
}

function wAgenda() {
  const A = splitEvents(store.auctions.data), R = splitEvents(store.raffles.data);
  const out = [
    ...A.live.map((a) => auctionRow(a, "live")),
    ...R.live.map((r) => raffleRow(r, "live")),
    ...A.next.slice(0, 3).map((a) => auctionRow(a, "next")),
    ...R.next.slice(0, 1).map((r) => raffleRow(r, "next")),
  ];
  setSub("ov-events", `${A.live.length + R.live.length} activos · ${A.next.length} subastas próximas`);
  return out.length ? out.join("") : Empty("calendar", "Agenda vacía", "No hay subastas ni sorteos programados.");
}
function wAuctions() {
  const { live, next, past } = splitEvents(store.auctions.data);
  setSub("ev-auctions", `${live.length} en directo · ${next.length} próximas`);
  const html = (live.length ? `<div class="grp"><i class="dot err"></i>En directo</div>${live.map((a) => auctionRow(a, "live")).join("")}` : "") +
    (next.length ? `<div class="grp">Próximas</div>${next.slice(0, 10).map((a) => auctionRow(a, "next")).join("")}` : "") +
    (past.length ? `<div class="grp">Recientes</div>${past.slice(0, 8).map((a) => auctionRow(a, "past")).join("")}` : "");
  return html || Empty("hammer", "Sin subastas", "");
}
function wRaffles() {
  const { live, next, past } = splitEvents(store.raffles.data);
  setSub("ev-raffles", `${live.length} abiertos`);
  const html = (live.length ? `<div class="grp"><i class="dot"></i>Abiertos</div>${live.map((r) => raffleRow(r, "live")).join("")}` : "") +
    (next.length ? `<div class="grp">Próximos</div>${next.slice(0, 5).map((r) => raffleRow(r, "next")).join("")}` : "") +
    (past.length ? `<div class="grp">Terminados</div>${past.slice(0, 8).map((r) => raffleRow(r, "past")).join("")}` : "");
  return html || Empty("ticket", "Sin sorteos", "");
}

function discordText(s) {
  let h = esc(s)
    .replace(/&lt;a?:(\w+):\d+&gt;/g, ":$1:")
    .replace(/&lt;@&amp;\d+&gt;/g, "@rol")
    .replace(/&lt;@!?\d+&gt;/g, "@alguien")
    .replace(/&lt;#\d+&gt;/g, "#canal")
    .replace(/&lt;t:(\d+)(?::\w)?&gt;/g, (_, s) => dateShort(Number(s) * 1000))
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/__(.+?)__/g, "<u>$1</u>")
    .replace(/(^|\s)\*(\S.*?)\*(?=\s|$)/g, "$1<i>$2</i>")
    .replace(/^#{1,3} (.+)$/gm, "<b>$1</b>");
  return h.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
}
function wNewsMini() {
  const posts = store.discord.data.slice(0, 3);
  setSub("ov-news", posts[0] ? `último ${ago(toTs(posts[0].createdAt))}` : "");
  if (!posts.length) return Empty("chat", "Sin anuncios", "");
  return `<div class="news">${posts.map((p) => `<a class="news-item" href="${esc(p.url)}" target="_blank" rel="noopener" style="color:inherit;text-decoration:none">
    <div class="meta"><span class="tag">#${esc(p.channelName)}</span>${ago(toTs(p.createdAt))}<span style="margin-left:auto">♥ ${fmt(p.likes || 0, 0)}</span></div>
    <div class="txt">${discordText(p.content).replace(/<a [^>]*>(.*?)<\/a>/g, "$1")}</div></a>`).join("")}</div>`;
}
function wDiscord() {
  const posts = store.discord.data;
  setSub("ev-discord", `${posts.length} últimos`);
  return posts.map((p) => `<article class="post">
    <div class="post-h">${p.sender?.avatarUrl ? `<img src="${esc(p.sender.avatarUrl)}" alt="" loading="lazy">` : sprite("chat", 18)}<b>${esc(p.sender?.displayName || p.sender?.username)}</b>
      <span class="tag">#${esc(p.channelName)}</span><span class="when">${ago(toTs(p.createdAt))}</span></div>
    <div class="post-b">${discordText(p.content)}</div>
    ${(p.images || []).slice(0, 2).map((i) => `<img class="att" src="${esc(i.url)}" alt="" loading="lazy">`).join("")}
    <div class="post-f"><span>♥ ${fmt(p.likes || 0, 0)}</span><a href="${esc(p.url)}" target="_blank" rel="noopener">Abrir en Discord ↗</a></div>
  </article>`).join("") || Empty("chat", "Sin anuncios", "");
}
