// Demo de la VERSIÓN WEB (modo nube) con datos simulados y login de pruebas (sin Discord):
//   npm run nube:demo → http://localhost:4177  (entra con "Entrar con Discord": usa el login de pruebas)
// Para probar premium: PREMIUM_ENABLED=1 npm run nube:demo
const os = require("node:os");
const path = require("node:path");

process.env.MOCK_PORT ??= "4182";
process.env.PORT ??= "4177";
process.env.SFL_MODE = "cloud";
process.env.CLOUD_URL ??= `http://localhost:${process.env.PORT}`;
process.env.CLOUD_DEV_LOGIN ??= "1";
process.env.SFL_API_KEY ??= "sfl.demo";
process.env.SFL_MIN_GAP_MS ??= "150";
process.env.SFL_UPSTREAM ??= `http://127.0.0.1:${process.env.MOCK_PORT}/community`;
process.env.SFL_WORLD ??= `http://127.0.0.1:${process.env.MOCK_PORT}/world`;
process.env.SFL_OPENSEA ??= `http://127.0.0.1:${process.env.MOCK_PORT}/opensea`;
process.env.SFL_CONFIG ??= path.join(os.tmpdir(), "sfl-cloud-demo-config.json");
process.env.SFL_DATA_DIR ??= path.join(os.tmpdir(), "sfl-cloud-demo-public");
process.env.CLOUD_DATA_DIR ??= path.join(os.tmpdir(), "sfl-cloud-demo-db");
process.env.CLOUD_TEST_CHALLENGE ??= "97531"; // el perfil de la demo tiene un listado a ese precio
// --premium: premium encendido; entrando con /auth/dev?premium=1 la cuenta de pruebas lo tiene activo,
// y las alertas se "envían" al webhook simulado del mock (http://127.0.0.1:<MOCK_PORT>/hook/log)
if (process.argv.includes("--premium")) {
  process.env.PREMIUM_ENABLED = "1";
  process.env.KOFI_VERIFICATION_TOKEN ??= "demo";
  process.env.ALERTS_WEBHOOK_OVERRIDE ??= `http://127.0.0.1:${process.env.MOCK_PORT}/hook`;
  process.env.ALERTS_MIN_INTERVAL_MS ??= "10000";
}

require("./mock-api.js");
require("../server.js");
