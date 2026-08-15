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

  // Best effort, and explicitly not awaited into the failure path: a mail provider being
  // down must not turn a successful export into an error the user cannot act on.
  void notify('export-ready', user.email ?? '', { when: generatedAt.slice(0, 10) });

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="enforcee-export-${generatedAt.slice(0, 10)}.json"`,
      // Never cached anywhere: this is the whole of someone's account in one response.
      'cache-control': 'no-store, private',
    },
  });
}
