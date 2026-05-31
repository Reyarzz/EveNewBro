const { app, BrowserWindow, globalShortcut, ipcMain, screen, shell } = require('electron');
const path = require('path');
const auth = require('./src/main/auth');
const esi = require('./src/main/esi');
const community = require('./src/main/community');
const market = require('./src/main/market');
const galaxy = require('./src/main/galaxy');
const zkill = require('./src/main/zkill');
const intel = require('./src/main/intel');
const notify = require('./src/main/notify');
const skills = require('./src/main/skills');
const industry = require('./src/main/industry');
const status = require('./src/main/status');
const contracts = require('./src/main/contracts');
const pilot = require('./src/main/pilot');
const news = require('./src/main/news');
const radar = require('./src/main/radar');
const career = require('./src/main/career');
const account = require('./src/main/account');
const corpwatch = require('./src/main/corpwatch');
const mail = require('./src/main/mail');
const edenSearch = require('./src/main/eden-search');
const store = require('./src/main/store');
const cfg = require('./config');

let overlayWindow = null;
let desktopWindow = null;

// When true, the overlay ignores mouse events so clicks pass through to the
// game underneath. We keep a small interactive strip (the header) by toggling
// this off whenever the cursor is over interactive UI (handled via IPC).
let clickThrough = false;

const PRELOAD = path.join(__dirname, 'preload.js');
const INDEX_HTML = path.join(__dirname, 'src', 'index.html');

function windowFromEvent(event) {
  return BrowserWindow.fromWebContents(event.sender);
}

// Per-window UI mode: 'overlay' (small, on top of game) or 'desktop' (large intel layout).
const winUiMode = new Map();

function getUiMode(win) {
  if (!win || win.isDestroyed()) return 'overlay';
  if (desktopWindow && !desktopWindow.isDestroyed() && win.id === desktopWindow.id) {
    return 'desktop';
  }
  return winUiMode.get(win.id) || 'overlay';
}

function saveWindowBounds(win) {
  if (!win || win.isDestroyed()) return;
  const b = win.getBounds();
  const key = getUiMode(win) === 'desktop' ? 'desktopBounds' : 'overlayBounds';
  store.saveSettings({ [key]: b });
}

function setUiMode(win, mode) {
  if (!win || win.isDestroyed()) return { mode: 'overlay' };
  const target = mode === 'desktop' ? 'desktop' : 'overlay';
  const current = getUiMode(win);
  if (current === target) return { mode: target };

  const bounds = win.getBounds();
  const display = screen.getDisplayMatching(bounds);
  const area = display.workArea;
  const settings = store.loadSettings();
  const isOverlayWin = overlayWindow && win.id === overlayWindow.id;

  if (target === 'desktop') {
    if (isOverlayWin && current === 'overlay') {
      store.saveSettings({ overlayBounds: bounds });
    }
    clickThrough = false;
    win.setIgnoreMouseEvents(false);
    win.webContents.send('click-through-changed', false);
    win.setAlwaysOnTop(false);
    win.setVisibleOnAllWorkspaces(false);
    const db = settings.desktopBounds || {};
    const w = db.width || Math.min(1400, Math.round(area.width * 0.88));
    const h = db.height || Math.min(900, Math.round(area.height * 0.88));
    const x = db.x != null ? db.x : area.x + Math.round((area.width - w) / 2);
    const y = db.y != null ? db.y : area.y + Math.round((area.height - h) / 2);
    win.setMinimumSize(720, 500);
    win.setBounds({ x, y, width: w, height: h });
  } else {
    if (isOverlayWin && current === 'desktop') {
      store.saveSettings({ desktopBounds: bounds });
    }
    const ob = settings.overlayBounds || {};
    win.setMinimumSize(360, 420);
    win.setAlwaysOnTop(true, 'screen-saver');
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    const w = ob.width || 430;
    const h = ob.height || 640;
    const x = ob.x != null ? ob.x : area.x + area.width - w - 20;
    const y = ob.y != null ? ob.y : 40;
    win.setBounds({ x, y, width: w, height: h });
  }

  winUiMode.set(win.id, target);
  win.webContents.send('shell:mode-changed', target);
  return { mode: target };
}

function windowMode(win) {
  return getUiMode(win);
}

function sharedWebPrefs(extra = {}) {
  return {
    preload: PRELOAD,
    contextIsolation: true,
    nodeIntegration: false,
    ...extra
  };
}

function createOverlay() {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.show();
    overlayWindow.focus();
    return overlayWindow;
  }

  const primary = screen.getPrimaryDisplay();
  const { width, height } = primary.workAreaSize;
  const saved = store.loadSettings().overlayBounds;

  overlayWindow = new BrowserWindow({
    width: saved?.width || 430,
    height: saved?.height || 640,
    minWidth: 360,
    minHeight: 420,
    x: saved?.x ?? width - 450,
    y: saved?.y ?? 40,
    frame: false,
    transparent: true,
    resizable: true,
    alwaysOnTop: true,
    skipTaskbar: false,
    hasShadow: false,
    webPreferences: sharedWebPrefs({ webviewTag: true })
  });

  overlayWindow.setAlwaysOnTop(true, 'screen-saver');
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlayWindow.loadFile(INDEX_HTML);

  overlayWindow.on('close', () => {
    overlayWindow = null;
  });
  overlayWindow.on('resized', () => saveWindowBounds(overlayWindow));
  overlayWindow.on('moved', () => saveWindowBounds(overlayWindow));

  if (process.argv.includes('--dev')) {
    overlayWindow.webContents.openDevTools({ mode: 'detach' });
  }
  return overlayWindow;
}

function pickDesktopDisplay() {
  const displays = screen.getAllDisplays();
  const primary = screen.getPrimaryDisplay();
  const external = displays.find((d) => d.id !== primary.id);
  return external || primary;
}

function createDesktop() {
  if (desktopWindow && !desktopWindow.isDestroyed()) {
    desktopWindow.show();
    desktopWindow.focus();
    return desktopWindow;
  }

  const target = pickDesktopDisplay();
  const area = target.workArea;
  const saved = store.loadSettings().desktopBounds;
  const w = saved?.width || Math.min(1500, Math.round(area.width * 0.88));
  const h = saved?.height || Math.min(950, Math.round(area.height * 0.88));
  const x = saved?.x ?? area.x + Math.round((area.width - w) / 2);
  const y = saved?.y ?? area.y + Math.round((area.height - h) / 2);

  desktopWindow = new BrowserWindow({
    width: w,
    height: h,
    minWidth: 720,
    minHeight: 500,
    x,
    y,
    frame: true,
    transparent: false,
    resizable: true,
    alwaysOnTop: false,
    title: 'EVE NewBro — Desktop Intel',
    backgroundColor: '#080d12',
    webPreferences: sharedWebPrefs({ webviewTag: true })
  });

  desktopWindow.loadFile(INDEX_HTML);
  desktopWindow.on('close', () => {
    desktopWindow = null;
  });
  desktopWindow.on('resized', () => {
    if (!desktopWindow || desktopWindow.isDestroyed()) return;
    store.saveSettings({ desktopBounds: desktopWindow.getBounds() });
  });
  desktopWindow.on('moved', () => {
    if (!desktopWindow || desktopWindow.isDestroyed()) return;
    store.saveSettings({ desktopBounds: desktopWindow.getBounds() });
  });

  if (process.argv.includes('--dev')) {
    desktopWindow.webContents.openDevTools({ mode: 'detach' });
  }
  return desktopWindow;
}

function registerShortcuts() {
  // Show / hide the overlay window.
  globalShortcut.register('Alt+E', () => {
    if (!overlayWindow || overlayWindow.isDestroyed()) return;
    if (overlayWindow.isVisible()) overlayWindow.hide();
    else overlayWindow.show();
  });

  // Toggle click-through on the overlay.
  globalShortcut.register('Alt+Shift+E', () => {
    if (!overlayWindow || overlayWindow.isDestroyed()) return;
    clickThrough = !clickThrough;
    overlayWindow.setIgnoreMouseEvents(clickThrough, { forward: true });
    overlayWindow.webContents.send('click-through-changed', clickThrough);
  });

  // Expand / compact the overlay window (large intel layout, not fullscreen).
  globalShortcut.register('Alt+Shift+D', () => {
    if (!overlayWindow || overlayWindow.isDestroyed()) return;
    const next = getUiMode(overlayWindow) === 'desktop' ? 'overlay' : 'desktop';
    setUiMode(overlayWindow, next);
  });
}

// Renderer asks us to enable/disable click-through dynamically (e.g. so the
// header stays draggable while the body lets clicks fall through when locked).
ipcMain.on('set-ignore-mouse', (event, ignore) => {
  const win = windowFromEvent(event);
  if (!win || win !== overlayWindow || overlayWindow.isDestroyed()) return;
  overlayWindow.setIgnoreMouseEvents(ignore, { forward: true });
});

// ---------- Window mode (overlay vs desktop) ----------
ipcMain.handle('shell:getMode', (event) => windowMode(windowFromEvent(event)));

ipcMain.handle('shell:toggleExpand', (event) => {
  const win = windowFromEvent(event);
  if (!win || win.isDestroyed()) return { mode: 'overlay' };
  if (desktopWindow && !desktopWindow.isDestroyed() && win.id === desktopWindow.id) {
    return { mode: 'desktop' };
  }
  const next = getUiMode(win) === 'desktop' ? 'overlay' : 'desktop';
  return setUiMode(win, next);
});

ipcMain.handle('shell:openDesktop', () => {
  createDesktop();
  return { ok: true };
});

ipcMain.handle('shell:openOverlay', () => {
  createOverlay();
  return { ok: true };
});

ipcMain.handle('shell:hide', (event) => {
  const win = windowFromEvent(event);
  if (win && !win.isDestroyed()) win.hide();
  return { ok: true };
});

// ---------- Auth / ESI IPC ----------

function authState(extra = {}) {
  const roster = auth.getRoster();
  return {
    configured: auth.isConfigured(),
    loggedIn: auth.hasStoredSession(),
    callbackUrl: cfg.CALLBACK_URL,
    scopes: cfg.SCOPES,
    roster,
    ...extra
  };
}

ipcMain.handle('auth:state', () => authState());

ipcMain.handle('auth:setClientId', (_event, clientId) => {
  auth.setClientId(clientId);
  return authState();
});

ipcMain.handle('auth:login', async () => {
  const access = await auth.interactiveLogin();
  return authState({ loggedIn: true, characterName: access.characterName });
});

ipcMain.handle('auth:logout', () => {
  auth.logout();
  return authState({ loggedIn: false });
});

ipcMain.handle('auth:roster', () => auth.getRoster());
ipcMain.handle('auth:setActive', (_event, id) => auth.setActiveCharacter(id));
ipcMain.handle('auth:removeChar', (_event, id) => auth.removeCharacter(id));

ipcMain.handle('open-external', (_event, url) => {
  if (typeof url === 'string' && /^https?:\/\//.test(url)) shell.openExternal(url);
});

ipcMain.handle('character:snapshot', async () => {
  const access = await auth.getValidAccess();
  if (!access) return { loggedIn: false };
  const snapshot = await esi.getCharacterSnapshot(access);
  return { loggedIn: true, snapshot };
});

// ---------- Community fits (EVE Workbench) ----------

ipcMain.handle('community:state', () => community.getState());

ipcMain.handle('community:setCreds', (_event, { clientId, apiKey }) => {
  community.setCreds(clientId, apiKey);
  return community.getState();
});

ipcMain.handle('community:refresh', async () => {
  await community.refresh();
  return community.getState();
});

ipcMain.handle('community:import', async (_event, linkOrId) => {
  await community.importFit(linkOrId);
  return community.getState();
});

// ---------- Market / trading (public data) ----------

ipcMain.handle('market:lookup', async (_event, name) => {
  return market.lookup(name);
});

ipcMain.handle('market:lookupById', async (_event, { id, name }) => {
  return market.lookupById(id, name);
});

ipcMain.handle('market:hubs', () => market.HUBS.map((h) => ({ key: h.key, name: h.name })));

ipcMain.handle('market:search', async (_event, query) => market.searchItems(query));

ipcMain.handle('market:catalogStatus', () => market.catalogStatus());

ipcMain.handle('market:getCatalog', () => market.getCatalog());

ipcMain.handle('market:buildCatalog', async () => {
  market.buildCatalog().catch(() => {});
  return market.catalogStatus();
});

ipcMain.handle('market:groupPrices', async (_event, typeIds) => market.groupPrices(typeIds));

// ---------- Galaxy / conflict map (public data) ----------

ipcMain.handle('galaxy:systemsStatus', () => galaxy.systemsStatus());

ipcMain.handle('galaxy:getSystems', () => galaxy.getSystems());

ipcMain.handle('galaxy:buildSystems', async () => galaxy.buildSystems());

ipcMain.handle('galaxy:live', async (_event, force) => galaxy.getLive(force));

// ---------- Live kills (zKillboard) ----------
ipcMain.handle('zkill:recent', (_event, limit) => zkill.recent(limit));

// ---------- Character / corp / alliance intel ----------
ipcMain.handle('intel:lookup', async (_event, name) => intel.lookup(name));
ipcMain.handle('intel:bulk', async (_event, names) => intel.bulkLookup(names));

// ---------- Route planner ----------
ipcMain.handle('galaxy:route', async (_event, { origin, dest, flag }) =>
  galaxy.route(origin, dest, flag)
);

// ---------- Deals scanner ----------
ipcMain.handle('market:deals', async (_event, typeIds) => market.deals(typeIds));
ipcMain.handle('market:dealsPreset', async () => market.dealsPresetIds());

// ---------- Skills + fit check ----------
ipcMain.handle('skills:plan', async (_event, { id, name, target }) =>
  skills.skillPlan(id, name, target)
);
ipcMain.handle('skills:fitCheck', async (_event, text) => skills.fitCheck(text));

// ---------- Industry ----------
ipcMain.handle('industry:status', () => industry.sdeStatus());
ipcMain.handle('industry:build', async () => industry.buildSde());
ipcMain.handle('industry:buildCost', async (_event, id) => industry.buildCost(id));
ipcMain.handle('industry:reprocess', async (_event, { id, yield: y }) =>
  industry.reprocess(id, y)
);
ipcMain.handle('industry:bestOre', async (_event, y) => industry.bestOre(y));

// ---------- Appraisal + watchlist ----------
ipcMain.handle('market:appraise', async (_event, text) => market.appraise(text));
ipcMain.handle('market:watchlist', async () => market.getWatchlist());
ipcMain.handle('market:addWatch', (_event, { id, name }) => market.addWatch(id, name));
ipcMain.handle('market:removeWatch', (_event, id) => market.removeWatch(id));
ipcMain.handle('market:setWatchTarget', (_event, { id, target, dir }) =>
  market.setWatchTarget(id, target, dir)
);

// ---------- Notifications ----------
ipcMain.handle('notify:getPrefs', () => notify.getPrefs());
ipcMain.handle('notify:setPrefs', (_event, patch) => notify.setPrefs(patch));

// ---------- Server status (Tranquility) ----------
ipcMain.handle('status:get', async () => status.getStatus());

// ---------- Public contracts ----------
ipcMain.handle('contracts:regions', () => contracts.REGIONS);
ipcMain.handle('contracts:search', async (_event, { regionId, type }) =>
  contracts.search(regionId, { type })
);
ipcMain.handle('contracts:scanDeals', async (_event, regionId) => contracts.scanDeals(regionId));

// ---------- Threat radar / ratting finder / route danger ----------
ipcMain.handle('radar:near', async (_event, range) => radar.radar(range));
ipcMain.handle('radar:ratting', async (_event, limit) => radar.ratting(limit));
ipcMain.handle('radar:hubDanger', async (_event, flag) => radar.hubDanger(flag));

// ---------- What can I afford & fly ----------
ipcMain.handle('skills:affordAndFly', async () => skills.affordAndFly());

// ---------- Career analytics + loss heatmap ----------
ipcMain.handle('career:analytics', async () => career.analytics());

// ---------- Pilot (assets / clones / losses) ----------
ipcMain.handle('pilot:assets', async () => pilot.assets());
ipcMain.handle('pilot:clones', async () => pilot.clones());
ipcMain.handle('pilot:losses', async () => pilot.losses());

// ---------- News feed ----------
ipcMain.handle('news:get', async () => news.getNews());
ipcMain.handle('news:getFeeds', () => news.getFeeds());
ipcMain.handle('news:setFeeds', (_event, feeds) => news.setFeeds(feeds));

// ---------- Notes scratchpad ----------
ipcMain.handle('notes:get', () => store.loadSettings().notes || '');
ipcMain.handle('notes:set', (_event, text) => {
  store.saveSettings({ notes: typeof text === 'string' ? text : '' });
  return true;
});

// ---------- Account hub (multi-char, assets, mail, corp) ----------
ipcMain.handle('account:overview', async () => account.overview());
ipcMain.handle('account:assets', async (_event, query) => account.consolidatedAssets(query));
ipcMain.handle('account:insights', async () => account.insights());
ipcMain.handle('corpwatch:monitor', async (_event, corpId) => corpwatch.monitor(corpId));
ipcMain.handle('corpwatch:lookup', async (_event, name) => corpwatch.lookupByName(name));
ipcMain.handle('mail:labels', async (_event, charId) => mail.labels(charId));
ipcMain.handle('mail:list', async (_event, { charId, labelIds, page }) =>
  mail.listMail(charId, labelIds, page)
);
ipcMain.handle('mail:read', async (_event, { charId, mailId }) => mail.readMail(charId, mailId));
ipcMain.handle('mail:send', async (_event, payload) => mail.sendMail(payload.charId, payload));

// ---------- New Eden search ----------
ipcMain.handle('eden:search', async (_event, query) => {
  try {
    return await edenSearch.search(query);
  } catch (err) {
    return { query: String(query || '').trim(), groups: [], error: err.message || String(err) };
  }
});

// Windows taskbar / Start menu grouping (matches packaged appId).
if (process.platform === 'win32') {
  app.setAppUserModelId('com.evenewbro.overlay');
}

app.whenReady().then(() => {
  // Try to silently refresh an existing session so the Me tab is ready.
  auth.refreshAccessToken().catch(() => {});
  // Refresh community fits in the background if stale (daily cadence).
  community.ensureFresh();
  // Start the live kill feed + background notification checks.
  zkill.start();
  notify.start();
  createOverlay();
  registerShortcuts();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createOverlay();
  });

  // Launch expanded (large intel layout) in the same window (npm run desktop).
  if (process.argv.includes('--desktop')) {
    const win = createOverlay();
    setUiMode(win, 'desktop');
  }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
