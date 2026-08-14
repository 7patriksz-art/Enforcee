import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * D-018: our unit cost is never stated on a public surface.
 *
 * The admin screen renders cost per audit and total spend, which is exactly right — and
 * exactly the thing that leaks if someone imports that component or module somewhere
 * convenient later. The rule was a sentence in a decisions doc; a sentence is not a
 * control, and five duplicated-source bugs on this project have made that point already.
 */
const ROOT = fileURLToPath(new URL('../src', import.meta.url));
const GUARDED = ['@/lib/admin-metrics', './Metrics', '@/app/admin/Metrics'];

/**
 * Paths come back with forward slashes on every platform.
 *
 * The filters below ask questions like `!f.includes('/app/admin/')`. On Windows the
 * separator is a backslash, so that exclusion matched nothing, every file under /admin was
 * reported as an offender, and the test failed by accusing the one directory it exists to
 * permit. Fourth instance on this project of a `/` assumed to be universal — and the first
 * three were fixed one commit ago, in a pass that missed this file.
 *
 * Normalising here rather than at each call site, because the call sites are exactly where
 * the next filter added will forget.
 */
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(f) ? [p.split(sep).join('/')] : [];
  });
}

describe('unit cost containment (D-018)', () => {
  const files = walk(ROOT);

  it('found files to check', () => {
    expect(files.length).toBeGreaterThan(20);
    // The walker's own control: if it ever returns a platform separator again, the filters
    // below silently stop filtering and this suite starts passing for the wrong reason.
    expect(files.filter((f) => f.includes('\\')), 'walk() leaked a backslash path').toEqual([]);
  });

  it('nothing outside /admin imports the cost metrics', () => {
    const offenders = files
      .filter((f) => !f.includes('/app/admin/'))
      .filter((f) => {
        const src = readFileSync(f, 'utf8');
        return GUARDED.some((g) => src.includes(`from '${g}'`));
      });
    expect(offenders, `these import admin cost metrics from outside /admin: ${offenders.join(', ')}`).toEqual([]);
  });

  it('the admin screen is the only place cost-per-audit is rendered', () => {
    const offenders = files
      .filter((f) => !f.includes('/app/admin/') && !f.includes('/lib/admin-metrics'))
      .filter((f) => /cost per audit/i.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
