// Local intel-channel watcher.
//
// EVE writes every chat channel to Documents\EVE\logs\Chatlogs as UTF-16LE
// text. We tail channels whose name looks like an intel channel (or any the
// player adds), match reported system names against the stargate graph, and
// raise an alert when a report lands within N jumps of the pilot's location.
// Everything is read locally — no chat data leaves the machine.

const fs = require('fs');
const path = require('path');
const { app, Notification, BrowserWindow } = require('electron');
const cfg = require('../../config');
const auth = require('./auth');
const galaxy = require('./galaxy');

const POLL_MS = 5000;
const LOCATION_TTL = 60 * 1000;
const FILE_FRESH_MS = 30 * 60 * 1000; // only tail files written in the last 30 min
const ALERT_COOLDOWN_MS = 3 * 60 * 1000; // per system

const DEFAULT_PREFS = {
  enabled: true,
  jumps: 5,
  channels: '' // extra channel-name fragments, comma separated ("intel" always matches)
};

let timer = null;
let offsets = new Map(); // file path -> byte offset already read
let cooldown = new Map(); // system id -> last alert ts
let nameIndex = null; // lowercase system name -> id
let location = { at: 0, systemId: null };
let distMap = null; // systemId -> jumps from player (BFS, bounded)
let distOrigin = null;
let lastStatus = { watching: [], lastEventAt: 0 };

function chatlogDir() {
  return path.join(app.getPath('documents'), 'EVE', 'logs', 'Chatlogs');
}

function getPrefs() {
  const s = require('./store').loadSettings();
  return { ...DEFAULT_PREFS, ...(s.intelWatch || {}) };
}

function setPrefs(patch) {
  const next = { ...getPrefs(), ...(patch || {}) };
  next.jumps = Math.max(1, Math.min(10, Number(next.jumps) || 5));
  require('./store').saveSettings({ intelWatch: next });
  return next;
}

function systemIndex() {
  if (nameIndex) return nameIndex;
  const sys = galaxy.getSystems();
  if (!sys || !sys.systems) return null;
  nameIndex = new Map();
  Object.keys(sys.systems).forEach((id) => {
    nameIndex.set(sys.systems[id].n.toLowerCase(), Number(id));
  });
  return nameIndex;
}

async function refreshLocation() {
  if (Date.now() - location.at < LOCATION_TTL) return location.systemId;
  const access = await auth.getValidAccess().catch(() => null);
  if (!access) {
    location = { at: Date.now(), systemId: null };
    return null;
  }
  const res = await fetch(`${cfg.ESI_BASE}/characters/${access.characterId}/location/`, {
    headers: {
      Accept: 'application/json',
      'User-Agent': cfg.USER_AGENT,
      Authorization: `Bearer ${access.token}`
    }
  }).catch(() => null);
  const data = res && res.ok ? await res.json().catch(() => null) : null;
  location = { at: Date.now(), systemId: (data && data.solar_system_id) || null };
  return location.systemId;
}

function bfsWithin(adj, originId, maxJumps) {
  const dist = { [originId]: 0 };
  let frontier = [originId];
  for (let d = 1; d <= maxJumps; d++) {
    const next = [];
    frontier.forEach((id) => {
      (adj[id] || []).forEach((nb) => {
        if (dist[nb] === undefined) {
          dist[nb] = d;
          next.push(nb);
        }
      });
    });
    frontier = next;
    if (!frontier.length) break;
  }
  return dist;
}

function ensureDistMap(originId, maxJumps) {
  if (distMap && distOrigin === `${originId}:${maxJumps}`) return distMap;
  const adj = galaxy.getAdjacency();
  if (!adj || !Object.keys(adj).length) return null;
  distMap = bfsWithin(adj, originId, maxJumps);
  distOrigin = `${originId}:${maxJumps}`;
  return distMap;
}

// "Old Man Star_20260609_221432_12345678.txt" -> "old man star"
function channelFromFile(file) {
  return file
    .replace(/\.txt$/i, '')
    .replace(/_\d{8}_\d{6}(_\d+)?$/, '')
    .toLowerCase();
}

function channelMatches(channel, prefs) {
  if (channel.includes('intel')) return true;
  return String(prefs.channels || '')
    .split(',')
    .map((c) => c.trim().toLowerCase())
    .filter(Boolean)
    .some((frag) => channel.includes(frag));
}

// Match 1..3-word token grams against system names ("M-OEE8", "Old Man Star").
function systemsInMessage(message, idx) {
  const tokens = message.split(/[^A-Za-z0-9'.\-]+/).filter((t) => t.length >= 2);
  const found = new Set();
  for (let i = 0; i < tokens.length; i++) {
    for (let n = 1; n <= 3 && i + n <= tokens.length; n++) {
      const gram = tokens.slice(i, i + n).join(' ').toLowerCase();
      const id = idx.get(gram);
      if (id) found.add(id);
    }
  }
  return [...found];
}

// "[ 2026.06.09 22:14:32 ] Pilot Name > message"
const LINE_RE = /^\[\s*[\d.]+\s+[\d:]+\s*\]\s*(.+?)\s*>\s*(.+)$/;

function parseLines(text) {
  return text
    .replace(/\u0000|\uFEFF/g, '')
    .split(/\r?\n/)
    .map((l) => LINE_RE.exec(l.trim()))
    .filter(Boolean)
    .map((m) => ({ author: m[1], message: m[2] }))
    .filter((e) => e.author.toLowerCase() !== 'eve system');
}

function broadcast(payload) {
  BrowserWindow.getAllWindows().forEach((w) => {
    if (!w.isDestroyed()) w.webContents.send('intelwatch:alert', payload);
  });
}

function alert(entry, sysInfo, jumps, channel) {
  const now = Date.now();
  if (cooldown.has(sysInfo.id) && now - cooldown.get(sysInfo.id) < ALERT_COOLDOWN_MS) return;
  cooldown.set(sysInfo.id, now);
  lastStatus.lastEventAt = now;

  const where = jumps === 0 ? 'YOUR SYSTEM' : `${jumps} jump${jumps === 1 ? '' : 's'} away`;
  const title = `Intel: ${sysInfo.name} — ${where}`;
  const body = `${entry.author} in ${channel}: ${entry.message.slice(0, 120)}`;
  try {
    if (Notification.isSupported()) {
      new Notification({ title, body, urgency: 'critical' }).show();
    }
  } catch (_e) {
    /* ignore */
  }
  broadcast({
    system: sysInfo,
    jumps,
    channel,
    author: entry.author,
    message: entry.message,
    at: now
  });
}

async function readNew(filePath) {
  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch (_e) {
    return '';
  }
  const prev = offsets.get(filePath);
  if (prev === undefined) {
    offsets.set(filePath, stat.size); // first sighting: skip history, tail from here
    return '';
  }
  if (stat.size <= prev) {
    if (stat.size < prev) offsets.set(filePath, stat.size); // rotated/truncated
    return '';
  }
  const fd = fs.openSync(filePath, 'r');
  try {
    const buf = Buffer.alloc(stat.size - prev);
    fs.readSync(fd, buf, 0, buf.length, prev);
    offsets.set(filePath, stat.size);
    return buf.toString('utf16le');
  } finally {
    fs.closeSync(fd);
  }
}

async function poll() {
  const prefs = getPrefs();
  if (!prefs.enabled) return;

  const dir = chatlogDir();
  let files;
  try {
    files = fs.readdirSync(dir);
  } catch (_e) {
    return; // no EVE logs on this machine (or logging disabled in EVE settings)
  }

  const now = Date.now();
  const watched = [];
  const fresh = [];
  for (const f of files) {
    if (!f.toLowerCase().endsWith('.txt')) continue;
    const channel = channelFromFile(f);
    if (!channelMatches(channel, prefs)) continue;
    const full = path.join(dir, f);
    let stat;
    try {
      stat = fs.statSync(full);
    } catch (_e) {
      continue;
    }
    if (now - stat.mtimeMs > FILE_FRESH_MS) continue;
    watched.push(channel);
    fresh.push({ full, channel });
  }
  lastStatus.watching = [...new Set(watched)];
  if (!fresh.length) return;

  const idx = systemIndex();
  if (!idx) return; // galaxy systems not built yet

  // Collect new lines first so a slow ESI call can't make us re-read bytes.
  const events = [];
  for (const { full, channel } of fresh) {
    const text = await readNew(full);
    if (!text) continue;
    parseLines(text).forEach((entry) => events.push({ entry, channel }));
  }
  if (!events.length) return;

  const originId = await refreshLocation();
  if (!originId) return; // needs SSO login to know "near me"
  const dist = ensureDistMap(originId, getPrefs().jumps);
  if (!dist) return;

  const sys = galaxy.getSystems();
  for (const { entry, channel } of events) {
    for (const id of systemsInMessage(entry.message, idx)) {
      const jumps = dist[id];
      if (jumps === undefined) continue; // outside alert radius
      const s = sys.systems[id];
      alert(
        entry,
        { id, name: s.n, sec: s.s, region: sys.regions[s.r] || '' },
        jumps,
        channel
      );
    }
  }
}

function status() {
  const prefs = getPrefs();
  let dirExists = false;
  try {
    dirExists = fs.existsSync(chatlogDir());
  } catch (_e) {
    /* ignore */
  }
  return {
    ...prefs,
    dir: chatlogDir(),
    dirExists,
    watching: lastStatus.watching,
    lastEventAt: lastStatus.lastEventAt,
    locationKnown: !!location.systemId
  };
}

function start() {
  if (timer) return;
  timer = setInterval(() => poll().catch(() => {}), POLL_MS);
}

module.exports = { start, getPrefs, setPrefs, status };
