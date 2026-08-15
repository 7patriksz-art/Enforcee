'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * Settings navigation: a sidebar list, not horizontal tabs.
 *
 * Tabs stop scaling past about five sections and read cheap the moment they wrap. Every
 * premium account area in this category — Vercel, Stripe, Linear, Sentry — uses a nav rail
 * plus a settings sub-list.
 *
 * ── The hints are gone, and an icon replaced them ────────────────────────────
 *
 * Each row used to carry a second line: "Plan, licence, what you can do", "Audits this
 * period", "Invoices and payment". They described the word directly above them. A reader
 * who does not know what "Billing" means is not helped by "Invoices and payment"; a reader
 * who does has been made to read four lines to find one.
 *
 * The icon does the work the hint was pretending to do — it is scanned rather than read,
 * so it costs no reading time at all, and it gives the eye something to aim at when
 * returning to a page it has visited before. That is the actual job of a nav hint, and
 * text was always the wrong material for it.
 *
 * Each glyph is drawn from the section's own subject rather than picked from a set:
 * a card for billing, a bar for usage, a shield for data. `aria-hidden` on all of them —
 * the label is right there, and announcing "shield, Data & privacy" is noise.
 */

const ICON = 'h-[15px] w-[15px] shrink-0';

const SECTIONS = [
  {
    href: '/account',
    label: 'Overview',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={ICON} aria-hidden>
        <rect x="3" y="3" width="7.5" height="7.5" rx="1.5" />
        <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" />
        <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" />
        <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" />
      </svg>
    ),
  },
  {
    href: '/account/usage',
    label: 'Usage',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={ICON} aria-hidden>
        <path d="M4 20V13M10 20V8M16 20v-5M22 20V4" />
      </svg>
    ),
  },
  {
    href: '/account/billing',
    label: 'Billing',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={ICON} aria-hidden>
        <rect x="2.5" y="5" width="19" height="14" rx="2.5" />
        <path d="M2.5 10h19" />
      </svg>
    ),
  },
  {
    href: '/account/data',
    label: 'Data',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={ICON} aria-hidden>
        <path d="M12 2.8l7.5 3v6c0 4.4-3 8.2-7.5 9.4-4.5-1.2-7.5-5-7.5-9.4v-6z" />
      </svg>
    ),
  },
];

export default function AccountNav() {
  const path = usePathname();
  return (
    <nav aria-label="Account sections" className="lg:sticky lg:top-24">
      <ul className="space-y-0.5">
        {SECTIONS.map((s) => {
          const active = path === s.href;
          return (
            <li key={s.href}>
              <Link
                href={s.href}
                aria-current={active ? 'page' : undefined}
                className={`press flex items-center gap-2.5 rounded-lg px-3 py-2 text-[14px] font-medium ${
                  active ? 'bg-ink text-white' : 'text-ink-mid hover:bg-paper-deep hover:text-ink'
                }`}
              >
                {s.icon}
                {s.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
