// Palette gate. Reads the tokens that actually ship out of app/globals.css and
// checks them, so the numbers in docs/architecture/design-system.md cannot drift
// from the stylesheet. No dependencies.
//
//   node scripts/validate-palette.mjs      (npm run validate:palette)
//
// Checks, per theme:
//   1. WCAG contrast for every text token on both of its grounds.
//   2. Quadrant hues on --panel: 3:1 graphical floor (WCAG 1.4.11), except
//      --drip-delegate which also renders as chip text (.rec.delegate) and so
//      carries the 4.5:1 small-text floor.
//   3. Perceptual separation of every quadrant pair in OKLab, under normal
//      vision and under simulated deuteranopia and protanopia. Red-green CVD
//      collapses hue onto a blue-yellow axis, so a palette that only separates
//      by hue passes a naive check and fails a real reader.
//   4. That --accent is far enough from every quadrant hue to never read as one.
//   5. Surface stepping, hairline visibility, and a monotonic sequential ramp.
//
// Exits non-zero on any failure so CI can gate on it.

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/* ----------------------------------------------------------------- color */

const hex2rgb = (h) => [0, 2, 4].map((i) => parseInt(h.slice(1 + i, 3 + i), 16) / 255);
const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const unlin = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);

const relLum = (h) => {
  const [r, g, b] = hex2rgb(h).map(lin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const contrast = (a, b) => {
  const [hi, lo] = [relLum(a), relLum(b)].sort((m, n) => n - m);
  return (hi + 0.05) / (lo + 0.05);
};

const oklab = (h) => {
  const [r, g, b] = hex2rgb(h).map(lin);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
};

const lightnessOf = (h) => oklab(h)[0] * 100;

const separation = (a, b) => {
  const [x, y] = [oklab(a), oklab(b)];
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]) * 100;
};

// Viénot–Brettel–Mollon dichromat projection through Hunt-Pointer-Estevez LMS.
const RGB2LMS = [
  [0.31399022, 0.63951294, 0.04649755],
  [0.15537241, 0.75789446, 0.08670142],
  [0.01775239, 0.10944209, 0.87256922],
];
const LMS2RGB = [
  [5.47221206, -4.6419601, 0.16963708],
  [-1.1252419, 2.29317094, -0.1678952],
  [0.02980165, -0.19318073, 1.16364789],
];
const PROJECT = {
  deuteranopia: [[1, 0, 0], [0.9513092, 0, 0.04866992], [0, 0, 1]],
  protanopia: [[0, 1.05118294, -0.05116099], [0, 1, 0], [0, 0, 1]],
};

const mul = (M, v) => M.map((row) => row[0] * v[0] + row[1] * v[1] + row[2] * v[2]);

const simulate = (hex, kind) => {
  const out = mul(LMS2RGB, mul(PROJECT[kind], mul(RGB2LMS, hex2rgb(hex).map(lin))))
    .map((c) => Math.max(0, Math.min(1, c)))
    .map(unlin);
  return '#' + out.map((c) => Math.round(Math.max(0, Math.min(1, c)) * 255).toString(16).padStart(2, '0')).join('');
};

/* ------------------------------------------------------------ token load */

// The two explicit override blocks are the canonical definitions: :root and the
// prefers-color-scheme block duplicate them, and a mismatch is itself a bug, so
// parse all four and cross-check.
function block(css, selector) {
  const start = css.indexOf(selector);
  if (start === -1) throw new Error(`missing block: ${selector}`);
  const open = css.indexOf('{', start);
  const close = css.indexOf('}', open);
  const tokens = {};
  for (const [, name, value] of css.slice(open, close).matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    tokens[name] = value.toLowerCase();
  }
  return tokens;
}

const QUADRANTS = ['drip-delegate', 'drip-replace', 'drip-invest', 'drip-produce'];

let failures = 0;
let warnings = 0;

const report = (label, actual, ok, detail) => {
  if (!ok) failures++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label.padEnd(42)} ${actual}${detail ? '   ' + detail : ''}`);
};

function checkTheme(name, t) {
  console.log(`\n${name}`);

  console.log('  -- text contrast --');
  for (const [token, ground, min] of [
    ['ink', 'paper', 7], ['ink', 'panel', 7],
    ['ink-2', 'paper', 4.5], ['ink-2', 'panel', 4.5],
    ['ink-3', 'paper', 3], ['ink-3', 'panel', 3],
    ['accent', 'paper', 4.5], ['accent', 'panel', 4.5],
    ['good', 'panel', 4.5], ['warn', 'panel', 4.5], ['crit', 'panel', 4.5],
  ]) {
    const r = contrast(t[token], t[ground]);
    report(`--${token} on --${ground}`, `${r.toFixed(2)}:1`, r >= min, `need ${min}`);
  }
  const ac = contrast(t['accent-contrast'], t.accent);
  report('--accent-contrast on --accent', `${ac.toFixed(2)}:1`, ac >= 4.5, 'need 4.5');

  console.log('  -- quadrant hues on --panel --');
  for (const q of QUADRANTS) {
    // .rec.delegate renders --drip-delegate as 10.5px text; the rest are dots,
    // bars and washes, which take the graphical floor.
    const min = q === 'drip-delegate' ? 4.5 : 3.0;
    const r = contrast(t[q], t.panel);
    report(`--${q}`, `${r.toFixed(2)}:1`, r >= min, `need ${min}${min === 4.5 ? ' (used as text)' : ''}`);
  }

  console.log('  -- quadrant separation (normal >= 15, dichromat >= 9) --');
  for (let i = 0; i < QUADRANTS.length; i++) {
    for (let j = i + 1; j < QUADRANTS.length; j++) {
      const [a, b] = [t[QUADRANTS[i]], t[QUADRANTS[j]]];
      const normal = separation(a, b);
      const deut = separation(simulate(a, 'deuteranopia'), simulate(b, 'deuteranopia'));
      const prot = separation(simulate(a, 'protanopia'), simulate(b, 'protanopia'));
      const pair = `${QUADRANTS[i].slice(5)} / ${QUADRANTS[j].slice(5)}`;
      report(
        pair,
        `${normal.toFixed(1)}`,
        normal >= 15 && Math.min(deut, prot) >= 9,
        `deut ${deut.toFixed(1)}  prot ${prot.toFixed(1)}`,
      );
    }
  }

  console.log('  -- accent must never read as a quadrant (>= 18) --');
  for (const q of QUADRANTS) {
    const d = separation(t.accent, t[q]);
    report(`--accent vs --${q}`, d.toFixed(1), d >= 18);
  }

  // Temperature. The chrome is meant to be cool blue-grey, so every neutral
  // must carry its blue channel at or above red and green. This exists because
  // an earlier palette was described as achromatic and shipped with blue 1-2
  // points LOW on nine of ten dark neutrals — invisible in a hex diff, but
  // --ink paints the display headline and every light element, so the whole
  // page read as cream. A one-point channel error is not something to catch by
  // eye on your own monitor.
  console.log('  -- neutral temperature (blue must not be lowest) --');
  for (const n of ['paper', 'panel', 'panel-2', 'inset', 'line', 'line-2', 'ink', 'ink-2', 'ink-3', 'accent']) {
    const hex = t[n];
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    const warm = b < Math.min(r, g);
    report(`--${n}`, hex, !warm, `R${r} G${g} B${b}${warm ? '  <- WARM' : ''}`);
  }

  console.log('  -- surfaces and hairlines --');
  for (const [a, b] of [['paper', 'panel'], ['panel', 'panel-2'], ['panel-2', 'inset']]) {
    const dL = Math.abs(lightnessOf(t[a]) - lightnessOf(t[b]));
    report(`--${a} -> --${b}`, `dL ${dL.toFixed(1)}`, dL >= 0.8 && dL <= 8, 'want 0.8-8');
  }
  for (const l of ['line', 'line-2']) {
    const r = contrast(t[l], t.panel);
    report(`--${l} on --panel`, `${r.toFixed(2)}:1`, r >= 1.25, 'need 1.25');
  }

  const ramp = [1, 2, 3, 4, 5].map((i) => lightnessOf(t[`seq-${i}`]));
  const steps = ramp.slice(1).map((v, i) => Math.abs(v - ramp[i]));
  const monotonic = ramp.every((v, i) => i === 0 || (ramp[4] > ramp[0] ? v > ramp[i - 1] : v < ramp[i - 1]));
  report(
    'sequential ramp',
    ramp.map((v) => v.toFixed(0)).join(' > '),
    monotonic && Math.min(...steps) >= 8,
    `min step ${Math.min(...steps).toFixed(1)}`,
  );
}

/* -------------------------------------------------------------- run */

const css = await readFile(join(ROOT, 'app', 'globals.css'), 'utf8');
const light = block(css, ':root[data-theme="light"]');
const dark = block(css, ':root[data-theme="dark"]');
const base = block(css, ':root {');
const media = block(css, '@media (prefers-color-scheme: dark)');

// The OS-preference blocks must agree with the explicit overrides, or the theme
// toggle silently changes colors when it should only change which set applies.
console.log('theme block consistency');
for (const [label, a, b] of [[':root vs [data-theme=light]', base, light], ['prefers-dark vs [data-theme=dark]', media, dark]]) {
  const drift = Object.keys(b).filter((k) => a[k] !== undefined && a[k] !== b[k]);
  report(label, drift.length ? `drift: ${drift.join(', ')}` : 'identical', drift.length === 0);
}

checkTheme('LIGHT', light);
checkTheme('DARK', dark);

console.log(
  `\n${failures === 0 ? 'PASS' : `FAIL — ${failures} check${failures === 1 ? '' : 's'}`}` +
    `${warnings ? `, ${warnings} warning(s)` : ''}\n`,
);
process.exit(failures === 0 ? 0 : 1);
