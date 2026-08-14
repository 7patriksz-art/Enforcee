/**
 * Render every page in both themes and measure what the browser ACTUALLY painted.
 *
 * The contrast test grades the palette. This grades the pages, which is a different
 * question: a token can be perfect and a page still be unreadable because some
 * element carries a hardcoded colour the theme never reaches. That is the failure
 * mode this catches, and nothing static can catch it — it needs a real layout engine
 * resolving real cascade against real markup.
 *
 * Every reported number is read out of getComputedStyle after paint. Nothing here is
 * inferred from the stylesheet.
 */
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';

const BASE = process.env.BASE ?? 'http://localhost:3000';
const PAGES = [
  '/', '/audit', '/pricing', '/install', '/enforce', '/how-it-works',
  '/learn', '/session', '/signin', '/what-is-already-free', '/privacy', '/terms',
];

const lum = ([r, g, b]) => {
  const f = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const ratio = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
const parse = (s) => (s.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);

/** Composite a possibly-translucent colour over what is behind it. */
const over = (fg, a, bg) => fg.map((c, i) => Math.round(c * a + bg[i] * (1 - a)));

mkdirSync('theme-audit', { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});
const findings = [];
// "0 findings" is only meaningful next to how much was looked at. A selector typo
// that matches nothing also reports zero, and reads identical in CI.
let measured = 0;
const pagesSeen = new Set();

for (const theme of ['light', 'dark']) {
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    colorScheme: theme,
    deviceScaleFactor: 2,
  });

  for (const path of PAGES) {
    const page = await ctx.newPage();
    await page.goto(BASE + path, { waitUntil: 'networkidle' });

    // The class must already be right — this is the no-flash guarantee, checked
    // rather than assumed.
    const hasDark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
    if (hasDark !== (theme === 'dark')) {
      findings.push({ theme, path, kind: 'THEME_NOT_APPLIED', detail: `html.dark=${hasDark}` });
    }

    // A CSS filter anywhere above the content rewrites every colour that gets
    // painted underneath it, and getComputedStyle reports the value BEFORE filters.
    // So a filtered subtree makes every measurement below a fiction. This project
    // shipped exactly that for ten minutes — a custom class named `invert`, which is
    // Tailwind's `filter: invert(100%)` — and the contrast numbers stayed perfect
    // because inverting fg and bg together preserves the ratio. The audit has to
    // police its own preconditions or its clean bill of health means nothing.
    const filtered = await page.evaluate(() =>
      [...document.querySelectorAll('body *')]
        .filter((el) => {
          const f = getComputedStyle(el).filter;
          return f && f !== 'none' && (el.textContent ?? '').trim().length > 0;
        })
        .map((el) => `${el.tagName.toLowerCase()}.${(el.className || '').toString().slice(0, 60)}`)
        .slice(0, 5)
    );
    for (const f of filtered) {
      findings.push({ theme, path, kind: 'FILTERED_SUBTREE', detail: f });
    }

    const bad = await page.evaluate(() => {
      const out = [];
      const seen = new Set();

      /** Walk up until something paints an opaque background. */
      function bgOf(el) {
        let n = el;
        while (n && n !== document.documentElement) {
          const c = getComputedStyle(n).backgroundColor;
          const m = (c.match(/[\d.]+/g) ?? []).map(Number);
          if (m.length >= 3 && (m[3] === undefined || m[3] > 0.85)) return [m[0], m[1], m[2]];
          n = n.parentElement;
        }
        const b = (getComputedStyle(document.body).backgroundColor.match(/[\d.]+/g) ?? []).map(Number);
        return [b[0] ?? 255, b[1] ?? 255, b[2] ?? 255];
      }

      for (const el of document.querySelectorAll('body *')) {
        const text = (el.textContent ?? '').trim();
        if (!text || text.length > 400) continue;
        // Only elements that render text directly, not containers.
        if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) continue;
        const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden' || cs.opacity === '0' || cs.display === 'none') continue;

        const fg = (cs.color.match(/[\d.]+/g) ?? []).map(Number);
        const alpha = fg[3] === undefined ? 1 : fg[3];
        const bg = bgOf(el);
        const px = parseFloat(cs.fontSize);
        const bold = Number(cs.fontWeight) >= 700;
        const large = px >= 24 || (px >= 18.66 && bold);

        const key = `${cs.color}|${bg.join(',')}|${Math.round(px)}`;
        if (seen.has(key)) continue;
        seen.add(key);

        out.push({
          color: cs.color, bg, px, large, alpha,
          fg: [fg[0], fg[1], fg[2]],
          sample: text.slice(0, 60),
          tag: el.tagName.toLowerCase(),
          cls: (el.className || '').toString().slice(0, 90),
        });
      }
      return out;
    });

    measured += bad.length;
    pagesSeen.add(`${theme}${path}`);

    for (const b of bad) {
      const eff = b.alpha < 1 ? over(b.fg, b.alpha, b.bg) : b.fg;
      const c = ratio(eff, b.bg);
      const need = b.large ? 3 : 4.5;
      if (c < need) {
        findings.push({
          theme, path, kind: 'LOW_CONTRAST',
          ratio: Number(c.toFixed(2)), need,
          fg: `rgb(${eff.join(' ')})`, bg: `rgb(${b.bg.join(' ')})`,
          px: b.px, tag: b.tag, cls: b.cls, sample: b.sample,
        });
      }
    }

    // And the counter-theme panels get checked against PAINTED PIXELS, not styles.
    // These are the elements that are supposed to disagree with the page around
    // them, so they are the ones where "it computes correctly" is least convincing.
    for (const el of await page.locator('.counter-theme').all()) {
      const want = await el.evaluate((n) =>
        (getComputedStyle(n).backgroundColor.match(/\d+/g) ?? []).slice(0, 3).map(Number)
      );
      if (!want.length) continue;
      // An ELEMENT screenshot, not a page clip: it scrolls the panel into view
      // itself, so panels below the fold are measured rather than crashing the run.
      const shot = await el.screenshot();
      // Sampled in the right-hand padding at half height: past the border (which is
      // 2 device pixels at dsf 2 — sampling row 3 caught the hairline and reported a
      // false mismatch), clear of the corner radius, and never on a glyph.
      const got = await page.evaluate(async (d) => {
        const img = new Image();
        img.src = 'data:image/png;base64,' + d;
        await img.decode();
        const c = document.createElement('canvas');
        c.width = img.width;
        c.height = img.height;
        const g = c.getContext('2d');
        g.drawImage(img, 0, 0);
        const q = g.getImageData(img.width - 7, Math.floor(img.height / 2), 1, 1).data;
        return [q[0], q[1], q[2]];
      }, shot.toString('base64'));

      const drift = Math.max(...want.map((c, i) => Math.abs(c - got[i])));
      if (drift > 12) {
        findings.push({
          theme, path, kind: 'PAINTED_PIXEL_MISMATCH',
          detail: `computed rgb(${want.join(' ')}) but painted rgb(${got.join(' ')}) — something is filtering or overpainting`,
        });
      }
    }

    // The element screenshots above scroll the page. Without this the "hero"
    // screenshots are of whatever happened to be on screen when sampling finished,
    // which makes the reference images useless for the one thing they are for.
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(150);

    if (path === '/' || path === '/audit' || path === '/pricing') {
      await page.screenshot({ path: `theme-audit/${theme}${path.replace(/\//g, '-')}.png`, fullPage: false });
    }
    await page.close();
  }
  await ctx.close();
}

await browser.close();

// Worst first — the number is what matters, not the order pages happen to be in.
findings.sort((a, b) => (a.ratio ?? 0) - (b.ratio ?? 0));
writeFileSync('theme-audit/findings.json', JSON.stringify(findings, null, 2));

const byTheme = (t) => findings.filter((f) => f.theme === t).length;
const expected = PAGES.length * 2;

console.log(
  `measured ${measured} distinct text/background pairs across ${pagesSeen.size}/${expected} page renders`
);
console.log(`light: ${byTheme('light')} findings   dark: ${byTheme('dark')} findings`);

// The check must not be allowed to pass by covering nothing.
if (pagesSeen.size !== expected || measured < 200) {
  console.error(
    `\nCOVERAGE FAILURE: expected ${expected} renders and >=200 pairs, got ${pagesSeen.size} and ${measured}.` +
      `\nA clean result from a scan this small is not a clean result.`
  );
  process.exit(2);
}
for (const f of findings.slice(0, 25)) {
  console.log(
    `${f.theme.padEnd(5)} ${String(f.ratio ?? '-').padStart(5)}:1 (need ${f.need ?? '-'})  ${f.path.padEnd(22)} ${f.px ?? ''}px  ${f.fg ?? ''} on ${f.bg ?? ''}  ${f.kind}\n        ${(f.cls ?? f.detail ?? '').slice(0, 100)}\n        "${(f.sample ?? '').slice(0, 60)}"`
  );
}
process.exit(findings.length ? 1 : 0);
