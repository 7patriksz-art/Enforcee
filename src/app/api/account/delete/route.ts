import { NextResponse } from 'next/server';
import { getUser, getServiceSupabase } from '@/lib/supabase/server';
import { notify } from '@/lib/notify';

/**
 * Delete this account, for real, now.
 *
 * The alternative shipped for a week: "email us and it is done the same day". That is a
 * promise, not a mechanism, and it is the kind of thing a buyer reads as *we would rather
 * you did not*. Deletion being one confirmed button is the strongest privacy signal a
 * small product can send, and it costs less than the paragraph explaining why it is not.
 *
 * ── Guards, and why each one is here ────────────────────────────────────────
 *
 * TYPED CONFIRMATION. The caller must send back their own email address exactly. A modal
 * with a red button gets clicked by accident; typing your address is a deliberate act, and
 * it is the pattern GitHub and Stripe both use for the same reason.
 *
 * COMPARED CASE-INSENSITIVELY, AFTER TRIM. `P@Example.com` is the same mailbox as
 * `p@example.com`, and refusing it teaches the user their account is broken rather than
 * that they typed it differently.
 *
 * ORDER MATTERS: rows first, auth user last. If the auth deletion succeeded and a row
 * delete then failed, we would hold orphaned data belonging to somebody with no way left
 * to sign in and ask for it — data we have just told them is gone.
 *
 * WHAT THIS DOES NOT DO. It does not cancel a Stripe subscription, and the response and
 * the email both say so, loudly. Silently leaving a card being charged for a deleted
 * account would be the single worst thing on this whole surface.
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

  const expected = (user.email ?? '').trim().toLowerCase();
  if (!expected || confirm.trim().toLowerCase() !== expected) {
    return NextResponse.json(
      { error: 'Type your email address exactly to confirm.' },
      { status: 400 }
    );
  }

  const db = getServiceSupabase();
  if (!db) {
    return NextResponse.json({ error: 'No database configured on this deployment.' }, { status: 503 });
  }

  // Held before deletion, because after it there is nobody left to tell.
  const email = user.email ?? '';
  const when = new Date().toISOString().slice(0, 10);

  const { data: subs } = await db
    .from('subscriptions')
    .select('status')
    .eq('user_id', user.id)
    .in('status', ['active', 'trialing', 'past_due']);
  const hadLiveSubscription = (subs?.length ?? 0) > 0;

  for (const table of ['audits', 'subscriptions'] as const) {
    const { error } = await db.from(table).delete().eq('user_id', user.id);
    if (error) {
      console.error(`[delete] ${table} failed`, error);
      // Stop rather than continue. A partial delete reported as success is a lie about
      // the one thing this endpoint exists to be trusted on.
      return NextResponse.json(
        { error: 'Deletion could not complete. Nothing was removed — please try again.' },
        { status: 500 }
      );
    }
  }

  const { error: authError } = await db.auth.admin.deleteUser(user.id);
  if (authError) {
    console.error('[delete] auth user failed', authError);
    return NextResponse.json(
      { error: 'Your data was removed but the login could not be deleted. Contact us and we will finish it.' },
      { status: 500 }
    );
  }

  void notify('account-deleted', email, { when });

  return NextResponse.json({
    deleted: true,
    // Surfaced in the UI. Nobody should learn from a bank statement that deleting an
    // account did not stop the billing.
    stripeStillActive: hadLiveSubscription,
  });
}
