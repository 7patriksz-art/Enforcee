import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The verdict logic, tested for the branch that costs us money.
 *
 * A value dashboard that always concludes "worth it" is marketing, and the audience this
 * product sells to can smell it. The `quiet` branch — paying subscriber, nothing caught —
 * has to exist and has to point at the cancel link, or none of the other numbers on the
 * page are believable either.
 *
 * Mirrors judge() in src/lib/value.ts.
 */
type PlanId = 'free' | 'builder' | 'founder';
const MIN_AUDITS = 5;

function judge(plan: PlanId, audits: number, caught: number) {
  if (plan === 'free') return 'free';
  if (audits < MIN_AUDITS) return 'too-early';
  if (caught === 0) return 'quiet';
  return 'earning-it';
}

describe('value verdict', () => {
  it('tells a paying subscriber who caught nothing that it caught nothing', () => {
    expect(judge('builder', 40, 0)).toBe('quiet');
    expect(judge('founder', 200, 0)).toBe('quiet');
  });

  it('refuses to conclude anything from a small sample', () => {
    expect(judge('builder', 4, 0)).toBe('too-early');
    // Even with a catch — one violation in three audits is not a track record.
    expect(judge('builder', 3, 1)).toBe('too-early');
  });

  it('claims value only when it actually caught something, over a real sample', () => {
    expect(judge('builder', 5, 1)).toBe('earning-it');
  });

  it('never asks a free user to justify a spend they are not making', () => {
    expect(judge('free', 0, 0)).toBe('free');
    expect(judge('free', 500, 0)).toBe('free');
  });

  it('is not gameable by volume alone — more audits with no catches stays quiet', () => {
    for (const n of [5, 50, 500]) expect(judge('builder', n, 0)).toBe('quiet');
  });
});

describe('the site URL is the real domain, in one place', () => {
  it('nothing authored still points at the old vercel.app host', () => {
    // The domain moved to enforcee.com on 2026-08-14. This is the eleventh instance on
    // this project of one value living in several files, so it gets a test rather than a
    // careful search: the licence message, the plugin manifest, the marketplace entry, the
    // npm homepage, the privacy and terms pages and the CLI all carried it separately.
    const ROOT = fileURLToPath(new URL('..', import.meta.url));
    const SKIP = new Set(['node_modules', '.git', '.next', 'dist', 'npm-dist', 'coverage']);
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
        if (SKIP.has(e.name) || e.name.startsWith('.')) continue;
        const rel = join(dir, e.name);
        if (e.isDirectory()) walk(rel);
        else if (/\.(ts|tsx|mjs|json|md|yml)$/.test(e.name)) {
          if (readFileSync(join(ROOT, rel), 'utf8').includes('enforcee.vercel.app')) offenders.push(rel);
        }
      }
    };
    for (const d of ['src', 'cli', 'guard', 'scripts', 'plugin', '.claude-plugin']) walk(d);
    expect(offenders, 'these still name the old host').toEqual([]);
  });
});
