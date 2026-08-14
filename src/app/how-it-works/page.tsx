import Link from 'next/link';
import PageHead from '@/components/PageHead';
import { MethodSplit, CoverageMeter } from '@/components/Visuals';

const STEPS = [
  {
    n: '00',
    t: 'Check what your rules assume, before anything runs',
    d: 'A rule that tells the agent to run a tool is worthless if the tool is not installed — the command returns nothing, and nothing is indistinguishable from a clean result. Preflight reads the tools, files and variables your rules depend on straight out of the rules themselves, and reports a missing one as its own outcome rather than as a finding. It also refuses to trust a negative unless a positive control passed in the same run: if the instrument cannot answer a question we already know the answer to, it did not find nothing — it failed.',
    tag: 'free',
  },
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
    d: 'Whatever code cannot decide goes to a model, several times independently. Each verdict must come with a quote of at least ten characters taken from the output, and we then locate that quote in the output ourselves, tolerating only ordinary differences in spaces and line breaks. If we cannot find it, the verdict is thrown out and recorded as unverifiable. Stated precisely, because the distinction matters: this makes it impossible to pass an audit by inventing a sentence. It does not by itself prove the sentence a model cited was the most relevant one — so the quote is always shown to you, in place, to judge for yourself.',
    tag: 'judged',
  },
  {
    n: '05',
    t: 'Seal the receipt',
    d: 'Ruleset hash, output hash, every rule, every verdict, the method behind each one, engine versions, and the measured cost of the audit — canonicalized with sorted keys and hashed. Chain a receipt to the previous one and you get a tamper-evident history for that assistant.',
    tag: 'deterministic',
  },
  {
    n: '06',
    t: 'Check what it said it did',
    // The closing statistic was our most load-bearing external number and it carried no
    // source at all. Re-read from the paper on 2026-08-14 and corrected twice over:
    //
    //   · WRONG DENOMINATOR. "22.58% of failures across 20,574 sessions" implied the
    //     sessions were the base. Table 2's percentages are over the 16,118 episodes that
    //     survived validation — "validation retained 16,118 of 29,896 episodes (53.9%)".
    //   · UNDERSTATED FOR OUR OWN AUDIENCE. Table 2 splits by surface: 20.36% IDE,
    //     26.66% CLI. Enforcee's users are CLI users. The honest number for them is the
    //     higher one, and quoting the blended figure was quietly selling ourselves short.
    //
    // Now cited inline, because an uncited number on a page arguing for evidence is the
    // exact thing this product exists to catch.
    d: 'The last step is the one nothing else does. Every agent-observability tool evaluates the transcript, and the transcript is the model\'s own account of itself — a false claim lives inside it and is perfectly consistent with everything around it. So we read somewhere else. It said it created a file: does the file exist? It said the tests pass: was a test command run at all? Each answer is a stat() or a scan of the commands that actually executed. No model call, no judgement.',
    tag: 'free',
    cite: {
      text: 'In an observational study of 20,574 real coding sessions across 1,639 repositories, inaccurate self-reporting appears in 22.58% of validated misalignment episodes — and 26.66% of them on the command line, where Enforcee runs.',
      label: 'arXiv 2605.29442, Table 2',
      url: 'https://arxiv.org/abs/2605.29442',
    },
  },
];

export default function HowItWorks() {
  return (
    <main className="mx-auto max-w-4xl px-5 py-14">
      <PageHead
        eyebrow="the mechanism"
        title="How the checking works"
        lede={
          <>
            The obvious way to build this is to ask a model whether another model followed the rules. That is not
            verification — it is a second opinion with the same failure mode. So Enforcee decides as much as it can
            without a model, and puts a hard evidence gate in front of the rest.
          </>
        }
      />

      {/* The whole page in one picture, above the six steps that explain it. A reader
          who leaves after eight seconds should still take away the one thing that
          distinguishes this from "ask a model to check the model". */}
      <div className="mt-8 max-w-xl">
        <MethodSplit />
      </div>

      <ol className="mt-10 space-y-px overflow-hidden rounded-lg border hairline bg-paper-line">
        {STEPS.map((s) => (
          <li key={s.n} className="bg-white px-5 py-5">
            <div className="flex items-baseline gap-3">
              <span className="font-mono text-[12px] text-ink-light">{s.n}</span>
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
            {/* A sourced number is set apart from the prose and carries its link inline.
                Buried in a paragraph, a statistic reads as rhetoric; given its own block with
                the citation attached, it reads as evidence — which is the entire argument of
                this page, applied to the page. */}
            {s.cite ? (
              <figure className="ml-[34px] mt-3 rounded-lg border border-clay-line bg-clay-pale px-4 py-3">
                <p className="text-[13px] leading-relaxed text-ink">{s.cite.text}</p>
                <figcaption className="mt-1.5">
                  <a
                    href={s.cite.url}
                    target="_blank"
                    rel="noreferrer"
                    className="num text-[11px] text-clay underline underline-offset-4"
                  >
                    {s.cite.label}
                  </a>
                </figcaption>
              </figure>
            ) : null}
          </li>
        ))}
      </ol>

      <section className="mt-12">
        <h2 className="font-display text-[22px] tracking-tight">What Coverage actually means</h2>

        {/* The metric, drawn, before it is defined. The amber slice is the argument —
            it is the part a pass-rate would have counted as success. */}
        <div className="mt-5 max-w-md rounded-2xl border hairline bg-white px-5 py-5">
          <CoverageMeter />
        </div>

        <p className="readable mt-5 text-[14px]">
          A pass rate is easy to game. If your ruleset says <em>never use emojis</em> and the answer has no emojis, that
          is a pass — but it is also what you would get from a model that never read the rule at all. So Enforcee tracks a
          second thing: whether the output carries any observable trace of the rule being applied.
        </p>
        <p className="readable mt-3 text-[14px]">
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
            Enforcee audits <strong>text</strong>. It sees what the model produced, not what was in its context window. A
            high score means the output is consistent with your rules, not that the model read them.
          </li>
          <li>
            The judged layer is a model, with a model&apos;s failure modes. The evidence gate removes fabricated support,
            not every misjudgement. That is why the agreement score across independent samples is shown on every judged
            row.
          </li>
          <li>
            Absence of a violation is weaker evidence than presence of one. Enforcee distinguishes the two rather than
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
