import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { ENTITLEMENTS, type PlanId } from '../src/lib/plans';

/**
 * The pricing page renders a hand-written comparison matrix. It is prose; ENTITLEMENTS is
 * what the product actually enforces. Nothing tied them together, so they drifted: the CI
 * gate was moved to Builder in code and the table still showed it as Founder-only.
 *
 * That drift has a specific victim. The table is what somebody reads while deciding whether
 * to pay, so the stale copy does not merely mislead — it talks a buyer out of the cheaper
 * plan that would have served them, or sells them the dearer one for a reason that is not
 * true. Fifth duplicated-source bug on this project; same shape as the rest.
 *
 * Parsed from source rather than imported because the page is a server component with JSX.
 */
const SRC = readFileSync(new URL('../src/app/pricing/page.tsx', import.meta.url), 'utf8');

function rowsWithKeys(): { key: string; free: boolean; builder: boolean; founder: boolean }[] {
  const out: { key: string; free: boolean; builder: boolean; founder: boolean }[] = [];
  const re = /key: '(\w+)',[\s\S]*?free: (true|false|'[^']*'),\s*builder: (true|false|'[^']*'),\s*founder: (true|false|'[^']*'),/g;
  for (const m of SRC.matchAll(re)) {
    out.push({ key: m[1], free: m[2] === 'true', builder: m[3] === 'true', founder: m[4] === 'true' });
  }
  return out;
}

describe('pricing matrix', () => {
  const rows = rowsWithKeys();

  it('found the keyed rows to check', () => {
    expect(rows.length).toBeGreaterThanOrEqual(7);
  });

  for (const plan of ['free', 'builder', 'founder'] as PlanId[]) {
    it(`agrees with ENTITLEMENTS for ${plan}`, () => {
      for (const row of rows) {
        const actual = ENTITLEMENTS[plan][row.key as keyof (typeof ENTITLEMENTS)[PlanId]];
        expect(row[plan], `pricing table says ${plan}.${row.key}=${row[plan]}, product says ${actual}`).toBe(actual);
      }
    });
  }
});
