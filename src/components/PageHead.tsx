/**
 * The top of every page, in one component.
 *
 * Seven pages had seven different headers — `text-[22px] font-semibold`,
 * `text-[24px]`, `text-[28px]`, some with an eyebrow and some without, body copy in
 * `text-neutral-600` rather than the reading token. Individually each was fine.
 * Together they read as seven pages built by seven people, which is the specific
 * thing that makes a small product feel unfinished.
 *
 * The fix is not to edit seven headers to match. It is to make one header and use it,
 * so the next page is consistent by default rather than by discipline. Same argument
 * as remapping Tailwind's `white`: a standard nobody has to remember is the only kind
 * that survives.
 *
 * The eyebrow is not decoration. On a page a reader arrived at from a search result,
 * it answers "where am I" before the headline has to.
 */
export default function PageHead({
  eyebrow,
  title,
  lede,
  children,
  wide = false,
}: {
  eyebrow: string;
  title: React.ReactNode;
  lede?: React.ReactNode;
  /** Actions, chips, or a visual — anything that belongs above the fold. */
  children?: React.ReactNode;
  /** Tool pages run wider than reading pages. */
  wide?: boolean;
}) {
  return (
    <header className={wide ? '' : 'max-w-3xl'}>
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-clay">{eyebrow}</p>
      <h1 className="mt-3 max-w-[24ch] font-display text-[32px] leading-[1.12] tracking-tight sm:text-[38px]">
        {title}
      </h1>
      {lede ? <p className="readable measure mt-4">{lede}</p> : null}
      {children ? <div className="mt-6">{children}</div> : null}
    </header>
  );
}
