// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 CinnamonShaey
// Settings window logic. Talks to the main process through window.om (preload).
const $ = (id) => document.getElementById(id);

const PRESETS = [
  ['Purple', '#a855f7'], ['Violet', '#8b5cf6'], ['Indigo', '#6366f1'], ['Blue', '#3b82f6'],
  ['Messenger blue', '#0084ff'], ['Sky', '#0ea5e9'], ['Cyan', '#06b6d4'], ['Teal', '#14b8a6'],
  ['Green', '#22c55e'], ['Lime', '#84cc16'], ['Yellow', '#eab308'], ['Amber', '#f59e0b'],
  ['Orange', '#f97316'], ['Red', '#ef4444'], ['Rose', '#f43f5e'], ['Pink', '#ec4899'],
  ['Fuchsia', '#d946ef'], ['Silver', '#cbd5e1'],
];

let state = null;
let hsv = { h: 270, s: 0.65, v: 0.97 };

// ------------------------------------------------------------------ colour math
function hexToRgb(hex) {
  let s = String(hex).trim().replace(/^#/, '').toLowerCase();
  if (/^[0-9a-f]{3}$/.test(s)) s = s.split('').map((c) => c + c).join('');
  if (!/^[0-9a-f]{6}$/.test(s)) return null;
  const n = parseInt(s, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
const rgbToHex = ({ r, g, b }) => '#' + [r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('');

function rgbToHsv({ r, g, b }) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s: max ? d / max : 0, v: max };
}
function hsvToRgb({ h, s, v }) {
  const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x]
    : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
}
const lum = ({ r, g, b }) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

// ------------------------------------------------------------------ wheel
const wheel = $('wheel');
const SIZE = 240;
function drawWheel() {
  const dpr = window.devicePixelRatio || 1;
  const px = Math.round(SIZE * dpr);
  wheel.width = px; wheel.height = px;
  const ctx = wheel.getContext('2d');
  const img = ctx.createImageData(px, px);
  const R = px / 2;
  for (let y = 0; y < px; y++) {
    for (let x = 0; x < px; x++) {
      const dx = x - R + 0.5, dy = y - R + 0.5;
      const d = Math.sqrt(dx * dx + dy * dy);
      const i = (y * px + x) * 4;
      if (d > R) { img.data[i + 3] = 0; continue; }
      const h = (Math.atan2(dy, dx) * 180 / Math.PI + 360 + 90) % 360; // red at top
      const c = hsvToRgb({ h, s: Math.min(1, d / R), v: 1 });
      img.data[i] = c.r; img.data[i + 1] = c.g; img.data[i + 2] = c.b;
      img.data[i + 3] = d > R - 1 ? Math.round((R - d) * 255) : 255; // anti-alias edge
    }
  }
  ctx.putImageData(img, 0, 0);
}

function placeMarker() {
  const R = SIZE / 2;
  const a = (hsv.h - 90) * Math.PI / 180;
  const m = $('marker');
  m.style.left = `${R + Math.cos(a) * hsv.s * R}px`;
  m.style.top = `${R + Math.sin(a) * hsv.s * R}px`;
  m.style.background = rgbToHex(hsvToRgb(hsv));
  $('wheelDim').style.opacity = String(1 - hsv.v);
}

function pickFromWheel(ev) {
  const r = wheel.getBoundingClientRect();
  const dx = ev.clientX - r.left - r.width / 2;
  const dy = ev.clientY - r.top - r.height / 2;
  const R = r.width / 2;
  hsv.h = (Math.atan2(dy, dx) * 180 / Math.PI + 360 + 90) % 360;
  hsv.s = Math.min(1, Math.sqrt(dx * dx + dy * dy) / R);
  if (hsv.v < 0.15) hsv.v = 0.85; // picking on a black wheel would be confusing
  showColor(rgbToHex(hsvToRgb(hsv)), { fromHsv: true });
  preview();
}

let dragging = false;
const wrap = document.querySelector('.wheel-wrap');
wrap.addEventListener('pointerdown', (e) => { dragging = true; wrap.setPointerCapture(e.pointerId); pickFromWheel(e); });
wrap.addEventListener('pointermove', (e) => { if (dragging) pickFromWheel(e); });
wrap.addEventListener('pointerup', () => { if (dragging) { dragging = false; commit(); } });
wrap.addEventListener('pointercancel', () => { dragging = false; commit(); });

// ------------------------------------------------------------------ apply / preview
let current = '#a855f7';
let raf = 0;
function preview() {
  if (raf) return;
  raf = requestAnimationFrame(() => { raf = 0; window.om.previewAccent(current); });
}
function commit() {
  if (state && current !== state.settings.accent) {
    state.settings.accent = current;
    window.om.set('accent', current);
  }
}

// Update every control to show `hex`. opts.fromHsv keeps the wheel position
// exact (round-tripping through hex would make the marker jitter).
function showColor(hex, opts = {}) {
  const rgb = hexToRgb(hex);
  if (!rgb) return;
  current = rgbToHex(rgb);
  if (!opts.fromHsv) hsv = rgbToHsv(rgb);
  placeMarker();
  $('brightness').value = Math.round(hsv.v * 100);
  const full = rgbToHex(hsvToRgb({ ...hsv, v: 1 }));
  $('brightness').style.background = `linear-gradient(to right, #000, ${full})`;
  $('currentHex').textContent = current.toUpperCase();
  if (document.activeElement !== $('hex')) { $('hex').value = current; $('hex').classList.remove('invalid'); }
  for (const k of ['r', 'g', 'b']) if (document.activeElement !== $(k)) $(k).value = Math.round(rgb[k]);
  const root = document.documentElement.style;
  root.setProperty('--accent', current);
  root.setProperty('--accent-soft', `rgba(${Math.round(rgb.r)}, ${Math.round(rgb.g)}, ${Math.round(rgb.b)}, .16)`);
  root.setProperty('--on-accent', lum(rgb) > 0.6 ? '#111' : '#fff');
  document.querySelectorAll('.preset').forEach((p) => p.classList.toggle('selected', p.dataset.hex === current));
  document.querySelectorAll('.theme-card .b.out, .theme-card .side i.sel').forEach((el) => { el.style.background = current; });
}

$('brightness').addEventListener('input', (e) => {
  hsv.v = e.target.value / 100;
  showColor(rgbToHex(hsvToRgb(hsv)), { fromHsv: true });
  preview();
});
$('brightness').addEventListener('change', commit);

$('hex').addEventListener('input', (e) => {
  const v = e.target.value.trim();
  const rgb = hexToRgb(v);
  e.target.classList.toggle('invalid', !rgb && v.length > 0);
  if (rgb && v.replace('#', '').length === 6) { showColor(v); preview(); }
});
$('hex').addEventListener('keydown', (e) => { if (e.key === 'Enter') e.target.blur(); });
$('hex').addEventListener('blur', (e) => {
  const rgb = hexToRgb(e.target.value);
  if (rgb) { showColor(rgbToHex(rgb)); commit(); } else { e.target.value = current; e.target.classList.remove('invalid'); }
});

for (const k of ['r', 'g', 'b']) {
  $(k).addEventListener('input', () => {
    const rgb = { r: +$('r').value || 0, g: +$('g').value || 0, b: +$('b').value || 0 };
    showColor(rgbToHex(rgb)); preview();
  });
  $(k).addEventListener('change', commit);
}

$('themeAccent').addEventListener('click', () => {
  const t = state && state.themes.find((x) => x.file === state.settings.theme);
  if (t && t.accent) { showColor(t.accent); commit(); }
});

if ('EyeDropper' in window) {
  $('eyedropper').hidden = false;
  $('eyedropper').addEventListener('click', async () => {
    try {
      const { sRGBHex } = await new window.EyeDropper().open();
      showColor(sRGBHex); commit();
    } catch { /* cancelled */ }
  });
}

// ------------------------------------------------------------------ presets
for (const [name, hex] of PRESETS) {
  const b = document.createElement('button');
  b.className = 'preset';
  b.style.background = hex;
  b.dataset.hex = hex;
  b.dataset.tip = name;
  b.setAttribute('aria-label', name);
  b.addEventListener('click', () => { showColor(hex); commit(); });
  $('presets').appendChild(b);
}

// ------------------------------------------------------------------ themes
function renderThemes() {
  const box = $('themes');
  box.textContent = '';
  const mk = (file, name, desc, sw) => {
    const card = document.createElement('button');
    card.className = 'theme-card' + (state.settings.theme === file ? ' selected' : '') + (sw ? '' : ' none');
    const prev = document.createElement('div');
    prev.className = 'preview';
    if (sw) {
      const [bg, raised, text] = [sw[0] || '#000', sw[1] || '#222', sw[2] || '#fff'];
      prev.style.background = bg;
      const side = document.createElement('div');
      side.className = 'side';
      side.style.background = raised;
      for (let i = 0; i < 4; i++) {
        const l = document.createElement('i');
        l.style.background = text;
        if (i === 1) { l.className = 'sel'; l.style.background = current; }
        side.appendChild(l);
      }
      const chat = document.createElement('div');
      chat.className = 'chat';
      const bIn = document.createElement('div'); bIn.className = 'b in'; bIn.style.background = raised;
      const bOut = document.createElement('div'); bOut.className = 'b out'; bOut.style.background = current;
      const bIn2 = document.createElement('div'); bIn2.className = 'b in'; bIn2.style.background = raised; bIn2.style.width = '40%';
      chat.append(bIn, bOut, bIn2);
      prev.append(side, chat);
    } else {
      prev.textContent = "Messenger's own look";
    }
    const meta = document.createElement('div');
    meta.className = 'meta';
    const b = document.createElement('b'); b.textContent = name;
    const s = document.createElement('small'); s.textContent = desc || '';
    meta.append(b, s);
    card.append(prev, meta);
    card.addEventListener('click', () => {
      state.settings.theme = file;
      window.om.set('theme', file);
      renderThemes();
    });
    box.appendChild(card);
  };
  for (const t of state.themes) mk(t.file, t.name, t.description, t.swatches.length ? t.swatches : ['#000', '#222', '#fff']);
  mk('', 'None', 'No theme, just Messenger.', null);
}

// ------------------------------------------------------------------ sounds
function renderSounds() {
  const box = $('sounds');
  box.textContent = '';
  const items = [{ file: '', name: 'Silent' }, { file: '__messenger__', name: 'Messenger default' }, ...state.sounds];
  for (const s of items) {
    const b = document.createElement('button');
    b.className = 'sound' + (state.settings.sound === s.file ? ' selected' : '');
    b.textContent = s.name;
    b.addEventListener('click', async () => {
      state.settings.sound = s.file;
      await window.om.set('sound', s.file);
      renderSounds();
      if (s.file) setTimeout(() => window.om.testSound(), 150);
    });
    box.appendChild(b);
  }
}

function showVolume(v) {
  $('volume').value = Math.round(v * 100);
  $('volLabel').textContent = `${Math.round(v * 100)}%`;
  $('volume').style.setProperty('--fill', `${Math.round(v * 100)}%`);
}
$('volume').addEventListener('input', (e) => showVolume(e.target.value / 100));
$('volume').addEventListener('change', async (e) => {
  state.settings.volume = e.target.value / 100;
  await window.om.set('volume', state.settings.volume);
  window.om.testSound();
});
$('test').addEventListener('click', () => window.om.testSound());

// ------------------------------------------------------------------ behaviour
for (const key of ['recolorChats', 'popups', 'reactions', 'soundWhenActive', 'closeToTray', 'startMinimized', 'startWithWindows']) {
  $(key).addEventListener('change', (e) => { state.settings[key] = e.target.checked; window.om.set(key, e.target.checked); });
}
document.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => window.om.open(b.dataset.open)));
$('shortcut').addEventListener('click', () => window.om.createShortcut());
if (navigator.userAgent.includes('Windows') === false) $('shortcut').hidden = true;

// ------------------------------------------------------------------ nav highlight
const links = [...document.querySelectorAll('.sidebar a')];
const main = document.querySelector('main');
const setActive = (link) => links.forEach((a) => a.classList.toggle('active', a === link));
let clickedLink = null; // keep a clicked item highlighted while smooth-scrolling to it
main.addEventListener('scroll', () => {
  const atBottom = main.scrollTop + main.clientHeight >= main.scrollHeight - 4;
  if (clickedLink) return;
  // The last section can be too short to reach the top, so at the very bottom it wins.
  if (atBottom) { setActive(links[links.length - 1]); return; }
  let active = links[0];
  for (const a of links) {
    const sec = document.querySelector(a.getAttribute('href'));
    if (sec.offsetTop - main.scrollTop < 120) active = a;
  }
  setActive(active);
});
let clickTimer = 0;
links.forEach((a) => a.addEventListener('click', () => {
  clickedLink = a;
  setActive(a);
  clearTimeout(clickTimer);
  clickTimer = setTimeout(() => { clickedLink = null; }, 900); // after the smooth scroll settles
}));


// ------------------------------------------------------------------ updates
function renderUpdate(u) {
  if (!u) return;
  const st = u.status;
  $('updateTitle').textContent = `OpenMessenger ${u.current}`;
  const msg = {
    idle: 'Press "Check for updates" to look for a new version.',
    checking: 'Checking for updates…',
    'up-to-date': 'You have the latest version.',
    available: u.canInstall ? `Version ${u.latest} is available.` : `Version ${u.latest} is available. Download it from GitHub.`,
    downloading: `Downloading version ${u.latest}… ${u.progress}%`,
    ready: `Version ${u.latest} is ready. Restart OpenMessenger to finish updating.`,
    error: `Couldn't check for updates: ${u.error || 'unknown error'}`,
  }[st] || '';
  $('updateStatus').textContent = msg;
  $('updateProgress').hidden = st !== 'downloading';
  $('updateBar').style.width = `${u.progress || 0}%`;
  $('updateCheck').disabled = st === 'checking' || st === 'downloading';
  const act = $('updateAction');
  act.hidden = !['available', 'ready'].includes(st);
  act.textContent = st === 'ready' ? 'Restart to update' : (u.canInstall ? 'Download update' : 'Open download page');
  document.querySelector('.update-card').classList.toggle('highlight', st === 'available' || st === 'ready');
  $('updateDot').hidden = !(st === 'available' || st === 'ready');
}
let lastUpdate = null;
$('updateCheck').addEventListener('click', () => window.om.update.check());
$('updateAction').addEventListener('click', () => {
  if (lastUpdate && lastUpdate.status === 'ready') window.om.update.install();
  else window.om.update.download();
});
$('autoUpdateCheck').addEventListener('change', (e) => { state.settings.autoUpdateCheck = e.target.checked; window.om.set('autoUpdateCheck', e.target.checked); });
window.om.update.onState((u) => { lastUpdate = u; renderUpdate(u); });
window.om.update.get().then((u) => { lastUpdate = u; renderUpdate(u); });

function gotoSection(id) {
  const sec = document.getElementById(id);
  if (!sec) return;
  main.style.scrollBehavior = 'auto';
  sec.scrollIntoView();
  main.style.scrollBehavior = '';
  const link = links.find((a) => a.getAttribute('href') === '#' + id);
  if (link) { clickedLink = link; setActive(link); clearTimeout(clickTimer); clickTimer = setTimeout(() => { clickedLink = null; }, 900); }
}
window.om.onGoto(gotoSection);

// ------------------------------------------------------------------ init
function render(s) {
  state = s;
  $('version').textContent = `v${s.version}`;
  $('recolorChats').checked = s.settings.recolorChats;
  $('popups').checked = s.settings.popups;
  $('soundWhenActive').checked = s.settings.soundWhenActive;
  $('reactions').checked = s.settings.reactions;
  $('autoUpdateCheck').checked = s.settings.autoUpdateCheck;
  $('closeToTray').checked = s.settings.closeToTray;
  $('startMinimized').checked = s.settings.startMinimized;
  $('startWithWindows').checked = s.settings.startWithWindows;
  $('autostartRow').hidden = !s.autostartSupported;
  showVolume(s.settings.volume);
  if (!dragging) showColor(s.settings.accent);
  renderThemes();
  renderSounds();
}

drawWheel();
window.om.get().then((s) => { render(s); if (location.hash) setTimeout(() => gotoSection(location.hash.slice(1)), 50); });
window.om.onState((s) => render(s));
