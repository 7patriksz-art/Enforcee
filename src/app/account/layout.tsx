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
      {/* The eyebrow said "account" directly above a heading that said "Your account",
          above a sentence listing the four things the nav already lists. Three ways of
          saying the same thing before any content. All that survives is the heading. */}
      <h1 className="font-display text-[32px] tracking-tight">Your account</h1>

      <div className="mt-8 grid gap-8 lg:grid-cols-[190px_1fr]">
        <AccountNav />
        <div className="min-w-0">{children}</div>
      </div>
    </main>
  );
}
