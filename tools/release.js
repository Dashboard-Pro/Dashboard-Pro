// Paquete de descarga para otros jugadores: npm run release → dist/sfl-dashboard-<versión>.zip
// Lleva el código, los datos del juego ya generados y los lanzadores. NUNCA config.json (tu key) ni data/
// (tu historial). Sin dependencias: copia los archivos y comprime con el `tar` que traen Windows 10+ y macOS.
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const { version } = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const name = `sfl-dashboard-${version}`;
const dist = path.join(root, "dist");
const out = path.join(dist, name);

// Lista blanca: solo lo que necesita un jugador (nada de git, notas internas ni datos personales)
const INCLUDE = ["server.js", "package.json", "README.md", "start.bat", "start.command", "public", "tools", "cloud"];
const EXCLUDE = new Set(["config.json", "data", ".gamesrc", ".git", "dist", "node_modules"]);

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
function copy(rel) {
  const src = path.join(root, rel);
  if (EXCLUDE.has(path.basename(rel)) || !fs.existsSync(src)) return;
  if (fs.statSync(src).isDirectory()) {
    fs.mkdirSync(path.join(out, rel), { recursive: true });
    for (const f of fs.readdirSync(src)) copy(path.join(rel, f));
  } else fs.copyFileSync(src, path.join(out, rel));
}
INCLUDE.forEach(copy);
// package.json del paquete: sin "private" (es para repartir) y con la versión
fs.writeFileSync(path.join(out, "LEEME.txt"), `SFL Console ${version} — panel para Sunflower Land (herramienta no oficial)

1. Instala Node.js (versión LTS) desde https://nodejs.org
2. Windows: doble clic en start.bat
   macOS: la primera vez abre Terminal en esta carpeta y ejecuta  chmod +x start.command
          luego doble clic en start.command (si avisa de desarrollador no identificado: clic derecho → Abrir)
3. Se abre http://localhost:4173 con un asistente: pega tu API key y busca tu granja.

Tu API key se guarda solo en este ordenador (config.json) y nunca sale de él.
Sin key puedes probarlo con datos de ejemplo:  npm run demo  → http://localhost:4174
`);
try { fs.chmodSync(path.join(out, "start.command"), 0o755); } catch { /* Windows */ }

// Comprobación de seguridad: que no se cuele nada personal
const leaks = [];
(function scan(dir) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) { scan(p); continue; }
    if (f === "config.json" || /sfl\.[A-Za-z0-9_-]{12,}/.test(fs.readFileSync(p, "utf8"))) leaks.push(path.relative(out, p));
  }
})(out);
if (leaks.length) { console.error("✗ Se ha colado algo privado:", leaks.join(", ")); process.exit(1); }

// Compresores posibles: el tar de Windows (bsdtar, en System32: el de Git Bash no hace zip), el de macOS
// (también bsdtar) y `zip` en Linux
const zip = path.join(dist, `${name}.zip`);
const tries = [
  ...(process.platform === "win32" ? [[path.join(process.env.SystemRoot || "C:\\Windows", "System32", "tar.exe"), ["-a", "-c", "-f", zip, "-C", dist, name]]] : []),
  ["tar", ["-a", "-c", "-f", zip, "-C", dist, name]],
  ["zip", ["-r", "-q", zip, name], { cwd: dist }],
];
let ok = false;
for (const [cmd, args, opts] of tries) {
  try { fs.rmSync(zip, { force: true }); execFileSync(cmd, args, { stdio: "ignore", ...opts }); ok = fs.statSync(zip).size > 1000; } catch { /* siguiente */ }
  if (ok) break;
}
console.log(ok ? `✓ ${path.relative(root, zip)} (${(fs.statSync(zip).size / 1024).toFixed(0)} KB) — sin config.json ni data/`
  : `✓ Carpeta lista en ${path.relative(root, out)} (no se pudo crear el zip: comprímela a mano)`);
