import { entitlementsFor, type Entitlements, type PlanId } from './plans';
import { getServiceSupabase, getUser } from './supabase/server';

/**
 * What the current caller is actually allowed to do.
 *
 * Read server-side from the subscriptions table with the service role, never from anything
 * the browser can influence. A gate that trusts a value the client sent is not a gate.
 *
 * A subscription in Stripe's `trialing` state entitles exactly as much as `active` — the
 * point of a trial is that it is the real product, not a demo of it.
 */
/**
 * `trialing` is retained even though we no longer create trials: checkout stopped sending
 * trial_period_days when trials were removed, but a subscription created by hand in the
 * Stripe dashboard can still report it, and a paying customer seeing their features vanish
 * because of our own bookkeeping is the worse failure.
 *
 * `past_due` is deliberate too. It keeps a real subscriber working through Stripe's dunning
 * window rather than cutting them off the hour a card expires. We would rather over-serve
 * someone whose payment failed than punish them for it.
 */
const ENTITLING_STATUSES = new Set(['active', 'trialing', 'past_due']);

export interface Access {
  plan: PlanId;
  entitlements: Entitlements;
  signedIn: boolean;
  trialing: boolean;
  email: string | null;
}

export async function getAccess(): Promise<Access> {
  const user = await getUser().catch(() => null);
  if (!user) {
    return { plan: 'free', entitlements: entitlementsFor('free'), signedIn: false, trialing: false, email: null };
  }

  const db = getServiceSupabase();
  if (!db) {
    return { plan: 'free', entitlements: entitlementsFor('free'), signedIn: true, trialing: false, email: user.email ?? null };
  }

  const { data } = await db
    .from('subscriptions')
    .select('plan, status')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })
    .limit(1);

  const row = data?.[0] as { plan?: string; status?: string } | undefined;
  const entitled = row && ENTITLING_STATUSES.has(row.status ?? '');
  const plan = (entitled ? (row!.plan as PlanId) : 'free') ?? 'free';

  return {
    plan,
    entitlements: entitlementsFor(plan),
    signedIn: true,
    trialing: row?.status === 'trialing',
    email: user.email ?? null,
  };
}

/** Message shown when a gate closes. Names the plan that opens it, never just "upgrade". */
export function gateMessage(feature: string, plan: 'builder' | 'founder' = 'builder'): string {
  const name = plan === 'builder' ? 'Builder' : 'Founder';
  return `${feature} is part of ${name}. Auditing stays free and unlimited either way — that part is not a trial.`;
}
