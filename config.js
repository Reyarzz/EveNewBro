// Central configuration for EVE SSO + ESI.
//
// To enable login you need a (free) EVE third-party application:
//   1. Go to https://developers.eveonline.com/  → "Manage Applications" → "Create New Application"
//   2. Connection Type: "Authentication & API Access"
//   3. Add the scopes listed below (SCOPES)
//   4. Callback URL: EXACTLY  http://localhost:3838/callback
//   5. Copy the generated "Client ID" and put it below (or in a .env file)
//
// PKCE is used, so NO client secret is required (and you must not embed one in
// a desktop app). Choose "Authentication & API Access" so a Client ID is issued.

const fs = require('fs');
const path = require('path');

// Lightweight .env loader (no dependency). Lines like KEY=VALUE.
function loadDotEnv() {
  try {
    const envPath = path.join(__dirname, '.env');
    if (!fs.existsSync(envPath)) return;
    const text = fs.readFileSync(envPath, 'utf8');
    text.split(/\r?\n/).forEach((line) => {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
      }
    });
  } catch (_e) {
    /* ignore */
  }
}

loadDotEnv();

const CALLBACK_PORT = 3838;

module.exports = {
  // Put your Client ID in a .env file (EVE_CLIENT_ID=...) or paste it here.
  CLIENT_ID: process.env.EVE_CLIENT_ID || '',

  // EVE Workbench API credentials for community fits (optional). Register a
  // free app at https://www.eveworkbench.com/my-account/developer
  EWB_CLIENT_ID: process.env.EWB_CLIENT_ID || '',
  EWB_API_KEY: process.env.EWB_API_KEY || '',

  CALLBACK_PORT,
  CALLBACK_URL: `http://localhost:${CALLBACK_PORT}/callback`,

  // EVE SSO v2 endpoints
  AUTHORIZE_URL: 'https://login.eveonline.com/v2/oauth/authorize',
  TOKEN_URL: 'https://login.eveonline.com/v2/oauth/token',
  JWKS_URL: 'https://login.eveonline.com/oauth/jwks',
  ISSUER: 'login.eveonline.com',

  // ESI base
  ESI_BASE: 'https://esi.evetech.net/latest',
  USER_AGENT: 'eve-newbro-overlay/0.2 (new-player helper; contact: set-me@example.com)',

  // Read-only scopes used to personalize tips + power optional notifications.
  SCOPES: [
    'esi-location.read_location.v1',
    'esi-location.read_ship_type.v1',
    'esi-skills.read_skills.v1',
    'esi-skills.read_skillqueue.v1',
    'esi-wallet.read_character_wallet.v1',
    // PI scope removed: SSO currently rejects esi-planets.manage_planets.v1 as invalid.
    'esi-assets.read_assets.v1',
    'esi-clones.read_clones.v1',
    'esi-clones.read_implants.v1',
    'esi-mail.read_mail.v1',
    'esi-mail.send_mail.v1',
    'esi-corporations.read_corporation_membership.v1'
  ]
};
