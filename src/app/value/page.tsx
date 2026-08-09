import Link from 'next/link';
import { getAccess } from '@/lib/entitlements';
import { buildValueReport, type ValueReport } from '@/lib/value';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Is this worth it? — Enforcee' };

const pct = (n: number | null) => (n === null ? '—' : `${Math.round(n * 100)}%`);

/**
 * Single series, so no legend and no categorical hues — the title names what it is.
 * Bars are thin with rounded data-ends anchored to the baseline, a 2px gap between them,
 * and no number on every point. A day with no violations is drawn as a hairline rather
 * than nothing, because "we looked and found none" and "we did not look" are different
 * facts and this whole product exists to keep them apart.
 */
function Trend({ data }: { data: ValueReport['timeline'] }) {
  const max = Math.max(1, ...data.map((d) => d.violations));
  const peak = data.reduce((a, b) => (b.violations > a.violations ? b : a), data[0]);
  return (
    <figure className="mt-4">
      <div className="flex h-24 items-end gap-[2px]" role="img"
           aria-label={`Violations caught per day over the last ${data.length} days. Peak ${peak?.violations ?? 0}.`}>
        {data.map((d) => (
          <div key={d.day} className="group relative flex-1" title={`${d.day} · ${d.violations} violated · ${d.audits} audit${d.audits === 1 ? '' : 's'}`}>
            <div
              className={d.violations ? 'rounded-t-[4px] bg-clay' : 'bg-paper-line'}
              style={{ height: d.violations ? `${Math.max(6, (d.violations / max) * 96)}px` : '1px' }}
            />
          </div>
        ))}
      </div>
      <figcaption className="mt-2 flex justify-between font-mono text-[11px] text-skip">
        <span>{data[0]?.day}</span>
        <span>violations caught per day · peak {peak?.violations ?? 0}</span>
        <span>{data[data.length - 1]?.day}</span>
      </figcaption>
    </figure>
  );
}

function Tile({ k, v, note }: { k: string; v: string; note: string }) {
  return (
    <div className="rounded-xl border hairline bg-white px-5 py-4">
      <div className="font-mono text-[26px] leading-none tracking-tight text-ink">{v}</div>
      <div className="mt-1.5 text-[13px] font-medium">{k}</div>
      <div className="mt-0.5 text-[12.5px] leading-snug text-ink-mid">{note}</div>
    </div>
  );
}

export default async function ValuePage() {
  const access = await getAccess();

  if (!access.signedIn) {
    return (
      <main className="mx-auto max-w-3xl px-5 py-20">
        <h1 className="font-display text-[34px] tracking-tight">Is this worth it?</h1>
        <p className="readable mt-4">
          This page answers that from your own audit history, and it is willing to answer no.{' '}
          <Link href="/signin" className="text-brand hover:underline">Sign in</Link> to see it.
        </p>
      </main>
    );
  }

  const report = await buildValueReport(access.plan);

  return (
    <main className="mx-auto max-w-4xl px-5 py-14">
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-clay">the honest answer</p>
      <h1 className="mt-4 font-display text-[36px] leading-tight tracking-tight">Is this worth it?</h1>

      {!report ? (
        <p className="readable mt-6">No history yet. Run an audit and come back.</p>
      ) : (
        <>
          <Headline report={report} />

          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Tile k="Violations caught" v={String(report.violationsCaught)}
                  note={`across ${report.audits} audits in ${report.windowDays} days`} />
            <Tile k="Rules watched" v={String(report.rulesWatched)}
                  note="rules that produced at least one verdict" />
            <Tile k="Mean coverage" v={pct(report.meanCoverage)}
                  note="applicable rules that left an observable trace" />
            <Tile k="Decided by code" v={pct(report.deterministicShare)}
                  note="verdicts reached with no model call" />
          </div>

          <section className="mt-10">
            <h2 className="font-display text-[22px] tracking-tight">What it caught, day by day</h2>
            <Trend data={report.timeline} />
          </section>

          {report.decaying.length > 0 && (
            <section className="mt-10">
              <h2 className="font-display text-[22px] tracking-tight">Rules that are getting worse</h2>
              <p className="readable mt-2 text-[14px]">
                Broken more often recently than they were at the start of the window. This is the thing you
                cannot see from any single session.
              </p>
              <ul className="mt-4 space-y-2">
                {report.decaying.map((r) => (
                  <li key={r.ruleId} className="rounded-xl border hairline bg-white px-5 py-3">
                    <div className="flex items-baseline justify-between gap-4">
                      <span className="text-[14px]">{r.ruleText}</span>
                      <span className="shrink-0 font-mono text-[12px] text-clay">
                        {r.violated}/{r.runs} broken
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {report.unverifiable > 0 && (
            <p className="readable mt-8 text-[14px] text-ink-mid">
              {report.unverifiable} verdict{report.unverifiable === 1 ? ' was' : 's were'} <strong>unverifiable</strong> —
              we could not tell either way and did not guess. That is a real answer, not a gap in this number.
            </p>
          )}

          <p className="readable mt-8 text-[13px] text-skip">
            Blocked commands are not counted here. The guard writes its ledger to{' '}
            <code className="rounded bg-paper-deep px-1 py-0.5 font-mono text-[12px]">.enforcee/ledger.jsonl</code> on
            your machine and never sends it to us, so we genuinely do not know what it stopped. We would rather show
            you a smaller number that is true.
          </p>
        </>
      )}
    </main>
  );
}

function Headline({ report }: { report: ValueReport }) {
  const v = report.verdict;

  if (v.kind === 'free') {
    return (
      <p className="readable mt-6">
        You are on Free, so there is nothing to justify — auditing is unlimited here and always will be. This page
        exists for people who pay, to tell them honestly whether they should keep doing so.
      </p>
    );
  }

  if (v.kind === 'too-early') {
    return (
      <div className="mt-6 rounded-xl border hairline bg-paper-soft px-6 py-5">
        <p className="readable">
          <strong>Not enough signal yet.</strong> {v.audits} audit{v.audits === 1 ? '' : 's'} in the last{' '}
          {report.windowDays} days, and we would want at least {v.needed} before drawing a conclusion worth acting on.
          Anything we told you now would be noise dressed as a metric.
        </p>
      </div>
    );
  }

  if (v.kind === 'quiet') {
    return (
      <div className="mt-6 rounded-xl border border-honey-line bg-honey-pale px-6 py-5">
        <p className="readable">
          <strong>It has not caught anything for you.</strong> {v.audits} audits over {v.days} days and not one rule
          was broken. That is either a well-behaved setup or rules that cannot fail — and either way, you are paying
          for something that has not yet earned it.
        </p>
        <p className="readable mt-3 text-[14px]">
          Two honest options. Run{' '}
          <code className="rounded bg-white px-1 py-0.5 font-mono text-[12.5px]">enforcee health CLAUDE.md</code> to
          check whether your rules are actually checkable — a rule nothing can verify never fails, which looks
          identical to success. Or{' '}
          <Link href="/account" className="text-brand underline">cancel</Link>; auditing stays free and unlimited, and
          you can come back when your setup gets complicated enough to need watching.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-6 rounded-xl border border-clay-line bg-clay-pale px-6 py-5">
      <p className="readable">
        <strong>It caught {v.caught} thing{v.caught === 1 ? '' : 's'}</strong> in the last {report.windowDays} days —
        rules you had written down and that were broken anyway. Each one is a verdict with the quote it was decided on,
        in your history.
      </p>
    </div>
  );
}
