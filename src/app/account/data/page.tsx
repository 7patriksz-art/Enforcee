import Link from 'next/link';
import { getAccess } from '@/lib/entitlements';
import { CONTACT_EMAIL } from '@/lib/contact';

export const dynamic = 'force-dynamic';

/**
 * Data & privacy.
 *
 * The premium account areas in this category all expose export, deletion and the
 * legal documents as a first-class section rather than burying them inside a
 * privacy policy. Vercel labels the whole group "Legal & Trust". It costs almost
 * nothing to build and it is the single highest trust-per-effort thing on the page,
 * because the question it answers — *can I leave, and what happens to my data* — is
 * the one every buyer asks and almost nobody puts in writing.
 */
export default async function DataPage() {
  const access = await getAccess();

  if (!access.signedIn) {
    return (
      <p className="readable measure">
        <Link href="/signin" className="text-brand underline underline-offset-4">Sign in</Link> to see what is held
        against your account.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border hairline bg-white">
        <div className="border-b hairline px-5 py-3.5 text-[14px] font-semibold">What we hold</div>
        <ul className="divide-y hairline text-[13.5px]">
          {[
            ['Your email', access.email ?? '—', 'For sign-in and receipts. Never sold, never used for marketing.'],
            ['Subscription state', access.plan, 'Plan, status and paid-through date, written by Stripe.'],
            ['Audit receipts', 'Only if you are signed in when you run one', 'Verdicts and rule text. Never your source code.'],
          ].map(([k, v, why]) => (
            <li key={k} className="px-5 py-3.5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <span className="font-medium text-ink">{k}</span>
                <span className="num text-[12px] text-ink-mid">{v}</span>
              </div>
              <p className="mt-1 text-[12.5px] leading-relaxed text-ink-mid">{why}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border hairline bg-white">
        <div className="border-b hairline px-5 py-3.5 text-[14px] font-semibold">What never leaves your machine</div>
        <div className="px-5 py-4">
          <p className="readable text-[13.5px]">
            The CLI and the guard make no network call at all on the free paths. Your transcripts, your rulesets and
            your code are read locally and never uploaded. That is enforced by a check in our release pipeline that
            stubs the network and fails the build if a free audit opens a socket.
          </p>
          <Link href="/what-is-already-free" className="mt-3 inline-block text-[13.5px] text-brand underline underline-offset-4">
            What runs without an account
          </Link>
        </div>
      </section>

      <section className="rounded-2xl border hairline bg-white">
        <div className="border-b hairline px-5 py-3.5 text-[14px] font-semibold">Legal &amp; trust</div>
        <ul className="divide-y hairline">
          {[
            ['Privacy policy', '/privacy'],
            ['Terms', '/terms'],
          ].map(([label, href]) => (
            <li key={href}>
              <Link href={href} className="press flex items-center justify-between px-5 py-3 text-[13.5px] hover:bg-paper-soft">
                <span>{label}</span>
                <span aria-hidden className="text-skip">→</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* Deletion is as prominent as upgrading. A cancel path that is harder to find
          than the buy path is the thing people screenshot and post about. */}
      <section className="rounded-2xl border border-fail-line bg-fail-pale px-5 py-5">
        <div className="text-[14px] font-semibold text-ink">Export or delete everything</div>
        <p className="readable mt-2 text-[13.5px]">
          Email us and it is done the same day — a copy of everything held against your account, or its deletion.
          Deleting removes your account, your subscription and your stored receipts. Auditing keeps working
          afterwards, because it never needed an account.
        </p>
        <a
          href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('Data request')}`}
          className="press mt-4 inline-block rounded-xl border border-ink/15 bg-white px-4 py-2.5 text-[13.5px] font-medium hover:border-ink/30"
        >
          Email {CONTACT_EMAIL}
        </a>
      </section>
    </div>
  );
}
