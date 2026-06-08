const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('shell', {
  getMode: () => ipcRenderer.invoke('shell:getMode'),
  toggleExpand: () => ipcRenderer.invoke('shell:toggleExpand'),
  openDesktop: () => ipcRenderer.invoke('shell:openDesktop'),
  openOverlay: () => ipcRenderer.invoke('shell:openOverlay'),
  hide: () => ipcRenderer.invoke('shell:hide'),
  onModeChanged: (callback) =>
    ipcRenderer.on('shell:mode-changed', (_event, mode) => callback(mode))
});

contextBridge.exposeInMainWorld('overlay', {
  // Let the renderer request click-through changes when the cursor enters or
  // leaves interactive regions while the overlay is "locked".
  setIgnoreMouse: (ignore) => ipcRenderer.send('set-ignore-mouse', ignore),
  onClickThroughChanged: (callback) =>
    ipcRenderer.on('click-through-changed', (_event, value) => callback(value))
});

contextBridge.exposeInMainWorld('eve', {
  authState: () => ipcRenderer.invoke('auth:state'),
  setClientId: (id) => ipcRenderer.invoke('auth:setClientId', id),
  login: () => ipcRenderer.invoke('auth:login'),
  logout: () => ipcRenderer.invoke('auth:logout'),
  roster: () => ipcRenderer.invoke('auth:roster'),
  setActive: (id) => ipcRenderer.invoke('auth:setActive', id),
  removeChar: (id) => ipcRenderer.invoke('auth:removeChar', id),
  getSnapshot: () => ipcRenderer.invoke('character:snapshot'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url)
});

contextBridge.exposeInMainWorld('accountHub', {
  overview: () => ipcRenderer.invoke('account:overview'),
  assets: (query) => ipcRenderer.invoke('account:assets', query),
  insights: () => ipcRenderer.invoke('account:insights')
});

contextBridge.exposeInMainWorld('corpwatch', {
  monitor: (corpId) => ipcRenderer.invoke('corpwatch:monitor', corpId),
  lookup: (name) => ipcRenderer.invoke('corpwatch:lookup', name)
});

contextBridge.exposeInMainWorld('eveMail', {
  labels: (charId) => ipcRenderer.invoke('mail:labels', charId),
  list: (charId, labelIds, page) =>
    ipcRenderer.invoke('mail:list', { charId, labelIds, page }),
  read: (charId, mailId) => ipcRenderer.invoke('mail:read', { charId, mailId }),
  send: (charId, recipientId, subject, body) =>
    ipcRenderer.invoke('mail:send', { charId, recipientId, subject, body })
});

contextBridge.exposeInMainWorld('eden', {
  search: (query) => ipcRenderer.invoke('eden:search', query)
});

contextBridge.exposeInMainWorld('ops', {
  routeBrief: (from, to, flag) => ipcRenderer.invoke('ops:routeBrief', { from, to, flag }),
  situational: (range) => ipcRenderer.invoke('ops:situational', range),
  careerStats: () => ipcRenderer.invoke('ops:careerStats'),
  killmailAnalyze: (input) => ipcRenderer.invoke('ops:killmailAnalyze', input),
  courierBoard: (regionId) => ipcRenderer.invoke('ops:courierBoard', regionId),
  whGet: () => ipcRenderer.invoke('ops:whGet'),
  whAdd: (link) => ipcRenderer.invoke('ops:whAdd', link),
  whRemove: (id) => ipcRenderer.invoke('ops:whRemove', id),
  whClear: () => ipcRenderer.invoke('ops:whClear'),
  fleetRollup: (text) => ipcRenderer.invoke('ops:fleetRollup', text),
  arbitragePro: (flag) => ipcRenderer.invoke('ops:arbitragePro', flag),
  fitLogistics: (eft) => ipcRenderer.invoke('ops:fitLogistics', eft),
  gateCamps: () => ipcRenderer.invoke('ops:gateCamps')
});

contextBridge.exposeInMainWorld('community', {
  state: () => ipcRenderer.invoke('community:state'),
  setCreds: (clientId, apiKey) =>
    ipcRenderer.invoke('community:setCreds', { clientId, apiKey }),
  refresh: () => ipcRenderer.invoke('community:refresh'),
  importFit: (linkOrId) => ipcRenderer.invoke('community:import', linkOrId)
});

contextBridge.exposeInMainWorld('market', {
  lookup: (name) => ipcRenderer.invoke('market:lookup', name),
  lookupById: (id, name) => ipcRenderer.invoke('market:lookupById', { id, name }),
  hubs: () => ipcRenderer.invoke('market:hubs'),
  search: (query) => ipcRenderer.invoke('market:search', query),
  catalogStatus: () => ipcRenderer.invoke('market:catalogStatus'),
  getCatalog: () => ipcRenderer.invoke('market:getCatalog'),
  buildCatalog: () => ipcRenderer.invoke('market:buildCatalog'),
  groupPrices: (typeIds) => ipcRenderer.invoke('market:groupPrices', typeIds)
});

contextBridge.exposeInMainWorld('galaxy', {
  systemsStatus: () => ipcRenderer.invoke('galaxy:systemsStatus'),
  getSystems: () => ipcRenderer.invoke('galaxy:getSystems'),
  buildSystems: () => ipcRenderer.invoke('galaxy:buildSystems'),
  live: (force) => ipcRenderer.invoke('galaxy:live', force)
});

contextBridge.exposeInMainWorld('zkill', {
  recent: (limit) => ipcRenderer.invoke('zkill:recent', limit)
});

contextBridge.exposeInMainWorld('intel', {
  lookup: (name) => ipcRenderer.invoke('intel:lookup', name),
  bulk: (names) => ipcRenderer.invoke('intel:bulk', names)
});

contextBridge.exposeInMainWorld('route', {
  find: (origin, dest, flag) => ipcRenderer.invoke('galaxy:route', { origin, dest, flag })
});

contextBridge.exposeInMainWorld('deals', {
  scan: (typeIds) => ipcRenderer.invoke('market:deals', typeIds),
  preset: () => ipcRenderer.invoke('market:dealsPreset')
});

contextBridge.exposeInMainWorld('skills', {
  plan: (id, name, target) => ipcRenderer.invoke('skills:plan', { id, name, target }),
  fitCheck: (text) => ipcRenderer.invoke('skills:fitCheck', text)
});

contextBridge.exposeInMainWorld('industry', {
  status: () => ipcRenderer.invoke('industry:status'),
  build: () => ipcRenderer.invoke('industry:build'),
  buildCost: (id) => ipcRenderer.invoke('industry:buildCost', id),
  reprocess: (id, y) => ipcRenderer.invoke('industry:reprocess', { id, yield: y }),
  bestOre: (y) => ipcRenderer.invoke('industry:bestOre', y)
});

contextBridge.exposeInMainWorld('appraise', {
  run: (text) => ipcRenderer.invoke('market:appraise', text)
});

contextBridge.exposeInMainWorld('watch', {
  list: () => ipcRenderer.invoke('market:watchlist'),
  add: (id, name) => ipcRenderer.invoke('market:addWatch', { id, name }),
  remove: (id) => ipcRenderer.invoke('market:removeWatch', id),
  setTarget: (id, target, dir) =>
    ipcRenderer.invoke('market:setWatchTarget', { id, target, dir })
});

contextBridge.exposeInMainWorld('notify', {
  getPrefs: () => ipcRenderer.invoke('notify:getPrefs'),
  setPrefs: (patch) => ipcRenderer.invoke('notify:setPrefs', patch)
});

contextBridge.exposeInMainWorld('serverStatus', {
  get: () => ipcRenderer.invoke('status:get')
});

contextBridge.exposeInMainWorld('contracts', {
  regions: () => ipcRenderer.invoke('contracts:regions'),
  search: (regionId, type) => ipcRenderer.invoke('contracts:search', { regionId, type }),
  scanDeals: (regionId) => ipcRenderer.invoke('contracts:scanDeals', regionId)
});

contextBridge.exposeInMainWorld('radar', {
  near: (range) => ipcRenderer.invoke('radar:near', range),
  ratting: (limit) => ipcRenderer.invoke('radar:ratting', limit),
  hubDanger: (flag) => ipcRenderer.invoke('radar:hubDanger', flag)
});

contextBridge.exposeInMainWorld('hangar', {
  affordAndFly: () => ipcRenderer.invoke('skills:affordAndFly')
});

contextBridge.exposeInMainWorld('career', {
  analytics: () => ipcRenderer.invoke('career:analytics')
});

contextBridge.exposeInMainWorld('pilot', {
  assets: () => ipcRenderer.invoke('pilot:assets'),
  clones: () => ipcRenderer.invoke('pilot:clones'),
  losses: () => ipcRenderer.invoke('pilot:losses')
});

contextBridge.exposeInMainWorld('news', {
  get: () => ipcRenderer.invoke('news:get'),
  getFeeds: () => ipcRenderer.invoke('news:getFeeds'),
  setFeeds: (feeds) => ipcRenderer.invoke('news:setFeeds', feeds)
});

contextBridge.exposeInMainWorld('notes', {
  get: () => ipcRenderer.invoke('notes:get'),
  set: (text) => ipcRenderer.invoke('notes:set', text)
});
