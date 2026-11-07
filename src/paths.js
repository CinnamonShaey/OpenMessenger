// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 CinnamonShaey
// Where OpenMessenger keeps its data (login, cache, settings, your themes/sounds).
//
//   Windows (packaged): <folder containing OpenMessenger.exe>\data\   (portable)
//   macOS / Linux:      the normal per-user app-data folder, e.g.
//                       ~/Library/Application Support/OpenMessenger, ~/.config/OpenMessenger
//                       (app bundles and AppImages are read-only)
//   Dev (npm start):    <repo>/data/   (git-ignored)
//   Override:           set OPENMESSENGER_DATA=<any folder>
//
// If the portable folder isn't writable (e.g. the app was extracted somewhere
// read-only), it falls back to the per-user folder instead of failing to start.
//
// This must run before app 'ready', so main.js requires it first.
const { app } = require('electron');
const path = require('path');
const fs = require('fs');

const appRoot = path.join(__dirname, '..'); // bundled code + built-in themes/sounds
// Windows can't load .ico/.png for window/tray icons from inside app.asar,
// so assets are unpacked next to it (see "asarUnpack" in package.json).
const unpackedRoot = appRoot.replace(/app\.asar$/, 'app.asar.unpacked');

function usable(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.accessSync(dir, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

function pickDataDir() {
  if (process.env.OPENMESSENGER_DATA) return process.env.OPENMESSENGER_DATA;
  if (!app.isPackaged) return path.join(appRoot, 'data');
  const perUser = path.join(app.getPath('appData'), 'OpenMessenger');
  if (process.platform !== 'win32') return perUser;
  const portable = path.join(path.dirname(process.execPath), 'data');
  return usable(portable) ? portable : perUser;
}

const dataDir = pickDataDir();

const dirs = {
  appRoot,
  dataDir,
  builtinThemes: path.join(appRoot, 'themes'),
  builtinSounds: path.join(unpackedRoot, 'assets', 'sounds'),
  userThemes: path.join(dataDir, 'themes'),
  userSounds: path.join(dataDir, 'sounds'),
  assets: path.join(unpackedRoot, 'assets'),
};

for (const d of [dataDir, dirs.userThemes, dirs.userSounds]) fs.mkdirSync(d, { recursive: true });

// Chromium profile (cookies/login, cache), logs and crash dumps all go under the data folder.
app.setPath('userData', path.join(dataDir, 'profile'));
app.setPath('sessionData', path.join(dataDir, 'profile'));
app.setPath('crashDumps', path.join(dataDir, 'crashes'));
app.setAppLogsPath(path.join(dataDir, 'logs'));

module.exports = dirs;
