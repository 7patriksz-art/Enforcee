'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * Settings navigation: a sidebar list, not horizontal tabs.
 *
 * Tabs stop scaling past about five sections and read cheap the moment they wrap.
 * Every premium account area in this category — Vercel, Stripe, Linear, Sentry —
 * uses a nav rail plus a settings sub-list, and it is the single clearest
 * structural difference between an account page that feels like a product and one
 * that feels like a form.
 */
const SECTIONS = [
  { href: '/account', label: 'Overview', hint: 'Plan, licence, what you can do' },
  { href: '/account/usage', label: 'Usage', hint: 'Audits this period' },
  { href: '/account/billing', label: 'Billing', hint: 'Invoices and payment' },
  { href: '/account/data', label: 'Data & privacy', hint: 'Export, delete, DPA' },
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
                className={`press block rounded-lg px-3 py-2.5 ${
                  active ? 'bg-ink text-white' : 'text-ink-mid hover:bg-paper-deep hover:text-ink'
                }`}
              >
                <span className="block text-[14px] font-medium">{s.label}</span>
                <span className={`block text-[12px] leading-snug ${active ? 'text-white/60' : 'text-skip'}`}>
                  {s.hint}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
