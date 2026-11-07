// Portable layout: everything OpenMessenger writes lives in ONE folder.
//
//   Packaged:  <folder containing OpenMessenger.exe>\data\
//   Dev:       <repo>\data\            (git-ignored)
//   Override:  set OPENMESSENGER_DATA=<any folder>
//
// This must run before app 'ready', so main.js requires it first.
const { app } = require('electron');
const path = require('path');
const fs = require('fs');

const appRoot = path.join(__dirname, '..'); // bundled code + built-in themes/sounds
const exeDir = app.isPackaged ? path.dirname(process.execPath) : appRoot;
const dataDir = process.env.OPENMESSENGER_DATA || path.join(exeDir, 'data');

const dirs = {
  appRoot,
  dataDir,
  builtinThemes: path.join(appRoot, 'themes'),
  builtinSounds: path.join(appRoot, 'assets', 'sounds'),
  userThemes: path.join(dataDir, 'themes'),
  userSounds: path.join(dataDir, 'sounds'),
  assets: path.join(appRoot, 'assets'),
};

for (const d of [dataDir, dirs.userThemes, dirs.userSounds]) fs.mkdirSync(d, { recursive: true });

// Chromium profile (cookies/login, cache), logs and crash dumps all go under data\.
app.setPath('userData', path.join(dataDir, 'profile'));
app.setPath('sessionData', path.join(dataDir, 'profile'));
app.setPath('crashDumps', path.join(dataDir, 'crashes'));
app.setAppLogsPath(path.join(dataDir, 'logs'));

module.exports = dirs;
