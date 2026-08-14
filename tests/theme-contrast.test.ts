import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Contrast is a control, not a claim.
 *
 * The comment at the top of the theme block in globals.css asserts that the muted
 * tokens clear 4.5:1. A comment is not a control — the whole argument of this
 * product is that a rule written in a document is decoration until something checks
 * it. So the assertion is computed here, from the real file, on every run.
 *
 * This test EARNS its place: writing it found `--n-400` shipping at 2.66:1 across 26
 * usages, and it is the reason both themes are legible rather than merely plausible.
 *
 * It reads globals.css as text on purpose. A fixture copy of the palette would drift
 * from the stylesheet the moment somebody nudged a value, and then it would be a
 * check that could not fail.
 */

const CSS_RAW = readFileSync(resolve(__dirname, '../src/app/globals.css'), 'utf8');

// Comments are stripped BEFORE parsing. This file is heavily commented and several
// of those comments quote selectors and braces; leaving them in makes the rule regex
// match the wrong spans and — worse — match nothing at all, at which case every
// contrast assertion below runs against an empty palette and passes vacuously.
// A green suite over zero data is the exact failure mode this project keeps hitting.
// Statement at-rules (`@tailwind utilities;`, `@import …;`) go too. They carry no
// braces, so the selector scan glues them onto whatever rule follows and the first
// theme block's selector list reads
// "@tailwind base; @tailwind components; @tailwind utilities; :root" — which never
// equals ":root". That one detail is what made this suite pass over an empty palette.
const CSS = CSS_RAW.replace(/\/\*[\s\S]*?\*\//g, '').replace(/@[\w-]+[^;{}]*;/g, '');

type RGB = [number, number, number];

/**
 * Collect `--x: r g b;` from every rule whose selector LIST contains `selector`.
 *
 * Matching the selector list rather than a bare prefix is the whole job: the theme
 * blocks are `:root, .dark .counter-theme { }` and `.dark, .counter-theme { }`, so a naive
 * `/:root\s*\{/` finds neither and the suite passes on an empty palette. Which is
 * precisely the failure this file exists to prevent, so it is worth the extra work
 * here. `.dark` must also not match `.dark .counter-theme`, hence the exact compare.
 */
function tokensIn(selector: string): Record<string, RGB> {
  const out: Record<string, RGB> = {};
  // There is more than one matching block in the file (theme, fonts, motion,
  // elevation). Every one is merged in source order, exactly as the cascade would.
  // `[^{}]` on both sides means an @media wrapper cannot be mistaken for a rule —
  // its body has braces, so the match fails there and resumes at the rules inside.
  for (const rule of CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = rule[1].split(',').map((s) => s.replace(/\s+/g, ' ').trim());
    if (!selectors.includes(selector)) continue;
    for (const d of rule[2].matchAll(/--([\w-]+)\s*:\s*(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})\s*;/g)) {
      out[d[1]] = [Number(d[2]), Number(d[3]), Number(d[4])];
    }
  }
  return out;
}

const LIGHT = tokensIn(':root');
const DARK = { ...LIGHT, ...tokensIn('.dark') }; // .dark overrides, it does not replace

// An inverted panel takes the OPPOSING palette: dark values when the page is light,
// light values when the page is dark. Both are graded below like any other surface,
// because "the dark band on the landing page" is where the first real inversion bug
// turned up — clay-soft text at 1.5:1 once the band went cream.
const INVERT_ON_LIGHT = { ...LIGHT, ...tokensIn('.counter-theme') };
const INVERT_ON_DARK = { ...DARK, ...tokensIn('.dark .counter-theme') };

/** WCAG 2.1 relative luminance. */
function luminance([r, g, b]: RGB): number {
  const f = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrast(a: RGB, b: RGB): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Text token, background token, and the ratio it has to clear. */
const TEXT_ON_SURFACE: [string, string, number][] = [
  // Body copy. 4.5:1 is the AA floor for normal-size text.
  ['c-ink', 'c-paper', 7],
  ['c-ink', 'c-card', 7],
  ['c-ink-soft', 'c-paper', 7],
  ['c-ink-mid', 'c-paper', 4.5],
  ['c-ink-mid', 'c-card', 4.5],
  ['c-ink-mid', 'c-paper-soft', 4.5],

  // The muted tokens. These are the ones that fail on real sites, because they are
  // chosen by eye against a mockup and never measured.
  ['c-skip', 'c-paper', 4.5],
  ['c-skip', 'c-card', 4.5],
  ['c-skip', 'c-paper-soft', 4.5],
  ['n-400', 'c-card', 4.5],
  ['n-400', 'c-paper', 4.5],
  // ink-light is the low-emphasis TEXT token — step numbers, the "—" that means
  // "not included", disabled toggles, placeholders. A rendered audit caught it at
  // 4.13:1 on the dark card, which is why these three rows exist.
  ['c-ink-light', 'c-card', 4.5],
  ['c-ink-light', 'c-paper', 4.5],
  ['c-ink-light', 'c-paper-soft', 4.5],
  ['n-500', 'c-card', 4.5],
  ['n-600', 'c-card', 4.5],

  // Status chips: coloured text on its own pale ground. Every verdict the product
  // prints goes through one of these, so an unreadable one is an unreadable receipt.
  ['c-pass', 'c-pass-pale', 4.5],
  ['c-fail', 'c-fail-pale', 4.5],
  ['c-unknown', 'c-unknown-pale', 4.5],
  ['c-clay', 'c-clay-pale', 4.5],
  ['g-800', 'g-50', 4.5],
  ['r-800', 'r-50', 4.5],
  ['a-800', 'a-50', 4.5],
  ['n-600', 'n-100', 4.5],

  // Links, and the accent on the page it actually sits on.
  ['c-brand', 'c-paper', 4.5],
  ['c-brand', 'c-card', 4.5],
  ['c-brand-deep', 'c-brand-pale', 4.5],

  // The inverted button: `bg-ink text-white`, where `white` is remapped to --c-card.
  // In dark this becomes near-black on cream. If the remap is ever undone this pair
  // collapses to cream-on-cream and the primary CTA disappears.
  ['c-card', 'c-ink', 7],
];

for (const [name, palette] of [
  ['light', LIGHT],
  ['dark', DARK],
  ['inverted panel on a light page', INVERT_ON_LIGHT],
  ['inverted panel on a dark page', INVERT_ON_DARK],
] as const) {
  describe(`${name} theme contrast`, () => {
    it('defines every token the site references', () => {
      for (const [fg, bg] of TEXT_ON_SURFACE) {
        expect(palette[fg], `--${fg} missing from ${name}`).toBeDefined();
        expect(palette[bg], `--${bg} missing from ${name}`).toBeDefined();
      }
    });

    for (const [fg, bg, min] of TEXT_ON_SURFACE) {
      it(`--${fg} on --${bg} clears ${min}:1`, () => {
        const ratio = contrast(palette[fg], palette[bg]);
        expect(
          Number(ratio.toFixed(2)),
          `--${fg} on --${bg} in ${name} is ${ratio.toFixed(2)}:1, needs ${min}:1`
        ).toBeGreaterThanOrEqual(min);
      });
    }
  });
}

describe('the parser itself', () => {
  // Without this, a selector rename upstream turns every assertion in this file into
  // `contrast(undefined, undefined)` and the suite goes green over nothing. The
  // charter's rule — never let a check silently cover nothing — applies to the
  // checker before it applies to the thing checked.
  it('actually found both palettes', () => {
    expect(Object.keys(LIGHT).length).toBeGreaterThan(60);
    expect(Object.keys(tokensIn('.dark')).length).toBeGreaterThan(60);
    expect(Object.keys(tokensIn('.counter-theme')).length).toBeGreaterThan(60);
    expect(Object.keys(tokensIn('.dark .counter-theme')).length).toBeGreaterThan(60);
    expect(LIGHT['c-paper']).toEqual([253, 252, 249]);
    expect(DARK['c-paper']).not.toEqual(LIGHT['c-paper']);
  });
});

describe('theme wiring', () => {
  it('gives the dark theme its own value for every colour the light theme has', () => {
    // A token present in :root but absent from .dark keeps its LIGHT value on a dark
    // page — which is how a single near-white block ends up in an otherwise dark UI.
    // This catches it at build time instead of by screenshot.
    const light = Object.keys(tokensIn(':root')).filter((k) => /^(c|n|g|r|a|b)-/.test(k));
    const dark = new Set(Object.keys(tokensIn('.dark')));
    const missing = light.filter((k) => !dark.has(k));
    expect(missing, `no dark value for: ${missing.join(', ')}`).toEqual([]);
  });

  it('gives an inverted panel the OPPOSING palette, not just an opposing background', () => {
    // The failure this replaces: `bg-ink text-white` painted a dark band whose
    // accents stayed light-mode. In dark the band went cream and the accent stayed
    // pale orange — 1.5:1, measured in a browser, on the landing page.
    const lightInk = LIGHT['c-ink'];
    const darkInk = DARK['c-ink'];
    expect(INVERT_ON_LIGHT['c-ink']).toEqual(darkInk);
    expect(INVERT_ON_DARK['c-ink']).toEqual(lightInk);
    // …and it has to be the WHOLE palette, not a couple of hand-picked tokens.
    for (const k of Object.keys(LIGHT).filter((k) => /^(c|n|g|r|a|b)-/.test(k))) {
      expect(INVERT_ON_LIGHT[k], `--${k} does not invert`).toEqual(DARK[k]);
      expect(INVERT_ON_DARK[k], `--${k} does not invert back`).toEqual(LIGHT[k]);
    }
  });

  it('remaps Tailwind white so bg-white follows the theme', () => {
    const cfg = readFileSync(resolve(__dirname, '../tailwind.config.ts'), 'utf8');
    expect(cfg).toMatch(/white:\s*'rgb\(var\(--c-card\)\s*\/\s*<alpha-value>\)'/);
  });

  it('keeps the alpha placeholder on every colour, or translucency dies silently', () => {
    const cfg = readFileSync(resolve(__dirname, '../tailwind.config.ts'), 'utf8');
    const varColours = cfg.match(/rgb\(var\(--[\w-]+\)[^)]*\)/g) ?? [];
    expect(varColours.length).toBeGreaterThan(20);
    for (const c of varColours) {
      expect(c, `${c} lost its <alpha-value>`).toContain('<alpha-value>');
    }
  });

  it('applies the theme before first paint, not in an effect', () => {
    const theme = readFileSync(resolve(__dirname, '../src/lib/theme.ts'), 'utf8');
    const layout = readFileSync(resolve(__dirname, '../src/app/layout.tsx'), 'utf8');
    // The script must be inline in <head> and must be the generated one, so the
    // storage key cannot drift from the toggle's.
    expect(layout).toContain('THEME_INIT_SCRIPT');
    expect(layout).toMatch(/<head>/);
    expect(theme).toContain('classList.add');
    expect(theme).toContain('try{');
  });

  it('never lets the theme cross-fade override prefers-reduced-motion', () => {
    // `html.theme-animating *` outscores the global `*` reset even though both are
    // !important, so without an explicit media guard the largest motion on the site
    // is the one that ignores the setting.
    const guarded = /@media\s*\(prefers-reduced-motion:\s*no-preference\)\s*\{[^@]*html\.theme-animating/s;
    expect(CSS).toMatch(guarded);
  });
});
