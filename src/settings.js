// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 CinnamonShaey
const fs = require('fs');
const path = require('path');
const { dataDir } = require('./paths');

const file = path.join(dataDir, 'settings.json');

const defaults = {
  startUrl: 'https://www.messenger.com/',
  theme: 'oled.css',        // file name in themes/, or "" for none
  accent: '#a855f7',        // any CSS hex colour
  recolorChats: false,      // force every conversation's bubbles to the accent
  sound: 'gentle.wav',      // file name in sounds/, or "" for silent
  volume: 0.5,
  popups: true,             // show desktop notification pop-ups
  soundWhenActive: false,   // also play the sound while OpenMessenger is the active window
  closeToTray: true,
  startMinimized: false,
  spellcheckLanguages: ['en-US', 'da'],
  windowBounds: { width: 1200, height: 800 },
  windowMaximized: false,
};

let current = { ...defaults };
try {
  current = { ...defaults, ...JSON.parse(fs.readFileSync(file, 'utf8')) };
} catch {
  /* first run or unreadable: use defaults */
}

// Early dev builds had "OLED Purple" themes; they became OLED + a purple accent.
if (current.theme === 'oled-purple.css' || current.theme === 'oled-purple-all-chats.css') {
  current.recolorChats = current.theme === 'oled-purple-all-chats.css';
  current.theme = 'oled.css';
  current.accent = '#a855f7';
}

let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fs.writeFileSync(file, JSON.stringify(current, null, 2));
  }, 300);
}

module.exports = {
  file,
  get: (k) => current[k],
  set(k, v) {
    current[k] = v;
    save();
  },
  flush() {
    clearTimeout(saveTimer);
    fs.writeFileSync(file, JSON.stringify(current, null, 2));
  },
};
