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
  /**
   * The CI gate: `enforcee audit` exiting non-zero on a violation.
   *
   * True on every plan, because it is true on every plan. The CLI is free, offline and
   * unlicensed for auditing, so nothing could wall this without walling auditing itself.
   * See NOT_GATED below. It was `false` on free and sold as a Builder unlock, which the
   * product contradicted and /faq openly admitted.
   */
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
    ciGate: true,
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
    // The CI gate is here, not on Founder. It was the other way round, which was backwards:
    // this category's money has consolidated at the pull-request boundary — CodeRabbit and
    // Greptile both monetise there and nobody has monetised at the session boundary — so the
    // gate was sitting behind our highest wall instead of being the reason to pay at all.
    ciGate: true,
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

/**
 * SOLD BUT NOT BUILT, named here so it cannot be forgotten.
 *
 * Every key below is a real entitlement in the table above and NOTHING in the product reads
 * it to change what a user can do. That is the exact shape of the defect this tool exists to
 * catch: a claim with no mechanism behind it, indistinguishable from a shipped feature.
 *
 * tests/site-claims.test.ts scans for a behaviour-changing read of every entitlement and
 * requires anything it cannot find to be listed here with a reason. Adding a capability means
 * deleting its line, and the test will not allow that until something really reads it.
 */
export const NOT_YET_BUILT: Partial<Record<keyof Entitlements, string>> = {
  driftAlerts:
    'no detector and no alert. Nothing compares a rule against its own history, and ' +
    'src/lib/email/notify-templates.ts defines no drift message to send.',
  sync:
    'no sync path exists. A compiled policy lives on the machine that compiled it and is ' +
    'never uploaded, fetched or reconciled.',
  api:
    'there is no REST API. Every route under src/app/api is authenticated by session cookie; ' +
    'no API key is ever issued and no route accepts a bearer token.',
  projects:
    'the number is displayed on the account page and enforced nowhere. Nothing counts or ' +
    'caps how many projects a policy is installed into.',
};

/**
 * REAL GATES THAT ARE NOT A READ OF THIS BOOLEAN.
 *
 * Enforced, just not by anyone reading the flag. Without this, wiring a feature up through a
 * different mechanism would be reported as unbuilt - a tool accusing its own product of a gap
 * it does not have is the false accusation it refuses to make about anyone else's.
 */
export const GATED_ELSEWHERE: Partial<Record<keyof Entitlements, string>> = {
  audit:
    'true on every plan by design. Auditing is unlimited and free forever, so there is no ' +
    'gate to find and never should be - it is the demonstration the product rests on.',
  ruleHistory:
    'gated by historyDays, not by itself: src/lib/persist.ts writes nothing when historyDays ' +
    'is 0, and src/app/history/page.tsx refuses on the same test.',
  attestation:
    'gated offline by the signed licence the CLI verifies (`enforcee sign`), not by the plan ' +
    'table. The CLI makes no network call, so it cannot ask this server what anyone bought.',
};

/**
 * SHIPPED, AND FREE TO EVERYONE, WHATEVER THE TABLE SAYS.
 *
 * Patrik, 2026-08-18, asked what the site should say about the CI gate: *"if it should be
 * free then let it be."* So it is free, and the pricing page says so rather than selling it.
 */
export const NOT_GATED: Partial<Record<keyof Entitlements, string>> = {
  ciGate:
    'the gate is the CLI exiting non-zero on a violation, and the CLI is free, offline and ' +
    'unlicensed for auditing. /faq says so in as many words: "the CLI exits non-zero on a ' +
    'violation, so any other CI runner works too". Nothing reads this flag.',
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
  /** What this plan adds that the one before it did not have. AND ACTUALLY DOES. */
  unlocks: string[];
  /** Named on the plan, not built yet. Its own heading, never a tick. */
  soon?: string[];
  /** Stated plainly, because a limit you hide is a limit that produces a refund. */
  walls?: string[];
  cta: string;
  featured?: boolean;
}

/**
 * There is no trial, deliberately.
 *
 * A 30-day card-free trial was on both paid plans. It was removed because the free tier is
 * not a teaser — auditing is unlimited on it, forever, and that is the honest demonstration.
 * A trial on top of a genuine free tier says the free tier is not really the product.
 *
 * It also removes a real hole rather than merely a marketing wrinkle: a card-free trial that
 * entitled as `active`, plus a 45-day licence with no revocation list, was roughly 74 days of
 * the paid guard per throwaway email address, repeatable. That is now unreachable.
 */
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
      'The CI gate: `enforcee audit` exits non-zero on a violation, so any runner can fail the build',
    ],
    walls: [
      'Not a trial. Auditing is unlimited here, forever.',
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
      'Nested and path-scoped rules restored after compaction (root CLAUDE.md is already native and free)',
      'Retry-loop escalation, so a block never turns into a budget spiral',
      'Every audit kept, forever',
      'Per-rule track record: "this rule failed 6 of your last 40 audits"',
      'The judged fifth on our key — no key to manage, rotate or leak',
      'Learn, unlimited',
    ],
    soon: ['Drift alerts when a rule that used to hold starts failing', 'Sync across your machines · up to 3 projects'],
    cta: 'Subscribe',
    featured: true,
  },
  {
    id: 'founder',
    name: 'Founder',
    who: 'Other people commit to this codebase, and someone will ask you to prove it held.',
    pitch: 'Signed receipts you can hand to a client, and the rest of the team-scale work as it lands.',
    price: { monthly: 29, yearly: 290 },
    wasPrice: { monthly: 35, yearly: 350 },
    priceEnv: { monthly: 'STRIPE_FOUNDER_MONTHLY', yearly: 'STRIPE_FOUNDER_YEARLY' },
    unlocks: [
      'Everything in Builder',
      'Signed, exportable receipts you can hand to a client',
      'Your questions answered by the person who wrote it',
    ],
    soon: [
      'Rulesets authoritative for a repository, not just a laptop',
      'Bypasses recorded with the reason attached, across a team',
      'Drift reporting across every repo you watch',
      'Unlimited projects · REST API',
    ],
    cta: 'Subscribe',
  },
];

export function planById(id: string): Plan | undefined {
  return PLANS.find((p) => p.id === id);
}

export function entitlementsFor(plan: PlanId | null | undefined): Entitlements {
  // Never an unchecked index. `plan` ultimately comes from Stripe subscription metadata,
  // which is hand-editable in their dashboard, and an unknown value used to return
  // undefined and throw on first property access — turning a typo into a 500 on every
  // gated surface for that user. Unknown degrades to free, never to paid.
  return ENTITLEMENTS[plan as PlanId] ?? ENTITLEMENTS.free;
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
