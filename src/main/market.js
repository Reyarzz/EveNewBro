// Market / trading data.
//
// Public, key-free data sources:
//   1. ESI (esi.evetech.net):
//        - resolve item name <-> type id
//        - the full market group tree (the in-game Market window's categories)
//        - regional daily price history
//   2. Fuzzwork market aggregates (market.fuzzwork.co.uk): fast precomputed
//        per-station / per-region best buy / best sell / volume numbers.
//
// "Every item everywhere" is the full market catalog: we fetch the entire ESI
// market group tree once, resolve every item name, and cache it to disk. After
// that the user can browse every category and item, with prices loaded on demand.

const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const cfg = require('../../config');
const store = require('./store');

// The five NPC trade hubs everyone quotes prices against.
const HUBS = [
  { key: 'jita', name: 'Jita', system: 'Jita', station: 60003760, region: 10000002 },
  { key: 'amarr', name: 'Amarr', system: 'Amarr', station: 60008494, region: 10000043 },
  { key: 'dodixie', name: 'Dodixie', system: 'Dodixie', station: 60011866, region: 10000032 },
  { key: 'rens', name: 'Rens', system: 'Rens', station: 60004588, region: 10000030 },
  { key: 'hek', name: 'Hek', system: 'Hek', station: 60005686, region: 10000042 }
];

const FUZZWORK_AGG = 'https://market.fuzzwork.co.uk/aggregates/';
const FORGE_REGION = 10000002; // The Forge / Jita — the reference market.
const CATALOG_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days

function num(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

// ---------- low-level HTTP ----------
async function esiPost(pathname, body) {
  const res = await fetch(cfg.ESI_BASE + pathname, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': cfg.USER_AGENT
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`ESI POST ${pathname} -> ${res.status}`);
  return res.json();
}

async function esiGet(pathname) {
  const res = await fetch(cfg.ESI_BASE + pathname, {
    headers: { Accept: 'application/json', 'User-Agent': cfg.USER_AGENT }
  });
  if (!res.ok) throw new Error(`ESI GET ${pathname} -> ${res.status}`);
  return res.json();
}

async function fuzz(query) {
  const res = await fetch(`${FUZZWORK_AGG}?${query}`, {
    headers: { Accept: 'application/json', 'User-Agent': cfg.USER_AGENT }
  });
  if (!res.ok) throw new Error(`Fuzzwork -> ${res.status}`);
  return res.json();
}

// Simple bounded-concurrency map.
async function mapPool(items, limit, fn, onProgress) {
  const out = new Array(items.length);
  let next = 0;
  let done = 0;
  const worker = async () => {
    while (next < items.length) {
      const idx = next++;
      try {
        out[idx] = await fn(items[idx]);
      } catch (_e) {
        out[idx] = null;
      }
      done++;
      if (onProgress) onProgress(done, items.length);
    }
  };
  const n = Math.min(limit, items.length) || 1;
  await Promise.all(new Array(n).fill(0).map(() => worker()));
  return out;
}

// ---------- item name resolution ----------
async function resolveType(name) {
  const cleaned = String(name || '').trim();
  if (!cleaned) throw new Error('Type a market item name.');
  const data = await esiPost('/universe/ids/?language=en', [cleaned]);
  const match = (data && data.inventory_types && data.inventory_types[0]) || null;
  if (!match) {
    throw new Error(`No item called "${cleaned}". Use the exact in-game name, or browse the catalog.`);
  }
  return { id: match.id, name: match.name };
}

async function resolveTypeNames(ids) {
  const names = {};
  for (let i = 0; i < ids.length; i += 1000) {
    const chunk = ids.slice(i, i + 1000).map(Number);
    try {
      const list = await esiPost('/universe/names/', chunk);
      list.forEach((e) => {
        if (e && e.id) names[e.id] = e.name;
      });
    } catch (_e) {
      /* skip this chunk; non-resolvable ids are rare for market types */
    }
  }
  return names;
}

// ---------- full market catalog (group tree) ----------
let catalogState = { building: false, done: 0, total: 0, ready: false, error: null };
let memoryCatalog = null;

function catalogPath() {
  return path.join(app.getPath('userData'), 'market-catalog.json');
}

function readCatalog() {
  if (memoryCatalog) return memoryCatalog;
  try {
    const f = catalogPath();
    if (!fs.existsSync(f)) return null;
    const data = JSON.parse(fs.readFileSync(f, 'utf8'));
    memoryCatalog = data;
    return data;
  } catch (_e) {
    return null;
  }
}

function writeCatalog(catalog) {
  memoryCatalog = catalog;
  try {
    fs.writeFileSync(catalogPath(), JSON.stringify(catalog), 'utf8');
  } catch (_e) {}
}

function catalogIsFresh() {
  const c = readCatalog();
  return !!(c && c.builtAt && Date.now() - c.builtAt < CATALOG_TTL);
}

function catalogStatus() {
  const c = readCatalog();
  return {
    building: catalogState.building,
    done: catalogState.done,
    total: catalogState.total,
    ready: !!c,
    fresh: catalogIsFresh(),
    error: catalogState.error,
    builtAt: c ? c.builtAt : 0,
    groupCount: c ? Object.keys(c.groups).length : 0,
    itemCount: c ? Object.keys(c.typeNames).length : 0
  };
}

// Build the whole tree from ESI market groups. ~2k group requests (one-time,
// cached). Progress is exposed via catalogStatus() so the UI can poll.
async function buildCatalog() {
  if (catalogState.building) return catalogStatus();
  catalogState = { building: true, done: 0, total: 0, ready: false, error: null };
  try {
    const ids = await esiGet('/markets/groups/');
    catalogState.total = ids.length;

    const details = await mapPool(
      ids,
      24,
      (id) => esiGet(`/markets/groups/${id}/`),
      (done) => {
        catalogState.done = done;
      }
    );

    const groups = {};
    const allTypeIds = new Set();
    details.forEach((g) => {
      if (!g || !g.market_group_id) return;
      const id = g.market_group_id;
      groups[id] = {
        id,
        name: g.name || `Group ${id}`,
        parentId: g.parent_group_id || null,
        childIds: [],
        typeIds: Array.isArray(g.types) ? g.types : []
      };
      (groups[id].typeIds || []).forEach((t) => allTypeIds.add(t));
    });

    const roots = [];
    Object.values(groups).forEach((g) => {
      if (g.parentId && groups[g.parentId]) groups[g.parentId].childIds.push(g.id);
      else roots.push(g.id);
    });

    const byName = (a, b) => (groups[a].name || '').localeCompare(groups[b].name || '');
    roots.sort(byName);
    Object.values(groups).forEach((g) => g.childIds.sort(byName));

    const typeNames = await resolveTypeNames([...allTypeIds]);

    const catalog = { builtAt: Date.now(), groups, roots, typeNames };
    writeCatalog(catalog);
    catalogState.ready = true;
    return catalogStatus();
  } catch (e) {
    catalogState.error = e.message || String(e);
    throw e;
  } finally {
    catalogState.building = false;
  }
}

function getCatalog() {
  return readCatalog();
}

// Kick off a background build if we have nothing cached yet.
function ensureCatalog() {
  if (!readCatalog() && !catalogState.building) {
    buildCatalog().catch(() => {});
  }
}

// ---------- search across every item ----------
async function searchItems(query, limit = 60) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return [];
  const cat = readCatalog();
  if (cat && cat.typeNames) {
    const matches = [];
    for (const [id, name] of Object.entries(cat.typeNames)) {
      if (name && name.toLowerCase().includes(q)) {
        matches.push({ id: Number(id), name });
        if (matches.length > limit * 4) break;
      }
    }
    matches.sort((a, b) => {
      const ap = a.name.toLowerCase().startsWith(q) ? 0 : 1;
      const bp = b.name.toLowerCase().startsWith(q) ? 0 : 1;
      if (ap !== bp) return ap - bp;
      return a.name.length - b.name.length;
    });
    return matches.slice(0, limit);
  }
  // No catalog yet — fall back to exact ESI name resolution.
  try {
    return [await resolveType(query)];
  } catch (_e) {
    return [];
  }
}

// ---------- prices ----------
async function fuzzworkStation(stationId, typeId) {
  const json = await fuzz(`station=${stationId}&types=${typeId}`);
  return json[String(typeId)] || null;
}

// Reference (Jita region) sell/buy for many items at once, for group listings.
async function groupPrices(typeIds) {
  const ids = (typeIds || []).filter(Boolean).map(Number);
  const out = {};
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    try {
      const json = await fuzz(`region=${FORGE_REGION}&types=${chunk.join(',')}`);
      chunk.forEach((t) => {
        const a = json[String(t)];
        if (a) {
          out[t] = {
            sellMin: num(a.sell && a.sell.min),
            buyMax: num(a.buy && a.buy.max),
            volume: num(a.sell && a.sell.volume) + num(a.buy && a.buy.volume)
          };
        }
      });
    } catch (_e) {
      /* skip chunk */
    }
  }
  return out;
}

// ---------- deals: station-trading + hauling scan ----------
// Common high-volume trade goods, used as the default scan set.
const PRESET_TRADE_NAMES = [
  'PLEX',
  'Large Skill Injector',
  'Small Skill Injector',
  'Skill Extractor',
  'Tritanium',
  'Pyerite',
  'Mexallon',
  'Isogen',
  'Nocxium',
  'Zydrine',
  'Megacyte',
  'Morphite',
  'Nanite Repair Paste',
  'Helium Isotopes',
  'Hydrogen Isotopes',
  'Nitrogen Isotopes',
  'Oxygen Isotopes',
  'Liquid Ozone',
  'Strontium Clathrates',
  'Oxygen Fuel Block',
  'Helium Fuel Block',
  'Hydrogen Fuel Block',
  'Nitrogen Fuel Block',
  'Antimatter Charge S',
  'Antimatter Charge M',
  'Antimatter Charge L',
  'Multifrequency S',
  'Multifrequency M',
  'Multifrequency L',
  'Scourge Fury Light Missile',
  'Scourge Fury Heavy Missile',
  'Mjolnir Rage Heavy Assault Missile',
  'EMP L',
  'Republic Fleet EMP L',
  'Caldari Navy Antimatter Charge M',
  'Federation Navy Antimatter Charge M',
  'Imperial Navy Multifrequency M',
  '200mm Steel Plates II',
  'Damage Control II',
  'Large Shield Extender II',
  '10MN Afterburner II',
  '5MN Microwarpdrive II',
  'Warrior II',
  'Hobgoblin II',
  'Hammerhead II',
  'Ogre II',
  'Tritanium'
];

let presetIdsCache = null;
async function dealsPresetIds() {
  if (presetIdsCache) return presetIdsCache;
  const map = await resolveNamesToIds([...new Set(PRESET_TRADE_NAMES)]);
  presetIdsCache = Object.values(map).map((v) => v.id);
  return presetIdsCache;
}

// For a set of type ids, compute Jita station-trade margin and the best
// cheapest-sell-hub -> highest-buy-hub hauling spread across the five hubs.
async function deals(typeIds) {
  const ids = [...new Set((typeIds || []).map(Number).filter(Boolean))];
  if (ids.length === 0) return [];

  const byHub = {};
  for (const hub of HUBS) {
    byHub[hub.key] = {};
    for (let i = 0; i < ids.length; i += 100) {
      const chunk = ids.slice(i, i + 100);
      try {
        const json = await fuzz(`region=${hub.region}&types=${chunk.join(',')}`);
        chunk.forEach((t) => {
          byHub[hub.key][t] = json[String(t)] || null;
        });
      } catch (_e) {
        /* skip chunk */
      }
    }
  }

  const cat = readCatalog();
  return ids.map((id) => {
    const perHub = HUBS.map((h) => {
      const a = byHub[h.key][id];
      return {
        hub: h.name,
        sell: num(a && a.sell && a.sell.min),
        buy: num(a && a.buy && a.buy.max),
        vol: num(a && a.sell && a.sell.volume)
      };
    });
    const jita = perHub[0];
    const stationProfit = jita.sell > 0 && jita.buy > 0 ? jita.sell - jita.buy : 0;
    const stationMargin = jita.sell > 0 && jita.buy > 0 ? (stationProfit / jita.sell) * 100 : 0;

    const sells = perHub.filter((h) => h.sell > 0).sort((a, b) => a.sell - b.sell);
    const buys = perHub.filter((h) => h.buy > 0).sort((a, b) => b.buy - a.buy);
    const cheap = sells[0];
    const bestBuy = buys[0];
    let haul = null;
    if (cheap && bestBuy && bestBuy.buy > cheap.sell) {
      const profit = bestBuy.buy - cheap.sell;
      haul = {
        from: cheap.hub,
        to: bestBuy.hub,
        buy: cheap.sell,
        sell: bestBuy.buy,
        profit,
        margin: (profit / cheap.sell) * 100
      };
    }
    return {
      id,
      name: (cat && cat.typeNames && cat.typeNames[id]) || `Type ${id}`,
      jita: { sell: jita.sell, buy: jita.buy, vol: jita.vol },
      stationProfit,
      stationMargin,
      haul
    };
  });
}

async function hubData(hub, typeId) {
  let agg = null;
  try {
    agg = await fuzzworkStation(hub.station, typeId);
  } catch (_e) {
    agg = null;
  }
  if (!agg) return { key: hub.key, name: hub.name, system: hub.system, ok: false };

  const buy = agg.buy || {};
  const sell = agg.sell || {};
  const buyMax = num(buy.max);
  const sellMin = num(sell.min);
  const hasBoth = buyMax > 0 && sellMin > 0;
  const spread = hasBoth ? sellMin - buyMax : 0;
  const margin = hasBoth && sellMin > 0 ? (spread / sellMin) * 100 : 0;

  return {
    key: hub.key,
    name: hub.name,
    system: hub.system,
    region: hub.region,
    ok: true,
    sellMin,
    buyMax,
    sellAvg: num(sell.weightedAverage),
    buyAvg: num(buy.weightedAverage),
    sell5pct: num(sell.percentile),
    buy5pct: num(buy.percentile),
    sellVolume: num(sell.volume),
    buyVolume: num(buy.volume),
    sellOrders: num(sell.orderCount || sell.numOrders),
    buyOrders: num(buy.orderCount || buy.numOrders),
    spread,
    margin
  };
}

async function history(regionId, typeId) {
  let rows = [];
  try {
    rows = await esiGet(`/markets/${regionId}/history/?type_id=${typeId}`);
  } catch (_e) {
    return null;
  }
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const last30 = rows.slice(-30);
  const latest = rows[rows.length - 1];
  const avgVol = last30.reduce((s, r) => s + num(r.volume), 0) / last30.length;
  const avgPrice = last30.reduce((s, r) => s + num(r.average), 0) / last30.length;
  // Daily series (up to last 90 days) for the chart.
  const series = rows.slice(-90).map((r) => ({
    date: r.date,
    average: num(r.average),
    volume: num(r.volume)
  }));
  return {
    date: latest.date,
    average: num(latest.average),
    highest: num(latest.highest),
    lowest: num(latest.lowest),
    volume: num(latest.volume),
    avg30Volume: avgVol,
    avg30Price: avgPrice,
    series
  };
}

// Full per-hub breakdown for one resolved type {id, name}.
async function lookupType(type) {
  const hubs = await Promise.all(HUBS.map((h) => hubData(h, type.id)));

  const sellable = hubs.filter((h) => h.ok && h.sellMin > 0);
  const buyable = hubs.filter((h) => h.ok && h.buyMax > 0);
  const cheapest = sellable.slice().sort((a, b) => a.sellMin - b.sellMin)[0] || null;
  const bestSell = buyable.slice().sort((a, b) => b.buyMax - a.buyMax)[0] || null;

  let arbitrage = null;
  if (cheapest && bestSell && bestSell.buyMax > cheapest.sellMin) {
    const profit = bestSell.buyMax - cheapest.sellMin;
    arbitrage = {
      buyHub: cheapest.name,
      buyPrice: cheapest.sellMin,
      sellHub: bestSell.name,
      sellPrice: bestSell.buyMax,
      profitPerUnit: profit,
      marginPct: (profit / cheapest.sellMin) * 100
    };
  }

  const trend = await history(FORGE_REGION, type.id);

  return {
    type,
    icon: `https://images.evetech.net/types/${type.id}/icon?size=64`,
    hubs,
    summary: {
      cheapest: cheapest ? { name: cheapest.name, price: cheapest.sellMin } : null,
      bestSell: bestSell ? { name: bestSell.name, price: bestSell.buyMax } : null,
      arbitrage
    },
    history: trend,
    fetchedAt: Date.now()
  };
}

async function lookup(name) {
  return lookupType(await resolveType(name));
}

async function lookupById(typeId, name) {
  let nm = name;
  if (!nm) {
    const cat = readCatalog();
    if (cat && cat.typeNames && cat.typeNames[typeId]) nm = cat.typeNames[typeId];
    else {
      try {
        const list = await esiPost('/universe/names/', [Number(typeId)]);
        nm = list[0] && list[0].name;
      } catch (_e) {}
    }
  }
  return lookupType({ id: Number(typeId), name: nm || `Type ${typeId}` });
}

// ---------- appraisal (paste an EFT fit or shopping list) ----------
// Parse a blob of text into { name, qty } lines. Handles EFT (header in
// brackets, "Module, Charge" lines, "Item xN" cargo) and plain lists like
// "Tritanium 1000", "1000 Tritanium" or "Tritanium x1000".
function parseList(text) {
  const counts = {};
  const add = (name, qty) => {
    const n = (name || '').trim();
    if (!n) return;
    counts[n] = (counts[n] || 0) + (qty || 1);
  };
  String(text || '')
    .split(/\r?\n/)
    .forEach((raw) => {
      let line = raw.trim();
      if (!line) return;
      // EFT fit header: [Ship, Fit name]
      const header = line.match(/^\[(.+?),/);
      if (header) {
        add(header[1], 1);
        return;
      }
      if (line.startsWith('[')) return; // [Empty High slot] etc.

      // Trailing "xN" quantity.
      let qty = 1;
      let m = line.match(/\s+x\s*(\d[\d,]*)\s*$/i);
      if (m) {
        qty = Number(m[1].replace(/,/g, '')) || 1;
        line = line.slice(0, m.index).trim();
      } else {
        // Trailing plain number, or leading number ("1000 Tritanium").
        m = line.match(/^(\d[\d,]*)\s+(.+)$/);
        const m2 = line.match(/^(.+?)\s+(\d[\d,]*)$/);
        if (m) {
          qty = Number(m[1].replace(/,/g, '')) || 1;
          line = m[2].trim();
        } else if (m2) {
          qty = Number(m2[2].replace(/,/g, '')) || 1;
          line = m2[1].trim();
        }
      }
      // EFT "Module Name, Charge Name" -> two items.
      if (line.includes(', ')) {
        const parts = line.split(',').map((p) => p.trim());
        parts.forEach((p) => add(p, qty));
      } else {
        add(line, qty);
      }
    });
  return Object.entries(counts).map(([name, qty]) => ({ name, qty }));
}

async function resolveNamesToIds(names) {
  const map = {};
  for (let i = 0; i < names.length; i += 100) {
    const chunk = names.slice(i, i + 100);
    try {
      const data = await esiPost('/universe/ids/?language=en', chunk);
      (data.inventory_types || []).forEach((t) => {
        map[t.name.toLowerCase()] = { id: t.id, name: t.name };
      });
    } catch (_e) {
      /* skip chunk */
    }
  }
  return map;
}

async function appraise(text) {
  const items = parseList(text);
  if (items.length === 0) return { lines: [], totalSell: 0, totalBuy: 0, unknown: 0 };

  const nameMap = await resolveNamesToIds(items.map((i) => i.name));
  const ids = [];
  items.forEach((i) => {
    const hit = nameMap[i.name.toLowerCase()];
    if (hit) ids.push(hit.id);
  });
  const prices = await groupPrices(ids);

  let totalSell = 0;
  let totalBuy = 0;
  let unknown = 0;
  const lines = items.map((i) => {
    const hit = nameMap[i.name.toLowerCase()];
    if (!hit) {
      unknown++;
      return { name: i.name, qty: i.qty, found: false };
    }
    const p = prices[hit.id] || { sellMin: 0, buyMax: 0 };
    const sellTotal = p.sellMin * i.qty;
    const buyTotal = p.buyMax * i.qty;
    totalSell += sellTotal;
    totalBuy += buyTotal;
    return {
      name: hit.name,
      id: hit.id,
      qty: i.qty,
      found: true,
      sellEach: p.sellMin,
      buyEach: p.buyMax,
      sellTotal,
      buyTotal
    };
  });

  return { lines, totalSell, totalBuy, unknown };
}

// ---------- watchlist + price alerts ----------
function getWatchItems() {
  const s = store.loadSettings();
  return Array.isArray(s.watchlist) ? s.watchlist : [];
}

function saveWatchItems(items) {
  store.saveSettings({ watchlist: items });
}

function addWatch(id, name) {
  const items = getWatchItems();
  if (!items.find((w) => w.id === id)) {
    items.push({ id: Number(id), name, target: null, dir: 'below' });
    saveWatchItems(items);
  }
  return items;
}

function removeWatch(id) {
  saveWatchItems(getWatchItems().filter((w) => w.id !== Number(id)));
  return getWatchItems();
}

function setWatchTarget(id, target, dir) {
  const items = getWatchItems();
  const w = items.find((x) => x.id === Number(id));
  if (w) {
    w.target = target == null || target === '' ? null : Number(target);
    if (dir) w.dir = dir;
    saveWatchItems(items);
  }
  return items;
}

// Watchlist with live Jita prices attached, for the UI.
async function getWatchlist() {
  const items = getWatchItems();
  if (items.length === 0) return [];
  const prices = await groupPrices(items.map((w) => w.id));
  return items.map((w) => ({
    ...w,
    sellMin: prices[w.id] ? prices[w.id].sellMin : 0,
    buyMax: prices[w.id] ? prices[w.id].buyMax : 0
  }));
}

module.exports = {
  HUBS,
  lookup,
  lookupById,
  searchItems,
  groupPrices,
  buildCatalog,
  ensureCatalog,
  getCatalog,
  catalogStatus,
  appraise,
  parseList,
  resolveNamesToIds,
  deals,
  dealsPresetIds,
  getWatchlist,
  getWatchItems,
  addWatch,
  removeWatch,
  setWatchTarget
};
