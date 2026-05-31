// New Eden unified search — characters, corps, alliances, systems, regions, items.
// Does not rely on deprecated GET /search/ (often 404). Uses universe/ids, local map
// index, market catalog, and known hub fallbacks.

const cfg = require('../../config');
const esi = require('./esi');
const galaxy = require('./galaxy');

const DEFAULT_CATEGORIES = [
  'character',
  'corporation',
  'alliance',
  'faction',
  'solar_system',
  'region',
  'constellation',
  'inventory_type'
];

const LABELS = {
  character: 'Characters',
  corporation: 'Corporations',
  alliance: 'Alliances',
  faction: 'Factions',
  solar_system: 'Systems',
  region: 'Regions',
  constellation: 'Constellations',
  inventory_type: 'Items',
  structure: 'Structures',
  station: 'Stations',
  agent: 'Agents'
};

// Trade hubs + common search targets (id = solar system id).
const KNOWN_SYSTEMS = [
  { id: 30000142, name: 'Jita' },
  { id: 30002187, name: 'Amarr' },
  { id: 30002659, name: 'Dodixie' },
  { id: 30002510, name: 'Rens' },
  { id: 30002053, name: 'Hek' },
  { id: 30000144, name: 'Perimeter' },
  { id: 30000145, name: 'New Caldari' },
  { id: 30002067, name: 'Osmon' },
  { id: 30002780, name: 'Sobaseki' },
  { id: 30002795, name: 'Maurasi' }
];

const ID_MAP = [
  ['character', 'characters'],
  ['corporation', 'corporations'],
  ['alliance', 'alliances'],
  ['faction', 'factions'],
  ['inventory_type', 'inventory_types'],
  ['solar_system', 'solar_systems'],
  ['region', 'regions'],
  ['constellation', 'constellations'],
  ['station', 'stations'],
  ['agent', 'agents']
];

const ID_POST_PATHS = [
  cfg.ESI_BASE + '/universe/ids/?language=en',
  'https://esi.evetech.net/latest/universe/ids/?language=en',
  'https://esi.evetech.net/universe/ids/?language=en'
];

let mapBuildPromise = null;

function wantSet(categories) {
  return new Set(categories && categories.length ? categories : DEFAULT_CATEGORIES);
}

function addHit(bucket, cat, id, name) {
  if (!id || !name) return;
  if (!bucket[cat]) bucket[cat] = new Map();
  bucket[cat].set(Number(id), String(name));
}

function bucketToGroups(bucket, want) {
  const groups = [];
  for (const cat of want) {
    const map = bucket[cat];
    if (!map || map.size === 0) continue;
    const results = [...map.entries()]
      .map(([id, name]) => ({ id, name }))
      .slice(0, 25);
    groups.push({
      category: cat,
      label: LABELS[cat] || cat,
      results
    });
  }
  return groups;
}

async function postIds(names) {
  const body = JSON.stringify(names);
  for (const url of ID_POST_PATHS) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': cfg.USER_AGENT
        },
        body
      });
      if (!res.ok) continue;
      return await res.json();
    } catch (_e) {
      /* try next URL */
    }
  }
  return null;
}

async function ensureMapData() {
  let data = galaxy.getSystems();
  if (data && data.systems && Object.keys(data.systems).length > 1000) {
    return data;
  }
  if (!mapBuildPromise) {
    mapBuildPromise = galaxy.buildSystems().finally(() => {
      mapBuildPromise = null;
    });
  }
  try {
    await mapBuildPromise;
  } catch (_e) {
    /* still use hubs + ESI */
  }
  return galaxy.getSystems();
}

function mergeKnownSystems(bucket, q, want) {
  if (!want.has('solar_system')) return;
  const ql = q.toLowerCase();
  KNOWN_SYSTEMS.forEach((s) => {
    if (s.name.toLowerCase().includes(ql) || ql.includes(s.name.toLowerCase())) {
      addHit(bucket, 'solar_system', s.id, s.name);
    }
  });
}

async function mergeExactIds(bucket, q, want) {
  const data = await postIds([q]);
  if (!data) return;
  ID_MAP.forEach(([cat, key]) => {
    if (!want.has(cat)) return;
    const list = data[key];
    if (!Array.isArray(list)) return;
    list.forEach((hit) => {
      if (hit && hit.id) addHit(bucket, cat, hit.id, hit.name || `ID ${hit.id}`);
    });
  });
  // "Jita" often resolves to stations first — ensure the Jita system is listed too.
  if (want.has('solar_system') && q.toLowerCase() === 'jita') {
    addHit(bucket, 'solar_system', 30000142, 'Jita');
  }
}

function mergeMapIndex(bucket, q, want, data) {
  if (!data) return;
  const query = q.toLowerCase();
  const limit = 25;

  if (want.has('solar_system') && data.systems) {
    let n = 0;
    for (const [id, s] of Object.entries(data.systems)) {
      if (!s || !s.n || !s.n.toLowerCase().includes(query)) continue;
      addHit(bucket, 'solar_system', id, s.n);
      if (++n >= limit) break;
    }
  }

  if (want.has('region') && data.regions) {
    let n = 0;
    for (const [id, name] of Object.entries(data.regions)) {
      if (!name || !name.toLowerCase().includes(query)) continue;
      addHit(bucket, 'region', id, name);
      if (++n >= limit) break;
    }
  }

  if (want.has('constellation') && data.constellations) {
    let n = 0;
    for (const [id, name] of Object.entries(data.constellations)) {
      if (!name || !name.toLowerCase().includes(query)) continue;
      addHit(bucket, 'constellation', id, name);
      if (++n >= limit) break;
    }
  }
}

async function mergeMarketItems(bucket, q, want) {
  if (!want.has('inventory_type')) return;
  try {
    const market = require('./market');
    const items = await market.searchItems(q, 25);
    items.forEach((it) => addHit(bucket, 'inventory_type', it.id, it.name));
  } catch (_e) {
    /* catalog may still be building */
  }
}

function wantsLocation(want) {
  return want.has('solar_system') || want.has('region') || want.has('constellation');
}

async function search(query, categories) {
  const q = String(query || '').trim();
  if (!q) return { query: '', groups: [] };

  try {
    const want = wantSet(categories);
    const bucket = {};

    mergeKnownSystems(bucket, q, want);

    await Promise.all([
      mergeExactIds(bucket, q, want),
      mergeMarketItems(bucket, q, want)
    ]);

    if (wantsLocation(want)) {
      const data = await ensureMapData();
      mergeMapIndex(bucket, q, want, data);
    }

    const groups = bucketToGroups(bucket, want);
    return { query: q, groups };
  } catch (err) {
    return {
      query: q,
      groups: [],
      error: err.message || String(err)
    };
  }
}

module.exports = { search, DEFAULT_CATEGORIES, LABELS };
