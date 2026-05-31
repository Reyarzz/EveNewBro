// Personal (logged-in) data: where your stuff is, jump clones + implants, and
// recent losses/kills.
//
//   /characters/{id}/assets/   - all owned items (paginated)  [esi-assets]
//   /characters/{id}/clones/   - home + jump clones           [esi-clones]
//   /characters/{id}/implants/ - active implants              [esi-clones]
// Losses/kills come from zKillboard (public) + ESI killmail detail, so they need
// no extra scope beyond knowing the character id.

const cfg = require('../../config');
const auth = require('./auth');
const esi = require('./esi');

async function authGet(pathname, token, page) {
  const url = cfg.ESI_BASE + pathname + (page ? `?page=${page}` : '');
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

// ---------- assets: "where is my stuff" ----------
async function assets() {
  const access = await auth.getValidAccess().catch(() => null);
  if (!access) return { loggedIn: false };
  const id = access.characterId;

  let all = [];
  try {
    const first = await authGet(`/characters/${id}/assets/`, access.token, 1);
    all = first.data;
    const pages = Math.min(first.pages, 10); // cap to keep it snappy
    if (pages > 1) {
      const rest = await mapPool(
        Array.from({ length: pages - 1 }, (_, i) => i + 2),
        4,
        (p) => authGet(`/characters/${id}/assets/`, access.token, p).then((r) => r.data)
      );
      rest.forEach((d) => {
        if (Array.isArray(d)) all = all.concat(d);
      });
    }
  } catch (e) {
    return { loggedIn: true, error: e.message || String(e) };
  }

  // Group by TOP-LEVEL location only: an asset whose location_id is itself
  // another asset's item_id is nested inside a container/ship, so we skip it.
  const itemIds = new Set(all.map((a) => a.item_id));
  const byLoc = {};
  all.forEach((a) => {
    if (itemIds.has(a.location_id)) return; // nested — its root is counted elsewhere
    const loc = a.location_id;
    if (!byLoc[loc]) byLoc[loc] = { id: loc, items: 0, qty: 0 };
    byLoc[loc].items += 1;
    byLoc[loc].qty += a.quantity || 1;
  });

  const locations = Object.values(byLoc).sort((a, b) => b.items - a.items).slice(0, 20);
  const stationIds = locations.map((l) => l.id).filter((x) => x < 1e11);
  const names = await esi.resolveNames(stationIds).catch(() => ({}));
  locations.forEach((l) => {
    l.name = names[l.id] || (l.id > 1e12 ? 'Citadel / structure' : `Location ${l.id}`);
  });

  return { loggedIn: true, totalItems: all.length, locations };
}

// ---------- jump clones + implants ----------
async function clones() {
  const access = await auth.getValidAccess().catch(() => null);
  if (!access) return { loggedIn: false };
  const id = access.characterId;

  let clonesData = null;
  let implantsData = [];
  try {
    const [c, im] = await Promise.all([
      authGet(`/characters/${id}/clones/`, access.token).then((r) => r.data),
      authGet(`/characters/${id}/implants/`, access.token).then((r) => r.data).catch(() => [])
    ]);
    clonesData = c;
    implantsData = Array.isArray(im) ? im : [];
  } catch (e) {
    return { loggedIn: true, error: e.message || String(e) };
  }

  const jumpClones = Array.isArray(clonesData.jump_clones) ? clonesData.jump_clones : [];
  const home = clonesData.home_location || {};

  // Resolve every implant type + clone/home location at once.
  const ids = new Set();
  implantsData.forEach((t) => ids.add(t));
  jumpClones.forEach((jc) => {
    (jc.implants || []).forEach((t) => ids.add(t));
    if (jc.location_id && jc.location_id < 1e11) ids.add(jc.location_id);
  });
  if (home.location_id && home.location_id < 1e11) ids.add(home.location_id);
  const names = await esi.resolveNames([...ids]).catch(() => ({}));
  const nm = (x, fallback) => names[x] || fallback;

  return {
    loggedIn: true,
    home: home.location_id ? nm(home.location_id, 'Citadel / structure') : null,
    active: implantsData.map((t) => nm(t, `Implant ${t}`)),
    clones: jumpClones.map((jc) => ({
      location: jc.location_id < 1e11 ? nm(jc.location_id, `Location ${jc.location_id}`) : 'Citadel / structure',
      implants: (jc.implants || []).map((t) => nm(t, `Implant ${t}`))
    }))
  };
}

// ---------- recent losses (zKillboard + ESI killmail detail) ----------
async function zget(url) {
  const res = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': cfg.USER_AGENT }
  });
  if (!res.ok) throw new Error(`zKill ${res.status}`);
  return res.json();
}

async function losses() {
  const access = await auth.getValidAccess().catch(() => null);
  if (!access) return { loggedIn: false };
  const id = access.characterId;

  let list = [];
  let stats = null;
  try {
    [list, stats] = await Promise.all([
      zget(`https://zkillboard.com/api/losses/characterID/${id}/`).catch(() => []),
      zget(`https://zkillboard.com/api/stats/characterID/${id}/`).catch(() => null)
    ]);
  } catch (_e) {
    /* ignore */
  }

  const recent = (Array.isArray(list) ? list : []).slice(0, 12);
  const details = await mapPool(recent, 5, async (k) => {
    const hash = k.zkb && k.zkb.hash;
    if (!hash) return null;
    const km = await fetchKillmail(k.killmail_id, hash).catch(() => null);
    if (!km) return null;
    return {
      id: k.killmail_id,
      time: km.killmail_time,
      shipTypeId: km.victim && km.victim.ship_type_id,
      systemId: km.solar_system_id,
      value: (k.zkb && k.zkb.totalValue) || 0,
      url: `https://zkillboard.com/kill/${k.killmail_id}/`
    };
  });

  const valid = details.filter(Boolean);
  const nameIds = [];
  valid.forEach((d) => {
    if (d.shipTypeId) nameIds.push(d.shipTypeId);
    if (d.systemId) nameIds.push(d.systemId);
  });
  const names = await esi.resolveNames(nameIds).catch(() => ({}));
  valid.forEach((d) => {
    d.ship = names[d.shipTypeId] || 'Ship';
    d.system = names[d.systemId] || 'Unknown';
  });

  let efficiency = null;
  if (stats) {
    const dest = stats.iskDestroyed || 0;
    const lost = stats.iskLost || 0;
    if (dest + lost > 0) efficiency = (dest / (dest + lost)) * 100;
  }

  return {
    loggedIn: true,
    efficiency,
    shipsDestroyed: stats ? stats.shipsDestroyed || 0 : null,
    shipsLost: stats ? stats.shipsLost || 0 : null,
    losses: valid
  };
}

async function fetchKillmail(killId, hash) {
  const res = await fetch(`${cfg.ESI_BASE}/killmails/${killId}/${hash}/`, {
    headers: { Accept: 'application/json', 'User-Agent': cfg.USER_AGENT }
  });
  if (!res.ok) throw new Error(`killmail ${res.status}`);
  return res.json();
}

module.exports = { assets, clones, losses };
