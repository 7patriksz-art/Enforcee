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

/** Mirrors: .is('user_id', null).ilike('email', verifiedEmail) */
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
