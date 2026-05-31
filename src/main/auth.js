// EVE SSO v2 OAuth2 with PKCE — supports multiple characters on one EVE account
// (each alt logs in once; tokens stored in the encrypted roster).

const crypto = require('crypto');
const { BrowserWindow } = require('electron');
const cfg = require('../../config');
const store = require('./store');
const roster = require('./roster-store');

const accessCache = new Map(); // characterId -> { token, expiresAt, characterId, characterName }

function getClientId() {
  const fromSettings = (store.loadSettings().clientId || '').trim();
  return fromSettings || cfg.CLIENT_ID || '';
}

function base64url(buf) {
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function makePkce() {
  const verifier = base64url(crypto.randomBytes(32));
  const challenge = base64url(
    crypto.createHash('sha256').update(verifier).digest()
  );
  return { verifier, challenge };
}

function decodeJwtPayload(jwt) {
  const parts = jwt.split('.');
  if (parts.length < 2) return {};
  const json = Buffer.from(parts[1], 'base64').toString('utf8');
  return JSON.parse(json);
}

function characterIdFromPayload(payload) {
  const sub = payload.sub || '';
  const m = sub.match(/CHARACTER:EVE:(\d+)/);
  return m ? Number(m[1]) : null;
}

async function exchangeToken(params) {
  const body = new URLSearchParams(params);
  const res = await fetch(cfg.TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Host: 'login.eveonline.com',
      'User-Agent': cfg.USER_AGENT
    },
    body
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token endpoint ${res.status}: ${text}`);
  }
  return res.json();
}

function applyTokenResponse(tokens) {
  const payload = decodeJwtPayload(tokens.access_token);
  const characterId = characterIdFromPayload(payload);
  const characterName = payload.name || 'Capsuleer';
  const access = {
    token: tokens.access_token,
    expiresAt: Date.now() + (tokens.expires_in - 60) * 1000,
    characterId,
    characterName
  };
  if (tokens.refresh_token && characterId) {
    roster.upsertCharacter(characterId, characterName, tokens.refresh_token);
    accessCache.set(characterId, access);
    store.saveRefreshToken(tokens.refresh_token);
    store.saveSettings({ lastCharacterId: characterId, lastCharacterName: characterName });
  }
  return access;
}

function migrateLegacyToken() {
  const chars = roster.listCharacters();
  if (chars.length > 0) return;
  const legacy = store.loadRefreshToken();
  const lastId = store.loadSettings().lastCharacterId;
  const lastName = store.loadSettings().lastCharacterName || 'Capsuleer';
  if (legacy && lastId) {
    roster.upsertCharacter(Number(lastId), lastName, legacy);
    roster.setActiveId(Number(lastId));
  }
}

function interactiveLogin() {
  const clientId = getClientId();
  if (!clientId) {
    return Promise.reject(
      new Error(
        'No EVE Client ID configured. Open Account or Me and paste your Client ID, or set EVE_CLIENT_ID in a .env file.'
      )
    );
  }

  const { verifier, challenge } = makePkce();
  const state = base64url(crypto.randomBytes(16));

  const authUrl =
    cfg.AUTHORIZE_URL +
    '?' +
    new URLSearchParams({
      response_type: 'code',
      redirect_uri: cfg.CALLBACK_URL,
      client_id: clientId,
      scope: cfg.SCOPES.join(' '),
      code_challenge: challenge,
      code_challenge_method: 'S256',
      state
    }).toString();

  return new Promise((resolve, reject) => {
    const authWin = new BrowserWindow({
      width: 520,
      height: 720,
      title: 'Log in with EVE Online — add character',
      autoHideMenuBar: true,
      webPreferences: { nodeIntegration: false, contextIsolation: true }
    });

    let settled = false;
    const finish = (fn, arg) => {
      if (settled) return;
      settled = true;
      try {
        authWin.destroy();
      } catch (_e) {
        /* ignore */
      }
      fn(arg);
    };

    const handleRedirect = async (url) => {
      if (!url.startsWith(cfg.CALLBACK_URL)) return;
      try {
        const parsed = new URL(url);
        const code = parsed.searchParams.get('code');
        const returnedState = parsed.searchParams.get('state');
        const err = parsed.searchParams.get('error');
        if (err) throw new Error(`SSO error: ${err}`);
        if (returnedState !== state) throw new Error('State mismatch (possible CSRF).');
        if (!code) throw new Error('No authorization code returned.');

        const tokens = await exchangeToken({
          grant_type: 'authorization_code',
          code,
          client_id: clientId,
          code_verifier: verifier
        });
        finish(resolve, applyTokenResponse(tokens));
      } catch (e) {
        finish(reject, e);
      }
    };

    authWin.webContents.on('will-redirect', (_e, url) => handleRedirect(url));
    authWin.webContents.on('will-navigate', (_e, url) => handleRedirect(url));
    authWin.on('closed', () => {
      if (!settled) {
        settled = true;
        reject(new Error('Login window closed before completing.'));
      }
    });

    authWin.loadURL(authUrl);
  });
}

async function refreshAccessToken(characterId) {
  const id = characterId || roster.getActiveId();
  if (!id) return null;
  const refreshToken = roster.getRefreshToken(id) || store.loadRefreshToken();
  if (!refreshToken) return null;
  const clientId = getClientId();
  if (!clientId) return null;
  try {
    const tokens = await exchangeToken({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId
    });
    const access = applyTokenResponse(tokens);
    return access;
  } catch (_e) {
    roster.removeCharacter(id);
    accessCache.delete(id);
    return null;
  }
}

async function getValidAccess(characterId) {
  migrateLegacyToken();
  const id = characterId || roster.getActiveId();
  if (!id) return null;
  const cached = accessCache.get(id);
  if (cached && cached.expiresAt > Date.now()) return cached;
  const access = await refreshAccessToken(id);
  return access;
}

function getRoster() {
  migrateLegacyToken();
  return {
    activeId: roster.getActiveId(),
    characters: roster.listCharacters()
  };
}

function setActiveCharacter(characterId) {
  roster.setActiveId(Number(characterId));
  return getRoster();
}

function removeCharacter(characterId) {
  const id = Number(characterId);
  roster.removeCharacter(id);
  accessCache.delete(id);
  return getRoster();
}

function logout() {
  roster.clearRoster();
  store.clearRefreshToken();
  accessCache.clear();
}

function hasStoredSession() {
  migrateLegacyToken();
  return roster.listCharacters().length > 0 || !!store.loadRefreshToken();
}

function isConfigured() {
  return !!getClientId();
}

function setClientId(clientId) {
  store.saveSettings({ clientId: (clientId || '').trim() });
  accessCache.clear();
}

migrateLegacyToken();

module.exports = {
  interactiveLogin,
  refreshAccessToken,
  getValidAccess,
  getRoster,
  setActiveCharacter,
  removeCharacter,
  logout,
  hasStoredSession,
  isConfigured,
  setClientId,
  getClientId
};
