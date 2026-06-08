// Block ad / tracker / sync iframes inside the map dock webview (zKill, Dotlan).
// Those sites embed third-party networks that spam the console with cert/DNS errors.

const { session } = require('electron');

const INTEL_DOCK_PARTITION = 'eve-intel-dock';

// Host suffixes seen in the wild + common programmatic ad networks.
const BLOCKED_HOST_SUFFIXES = [
  'measureadv.com',
  'omnitagjs.com',
  'programmaticx.ai',
  'yellowblue.io',
  'iqzone.com',
  'doubleclick.net',
  'googlesyndication.com',
  'googleadservices.com',
  'google-analytics.com',
  'googletagmanager.com',
  'adnxs.com',
  'adsrvr.org',
  'taboola.com',
  'outbrain.com',
  'criteo.com',
  'rubiconproject.com',
  'openx.net',
  'pubmatic.com',
  'moatads.com',
  'scorecardresearch.com',
  'hotjar.com',
  'quantserve.com',
  'facebook.net',
  'amazon-adsystem.com',
  'adform.net',
  'casalemedia.com',
  'lijit.com',
  'sharethrough.com',
  'spotxchange.com',
  'teads.tv',
  'yieldmo.com'
];

function hostBlocked(hostname) {
  const h = String(hostname || '').toLowerCase();
  if (!h) return false;
  return BLOCKED_HOST_SUFFIXES.some((suffix) => h === suffix || h.endsWith('.' + suffix));
}

function shouldBlockUrl(url) {
  try {
    const u = new URL(url);
    if (u.protocol === 'devtools:' || u.protocol === 'chrome-error:') return false;
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    return hostBlocked(u.hostname);
  } catch (_e) {
    return false;
  }
}

function setupIntelDockSession(partition = INTEL_DOCK_PARTITION) {
  const ses = session.fromPartition(partition);
  if (!ses || ses.__intelDockGuard) return ses;
  ses.__intelDockGuard = true;

  ses.webRequest.onBeforeRequest({ urls: ['*://*/*'] }, (details, callback) => {
    if (shouldBlockUrl(details.url)) {
      callback({ cancel: true });
      return;
    }
    callback({});
  });

  // Deny permission prompts from embedded sites (notifications, etc.).
  ses.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });

  return ses;
}

module.exports = {
  INTEL_DOCK_PARTITION,
  setupIntelDockSession,
  shouldBlockUrl,
  hostBlocked
};
