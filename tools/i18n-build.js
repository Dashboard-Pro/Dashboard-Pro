// Junta las traducciones de tools/i18n/en-*.json en public/js/i18n/en.js (lo que carga la página).
// Uso: node tools/i18n-build.js   ·   para ver qué falta por traducir: node tools/i18n-extract.js
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const src = path.join(__dirname, "i18n");
const dict = {};
for (const f of fs.readdirSync(src).filter((x) => /^en-.*\.json$/.test(x)).sort()) {
  Object.assign(dict, JSON.parse(fs.readFileSync(path.join(src, f), "utf8")));
}
// Solo lo que cambia (lo idéntico no hace falta)
for (const k of Object.keys(dict)) if (!dict[k] || dict[k] === k) delete dict[k];
const out = path.join(root, "public", "js", "i18n", "en.js");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `// Generado por tools/i18n-build.js desde tools/i18n/en-*.json — no editar a mano.\nwindow.I18N_EN = ${JSON.stringify(dict, null, 0)};\n`);
console.log(`OK → public/js/i18n/en.js (${Object.keys(dict).length} textos)`);
