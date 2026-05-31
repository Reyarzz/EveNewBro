// Threat radar + battle/gatecamp detector + ratting finder + route-danger.
//
// Combines three live, key-free (mostly) data sources that no single tool mixes:
//   - galaxy.getLive()  : per-system ship/pod/npc kills + jumps (last hour)
//   - zkill.recent()    : the rolling live killmail buffer (last few minutes)
//   - galaxy adjacency  : stargate graph for "within N jumps" BFS + route sums
// Plus the logged-in pilot's current system (/characters/{id}/location/, which
// only needs the esi-location.read_location.v1 scope we already request).

const cfg = require('../../config');
const auth = require('./auth');
const esi = require('./esi');
const galaxy = require('./galaxy');
const zkill = require('./zkill');

// The five NPC trade hubs, with their solar-system ids (for route danger).
const HUB_SYSTEMS = [
  { key: 'jita', name: 'Jita', systemId: 30000142 },
  { key: 'amarr', name: 'Amarr', systemId: 30002187 },
  { key: 'dodixie', name: 'Dodixie', systemId: 30002659 },
  { key: 'rens', name: 'Rens', systemId: 30002510 },
  { key: 'hek', name: 'Hek', systemId: 30002053 }
];

// A live zKill is "recent" for clustering if it landed in this window.
const BATTLE_WINDOW_MS = 15 * 60 * 1000;
// How many kills in the buffer for one system mark an active battle.
const BATTLE_MIN_KILLS = 3;

let hubCache = {}; // flag -> { at, data }

// ---------- live indexes ----------
function killIndex(live) {
  const bySys = {};
  (live.kills || []).forEach((k) => {
    bySys[k.system_id] = {
      ship: k.ship_kills || 0,
      pod: k.pod_kills || 0,
      npc: k.npc_kills || 0
    };
  });
  return bySys;
}

// Cluster the live zKill buffer by system within the recent window.
function clusterRecent(recentKills) {
  const now = Date.now();
  const bySys = {};
  (recentKills || []).forEach((k) => {
    const t = k.time ? new Date(k.time).getTime() : now;
    if (now - t > BATTLE_WINDOW_MS) return;
    const e = bySys[k.systemId] || (bySys[k.systemId] = { count: 0, value: 0, last: 0, names: {} });
    e.count += 1;
    e.value += k.value || 0;
    if (t > e.last) e.last = t;
    if (k.shipName) e.names[k.shipName] = (e.names[k.shipName] || 0) + 1;
  });
  return bySys;
}

// Heuristic danger classification for one system from the two feeds.
function classify(killRow, clusterRow) {
  const flags = [];
  const ship = killRow ? killRow.ship : 0;
  const pod = killRow ? killRow.pod : 0;
  const npc = killRow ? killRow.npc : 0;
  const live = clusterRow ? clusterRow.count : 0;
  // Active battle: several fresh zKills clustered in the same system.
  if (live >= BATTLE_MIN_KILLS) flags.push('battle');
  // Gatecamp signature: sustained ship kills paired with pod kills, little ratting.
  if (ship >= 5 && pod >= 2 && npc < ship * 4) flags.push('camp');
  // Generally hot: meaningful PvP this hour.
  if (ship + pod >= 5 && !flags.includes('battle')) flags.push('hot');
  let level = 0;
  if (flags.includes('battle') || flags.includes('camp')) level = 2;
  else if (flags.length) level = 1;
  return { flags, level, ship, pod, npc, live };
}

// ---------- near-me radar ----------
function bfsWithin(adj, originId, maxJumps) {
  const dist = { [originId]: 0 };
  let frontier = [originId];
  for (let d = 1; d <= maxJumps; d++) {
    const next = [];
    frontier.forEach((id) => {
      (adj[id] || []).forEach((nb) => {
        if (dist[nb] === undefined) {
          dist[nb] = d;
          next.push(nb);
        }
      });
    });
    frontier = next;
    if (!frontier.length) break;
  }
  return dist; // { systemId: jumpsFromOrigin }
}

async function playerLocation() {
  const access = await auth.getValidAccess().catch(() => null);
  if (!access) return null;
  const res = await fetch(`${cfg.ESI_BASE}/characters/${access.characterId}/location/`, {
    headers: {
      Accept: 'application/json',
      'User-Agent': cfg.USER_AGENT,
      Authorization: `Bearer ${access.token}`
    }
  }).catch(() => null);
  if (!res || !res.ok) return null;
  const data = await res.json().catch(() => null);
  return (data && data.solar_system_id) || null;
}

// Main radar payload. `range` = jumps to scan around the pilot.
async function radar(range) {
  const maxJumps = Math.max(1, Math.min(10, Number(range) || 5));
  const systems = galaxy.getSystems();
  const adj = galaxy.getAdjacency();
  if (!systems) return { ready: false };

  const [live, recentResp] = await Promise.all([
    galaxy.getLive().catch(() => ({ kills: [] })),
    Promise.resolve(zkill.recent(80))
  ]);
  const recentKills = (recentResp && recentResp.kills) || [];
  const killBySys = killIndex(live);
  const cluster = clusterRecent(recentKills);

  // Cluster-wide "battles happening now" feed (works with or without login).
  const battles = Object.keys(cluster)
    .map((sid) => {
      const id = Number(sid);
      const c = cluster[id];
      const s = systems.systems[id];
      const topShips = Object.entries(c.names)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map((e) => e[0]);
      return {
        id,
        name: s ? s.n : 'Sys ' + id,
        region: s ? systems.regions[s.r] || '' : '',
        sec: s ? s.s : 0,
        kills: c.count,
        value: c.value,
        last: c.last,
        topShips,
        camp: !!(killBySys[id] && killBySys[id].ship >= 5 && killBySys[id].pod >= 2)
      };
    })
    .filter((b) => b.kills >= 2)
    .sort((a, b) => b.kills - a.kills || b.last - a.last)
    .slice(0, 12);

  // Pilot-centric radar (only if logged in + located in k-space we know).
  let location = null;
  let nearby = [];
  const sysId = await playerLocation().catch(() => null);
  if (sysId && systems.systems[sysId]) {
    const ls = systems.systems[sysId];
    location = { id: sysId, name: ls.n, sec: ls.s, region: systems.regions[ls.r] || '' };
    const dist = bfsWithin(adj, sysId, maxJumps);
    nearby = Object.keys(dist)
      .map((sid) => {
        const id = Number(sid);
        const cl = classify(killBySys[id], cluster[id]);
        return { id, jumps: dist[id], ...cl };
      })
      .filter((n) => n.level > 0 || n.ship + n.pod > 0)
      .map((n) => {
        const s = systems.systems[n.id];
        return {
          ...n,
          name: s ? s.n : 'Sys ' + n.id,
          region: s ? systems.regions[s.r] || '' : '',
          sec: s ? s.s : 0
        };
      })
      .sort((a, b) => b.level - a.level || a.jumps - b.jumps || b.ship + b.pod - (a.ship + a.pod))
      .slice(0, 25);
  }

  return {
    ready: true,
    loggedIn: !!sysId,
    range: maxJumps,
    fetchedAt: Date.now(),
    location,
    nearby,
    battles
  };
}

// ---------- ratting finder ----------
// Rank low/null systems that are ratting-hot (high npc kills) but quiet on PvP
// (low ship kills) right now — active ISK, few hunters. Sov holder resolved for
// the systems we actually show.
async function ratting(limit) {
  const cap = Math.max(5, Math.min(40, Number(limit) || 20));
  const systems = galaxy.getSystems();
  if (!systems) return { ready: false, rows: [] };
  const live = await galaxy.getLive().catch(() => ({ kills: [] }));
  const sov = await sovMap().catch(() => ({}));

  const rows = (live.kills || [])
    .map((k) => {
      const s = systems.systems[k.system_id];
      if (!s) return null;
      if (s.s > 0.45) return null; // low/null only
      const npc = k.npc_kills || 0;
      const ship = (k.ship_kills || 0) + (k.pod_kills || 0);
      if (npc < 8) return null; // needs meaningful ratting
      // Safer + more lucrative = lots of rats, few player kills.
      const score = npc / (1 + ship * 6);
      return {
        id: k.system_id,
        name: s.n,
        region: systems.regions[s.r] || '',
        sec: s.s,
        npc,
        ship,
        score,
        sovId: sov[k.system_id] || null
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .slice(0, cap);

  // Resolve sov holder (alliance/faction) names for the shown systems.
  const sovIds = [...new Set(rows.map((r) => r.sovId).filter(Boolean))];
  const names = sovIds.length ? await esi.resolveNames(sovIds).catch(() => ({})) : {};
  rows.forEach((r) => {
    r.sov = r.sovId ? names[r.sovId] || 'Sovereign' : 'NPC / unclaimed';
  });

  return { ready: true, fetchedAt: Date.now(), rows };
}

// Sovereignty map: system_id -> alliance/faction id (cached ~30 min).
let sovCache = { at: 0, data: null };
async function sovMap() {
  if (sovCache.data && Date.now() - sovCache.at < 30 * 60 * 1000) return sovCache.data;
  const res = await fetch(cfg.ESI_BASE + '/sovereignty/map/', {
    headers: { Accept: 'application/json', 'User-Agent': cfg.USER_AGENT }
  });
  if (!res.ok) throw new Error(`sov map ${res.status}`);
  const arr = await res.json();
  const out = {};
  (Array.isArray(arr) ? arr : []).forEach((e) => {
    const id = e.alliance_id || e.faction_id || e.corporation_id;
    if (id) out[e.system_id] = id;
  });
  sovCache = { at: Date.now(), data: out };
  return out;
}

// ---------- route danger between every hub pair (for risk-adjusted trades) ----------
function dangerForRoute(ids, systems, killBySys) {
  let hi = 0;
  let lo = 0;
  let ns = 0;
  let kills = 0;
  let camp = false;
  ids.forEach((id, i) => {
    const s = systems.systems[id];
    if (!s) return;
    if (s.s >= 0.5) hi++;
    else if (s.s > 0) lo++;
    else ns++;
    const kr = killBySys[id];
    if (kr) {
      kills += kr.ship + kr.pod;
      // A camp on an intermediate system is the scariest case.
      if (i > 0 && i < ids.length - 1 && kr.ship >= 5 && kr.pod >= 2) camp = true;
    }
  });
  const jumps = Math.max(0, ids.length - 1);
  // Penalty 0..~0.9: low-sec/null jumps and total kills and any camp all add up.
  let penalty = (lo * 0.04 + ns * 0.06) + Math.min(0.35, kills / 200);
  if (camp) penalty += 0.25;
  penalty = Math.max(0, Math.min(0.9, penalty));
  let risk = 'low';
  if (penalty >= 0.45 || camp) risk = 'high';
  else if (penalty >= 0.15) risk = 'med';
  return { jumps, hi, lo, ns, kills, camp, penalty, risk };
}

async function hubDanger(flag) {
  const f = ['shortest', 'secure', 'insecure'].includes(flag) ? flag : 'shortest';
  if (hubCache[f] && Date.now() - hubCache[f].at < 5 * 60 * 1000) return hubCache[f].data;
  const systems = galaxy.getSystems();
  if (!systems) return {};
  const live = await galaxy.getLive().catch(() => ({ kills: [] }));
  const killBySys = killIndex(live);

  const out = {};
  // 20 ordered pairs among the 5 hubs.
  const pairs = [];
  HUB_SYSTEMS.forEach((a) => {
    HUB_SYSTEMS.forEach((b) => {
      if (a.key !== b.key) pairs.push([a, b]);
    });
  });
  // Bounded concurrency.
  let next = 0;
  const worker = async () => {
    while (next < pairs.length) {
      const [a, b] = pairs[next++];
      try {
        const ids = await galaxy.route(a.systemId, b.systemId, f);
        out[`${a.name}\u2192${b.name}`] = dangerForRoute(ids || [], systems, killBySys);
      } catch (_e) {
        /* skip pair */
      }
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  hubCache[f] = { at: Date.now(), data: out };
  return out;
}

module.exports = { radar, ratting, hubDanger };
