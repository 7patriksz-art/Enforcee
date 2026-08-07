import Link from 'next/link';

const STEPS = [
  {
    n: '01',
    t: 'Split into atomic rules',
    d: 'Your file is broken into individually addressable rules — markdown bullets, numbered items, and directive sentences in prose. Each rule gets a content-addressed id (the first 12 hex of sha256 over its normalized text), so the same rule keeps the same id across edits, files and audits.',
    tag: 'deterministic',
  },
  {
    n: '02',
    t: 'Critique the ruleset itself',
    d: 'Before any output is looked at: exact duplicates, near-duplicates, rules that contradict each other, unenforceable rules, rules buried at the bottom of a long file, and total token weight. No model call, no cost.',
    tag: 'deterministic',
  },
  {
    n: '03',
    t: 'Prove everything provable',
    d: 'Rules that a machine can decide are decided by a machine: forbidden and required literals, regex, emoji, em-dashes, word and character limits, JSON validity, markdown tables, code-fence tagging, required headings, citation presence, and output language. These verdicts are reproducible and carry a proof badge.',
    tag: 'deterministic',
  },
  {
    n: '04',
    t: 'Send only the remainder to a judge',
    d: 'Whatever code cannot decide goes to a model, several times independently. Each verdict must come with a quote copied character-for-character from the output. We then search the output for that quote. If it is not there, the verdict is thrown out and recorded as unverifiable with the evidence rejected. A model cannot pass an audit by inventing a sentence.',
    tag: 'judged',
  },
  {
    n: '05',
    t: 'Seal the receipt',
    d: 'Ruleset hash, output hash, every rule, every verdict, the method behind each one, engine versions, and the measured cost of the audit — canonicalized with sorted keys and hashed. Chain a receipt to the previous one and you get a tamper-evident history for that assistant.',
    tag: 'deterministic',
  },
];

export default function HowItWorks() {
  return (
    <main className="mx-auto max-w-4xl px-5 py-14">
      <h1 className="text-[28px] font-semibold tracking-tight">How the checking works</h1>
      <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-neutral-600">
        The obvious way to build this is to ask a model whether another model followed the rules. That is not
        verification, it is a second opinion with the same failure mode. So Enforcio does as much as possible without a
        model, and puts a hard evidence gate in front of everything else.
      </p>

      <ol className="mt-10 space-y-px overflow-hidden rounded-lg border hairline bg-paper-line">
        {STEPS.map((s) => (
          <li key={s.n} className="bg-white px-5 py-5">
            <div className="flex items-baseline gap-3">
              <span className="font-mono text-[12px] text-neutral-300">{s.n}</span>
              <h2 className="text-[15px] font-semibold tracking-tight">{s.t}</h2>
              <span
                className={
                  s.tag === 'judged'
                    ? 'rounded border border-brand/25 bg-blue-50/60 px-1.5 py-0.5 font-mono text-[10px] uppercase text-brand-deep'
                    : 'rounded border border-emerald-600/25 bg-emerald-50/60 px-1.5 py-0.5 font-mono text-[10px] uppercase text-emerald-800'
                }
              >
                {s.tag === 'judged' ? 'judged' : 'proof'}
              </span>
            </div>
            <p className="mt-2 pl-[34px] text-[13px] leading-relaxed text-neutral-600">{s.d}</p>
          </li>
        ))}
      </ol>

      <section className="mt-12">
        <h2 className="text-[18px] font-semibold tracking-tight">What Coverage actually means</h2>
        <p className="mt-2 text-[13.5px] leading-relaxed text-neutral-600">
          A pass rate is easy to game. If your ruleset says <em>never use emojis</em> and the answer has no emojis, that
          is a pass — but it is also what you would get from a model that never read the rule at all. So Enforcio tracks a
          second thing: whether the output carries any observable trace of the rule being applied.
        </p>
        <p className="mt-3 text-[13.5px] leading-relaxed text-neutral-600">
          Satisfying a positive requirement counts as a trace. Failing to do a forbidden thing usually does not, unless
          that thing has a high natural base rate — an em-dash-free answer really is evidence, because models produce em
          dashes constantly. Rules with no trace are marked <span className="font-mono text-[12px]">no signal</span>.
          Coverage is the share of applicable rules that left one. Low coverage on a long ruleset is the clearest
          available sign that your instructions are not reaching the model.
        </p>
      </section>

      <section className="mt-10 rounded-lg border hairline bg-white px-5 py-5">
        <h2 className="text-[15px] font-semibold tracking-tight">Limits, stated plainly</h2>
        <ul className="mt-3 space-y-2 text-[13px] leading-relaxed text-neutral-600">
          <li>
            Enforcio audits <strong>text</strong>. It sees what the model produced, not what was in its context window. A
            high score means the output is consistent with your rules, not that the model read them.
          </li>
          <li>
            The judged layer is a model, with a model&apos;s failure modes. The evidence gate removes fabricated support,
            not every misjudgement. That is why the agreement score across independent samples is shown on every judged
            row.
          </li>
          <li>
            Absence of a violation is weaker evidence than presence of one. Enforcio distinguishes the two rather than
            averaging them into a single reassuring number.
          </li>
        </ul>
      </section>

      <div className="mt-10">
        <Link
          href="/audit"
          className="rounded-md bg-ink px-5 py-2.5 text-[14px] font-medium text-white hover:bg-ink-soft transition-colors"
        >
          Try it on your own rules
        </Link>
      </div>
    </main>
  );
}
