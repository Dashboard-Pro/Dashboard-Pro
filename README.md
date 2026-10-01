# 🌻 SFL Dashboard

Dashboard local para Sunflower Land sobre la [Community API](https://sunflower-land.com/community-docs/) (solo lectura).
No necesita nada instalado aparte de Node.

## Arrancar

```
start.bat            (Windows, doble clic)  → abre http://localhost:4173
start.command        (macOS, doble clic)
npm start            (equivalente en cualquier sistema)
npm run demo         → datos simulados en http://localhost:4174, sin key
```

**Guías paso a paso: [MACBOOK.md](MACBOOK.md) para macOS y [WINDOWS.md](WINDOWS.md) para Windows**
(instalación desde cero y cómo sincronizar entre ordenadores). En resumen: instala Node, `git clone` del repositorio, `npm run gamedata` (descarga el
código del juego) y arranca. La API key no está en el repositorio: pégala en Ajustes. La carpeta `data/` (tu
historial, costes y precios) se sincroniza sola por GitHub entre tus ordenadores (Ajustes → Sincronizar con GitHub). La primera vez en macOS: `chmod +x start.command`.

La primera vez, ve a **Ajustes** y pega tu API key (requiere VIP y Bumpkin nivel 50+) y tu Farm ID.
Se guardan en `config.json`, que solo lee el servidor local; el navegador nunca ve la key.

## Qué hay

- **Resumen**: lo listo ahora y lo que madura en 1/3/12 h, lo próximo con cuenta atrás, tu patrimonio
  (inventario a floor + saldo, variación vs ayer, composición y liquidez), timeline, watchlist, agenda
  de subastas/sorteos, tu puesto en tickets y el último Discord.
- **Granja**: mapa pixel de tu isla con las posiciones reales (parpadea lo que está listo), filtro por
  categoría, línea de tiempo de 6 h a 7 días, cola de cosecha completa y avisos del navegador.
- **Skills**: puntos libres, los 12 árboles con el tier desbloqueado y lo que falta para el siguiente,
  tus poderes con su cooldown en vivo, y cada skill marcada como aprendida, disponible o bloqueada (con el motivo).
  Árbol y descripciones salen del código del juego en español (`npm run gamedata`).
- **Estrategia**: plan de acción priorizado (qué recoger, qué entregar, poderes, ventas, VIP…), calendario
  de eventos, qué plantar según cada cuántas horas entras (el ciclo real se redondea a tu próxima visita)
  y cuánto rinden al día tus árboles y minerales con tus boosts.
- **Misiones**: entregas con coste por ticket (lo pedido valorado a floor −10%, herramientas y comidas por
  receta, coins a la tasa del banco o la que elijas), lo que falta comprar, entregas dobles, tareas con tu
  progreso real y bounties rentables. El boost de tickets del capítulo se ajusta a mano si tu copia del
  juego no tiene el capítulo actual.
- **Mercado**: métricas del día, más movidos, oportunidades (libros cruzados y spreads operables), watchlist
  y la tabla completa ordenable, o tu inventario valorado con tu coste de compra (automático a partir de tus
  últimas 50 operaciones, o a mano) y lo que ganarías o perderías vendiendo. Pulsa un item para ver su gráfico
  y el libro de órdenes.
- **NFTs**: tus coleccionables colocables y wearables (sin peces, flores, tesoros ni materia prima) con lo que
  pagaste, el floor de hoy, cuánto han subido o bajado desde tu compra, en 24 h, 7 y 30 días, un mini gráfico de
  30 días con tu precio de compra marcado, lo que ganarías vendiéndolos y lo que ya ganaste con las ventas.
  El precio de compra sale solo de tu historial o lo escribes tú en la tabla, y queda guardado.
  Pets NFT y buds son únicos: si no tienen listado ni ventas propias, un pet se compara con los del mercado
  que dan su mismo boost (el aura da energía y el collar XP; los rasgos de cada pet salen del código del
  juego): primero tipo + aura + collar, luego mismo boost de cualquier tipo, luego tipo + aura y por último
  solo tipo. Vale la mediana de ventas del primer grupo con 3 o más, o su listado más barato. Un bud se valora
  al floor de su colección. El servidor guarda cada día el valor de cada grupo.
- **Rankings**: los 9 top-100 con tu fila resaltada y tu puesto en tickets.
- **Eventos**: subastas, sorteos con ganadores y los anuncios del Discord oficial.

## Cuenta, sincronización y versión web

Opcional. La misma app puede funcionar como **nube** (`npm run nube`): una versión web que no pide keys
(usa datos públicos con la key del administrador), login con Discord, sincronización de tus precios de compra e
historial entre ordenadores (Ajustes → Cuenta en la nube, con un código de un solo uso) y premium, que está
programado y **apagado**. Cómo ponerla en internet: [DESPLIEGUE.md](DESPLIEGUE.md). Probarla en local:
`npm run nube:demo` → http://localhost:4177.

## Datos de sfl.world

Además de la API oficial, el servidor consulta la [API pública de sfl.world](https://sfl.world/util/api) (sin key;
tu API key nunca se envía allí) y la cachea entre 15 min y 1 día:

- **Boost y supply de cada NFT** en la página NFTs (filtro *Con boost*).
- **Euros**: precio de FLOWER en € en la cabecera, patrimonio y NFTs; y lo que costarían tus gemas en la tienda.
- **Tus boosts de cantidad reales** (NFTs, skills, zonas de efecto) en Estrategia: unidades por cosecha y por golpe.
- **Buscar jugadores por nombre** en el buscador (`/`): abre su ficha con foto, nivel, coins, gemas, isla,
  desde cuándo juega, marks y cheer. Las granjas nuevas tardan 2–7 días en aparecer.
- **Historial de subastas** en Eventos: supply, pujadores, corte y lo que pagó cada ganador (FLOWER o gemas).
  sfl.world tiene resultados hasta abril de 2026; las recientes salen en el módulo *Subastas* con la API oficial.

Si sfl.world no responde, esas partes se ocultan o vuelven al cálculo básico y el resto sigue igual.
En *Ajustes → Estado del proxy* ves si está funcionando.

## Tu historial y la evolución de precios (carpeta `data/`)

La API solo devuelve tus **50 últimas operaciones**, así que el servidor las va guardando:

- `data/trades-<granja>.json`: cada compra y venta que ve, sin borrar nunca. Consulta tu perfil cada
  20 min aunque no tengas el dashboard abierto (basta con que el servidor esté encendido). Al abrir un item
  también busca tus operaciones entre sus 10 últimas ventas y rescata las que falten.
- `data/prices-AAAA-MM.json`: el floor de cada item una vez al día, para ver en el detalle de cada item
  cómo ha evolucionado desde que lo compraste.
- `data/costs.json`: los costes que escribas a mano en *Mi inventario*.

Para compras anteriores a esas 50: en **NFTs → Buscar mis compras antiguas** el servidor revisa, en segundo
plano (≈5 s por NFT), las 10 últimas ventas de cada NFT sin precio de compra y rescata las que hiciste tú.
La columna **Origen** dice además de dónde salió cada NFT: marketplace, subasta ganada (con lo que pujaste,
las gemas pasadas a FLOWER), fabricado, tienda del juego o excavado (contadores de actividad de tu granja).
Lo que no aparezca por ningún lado, ponlo a mano una vez y queda guardado. Tus listados activos no cuentan
como precio de mercado.
Haz copia de `data/` si reinstalas: es tu historial.

## Calculadoras (como primerascripto.com)

- **Guía**: tu etapa y consejos de "ahora / pronto / más adelante" sacados de tu granja, con la próxima expansión e isla.
- **Producción**: FLOWER al día de cada cultivo, fruta, maceta, Crop Machine, flor (miel) y recurso, con tus boosts.
- **Simulador**: añade o quita cualquier coleccionable, prenda o skill y mira cuánto cambia tu ganancia y en cuántos
  días se paga.
- **Animales**: cada gallina, vaca y oveja: nivel, XP que le falta, comida, lo que da, si es rentable y si curarla.
- **Granja → Mapa de la isla**: cada parcela, nodo, edificio y decoración con su icono, capas y zoom, y debajo lo que
  dará cada recurso al cosecharlo.
- **Referencia** (sin granja): cofres con probabilidades y valor medio, cocina (XP por FLOWER), pesca, semillas y
  herramientas.
- **Misiones → Entregas**: la recompensa con tus boosts de entrega y "conviene entregar o vender" con la comisión de tu isla.

## Excavación y otras granjas

- **Excavación** (menú Granja): el sitio del desierto de hoy con lo que ya cavaste, los patrones del día y el % de
  tesoro de cada casilla según las pistas de Digby (cangrejo = tesoro arriba, abajo o a un lado; arena = ninguno).
  Marca la mejor casilla para la pala y el mejor 2×2 para el taladro.
- **Ver cualquier granja**: escribe su número en el buscador (`/`), pulsa *Ver su granja* en la ficha de un jugador
  o abre `http://localhost:4173/?farm=12345`. Es solo lectura: tu granja de Ajustes no cambia y no se guarda nada
  suyo en `data/`. *Volver a la tuya* quita el `?farm=` de la dirección.

Atajos: `/` buscar item · `1`–`9` cambiar de página · `r` actualizar · `Esc` cerrar.
El título de la pestaña muestra cuántas cosas tienes listas, útil en un segundo monitor.

## Detalles

- **Límite de la API**: 1 petición cada ~5 s por IP. El servidor pone en cola todas las peticiones, las espacia
  5,2 s, reintenta los 429 y cachea cada tipo (granja 45 s, mercado 60 s, rankings 3 h…). Por eso la
  primera carga de cada pestaña tarda unos segundos.
- **Tiempos exactos**: el juego aplica los boosts moviendo hacia atrás `plantedAt` / `choppedAt` / `minedAt`,
  así que el momento en que algo está listo es siempre esa marca más el tiempo base.
- **Datos del juego** (tiempos, recetas, skills, tickets por NPC, capítulos): `npm run gamedata` los descarga del
  repositorio oficial del juego en GitHub (~20 archivos de texto). Hazlo cuando salga un capítulo o una
  actualización grande. `npm run gamedata:local` usa una copia local en su lugar.
- **Comprobación**: `npm test` valida los datos del juego, todos los endpoints con la demo, el historial y la
  seguridad del servidor. Pásalo antes de repartir una versión.
- **Seguridad**: el servidor solo escucha en tu PC (127.0.0.1), rechaza peticiones con otro `Host`
  (DNS rebinding) y cambios de configuración que no vengan del propio dashboard.
- **Reloj**: se corrige el desfase de tu PC con la hora del servidor.
- **Errores de la API**: si Sunflower Land responde 5xx (p. ej. un 502 de Cloudflare) o no hay red, el proxy
  reintenta solo a los 5 s, 15 s y 45 s. Mientras tanto sirve la última copia buena y el dashboard muestra
  en la cabecera su antigüedad real: aviso ámbar a partir de 10 min y rojo a partir de 1 h (también en
  Estrategia y Misiones). En *Ajustes → Estado del proxy* ves cada error con su hora y si ya se resolvió.
- **Testnet**: `set SFL_UPSTREAM=https://api-dev.sunflower-land.com/community` antes de arrancar (necesita una key de testnet).
