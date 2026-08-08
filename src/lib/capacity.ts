/**
 * Capacity ceilings for the services Enforcee runs on.
 *
 * Every number here was read off the vendor's own limits page on 2026-08-08 and is
 * cited. The point of this file is to answer one question before it becomes urgent:
 * *what breaks first, and how much room is left before it does?*
 *
 * This is the one place in the codebase where our own cost and consumption live. None
 * of it is ever rendered on a public page.
 */

export interface Ceiling {
  service: string;
  plan: string;
  /** What the vendor gives us. */
  limit: string;
  /** What in our app consumes it. */
  consumedBy: string;
  /** Our best estimate of headroom, and how it was derived. */
  headroom: string;
  /** The observable signal that says "upgrade now". */
  trigger: string;
  upgrade: string;
  severity: 'first-to-break' | 'watch' | 'far-off' | 'policy';
  source: string;
}

/** Rough per-unit consumption, used to derive the headroom figures below. */
export const UNIT = {
  /** Receipt JSONB plus the stored output text, per saved audit. */
  auditRowBytes: 90_000,
  /** Page weight of a rendered app route, gzipped, including RSC payload. */
  pageBytes: 210_000,
  /** Serverless invocations per completed audit: the API route plus middleware. */
  invocationsPerAudit: 2,
};

export const CEILINGS: Ceiling[] = [
  {
    service: 'Supabase',
    plan: 'Free',
    limit: '500 MB database per project',
    consumedBy:
      'Each saved audit stores the sealed receipt as JSONB plus up to 200,000 characters of the audited output. Roughly 90 KB a row in practice.',
    headroom:
      '~5,500 saved audits, then writes start failing. At 40 signed-in people averaging 3 audits a week, that is about eleven weeks.',
    trigger:
      'Database size passes 350 MB (70%), or the audits table passes 4,000 rows. Whichever comes first.',
    upgrade:
      'Pro at $25/mo lifts it to 8 GB and adds 7-day log retention and daily backups. Cheaper first move: stop storing output_text in full and keep only the evidence spans, which cuts the row by roughly 80% and buys months.',
    severity: 'first-to-break',
    source: 'https://supabase.com/pricing',
  },
  {
    service: 'Supabase',
    plan: 'Free',
    limit: 'Projects pause after 1 week of inactivity',
    consumedBy: 'Nothing. This one fires when the product is quiet, not when it is busy.',
    headroom:
      'Seven days of no database traffic and sign-in, history and the admin board all stop working until somebody manually resumes the project.',
    trigger:
      'Any seven-day stretch with no signed-in activity. Before a holiday, before a launch gap, before anything that goes quiet.',
    upgrade:
      'Pro at $25/mo removes the pause entirely. Free alternative: a scheduled task that runs one trivial query every few days.',
    severity: 'watch',
    source: 'https://supabase.com/pricing',
  },
  {
    service: 'Vercel',
    plan: 'Hobby',
    limit: 'Hobby is for non-commercial use',
    consumedBy: 'Taking a single payment through Stripe.',
    headroom:
      'None. This is not a usage ceiling, it is a terms question, and it is the one that can take the site down without warning.',
    trigger: 'The first successful Stripe checkout. Not the first user — the first dollar.',
    upgrade: 'Pro at $20/mo. Move before the pricing page goes live, not after.',
    severity: 'policy',
    source: 'https://vercel.com/docs/limits',
  },
  {
    service: 'Vercel',
    plan: 'Hobby',
    limit: '100 GB fast data transfer, 1M invocations, 4 CPU-hrs active CPU per month',
    consumedBy:
      'Page loads and the audit, enforce and learn API routes. Around 210 KB a page view and two invocations an audit.',
    headroom:
      '~475,000 page views or ~500,000 audits a month, whichever runs out first. Active CPU is the tighter of the three because the judged path waits on the model.',
    trigger: 'Any single meter passes 60% in the Vercel usage view two months running.',
    upgrade: 'Pro at $20/mo takes transfer to 1 TB and moves the rest to usage-based.',
    severity: 'far-off',
    source: 'https://vercel.com/docs/limits',
  },
  {
    service: 'Vercel',
    plan: 'Hobby',
    limit: '100 deployments a day, 1 concurrent build',
    consumedBy: 'Every push to main, plus every redeploy after an environment change.',
    headroom:
      'Comfortable for one person. It bites the day a second person pushes, or a CI loop starts redeploying on a schedule.',
    trigger: 'A deploy queues behind another one more than once in a week.',
    upgrade: 'Pro raises it to 6,000 a day and up to 500 concurrent builds.',
    severity: 'far-off',
    source: 'https://vercel.com/docs/limits',
  },
  {
    service: 'Vercel',
    plan: 'Hobby',
    limit: 'Runtime logs retained for 1 hour',
    consumedBy: 'Nothing. It bites when something breaks and the evidence has already expired.',
    headroom:
      'One hour. A paying customer reporting a failed checkout from this morning cannot be diagnosed at all.',
    trigger: 'The first support question you cannot answer because the log is gone.',
    upgrade: 'Pro gives 1 day. Free alternative: log the important things into our own cost ledger and audits tables, which we already do.',
    severity: 'watch',
    source: 'https://vercel.com/docs/limits',
  },
  {
    service: 'Anthropic',
    plan: 'Usage tier',
    limit: 'Requests and tokens per minute, by tier',
    consumedBy:
      'The judged fifth of an audit. Three independent samples per audit, each with prompt caching after the first.',
    headroom:
      'Fine for interactive use. It bites the first time several paying users audit at once, or a CI gate starts running audits in parallel.',
    trigger: 'Any 429 from the API, or a judged audit taking more than 20 seconds.',
    upgrade:
      'Move up a usage tier by adding credit. Cheaper first move: queue judged audits rather than running them inline, and lean harder on prompt caching.',
    severity: 'watch',
    source: 'https://platform.claude.com/docs/en/api/rate-limits',
  },
  {
    service: 'Stripe',
    plan: 'Standard',
    limit: 'No monthly fee, per-transaction pricing',
    consumedBy: 'Each subscription payment.',
    headroom: 'No ceiling. The cost scales with revenue, which is the only kind of cost worth having.',
    trigger: 'None. Revisit only if volume makes a negotiated rate worth asking for.',
    upgrade: 'Nothing to do.',
    severity: 'far-off',
    source: 'https://stripe.com/pricing',
  },
  {
    service: 'GitHub',
    plan: 'Free',
    limit: 'Unlimited public and private repositories',
    consumedBy: 'The repo and the plugin marketplace manifest.',
    headroom: 'No ceiling that matters at this size.',
    trigger: 'Only if we start needing Actions minutes for a CI gate on private repos.',
    upgrade: 'Nothing to do.',
    severity: 'far-off',
    source: 'https://github.com/pricing',
  },
];

export const SEVERITY_ORDER: Ceiling['severity'][] = ['policy', 'first-to-break', 'watch', 'far-off'];

export function ceilingsBySeverity(): Ceiling[] {
  return [...CEILINGS].sort(
    (a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity)
  );
}

/** Estimated database bytes for a given number of saved audits. */
export function estimateDbBytes(auditCount: number): number {
  return auditCount * UNIT.auditRowBytes;
}

export const SUPABASE_FREE_DB_BYTES = 500 * 1024 * 1024;
