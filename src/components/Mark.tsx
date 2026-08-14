/**
 * The Enforcee mark, in one place.
 *
 * The header drew `<span>E</span>` in a rounded black box. The favicon is a ruled document
 * with a checked seal. They were two different logos — one in the browser tab, one on the
 * page, three centimetres apart, and nobody noticed for a week because you never see them
 * in the same glance.
 *
 * This is the same path data as `src/app/icon.svg`, which is what the tab, the OG card and
 * the email templates use. Inline rather than an `<img src="/icon.svg">` so it renders in
 * the same paint as the text beside it — a logo that pops in one frame late is the cheapest
 * possible way to look unfinished.
 *
 * `currentColor` is deliberately NOT used. This mark is a solid ink tile with a clay seal;
 * it is a fixed object, not an icon that tints with its surroundings, and it must read the
 * same on a light page, a dark page and inside an inverted panel. What DOES follow the theme
 * is the tile — `--c-ink` and `--c-paper`, so it inverts with everything else.
 */
export default function Mark({ size = 28, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={`shrink-0 ${className}`}
      role="img"
      aria-label="Enforcee"
    >
      <rect width="64" height="64" rx="14" fill="rgb(var(--c-ink))" />
      <path
        d="M20 19h24M20 32h17M20 45h24"
        stroke="rgb(var(--c-paper))"
        strokeWidth="6"
        strokeLinecap="round"
      />
      {/* The seal stays clay in both themes — it is the one fixed brand colour, and the
          thing that makes the mark recognisable at 16px in a tab strip. */}
      <circle cx="46" cy="45" r="10" fill="rgb(var(--c-clay))" />
      <path
        d="M41.5 45.2l3.2 3.2 6-6.4"
        stroke="rgb(var(--c-paper))"
        strokeWidth="3.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}
