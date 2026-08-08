/**
 * Plans and entitlements, in one place, so the pricing page, the checkout route and the
 * feature gates can never drift apart.
 *
 * The gating principle, arrived at the hard way: **free inspects, paid enforces.**
 *
 * The first cut of this gave away everything and walled only continuity, which left no
 * honest reason to pay. The line now sits where the value actually is — a person will pay
 * to stop something happening and to know whether it is getting worse. They will not pay
 * for a nicer view of a problem they can already see for free.
 *
 * We never publish our own unit cost anywhere a customer can read it.
 */

export type Interval = 'monthly' | 'yearly';
export type PlanId = 'free' | 'builder' | 'founder';

/** Every gate in the product. Adding a capability means adding it here first. */
export interface Entitlements {
  /** Run an audit and read the receipt. Always true — this is the proof of the claim. */
  audit: boolean;
  /** Compile and download the guard that blocks tool calls and repairs after compaction. */
  guard: boolean;
  /** The judged fifth runs on our key rather than yours. */
  hostedJudge: boolean;
  /** Days of audit history kept. 0 means nothing is saved at all. */
  historyDays: number;
  /** Per-rule track record across audits — the longitudinal product. */
  ruleHistory: boolean;
  /** Alerts when a rule that used to hold starts failing. */
  driftAlerts: boolean;
  /** Rules recovered from conversation. Free sees the first few and stops. */
  learnLimit: number;
  /** Rulesets and policies synced across machines. */
  sync: boolean;
  /** Rulesets that are authoritative for a repo, and the CI gate. */
  ciGate: boolean;
  /** Exportable receipts for a third party. */
  attestation: boolean;
  /** Projects a policy may be installed into. */
  projects: number;
  /** REST API access. */
  api: boolean;
}

export const ENTITLEMENTS: Record<PlanId, Entitlements> = {
  free: {
    audit: true,
    guard: false,
    hostedJudge: false,
    historyDays: 0,
    ruleHistory: false,
    driftAlerts: false,
    learnLimit: 3,
    sync: false,
    ciGate: false,
    attestation: false,
    projects: 0,
    api: false,
  },
  builder: {
    audit: true,
    guard: true,
    hostedJudge: true,
    historyDays: 3650,
    ruleHistory: true,
    driftAlerts: true,
    learnLimit: Infinity,
    sync: true,
    ciGate: false,
    attestation: false,
    projects: 3,
    api: false,
  },
  founder: {
    audit: true,
    guard: true,
    hostedJudge: true,
    historyDays: 3650,
    ruleHistory: true,
    driftAlerts: true,
    learnLimit: Infinity,
    sync: true,
    ciGate: true,
    attestation: true,
    projects: Infinity,
    api: true,
  },
};

export interface Plan {
  id: PlanId;
  name: string;
  who: string;
  pitch: string;
  price: Record<Interval, number>;
  /** Launch pricing. The struck-through number people see beside the real one. */
  wasPrice?: Record<Interval, number>;
  priceEnv?: Record<Interval, string>;
  /** What this plan adds that the one before it did not have. */
  unlocks: string[];
  /** Stated plainly, because a limit you hide is a limit that produces a refund. */
  walls?: string[];
  cta: string;
  featured?: boolean;
}

export const TRIAL_DAYS = 30;

export const PLANS: Plan[] = [
  {
    id: 'free',
    name: 'Free',
    who: 'See the problem. On your own rules, in twenty seconds.',
    pitch:
      'Everything you need to find out whether your rules are being followed — one output at a time, by hand.',
    price: { monthly: 0, yearly: 0 },
    unlocks: [
      'Unlimited audits, on the web and in the CLI',
      'Every verdict, every evidence quote, every method badge',
      'Coverage — the rules that left no trace at all',
      'Ruleset health: duplicates, contradictions, dead rules',
      'Session evidence, parsed in your browser',
      'A taste of Learn: the first 3 rules found in your conversation',
    ],
    walls: [
      'Nothing is saved. Close the tab and the receipt is gone.',
      'No guard — Free tells you what happened, it does not stop anything.',
      'Bring your own key for the judged fifth.',
      'One output at a time, by hand, every time.',
    ],
    cta: 'Run an audit',
  },
  {
    id: 'builder',
    name: 'Builder',
    who: 'You ship with an AI most days and you are tired of finding out late.',
    pitch: 'The guard runs in every session, and every rule starts keeping a permanent record.',
    price: { monthly: 19, yearly: 190 },
    wasPrice: { monthly: 25, yearly: 250 },
    priceEnv: { monthly: 'STRIPE_BUILDER_MONTHLY', yearly: 'STRIPE_BUILDER_YEARLY' },
    unlocks: [
      'The guard: blocks a forbidden command before it runs',
      'Rules restored automatically after every context compaction',
      'Retry-loop escalation, so a block never turns into a budget spiral',
      'Every audit kept, forever',
      'Per-rule track record: "this rule failed 6 of your last 40 audits"',
      'Drift alerts when a rule that used to hold starts failing',
      'The judged fifth on our key — no key to manage, rotate or leak',
      'Learn, unlimited',
      'Sync across your machines · up to 3 projects',
    ],
    cta: `Start ${TRIAL_DAYS} days free`,
    featured: true,
  },
  {
    id: 'founder',
    name: 'Founder',
    who: 'Your rules govern a codebase other people commit to.',
    pitch: 'The gate moves off your laptop and into the pipeline, and every bypass is on the record.',
    price: { monthly: 29, yearly: 290 },
    wasPrice: { monthly: 35, yearly: 350 },
    priceEnv: { monthly: 'STRIPE_FOUNDER_MONTHLY', yearly: 'STRIPE_FOUNDER_YEARLY' },
    unlocks: [
      'Everything in Builder',
      'Rulesets authoritative for a repository, not just a laptop',
      'The CI gate: a violated rule fails the pull request',
      'Bypasses recorded with the reason attached',
      'Signed, exportable receipts you can hand to a client',
      'Drift reporting across every repo you watch',
      'Unlimited projects · REST API',
      'Your questions answered by the person who wrote it',
    ],
    cta: `Start ${TRIAL_DAYS} days free`,
  },
];

export function planById(id: string): Plan | undefined {
  return PLANS.find((p) => p.id === id);
}

export function entitlementsFor(plan: PlanId | null | undefined): Entitlements {
  return ENTITLEMENTS[plan ?? 'free'];
}

export function stripePriceFor(plan: Plan, interval: Interval): string | null {
  if (!plan.priceEnv) return null;
  return process.env[plan.priceEnv[interval]] ?? null;
}

/** What twelve months at the monthly rate costs, so yearly is shown against a real anchor. */
export function yearlySaving(plan: Plan): { was: number; saved: number; effectiveMonthly: number } | null {
  if (plan.price.monthly === 0) return null;
  const was = plan.price.monthly * 12;
  return {
    was,
    saved: was - plan.price.yearly,
    effectiveMonthly: Math.round((plan.price.yearly / 12) * 100) / 100,
  };
}
