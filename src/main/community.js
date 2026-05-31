// Community / EVE Workbench fits via their rebuilt v1 API
// (https://api.eveworkbench.com). Auth header: X-API-KEY: <apiKey>.
//
// IMPORTANT: the v1 API has NO public "browse all community fits by ship"
// endpoint. What we can do with an application API key:
//   GET /v1/fits/list                -> the API key owner's OWN saved fits
//   GET /v1/fits/{id}                 -> a single public fit (name, ship, ...)
//   GET /v1/fits/{id}/eft             -> importable EFT for a fit
//
// So we (a) sync the owner's own EWB fits daily, and (b) let the user import any
// community fit by pasting its EVE Workbench link / id.

const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const store = require('./store');
const cfg = require('../../config');

const API_BASE = 'https://api.eveworkbench.com';
const FIT_PAGE_BASE = 'https://eveworkbench.com/fitting';
const STALE_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX_FITS = 60;

// Known beginner ships: typeId -> metadata, to enrich fits we recognize.
const SHIP_META = {
  605: { faction: 'Caldari', hull: 'Frigate', category: 'Exploration' },
  607: { faction: 'Gallente', hull: 'Frigate', category: 'Exploration' },
  586: { faction: 'Minmatar', hull: 'Frigate', category: 'Exploration' },
  29248: { faction: 'Amarr', hull: 'Frigate', category: 'Exploration' },
  32880: { faction: 'ORE', hull: 'Frigate', category: 'Mining' },
  17480: { faction: 'ORE', hull: 'Mining Barge', category: 'Mining' },
  32872: { faction: 'Gallente', hull: 'Destroyer', category: 'Missions' },
  16236: { faction: 'Amarr', hull: 'Destroyer', category: 'Missions' },
  626: { faction: 'Gallente', hull: 'Cruiser', category: 'Missions' },
  621: { faction: 'Caldari', hull: 'Cruiser', category: 'Missions' },
  629: { faction: 'Minmatar', hull: 'Cruiser', category: 'Ratting' },
  587: { faction: 'Minmatar', hull: 'Frigate', category: 'PvP' },
  603: { faction: 'Caldari', hull: 'Frigate', category: 'PvP' },
  593: { faction: 'Gallente', hull: 'Frigate', category: 'PvP' },
  597: { faction: 'Amarr', hull: 'Frigate', category: 'PvP' },
  602: { faction: 'Caldari', hull: 'Frigate', category: 'PvP' }
};

let refreshing = false;
let resolvedMode = null;

function cacheFilePath() {
  return path.join(app.getPath('userData'), 'community-fits.json');
}
function importsFilePath() {
  return path.join(app.getPath('userData'), 'imported-fits.json');
}

function getCreds() {
  const s = store.loadSettings();
  return {
    clientId: (s.ewbClientId || cfg.EWB_CLIENT_ID || '').trim(),
    apiKey: (s.ewbApiKey || cfg.EWB_API_KEY || '').trim()
  };
}

function isConfigured() {
  return !!getCreds().apiKey;
}

function setCreds(clientId, apiKey) {
  store.saveSettings({
    ewbClientId: (clientId || '').trim(),
    ewbApiKey: (apiKey || '').trim(),
    ewbAuthMode: ''
  });
  resolvedMode = null;
}

// X-API-KEY is the documented scheme; the others are safety fallbacks.
const AUTH_MODES = ['xapikey', 'bearer', 'basic-keyonly', 'basic-pair'];

function buildAuthHeaders(mode) {
  const { clientId, apiKey } = getCreds();
  switch (mode) {
    case 'xapikey':
      return { 'X-API-KEY': apiKey };
    case 'bearer':
      return { Authorization: `Bearer ${apiKey}` };
    case 'basic-keyonly':
      return { Authorization: 'Basic ' + Buffer.from(`${apiKey}:`).toString('base64') };
    case 'basic-pair':
      return clientId
        ? { Authorization: 'Basic ' + Buffer.from(`${clientId}:${apiKey}`).toString('base64') }
        : null;
    default:
      return null;
  }
}

async function rawGet(pathname, headers) {
  return fetch(API_BASE + pathname, {
    headers: { Accept: 'application/json', 'User-Agent': cfg.USER_AGENT, ...headers }
  });
}

async function resolveAuthMode() {
  const saved = store.loadSettings().ewbAuthMode;
  const order = saved ? [saved, ...AUTH_MODES.filter((m) => m !== saved)] : AUTH_MODES;
  let lastStatus = null;
  for (const mode of order) {
    const headers = buildAuthHeaders(mode);
    if (!headers) continue;
    try {
      const res = await rawGet('/v1/fits/list?onlyAbyssTracker=false', headers);
      if (res.ok) {
        if (saved !== mode) store.saveSettings({ ewbAuthMode: mode });
        return mode;
      }
      lastStatus = res.status;
    } catch (_e) {
      /* try next */
    }
  }
  throw new Error(
    `EVE Workbench rejected the API key (last status ${lastStatus ?? 'n/a'}).`
  );
}

async function ewbGetJson(pathname) {
  if (!resolvedMode) resolvedMode = await resolveAuthMode();
  let res = await rawGet(pathname, buildAuthHeaders(resolvedMode));
  if ((res.status === 401 || res.status === 403) ) {
    resolvedMode = await resolveAuthMode();
    res = await rawGet(pathname, buildAuthHeaders(resolvedMode));
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`EWB ${pathname} -> ${res.status} ${body.slice(0, 140)}`);
  }
  return res.json();
}

function extractUuid(input) {
  const m = String(input || '').match(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
  );
  return m ? m[0] : null;
}

// Build a display fit object from an EWB Fit + its EFT text.
function mapFit(fit, eft, opts = {}) {
  const ship = fit.ship || {};
  const typeId = ship.typeId || null;
  const meta = (typeId && SHIP_META[typeId]) || {};
  return {
    id: `ewb-${fit.id}`,
    name: fit.name || `${ship.name || 'Unknown'} fit`,
    ship: ship.name || 'Unknown',
    shipTypeId: typeId,
    faction: meta.faction || null,
    hull: meta.hull || null,
    category: meta.category || 'Community',
    difficulty: null,
    isk: null,
    tags: [],
    role: opts.imported ? 'Imported from EVE Workbench.' : 'Shared on EVE Workbench.',
    notes: opts.imported
      ? 'You imported this fit by link/ID.'
      : 'From your EVE Workbench account.',
    eft: (eft || '').trim(),
    source: 'EVE Workbench',
    author: null,
    url: `${FIT_PAGE_BASE}/${fit.id}`
  };
}

async function fetchEft(fitId) {
  try {
    const json = await ewbGetJson(`/v1/fits/${fitId}/eft`);
    return json && json.eft ? json.eft : '';
  } catch (_e) {
    return '';
  }
}

function readCache() {
  try {
    const f = cacheFilePath();
    if (!fs.existsSync(f)) return { fetchedAt: 0, fits: [] };
    return JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch (_e) {
    return { fetchedAt: 0, fits: [] };
  }
}
function writeCache(fits) {
  const payload = { fetchedAt: Date.now(), fits };
  try {
    fs.writeFileSync(cacheFilePath(), JSON.stringify(payload), 'utf8');
  } catch (_e) {}
  return payload;
}
function readImports() {
  try {
    const f = importsFilePath();
    if (!fs.existsSync(f)) return [];
    return JSON.parse(fs.readFileSync(f, 'utf8')).fits || [];
  } catch (_e) {
    return [];
  }
}
function writeImports(fits) {
  try {
    fs.writeFileSync(importsFilePath(), JSON.stringify({ fits }), 'utf8');
  } catch (_e) {}
}

async function writeDebug(extra) {
  const info = { ...extra };
  try {
    fs.writeFileSync(
      path.join(__dirname, '..', '..', 'ewb-debug.json'),
      JSON.stringify(info, null, 2),
      'utf8'
    );
  } catch (_e) {}
}

// Sync the API key owner's own EVE Workbench fits.
async function refresh() {
  if (!isConfigured()) throw new Error('EVE Workbench API key not set.');
  if (refreshing) return getState();
  refreshing = true;
  try {
    const listResp = await ewbGetJson('/v1/fits/list?onlyAbyssTracker=false');
    const rawFits = (listResp && listResp.fits) || [];
    await writeDebug({
      endpoint: '/v1/fits/list',
      ownFitCount: rawFits.length,
      sampleNames: rawFits.slice(0, 5).map((f) => f && f.name)
    });

    const out = [];
    for (const fit of rawFits.slice(0, MAX_FITS)) {
      if (!fit || !fit.id) continue;
      const eft = await fetchEft(fit.id);
      out.push(mapFit(fit, eft));
    }
    return writeCache(out);
  } finally {
    refreshing = false;
  }
}

// Import a single community fit by EVE Workbench link or id.
async function importFit(linkOrId) {
  if (!isConfigured()) throw new Error('EVE Workbench API key not set.');
  const id = extractUuid(linkOrId);
  if (!id) throw new Error('Could not find a fit ID in that link. Paste the full EVE Workbench fit URL.');
  const fitResp = await ewbGetJson(`/v1/fits/${id}`);
  if (!fitResp || fitResp.error) {
    throw new Error((fitResp && fitResp.message) || 'Fit not found.');
  }
  const eft = await fetchEft(id);
  const mapped = mapFit({ id, name: fitResp.name, ship: fitResp.ship }, eft, { imported: true });

  const imports = readImports().filter((f) => f.id !== mapped.id);
  imports.unshift(mapped);
  writeImports(imports);
  return mapped;
}

function isStale() {
  return Date.now() - readCache().fetchedAt > STALE_MS;
}

function ensureFresh() {
  if (!isConfigured()) return;
  if (isStale()) refresh().catch(() => {});
}

function getState() {
  const cache = readCache();
  const imported = readImports();
  const fits = [...imported, ...cache.fits];
  return {
    configured: isConfigured(),
    fetchedAt: cache.fetchedAt,
    count: fits.length,
    ownCount: cache.fits.length,
    importedCount: imported.length,
    stale: isStale(),
    fits
  };
}

module.exports = {
  isConfigured,
  setCreds,
  refresh,
  importFit,
  ensureFresh,
  getState
};
