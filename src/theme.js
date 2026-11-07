// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 CinnamonShaey
// Theme engine: theme files + generated accent layer, injected as user CSS.
const fs = require('fs');
const path = require('path');
const paths = require('./paths');
const color = require('./color');

function listFiles(dirs, exts) {
  const seen = new Map();
  for (const dir of dirs) {
    try {
      for (const f of fs.readdirSync(dir)) {
        if (exts.includes(path.extname(f).toLowerCase())) seen.set(f, path.join(dir, f));
      }
    } catch { /* missing dir */ }
  }
  return seen; // name -> full path (user files override built-ins of the same name)
}

const allThemeFiles = () => listFiles([paths.builtinThemes, paths.userThemes], ['.css']);

// Metadata lives in the first comment:  @name, @description, @mode, @swatches,
// @accent, and any number of @extends lines (applied in order, before the file).
function parseMeta(css) {
  const head = (/^\s*\/\*([\s\S]*?)\*\//.exec(css) || [, ''])[1];
  const tag = (t) => { const m = new RegExp(`@${t}[ \\t]+([^\\n*]+)`).exec(head); return m ? m[1].trim() : ''; };
  return {
    name: tag('name'),
    description: tag('description'),
    mode: tag('mode') === 'light' ? 'light' : 'dark',
    swatches: tag('swatches').split(/\s+/).filter(Boolean),
    accent: tag('accent'),
    extends: [...head.matchAll(/@extends[ \t]+([\w.\- ]+?\.css)/g)].map((m) => m[1]),
  };
}

function readTheme(file) {
  try {
    const css = fs.readFileSync(file, 'utf8');
    return { css, meta: parseMeta(css) };
  } catch {
    return null;
  }
}

function prettyName(file) {
  return path.basename(file, path.extname(file)).replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function listThemes() {
  const out = [];
  for (const [file, full] of allThemeFiles()) {
    if (file.startsWith('_')) continue;
    const t = readTheme(full);
    if (!t) continue;
    out.push({
      file,
      name: t.meta.name || prettyName(file),
      description: t.meta.description,
      mode: t.meta.mode,
      swatches: t.meta.swatches,
      accent: t.meta.accent,
      user: full.startsWith(paths.userThemes),
    });
  }
  const order = ['oled.css', 'midnight.css', 'graphite.css', 'catppuccin-mocha.css', 'nord.css', 'light.css'];
  const rank = (f) => (order.includes(f) ? order.indexOf(f) : 100);
  return out.sort((a, b) => rank(a.file) - rank(b.file) || a.name.localeCompare(b.name));
}

// All files making up a theme, parents first.
function chain(name, seen = new Set()) {
  const full = allThemeFiles().get(name);
  if (!full || seen.has(name)) return [];
  seen.add(name);
  const t = readTheme(full);
  if (!t) return [];
  return [...t.meta.extends.flatMap((p) => chain(p, seen)), { file: full, css: t.css, meta: t.meta }];
}

function themeCss(name) {
  return chain(name).map((t) => t.css).join('\n');
}

function themeMode(name) {
  const c = chain(name);
  return c.length ? c[c.length - 1].meta.mode : 'dark';
}

// ---------------------------------------------------------------- accent layer
const SEL = ':root, .__fb-light-mode, .__fb-dark-mode, .__fb-light-mode:root, .__fb-dark-mode:root';

function accentCss(hex, mode, recolorChats) {
  const rgb = color.parseColor(hex) || color.parseColor('#a855f7');
  const lum = color.luminance(rgb);
  const strong = color.shiftL(rgb, mode === 'light' ? -0.06 : -0.05);
  // Links/text need contrast against the background.
  let text = rgb;
  if (mode === 'dark' && lum < 0.25) text = color.shiftL(rgb, 0.14);
  if (mode === 'light' && lum > 0.3) text = color.shiftL(rgb, -0.18);
  const onAccent = color.luminance(strong) > 0.45 ? '#111111' : '#ffffff';

  let css = `${SEL} {
  --om-accent: ${color.toHex(rgb)} !important;
  --om-accent-strong: ${color.toHex(strong)} !important;
  --om-accent-soft: ${color.rgba(rgb, mode === 'light' ? 0.12 : 0.16)} !important;
  --om-accent-text: ${color.toHex(text)} !important;
  --om-on-accent: ${onAccent} !important;
  --om-accent-filter: ${color.cssFilterFor(color.toHex(text))} !important;
}
`;
  if (recolorChats) {
    const end = color.shiftL(rgb, -0.12);
    // Conversations set their chat theme as inline variables; !important beats them.
    css += `${SEL},
[style*="--chat-outgoing-message-background-gradient"],
[style*="--mwp-primary-theme-color"] {
  --chat-outgoing-message-background-gradient: linear-gradient(${color.toHex(rgb)}, ${color.toHex(end)}) !important;
  --chat-outgoing-message-bubble-background-color: ${color.toHex(strong)} !important;
  --mwp-primary-theme-color: ${color.toHex(rgb)} !important;
  --mwp-header-button-color: ${color.toHex(text)} !important;
  --chat-composer-button-color: ${color.toHex(text)} !important;
  --chat-composer-caret-color: ${color.toHex(text)} !important;
  --reaction-pill-multireact-selected-color: ${color.rgba(rgb, 0.35)} !important;
}
`;
  }
  return css;
}

module.exports = { listThemes, chain, themeCss, themeMode, accentCss, listFiles, prettyName };
