import Link from 'next/link';
import type { Metadata } from 'next';
import { getAccess } from '@/lib/entitlements';
import { planById } from '@/lib/plans';
import { supabaseConfigured } from '@/lib/supabase/server';
import Licence from './Licence';
import { CONTACT_EMAIL } from '@/lib/contact';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Account — Enforcee' };

// The value page is linked from here on purpose: this is the screen somebody opens when
// they are already wondering whether to keep paying, so that is where the honest answer
// belongs — not buried in a nav bar where only enthusiasts find it.
export default async function Account() {
  if (!supabaseConfigured()) {
    return (
      <Shell>
        <p className="readable">This deployment has no database configured, so there are no accounts on it.</p>
      </Shell>
    );
  }

  const access = await getAccess();

  if (!access.signedIn) {
    return (
      <Shell>
        <p className="readable max-w-2xl">
          Sign in to manage your subscription and collect your licence. Auditing does not need an account — this page is
          only for the parts that do.
        </p>
        <Link
          href="/signin"
          className="mt-5 inline-block rounded-xl bg-ink px-4 py-2.5 text-[14px] font-medium text-white transition-colors hover:bg-ink-soft"
        >
          Sign in
        </Link>
      </Shell>
    );
  }

  const plan = planById(access.plan)!;
  const e = access.entitlements;

  const ROWS: [string, string][] = [
    ['Audits', 'Unlimited, here and in the CLI'],
    ['The guard', e.guard ? 'On' : 'Not on this plan'],
    ['Judged layer on our key', e.hostedJudge ? 'On' : 'Bring your own key'],
    ['History', e.historyDays > 0 ? 'Every audit, kept' : 'Nothing is saved'],
    ['Rules found in conversation', Number.isFinite(e.learnLimit) ? `First ${e.learnLimit}` : 'Unlimited'],
    ['Projects', e.projects === 0 ? '—' : Number.isFinite(e.projects) ? String(e.projects) : 'Unlimited'],
    ['CI gate', e.ciGate ? 'On' : 'Founder'],
    ['REST API', e.api ? 'On' : 'Founder'],
  ];

  return (
    <Shell>
      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="space-y-5">
          <Licence entitled={e.guard} />

          <section className="rounded-2xl border hairline bg-white">
            <div className="border-b hairline px-5 py-3 text-[14px] font-semibold">What this account can do</div>
            <ul className="divide-y hairline">
              {ROWS.map(([k, v]) => (
                <li key={k} className="flex items-center gap-4 px-5 py-2.5 text-[13.5px]">
                  <span className="text-ink-mid">{k}</span>
                  <span className="ml-auto font-mono text-[12px] text-ink">{v}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <aside className="space-y-5">
          <section className="rounded-2xl border border-ink bg-white px-5 py-5 shadow-sm ring-1 ring-ink/5">
            <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-clay">current plan</div>
            <div className="mt-2 font-display text-[24px] tracking-tight">{plan.name}</div>
            {access.trialing && (
              <div className="mt-2 inline-flex rounded-full bg-honey-pale px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-honey">
                trialing
              </div>
            )}
            <p className="mt-3 text-[13px] leading-relaxed text-ink-mid">{plan.who}</p>
            <p className="mt-3 font-mono text-[11.5px] text-skip">{access.email}</p>
            <Link
              href="/pricing"
              className="mt-4 block rounded-xl border border-ink/15 bg-white px-4 py-2.5 text-center text-[14px] font-medium transition-colors hover:border-ink/30"
            >
              {access.plan === 'founder' ? 'Compare plans' : 'See what the next plan adds'}
            </Link>
          </section>

          {access.plan !== 'free' && (
            <Link
              href="/value"
              className="block rounded-2xl border border-clay-line bg-clay-pale px-5 py-4 transition-colors hover:border-clay"
            >
              <div className="text-[13.5px] font-semibold">Is this worth it?</div>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-mid">
                What it has actually caught for you, from your own history — and a straight answer if the honest
                one is no.
              </p>
            </Link>
          )}

          <section className="rounded-2xl border hairline bg-paper-soft px-5 py-4">
            <div className="text-[13.5px] font-semibold">Changing or cancelling</div>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-mid">
              Email <a href={`mailto:${CONTACT_EMAIL}`} className="text-brand hover:underline">{CONTACT_EMAIL}</a> and
              it is done the same day. You keep the paid features until the end of the period you already paid for, and
              auditing keeps working afterwards regardless.
            </p>
          </section>
        </aside>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-5xl px-5 py-12">
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-clay">account</p>
      <h1 className="mt-3 font-display text-[32px] tracking-tight">Your subscription</h1>
      <div className="mt-8">{children}</div>
    </main>
  );
}
