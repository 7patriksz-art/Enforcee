import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { getAccess } from '@/lib/entitlements';
import { issueLicence } from '@/lib/licence';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Issue an offline licence for the signed-in subscriber.
 *
 * Deliberately short-lived. A 45-day licence on a monthly subscription means a cancelled
 * account stops working within about six weeks without us ever phoning home, and the
 * renewal is one command the CLI prints for you. Long enough that nobody is stranded on
 * a plane; short enough that the licence is not a permanent gift.
 */
/**
 * Longest a licence may live, regardless of the subscription.
 *
 * Two rules, and the licence gets whichever is sooner:
 *   1. never outlive the paid period it was issued against
 *   2. never exceed MAX_TTL_DAYS
 *
 * Rule 1 was missing: a fixed 45 days was minted no matter what, so a cancelled subscriber
 * kept the guard for up to six more weeks. An issued licence is checked offline against a
 * public key on a laptop with no network — there is no revocation list and nothing can
 * reach it once handed out, so the expiry date is the only control that exists.
 *
 * Rule 2 matters for the opposite case. An annual subscriber's period ends 365 days out,
 * and minting a 365-day unrevocable licence would be worse than the bug being fixed. They
 * re-issue with one command; the CLI prints it.
 */
const MAX_TTL_DAYS = 45;

export async function POST() {
  const access = await getAccess();

  if (!access.signedIn) {
    return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  }
  if (!access.entitlements.guard || access.plan === 'free') {
    return NextResponse.json(
      {
        error: 'The guard is part of Builder.',
        detail: 'Auditing stays free and unlimited either way — that is not a trial.',
        upgrade: '/pricing',
      },
      { status: 402 }
    );
  }

  const privateKey = process.env.ENFORCEE_LICENCE_PRIVATE_KEY;
  if (!privateKey) {
    console.error('[enforcee] ENFORCEE_LICENCE_PRIVATE_KEY is not set — cannot issue licences');
    return NextResponse.json({ error: 'Licensing is not configured on this deployment.' }, { status: 503 });
  }

  const now = Math.floor(Date.now() / 1000);
  const sub = access.email ?? 'unknown';

  // Whichever comes first. periodEnd is null when Stripe has not reported one yet — a
  // freshly created subscription, moments before customer.subscription.updated lands — so
  // the cap is the fallback rather than an unbounded licence.
  const cap = now + MAX_TTL_DAYS * 86_400;
  const exp = access.periodEnd ? Math.min(access.periodEnd, cap) : cap;

  // A period that has already passed means the subscription lapsed and the webhook has not
  // caught up. Issuing a licence that is already dead is honest but useless; refusing and
  // saying why is better than handing over something that fails on their machine.
  if (exp <= now) {
    return NextResponse.json(
      {
        error: 'That subscription period has ended.',
        detail: 'Renew and the licence re-issues immediately. Auditing keeps working regardless.',
        upgrade: '/pricing',
      },
      { status: 402 }
    );
  }
  const token = issueLicence(
    {
      // Stable per account per period, so re-issuing does not spray unique ids around,
      // but still distinguishes one licence from the next.
      jti: createHash('sha256').update(`${sub}:${Math.floor(now / 86_400)}`).digest('hex').slice(0, 16),
      sub,
      plan: access.plan === 'founder' ? 'founder' : 'builder',
      exp,
    },
    privateKey.replace(/\\n/g, '\n'),
    now
  );

  return NextResponse.json(
    { licence: token, plan: access.plan, expiresAt: new Date(exp * 1000).toISOString() },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
