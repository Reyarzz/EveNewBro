// New Eden unified search — characters, corps, alliances, systems, regions, items.

const cfg = require('../../config');
const esi = require('./esi');

const DEFAULT_CATEGORIES = [
  'character',
  'corporation',
  'alliance',
  'faction',
  'solar_system',
  'region',
  'constellation',
  'inventory_type',
  'structure'
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
  agent: 'Agents'
};

async function search(query, categories) {
  const q = String(query || '').trim();
  if (!q) return { query: '', groups: [] };

  const cats = (categories && categories.length ? categories : DEFAULT_CATEGORIES).join(',');

  const res = await fetch(
    cfg.ESI_BASE +
      `/search/?search=${encodeURIComponent(q)}&categories=${cats}&strict=false`,
    {
      headers: { Accept: 'application/json', 'User-Agent': cfg.USER_AGENT }
    }
  );
  if (!res.ok) throw new Error(`Search failed (${res.status}).`);

  const data = await res.json();
  const groups = [];

  for (const cat of Object.keys(data)) {
    const ids = data[cat];
    if (!Array.isArray(ids) || ids.length === 0) continue;
    const slice = ids.slice(0, 25);
    const names = await esi.resolveNames(slice).catch(() => ({}));
    groups.push({
      category: cat,
      label: LABELS[cat] || cat,
      results: slice.map((id) => ({ id, name: names[id] || `ID ${id}` }))
    });
  }

  // Exact name resolution for items/entities not in fuzzy search.
  if (groups.length === 0) {
    try {
      const exact = await fetch(cfg.ESI_BASE + '/universe/ids/?language=en', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': cfg.USER_AGENT
        },
        body: JSON.stringify([q])
      });
      if (exact.ok) {
        const ids = await exact.json();
        [
          ['character', ids.characters],
          ['corporation', ids.corporations],
          ['alliance', ids.alliances],
          ['inventory_type', ids.inventory_types]
        ].forEach(([cat, list]) => {
          if (list && list[0]) {
            groups.push({
              category: cat,
              label: LABELS[cat] || cat,
              results: [{ id: list[0].id, name: list[0].name }]
            });
          }
        });
      }
    } catch (_e) {
      /* ignore */
    }
  }

  return { query: q, groups };
}

module.exports = { search, DEFAULT_CATEGORIES, LABELS };
