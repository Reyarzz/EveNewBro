// Persists the SSO refresh token between launches.
// Uses Electron safeStorage (OS-level encryption) when available, otherwise
// falls back to plaintext on disk with a warning.

const fs = require('fs');
const path = require('path');
const { app, safeStorage } = require('electron');

function tokenFilePath() {
  return path.join(app.getPath('userData'), 'eve-session.json');
}

function saveRefreshToken(refreshToken) {
  const file = tokenFilePath();
  let payload;
  if (safeStorage && safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(refreshToken).toString('base64');
    payload = { enc: true, data: encrypted };
  } else {
    payload = { enc: false, data: refreshToken };
  }
  fs.writeFileSync(file, JSON.stringify(payload), 'utf8');
}

function loadRefreshToken() {
  try {
    const file = tokenFilePath();
    if (!fs.existsSync(file)) return null;
    const payload = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (payload.enc) {
      if (!safeStorage || !safeStorage.isEncryptionAvailable()) return null;
      return safeStorage.decryptString(Buffer.from(payload.data, 'base64'));
    }
    return payload.data;
  } catch (_e) {
    return null;
  }
}

function clearRefreshToken() {
  try {
    const file = tokenFilePath();
    if (fs.existsSync(file)) fs.unlinkSync(file);
  } catch (_e) {
    /* ignore */
  }
}

// ---- Plain settings (Client ID is not a secret) ----

function settingsFilePath() {
  return path.join(app.getPath('userData'), 'eve-settings.json');
}

function loadSettings() {
  try {
    const file = settingsFilePath();
    if (!fs.existsSync(file)) return {};
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (_e) {
    return {};
  }
}

function saveSettings(patch) {
  const current = loadSettings();
  const next = { ...current, ...patch };
  fs.writeFileSync(settingsFilePath(), JSON.stringify(next, null, 2), 'utf8');
  return next;
}

module.exports = {
  saveRefreshToken,
  loadRefreshToken,
  clearRefreshToken,
  loadSettings,
  saveSettings
};
