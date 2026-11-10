// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 CinnamonShaey
// Screen-share picker: Messenger does the sharing, this just asks what to share.
const $ = (id) => document.getElementById(id);

let sources = [];
let tab = 'screen';
let selected = null;

function setAccent(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const root = document.documentElement.style;
  root.setProperty('--accent', '#' + m[1]);
  root.setProperty('--accent-soft', `rgba(${r}, ${g}, ${b}, .18)`);
  root.setProperty('--on-accent', (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.6 ? '#111' : '#fff');
}

function render() {
  const grid = $('grid');
  grid.textContent = '';
  const shown = sources.filter((s) => s.kind === tab);
  $('empty').hidden = shown.length > 0;
  grid.hidden = shown.length === 0;
  shown.forEach((s, i) => {
    const card = document.createElement('button');
    card.className = 'card' + (selected === s.id ? ' selected' : '');
    card.setAttribute('role', 'option');
    card.setAttribute('aria-selected', selected === s.id ? 'true' : 'false');
    card.title = s.name;

    const thumb = document.createElement('div');
    thumb.className = 'thumb';
    if (s.thumb) {
      const img = document.createElement('img');
      img.src = s.thumb;
      img.alt = '';
      thumb.appendChild(img);
    } else {
      const none = document.createElement('span');
      none.className = 'none';
      none.textContent = 'No preview';
      thumb.appendChild(none);
    }

    const label = document.createElement('div');
    label.className = 'label';
    if (s.icon) {
      const ic = document.createElement('img');
      ic.src = s.icon;
      ic.alt = '';
      label.appendChild(ic);
    }
    const name = document.createElement('span');
    name.textContent = s.kind === 'screen' && sources.filter((x) => x.kind === 'screen').length > 1
      ? `Screen ${i + 1}` + (s.name && !/^(Entire screen|Screen \d+)$/i.test(s.name) ? ` · ${s.name}` : '')
      : s.name || 'Entire screen';
    label.appendChild(name);
    if (s.own) {
      const tag = document.createElement('small');
      tag.textContent = 'This app';
      label.appendChild(tag);
    }

    card.append(thumb, label);
    card.addEventListener('click', () => { selected = s.id; render(); $('share').focus(); });
    card.addEventListener('dblclick', () => { selected = s.id; share(); });
    grid.appendChild(card);
  });
  $('share').disabled = !selected || !sources.some((s) => s.id === selected);
  document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
}

function share() {
  if (!selected) return;
  window.picker.choose(selected, $('audio').checked);
}

document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => {
  tab = b.dataset.tab;
  render();
}));
$('share').addEventListener('click', share);
$('cancel').addEventListener('click', () => window.picker.cancel());
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') window.picker.cancel();
  if (e.key === 'Enter' && selected) share();
});

window.picker.get().then((data) => {
  setAccent(data.accent);
  sources = data.sources;
  $('audioRow').hidden = !data.audioSupported;
  if (!data.audioSupported) $('audio').checked = false;
  $('countScreen').textContent = sources.filter((s) => s.kind === 'screen').length;
  $('countWindow').textContent = sources.filter((s) => s.kind === 'window').length;
  // Preselect the first screen, the most common choice.
  const first = sources.find((s) => s.kind === 'screen');
  if (first) selected = first.id;
  render();
});
