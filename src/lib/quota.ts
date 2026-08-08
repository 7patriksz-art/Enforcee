import { createHash } from 'node:crypto';
import { getServiceSupabase, getUser } from './supabase/server';

/**
 * Spend protection for the judged path.
 *
 * /api/audit is public and, in full mode, spends our inference budget on behalf of whoever
 * called it. That is a cost attack waiting to happen, so the judged path is metered:
 * a per-caller daily allowance, and a global daily ceiling that acts as a circuit breaker
 * for the whole deployment.
 *
 * The deterministic path is never metered. It costs nothing to run and it is the product.
 *
 * Fails OPEN on a storage error rather than blocking legitimate work — but the global
 * ceiling means an outage cannot turn into an unbounded bill either, because the ceiling
 * is also enforced by the Anthropic account's own spend limit.
 */

const ANON_DAILY = Number(process.env.ENFORCEE_JUDGE_ANON_DAILY ?? 5);
const USER_DAILY = Number(process.env.ENFORCEE_JUDGE_USER_DAILY ?? 50);
const GLOBAL_DAILY = Number(process.env.ENFORCEE_JUDGE_GLOBAL_DAILY ?? 2000);

/**
 * A salted hash, never the raw address. We do not want a table of our visitors' IPs, and
 * without the salt the hash of an IPv4 address is trivially reversible by brute force.
 */
function bucketFor(req: Request, userId: string | null): string {
  if (userId) return `u:${userId}`;
  const salt = process.env.ENFORCEE_QUOTA_SALT ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'enforcee';
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown';
  return 'a:' + createHash('sha256').update(salt + '|' + ip).digest('hex').slice(0, 24);
}

export interface QuotaVerdict {
  allowed: boolean;
  reason?: string;
  /** True when the caller is signed in, which buys a bigger allowance. */
  identified: boolean;
}

export async function checkJudgeQuota(req: Request): Promise<QuotaVerdict> {
  const db = getServiceSupabase();
  const user = await getUser().catch(() => null);
  const identified = Boolean(user);

  // With no database there is no counter, so the judged path stays closed to anonymous
  // callers rather than open to everyone.
  if (!db) {
    return identified
      ? { allowed: true, identified }
      : {
          allowed: false,
          identified,
          reason: 'Sign in to use the judged layer. The deterministic audit is unlimited and needs no account.',
        };
  }

  const bucket = bucketFor(req, user?.id ?? null);
  const limit = identified ? USER_DAILY : ANON_DAILY;

  try {
    const [{ data: mine }, { data: global }] = await Promise.all([
      db.rpc('bump_judge_quota', { p_bucket: bucket, p_limit: limit }).single(),
      db.rpc('bump_judge_quota', { p_bucket: '__global__', p_limit: GLOBAL_DAILY }).single(),
    ]);

    const g = global as { allowed: boolean; used: number } | null;
    if (g && !g.allowed) {
      return {
        allowed: false,
        identified,
        reason: 'The judged layer has hit its daily ceiling across the whole site. The deterministic audit is unaffected.',
      };
    }

    const m = mine as { allowed: boolean; used: number } | null;
    if (m && !m.allowed) {
      return {
        allowed: false,
        identified,
        reason: identified
          ? `You have used your ${USER_DAILY} judged audits for today. The deterministic audit stays unlimited.`
          : `That is ${ANON_DAILY} judged audits today. Sign in for more — the deterministic audit is unlimited either way.`,
      };
    }

    return { allowed: true, identified };
  } catch {
    // A counter outage must not take the product down.
    return { allowed: true, identified };
  }
}
