import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The claim path, executed rather than modelled.
 *
 * `tests/subscription-claim.test.ts` next door states this rule as a local `claimable()`
 * predicate whose comment said it "mirrors" the production query. It did not: the comment
 * said `.ilike(...)` and the body did `===`. That difference is exactly where the bug lived,
 * so the model stayed green while the code gave away other people's subscriptions.
 *
 * This file therefore runs the real `getAccess()` against a fake Supabase client whose
 * `.ilike` implements true SQL LIKE semantics. The fake is not another guess at the shape:
 * `likeToRegExp` below is validated against a real PostgreSQL server by
 * `scripts/like-semantics-check.mjs`, which fails if JS and Postgres ever disagree.
 *
 * The property under test is identity, not matching: the address Supabase verified must
 * select the row belonging to that address and no other row, whatever characters it holds.
 */

/** SQL LIKE → RegExp. `%` is any run, `_` is any single character, `\` escapes both. */
export function likeToRegExp(pattern: string): RegExp {
  let out = '';
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === '\\' && i + 1 < pattern.length) {
      out += pattern[++i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    } else if (ch === '%') out += '[\\s\\S]*';
    else if (ch === '_') out += '[\\s\\S]';
    else out += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${out}$`, 'i');
}

type Row = {
  id: string;
  user_id: string | null;
  email: string | null;
  plan: string;
  status: string;
  current_period_end: string | null;
  updated_at: string;
};

let rows: Row[];

/** Minimal PostgREST-shaped fake. `.ilike` matches the way Postgres does, not the way we meant. */
function makeDb() {
  const build = (table: string) => {
    const filtered = () => rows.filter(() => table === 'subscriptions');
    const preds: Array<(r: Row) => boolean> = [];
    let mode: 'select' | 'update' = 'select';
    let patch: Partial<Row> = {};
    let limit = Infinity;

    const api = {
      select: () => {
        mode = 'select';
        return api;
      },
      update: (p: Partial<Row>) => {
        mode = 'update';
        patch = p;
        return api;
      },
      eq: (col: keyof Row, v: unknown) => {
        preds.push((r) => r[col] === v);
        return api;
      },
      is: (col: keyof Row, v: unknown) => {
        preds.push((r) => r[col] === v);
        return api;
      },
      ilike: (col: keyof Row, pattern: string) => {
        const re = likeToRegExp(pattern);
        preds.push((r) => typeof r[col] === 'string' && re.test(r[col] as string));
        return api;
      },
      order: () => api,
      limit: (n: number) => {
        limit = n;
        return api;
      },
      then: (resolve: (v: { data: Row[] | null; error: null }) => unknown) => {
        const hit = filtered().filter((r) => preds.every((p) => p(r)));
        if (mode === 'update') {
          for (const r of hit) Object.assign(r, patch);
          return resolve({ data: hit, error: null });
        }
        return resolve({ data: hit.slice(0, limit === Infinity ? undefined : limit), error: null });
      },
    };
    return api;
  };
  return { from: (t: string) => build(t) };
}

let currentUser: { id: string; email: string | null } | null = null;

vi.mock('../src/lib/supabase/server', () => ({
  getUser: async () => currentUser,
  getServiceSupabase: () => makeDb(),
  supabaseConfigured: () => true,
  getServerSupabase: async () => null,
}));

const { getAccess } = await import('../src/lib/entitlements');

const future = new Date(Date.now() + 30 * 864e5).toISOString();

function row(over: Partial<Row>): Row {
  return {
    id: 'r',
    user_id: null,
    email: null,
    plan: 'builder',
    status: 'active',
    current_period_end: future,
    updated_at: '2026-08-01T00:00:00Z',
    ...over,
  };
}

beforeEach(() => {
  currentUser = null;
  rows = [
    row({ id: 'r1', email: 'a1_345@example.com', plan: 'builder' }),
    row({ id: 'r2', email: 'aQZ999@example.com', plan: 'founder' }),
    row({ id: 'r3', email: 'victim@example.com', plan: 'founder' }),
    row({ id: 'r4', email: 'assigned@example.com', plan: 'founder', user_id: 'u-owner' }),
  ];
});

const claimedBy = (id: string) =>
  rows
    .filter((r) => r.user_id === id)
    .map((r) => r.id)
    .sort();

describe('claiming an unassigned subscription — the real getAccess(), not a model of it', () => {
  it('claims the row whose address is exactly the verified one', async () => {
    currentUser = { id: 'u-honest', email: 'victim@example.com' };
    const access = await getAccess();
    expect(access.plan).toBe('founder');
    expect(claimedBy('u-honest')).toEqual(['r3']);
  });

  it('is case-insensitive, because Stripe does not normalise what people type', async () => {
    rows[2].email = 'Victim@Example.COM';
    currentUser = { id: 'u-honest', email: 'victim@example.com' };
    expect((await getAccess()).plan).toBe('founder');
    expect(claimedBy('u-honest')).toEqual(['r3']);
  });

  it('an underscore in a verified address is a character, not a wildcard', async () => {
    currentUser = { id: 'u-attacker', email: 'a_____@example.com' };
    const access = await getAccess();
    expect(claimedBy('u-attacker')).toEqual([]);
    expect(access.plan).toBe('free');
  });

  it('a percent in a verified address claims nothing at all', async () => {
    currentUser = { id: 'u-attacker', email: '%@example.com' };
    await getAccess();
    expect(claimedBy('u-attacker')).toEqual([]);
  });

  it("claims at most one row, so nobody takes two strangers' plans in one statement", async () => {
    currentUser = { id: 'u-attacker', email: 'a_____@example.com' };
    await getAccess();
    expect(rows.filter((r) => r.user_id === 'u-attacker').length).toBeLessThanOrEqual(1);
  });

  it('an honest customer whose own address contains an underscore still gets exactly their row', async () => {
    currentUser = { id: 'u-honest', email: 'a1_345@example.com' };
    const access = await getAccess();
    expect(claimedBy('u-honest')).toEqual(['r1']);
    expect(access.plan).toBe('builder');
  });

  it('never reassigns a row that already belongs to someone', async () => {
    currentUser = { id: 'u-attacker', email: '%@example.com' };
    await getAccess();
    expect(rows.find((r) => r.id === 'r4')!.user_id).toBe('u-owner');
  });

  it('a verified address that matches no row leaves every row alone', async () => {
    currentUser = { id: 'u-nobody', email: 'nobody@example.com' };
    expect((await getAccess()).plan).toBe('free');
    expect(rows.map((r) => r.user_id)).toEqual([null, null, null, 'u-owner']);
  });
});

describe('the LIKE fake is a real LIKE', () => {
  it('treats _ and % as metacharacters, which is why the fake can catch this at all', () => {
    expect(likeToRegExp('a_____@example.com').test('a1_345@example.com')).toBe(true);
    expect(likeToRegExp('%@example.com').test('victim@example.com')).toBe(true);
    expect(likeToRegExp('a1_345@example.com').test('a1_345@example.com')).toBe(true);
    expect(likeToRegExp('victim@example.com').test('a1_345@example.com')).toBe(false);
  });
});
