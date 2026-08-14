import Link from 'next/link';
import Funnel from '@/components/Funnel';

/**
 * Homepage.
 *
 * Rewritten 2026-08-14 on Patrik's brief: "all the pages are way too text heavy… make the
 * sequencing the segments more friendly and less overwhelming… feels less AI… don't make
 * features or buttons competing with each other… digestable for amateurs as well."
 *
 * Rules applied here, in case a future session is tempted to add another paragraph:
 *  - ONE primary action per screenful. Everything else is a text link.
 *  - No paragraph longer than three lines. If it needs more, it belongs on its own page.
 *  - Four cards maximum in a grid. Eight is a wall, and a wall is skipped.
 *  - Contractions, short sentences, varied rhythm. Not every line has to land a point.
 *  - Show the thing before explaining it.
 */
export default function Home() {
  return (
    <main>
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-5 pt-16 pb-14 sm:pt-24">
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-clay">
          rule checking for AI coding agents
        </p>

        <h1 className="mt-5 max-w-[17ch] font-display text-[42px] leading-[1.08] tracking-[-0.02em] sm:text-[58px]">
          Did it actually follow your rules?
        </h1>

        <p className="readable mt-6 max-w-[54ch] text-[17px]">
          You wrote a <code className="rounded bg-paper-deep px-1.5 py-0.5 font-mono text-[15px]">CLAUDE.md</code>.
          You&rsquo;ve rewritten it twice since. Nobody has ever told you whether it worked.
        </p>

        <p className="readable mt-4 max-w-[54ch] text-[17px]">
          Enforcee checks your output against your rules, one rule at a time, and shows you the
          exact line that proves each answer.
        </p>

        {/* One button. The other paths live in "Three places it runs" below, where they
            don't compete for the same click. */}
        <div className="mt-9">
          <Link
            href="/audit"
            className="inline-block rounded-xl bg-ink px-7 py-3.5 text-[15px] font-medium text-white shadow-sm transition-colors hover:bg-ink-soft"
          >
            Try it on your own rules
          </Link>
          <p className="mt-3 font-mono text-[12px] text-skip">free · no account · about 20 seconds</p>
        </div>

        <div className="mt-9 max-w-[54ch] overflow-x-auto rounded-xl border hairline bg-ink px-5 py-4">
          <code className="font-mono text-[13.5px] text-white/90">
            <span className="text-white/40">$ </span>npx enforcee audit CLAUDE.md answer.md
          </code>
          <p className="mt-2 font-mono text-[12px] text-white/45">
            or run it here in the browser, if you&rsquo;d rather not install anything
          </p>
        </div>
      </section>

      {/* ── What you get back ────────────────────────────────────────────── */}
      <section className="border-y hairline bg-paper-soft">
        <div className="mx-auto max-w-6xl px-5 py-16">
          <h2 className="font-display text-[30px] leading-tight tracking-tight">What you get back</h2>
          <p className="readable mt-3 max-w-[52ch]">
            A verdict for every rule. Four possible answers, and we&rsquo;re strict about the
            difference between them.
          </p>

          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ['✓', 'Followed', 'It complied. Here&rsquo;s the sentence that shows it.', 'border-pass-line bg-pass-pale text-pass'],
              ['✕', 'Violated', 'It broke this rule. Here&rsquo;s the sentence that shows it.', 'border-fail-line bg-fail-pale text-fail'],
              ['?', 'Unverifiable', 'We couldn&rsquo;t tell. We won&rsquo;t invent a verdict to look thorough.', 'border-unknown-line bg-unknown-pale text-unknown'],
              ['–', 'Not applicable', 'The rule only applies sometimes, and this wasn&rsquo;t one of those times.', 'hairline bg-white text-skip'],
            ].map(([g, t, d, cls]) => (
              <div key={t} className={`rounded-xl border px-5 py-4 ${cls}`}>
                <div className="font-mono text-[22px] leading-none">{g}</div>
                <div className="mt-2.5 text-[15px] font-semibold text-ink">{t}</div>
                <p
                  className="mt-1.5 text-[13px] leading-relaxed text-ink-mid"
                  dangerouslySetInnerHTML={{ __html: d }}
                />
              </div>
            ))}
          </div>

          <p className="readable mt-8 max-w-[52ch] text-[14.5px]">
            Plus one number: <strong>Coverage</strong>. It&rsquo;s the share of your rules that left any
            trace at all. A rule that leaves none was probably never read.
          </p>
        </div>
      </section>

      {/* ── Three places it runs ─────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-5 py-16">
        <h2 className="font-display text-[30px] leading-tight tracking-tight">Three places it runs</h2>
        <p className="readable mt-3 max-w-[52ch]">
          Same engine, same verdicts, same receipt. Pick whichever fits how you work.
        </p>

        <div className="mt-8 grid gap-4 lg:grid-cols-3">
          {[
            {
              t: 'On your machine',
              s: 'npx enforcee audit',
              d: 'A command. No account, no key, and it never touches the network.',
              href: '/audit',
              cta: 'Start here',
            },
            {
              t: 'In your pipeline',
              s: 'GitHub Action',
              d: 'Fails the pull request when a rule was broken, so the standard is actually enforced.',
              href: '/install',
              cta: 'Add to CI',
            },
            {
              t: 'While you work',
              s: 'editor hook',
              d: 'Stops a dangerous command before it runs, and puts your rules back after a compaction.',
              href: '/enforce',
              cta: 'See what it blocks',
            },
          ].map((c) => (
            <div key={c.t} className="flex flex-col rounded-xl border hairline bg-paper-soft px-5 py-5">
              <div className="text-[15px] font-semibold">{c.t}</div>
              <code className="mt-1.5 font-mono text-[12.5px] text-clay">{c.s}</code>
              <p className="mt-3 flex-1 text-[13.5px] leading-relaxed text-ink-mid">{c.d}</p>
              <Link href={c.href} className="mt-4 text-[13.5px] font-medium text-brand underline underline-offset-4">
                {c.cta}
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* ── The problem ──────────────────────────────────────────────────── */}
      <section className="border-y hairline bg-paper-soft">
        <div className="mx-auto max-w-6xl px-5 py-16">
          <h2 className="font-display text-[30px] leading-tight tracking-tight">You&rsquo;re not imagining it</h2>
          <p className="readable mt-3 max-w-[52ch]">
            Researchers followed 1,650 real coding sessions. Agents obeyed a{' '}
            <code className="rounded bg-white px-1 py-0.5 font-mono text-[13px]">CLAUDE.md</code> about{' '}
            <strong>two thirds of the time</strong>, and got worse with every function they wrote.
          </p>
          <p className="readable mt-3 max-w-[52ch]">
            File size didn&rsquo;t matter. Instruction order didn&rsquo;t matter. Neither did structure.
            So no, you can&rsquo;t fix this by writing a better rules file.{' '}
            <a
              href="https://arxiv.org/abs/2605.10039"
              className="text-brand underline underline-offset-4"
              target="_blank"
              rel="noreferrer"
            >
              arXiv 2605.10039
            </a>
          </p>

          <div className="mt-9 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ['The rewrite spiral', 'Every few weeks you rewrite the ruleset, longer each time, with no way to tell if it helped.'],
              ['The canary emoji', 'You hide a silly instruction in the file and watch for the turn it stops appearing. This is the state of the art.'],
              ['The silent skip', 'It never says "I ignored rule 11." It writes something confident and slightly wrong.'],
              ['The 3am command', 'It ran a migration against production, because that rule was on line 47 of a file it had stopped weighting.'],
            ].map(([t, d]) => (
              <div key={t} className="rounded-xl border hairline bg-white px-5 py-4">
                <div className="text-[14.5px] font-semibold">{t}</div>
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-mid">{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── The funnel ───────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-5 py-16">
        <h2 className="font-display text-[30px] leading-tight tracking-tight">Where it goes wrong</h2>
        <p className="readable mt-3 mb-8 max-w-[52ch]">
          Six steps sit between your prompt and your output. You can see three of them.
        </p>
        <Funnel />
      </section>

      {/* ── Why this one ─────────────────────────────────────────────────── */}
      <section className="border-y hairline bg-ink text-paper">
        <div className="mx-auto max-w-6xl px-5 py-16">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-clay-soft">why this one</p>
          <h2 className="mt-4 max-w-[20ch] font-display text-[32px] leading-[1.15] tracking-tight sm:text-[40px]">
            Everyone else grades the file. We grade what the model did.
          </h2>

          <div className="mt-10 grid gap-x-10 gap-y-8 lg:grid-cols-2">
            {[
              {
                k: 'It won&rsquo;t guess',
                d: 'If a verdict comes from a model, it has to quote your text, and we go and find that quote. No quote, no verdict. Across 48 verdicts on three models: zero false accusations.',
              },
              {
                k: 'It checks the claim, not the story',
                d: 'Other tools read the transcript, and a false claim sits inside the transcript looking perfectly normal. We check the filesystem instead. It said it wrote the file; the file isn&rsquo;t there.',
              },
              {
                k: 'It blocks, not just reports',
                d: 'Most tools tell you what already happened. Enforcee refuses the dangerous command before it runs, and quotes your own rule as the reason.',
              },
              {
                k: 'Most of it needs no model',
                d: 'About four fifths of a normal ruleset is settled by plain code. That part is instant, reproducible offline, and free forever.',
              },
            ].map((c) => (
              <div key={c.k}>
                <div
                  className="font-display text-[20px] tracking-tight text-white"
                  dangerouslySetInnerHTML={{ __html: c.k }}
                />
                <p
                  className="mt-2 text-[14px] leading-relaxed text-paper-line/80"
                  dangerouslySetInnerHTML={{ __html: c.d }}
                />
              </div>
            ))}
          </div>

          <details className="mt-10 rounded-xl border border-white/15 px-5 py-4">
            <summary className="cursor-pointer text-[14px] font-medium text-white">
              How it compares to tools you may already have
            </summary>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-[13px]">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wide text-paper-line/60">
                    <th className="py-2 pr-4 font-medium">Tool</th>
                    <th className="py-2 pr-4 font-medium">Answers</th>
                    <th className="py-2 font-medium">Never answers</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {[
                    ['CLAUDE.md linters', 'Is my rules file tidy?', 'Did the model follow it?'],
                    ['LangSmith, Langfuse', 'What did this call cost?', 'Which of my rules broke?'],
                    ['Ruler, rulesync', 'Are my rule files in sync?', 'Was any of it honoured?'],
                    ['Editor hooks', 'Can I block this command?', 'Which rules are decaying?'],
                  ].map((r) => (
                    <tr key={r[0]}>
                      <td className="py-2.5 pr-4 font-medium text-white">{r[0]}</td>
                      <td className="py-2.5 pr-4 text-paper-line/70">{r[1]}</td>
                      <td className="py-2.5 text-clay-soft">{r[2]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </div>
      </section>

      {/* ── Evidence ─────────────────────────────────────────────────────── */}
      <section className="border-b hairline bg-paper-soft">
        <div className="mx-auto max-w-6xl px-5 py-16">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-clay">not testimonials</p>
          <h2 className="mt-4 max-w-[22ch] font-display text-[30px] leading-tight tracking-tight">
            We launched this week, so here&rsquo;s evidence instead.
          </h2>
          <p className="readable mt-4 max-w-[52ch]">
            No logos, no five-star quotes. Just people describing this problem in public, dated and
            linked so you can read the whole thing.
          </p>

          <div className="mt-9 grid gap-4 lg:grid-cols-3">
            {[
              {
                q: 'Agents can ignore or forget about what AGENTS.md says, and this becomes more and more apparent as a repo grows.',
                who: 'aleqs · Hacker News',
                url: 'https://news.ycombinator.com/item?id=49200721',
              },
              {
                q: "I regularly have to stop an agent and remind it to use p4 edit, despite the first paragraph of Claude.md being 'this is a project using perforce'.",
                who: 'maccard · Hacker News',
                url: 'https://news.ycombinator.com/item?id=49124086',
              },
              {
                q: 'Agents lose rule details over long horizons, and report compliance they did not achieve.',
                who: 'HANDBOOK.md benchmark · arXiv',
                url: 'https://arxiv.org/abs/2607.25398',
              },
            ].map((c) => (
              <figure key={c.q} className="flex flex-col rounded-2xl border hairline bg-white px-5 py-5">
                <blockquote className="text-[14.5px] leading-relaxed text-ink">&ldquo;{c.q}&rdquo;</blockquote>
                <figcaption className="mt-auto pt-4 font-mono text-[11px] text-skip">
                  <a href={c.url} target="_blank" rel="noreferrer" className="hover:text-ink">
                    {c.who}
                  </a>
                </figcaption>
              </figure>
            ))}
          </div>

          <div className="mt-6 max-w-[62ch] rounded-2xl border border-clay-line bg-clay-pale px-5 py-4">
            <p className="text-[14.5px] leading-relaxed text-ink">
              That last one is a benchmark, not a bad day: 65 tasks, 824 graded criteria.{' '}
              <span className="hi hi-clay font-semibold">
                The best of thirty frontier setups passed 36.2%.
              </span>{' '}
              The failure it names by title is a model reporting compliance it never achieved.
            </p>
          </div>
        </div>
      </section>

      {/* ── Close ────────────────────────────────────────────────────────── */}
      <section className="border-t hairline bg-white">
        <div className="mx-auto max-w-6xl px-5 py-20 text-center">
          <h2 className="mx-auto max-w-[18ch] font-display text-[32px] leading-tight tracking-tight">
            Find out what your rules are doing.
          </h2>
          <p className="readable mx-auto mt-4 max-w-[46ch]">
            Paste a ruleset and an answer. You&rsquo;ll know inside a minute.
          </p>
          <div className="mt-8">
            <Link
              href="/audit"
              className="inline-block rounded-xl bg-ink px-7 py-3.5 text-[15px] font-medium text-white transition-colors hover:bg-ink-soft"
            >
              Run an audit
            </Link>
            <p className="mt-4 font-mono text-[12px] text-skip">
              free forever ·{' '}
              <Link href="/pricing" className="underline underline-offset-4 hover:text-ink">
                see what&rsquo;s paid
              </Link>
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
