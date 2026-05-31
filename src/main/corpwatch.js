// Corporation monitoring for the active (or selected) character's corp + public ESI.

const cfg = require('../../config');
const auth = require('./auth');
const esi = require('./esi');
const intel = require('./intel');

async function esiGet(pathname, token) {
  const res = await fetch(cfg.ESI_BASE + pathname, {
    headers: {
      Accept: 'application/json',
      'User-Agent': cfg.USER_AGENT,
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    }
  });
  if (!res.ok) throw new Error(`ESI GET ${pathname} -> ${res.status}`);
  return res.json();
}

async function monitor(corpId) {
  let id = corpId ? Number(corpId) : null;
  const access = await auth.getValidAccess().catch(() => null);
  if (!id && access) {
    const ch = await esiGet(`/characters/${access.characterId}/`).catch(() => ({}));
    id = ch.corporation_id;
  }
  if (!id) return { ok: false, error: 'No corporation — log in or pass a corp name in Intel.' };

  const [corp, wars, membersTry] = await Promise.all([
    esiGet(`/corporations/${id}/`),
    esiGet('/wars/').catch(() => []),
    access
      ? esiGet(`/corporations/${id}/members/`, access.token).catch(() => null)
      : Promise.resolve(null)
  ]);

  let allianceName = null;
  if (corp.alliance_id) {
    try {
      const al = await esiGet(`/alliances/${corp.alliance_id}/`);
      allianceName = al.name;
    } catch (_e) {
      /* ignore */
    }
  }

  const activeWars = [];
  if (Array.isArray(wars)) {
    const sample = wars.slice(0, 40);
    const details = await Promise.all(
      sample.map((wid) => esiGet(`/wars/${wid}/`).catch(() => null))
    );
    details.forEach((w) => {
      if (!w || w.finished) return;
      const parties = [w.aggressor, w.defender].filter(Boolean);
      const hit = parties.some(
        (p) => p.corporation_id === id || (corp.alliance_id && p.alliance_id === corp.alliance_id)
      );
      if (hit) activeWars.push(w);
    });
  }

  let stats = null;
  try {
    stats = await intel.lookup(corp.name);
  } catch (_e) {
    stats = null;
  }

  let memberSample = [];
  if (Array.isArray(membersTry)) {
    memberSample = membersTry.slice(0, 30);
  }

  return {
    ok: true,
    id,
    name: corp.name,
    ticker: corp.ticker,
    members: corp.member_count,
    ceoId: corp.ceo_id,
    alliance: allianceName,
    allianceId: corp.alliance_id,
    founded: corp.date_founded,
    warCount: activeWars.length,
    wars: activeWars.slice(0, 8).map((w) => ({
      id: w.id,
      started: w.started,
      mutual: !!w.mutual
    })),
    memberListAvailable: Array.isArray(membersTry),
    memberSample,
    zkill: stats && stats.stats ? stats.stats : null,
    zkillName: stats ? stats.name : corp.name
  };
}

async function lookupByName(name) {
  const cleaned = String(name || '').trim();
  if (!cleaned) throw new Error('Enter a corporation name.');
  const res = await fetch(cfg.ESI_BASE + '/universe/ids/?language=en', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': cfg.USER_AGENT
    },
    body: JSON.stringify([cleaned])
  });
  if (!res.ok) throw new Error('Name lookup failed.');
  const data = await res.json();
  const hit = data.corporations && data.corporations[0];
  if (!hit) throw new Error(`No corporation called "${cleaned}".`);
  return monitor(hit.id);
}

module.exports = { monitor, lookupByName };
