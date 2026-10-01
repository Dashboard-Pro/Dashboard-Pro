// Fusión de los datos sincronizados entre ordenadores. Sin conflictos: cada tipo se mezcla de forma que
// no se pierde nada aunque los dos ordenadores hayan escrito a la vez.
//   costs        → { key: { value, at } }  gana el más reciente por clave (value null = borrado)
//   trades:<id>  → { trades: { id: trade }, updatedAt }  unión por id de operación
//   prices:<mes> → { "AAAA-MM-DD": { key: floor } }  unión por día y clave
//   wealth:<id>  → { "AAAA-MM-DD": { total, …, at } }  unión por día; si coincide el día, la foto más reciente
//   friends      → { farmId: { value: { name }, at } }  como costs (solo por GitHub, no va a la nube)

const DOC_RE = /^(costs|trades:[A-Za-z0-9]{1,40}|prices:\d{4}-\d{2})$/;
const isDoc = (doc) => DOC_RE.test(doc);

function mergeCosts(a = {}, b = {}) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) {
    if (!v || typeof v !== "object") continue;
    if (!out[k] || (v.at || 0) >= (out[k].at || 0)) out[k] = v;
  }
  return out;
}
function mergeTrades(a = {}, b = {}) {
  const trades = { ...(a.trades || {}), ...(b.trades || {}) };
  return { trades, updatedAt: Math.max(a.updatedAt || 0, b.updatedAt || 0) || null };
}
function mergePrices(a = {}, b = {}) {
  const out = { ...a };
  for (const [day, items] of Object.entries(b)) out[day] = { ...(out[day] || {}), ...items };
  return out;
}
function mergeDoc(doc, a, b) {
  if (doc === "costs" || doc === "friends") return mergeCosts(a, b);
  if (doc.startsWith("wealth:")) {
    const out = { ...a };
    for (const [day, v] of Object.entries(b || {})) if (!out[day] || (v?.at || 0) >= (out[day].at || 0)) out[day] = v;
    return out;
  }
  if (doc.startsWith("trades:")) return mergeTrades(a, b);
  if (doc.startsWith("prices:")) return mergePrices(a, b);
  throw new Error("Documento desconocido");
}

module.exports = { isDoc, mergeDoc };
