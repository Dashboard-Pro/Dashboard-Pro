// Publica una copia limpia del dashboard en el repo de la organización (para enseñarlo a terceros, p. ej. el equipo de
// Sunflower Land): solo el código de la última versión subida, sin tu historial (data/), sin las notas internas y sin las
// guías de instalación de tus ordenadores. Cada publicación es un commit nuevo en ese repo; el historial de este no viaja.
// Uso: npm run publicar            (repo por defecto: Dashboard-Pro/sfl-dashboard)
//      node tools/publicar.js <org/repo>
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const slug = process.argv[2] || "Dashboard-Pro/sfl-dashboard";
const remote = `https://github.com/${slug}.git`;
const dest = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), ".local", "share"), "sfl-dashboard-publico", slug.replace("/", "_"));
// Lo que NO sale: tus datos y las notas o guías personales
const EXCLUDE = [/^data\//, /^CLAUDE\.md$/, /^ROADMAP\.md$/, /^MACBOOK\.md$/, /^WINDOWS\.md$/, /^DESPLIEGUE\.md$/];

const git = (args, cwd = root, opts = {}) => execFileSync("git", args, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, ...opts });

const head = git(["rev-parse", "--short", "HEAD"]).trim();
const files = git(["ls-files"]).split("\n").filter(Boolean).filter((f) => !EXCLUDE.some((re) => re.test(f)));

if (!fs.existsSync(path.join(dest, ".git"))) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  console.log(`Clonando ${remote} en ${dest}…`);
  git(["clone", remote, dest], root, { stdio: "inherit" });
} else if (git(["ls-remote", "--heads", "origin"], dest).trim()) {
  git(["pull", "--ff-only"], dest, { stdio: "inherit" });
}

// Copia exacta de lo último guardado en git (no de cambios a medias en la carpeta)
const keep = new Set(files);
for (const f of files) {
  const out = path.join(dest, f);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  let body = execFileSync("git", ["show", `HEAD:${f}`], { cwd: root, maxBuffer: 64 * 1024 * 1024 });
  if (f === ".gitignore") {
    // En la copia pública data/ no se sube nunca (es el historial de cada jugador)
    body = Buffer.from(body.toString("utf8").replace(/^# data\/ SÍ se sube.*\n/m, "") + "# Historial de cada jugador: se queda en su ordenador\ndata/\n");
  }
  fs.writeFileSync(out, body);
}
// Lo que ya no existe aquí se borra también allí
for (const f of git(["ls-files"], dest).split("\n").filter(Boolean)) {
  if (!keep.has(f)) fs.rmSync(path.join(dest, f), { force: true });
}

git(["add", "-A"], dest);
if (!git(["status", "--porcelain"], dest).trim()) {
  console.log("Nada nuevo que publicar.");
  process.exit(0);
}
// Autor: tu nombre de este repo, pero con el email privado de GitHub (el tuyo no sale en un repo que ven otros)
const who = (k) => { try { return git(["config", k]).trim(); } catch { return ""; } };
const name = who("user.name") || "SFL Dashboard";
git(["-c", `user.name=${name}`, "-c", `user.email=${who("sfl.publishEmail") || `${name}@users.noreply.github.com`}`, "commit", "-q", "-m", `Versión del ${new Date().toISOString().slice(0, 10)} (${head})`], dest);
git(["push", "-q", "origin", "HEAD"], dest, { stdio: "inherit" });
console.log(`Publicado en https://github.com/${slug} (${files.length} archivos, sin data/ ni notas internas).`);
