import Link from 'next/link';
import clsx from 'clsx';
import { getUser, supabaseConfigured } from '@/lib/supabase/server';
import { recentAudits, ruleHistory } from '@/lib/persist';
import { getAccess } from '@/lib/entitlements';
import { Stat } from '@/components/primitives';

export const dynamic = 'force-dynamic';

export default async function History() {
  if (!supabaseConfigured()) {
    return (
      <Shell>
        <p className="text-[13.5px] text-neutral-600">
          This deployment has no database configured, so history is off. The audit, the transcript reader and the guard
          compiler all work without one.
        </p>
      </Shell>
    );
  }

  const user = await getUser();
  if (!user) {
    return (
      <Shell>
        <p className="text-[13.5px] text-neutral-600">
          Sign in to keep your receipts and watch how each rule behaves over time.
        </p>
        <Link
          href="/signin"
          className="mt-4 inline-block rounded-md bg-ink px-4 py-2 text-[13px] font-medium text-white hover:bg-ink-soft transition-colors"
        >
          Sign in
        </Link>
      </Shell>
    );
  }

  const access = await getAccess();
  if (access.entitlements.historyDays <= 0) {
    return (
      <Shell>
        <section className="rounded-2xl border border-honey-line bg-honey-pale/50 px-5 py-6">
          <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-honey">the wall</div>
          <h2 className="mt-2 font-display text-[21px] tracking-tight">
            One audit is an anecdote. Forty is a diagnosis.
          </h2>
          <p className="readable mt-2 max-w-2xl">
            On Free nothing is written down, so there is nothing here. That is deliberate rather than mean: the
            interesting question is never <em>did this response follow rule 7</em>, it is{' '}
            <span className="hi font-semibold text-ink">
              which of my rules has been quietly failing for three weeks
            </span>{' '}
            — and no single audit can answer it.
          </p>
          <ul className="readable mt-4 max-w-2xl list-disc space-y-1.5 pl-5 text-[13.5px]">
            <li>Every receipt kept, forever, searchable by ruleset.</li>
            <li>A per-rule track record: <em>this rule failed 6 of your last 40 audits</em>.</li>
            <li>Drift alerts the moment a rule that used to hold starts failing.</li>
          </ul>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Link
              href="/pricing"
              className="rounded-xl bg-ink px-4 py-2.5 text-[14px] font-medium text-white transition-colors hover:bg-ink-soft"
            >
              Subscribe
            </Link>
            <Link href="/audit" className="text-[13px] text-brand hover:underline">
              Or keep auditing free
            </Link>
          </div>
        </section>
      </Shell>
    );
  }

  const [audits, rules] = await Promise.all([recentAudits(), ruleHistory()]);
  const avgCoverage =
    audits.length === 0
      ? 0
      : audits.reduce((n, a) => n + Number((a.summary as { coverage?: number })?.coverage ?? 0), 0) / audits.length;

  return (
    <Shell>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat value={String(audits.length)} label="Audits kept" hint="Every audit you have run, kept indefinitely." />
        <Stat
          value={`${Math.round(avgCoverage * 100)}%`}
          label="Average coverage"
          hint="Share of applicable rules that left an observable trace."
          tone={avgCoverage >= 0.7 ? 'good' : avgCoverage >= 0.4 ? 'warn' : 'bad'}
        />
        <Stat value={String(rules.length)} label="Rules tracked" hint="Content-addressed, so they survive rewording." />
        <Stat
          value={String(rules.filter((r) => r.violated > 0).length)}
          label="Rules with a failure"
          hint="Rules that have been broken at least once. Start here."
          tone={rules.some((r) => r.violated > 0) ? 'warn' : 'good'}
        />
      </div>

      {rules.length > 0 && (
        <section className="mt-6 rounded-lg border hairline bg-white">
          <div className="border-b hairline px-4 py-2.5 text-[13px] font-semibold">
            Rule track record
            <span className="ml-2 font-mono text-[11px] font-normal text-skip">worst first</span>
          </div>
          <ul className="divide-y hairline">
            {rules.slice(0, 25).map((r) => {
              const bad = r.violated + r.noSignal;
              return (
                <li key={r.ruleId} className="flex items-start gap-3 px-4 py-2.5">
                  <span className="mt-0.5 w-[86px] shrink-0 font-mono text-[10px] text-neutral-400">{r.ruleId}</span>
                  <span className="min-w-0 flex-1 text-[13px] text-neutral-900">{r.text}</span>
                  <span className="shrink-0 font-mono text-[11px]">
                    <span className={clsx(r.violated > 0 ? 'text-fail' : 'text-neutral-300')}>{r.violated} broken</span>
                    <span className="mx-2 text-neutral-300">·</span>
                    <span className={clsx(r.noSignal > 0 ? 'text-unknown' : 'text-neutral-300')}>{r.noSignal} no signal</span>
                    <span className="mx-2 text-neutral-300">·</span>
                    <span className="text-neutral-500">of {r.total}</span>
                  </span>
                  <span
                    className={clsx(
                      'ml-2 h-1.5 w-16 shrink-0 self-center overflow-hidden rounded-full bg-neutral-200'
                    )}
                    title={`${bad} of ${r.total} audits had a problem with this rule`}
                  >
                    <span
                      className={clsx('block h-full', bad === 0 ? 'bg-emerald-500' : bad / r.total > 0.5 ? 'bg-red-500' : 'bg-amber-400')}
                      style={{ width: `${Math.max(6, (bad / Math.max(1, r.total)) * 100)}%` }}
                    />
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="mt-6 rounded-lg border hairline bg-white">
        <div className="border-b hairline px-4 py-2.5 text-[13px] font-semibold">Audits</div>
        {audits.length === 0 ? (
          <p className="px-4 py-8 text-center text-[13px] text-skip">
            Nothing yet. <Link href="/audit" className="text-brand">Run one</Link> and it will appear here.
          </p>
        ) : (
          <ul className="divide-y hairline">
            {audits.map((a) => {
              const s = a.summary as { total?: number; violated?: number; unverifiable?: number; coverage?: number };
              const rsName = (a.rulesets as unknown as { name?: string } | null)?.name;
              return (
                <li key={a.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
                  <span className="font-mono text-[10px] text-neutral-400">{a.digest.slice(0, 12)}</span>
                  <span className="text-[13px] text-neutral-900">{rsName ?? 'Untitled ruleset'}</span>
                  <span className="font-mono text-[11px] text-skip">
                    {s.total ?? 0} rules · {Math.round((s.coverage ?? 0) * 100)}% coverage
                  </span>
                  {(s.violated ?? 0) > 0 && <span className="font-mono text-[11px] text-fail">{s.violated} broken</span>}
                  <span className="ml-auto font-mono text-[10px] text-neutral-400">
                    {a.mode} ·{' '}
                    {new Date(a.created_at as string).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-6xl px-5 py-8">
      <h1 className="text-[22px] font-semibold tracking-tight">History</h1>
      <p className="mb-6 mt-1 max-w-3xl text-[13px] leading-relaxed text-neutral-600">
        One audit tells you what happened once. A record tells you which of your rules is quietly getting worse — which
        is the question that actually changes what you write in your ruleset.
      </p>
      {children}
    </main>
  );
}
