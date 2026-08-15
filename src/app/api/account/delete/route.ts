import { NextResponse } from 'next/server';
import { getUser, getServiceSupabase } from '@/lib/supabase/server';
import { getStripe } from '@/lib/stripe';
import { notify } from '@/lib/notify';

/**
 * Delete this account, for real, now — and cancel the subscription first.
 *
 * ── The bug this replaces, which was mine ───────────────────────────────────
 *
 * The first version deleted the account and left the Stripe subscription running. It said
 * so in the UI and in the email, and I called that honest. It is not: a product that
 * destroys your login while continuing to charge your card is indistinguishable from a
 * scam, however clearly it is disclosed. Disclosure is not a defence when the outcome is
 * "you cannot log in and you are still paying".
 *
 * It is also the single most chargeback-prone shape available. The cardholder cannot log
 * in to cancel, cannot see an invoice, and has a perfect story for their bank. Every one
 * of those disputes is lost on the merits and costs a fee on top.
 *
 * ── The order is the whole design ───────────────────────────────────────────
 *
 *   1. Read the Stripe ids WHILE THE ROWS STILL EXIST. After deletion there is no record
 *      of which customer this was, and the subscription becomes unreachable forever.
 *   2. Cancel in Stripe.
 *   3. ONLY IF THAT SUCCEEDS, delete the rows, then the auth user.
 *
 * If cancellation fails, NOTHING is deleted and the user is told. Refusing to delete is a
 * bad outcome; deleting while the card keeps being charged is a much worse one, and the
 * failure mode has to fall on the side that cannot take someone's money.
 *
 * ── Immediately, not at period end ──────────────────────────────────────────
 *
 * `cancel_at_period_end` would keep billing rights alive against an account that no longer
 * exists. The user cannot use a paid feature after this call — there is nothing to use it
 * with — so charging for the remainder is exactly the part that gets disputed. Cancelling
 * outright means no further charge is possible.
 *
 * Any refund of the unused period is a MONEY DECISION and is deliberately not made here.
 * Stripe's dashboard does it in two clicks, and the email tells the user to ask.
 *
 * ── Dispute evidence survives ───────────────────────────────────────────────
 *
 * Deleting our rows does not delete Stripe's. Stripe independently retains the customer,
 * invoices and payment history, which is what a chargeback is actually defended with —
 * and what tax law requires be kept regardless of a deletion request. Our rows are the
 * profile; Stripe's are the financial record.
 */
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: 'Sign in first.', signInUrl: '/signin' }, { status: 401 });
  }

  let confirm = '';
  try {
    confirm = String(((await req.json()) as { confirm?: unknown })?.confirm ?? '');
  } catch {
    return NextResponse.json({ error: 'Malformed request.' }, { status: 400 });
  }

  // Case-insensitive after trim: `P@Example.com` is the same mailbox, and refusing it
  // teaches the user their account is broken rather than that they typed it differently.
  const expected = (user.email ?? '').trim().toLowerCase();
  if (!expected || confirm.trim().toLowerCase() !== expected) {
    return NextResponse.json({ error: 'Type your email address exactly to confirm.' }, { status: 400 });
  }

  const db = getServiceSupabase();
  if (!db) {
    return NextResponse.json({ error: 'No database configured on this deployment.' }, { status: 503 });
  }

  const email = user.email ?? '';
  const when = new Date().toISOString().slice(0, 10);

  // ── 1. Read the ids while they still exist ────────────────────────────────
  const { data: rows, error: readError } = await db
    .from('subscriptions')
    .select('stripe_subscription_id, status')
    .eq('user_id', user.id);

  if (readError) {
    console.error('[delete] could not read subscriptions', readError);
    return NextResponse.json(
      { error: 'Could not check your subscription. Nothing was deleted — please try again.' },
      { status: 500 }
    );
  }

  const live = (rows ?? []).filter(
    (r) => r.stripe_subscription_id && ['active', 'trialing', 'past_due'].includes(String(r.status))
  );

  // ── 2. Cancel before deleting anything ────────────────────────────────────
  const cancelled: string[] = [];
  if (live.length > 0) {
    const stripe = getStripe();
    if (!stripe) {
      return NextResponse.json(
        {
          error:
            'You have an active subscription and billing is not reachable right now. Nothing was deleted — try again shortly.',
        },
        { status: 503 }
      );
    }

    for (const row of live) {
      const id = String(row.stripe_subscription_id);
      try {
        await stripe.subscriptions.cancel(id);
        cancelled.push(id);
      } catch (e) {
        // Already cancelled is a SUCCESS for our purposes — the goal is "no further
        // charge", and a subscription Stripe no longer knows about satisfies it. Anything
        // else aborts: deleting now would strand a live subscription.
        const code = (e as { code?: string })?.code;
        if (code === 'resource_missing') {
          cancelled.push(id);
          continue;
        }
        console.error('[delete] stripe cancel failed', id, e);
        return NextResponse.json(
          {
            error:
              'Your subscription could not be cancelled, so nothing was deleted. Cancel in Billing first, then delete.',
          },
          { status: 502 }
        );
      }
    }
  }

  // ── 3. Now, and only now, delete ──────────────────────────────────────────
  for (const table of ['audits', 'subscriptions'] as const) {
    const { error } = await db.from(table).delete().eq('user_id', user.id);
    if (error) {
      console.error(`[delete] ${table} failed`, error);
      // The subscription is already cancelled at this point, which is the safe direction
      // to fail in: the user is not being charged, and their data is still here to try again.
      return NextResponse.json(
        {
          error:
            'Your subscription was cancelled but deletion did not finish. No further charge will be made — please try again.',
        },
        { status: 500 }
      );
    }
  }

  const { error: authError } = await db.auth.admin.deleteUser(user.id);
  if (authError) {
    console.error('[delete] auth user failed', authError);
    return NextResponse.json(
      { error: 'Your data and subscription are gone but the login could not be removed. Contact us and we will finish it.' },
      { status: 500 }
    );
  }

  const mail = await notify('account-deleted', email, {
    when,
    subscription: cancelled.length
      ? 'Your subscription was cancelled at the same time, so nothing further will be charged.'
      : 'You had no active subscription, so there was nothing to cancel.',
  });

  // Reported rather than assumed. This is the last contact the user will ever have with
  // us, so whether it actually went is worth one boolean.
  return NextResponse.json({
    deleted: true,
    subscriptionsCancelled: cancelled.length,
    emailed: mail.sent,
  });
}
