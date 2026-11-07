const fs = require('fs');
const path = require('path');
const { dataDir } = require('./paths');

const file = path.join(dataDir, 'settings.json');

const defaults = {
  startUrl: 'https://www.messenger.com/',
  theme: 'oled-purple.css', // file name in themes/, or "" for none
  sound: 'pop.wav',         // file name in sounds/, or "" for silent
  volume: 0.7,
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
