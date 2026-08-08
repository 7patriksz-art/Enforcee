import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase/server';

export const runtime = 'nodejs';

/** Exchanges the magic-link code for a session cookie, then sends the user on. */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  // Only same-origin, single-slash paths. `@evil.com` makes our host the URL's *userinfo*
  // and sends the user to evil.com wearing our domain — which, on a magic-link callback,
  // is session fixation plus a phishing redirector in one.
  const raw = searchParams.get('next');
  const next = raw && /^\/(?![/\\])/.test(raw) ? raw : '/history';

  if (code) {
    const supabase = await getServerSupabase();
    if (supabase) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) return NextResponse.redirect(`${origin}${next}`);
    }
  }
  return NextResponse.redirect(`${origin}/signin?error=link`);
}
