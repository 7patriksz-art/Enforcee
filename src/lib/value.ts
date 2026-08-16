import { getServiceSupabase, getUser } from './supabase/server';
import type { PlanId } from './plans';

/**
 * "Is this worth paying for?" — answered from the user's own data, including when the
 * answer is no.
 *
 * The design constraint that makes this trustworthy: **it must be willing to say no.**
 * A dashboard that always concludes "great value!" is marketing, and this audience can
 * smell it. If somebody has run audits for a month and nothing was ever caught, this says
 * so and shows them the cancel link. That will lose a few subscriptions and keep the ones
 * that are real, which is the trade this whole product is built on.
 *
 * It is also the same honesty rule the engine follows: absence of a finding is reported as
 * absence, never dressed up as a pass.
 */

export type Verdict =
  | { kind: 'too-early'; audits: number; needed: number }
  | { kind: 'earning-it'; caught: number; worstRule: RuleStat | null }
  | { kind: 'quiet'; audits: number; days: number }
  | { kind: 'free' };

export interface RuleStat {
  ruleId: string;
  ruleText: string;
  runs: number;
  violated: number;
  /** Violations in the most recent third of runs, versus the oldest third. */
  trend: 'worsening' | 'improving' | 'flat';
}

export interface ValueReport {
  plan: PlanId;
  audits: number;
  windowDays: number;
  rulesWatched: number;
  violationsCaught: number;
  unverifiable: number;
  /** Share of applicable rules that left any observable trace, averaged over the window. */
  meanCoverage: number | null;
  /** Share of verdicts decided by code with no model call. */
  deterministicShare: number | null;
  decaying: RuleStat[];
  verdict: Verdict;
  /** Counts per day, oldest first — a single series, so no categorical palette is involved. */
  timeline: { day: string; audits: number; violations: number }[];
}

/** Audits below this and we say so rather than pretending the sample means something. */
const MIN_AUDITS = 5;
const WINDOW_DAYS = 30;

export async function buildValueReport(plan: PlanId): Promise<ValueReport | null> {
  const db = getServiceSupabase();
  const user = await getUser().catch(() => null);
  if (!db || !user) return null;

  const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString();

  const [{ data: audits }, { data: results }] = await Promise.all([
    db.from('audits').select('created_at, summary, mode').eq('user_id', user.id).gte('created_at', since),
    db
      .from('rule_results')
      .select('rule_id, rule_text, verdict, method, created_at')
      .eq('user_id', user.id)
      .gte('created_at', since)
      .limit(20_000),
  ]);

  const auditRows = audits ?? [];
  const rows = results ?? [];

  const violationsCaught = rows.filter((r) => r.verdict === 'VIOLATED').length;
  const unverifiable = rows.filter((r) => r.verdict === 'UNVERIFIABLE').length;
  const decided = rows.filter((r) => r.verdict !== 'NOT_APPLICABLE');
  const deterministicShare = decided.length
    ? decided.filter((r) => r.method === 'deterministic' || r.method === 'structural').length / decided.length
    : null;

  const coverages = auditRows
    .map((a) => (a.summary as { coverage?: number } | null)?.coverage)
    .filter((c): c is number => typeof c === 'number');
  const meanCoverage = coverages.length ? coverages.reduce((a, b) => a + b, 0) / coverages.length : null;

  // Per-rule track record. This is the longitudinal product, and the only thing here that
  // a competitor cannot reproduce from a snapshot of the code.
  const byRule = new Map<string, { text: string; verdicts: { v: string; at: string }[] }>();
  for (const r of rows) {
    const e = byRule.get(r.rule_id) ?? { text: r.rule_text, verdicts: [] as { v: string; at: string }[] };
    e.verdicts.push({ v: r.verdict, at: r.created_at });
    byRule.set(r.rule_id, e);
  }

  const stats: RuleStat[] = [];
  for (const [ruleId, e] of byRule) {
    const ordered = e.verdicts.sort((a, b) => a.at.localeCompare(b.at));
    const violated = ordered.filter((x) => x.v === 'VIOLATED').length;
    if (!violated) continue;
    const third = Math.max(1, Math.floor(ordered.length / 3));
    const oldRate = ordered.slice(0, third).filter((x) => x.v === 'VIOLATED').length / third;
    const newRate = ordered.slice(-third).filter((x) => x.v === 'VIOLATED').length / third;
    stats.push({
      ruleId,
      ruleText: e.text,
      runs: ordered.length,
      violated,
      trend: newRate > oldRate ? 'worsening' : newRate < oldRate ? 'improving' : 'flat',
    });
  }
  stats.sort((a, b) => b.violated / b.runs - a.violated / a.runs);

  // One bucket per day, oldest first. A single series — no legend, no categorical hues.
  const days = new Map<string, { audits: number; violations: number }>();
  for (let i = WINDOW_DAYS - 1; i >= 0; i--) {
    days.set(new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10), { audits: 0, violations: 0 });
  }
  for (const a of auditRows) {
    const d = days.get(a.created_at.slice(0, 10));
    if (d) d.audits++;
  }
  for (const r of rows) {
    if (r.verdict !== 'VIOLATED') continue;
    const d = days.get(r.created_at.slice(0, 10));
    if (d) d.violations++;
  }

  return {
    plan,
    audits: auditRows.length,
    windowDays: WINDOW_DAYS,
    rulesWatched: byRule.size,
    violationsCaught,
    unverifiable,
    meanCoverage,
    deterministicShare,
    decaying: stats.filter((s) => s.trend === 'worsening').slice(0, 5),
    verdict: judge(plan, auditRows.length, violationsCaught),
    timeline: [...days.entries()].map(([day, v]) => ({ day, ...v })),
  };
}

/**
 * The verdict, including the one that costs us money.
 *
 * `quiet` is the important branch: a paying subscriber whose rules have not been broken
 * once in a month is being charged for insurance they may not need, and the honest thing
 * is to say so and show them the door. Some will leave. The ones who stay will trust every
 * other number on the page, which is worth more.
 *
 * Exported ONLY so tests/value.test.ts can call this function instead of a copy of it. It
 * used to keep its own `judge()` and assert against that, so the branch below could have
 * been deleted entirely — the whole 862-test suite was run with this replaced by an
 * unconditional 'earning-it' and stayed green. Charter honesty rule 6: a control that could
 * not have failed is not a control.
 */
export function judge(plan: PlanId, audits: number, caught: number): Verdict {
  if (plan === 'free') return { kind: 'free' };
  if (audits < MIN_AUDITS) return { kind: 'too-early', audits, needed: MIN_AUDITS };
  if (caught === 0) return { kind: 'quiet', audits, days: WINDOW_DAYS };
  return { kind: 'earning-it', caught, worstRule: null };
}
