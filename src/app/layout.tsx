import type { Metadata } from 'next';
import Link from 'next/link';
import Mark from '@/components/Mark';
import './globals.css';
import { SITE_URL } from '@/lib/site-url';
import { CONTACT_EMAIL } from '@/lib/contact';
import { THEME_INIT_SCRIPT } from '@/lib/theme';
import { softwareSchema, organizationSchema, jsonLd } from '@/lib/seo';
import ThemeToggle from '@/components/ThemeToggle';
import AccountIcon from '@/components/AccountIcon';

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
  ['/faq', 'FAQ'],
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning is required and is narrow: the inline script below
    // adds `class="dark"` to <html> before React hydrates, so the client's <html>
    // attributes legitimately differ from the server's. The warning is suppressed on
    // this ONE element and does not extend to any child.
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Runs before a single pixel is painted. Everything about why is in
            src/lib/theme.ts; the short version is that a theme applied after first
            paint means every dark-mode visitor gets a white flash on every
            navigation, and that one frame undoes a lot of "premium". */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />

        {/* Structured data. The site had none. Two audiences read it and neither reads
            prose: search engines deciding whether to show a rich result, and AI assistants
            answering "what tool checks whether my agent followed my CLAUDE.md" — which is
            increasingly how someone finds a tool in this category at all. */}
        <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(softwareSchema)} />
        <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(organizationSchema)} />
      </head>
      <body className="min-h-screen font-sans antialiased">
        <header className="sticky top-0 z-30 border-b hairline bg-paper/85 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center gap-5 px-5 py-3">
            <Link href="/" className="flex items-center gap-2.5">
              <Mark size={28} />
              <span className="font-display text-[17px] tracking-tight">Enforcee</span>
            </Link>
            <nav className="ml-auto hidden items-center gap-5 text-[13.5px] text-ink-mid md:flex">
              {NAV.map(([href, label]) => (
                <Link key={href} href={href} className="transition-colors hover:text-ink">
                  {label}
                </Link>
              ))}
            </nav>
            {/* Theme switch and CTA travel together, right-aligned at every width.
                The switch sits OUTSIDE the md:hidden nav on purpose — it is the one
                control that has to survive on a phone, where dark mode is not a
                preference so much as the default. It is also deliberately quiet:
                a bordered icon next to a solid button, so it never competes with
                the thing we actually want pressed. */}
            <div className="ml-auto flex items-center gap-2 md:ml-0">
              <ThemeToggle />
              <AccountIcon />
              <Link
                href="/audit"
                className="press rounded-lg bg-ink px-3.5 py-2 text-[13.5px] font-medium text-white hover:bg-ink-soft"
              >
                Run an audit
              </Link>
            </div>
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

        {/* Minimal, but not thin.
            Nobody credible in this category ships a two-link footer — but the sprawling
            SEO footer (20+ frameworks, 12 resource collections) belongs to companies
            selling to procurement. Four things carry almost all the trust here and cost
            nothing: the legal entity in the copyright, "Legal & Trust" as a label rather
            than "Legal", the honesty note, and a contact address that is a person.
            Deliberately absent: newsletter capture. For a product selling trust it is the
            one footer element that reads as marketing rather than infrastructure. */}
        <footer className="border-t hairline bg-paper-soft">
          <div className="mx-auto max-w-6xl px-5 py-10">
            <div className="flex flex-wrap items-start justify-between gap-x-12 gap-y-6">
              <div className="max-w-xs">
                <div className="flex items-center gap-2.5">
                  <Mark size={22} />
                  <span className="font-display text-[17px] tracking-tight">Enforcee</span>
                </div>
                <p className="mt-2 text-[13px] leading-relaxed text-ink-mid">
                  Proof that your AI followed your rules.
                </p>
              </div>

              <div className="flex flex-wrap gap-x-12 gap-y-6 text-[13px]">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.12em] text-skip">Product</div>
                  <ul className="mt-2.5 space-y-1.5 text-ink-mid">
                    <li><Link href="/audit" className="transition-colors hover:text-ink">Audit</Link></li>
                    <li><Link href="/install" className="transition-colors hover:text-ink">Install</Link></li>
                    <li><Link href="/pricing" className="transition-colors hover:text-ink">Pricing</Link></li>
                    <li><Link href="/faq" className="transition-colors hover:text-ink">Questions</Link></li>
                  </ul>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-[0.12em] text-skip">Legal &amp; Trust</div>
                  <ul className="mt-2.5 space-y-1.5 text-ink-mid">
                    <li><Link href="/privacy" className="transition-colors hover:text-ink">Privacy</Link></li>
                    <li><Link href="/terms" className="transition-colors hover:text-ink">Terms</Link></li>
                    <li><Link href="/what-is-already-free" className="transition-colors hover:text-ink">What is free</Link></li>
                    <li><a href={`mailto:${CONTACT_EMAIL}`} className="transition-colors hover:text-ink">Contact</a></li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="mt-9 flex flex-wrap items-center gap-x-5 gap-y-2 border-t hairline pt-5 font-mono text-[11px] text-skip">
              <span>© {new Date().getFullYear()} Enforcee</span>
              <span aria-hidden>·</span>
              <span>Every verdict is labelled by method. We say plainly what cannot be verified at all.</span>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
