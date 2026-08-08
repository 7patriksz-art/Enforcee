/**
 * The plans, in one place, so the pricing page and the checkout route can never drift.
 *
 * Deliberate absences, each a decision rather than an oversight:
 *  - No per-audit meter, no credit balance, no counter in the UI. Metering rules punishes
 *    your most thorough user, who is your best user.
 *  - We never publish our own unit cost. What a thing costs us is not the customer's
 *    business and stating it only ever argues against our own price.
 *  - The free tier is complete for its job. The wall is at continuity and scale, not at
 *    features held hostage.
 */

export type Interval = 'monthly' | 'yearly';

export interface Plan {
  id: 'free' | 'builder' | 'founder';
  name: string;
  /** Who this is for, in the buyer's own words. */
  who: string;
  pitch: string;
  price: Record<Interval, number>;
  /** Stripe price id env var per interval. Absent means not purchasable yet. */
  priceEnv?: Record<Interval, string>;
  features: string[];
  limits?: string[];
  cta: string;
  featured?: boolean;
}

export const PLANS: Plan[] = [
  {
    id: 'free',
    name: 'Free',
    who: 'Anyone who wants to know whether their rules are working.',
    pitch: 'The whole deterministic engine, the guard, and the learning loop. No account, no card, no expiry.',
    price: { monthly: 0, yearly: 0 },
    features: [
      'Unlimited audits, on the web and in the CLI',
      'Every evidence span, every method badge',
      'Four fifths of a real ruleset checked without a model call',
      'Ruleset health: duplicates, contradictions, dead rules',
      'The guard: blocks, repairs after compaction, keeps a local ledger',
      'Learn: rules recovered from what you already said',
      'Session evidence, parsed in your browser',
      '14 days of history once you sign in',
    ],
    limits: ['Bring your own key for the judged fifth', 'One person, your own machines'],
    cta: 'Start auditing',
  },
  {
    id: 'builder',
    name: 'Builder',
    who: 'You ship with an AI most days and you are tired of finding out late.',
    pitch: 'Every rule keeps a permanent track record, so you can see which ones are quietly rotting.',
    price: { monthly: 25, yearly: 250 },
    priceEnv: { monthly: 'STRIPE_PRICE_BUILDER_MONTHLY', yearly: 'STRIPE_PRICE_BUILDER_YEARLY' },
    features: [
      'Everything in Free',
      'The judged fifth runs on our key, not yours',
      'Unlimited history instead of 14 days',
      'Per-rule track record across every audit you have ever run',
      'Drift alerts the moment a rule starts failing',
      'Cross-machine sync of rulesets and policies',
      'Receipts you can export and hand to someone else',
    ],
    cta: 'Become a Builder',
    featured: true,
  },
  {
    id: 'founder',
    name: 'Founder',
    who: 'Your rules govern a codebase other people commit to.',
    pitch: 'The gate moves from your laptop into the pipeline, and every bypass is on the record.',
    price: { monthly: 35, yearly: 350 },
    priceEnv: { monthly: 'STRIPE_PRICE_FOUNDER_MONTHLY', yearly: 'STRIPE_PRICE_FOUNDER_YEARLY' },
    features: [
      'Everything in Builder',
      'Rulesets authoritative for a repository',
      'Committed blocking hooks and the CI gate',
      'Bypasses recorded with the reason attached',
      'Drift reporting across every repo you watch',
      'REST API',
      'Your questions answered by the person who wrote it',
    ],
    cta: 'Become a Founder',
  },
];

export function planById(id: string): Plan | undefined {
  return PLANS.find((p) => p.id === id);
}

/** Resolve a plan's Stripe price id at request time. */
export function stripePriceFor(plan: Plan, interval: Interval): string | null {
  if (!plan.priceEnv) return null;
  return process.env[plan.priceEnv[interval]] ?? null;
}

/**
 * What twelve months at the monthly rate would have cost, so the yearly price can be
 * shown against a real anchor rather than a made-up one.
 */
export function yearlyAnchor(plan: Plan): { was: number; now: number; saved: number; effectiveMonthly: number } | null {
  if (plan.price.monthly === 0) return null;
  const was = plan.price.monthly * 12;
  const now = plan.price.yearly;
  return {
    was,
    now,
    saved: was - now,
    effectiveMonthly: Math.round((now / 12) * 100) / 100,
  };
}
