// Multi-character account hub: consolidated overview, cross-alt asset search,
// and account-level insights.

const cfg = require('../../config');
const auth = require('./auth');
const esi = require('./esi');
const market = require('./market');

async function authGet(pathname, token, page) {
  const url = cfg.ESI_BASE + pathname + (page != null ? `?page=${page}` : '');
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': cfg.USER_AGENT,
      Authorization: `Bearer ${token}`
    }
  });
  if (!res.ok) throw new Error(`ESI ${pathname} -> ${res.status}`);
  const pages = Number(res.headers.get('x-pages')) || 1;
  const data = await res.json();
  return { data, pages };
}

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

async function charRow(c) {
  const access = await auth.getValidAccess(c.id);
  if (!access) {
    return { id: c.id, name: c.name, ok: false, error: 'Re-login required' };
  }
  const id = c.id;
  try {
    const [pub, wallet, loc, ship, skills, queue] = await Promise.all([
      fetch(cfg.ESI_BASE + `/characters/${id}/`, {
        headers: { Accept: 'application/json', 'User-Agent': cfg.USER_AGENT }
      }).then((r) => (r.ok ? r.json() : {})),
      authGet(`/characters/${id}/wallet/`, access.token).then((r) => r.data).catch(() => null),
      authGet(`/characters/${id}/location/`, access.token).then((r) => r.data).catch(() => null),
      authGet(`/characters/${id}/ship/`, access.token).then((r) => r.data).catch(() => null),
      authGet(`/characters/${id}/skills/`, access.token).then((r) => r.data).catch(() => null),
      authGet(`/characters/${id}/skillqueue/`, access.token).then((r) => r.data).catch(() => null)
    ]);

    const nameIds = [];
    if (ship && ship.ship_type_id) nameIds.push(ship.ship_type_id);
    if (loc && loc.solar_system_id) nameIds.push(loc.solar_system_id);
    if (pub.corporation_id) nameIds.push(pub.corporation_id);
    if (pub.alliance_id) nameIds.push(pub.alliance_id);
    const names = await esi.resolveNames(nameIds).catch(() => ({}));

    return {
      id,
      name: c.name,
      ok: true,
      wallet: typeof wallet === 'number' ? wallet : null,
      totalSp: skills && skills.total_sp ? skills.total_sp : null,
      system: loc && loc.solar_system_id ? names[loc.solar_system_id] || null : null,
      ship: ship && ship.ship_type_id ? names[ship.ship_type_id] || null : null,
      corp: pub.corporation_id ? names[pub.corporation_id] || null : null,
      alliance: pub.alliance_id ? names[pub.alliance_id] || null : null,
      corpId: pub.corporation_id || null,
      queueLen: Array.isArray(queue) ? queue.length : 0,
      sec: typeof pub.security_status === 'number' ? pub.security_status : null
    };
  } catch (e) {
    return { id: c.id, name: c.name, ok: false, error: e.message || String(e) };
  }
}

async function overview() {
  const { characters, activeId } = auth.getRoster();
  if (characters.length === 0) return { loggedIn: false };

  const rows = await mapPool(characters, 3, charRow);
  const ok = rows.filter((r) => r && r.ok);

  const insights = {
    characterCount: characters.length,
    totalWallet: ok.reduce((s, r) => s + (r.wallet || 0), 0),
    totalSp: ok.reduce((s, r) => s + (r.totalSp || 0), 0),
    emptyQueues: ok.filter((r) => r.queueLen === 0).map((r) => r.name),
    training: ok.filter((r) => r.queueLen > 0).length,
    corps: [...new Set(ok.map((r) => r.corp).filter(Boolean))]
  };

  return { loggedIn: true, activeId, characters: rows, insights };
}

async function fetchAssetsForChar(c) {
  const access = await auth.getValidAccess(c.id);
  if (!access) return [];
  const id = c.id;
  let all = [];
  try {
    const first = await authGet(`/characters/${id}/assets/`, access.token, 1);
    all = first.data;
    const pages = Math.min(first.pages, 5);
    for (let p = 2; p <= pages; p++) {
      const next = await authGet(`/characters/${id}/assets/`, access.token, p);
      if (Array.isArray(next.data)) all = all.concat(next.data);
    }
  } catch (_e) {
    return [];
  }
  return all.map((a) => ({
    ...a,
    characterId: id,
    characterName: c.name
  }));
}

async function consolidatedAssets(query) {
  const { characters } = auth.getRoster();
  if (characters.length === 0) return { loggedIn: false };

  const q = String(query || '').trim().toLowerCase();
  const allAssets = [];
  const lists = await mapPool(characters, 2, fetchAssetsForChar);
  lists.forEach((arr) => {
    if (Array.isArray(arr)) allAssets.push(...arr);
  });

  const itemIds = new Set(allAssets.map((a) => a.type_id));
  const typeNames = {};
  const ids = [...itemIds];
  for (let i = 0; i < ids.length; i += 1000) {
    try {
      const chunk = ids.slice(i, i + 1000);
      const list = await esi.resolveNames(chunk);
      Object.assign(typeNames, list);
    } catch (_e) {
      /* skip */
    }
  }

  const byType = {};
  allAssets.forEach((a) => {
    const tid = a.type_id;
    if (!byType[tid]) {
      byType[tid] = {
        typeId: tid,
        name: typeNames[tid] || `Type ${tid}`,
        totalQty: 0,
        byChar: {}
      };
    }
    byType[tid].totalQty += a.quantity || 1;
    const cn = a.characterName;
    byType[tid].byChar[cn] = (byType[tid].byChar[cn] || 0) + (a.quantity || 1);
  });

  let rows = Object.values(byType);
  if (q) {
    rows = rows.filter((r) => r.name.toLowerCase().includes(q));
  }
  rows.sort((a, b) => b.totalQty - a.totalQty);

  const topIds = rows.slice(0, 80).map((r) => r.typeId);
  const prices = await market.groupPrices(topIds).catch(() => ({}));
  rows.forEach((r) => {
    const p = prices[r.typeId];
    r.jitaSell = p ? p.sellMin : 0;
    r.estValue = r.jitaSell * r.totalQty;
  });

  const totalEst = rows.reduce((s, r) => s + (r.estValue || 0), 0);

  return {
    loggedIn: true,
    query: q,
    itemCount: allAssets.length,
    uniqueTypes: rows.length,
    totalEstIsk: totalEst,
    rows: rows.slice(0, 100)
  };
}

async function insights() {
  const assets = await consolidatedAssets('');
  if (!assets.loggedIn) return assets;

  const dupes = assets.rows.filter((r) => Object.keys(r.byChar).length > 1);
  const topValue = [...assets.rows].sort((a, b) => b.estValue - a.estValue).slice(0, 10);

  return {
    loggedIn: true,
    ...assets,
    insights: {
      duplicatedAcrossAlts: dupes.length,
      topDuplicates: dupes.slice(0, 8).map((r) => ({
        name: r.name,
        chars: Object.keys(r.byChar)
      })),
      topValueItems: topValue
    }
  };
}

module.exports = { overview, consolidatedAssets, insights };
