# 🌻 SFL Dashboard

*[Leer en español](README.es.md)*

A local dashboard for Sunflower Land built on the official [Community API](https://sunflower-land.com/community-docs/)
(read-only). It only needs Node: no dependencies to install. The interface is available in **English and Spanish**:
the first time you open it, it asks which one you want, and you can change it later in **Settings → Appearance**.

> Unofficial tool made by players. Not affiliated with Sunflower Land. The Community API can't change anything on
> your farm: the dashboard only reads data, it never automates game actions.

## Getting started

```
start.bat            (Windows, double click)  → opens http://localhost:4173
start.command        (macOS, double click; the first time: chmod +x start.command)
npm start            (same thing on any system)
npm run demo         → simulated data on http://localhost:4174, no key needed
```

1. Install [Node](https://nodejs.org) (version 22 or newer).
2. `git clone` this repository and run `npm run gamedata` once (it downloads the game data it needs from the official
   Sunflower Land repository on GitHub).
3. Start it and go to **Settings**: paste your API key (it needs VIP and Bumpkin level 50+) and your Farm ID.

The key is saved in `config.json`, which only the local server reads. The browser never sees it, it is never sent to
anyone else and it is not part of the repository.

## What's inside

**Your farm**
- **Overview**: what's ready now and in the next hours, your farm card, a daily checklist (fishing, minigames,
  mushrooms, weather protection…), faction week, net worth day by day, watchlist, schedule and activity.
- **Today's plan**: what to do now, soon and later, worked out from your farm.
- **Farm**: island map with real positions, timers by category and the full harvest queue.
- **Inventory**: everything valued at market price, sell or keep, what changed and what you can cook or craft.
- **Skills, Animals, Pets and Digging** (desert dig site with the odds for each square based on Digby's clues).

**Progress**
- **Chapter**: tickets, reward pass, chapter collection, Stella's shop with goals and days to afford them, chores,
  ticket deliveries (deliver or sell the ingredients) and bounties.
- **Missions**: deliveries with cost per ticket, chores and profitable bounties.
- **Faction**: rank, kitchen, faction pet, weekly history and Eldric's shop.
- **Strategy, Production and Simulator**: what to plant for your visit pace, FLOWER per day of every crop, fruit, flower
  and resource with your boosts, and how much any collectible, wearable or skill would add before you buy it.

**Market and social**
- **Market**: today's prices, movers, opportunities, order books and your inventory with your purchase cost.
- **NFTs**: your collectibles, wearables, pets and buds with what you paid, today's floor and profit.
- **Coin converter**: how many coins each FLOWER gets you buying on the market and selling to the shop.
- **Friends, Community and Rankings**: your farm compared with your friends and with every active farm (from the
  nightly dump of all farms).

**Guides** (work without a farm too)
- Cooking, Fishing (with marine marvel maps), Flowers (crosses and NPC gifts), Pets and Animals calculators that use
  your boosts or the ones you want to try.
- Collectibles (what they do and when they can be withdrawn), Crafting, Buildings, Expansions (cost and nodes of every
  plot), Bumpkin level, NPC deliveries, Shops, Chests and seeds.

Shortcuts: `/` search an item or player · `1`–`9` switch page · `r` refresh · `Esc` close.
Any farm can be opened read-only with `?farm=12345` in the address, and `?lang=en` or `?lang=es` sets the language.

## Where the data comes from

- **Community API** (with your key, through the local server only): your farm, market, rankings and events. The server
  queues requests 5.2 s apart to respect the limit (about 1 request every 5 s per IP), retries errors and serves the last
  good copy if Sunflower Land doesn't respond.
- **Game code**: times, recipes, skills, shops and many tables are extracted from the official
  [sunflower-land](https://github.com/sunflower-land/sunflower-land) repository with `npm run gamedata`. Nothing from the
  game is executed: the files are only read as text. The data updates itself every week.
- **[sfl.world](https://sfl.world)** public API (without your key): NFT boosts and supply, euro price, player search,
  auction history, flower crosses, Crafting Box recipes and NPC order lists. If it's down, those parts hide and the rest
  keeps working.
- **Game art** is loaded from the game's own servers; it is not copied into this repository.

## Your history (`data/` folder)

The API only returns your last 50 trades, so the server keeps them in `data/trades-<farm>.json` and saves a daily price
snapshot in `data/prices-YYYY-MM.json` to show how prices have moved since you bought. Purchase costs you type by hand
go to `data/costs.json`. This folder stays on your computer: back it up if you reinstall.

## Development

- `npm test` checks the game data, every server endpoint against a mock API, security, and draws every page in a
  headless Chrome/Edge (also in English) looking for JavaScript errors.
- The frontend is plain JavaScript in `public/js/` (classic scripts that share the global scope, loaded in order by
  `index.html`). The interface is written in Spanish and `public/js/00-idioma.js` translates it with the dictionary in
  `public/js/i18n/en.js`. To translate new texts: `node tools/i18n-extract.js` lists what's missing, add it to
  `tools/i18n/en-*.json` and run `node tools/i18n-build.js`.
- Security: the server only listens on 127.0.0.1, checks the `Host` header (DNS rebinding) and only accepts
  configuration changes from the dashboard itself.
