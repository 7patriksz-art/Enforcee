import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * Being findable is a feature, and it had no control.
 *
 * Eleven of sixteen pages exported no metadata, so every one of them inherited the root
 * title and shipped to search as "Enforcee — stop fighting your own AI". Six of those are
 * client components, where an exported `metadata` is SILENTLY IGNORED by Next rather than
 * erroring — the worst possible shape, because the page looks correct in the source and is
 * wrong in the served HTML.
 *
 * `/what-is-already-free`, the most distinctive page on the site and the one most likely to
 * be linked from outside, was missing from the sitemap entirely.
 *
 * None of this is visible from the browser. It is only visible from a test.
 */

const ROOT = resolve(__dirname, '..');
const APP = join(ROOT, 'src', 'app');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

/** Public routes: every directory under app/ with a page, minus gated and dynamic ones. */
const GATED = new Set(['admin', 'history', 'account', 'value', 'api', 'auth']);
const routes = readdirSync(APP, { withFileTypes: true })
  .filter((d) => d.isDirectory() && !d.name.startsWith('_') && !d.name.startsWith('('))
  .filter((d) => !GATED.has(d.name))
  .filter((d) => existsSync(join(APP, d.name, 'page.tsx')))
  .map((d) => d.name);

describe('every public page is findable on its own terms', () => {
  it('found routes to check', () => {
    // Coverage control: a walk that returns nothing passes everything below it.
    expect(routes.length).toBeGreaterThan(8);
    expect(routes).toContain('pricing');
    expect(routes).toContain('faq');
  });

  for (const r of routes) {
    it(`/${r} declares its own title`, () => {
      const page = read(join('src', 'app', r, 'page.tsx'));
      const layoutPath = join('src', 'app', r, 'layout.tsx');
      const layout = existsSync(join(ROOT, layoutPath)) ? read(layoutPath) : '';

      // A CLIENT page cannot export metadata — Next ignores it without complaint. So the
      // declaration has to live in a sibling server layout, and asserting "one of the two
      // has it" would let exactly that silent failure through.
      const isClient = /^['"]use client['"]/.test(page.trimStart());
      const source = isClient ? layout : page;
      const where = isClient ? `${r}/layout.tsx (page is a client component)` : `${r}/page.tsx`;

      expect(source, `no metadata in ${where}`).toContain('export const metadata');
      expect(source, `${where} should use the shared pageMeta helper`).toContain('pageMeta');
    });
  }

  it('no two pages share a title', () => {
    // The actual defect: duplicate titles make a site compete with itself, and search
    // engines collapse them. Extracted from source rather than rendered HTML so this runs
    // without a server, but it is checking the same string.
    const titles = new Map<string, string>();
    for (const r of routes) {
      for (const f of ['page.tsx', 'layout.tsx']) {
        const p = join('src', 'app', r, f);
        if (!existsSync(join(ROOT, p))) continue;
        const m = read(p).match(/title:\s*'([^']+)'/);
        if (!m) continue;
        const prev = titles.get(m[1]);
        expect(prev, `"${m[1]}" is the title of both /${prev} and /${r}`).toBeUndefined();
        titles.set(m[1], r);
      }
    }
    expect(titles.size).toBeGreaterThan(6);
  });
});

describe('sitemap', () => {
  const sitemap = read('src/app/sitemap.ts');

  it('lists every public page that is meant to be indexed', () => {
    // A noIndex route belongs in neither. /signin is the case: indexing a sign-in form
    // wastes crawl budget on a page nobody can arrive at usefully, and listing it in the
    // sitemap while telling robots not to index it is a contradiction search engines
    // report as an error.
    const noIndexed = routes.filter((r) => {
      for (const f of ['page.tsx', 'layout.tsx']) {
        const p = join('src', 'app', r, f);
        if (existsSync(join(ROOT, p)) && read(p).includes('noIndex: true')) return true;
      }
      return false;
    });
    const missing = routes.filter((r) => !noIndexed.includes(r)).filter((r) => !sitemap.includes(`'/${r}'`));
    expect(missing, `not in the sitemap: ${missing.join(', ')}`).toEqual([]);
    for (const r of noIndexed) {
      expect(sitemap, `/${r} is noIndex and must not be in the sitemap`).not.toContain(`'/${r}'`);
    }
    expect(noIndexed.length, 'nothing is noIndex — the check above covers nothing').toBeGreaterThan(0);
  });

  it('lists no gated page', () => {
    for (const g of ['/admin', '/history', '/account']) {
      expect(sitemap, `${g} must not be indexed`).not.toContain(`'${g}'`);
    }
  });
});

describe('structured data and AI-readable surfaces', () => {
  it('the root layout carries software and organization schema', () => {
    const layout = read('src/app/layout.tsx');
    expect(layout).toContain('application/ld+json');
    expect(layout).toContain('softwareSchema');
    expect(layout).toContain('organizationSchema');
  });

  it('the FAQ schema is generated from the rendered questions, never hand-written', () => {
    // A second, hand-maintained copy of the questions would drift — and drift here lands in
    // a machine-readable format that search engines cache and show to buyers. Twelve
    // duplicated-source bugs on this project; this is the worst place for the thirteenth.
    const faq = read('src/app/faq/page.tsx');
    expect(faq).toContain("'@type': 'FAQPage'");
    expect(faq).toMatch(/mainEntity:\s*SECTIONS\.flatMap/);
  });

  it('serves an llms.txt that does not overstate the product', () => {
    const llms = read('src/app/llms.txt/route.ts');
    expect(llms).toContain('# Enforcee');
    // The limits section is not optional. A model that repeats a claim from here and is
    // contradicted by the site has been made to lie by us.
    expect(llms).toContain('## What it cannot do');
    expect(llms).toMatch(/not.*adoption|not installs|registry mirrors/i);
    // And it must not hardcode the domain — D-025.
    const body = llms.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(/['"`]https:\/\/(www\.)?enforcee\.com/.test(body)).toBe(false);
    expect(llms).toContain('SITE_URL');
  });

  it('robots allows the public site and blocks the gated parts', () => {
    const robots = read('src/app/robots.ts');
    expect(robots).toContain("allow: '/'");
    for (const g of ['/admin', '/history', '/api/']) expect(robots).toContain(g);
  });
});
