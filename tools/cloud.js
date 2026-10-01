// Arranca la NUBE de verdad (versión web + cuentas): npm run nube
// Se configura con variables de entorno (ver DESPLIEGUE.md): SFL_API_KEY (del administrador), CLOUD_URL,
// DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, CLOUD_DATA_DIR y, para premium, PREMIUM_ENABLED y KOFI_*.
process.env.SFL_MODE = "cloud";
require("../server.js");
