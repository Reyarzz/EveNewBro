// Live kill feed via zKillboard's RedisQ stream.
//
// RedisQ is a long-poll queue: each GET returns at most one killmail "package"
// (or null after a timeout). We keep a rolling buffer of the most recent kills
// and resolve the ids we display (ship type, victim, system) to names.
//
// No auth required. zKillboard asks for a descriptive User-Agent and a unique
// queueID per consumer, which we provide.

const cfg = require('../../config');
const esi = require('./esi');

const REDISQ_URL = 'https://redisq.zkillboard.com/listen.php';
const QUEUE_ID = 'eve-newbro-overlay-' + Math.random().toString(36).slice(2, 10);
const MAX_KILLS = 80;

let buffer = []; // newest first
let names = {}; // id -> name cache (ships, chars, corps, systems)
let pendingIds = new Set();
let polling = false;
let lastError = null;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function ingest(pkg) {
  if (!pkg || !pkg.killmail) return;
  const km = pkg.killmail;
  const zkb = pkg.zkb || {};
  const victim = km.victim || {};
  const entry = {
    id: km.killmail_id,
    time: km.killmail_time,
    systemId: km.solar_system_id,
    shipTypeId: victim.ship_type_id || null,
    victimCharId: victim.character_id || null,
    victimCorpId: victim.corporation_id || null,
    npc: !!zkb.npc,
    solo: !!zkb.solo,
    value: zkb.totalValue || 0,
    attackers: Array.isArray(km.attackers) ? km.attackers.length : 0,
    url: `https://zkillboard.com/kill/${km.killmail_id}/`
  };
  buffer.unshift(entry);
  if (buffer.length > MAX_KILLS) buffer.pop();

  [entry.shipTypeId, entry.victimCharId, entry.victimCorpId, entry.systemId].forEach((id) => {
    if (id && !(id in names)) pendingIds.add(id);
  });
}

async function resolvePending() {
  if (pendingIds.size === 0) return;
  const ids = [...pendingIds].slice(0, 1000);
  pendingIds = new Set([...pendingIds].slice(1000));
  try {
    const map = await esi.resolveNames(ids);
    Object.assign(names, map);
    ids.forEach((id) => {
      if (!(id in names)) names[id] = null; // mark resolved-but-unknown
    });
  } catch (_e) {
    /* try again next tick */
  }
}

async function loop() {
  while (polling) {
    try {
      const res = await fetch(`${REDISQ_URL}?queueID=${QUEUE_ID}&ttw=10`, {
        headers: { Accept: 'application/json', 'User-Agent': cfg.USER_AGENT }
      });
      if (res.ok) {
        lastError = null;
        const j = await res.json();
        if (j && j.package) ingest(j.package);
      } else {
        lastError = `RedisQ ${res.status}`;
        await sleep(5000);
      }
    } catch (e) {
      lastError = e.message || String(e);
      await sleep(5000);
    }
    resolvePending();
  }
}

function start() {
  if (polling) return;
  polling = true;
  loop();
}

function stop() {
  polling = false;
}

function recent(limit) {
  const kills = buffer.slice(0, limit || 40).map((k) => ({
    ...k,
    shipName: k.shipTypeId ? names[k.shipTypeId] || null : null,
    victimName: k.victimCharId ? names[k.victimCharId] || null : null,
    corpName: k.victimCorpId ? names[k.victimCorpId] || null : null,
    systemName: k.systemId ? names[k.systemId] || null : null
  }));
  return { kills, polling, error: lastError, total: buffer.length };
}

module.exports = { start, stop, recent };
