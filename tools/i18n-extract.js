// Saca los textos de la interfaz (public/js/*.js e index.html) para traducirlos: cadenas y plantillas `...${x}...`,
// partidas por etiquetas HTML. Cada ${...} se convierte en {0}, {1}… Uso:
//   node tools/i18n-extract.js            → lista de textos que aún no tienen traducción en public/js/i18n/en.js
//   node tools/i18n-extract.js --all      → todos
// La traducción vive en public/js/i18n/en.js (window.I18N_EN = { "texto": "text", … }).
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const dir = path.join(root, "public", "js");

// ── Tokenizador mínimo de JS: cadenas, plantillas (con ${} anidados), comentarios y regex ───────────
function scan(src) {
  const strings = [], templates = [];
  let i = 0, lastSig = "";
  const isRegexStart = () => !lastSig || /[(,=:[!&|?{};+\-*%<>~^]$/.test(lastSig) || /\b(return|typeof|case|in|of|delete|void|throw|new)$/.test(lastSig);
  function readString(q) {
    let s = "";
    i++;
    while (i < src.length && src[i] !== q) {
      if (src[i] === "\\") { s += src[i] + src[i + 1]; i += 2; continue; }
      s += src[i++];
    }
    i++;
    return s;
  }
  function readTemplate() {
    // devuelve las piezas literales y el número de expresiones
    const parts = [""];
    i++;
    while (i < src.length && src[i] !== "`") {
      if (src[i] === "\\") { parts[parts.length - 1] += src[i] + src[i + 1]; i += 2; continue; }
      if (src[i] === "$" && src[i + 1] === "{") {
        i += 2;
        readCode(true);
        parts.push("");
        continue;
      }
      parts[parts.length - 1] += src[i++];
    }
    i++;
    return parts;
  }
  function readCode(untilBrace) {
    let depth = 0;
    while (i < src.length) {
      const c = src[i];
      if (untilBrace && c === "}" && depth === 0) { i++; lastSig = "}"; return; }
      if (c === "{") { depth++; i++; lastSig = c; continue; }
      if (c === "}") { depth--; i++; lastSig = c; continue; }
      if (c === "/" && src[i + 1] === "/") { while (i < src.length && src[i] !== "\n") i++; continue; }
      if (c === "/" && src[i + 1] === "*") { i = src.indexOf("*/", i + 2) + 2; continue; }
      if (c === '"' || c === "'") { strings.push(readString(c)); lastSig = "s"; continue; }
      if (c === "`") { templates.push(readTemplate()); lastSig = "s"; continue; }
      if (c === "/" && isRegexStart()) {
        i++;
        let inClass = false;
        while (i < src.length) {
          if (src[i] === "\\") { i += 2; continue; }
          if (src[i] === "[") inClass = true;
          else if (src[i] === "]") inClass = false;
          else if (src[i] === "/" && !inClass) break;
          else if (src[i] === "\n") break;
          i++;
        }
        i++;
        while (/[a-z]/.test(src[i] || "")) i++;
        lastSig = "r";
        continue;
      }
      if (!/\s/.test(c)) {
        if (/[A-Za-z0-9_$]/.test(c)) {
          let w = "";
          while (/[A-Za-z0-9_$]/.test(src[i] || "")) w += src[i++];
          lastSig = w;
          continue;
        }
        lastSig = c;
      }
      i++;
    }
  }
  readCode(false);
  return { strings, templates };
}

// Texto con pinta de interfaz en español (o al menos texto para personas)
const HAS_WORD = /[a-záéíóúñü]{2,}/i;
const SPANISH_HINT = /[áéíóúñ¿¡]|\b(el|la|los|las|de|del|que|por|para|con|sin|tu|tus|un|una|hoy|día|días|más|menos|y|o|en|se|no|ya|al|lo)\b/i;
const CODEY = /^[#.[]|=>|\$\{|^\w+:\w|^[a-z][a-zA-Z0-9]*$|^[a-z0-9-]+$|^[\w-]+\.(js|css|json|png|webp|svg)$|^https?:|^\/api\//;
const unescapeJs = (s) => s.replace(/\\n/g, " ").replace(/\\(["'`\\$])/g, "$1").replace(/\\u([0-9a-f]{4})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
const norm = (s) => unescapeJs(s).replace(/\s+/g, " ").trim();

function fromTemplate(parts) {
  const out = [];
  // Plantilla con marcadores {n}
  let txt = parts[0];
  for (let k = 1; k < parts.length; k++) txt += `{${k - 1}}` + parts[k];
  // Renumerar los marcadores de cada trozo desde {0}
  const renum = (t) => { let n = 0; const map = {}; return t.replace(/\{(\d+)\}/g, (_, d) => `{${map[d] ??= n++}}`); };
  // Atributos de texto
  for (const m of txt.matchAll(/\b(title|placeholder|aria-label|alt|data-tip)="([^"]*)"/g)) {
    for (const piece of m[2].split("|")) { const t = norm(piece); if (HAS_WORD.test(t.replace(/\{\d+\}/g, ""))) out.push(renum(t)); }
  }
  // Texto entre etiquetas (las etiquetas pueden llevar ${} dentro)
  const noTags = txt.replace(/<[^<>]*>/g, "\u0000");
  for (const run of noTags.split("\u0000")) {
    const t = norm(run);
    if (!t || !HAS_WORD.test(t.replace(/\{\d+\}/g, ""))) continue;
    out.push(renum(t));
  }
  return out;
}

const found = new Map(); // texto → archivos
const JUNK = /^(#|\/api\/|\.[a-z]|\?farm|<img|<link|https?:|\{\d+\}$)/;
// Los tooltips (data-tip="título|cuerpo|pie") se pintan por partes: cada trozo se traduce aparte
const add = (t, f) => { for (const p of t.split("|")) { const x = p.trim(); if (!x || JUNK.test(x) || !HAS_WORD.test(x.replace(/\{\d+\}/g, ""))) continue; if (!found.has(x)) found.set(x, new Set()); found.get(x).add(f); } };
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".js") && !x.startsWith("i18n"))) {
  const { strings, templates } = scan(fs.readFileSync(path.join(dir, f), "utf8"));
  for (const s of strings) {
    const t = norm(s);
    if (!t || CODEY.test(t) || !HAS_WORD.test(t)) continue;
    if (t.includes("<")) { for (const x of fromTemplate([t])) add(x, f); continue; }
    if (!SPANISH_HINT.test(t) && !/^[A-ZÁÉÍÓÚ][a-záéíóúñü]+( [a-záéíóúñü]+)*$/.test(t)) continue;
    add(t, f);
  }
  for (const p of templates) for (const x of fromTemplate(p)) add(x, f);
}
// index.html: texto visible y atributos
const html = fs.readFileSync(path.join(root, "public", "index.html"), "utf8").replace(/<script[\s\S]*?<\/script>/g, "").replace(/<style[\s\S]*?<\/style>/g, "");
for (const x of fromTemplate([html])) add(x, "index.html");

let dict = {};
try { global.window = {}; require(path.join(dir, "i18n", "en.js")); dict = window.I18N_EN || {}; } catch { /* aún no existe */ }
const all = process.argv.includes("--all");
const list = [...found.keys()].filter((t) => all || !(t in dict)).sort();
if (process.argv.includes("--json")) console.log(JSON.stringify(list, null, 0));
else console.log(list.join("\n"));
console.error(`${list.length} textos${all ? "" : " sin traducir"} (${found.size} en total)`);
