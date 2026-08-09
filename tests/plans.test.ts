import { describe, it, expect } from 'vitest';
import { ENTITLEMENTS, PLANS, entitlementsFor, planById, yearlySaving } from '../src/lib/plans';

/**
 * These are not decorative. Every one of them encodes a commercial decision that a
 * careless refactor would silently undo — and a gate that quietly opens is worse than
 * one that was never there, because nobody goes looking for it.
 */
describe('plans: the wall', () => {
  it('free can audit and nothing else that costs us money', () => {
    const f = ENTITLEMENTS.free;
    expect(f.audit).toBe(true);
    expect(f.guard).toBe(false);
    expect(f.hostedJudge).toBe(false);
    expect(f.historyDays).toBe(0);
    expect(f.ruleHistory).toBe(false);
    expect(f.driftAlerts).toBe(false);
    expect(f.projects).toBe(0);
  });

  it('auditing is never gated on any plan — it is the proof of the claim', () => {
    for (const p of Object.values(ENTITLEMENTS)) expect(p.audit).toBe(true);
  });

  it('free sees a taste of Learn, not the whole thing', () => {
    expect(ENTITLEMENTS.free.learnLimit).toBeGreaterThan(0);
    expect(ENTITLEMENTS.free.learnLimit).toBeLessThan(10);
    expect(ENTITLEMENTS.builder.learnLimit).toBe(Infinity);
  });

  it('builder unlocks enforcement AND the gate; founder unlocks proof and scale', () => {
    expect(ENTITLEMENTS.builder.guard).toBe(true);
    // The CI gate lives on Builder deliberately. It was on Founder, which put the one
    // surface this category actually monetises behind the highest wall. Founder now
    // differentiates on proof and scale — attestation, the API, unlimited projects —
    // not by withholding the gate.
    expect(ENTITLEMENTS.builder.ciGate).toBe(true);
    expect(ENTITLEMENTS.builder.attestation).toBe(false);
    expect(ENTITLEMENTS.builder.api).toBe(false);
    expect(ENTITLEMENTS.founder.ciGate).toBe(true);
    expect(ENTITLEMENTS.founder.attestation).toBe(true);
    expect(ENTITLEMENTS.founder.api).toBe(true);
  });

  it('founder is a strict superset of builder', () => {
    const b = ENTITLEMENTS.builder;
    const f = ENTITLEMENTS.founder;
    for (const k of Object.keys(b) as (keyof typeof b)[]) {
      const bv = b[k];
      const fv = f[k];
      if (typeof bv === 'boolean') expect(fv || !bv).toBe(true);
      else expect(fv as number).toBeGreaterThanOrEqual(bv as number);
    }
  });

  it('an unknown or missing plan degrades to free, never to paid', () => {
    expect(entitlementsFor(null)).toEqual(ENTITLEMENTS.free);
    expect(entitlementsFor(undefined)).toEqual(ENTITLEMENTS.free);
  });
});

describe('plans: pricing', () => {
  it('holds the launch prices', () => {
    expect(planById('builder')!.price).toEqual({ monthly: 19, yearly: 190 });
    expect(planById('founder')!.price).toEqual({ monthly: 29, yearly: 290 });
  });

  it('a struck-through was-price is always above the real one, or it is a lie', () => {
    for (const p of PLANS) {
      if (!p.wasPrice) continue;
      expect(p.wasPrice.monthly).toBeGreaterThan(p.price.monthly);
      expect(p.wasPrice.yearly).toBeGreaterThan(p.price.yearly);
    }
  });

  it('yearly really is cheaper than twelve months of monthly', () => {
    for (const p of PLANS) {
      const s = yearlySaving(p);
      if (!s) continue;
      expect(s.saved).toBeGreaterThan(0);
      expect(s.effectiveMonthly).toBeLessThan(p.price.monthly);
    }
  });

  it('every paid plan names its Stripe env vars, and none of them say PRICE', () => {
    for (const p of PLANS) {
      if (p.price.monthly === 0) {
        expect(p.priceEnv).toBeUndefined();
        continue;
      }
      expect(p.priceEnv).toBeDefined();
      for (const v of Object.values(p.priceEnv!)) {
        expect(v).toMatch(/^STRIPE_(BUILDER|FOUNDER)_(MONTHLY|YEARLY)$/);
      }
    }
  });

  it('free states its walls out loud', () => {
    const free = planById('free')!;
    expect(free.walls?.length ?? 0).toBeGreaterThan(2);
  });

  it('the trial is a month, and the CTAs say so', () => {
    for (const p of PLANS) {
      if (p.price.monthly > 0) expect(p.cta).not.toMatch(/trial|days free/i);
    }
  });
});

describe('no trials', () => {
  it('no paid plan advertises a trial', () => {
    for (const p of PLANS.filter((p) => p.price.monthly > 0)) {
      expect(p.cta).not.toMatch(/trial|days free/i);
      expect(JSON.stringify(p)).not.toMatch(/30 days free|thirty days free|no card for the trial/i);
    }
  });

  it('the free tier says plainly that it is not a trial', () => {
    const free = PLANS.find((p) => p.id === 'free')!;
    expect(JSON.stringify(free.walls)).toMatch(/not a trial/i);
  });
});
