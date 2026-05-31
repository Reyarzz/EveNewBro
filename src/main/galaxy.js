// Galaxy / conflict-intel data.
//
// Static universe geometry (system coordinates, regions, NPC stations) comes
// from Fuzzwork's SDE CSV dump (downloaded + cached once). Live conflict data
// comes from public, key-free ESI endpoints and is refreshed on demand:
//   /universe/system_kills/   - ship/pod/npc kills per system, last hour (heatmap)
//   /universe/system_jumps/   - jumps per system, last hour (activity)
//   /sovereignty/campaigns/   - active null-sec sovereignty fights
//   /incursions/              - active Sansha incursions
//   /fw/systems/              - faction-warfare frontline ownership/contest
//   /wars/                    - declared corp/alliance wars

const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const cfg = require('../../config');

const DUMP_BASE = 'https://www.fuzzwork.co.uk/dump/latest/';
const SYSTEMS_TTL = 60 * 24 * 60 * 60 * 1000; // 60 days
const LIVE_TTL = 3 * 60 * 1000; // 3 minutes
// Bump when the cached systems payload shape changes (forces a one-time rebuild).
// v3 adds the stargate adjacency graph (for near-me radar BFS + danger sums).
const SYSTEMS_VERSION = 3;

const FACTION_NAMES = {
  500001: 'Caldari State',
  500002: 'Minmatar Republic',
  500003: 'Amarr Empire',
  500004: 'Gallente Federation',
  500005: 'Jove Empire',
  500010: 'CONCORD',
  500024: 'EDENCOM',
  500026: 'Triglavian Collective'
};

const SOV_EVENT = {
  tcu_defense: 'TCU defense',
  ihub_defense: 'IHUB defense',
  station_defense: 'Station defense',
  station_freeport: 'Freeport'
};

let buildingSystems = false;
let memSystems = null;
let liveCache = { fetchedAt: 0, data: null };

// ---------- HTTP ----------
async function esiGet(pathname) {
  const res = await fetch(cfg.ESI_BASE + pathname, {
    headers: { Accept: 'application/json', 'User-Agent': cfg.USER_AGENT }
  });
  if (!res.ok) throw new Error(`ESI GET ${pathname} -> ${res.status}`);
  return res.json();
}

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

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': cfg.USER_AGENT } });
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  return res.text();
}

// ---------- CSV ----------
// These SDE dumps have no embedded commas in the columns we read, so a simple
// split is safe and fast.
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

// ---------- static universe (cached) ----------
function systemsPath() {
  return path.join(app.getPath('userData'), 'galaxy-systems.json');
}

function readSystems() {
  if (memSystems) return memSystems;
  try {
    const f = systemsPath();
    if (!fs.existsSync(f)) return null;
    memSystems = JSON.parse(fs.readFileSync(f, 'utf8'));
    return memSystems;
  } catch (_e) {
    return null;
  }
}

function systemsFresh() {
  const s = readSystems();
  return !!(s && s.v === SYSTEMS_VERSION && s.builtAt && Date.now() - s.builtAt < SYSTEMS_TTL);
}

function systemsStatus() {
  const s = readSystems();
  return {
    // "ready" means usable without a rebuild: present AND current schema version.
    ready: !!(s && s.v === SYSTEMS_VERSION),
    building: buildingSystems,
    fresh: systemsFresh(),
    builtAt: s ? s.builtAt : 0,
    systemCount: s ? Object.keys(s.systems).length : 0,
    stationCount: s ? (s.stations ? s.stations.length : 0) : 0
  };
}

async function buildSystems() {
  if (buildingSystems) return readSystems();
  buildingSystems = true;
  try {
    const [sysText, regText, conText, staText, jumpText] = await Promise.all([
      fetchText(DUMP_BASE + 'mapSolarSystems.csv'),
      fetchText(DUMP_BASE + 'mapRegions.csv'),
      fetchText(DUMP_BASE + 'mapConstellations.csv').catch(() => ''),
      fetchText(DUMP_BASE + 'staStations.csv').catch(() => ''),
      fetchText(DUMP_BASE + 'mapSolarSystemJumps.csv').catch(() => '')
    ]);

    // Solar systems: keep only k-space (we have x/z for everything; wormhole
    // systems have coords too but no live kills/jumps — keep them, they're fine).
    const sc = parseCsv(sysText);
    const sId = sc.idx.solarSystemID;
    const sName = sc.idx.solarSystemName;
    const sX = sc.idx.x;
    const sZ = sc.idx.z;
    const sSec = sc.idx.security;
    const sRegion = sc.idx.regionID;
    const sConst = sc.idx.constellationID;
    const systems = {};
    sc.rows.forEach((r) => {
      const id = num(r[sId]);
      if (!id) return;
      systems[id] = {
        n: r[sName],
        x: num(r[sX]),
        z: num(r[sZ]),
        s: Math.round(num(r[sSec]) * 10) / 10,
        r: num(r[sRegion]),
        c: sConst != null ? num(r[sConst]) : 0
      };
    });

    const rc = parseCsv(regText);
    const regions = {};
    rc.rows.forEach((r) => {
      const id = num(r[rc.idx.regionID]);
      if (id) regions[id] = r[rc.idx.regionName];
    });

    const constellations = {};
    if (conText) {
      const cc = parseCsv(conText);
      cc.rows.forEach((r) => {
        const id = num(r[cc.idx.constellationID]);
        if (id) constellations[id] = r[cc.idx.constellationName];
      });
    }

    const stations = [];
    if (staText) {
      const tc = parseCsv(staText);
      const stId = tc.idx.stationID;
      const stName = tc.idx.stationName;
      const stSys = tc.idx.solarSystemID;
      tc.rows.forEach((r) => {
        const id = num(r[stId]);
        if (!id) return;
        stations.push({ id, n: r[stName], sys: num(r[stSys]) });
      });
    }

    // Stargate adjacency: { fromSystemId: [neighborSystemId, ...] }. Used for
    // BFS "within N jumps" radar and route-danger sums.
    const adj = {};
    if (jumpText) {
      const jc = parseCsv(jumpText);
      const jFrom = jc.idx.fromSolarSystemID;
      const jTo = jc.idx.toSolarSystemID;
      jc.rows.forEach((r) => {
        const a = num(r[jFrom]);
        const b = num(r[jTo]);
        if (!a || !b) return;
        (adj[a] || (adj[a] = [])).push(b);
      });
    }

    const payload = { v: SYSTEMS_VERSION, builtAt: Date.now(), systems, regions, constellations, stations, adj };
    memSystems = payload;
    try {
      fs.writeFileSync(systemsPath(), JSON.stringify(payload), 'utf8');
    } catch (_e) {}
    return payload;
  } finally {
    buildingSystems = false;
  }
}

function getSystems() {
  return readSystems();
}

// Stargate adjacency graph (or {} if not built yet). Read-only.
function getAdjacency() {
  const s = readSystems();
  return (s && s.adj) || {};
}

// ---------- live conflict ----------
async function resolveNames(ids) {
  const unique = [...new Set(ids.filter(Boolean))];
  const names = {};
  for (let i = 0; i < unique.length; i += 1000) {
    try {
      const list = await esiPost('/universe/names/', unique.slice(i, i + 1000));
      list.forEach((e) => {
        if (e && e.id) names[e.id] = e.name;
      });
    } catch (_e) {
      /* ignore */
    }
  }
  return names;
}

async function activeWars() {
  let ids = [];
  try {
    ids = await esiGet('/wars/');
  } catch (_e) {
    return { activeCount: 0, sample: [] };
  }
  const sampleIds = ids.slice(0, 60);
  const details = await Promise.all(
    sampleIds.map((id) => esiGet(`/wars/${id}`).catch(() => null))
  );
  const active = details.filter((w) => w && !w.finished);
  const partyIds = [];
  active.forEach((w) => {
    const a = (w.aggressor && (w.aggressor.alliance_id || w.aggressor.corporation_id)) || null;
    const d = (w.defender && (w.defender.alliance_id || w.defender.corporation_id)) || null;
    if (a) partyIds.push(a);
    if (d) partyIds.push(d);
  });
  const names = await resolveNames(partyIds);
  const sample = active.slice(0, 20).map((w) => {
    const a = (w.aggressor && (w.aggressor.alliance_id || w.aggressor.corporation_id)) || null;
    const d = (w.defender && (w.defender.alliance_id || w.defender.corporation_id)) || null;
    return {
      id: w.id,
      aggressor: names[a] || 'Unknown',
      defender: names[d] || 'Unknown',
      started: w.started,
      mutual: !!w.mutual,
      openForAllies: !!w.open_for_allies
    };
  });
  return { activeCount: active.length, sampled: sampleIds.length, sample };
}

async function getLive(force) {
  if (!force && liveCache.data && Date.now() - liveCache.fetchedAt < LIVE_TTL) {
    return liveCache.data;
  }

  const [kills, jumps, campaignsRaw, incursionsRaw, fwRaw, wars] = await Promise.all([
    esiGet('/universe/system_kills/').catch(() => []),
    esiGet('/universe/system_jumps/').catch(() => []),
    esiGet('/sovereignty/campaigns/').catch(() => []),
    esiGet('/incursions/').catch(() => []),
    esiGet('/fw/systems/').catch(() => []),
    activeWars().catch(() => ({ activeCount: 0, sample: [] }))
  ]);

  // Resolve sovereignty defender names.
  const defenderIds = campaignsRaw.map((c) => c.defender_id).filter(Boolean);
  const names = await resolveNames(defenderIds);

  const campaigns = campaignsRaw.map((c) => ({
    systemId: c.solar_system_id,
    constellationId: c.constellation_id,
    type: SOV_EVENT[c.event_type] || c.event_type,
    defender: names[c.defender_id] || FACTION_NAMES[c.defender_id] || 'Contested',
    defenderScore: c.defender_score,
    attackersScore: c.attackers_score,
    startTime: c.start_time
  }));

  const incursions = incursionsRaw.map((i) => ({
    stagingSystemId: i.staging_solar_system_id,
    infested: Array.isArray(i.infested_solar_systems) ? i.infested_solar_systems : [],
    infestedCount: Array.isArray(i.infested_solar_systems) ? i.infested_solar_systems.length : 0,
    influence: i.influence,
    state: i.state,
    hasBoss: !!i.has_boss
  }));

  // Only frontline-relevant FW systems (being fought over).
  const fw = fwRaw
    .filter((s) => s.contested && s.contested !== 'uncontested')
    .map((s) => ({
      systemId: s.solar_system_id,
      owner: FACTION_NAMES[s.owner_faction_id] || 'Unknown',
      occupier: FACTION_NAMES[s.occupier_faction_id] || 'Unknown',
      contested: s.contested,
      vp: s.victory_points,
      vpThreshold: s.victory_points_threshold
    }));

  const data = {
    fetchedAt: Date.now(),
    kills, // [{system_id, ship_kills, pod_kills, npc_kills}]
    jumps, // [{system_id, ship_jumps}]
    campaigns,
    incursions,
    fw,
    wars
  };
  liveCache = { fetchedAt: Date.now(), data };
  return data;
}

// ---------- route planner ----------
// ESI computes the jump path; flag picks shortest / prefer-high-sec / prefer-low-sec.
async function route(originId, destId, flag) {
  const f = ['shortest', 'secure', 'insecure'].includes(flag) ? flag : 'shortest';
  try {
    const ids = await esiGet(`/route/${originId}/${destId}/?flag=${f}`);
    return Array.isArray(ids) ? ids : [];
  } catch (_e) {
    return [];
  }
}

module.exports = {
  buildSystems,
  getSystems,
  getAdjacency,
  systemsStatus,
  getLive,
  route
};
