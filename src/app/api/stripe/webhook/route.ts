import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { getStripe } from '@/lib/stripe';
import { getServiceSupabase } from '@/lib/supabase/server';

export const runtime = 'nodejs';

/**
 * Stripe webhook. The signature is verified before anything is trusted — an unsigned
 * POST to this route must never be able to grant somebody a subscription.
 */
/**
 * When the paid period ends, as an ISO string.
 *
 * In Stripe's current API this lives on the subscription *item*, not the subscription —
 * `sub.current_period_end` no longer exists and TypeScript says so. Reading the item is
 * not a workaround for a type error; it is where the value actually is now, and casting
 * past the error would have written null forever while looking fine.
 *
 * Takes the latest across items so a multi-item subscription is not cut off early.
 */
function periodEndOf(sub: Stripe.Subscription): string | null {
  const ends = (sub.items?.data ?? [])
    .map((i) => i.current_period_end)
    .filter((n): n is number => typeof n === 'number' && Number.isFinite(n));
  if (!ends.length) return null;
  return new Date(Math.max(...ends) * 1000).toISOString();
}

export async function POST(req: Request) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) return NextResponse.json({ error: 'Stripe not configured.' }, { status: 503 });

  const signature = req.headers.get('stripe-signature');
  if (!signature) return NextResponse.json({ error: 'Missing signature.' }, { status: 400 });

  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(raw, signature, secret);
  } catch (e) {
    console.error('[enforcee] bad webhook signature', e);
    return NextResponse.json({ error: 'Invalid signature.' }, { status: 400 });
  }

  const db = getServiceSupabase();

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const s = event.data.object as Stripe.Checkout.Session;
        await db?.from('subscriptions').upsert(
          {
            user_id: s.client_reference_id || s.metadata?.user_id || null,
            email: s.customer_details?.email ?? null,
            stripe_customer_id: typeof s.customer === 'string' ? s.customer : null,
            stripe_subscription_id: typeof s.subscription === 'string' ? s.subscription : null,
            plan: s.metadata?.plan ?? 'builder',
            interval: s.metadata?.interval ?? 'monthly',
            status: 'active',
            // Recorded so a licence can expire with the subscription. Absent here on some
            // session shapes; customer.subscription.updated fills it in moments later.
            current_period_end: null,
          },
          { onConflict: 'stripe_subscription_id' }
        );
        break;
      }
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        await db
          ?.from('subscriptions')
          .update({
            status: sub.status,
            plan: sub.metadata?.plan ?? undefined,
            current_period_end: periodEndOf(sub),
          })
          .eq('stripe_subscription_id', sub.id);
        break;
      }
      default:
        break;
    }
  } catch (e) {
    // Never 500 back to Stripe for a storage problem, or it retries forever.
    console.error('[enforcee] webhook handling failed', e);
  }

  return NextResponse.json({ received: true });
}
