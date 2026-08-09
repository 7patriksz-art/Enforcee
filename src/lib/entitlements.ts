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
  /**
   * End of the paid period, as Unix seconds, or null if unknown.
   *
   * Exists so an offline licence can expire when the subscription does. An issued licence
   * is verified against a public key on a laptop with no network — there is no revocation
   * list and nothing can reach it once handed out, so the expiry date is the only control
   * we have. It has to be the real one.
   */
  periodEnd: number | null;
}

export async function getAccess(): Promise<Access> {
  const user = await getUser().catch(() => null);
  if (!user) {
    return { plan: 'free', entitlements: entitlementsFor('free'), signedIn: false, trialing: false, email: null, periodEnd: null };
  }

  const db = getServiceSupabase();
  if (!db) {
    return { plan: 'free', entitlements: entitlementsFor('free'), signedIn: true, trialing: false, email: user.email ?? null, periodEnd: null };
  }

  const select = 'plan, status, current_period_end';
  const byUser = async () =>
    (
      await db
        .from('subscriptions')
        .select(select)
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false })
        .limit(1)
    ).data?.[0];

  let found = await byUser();

  // Checkout does not require signing in — making somebody create an account before they
  // can give you money is a conversion tax. The webhook therefore writes rows with
  // user_id: null, and nothing ever claimed them, so anyone who paid without signing in
  // first got a subscription that existed and entitled nothing.
  //
  // The claim matches on email, which is only safe because of where the email comes from.
  // user.email is Supabase's *verified* address — the person proved control of that inbox
  // to sign in. The row's email is whatever was typed at Stripe, and is never trusted as
  // identity; it is only ever the thing being matched against. Someone who pays using
  // another person's address gives that subscription away rather than stealing one.
  //
  // Only unclaimed rows are eligible. An assigned subscription can never be reassigned by
  // this path, whatever anyone types into Stripe.
  if (!found && user.email) {
    await db
      .from('subscriptions')
      .update({ user_id: user.id })
      .is('user_id', null)
      .ilike('email', user.email);
    found = await byUser();
  }

  const row = found as { plan?: string; status?: string; current_period_end?: string | null } | undefined;
  const entitled = row && ENTITLING_STATUSES.has(row.status ?? '');
  const plan = (entitled ? (row!.plan as PlanId) : 'free') ?? 'free';

  return {
    plan,
    entitlements: entitlementsFor(plan),
    signedIn: true,
    trialing: row?.status === 'trialing',
    email: user.email ?? null,
    periodEnd: row?.current_period_end ? Math.floor(new Date(row.current_period_end).getTime() / 1000) : null,
  };
}

/** Message shown when a gate closes. Names the plan that opens it, never just "upgrade". */
export function gateMessage(feature: string, plan: 'builder' | 'founder' = 'builder'): string {
  const name = plan === 'builder' ? 'Builder' : 'Founder';
  return `${feature} is part of ${name}. Auditing stays free and unlimited either way — that part is not a trial.`;
}
