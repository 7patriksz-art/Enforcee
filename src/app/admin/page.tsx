import Link from 'next/link';
import clsx from 'clsx';
import { listCampaign, requireAdmin, type CampaignItem } from '@/lib/admin';
import { supabaseConfigured } from '@/lib/supabase/server';
import Board from './Board';
import Capacity from './Capacity';
import Metrics from './Metrics';
import { buildAdminMetrics } from '@/lib/admin-metrics';
import { getServiceSupabase } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const LANES: { key: CampaignItem['status']; label: string; note: string }[] = [
  { key: 'idea', label: 'Ideas', note: 'unfiltered' },
  { key: 'drafting', label: 'Drafting', note: 'being written' },
  { key: 'ready', label: 'Ready', note: 'survives scrutiny' },
  { key: 'scheduled', label: 'Scheduled', note: 'has a date' },
  { key: 'posted', label: 'Posted', note: 'live, watch the thread' },
  { key: 'killed', label: 'Killed', note: 'and why' },
];

export default async function Admin() {
  if (!supabaseConfigured()) return <Shell><Note>No database configured on this deployment.</Note></Shell>;

  const gate = await requireAdmin();
  if (!gate.ok) {
    return (
      <Shell>
        <Note>
          {gate.reason}
          {gate.reason === 'Not signed in.' && (
            <>
              {' '}
              <Link href="/signin" className="text-brand underline">
                Sign in
              </Link>
              .
            </>
          )}
        </Note>
        <p className="mt-4 max-w-prose text-[13px] leading-relaxed text-ink-mid">
          This workspace is gated by an explicit allowlist in <code className="font-mono">ADMIN_EMAILS</code>. The table
          behind it has row-level security on and no policy at all, so even a leaked public key reads nothing from it.
        </p>
      </Shell>
    );
  }

  const db = getServiceSupabase();
  const [items, auditCount, metrics] = await Promise.all([
    listCampaign(),
    db
      ? db.from('audits').select('id', { count: 'exact', head: true }).then((r) => r.count ?? 0)
      : Promise.resolve(0),
    buildAdminMetrics(),
  ]);

  return (
    <Shell>
      <Metrics m={metrics} />
      <Capacity auditCount={auditCount} />
      <Board items={items} lanes={LANES} />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-[1400px] px-5 py-10">
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-clay">internal</p>
      <h1 className="mt-3 font-display text-[32px] tracking-tight">Outreach workspace</h1>
      <p className="readable mt-2 max-w-prose">
        Where posts get drafted, scheduled and buried. Text-first surfaces before anything else, and every draft carries
        the rules of the place it is going, so nothing gets posted at 1am into a subreddit that bans it.
      </p>
      <div className="mt-8">{children}</div>
    </main>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className={clsx('rounded-xl border border-unknown-line bg-unknown-pale px-4 py-3 text-[13.5px] text-unknown')}>
      {children}
    </div>
  );
}
