import Link from 'next/link';

export default function Home() {
  return (
    <main>
      <section className="mx-auto max-w-6xl px-5 pt-16 pb-12">
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-skip">
          compliance layer for the rules you give your AI
        </p>
        <h1 className="mt-4 max-w-3xl text-[38px] font-semibold leading-[1.12] tracking-tight sm:text-[46px]">
          You wrote the rules. <br className="hidden sm:block" />
          Enforcio checks whether the model actually followed them.
        </h1>
        <p className="mt-5 max-w-2xl text-[15px] leading-relaxed text-neutral-600">
          Custom instructions, <code className="rounded bg-neutral-100 px-1 py-0.5 font-mono text-[13px]">CLAUDE.md</code>,
          system prompts, project rules, skills, memory files. You spend real time writing them and you have no way to
          know if any of it landed. Enforcio takes your rules and one AI output and returns a receipt: every rule, a
          verdict, the exact evidence, and a straight answer about what could not be verified.
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link
            href="/audit"
            className="rounded-md bg-ink px-5 py-2.5 text-[14px] font-medium text-white hover:bg-ink-soft transition-colors"
          >
            Audit an output
          </Link>
          <Link
            href="/how-it-works"
            className="rounded-md border hairline bg-white px-5 py-2.5 text-[14px] font-medium hover:bg-neutral-50 transition-colors"
          >
            How the checking works
          </Link>
          <span className="font-mono text-[11px] text-skip">no account needed to try it</span>
        </div>
      </section>

      <section className="border-y hairline bg-white">
        <div className="mx-auto grid max-w-6xl gap-px bg-paper-line sm:grid-cols-3">
          {[
            {
              k: 'Coverage',
              t: 'The number nobody else shows you',
              d: 'Not "did it pass" — did the output show any sign the rule was applied at all. A rule that leaves no trace was probably never read.',
            },
            {
              k: 'Two layers, never blurred',
              t: 'Proof and opinion, labelled',
              d: 'Rules a machine can check are checked by code and marked proof. The rest go to a model whose evidence quote must exist literally in the output, or its verdict is thrown away.',
            },
            {
              k: 'Receipt',
              t: 'Hash-anchored, yours to keep',
              d: 'Every audit seals into a signed JSON receipt with the ruleset hash, the output hash, and a digest over the whole thing. Change one verdict and it stops matching.',
            },
          ].map((c) => (
            <div key={c.k} className="bg-white px-5 py-7">
              <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-skip">{c.k}</div>
              <h3 className="mt-2 text-[15px] font-semibold tracking-tight">{c.t}</h3>
              <p className="mt-2 text-[13px] leading-relaxed text-neutral-600">{c.d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-14">
        <h2 className="text-[20px] font-semibold tracking-tight">What an audit tells you</h2>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ['✓', 'Followed', 'The output demonstrably complied, and here is where.', 'text-pass'],
            ['✕', 'Violated', 'The output demonstrably broke this rule, and here is where.', 'text-fail'],
            ['?', 'Unverifiable', 'We could not tell either way. We will not pretend otherwise.', 'text-unknown'],
            ['–', 'Not applicable', 'The rule had a trigger condition that never fired.', 'text-skip'],
          ].map(([glyph, title, desc, cls]) => (
            <div key={title} className="rounded-lg border hairline bg-white px-4 py-4">
              <div className={`font-mono text-[20px] leading-none ${cls}`}>{glyph}</div>
              <div className="mt-2.5 text-[14px] font-semibold">{title}</div>
              <p className="mt-1 text-[12.5px] leading-relaxed text-neutral-600">{desc}</p>
            </div>
          ))}
        </div>

        <div className="mt-10 rounded-lg border hairline bg-white px-5 py-5">
          <h3 className="text-[15px] font-semibold tracking-tight">Before you even run an output through it</h3>
          <p className="mt-2 max-w-3xl text-[13px] leading-relaxed text-neutral-600">
            Enforcio reads your ruleset on its own and tells you what is wrong with it — duplicated rules, rules that
            contradict each other, rules so vague that no audit could ever pass or fail them, and rules buried so deep in
            the file that attention has already faded by the time the model reaches them. That check costs nothing and
            uses no model at all.
          </p>
        </div>
      </section>
    </main>
  );
}
