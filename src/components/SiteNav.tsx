'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * The header nav, with the current page marked.
 *
 * It was seven identical grey links. Nothing told you where you were — on a site where
 * half the pages explain a different part of the same product, that is genuinely
 * disorienting, and it is the single cheapest orientation cue there is.
 *
 * Marked THREE ways, because one is never enough:
 *
 *   colour   — full-strength ink against the muted rest
 *   weight   — 500 against 400
 *   a rule   — a 2px clay underline sitting on the header's own bottom border
 *
 * Colour alone fails for the ~8% of men with a colour vision deficiency, and weight alone
 * is nearly invisible at 13.5px. The underline is the one that actually carries it, and it
 * is the accent colour rather than ink so it reads as a marker rather than as a border.
 *
 * `aria-current="page"` is the same signal for anyone who cannot see any of it.
 */
export default function SiteNav({
  items,
  variant,
}: {
  items: [string, string][];
  /** `bar` is the desktop row; `rail` is the horizontally-scrolling mobile strip. */
  variant: 'bar' | 'rail';
}) {
  const path = usePathname();

  // `/` would otherwise match every route as a prefix, and a deep page like
  // /account/billing should still light up its section.
  const isActive = (href: string) => (href === '/' ? path === '/' : path === href || path.startsWith(`${href}/`));

  if (variant === 'rail') {
    return (
      <nav className="flex gap-4 overflow-x-auto border-t hairline px-5 py-2 text-[13px] text-ink-mid md:hidden">
        {items.map(([href, label]) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={`whitespace-nowrap ${active ? 'font-semibold text-ink' : ''}`}
            >
              {label}
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <nav className="ml-auto hidden items-center gap-5 text-[13.5px] text-ink-mid md:flex">
      {items.map(([href, label]) => {
        const active = isActive(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            // `-mb-[13px] pb-[13px]` pushes the underline down onto the header's own
            // border rather than floating it under the text, so the marker reads as part
            // of the chrome. The padding is added back so the hit area does not shrink.
            className={`relative -mb-[13px] pb-[13px] transition-colors ${
              active ? 'font-medium text-ink' : 'hover:text-ink'
            }`}
          >
            {label}
            {active && (
              <span
                aria-hidden
                className="absolute inset-x-0 bottom-0 h-[2px] rounded-full bg-clay"
              />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
