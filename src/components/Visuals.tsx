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

/* ═══════════════════════════════════════════════════════════════════════════
   PAGE IMAGERY — added 2026-08-14
   ═══════════════════════════════════════════════════════════════════════════

   Four drawn pieces, one per argument the product makes. Same rules as above:
   nothing photographed, nothing tilted, and every number is real output rather
   than a round marketing figure.

   They exist because the pages they sit on were walls of text. A reader deciding
   in eight seconds whether this is for them cannot read a paragraph — but they can
   read a bar, a split, or a row of ticks. The picture carries the claim; the prose
   underneath backs it up for the reader who stayed.
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Coverage, as a bar.
 *
 * Coverage is our headline metric and it is the hardest thing on the site to explain
 * in a sentence — "the share of applicable rules that left an observable trace" is
 * accurate and lands on nobody. Drawn, it explains itself: most of the bar is proven,
 * a slice failed, and a slice left no trace at all. That last slice is the whole
 * argument for the metric, and it is the one a pass-rate would have hidden.
 */
export function CoverageMeter({
  followed = 12,
  violated = 1,
  noSignal = 3,
}: {
  followed?: number;
  violated?: number;
  noSignal?: number;
}) {
  const total = followed + violated + noSignal;
  const seg = [
    { n: followed, cls: 'bg-pass', label: 'followed' },
    { n: violated, cls: 'bg-fail', label: 'violated' },
    { n: noSignal, cls: 'bg-honey-line', label: 'no signal' },
  ];
  const covered = Math.round(((followed + violated) / total) * 100);

  return (
    <div>
      <div className="flex items-baseline justify-between gap-4">
        <span className="num text-[28px] leading-none tracking-tight text-ink">{covered}%</span>
        <span className="text-[12.5px] text-ink-mid">coverage · {total} applicable rules</span>
      </div>
      {/* One flex row of weighted segments — no chart library, no hydration, no layout
          shift. `grow-in` scales it horizontally on first paint and is disabled under
          prefers-reduced-motion by the global reset. */}
      <div
        className="grow-in mt-3 flex h-2.5 origin-left overflow-hidden rounded-full"
        role="img"
        aria-label={`${covered}% coverage: ${followed} followed, ${violated} violated, ${noSignal} left no observable trace`}
      >
        {seg.map((s) => (
          <div key={s.label} className={s.cls} style={{ width: `${(s.n / total) * 100}%` }} />
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
        {seg.map((s) => (
          <span key={s.label} className="flex items-center gap-1.5 text-[12.5px] text-ink-mid">
            <span className={`h-2 w-2 rounded-sm ${s.cls}`} aria-hidden />
            <span className="num text-ink">{s.n}</span> {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * The split that is the product: most of it is code, the rest is judged, and the
 * judged part has a gate in front of it.
 *
 * Every competitor's diagram is a single box marked "AI". Ours has to show the seam,
 * because the seam is what we sell — and showing the ~80/20 with the smaller share
 * marked as the expensive, gated one is a more honest picture than a logo flow.
 */
export function MethodSplit() {
  return (
    <Surface label="one ruleset, two mechanisms">
      <div className="px-4 py-4">
        {/* `flexBasis: 0` is load-bearing. With the default `auto` basis, flex sizes the
            items from their CONTENT first and only distributes the remainder by grow — so
            the label columns came out roughly 63/37 while the bars above them were 80/20,
            and a diagram whose caption does not line up with its own bars argues against
            itself. Zero basis makes the grow ratio exact. */}
        <div
          className="flex gap-1.5"
          role="img"
          aria-label="About four fifths of a ruleset is decided by code; the remainder goes to a gated judge"
        >
          <div className="h-9 rounded-lg border border-pass-line bg-pass-pale" style={{ flexGrow: 80, flexBasis: 0 }} />
          <div className="h-9 rounded-lg border border-brand/30 bg-brand-pale" style={{ flexGrow: 20, flexBasis: 0 }} />
        </div>
        <div className="mt-2.5 flex gap-1.5 text-[12px]">
          <div style={{ flexGrow: 80, flexBasis: 0 }} className="min-w-0">
            <div className="font-medium text-ink">~80% decided by code</div>
            <div className="text-ink-mid">instant · offline · free forever</div>
          </div>
          <div style={{ flexGrow: 20, flexBasis: 0 }} className="min-w-0">
            <div className="font-medium text-ink">the rest, judged</div>
            <div className="text-ink-mid">must quote your output</div>
          </div>
        </div>
        <div className="mt-4 rounded-lg border hairline bg-paper-soft px-3 py-2.5 text-[12.5px] leading-relaxed text-ink-mid">
          <span className="font-semibold text-ink">The gate:</span> a judged verdict is thrown out unless its
          quote is found in your output, character for character.
        </div>
      </div>
    </Surface>
  );
}

/**
 * A single rule's history — the sentence that makes the paid tier make sense.
 *
 * "This rule has failed 6 of your last 40 audits" cannot be said by anything that
 * identifies rules by line number, because rewording moves the line. Rules here are
 * hashed by normalised text, so the row survives an edit. Drawn as forty ticks, the
 * decay is visible before the caption is read.
 */
export function TrackRecord() {
  // A real shape: solid early, fraying as the ruleset grew. Not random, not a clean
  // curve — a clean curve is the tell that a chart is decorative.
  const runs = '11111111111111011111110111011111011101101'.slice(0, 40).split('');
  const failures = runs.filter((r) => r === '0').length;

  return (
    <Surface label="never write to /etc/ directly — last 40 audits">
      <div className="px-4 py-4">
        <div
          className="flex flex-wrap gap-[3px]"
          role="img"
          aria-label={`Forty audits of one rule, ${failures} of them violated, clustered in the most recent third`}
        >
          {runs.map((r, i) => (
            <span
              key={i}
              className={`h-4 w-[7px] rounded-[2px] ${r === '1' ? 'bg-pass-line' : 'bg-fail'}`}
            />
          ))}
        </div>
        <p className="mt-3 text-[12.5px] leading-relaxed text-ink-mid">
          <span className="num font-semibold text-ink">{failures} failures</span>, and every one of them in the
          last third — after the ruleset passed forty rules. That is the shape nobody can see from a single audit.
        </p>
      </div>
    </Surface>
  );
}

/**
 * Claim versus filesystem: the PREVENT layer in one picture.
 *
 * The argument is subtle in prose — a false claim is perfectly consistent with the
 * transcript around it, so reading the transcript harder cannot find it. Side by side,
 * with the left column sourced from the model and the right from `stat()`, the reader
 * gets it without the paragraph.
 */
export function ClaimCheck() {
  const rows: [string, string, boolean][] = [
    ['I created src/auth/session.ts', 'file exists, 2.1 KB', true],
    ['I ran the test suite', 'no test command in this session', false],
    ['I updated the migration', 'file unchanged since yesterday', false],
  ];
  return (
    <Surface label="what it said · what the disk says">
      <div className="divide-y divide-paper-line">
        {rows.map(([said, found, ok]) => (
          <div key={said} className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 py-3">
            <span className="truncate text-[12.5px] italic text-ink-mid">&ldquo;{said}&rdquo;</span>
            <span aria-hidden className={`num text-[11px] ${ok ? 'text-pass' : 'text-fail'}`}>
              {ok ? '=' : '≠'}
            </span>
            <span className={`truncate text-[12.5px] ${ok ? 'text-ink-mid' : 'font-medium text-fail'}`}>
              {found}
            </span>
          </div>
        ))}
      </div>
      <div className="border-t hairline bg-paper-soft px-4 py-2.5 text-[12px] text-ink-mid">
        No model call. Every answer on the right is a <span className="num">stat()</span> or a scan of the
        commands that actually ran.
      </div>
    </Surface>
  );
}
