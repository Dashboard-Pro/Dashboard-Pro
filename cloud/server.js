// Rutas de la NUBE (server.js con SFL_MODE=cloud): login con Discord, sesiones, vincular ordenadores,
// sincronizar datos, vincular granja y premium (apagado por defecto).
// Nunca pide ni guarda API keys de jugadores: lo que consulta de Sunflower Land va con la key del
// administrador (variable SFL_API_KEY del servidor) y solo son datos públicos.
const crypto = require("node:crypto");
const { openDb } = require("./db");
const { isDoc, mergeDoc } = require("./merge");

const DAY = 86400_000;
const SESSION_DAYS = 30;
const rnd = (n = 32) => crypto.randomBytes(n).toString("base64url");
const sha = (s) => crypto.createHash("sha256").update(String(s)).digest("hex");
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sin 0/O ni 1/I

function createCloud({ dataDir, publicUrl, send, readBody, fetchData, env = process.env }) {
  const db = openDb(dataDir);
  const base = String(publicUrl || "").replace(/\/+$/, "");
  const secure = base.startsWith("https://");
  const discord = { id: env.DISCORD_CLIENT_ID || "", secret: env.DISCORD_CLIENT_SECRET || "" };
  const devLogin = env.CLOUD_DEV_LOGIN === "1"; // SOLO para pruebas en local: entra sin Discord
  const premium = {
    enabled: env.PREMIUM_ENABLED === "1",
    price: env.PREMIUM_PRICE || "1 €/mes",
    kofiToken: env.KOFI_VERIFICATION_TOKEN || "",
    kofiUrl: env.KOFI_URL || "",
    days: Number(env.PREMIUM_DAYS_PER_PAYMENT) || 31,
  };

  // ── Sesiones (cookie HttpOnly con id aleatorio; la sesión vive en la base de datos) ──
  const cookie = (name, value, maxAgeS) =>
    `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeS}${secure ? "; Secure" : ""}`;
  const readCookie = (req, name) => (req.headers.cookie || "").split(/;\s*/).map((c) => c.split("=")).find(([k]) => k === name)?.[1];
  function userFromSession(req) {
    const sid = readCookie(req, "sflc_session");
    if (!sid) return null;
    const row = db.prepare("SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ? AND s.expires_at > ?").get(sha(sid), Date.now());
    if (row) db.prepare("UPDATE users SET seen_at = ? WHERE id = ?").run(Date.now(), row.id);
    return row || null;
  }
  function userFromDevice(req) {
    const m = (req.headers.authorization || "").match(/^Bearer\s+(\S+)$/);
    if (!m) return null;
    const dev = db.prepare("SELECT * FROM devices WHERE token_hash = ?").get(sha(m[1]));
    if (!dev) return null;
    db.prepare("UPDATE devices SET seen_at = ? WHERE id = ?").run(Date.now(), dev.id);
    return db.prepare("SELECT * FROM users WHERE id = ?").get(dev.user_id);
  }
  function startSession(res, userId, redirect = "/") {
    const sid = rnd();
    db.prepare("INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)").run(sha(sid), userId, Date.now(), Date.now() + SESSION_DAYS * DAY);
    res.writeHead(302, { location: redirect, "set-cookie": [cookie("sflc_session", sid, SESSION_DAYS * 86400), cookie("sflc_state", "", 0)], "cache-control": "no-store" });
    res.end();
  }
  function upsertUser(discordId, name, avatar) {
    const now = Date.now();
    db.prepare(`INSERT INTO users (discord_id, name, avatar, created_at, seen_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(discord_id) DO UPDATE SET name = excluded.name, avatar = excluded.avatar, seen_at = excluded.seen_at`).run(discordId, name, avatar, now, now);
    return db.prepare("SELECT * FROM users WHERE discord_id = ?").get(discordId);
  }

  // ── Premium (interruptor PREMIUM_ENABLED; apagado no limita ni cobra nada) ──
  function premiumOf(user) {
    if (!premium.enabled || !user) return { enabled: premium.enabled, active: false };
    const e = db.prepare("SELECT * FROM entitlements WHERE user_id = ?").get(user.id);
    const active = Boolean(e && (!e.until || e.until > Date.now()));
    return { enabled: true, active, plan: e?.plan || null, until: e?.until || null, price: premium.price, payUrl: premium.kofiUrl || null, code: accountCode(user) };
  }
  // Código público de la cuenta para identificar los pagos (se escribe en el mensaje de Ko-fi)
  const accountCode = (user) => `SFL-${sha(`${user.id}:${user.discord_id}`).slice(0, 6).toUpperCase()}`;
  function grant(userId, days, source) {
    const cur = db.prepare("SELECT until FROM entitlements WHERE user_id = ?").get(userId);
    const from = Math.max(Date.now(), cur?.until || 0);
    db.prepare(`INSERT INTO entitlements (user_id, plan, until, source, updated_at) VALUES (?, 'premium', ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET plan = 'premium', until = excluded.until, source = excluded.source, updated_at = excluded.updated_at`).run(userId, from + days * DAY, source, Date.now());
  }

  function me(user) {
    if (!user) return { loggedIn: false, loginUrl: discord.id ? "/auth/discord" : devLogin ? "/auth/dev" : null };
    return {
      loggedIn: true,
      user: { name: user.name, avatar: user.avatar ? `https://cdn.discordapp.com/avatars/${user.discord_id}/${user.avatar}.png?size=64` : null },
      farm: user.farm_id ? { id: user.farm_id, status: user.farm_status, challenge: user.farm_status !== "verified" && user.farm_challenge ? Number(user.farm_challenge) : null } : null,
      devices: db.prepare("SELECT name, created_at AS createdAt, seen_at AS seenAt FROM devices WHERE user_id = ? ORDER BY created_at").all(user.id),
      premium: premiumOf(user),
    };
  }

  // Devuelve true si ha atendido la petición
  async function handle(req, res, url) {
    const p = url.pathname;

    // ── Login con Discord (OAuth2, solo el permiso "identify": nombre y avatar) ──
    if (p === "/auth/discord") {
      if (!discord.id) return send(res, 503, { error: "Login con Discord sin configurar (DISCORD_CLIENT_ID)" }), true;
      const state = rnd(16);
      const q = new URLSearchParams({ client_id: discord.id, redirect_uri: `${base}/auth/discord/callback`, response_type: "code", scope: "identify", state });
      res.writeHead(302, { location: `https://discord.com/oauth2/authorize?${q}`, "set-cookie": cookie("sflc_state", state, 600), "cache-control": "no-store" });
      res.end();
      return true;
    }
    if (p === "/auth/discord/callback") {
      const code = url.searchParams.get("code"), state = url.searchParams.get("state");
      if (!code || !state || state !== readCookie(req, "sflc_state")) return send(res, 400, { error: "Login cancelado o caducado: vuelve a intentarlo" }), true;
      try {
        const tok = await fetch("https://discord.com/api/oauth2/token", {
          method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ client_id: discord.id, client_secret: discord.secret, grant_type: "authorization_code", code, redirect_uri: `${base}/auth/discord/callback` }),
        }).then((r) => r.json());
        if (!tok.access_token) throw new Error("Discord no dio acceso");
        const u = await fetch("https://discord.com/api/users/@me", { headers: { authorization: `Bearer ${tok.access_token}` } }).then((r) => r.json());
        if (!u.id) throw new Error("Discord no devolvió el usuario");
        const user = upsertUser(u.id, u.global_name || u.username, u.avatar);
        startSession(res, user.id);
      } catch (e) {
        send(res, 502, { error: `No se pudo entrar con Discord: ${e.message}` });
      }
      return true;
    }
    if (p === "/auth/dev") {
      if (!devLogin) return send(res, 404, { error: "Ruta desconocida" }), true;
      const name = (url.searchParams.get("name") || "dev").slice(0, 32);
      const u = upsertUser(`dev:${name}`, name, null);
      if (premium.enabled && url.searchParams.get("premium") === "1") grant(u.id, 31, "dev");
      const next = url.searchParams.get("next") || "/";
      startSession(res, u.id, next.startsWith("/") && !next.startsWith("//") ? next : "/");
      return true;
    }
    if (p === "/auth/logout" && req.method === "POST") {
      const sid = readCookie(req, "sflc_session");
      if (sid) db.prepare("DELETE FROM sessions WHERE id = ?").run(sha(sid));
      res.writeHead(200, { "content-type": "application/json", "set-cookie": cookie("sflc_session", "", 0) });
      res.end('{"ok":true}');
      return true;
    }

    if (p === "/api/me") return send(res, 200, me(userFromSession(req))), true;

    // ── Vincular un ordenador (app local) con un código de un solo uso ──
    if (p === "/api/link/code" && req.method === "POST") {
      const user = userFromSession(req);
      if (!user) return send(res, 401, { error: "Entra con Discord primero" }), true;
      db.prepare("DELETE FROM link_codes WHERE user_id = ? OR expires_at < ?").run(user.id, Date.now());
      const code = Array.from(crypto.randomBytes(8), (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
      db.prepare("INSERT INTO link_codes (code, user_id, expires_at) VALUES (?, ?, ?)").run(code, user.id, Date.now() + 10 * 60_000);
      return send(res, 200, { code, expiresInS: 600 }), true;
    }
    if (p === "/api/link" && req.method === "POST") {
      const body = await readBody(req).catch(() => ({}));
      const row = db.prepare("SELECT * FROM link_codes WHERE code = ? AND expires_at > ?").get(String(body.code || "").toUpperCase(), Date.now());
      if (!row) return send(res, 400, { error: "Código inválido o caducado: genera uno nuevo en la web" }), true;
      db.prepare("DELETE FROM link_codes WHERE code = ?").run(row.code);
      const token = rnd(32);
      db.prepare("INSERT INTO devices (user_id, token_hash, name, created_at) VALUES (?, ?, ?, ?)").run(row.user_id, sha(token), String(body.deviceName || "ordenador").slice(0, 60), Date.now());
      const user = db.prepare("SELECT * FROM users WHERE id = ?").get(row.user_id);
      return send(res, 200, { token, user: { name: user.name } }), true;
    }

    // ── Sincronización (ordenador vinculado o sesión web) ──
    if (p === "/api/sync" || p.startsWith("/api/sync/")) {
      const user = userFromDevice(req) || userFromSession(req);
      if (!user) return send(res, 401, { error: "Sin sesión" }), true;
      if (p === "/api/sync") {
        const docs = db.prepare("SELECT doc, updated_at AS updatedAt, length(body) AS size FROM sync_docs WHERE user_id = ?").all(user.id);
        return send(res, 200, { docs }), true;
      }
      const doc = decodeURIComponent(p.slice("/api/sync/".length));
      if (!isDoc(doc)) return send(res, 400, { error: "Documento desconocido" }), true;
      const row = db.prepare("SELECT body, updated_at FROM sync_docs WHERE user_id = ? AND doc = ?").get(user.id, doc);
      const current = row ? JSON.parse(row.body) : null;
      if (req.method === "GET") return send(res, 200, { doc, body: current, updatedAt: row?.updated_at || null }), true;
      if (req.method === "PUT") {
        const body = await readBody(req).catch(() => null);
        if (!body || typeof body.body !== "object" || body.body === null) return send(res, 400, { error: "Falta body" }), true;
        const merged = current ? mergeDoc(doc, current, body.body) : body.body;
        const text = JSON.stringify(merged);
        if (text.length > 5_000_000) return send(res, 413, { error: "Documento demasiado grande" }), true;
        const at = Date.now();
        db.prepare(`INSERT INTO sync_docs (user_id, doc, body, updated_at) VALUES (?, ?, ?, ?)
          ON CONFLICT(user_id, doc) DO UPDATE SET body = excluded.body, updated_at = excluded.updated_at`).run(user.id, doc, text, at);
        return send(res, 200, { doc, body: merged, updatedAt: at }), true;
      }
      return send(res, 405, { error: "Método no permitido" }), true;
    }

    // ── Vincular granja: provisional (lo confirma un ordenador con su key) o verificada (prueba en el juego) ──
    if (p === "/api/farm/claim" && req.method === "POST") {
      const user = userFromDevice(req);
      if (!user) return send(res, 401, { error: "Solo desde un ordenador vinculado" }), true;
      const body = await readBody(req).catch(() => ({}));
      const farmId = String(body.farmId || "").trim();
      if (!/^\d{1,20}$/.test(farmId)) return send(res, 400, { error: "Granja inválida" }), true;
      if (!(user.farm_id === farmId && user.farm_status === "verified")) {
        db.prepare("UPDATE users SET farm_id = ?, farm_status = 'provisional' WHERE id = ?").run(farmId, user.id);
      }
      return send(res, 200, me(db.prepare("SELECT * FROM users WHERE id = ?").get(user.id))), true;
    }
    if (p === "/api/farm/challenge" && req.method === "POST") {
      const user = userFromSession(req);
      if (!user) return send(res, 401, { error: "Entra con Discord primero" }), true;
      const body = await readBody(req).catch(() => ({}));
      const farmId = String(body.farmId || user.farm_id || "").trim();
      if (!/^\d{1,20}$/.test(farmId)) return send(res, 400, { error: "Escribe el número de tu granja" }), true;
      // Precio absurdo y exacto: nadie lo compraría por error y es imposible que coincida por casualidad
      const challenge = env.CLOUD_TEST_CHALLENGE || String(90000 + crypto.randomInt(9999));
      const status = user.farm_id === farmId && user.farm_status ? user.farm_status : null;
      db.prepare("UPDATE users SET farm_id = ?, farm_status = ?, farm_challenge = ?, farm_challenge_at = ? WHERE id = ?")
        .run(farmId, status === "verified" ? "verified" : status, challenge, Date.now(), user.id);
      return send(res, 200, { farmId, challenge: Number(challenge) }), true;
    }
    if (p === "/api/farm/verify" && req.method === "POST") {
      const user = userFromSession(req);
      if (!user?.farm_id || !user.farm_challenge) return send(res, 400, { error: "Pide primero un precio de verificación" }), true;
      const r = await fetchData("marketplaceProfile", { farmId: user.farm_id });
      if (r.status !== 200) return send(res, 502, { error: "No se pudo leer tu perfil de mercado ahora: prueba en un minuto" }), true;
      const listings = Object.values(JSON.parse(r.body)?.data?.listings || {});
      const ok = listings.some((l) => Math.abs(Number(l.sfl) - Number(user.farm_challenge)) < 1e-6);
      if (!ok) return send(res, 409, { error: `Aún no veo un listado a ${user.farm_challenge} FLOWER en tu granja. Los datos pueden tardar un par de minutos.` }), true;
      db.prepare("UPDATE users SET farm_status = 'verified', farm_challenge = NULL WHERE id = ?").run(user.id);
      return send(res, 200, me(db.prepare("SELECT * FROM users WHERE id = ?").get(user.id))), true;
    }

    // ── Premium: alertas de precio (solo con premium encendido y activo en la cuenta) ──
    if (p === "/api/alerts" || p.startsWith("/api/alerts/")) {
      const user = userFromSession(req);
      if (!premium.enabled) return send(res, 404, { error: "Premium desactivado" }), true;
      if (!user) return send(res, 401, { error: "Entra con Discord primero" }), true;
      if (!premiumOf(user).active) return send(res, 402, { error: "Las alertas de precio son premium" }), true;
      const list = () => ({
        webhook: Boolean(db.prepare("SELECT discord_webhook FROM user_settings WHERE user_id = ?").get(user.id)?.discord_webhook),
        alerts: db.prepare("SELECT id, item, name, dir, price, created_at AS createdAt, fired_at AS firedAt, fired_price AS firedPrice FROM alerts WHERE user_id = ? ORDER BY created_at DESC").all(user.id),
      });
      if (req.method === "GET" && p === "/api/alerts") return send(res, 200, list()), true;
      if (req.method !== "POST") return send(res, 405, { error: "Método no permitido" }), true;
      const body = await readBody(req).catch(() => ({}));
      if (p === "/api/alerts") {
        const price = Number(body.price);
        if (!/^(collectibles|wearables|pets|buds)-\d+$/.test(body.item || "") || !["above", "below"].includes(body.dir) || !(price > 0)) return send(res, 400, { error: "Alerta inválida" }), true;
        if (db.prepare("SELECT COUNT(*) AS n FROM alerts WHERE user_id = ?").get(user.id).n >= 50) return send(res, 400, { error: "Máximo 50 alertas" }), true;
        db.prepare("INSERT INTO alerts (user_id, item, name, dir, price, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(user.id, body.item, String(body.name || body.item).slice(0, 80), body.dir, price, Date.now());
        return send(res, 200, list()), true;
      }
      if (p === "/api/alerts/delete") { db.prepare("DELETE FROM alerts WHERE id = ? AND user_id = ?").run(Number(body.id), user.id); return send(res, 200, list()), true; }
      if (p === "/api/alerts/rearm") { db.prepare("UPDATE alerts SET fired_at = NULL, fired_price = NULL WHERE id = ? AND user_id = ?").run(Number(body.id), user.id); return send(res, 200, list()), true; }
      if (p === "/api/alerts/webhook") {
        const url = String(body.url || "").trim();
        if (url && !/^https:\/\/(discord|discordapp)\.com\/api\/webhooks\/\d+\/[\w-]+$/.test(url)) return send(res, 400, { error: "Pega la URL de un webhook de Discord (Ajustes del canal → Integraciones → Webhooks)" }), true;
        db.prepare(`INSERT INTO user_settings (user_id, discord_webhook) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET discord_webhook = excluded.discord_webhook`).run(user.id, url || null);
        if (url) await notify(url, "✅ Alertas de SFL Console conectadas a este canal.").catch(() => {});
        return send(res, 200, list()), true;
      }
      return send(res, 404, { error: "Ruta desconocida" }), true;
    }

    // ── Pagos (Ko-fi): cada pago con el código de cuenta en el mensaje suma días de premium ──
    if (p === "/api/billing/kofi" && req.method === "POST") {
      if (!premium.enabled || !premium.kofiToken) return send(res, 404, { error: "Premium desactivado" }), true;
      const raw = await readRaw(req).catch(() => "");
      let data;
      try { data = JSON.parse(new URLSearchParams(raw).get("data") || "{}"); } catch { data = {}; }
      if (data.verification_token !== premium.kofiToken) return send(res, 403, { error: "Token inválido" }), true;
      const id = String(data.kofi_transaction_id || data.message_id || rnd(8));
      if (db.prepare("SELECT 1 FROM payments WHERE id = ?").get(id)) return send(res, 200, { ok: true, duplicate: true }), true;
      const codeMatch = String(data.message || "").toUpperCase().match(/SFL-[0-9A-F]{6}/);
      const user = codeMatch ? db.prepare("SELECT * FROM users").all().find((u) => accountCode(u) === codeMatch[0]) : null;
      db.prepare("INSERT INTO payments (id, user_id, email, amount, currency, kind, raw, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .run(id, user?.id ?? null, data.email || null, String(data.amount || ""), data.currency || null, data.type || null, JSON.stringify(data).slice(0, 4000), Date.now());
      if (user) grant(user.id, premium.days, `kofi:${id}`);
      return send(res, 200, { ok: true, matched: Boolean(user) }), true;
    }

    return false;
  }

  // Cuerpo crudo (webhooks que no son JSON)
  function readRaw(req) {
    return new Promise((resolve, reject) => {
      let s = "";
      req.on("data", (c) => { s += c; if (s.length > 100_000) { reject(new Error("grande")); req.destroy(); } });
      req.on("end", () => resolve(s));
      req.on("error", reject);
    });
  }

  // Envío a un webhook de Discord (el del propio usuario); en pruebas se puede redirigir con ALERTS_WEBHOOK_OVERRIDE
  async function notify(url, content) {
    const target = env.ALERTS_WEBHOOK_OVERRIDE || url;
    const r = await fetch(target, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "SFL Console", content }), signal: AbortSignal.timeout(10_000) });
    if (!r.ok) throw new Error(`webhook ${r.status}`);
  }
  // Revisa las alertas con el informe del mercado (lo llama server.js cada vez que lo descarga). Cada
  // alerta avisa una vez; el usuario la rearma desde la web.
  let checking = false;
  async function checkAlerts(items) {
    if (!premium.enabled || checking || !items) return 0;
    checking = true;
    let sent = 0;
    try {
      const rows = db.prepare(`SELECT a.*, s.discord_webhook FROM alerts a JOIN user_settings s ON s.user_id = a.user_id
        WHERE a.fired_at IS NULL AND s.discord_webhook IS NOT NULL`).all();
      for (const a of rows) {
        const user = db.prepare("SELECT * FROM users WHERE id = ?").get(a.user_id);
        if (!premiumOf(user).active) continue;
        const it = items[a.item];
        const price = it?.floor ?? it?.latestSale;
        if (!(price > 0)) continue;
        const hit = a.dir === "above" ? price >= a.price : price <= a.price;
        if (!hit) continue;
        try {
          await notify(a.discord_webhook, `🔔 **${a.name}** ${a.dir === "above" ? "ha subido a" : "ha bajado a"} **${price} FLOWER** (tu alerta: ${a.dir === "above" ? "≥" : "≤"} ${a.price}).`);
          db.prepare("UPDATE alerts SET fired_at = ?, fired_price = ? WHERE id = ?").run(Date.now(), price, a.id);
          sent++;
        } catch { /* webhook caído: se reintenta en la próxima revisión */ }
      }
    } finally { checking = false; }
    return sent;
  }

  // Limpieza periódica de sesiones y códigos caducados
  setInterval(() => {
    db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(Date.now());
    db.prepare("DELETE FROM link_codes WHERE expires_at < ?").run(Date.now());
  }, 3600_000).unref();

  return { handle, userFromSession, userFromDevice, premiumOf, checkAlerts, db, info:() => ({ discord: Boolean(discord.id), devLogin, premium: premium.enabled }) };
}

module.exports = { createCloud };
