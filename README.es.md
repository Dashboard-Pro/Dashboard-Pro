# 🌻 SFL Dashboard

*[Read in English](README.md)*

Dashboard local para Sunflower Land sobre la [Community API](https://sunflower-land.com/community-docs/) oficial
(solo lectura). Solo necesita Node: no hay dependencias que instalar. La interfaz está en **español e inglés**: la
primera vez que lo abres te pregunta cuál quieres, y luego se cambia en **Ajustes → Apariencia**.

> Herramienta no oficial hecha por jugadores, sin relación con Sunflower Land. La Community API no puede cambiar nada
> de tu granja: el dashboard solo lee datos y nunca automatiza acciones del juego.

## Arrancar

```
start.bat            (Windows, doble clic)  → abre http://localhost:4173
start.command        (macOS, doble clic; la primera vez: chmod +x start.command)
npm start            (lo mismo en cualquier sistema)
npm run demo         → datos simulados en http://localhost:4174, sin key
```

1. Instala [Node](https://nodejs.org) (versión 22 o más nueva).
2. Haz `git clone` del repositorio y ejecuta una vez `npm run gamedata` (descarga los datos del juego que necesita del
   repositorio oficial de Sunflower Land en GitHub).
3. Arráncalo y ve a **Ajustes**: pega tu API key (pide VIP y Bumpkin nivel 50+) y tu Farm ID.

La key se guarda en `config.json`, que solo lee el servidor local. El navegador nunca la ve, no se envía a nadie más y no
forma parte del repositorio.

## Qué hay

**Tu granja**
- **Resumen**: lo listo ahora y en las próximas horas, la ficha de tu granja, el checklist del día (pesca, minijuegos,
  hongos, protecciones de clima…), la semana de tu facción, tu patrimonio día a día, watchlist, agenda y actividad.
- **Plan de hoy**: qué hacer ahora, pronto y más adelante, calculado con tu granja.
- **Granja**: mapa de la isla con las posiciones reales, temporizadores por categoría y la cola de cosecha completa.
- **Inventario**: todo valorado a precio de mercado, vender o guardar, qué cambió y qué puedes cocinar o fabricar.
- **Skills, Animales, Mascotas y Excavación** (el sitio del desierto con la probabilidad de cada casilla según las
  pistas de Digby).

**Progreso**
- **Capítulo**: tickets, pase de recompensas, colección del capítulo, tienda de Stella con metas y los días que te
  faltan, tareas, entregas de tickets (entregar o vender los ingredientes) y bounties.
- **Misiones**: entregas con su coste por ticket, tareas y bounties rentables.
- **Facción**: rango, cocina, mascota de la facción, historial semanal y la tienda de Eldric.
- **Estrategia, Producción y Simulador**: qué plantar según cada cuánto entras, los FLOWER al día de cada cultivo,
  fruta, flor y recurso con tus boosts, y cuánto sumaría cualquier coleccionable, prenda o skill antes de comprarlo.

**Mercado y social**
- **Mercado**: precios del día, lo que más se mueve, oportunidades, libros de órdenes y tu inventario con tu coste de compra.
- **NFTs**: tus coleccionables, wearables, pets y buds con lo que pagaste, el floor de hoy y lo que ganarías.
- **Conversor de monedas**: cuántas coins saca cada FLOWER comprando en el mercado y vendiendo a la tienda.
- **Amigos, Comunidad y Rankings**: tu granja comparada con la de tus amigos y con todas las granjas activas (del
  volcado nocturno de todas las granjas).

**Guías** (funcionan también sin granja)
- Calculadoras de Cocina, Pesca (con los mapas de las maravillas marinas), Flores (cruces y regalos a los NPCs),
  Mascotas y Animales, con tus boosts o los que quieras probar.
- Coleccionables (qué hacen y cuándo se pueden retirar), Crafteo, Edificios, Expansiones (coste y nodos de cada
  parcela), Nivel Bumpkin, Entregas de NPCs, Tiendas, Cofres y semillas.

Atajos: `/` buscar item o jugador · `1`–`9` cambiar de página · `r` actualizar · `Esc` cerrar.
Cualquier granja se puede abrir en solo lectura con `?farm=12345` en la dirección, y `?lang=es` o `?lang=en` fija el idioma.

## De dónde salen los datos

- **Community API** (con tu key, solo a través del servidor local): tu granja, el mercado, los rankings y los eventos.
  El servidor pone las peticiones en cola cada 5,2 s para respetar el límite (más o menos 1 petición cada 5 s por IP),
  reintenta los errores y, si Sunflower Land no responde, sirve la última copia buena.
- **Código del juego**: tiempos, recetas, skills, tiendas y muchas tablas se sacan del repositorio oficial
  [sunflower-land](https://github.com/sunflower-land/sunflower-land) con `npm run gamedata`. No se ejecuta nada del
  juego: los archivos solo se leen como texto. Los datos se actualizan solos cada semana.
- **API pública de [sfl.world](https://sfl.world)** (sin tu key): boost y supply de los NFTs, precio en euros, buscar
  jugadores, historial de subastas, cruces de flores, recetas de la Crafting Box y pedidos de los NPCs. Si cae, esas
  partes se ocultan y el resto sigue funcionando.
- **El arte del juego** se carga de los servidores del propio juego; no se copia en este repositorio.

## Tu historial (carpeta `data/`)

La API solo devuelve tus 50 últimas operaciones, así que el servidor las va guardando en `data/trades-<granja>.json`, y
guarda una foto diaria de los precios en `data/prices-AAAA-MM.json` para ver cómo han cambiado desde que compraste. Los
costes que escribas a mano van a `data/costs.json`. Esta carpeta se queda en tu ordenador: haz copia si reinstalas.

## Cuenta y versión web

Opcional. La misma app puede funcionar como **nube** (`npm run nube`): una versión web que no pide keys, con login de
Discord y sincronización de tus precios de compra e historial entre ordenadores. Probarla en local: `npm run nube:demo` → http://localhost:4177.

## Desarrollo

- `npm test` comprueba los datos del juego, todos los endpoints del servidor contra una API simulada, la seguridad, y
  dibuja cada página en un Chrome/Edge sin ventana (también en inglés) buscando errores de JavaScript.
- El frontend es JavaScript sin librerías en `public/js/` (scripts clásicos que comparten el ámbito global, cargados en
  orden desde `index.html`). La interfaz está escrita en español y `public/js/00-idioma.js` la traduce con el
  diccionario de `public/js/i18n/en.js`. Para traducir textos nuevos: `node tools/i18n-extract.js` lista lo que falta,
  se añade en `tools/i18n/en-*.json` y se ejecuta `node tools/i18n-build.js`.
- Seguridad: el servidor solo escucha en 127.0.0.1, comprueba la cabecera `Host` (DNS rebinding) y solo acepta cambios
  de configuración que vengan del propio dashboard.
