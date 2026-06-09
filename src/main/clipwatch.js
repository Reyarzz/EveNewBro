// Clipboard quick-actions: detect EVE-shaped text on the clipboard and offer
// one-tap actions in the overlay (appraise loot, check a fit, system intel).
// Local only — clipboard contents never leave the machine.

const { clipboard, BrowserWindow } = require('electron');
const store = require('./store');
const galaxy = require('./galaxy');

const POLL_MS = 2500;
const MAX_LEN = 100000;

let timer = null;
let lastText = null; // last clipboard text we saw (seeded on first poll)
let nameIndex = null; // lowercase system name -> id

function enabled() {
  const s = store.loadSettings();
  const prefs = s.notifyPrefs || {};
  return prefs.clipboardActions !== false; // default on
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

// EFT fits start with "[Hull, Fit name]".
function looksLikeFit(lines) {
  return /^\s*\[[^,\[\]]+,[^\]]*\]\s*$/.test(lines[0] || '');
}

// Item lists: inventory copy is tab-separated; shopping lists are
// "Item Name" or "Item Name x3" / "Item Name 3" per line.
function looksLikeItemList(lines) {
  if (lines.length < 2 || lines.length > 400) return false;
  let hits = 0;
  for (const line of lines) {
    if (line.includes('\t')) hits++;
    else if (/^[A-Za-z'][\w'.,\- ]{2,60}(\s+x?\d[\d,]*)?$/.test(line.trim())) hits++;
  }
  return hits >= Math.max(2, Math.ceil(lines.length * 0.7));
}

function detect(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return null;

  if (looksLikeFit(lines)) {
    return { kind: 'fit', text };
  }

  if (lines.length === 1) {
    const single = lines[0].trim();
    if (single.length <= 30) {
      const idx = systemIndex();
      const id = idx && idx.get(single.toLowerCase());
      if (id) {
        const sys = galaxy.getSystems();
        const s = sys.systems[id];
        return {
          kind: 'system',
          text: single,
          system: {
            id,
            name: s.n,
            sec: s.s,
            region: sys.regions[s.r] || ''
          }
        };
      }
    }
    return null;
  }

  if (looksLikeItemList(lines)) {
    return { kind: 'items', text };
  }
  return null;
}

function broadcast(payload) {
  BrowserWindow.getAllWindows().forEach((w) => {
    if (!w.isDestroyed()) w.webContents.send('clip:detected', payload);
  });
}

function poll() {
  if (!enabled()) return;
  let text;
  try {
    text = clipboard.readText();
  } catch (_e) {
    return;
  }
  if (typeof text !== 'string' || text.length === 0 || text.length > MAX_LEN) {
    return;
  }
  if (lastText === null) {
    lastText = text; // seed silently: don't alert on whatever was copied pre-launch
    return;
  }
  if (text === lastText) return;
  lastText = text;

  const hit = detect(text);
  if (hit) broadcast(hit);
}

function start() {
  if (timer) return;
  timer = setInterval(poll, POLL_MS);
}

module.exports = { start };
