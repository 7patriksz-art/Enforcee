'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getBrowserSupabase } from '@/lib/supabase/client';

/**
 * The way into the dashboard, from anywhere on the site.
 *
 * There was no route to `/account` from any page. If you were signed in you had to know
 * the URL — which is a thing a founder knows and a customer does not.
 *
 * WHY THIS IS A CLIENT COMPONENT. The header lives in the root layout, so reading auth
 * there would make **every page on the site dynamic**, including the marketing pages that
 * are currently static. That is a real cost — statically served HTML is most of why the
 * landing page is fast — to render one 32px icon. So the icon renders immediately in its
 * signed-out state and upgrades itself once Supabase answers.
 *
 * The destination is the same either way: `/account` already handles a signed-out visitor
 * by offering sign-in. One link, no branching, and nothing to get out of sync.
 */
export default function AccountIcon() {
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    const supabase = getBrowserSupabase();
    if (!supabase) return;

    let alive = true;
    supabase.auth.getUser().then(({ data }) => {
      if (alive) setEmail(data.user?.email ?? null);
    });

    // Sign in or out in another tab and the icon follows, rather than lying until reload.
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (alive) setEmail(session?.user?.email ?? null);
    });

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // The first letter of the address, which is how every account menu in this category
  // signals "you are logged in" without an avatar upload nobody wants to do.
  const initial = email?.trim()?.[0]?.toUpperCase();

  return (
    <Link
      href="/account"
      // The label carries the state, because the visual difference between a glyph and a
      // letter is not something a screen reader can convey.
      aria-label={email ? `Account — signed in as ${email}` : 'Sign in to your account'}
      title={email ?? 'Account'}
      className="press grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-ink/10 text-ink-mid hover:border-ink/25 hover:text-ink"
    >
      {initial ? (
        <span className="text-[13px] font-semibold leading-none text-ink">{initial}</span>
      ) : (
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-[17px] w-[17px]"
        >
          <circle cx="12" cy="8.5" r="3.6" />
          <path d="M4.8 20a7.4 7.4 0 0 1 14.4 0" />
        </svg>
      )}
    </Link>
  );
}
