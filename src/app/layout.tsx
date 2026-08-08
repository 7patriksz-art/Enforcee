import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';
import { SITE_URL } from '@/lib/site-url';
import { CONTACT_EMAIL } from '@/lib/contact';

const TITLE = 'Enforcee — stop fighting your own AI';
const DESCRIPTION =
  'Enforcee tells you which of your rules the model actually followed, rule by rule, with the exact quote — and blocks the ones it can stop before they run.';

export const metadata: Metadata = {
  // Without metadataBase, Next resolves the OG card against http://localhost:3000 and every
  // social preview ships a broken image. We get one Show HN; it should not look like that.
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  openGraph: { title: TITLE, description: DESCRIPTION, url: SITE_URL, siteName: 'Enforcee', type: 'website' },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION },
};

const NAV = [
  ['/install', 'Install'],
  ['/learn', 'Learn'],
  ['/enforce', 'Enforce'],
  ['/session', 'Sessions'],
  ['/pricing', 'Pricing'],
  ['/how-it-works', 'How it works'],
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans antialiased">
        <header className="sticky top-0 z-30 border-b hairline bg-paper/85 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center gap-5 px-5 py-3">
            <Link href="/" className="flex items-center gap-2.5">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-ink text-[13px] font-bold text-white">E</span>
              <span className="font-display text-[17px] tracking-tight">Enforcee</span>
            </Link>
            <nav className="ml-auto hidden items-center gap-5 text-[13.5px] text-ink-mid md:flex">
              {NAV.map(([href, label]) => (
                <Link key={href} href={href} className="transition-colors hover:text-ink">
                  {label}
                </Link>
              ))}
            </nav>
            <Link
              href="/audit"
              className="ml-auto rounded-lg bg-ink px-3.5 py-2 text-[13.5px] font-medium text-white transition-colors hover:bg-ink-soft md:ml-0"
            >
              Run an audit
            </Link>
          </div>
          <nav className="flex gap-4 overflow-x-auto border-t hairline px-5 py-2 text-[13px] text-ink-mid md:hidden">
            {NAV.map(([href, label]) => (
              <Link key={href} href={href} className="whitespace-nowrap">
                {label}
              </Link>
            ))}
          </nav>
        </header>

        {children}

        <footer className="border-t hairline bg-paper-soft">
          <div className="mx-auto max-w-6xl px-5 py-10">
            <div className="flex flex-wrap items-start justify-between gap-x-10 gap-y-4">
              <div className="max-w-sm">
                <div className="font-display text-[17px] tracking-tight">Enforcee</div>
                <p className="mt-2 text-[13px] leading-relaxed text-ink-mid">
                  An audit and enforcement layer for the rules you give your AI. Deterministic where it can be, honest
                  where it cannot.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-4 text-[12.5px] text-ink-mid">
                <Link href="/account" className="transition-colors hover:text-ink">Account</Link>
                <Link href="/privacy" className="transition-colors hover:text-ink">Privacy</Link>
                <Link href="/terms" className="transition-colors hover:text-ink">Terms</Link>
                <a href={`mailto:${CONTACT_EMAIL}`} className="transition-colors hover:text-ink">Contact</a>
              </div>
            </div>
            <p className="mt-8 max-w-3xl border-t hairline pt-5 font-mono text-[11px] leading-relaxed text-skip">
              Every verdict is labelled by method. Deterministic checks are reproducible proofs. Judged checks are model
              opinions whose evidence quote was verified against the source text, or discarded. We show you which is
              which, and we say plainly what cannot be verified at all.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
