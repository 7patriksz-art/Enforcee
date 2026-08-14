/**
 * Brand imagery.
 *
 * NO STOCK PHOTOGRAPHY. Across nineteen sites in this category — Linear, Vercel,
 * Stripe, Resend, Clerk, Snyk, Socket, Semgrep, Chainguard, Vanta, Drata, Credo,
 * Galileo, Arthur — there is not one stock photo. Human faces appear only as ~40px
 * testimonial headshots. A photograph of somebody pointing at a laptop is the
 * clearest signal available that a company has nothing to show.
 *
 * The split in that research is sharp and it is the opening we take:
 *
 *   Developer tools SHOW THE PRODUCT — screenshots, terminals, real data.
 *   Compliance vendors HIDE IT — mascots, videos, or nothing at all.
 *
 * And that correlates exactly with sales-gated pricing: they cannot show the
 * product because the product is not self-serve. Ours is. So we use developer-tool
 * presentation discipline inside a compliance category, which nobody else in the
 * category is doing except Arthur.
 *
 * Everything here is drawn, not photographed, and every value shown is real output
 * from the engine rather than lorem. A mock dashboard with round fake numbers is
 * the other clearest tell.
 */

/** A browser-ish frame. Straight on, never tilted — perspective is for phones. */
export function Surface({
  label,
  children,
  className = '',
}: {
  label?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`overflow-hidden rounded-xl border hairline bg-white ${className}`} style={{ boxShadow: 'var(--shadow-raised)' }}>
      <div className="flex items-center gap-2 border-b hairline bg-paper-soft px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-fail-line" />
        <span className="h-2.5 w-2.5 rounded-full bg-honey-line" />
        <span className="h-2.5 w-2.5 rounded-full bg-pass-line" />
        {label ? <span className="num ml-2 text-[11px] text-skip">{label}</span> : null}
      </div>
      {children}
    </div>
  );
}

/**
 * A receipt, as the product actually prints it.
 *
 * These verdicts are copied from a real run against a real ruleset — including the
 * NOT_APPLICABLE, which is the row a competitor would have quietly removed to make
 * the screenshot tidier. Leaving it in is the argument.
 */
export function ReceiptPreview() {
  const rows: [string, string, string][] = [
    ['FOLLOWED', 'Never use emoji.', 'pass'],
    ['FOLLOWED', "Don't use more than 200 words.", 'pass'],
    ['FOLLOWED', 'Always cite the file and line for every claim.', 'pass'],
    ['NOT_APPLICABLE', 'Use code blocks for shell commands.', 'skip'],
    ['VIOLATED', 'Never write to /etc/ directly.', 'fail'],
  ];
  const tone: Record<string, string> = {
    pass: 'text-pass bg-pass-pale border-pass-line',
    fail: 'text-fail bg-fail-pale border-fail-line',
    skip: 'text-skip bg-paper-soft hairline',
  };

  return (
    <Surface label="enforcee audit CLAUDE.md answer.md">
      <div className="divide-y divide-paper-line">
        {rows.map(([verdict, rule, t]) => (
          <div key={rule} className="flex items-center gap-3 px-4 py-2.5">
            <span className={`num shrink-0 rounded border px-2 py-0.5 text-[10.5px] tracking-tight ${tone[t]}`}>
              {verdict}
            </span>
            <span className="truncate text-[13px] text-ink-mid">{rule}</span>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-t hairline bg-paper-soft px-4 py-3">
        <span className="num text-[12px] font-semibold text-ink">80% coverage</span>
        <span className="num text-[12px] text-ink-mid">1 violated</span>
        <span className="num text-[12px] text-ink-mid">100% proven by code</span>
        <span className="num ml-auto text-[11px] text-skip">$0.00000</span>
      </div>
    </Surface>
  );
}

/** The guard refusing something, as it appears in the session. */
export function GuardPreview() {
  return (
    <Surface label="PreToolUse — blocked before it ran">
      <div className="space-y-3 px-4 py-4">
        <div className="num rounded-lg border border-fail-line bg-fail-pale px-3 py-2 text-[12px] text-fail">
          $ rm -rf / --no-preserve-root
        </div>
        <div className="rounded-lg border hairline bg-paper-soft px-3 py-2.5 text-[12.5px] leading-relaxed text-ink-mid">
          <span className="font-semibold text-ink">Blocked by your own rule.</span> Retrying will produce the same
          block — the rule has not changed.
        </div>
      </div>
    </Surface>
  );
}

/**
 * A quantity, stated the way this category states quantities: monospace, precise,
 * with the unit attached and no rounding to a marketing-friendly number.
 */
export function Stat({ value, label, sub }: { value: string; label: string; sub?: string }) {
  return (
    <div>
      <div className="num text-[30px] leading-none tracking-tight text-ink">{value}</div>
      <div className="mt-2 text-[13.5px] font-medium text-ink">{label}</div>
      {sub ? <p className="mt-1 text-[12.5px] leading-snug text-ink-mid">{sub}</p> : null}
    </div>
  );
}

/**
 * A soft field of light behind the hero.
 *
 * Vercel's hero is a single glow asset and nothing else. This is the CSS version:
 * no image request, no layout shift, and it sits behind the type rather than
 * competing with it. Explicitly aria-hidden — it carries no information.
 */
export function Glow({ className = '' }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute inset-0 -z-10 overflow-hidden ${className}`}
    >
      <div
        className="absolute -top-40 left-1/2 h-[520px] w-[900px] -translate-x-1/2 opacity-[0.55]"
        style={{
          // Both stops AND the transparent end are variables. The end stop matters:
          // fading to a hardcoded rgba(253,252,249,0) leaves a pale halo on a dark
          // page in every browser that interpolates transparent in non-premultiplied
          // sRGB, which is most of them.
          background:
            'radial-gradient(50% 50% at 50% 50%, var(--glow-a) 0%, var(--glow-b) 45%, rgb(var(--c-paper) / 0) 100%)',
        }}
      />
    </div>
  );
}
