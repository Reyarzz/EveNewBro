// Tranquility server status (public ESI `/status/`).
// Player count, server version, and VIP/startup state — refreshed on demand.

const cfg = require('../../config');

async function getStatus() {
  try {
    const res = await fetch(cfg.ESI_BASE + '/status/', {
      headers: { Accept: 'application/json', 'User-Agent': cfg.USER_AGENT }
    });
    if (!res.ok) return { online: false, error: `TQ ${res.status}` };
    const j = await res.json();
    return {
      online: true,
      players: j.players || 0,
      version: j.server_version || '',
      vip: !!j.vip,
      startTime: j.start_time || null,
      fetchedAt: Date.now()
    };
  } catch (e) {
    return { online: false, error: e.message || String(e) };
  }
}

module.exports = { getStatus };
