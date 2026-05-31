// Skill planning + fit skill-readiness, using public ESI dogma data and (when
// logged in) the character's trained skills + attributes.
//
//   /dogma/types/{id}/        - attributes incl. rank (275), primary/secondary
//                               training attributes (180/181), and required
//                               skills (182/183/184/1285/1289/1287 + levels).
//   /characters/{id}/skills/  - trained levels + SP (needs esi-skills.read_skills)
//   /characters/{id}/attributes/ - int/mem/per/wil/cha (same scope)

const cfg = require('../../config');
const esi = require('./esi');
const auth = require('./auth');
const market = require('./market');

const ATTR_OF_ID = {
  164: 'charisma',
  165: 'intelligence',
  166: 'memory',
  167: 'perception',
  168: 'willpower'
};

// requiredSkillN type-id attribute -> required-level attribute
const REQ_PAIRS = [
  [182, 277],
  [183, 278],
  [184, 279],
  [1285, 1286],
  [1289, 1290],
  [1287, 1288]
];

async function esiGet(pathname) {
  const res = await fetch(cfg.ESI_BASE + pathname, {
    headers: { Accept: 'application/json', 'User-Agent': cfg.USER_AGENT }
  });
  if (!res.ok) throw new Error(`ESI GET ${pathname} -> ${res.status}`);
  return res.json();
}

async function esiAuthGet(pathname, token) {
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

function attrVal(dt, id) {
  const a = (dt.dogma_attributes || []).find((x) => x.attribute_id === id);
  return a ? a.value : null;
}

function requiredSkillsFrom(dt) {
  const reqs = [];
  REQ_PAIRS.forEach(([sid, lid]) => {
    const skillId = attrVal(dt, sid);
    const level = attrVal(dt, lid);
    if (skillId) reqs.push({ skillId: Math.round(skillId), level: Math.round(level || 1) });
  });
  return reqs;
}

// SP required to reach `level` for a skill of the given rank.
function spForLevel(rank, level) {
  if (level <= 0) return 0;
  return Math.round(250 * rank * Math.pow(Math.sqrt(32), level - 1));
}

function fmtMinutes(min) {
  if (!isFinite(min) || min <= 0) return '0m';
  const d = Math.floor(min / 1440);
  const h = Math.floor((min % 1440) / 60);
  const m = Math.round(min % 60);
  return [d ? d + 'd' : '', h ? h + 'h' : '', m ? m + 'm' : ''].filter(Boolean).join(' ') || '0m';
}

// Logged-in character's skills + attributes, or null.
async function characterContext() {
  const access = await auth.getValidAccess().catch(() => null);
  if (!access) return null;
  const [skillsResp, attrResp] = await Promise.all([
    esiAuthGet(`/characters/${access.characterId}/skills/`, access.token).catch(() => null),
    esiAuthGet(`/characters/${access.characterId}/attributes/`, access.token).catch(() => null)
  ]);
  const skills = {};
  if (skillsResp && Array.isArray(skillsResp.skills)) {
    skillsResp.skills.forEach((s) => {
      skills[s.skill_id] = {
        level: s.trained_skill_level || s.active_skill_level || 0,
        sp: s.skillpoints_in_skill || 0
      };
    });
  }
  const attributes = attrResp || {
    intelligence: 20,
    memory: 20,
    perception: 20,
    willpower: 20,
    charisma: 20
  };
  return { skills, attributes, characterId: access.characterId };
}

async function skillMeta(typeId) {
  const dt = await esiGet(`/dogma/types/${typeId}/`);
  const rank = attrVal(dt, 275) || 1;
  const primary = ATTR_OF_ID[attrVal(dt, 180)] || 'intelligence';
  const secondary = ATTR_OF_ID[attrVal(dt, 181)] || 'memory';
  return { rank, primary, secondary };
}

// Full plan for one skill to a target level.
async function skillPlan(typeId, name, targetLevel) {
  const meta = await skillMeta(typeId);
  const ctx = await characterContext();
  const target = Math.max(1, Math.min(5, Number(targetLevel) || 5));

  const pVal = ctx ? ctx.attributes[meta.primary] : 20;
  const sVal = ctx ? ctx.attributes[meta.secondary] : 20;
  const perMin = pVal + sVal / 2;

  const cur = ctx && ctx.skills[typeId] ? ctx.skills[typeId] : { level: 0, sp: 0 };
  const levels = [];
  for (let L = 1; L <= 5; L++) {
    const totalSp = spForLevel(meta.rank, L);
    const remaining = Math.max(0, totalSp - cur.sp);
    levels.push({
      level: L,
      totalSp,
      remaining,
      minutes: remaining / perMin,
      time: fmtMinutes(remaining / perMin),
      done: cur.level >= L
    });
  }
  const toTarget = Math.max(0, spForLevel(meta.rank, target) - cur.sp);
  return {
    typeId,
    name: name || `Skill ${typeId}`,
    rank: meta.rank,
    primary: meta.primary,
    secondary: meta.secondary,
    perMin,
    loggedIn: !!ctx,
    currentLevel: cur.level,
    currentSp: cur.sp,
    target,
    targetRemaining: toTarget,
    targetTime: fmtMinutes(toTarget / perMin),
    levels
  };
}

// Parse an EFT/fit, resolve to types, gather required skills, and compare to
// the logged-in character's trained levels. Also prices the fit.
async function fitCheck(eftText) {
  const items = market.parseList(eftText);
  if (items.length === 0) return { items: 0, requirements: [], loggedIn: false };

  const nameMap = await market.resolveNamesToIds(items.map((i) => i.name));
  const typeIds = [...new Set(Object.values(nameMap).map((v) => v.id))];

  // Required skills per type (bounded concurrency).
  const dogmas = await mapPool(typeIds, 8, (id) => esiGet(`/dogma/types/${id}/`));
  const needed = {}; // skillId -> max level required
  dogmas.forEach((dt) => {
    if (!dt) return;
    requiredSkillsFrom(dt).forEach((r) => {
      if (!needed[r.skillId] || r.level > needed[r.skillId]) needed[r.skillId] = r.level;
    });
  });

  const ctx = await characterContext();
  const skillIds = Object.keys(needed).map(Number);
  const skillNames = await esi.resolveNames(skillIds).catch(() => ({}));

  // Rank lookups only for missing skills (to estimate SP to train).
  const requirements = skillIds.map((sid) => {
    const need = needed[sid];
    const have = ctx && ctx.skills[sid] ? ctx.skills[sid].level : 0;
    return { skillId: sid, name: skillNames[sid] || `Skill ${sid}`, need, have, ok: have >= need };
  });
  requirements.sort((a, b) => Number(a.ok) - Number(b.ok) || a.name.localeCompare(b.name));

  const missing = requirements.filter((r) => !r.ok);
  let totalMissingSp = 0;
  if (missing.length) {
    const metas = await mapPool(missing, 8, (m) => skillMeta(m.skillId));
    missing.forEach((m, i) => {
      const rank = (metas[i] && metas[i].rank) || 1;
      const have = ctx && ctx.skills[m.skillId] ? ctx.skills[m.skillId].sp : 0;
      totalMissingSp += Math.max(0, spForLevel(rank, m.need) - have);
    });
  }

  const price = await market.appraise(eftText).catch(() => null);

  return {
    items: typeIds.length,
    loggedIn: !!ctx,
    requirements,
    missingCount: missing.length,
    totalMissingSp,
    price: price ? { totalSell: price.totalSell, totalBuy: price.totalBuy } : null
  };
}

// ---------- "What can I afford AND fly?" ----------
// A curated cross-section of popular hulls. We resolve their type ids, read the
// hull's required skills (dogma), price them at Jita, and cross-check against
// the logged-in pilot's wallet + trained skills.
const CURATED_SHIPS = [
  // Frigates / destroyers
  'Merlin', 'Punisher', 'Rifter', 'Incursus', 'Tristan', 'Kestrel', 'Atron', 'Slasher',
  'Catalyst', 'Cormorant', 'Thrasher', 'Coercer', 'Algos', 'Corax',
  // Faction / pirate frigs + interceptors / assault
  'Worm', 'Garmur', 'Daredevil', 'Dramiel', 'Astero', 'Crow', 'Malediction', 'Harpy', 'Hawk', 'Enyo', 'Retribution',
  // Cruisers
  'Caracal', 'Vexor', 'Thorax', 'Stabber', 'Rupture', 'Moa', 'Omen', 'Maller', 'Arbitrator', 'Osprey', 'Augoror',
  // T2 / faction cruisers
  'Gila', 'Cerberus', 'Ishtar', 'Sacrilege', 'Muninn', 'Eagle', 'Stratios', 'Orthrus', 'Vagabond',
  // Battlecruisers
  'Hurricane', 'Drake', 'Myrmidon', 'Harbinger', 'Ferox', 'Brutix', 'Prophecy', 'Naga', 'Oracle', 'Talos', 'Tornado',
  // Battleships
  'Raven', 'Megathron', 'Dominix', 'Tempest', 'Maelstrom', 'Apocalypse', 'Armageddon', 'Rokh', 'Hyperion', 'Typhoon', 'Abaddon',
  'Machariel', 'Rattlesnake', 'Nightmare', 'Praxis',
  // Industrials / mining
  'Venture', 'Retriever', 'Covetor', 'Procurer', 'Iteron Mark V', 'Badger', 'Sigil', 'Epithal'
];

async function characterWallet() {
  const access = await auth.getValidAccess().catch(() => null);
  if (!access) return null;
  const bal = await esiAuthGet(`/characters/${access.characterId}/wallet/`, access.token).catch(
    () => null
  );
  return typeof bal === 'number' ? bal : null;
}

async function affordAndFly() {
  const ctx = await characterContext();
  if (!ctx) return { loggedIn: false };
  const wallet = await characterWallet();

  // Resolve curated ship names -> type ids.
  const nameMap = await market.resolveNamesToIds(CURATED_SHIPS).catch(() => ({}));
  const resolved = Object.values(nameMap).filter((v) => v && v.id);
  const ids = [...new Set(resolved.map((v) => v.id))];
  if (ids.length === 0) return { loggedIn: true, wallet, ships: [] };

  const [prices, dogmas] = await Promise.all([
    market.groupPrices(ids).catch(() => ({})),
    mapPool(ids, 8, (id) => esiGet(`/dogma/types/${id}/`).catch(() => null))
  ]);

  // Collect skill names we need to label.
  const dogmaById = {};
  ids.forEach((id, i) => {
    dogmaById[id] = dogmas[i];
  });
  const neededSkillIds = new Set();
  ids.forEach((id) => {
    const dt = dogmaById[id];
    if (dt) requiredSkillsFrom(dt).forEach((r) => neededSkillIds.add(r.skillId));
  });
  const skillNames = await esi.resolveNames([...neededSkillIds]).catch(() => ({}));

  const ships = resolved.map((v) => {
    const id = v.id;
    const dt = dogmaById[id];
    const reqs = dt ? requiredSkillsFrom(dt) : [];
    const missing = reqs
      .filter((r) => {
        const have = ctx.skills[r.skillId] ? ctx.skills[r.skillId].level : 0;
        return have < r.level;
      })
      .map((r) => ({
        name: skillNames[r.skillId] || `Skill ${r.skillId}`,
        need: r.level,
        have: ctx.skills[r.skillId] ? ctx.skills[r.skillId].level : 0
      }));
    const p = prices[id] || {};
    const price = p.sellMin || 0;
    const canFly = missing.length === 0;
    const affordable = wallet != null && price > 0 && price <= wallet;
    return {
      id,
      name: v.name,
      price,
      canFly,
      affordable,
      missing,
      missingCount: missing.length
    };
  });

  return { loggedIn: true, wallet, ships };
}

module.exports = { skillPlan, fitCheck, affordAndFly };
