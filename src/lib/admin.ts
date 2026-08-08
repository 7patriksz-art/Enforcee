import { getUser, getServiceSupabase } from './supabase/server';

/**
 * Admin gate. One allowlist, checked server-side, applied before any query runs.
 *
 * The campaign table has RLS on and no policy at all, so even a leaked anon key reads
 * nothing. Everything here goes through the service role after this check passes.
 */
export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export async function requireAdmin(): Promise<{ ok: boolean; email: string | null; reason?: string }> {
  const allow = adminEmails();
  if (allow.length === 0) return { ok: false, email: null, reason: 'No ADMIN_EMAILS configured on this deployment.' };
  const user = await getUser();
  if (!user?.email) return { ok: false, email: null, reason: 'Not signed in.' };
  if (!allow.includes(user.email.toLowerCase())) return { ok: false, email: user.email, reason: 'Not on the admin list.' };
  return { ok: true, email: user.email };
}

export interface CampaignItem {
  id: string;
  surface: string;
  kind: string;
  title: string;
  body: string;
  status: 'idea' | 'drafting' | 'ready' | 'scheduled' | 'posted' | 'killed';
  scheduled_for: string | null;
  posted_url: string | null;
  notes: string;
  constraints: string;
  effort_hours: number;
  author: string;
  created_at: string;
  updated_at: string;
}

export async function listCampaign(): Promise<CampaignItem[]> {
  const db = getServiceSupabase();
  if (!db) return [];
  const { data } = await db
    .from('campaign_items')
    .select('*')
    .order('scheduled_for', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false });
  return (data ?? []) as CampaignItem[];
}
