import clsx from 'clsx';

/**
 * The pipeline from your prompt to the model's output, and the three places Enforcee
 * touches it. The point of the drawing is the middle: everything between "rules loaded"
 * and "output" is unobservable to you, and that is where the damage happens.
 */

interface Stage {
  n: string;
  title: string;
  body: string;
  who: 'you' | 'model' | 'blind';
}

const STAGES: Stage[] = [
  { n: '1', title: 'You write the rules', body: 'CLAUDE.md, a system prompt, custom instructions, skills, MCP config. Hours of your life.', who: 'you' },
  { n: '2', title: 'The session loads them', body: 'Your rules join the system prompt, alongside tool schemas, memory, skill listings and file contents.', who: 'model' },
  { n: '3', title: 'You ask for something', body: 'Your actual prompt is a rounding error next to everything already in the window.', who: 'you' },
  { n: '4', title: 'Attention gets divided', body: 'Every rule now competes with every other token for finite attention. Some win. Some do not.', who: 'blind' },
  { n: '5', title: 'It acts', body: 'Tool calls run. Files are written. Commands execute. Rules either held here or they did not.', who: 'blind' },
  { n: '6', title: 'You get an output', body: 'It looks fine. It usually is fine. You have no way to tell which rules survived the trip.', who: 'you' },
];

const TOUCH = [
  {
    at: 1,
    label: 'Learn',
    verb: 'before',
    body: 'Reads what you already said and turns it into rules. Flags contradictions, duplicates and rules too vague to ever check.',
  },
  {
    at: 4,
    label: 'Enforce',
    verb: 'during',
    body: 'A hook that denies a forbidden tool call before it runs, and puts your rules back into context the moment compaction drops them.',
  },
  {
    at: 6,
    label: 'Verify',
    verb: 'after',
    body: 'A receipt: every rule, a verdict, the exact quote. Plus the rules that left no trace at all.',
  },
];

export default function Funnel() {
  return (
    <div className="rounded-2xl border hairline bg-white/70 p-5 sm:p-7">
      <div className="mb-6 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h3 className="font-display text-[21px] tracking-tight">What actually happens to your rules</h3>
        <span className="font-mono text-[11px] text-skip">prompt → output, and the part nobody shows you</span>
      </div>

      <div className="relative">
        {/* The spine. */}
        <div className="absolute left-[15px] top-2 bottom-2 w-px bg-paper-line sm:left-0 sm:right-0 sm:top-[27px] sm:h-px sm:w-auto sm:bottom-auto" />

        <ol className="relative grid gap-5 sm:grid-cols-6 sm:gap-3">
          {STAGES.map((s) => (
            <li key={s.n} className="stage relative flex gap-3 sm:block">
              <div
                className={clsx(
                  'relative z-10 grid h-8 w-8 shrink-0 place-items-center rounded-full border-2 font-mono text-[12px] font-semibold',
                  s.who === 'you' && 'border-ink bg-ink text-white',
                  s.who === 'model' && 'border-paper-line bg-white text-ink-mid',
                  s.who === 'blind' && 'border-clay bg-clay text-white'
                )}
              >
                {s.n}
              </div>
              <div
                className={clsx(
                  'stage-card mt-0 rounded-xl border px-3 py-2.5 transition-colors sm:mt-3',
                  s.who === 'blind' ? 'border-clay-line bg-clay-pale' : 'hairline bg-paper-soft/60'
                )}
              >
                <div className="text-[13px] font-semibold leading-snug">{s.title}</div>
                <p className="mt-1 text-[12.5px] leading-relaxed text-ink-mid">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>

      <div className="mt-6 rounded-xl border border-clay-line bg-clay-pale px-4 py-3">
        <p className="text-[14px] leading-relaxed text-ink">
          Steps 4 and 5 are the whole problem. <span className="hi hi-clay font-semibold">You cannot see them, and neither can any tool you currently own.</span>{' '}
          The model does not error when it skips rule 11. It just quietly writes something slightly wrong, and you find
          out three commits later.
        </p>
      </div>

      <div className="mt-6">
        <div className="mb-3 font-mono text-[11px] uppercase tracking-[0.12em] text-skip">where enforcee sits</div>
        <div className="grid gap-3 sm:grid-cols-3">
          {TOUCH.map((t) => (
            <div key={t.label} className="rounded-xl border border-honey-line bg-honey-pale/50 px-4 py-3">
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-[10px] uppercase tracking-wide text-honey">{t.verb} step {t.at}</span>
              </div>
              <div className="mt-1 font-display text-[17px] tracking-tight">{t.label}</div>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-mid">{t.body}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
