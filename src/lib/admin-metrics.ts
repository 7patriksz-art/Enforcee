import { getServiceSupabase } from './supabase/server';

/**
 * The numbers that decide whether this business works, in one place.
 *
 * D-018: our unit cost lives here and ONLY here. Nothing in this module may be rendered on
 * a surface a customer can reach — it is imported by /admin, which is behind an explicit
 * email allowlist that fails closed on an empty list.
 */

export interface AdminMetrics {
  audits: { today: number; week: number; month: number };
  spend: { today: number; week: number; month: number };
  /** Cost per audit over the month — the number pricing is set from. */
  costPerAudit: number | null;
  /** Share of verdicts decided without a model call. The margin depends on this staying high. */
  deterministicShare: number | null;
  subscribers: { active: number; pastDue: number; cancelled: number };
  /** Judged calls today against the global daily ceiling. */
  judgeToday: number;
  judgeCeiling: number;
  /** Audits that produced at least one violation — the product working, measured. */
  auditsWithFindings: number;
}

const DAY = 86_400_000;

export async function buildAdminMetrics(): Promise<AdminMetrics | null> {
  const db = getServiceSupabase();
  if (!db) return null;

  const iso = (ms: number) => new Date(Date.now() - ms).toISOString();
  const [dayAgo, weekAgo, monthAgo] = [iso(DAY), iso(7 * DAY), iso(30 * DAY)];

  const [{ data: audits }, { data: costs }, { data: subs }, { data: results }, { data: quota }] =
    await Promise.all([
      db.from('audits').select('created_at, summary').gte('created_at', monthAgo),
      db.from('cost_ledger').select('created_at, total_usd').gte('created_at', monthAgo),
      db.from('subscriptions').select('status'),
      db.from('rule_results').select('method, verdict').gte('created_at', monthAgo).limit(50_000),
      db.from('judge_quota').select('bucket, used, day').eq('bucket', '__global__').limit(1),
    ]);

  const a = audits ?? [];
  const c = (costs ?? []) as { created_at: string; total_usd: number | string }[];
  const num = (v: number | string) => (typeof v === 'number' ? v : Number(v) || 0);
  const since = (rows: { created_at: string }[], t: string) => rows.filter((r) => r.created_at >= t);
  const sum = (rows: typeof c) => rows.reduce((n, r) => n + num(r.total_usd), 0);

  const monthAudits = a.length;
  const monthSpend = sum(c);

  const rr = (results ?? []) as { method: string; verdict: string }[];
  const decided = rr.filter((r) => r.verdict !== 'NOT_APPLICABLE');

  const s = (subs ?? []) as { status: string }[];

  return {
    audits: { today: since(a, dayAgo).length, week: since(a, weekAgo).length, month: monthAudits },
    spend: { today: sum(since(c, dayAgo) as typeof c), week: sum(since(c, weekAgo) as typeof c), month: monthSpend },
    costPerAudit: monthAudits ? monthSpend / monthAudits : null,
    deterministicShare: decided.length
      ? decided.filter((r) => r.method === 'deterministic' || r.method === 'structural').length / decided.length
      : null,
    subscribers: {
      active: s.filter((x) => x.status === 'active' || x.status === 'trialing').length,
      pastDue: s.filter((x) => x.status === 'past_due').length,
      cancelled: s.filter((x) => x.status === 'canceled' || x.status === 'cancelled').length,
    },
    judgeToday: (quota?.[0] as { used?: number } | undefined)?.used ?? 0,
    judgeCeiling: Number(process.env.ENFORCEE_JUDGE_GLOBAL_DAILY ?? 2000),
    auditsWithFindings: a.filter((x) => ((x.summary as { violated?: number } | null)?.violated ?? 0) > 0).length,
  };
}
