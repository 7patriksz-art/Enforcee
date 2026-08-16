import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

/**
 * Rules for claiming a subscription paid for without signing in.
 *
 * Checkout deliberately does not require an account, so the webhook writes rows with
 * user_id: null. Nothing claimed them, so anyone who paid before signing in ended up with a
 * subscription that existed, charged them, and entitled nothing.
 *
 * The fix matches on email, and the safety of that rests entirely on which email is which:
 *
 *   - `user.email` is Supabase's VERIFIED address. The person proved control of that inbox.
 *   - `row.email` is whatever was typed into Stripe. It is never trusted as identity — it is
 *     only ever the value being matched against.
 *   - Only rows with user_id IS NULL are eligible, so an assigned subscription can never be
 *     reassigned no matter what anyone types at checkout.
 *
 * The attack this must not permit: signing in as myself and claiming a subscription bought
 * under somebody else's address. Modelled here as pure predicate logic so the rule is
 * testable without a database.
 */
type Row = { email: string | null; userId: string | null };

/**
 * NOT a mirror of the production query, and the comment that said it was is the reason a
 * live cross-account bug sat under a green suite: this says `===`, the code said `.ilike`,
 * and the difference decided whose subscription you got. It is kept as what it always was —
 * a statement of the *rule* — and the query itself is executed in
 * `tests/subscription-claim-wildcards.test.ts`. A test that models production code tests the
 * model. If a comment here ever claims to match `entitlements.ts` again, distrust it.
 */
function claimable(row: Row, verifiedEmail: string | null): boolean {
  if (!verifiedEmail) return false;
  if (row.userId !== null) return false;
  if (!row.email) return false;
  return row.email.toLowerCase() === verifiedEmail.toLowerCase();
}

describe('claiming an anonymous subscription', () => {
  it('claims a row bought with the same verified address', () => {
    expect(claimable({ email: 'p@example.com', userId: null }, 'p@example.com')).toBe(true);
  });

  it('is case-insensitive, because Stripe does not normalise what people type', () => {
    expect(claimable({ email: 'P@Example.COM', userId: null }, 'p@example.com')).toBe(true);
  });

  it('REFUSES a row already assigned to someone', () => {
    expect(claimable({ email: 'p@example.com', userId: 'someone-else' }, 'p@example.com')).toBe(false);
  });

  it("REFUSES another person's address", () => {
    expect(claimable({ email: 'victim@example.com', userId: null }, 'attacker@example.com')).toBe(false);
  });

  it('refuses when the account has no verified email at all', () => {
    expect(claimable({ email: 'p@example.com', userId: null }, null)).toBe(false);
  });

  it('refuses a row with no email rather than matching loosely', () => {
    expect(claimable({ email: null, userId: null }, 'p@example.com')).toBe(false);
  });

  it('does not treat a substring or lookalike as a match', () => {
    expect(claimable({ email: 'p@example.com.evil.net', userId: null }, 'p@example.com')).toBe(false);
    expect(claimable({ email: 'p@example.co', userId: null }, 'p@example.com')).toBe(false);
  });
});

describe('money can never be taken without an account to attach it to', () => {
  const ROOT = fileURLToPath(new URL('..', import.meta.url));

  it('the checkout route refuses a signed-out caller', () => {
    // Anonymous checkout wrote user_id: null through the webhook, and nothing reads a null.
    // A signed-out person could be charged monthly for a subscription attached to no
    // account: no guard, no licence, no way to claim it later. 12-DECISIONS-monetisation.md
    // listed this under "still open BEFORE checkout goes live"; checkout went live with it
    // still open.
    const src = readFileSync(join(ROOT, 'src/app/api/checkout/route.ts'), 'utf8');
    expect(src, 'checkout must reject a signed-out caller').toMatch(/if\s*\(\s*!user\s*\)/);
    expect(src).toMatch(/status:\s*401/);
    expect(src, 'and must hand back somewhere to go').toMatch(/signInUrl/);
  });

  it('the pricing page sends them to sign in rather than to a dead error', () => {
    const src = readFileSync(join(ROOT, 'src/app/pricing/page.tsx'), 'utf8');
    expect(src).toMatch(/res\.status === 401/);
    expect(src).toMatch(/signInUrl/);
  });

  it('nothing falls back to the custom domain before it is switched on deliberately', () => {
    // A hardcoded production fallback to enforcee.com would have sent every Stripe redirect
    // to the registrar's parking page for as long as DNS was not attached. The switch is an
    // env var, set once, after the domain resolves.
    const src = readFileSync(join(ROOT, 'src/lib/site-url.ts'), 'utf8');
    const code = src.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
    expect(code, 'enforcee.com must only arrive via NEXT_PUBLIC_SITE_URL').not.toMatch(/['"`]https:\/\/enforcee\.com/);
  });

  it('Stripe redirects to the same origin as everything else', () => {
    const src = readFileSync(join(ROOT, 'src/lib/stripe.ts'), 'utf8');
    expect(src, 'stripe.ts must not carry its own copy of the site URL').toMatch(/SITE_URL/);
    expect(src).not.toMatch(/VERCEL_URL/);
  });
});
