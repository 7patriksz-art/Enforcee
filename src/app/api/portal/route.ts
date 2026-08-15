import { NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe';
import { SITE_URL } from '@/lib/site-url';
import { getUser, getServiceSupabase } from '@/lib/supabase/server';

/**
 * Stripe's Billing Portal, which is the professional answer to "email us to cancel".
 *
 * The billing page previously said: email this address and it is done the same day. That
 * is a promise made by one person with an inbox, and it reads exactly like one — a
 * customer about to hand over a card wants to see that leaving is a button, not a favour.
 * It is also the single most common cancellation dark-pattern complaint in the category,
 * and we sell trust.
 *
 * The portal is Stripe-hosted, so cancelling, updating a card and downloading invoices all
 * happen on Stripe's domain against Stripe's own record. We never see the card, and there
 * is no cancellation flow of ours that could be accused of being deliberately awkward.
 *
 * SECURITY: the customer id is looked up from the SIGNED-IN USER's own row, never taken
 * from the request. A `customerId` accepted from the client would let anyone open anyone
 * else's billing portal by guessing an id — which is a total account takeover of the
 * billing surface, delivered by us, in one fetch.
 */
export const dynamic = 'force-dynamic';

export async function POST() {
  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json({ error: 'Billing is not configured on this deployment.' }, { status: 503 });
  }

  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: 'Sign in first.', signInUrl: '/signin' }, { status: 401 });
  }

  const db = getServiceSupabase();
  if (!db) {
    return NextResponse.json({ error: 'No database configured on this deployment.' }, { status: 503 });
  }

  const { data } = await db
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('user_id', user.id)
    .not('stripe_customer_id', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const customer = data?.stripe_customer_id;
  if (!customer) {
    // Said plainly rather than as a generic failure. "Something went wrong" here would
    // send a free user to support for a state that is simply not an error.
    return NextResponse.json(
      { error: 'No billing record on this account yet — nothing has been charged.' },
      { status: 404 }
    );
  }

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer,
      return_url: `${SITE_URL}/account/billing`,
    });
    return NextResponse.json({ url: session.url });
  } catch (e) {
    // The real cause is logged for us; the caller gets a sentence they can act on. A
    // Stripe error string forwarded to the browser can leak account configuration.
    console.error('[portal] stripe billing portal failed', e);
    return NextResponse.json(
      { error: 'Stripe could not open the billing portal. Try again in a moment.' },
      { status: 502 }
    );
  }
}
