// Demo como jugador nuevo: sin key ni granja, para probar el asistente de bienvenida.
// En el paso de la key vale cualquiera que empiece por "sfl."; la granja de la demo es 29411 (o "gordy").
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

process.env.PORT ??= "4175";
process.env.MOCK_PORT ??= "4181";
process.env.SFL_API_KEY = "";
process.env.SFL_FARM_ID = "";
process.env.SFL_CONFIG = path.join(os.tmpdir(), "sfl-dashboard-demo-new.json");
process.env.SFL_DATA_DIR ??= path.join(os.tmpdir(), "sfl-dashboard-demo-new-data");
fs.rmSync(process.env.SFL_CONFIG, { force: true }); // cada arranque empieza de cero
require("./demo.js");
