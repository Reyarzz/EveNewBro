// Industry helpers: manufacturing build-vs-buy and reprocessing / best-ore.
//
// Recipe + reprocessing data come from Fuzzwork's SDE CSV dumps (downloaded and
// cached once). Prices come from the public Fuzzwork market aggregates via the
// market module.
//
//   industryActivityProducts.csv  - blueprint -> product (activity 1 = manufacture)
//   industryActivityMaterials.csv - blueprint -> input materials
//   invTypeMaterials.csv          - reprocessing output per refine batch

const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const cfg = require('../../config');
const market = require('./market');

const DUMP_BASE = 'https://www.fuzzwork.co.uk/dump/latest/';
const SDE_TTL = 60 * 24 * 60 * 60 * 1000; // 60 days
const ORE_PORTION = 100; // ore reprocesses in batches of 100

// Common ore unit volumes (m3) for ISK/m3 ranking.
const ORE_VOLUMES = {
  Veldspar: 0.1,
  Scordite: 0.15,
  Pyroxeres: 0.3,
  Plagioclase: 0.35,
  Omber: 0.6,
  Kernite: 1.2,
  Jaspet: 2,
  Hemorphite: 3,
  Hedbergite: 3,
  Gneiss: 5,
  'Dark Ochre': 8,
  Crokite: 16,
  Spodumain: 16,
  Bistot: 16,
  Arkonor: 16,
  Mercoxit: 40
};

let buildingSde = false;
let memSde = null;

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': cfg.USER_AGENT } });
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  return res.text();
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/);
  const header = lines[0].split(',');
  const idx = {};
  header.forEach((h, i) => {
    idx[h.trim()] = i;
  });
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i]) continue;
    rows.push(lines[i].split(','));
  }
  return { idx, rows };
}

function num(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

function sdePath() {
  return path.join(app.getPath('userData'), 'industry-sde.json');
}

function readSde() {
  if (memSde) return memSde;
  try {
    const f = sdePath();
    if (!fs.existsSync(f)) return null;
    memSde = JSON.parse(fs.readFileSync(f, 'utf8'));
    return memSde;
  } catch (_e) {
    return null;
  }
}

function sdeFresh() {
  const s = readSde();
  return !!(s && s.builtAt && Date.now() - s.builtAt < SDE_TTL);
}

function sdeStatus() {
  const s = readSde();
  return {
    ready: !!s,
    building: buildingSde,
    fresh: sdeFresh(),
    builtAt: s ? s.builtAt : 0,
    productCount: s ? Object.keys(s.products).length : 0,
    reprocessCount: s ? Object.keys(s.reprocess).length : 0
  };
}

async function buildSde() {
  if (buildingSde) return readSde();
  buildingSde = true;
  try {
    const [prodText, matText, reproText] = await Promise.all([
      fetchText(DUMP_BASE + 'industryActivityProducts.csv'),
      fetchText(DUMP_BASE + 'industryActivityMaterials.csv'),
      fetchText(DUMP_BASE + 'invTypeMaterials.csv')
    ]);

    // product type -> { bp, qty } for manufacturing (activity 1)
    const pc = parseCsv(prodText);
    const products = {};
    pc.rows.forEach((r) => {
      if (num(r[pc.idx.activityID]) !== 1) return;
      const product = num(r[pc.idx.productTypeID]);
      if (!product) return;
      products[product] = { bp: num(r[pc.idx.typeID]), qty: num(r[pc.idx.quantity]) || 1 };
    });

    // blueprint -> [{ id, qty }] inputs (activity 1)
    const mc = parseCsv(matText);
    const matsByBp = {};
    mc.rows.forEach((r) => {
      if (num(r[mc.idx.activityID]) !== 1) return;
      const bp = num(r[mc.idx.typeID]);
      if (!bp) return;
      (matsByBp[bp] = matsByBp[bp] || []).push({
        id: num(r[mc.idx.materialTypeID]),
        qty: num(r[mc.idx.quantity])
      });
    });

    // type -> [{ id, qty }] reprocessing outputs
    const rc = parseCsv(reproText);
    const reprocess = {};
    rc.rows.forEach((r) => {
      const t = num(r[rc.idx.typeID]);
      if (!t) return;
      (reprocess[t] = reprocess[t] || []).push({
        id: num(r[rc.idx.materialTypeID]),
        qty: num(r[rc.idx.quantity])
      });
    });

    const payload = { builtAt: Date.now(), products, matsByBp, reprocess };
    memSde = payload;
    try {
      fs.writeFileSync(sdePath(), JSON.stringify(payload), 'utf8');
    } catch (_e) {}
    return payload;
  } finally {
    buildingSde = false;
  }
}

function nameFor(id) {
  const cat = market.getCatalog && market.getCatalog();
  return (cat && cat.typeNames && cat.typeNames[id]) || `Type ${id}`;
}

// Build-vs-buy for a product type id.
async function buildCost(productTypeId) {
  const sde = readSde();
  if (!sde) throw new Error('Industry data not built yet.');
  const recipe = sde.products[productTypeId];
  if (!recipe) throw new Error('No manufacturing blueprint found for that item.');
  const mats = sde.matsByBp[recipe.bp] || [];

  const priceIds = [...mats.map((m) => m.id), Number(productTypeId)];
  const prices = await market.groupPrices(priceIds);

  let build = 0;
  const materials = mats.map((m) => {
    const each = prices[m.id] ? prices[m.id].sellMin : 0;
    const total = each * m.qty;
    build += total;
    return { id: m.id, name: nameFor(m.id), qty: m.qty, each, total };
  });

  const p = prices[productTypeId] || { sellMin: 0, buyMax: 0 };
  return {
    productId: Number(productTypeId),
    productName: nameFor(productTypeId),
    runQty: recipe.qty,
    materials,
    buildCost: build,
    perUnitBuild: recipe.qty ? build / recipe.qty : build,
    productSell: p.sellMin,
    productBuy: p.buyMax,
    savingsVsSell: p.sellMin * recipe.qty - build
  };
}

// Reprocessing value for one type at a given yield (0-1).
async function reprocess(typeId, yieldPct) {
  const sde = readSde();
  if (!sde) throw new Error('Industry data not built yet.');
  const outputs = sde.reprocess[typeId] || [];
  if (outputs.length === 0) throw new Error('No reprocessing output for that item.');
  const y = yieldPct > 0 && yieldPct <= 1 ? yieldPct : 0.7;
  const prices = await market.groupPrices(outputs.map((o) => o.id));
  let total = 0;
  const list = outputs.map((o) => {
    const qty = Math.floor(o.qty * y);
    const each = prices[o.id] ? prices[o.id].sellMin : 0;
    const value = qty * each;
    total += value;
    return { id: o.id, name: nameFor(o.id), qty, value };
  });
  return { typeId: Number(typeId), yield: y, batch: ORE_PORTION, outputs: list, totalValue: total };
}

// Rank common ores by refined ISK/m3 at a given yield.
async function bestOre(yieldPct) {
  const sde = readSde();
  if (!sde) throw new Error('Industry data not built yet.');
  const y = yieldPct > 0 && yieldPct <= 1 ? yieldPct : 0.7;

  const oreMap = await market.resolveNamesToIds(Object.keys(ORE_VOLUMES));
  const entries = Object.values(oreMap)
    .map((o) => ({ id: o.id, name: o.name, volume: ORE_VOLUMES[o.name] }))
    .filter((o) => o.volume && sde.reprocess[o.id]);

  // Collect all mineral ids to price in one batch.
  const mineralIds = new Set();
  entries.forEach((o) => sde.reprocess[o.id].forEach((m) => mineralIds.add(m.id)));
  const orePriceIds = entries.map((o) => o.id);
  const prices = await market.groupPrices([...mineralIds, ...orePriceIds]);

  const rows = entries.map((o) => {
    const outs = sde.reprocess[o.id];
    let batchValue = 0;
    outs.forEach((m) => {
      const each = prices[m.id] ? prices[m.id].sellMin : 0;
      batchValue += Math.floor(m.qty * y) * each;
    });
    const valuePerUnit = batchValue / ORE_PORTION;
    const refinedPerM3 = valuePerUnit / o.volume;
    const orePrice = prices[o.id] ? prices[o.id].sellMin : 0;
    return {
      id: o.id,
      name: o.name,
      volume: o.volume,
      refinedPerUnit: valuePerUnit,
      refinedPerM3,
      orePerUnit: orePrice,
      orePerM3: orePrice / o.volume
    };
  });
  rows.sort((a, b) => b.refinedPerM3 - a.refinedPerM3);
  return { yield: y, rows };
}

module.exports = { buildSde, sdeStatus, buildCost, reprocess, bestOre };
