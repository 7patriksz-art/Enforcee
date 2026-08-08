import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createClient as createRawClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Supabase is optional at build time and at runtime.
 *
 * The whole product must keep working with no database at all — the free audit, the
 * transcript reader and the guard compiler never need one. Persistence is additive.
 * So every accessor here returns null rather than throwing when the env is absent.
 */
export function supabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

/** Request-scoped client that carries the signed-in user, so RLS applies to every query. */
export async function getServerSupabase() {
  if (!supabaseConfigured()) return null;
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          try {
            for (const { name, value, options } of toSet) cookieStore.set(name, value, options);
          } catch {
            // Called from a Server Component, where cookies are read-only. Middleware
            // refreshes the session, so this is safe to ignore.
          }
        },
      },
    }
  );
}

/**
 * Service-role client. Bypasses RLS, so it is used for exactly one thing: writing the
 * cost ledger, which the user must never be able to rewrite from the browser.
 * Never expose this to a client component and never use it to read user data.
 */
export function getServiceSupabase(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createRawClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function getUser() {
  const supabase = await getServerSupabase();
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
}
