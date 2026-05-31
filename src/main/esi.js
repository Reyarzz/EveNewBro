// Minimal ESI client. All calls are GET/POST against public ESI; authenticated
// calls attach the bearer access token. We keep this dependency-free using the
// global fetch available in Electron's Node runtime.

const cfg = require('../../config');

async function esiGet(pathname, accessToken) {
  const res = await fetch(cfg.ESI_BASE + pathname, {
    headers: {
      Accept: 'application/json',
      'User-Agent': cfg.USER_AGENT,
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
    }
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ESI GET ${pathname} -> ${res.status}: ${text}`);
  }
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
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ESI POST ${pathname} -> ${res.status}: ${text}`);
  }
  return res.json();
}

// Resolve a batch of type/character/etc ids to names.
async function resolveNames(ids) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return {};
  const list = await esiPost('/universe/names/', unique);
  const map = {};
  list.forEach((entry) => {
    map[entry.id] = entry.name;
  });
  return map;
}

// Pull everything we need to personalize tips for one character.
async function getCharacterSnapshot(access) {
  const { token, characterId, characterName } = access;
  const id = characterId;

  // Public info needs no auth.
  const publicInfo = await esiGet(`/characters/${id}/`).catch(() => ({}));

  // Authenticated calls — run in parallel, tolerate individual failures.
  const [skills, ship, location, wallet, queue] = await Promise.all([
    esiGet(`/characters/${id}/skills/`, token).catch(() => null),
    esiGet(`/characters/${id}/ship/`, token).catch(() => null),
    esiGet(`/characters/${id}/location/`, token).catch(() => null),
    esiGet(`/characters/${id}/wallet/`, token).catch(() => null),
    esiGet(`/characters/${id}/skillqueue/`, token).catch(() => null)
  ]);

  // Resolve names for ship type and current solar system.
  const idsToName = [];
  if (ship && ship.ship_type_id) idsToName.push(ship.ship_type_id);
  if (location && location.solar_system_id) idsToName.push(location.solar_system_id);
  const names = await resolveNames(idsToName).catch(() => ({}));

  const totalSp = skills && typeof skills.total_sp === 'number' ? skills.total_sp : null;

  return {
    characterId: id,
    characterName: characterName || publicInfo.name || 'Capsuleer',
    corporationId: publicInfo.corporation_id || null,
    securityStatus:
      typeof publicInfo.security_status === 'number'
        ? Number(publicInfo.security_status.toFixed(2))
        : null,
    totalSp,
    shipTypeId: ship ? ship.ship_type_id : null,
    shipName: ship ? ship.ship_name : null,
    shipTypeName: ship && ship.ship_type_id ? names[ship.ship_type_id] || null : null,
    solarSystemId: location ? location.solar_system_id : null,
    solarSystemName:
      location && location.solar_system_id ? names[location.solar_system_id] || null : null,
    walletBalance: typeof wallet === 'number' ? wallet : null,
    skillQueueLength: Array.isArray(queue) ? queue.length : null,
    skillQueueFinish:
      Array.isArray(queue) && queue.length > 0
        ? queue[queue.length - 1].finish_date || null
        : null
  };
}

module.exports = { getCharacterSnapshot, resolveNames };
