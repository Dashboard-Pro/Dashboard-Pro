// Base de datos de la nube: SQLite incorporado en Node (node:sqlite, Node 22.5+), sin dependencias.
// Nunca guarda API keys de jugadores: solo cuentas de Discord, dispositivos vinculados, lo que cada
// usuario sincroniza (costes, operaciones, precios) y, para premium, sus derechos.
const path = require("node:path");
const fs = require("node:fs");

let DatabaseSync;
try {
  // Silencia el aviso "experimental" de node:sqlite solo para este require
  const emit = process.emitWarning;
  process.emitWarning = (w, ...a) => (String(w).includes("SQLite") ? undefined : emit.call(process, w, ...a));
  ({ DatabaseSync } = require("node:sqlite"));
  process.emitWarning = emit;
} catch {
  throw new Error("El modo nube necesita Node 22.5 o superior (node:sqlite).");
}

function openDb(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(path.join(dir, "cloud.sqlite"));
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      discord_id TEXT UNIQUE NOT NULL,
      name TEXT, avatar TEXT,
      farm_id TEXT, farm_status TEXT,          -- farm_status: NULL | 'provisional' | 'verified'
      farm_challenge TEXT, farm_challenge_at INTEGER,
      created_at INTEGER NOT NULL, seen_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS link_codes (
      code TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS devices (
      id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT UNIQUE NOT NULL, name TEXT, created_at INTEGER NOT NULL, seen_at INTEGER
    );
    -- Documentos sincronizados por usuario: costs | trades:<farmId> | prices:<AAAA-MM>
    CREATE TABLE IF NOT EXISTS sync_docs (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, doc TEXT NOT NULL,
      body TEXT NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY (user_id, doc)
    );
    -- Premium (apagado por defecto): derechos por usuario y registro de pagos recibidos
    CREATE TABLE IF NOT EXISTS entitlements (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      plan TEXT NOT NULL, until INTEGER, source TEXT, updated_at INTEGER NOT NULL
    );
    -- Premium: alertas de precio (se avisan por un webhook de Discord del propio usuario)
    CREATE TABLE IF NOT EXISTS alerts (
      id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      item TEXT NOT NULL, name TEXT, dir TEXT NOT NULL CHECK (dir IN ('above', 'below')), price REAL NOT NULL,
      created_at INTEGER NOT NULL, fired_at INTEGER, fired_price REAL
    );
    CREATE TABLE IF NOT EXISTS user_settings (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, discord_webhook TEXT
    );
    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY, user_id INTEGER, email TEXT, amount TEXT, currency TEXT, kind TEXT, raw TEXT, at INTEGER NOT NULL
    );
  `);
  return db;
}

module.exports = { openDb };
