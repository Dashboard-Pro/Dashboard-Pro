// Arranca el mock y el dashboard apuntando a él (sin límite de 5 s ni key real).
// Las variables ya definidas (p. ej. por el test) se respetan.
const path = require("node:path");
const os = require("node:os");

const defaults = {
  MOCK_PORT: "4180",
  SFL_API_KEY: "sfl.demo",
  SFL_FARM_ID: "29411",
  SFL_MIN_GAP_MS: "150",
  SFL_CONFIG: path.join(os.tmpdir(), "sfl-dashboard-demo.json"),
  SFL_DATA_DIR: path.join(os.tmpdir(), "sfl-dashboard-demo-data"),
  PORT: "4174",
};
for (const [k, v] of Object.entries(defaults)) process.env[k] ??= v;
process.env.SFL_UPSTREAM ??= `http://127.0.0.1:${process.env.MOCK_PORT}/community`;
process.env.SFL_WORLD ??= `http://127.0.0.1:${process.env.MOCK_PORT}/world`;
process.env.SFL_OPENSEA ??= `http://127.0.0.1:${process.env.MOCK_PORT}/opensea`;
process.env.SFL_DUMP_CDN ??= `http://127.0.0.1:${process.env.MOCK_PORT}/cdn`;

require("./mock-api.js");
require("../server.js");
