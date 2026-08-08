import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'Enforcio — proof your AI followed your rules',
  description:
    'Enforcio audits an AI output against your own rules and returns a receipt: every rule, a verdict, the evidence, and how it was checked.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans antialiased">
        <header className="border-b hairline bg-white/70 backdrop-blur sticky top-0 z-20">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3">
            <Link href="/" className="flex items-center gap-2.5 group">
              <span className="grid h-7 w-7 place-items-center rounded-[7px] bg-ink text-[13px] font-bold text-white">E</span>
              <span className="text-[15px] font-semibold tracking-tight">Enforcio</span>
              <span className="rounded border hairline px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-skip">
                mvp
              </span>
            </Link>
            <nav className="flex items-center gap-5 text-[13px] text-skip">
              <Link href="/enforce" className="hover:text-ink transition-colors">
                Enforce
              </Link>
              <Link href="/session" className="hover:text-ink transition-colors">
                Session evidence
              </Link>
              <Link href="/how-it-works" className="hover:text-ink transition-colors">
                How it works
              </Link>
              <Link href="/history" className="hover:text-ink transition-colors">
                History
              </Link>
              <Link
                href="/audit"
                className="rounded-md bg-ink px-3 py-1.5 text-[13px] font-medium text-white hover:bg-ink-soft transition-colors"
              >
                Run an audit
              </Link>
            </nav>
          </div>
        </header>
        {children}
        <footer className="mt-24 border-t hairline">
          <div className="mx-auto max-w-6xl px-5 py-8 font-mono text-[11px] leading-relaxed text-skip">
            <p>Enforcio · an audit layer for the rules you give your AI.</p>
            <p className="mt-1">
              Verdicts are labelled by method. Deterministic checks are reproducible proofs. Judged checks are model
              opinions with evidence spans verified against the source text. We show you which is which.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
