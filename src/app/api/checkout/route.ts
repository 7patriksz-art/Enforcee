import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getStripe, siteUrl } from '@/lib/stripe';
import { planById, stripePriceFor } from '@/lib/plans';
import { getUser } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const Body = z.object({
  plan: z.enum(['builder', 'founder']),
  interval: z.enum(['monthly', 'yearly']).default('monthly'),
});

export async function POST(req: Request) {
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
      subscription_data: { metadata: { plan: plan.id, interval: parsed.data.interval, user_id: user?.id ?? '' } },
      metadata: { plan: plan.id, interval: parsed.data.interval, user_id: user?.id ?? '' },
    });
    return NextResponse.json({ url: session.url });
  } catch (e) {
    console.error('[enforcee] checkout failed', e);
    return NextResponse.json({ error: 'Could not start checkout.' }, { status: 500 });
  }
}
