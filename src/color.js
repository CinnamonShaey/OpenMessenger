// Colour helpers for the accent system.

function parseColor(input) {
  if (!input) return null;
  let s = String(input).trim().toLowerCase();
  let m = /^#?([0-9a-f]{3})$/.exec(s);
  if (m) s = '#' + m[1].split('').map((c) => c + c).join('');
  m = /^#?([0-9a-f]{6})$/.exec(s);
  if (m) {
    const n = parseInt(m[1], 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  m = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/.exec(s);
  if (m) return { r: clamp(+m[1]), g: clamp(+m[2]), b: clamp(+m[3]) };
  m = /^hsla?\(\s*([\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%/.exec(s);
  if (m) return hslToRgb(+m[1], +m[2] / 100, +m[3] / 100);
  return null;
}

const clamp = (v, lo = 0, hi = 255) => Math.min(hi, Math.max(lo, v));
const toHex = ({ r, g, b }) => '#' + [r, g, b].map((v) => Math.round(clamp(v)).toString(16).padStart(2, '0')).join('');

function rgbToHsl({ r, g, b }) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
  }
  return { h, s, l };
}

function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x]
    : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
}

function luminance({ r, g, b }) {
  const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

const shiftL = (rgb, dl) => { const { h, s, l } = rgbToHsl(rgb); return hslToRgb(h, s, clamp(l + dl, 0, 1)); };
const rgba = ({ r, g, b }, a) => `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${a})`;

// ---------------------------------------------------------------------------
// CSS filter solver: Meta tints some icons with `filter:` chains instead of
// colours. Finds invert/sepia/saturate/hue-rotate/brightness/contrast values
// that turn a black icon into the target colour (SPSA optimisation; approach
// popularised by Barrett Sonntag's "CSS filter generator", MIT).
class C {
  constructor(r, g, b) { this.r = r; this.g = g; this.b = b; }
  set(r, g, b) { this.r = clamp(r); this.g = clamp(g); this.b = clamp(b); }
  mul(m) {
    const { r, g, b } = this;
    this.set(r * m[0] + g * m[1] + b * m[2], r * m[3] + g * m[4] + b * m[5], r * m[6] + g * m[7] + b * m[8]);
  }
  hueRotate(deg) {
    const a = (deg / 180) * Math.PI, cos = Math.cos(a), sin = Math.sin(a);
    this.mul([
      0.213 + cos * 0.787 - sin * 0.213, 0.715 - cos * 0.715 - sin * 0.715, 0.072 - cos * 0.072 + sin * 0.928,
      0.213 - cos * 0.213 + sin * 0.143, 0.715 + cos * 0.285 + sin * 0.14, 0.072 - cos * 0.072 - sin * 0.283,
      0.213 - cos * 0.213 - sin * 0.787, 0.715 - cos * 0.715 + sin * 0.715, 0.072 + cos * 0.928 + sin * 0.072,
    ]);
  }
  sepia(v) {
    this.mul([
      0.393 + 0.607 * (1 - v), 0.769 - 0.769 * (1 - v), 0.189 - 0.189 * (1 - v),
      0.349 - 0.349 * (1 - v), 0.686 + 0.314 * (1 - v), 0.168 - 0.168 * (1 - v),
      0.272 - 0.272 * (1 - v), 0.534 - 0.534 * (1 - v), 0.131 + 0.869 * (1 - v),
    ]);
  }
  saturate(v) {
    this.mul([
      0.213 + 0.787 * v, 0.715 - 0.715 * v, 0.072 - 0.072 * v,
      0.213 - 0.213 * v, 0.715 + 0.285 * v, 0.072 - 0.072 * v,
      0.213 - 0.213 * v, 0.715 - 0.715 * v, 0.072 + 0.928 * v,
    ]);
  }
  linear(slope, icpt = 0) { this.set(this.r * slope + icpt * 255, this.g * slope + icpt * 255, this.b * slope + icpt * 255); }
  brightness(v) { this.linear(v); }
  contrast(v) { this.linear(v, -(0.5 * v) + 0.5); }
  invert(v) {
    this.set((v + (this.r / 255) * (1 - 2 * v)) * 255, (v + (this.g / 255) * (1 - 2 * v)) * 255, (v + (this.b / 255) * (1 - 2 * v)) * 255);
  }
}

function filterLoss(f, target, targetHsl) {
  const c = new C(0, 0, 0);
  c.invert(f[0] / 100); c.sepia(f[1] / 100); c.saturate(f[2] / 100);
  c.hueRotate(f[3] * 3.6); c.brightness(f[4] / 100); c.contrast(f[5] / 100);
  const hsl = rgbToHsl(c);
  return Math.abs(c.r - target.r) + Math.abs(c.g - target.g) + Math.abs(c.b - target.b)
    + Math.abs(hsl.h / 3.6 - targetHsl.h / 3.6) + Math.abs(hsl.s * 100 - targetHsl.s * 100) + Math.abs(hsl.l * 100 - targetHsl.l * 100);
}

function spsa(A, a, c, values, iters, target, targetHsl) {
  const alpha = 1, gamma = 0.16667;
  let best = values, bestLoss = Infinity;
  const fix = (v, i) => {
    let max = 100;
    if (i === 2) max = 7500; else if (i === 4 || i === 5) max = 200;
    if (i === 3) { if (v > max) v %= max; else if (v < 0) v = max + (v % max); } else v = clamp(v, 0, max);
    return v;
  };
  const deltas = new Array(6), hi = new Array(6), lo = new Array(6);
  for (let k = 0; k < iters; k++) {
    const ck = c / (k + 1) ** gamma;
    for (let i = 0; i < 6; i++) {
      deltas[i] = Math.random() > 0.5 ? 1 : -1;
      hi[i] = values[i] + ck * deltas[i];
      lo[i] = values[i] - ck * deltas[i];
    }
    const diff = filterLoss(hi, target, targetHsl) - filterLoss(lo, target, targetHsl);
    for (let i = 0; i < 6; i++) {
      const g = (diff / (2 * ck)) * deltas[i];
      const ak = a[i] / (A + k + 1) ** alpha;
      values[i] = fix(values[i] - ak * g, i);
    }
    const loss = filterLoss(values, target, targetHsl);
    if (loss < bestLoss) { best = values.slice(); bestLoss = loss; }
  }
  return { values: best, loss: bestLoss };
}

const filterCache = new Map();
function cssFilterFor(hex) {
  if (filterCache.has(hex)) return filterCache.get(hex);
  const target = parseColor(hex);
  const targetHsl = rgbToHsl(target);
  let best = { loss: Infinity };
  for (let attempt = 0; attempt < 6 && best.loss > 1; attempt++) {
    const wide = spsa(5, [60, 180, 18000, 600, 1.2, 1.2], 15, [50, 20, 3750, 50, 100, 100], 1000, target, targetHsl);
    const A = wide.loss;
    const r = spsa(A, [0.25 * (A + 1), 0.25 * (A + 1), A + 1, 0.25 * (A + 1), 0.2 * (A + 1), 0.2 * (A + 1)],
      2, wide.values, 500, target, targetHsl);
    if (r.loss < best.loss) best = r;
  }
  const f = best.values.map((v) => Math.round(v));
  const css = `brightness(0) saturate(100%) invert(${f[0]}%) sepia(${f[1]}%) saturate(${f[2]}%) hue-rotate(${Math.round(f[3] * 3.6)}deg) brightness(${f[4]}%) contrast(${f[5]}%)`;
  filterCache.set(hex, css);
  return css;
}

module.exports = { parseColor, toHex, rgbToHsl, hslToRgb, luminance, shiftL, rgba, cssFilterFor };
