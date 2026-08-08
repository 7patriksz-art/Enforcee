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
const TTL_DAYS = 45;

export async function POST() {
  const access = await getAccess();

  if (!access.signedIn) {
    return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  }
  if (!access.entitlements.guard || access.plan === 'free') {
    return NextResponse.json(
      {
        error: 'The guard is part of Builder.',
        detail: 'Thirty days free, no card. Auditing stays unlimited either way.',
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
  const token = issueLicence(
    {
      // Stable per account per period, so re-issuing does not spray unique ids around,
      // but still distinguishes one licence from the next.
      jti: createHash('sha256').update(`${sub}:${Math.floor(now / 86_400)}`).digest('hex').slice(0, 16),
      sub,
      plan: access.plan === 'founder' ? 'founder' : 'builder',
      exp: now + TTL_DAYS * 86_400,
    },
    privateKey.replace(/\\n/g, '\n'),
    now
  );

  return NextResponse.json(
    { licence: token, plan: access.plan, expiresAt: new Date((now + TTL_DAYS * 86_400) * 1000).toISOString() },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
