// Genera los iconos de la app a partir de public/icon.svg (arte propio): PNG de 192 y 512 (manifest) e icon.ico
// (acceso directo de Windows: ICO con PNG dentro, 16–256 px). Usa Chrome/Edge sin ventana; sin dependencias.
// Uso: node tools/make-icons.js   (solo hace falta al cambiar el icono; los archivos van al repositorio)
"use strict";
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const PUB = path.join(__dirname, "..", "public");
const BROWSERS = [process.env.SFL_BROWSER,
  "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium"].filter(Boolean);
const browser = BROWSERS.find((b) => fs.existsSync(b));
if (!browser) { console.error("No encuentro Chrome ni Edge para dibujar el icono."); process.exit(1); }

const svg = fs.readFileSync(path.join(PUB, "icon.svg"), "utf8");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sfl-icons-"));
function png(size) {
  const html = path.join(tmp, `i${size}.html`), out = path.join(tmp, `i${size}.png`);
  fs.writeFileSync(html, `<!doctype html><html><body style="margin:0;background:transparent"><img src="data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}" width="${size}" height="${size}" style="display:block;image-rendering:pixelated"></body></html>`);
  spawnSync(browser, ["--headless=new", "--disable-gpu", "--no-first-run", `--user-data-dir=${path.join(tmp, "p")}`, "--hide-scrollbars",
    "--default-background-color=00000000", `--window-size=${size},${size}`, `--screenshot=${out}`, `file:///${html.replace(/\\/g, "/")}`], { stdio: "ignore", timeout: 60_000 });
  if (!fs.existsSync(out)) throw new Error(`no se generó el PNG de ${size}`);
  return fs.readFileSync(out);
}

const sizes = [16, 32, 48, 64, 128, 256];
const pngs = Object.fromEntries([...sizes, 192, 512].map((s) => [s, png(s)]));
fs.writeFileSync(path.join(PUB, "icon-192.png"), pngs[192]);
fs.writeFileSync(path.join(PUB, "icon-512.png"), pngs[512]);

// ICO: cabecera (6 bytes) + una entrada de 16 bytes por tamaño + los PNG seguidos
const head = Buffer.alloc(6);
head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(sizes.length, 4);
const dir = Buffer.alloc(16 * sizes.length);
let offset = 6 + dir.length;
sizes.forEach((s, i) => {
  const b = pngs[s], e = i * 16;
  dir.writeUInt8(s >= 256 ? 0 : s, e); dir.writeUInt8(s >= 256 ? 0 : s, e + 1); // 0 = 256
  dir.writeUInt8(0, e + 2); dir.writeUInt8(0, e + 3);
  dir.writeUInt16LE(1, e + 4); dir.writeUInt16LE(32, e + 6);
  dir.writeUInt32LE(b.length, e + 8); dir.writeUInt32LE(offset, e + 12);
  offset += b.length;
});
fs.writeFileSync(path.join(PUB, "icon.ico"), Buffer.concat([head, dir, ...sizes.map((s) => pngs[s])]));
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`Iconos listos en public/: icon.ico (${sizes.join(", ")} px), icon-192.png, icon-512.png`);
