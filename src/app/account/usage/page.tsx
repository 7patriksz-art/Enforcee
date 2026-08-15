import Link from 'next/link';
import { getAccess } from '@/lib/entitlements';

export const dynamic = 'force-dynamic';

/**
 * Usage.
 *
 * The rule this page follows: SHOW THE METER BEFORE THE WALL. A limit a customer
 * discovers by hitting it is a support ticket; a limit they can watch approaching is
 * a decision they get to make. Vercel fires alerts at 50/75/100%, Sentry drops
 * over-quota events rather than billing for them so a surprise invoice is
 * structurally impossible.
 *
 * Ours is simpler than either, because auditing is unlimited and free on every plan.
 * Saying that plainly, on the page where a customer expects to find a counter
 * counting down, is worth more than a chart.
 */
export default async function UsagePage() {
  const access = await getAccess();

  if (!access.signedIn) {
    return (
      <p className="readable measure">
        <Link href="/signin" className="text-brand underline underline-offset-4">Sign in</Link> to see your usage.
      </p>
    );
  }

  const e = access.entitlements;

  return (
    <div className="space-y-5">
      {/* Was a heading plus a four-clause paragraph saying "nothing is metered" four
          different ways. The table below already says Audits · Unlimited. One line. */}
      <p className="readable measure">
        Nothing here is metered. Paid plans unlock capabilities, never volume.
      </p>

      <section className="rounded-2xl border hairline bg-white">
        <div className="border-b hairline px-5 py-3.5 text-[14px] font-semibold">Limits that do exist</div>
        <ul className="divide-y hairline text-[13.5px]">
          {[
            ['Audits', 'Unlimited', true],
            ['Rules per ruleset', 'Unlimited', true],
            ['History retained', e.historyDays > 0 ? `${e.historyDays} days` : 'Not kept on this plan', e.historyDays > 0],
            ['Projects', e.projects === 0 ? 'Not on this plan' : Number.isFinite(e.projects) ? String(e.projects) : 'Unlimited', e.projects !== 0],
            ['Rules learned from conversation', Number.isFinite(e.learnLimit) ? `First ${e.learnLimit}` : 'Unlimited', true],
          ].map(([k, v, on]) => (
            <li key={String(k)} className="flex items-center gap-4 px-5 py-3">
              <span className="text-ink-mid">{k}</span>
              <span className={`num ml-auto text-[12px] ${on ? 'text-ink' : 'text-skip'}`}>{v}</span>
            </li>
          ))}
        </ul>
      </section>

      {access.plan !== 'free' && (
        <Link href="/value" className="lift block rounded-2xl border border-clay-line bg-clay-pale px-5 py-4">
          <div className="text-[13.5px] font-semibold">Is this worth it?</div>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-mid">
            What it has caught, from your own history — including if the answer is nothing.
          </p>
        </Link>
      )}
    </div>
  );
}
