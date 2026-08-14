import Link from 'next/link';
import { getAccess } from '@/lib/entitlements';
import { planById } from '@/lib/plans';
import { CONTACT_EMAIL } from '@/lib/contact';

export const dynamic = 'force-dynamic';

/**
 * Billing.
 *
 * Full page, never a modal. Billing in a dialog is one of the clearest cheap tells
 * in this category, and it is also just worse: a customer wants to read, compare and
 * think, and a modal signals that they should hurry.
 *
 * The bar for the top card is that it answers "what am I on, what will I pay next,
 * and when" without a single click.
 */
export default async function BillingPage() {
  const access = await getAccess();

  if (!access.signedIn) {
    return (
      <p className="readable measure">
        <Link href="/signin" className="text-brand underline underline-offset-4">Sign in</Link> to see billing for
        your account.
      </p>
    );
  }

  const plan = planById(access.plan)!;
  const paid = access.plan !== 'free';

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-ink bg-white px-5 py-5" style={{ boxShadow: 'var(--shadow-raised)' }}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-clay">current plan</div>
            <div className="mt-1.5 font-display text-[26px] tracking-tight">{plan.name}</div>
          </div>
          {access.trialing && (
            <span className="rounded-full bg-honey-pale px-2.5 py-1 font-mono text-[10px] uppercase tracking-wide text-honey">
              trialing
            </span>
          )}
        </div>

        <dl className="mt-5 grid gap-4 border-t hairline pt-4 sm:grid-cols-3">
          {[
            ['Next charge', paid ? `$${plan.price.monthly}/mo` : 'nothing, ever'],
            [
              paid ? 'Paid through' : 'Expires',
              paid
                ? access.periodEnd
                  ? new Date(access.periodEnd * 1000).toISOString().slice(0, 10)
                  : 'not recorded yet'
                : 'never',
            ],
            ['Account', access.email ?? '—'],
          ].map(([k, v]) => (
            <div key={k}>
              <dt className="text-[12px] text-ink-mid">{k}</dt>
              <dd className="num mt-1 truncate text-[14px] text-ink">{v}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="rounded-2xl border hairline bg-white px-5 py-5">
        <div className="text-[14px] font-semibold">Invoices</div>
        <p className="readable mt-2 text-[13.5px]">
          Stripe emails a receipt for every payment to {access.email ?? 'your account email'}, and each one links to a
          downloadable PDF. We do not hold your card details at any point — Stripe does.
        </p>
      </section>

      {/* Documented as prominently as upgrading, and with what actually happens. */}
      <section className="rounded-2xl border hairline bg-paper-soft px-5 py-5">
        <div className="text-[14px] font-semibold">Changing or cancelling</div>
        <p className="readable mt-2 text-[13.5px]">
          Email <a href={`mailto:${CONTACT_EMAIL}`} className="text-brand underline underline-offset-4">{CONTACT_EMAIL}</a>{' '}
          and it is done the same day. You keep everything you paid for until the end of the period, your issued
          licence keeps working until it expires, and auditing keeps working forever because it never needed an
          account.
        </p>
        <Link href="/pricing" className="press mt-4 inline-block rounded-xl border border-ink/15 bg-white px-4 py-2.5 text-[13.5px] font-medium hover:border-ink/30">
          Compare plans
        </Link>
      </section>
    </div>
  );
}
