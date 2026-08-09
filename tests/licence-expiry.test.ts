import { describe, it, expect } from 'vitest';

/**
 * The rule /api/licence implements: a licence expires at whichever comes first — the end of
 * the paid period, or MAX_TTL_DAYS from now.
 *
 * Worth testing as arithmetic rather than only through the route, because both directions
 * are real failures and neither is visible from the outside:
 *   - too long on a cancelled monthly subscriber → the guard keeps working for weeks after
 *     they stop paying, and an offline licence cannot be revoked
 *   - too long on an annual subscriber → a 365-day unrevocable licence, worse than the bug
 *   - too short → a paying customer's guard dies mid-week for no reason they can see
 */
const DAY = 86_400;
const MAX_TTL_DAYS = 45;

function licenceExp(now: number, periodEnd: number | null): number {
  const cap = now + MAX_TTL_DAYS * DAY;
  return periodEnd ? Math.min(periodEnd, cap) : cap;
}

describe('licence expiry', () => {
  const now = 1_800_000_000;

  it('never outlives the paid period', () => {
    const in10Days = now + 10 * DAY;
    expect(licenceExp(now, in10Days)).toBe(in10Days);
  });

  it('caps an annual subscription at 45 days rather than minting a year', () => {
    const inAYear = now + 365 * DAY;
    expect(licenceExp(now, inAYear)).toBe(now + MAX_TTL_DAYS * DAY);
  });

  it('falls back to the cap when Stripe has not reported a period yet', () => {
    expect(licenceExp(now, null)).toBe(now + MAX_TTL_DAYS * DAY);
  });

  it('produces an already-expired value for a lapsed period, which the route refuses', () => {
    const lastWeek = now - 7 * DAY;
    expect(licenceExp(now, lastWeek)).toBeLessThan(now);
  });

  it('a cancelled monthly subscriber cannot outlast their period', () => {
    // The exact bug: fixed 45 days meant ~6 weeks of guard after cancelling.
    const periodEndsIn3Days = now + 3 * DAY;
    const old = now + 45 * DAY;
    const fixed = licenceExp(now, periodEndsIn3Days);
    expect(fixed).toBeLessThan(old);
    expect((old - fixed) / DAY).toBeCloseTo(42, 0);
  });
});
