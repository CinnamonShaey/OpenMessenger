// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 CinnamonShaey
// In-app updates.
//
//   Installer builds (Windows): electron-updater downloads the new installer from
//   GitHub Releases and runs it silently on restart. The installer keeps data/.
//   Portable zip / macOS / Linux: can't replace themselves, so we only check the
//   latest GitHub release and offer a link to the download page.
//
// Only talks to GitHub (no personal data), and only when checks are enabled or
// the user presses "Check for updates".
const { app, shell } = require('electron');
const fs = require('fs');
const path = require('path');

const REPO = 'CinnamonShaey/OpenMessenger';
const RELEASES_URL = `https://github.com/${REPO}/releases/latest`;

// Installed by our NSIS installer? (it puts the uninstaller next to the exe)
const isInstalled = () => process.platform === 'win32' && app.isPackaged
  && fs.existsSync(path.join(path.dirname(process.execPath), 'Uninstall OpenMessenger.exe'));

let state = { status: 'idle', current: app.getVersion(), latest: null, progress: 0, error: null, canInstall: false };
let listeners = [];
let autoUpdater = null;

function emit(patch) {
  state = { ...state, ...patch };
  for (const fn of listeners) { try { fn(state); } catch {} }
}

function newer(a, b) { // is version a newer than b?
  const pa = String(a).replace(/^v/, '').split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  const pb = String(b).replace(/^v/, '').split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  return false;
}

function setupAutoUpdater() {
  if (autoUpdater || !isInstalled()) return;
  ({ autoUpdater } = require('electron-updater'));
  // Testing hook: point the updater at a local folder served over HTTP.
  if (process.env.OPENMESSENGER_UPDATE_URL) {
    autoUpdater.setFeedURL({ provider: 'generic', url: process.env.OPENMESSENGER_UPDATE_URL });
  }
  autoUpdater.autoDownload = false;          // the user decides when to download
  autoUpdater.autoInstallOnAppQuit = false;  // and when to install
  autoUpdater.logger = null;
  autoUpdater.on('checking-for-update', () => emit({ status: 'checking', error: null }));
  autoUpdater.on('update-available', (info) => emit({ status: 'available', latest: info.version }));
  autoUpdater.on('update-not-available', () => emit({ status: 'up-to-date', latest: state.current }));
  autoUpdater.on('download-progress', (p) => emit({ status: 'downloading', progress: Math.round(p.percent || 0) }));
  autoUpdater.on('update-downloaded', (info) => emit({ status: 'ready', latest: info.version, progress: 100 }));
  autoUpdater.on('error', (err) => emit({ status: 'error', error: String((err && err.message) || err).split('\n')[0] }));
}

async function checkPortable() {
  emit({ status: 'checking', error: null });
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'OpenMessenger' },
    });
    if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
    const latest = (await res.json()).tag_name.replace(/^v/, '');
    emit(newer(latest, state.current) ? { status: 'available', latest } : { status: 'up-to-date', latest });
  } catch (err) {
    emit({ status: 'error', error: String(err.message || err) });
  }
}

async function check() {
  if (!app.isPackaged) { emit({ status: 'error', error: 'Updates are only available in release builds.' }); return state; }
  if (['downloading', 'ready'].includes(state.status)) return state;
  setupAutoUpdater();
  if (autoUpdater) {
    try { await autoUpdater.checkForUpdates(); } catch (err) { emit({ status: 'error', error: String(err.message || err).split('\n')[0] }); }
  } else {
    await checkPortable();
  }
  return state;
}

// Installer builds: download + install. Others: open the download page.
async function download() {
  if (!autoUpdater) { shell.openExternal(RELEASES_URL); return; }
  if (state.status !== 'available') return;
  emit({ status: 'downloading', progress: 0 });
  try { await autoUpdater.downloadUpdate(); } catch (err) { emit({ status: 'error', error: String(err.message || err).split('\n')[0] }); }
}

function installAndRestart(beforeQuit) {
  if (!autoUpdater || state.status !== 'ready') return;
  if (beforeQuit) beforeQuit();
  setImmediate(() => autoUpdater.quitAndInstall(true, true)); // silent install, relaunch afterwards
}

module.exports = {
  check,
  download,
  installAndRestart,
  getState: () => ({ ...state, canInstall: isInstalled(), releasesUrl: RELEASES_URL }),
  onChange: (fn) => { listeners.push(fn); },
  isInstalled,
};
