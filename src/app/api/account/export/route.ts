import { NextResponse } from 'next/server';
import { getUser, getServiceSupabase } from '@/lib/supabase/server';
import { notify } from '@/lib/notify';

/**
 * Everything held against this account, as a file, immediately.
 *
 * The data page used to say "email us and it is done the same day". A same-day promise
 * from one person's inbox is not a data-access mechanism, it is a favour — and for a
 * product whose privacy page cites this as the GDPR contact route, it is also the weakest
 * possible answer to the one question every buyer asks.
 *
 * There is no queue and no ticket. The request reads three tables and returns a file.
 *
 * SECURITY: every query is filtered by the signed-in user's own id, taken from the session
 * and never from the request. An exportable `userId` parameter would be a one-fetch data
 * breach with a download button on it.
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: 'Sign in first.', signInUrl: '/signin' }, { status: 401 });
  }

  const db = getServiceSupabase();
  if (!db) {
    return NextResponse.json({ error: 'No database configured on this deployment.' }, { status: 503 });
  }

  const [subs, audits] = await Promise.all([
    db.from('subscriptions').select('*').eq('user_id', user.id),
    db.from('audits').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
  ]);

  const generatedAt = new Date().toISOString();
  const payload = {
    generatedAt,
    account: {
      id: user.id,
      email: user.email ?? null,
      createdAt: user.created_at ?? null,
    },
    subscriptions: subs.data ?? [],
    audits: audits.data ?? [],
    // Stated inside the file, because the file is the thing that gets kept and read later,
    // possibly by someone who never saw the page it came from.
    notIncluded: [
      'Your source code — it is never uploaded, so we have never held any.',
      'Audits run signed out, which are not stored against any account.',
      'Card details, which are held by Stripe and never by us.',
    ],
  };

  // AWAITED, and the outcome reported. It was fire-and-forget, and the UI said "a copy of
  // this notice is in your inbox" whether or not one had been sent — a claim about
  // something we had not checked, on the page whose whole job is being believed.
  //
  // It also hid a real production bug for a day: with RESEND_API_KEY missing the send was
  // skipped silently and the only evidence was an email that never arrived.
  //
  // The result rides in a header because the body is the file itself. A failed send must
  // never fail the export — the user asked for their data, not for a notification.
  const mail = await notify('export-ready', user.email ?? '', { when: generatedAt.slice(0, 10) });

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="enforcee-export-${generatedAt.slice(0, 10)}.json"`,
      // Never cached anywhere: this is the whole of someone's account in one response.
      'cache-control': 'no-store, private',
      'x-enforcee-notified': mail.sent ? 'sent' : (mail.reason ?? 'not sent'),
      // Without this the browser cannot read the header at all — same-origin fetch still
      // hides non-safelisted response headers unless they are explicitly exposed.
      'access-control-expose-headers': 'x-enforcee-notified',
    },
  });
}
