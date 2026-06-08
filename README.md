# EVE NewBro Overlay

[![Latest release](https://img.shields.io/github/v/release/Reyarzz/EveNewBro?label=download&style=flat-square)](https://github.com/Reyarzz/EveNewBro/releases/latest)

A lightweight, transparent, always-on-top desktop overlay for **EVE Online** that
gives new players quick tips and curated starter ship fits on screen — without
ever touching the game client.

## Download (players — no build required)

1. Go to **[github.com/Reyarzz/EveNewBro/releases/latest](https://github.com/Reyarzz/EveNewBro/releases/latest)**
2. Download **`EVE-NewBro-Setup-….exe`** under Assets
3. Run the installer → launch **EVE NewBro** from the desktop shortcut

Full steps (SmartScreen, optional SSO): **[INSTALL.md](INSTALL.md)**

> **You do not need** Node.js, `git clone`, or `build.bat` unless you are developing the app.

> **Why an external overlay and not an "addon"?** EVE Online does not allow code
> to run inside the game client (there is no Lua/addon API like WoW). The safe,
> allowed approach is an external window that floats over the game. This tool
> **never reads EVE's memory, never reads the cache, and never sends input** to
> the client, so it stays well within CCP's EULA. Run EVE in **windowed** or
> **borderless fullscreen** so the overlay shows on top.

## Features

- **Expand / Compact in one window** — no need to launch a separate app:
  - **Overlay** (default): small, transparent, always-on-top beside the game.
  - Click **Expand** in the title bar (or **Alt+Shift+D**) to grow the *same*
    window into the large **intel layout** (~1400×900, not fullscreen). It drops
    always-on-top so it works on a second monitor or beside the game. Click
    **Compact** (or **Alt+Shift+D** again) to shrink back. Size/position are
    remembered separately for each mode.
  - `npm run desktop` is shorthand for `npm start` then auto-expand.
- **Progressive layout**: as you **resize wider**, more panels appear automatically
  (`compact` → `medium` → `wide` → `ultra`). On **wide+** the Map tab splits into
  a **galaxy + side dock** that embeds **zKillboard** and **Dotlan** for the
  system you clicked (no alt-tabbing). Market item pages show **hubs beside the
  price chart**; Intel search sits beside full results.
- Transparent, frameless, always-on-top overlay window (overlay mode only)
- Opens on the **Market** tab by default (the overlay is useful for *all* EVE
  players, not just new ones — tips are one tab among many).
- **Global status strip** (always visible, top of the window): live **EVE time
  (UTC)**, a **downtime countdown** (next 11:00 UTC), and **Tranquility status**
  with the current **player count** (green = online, amber = VIP). No login.
- **Rich map hover + system card** (see Map tab below): hover *any* system for a
  full intel tooltip; click/search a system to pin a detailed info card.
- **Tools** tab folds three reference/QoL utilities together: a **damage-type &
  resist cheat sheet**, a persistent **notes scratchpad**, and an **EVE news /
  patch-notes feed** (configurable RSS).
- **Map** tab: a **live New Eden conflict map** with **no login required**. A
  galaxy heat map of **ship/pod kills in the last hour**, plus markers and intel
  panels for **active sovereignty campaigns**, **incursions**, **faction-warfare
  fronts**, and **declared corp/alliance wars** — and the location of every NPC
  station. Hover any system for its name, region, kills/hr and station count;
  toggle layers; auto-refreshes every 5 minutes. (Data: ESI + Fuzzwork SDE.)
  Now also includes a **live kill feed from zKillboard (RedisQ)**: kills appear
  in real time as bright markers on the map and in a scrolling feed — click any
  kill to fly the map to that system. A **route planner** (From/To + fastest /
  safer / less-safe) draws the jump path on the map and lists every system with
  its security and **kills/hr**, so you can dodge hot pipes.
  **Rich hover:** mousing over any system shows everything we know about it —
  name, **region + constellation**, **security (color-coded)**, **kills/hr**
  with a ship/pod/NPC breakdown, **jumps/hr**, NPC station count, any active
  **sovereignty campaign**, **faction-warfare** state, **incursion** status, and
  recent **live zKill** activity. Clicking (or searching) a system pins a full
  **system info card** with quick actions (set as route From/To, open in Dotlan
  or zKillboard) and a list of recent kills there.
- **Account** tab (login required): **multi-character account hub** — ESI does not
  expose “all alts on one login,” so you **add each character once** via SSO, then:
  - **Overview** — wallet, SP, location, ship, and corp for every pilot on your roster.
  - **Assets** — **cross-character asset search**: filter hangar items across all logged-in
    alts, quantities per character, and estimated Jita value.
  - **Insights** — duplicated items spread across alts and top hangar value stacks.
  - **Mail** — read inbox and **send mail** for any roster character (new mail scopes).
  - **Corp** — monitor your active character’s corporation (or search by name): wars,
    member count, alliance, zKill stats; director scope unlocks member list sample.
- **Search** tab (no login): **New Eden unified search** — characters, corporations,
  alliances, systems, regions, constellations, items, and structures. Click a pilot or
  org to jump to **Intel**; corps also open **Account → Corp**; systems fly the **Map**.
- **Ops** tab: **elite veteran tools** — ten workflows serious pilots actually use:
  - **Route brief** — jump-by-jump pipe intel with kills/hr, live zKill activity, and camp flags.
  - **Threat fusion** — single situational score from radar + camps + your location.
  - **Career analytics** — wallet/SP trends and loss heatmap (login).
  - **Killmail analyze** — paste a zKill URL for damage profile and top dealers.
  - **Courier board** — public contracts ranked by ISK/m³ with risky collateral flags.
  - **WH chain log** — persistent wormhole signature chain in local storage.
  - **Fleet rollup** — bulk intel on pasted pilot lists with exportable summary.
  - **Hub arbitrage** — hauling spreads across trade hubs + route danger on each leg.
  - **Fit logistics** — EFT skills check + Jita buy/sell cost (login for skills).
  - **Gate camps** — live camp/battle watch with auto-refresh.
- **Intel** tab: **target & recruit vetting** with **no login required**. Look up
  any **character, corporation or alliance** and see combat stats from
  zKillboard (kills, losses, **danger %**, **gang %**, solo kills, ISK destroyed)
  plus their favorite ship/system/region and affiliation, with a link straight to
  their zKillboard page. **Local (bulk)** mode lets you paste a whole Local member
  list and **flags every pilot by threat** (you copy the names yourself — never
  reads the client).
- **Industry** tab: **build-vs-buy** (material cost at Jita vs the finished item's
  price, so you know whether to manufacture or just buy) and **refine / ore**
  ranking (best ore to mine by refined **ISK/m³** at your reprocessing yield).
  Recipe + reprocessing tables come from the SDE (downloaded once).
- **Tips** tab: categorized new-player advice (survival, fitting, skills, ISK,
  navigation, PvP, corp/community, UI quality-of-life)
- **Fits** tab: a filterable library of starter fits with one-click **Copy EFT**
  — paste straight into the in-game Fitting window. Pick **your ship** from a
  dropdown, or filter by **activity** (Exploration / Mining / Missions / Ratting
  / Hauling / PvP), **faction**, **hull class**, and **source**, or **search** by
  ship/role/tag. Fits are grouped per ship with official EVE ship renders and
  tagged with difficulty and ISK tier. Includes built-in curated fits plus
  optional **community fits from EVE Workbench** that auto-update daily.
- **Market** tab: live trading data with **no login required**, in four modes:
  - **Search** any item by name (or use the quick-pick buttons for PLEX,
    minerals, skill injectors).
  - **Browse** — the complete market catalog: **every item in the game**,
    organized exactly like the in-game Market window. Build it once (it fetches
    the full category tree + all ~15,000 item names and caches them locally),
    then drill down through every category with reference prices shown next to
    each item.
  - **Appraise** — paste an **EFT fit** or a **shopping list** and get the total
    cost (buy from sell orders) and total value (sell to buy orders) at Jita,
    line by line. Great for pricing a fit or a haul before you commit.
  - **Deals** — scan a set of items (popular trade goods or your watchlist) for
    the best **Jita station-trade margin** and the best **buy-low/sell-high
    hauling route** across the five hubs; sort by margin or profit.
  - **Watch** — track items with live Jita prices and set a **target price**;
    when it's reached you get a **desktop notification** (buy ≤ target, or
    sell ≥ target). Add anything to the watchlist from its detail page.
  - **Contracts** — search **public contracts** by region (Jita/Amarr/Dodixie/
    Rens/Hek) and type (**courier / item exchange / auction**), sorted by reward
    or price, with the endpoint stations resolved. Great for finding hauling
    jobs or item deals. No login required.

  Every item's detail page now also shows a **price-history chart** (a price line
  with daily volume bars) alongside the 30-day stats.

  Open any item to see, side by side across the five major hubs (**Jita, Amarr,
  Dodixie, Rens, Hek**): the lowest **sell** price (what you'd pay), the highest
  **buy** price (what you'd get), the spread, the station-trading **margin %**,
  and order volumes. A summary highlights the **cheapest place to buy**, the
  **best place to sell**, and any **hauling profit** (buy-low/sell-high arbitrage
  between hubs), plus a **Jita 30-day trend** (average price and daily volume).
  Prices come from the public ESI + Fuzzwork market aggregates.
- **Me** tab: log in with **EVE SSO** to personalize advice using the official
  **ESI API** (read-only). Shows your skill points, wallet, current ship,
  location, and skill-queue health, then generates tailored suggestions
  (e.g. "your skill queue is empty", "we have starter fits for your current ship").
  Also has **desktop notification** toggles: watchlist **price alerts** and
  **new incursions** (no login needed), plus **skill-queue** (empty / finishing
  within 24h) and **PI extractor** (expiring within 6h) alerts when logged in.
  Includes a **skill plan / training-time** calculator (pick a skill + target
  level; with login it uses your real attributes + trained SP), and a
  **fit checker** lives on the Fits tab (paste an EFT fit to see which skills
  you're missing and the fit's cost). When logged in, the Me tab also has
  lazy-loaded panels for **Assets & locations** (where all your stuff is, grouped
  by station with item counts), **Jump clones & implants** (each clone's location
  + installed implants, plus your active implants), and **Recent losses & ISK
  efficiency** (your latest killmails with ship/system/value from zKillboard and
  your overall efficiency).
- **Tools** tab (no login):
  - **Damage** — a damage-type & resist cheat sheet: which damage to **deal** vs
    **tank** against each NPC faction, empire-hull resist holes, and base tank
    weaknesses (EM / Thermal / Kinetic / Explosive color-coded).
  - **Notes** — a persistent scratchpad for intel, shopping lists and saved
    links/fits; auto-saves locally.
  - **News** — merges one or more **RSS/Atom feeds** (defaults to EVE forum news
    + patch notes) into a single list; click an item to open it. Feeds are
    editable (name | url per line), so point it at any dev-blog or patch-notes
    feed you like.
- Global hotkeys:
  - `Alt+E` — show / hide the overlay
  - `Alt+Shift+E` — toggle click-through (let clicks pass to the game)
- Drag by the title bar to reposition. "Lock" makes the body click-through while
  the title bar stays grabbable.

## Requirements (installed app)

- **Windows 10/11** (installer build)
- EVE in **windowed** or **borderless fullscreen**

## Run from source (developers)

- [Node.js](https://nodejs.org/) 18+
- Clone this repo, then in PowerShell:

```powershell
npm install
npm start          # small overlay; use Expand when you want more space
npm run desktop    # same window, starts already expanded
```

**Expand** (`Alt+Shift+D`): larger layout + zKill/Dotlan dock when wide enough — still one window, not fullscreen.

For development (opens dev tools):

```powershell
npm run dev
```

## Publish a new release (maintainers)

GitHub Actions builds the installer automatically — **players never run `build.bat`**.

1. Commit your changes to `main`
2. Bump `version` in `package.json` if needed
3. Tag and push:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\tag-and-release.ps1
```

Or manually: `git tag v0.2.1` then `git push origin v0.2.1`

4. Watch **Actions** → when green, the `.exe` appears on **[Releases](https://github.com/Reyarzz/EveNewBro/releases)**

To build locally (optional): see **[BUILD.md](BUILD.md)** (`build.bat` / `build-windows.ps1`).

**Developer unpack** (folder with `.exe`, no installer):

```powershell
npm run build:dir
```

> Icons and installer metadata live in `build/` and `package.json` → `build` section.
> User settings and SSO tokens are stored under `%APPDATA%` (Electron userData), not beside the installer.

## How to use with EVE

1. Launch EVE and set the client to **Windowed** or **Borderless** (Esc → Display & Graphics).
2. Run `npm start` to open the overlay; drag it to a corner.
3. Browse tips, or open the **Fits** tab and click **Copy EFT fit**.
4. In EVE: open **Fitting** window → the import/paste option → paste. The fit loads
   (modules you own can be fitted; others show as needed-to-buy).
5. Press `Alt+Shift+E` (or click **Lock**) so your clicks pass through to the game
   while keeping the tips visible.

## Enable login (EVE SSO + ESI)

The **Me** tab works once you register a free EVE application and provide its
Client ID. (The Tips and Fits tabs work without any of this.)

**Easiest way — set it up inside the app:**

1. Start the app and open the **Me** tab. It walks you through setup with
   copy buttons for the callback URL and scopes.
2. Click the link to <https://developers.eveonline.com/> → **Manage
   Applications** → **Create New Application**.
3. **Connection Type:** `Authentication & API Access`.
4. **Callback URL:** exactly `http://localhost:3838/callback` (copy button in-app).
5. **Scopes** (all read-only — copy button in-app adds them all):
   - `esi-location.read_location.v1`
   - `esi-location.read_ship_type.v1`
   - `esi-skills.read_skills.v1`
   - `esi-skills.read_skillqueue.v1`
   - `esi-wallet.read_character_wallet.v1`
   - `esi-assets.read_assets.v1` — Me-tab asset/location tracker
   - `esi-clones.read_clones.v1` — Me-tab jump-clone tracker
   - `esi-clones.read_implants.v1` — active implants

   > If you logged in before these scopes were added, **log out and back in** so
   > the new asset/clone panels have permission. Loss history needs no scope.
6. Copy the generated **Client ID**, paste it into the Me tab, and click
   **Save & continue**. The Client ID is stored locally in your user-data folder.

**Alternative:** create a `.env` file (copy `.env.example`) with
`EVE_CLIENT_ID=...`, or paste it into `config.js`.

Security notes:

- This uses **OAuth2 with PKCE**, so there is **no client secret** to leak.
- The refresh token is stored locally and encrypted via Electron `safeStorage`
  (OS keychain/DPAPI) when available.
- All ESI calls are **read-only**. The app never sends input to or reads memory
  from the EVE client.

## Community fits (EVE Workbench)

The Fits tab integrates with **EVE Workbench** using their v1 API. It needs a
free API key:

1. Go to <https://www.eveworkbench.com/my-account/developer> → **Create new
   Application** (Public / Limited Access is fine). You must be logged in first.
2. Copy the generated **API Key**.
3. In the app's **Fits** tab, click **Connect** in the community bar, paste the
   API Key, and hit **Save & fetch fits** (or set `EWB_API_KEY` in `.env`).

What it does (and an important limitation):

- EVE Workbench's v1 API does **not** expose a public "browse all community fits
  by ship" endpoint, so the overlay can't auto-pull arbitrary community fits.
- What it **can** do:
  - **Sync your own EVE Workbench fits** (`GET /v1/fits/list`) into the overlay,
    refreshing automatically once a day (and via **Refresh**).
  - **Import any community fit by link/ID**: paste an EVE Workbench fit URL into
    the import box and it fetches the fit via `GET /v1/fits/{id}/eft` and saves
    it locally. This is how you bring in community fits you find on their site.
- Community fits are tagged **EVE Workbench**, show the real ship render, link
  back to the fit page, and respect the **Source** filter (Built-in / Community).
- The app auto-detects the auth scheme (`X-API-KEY` and fallbacks). Everything is
  read-only and cached locally in your user-data folder.

## Market & trading data

The **Market** tab needs no account or API key — it uses public market data:

- **Browse all → Build full market catalog** fetches the entire ESI market group
  tree (`GET /markets/groups`, then each group) and resolves every item name
  (`POST /universe/names`), caching it to `market-catalog.json` in your user-data
  folder for 30 days. After it's built you can browse every item, and **search
  matches across all item names** (not just exact names).
- **Item lookup** (Search mode, before the catalog is built) resolves the name
  you type to a type ID via ESI (`POST /universe/ids`) — use the **exact in-game
  name** (e.g. `Tritanium`, `PLEX`, `Large Skill Injector`) or a quick-pick.
- **Reference prices** in lists are Jita-region best buy/sell, loaded on demand
  in bulk from Fuzzwork (`/aggregates/?region=10000002&types=...`).
- **Per-hub prices** (when you open an item) come from
  [Fuzzwork market aggregates](https://market.fuzzwork.co.uk/api/)
  (`/aggregates/?station=<id>&types=<id>`), which precompute best buy/sell,
  volumes and percentiles per station every ~30 minutes.
- **Price history** (the Jita 30-day trend) comes from ESI
  (`GET /markets/{region}/history`).
- Reading the table: **Sell** is the cheapest sell order (instant buy price),
  **Buy** is the highest buy order (instant sell price). The cheapest sell hub is
  highlighted green and the best buy hub amber. **Hauling profit** appears when an
  item's highest buy order in one hub exceeds its lowest sell order in another.

## Live conflict map

The **Map** tab needs no account or API key. It combines:

- **System geometry** (coordinates, security, region, and all NPC stations) from
  Fuzzwork's SDE CSV dump (`mapSolarSystems.csv`, `mapRegions.csv`,
  `staStations.csv`), downloaded **once** (~3 MB) and cached to
  `galaxy-systems.json` in your user-data folder.
- **Live conflict layers** from public ESI, refreshed every ~5 minutes:
  - `GET /universe/system_kills` — ship/pod kills per system in the last hour
    (the red heat map).
  - `GET /sovereignty/campaigns` — active null-sec sovereignty fights.
  - `GET /incursions` — active Sansha incursions.
  - `GET /fw/systems` — faction-warfare frontline ownership/contest state.
  - `GET /wars` — recent declared corp/alliance wars (sampled).

Hover a system to see its name, region, kills/hr and station count. Use the layer
chips to toggle the kill heat, sov fights, incursions, FW fronts and station
markers. **Scroll to zoom** (centered on the cursor) and **drag to pan**; the
**search box** flies the view to any system or region and drops a marker on it,
and **Reset** returns to the full-galaxy view. The galaxy view shows **known
space** (k-space); wormhole/abyssal systems are omitted because they have no
public coordinates on the cluster map.

The map also carries a **live kill feed** from **zKillboard's RedisQ** stream
(`https://redisq.zkillboard.com/listen.php`). Kills stream in as they happen,
showing the system, victim ship/pilot and ISK value; toggle the **Live kills**
layer to plot them on the map, and click any feed row to fly there.

## Intel lookup

The **Intel** tab needs no account. Type a **character**, **corporation** or
**alliance** name; it resolves the entity via ESI (`POST /universe/ids`), pulls
public info (`/characters|corporations|alliances/{id}`) and combat aggregates
from **zKillboard stats** (`https://zkillboard.com/api/stats/...`). You get
kills/losses, **danger %**, **gang %**, solo kills, ISK destroyed, and their
favorite ship/system/region — handy for sizing up a target or vetting a recruit.

## Notifications

The **Me** tab has desktop-notification toggles. A background checker (every ~5
minutes) fires native OS notifications for:

- **Watchlist price alerts** — when a watched item hits your target (public data).
- **New incursions** — when a Sansha incursion appears (public data).
- **Skill queue** — empty or finishing within 24h (requires SSO login).
- **PI extractors** — disabled for now (CCP SSO no longer accepts the old
  `esi-planets.manage_planets.v1` scope; login works without it).
- **Near-me threat radar** — when an active battle or likely gatecamp flares up
  within ~6 jumps of your current system (requires SSO login; uses the existing
  `esi-location.read_location.v1` scope).

## Power features (combos no single tool gives you)

These six features build on the existing data layer (galaxy SDE + live ESI,
zKillboard RedisQ, market aggregates, dogma, SSO) — **no new SSO scopes are
required**, so you do not need to log in again.

1. **Near-me threat radar + battle/gatecamp detector** (Map tab). Uses your live
   location (`/characters/{id}/location/`) and a stargate-adjacency BFS over the
   cached SDE (`mapSolarSystemJumps.csv`) to scan N jumps around you. Systems are
   flagged from `/universe/system_kills/` (last hour) and by clustering the live
   zKillboard buffer over a short window: many kills in minutes = **BATTLE**,
   sustained ship+pod kills = **CAMP?**. Hot systems are ringed on the canvas and
   listed, plus a cluster-wide "battles happening now" feed. Optional desktop alerts.
2. **Risk-adjusted trade routes** (Market → Deals). Each hauling row is annotated
   with route danger: `galaxy.route` between the two hubs, summed `system_kills`
   along the path, HS/LS/NS breakdown, and any active camp on the route. Shows a
   **risk-adjusted profit** and a "safer route" toggle (high-sec preference).
3. **Safe-and-lucrative ratting finder** (Map tab). Ranks low/null systems with
   high `npc_kills` but low `ship_kills` right now (active ratting, few hunters),
   with region + sov holder (`/sovereignty/map/`); click to fly the map there.
4. **"What can I afford and fly?"** (Me tab). Cross-references your wallet and
   trained skills against a curated ~80-hull list — dogma required skills + Jita
   price — and lists hulls you can both **board and buy** now (plus near-misses).
5. **Contract bargain & scam scanner** (Market → Contracts → "Bargains & scams").
   Appraises item-exchange contents (`/contracts/public/items/{id}`) vs the asking
   price to surface genuine **bargains** and likely **scams** (over-priced, BPC
   traps, worthless contents), and flags risky couriers (tiny reward vs collateral).
6. **Personal career analytics + "where you die" heatmap** (Me tab). Stores small
   local snapshots over time (liquid ISK, total SP, K/D) for trend sparklines, and
   aggregates your recent losses by **system**, **ship type** and **hour-of-day**.

## Trading, skills & industry tools

- **Route planner** (Map tab) calls `GET /route/{from}/{to}/?flag=...` and overlays
  the path on the galaxy with per-system security and kills/hr.
- **Deals scanner** (Market → Deals) fetches per-hub aggregates for a set of items
  and computes the best Jita station-trade margin and cross-hub hauling spread.
- **Skill plan** (Me tab) reads `/dogma/types/{id}` for a skill's rank + training
  attributes and, when logged in, `/characters/{id}/skills` + `/attributes` to
  show SP and real training time per level.
- **Fit check** (Fits tab) resolves an EFT fit's modules, unions their required
  skills from dogma, and compares against your trained levels (login required for
  the comparison); it also prices the fit.
- **Industry** (Industry tab) downloads the SDE recipe/reprocessing CSVs
  (`industryActivityProducts.csv`, `industryActivityMaterials.csv`,
  `invTypeMaterials.csv`) once, then prices materials via Fuzzwork for build-vs-buy
  and ore ISK/m³ ranking.

## Customize the content

All content is plain data — no build step needed:

- Tips: edit `src/data/tips.js`
- Fits: edit `src/data/fits.js` (each fit's `eft` string is standard EFT format)
- Personalized advice rules: edit `src/data/personalize.js`

## Project structure

```
config.js              # SSO/ESI config + .env loader
main.js                # Electron main: window, hotkeys, IPC handlers
preload.js             # Secure bridge (overlay + eve APIs)
src/
  index.html, styles.css, renderer.js   # Overlay UI (Market / Map / Intel / Industry / Fits / Tools / Tips / Me)
  data/
    tips.js            # Static new-player tips
    fits.js            # Curated EFT starter fits
    personalize.js     # Turns ESI snapshot into tailored advice
    damage.js          # Static damage-type & resist cheat sheet
  main/
    auth.js            # EVE SSO OAuth2 + PKCE, token refresh
    esi.js             # Read-only ESI client (skills/ship/wallet/...)
    community.js       # EVE Workbench community fits (sync + import)
    market.js          # Market data + appraisal + watchlist + deals scanner
    galaxy.js          # Live conflict map + route planner + stargate adjacency (ESI + Fuzzwork SDE)
    zkill.js           # Live kill feed (zKillboard RedisQ)
    intel.js           # Character/corp/alliance + bulk intel (ESI + zKillboard)
    skills.js          # Skill plans + fit skill-check + afford-and-fly (ESI dogma + character)
    industry.js        # Build-vs-buy + reprocessing/ore (Fuzzwork SDE)
    radar.js           # Near-me threat radar, battle/camp detector, ratting finder, route danger
    career.js          # Longitudinal career snapshots + "where you die" loss heatmap
    status.js          # Tranquility server status (player count / VIP)
    contracts.js       # Public contracts search + bargain/scam scanner (ESI)
    pilot.js           # Assets, jump clones + implants, loss history (SSO + zKill)
    news.js            # RSS/Atom news + patch-notes reader
    notify.js          # Background desktop notifications
    store.js           # Encrypted refresh-token storage + local settings/notes
```

## Roadmap ideas (phase 3)

- Pull live ship/module stats from CCP's **SDE** (Static Data Export).
- Detect missing tank/cap issues from saved fittings (`/characters/{id}/fittings/`).
- Activity presets (mining / exploration / mission running) that surface relevant tips.
- Pull community fits from a fittings service.

## Legal / fair use

- Uses no proprietary EVE assets and does not interact with the game client.
- EVE Online and all related trademarks are property of CCP hf. This is an
  unofficial fan tool. Always check CCP's current
  [Third-Party Developer policies](https://developers.eveonline.com/) and EULA.
