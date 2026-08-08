'use client';

import { createBrowserClient } from '@supabase/ssr';

/** Null when the deployment has no Supabase configured — the app still works without it. */
export function getBrowserSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createBrowserClient(url, key);
}
