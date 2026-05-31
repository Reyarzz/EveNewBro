// Personal career analytics + "where you die" heatmap.
//
// Stores small longitudinal snapshots (liquid ISK, total SP, kills, losses) to a
// local history file so we can draw trend sparklines over time, and aggregates
// the pilot's recent losses (zKillboard + ESI killmail detail) by system, ship
// type and hour-of-day. No data leaves the machine beyond the public zKill/ESI
// reads everything else in the app already does.

const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const cfg = require('../../config');
const auth = require('./auth');
const esi = require('./esi');

const SNAPSHOT_MIN_GAP = 6 * 60 * 60 * 1000; // don't record more than every 6h
const MAX_SNAPSHOTS = 400;

function histPath() {
  return path.join(app.getPath('userData'), 'career-history.json');
}

function readHistory() {
  try {
    const f = histPath();
    if (!fs.existsSync(f)) return [];
    const arr = JSON.parse(fs.readFileSync(f, 'utf8'));
    return Array.isArray(arr) ? arr : [];
  } catch (_e) {
    return [];
  }
}

function writeHistory(arr) {
  try {
    fs.writeFileSync(histPath(), JSON.stringify(arr.slice(-MAX_SNAPSHOTS)), 'utf8');
  } catch (_e) {
    /* ignore */
  }
}

async function authGet(pathname, token) {
  const res = await fetch(cfg.ESI_BASE + pathname, {
    headers: {
      Accept: 'application/json',
      'User-Agent': cfg.USER_AGENT,
      Authorization: `Bearer ${token}`
    }
  });
  if (!res.ok) throw new Error(`ESI ${pathname} -> ${res.status}`);
  return res.json();
}

async function zget(url) {
  const res = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': cfg.USER_AGENT }
  });
  if (!res.ok) throw new Error(`zKill ${res.status}`);
  return res.json();
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

// Current numbers for the logged-in pilot.
async function current() {
  const access = await auth.getValidAccess().catch(() => null);
  if (!access) return null;
  const id = access.characterId;
  const [wallet, skills, stats] = await Promise.all([
    authGet(`/characters/${id}/wallet/`, access.token).catch(() => null),
    authGet(`/characters/${id}/skills/`, access.token).catch(() => null),
    zget(`https://zkillboard.com/api/stats/characterID/${id}/`).catch(() => null)
  ]);
  return {
    characterId: id,
    wallet: typeof wallet === 'number' ? wallet : null,
    sp: skills && skills.total_sp ? skills.total_sp : null,
    kills: stats ? stats.shipsDestroyed || 0 : null,
    losses: stats ? stats.shipsLost || 0 : null,
    iskDestroyed: stats ? stats.iskDestroyed || 0 : null,
    iskLost: stats ? stats.iskLost || 0 : null
  };
}

// Record a snapshot if enough time has passed since the last one.
function maybeRecord(cur) {
  if (!cur) return readHistory();
  const hist = readHistory();
  const last = hist[hist.length - 1];
  if (last && Date.now() - last.ts < SNAPSHOT_MIN_GAP) return hist;
  hist.push({
    ts: Date.now(),
    wallet: cur.wallet,
    sp: cur.sp,
    kills: cur.kills,
    losses: cur.losses
  });
  writeHistory(hist);
  return hist;
}

async function fetchKillmail(killId, hash) {
  return zget(`${cfg.ESI_BASE}/killmails/${killId}/${hash}/`);
}

// Aggregate recent losses by system, ship type and hour-of-day (UTC).
async function lossHeatmap(characterId) {
  let list = [];
  try {
    list = await zget(`https://zkillboard.com/api/losses/characterID/${characterId}/`);
  } catch (_e) {
    list = [];
  }
  const recent = (Array.isArray(list) ? list : []).slice(0, 50);
  const details = await mapPool(recent, 6, async (k) => {
    const hash = k.zkb && k.zkb.hash;
    if (!hash) return null;
    const km = await fetchKillmail(k.killmail_id, hash).catch(() => null);
    if (!km) return null;
    return {
      time: km.killmail_time,
      systemId: km.solar_system_id,
      shipTypeId: km.victim && km.victim.ship_type_id,
      value: (k.zkb && k.zkb.totalValue) || 0
    };
  });
  const valid = details.filter(Boolean);

  const bySystem = {};
  const byShip = {};
  const byHour = new Array(24).fill(0);
  let totalValue = 0;
  valid.forEach((d) => {
    totalValue += d.value;
    if (d.systemId) bySystem[d.systemId] = (bySystem[d.systemId] || 0) + 1;
    if (d.shipTypeId) byShip[d.shipTypeId] = (byShip[d.shipTypeId] || 0) + 1;
    if (d.time) {
      const h = new Date(d.time).getUTCHours();
      if (h >= 0 && h < 24) byHour[h] += 1;
    }
  });

  // Resolve system + ship names for the top entries.
  const topSysIds = Object.keys(bySystem).map(Number);
  const topShipIds = Object.keys(byShip).map(Number);
  const names = await esi.resolveNames([...topSysIds, ...topShipIds]).catch(() => ({}));

  const topSystems = topSysIds
    .map((sid) => ({ id: sid, name: names[sid] || 'Sys ' + sid, count: bySystem[sid] }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
  const topShips = topShipIds
    .map((tid) => ({ id: tid, name: names[tid] || 'Ship ' + tid, count: byShip[tid] }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  return { sampled: valid.length, totalValue, topSystems, topShips, byHour };
}

// Everything the Me-tab analytics panel needs in one call.
async function analytics() {
  const cur = await current();
  if (!cur) return { loggedIn: false };
  const history = maybeRecord(cur);
  const heatmap = await lossHeatmap(cur.characterId).catch(() => null);
  return { loggedIn: true, current: cur, history, heatmap };
}

module.exports = { analytics };
