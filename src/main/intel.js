// Character / corporation / alliance intel lookup.
//
// Resolves a name to an entity via ESI, then combines public ESI info with
// zKillboard's aggregate combat stats (kills/losses/danger/gang/top lists).
// All public; no auth.

const cfg = require('../../config');
const esi = require('./esi');

const ZKILL_STATS = 'https://zkillboard.com/api/stats';

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

async function zkillStats(kind, id) {
  // kind: characterID | corporationID | allianceID
  try {
    const res = await fetch(`${ZKILL_STATS}/${kind}/${id}/`, {
      headers: { Accept: 'application/json', 'User-Agent': cfg.USER_AGENT }
    });
    if (!res.ok) return null;
    return res.json();
  } catch (_e) {
    return null;
  }
}

function pickEntity(idsResp) {
  if (!idsResp) return null;
  if (idsResp.characters && idsResp.characters[0])
    return { type: 'character', ...idsResp.characters[0] };
  if (idsResp.corporations && idsResp.corporations[0])
    return { type: 'corporation', ...idsResp.corporations[0] };
  if (idsResp.alliances && idsResp.alliances[0])
    return { type: 'alliance', ...idsResp.alliances[0] };
  return null;
}

// Pull the top entry of a given type out of zKill's topLists, with a name.
function topOf(stats, type, nameField) {
  if (!stats || !Array.isArray(stats.topLists)) return null;
  const list = stats.topLists.find((l) => l.type === type);
  if (!list || !list.values || !list.values[0]) return null;
  const v = list.values[0];
  return { name: v[nameField] || v.characterName || v.name || null, kills: v.kills || 0 };
}

function summarizeStats(stats) {
  if (!stats) return null;
  return {
    shipsDestroyed: stats.shipsDestroyed || 0,
    shipsLost: stats.shipsLost || 0,
    soloKills: stats.soloKills || 0,
    soloLosses: stats.soloLosses || 0,
    iskDestroyed: stats.iskDestroyed || 0,
    iskLost: stats.iskLost || 0,
    dangerRatio: stats.dangerRatio != null ? stats.dangerRatio : null,
    gangRatio: stats.gangRatio != null ? stats.gangRatio : null,
    activeKills: stats.activepvp && stats.activepvp.kills ? stats.activepvp.kills.count : null,
    topShip: topOf(stats, 'shipType', 'shipName'),
    topSystem: topOf(stats, 'solarSystem', 'solarSystemName'),
    topRegion: topOf(stats, 'region', 'regionName')
  };
}

async function lookup(name) {
  const cleaned = String(name || '').trim();
  if (!cleaned) throw new Error('Type a character, corporation or alliance name.');
  const ids = await esiPost('/universe/ids/?language=en', [cleaned]);
  const entity = pickEntity(ids);
  if (!entity) throw new Error(`No character, corp or alliance called "${cleaned}".`);

  const out = {
    type: entity.type,
    id: entity.id,
    name: entity.name,
    portrait: null,
    info: {},
    stats: null
  };

  if (entity.type === 'character') {
    const ch = await esiGet(`/characters/${entity.id}/`).catch(() => ({}));
    const extraIds = [ch.corporation_id, ch.alliance_id].filter(Boolean);
    const nameMap = await esi.resolveNames(extraIds).catch(() => ({}));
    out.portrait = `https://images.evetech.net/characters/${entity.id}/portrait?size=128`;
    out.info = {
      corporation: ch.corporation_id ? nameMap[ch.corporation_id] : null,
      corporationId: ch.corporation_id || null,
      alliance: ch.alliance_id ? nameMap[ch.alliance_id] : null,
      allianceId: ch.alliance_id || null,
      security: typeof ch.security_status === 'number' ? Number(ch.security_status.toFixed(2)) : null,
      birthday: ch.birthday || null
    };
    out.stats = summarizeStats(await zkillStats('characterID', entity.id));
  } else if (entity.type === 'corporation') {
    const co = await esiGet(`/corporations/${entity.id}/`).catch(() => ({}));
    const nameMap = co.alliance_id ? await esi.resolveNames([co.alliance_id]).catch(() => ({})) : {};
    out.portrait = `https://images.evetech.net/corporations/${entity.id}/logo?size=128`;
    out.info = {
      ticker: co.ticker || null,
      members: co.member_count != null ? co.member_count : null,
      alliance: co.alliance_id ? nameMap[co.alliance_id] : null,
      allianceId: co.alliance_id || null,
      founded: co.date_founded || null
    };
    out.stats = summarizeStats(await zkillStats('corporationID', entity.id));
  } else {
    const al = await esiGet(`/alliances/${entity.id}/`).catch(() => ({}));
    out.portrait = `https://images.evetech.net/alliances/${entity.id}/logo?size=128`;
    out.info = {
      ticker: al.ticker || null,
      founded: al.date_founded || null
    };
    out.stats = summarizeStats(await zkillStats('allianceID', entity.id));
  }

  return out;
}

// Simple bounded-concurrency map.
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

function threatLevel(stats) {
  if (!stats) return { level: 'unknown', score: 0 };
  const kills = stats.shipsDestroyed || 0;
  const danger = stats.dangerRatio != null ? stats.dangerRatio : 0;
  const recent = stats.activepvp && stats.activepvp.kills ? stats.activepvp.kills.count : 0;
  let score = 0;
  if (kills > 5000) score += 2;
  else if (kills > 500) score += 1;
  if (danger >= 70) score += 2;
  else if (danger >= 40) score += 1;
  if (recent >= 50) score += 2;
  else if (recent >= 5) score += 1;
  const level = score >= 4 ? 'high' : score >= 2 ? 'medium' : kills > 0 ? 'low' : 'blue';
  return { level, score, kills, danger, recent };
}

// Bulk vet a pasted list of pilot names (e.g. copied from Local).
async function bulkLookup(names) {
  const cleaned = [...new Set((names || []).map((n) => String(n).trim()).filter(Boolean))].slice(
    0,
    100
  );
  if (cleaned.length === 0) return [];

  // Resolve names -> character ids (chunked).
  const charList = [];
  for (let i = 0; i < cleaned.length; i += 100) {
    try {
      const resp = await esiPost('/universe/ids/?language=en', cleaned.slice(i, i + 100));
      (resp.characters || []).forEach((c) => charList.push(c));
    } catch (_e) {
      /* skip chunk */
    }
  }
  if (charList.length === 0) return [];

  // Affiliations in one batch.
  const aff = await esiPost('/characters/affiliation/', charList.map((c) => c.id)).catch(() => []);
  const byId = {};
  aff.forEach((a) => {
    byId[a.character_id] = a;
  });
  const orgIds = [];
  aff.forEach((a) => {
    if (a.corporation_id) orgIds.push(a.corporation_id);
    if (a.alliance_id) orgIds.push(a.alliance_id);
  });
  const orgNames = await esi.resolveNames(orgIds).catch(() => ({}));

  // zKill stats per pilot (bounded concurrency).
  const stats = await mapPool(charList, 5, (c) => zkillStats('characterID', c.id));

  const results = charList.map((c, i) => {
    const a = byId[c.id] || {};
    const t = threatLevel(stats[i]);
    return {
      id: c.id,
      name: c.name,
      corporation: a.corporation_id ? orgNames[a.corporation_id] || null : null,
      alliance: a.alliance_id ? orgNames[a.alliance_id] || null : null,
      kills: t.kills || 0,
      danger: t.danger || 0,
      recent: t.recent || 0,
      threat: t.level
    };
  });

  const order = { high: 0, medium: 1, low: 2, blue: 3, unknown: 4 };
  results.sort((x, y) => (order[x.threat] - order[y.threat]) || y.kills - x.kills);
  return results;
}

module.exports = { lookup, bulkLookup };
