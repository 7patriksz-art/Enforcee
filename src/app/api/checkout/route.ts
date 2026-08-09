import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getStripe, siteUrl } from '@/lib/stripe';
import { planById, stripePriceFor } from '@/lib/plans';
import { getUser } from '@/lib/supabase/server';
import { billingStatus } from '@/lib/billing-gate';

export const runtime = 'nodejs';

const Body = z.object({
  plan: z.enum(['builder', 'founder']),
  interval: z.enum(['monthly', 'yearly']).default('monthly'),
});

export async function POST(req: Request) {
  // First gate, before Stripe is even constructed. Taking one payment on a
  // non-commercial hosting plan is a breach we cannot undo by refunding it.
  const billing = billingStatus();
  if (!billing.enabled) {
    return NextResponse.json({ error: billing.reason, detail: billing.detail }, { status: 503 });
  }

  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json({ error: 'Checkout is not live on this deployment yet.' }, { status: 503 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body must be JSON.' }, { status: 400 });
  }
  const parsed = Body.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });

  const plan = planById(parsed.data.plan);
  if (!plan) return NextResponse.json({ error: 'Unknown plan.' }, { status: 400 });

  const price = stripePriceFor(plan, parsed.data.interval);
  if (!price) {
    return NextResponse.json(
      { error: `No Stripe price configured for ${plan.name} ${parsed.data.interval}.` },
      { status: 503 }
    );
  }

  // Sign-in is not required to pay. Making someone create an account before they can
  // give you money is a conversion tax with no upside; we reconcile on the webhook.
  const user = await getUser();

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price, quantity: 1 }],
      allow_promotion_codes: true,
      success_url: `${siteUrl()}/pricing?checkout=done`,
      cancel_url: `${siteUrl()}/pricing?checkout=cancelled`,
      customer_email: user?.email ?? undefined,
      client_reference_id: user?.id ?? undefined,
      subscription_data: {
        metadata: { plan: plan.id, interval: parsed.data.interval, user_id: user?.id ?? '' },
      },
      // payment_method_collection: 'if_required' was here to let the card-free trial start
      // without a card. With no trial there is nothing to defer collection for, and leaving
      // it would mean the one path that takes money is configured by an assumption that is
      // no longer true. Removed so Stripe collects a payment method, which is the default.
      metadata: { plan: plan.id, interval: parsed.data.interval, user_id: user?.id ?? '' },
    });
    return NextResponse.json({ url: session.url });
  } catch (e) {
    console.error('[enforcee] checkout failed', e);
    return NextResponse.json({ error: 'Could not start checkout.' }, { status: 500 });
  }
}
