// Encrypted multi-character roster (one refresh token per logged-in alt).

const fs = require('fs');
const path = require('path');
const { app, safeStorage } = require('electron');

function rosterPath() {
  return path.join(app.getPath('userData'), 'eve-roster.json');
}

function encryptToken(token) {
  if (safeStorage && safeStorage.isEncryptionAvailable()) {
    return { enc: true, data: safeStorage.encryptString(token).toString('base64') };
  }
  return { enc: false, data: token };
}

function decryptToken(payload) {
  if (!payload) return null;
  if (payload.enc) {
    if (!safeStorage || !safeStorage.isEncryptionAvailable()) return null;
    return safeStorage.decryptString(Buffer.from(payload.data, 'base64'));
  }
  return payload.data;
}

function loadRoster() {
  try {
    const f = rosterPath();
    if (!fs.existsSync(f)) return { activeId: null, characters: [] };
    const raw = JSON.parse(fs.readFileSync(f, 'utf8'));
    return {
      activeId: raw.activeId || null,
      characters: Array.isArray(raw.characters) ? raw.characters : []
    };
  } catch (_e) {
    return { activeId: null, characters: [] };
  }
}

function saveRoster(roster) {
  const payload = {
    activeId: roster.activeId || null,
    characters: (roster.characters || []).map((c) => ({
      id: c.id,
      name: c.name,
      token: c.token
    }))
  };
  fs.writeFileSync(rosterPath(), JSON.stringify(payload), 'utf8');
}

function listCharacters() {
  const r = loadRoster();
  return r.characters.map((c) => ({ id: c.id, name: c.name }));
}

function getActiveId() {
  const r = loadRoster();
  if (r.activeId && r.characters.some((c) => c.id === r.activeId)) return r.activeId;
  return r.characters[0] ? r.characters[0].id : null;
}

function setActiveId(id) {
  const r = loadRoster();
  if (!r.characters.some((c) => c.id === id)) return r;
  r.activeId = id;
  saveRoster(r);
  return r;
}

function upsertCharacter(id, name, refreshToken) {
  const r = loadRoster();
  const token = encryptToken(refreshToken);
  const idx = r.characters.findIndex((c) => c.id === id);
  const entry = { id, name, token };
  if (idx >= 0) r.characters[idx] = entry;
  else r.characters.push(entry);
  if (!r.activeId) r.activeId = id;
  saveRoster(r);
  return r;
}

function removeCharacter(id) {
  const r = loadRoster();
  r.characters = r.characters.filter((c) => c.id !== id);
  if (r.activeId === id) r.activeId = r.characters[0] ? r.characters[0].id : null;
  saveRoster(r);
  return r;
}

function getRefreshToken(characterId) {
  const r = loadRoster();
  const c = r.characters.find((x) => x.id === characterId);
  return c ? decryptToken(c.token) : null;
}

function clearRoster() {
  try {
    const f = rosterPath();
    if (fs.existsSync(f)) fs.unlinkSync(f);
  } catch (_e) {
    /* ignore */
  }
}

module.exports = {
  loadRoster,
  listCharacters,
  getActiveId,
  setActiveId,
  upsertCharacter,
  removeCharacter,
  getRefreshToken,
  clearRoster
};
