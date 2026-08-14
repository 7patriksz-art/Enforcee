import type { Metadata } from 'next';
import AccountNav from './AccountNav';

export const metadata: Metadata = { title: 'Account — Enforcee' };

/**
 * The account shell.
 *
 * One layout, four sections, a persistent sidebar. The alternative — a single long
 * page with everything on it — is what most small products ship, and it is exactly
 * why they feel like a settings form rather than somewhere you manage a
 * relationship with a company that has your card details.
 */
export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-6xl px-5 py-12">
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-clay">account</p>
      <h1 className="mt-3 font-display text-[32px] tracking-tight">Your account</h1>
      <p className="readable measure mt-3 text-[15px]">
        Everything we hold, what you are paying for, and how to leave with your data. No section here needs an
        email to us.
      </p>

      <div className="mt-9 grid gap-8 lg:grid-cols-[210px_1fr]">
        <AccountNav />
        <div className="min-w-0">{children}</div>
      </div>
    </main>
  );
}
