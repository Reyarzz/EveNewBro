// Background desktop notifications (EULA-safe; read-only data only).
//
// Periodically checks and alerts on:
//   - Market watchlist price targets (public Fuzzwork data)
//   - Skill queue empty / finishing soon (requires SSO login)
//   - Newly started Sansha incursions (public)
//   - Planetary Interaction extractors (disabled until a valid PI scope exists on SSO)

const { Notification } = require('electron');
const cfg = require('../../config');
const store = require('./store');
const auth = require('./auth');
const market = require('./market');
const radar = require('./radar');

const CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes
const DEFAULT_PREFS = {
  priceAlerts: true,
  skillQueue: true,
  incursions: true,
  pi: true,
  radar: true
};

let timer = null;
let knownIncursions = null; // Set of staging system ids; null = not seeded yet
let alertedWatch = new Set(); // ids currently in alerted state
const cooldowns = {}; // key -> timestamp

function getPrefs() {
  const s = store.loadSettings();
  return { ...DEFAULT_PREFS, ...(s.notifyPrefs || {}) };
}

function setPrefs(patch) {
  const next = { ...getPrefs(), ...(patch || {}) };
  store.saveSettings({ notifyPrefs: next });
  return next;
}

function notify(title, body) {
  try {
    if (Notification.isSupported()) {
      new Notification({ title, body, silent: false }).show();
    }
  } catch (_e) {
    /* ignore */
  }
}

function onCooldown(key, ms) {
  const now = Date.now();
  if (cooldowns[key] && now - cooldowns[key] < ms) return true;
  cooldowns[key] = now;
  return false;
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

function iskShort(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(0) + 'k';
  return String(Math.round(n));
}

async function checkPrices(prefs) {
  if (!prefs.priceAlerts) return;
  const items = market.getWatchItems().filter((w) => w.target != null);
  if (items.length === 0) return;
  const prices = await market.groupPrices(items.map((w) => w.id)).catch(() => ({}));
  items.forEach((w) => {
    const p = prices[w.id];
    if (!p) return;
    const sell = p.sellMin || 0;
    const buy = p.buyMax || 0;
    const hit =
      w.dir === 'above' ? buy > 0 && buy >= w.target : sell > 0 && sell <= w.target;
    if (hit && !alertedWatch.has(w.id)) {
      alertedWatch.add(w.id);
      const priceNow = w.dir === 'above' ? buy : sell;
      notify(
        `${w.name} price alert`,
        `${w.dir === 'above' ? 'Sell' : 'Buy'} target ${iskShort(w.target)} ISK reached — now ${iskShort(priceNow)} ISK (Jita).`
      );
    } else if (!hit) {
      alertedWatch.delete(w.id);
    }
  });
}

async function checkSkillQueue(prefs, access) {
  if (!prefs.skillQueue || !access) return;
  const queue = await esiAuthGet(`/characters/${access.characterId}/skillqueue/`, access.token).catch(
    () => null
  );
  if (!Array.isArray(queue)) return;
  if (queue.length === 0) {
    if (!onCooldown('skill-empty', 20 * 60 * 60 * 1000))
      notify('Skill queue empty', 'Your training queue is empty — add a skill!');
    return;
  }
  const last = queue[queue.length - 1];
  if (last && last.finish_date) {
    const ends = new Date(last.finish_date).getTime();
    if (ends - Date.now() < 24 * 60 * 60 * 1000) {
      if (!onCooldown('skill-soon', 20 * 60 * 60 * 1000))
        notify('Skill queue ending soon', 'Your skill queue finishes within 24 hours.');
    }
  }
}

async function checkIncursions(prefs) {
  if (!prefs.incursions) return;
  let list = [];
  try {
    const res = await fetch(cfg.ESI_BASE + '/incursions/', {
      headers: { Accept: 'application/json', 'User-Agent': cfg.USER_AGENT }
    });
    list = res.ok ? await res.json() : [];
  } catch (_e) {
    return;
  }
  const current = new Set(list.map((i) => i.staging_solar_system_id));
  if (knownIncursions === null) {
    knownIncursions = current; // seed silently on first run
    return;
  }
  const fresh = [...current].filter((id) => !knownIncursions.has(id));
  knownIncursions = current;
  if (fresh.length > 0) {
    notify(
      'New incursion',
      `${fresh.length} new Sansha incursion${fresh.length > 1 ? 's' : ''} just started.`
    );
  }
}

async function checkPI(prefs, access) {
  if (!prefs.pi || !access) return;
  const planets = await esiAuthGet(`/characters/${access.characterId}/planets/`, access.token).catch(
    () => null
  );
  if (!Array.isArray(planets)) return;
  for (const planet of planets) {
    const detail = await esiAuthGet(
      `/characters/${access.characterId}/planets/${planet.planet_id}/`,
      access.token
    ).catch(() => null);
    if (!detail || !Array.isArray(detail.pins)) continue;
    let soonest = Infinity;
    detail.pins.forEach((pin) => {
      const exp = pin.expiry_time ? new Date(pin.expiry_time).getTime() : null;
      if (exp && exp < soonest) soonest = exp;
    });
    if (soonest !== Infinity && soonest - Date.now() < 6 * 60 * 60 * 1000) {
      const key = `pi-${planet.planet_id}`;
      if (!onCooldown(key, 6 * 60 * 60 * 1000))
        notify('PI extractor expiring', 'A planetary extractor expires within 6 hours.');
    }
  }
}

// Alert when systems near the logged-in pilot heat up (active battle / gatecamp).
async function checkRadar(prefs, access) {
  if (!prefs.radar || !access) return;
  const r = await radar.radar(6).catch(() => null);
  if (!r || !r.loggedIn || !r.location) return;
  const danger = (r.nearby || []).filter((n) => n.level >= 2);
  danger.forEach((n) => {
    const key = `radar-${n.id}`;
    if (onCooldown(key, 30 * 60 * 1000)) return;
    const what = n.flags.includes('camp') ? 'Possible gatecamp' : 'Active battle';
    notify(
      `${what} ${n.jumps} jump${n.jumps === 1 ? '' : 's'} away`,
      `${n.name} (${n.sec.toFixed(1)}) — ${n.ship + n.pod} kills/hr near ${r.location.name}.`
    );
  });
}

async function runCheck() {
  const prefs = getPrefs();
  const access = await auth.getValidAccess().catch(() => null);
  await checkPrices(prefs).catch(() => {});
  await checkIncursions(prefs).catch(() => {});
  await checkSkillQueue(prefs, access).catch(() => {});
  await checkPI(prefs, access).catch(() => {});
  await checkRadar(prefs, access).catch(() => {});
}

function start() {
  if (timer) return;
  // First pass shortly after launch, then on an interval.
  setTimeout(() => runCheck(), 20 * 1000);
  timer = setInterval(() => runCheck(), CHECK_INTERVAL);
}

module.exports = { start, getPrefs, setPrefs, runCheck };
