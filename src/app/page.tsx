import Link from 'next/link';
import Funnel from '@/components/Funnel';

export default function Home() {
  return (
    <main>
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-5 pt-16 pb-14 sm:pt-24">
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-clay">
          for people who have stopped trusting their own setup
        </p>

        <h1 className="mt-5 max-w-[19ch] font-display text-[42px] leading-[1.08] tracking-[-0.02em] sm:text-[58px]">
          Stop fighting <br className="hidden sm:block" />
          your own AI.
        </h1>

        <p className="readable mt-6 max-w-prose">
          You wrote the rules. You wrote them <em>again</em> after it ignored them. You added a
          <code className="mx-1 rounded bg-paper-deep px-1.5 py-0.5 font-mono text-[14px]">CLAUDE.md</code>, then a skill,
          then an MCP server, then a nice long paragraph in ALL CAPS. And you still cannot answer the only question that
          matters: <strong>did any of it actually work?</strong>
        </p>

        <p className="readable mt-4 max-w-prose">
          So you start over. New rules, new file, new approach — not because the last one failed, but because you never
          found out whether it worked. <span className="hi font-semibold text-ink">That is not a discipline problem. It is a missing instrument.</span>
        </p>

        <div className="mt-9 flex flex-wrap items-center gap-3">
          <Link
            href="/audit"
            className="rounded-xl bg-ink px-6 py-3 text-[15px] font-medium text-white shadow-sm transition-colors hover:bg-ink-soft"
          >
            See it on your own rules
          </Link>
          <Link
            href="/install"
            className="rounded-xl border border-ink/15 bg-white px-6 py-3 text-[15px] font-medium transition-colors hover:border-ink/30"
          >
            Install it into Claude Code
          </Link>
          <span className="font-mono text-[12px] text-skip">no account · 20 seconds · free forever</span>
        </div>

        <div className="mt-10 grid max-w-3xl gap-x-8 gap-y-3 border-t hairline pt-6 sm:grid-cols-3">
          {[
            ['4 in 5', 'of your rules answered instantly, by code, with no model in the loop'],
            ['0', 'invented verdicts — every judged claim must quote your own output or it is thrown out'],
            ['10 / 10', 'destructive commands stopped before they ran, in a live test'],
          ].map(([k, v]) => (
            <div key={k}>
              <div className="font-mono text-[26px] leading-none tracking-tight text-clay">{k}</div>
              <div className="mt-1.5 text-[13px] leading-snug text-ink-mid">{v}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── The feeling, named ───────────────────────────────────────────── */}
      <section className="border-y hairline bg-paper-soft">
        <div className="mx-auto max-w-6xl px-5 py-14">
          <h2 className="font-display text-[30px] leading-tight tracking-tight">You are not imagining it</h2>
          <p className="readable mt-3 max-w-prose">
            Every one of these is a real thing people do, right now, because there is no better option.
          </p>

          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                t: 'The rewrite spiral',
                d: 'You rewrite the ruleset every few weeks. Each version is longer. None of them are measured, so you are decorating, not fixing.',
              },
              {
                t: 'The canary emoji',
                d: 'You plant a nonsense instruction — call me Chief, add a 🐙 — and watch for the turn it stops appearing. That is the state of the art. It is folk magic.',
              },
              {
                t: 'The re-explaining tax',
                d: 'Halfway through a session you start re-pasting rules it already has, because it feels like it forgot. You pay for those tokens twice.',
              },
              {
                t: 'The silent skip',
                d: 'It never says "I ignored rule 11." It writes something confident and slightly wrong, and you find out three commits later.',
              },
              {
                t: 'The dead skill',
                d: 'You wrote a skill. It has never once been invoked. Nothing anywhere told you that.',
              },
              {
                t: 'The 3am command',
                d: 'It ran a migration against production because your rule about that was somewhere on line 47 of a file it had stopped weighting.',
              },
            ].map((c) => (
              <div key={c.t} className="rounded-xl border hairline bg-white px-5 py-4">
                <div className="text-[14.5px] font-semibold">{c.t}</div>
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-mid">{c.d}</p>
              </div>
            ))}
          </div>

          <p className="readable mt-8 max-w-prose">
            <span className="hi font-semibold text-ink">None of this is a prompting skill issue.</span> You cannot
            improve at something you get no feedback on. Enforcee is the feedback.
          </p>
        </div>
      </section>

      {/* ── The funnel ───────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-5 py-16">
        <h2 className="font-display text-[30px] leading-tight tracking-tight">Where it actually goes wrong</h2>
        <p className="readable mt-3 mb-8 max-w-prose">
          Six steps between your prompt and your output. You can see the first, the third and the last. The ones that
          decide the outcome are dark.
        </p>
        <Funnel />
      </section>

      {/* ── Why us ───────────────────────────────────────────────────────── */}
      <section className="border-y hairline bg-ink text-paper">
        <div className="mx-auto max-w-6xl px-5 py-16">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-clay-soft">why this and not the others</p>
          <h2 className="mt-4 max-w-[22ch] font-display text-[32px] leading-[1.15] tracking-tight sm:text-[40px]">
            Everyone else grades the file. We grade what the model did.
          </h2>

          <div className="mt-10 grid gap-x-10 gap-y-8 lg:grid-cols-2">
            {[
              {
                k: 'It learns you',
                d: 'Say "stop opening with a summary" once, in passing, and Enforcee turns it into a rule — carrying the exact sentence you said it in. Your ruleset stops being something you sit down and write and becomes something that accretes from how you already work. Nobody else does this at all.',
              },
              {
                k: 'It refuses to guess',
                d: 'UNVERIFIABLE is a real answer here. A judged verdict must cite at least ten characters we can then locate in your own text; if we cannot find it, the verdict is thrown away, not softened. Across 48 verdicts on three models: zero false accusations, zero invented evidence. What this stops is a model inventing a sentence — it is not a claim that every cited quote is the most apt one.',
              },
              {
                k: 'It blocks, not just reports',
                d: 'Observability tools tell you what already happened. Enforcee denies the forbidden command before it runs and hands the model your own words as the reason. Ten out of ten enforcement cases correct, tested as a real subprocess.',
              },
              {
                k: 'Most of it needs no model at all',
                d: 'Four fifths of a real ruleset is settled by code — reproducible, instant, and yours free forever. You can rerun any of it offline and get the identical answer, which is the only kind of verdict worth having.',
              },
              {
                k: 'Every rule has an identity',
                d: 'Each rule gets a content-addressed id that survives rewording and file moves. So the product can say "this rule failed 6 of your last 40 audits" — a sentence no prompt-versioning tool can form, because they store prompts as opaque blobs.',
              },
              {
                k: 'It tells you what it cannot do',
                d: 'A session file contains no system prompt, so nobody can prove which rules were in context on a given turn. We say so on the page instead of selling a number we cannot stand behind.',
              },
            ].map((c) => (
              <div key={c.k}>
                <div className="font-display text-[20px] tracking-tight text-white">{c.k}</div>
                <p className="mt-2 text-[14px] leading-relaxed text-paper-line/80">{c.d}</p>
              </div>
            ))}
          </div>

          <div className="mt-12 overflow-hidden rounded-xl border border-white/15">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="bg-white/5 text-[11px] uppercase tracking-wide text-paper-line/60">
                  <th className="px-4 py-2.5 font-medium">Tool</th>
                  <th className="px-4 py-2.5 font-medium">What it answers</th>
                  <th className="px-4 py-2.5 font-medium">What it never answers</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {[
                  ['Linters for CLAUDE.md', 'Is my rules file tidy?', 'Did the model follow it?'],
                  ['LangSmith, Langfuse, Helicone', 'What did this call cost, and how long did it take?', 'Which of my 12 rules broke?'],
                  ['Galileo instruction adherence', 'Did it comply, yes or no?', 'Which rule, and where is the proof?'],
                  ['Ruler, rulesync', 'Are my rule files in sync across tools?', 'Was any of it honoured?'],
                  ['Vanta, Credo, Drata', 'Is the org compliant with a regulation?', 'Anything about your own config, at your price.'],
                  ['Claude Code hooks', 'Can I block this command?', 'Which rules are decaying, and since when?'],
                ].map((r) => (
                  <tr key={r[0]}>
                    <td className="px-4 py-2.5 font-medium text-white">{r[0]}</td>
                    <td className="px-4 py-2.5 text-paper-line/70">{r[1]}</td>
                    <td className="px-4 py-2.5 text-clay-soft">{r[2]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ── Social proof ─────────────────────────────────────────────────── */}
      <section className="border-b hairline bg-paper-soft">
        <div className="mx-auto max-w-6xl px-5 py-16">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-clay">not testimonials</p>
          <h2 className="mt-4 max-w-[24ch] font-display text-[30px] leading-tight tracking-tight">
            We launched this week. So here is the evidence instead.
          </h2>
          <p className="readable mt-4 max-w-prose">
            No customer logos, no five-star quotes, no &ldquo;trusted by 10,000 developers&rdquo;. What we have is a
            public record of people describing this exact problem. Every quote is dated and linked, because a complaint
            from eighteen months ago may already have been fixed — and quietly reusing one that was would make us
            exactly the kind of source this product exists to replace.
          </p>

          <div className="mt-9 grid gap-4 lg:grid-cols-3">
            {[
              {
                q: 'AGENTS.md works pretty well, but it is not deterministic or actually enforced in any way — agents can ignore or forget about what AGENTS.md says, and this becomes more and more apparent as a repo grows.',
                who: 'aleqs',
                where: 'Hacker News · 6 Aug 2026',
                url: 'https://news.ycombinator.com/item?id=49200721',
              },
              {
                q: "It's clear at this point that agents don't actually follow agents.md. They try to but they don't… I regularly have to stop an agent and remind it to use p4 edit, despite the first paragraph of Claude.md being 'this is a project using perforce'.",
                who: 'maccard',
                where: 'Hacker News · 31 Jul 2026',
                url: 'https://news.ycombinator.com/item?id=49124086',
              },
              {
                q: 'Agents let a plausible in-environment request override the standing policy, perform a required check and then act against its result, lose rule details over long horizons, and report compliance they did not achieve.',
                who: 'HANDBOOK.md benchmark',
                where: 'arXiv 2607.25398 · 28 Jul 2026',
                url: 'https://arxiv.org/abs/2607.25398',
              },
            ].map((c) => (
              <figure key={c.q} className="flex flex-col rounded-2xl border hairline bg-white px-5 py-5">
                <blockquote className="text-[14.5px] leading-relaxed text-ink">&ldquo;{c.q}&rdquo;</blockquote>
                <figcaption className="mt-auto pt-4 font-mono text-[11px] text-skip">
                  <a href={c.url} target="_blank" rel="noreferrer" className="hover:text-ink">
                    {c.who} · {c.where}
                  </a>
                </figcaption>
              </figure>
            ))}
          </div>

          <div className="mt-6 rounded-2xl border border-clay-line bg-clay-pale px-5 py-4">
            <p className="text-[14.5px] leading-relaxed text-ink">
              That last one is not a person having a bad day — it is a peer-reviewed benchmark of 65 agentic tasks
              graded against 824 programmatic criteria.{' '}
              <span className="hi hi-clay font-semibold">
                The best of thirty frontier model configurations passed 36.2% of them.
              </span>{' '}
              And the failure it names by title is the model reporting compliance it did not achieve — which is the
              exact thing you cannot catch by reading the answer.
            </p>
          </div>

          <p className="mt-6 max-w-prose font-mono text-[11px] leading-relaxed text-skip">
            Quoted verbatim and linked so you can read the whole argument yourself. Every quote is from the last six
            weeks; we re-check them and drop any that a vendor has since fixed. These people are describing a problem,
            not endorsing us — we have never spoken to them.
          </p>
        </div>
      </section>

      {/* ── Verdict vocabulary ───────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-5 py-16">
        <h2 className="font-display text-[30px] leading-tight tracking-tight">What an audit gives you back</h2>
        <p className="readable mt-3 mb-8 max-w-prose">
          Four answers, and we are strict about the difference between them.
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ['✓', 'Followed', 'It demonstrably complied, and here is the exact sentence that proves it.', 'border-pass-line bg-pass-pale text-pass'],
            ['✕', 'Violated', 'It demonstrably broke this rule, and here is the exact sentence that proves it.', 'border-fail-line bg-fail-pale text-fail'],
            ['?', 'Unverifiable', 'We could not tell either way. We will not invent a verdict to look complete.', 'border-unknown-line bg-unknown-pale text-unknown'],
            ['–', 'Not applicable', 'The rule had a trigger that never fired, so it was never in play.', 'hairline bg-paper-soft text-skip'],
          ].map(([g, t, d, cls]) => (
            <div key={t} className={`rounded-xl border px-5 py-4 ${cls}`}>
              <div className="font-mono text-[22px] leading-none">{g}</div>
              <div className="mt-2.5 text-[15px] font-semibold text-ink">{t}</div>
              <p className="mt-1.5 text-[13px] leading-relaxed text-ink-mid">{d}</p>
            </div>
          ))}
        </div>

        <div className="mt-8 rounded-xl border border-honey-line bg-honey-pale/50 px-5 py-4">
          <p className="text-[14.5px] leading-relaxed">
            And one number on top: <strong>Coverage</strong> — the share of your applicable rules that left{' '}
            <em>any</em> observable trace. <span className="hi font-semibold">A rule that leaves none was probably never read.</span>{' '}
            No other tool shows you this, because no other tool distinguishes “it passed” from “it was never in play”.
          </p>
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────────────────── */}
      <section className="border-t hairline bg-paper-soft">
        <div className="mx-auto max-w-6xl px-5 py-16 text-center">
          <h2 className="mx-auto max-w-[20ch] font-display text-[32px] leading-tight tracking-tight">
            Find out what your rules are actually doing.
          </h2>
          <p className="readable mx-auto mt-4 max-w-[52ch]">
            Paste a ruleset and an answer. Twenty seconds, no account, no card. You will know inside a minute
            whether the rules you have been writing for months are doing anything at all.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link href="/audit" className="rounded-xl bg-ink px-6 py-3 text-[15px] font-medium text-white hover:bg-ink-soft transition-colors">
              Run an audit
            </Link>
            <Link href="/install" className="rounded-xl border border-ink/15 bg-white px-6 py-3 text-[15px] font-medium hover:border-ink/30 transition-colors">
              Install the guard
            </Link>
            <Link href="/pricing" className="rounded-xl border border-ink/15 bg-white px-6 py-3 text-[15px] font-medium hover:border-ink/30 transition-colors">
              See pricing
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
