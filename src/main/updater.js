// Auto-update from GitHub Releases (electron-updater).
//
// Windows only: the NSIS installer supports unsigned differential updates.
// macOS auto-update requires a signed app, so Mac users update manually
// from the Releases page until the app is signed.

const { app } = require('electron');

let started = false;

function start() {
  if (started) return;
  started = true;

  // Dev runs and Mac builds: skip silently.
  if (!app.isPackaged || process.platform !== 'win32') return;

  let autoUpdater;
  try {
    ({ autoUpdater } = require('electron-updater'));
  } catch (_e) {
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true; // installs silently on next quit
  autoUpdater.on('error', () => {}); // offline / rate-limited — try again next launch

  const check = () => autoUpdater.checkForUpdatesAndNotify().catch(() => {});
  setTimeout(check, 30 * 1000); // don't compete with startup work
  setInterval(check, 4 * 60 * 60 * 1000); // and every 4 hours while running
}

module.exports = { start };
