/**
 * The plans, in one place, so the pricing page and the checkout route can never drift.
 *
 * Deliberate absences, each a decision rather than an oversight:
 *  - No per-audit meter. At a measured $0.0057 an audit, any cap is either meaningless or
 *    insulting, and this audience recomputes vendor margins for sport. You cannot sell
 *    receipts from behind a meter you will not itemise.
 *  - No credit balance and no counter in the UI.
 *  - The free tier is complete for its job. The wall is at the point where your ruleset
 *    becomes binding on somebody other than you.
 */

export interface Plan {
  id: 'free' | 'solo' | 'team';
  name: string;
  price: string;
  cadence: string;
  pitch: string;
  /** Stripe price id, set per-deployment. Absent means the tier is not purchasable yet. */
  priceEnv?: string;
  features: string[];
  limits?: string[];
  cta: string;
  featured?: boolean;
}

export const PLANS: Plan[] = [
  {
    id: 'free',
    name: 'Free',
    price: '$0',
    cadence: 'forever, no account',
    pitch: 'Everything you need to answer "did my rules get followed?" on your own machine.',
    features: [
      'Unlimited audits, on the web and in the CLI',
      'Every evidence span, every method badge',
      'The whole deterministic engine — about 80% of a real ruleset',
      'Ruleset health: duplicates, contradictions, dead rules',
      'The guard: block, repair after compaction, local ledger',
      'Learn: rules proposed from what you already said',
      'Session evidence, parsed in your browser',
      '14 days of history once you sign in',
    ],
    limits: ['No hosted judge — bring your own key for the last 20%', 'One person, your own machines'],
    cta: 'Start auditing',
  },
  {
    id: 'solo',
    name: 'Solo',
    price: '$19',
    cadence: 'per month',
    pitch: 'For when you want the history and you would rather not manage a key.',
    priceEnv: 'STRIPE_PRICE_SOLO',
    features: [
      'Everything in Free',
      'Hosted judge — no API key to manage',
      'Unlimited history, not 14 days',
      'Per-rule track record across every audit you have ever run',
      'Drift alerts when a rule starts failing',
      'Cross-machine sync of rulesets and policies',
    ],
    cta: 'Go Solo',
    featured: true,
  },
  {
    id: 'team',
    name: 'Team',
    price: '$29',
    cadence: 'per seat, 3 minimum',
    pitch: 'For when your ruleset stops being yours and starts binding other people.',
    priceEnv: 'STRIPE_PRICE_TEAM',
    features: [
      'Everything in Solo',
      'Rulesets authoritative for a repository',
      'Committed blocking hooks and the CI gate',
      'Org-wide drift reporting',
      'Recorded bypasses, with the reason attached',
      'REST API',
    ],
    cta: 'Start a team',
  },
];

export function planById(id: string): Plan | undefined {
  return PLANS.find((p) => p.id === id);
}

/** Resolve a plan's Stripe price id from the environment at request time. */
export function stripePriceFor(plan: Plan): string | null {
  if (!plan.priceEnv) return null;
  return process.env[plan.priceEnv] ?? null;
}
