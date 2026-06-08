// Elite / veteran tools — route briefs, KM analysis, fleet rollup, WH log, etc.

const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const cfg = require('../../config');
const esi = require('./esi');
const galaxy = require('./galaxy');
const radar = require('./radar');
const intel = require('./intel');
const career = require('./career');
const skills = require('./skills');
const market = require('./market');
const contracts = require('./contracts');
const zkill = require('./zkill');

const KNOWN_SYSTEMS = {
  jita: 30000142,
  amarr: 30002187,
  dodixie: 30002659,
  rens: 30002510,
  hek: 30002053
};

async function postIds(names) {
  const body = JSON.stringify(names);
  const urls = [
    cfg.ESI_BASE + '/universe/ids/?language=en',
    'https://esi.evetech.net/latest/universe/ids/?language=en'
  ];
  for (const url of urls) {
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
      if (res.ok) return res.json();
    } catch (_e) {
      /* next */
    }
  }
  return null;
}

async function resolveSystemId(name) {
  const q = String(name || '').trim();
  if (!q) return null;
  const low = q.toLowerCase();
  if (KNOWN_SYSTEMS[low]) return KNOWN_SYSTEMS[low];
  const data = await postIds([q]);
  if (data && data.solar_systems && data.solar_systems[0]) return data.solar_systems[0].id;
  const sys = galaxy.getSystems();
  if (sys && sys.systems) {
    for (const [id, s] of Object.entries(sys.systems)) {
      if (s.n && s.n.toLowerCase() === low) return Number(id);
    }
    for (const [id, s] of Object.entries(sys.systems)) {
      if (s.n && s.n.toLowerCase().includes(low)) return Number(id);
    }
  }
  return null;
}

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

// 1) Jump-by-jump route intel brief
async function routeBrief(fromName, toName, flag) {
  const f = ['shortest', 'secure', 'insecure'].includes(flag) ? flag : 'shortest';
  const fromId = await resolveSystemId(fromName);
  const toId = await resolveSystemId(toName);
  if (!fromId || !toId) {
    return { ok: false, error: 'Could not resolve From/To system names. Open Map once to build the index.' };
  }
  const systems = galaxy.getSystems();
  if (!systems) return { ok: false, error: 'Map index not built — open Map tab first.' };

  const ids = await galaxy.route(fromId, toId, f);
  if (!ids || ids.length < 1) return { ok: false, error: 'No route found between those systems.' };

  const live = await galaxy.getLive().catch(() => ({ kills: [] }));
  const killBySys = killIndex(live);
  const recent = (zkill.recent(60).kills || []).reduce((acc, k) => {
    const sid = k.systemId;
    if (!sid) return acc;
    if (!acc[sid]) acc[sid] = 0;
    acc[sid] += 1;
    return acc;
  }, {});

  let totalKills = 0;
  let maxCamp = null;
  const jumps = ids.map((id, i) => {
    const s = systems.systems[id];
    const kd = killBySys[id] || { ship: 0, pod: 0, npc: 0 };
    const liveRecent = recent[id] || 0;
    const ship = kd.ship + kd.pod;
    totalKills += ship;
    const camp = i > 0 && i < ids.length - 1 && kd.ship >= 5 && kd.pod >= 2;
    const row = {
      id,
      name: s ? s.n : 'Sys ' + id,
      region: s && systems.regions[s.r] ? systems.regions[s.r] : '',
      sec: s ? s.s : 0,
      killsHr: ship,
      podHr: kd.pod,
      liveRecent,
      camp: !!camp,
      endpoint: i === 0 || i === ids.length - 1
    };
    if (camp && (!maxCamp || ship > maxCamp.killsHr)) maxCamp = row;
    return row;
  });

  let risk = 'low';
  if (maxCamp || totalKills > 40) risk = 'high';
  else if (totalKills > 12 || jumps.some((j) => j.sec > 0 && j.sec < 0.5 && j.killsHr > 3)) risk = 'med';

  return {
    ok: true,
    flag: f,
    from: jumps[0].name,
    to: jumps[jumps.length - 1].name,
    jumpCount: Math.max(0, ids.length - 1),
    risk,
    totalKillsHr: totalKills,
    hotGate: maxCamp,
    jumps
  };
}

// 2) Situational OS — threat fusion at current location
async function situational(range) {
  const r = await radar.radar(range || 6);
  if (!r.ready) return { ok: false, error: 'Map data not ready.' };
  let score = 0;
  const reasons = [];
  if (!r.loggedIn) reasons.push('Log in for location-aware radar.');
  if (r.location) {
    const nearHigh = (r.nearby || []).filter((n) => n.level >= 3);
    if (nearHigh.length) {
      score += nearHigh.length * 2;
      reasons.push(`${nearHigh.length} high-threat system(s) within ${r.range}j`);
    }
    const here = (r.nearby || []).find((n) => n.id === r.location.id);
    if (here && here.level >= 2) {
      score += 3;
      reasons.push(`Current system activity: ${here.ship + here.pod} kills/hr`);
    }
  }
  const camps = (r.battles || []).filter((b) => b.camp);
  if (camps.length) {
    score += camps.length * 2;
    reasons.push(`${camps.length} likely gate camp(s) on map`);
  }
  let level = 'green';
  if (score >= 8) level = 'red';
  else if (score >= 4) level = 'amber';

  return { ok: true, score, level, reasons, radar: r };
}

// 3) Career analytics — passthrough
async function careerStats() {
  return career.analytics();
}

// 4) Killmail / counter-intel from zKill URL or ID
async function killmailAnalyze(input) {
  const raw = String(input || '').trim();
  let killId = null;
  const m = raw.match(/killID[=\/](\d+)/i) || raw.match(/^(\d{6,})$/);
  if (m) killId = Number(m[1]);
  if (!killId) return { ok: false, error: 'Paste a zKillboard killmail URL or numeric kill ID.' };

  const res = await fetch(`https://zkillboard.com/api/killID/${killId}/`, {
    headers: { Accept: 'application/json', 'User-Agent': cfg.USER_AGENT }
  });
  if (!res.ok) return { ok: false, error: `zKill returned ${res.status}` };
  const zk = await res.json();
  if (!zk || !zk.zkb) return { ok: false, error: 'Killmail not found.' };

  const hash = zk.zkb.hash;
  const km = await fetch(`${cfg.ESI_BASE}/killmails/${killId}/${hash}/`, {
    headers: { Accept: 'application/json', 'User-Agent': cfg.USER_AGENT }
  }).then((r) => (r.ok ? r.json() : null)).catch(() => null);

  if (!km) return { ok: false, error: 'Could not load killmail detail from ESI.' };

  const victim = km.victim || {};
  const ids = [
    victim.ship_type_id,
    km.solar_system_id,
    ...(km.attackers || []).map((a) => a.ship_type_id).filter(Boolean)
  ];
  const names = await esi.resolveNames(ids).catch(() => ({}));

  const dmg = { em: 0, thermal: 0, kinetic: 0, explosive: 0, other: 0 };
  (km.attackers || []).forEach((a) => {
    if (!a.damage_done) return;
    const t = (a.weapon_type_id && names[a.weapon_type_id]) || '';
    const d = a.damage_done;
    if (/EM|Graviton|Modal/i.test(t)) dmg.em += d;
    else if (/Thermal|Plasma|Inferno/i.test(t)) dmg.thermal += d;
    else if (/Kinetic|Scourge|Mjolnir/i.test(t)) dmg.kinetic += d;
    else if (/Explosive|Void|Nova/i.test(t)) dmg.explosive += d;
    else dmg.other += d;
  });
  const totalDmg = Object.values(dmg).reduce((s, v) => s + v, 0) || 1;
  const profile = Object.entries(dmg)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => ({ type: k, pct: Math.round((v / totalDmg) * 100) }))
    .sort((a, b) => b.pct - a.pct);

  const topDamage = (km.attackers || [])
    .filter((a) => a.damage_done > 0)
    .sort((a, b) => b.damage_done - a.damage_done)
    .slice(0, 5)
    .map((a) => ({
      ship: names[a.ship_type_id] || (a.ship_type_id ? `Type ${a.ship_type_id}` : 'Unknown'),
      damage: a.damage_done,
      finalBlow: !!a.final_blow
    }));

  return {
    ok: true,
    killId,
    url: `https://zkillboard.com/kill/${killId}/`,
    system: names[km.solar_system_id] || km.solar_system_id,
    victim: names[victim.ship_type_id] || 'Ship',
    value: zk.zkb.totalValue || 0,
    attackers: (km.attackers || []).length,
    topDamage,
    damageProfile: profile,
    hint:
      profile[0] && profile[0].type !== 'other'
        ? `Primary damage: ${profile[0].type.toUpperCase()} (${profile[0].pct}%) — fit tank accordingly.`
        : 'Mixed damage profile.'
  };
}

// 5) Courier profit board
async function courierBoard(regionId) {
  const rid = Number(regionId) || 10000002;
  const rows = await contracts.search(rid, { type: 'courier', pages: 3 });
  const ranked = rows
    .map((c) => {
      const vol = c.volume || 1;
      const reward = c.reward || 0;
      const collateral = c.collateral || 0;
      const iskPerM3 = reward / vol;
      const collateralPct = collateral > 0 ? reward / collateral : 0;
      let grade = 'fair';
      if (iskPerM3 >= 1200 && collateralPct >= 0.01) grade = 'excellent';
      else if (iskPerM3 >= 600) grade = 'good';
      else if (collateralPct < 0.005 && collateral > 5e8) grade = 'risky';
      return { ...c, iskPerM3: Math.round(iskPerM3), collateralPct, grade };
    })
    .sort((a, b) => b.iskPerM3 - a.iskPerM3)
    .slice(0, 40);
  return { ok: true, regionId: rid, rows: ranked };
}

// 6) WH chain logger
function whPath() {
  return path.join(app.getPath('userData'), 'wh-chain.json');
}

function whRead() {
  try {
    const f = whPath();
    if (!fs.existsSync(f)) return { updated: 0, links: [] };
    return JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch (_e) {
    return { updated: 0, links: [] };
  }
}

function whWrite(data) {
  fs.writeFileSync(whPath(), JSON.stringify(data, null, 2), 'utf8');
}

function whGet() {
  return whRead();
}

function whAdd(link) {
  const data = whRead();
  const entry = {
    id: Date.now(),
    from: String(link.from || '').trim(),
    to: String(link.to || '').trim(),
    mass: String(link.mass || '').trim(),
    static: String(link.static || '').trim(),
    note: String(link.note || '').trim(),
    ts: Date.now()
  };
  if (!entry.from || !entry.to) throw new Error('From and To signatures required.');
  data.links = [entry, ...(data.links || [])].slice(0, 80);
  data.updated = Date.now();
  whWrite(data);
  return data;
}

function whRemove(id) {
  const data = whRead();
  data.links = (data.links || []).filter((l) => l.id !== Number(id));
  data.updated = Date.now();
  whWrite(data);
  return data;
}

function whClear() {
  const data = { updated: Date.now(), links: [] };
  whWrite(data);
  return data;
}

// 7) Fleet intel rollup
async function fleetRollup(text) {
  const names = String(text || '')
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 100);
  if (!names.length) return { ok: false, error: 'Paste pilot names (one per line).' };
  const rows = await intel.bulkLookup(names);
  const counts = rows.reduce((a, r) => ((a[r.threat] = (a[r.threat] || 0) + 1), a), {});
  const high = rows.filter((r) => r.threat === 'high');
  const exportText = rows
    .map((r) => `${r.threat.toUpperCase().padEnd(6)} ${r.name}  ${r.kills}k ${Math.round(r.danger)}%  ${r.corporation || ''}`)
    .join('\n');
  return {
    ok: true,
    total: rows.length,
    counts,
    highThreat: high,
    rows,
    exportText
  };
}

// 8) Hub arbitrage + route risk
async function arbitragePro(flag) {
  const typeIds = await market.dealsPresetIds().catch(() => []);
  const [deals, danger] = await Promise.all([
    market.deals(typeIds).catch(() => []),
    radar.hubDanger(flag || 'shortest')
  ]);
  const rows = (deals || [])
    .filter((d) => d.stationMargin > 5 || (d.haul && d.haul.profit > 5e6))
    .sort((a, b) => (b.haul && b.haul.profit ? b.haul.profit : 0) - (a.haul && a.haul.profit ? a.haul.profit : 0))
    .slice(0, 30);
  return { ok: true, deals: rows, hubDanger: danger || {} };
}

// 9) Fit logistics — skills + Jita price for pasted EFT
async function fitLogistics(eft) {
  const text = String(eft || '').trim();
  if (!text) return { ok: false, error: 'Paste an EFT fit.' };
  const check = await skills.fitCheck(text);
  return { ok: true, ...check };
}

// 10) Live gate camp / battle watch
async function gateCamps() {
  const r = await radar.radar(8);
  if (!r.ready) return { ok: false, error: 'Map not ready.' };
  const camps = (r.battles || []).filter((b) => b.camp || b.kills >= 4);
  const hot = (r.nearby || []).filter((n) => n.level >= 3 && n.jumps <= 3);
  return {
    ok: true,
    camps,
    nearbyHot: hot,
    battles: r.battles || []
  };
}

module.exports = {
  routeBrief,
  situational,
  careerStats,
  killmailAnalyze,
  courierBoard,
  whGet,
  whAdd,
  whRemove,
  whClear,
  fleetRollup,
  arbitragePro,
  fitLogistics,
  gateCamps
};
