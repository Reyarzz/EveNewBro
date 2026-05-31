// Public contracts search (no auth).
//
// ESI `/contracts/public/{region_id}/` lists every public contract in a region
// (paginated). We pull the first couple of pages, filter by type, resolve the
// endpoint station names, and hand back a tidy list for the UI.

const cfg = require('../../config');
const esi = require('./esi');
const market = require('./market');

// Major trade regions for the quick-pick buttons.
const REGIONS = [
  { id: 10000002, name: 'The Forge' }, // Jita
  { id: 10000043, name: 'Domain' }, // Amarr
  { id: 10000032, name: 'Sinq Laison' }, // Dodixie
  { id: 10000030, name: 'Heimatar' }, // Rens
  { id: 10000042, name: 'Metropolis' } // Hek
];

function num(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

async function fetchPage(regionId, page) {
  const res = await fetch(`${cfg.ESI_BASE}/contracts/public/${regionId}/?page=${page}`, {
    headers: { Accept: 'application/json', 'User-Agent': cfg.USER_AGENT }
  });
  if (!res.ok) throw new Error(`contracts ${res.status}`);
  const pages = num(res.headers.get('x-pages')) || 1;
  const arr = await res.json();
  return { arr: Array.isArray(arr) ? arr : [], pages };
}

async function search(regionId, opts) {
  opts = opts || {};
  const type = opts.type || 'all';
  const maxPages = Math.min(opts.pages || 2, 5);
  let all = [];
  for (let p = 1; p <= maxPages; p++) {
    let res;
    try {
      res = await fetchPage(regionId, p);
    } catch (_e) {
      break;
    }
    all = all.concat(res.arr);
    if (p >= res.pages) break;
  }

  let rows = type === 'all' ? all : all.filter((c) => c.type === type);

  // Most useful ordering: couriers by reward, item/auction by price.
  rows.sort((a, b) => {
    if (type === 'courier') return num(b.reward) - num(a.reward);
    return num(b.price) - num(a.price);
  });
  rows = rows.slice(0, 100);

  // Resolve NPC station endpoint names (structures need docking auth — skip).
  const locIds = new Set();
  rows.forEach((c) => {
    if (c.start_location_id && c.start_location_id < 1e11) locIds.add(c.start_location_id);
    if (c.end_location_id && c.end_location_id < 1e11) locIds.add(c.end_location_id);
  });
  const names = await esi.resolveNames([...locIds]).catch(() => ({}));

  return rows.map((c) => ({
    id: c.contract_id,
    type: c.type,
    title: c.title || '',
    price: num(c.price),
    reward: num(c.reward),
    collateral: num(c.collateral),
    volume: num(c.volume),
    daysToComplete: num(c.days_to_complete),
    dateExpired: c.date_expired,
    start: names[c.start_location_id] || (c.start_location_id ? 'Structure' : ''),
    end: names[c.end_location_id] || (c.end_location_id ? 'Structure' : '')
  }));
}

// ---------- bargain & scam scanner ----------
async function mapPool(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const idx = next++;
      try {
        out[idx] = await fn(items[idx]);
      } catch (_e) {
        out[idx] = null;
      }
    }
  };
  await Promise.all(new Array(Math.min(limit, items.length) || 1).fill(0).map(() => worker()));
  return out;
}

async function fetchItems(contractId) {
  const res = await fetch(`${cfg.ESI_BASE}/contracts/public/items/${contractId}/`, {
    headers: { Accept: 'application/json', 'User-Agent': cfg.USER_AGENT }
  });
  if (!res.ok) throw new Error(`items ${res.status}`);
  const arr = await res.json();
  return Array.isArray(arr) ? arr : [];
}

// Scan a region's public contracts: appraise item-exchange contents against Jita
// to surface genuine bargains and likely scams, and flag risky couriers.
async function scanDeals(regionId, opts) {
  opts = opts || {};
  const maxPages = Math.min(opts.pages || 4, 8);
  let all = [];
  for (let p = 1; p <= maxPages; p++) {
    let res;
    try {
      res = await fetchPage(regionId, p);
    } catch (_e) {
      break;
    }
    all = all.concat(res.arr);
    if (p >= res.pages) break;
  }

  // Item-exchange candidates worth checking (cap fetches to stay snappy).
  const exch = all
    .filter((c) => c.type === 'item_exchange' && num(c.price) > 0)
    .sort((a, b) => num(b.price) - num(a.price))
    .slice(0, 60);

  const itemLists = await mapPool(exch, 6, (c) => fetchItems(c.contract_id));

  // Price every distinct type id once.
  const typeIds = new Set();
  itemLists.forEach((items) => {
    (items || []).forEach((it) => typeIds.add(it.type_id));
  });
  const prices = typeIds.size
    ? await market.groupPrices([...typeIds]).catch(() => ({}))
    : {};

  const evaluated = exch
    .map((c, i) => {
      const items = itemLists[i];
      if (!items || !items.length) return null;
      let value = 0; // Jita value of what you RECEIVE
      let askValue = 0; // value of items you must also hand over (rare)
      let bpc = false;
      let included = 0;
      items.forEach((it) => {
        const p = prices[it.type_id];
        const unit = p ? p.sellMin || 0 : 0;
        const sub = unit * (it.quantity || 1);
        if (it.is_blueprint_copy) bpc = true;
        if (it.is_included === false) {
          askValue += sub;
        } else {
          included += 1;
          value += sub;
        }
      });
      const price = num(c.price);
      const net = value - askValue;
      const profit = net - price;
      const ratio = price > 0 ? net / price : 0;

      let verdict = 'fair';
      // Bargain: contents worth materially more than the asking price.
      if (price > 0 && net >= price * 1.3 && profit >= 5e6) verdict = 'bargain';
      // Scam: paying far above market, or a BPC dressed up where value collapses.
      if (price > 0 && net > 0 && net <= price * 0.5) verdict = 'scam';
      if (bpc && net < price * 0.2) verdict = 'scam'; // classic BPC-as-BPO trap
      if (value === 0 && included > 0) verdict = 'scam'; // unpriced/worthless contents

      return {
        id: c.contract_id,
        type: 'item_exchange',
        title: c.title || '',
        price,
        value: Math.round(net),
        profit: Math.round(profit),
        ratio,
        verdict,
        bpc,
        items: included,
        region: regionId
      };
    })
    .filter(Boolean);

  // Risky couriers: high collateral, tiny reward (you carry the loss risk).
  const couriers = all
    .filter((c) => c.type === 'courier' && num(c.collateral) > 0)
    .map((c) => {
      const reward = num(c.reward);
      const collateral = num(c.collateral);
      const rewardPct = collateral > 0 ? reward / collateral : 0;
      const risky = rewardPct < 0.01; // <1% reward for the collateral at risk
      return {
        id: c.contract_id,
        type: 'courier',
        title: c.title || '',
        reward,
        collateral,
        volume: num(c.volume),
        rewardPct,
        verdict: risky ? 'risky' : 'fair'
      };
    })
    .filter((c) => c.verdict === 'risky')
    .sort((a, b) => b.collateral - a.collateral)
    .slice(0, 20);

  // Rank: bargains first (by profit), then scams (worst first), then fair.
  const order = { bargain: 0, fair: 1, scam: 2 };
  evaluated.sort((a, b) => {
    if (order[a.verdict] !== order[b.verdict]) return order[a.verdict] - order[b.verdict];
    if (a.verdict === 'bargain') return b.profit - a.profit;
    if (a.verdict === 'scam') return a.ratio - b.ratio;
    return b.value - a.value;
  });

  // Resolve endpoint names for the shown set.
  const shown = evaluated.slice(0, 60);
  const locIds = new Set();
  shown.forEach((c) => {
    const raw = exch.find((e) => e.contract_id === c.id);
    if (raw && raw.start_location_id && raw.start_location_id < 1e11)
      locIds.add(raw.start_location_id);
  });
  const names = await esi.resolveNames([...locIds]).catch(() => ({}));
  shown.forEach((c) => {
    const raw = exch.find((e) => e.contract_id === c.id);
    c.start = raw && names[raw.start_location_id] ? names[raw.start_location_id] : 'Structure';
  });

  return {
    fetchedAt: Date.now(),
    bargains: shown.filter((c) => c.verdict === 'bargain'),
    scams: shown.filter((c) => c.verdict === 'scam'),
    couriers
  };
}

module.exports = { REGIONS, search, scanDeals };
