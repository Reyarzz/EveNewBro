// Passive footer indicators: PLEX price (Jita) + skill queue state.
// Cached so the renderer can poll freely without hammering ESI/Fuzzwork.

const cfg = require('../../config');
const auth = require('./auth');
const market = require('./market');

const PLEX_TYPE_ID = 44992;
const TTL = 10 * 60 * 1000;

let cache = { at: 0, data: null };

async function plexPrice() {
  const prices = await market.groupPrices([PLEX_TYPE_ID]).catch(() => ({}));
  const p = prices[PLEX_TYPE_ID];
  if (!p) return null;
  return { sell: p.sellMin || 0, buy: p.buyMax || 0 };
}

async function skillQueue() {
  const access = await auth.getValidAccess().catch(() => null);
  if (!access) return { loggedIn: false };
  const res = await fetch(
    `${cfg.ESI_BASE}/characters/${access.characterId}/skillqueue/`,
    {
      headers: {
        Accept: 'application/json',
        'User-Agent': cfg.USER_AGENT,
        Authorization: `Bearer ${access.token}`
      }
    }
  ).catch(() => null);
  if (!res || !res.ok) return { loggedIn: true, state: 'unknown' };
  const queue = await res.json().catch(() => null);
  if (!Array.isArray(queue) || queue.length === 0) {
    return { loggedIn: true, state: 'empty' };
  }
  const last = queue[queue.length - 1];
  const endsAt = last && last.finish_date ? new Date(last.finish_date).getTime() : null;
  if (!endsAt) return { loggedIn: true, state: 'paused' }; // queue exists but isn't training
  const hoursLeft = Math.max(0, (endsAt - Date.now()) / 3600000);
  return {
    loggedIn: true,
    state: hoursLeft < 24 ? 'soon' : 'ok',
    hoursLeft: Math.round(hoursLeft * 10) / 10,
    endsAt
  };
}

async function info(force) {
  if (!force && cache.data && Date.now() - cache.at < TTL) return cache.data;
  const [plex, queue] = await Promise.all([plexPrice(), skillQueue()]);
  cache = { at: Date.now(), data: { plex, queue, fetchedAt: Date.now() } };
  return cache.data;
}

module.exports = { info };
